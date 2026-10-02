import { rayAabb } from '../combat/ray.js';

// Boîtes AABB dans un Float32Array plat (aucune allocation à la requête).
// Pour de grandes cartes (étape E) : ajouter une grille spatiale dans query().
export class Colliders {
  constructor() {
    this.n = 0;
    this.b = new Float32Array(6 * 512);
    this.hitTop = 0;
    this.hitBottom = 0;
    this.terrain = null; // relief (Heightfield) ; sans relief : sol plat à y = 0
  }
  add(x0, y0, z0, x1, y1, z1) {
    if ((this.n + 1) * 6 > this.b.length) {
      const nb = new Float32Array(this.b.length * 2);
      nb.set(this.b);
      this.b = nb;
    }
    this.b.set([x0, y0, z0, x1, y1, z1], this.n * 6);
    this.n++;
  }
  // Boîtes dynamiques (murs temporaires) : emplacement réservé, déplacé/rangé loin quand inactif.
  addSlot() { this.add(1e6, 1e6, 1e6, 1e6 + 1, 1e6 + 1, 1e6 + 1); return this.n - 1; }
  setSlot(i, x0, y0, z0, x1, y1, z1) { this.b.set([x0, y0, z0, x1, y1, z1], i * 6); }
  clearSlot(i) { this.setSlot(i, 1e6, 1e6, 1e6, 1e6 + 1, 1e6 + 1, 1e6 + 1); }
  // Rayon (direction normalisée) contre boîtes + sol y=0. Retourne t ou -1.
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    const b = this.b;
    let best = maxT, hit = false;
    for (let i = 0, o = 0; i < this.n; i++, o += 6) {
      const t = rayAabb(ox, oy, oz, dx, dy, dz, b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5], best);
      if (t >= 0 && t < best) { best = t; hit = true; }
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
  // Cylindre ≈ AABB (x±r, y..y+h, z±r). Renseigne hitTop/hitBottom des boîtes touchées.
  query(x, y, z, r, h) {
    const b = this.b;
    let hit = false;
    let top = -Infinity;
    let bot = Infinity;
    for (let i = 0, o = 0; i < this.n; i++, o += 6) {
      if (x + r > b[o] && x - r < b[o + 3] && y + h > b[o + 1] && y < b[o + 4] && z + r > b[o + 2] && z - r < b[o + 5]) {
        hit = true;
        if (b[o + 4] > top) top = b[o + 4];
        if (b[o + 1] < bot) bot = b[o + 1];
      }
    }
    this.hitTop = top;
    this.hitBottom = bot;
    return hit;
  }
}
