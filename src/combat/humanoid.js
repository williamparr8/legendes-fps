import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergedWeapon, skinnedWeapon } from './models.js';
import skinData from '../shop/skins.json';
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

// Apparence transmise par le réseau : arme (3 bits) | posture (3 : 0-2 au sol, 4 vaisseau, 5 chute libre, 6 parachute) | rechargement (1) | compteur de tirs (4) | légende (3)
// | skin de personnage (4, <<14) | skin d'arme (4, <<18) ; les skins sont des indices + 1 dans skins.json (0 = défaut).
export const packInfo = (a, legend) =>
  (WIDS.indexOf(a.wid) + 1) | ((a.stance || 0) << 3) | ((a.reloading ? 1 : 0) << 6) | ((a.shots & 15) << 7) | ((LEGS.indexOf(legend) + 1) << 11)
  | (((a.skinP | 0) & 15) << 14) | (((a.skinW | 0) & 15) << 18);

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
const cy = (r1, r2, h, hex, x, y, z, seg = 10) => paint(new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y, z), C.set(hex));
// Cylindre ovale (buste/ceinture) : faces plates devant/derrière, aplati en profondeur.
const ov = (r1, r2, h, hex, x, y, z, sz = 0.7) => paint(new THREE.CylinderGeometry(r1, r2, h, 12).rotateY(Math.PI / 12).scale(1, 1, sz).translate(x, y, z), C.set(hex));
const sp = (r, hex, x, y, z) => paint(new THREE.SphereGeometry(r, 10, 7).translate(x, y, z), C.set(hex));
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
  bx(0.09, 0.14, 0.1, PACK, s * 0.075, -0.17, -0.1), bx(0.1, 0.02, 0.1, PAD, s * 0.075, -0.1, -0.1), // poche cargo
  ...(s > 0 ? [bx(0.05, 0.2, 0.09, DARK, 0.125, -0.24, 0.02), bx(0.05, 0.03, 0.09, PAD, 0.125, -0.13, 0.02)] : []), // étui à la cuisse droite
]);
const G = {
  thigh: [thighGeo(-1), thighGeo(1)],
  shin: mergeGeometries([
    cy(0.066, 0.05, 0.4, PANTS, 0, -0.2, 0), sp(0.07, PANTS, 0, 0, 0), pl([[-0.06, 0.04], [0.06, 0.04], [0.055, -0.07], [-0.055, -0.07]], 0.04, PAD, 0, 0, -0.085, 0.008),
    cy(0.062, 0.058, 0.1, BOOT, 0, -0.36, 0), bx(0.125, 0.07, 0.29, BOOT, 0, -0.385, -0.06), bx(0.12, 0.045, 0.07, PAD, 0, -0.39, -0.19),
    bx(0.135, 0.025, 0.3, DARK, 0, -0.4075, -0.055), bx(0.06, 0.016, 0.13, PAD, 0, -0.345, -0.05), bx(0.06, 0.016, 0.1, PAD, 0, -0.375, -0.1), // lacets
    cy(0.07, 0.07, 0.025, DARK, 0, -0.31, 0, 10), // haut de botte
  ]),
  body: mergeGeometries([
    ov(0.24, 0.24, 0.08, DARK, 0, 0.04, 0), bx(0.09, 0.1, 0.05, DARK, -0.13, 0.2, -0.2), bx(0.09, 0.1, 0.05, DARK, 0, 0.2, -0.2), bx(0.09, 0.1, 0.05, DARK, 0.13, 0.2, -0.2),
    pl([[-0.18, 0], [0.18, 0], [0.2, 0.28], [0.13, 0.4], [-0.13, 0.4], [-0.2, 0.28]], 0.05, VEST, 0, 0.1, -0.165),
    pl([[-0.18, 0], [0.18, 0], [0.2, 0.28], [0.13, 0.4], [-0.13, 0.4], [-0.2, 0.28]], 0.04, VEST, 0, 0.1, 0.165),
    pl([[-0.15, 0], [0.15, 0], [0.16, 0.36], [0.1, 0.42], [-0.1, 0.42], [-0.16, 0.36]], 0.14, PACK, 0, 0.12, 0.26, 0.02), bx(0.3, 0.08, 0.09, PAD, 0, 0.58, 0.27),
    cy(0.058, 0.065, 0.1, DARK, 0, 0.64, 0),
    bx(0.1, 0.14, 0.06, PACK, -0.235, 0.06, -0.02), bx(0.1, 0.14, 0.06, PACK, 0.235, 0.06, -0.02), bx(0.1, 0.02, 0.07, PAD, -0.235, 0.13, -0.02), bx(0.1, 0.02, 0.07, PAD, 0.235, 0.13, -0.02), // sacoches de ceinture
    bx(0.05, 0.12, 0.04, DARK, -0.2, 0.46, -0.17), cy(0.006, 0.006, 0.26, DARK, -0.2, 0.65, -0.17, 4),                                        // radio d'épaule + antenne
    bx(0.03, 0.03, 0.02, 0x8a8f96, -0.09, 0.36, -0.2), bx(0.03, 0.03, 0.02, 0x8a8f96, 0.09, 0.36, -0.2), bx(0.2, 0.025, 0.02, PAD, 0, 0.35, -0.205),  // boucles et sangle
    bx(0.04, 0.32, 0.03, PACK, -0.15, 0.3, 0.2), bx(0.04, 0.32, 0.03, PACK, 0.15, 0.3, 0.2), bx(0.3, 0.05, 0.04, PACK, 0, 0.1, 0.22),         // bretelles et sangle du sac
  ]),
  torso: new THREE.CylinderGeometry(0.235, 0.19, 0.58, 12).rotateY(Math.PI / 12).scale(1, 1, 0.68).translate(0, 0.3, 0),
  trim: mergeGeometries([
    pb(0.08, 0.3, 0.02, 0, 0.33, -0.205),
    new THREE.SphereGeometry(0.105, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.7, 1.2).translate(-0.285, 0.58, 0),
    new THREE.SphereGeometry(0.105, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.7, 1.2).translate(0.285, 0.58, 0),
  ]),
  // tête : peau + cagoule sur le bas du visage + écouteurs (un seul maillage)
  head: mergeGeometries([
    paint(new THREE.SphereGeometry(0.16, 16, 12).scale(0.92, 1.08, 1), C.set(SKIN)),
    paint(new THREE.SphereGeometry(0.168, 16, 6, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48).scale(0.95, 1.08, 1.03), C.set(DARK)),
    paint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12).rotateZ(Math.PI / 2).translate(-0.175, -0.02, 0.02), C.set(DARK)),
    paint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12).rotateZ(Math.PI / 2).translate(0.175, -0.02, 0.02), C.set(DARK)),
    cy(0.17, 0.17, 0.05, DARK, 0, 0.05, 0, 16),                                                                                       // sangle des lunettes
    bx(0.095, 0.05, 0.03, 0x5aa0c8, -0.055, 0.05, -0.16), bx(0.095, 0.05, 0.03, 0x5aa0c8, 0.055, 0.05, -0.16), bx(0.21, 0.018, 0.035, DARK, 0, 0.082, -0.158), // lunettes
    bx(0.03, 0.03, 0.22, DARK, 0, 0.205, -0.02), bx(0.08, 0.05, 0.05, DARK, 0, 0.15, -0.185),                                       // rail et support de vision nocturne
    cy(0.012, 0.012, 0.2, DARK, 0.2, 0.17, 0.0, 4),                                                                                    // antenne de casque
  ]),
  helmet: new THREE.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.02, 0),
  visor: mergeGeometries([new THREE.CylinderGeometry(0.193, 0.193, 0.065, 16, 1, true, Math.PI - 0.95, 1.9), pb(0.03, 0.03, 0.3, 0, 0.21, 0)]),
  uarm: new THREE.CylinderGeometry(0.056, 0.046, L1, 10).translate(0, -L1 / 2, 0),
  // avant-bras + coude + gant (paume, doigts repliés), un seul maillage
  farm: mergeGeometries([
    cy(0.047, 0.037, L2, DARK, 0, -L2 / 2, 0, 10), sp(0.05, DARK, 0, 0, 0), sp(0.06, PAD, 0, 0, -0.01), cy(0.05, 0.05, 0.05, PAD, 0, -L2 + 0.07, 0, 10),   // coude (coudière) et bracelet
    bx(0.085, 0.09, 0.055, GLOVE, 0, -L2 - 0.03, 0), bx(0.085, 0.05, 0.065, GLOVE2, 0, -L2 - 0.1, -0.005), bx(0.07, 0.03, 0.02, PAD, 0, -L2 - 0.04, -0.035),
    ...[0, 1, 2, 3].map((i) => bx(0.017, 0.06, 0.022, GLOVE2, -0.03 + i * 0.02, -L2 - 0.15, -0.012)),                                                  // doigts
  ]),
  flash: new THREE.BoxGeometry(0.07, 0.07, 0.14),
  canopy: new THREE.SphereGeometry(1.6, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.5, 0.9, 1.5),
  cords: (() => { // suspentes : 8 points du bord de la voile vers les épaules
    const p = [];
    for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; p.push(Math.cos(t) * 2.38, 3.1, Math.sin(t) * 2.38, i % 2 ? 0.29 : -0.29, 1.4, 0); }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  })(),
};
// Accessoires propres à chaque légende (matériau d'accent = couleur de la légende), indexés par rang dans legends.json.
const LEXTRA = [
  () => mergeGeometries([pb(0.16, 0.09, 0.07, 0.09, 0.3, -0.205), pb(0.012, 0.3, 0.012, 0.12, 0.78, 0.28)]),                                   // jumelles + antenne
  () => mergeGeometries([new THREE.BoxGeometry(0.5, 0.06, 0.03).rotateZ(0.75).translate(0, 0.3, -0.21), pb(0.05, 0.08, 0.04, 0.12, 0.2, -0.215)]), // bandoulière de munitions
  () => mergeGeometries([pb(0.2, 0.09, 0.24, -0.3, 0.63, 0), pb(0.2, 0.09, 0.24, 0.3, 0.63, 0), pb(0.2, 0.2, 0.02, 0, 0.28, -0.215)]),         // épaulières lourdes + plastron
  () => mergeGeometries([pb(0.15, 0.42, 0.04, 0, 0.32, 0.36), pb(0.26, 0.07, 0.22, 0, 0.62, 0)]),                                             // écharpe + col
  () => mergeGeometries([pb(0.2, 0.06, 0.02, 0, 0.3, 0.345), pb(0.06, 0.2, 0.02, 0, 0.3, 0.345)]),                                             // croix médicale sur le sac
  () => mergeGeometries([pb(0.12, 0.12, 0.12, -0.27, 0.0, 0), pb(0.12, 0.12, 0.12, 0.27, 0.0, 0), pb(0.08, 0.06, 0.05, 0.22, 0.25, -0.215)]), // mines + détonateur
];
const ACCG = [];
function accGeo(i) { // i = rang de la légende (-1 : aucune)
  const li = i >= 0 ? i % LEXTRA.length : -1;
  if (ACCG[li + 1]) return ACCG[li + 1];
  const list = [[G.trim, 5, 0, 0.84, 0], [G.visor, 6, 0, 1.62, 0]];
  if (li >= 0) list.push([LEXTRA[li](), 5, 0, 0.84, 0]);
  return (ACCG[li + 1] = skin(list));
}
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const M = {
  friend: lam(0x4080e0), enemy: lam(0xd04040), dark: lam(DARK),
  vc: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 14, specular: 0x1c1c1c }), canopy: new THREE.MeshLambertMaterial({ color: 0xf08a30, side: THREE.DoubleSide }), flash: new THREE.MeshBasicMaterial({ color: 0xffd070 }),
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

