import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergedWeapon } from './models.js';
import wdefs from './weapons.json';
import legends from '../legends/legends.json';

// Silhouette d'opérateur tactique procédurale (face = -Z, origine aux pieds, ~1,82 m), articulée :
// bassin → cuisses/genoux, buste → tête, épaules → bras à deux segments (cinématique inverse) → arme tenue à deux mains.
// Géométries statiques fusionnées par articulation (couleurs par sommet, plaques biseautées) ; matériaux d'équipe/accent partagés.
// Hitboxes (target.js zoneRay, échelle hs) : tête sphère r 0,2 à y 1,62 ; torse y 0,8–1,45 ; jambes y 0–0,8.
// Poses : debout hs 1 · accroupi/glissade hs 1/1,8 (comme le joueur) · à terre (genoux) hs 0,5.
export const WIDS = Object.keys(wdefs);
export const LEGS = Object.keys(legends);
export const CROUCH_HS = 1.0 / 1.8;

// Apparence transmise par le réseau : arme (3 bits) | posture (3 : 0-2 au sol, 4 vaisseau, 5 chute libre, 6 parachute) | rechargement (1) | compteur de tirs (4) | légende (3).
export const packInfo = (a, legend) =>
  (WIDS.indexOf(a.wid) + 1) | ((a.stance || 0) << 3) | ((a.reloading ? 1 : 0) << 6) | ((a.shots & 15) << 7) | ((LEGS.indexOf(legend) + 1) << 11);

const C = new THREE.Color();
// Peint une géométrie d'une couleur par sommet (non indexée : boîtes, cylindres et extrusions fusionnent sans conflit).
function paint(g, c) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// Boîte colorée par sommet (largeur, hauteur, profondeur, couleur, position).
const bx = (w, h, d, hex, x, y, z) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), C.set(hex));
// Boîte unie (matériau d'accent/équipe).
const pb = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// Cylindre vertical coloré (rayons haut/bas, hauteur).
const cy = (r1, r2, h, hex, x, y, z, seg = 8) => paint(new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y, z), C.set(hex));
// Cylindre ovale (buste/ceinture) : faces plates devant/derrière, aplati en profondeur.
const ov = (r1, r2, h, hex, x, y, z, sz = 0.7) => paint(new THREE.CylinderGeometry(r1, r2, h, 8).rotateY(Math.PI / 8).scale(1, 1, sz).translate(x, y, z), C.set(hex));
const sp = (r, hex, x, y, z) => paint(new THREE.SphereGeometry(r, 7, 5).translate(x, y, z), C.set(hex));
// Plaque biseautée : profil [[x, y], …] extrudé sur l'épaisseur d, centrée en (x, y, z).
function pl(pts, d, hex, x, y, z, bev = 0.012) {
  const s = new THREE.Shape(), t = d - 2 * bev;
  pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  return paint(new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 }).translate(x, y, z - t / 2), C.set(hex));
}

