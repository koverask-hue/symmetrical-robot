// Reactive async loader: re-runs when the key changes, ignores stale responses.

export function loader<T>(fn: () => Promise<T>) {
  const state = $state<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  let token = 0;
  const run = () => {
    const my = ++token;
    state.loading = true;
    state.error = null;
    fn().then(
      (d) => {
        if (my !== token) return;
        state.data = d;
        state.loading = false;
      },
      (e) => {
        if (my !== token) return;
        state.error = e;
        state.loading = false;
      },
    );
  };
  return { state, run };
}
