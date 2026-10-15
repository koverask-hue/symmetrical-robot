// The live taste profile: loads/saves to IndexedDB, grows the song graph from
// YouTube radio lists as you listen, and (re)builds your mixes.

import { get, set } from 'idb-keyval';
import { source } from '../sources';
import type { CollectionRef, Track } from '../sources/types';
import { addRadio, emptyGraph, type SongGraph } from './graph';
import {
  artistKey, contextOf, emptyState, recordAddedToPlaylist, recordFeedback, recordLike, recordListen, seedArtist, setMuted,
  type Listen, type Outcome, type TasteState,
} from './model';
import { backInRotation, flow, freshFinds, onRepeat, rightNow, topSeeds, worlds, type Ctx, type Mix } from './recommend';

const EXPAND_TTL = 7 * 86_400_000;
const REBUILD_EVERY = 20 * 60_000;

export interface Mixes {
  now: Mix | null;
  worlds: Mix[];
  fresh: Mix | null;
  repeat: Mix | null;
  rotation: Mix | null;
}

/** Strips Svelte proxies so stored tracks are plain data. */
const plain = (t: Track): Track => $state.snapshot(t) as Track;

const NO_MIXES: Mixes = { now: null, worlds: [], fresh: null, repeat: null, rotation: null };

class Taste {
  /** Mutated in place; `version` is bumped so views re-read it. */
  state: TasteState = emptyState();
  graph: SongGraph = emptyGraph();
  version = $state(0);
  loaded = $state(false);
  mixes = $state.raw<Mixes>(NO_MIXES);
  building = $state(false);

  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #expanding = new Map<string, Promise<void>>();
  #builtAt = 0;
  #builtVersion = -1;

  ctx = (): Ctx => ({ now: Date.now(), ctx: contextOf(new Date()) });

  async load() {
    try {
      const [s, g] = await Promise.all([get<TasteState>('taste'), get<SongGraph>('graph')]);
      if (s?.version === 1) this.state = { ...emptyState(), ...s };
      if (g?.edges) this.graph = g;
    } catch {
      // Storage unavailable (private mode): run in memory.
    }
    this.loaded = true;
    this.version++;
  }

  #changed() {
    this.version++;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      // Snapshot via JSON so Svelte proxies or class instances never reach IndexedDB.
      void set('taste', JSON.parse(JSON.stringify(this.state))).catch(() => {});
      void set('graph', JSON.parse(JSON.stringify(this.graph))).catch(() => {});
    }, 2500);
  }

  // ---- signals ----

  record(l: Listen): Outcome {
    const outcome = recordListen(this.state, { ...l, track: plain(l.track) });
    this.#changed();
    // Songs you finish become seeds; learn their neighbourhood in the background.
    if (outcome === 'complete') void this.expand(l.track);
    return outcome;
  }

  like(t: Track, liked: boolean) {
    recordLike(this.state, plain(t), liked);
    this.#changed();
    if (liked) void this.expand(t);
  }

  feedback(t: Track, dir: 'more' | 'less') {
    recordFeedback(this.state, plain(t), dir);
    this.#changed();
    if (dir === 'more') void this.expand(t);
  }

  addedToPlaylist(t: Track) {
    recordAddedToPlaylist(this.state, plain(t));
    this.#changed();
  }

  mute(t: Track | string, muted = true) {
    const key = typeof t === 'string' ? t : artistKey(t);
    setMuted(this.state, key, muted);
    this.#changed();
  }

  setExplore(v: number | null) {
    this.state.exploreOverride = v;
    this.#changed();
  }

  setName(name: string) {
    this.state.name = name.trim();
    this.#changed();
  }

  reset() {
    const name = this.state.name;
    this.state = { ...emptyState(), name, onboarded: false };
    this.graph = emptyGraph();
    this.mixes = NO_MIXES;
    this.#changed();
  }

  // ---- graph growth ----

  /** Fetches a track's radio once a week and adds it to the song graph. */
  expand(t: Track): Promise<void> {
    if (Date.now() - (this.graph.expanded[t.id] ?? 0) < EXPAND_TTL) return Promise.resolve();
    let p = this.#expanding.get(t.id);
    if (!p) {
      p = source
        .radio(t)
        .then((radio) => {
          addRadio(this.graph, plain(t), radio);
          this.#changed();
        })
        .catch(() => {})
        .finally(() => this.#expanding.delete(t.id));
      this.#expanding.set(t.id, p);
    }
    return p;
  }

  async #expandMany(tracks: Track[], parallel = 3) {
    const queue = tracks.filter((t) => Date.now() - (this.graph.expanded[t.id] ?? 0) >= EXPAND_TTL);
    const workers = Array.from({ length: parallel }, async () => {
      while (queue.length) await this.expand(queue.shift()!);
    });
    await Promise.all(workers);
  }

  // ---- mixes ----

  get hasTaste() {
    this.version;
    return Object.values(this.state.tracks).some((t) => t.plays > 0 || t.seeded);
  }

  async buildMixes(force = false) {
    if (this.building) return;
    const fresh = Date.now() - this.#builtAt < REBUILD_EVERY && this.version - this.#builtVersion < 8;
    if (!force && fresh && this.mixes.now) return;
    this.building = true;
    try {
      const c = this.ctx();
      // Make sure your strongest songs right now have neighbourhoods to explore.
      const seedIds = [...topSeeds(this.state, c, 10).keys()];
      await this.#expandMany(seedIds.map((id) => this.state.tracks[id].track).slice(0, 8));
      const s = this.state;
      const g = this.graph;
      this.mixes = {
        now: rightNow(s, g, c),
        worlds: worlds(s, g, c),
        fresh: freshFinds(s, g, c),
        repeat: onRepeat(s, c),
        rotation: backInRotation(s, c),
      };
      this.#builtAt = Date.now();
      this.#builtVersion = this.version;
    } finally {
      this.building = false;
    }
  }

  mixById(id: string): Mix | null {
    const m = this.mixes;
    return [m.now, m.fresh, m.repeat, m.rotation, ...m.worlds].find((x) => x?.id === id) ?? null;
  }

  /** Autoplay: next songs steered by this session. */
  async next(current: Track, recent: Track[], skippedArtists: Set<string>): Promise<{ track: Track; reason: string }[]> {
    await this.expand(current);
    return flow(this.state, this.graph, this.ctx(), current, recent, skippedArtists, 10).map((x) => ({ track: x.track, reason: x.reason }));
  }

  // ---- onboarding ----

  async onboard(name: string, artists: CollectionRef[], adventurous: number) {
    this.state.name = name.trim();
    this.state.exploreOverride = Math.abs(adventurous - 0.5) < 0.05 ? null : adventurous;
    const results = await Promise.allSettled(artists.map((a) => source.artist(a.id)));
    const seeds: Track[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const top = r.value.topTracks.slice(0, 5);
      if (top.length) {
        seedArtist(this.state, top);
        seeds.push(...top.slice(0, 2));
      }
    }
    this.state.onboarded = true;
    this.#changed();
    await this.#expandMany(seeds, 4);
    await this.buildMixes(true);
  }

  skipOnboarding() {
    this.state.onboarded = true;
    this.#changed();
  }
}

export const taste = new Taste();
