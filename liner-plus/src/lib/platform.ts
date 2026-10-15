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
