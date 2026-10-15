// The "crowd" half of recommendations: a song graph built from YouTube Music's
// radio/up-next lists (what millions of listeners' behaviour says goes together).
// Personalised PageRank over it, seeded by your taste, gives candidates.

import type { Track } from '../sources/types';
import { artistKey } from './model';

const MAX_EDGES_PER_NODE = 24;
const MAX_NODES = 4000;

export interface SongGraph {
  /** id → neighbour id → weight. */
  edges: Record<string, Record<string, number>>;
  /** Metadata for every node so candidates can be shown and played. */
  nodes: Record<string, Track>;
  /** When each seed's radio was last fetched (ms). */
  expanded: Record<string, number>;
}

export const emptyGraph = (): SongGraph => ({ edges: {}, nodes: {}, expanded: {} });

function link(g: SongGraph, a: string, b: string, w: number) {
  const e = (g.edges[a] ??= {});
  e[b] = (e[b] ?? 0) + w;
  const keys = Object.keys(e);
  if (keys.length > MAX_EDGES_PER_NODE) {
    const weakest = keys.reduce((m, k) => (e[k] < e[m] ? k : m));
    delete e[weakest];
  }
}

/** Adds a seed's radio list: earlier positions are stronger neighbours. */
export function addRadio(g: SongGraph, seed: Track, radio: Track[], now = Date.now()) {
  g.nodes[seed.id] ??= seed;
  radio.slice(0, 30).forEach((t, i) => {
    if (t.id === seed.id) return;
    g.nodes[t.id] ??= t;
    const w = 1 / (1 + i * 0.12);
    link(g, seed.id, t.id, w);
    link(g, t.id, seed.id, w * 0.6);
    // Adjacent songs in a radio list are mildly related too.
    const next = radio[i + 1];
    if (next && next.id !== seed.id) {
      link(g, t.id, next.id, 0.2);
      link(g, next.id, t.id, 0.2);
    }
  });
  g.expanded[seed.id] = now;
  prune(g);
}

function prune(g: SongGraph) {
  const ids = Object.keys(g.nodes);
  if (ids.length <= MAX_NODES) return;
  // Drop the least connected nodes that aren't seeds.
  const degree = (id: string) => Object.values(g.edges[id] ?? {}).reduce((a, b) => a + b, 0);
  const victims = ids.filter((id) => !g.expanded[id]).sort((a, b) => degree(a) - degree(b)).slice(0, ids.length - MAX_NODES);
  for (const id of victims) {
    delete g.nodes[id];
    delete g.edges[id];
  }
  const gone = new Set(victims);
  for (const e of Object.values(g.edges)) for (const k of Object.keys(e)) if (gone.has(k)) delete e[k];
}

/**
 * Personalised PageRank: random walks that keep jumping back to your seeds.
 * Returns a score per node (sums to ~1).
 */
export function personalizedPageRank(g: SongGraph, seeds: Map<string, number>, iterations = 24, restart = 0.25): Map<string, number> {
  const total = [...seeds.values()].reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return new Map();
  const p = new Map<string, number>();
  for (const [k, v] of seeds) if (v > 0) p.set(k, v / total);
  let r = new Map(p);
  for (let it = 0; it < iterations; it++) {
    const next = new Map<string, number>();
    for (const [k, v] of p) next.set(k, restart * v);
    for (const [node, mass] of r) {
      const e = g.edges[node];
      if (!e) {
        // Dangling: send the mass back to the seeds.
        for (const [k, v] of p) next.set(k, (next.get(k) ?? 0) + (1 - restart) * mass * v);
        continue;
      }
      const sum = Object.values(e).reduce((a, b) => a + b, 0);
      for (const [nb, w] of Object.entries(e)) next.set(nb, (next.get(nb) ?? 0) + ((1 - restart) * mass * w) / sum);
    }
    r = next;
  }
  return r;
}

/** Strongest direct neighbour among `from` for a candidate, used to explain picks. */
export function strongestLink(g: SongGraph, candidate: string, from: Iterable<string>): string | null {
  let best: string | null = null;
  let bw = 0;
  for (const s of from) {
    const w = (g.edges[s]?.[candidate] ?? 0) + (g.edges[candidate]?.[s] ?? 0);
    if (w > bw) {
      bw = w;
      best = s;
    }
  }
  return best;
}

/** Artist-level graph: how strongly two artists' songs are connected. */
export function artistGraph(g: SongGraph): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [a, e] of Object.entries(g.edges)) {
    const ta = g.nodes[a];
    if (!ta) continue;
    const ka = artistKey(ta);
    for (const [b, w] of Object.entries(e)) {
      const tb = g.nodes[b];
      if (!tb) continue;
      const kb = artistKey(tb);
      if (ka === kb) continue;
      const m = out.get(ka) ?? new Map();
      m.set(kb, (m.get(kb) ?? 0) + w);
      out.set(ka, m);
    }
  }
  return out;
}

/**
 * Splits your artists into "worlds" with weighted label propagation.
 * Deterministic: ties break by artist key, iteration order is fixed.
 */
export function clusterArtists(ag: Map<string, Map<string, number>>, artists: string[], iterations = 12): string[][] {
  const set = new Set(artists);
  const label = new Map(artists.map((a) => [a, a]));
  const order = [...artists].sort();
  for (let it = 0; it < iterations; it++) {
    let changed = false;
    for (const a of order) {
      const votes = new Map<string, number>();
      for (const [b, w] of ag.get(a) ?? []) if (set.has(b)) votes.set(label.get(b)!, (votes.get(label.get(b)!) ?? 0) + w);
      for (const [b, m] of ag) if (set.has(b) && m.has(a)) votes.set(label.get(b)!, (votes.get(label.get(b)!) ?? 0) + m.get(a)!);
      if (!votes.size) continue;
      const best = [...votes.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
      if (best !== label.get(a)) {
        label.set(a, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const groups = new Map<string, string[]>();
  for (const a of artists) {
    const l = label.get(a)!;
    groups.set(l, [...(groups.get(l) ?? []), a]);
  }
  return [...groups.values()];
}
