// Keyboard/mouse state with pointer lock. Edge-triggered presses are kept
// until consumed by the frame that reads them.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { left: false, right: false, leftPressed: false, rightPressed: false };
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.forceLocked = false; // automated tests run without pointer lock
    this.onLockChange = null;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    });
    addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (this.active) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouse.left = this.mouse.right = false;
      }
      this.onLockChange?.(this.locked);
    });
  }

  get active() {
    return this.locked || this.forceLocked;
  }

  lock() {
    if (this.forceLocked) return;
    const r = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
    // Some browsers reject unadjustedMovement; retry without it.
    if (r && r.catch) r.catch(() => this.canvas.requestPointerLock?.());
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  // Call at the end of each frame.
  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.dx = this.dy = 0;
    this.wheel = 0;
  }
}
