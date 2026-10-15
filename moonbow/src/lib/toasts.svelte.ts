export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

let nextId = 1;

class Toasts {
  list = $state<Toast[]>([]);

  show(text: string, kind: Toast['kind'] = 'info', ms = 3500) {
    const id = nextId++;
    this.list = [...this.list.slice(-3), { id, text, kind }];
    setTimeout(() => (this.list = this.list.filter((t) => t.id !== id)), ms);
  }

  error(text: string) {
    this.show(text, 'error', 6000);
  }
}

export const toasts = new Toasts();