const PANTS = 0x2a2e36, DARK = 0x1c1f25, VEST = 0x30353d, SKIN = 0xe0bc98, BOOT = 0x15171b, PAD = 0x3b414b, PACK = 0x2a2f2a, GLOVE = 0x23262c, GLOVE2 = 0x1a1c21;
const L1 = 0.33, L2 = 0.32; // bras : épaule → coude, coude → main
const thighGeo = (s) => mergeGeometries([
  cy(0.095, 0.07, 0.44, PANTS, 0, -0.21, 0), sp(0.09, PANTS, 0, 0, 0), bx(0.035, 0.14, 0.12, PAD, s * 0.1, -0.19, 0), bx(0.04, 0.03, 0.12, DARK, s * 0.1, -0.1, 0),
]);
const G = {
  thigh: [thighGeo(-1), thighGeo(1)],
  shin: mergeGeometries([
    cy(0.066, 0.05, 0.4, PANTS, 0, -0.2, 0), sp(0.07, PANTS, 0, 0, 0), pl([[-0.06, 0.04], [0.06, 0.04], [0.055, -0.07], [-0.055, -0.07]], 0.04, PAD, 0, 0, -0.085, 0.008),
    cy(0.062, 0.058, 0.1, BOOT, 0, -0.36, 0), bx(0.125, 0.07, 0.29, BOOT, 0, -0.385, -0.06), bx(0.12, 0.045, 0.07, PAD, 0, -0.39, -0.19),
    bx(0.135, 0.025, 0.3, DARK, 0, -0.4075, -0.055),
  ]),
  body: mergeGeometries([
    ov(0.24, 0.24, 0.08, DARK, 0, 0.04, 0), bx(0.09, 0.1, 0.05, DARK, -0.13, 0.2, -0.2), bx(0.09, 0.1, 0.05, DARK, 0, 0.2, -0.2), bx(0.09, 0.1, 0.05, DARK, 0.13, 0.2, -0.2),
    pl([[-0.18, 0], [0.18, 0], [0.2, 0.28], [0.13, 0.4], [-0.13, 0.4], [-0.2, 0.28]], 0.05, VEST, 0, 0.1, -0.165),
    pl([[-0.18, 0], [0.18, 0], [0.2, 0.28], [0.13, 0.4], [-0.13, 0.4], [-0.2, 0.28]], 0.04, VEST, 0, 0.1, 0.165),
    pl([[-0.15, 0], [0.15, 0], [0.16, 0.36], [0.1, 0.42], [-0.1, 0.42], [-0.16, 0.36]], 0.14, PACK, 0, 0.12, 0.26, 0.02), bx(0.3, 0.08, 0.09, PAD, 0, 0.58, 0.27),
    cy(0.058, 0.065, 0.1, DARK, 0, 0.64, 0),
  ]),
  torso: new THREE.CylinderGeometry(0.235, 0.19, 0.58, 8).rotateY(Math.PI / 8).scale(1, 1, 0.68).translate(0, 0.3, 0),
  trim: mergeGeometries([
    pb(0.08, 0.3, 0.02, 0, 0.33, -0.205),
    new THREE.SphereGeometry(0.105, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.7, 1.2).translate(-0.285, 0.58, 0),
    new THREE.SphereGeometry(0.105, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.7, 1.2).translate(0.285, 0.58, 0),
  ]),
  // tête : peau + cagoule sur le bas du visage + écouteurs (un seul maillage)
  head: mergeGeometries([
    paint(new THREE.SphereGeometry(0.16, 10, 8).scale(0.92, 1.08, 1), C.set(SKIN)),
    paint(new THREE.SphereGeometry(0.168, 10, 5, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48).scale(0.95, 1.08, 1.03), C.set(DARK)),
    paint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8).rotateZ(Math.PI / 2).translate(-0.175, -0.02, 0.02), C.set(DARK)),
    paint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8).rotateZ(Math.PI / 2).translate(0.175, -0.02, 0.02), C.set(DARK)),
  ]),
  helmet: new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.02, 0),
  visor: mergeGeometries([new THREE.CylinderGeometry(0.193, 0.193, 0.065, 10, 1, true, Math.PI - 0.95, 1.9), pb(0.03, 0.03, 0.3, 0, 0.21, 0)]),
  uarm: new THREE.CylinderGeometry(0.056, 0.046, L1, 7).translate(0, -L1 / 2, 0),
  // avant-bras + coude + gant (paume, doigts repliés), un seul maillage
  farm: mergeGeometries([
    cy(0.047, 0.037, L2, DARK, 0, -L2 / 2, 0, 7), sp(0.05, DARK, 0, 0, 0),
    bx(0.085, 0.09, 0.055, GLOVE, 0, -L2 - 0.03, 0), bx(0.085, 0.05, 0.065, GLOVE2, 0, -L2 - 0.1, -0.005), bx(0.07, 0.03, 0.02, PAD, 0, -L2 - 0.04, -0.035),
  ]),
  flash: new THREE.BoxGeometry(0.07, 0.07, 0.14),
  canopy: new THREE.SphereGeometry(1.6, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.5, 0.9, 1.5),
  cords: (() => { // suspentes : 8 points du bord de la voile vers les épaules
    const p = [];
    for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; p.push(Math.cos(t) * 2.38, 3.1, Math.sin(t) * 2.38, i % 2 ? 0.29 : -0.29, 1.4, 0); }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  })(),
};
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const M = {
  friend: lam(0x4080e0), enemy: lam(0xd04040), dark: lam(DARK),
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }), canopy: new THREE.MeshLambertMaterial({ color: 0xf08a30, side: THREE.DoubleSide }), flash: new THREE.MeshBasicMaterial({ color: 0xffd070 }),
  wpn: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 45, specular: 0x333333 }), cord: new THREE.LineBasicMaterial({ color: 0xe6e6e6 }),
};
const accents = new Map();
const accentMat = hex => {
  let m = accents.get(hex);
  if (!m) accents.set(hex, m = new THREE.MeshBasicMaterial({ color: hex }));
  return m;
};
const NEUTRAL = 0xffffff;

// Armes tenues : un seul maillage fusionné par arme (couleurs par sommet), partagé. { geo, ud : muzzle/grip/fore }.
const WS = 0.9;

