// Bâtiments à étages : murs percés de fenêtres (cadres, vitres, volets), portes (encadrement, auvent, perron), dalles et corniches,
// escaliers intérieurs, toit praticable (parapet, équipements, mât de tyrolienne) ou toit à pignon, mobilier par niveau.
// Tout est généré à partir d'un rng : même résultat pour l'hôte et les clients.
export const FH = 3.6;            // hauteur d'un niveau (dessus de dalle → dessus de dalle suivante)
const T = 0.25, SL = 0.4;          // demi-épaisseur des murs, épaisseur des dalles
export const ND = 8, SD = 0.8;     // escalier : nombre de marches, profondeur
const SW = 2.2, SH = FH / ND;      // largeur, hauteur de marche (0,45 < marche auto 0,55)
const WIN_W = 2.0, WIN_Y0 = 0.95, WIN_Y1 = 2.4;

const FRAME = { house: 0xefece4, farm: 0xe8e2d2, default: 0xe4e1da, industrial: 0x353a42, warehouse: 0x4d535b, military: 0x434a3c, ruin: 0xaaa497, phare: 0xf2efe6 };
const SHUTTER = [0x3f6b4f, 0x4c6a8a, 0x8a4a3a, 0x6b5a3a];
const ROOF = [0x7a3f32, 0x5f4a40, 0x4d5560, 0x6e5a3c];
const WOOD = [0xb08a60, 0xa07a50, 0x8a6a45, 0xc09a68];
const CLOTH = [0x4f6a8a, 0x8a4f4f, 0x5a7a54, 0x7a6a8a];
const BRICK = [0xb8624a, 0xa8553f, 0xc07a58, 0x9a5442, 0xb86a50];
const PLASTER = [0xe8dfc8, 0xd9c9a0, 0xc9d4d8, 0xe0b8a0, 0xcfd8c0];
const SIDING = [0xd8d2c0, 0x8da0b0, 0x7a9476, 0xc0ae92, 0xb5877a];

