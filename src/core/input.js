const BLOCK = new Set(['Space', 'ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyZ', 'KeyE', 'KeyC', 'KeyF', 'KeyG', 'ShiftLeft', 'Tab']);

// Clavier/souris. `k` = touches maintenues, `pressed` = fronts montants consommés par endTick().
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.k = Object.create(null);
    this.pressed = Object.create(null);
    this.mx = 0;
    this.my = 0;
    this.locked = false;
    this.sens = 0.0022;
    this.onLock = null;
    addEventListener('keydown', (e) => {
      if (this.locked && BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed[e.code] = true;
      this.k[e.code] = true;
    });
    addEventListener('keyup', (e) => { this.k[e.code] = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mx += e.movementX;
      this.my += e.movementY;
    });
    addEventListener('mousedown', (e) => { if (this.locked) { this.k['Mouse' + e.button] = true; this.pressed['Mouse' + e.button] = true; } });
    addEventListener('mouseup', (e) => { this.k['Mouse' + e.button] = false; });
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { for (const c in this.k) this.k[c] = false; }
      if (this.onLock) this.onLock(this.locked);
    });
    addEventListener('blur', () => { for (const c in this.k) this.k[c] = false; });
  }
  lock() { this.canvas.requestPointerLock(); }
  endTick() {
    for (const c in this.pressed) this.pressed[c] = false;
  }
}
