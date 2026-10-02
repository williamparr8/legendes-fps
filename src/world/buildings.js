// Bâtiments à étages : murs percés de fenêtres, portes au rez-de-chaussée, dalles, escaliers intérieurs, toit praticable
// avec parapet. Tout est généré à partir d'un rng : même résultat pour l'hôte et les clients.
export const FH = 3.6;            // hauteur d'un niveau (dessus de dalle → dessus de dalle suivante)
const T = 0.25, SL = 0.4;          // demi-épaisseur des murs, épaisseur des dalles
const SW = 2.2, ND = 8, SD = 0.8, SH = FH / ND; // escalier : largeur, nombre de marches, profondeur, hauteur (0,45 < marche auto 0,55)
const WIN_W = 2.0, WIN_Y0 = 0.95, WIN_Y1 = 2.4;

function wallPieces(w, axis, fixed, a0, a1, yb, h, gaps, col) {
  const piece = (a, b, y0, y1) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    if (axis === 'x') w.box(a, y0, fixed - T, b, y1, fixed + T, col);
    else w.box(fixed - T, y0, a, fixed + T, y1, b, col);
  };
  let cur = a0;
  for (const g of gaps) {
    piece(cur, g.a, yb, yb + h);
    piece(g.a, g.b, yb, yb + g.y0); piece(g.a, g.b, yb + g.y1, yb + h);
    cur = g.b;
  }
  piece(cur, a1, yb, yb + h);
}

// Ouvertures d'un mur : porte éventuelle (rez-de-chaussée) puis fenêtres espacées ; triées, sans chevauchement.
function makeGaps(r, a0, a1, door, h) {
  const gaps = door ? [{ a: door[0], b: door[1], y0: 0, y1: h }] : [];
  for (let p = a0 + 2.2; p + WIN_W <= a1 - 2.2; p += 5.4) {
    if (r() < 0.18) continue;
    if (door && p < door[1] + 0.8 && p + WIN_W > door[0] - 0.8) continue;
    gaps.push({ a: p, b: p + WIN_W, y0: WIN_Y0, y1: WIN_Y1 });
  }
  return gaps.sort((u, v) => u.a - v.a);
}

function slab(w, x0, z0, x1, z1, y, hole, col) {
  const y0 = y - SL;
  if (!hole) { w.box(x0, y0, z0, x1, y, z1, col); return; }
  const [xa, za, xb, zb] = hole, b = (a, c, d, e, f, g) => { if (e - a > 0.01 && g - c > 0.01) w.box(a, y0, c, e, y, g, col); };
  b(x0, z0, 0, xa, 0, z1); b(xb, z0, 0, x1, 0, z1); b(xa, z0, 0, xb, 0, za); b(xa, zb, 0, xb, 0, z1);
}

// Escalier plein (marches empilées) : axe 'z' ou 'x', bande latérale [lo, hi], départ s0, direction dir.
// Retourne le trou à ménager dans la dalle du dessus : [xa, za, xb, zb].
function stair(w, axis, yb, lo, hi, s0, dir, col, out) {
  if (out) out.push({ axis, yb, lo, hi, s0, dir });
  for (let i = 0; i < ND; i++) {
    const a = s0 + dir * i * SD, b = s0 + dir * (i + 1) * SD, m0 = Math.min(a, b), m1 = Math.max(a, b), top = yb + (i + 1) * SH;
    if (axis === 'z') w.box(lo, yb, m0, hi, top, m1, col); else w.box(m0, yb, lo, m1, top, hi, col);
  }
  const h0 = s0 + dir * 1.4, h1 = s0 + dir * 5.6, m0 = Math.min(h0, h1), m1 = Math.max(h0, h1);
  return axis === 'z' ? [lo, m0, hi, m1] : [m0, lo, m1, hi];
}

