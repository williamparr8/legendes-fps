import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildWeaponModel } from './models.js';
import wdefs from './weapons.json';
import legends from '../legends/legends.json';

// Silhouette humanoïde procédurale low-poly (face = -Z, origine aux pieds, ~1,82 m), articulée :
// bassin → cuisses/genoux, buste → tête, épaules/bras → arme tenue à deux mains.
// Géométries statiques fusionnées par articulation (couleurs par sommet) ; matériaux d'équipe/accent partagés.
// Hitboxes (target.js zoneRay, échelle hs) : tête sphère r 0,2 à y 1,62 ; torse y 0,8–1,45 ; jambes y 0–0,8.
// Poses : debout hs 1 · accroupi/glissade hs 1/1,8 (comme le joueur) · à terre (genoux) hs 0,5.
export const WIDS = Object.keys(wdefs);
export const LEGS = Object.keys(legends);
export const CROUCH_HS = 1.0 / 1.8;

// Apparence transmise par le réseau : arme (3 bits) | posture (2) | rechargement (1) | compteur de tirs (4) | légende (3).
export const packInfo = (a, legend) =>
  (WIDS.indexOf(a.wid) + 1) | ((a.stance || 0) << 3) | ((a.reloading ? 1 : 0) << 5) | ((a.shots & 15) << 6) | ((LEGS.indexOf(legend) + 1) << 10);

const C = new THREE.Color();
function paint(g, c) {
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

const PANTS = 0x2a2e36, DARK = 0x1c1f25, VEST = 0x30353d, SKIN = 0xe0bc98;
const G = {
  thigh: mergeGeometries([bx(0.2, 0.44, 0.22, PANTS, 0, -0.21, 0), bx(0.17, 0.09, 0.04, DARK, 0, -0.4, -0.12)]),
  shin: mergeGeometries([bx(0.17, 0.34, 0.19, PANTS, 0, -0.17, 0), bx(0.2, 0.1, 0.3, DARK, 0, -0.37, -0.05)]),
  body: mergeGeometries([
    bx(0.44, 0.1, 0.28, DARK, 0, 0.04, 0), bx(0.4, 0.34, 0.06, VEST, 0, 0.33, -0.17),
    bx(0.09, 0.1, 0.05, DARK, -0.13, 0.2, -0.2), bx(0.09, 0.1, 0.05, DARK, 0, 0.2, -0.2), bx(0.09, 0.1, 0.05, DARK, 0.13, 0.2, -0.2),
    bx(0.34, 0.4, 0.14, DARK, 0, 0.32, 0.21), bx(0.1, 0.1, 0.1, SKIN, 0, 0.62, 0),
  ]),
  torso: pb(0.46, 0.58, 0.3, 0, 0.3, 0),
  trim: mergeGeometries([pb(0.08, 0.3, 0.02, 0, 0.33, -0.205), pb(0.14, 0.05, 0.22, -0.27, 0.58, 0), pb(0.14, 0.05, 0.22, 0.27, 0.58, 0)]),
  head: new THREE.SphereGeometry(0.17, 10, 8),
  helmet: new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.02, 0),
  visor: mergeGeometries([pb(0.22, 0.05, 0.05, 0, 0.01, -0.15), pb(0.03, 0.03, 0.3, 0, 0.21, 0)]),
  sleeve: new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, -0.5, 0),
  hand: new THREE.BoxGeometry(0.1, 0.1, 0.1),
  flash: new THREE.BoxGeometry(0.07, 0.07, 0.14),
};
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const M = {
  friend: lam(0x4080e0), enemy: lam(0xd04040), skin: lam(SKIN), dark: lam(DARK),
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }), flash: new THREE.MeshBasicMaterial({ color: 0xffd070 }),
};
const accents = new Map();
const accentMat = hex => {
  let m = accents.get(hex);
  if (!m) accents.set(hex, m = new THREE.MeshBasicMaterial({ color: hex }));
  return m;
};
const NEUTRAL = 0xffffff;

