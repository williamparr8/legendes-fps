import { rayAabb } from '../combat/ray.js';

const CS = 8;     // côté d'une case de la grille spatiale (m)
const EXT = 300;  // la grille couvre [-EXT, EXT] ; les boîtes au-delà sont ramenées sur la case du bord
const GN = Math.ceil((2 * EXT) / CS);
const EMPTY = [];

// Boîtes AABB dans un Float32Array plat (aucune allocation à la requête) + grille spatiale (construite à la première
// requête, mise à jour par add). Les emplacements dynamiques (murs temporaires) restent hors grille : liste courte balayée à part.
export class Colliders {
  constructor() {
    this.n = 0;
    this.b = new Float32Array(6 * 512);
    this.hitTop = 0;
    this.hitBottom = 0;
    this.terrain = null; // relief (Heightfield) ; sans relief : sol plat à y = 0
    this.cells = null;
    this.dyn = [];
    this.stamp = new Uint32Array(512);
    this.rid = 0;
    this._hit = false; this._top = 0; this._bot = 0;
  }
  _push(x0, y0, z0, x1, y1, z1) {
    if ((this.n + 1) * 6 > this.b.length) {
      const nb = new Float32Array(this.b.length * 2);
      nb.set(this.b);
      this.b = nb;
      this.stamp = new Uint32Array(this.b.length / 6);
    }
    this.b.set([x0, y0, z0, x1, y1, z1], this.n * 6);
    return this.n++;
  }
  add(x0, y0, z0, x1, y1, z1) {
    const i = this._push(x0, y0, z0, x1, y1, z1);
    if (this.cells) this._insert(i);
  }
  _insert(i) {
    const b = this.b, o = i * 6, cl = (v) => { const k = Math.floor((v + EXT) / CS); return k < 0 ? 0 : k >= GN ? GN - 1 : k; };
    const i0 = cl(b[o]), i1 = cl(b[o + 3]), j0 = cl(b[o + 2]), j1 = cl(b[o + 5]);
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) (this.cells[j * GN + k] || (this.cells[j * GN + k] = [])).push(i);
  }
  _build() {
    this.cells = new Array(GN * GN).fill(null);
    const skip = new Set(this.dyn);
    for (let i = 0; i < this.n; i++) if (!skip.has(i)) this._insert(i);
  }
  // Boîtes dynamiques (murs temporaires) : emplacement réservé, déplacé/rangé loin quand inactif.
  addSlot() {
    const i = this._push(1e6, 1e6, 1e6, 1e6 + 1, 1e6 + 1, 1e6 + 1);
    this.dyn.push(i);
    return i;
  }
  setSlot(i, x0, y0, z0, x1, y1, z1) { this.b.set([x0, y0, z0, x1, y1, z1], i * 6); }
  clearSlot(i) { this.setSlot(i, 1e6, 1e6, 1e6, 1e6 + 1, 1e6 + 1, 1e6 + 1); }

  // Liste des boîtes de la case contenant (x, z) (pour les balayages locaux : mantle).
  cellAt(x, z) {
    if (!this.cells) this._build();
    const i = Math.floor((x + EXT) / CS), j = Math.floor((z + EXT) / CS);
    return i < 0 || j < 0 || i >= GN || j >= GN ? EMPTY : this.cells[j * GN + i] || EMPTY;
  }

  // Rayon (direction normalisée) contre boîtes + relief (ou sol y=0). Retourne t ou -1.
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.cells) this._build();
    const b = this.b;
    let best = maxT, hit = false;
    for (let k = 0; k < this.dyn.length; k++) {
      const o = this.dyn[k] * 6;
      const t = rayAabb(ox, oy, oz, dx, dy, dz, b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5], best);
      if (t >= 0 && t < best) { best = t; hit = true; }
    }
    let ix = Math.floor((ox + EXT) / CS), iz = Math.floor((oz + EXT) / CS);
    if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) { // départ hors grille : balayage complet (rare)
      for (let i = 0, o = 0; i < this.n; i++, o += 6) {
        const t = rayAabb(ox, oy, oz, dx, dy, dz, b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5], best);
        if (t >= 0 && t < best) { best = t; hit = true; }
      }
    } else {
      // parcours de la grille (DDA 2D sur x,z) jusqu'à dépasser le meilleur impact
      const st = this.stamp, rid = ++this.rid, sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const tdx = dx !== 0 ? CS / Math.abs(dx) : Infinity, tdz = dz !== 0 ? CS / Math.abs(dz) : Infinity;
      let tmx = dx > 0 ? ((ix + 1) * CS - EXT - ox) / dx : dx < 0 ? (ix * CS - EXT - ox) / dx : Infinity;
      let tmz = dz > 0 ? ((iz + 1) * CS - EXT - oz) / dz : dz < 0 ? (iz * CS - EXT - oz) / dz : Infinity;
      for (;;) {
        const cell = this.cells[iz * GN + ix];
        if (cell) {
          for (let k = 0; k < cell.length; k++) {
            const bi = cell[k];
            if (st[bi] === rid) continue;
            st[bi] = rid;
            const o = bi * 6;
            const t = rayAabb(ox, oy, oz, dx, dy, dz, b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5], best);
            if (t >= 0 && t < best) { best = t; hit = true; }
          }
        }
        if (Math.min(tmx, tmz) > best) break;
        if (tmx < tmz) { ix += sx; tmx += tdx; } else { iz += sz; tmz += tdz; }
        if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) break;
      }
    }
    if (this.terrain) {
      const t = this.rayGround(ox, oy, oz, dx, dy, dz, best);
      if (t >= 0 && t < best) { best = t; hit = true; }
    } else if (dy < 0 && oy > 0) {
      const t = -oy / dy;
      if (t < best) { best = t; hit = true; }
    }
    return hit ? best : -1;
  }

  // Rayon contre le relief : pas de 1 m puis dichotomie. Un rayon qui part sous le sol ne le touche pas.
  rayGround(ox, oy, oz, dx, dy, dz, maxT) {
    const T = this.terrain, top = T.max + 0.01;
    if (oy > top && dy >= 0) return -1;
    let t = 0;
    if (oy > top) { t = (oy - top) / -dy; if (t >= maxT) return -1; }
    let prev = t;
    if (oy + dy * t - T.at(ox + dx * t, oz + dz * t) < 0) return -1;
    while (t < maxT) {
      t = Math.min(maxT, t + 1);
      const y = oy + dy * t;
      if (y - T.at(ox + dx * t, oz + dz * t) < 0) {
        let a = prev, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m - T.at(ox + dx * m, oz + dz * m) < 0) b = m; else a = m;
        }
        return b;
      }
      if (y > top && dy >= 0) return -1;
      prev = t;
    }
    return -1;
  }

  _test(o, x, y, z, r, h) {
    const b = this.b;
    if (x + r > b[o] && x - r < b[o + 3] && y + h > b[o + 1] && y < b[o + 4] && z + r > b[o + 2] && z - r < b[o + 5]) {
      this._hit = true;
      if (b[o + 4] > this._top) this._top = b[o + 4];
      if (b[o + 1] < this._bot) this._bot = b[o + 1];
    }
  }

  // Cylindre ≈ AABB (x±r, y..y+h, z±r). Renseigne hitTop/hitBottom des boîtes touchées.
  query(x, y, z, r, h) {
    if (!this.cells) this._build();
    this._hit = false; this._top = -Infinity; this._bot = Infinity;
    const i0 = Math.max(0, Math.floor((x - r + EXT) / CS)), i1 = Math.min(GN - 1, Math.floor((x + r + EXT) / CS));
    const j0 = Math.max(0, Math.floor((z - r + EXT) / CS)), j1 = Math.min(GN - 1, Math.floor((z + r + EXT) / CS));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cell = this.cells[j * GN + i];
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) this._test(cell[k] * 6, x, y, z, r, h);
      }
    }
    for (let k = 0; k < this.dyn.length; k++) this._test(this.dyn[k] * 6, x, y, z, r, h);
    this.hitTop = this._top;
    this.hitBottom = this._bot;
    return this._hit;
  }
}