// spec : { cx, cz, sx, sz, floors, wall, trim }. Retourne { lootPoints:[[x,z,y]], solid:[x0,z0,x1,z1], roof }.
export function buildBuilding(w, r, spec) {
  const { cx, cz, sx, sz, floors: n, wall: col, trim } = spec;
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, G = 3.6;
  const dz = r() < 0.5 ? 0 : 1, dx = r() < 0.5 ? 2 : 3; // côté de la porte en z (z0 / z1) et en x (x0 / x1)
  const doorX = (() => { const g0 = cx - G / 2 + (r() - 0.5) * (sx - G - 6); return [g0, g0 + G]; })();
  const doorZ = (() => { const g0 = cz - G / 2 + (r() - 0.5) * (sz - G - 6); return [g0, g0 + G]; })();
  const wh = FH - SL;

  // escaliers : niveau f → f+1, alternance de deux emplacements qui ne se chevauchent pas
  const holes = [], stairs = [];
  for (let f = 0; f < n; f++) {
    const yb = f * FH;
    if (f % 2 === 0) { // le long du mur en x sans porte, montée vers le mur en z opposé à la porte
      const lo = dx === 2 ? x1 - T - SW : x0 + T, hi = lo + SW;
      holes.push(dz === 0 ? stair(w, 'z', yb, lo, hi, z1 - T - ND * SD - 0.2, 1, trim, stairs) : stair(w, 'z', yb, lo, hi, z0 + T + ND * SD + 0.2, -1, trim, stairs));
    } else { // le long du mur en z sans porte, montée vers le mur en x de la porte
      const lo = dz === 0 ? z1 - T - SW : z0 + T, hi = lo + SW;
      holes.push(dx === 2 ? stair(w, 'x', yb, lo, hi, x0 + T + ND * SD + 0.2, -1, trim, stairs) : stair(w, 'x', yb, lo, hi, x1 - T - ND * SD - 0.2, 1, trim, stairs));
    }
  }

  // murs par niveau
  for (let f = 0; f < n; f++) {
    const yb = f * FH, ground = f === 0;
    const gz0 = makeGaps(r, x0 - T, x1 + T, ground && dz === 0 ? doorX : null, wh);
    const gz1 = makeGaps(r, x0 - T, x1 + T, ground && dz === 1 ? doorX : null, wh);
    const gx0 = makeGaps(r, z0 - T, z1 + T, ground && dx === 2 ? doorZ : null, wh);
    const gx1 = makeGaps(r, z0 - T, z1 + T, ground && dx === 3 ? doorZ : null, wh);
    wallPieces(w, 'x', z0, x0 - T, x1 + T, yb, wh, gz0, col); wallPieces(w, 'x', z1, x0 - T, x1 + T, yb, wh, gz1, col);
    wallPieces(w, 'z', x0, z0 - T, z1 + T, yb, wh, gx0, col); wallPieces(w, 'z', x1, z0 - T, z1 + T, yb, wh, gx1, col);
    // appuis de fenêtre (décor)
    const sill = (axis, fixed, gaps, side) => {
      for (const g of gaps) {
        if (g.y0 <= 0) continue;
        const o = T + 0.12;
        if (axis === 'x') w.deco(g.a - 0.1, yb + g.y0 - 0.1, fixed + (side > 0 ? T : -o), g.b + 0.1, yb + g.y0, fixed + (side > 0 ? o : -T), 0x5a6068);
        else w.deco(fixed + (side > 0 ? T : -o), yb + g.y0 - 0.1, g.a - 0.1, fixed + (side > 0 ? o : -T), yb + g.y0, g.b + 0.1, 0x5a6068);
      }
    };
    sill('x', z0, gz0, -1); sill('x', z1, gz1, 1); sill('z', x0, gx0, -1); sill('z', x1, gx1, 1);
  }

  // dalles (la dernière = toit) avec trou d'escalier
  for (let k = 1; k <= n; k++) slab(w, x0 - T, z0 - T, x1 + T, z1 + T, k * FH, holes[k - 1], k === n ? trim : col);
  const ry = n * FH;
  // corniche + parapet de toit
  w.deco(x0 - T - 0.2, ry, z0 - T - 0.2, x1 + T + 0.2, ry + 0.12, z0 - T, 0x4a5058); w.deco(x0 - T - 0.2, ry, z1 + T, x1 + T + 0.2, ry + 0.12, z1 + T + 0.2, 0x4a5058);
  w.deco(x0 - T - 0.2, ry, z0 - T, x0 - T, ry + 0.12, z1 + T, 0x4a5058); w.deco(x1 + T, ry, z0 - T, x1 + T + 0.2, ry + 0.12, z1 + T, 0x4a5058);
  const P = 0.15, PH = 1.1;
  w.box(x0 - T, ry, z0 - T, x1 + T, ry + PH, z0 - T + 2 * P, trim); w.box(x0 - T, ry, z1 + T - 2 * P, x1 + T, ry + PH, z1 + T, trim);
  w.box(x0 - T, ry, z0 - T + 2 * P, x0 - T + 2 * P, ry + PH, z1 + T - 2 * P, trim); w.box(x1 + T - 2 * P, ry, z0 - T + 2 * P, x1 + T, ry + PH, z1 + T - 2 * P, trim);
  // climatiseur sur le toit, côté opposé à l'escalier d'accès
  const ax = (n - 1) % 2 === 0 ? (dx === 2 ? x0 + 3 : x1 - 3) : (dx === 2 ? x1 - 3 : x0 + 3), az = (n - 1) % 2 === 0 ? cz - sz * 0.2 : (dz === 0 ? z0 + 3 : z1 - 3);
  w.box(ax - 0.9, ry, az - 0.6, ax + 0.9, ry + 1.2, az + 0.6, 0x7a8088, 3);

  // mobilier au rez-de-chaussée (hors des escaliers)
  w.box(cx - sx * 0.18 - 0.6, 0, cz + sz * 0.1 - 0.6, cx - sx * 0.18 + 0.6, 1.1, cz + sz * 0.1 + 0.6, 0xb08a60, 1);
  w.box(cx + sx * 0.04 - 0.5, 0, cz - sz * 0.2 - 0.5, cx + sx * 0.04 + 0.5, 0.9, cz - sz * 0.2 + 0.5, 0xa07a50, 1);

  // butin : 4 points par niveau (+ centre au rez-de-chaussée), y = dessus de dalle
  const lootPoints = [];
  for (let f = 0; f <= n; f++) {
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lootPoints.push([cx + a * sx * 0.25, cz + b * sz * 0.25, f * FH]);
  }
  lootPoints.push([cx, cz, 0]);
  return { lootPoints, solid: [x0 - T, z0 - T, x1 + T, z1 + T], roof: ry, stairs };
}
