// LRC parsing and word timing. Handles plain LRC (line timing), enhanced/A2
// LRC (per-word <mm:ss.xx> tags) and estimates word timing for line-only
// lyrics so every song gets karaoke highlighting.

export interface Word {
  /** Includes trailing whitespace so words can be rendered back to back. */
  text: string;
  start: number;
  end: number;
}

export interface Line {
  start: number;
  /** When the last word finishes. Can be earlier than the next line's start. */
  end: number;
  text: string;
  words: Word[];
  /** An instrumental gap; rendered as animated dots. */
  interlude?: boolean;
}

export type WordTiming = 'exact' | 'estimated';

export interface TimedLyrics {
  lines: Line[];
  timing: WordTiming;
  source: string;
}

const TIME = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TIME = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]/im;

const toSec = (m: string, s: string) => Number(m) * 60 + Number(s.replace(':', '.'));

/** Gap between lines (seconds) above which an interlude marker is inserted. */
export const INTERLUDE_GAP = 6;

// Scripts written without spaces between words: highlight one character at a time.
const NO_SPACE_SCRIPT = /[぀-ヿ㐀-鿿豈-﫿]/;

export function splitWords(line: string): string[] {
  if (NO_SPACE_SCRIPT.test(line)) {
    // Keep latin runs and trailing spaces/punctuation attached to the preceding character.
    return line.match(/[A-Za-z0-9'’]+\s*|[^\sA-Za-z0-9'’][\p{P}\s]*|\s+/gu) ?? [line];
  }
  return line.match(/\S+\s*/g) ?? [];
}

const VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿąęėįųūаеёиоуыэюяіїєαεηιουωάέήίόύώ]+/giu;

/** Rough sung length of a word, in syllables. Good enough to pace a highlight. */
export function syllables(word: string): number {
  const w = word.trim();
  if (!w) return 0;
  if (NO_SPACE_SCRIPT.test(w) || /[가-힯]/.test(w)) return [...w.replace(/[\p{P}\s]/gu, '')].length || 1;
  const groups = w.match(VOWELS)?.length ?? 0;
  return Math.max(1, groups || Math.ceil(w.length / 3));
}

const SEC_PER_SYLLABLE = 0.3;

/** Spread a line's duration across its words, weighted by syllables. */
export function estimateWords(textLine: string, start: number, nextStart: number): Word[] {
  const parts = splitWords(textLine);
  if (!parts.length) return [];
  const weights = parts.map((p) => syllables(p) || 0.3);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0.2, nextStart - start);
  // Singers rarely sing right up to the next line; leave a natural breath, but never
  // stretch a short line out over a long pause either.
  const sung = Math.min(span * 0.92, Math.max(span * 0.55, total * SEC_PER_SYLLABLE));
  let t = start;
  return parts.map((text, i) => {
    const d = (weights[i] / total) * sung;
    const w = { text, start: t, end: t + d };
    t += d;
    return w;
  });
}

interface RawLine {
  start: number;
  text: string;
  words?: { text: string; start: number }[];
}

function parseWordTags(body: string, lineStart: number): { text: string; words?: { text: string; start: number }[] } {
  WORD_TIME.lastIndex = 0;
  if (!WORD_TIME.test(body)) return { text: body.trim() };
  const words: { text: string; start: number }[] = [];
  const re = /(?:<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>)?([^<]*)/g;
  let m: RegExpExecArray | null;
  let t = lineStart;
  while ((m = re.exec(body)) && m[0] !== '') {
    if (m[1] !== undefined) t = toSec(m[1], m[2]);
    const chunk = m[3];
    if (!chunk) continue;
    for (const piece of splitWords(chunk)) words.push({ text: piece, start: t });
  }
  // Collapse a leading empty-time chunk produced by trailing tags.
  const clean = words.filter((w) => w.text.trim() || w.text === ' ');
  return { text: clean.map((w) => w.text).join('').trim(), words: clean };
}

export function parseLrc(src: string, source = 'LRC', trackDuration = 0): TimedLyrics | null {
  const offset = Number(OFFSET.exec(src)?.[1] ?? 0) / 1000;
  const raw: RawLine[] = [];
  let anyWordTags = false;

  for (const rawLine of src.split(/\r?\n/)) {
    TIME.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIME.exec(rawLine)) && m.index === lastEnd) {
      stamps.push(toSec(m[1], m[2]) - offset);
      lastEnd = TIME.lastIndex;
    }
    if (!stamps.length) continue;
    const body = rawLine.slice(lastEnd);
    for (const start of stamps) {
      const parsed = parseWordTags(body, start + offset);
      if (parsed.words) {
        anyWordTags = true;
        parsed.words = parsed.words.map((w) => ({ ...w, start: w.start - offset }));
      }
      raw.push({ start: Math.max(0, start), ...parsed });
    }
  }
  if (!raw.length) return null;
  raw.sort((a, b) => a.start - b.start);

  const end = trackDuration > 0 ? trackDuration : raw[raw.length - 1].start + 6;
  const lines: Line[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const next = raw[i + 1]?.start ?? end;
    if (!r.text) {
      if (next - r.start >= INTERLUDE_GAP / 2) lines.push({ start: r.start, end: next, text: '', words: [], interlude: true });
      continue;
    }
    let words: Word[];
    if (r.words?.length) {
      words = r.words.map((w, j) => {
        const nextWordStart = r.words![j + 1]?.start;
        const wEnd = nextWordStart ?? Math.min(next, w.start + Math.max(0.35, syllables(w.text) * SEC_PER_SYLLABLE * 1.4));
        return { text: w.text, start: w.start, end: Math.max(w.start + 0.05, wEnd) };
      });
    } else {
      words = estimateWords(r.text, r.start, next);
    }
    lines.push({ start: r.start, end: words[words.length - 1]?.end ?? next, text: r.text, words });
  }

  // Intro and long instrumental breaks get an interlude marker so the view never looks frozen.
  const withGaps: Line[] = [];
  if (lines[0] && lines[0].start >= INTERLUDE_GAP && !lines[0].interlude) {
    withGaps.push({ start: 0, end: lines[0].start, text: '', words: [], interlude: true });
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    withGaps.push(l);
    const n = lines[i + 1];
    if (n && !l.interlude && !n.interlude && n.start - l.end >= INTERLUDE_GAP) {
      withGaps.push({ start: l.end + 0.5, end: n.start, text: '', words: [], interlude: true });
    }
  }

  return { lines: withGaps, timing: anyWordTags ? 'exact' : 'estimated', source };
}

/** Index of the line being sung at time t, or -1 before the first line. Binary search. */
export function lineAt(lines: Line[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 0..1 fill of a word at time t. */
export function wordProgress(w: Word, t: number): number {
  if (t <= w.start) return 0;
  if (t >= w.end) return 1;
  return (t - w.start) / (w.end - w.start);
}
