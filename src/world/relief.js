import { rng } from './testScene.js';

export const CELL = 1;
export const SEA = -0.9;   // niveau de la mer
export const DEEP = -2.2;  // en dessous : trop profond pour avancer (on peut toujours en sortir)
const OUT = -9;            // hauteur hors de la grille : plein océan
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Bruit de valeurs (réseau 64×64 périodique), déterministe d'après le générateur donné.
function noise2(r) {
  const L = 64, lat = new Float32Array(L * L);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = smooth(x - xi), fz = smooth(z - zi);
    const a = lat[(zi & 63) * L + (xi & 63)], b = lat[(zi & 63) * L + ((xi + 1) & 63)];
    const c = lat[((zi + 1) & 63) * L + (xi & 63)], d = lat[((zi + 1) & 63) * L + ((xi + 1) & 63)];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
}

// Côte : (x, z) → distance approchée au rivage (> 0 sur la terre). Silhouette irrégulière (harmoniques + bruit),
// ~400–460 m de large ; déterministe d'après la graine.
export function makeCoast(seed) {
  const r = rng((seed | 0) * 5 + 41), vn = noise2(r);
  const R0 = 205 + r() * 20;
  const hs = [[2, 0.06, 0.04], [3, 0.04, 0.03], [4, 0.03, 0.02], [5, 0.015, 0.015], [7, 0.01, 0.005]].map(([k, a, v]) => [k, a + r() * v, r() * 6.2832]);
  return (x, z) => {
    const a = Math.atan2(z, x);
    let s = 1;
    for (let i = 0; i < hs.length; i++) s += hs[i][1] * Math.cos(hs[i][0] * a + hs[i][2]);
    return R0 * s - Math.hypot(x, z) + (vn(x * 0.03, z * 0.03) - 0.5) * 26 + (vn(x * 0.09 + 17, z * 0.09) - 0.5) * 6;
  };
}

// Relief : carte de hauteurs précalculée (1 m), interpolation bilinéaire (aucune allocation).
// Déterministe d'après la graine : hôte et clients obtiennent exactement le même terrain.
// zones : [x, z, rayon plat, rayon de fondu] — le relief s'aplatit autour des bâtiments et des tours ;
// coast : (x, z) → distance au rivage ; hills : massifs [x, z, étalement, hauteur].
export class Heightfield {
  constructor(half, seed, zones, coast, hills = []) {
    this.half = half; this.ext = half + 24; this.coast = coast;
    const n = this.n = Math.ceil((2 * this.ext) / CELL) + 1;
    this.h = new Float32Array(n * n);
    this.flat = new Float32Array(n * n).fill(1); // 0 = zone plate / plage / eau, 1 = relief libre
    this.max = 0;
    const r = rng((seed | 0) * 7 + 13), vn = noise2(r);
    const hl = hills.slice();
    for (let i = 0; i < 6; i++) { // petites collines sur la terre
      const a = r() * 6.2832, d = 15 + r() * 170, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 14 + r() * 18;
      if (coast(x, z) > 40) hl.push([x, z, s, Math.min(s * 0.25, 2 + r() * 3.5)]);
    }
    // zones plates : chaque zone n'écrit que dans son rectangle englobant
    const ext = this.ext, fl = this.flat;
    for (let k = 0; k < zones.length; k++) {
      const q = zones[k], R = q[3];
      const i0 = Math.max(0, Math.floor((q[0] - R + ext) / CELL)), i1 = Math.min(n - 1, Math.ceil((q[0] + R + ext) / CELL));
      const j0 = Math.max(0, Math.floor((q[1] - R + ext) / CELL)), j1 = Math.min(n - 1, Math.ceil((q[1] + R + ext) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-ext + i * CELL - q[0], -ext + j * CELL - q[1]);
        const t = smooth(clamp01((d - q[2]) / (q[3] - q[2])));
        if (t < fl[j * n + i]) fl[j * n + i] = t;
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -ext + i * CELL, z = -ext + j * CELL, m = coast(x, z), f = fl[j * n + i];
        let v = 0;
        if (m > 0) {
          for (let k = 0; k < hl.length; k++) {
            const q = hl[k], dx = x - q[0], dz = z - q[1];
            v += q[3] * Math.exp(-(dx * dx + dz * dz) / (2 * q[2] * q[2]));
          }
          v += (vn(x * 0.05, z * 0.05) - 0.5) * 1.8 + (vn(x * 0.17, z * 0.17) - 0.5) * 0.5;
          if (v > 3) v = 3 + (v - 3) * 0.55; // compresse les cumuls de collines superposées
          v *= f * smooth(clamp01(m / 35));
          if (v < -0.5) v = -0.5;
        }
        // plage : descend de 0 (m ≥ 8) à −2,6 (m = −14) puis plonge vers le large
        let h = v - 2.6 * smooth(clamp01((8 - m) / 22));
        if (m < -14) h += (m + 14) * 0.12;
        if (h < -9) h = -9;
        this.h[j * n + i] = h;
        fl[j * n + i] = f * smooth(clamp01((m - 6) / 10));
        if (h > this.max) this.max = h;
      }
    }
  }

  at(x, z) {
    const n = this.n, u = (x + this.ext) / CELL, v = (z + this.ext) / CELL;
    if (u < 0 || v < 0 || u >= n - 1 || v >= n - 1) return OUT;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * n + i, h = this.h;
    return (h[k] * (1 - fu) + h[k + 1] * fu) * (1 - fv) + (h[k + n] * (1 - fu) + h[k + n + 1] * fu) * fv;
  }

  // 0 = zone plate (bâtiment), plage ou eau ; 1 = relief libre
  free(x, z) {
    const n = this.n, i = Math.round((x + this.ext) / CELL), j = Math.round((z + this.ext) / CELL);
    return i < 0 || j < 0 || i >= n || j >= n ? 0 : this.flat[j * n + i];
  }

  slope(x, z) { return Math.hypot(this.at(x + 1, z) - this.at(x - 1, z), this.at(x, z + 1) - this.at(x, z - 1)) / 2; }

  // Vrai si le pas (x0,z0) → (x1,z1) mène vers une eau trop profonde (pieds près du fond) ; on peut toujours en sortir.
  sinks(x0, z0, x1, z1, y) {
    const h = this.at(x1, z1);
    return h < DEEP && h < this.at(x0, z0) && y - h < 1.2;
  }

  // Terre ferme à plus de `margin` m du rivage.
  land(x, z, margin = 0) { return this.coast(x, z) > margin; }
}
