import { describe, expect, it } from 'vitest';
import { toYtRequest } from './platform';

describe('toYtRequest', () => {
  it('serializes a youtubei.js style call (Request + init overrides)', async () => {
    const r = new Request('https://www.youtube.com/youtubei/v1/browse?alt=json', { method: 'POST' });
    const out = await toYtRequest(r, { body: '{"a":1}', headers: new Headers({ 'Content-Type': 'application/json', 'X-Goog-Visitor-Id': 'v' }) });
    expect(out.method).toBe('POST');
    expect(out.url).toBe('https://www.youtube.com/youtubei/v1/browse?alt=json');
    expect(out.body).toBe('{"a":1}');
    expect(Object.fromEntries(out.headers)).toMatchObject({ 'content-type': 'application/json', 'x-goog-visitor-id': 'v' });
  });

  it('base64-encodes binary bodies', async () => {
    const out = await toYtRequest('https://www.youtube.com/x', { method: 'POST', body: new Uint8Array([104, 105]) });
    expect(out.body_b64).toBe('aGk=');
    expect(out.body).toBeUndefined();
  });

  it('defaults to GET without a body', async () => {
    const out = await toYtRequest(new URL('https://music.youtube.com/'));
    expect(out).toMatchObject({ method: 'GET', url: 'https://music.youtube.com/' });
    expect(out.body ?? out.body_b64).toBeUndefined();
  });
});