// Armes tenues : un seul maillage fusionné par arme (couleurs par sommet), partagé. { geo, ud : muzzle/grip/fore }.
const WS = 0.9, WG = new Map();
function weaponGeo(id) {
  let w = WG.get(id);
  if (w) return w;
  const src = buildWeaponModel(id), parts = [];
  src.updateMatrixWorld(true);
  src.traverse(o => { if (o.isMesh) parts.push(paint(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material.color)); });
  WG.set(id, w = { geo: mergeGeometries(parts), ud: src.userData });
  return w;
}

// Poses cibles : hauteur du bassin, décalage z, cuisse, genou, inclinaison du buste (− = vers l'avant).
const POSES = [
  [0.84, 0, 0, 0, 0],            // debout
  [0.38, 0.12, 1.5, -2.1, -0.45], // accroupi
  [0.22, -0.05, 1.45, -0.15, 0.55], // glissade (assis, jambes devant)
  [0.45, 0.35, 0.15, -1.75, -0.85], // à terre (à genoux, penché)
];
const DOWN = new THREE.Vector3(0, -1, 0), _v = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Rig {
  constructor(group, friendly) {
    if (!WG.size) for (const id of WIDS) weaponGeo(id);
    const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
    const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
    const team = friendly ? M.friend : M.enemy;
    this.team = [];
    this.pelvis = joint(group, 0, 0.84, 0);
    this.thigh = []; this.shin = [];
    for (const sx of [-0.12, 0.12]) {
      const t = joint(this.pelvis, sx, 0, 0), s = joint(t, 0, -0.42, 0);
      mesh(G.thigh, M.vc, t); mesh(G.shin, M.vc, s);
      this.thigh.push(t); this.shin.push(s);
    }
    this.spine = joint(this.pelvis, 0, 0, 0);
    mesh(G.body, M.vc, this.spine);
    this.team.push(mesh(G.torso, team, this.spine));
    this.trim = mesh(G.trim, accentMat(NEUTRAL), this.spine);
    this.head = joint(this.spine, 0, 0.78, 0);
    mesh(G.head, M.skin, this.head);
    this.team.push(mesh(G.helmet, team, this.head));
    this.visor = mesh(G.visor, accentMat(NEUTRAL), this.head);
    // épaules, bras (un segment étiré jusqu'à la main) et arme : tournent avec la visée
    this.aim = joint(this.spine, 0, 0.54, 0);
    this.arms = [];
    for (const sx of [-0.29, 0.29]) {
      const g = joint(this.aim, sx, 0, 0), sleeve = mesh(G.sleeve, team, g), hand = mesh(G.hand, M.dark, g);
      this.team.push(sleeve);
      this.arms.push({ g, sleeve, hand, sx });
    }
    this.wp = joint(this.aim, 0.1, -0.02, -0.2);
    this.wmesh = mesh(WG.get(WIDS[0]).geo, M.vc, this.wp); this.wmesh.scale.setScalar(WS);
    this.flash = mesh(G.flash, M.flash, this.wp); this.flash.visible = false;
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
    const w = id ? WG.get(id) : null;
    this.ud = w ? w.ud : null;
    if (w) this.wmesh.geometry = w.geo;
  }

  // Bras : épaule (sx,0,0) → main (tx,ty,tz), dans l'espace de la visée.
  reach(arm, tx, ty, tz) {
    const dx = tx - arm.sx, l = Math.hypot(dx, ty, tz) || 1;
    arm.g.quaternion.setFromUnitVectors(DOWN, _v.set(dx / l, ty / l, tz / l));
    arm.sleeve.scale.y = l; arm.hand.position.y = -l;
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
    const armed = !!this.ud && !dn, ar = this.arms;
    this.wmesh.visible = armed;
    const sc = a.shots & 15;
    if (sc !== this.sc) { this.sc = sc; this.kick = 1; }
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 9);
    this.rl += ((armed && a.reloading ? 1 : 0) - this.rl) * Math.min(1, dt * 10);
    this.rph += dt * 6;
    this.aim.rotation.x = armed ? clamp(pitch, -0.8, 0.8) - lean : 0;
    if (!armed) {
      this.flash.visible = false;
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
