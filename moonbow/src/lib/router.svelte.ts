// A tiny history-stack router. Pages are values, not URLs, so there's nothing to parse.

export type Route =
  | { name: 'home' }
  | { name: 'search'; q: string }
  | { name: 'album'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'library' }
  | { name: 'local'; id: string }
  | { name: 'mix'; id: string }
  | { name: 'taste' };

class Router {
  stack = $state<Route[]>([{ name: 'home' }]);
  forwardStack = $state<Route[]>([]);
  current = $derived(this.stack[this.stack.length - 1]);

  go(r: Route) {
    const cur = this.current;
    if (JSON.stringify(cur) === JSON.stringify(r)) return;
    // Typing in search replaces the search entry instead of stacking one per keystroke.
    if (cur.name === 'search' && r.name === 'search') this.stack = [...this.stack.slice(0, -1), r];
    else this.stack = [...this.stack, r];
    this.forwardStack = [];
  }

  back() {
    if (this.stack.length < 2) return;
    this.forwardStack = [this.current, ...this.forwardStack];
    this.stack = this.stack.slice(0, -1);
  }

  forward() {
    const [r, ...rest] = this.forwardStack;
    if (!r) return;
    this.stack = [...this.stack, r];
    this.forwardStack = rest;
  }
}

export const router = new Router();
