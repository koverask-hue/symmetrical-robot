import { describe, expect, it } from 'vitest';
import { bestArt, fromAny, fromListItem, fromPanelVideo, fromTwoRow, parseDuration } from './ytmap';

const thumbs = [
  { url: 'https://lh3.googleusercontent.com/abc=w60-h60-l90-rj', width: 60, height: 60 },
  { url: 'https://lh3.googleusercontent.com/abc=w120-h120-l90-rj', width: 120, height: 120 },
];

describe('ytmap', () => {
  it('upscales googleusercontent art', () => {
    expect(bestArt(thumbs)).toBe('https://lh3.googleusercontent.com/abc=w544-h544-l90-rj');
    expect(bestArt([{ url: 'https://i.ytimg.com/vi/x/hqdefault.jpg', width: 480 }])).toBe('https://i.ytimg.com/vi/x/hqdefault.jpg');
    expect(bestArt([])).toBeUndefined();
  });

  it('parses durations', () => {
    expect(parseDuration('3:25')).toBe(205);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('x')).toBe(0);
  });

  it('maps a song list item', () => {
    const it = fromListItem({
      item_type: 'song', id: 'vid1', title: 'Song', duration: { seconds: 200 },
      artists: [{ name: 'Artist', channel_id: 'UC1' }], album: { id: 'MPRE1', name: 'Album' },
      thumbnail: { contents: thumbs },
    });
    expect(it).toEqual({
      type: 'track',
      track: { id: 'vid1', title: 'Song', artists: [{ id: 'UC1', name: 'Artist' }], album: { id: 'MPRE1', name: 'Album' }, duration: 200, art: bestArt(thumbs), video: false },
    });
  });

  it('maps a video list item using authors', () => {
    const it = fromListItem({ item_type: 'video', id: 'v', title: 'MV', authors: [{ name: 'Chan' }] });
    expect(it?.type === 'track' && it.track).toMatchObject({ video: true, artists: [{ name: 'Chan' }] });
  });

  it('maps collections and drops unknown items', () => {
    expect(fromListItem({ item_type: 'album', id: 'MPRE', title: 'A', subtitle: 'Album • 2020' })).toEqual({
      type: 'collection', ref: { kind: 'album', id: 'MPRE', title: 'A', subtitle: 'Album • 2020', art: undefined },
    });
    expect(fromListItem({ item_type: 'endpoint', id: 'x' })).toBeNull();
    expect(fromListItem({ item_type: 'song' })).toBeNull();
  });

  it('maps two-row cards with Text objects', () => {
    const T = (s: string) => ({ toString: () => s });
    const it = fromTwoRow({ item_type: 'playlist', id: 'VLPL1', title: T('Mix'), subtitle: T('Playlist'), thumbnail: thumbs });
    expect(it).toMatchObject({ type: 'collection', ref: { kind: 'playlist', id: 'VLPL1', title: 'Mix', subtitle: 'Playlist' } });
    expect(fromAny({ type: 'MusicTwoRowItem', item_type: 'song', id: 's', title: T('S'), artists: [{ name: 'A' }] })).toMatchObject({ type: 'track' });
    expect(fromAny({ type: 'Other' })).toBeNull();
  });

  it('maps up-next panel videos', () => {
    expect(fromPanelVideo({ video_id: 'v', title: 'T', author: 'Someone', duration: { seconds: 10 } })).toEqual({
      id: 'v', title: 'T', artists: [{ name: 'Someone' }], album: undefined, duration: 10, art: undefined,
    });
  });
});