// Un squelette par acteur : 3 maillages skinnés (couleurs / équipe / accent) au lieu de ~14 maillages séparés (3 appels de dessin au lieu de 14).
// Chaque géométrie est cuite dans le repère du groupe (pose de repos) puis rattachée à l'os de son articulation.
// Os : 0 bassin, 1/2 cuisse/genou G, 3/4 cuisse/genou D, 5 buste, 6 tête, 7 visée, 8/9 épaule/coude G, 10/11 épaule/coude D.
const BS = new THREE.Sphere(new THREE.Vector3(0, 1.4, 0), 3); // volume de culling fixe (les poses sortent de celui de la pose de repos)
function skin(list) {
  return mergeGeometries(list.map(([g0, bone, x, y, z]) => {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    g.deleteAttribute('uv'); g.translate(x, y, z);
    const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  }));
}
let SK = null;
const skins = () => SK || (SK = {
  vc: skin([[G.thigh[0], 1, -0.12, 0.84, 0], [G.shin, 2, -0.12, 0.42, 0], [G.thigh[1], 3, 0.12, 0.84, 0], [G.shin, 4, 0.12, 0.42, 0], [G.body, 5, 0, 0.84, 0], [G.head, 6, 0, 1.62, 0], [G.farm, 9, -0.29, 1.05, 0], [G.farm, 11, 0.29, 1.05, 0]]),
  team: skin([[G.torso, 5, 0, 0.84, 0], [G.helmet, 6, 0, 1.62, 0], [G.uarm, 8, -0.29, 1.38, 0], [G.uarm, 10, 0.29, 1.38, 0]]),
  acc: skin([[G.trim, 5, 0, 0.84, 0], [G.visor, 6, 0, 1.62, 0]]),
});