function wallPieces(w, axis, fixed, a0, a1, yb, h, gaps, col, kind = 0) {
  const piece = (a, b, y0, y1) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    if (axis === 'x') w.box(a, y0, fixed - T, b, y1, fixed + T, col, kind);
    else w.box(fixed - T, y0, a, fixed + T, y1, b, col, kind);
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

// Rectangle [x0,z0,x1,z1] occupé par la volée d'un escalier.
const laneRect = (s) => { const e = s.s0 + s.dir * ND * SD, a = Math.min(s.s0, e), b = Math.max(s.s0, e); return s.axis === 'z' ? [s.lo, a, s.hi, b] : [a, s.lo, b, s.hi]; };
const inR = (q, x, z, m) => x > q[0] - m && x < q[2] + m && z > q[1] - m && z < q[3] + m;

// spec : { cx, cz, sx, sz, floors, wall, trim, style }. style : default | house | farm | industrial | warehouse | military | ruin | phare.
// Retourne { lootPoints:[[x,z,y]], solid:[x0,z0,x1,z1], roof, stairs, top (dernier niveau accessible), zip:[x,z]|null, pitched }.
export function buildBuilding(w, r, spec) {
  const { cx, cz, sx, sz, floors: n, style = 'default' } = spec;
  let col = spec.wall, trim = spec.trim;
  // matière des murs : brique / bardage bois pour les habitations, tôle ondulée pour l'industrie, béton sinon
  let wallKind = 0;
  if (style === 'phare') { col = 0xe9e6dc; trim = 0xb33a30; }
  else if (style === 'house' || style === 'farm' || style === 'default' || style === 'ruin') {
    const k = r();
    if (k < 0.45) { wallKind = 9; col = BRICK[(r() * BRICK.length) | 0]; }
    else if (k < 0.65 && style !== 'ruin') { wallKind = 10; col = SIDING[(r() * SIDING.length) | 0]; }
    else if (k < 0.85 && style !== 'ruin') { wallKind = 12; col = PLASTER[(r() * PLASTER.length) | 0]; }
  } else if (style === 'industrial' || style === 'warehouse') wallKind = 3;
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, G = 3.6;
  const pitched = (style === 'house' || style === 'farm') && n <= 2 && r() < 0.8; // toit à pignon : pas d'accès au toit
  const top = pitched ? n - 1 : n;
  const dz = r() < 0.5 ? 0 : 1, dx = r() < 0.5 ? 2 : 3; // côté de la porte en z (z0 / z1) et en x (x0 / x1)
  const doorX = (() => { const g0 = cx - G / 2 + (r() - 0.5) * (sx - G - 6); return [g0, g0 + G]; })();
  const doorZ = (() => { const g0 = cz - G / 2 + (r() - 0.5) * (sz - G - 6); return [g0, g0 + G]; })();
  const wh = FH - SL;
  const fc = FRAME[style] || FRAME.default, shutterC = SHUTTER[(r() * SHUTTER.length) | 0], roofC = ROOF[(r() * ROOF.length) | 0];
  const shutters = (style === 'house' || style === 'farm') && r() < 0.7;
  const plinthC = style === 'industrial' || style === 'warehouse' ? 0x4a4f55 : 0x6b6d70;

  // décor posé le long d'un mur : axe 'x' (mur le long de x, z = fixed) ou 'z' ; side = -1 / +1 côté extérieur ; t = écart au plan du mur
  const put = (axis, fixed, side, a0, a1, y0, y1, t0, t1, c, kind = 0) => {
    if (a1 - a0 < 0.005 || y1 - y0 < 0.005) return;
    const p0 = side > 0 ? fixed + t0 : fixed - t1, p1 = side > 0 ? fixed + t1 : fixed - t0;
    if (axis === 'x') w.deco(a0, y0, p0, a1, y1, p1, c, kind); else w.deco(p0, y0, a0, p1, y1, a1, c, kind);
  };

  // escaliers : niveau f → f+1, alternance de deux emplacements qui ne se chevauchent pas
  const holes = [], stairs = [];
  for (let f = 0; f < top; f++) {
    const yb = f * FH;
    if (f % 2 === 0) { // le long du mur en x sans porte, montée vers le mur en z opposé à la porte
      const lo = dx === 2 ? x1 - T - SW : x0 + T, hi = lo + SW;
      holes.push(dz === 0 ? stair(w, 'z', yb, lo, hi, z1 - T - ND * SD - 0.2, 1, trim, stairs) : stair(w, 'z', yb, lo, hi, z0 + T + ND * SD + 0.2, -1, trim, stairs));
    } else { // le long du mur en z sans porte, montée vers le mur en x de la porte
      const lo = dz === 0 ? z1 - T - SW : z0 + T, hi = lo + SW;
      holes.push(dx === 2 ? stair(w, 'x', yb, lo, hi, x0 + T + ND * SD + 0.2, -1, trim, stairs) : stair(w, 'x', yb, lo, hi, x1 - T - ND * SD - 0.2, 1, trim, stairs));
    }
  }

  // décor de façade : fenêtres (vitre, meneaux, cadre, linteau, appui, volets), portes (montants, linteau, auvent, perron)
  const dress = (axis, fixed, side, gaps, yb, ground) => {
    for (const g of gaps) {
      if (g.y0 > 0) {
        const mid = (g.a + g.b) / 2, ym = yb + (g.y0 + g.y1) / 2;
        put(axis, fixed, side, g.a, g.b, yb + g.y0, yb + g.y1, -0.04, 0.04, 0x9fc3d6, 8);
        put(axis, fixed, side, mid - 0.03, mid + 0.03, yb + g.y0, yb + g.y1, -0.07, 0.07, fc);
        put(axis, fixed, side, g.a, g.b, ym - 0.03, ym + 0.03, -0.07, 0.07, fc);
        put(axis, fixed, side, g.a - 0.08, g.a + 0.1, yb + g.y0, yb + g.y1 + 0.2, T, T + 0.1, fc);
        put(axis, fixed, side, g.b - 0.1, g.b + 0.08, yb + g.y0, yb + g.y1 + 0.2, T, T + 0.1, fc);
        put(axis, fixed, side, g.a - 0.16, g.b + 0.16, yb + g.y1, yb + g.y1 + 0.22, T, T + 0.15, fc);
        put(axis, fixed, side, g.a - 0.16, g.b + 0.16, yb + g.y0 - 0.12, yb + g.y0, T, T + 0.22, 0x5a6068);
        if (shutters) {
          put(axis, fixed, side, g.a - 0.62, g.a - 0.1, yb + g.y0, yb + g.y1 + 0.2, T, T + 0.07, shutterC, 1);
          put(axis, fixed, side, g.b + 0.1, g.b + 0.62, yb + g.y0, yb + g.y1 + 0.2, T, T + 0.07, shutterC, 1);
        }
      } else if (ground) {
        const h = g.y1;
        put(axis, fixed, side, g.a, g.a + 0.2, 0, h, T, T + 0.13, fc);
        put(axis, fixed, side, g.b - 0.2, g.b, 0, h, T, T + 0.13, fc);
        put(axis, fixed, side, g.a - 0.15, g.b + 0.15, h - 0.4, h, T, T + 0.18, fc);
        if (style !== 'ruin') {
          put(axis, fixed, side, g.a - 0.4, g.b + 0.4, h - 0.65, h - 0.52, T, T + 1.6, roofC, 3);
          put(axis, fixed, side, g.a - 0.3, g.a - 0.18, 0, h - 0.65, T + 1.4, T + 1.52, fc);
          put(axis, fixed, side, g.b + 0.18, g.b + 0.3, 0, h - 0.65, T + 1.4, T + 1.52, fc);
        }
        // perron (solide, 0,17 m : franchi sans sauter)
        const a0 = g.a - 0.3, a1 = g.b + 0.3, p0 = side > 0 ? fixed + T : fixed - T - 1.1, p1 = side > 0 ? fixed + T + 1.1 : fixed - T;
        if (axis === 'x') w.box(a0, 0, p0, a1, 0.17, p1, 0x8c8f93, 0); else w.box(p0, 0, a0, p1, 0.17, a1, 0x8c8f93, 0);
      }
    }
  };
  // soubassement le long d'un mur du rez-de-chaussée, interrompu par la porte
  const base = (axis, fixed, side, a0, a1, d) => {
    const s0 = d ? d[0] : a1, s1 = d ? d[1] : a1;
    put(axis, fixed, side, a0, s0, 0, 0.55, T, T + 0.1, plinthC); put(axis, fixed, side, s1, a1, 0, 0.55, T, T + 0.1, plinthC);
  };
  for (let f = 0; f < n; f++) {
    const yb = f * FH, ground = f === 0;
    const gz0 = makeGaps(r, x0 - T, x1 + T, ground && dz === 0 ? doorX : null, wh);
    const gz1 = makeGaps(r, x0 - T, x1 + T, ground && dz === 1 ? doorX : null, wh);
    const gx0 = makeGaps(r, z0 - T, z1 + T, ground && dx === 2 ? doorZ : null, wh);
    const gx1 = makeGaps(r, z0 - T, z1 + T, ground && dx === 3 ? doorZ : null, wh);
    wallPieces(w, 'x', z0, x0 - T, x1 + T, yb, wh, gz0, col, wallKind); wallPieces(w, 'x', z1, x0 - T, x1 + T, yb, wh, gz1, col, wallKind);
    wallPieces(w, 'z', x0, z0 - T, z1 + T, yb, wh, gx0, col, wallKind); wallPieces(w, 'z', x1, z0 - T, z1 + T, yb, wh, gx1, col, wallKind);
    dress('x', z0, -1, gz0, yb, ground); dress('x', z1, 1, gz1, yb, ground); dress('z', x0, -1, gx0, yb, ground); dress('z', x1, 1, gx1, yb, ground);
    if (ground) {
      base('x', z0, -1, x0 - T, x1 + T, dz === 0 ? doorX : null); base('x', z1, 1, x0 - T, x1 + T, dz === 1 ? doorX : null);
      base('z', x0, -1, z0 - T, z1 + T, dx === 2 ? doorZ : null); base('z', x1, 1, z0 - T, z1 + T, dx === 3 ? doorZ : null);
    }
  }

  // dalles (la dernière = toit) avec trou d'escalier ; tranche des dalles en saillie
  for (let k = 1; k <= n; k++) slab(w, x0 - T, z0 - T, x1 + T, z1 + T, k * FH, holes[k - 1], k === n ? trim : col);
  const ry = n * FH;
  for (let k = 1; k < n; k++) {
    const y = k * FH, bandC = style === 'phare' && k % 2 ? 0xb33a30 : trim;
    put('x', z0, -1, x0 - T - 0.1, x1 + T + 0.1, y - SL, y, T, T + 0.1, bandC); put('x', z1, 1, x0 - T - 0.1, x1 + T + 0.1, y - SL, y, T, T + 0.1, bandC);
    put('z', x0, -1, z0 - T, z1 + T, y - SL, y, T, T + 0.1, bandC); put('z', x1, 1, z0 - T, z1 + T, y - SL, y, T, T + 0.1, bandC);
  }
  // pilastres d'angle
  const PH = 1.1, ph = pitched ? 0 : PH;
  for (const [px, pz] of [[x0 - T, z0 - T], [x1 + T, z0 - T], [x0 - T, z1 + T], [x1 + T, z1 + T]]) w.deco(px - 0.32, 0, pz - 0.32, px + 0.32, ry + ph, pz + 0.32, trim, 0);

  // zones à garder libres au niveau f : volée qui monte, arrivée de l'escalier d'en dessous, trémie, devant la porte
  const keepFree = (f) => {
    const rs = [];
    if (f < top) rs.push(laneRect(stairs[f]));
    if (f >= 1) { rs.push(laneRect(stairs[f - 1])); if (holes[f - 1]) rs.push(holes[f - 1]); }
    if (f === 0) {
      rs.push(dz === 0 ? [doorX[0], z0, doorX[1], z0 + 3] : [doorX[0], z1 - 3, doorX[1], z1]);
      rs.push(dx === 2 ? [x0, doorZ[0], x0 + 3, doorZ[1]] : [x1 - 3, doorZ[0], x1, doorZ[1]]);
    }
    return rs;
  };

  // butin : 4 points par niveau (+ centre au rez-de-chaussée), y = dessus de dalle ; jamais au-dessus des trémies ni des escaliers
  const lootPoints = [];
  const lootAt = (f) => {
    const out = [];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + a * sx * 0.25, z = cz + b * sz * 0.25;
      if ((f >= 1 && holes[f - 1] && inR(holes[f - 1], x, z, 0.8)) || (f < top && inR(laneRect(stairs[f]), x, z, 0.8))) continue;
      out.push([x, z, f * FH]);
    }
    if (f === 0) out.push([cx, cz, 0]);
    return out;
  };
  for (let f = 0; f <= top; f++) for (const p of lootAt(f)) lootPoints.push(p);

  // toit : à deux pans + cheminée, ou plat (corniche, parapet, climatiseur, équipements selon le style, mât de tyrolienne)
  let zip = null;
  if (pitched) {
    const h = Math.min(sx, sz) * 0.3 + 0.5;
    w.gable(x0 - T - 0.9, z0 - T - 0.9, x1 + T + 0.9, z1 + T + 0.9, ry, h, roofC, 11);
    const chx = cx + (r() < 0.5 ? -1 : 1) * sx * 0.28, chz = cz + (r() < 0.5 ? -1 : 1) * sz * 0.18;
    w.box(chx - 0.45, ry - 0.05, chz - 0.45, chx + 0.45, ry + h + 1.0, chz + 0.45, 0x7a5a4a, 0);
    w.deco(chx - 0.6, ry + h + 1.0, chz - 0.6, chx + 0.6, ry + h + 1.2, chz + 0.6, 0x4a4f55, 0);
  } else {
    const cn = 0x4a5058, P = 0.15;
    w.deco(x0 - T - 0.2, ry, z0 - T - 0.2, x1 + T + 0.2, ry + 0.12, z0 - T, cn); w.deco(x0 - T - 0.2, ry, z1 + T, x1 + T + 0.2, ry + 0.12, z1 + T + 0.2, cn);
    w.deco(x0 - T - 0.2, ry, z0 - T, x0 - T, ry + 0.12, z1 + T, cn); w.deco(x1 + T, ry, z0 - T, x1 + T + 0.2, ry + 0.12, z1 + T, cn);
    w.box(x0 - T, ry, z0 - T, x1 + T, ry + PH, z0 - T + 2 * P, trim); w.box(x0 - T, ry, z1 + T - 2 * P, x1 + T, ry + PH, z1 + T, trim);
    w.box(x0 - T, ry, z0 - T + 2 * P, x0 - T + 2 * P, ry + PH, z1 + T - 2 * P, trim); w.box(x1 + T - 2 * P, ry, z0 - T + 2 * P, x1 + T, ry + PH, z1 + T - 2 * P, trim);
    w.deco(x0 - T - 0.1, ry + PH, z0 - T - 0.1, x1 + T + 0.1, ry + PH + 0.1, z0 - T + 0.4, cn); w.deco(x0 - T - 0.1, ry + PH, z1 + T - 0.4, x1 + T + 0.1, ry + PH + 0.1, z1 + T + 0.1, cn);
    w.deco(x0 - T - 0.1, ry + PH, z0 - T + 0.4, x0 - T + 0.4, ry + PH + 0.1, z1 + T - 0.4, cn); w.deco(x1 + T - 0.4, ry + PH, z0 - T + 0.4, x1 + T + 0.1, ry + PH + 0.1, z1 + T - 0.4, cn);
    // climatiseur sur le toit, côté opposé à l'escalier d'accès
    const ax = (top - 1) % 2 === 0 ? (dx === 2 ? x0 + 3 : x1 - 3) : (dx === 2 ? x1 - 3 : x0 + 3), az = (top - 1) % 2 === 0 ? cz - sz * 0.2 : (dz === 0 ? z0 + 3 : z1 - 3);
    w.box(ax - 0.9, ry, az - 0.6, ax + 0.9, ry + 1.2, az + 0.6, 0x7a8088, 3);
    w.cyl(ax - 0.35, ry + 1.2, az, 0.38, 0.14, 0x3a3f46, 0); w.cyl(ax + 0.35, ry + 1.2, az, 0.38, 0.14, 0x3a3f46, 0);
    // équipements : créneaux d'angle et de bord, hors trémie / climatiseur / butin
    const roofSlots = [[x0 + 2.4, z0 + 2.4], [x1 - 2.4, z0 + 2.4], [x0 + 2.4, z1 - 2.4], [x1 - 2.4, z1 - 2.4], [cx, z0 + 2.2], [cx, z1 - 2.2], [x0 + 2.2, cz], [x1 - 2.2, cz]];
    const taken = [[ax, az, 2.6], ...lootAt(top).map((p) => [p[0], p[1], 1.8])];
    for (const q of keepFree(top)) taken.push([(q[0] + q[2]) / 2, (q[1] + q[3]) / 2, Math.hypot(q[2] - q[0], q[3] - q[1]) / 2 + 1.2]);
    const free = roofSlots.filter(([x, z]) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr));
    const slot = () => (free.length ? free.splice((r() * free.length) | 0, 1)[0] : null);
    if ((n >= 3 || style === 'phare') && free.length) { // mât d'ancrage de tyrolienne (câble à 3,3 m au-dessus du toit, au-dessus du parapet)
      const s = free.splice(0, 1)[0];
      w.box(s[0] - 0.22, ry, s[1] - 0.22, s[0] + 0.22, ry + 3.6, s[1] + 0.22, 0x5c6874, 0);
      w.deco(s[0] - 0.8, ry + 3.3, s[1] - 0.12, s[0] + 0.8, ry + 3.5, s[1] + 0.12, 0xd8b030, 0);
      zip = [s[0], s[1]];
    }
    if (style === 'phare') { // lanterne : socle, verre, coiffe, rambarde
      w.cyl(cx, ry, cz, 1.9, 0.6, 0xb33a30, 0);
      w.cyl(cx, ry + 0.6, cz, 1.3, 2.0, 0xb8dcee, 8);
      w.shape('cone', 3, cx, ry + 3.35, cz, 3.0, 1.5, 3.0, 0xb33a30);
      w.box(cx - 0.9, ry, cz - 0.9, cx + 0.9, ry + 0.8, cz + 0.9, 0xe9e6dc, 0);
    } else if (style === 'industrial' || style === 'warehouse') {
      for (let k = 0; k < 2; k++) { const s = slot(); if (s) { w.cyl(s[0], ry, s[1], 1.1, 2.4, 0x9aa0a8, 3, true); w.shape('sph', 0, s[0], ry + 2.4, s[1], 2.2, 0.9, 2.2, 0x9aa0a8); } }
      for (let k = 0; k < 3; k++) { const s = slot(); if (s) { w.cyl(s[0], ry, s[1], 0.35, 1.0, 0x6a7078, 3); w.cyl(s[0], ry + 1.0, s[1], 0.5, 0.12, 0x4a4f55, 0); } }
      const s = slot(); if (s) w.box(s[0] - 0.7, ry, s[1] - 0.7, s[0] + 0.7, ry + 3.2, s[1] + 0.7, 0x7a5a4a, 0);
    } else if (style === 'military') {
      const s = slot();
      if (s) { // antenne + parabole
        w.beam(s[0], ry, s[1], s[0], ry + 7.5, s[1], 0.06, 0x30343a);
        w.beam(s[0] - 0.9, ry + 6.2, s[1], s[0] + 0.9, ry + 6.2, s[1], 0.04, 0x30343a);
        w.shape('sph', 0, s[0] + 0.5, ry + 4.4, s[1] + 0.3, 1.5, 0.35, 1.5, 0xd0d4d8);
        w.box(s[0] - 0.25, ry, s[1] - 0.25, s[0] + 0.25, ry + 0.9, s[1] + 0.25, 0x4a5040, 0);
      }
      for (let k = 0; k < 2; k++) { const t = slot(); if (t) w.box(t[0] - 0.6, ry, t[1] - 0.6, t[0] + 0.6, ry + 0.9, t[1] + 0.6, 0x5a6048, 1); }
    } else {
      const s = slot();
      if (s) { // réservoir sur pieds
        for (const [a, b] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) w.deco(s[0] + a - 0.07, ry, s[1] + b - 0.07, s[0] + a + 0.07, ry + 1.2, s[1] + b + 0.07, 0x4a4f55, 0);
        w.cyl(s[0], ry + 1.2, s[1], 1.0, 1.6, 0x8a6f58, 1, true);
        w.shape('cone', 3, s[0], ry + 3.35, s[1], 2.2, 0.7, 2.2, 0x5f4a40);
      }
      for (let k = 0; k < 2; k++) { const t = slot(); if (t) w.cyl(t[0], ry, t[1], 0.3, 0.8, 0x7a8088, 3); }
      const sk = slot();
      if (sk) { w.deco(sk[0] - 0.9, ry, sk[1] - 0.6, sk[0] + 0.9, ry + 0.25, sk[1] + 0.6, 0x6a7078, 0); w.deco(sk[0] - 0.75, ry + 0.25, sk[1] - 0.45, sk[0] + 0.75, ry + 0.32, sk[1] + 0.45, 0x9fc3d6, 8); }
    }
  }
  if (style === 'military') { // mât à drapeau devant l'angle sud-est
    const px = x1 + T + 1.2, pz = z1 + T + 1.2;
    w.cyl(px, 0, pz, 0.08, 7, 0xc8ccd0, 0);
    w.deco(px, 6.0, pz - 0.02, px + 1.4, 6.9, pz + 0.02, 0x3a5a8a, 1);
  }

  // mobilier : par niveau, quelques pièces le long des murs ou au centre, hors des zones libres et du butin
  const ITEMS = {
    house: ['sofa', 'table', 'shelf', 'shelf', 'bed'], farm: ['table', 'shelf', 'bed', 'crates'], default: ['table', 'shelf', 'counter', 'sofa', 'bed'],
    industrial: ['counter', 'crates', 'crates', 'shelf'], warehouse: ['crates', 'crates', 'shelf', 'crates'], military: ['shelf', 'table', 'counter', 'crates', 'bed'],
    ruin: ['crates', 'table'], phare: ['table', 'shelf'],
  }[style] || ['table', 'shelf'];
  for (let f = 0; f <= top; f++) {
    if (f === n) continue; // le toit est équipé plus haut
    const yb = f * FH, avoid = keepFree(f), lp = lootAt(f), cands = [];
    for (let u = x0 + 2.6; u < x1 - 2.6; u += 3.4) cands.push([u, z0 + 0.95, 1], [u, z1 - 0.95, 1]);
    for (let v = z0 + 2.6; v < z1 - 2.6; v += 3.4) cands.push([x0 + 0.95, v, 0], [x1 - 0.95, v, 0]);
    cands.push([cx - sx * 0.08, cz - sz * 0.05, 1], [cx + sx * 0.1, cz + sz * 0.12, 0]);
    for (let i = cands.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const placed = [];
    let want = 3 + ((r() * 3) | 0);
    for (const [x, z, alongX] of cands) {
      if (want <= 0) break;
      if (avoid.some((q) => inR(q, x, z, 1.3)) || lp.some((p) => Math.hypot(p[0] - x, p[1] - z) < 1.9) || placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.6)) continue;
      placed.push([x, z]); want--;
      const type = ITEMS[(r() * ITEMS.length) | 0], wc = WOOD[(r() * WOOD.length) | 0], cl = CLOTH[(r() * CLOTH.length) | 0];
      const hx = alongX ? 1.0 : 0.5, hz = alongX ? 0.5 : 1.0;
      if (type === 'shelf') { const a = alongX ? 1.0 : 0.25, b = alongX ? 0.25 : 1.0; w.box(x - a, yb, z - b, x + a, yb + 2.0, z + b, 0x6e5238, 1); }
      else if (type === 'table') {
        const a = alongX ? 0.85 : 0.5, b = alongX ? 0.5 : 0.85;
        w.box(x - a, yb, z - b, x + a, yb + 0.78, z + b, wc, 1);
        if (alongX) { w.deco(x - a - 0.5, yb, z - 0.25, x - a - 0.1, yb + 0.45, z + 0.25, 0x6e5238, 1); w.deco(x + a + 0.1, yb, z - 0.25, x + a + 0.5, yb + 0.45, z + 0.25, 0x6e5238, 1); }
        else { w.deco(x - 0.25, yb, z - b - 0.5, x + 0.25, yb + 0.45, z - b - 0.1, 0x6e5238, 1); w.deco(x - 0.25, yb, z + b + 0.1, x + 0.25, yb + 0.45, z + b + 0.5, 0x6e5238, 1); }
      } else if (type === 'sofa') {
        w.box(x - hx, yb, z - hz, x + hx, yb + 0.5, z + hz, cl, 1);
        if (alongX) w.deco(x - hx, yb + 0.5, z - hz, x + hx, yb + 0.95, z - hz + 0.25, cl, 1); else w.deco(x - hx, yb + 0.5, z - hz, x - hx + 0.25, yb + 0.95, z + hz, cl, 1);
      } else if (type === 'bed') { w.box(x - hx, yb, z - hz, x + hx, yb + 0.5, z + hz, 0x8a8f96, 0); w.deco(x - hx + 0.05, yb + 0.5, z - hz + 0.05, x + hx - 0.05, yb + 0.68, z + hz - 0.05, cl, 1); }
      else if (type === 'counter') w.box(x - (alongX ? 1.2 : 0.4), yb, z - (alongX ? 0.4 : 1.2), x + (alongX ? 1.2 : 0.4), yb + 1.0, z + (alongX ? 0.4 : 1.2), 0x8d9095, 0);
      else { // caisses empilées
        w.box(x - 0.55, yb, z - 0.55, x + 0.55, yb + 1.1, z + 0.55, wc, 1);
        if (r() < 0.6) w.box(x - 0.45, yb + 1.1, z - 0.45, x + 0.45, yb + 1.9, z + 0.45, WOOD[(r() * WOOD.length) | 0], 1);
      }
    }
    // piliers des grands volumes (rez-de-chaussée)
    if (f === 0 && (style === 'industrial' || style === 'warehouse' || style === 'military') && sx >= 22 && sz >= 20) {
      for (const [a, b] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const px = cx + a * sx, pz = cz + b * sz;
        if (avoid.some((q) => inR(q, px, pz, 1.2)) || lp.some((p) => Math.hypot(p[0] - px, p[1] - pz) < 1.6)) continue;
        w.box(px - 0.3, 0, pz - 0.3, px + 0.3, wh, pz + 0.3, trim, 0);
      }
    }
  }
  return { lootPoints, solid: [x0 - T, z0 - T, x1 + T, z1 + T], roof: ry, stairs, top, zip, pitched };
}
