import { isTauri } from '../platform';
import { MockSource } from './mock';
import type { MusicSource } from './types';
import { YTMusicSource } from './ytmusic';

// Desktop app: YouTube Music. Plain browser (dev, tests) or `?mock`: the offline demo
// catalogue. VERSE_DEMO=1 runs the desktop app on the demo catalogue too, and
// VERSE_DEMO=proxy additionally streams it through the native audio proxy.
const demo = typeof window !== 'undefined' ? (window as { __VERSE_DEMO__?: string }).__VERSE_DEMO__ : undefined;
const forceMock = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');

export const source: MusicSource = isTauri && !forceMock && !demo ? new YTMusicSource() : new MockSource({ proxied: demo === 'proxy' });