// Skins de personnage : mêmes positions/os (attributs partagés), attribut color propre ; la palette (9 couleurs) remplace celle d'origine.
// Les couleurs d'équipe (torse, casque, bras) et d'accent ne changent pas.
const PAL = [PANTS, DARK, VEST, SKIN, BOOT, PAD, PACK, GLOVE, GLOVE2];
let VI = null;
const SG = [];
function persoGeo(i) {
  const K = skins(), def = skinData.perso[i - 1];
  if (!def) return K.vc;
  if (SG[i]) return SG[i];
  const src = K.vc, col = src.attributes.color, n = col.count;
  if (!VI) { // indice de palette de chaque sommet (couleurs identiques en flottants 32 bits)
    const ref = PAL.map((h) => { C.set(h); return [Math.fround(C.r), Math.fround(C.g), Math.fround(C.b)]; });
    VI = new Uint8Array(n);
    for (let v = 0; v < n; v++) VI[v] = ref.findIndex((c) => c[0] === col.getX(v) && c[1] === col.getY(v) && c[2] === col.getZ(v));
  }
  const pal = def.p.map((h) => new THREE.Color(h)), o = col.array, a = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const c = pal[VI[v]];
    if (c) { a[v * 3] = c.r; a[v * 3 + 1] = c.g; a[v * 3 + 2] = c.b; }
    else { a[v * 3] = o[v * 3]; a[v * 3 + 1] = o[v * 3 + 1]; a[v * 3 + 2] = o[v * 3 + 2]; }
  }
  const g = new THREE.BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return SG[i] = g;
}

