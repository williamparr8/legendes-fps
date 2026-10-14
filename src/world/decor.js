import { roadDist } from './terrain.js';

const CAR = [0xb03a2e, 0x2e5fa6, 0xd8d8d0, 0x3a3f46, 0xc8a032, 0x4a7a4a, 0x7a3f8a];
const BARREL = [0xb03a2e, 0x2e5fa6, 0x4a7a4a, 0xc8a032];
const S2 = Math.SQRT1_2;
const QZ = [0, 0, S2, S2], QX = [S2, 0, 0, S2]; // cylindre couché : axe le long de x (rotation z) / de z (rotation x)

// Décor extérieur : poteaux électriques + fils le long des routes, lampadaires, véhicules, cuves/cheminée/silo/grue/antenne selon le lieu,
// bottes de foin, tentes, barils, puits, clôtures. Tout est déterministe (rng de la carte) ; la plupart des pièces sont de simples décors.
// E = { r, hf, coast, roads, places, near(x,z,m), solids[] }
export function buildDecor(w, E) {
  const { r, hf, coast, roads, places, solids, near } = E;
  const pick = (a) => a[(r() * a.length) | 0];
  const ok = (x, z, m = 2) => coast(x, z) > 14 && !near(x, z, m) && hf.slope(x, z) < 0.35;
  const solid = (x0, z0, x1, z1) => solids.push([x0, z0, x1, z1]);
  const spotIn = (p, rMin, rMax, m, tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const a = r() * 6.2832, d = rMin + r() * (rMax - rMin), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (ok(x, z, m) && roadDist(roads, x, z) > 4) return [x, z];
    }
    return null;
  };

  // ---- poteaux électriques et fils le long des routes ----
  roads.forEach((s, si) => {
    const dx = s[2] - s[0], dz = s[3] - s[1], len = Math.hypot(dx, dz);
    if (len < 40) return;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux, side = si % 2 ? 1 : -1, n = Math.floor(len / 30);
    let prev = null;
    for (let i = 1; i <= n; i++) {
      const t = (i / (n + 1)) * len, x = s[0] + ux * t + nx * side * 4.6, z = s[1] + uz * t + nz * side * 4.6;
      if (!ok(x, z, 1.5)) { prev = null; continue; }
      const gy = hf.at(x, z), yc = gy + 7.4;
      w.cyl(x, gy - 0.3, z, 0.13, 8.2, 0x6b5a45, 1);
      w.beam(x - nx * 0.95, yc, z - nz * 0.95, x + nx * 0.95, yc, z + nz * 0.95, 0.05, 0x6b5a45, 1);
      const cur = [x, z, yc];
      if (prev) {
        for (const o of [-0.95, 0, 0.95]) {
          const ax = prev[0] + nx * o, az = prev[1] + nz * o, bx = x + nx * o, bz = z + nz * o, mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (prev[2] + yc) / 2 - 0.45;
          w.beam(ax, prev[2], az, mx, my, mz, 0.02, 0x23262b); w.beam(mx, my, mz, bx, yc, bz, 0.02, 0x23262b);
        }
      }
      prev = cur;
    }
  });

  // ---- lampadaires le long des routes dans les lieux habités ----
  let lamps = 0;
  for (const p of places) {
    if (!['Village', 'Hameau', 'Citadelle', 'Port', 'Usine'].includes(p.name)) continue;
    for (const s of roads) {
      const dx = s[2] - s[0], dz = s[3] - s[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      for (let t = 8; t < len - 8 && lamps < 40; t += 18) {
        const x = s[0] + ux * t - uz * 3.4, z = s[1] + uz * t + ux * 3.4;
        if (Math.hypot(x - p.x, z - p.z) > p.r * 0.85 || !ok(x, z, 1.2)) continue;
        const gy = hf.at(x, z);
        w.cyl(x, gy, z, 0.07, 5.2, 0x3a3f46, 0);
        w.beam(x, gy + 5.1, z, x + uz * 1.0, gy + 5.1, z - ux * 1.0, 0.04, 0x3a3f46);
        w.deco(x + uz * 1.0 - 0.28, gy + 4.95, z - ux * 1.0 - 0.18, x + uz * 1.0 + 0.28, gy + 5.12, z - ux * 1.0 + 0.18, 0xfff0b0, 0);
        lamps++;
      }
    }
  }

  // ---- clôture rectangulaire (poteaux + 2 lisses, une ouverture au milieu du côté sud) ----
  const fence = (x0, z0, x1, z1) => {
    const post = (x, z) => { const g = hf.at(x, z); w.deco(x - 0.06, g, z - 0.06, x + 0.06, g + 1.15, z + 0.06, 0x8a6a45, 1); return g; };
    const rail = (ax, az, bx, bz) => {
      for (const h of [0.45, 0.95]) w.beam(ax, hf.at(ax, az) + h, az, bx, hf.at(bx, bz) + h, bz, 0.03, 0x8a6a45, 1);
    };
    const edge = (ax, az, bx, bz, gap) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.4));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        post(x, z);
        if (i < n && !(gap && i === Math.floor(n / 2))) rail(x, z, ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n);
      }
    };
    edge(x0, z0, x1, z0, false); edge(x1, z0, x1, z1, false); edge(x1, z1, x0, z1, true); edge(x0, z1, x0, z0, false);
  };

  // ---- véhicules : carrosserie et cabine solides (couverture), roues décoratives ----
  const vehicle = (x, z, alongX, type) => {
    const gy = hf.at(x, z), L = type === 'truck' ? 7.4 : 4.4, Wd = type === 'truck' ? 2.5 : 1.9, c = pick(CAR);
    const bx = alongX ? L / 2 : Wd / 2, bz = alongX ? Wd / 2 : L / 2;
    if (type === 'truck') {
      const cab = alongX ? [x + L / 2 - 1.8, z - Wd / 2, x + L / 2, z + Wd / 2] : [x - Wd / 2, z + L / 2 - 1.8, x + Wd / 2, z + L / 2];
      const car = alongX ? [x - L / 2, z - Wd / 2, x + L / 2 - 1.9, z + Wd / 2] : [x - Wd / 2, z - L / 2, x + Wd / 2, z + L / 2 - 1.9];
      w.box(car[0], gy + 0.5, car[1], car[2], gy + 3.0, car[3], 0x8a8f96, 13);
      w.box(cab[0], gy + 0.5, cab[1], cab[2], gy + 2.6, cab[3], c, 13);
    } else {
      w.box(x - bx, gy + 0.35, z - bz, x + bx, gy + 1.1, z + bz, c, 13);
      const cx0 = alongX ? x - 1.5 : x - bx + 0.1, cx1 = alongX ? x + 0.8 : x + bx - 0.1, cz0 = alongX ? z - bz + 0.1 : z - 1.5, cz1 = alongX ? z + bz - 0.1 : z + 0.8;
      w.box(cx0, gy + 1.1, cz0, cx1, gy + 1.85, cz1, 0x2b3640, 13);
    }
    for (const sx of [-1, 1]) for (const sz of (type === 'truck' ? [-0.38, 0.1, 0.4] : [-0.3, 0.3])) {
      const wx = alongX ? x + sz * L : x + sx * (Wd / 2 - 0.05), wz = alongX ? z + sx * (Wd / 2 - 0.05) : z + sz * L;
      w.shape('cyl', 0, wx, gy + 0.38, wz, 0.76, 0.3, 0.76, 0x1c1e22, 0, alongX ? QX : QZ);
    }
    solid(x - bx, z - bz, x + bx, z + bz);
  };
  const VEH = { Village: 3, Hameau: 1, Port: 3, Usine: 2, 'Base militaire': 2, Ferme: 2, Citadelle: 2 };
  for (const p of places) {
    for (let k = 0; k < (VEH[p.name] || 0); k++) {
      for (let t = 0; t < 40; t++) {
        const a = r() * 6.2832, d = 8 + r() * p.r * 0.8, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, rd = roadDist(roads, x, z);
        if (rd < 5 || rd > 14 || !ok(x, z, 4)) continue;
        vehicle(x, z, r() < 0.5, p.name === 'Port' || p.name === 'Usine' ? (r() < 0.5 ? 'truck' : 'car') : 'car');
        break;
      }
    }
  }

  // ---- éléments propres à chaque lieu ----
  const barrels = (x, z) => {
    for (let i = 0; i < 4; i++) {
      const bx = x + (i % 2) * 0.75 + (r() - 0.5) * 0.2, bz = z + ((i / 2) | 0) * 0.75, g = hf.at(bx, bz);
      w.cyl(bx, g, bz, 0.32, 0.95, pick(BARREL), 3, true);
    }
    solid(x - 0.4, z - 0.4, x + 1.2, z + 1.2);
  };
  const tank = (x, z, rad, h, c) => {
    const g = hf.at(x, z);
    w.cyl(x, g, z, rad, h, c, 3, true);
    w.shape('sph', 3, x, g + h, z, rad * 2, rad * 0.8, rad * 2, c);
    w.beam(x + rad * 0.8, g, z, x + rad * 0.8, g + h + 0.4, z, 0.05, 0x30343a);
    solid(x - rad, z - rad, x + rad, z + rad);
  };
  for (const p of places) {
    if (p.name === 'Usine') {
      const s = spotIn(p, 14, p.r, 6);
      if (s) { // cheminée à bandes
        const g = hf.at(s[0], s[1]);
        w.cyl(s[0], g - 0.3, s[1], 1.5, 27, 0x8a6a5a, 0, true);
        for (let y = 20; y < 27; y += 3.5) w.cyl(s[0], g + y, s[1], 1.56, 1.75, y % 7 === 6 ? 0xd8d4c8 : 0xb03a2e, 0);
        w.cyl(s[0], g + 26.7, s[1], 1.8, 0.4, 0x30343a, 0);
        solid(s[0] - 1.6, s[1] - 1.6, s[0] + 1.6, s[1] + 1.6);
      }
      for (let k = 0; k < 2; k++) { const t = spotIn(p, 8, p.r, 6); if (t) tank(t[0], t[1], 3.6, 6.5, pick([0xa0a6ae, 0xc8c2b0])); }
      const b = spotIn(p, 6, p.r, 3); if (b) barrels(b[0], b[1]);
    } else if (p.name === 'Port') {
      const t = spotIn(p, 8, p.r, 6); if (t) tank(t[0], t[1], 3.2, 6, 0xc8c2b0);
      const c = spotIn(p, 10, p.r, 8);
      if (c) { // grue à portique
        const [x, z] = c, g = hf.at(x, z);
        for (const dx of [-5.5, 5.5]) { w.box(x + dx - 0.5, g - 0.3, z - 0.5, x + dx + 0.5, g + 13, z + 0.5, 0xc8a032, 3); }
        w.deco(x - 7, g + 13, z - 0.7, x + 9, g + 14.2, z + 0.7, 0xc8a032, 3);
        w.box(x + 2.5, g + 11.2, z - 1.2, x + 4.5, g + 13, z + 1.2, 0x30343a, 3);
        w.beam(x - 5.5, g + 13, z, x - 7, g + 14.2, z, 0.08, 0x30343a);
        solid(x - 6, z - 1, x + 6, z + 1);
      }
      const b = spotIn(p, 6, p.r, 3); if (b) barrels(b[0], b[1]);
    } else if (p.name === 'Ferme') {
      for (let k = 0; k < 2; k++) { // silos
        const s = spotIn(p, 10, p.r, 4);
        if (s) { const g = hf.at(s[0], s[1]); w.cyl(s[0], g - 0.2, s[1], 2.4, 10, 0xb8b4a8, 3, true); w.shape('cone', 3, s[0], g + 11.2, s[1], 5.2, 2.6, 5.2, 0x6a7078); solid(s[0] - 2.5, s[1] - 2.5, s[0] + 2.5, s[1] + 2.5); }
      }
      for (let k = 0; k < 6; k++) { // bottes de foin couchées
        const s = spotIn(p, 8, p.r, 2);
        if (s) { const g = hf.at(s[0], s[1]); w.shape('cyl', 1, s[0], g + 0.85, s[1], 1.7, 1.5, 1.7, 0xc9b25f, 0, QZ, [s[0] - 0.75, g, s[1] - 0.85, s[0] + 0.75, g + 1.7, s[1] + 0.85]); solid(s[0] - 0.8, s[1] - 0.9, s[0] + 0.8, s[1] + 0.9); }
      }
      const f = spotIn(p, 14, p.r, 9); if (f) { fence(f[0] - 10, f[1] - 7, f[0] + 10, f[1] + 7); solid(f[0] - 10, f[1] - 7, f[0] + 10, f[1] + 7); }
    } else if (p.name === 'Base militaire') {
      const a = spotIn(p, 16, p.r, 4);
      if (a) { // pylône radio à 4 pieds et 3 entretoises
        const [x, z] = a, g = hf.at(x, z), H = 24;
        for (const [sx, sz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) w.beam(x + sx, g, z + sz, x + sx * 0.25, g + H, z + sz * 0.25, 0.07, 0xc8ccd0);
        for (const h of [6, 12, 18]) {
          const k = 1.5 * (1 - h / H * 0.83);
          w.beam(x - k, g + h, z - k, x + k, g + h, z - k, 0.04, 0xc8ccd0); w.beam(x + k, g + h, z - k, x + k, g + h, z + k, 0.04, 0xc8ccd0);
          w.beam(x + k, g + h, z + k, x - k, g + h, z + k, 0.04, 0xc8ccd0); w.beam(x - k, g + h, z + k, x - k, g + h, z - k, 0.04, 0xc8ccd0);
        }
        w.shape('sph', 0, x + 0.4, g + 17.5, z, 1.6, 0.4, 1.6, 0xd8dce0);
        w.colliders.add(x - 0.45, g, z - 0.45, x + 0.45, g + H, z + 0.45);
        solid(x - 1.6, z - 1.6, x + 1.6, z + 1.6);
      }
      for (let k = 0; k < 3; k++) { // tentes
        const t = spotIn(p, 10, p.r, 4);
        if (t) {
          const g = hf.at(t[0], t[1]);
          w.gable(t[0] - 2.6, t[1] - 2.1, t[0] + 2.6, t[1] + 2.1, g, 2.7, pick([0x5a6048, 0x6b6a4a, 0x4a5a40]), 3);
          w.colliders.add(t[0] - 2.5, g, t[1] - 2.0, t[0] + 2.5, g + 1.4, t[1] + 2.0);
          solid(t[0] - 2.6, t[1] - 2.1, t[0] + 2.6, t[1] + 2.1);
        }
      }
      const b = spotIn(p, 6, p.r, 3); if (b) barrels(b[0], b[1]);
    } else if (p.name === 'Village' || p.name === 'Hameau') {
      const s = spotIn(p, 4, p.r * 0.7, 4);
      if (s) { // puits couvert
        const g = hf.at(s[0], s[1]);
        w.cyl(s[0], g, s[1], 0.9, 0.9, 0x8a8d92, 0, true);
        for (const dx of [-0.8, 0.8]) w.deco(s[0] + dx - 0.07, g, s[1] - 0.07, s[0] + dx + 0.07, g + 2.0, s[1] + 0.07, 0x6e5238, 1);
        w.gable(s[0] - 1.1, s[1] - 1.1, s[0] + 1.1, s[1] + 1.1, g + 2.0, 0.8, 0x7a3f32, 11);
        solid(s[0] - 1, s[1] - 1, s[0] + 1, s[1] + 1);
      }
      for (let k = 0; k < 2; k++) { const f = spotIn(p, 8, p.r * 0.9, 7); if (f) fence(f[0] - 4, f[1] - 3, f[0] + 4, f[1] + 3); }
    } else if (p.name === 'Citadelle') {
      const b = spotIn(p, 20, p.r * 0.9, 4);
      if (b) { // obélisque sur socle
        const g = hf.at(b[0], b[1]);
        w.box(b[0] - 1.6, g, b[1] - 1.6, b[0] + 1.6, g + 0.5, b[1] + 1.6, 0x8a8d92, 0);
        w.box(b[0] - 0.7, g + 0.5, b[1] - 0.7, b[0] + 0.7, g + 6.0, b[1] + 0.7, 0xb8b4a8, 2);
        w.shape('cone', 2, b[0], g + 6.8, b[1], 1.4, 1.6, 1.4, 0xb8b4a8);
        solid(b[0] - 1.6, b[1] - 1.6, b[0] + 1.6, b[1] + 1.6);
      }
    }
  }
}