// Poses cibles : hauteur du bassin, décalage z, cuisse, genou, inclinaison du buste (− = vers l'avant).
const POSES = [
  [0.84, 0, 0, 0, 0],            // debout
  [0.38, 0.12, 1.5, -2.1, -0.45], // accroupi
  [0.22, -0.05, 1.45, -0.15, 0.55], // glissade (assis, jambes devant)
  [0.45, 0.35, 0.15, -1.75, -0.85], // à terre (à genoux, penché)
  [0.84, 0, 0, 0, 0],            // vaisseau (invisible)
  [0.84, 0, -1.25, -0.2, -1.4],  // chute libre (à plat ventre, bras écartés)
  [0.84, 0, 0.1, -0.1, 0],       // parachute (bras en l'air)
];
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Rig {
  constructor(group, friendly) {
    const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
    const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
    const team = friendly ? M.friend : M.enemy;
    this.team = [];
    this.pelvis = joint(group, 0, 0.84, 0);
    this.thigh = []; this.shin = [];
    for (const sx of [-0.12, 0.12]) {
      const t = joint(this.pelvis, sx, 0, 0), s = joint(t, 0, -0.42, 0);
      mesh(G.thigh[sx > 0 ? 1 : 0], M.vc, t); mesh(G.shin, M.vc, s);
      this.thigh.push(t); this.shin.push(s);
    }
    this.spine = joint(this.pelvis, 0, 0, 0);
    mesh(G.body, M.vc, this.spine);
    this.team.push(mesh(G.torso, team, this.spine));
    this.trim = mesh(G.trim, accentMat(NEUTRAL), this.spine);
    this.head = joint(this.spine, 0, 0.78, 0);
    mesh(G.head, M.vc, this.head);
    this.team.push(mesh(G.helmet, team, this.head));
    this.visor = mesh(G.visor, accentMat(NEUTRAL), this.head);
    // épaules, bras (deux segments + main) et arme : tournent avec la visée
    this.aim = joint(this.spine, 0, 0.54, 0);
    this.arms = [];
    for (const sx of [-0.29, 0.29]) {
      const g = joint(this.aim, sx, 0, 0), up = mesh(G.uarm, team, g), el = joint(g, 0, -L1, 0), fa = mesh(G.farm, M.vc, el);
      this.team.push(up);
      this.arms.push({ g, el, up, fa, sx });
    }
    this.wp = joint(this.aim, 0.1, -0.02, -0.2);
    this.wmesh = mesh(mergedWeapon(WIDS[0]).geo, M.wpn, this.wp); this.wmesh.scale.setScalar(WS);
    this.flash = mesh(G.flash, M.flash, this.wp); this.flash.visible = false;
    this.canopy = mesh(G.canopy, M.canopy, group, 0, 3.1, 0); this.canopy.visible = false;
    this.cords = new THREE.LineSegments(G.cords, M.cord); this.cords.visible = false; group.add(this.cords);
    this.wmesh.visible = false;
    this.wid = undefined; this.ud = null;
    this.p = [0.84, 0, 0, 0, 0];
    this.phase = 0; this.speed = 0; this.lx = 0; this.lz = 0; this.init = false;
    this.kick = 0; this.sc = 0; this.rl = 0; this.rph = 0;
  }

  setFriendly(f) { const m = f ? M.friend : M.enemy; for (const o of this.team) o.material = m; }

  // Couleur d'accent (légende) : visière, crête du casque, bande de poitrine, épaulettes.
  setAccent(hex) {
    const m = accentMat(typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex);
    this.visor.material = m; this.trim.material = m;
  }

  setWeapon(id) {
    this.wid = id;
    const w = id ? mergedWeapon(id) : null;
    this.ud = w ? w.ud : null;
    if (w) this.wmesh.geometry = w.geo;
  }

  // Bras à deux segments : épaule (sx,0,0) → main (tx,ty,tz), dans l'espace de la visée. Le coude plie vers le bas et l'extérieur ;
  // hors de portée, les segments s'étirent (≤ quelques cm) pour que la main reste sur l'arme.
  reach(arm, tx, ty, tz) {
    const sx = arm.sx;
    _d.set(tx - sx, ty, tz);
    const d0 = _d.length() || 1e-3, s = Math.max(1, d0 / ((L1 + L2) * 0.985)), l1 = L1 * s, l2 = L2 * s, d = Math.max(0.05, d0);
    _d.multiplyScalar(1 / d0);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _p.set(sx > 0 ? 0.55 : -0.55, -1, 0.35);
    _p.addScaledVector(_d, -_p.dot(_d));
    if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1);
    _p.normalize();
    _e.copy(_d).multiplyScalar(a).addScaledVector(_p, h);
    arm.g.quaternion.setFromUnitVectors(DOWN, _f.copy(_e).normalize());
    _f.set(tx - sx, ty, tz).sub(_e).normalize().applyQuaternion(_q.copy(arm.g.quaternion).invert());
    arm.el.quaternion.setFromUnitVectors(DOWN, _f);
    arm.up.scale.y = arm.fa.scale.y = s; arm.el.position.y = -l1;
  }

  // Posture, marche déduite du déplacement réel, arme/recul/rechargement. `a` : acteur (health, stance, wid, reloading, shots, pitch).
  animate(dt, x, z, a) {
    if (!this.init) { this.init = true; this.lx = x; this.lz = z; this.sc = a.shots & 15; }
    let sp = dt > 0 ? Math.hypot(x - this.lx, z - this.lz) / dt : 0;
    this.lx = x; this.lz = z;
    if (sp > 14) sp = 0; // téléportation / réapparition
    this.speed += (sp - this.speed) * Math.min(1, dt * 10);
    const s = this.speed, dn = a.health.downed, st = dn ? 3 : a.stance || 0;
    // pose cible → lissage
    const T = POSES[st], p = this.p, k = Math.min(1, dt * 14);
    for (let i = 0; i < 5; i++) p[i] += (T[i] - p[i]) * k;
    const move = st === 0 ? 1 : st === 1 ? 0.4 : 0;
    this.phase += dt * (3 + s * 1.1);
    const amp = Math.min(0.85, s * 0.16) * move, sw = Math.sin(this.phase) * amp;
    const bob = move === 1 ? Math.abs(Math.sin(this.phase)) * Math.min(0.05, s * 0.01) : 0;
    this.pelvis.position.set(0, p[0] + bob, p[1]);
    this.thigh[0].rotation.x = p[2] + sw; this.thigh[1].rotation.x = p[2] - sw;
    this.shin[0].rotation.x = p[3] - Math.max(0, -sw) - amp * 0.12; this.shin[1].rotation.x = p[3] - Math.max(0, sw) - amp * 0.12;
    const lean = p[4] - Math.min(s * 0.012, 0.1) * move;
    this.spine.rotation.x = lean;
    const pitch = clamp(a.pitch || 0, -0.9, 0.9);
    this.head.rotation.x = pitch - lean * 0.6;
    // arme
    if (a.wid !== this.wid) this.setWeapon(a.wid);
    this.canopy.visible = this.cords.visible = st === 6;
    const armed = !!this.ud && !dn && st < 4, ar = this.arms;
    this.wmesh.visible = armed;
    const sc = a.shots & 15;
    if (sc !== this.sc) { this.sc = sc; this.kick = 1; }
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 9);
    this.rl += ((armed && a.reloading ? 1 : 0) - this.rl) * Math.min(1, dt * 10);
    this.rph += dt * 6;
    this.aim.rotation.x = armed ? clamp(pitch, -0.8, 0.8) - lean : 0;
    if (!armed) {
      this.flash.visible = false;
      if (st >= 5) { const sp = st === 6 ? 0.8 : 2.2, up = st === 6 ? 0.6 : 0.5, fz = st === 6 ? 0 : -0.1; this.reach(ar[0], -0.29 * sp, up, fz); this.reach(ar[1], 0.29 * sp, up, fz); return; }
      const hang = dn ? -0.3 : 0;
      this.reach(ar[0], -0.3, -0.56, hang); this.reach(ar[1], 0.3, -0.56, hang);
      return;
    }
    const rx = this.rl * 0.55 + this.kick * 0.07, cx = Math.cos(rx), sx = Math.sin(rx), u = this.ud;
    const wy = -0.02 - this.rl * 0.1, wz = -0.2 + this.kick * 0.06 + this.rl * 0.05;
    this.wp.position.set(0.1, wy, wz); this.wp.rotation.x = rx;
    // main arrière sur la poignée ; main avant sur le garde-main, ou au chargeur pendant le rechargement
    const gy = u.grip[0] * WS, gz = u.grip[1] * WS;
    this.reach(ar[1], 0.1, wy + gy * cx - gz * sx, wz + gy * sx + gz * cx);
    if (this.rl > 0.5) this.reach(ar[0], 0.02, -0.3 + Math.sin(this.rph) * 0.04, -0.1);
    else { const fy = u.fore[0] * WS, fz = u.fore[1] * WS; this.reach(ar[0], 0.09, wy + fy * cx - fz * sx, wz + fy * sx + fz * cx); }
    this.flash.visible = this.kick > 0.65;
    if (this.flash.visible) this.flash.position.set(0, 0.01, (u.muzzle - 0.06) * WS);
  }
}