export class Rig {
  constructor(group, friendly) {
    const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
    const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
    const team = friendly ? M.friend : M.enemy, bones = [];
    const bone = (parent, x, y, z) => { const o = new THREE.Bone(); o.position.set(x, y, z); parent.add(o); bones.push(o); return o; };
    this.pelvis = bone(group, 0, 0.84, 0);
    this.thigh = []; this.shin = [];
    for (const sx of [-0.12, 0.12]) { const t = bone(this.pelvis, sx, 0, 0); this.thigh.push(t); this.shin.push(bone(t, 0, -0.42, 0)); }
    this.spine = bone(this.pelvis, 0, 0, 0);
    this.head = bone(this.spine, 0, 0.78, 0);
    this.aim = bone(this.spine, 0, 0.54, 0); // épaules, bras (deux segments + main) et arme : tournent avec la visée
    this.arms = [];
    for (const sx of [-0.29, 0.29]) { const g = bone(this.aim, sx, 0, 0); this.arms.push({ g, el: bone(g, 0, -L1, 0), sx }); }
    group.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones), K = skins();
    const sk = (geo, mat) => { const o = new THREE.SkinnedMesh(geo, mat); o.boundingSphere = BS; group.add(o); return o; };
    const ms = [sk(K.vc, M.vc), sk(K.team, team), sk(accGeo(-1), accentMat(NEUTRAL))];
    this.leg = -1;
    group.updateMatrixWorld(true);
    for (const o of ms) o.bind(skel, o.matrixWorld);
    this.team = [ms[1]]; this.acc = ms[2]; this.vcMesh = ms[0]; this.pskin = 0; this.wskin = 0;
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
  setAccent(hex, legend) {
    this.acc.material = accentMat(typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex);
    const i = LEGS.indexOf(legend);
    if (i !== this.leg) { this.leg = i; this.acc.geometry = accGeo(i); }
  }

  // Skins cosmétiques : indices + 1 dans skins.json (0 = défaut).
  setSkins(ps, ws) {
    if (ps !== this.pskin) { this.pskin = ps; this.vcMesh.geometry = persoGeo(ps); }
    if (ws !== this.wskin) { this.wskin = ws; if (this.wid) this.setWeapon(this.wid); }
  }

  setWeapon(id) {
    this.wid = id;
    const w = id ? skinnedWeapon(id, skinData.arme[this.wskin - 1]) : null;
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
    _f.y /= s; _f.normalize(); // compense l'étirement en y du bras
    arm.el.quaternion.setFromUnitVectors(DOWN, _f);
    arm.g.scale.y = s;
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
