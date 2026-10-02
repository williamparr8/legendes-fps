import * as THREE from 'three';

// Phases : attente (cercle suivant affiché), puis rétrécissement ; dégâts/s hors du cercle.
const PHASES = [
  { wait: 50, shrink: 40, r: 80, dps: 2 },
  { wait: 40, shrink: 30, r: 50, dps: 4 },
  { wait: 30, shrink: 25, r: 28, dps: 8 },
  { wait: 25, shrink: 20, r: 12, dps: 15 },
  { wait: 20, shrink: 15, r: 3, dps: 25 },
];

export class Zone {
  constructor(scene, rand, enabled, half) {
    this.enabled = enabled; this.rand = rand;
    this.cx = 0; this.cz = 0; this.r = half * 1.5;
    this.nx = 0; this.nz = 0; this.nr = this.r; // cercle suivant
    this.px = 0; this.pz = 0; this.pr = this.r;  // cercle au début du rétrécissement
    this.phase = -1; this.t = 0; this.shrinking = false; this.dps = 0;
    this.mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 60, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3080ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.mesh.visible = enabled;
    scene.add(this.mesh);
    if (enabled) this.next();
    this.sync();
  }

  next() {
    this.phase++;
    const P = PHASES[Math.min(this.phase, PHASES.length - 1)];
    this.px = this.cx; this.pz = this.cz; this.pr = this.r;
    this.nr = Math.min(P.r, this.r);
    const maxOff = Math.max(0, this.r - this.nr) * 0.8, a = this.rand() * 6.2832, d = this.rand() * maxOff;
    this.nx = this.cx + Math.cos(a) * d; this.nz = this.cz + Math.sin(a) * d;
    this.t = P.wait; this.shrinking = false; this.dps = P.dps; this.P = P;
  }

  get done() { return this.phase >= PHASES.length - 1 && this.shrinking === false && this.r <= PHASES[PHASES.length - 1].r + 0.01; }

  inside(x, z, margin = 0) { return !this.enabled || Math.hypot(x - this.cx, z - this.cz) <= this.r - margin; }

  // Sûr = dans le cercle courant, ou dans le suivant quand il va se refermer (< 20 s ou en cours).
  safe(x, z) {
    if (!this.enabled) return true;
    return this.shrinking || this.t < 20 ? Math.hypot(x - this.nx, z - this.nz) < this.nr - 3 : Math.hypot(x - this.cx, z - this.cz) < this.r - 3;
  }

  // Point aléatoire dans le prochain cercle (tableau réutilisé).
  randomSafe() {
    const a = this.rand() * 6.2832, d = Math.sqrt(this.rand()) * this.nr * 0.6;
    this._p = this._p || [0, 0];
    this._p[0] = this.nx + Math.cos(a) * d; this._p[1] = this.nz + Math.sin(a) * d;
    return this._p;
  }

  sync() { this.mesh.scale.set(this.r, 1, this.r); this.mesh.position.set(this.cx, 30, this.cz); }

  tick(dt, combat) {
    if (!this.enabled) return;
    this.t -= dt;
    if (!this.shrinking) {
      if (this.t <= 0) { if (this.r <= this.nr + 0.01) { if (this.phase < PHASES.length - 1) this.next(); else this.t = 1e9; } else { this.shrinking = true; this.t = this.P.shrink; } }
    } else {
      const u = 1 - Math.max(0, this.t) / this.P.shrink;
      this.r = this.pr + (this.nr - this.pr) * u; this.cx = this.px + (this.nx - this.px) * u; this.cz = this.pz + (this.nz - this.pz) * u;
      if (this.t <= 0) { this.r = this.nr; this.cx = this.nx; this.cz = this.nz; if (this.phase < PHASES.length - 1) this.next(); else { this.shrinking = false; this.t = 1e9; } }
    }
    this.sync();
    const all = combat.all;
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (!t.health.dead && Math.hypot(t.x - this.cx, t.z - this.cz) > this.r) combat.applyDamage(t, this.dps * dt, 1, null);
    }
  }

  label() {
    if (!this.enabled) return '';
    const s = Math.max(0, Math.ceil(this.t)), m = Math.floor(s / 60);
    const clock = m + ':' + String(s % 60).padStart(2, '0');
    if (this.t > 1e8) return 'Zone finale';
    return (this.shrinking ? 'Zone se resserre : ' : 'Prochaine zone : ') + clock;
  }
}
