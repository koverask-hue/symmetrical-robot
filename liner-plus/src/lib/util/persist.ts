// localStorage with JSON and failure tolerance (private mode, quota, corrupted values).

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`verse:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`verse:${key}`, JSON.stringify(value));
  } catch {
    // Not fatal: settings just won't survive a restart.
  }
}
