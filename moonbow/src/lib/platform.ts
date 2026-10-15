// Thin seam between the web UI and the native shell. Everything Tauri-specific
// lives here so the UI also runs in a plain browser (with the mock source).

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * fetch() that is not bound by the webview's CORS rules. In the desktop app it is
 * routed through Rust (tauri-plugin-http); in a browser it is the normal fetch.
 */
export async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isTauri) return fetch(input, init);
  const http = await import('@tauri-apps/plugin-http');
  return http.fetch(input, init);
}

export interface YtRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body?: string;
  body_b64?: string;
}

/** Serializes a fetch() call (as youtubei.js makes it) for the Rust InnerTube bridge. */
export async function toYtRequest(input: RequestInfo | URL, init?: RequestInit): Promise<YtRequest> {
  const req = input instanceof Request ? input : new Request(input, init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
  const out: YtRequest = { method: init?.method ?? req.method, url: req.url, headers: [...headers.entries()] };
  const body = init?.body ?? (input instanceof Request && req.body ? await req.arrayBuffer() : undefined);
  if (typeof body === 'string') out.body = body;
  else if (body != null) {
    const bytes = new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    out.body_b64 = btoa(bin);
  }
  return out;
}

/**
 * fetch() for YouTube's InnerTube API. In the desktop app the request is made by Rust
 * with browser-accurate Origin/User-Agent (a webview HTTP bridge sends its own, which
 * YouTube rejects with 403).
 */
export async function ytFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isTauri) return fetch(input, init);
  const res = await invoke<{ status: number; headers: [string, string][]; body: string }>('yt_request', { req: await toYtRequest(input, init) });
  const noBody = res.status === 204 || res.status === 304;
  return new Response(noBody ? null : res.body, { status: res.status, headers: res.headers });
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

let proxyBase: Promise<string> | undefined;

/** Base URL of the local audio proxy started by the Rust side, e.g. http://127.0.0.1:53211/<token>. */
export function audioProxyBase(): Promise<string> {
  proxyBase ??= invoke<string>('proxy_base');
  return proxyBase;
}

/** Fetches an image without tainting canvases (cover art hosts don't always send CORS headers). */
export async function imageBlobUrl(url: string): Promise<string> {
  const res = await nativeFetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  return URL.createObjectURL(await res.blob());
}
