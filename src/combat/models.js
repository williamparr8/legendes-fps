import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Modèles d'armes procéduraux : corps en profil latéral extrudé et biseauté (la lumière accroche les arêtes) + boîtes et cylindres.
// Repère : canon vers -z, culasse à l'origine.
// userData : muzzle = z de la bouche, sightY = hauteur de la ligne de visée (ADS), grip/fore = [y, z] des mains.
const phong = (color, shininess = 40, specular = 0x555555) => new THREE.MeshPhongMaterial({ color, shininess, specular });
const MAT = {
  metal: phong(0x4a515b, 70, 0x888888), dark: phong(0x2b2e34, 30, 0x333333), steel: phong(0xaab0b9, 90, 0xdddddd),
  poly: phong(0x1d2025, 22, 0x2a2d33), wood: phong(0x6e4b2f, 14, 0x2a1c10),
  glove: new THREE.MeshLambertMaterial({ color: 0x23262c }), sleeve: new THREE.MeshLambertMaterial({ color: 0x2f4b70 }),
  glass: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  lens: new THREE.MeshPhongMaterial({ color: 0x5aa0ff, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.75 }),
  olive: phong(0x4d5a3a, 30, 0x222222), orange: phong(0xd9792b, 60, 0x555555),
};
const ACCENT = { rifle: 0x4f8fc0, smg: 0x9b6fd0, shotgun: 0xd05a3a, sniper: 0x4fb070, launcher: 0xe09030 };
const GEO = {};
const cache = (k, f) => GEO[k] || (GEO[k] = f());
const boxGeo = (w, h, d) => cache(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (r1, r2, len, seg) => cache(`c${r1},${r2},${len},${seg}`, () => new THREE.CylinderGeometry(r1, r2, len, seg));

function box(g, w, h, d, x, y, z, mat, rx = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.x = rx;
  g.add(m);
  return m;
}
// Cylindre le long de z : rayons (arrière → avant), longueur, centre.
function cyl(g, r1, r2, len, x, y, z, mat, seg = 10) {
  const m = new THREE.Mesh(cylGeo(r1, r2, len, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z);
  g.add(m);
  return m;
}
function ball(g, r, x, y, z, mat) {
  const m = new THREE.Mesh(cache(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6)), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
// Profil latéral [[z, y], …] extrudé sur la largeur w (centré en x), arêtes biseautées de `bev`.
function prof(g, pts, w, x, mat, bev = 0.004) {
  const geo = cache(`p${pts.join()}|${w}|${bev}`, () => {
    const s = new THREE.Shape();
    pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
    const t = w - 2 * bev;
    return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 }).translate(0, 0, -t / 2).rotateY(-Math.PI / 2);
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.x = x;
  g.add(m);
  return m;
}
// Pontet : barre basse + montant avant, détente.
function guard(g, z, y) {
  box(g, 0.01, 0.008, 0.08, 0, y - 0.018, z + 0.04, MAT.dark); box(g, 0.01, 0.036, 0.01, 0, y, z, MAT.dark); box(g, 0.008, 0.03, 0.01, 0, y, z + 0.045, MAT.steel);
}

const BUILD = {
  rifle(g, a) {
    const { metal, dark, steel, poly, glass } = MAT;
    prof(g, [[-0.2, 0.05], [-0.16, 0.062], [0.17, 0.062], [0.2, 0.045], [0.2, -0.012], [-0.2, -0.012]], 0.066, 0, metal);
    prof(g, [[-0.14, -0.012], [0.17, -0.012], [0.17, -0.06], [0.12, -0.075], [-0.14, -0.068]], 0.06, 0, dark);
    prof(g, [[-0.19, 0.042], [-0.5, 0.038], [-0.5, -0.042], [-0.19, -0.05]], 0.078, 0, metal, 0.007);
    for (const z of [-0.26, -0.34, -0.42]) box(g, 0.082, 0.022, 0.04, 0, 0, z, dark);
    box(g, 0.026, 0.01, 0.62, 0, 0.067, -0.13, dark);
    for (let i = 0; i < 7; i++) box(g, 0.032, 0.008, 0.014, 0, 0.074, 0.15 - i * 0.075, steel);
    cyl(g, 0.012, 0.012, 0.14, 0, 0.005, -0.57, steel); cyl(g, 0.02, 0.017, 0.08, 0, 0.005, -0.66, dark, 8); cyl(g, 0.022, 0.022, 0.012, 0, 0.005, -0.625, a);
    box(g, 0.014, 0.05, 0.014, 0, 0.09, -0.47, dark);
    // viseur holographique
    box(g, 0.046, 0.014, 0.075, 0, 0.075, 0.02, dark);
    for (const s of [-1, 1]) box(g, 0.006, 0.052, 0.075, s * 0.021, 0.101, 0.02, dark);
    box(g, 0.048, 0.01, 0.075, 0, 0.13, 0.02, dark); box(g, 0.034, 0.036, 0.004, 0, 0.101, -0.018, glass);
    // chargeur courbe + bande d'accent, poignée, pontet, crosse
    prof(g, [[-0.075, -0.06], [-0.025, -0.06], [-0.03, -0.13], [-0.065, -0.2], [-0.115, -0.2], [-0.085, -0.13]], 0.045, 0, dark);
    prof(g, [[-0.079, -0.075], [-0.027, -0.075], [-0.028, -0.092], [-0.082, -0.092]], 0.048, 0, a, 0.002);
    prof(g, [[0.095, -0.05], [0.145, -0.05], [0.19, -0.17], [0.135, -0.17]], 0.044, 0, poly, 0.006);
    guard(g, 0.01, -0.07);
    prof(g, [[0.19, 0.04], [0.36, 0.052], [0.4, 0.052], [0.4, -0.08], [0.36, -0.08], [0.28, -0.04], [0.19, -0.02]], 0.05, 0, poly, 0.006);
    box(g, 0.058, 0.13, 0.018, 0, -0.014, 0.405, dark);
    g.userData = { muzzle: -0.7, sightY: 0.1, grip: [-0.12, 0.14], fore: [-0.07, -0.32] };
  },
  smg(g, a) {
    const { metal, dark, steel, poly, glass } = MAT;
    prof(g, [[-0.16, 0.05], [-0.13, 0.063], [0.14, 0.063], [0.17, 0.04], [0.17, -0.055], [-0.16, -0.055]], 0.07, 0, metal, 0.006);
    box(g, 0.04, 0.012, 0.34, 0, 0.068, -0.01, dark);
    prof(g, [[-0.14, 0.045], [-0.33, 0.04], [-0.33, -0.04], [-0.14, -0.05]], 0.064, 0, metal, 0.006);
    cyl(g, 0.03, 0.03, 0.24, 0, 0.01, -0.43, dark, 12);
    for (const z of [-0.36, -0.41, -0.46]) cyl(g, 0.034, 0.034, 0.014, 0, 0.01, z, metal, 12);
    cyl(g, 0.03, 0.03, 0.02, 0, 0.01, -0.54, a, 12); cyl(g, 0.018, 0.018, 0.06, 0, 0.01, -0.58, steel, 8);
    prof(g, [[-0.035, -0.05], [0.04, -0.05], [0.036, -0.15], [0.03, -0.25], [-0.04, -0.25], [-0.046, -0.15]], 0.044, 0, dark);
    prof(g, [[-0.04, -0.07], [0.04, -0.07], [0.039, -0.088], [-0.043, -0.088]], 0.047, 0, a, 0.002);
    box(g, 0.048, 0.012, 0.08, 0, -0.254, -0.003, steel);
    prof(g, [[-0.29, -0.055], [-0.24, -0.055], [-0.235, -0.125], [-0.285, -0.13]], 0.04, 0, metal, 0.005);
    prof(g, [[0.075, -0.055], [0.12, -0.055], [0.16, -0.16], [0.11, -0.16]], 0.046, 0, poly, 0.006);
    guard(g, -0.01, -0.075);
    // crosse filaire
    for (const y of [0.012, -0.028]) for (const s of [-1, 1]) cyl(g, 0.006, 0.006, 0.2, s * 0.026, y, 0.27, steel, 6);
    box(g, 0.062, 0.09, 0.016, 0, -0.01, 0.37, dark);
    // viseur point rouge
    box(g, 0.04, 0.02, 0.06, 0, 0.083, -0.02, dark);
    for (const s of [-1, 1]) box(g, 0.006, 0.04, 0.06, s * 0.018, 0.1, -0.02, dark);
    box(g, 0.04, 0.008, 0.06, 0, 0.12, -0.02, dark); box(g, 0.03, 0.03, 0.004, 0, 0.1, -0.05, glass);
    g.userData = { muzzle: -0.61, sightY: 0.1, grip: [-0.1, 0.13], fore: [-0.08, -0.27] };
  },
  shotgun(g, a) {
    const { metal, dark, steel, poly, wood, orange } = MAT;
    prof(g, [[-0.17, 0.052], [0.15, 0.052], [0.17, 0.03], [0.17, -0.05], [-0.17, -0.05]], 0.075, 0, metal, 0.006);
    box(g, 0.04, 0.012, 0.3, 0, 0.058, -0.02, dark);
    cyl(g, 0.02, 0.02, 0.6, 0, 0.02, -0.45, steel, 12); cyl(g, 0.018, 0.018, 0.5, 0, -0.03, -0.4, dark, 12); cyl(g, 0.024, 0.024, 0.03, 0, -0.03, -0.66, a, 12);
    cyl(g, 0.026, 0.026, 0.02, 0, 0.02, -0.74, dark, 12);
    for (const z of [-0.3, -0.5]) cyl(g, 0.026, 0.026, 0.014, 0, -0.005, z, metal, 10);
    // pompe en bois rainurée
    prof(g, [[-0.24, -0.012], [-0.44, -0.015], [-0.455, -0.045], [-0.44, -0.078], [-0.24, -0.078], [-0.225, -0.045]], 0.07, 0, wood, 0.008);
    for (const z of [-0.28, -0.32, -0.36, -0.4]) box(g, 0.074, 0.064, 0.008, 0, -0.045, z, dark);
    box(g, 0.012, 0.03, 0.012, 0, 0.068, -0.73, orange);
    // cartouches sur le flanc
    for (let i = 0; i < 4; i++) box(g, 0.012, 0.026, 0.04, 0.043, 0.015, 0.1 - i * 0.05, orange);
    prof(g, [[0.095, -0.05], [0.145, -0.05], [0.185, -0.16], [0.13, -0.16]], 0.046, 0, wood, 0.006);
    guard(g, 0.01, -0.07);
    prof(g, [[0.17, 0.04], [0.34, 0.04], [0.47, 0.05], [0.48, -0.1], [0.34, -0.07], [0.17, -0.05]], 0.055, 0, wood, 0.008);
    box(g, 0.062, 0.15, 0.025, 0, -0.025, 0.485, dark);
    g.userData = { muzzle: -0.75, sightY: 0.068, grip: [-0.1, 0.13], fore: [-0.045, -0.34] };
  },
  sniper(g, a) {
    const { metal, dark, steel, poly, lens } = MAT;
    prof(g, [[-0.19, 0.052], [0.23, 0.052], [0.23, -0.05], [-0.19, -0.05]], 0.065, 0, metal, 0.006);
    prof(g, [[-0.2, 0.0], [-0.58, -0.005], [-0.58, -0.05], [-0.2, -0.056]], 0.05, 0, dark, 0.006);
    cyl(g, 0.014, 0.014, 0.8, 0, 0.012, -0.6, steel); cyl(g, 0.024, 0.022, 0.08, 0, 0.012, -0.965, dark);
    for (const z of [-0.94, -0.99]) cyl(g, 0.027, 0.027, 0.012, 0, 0.012, z, steel);
    // lunette
    cyl(g, 0.032, 0.032, 0.34, 0, 0.105, -0.04, dark, 14); cyl(g, 0.04, 0.034, 0.07, 0, 0.105, -0.24, metal, 14);
    cyl(g, 0.034, 0.045, 0.07, 0, 0.105, 0.17, metal, 14); cyl(g, 0.034, 0.034, 0.006, 0, 0.105, -0.277, lens, 14);
    box(g, 0.02, 0.045, 0.03, 0, 0.065, -0.1, dark); box(g, 0.02, 0.045, 0.03, 0, 0.065, 0.08, dark);
    cyl(g, 0.011, 0.011, 0.03, 0, 0.14, -0.05, steel, 8).rotation.set(0, 0, 0);
    cyl(g, 0.011, 0.011, 0.03, 0.04, 0.105, -0.05, steel, 8).rotation.set(0, 0, Math.PI / 2);
    // levier de culasse
    cyl(g, 0.008, 0.008, 0.07, 0.05, 0.03, 0.18, steel, 6).rotation.set(0, 0, Math.PI / 2); ball(g, 0.015, 0.088, 0.03, 0.18, dark);
    box(g, 0.04, 0.07, 0.11, 0, -0.085, 0.02, dark); box(g, 0.042, 0.012, 0.115, 0, -0.123, 0.02, a);
    prof(g, [[0.12, -0.05], [0.17, -0.05], [0.215, -0.16], [0.16, -0.16]], 0.046, 0, poly, 0.006);
    guard(g, 0.02, -0.07);
    prof(g, [[0.23, 0.05], [0.4, 0.056], [0.54, 0.056], [0.55, -0.11], [0.46, -0.08], [0.3, -0.05], [0.23, -0.05]], 0.056, 0, dark, 0.007);
    prof(g, [[0.3, 0.056], [0.46, 0.062], [0.46, 0.056], [0.3, 0.05]], 0.05, 0, metal, 0.003);
    box(g, 0.065, 0.13, 0.03, 0, -0.03, 0.555, poly);
    g.userData = { muzzle: -1.0, sightY: 0.105, grip: [-0.1, 0.16], fore: [-0.03, -0.32] };
  },
  launcher(g, a) {
    const { metal, dark, poly, olive, orange, glass } = MAT;
    cyl(g, 0.075, 0.075, 0.85, 0, 0, -0.42, olive, 16); cyl(g, 0.098, 0.088, 0.14, 0, 0, -0.8, dark, 16); cyl(g, 0.1, 0.12, 0.12, 0, 0, 0.06, metal, 16);
    cyl(g, 0.078, 0.078, 0.05, 0, 0, -0.55, a, 16); cyl(g, 0.078, 0.078, 0.05, 0, 0, -0.25, a, 16);
    for (const z of [-0.12, -0.38, -0.68]) cyl(g, 0.08, 0.08, 0.016, 0, 0, z, dark, 16);
    cyl(g, 0.065, 0.022, 0.1, 0, 0, -0.9, orange, 12);
    box(g, 0.03, 0.012, 0.5, 0, 0.08, -0.3, dark);
    prof(g, [[-0.1, -0.06], [-0.04, -0.06], [0.0, -0.19], [-0.06, -0.19]], 0.046, 0, poly, 0.006);
    prof(g, [[-0.43, -0.07], [-0.37, -0.07], [-0.37, -0.2], [-0.43, -0.2]], 0.04, 0, poly, 0.006);
    box(g, 0.05, 0.02, 0.1, 0.045, 0.08, -0.2, dark); box(g, 0.035, 0.07, 0.1, 0.07, 0.1, -0.2, metal); box(g, 0.02, 0.03, 0.004, 0.07, 0.115, -0.252, glass);
    prof(g, [[0.16, 0.08], [0.23, 0.09], [0.23, -0.09], [0.16, -0.08]], 0.1, 0, dark, 0.008);
    g.userData = { muzzle: -0.85, sightY: 0.11, grip: [-0.13, -0.05], fore: [-0.14, -0.4] };
  },
};

// Gants, poignets et avant-bras (vue subjective uniquement) : paume, doigts repliés, pouce, brassard.
function addHands(g) {
  const u = g.userData, { glove, sleeve, dark } = MAT, hand = (y, z, side) => {
    box(g, 0.075, 0.075, 0.1, 0, y, z, glove);
    for (let i = 0; i < 3; i++) box(g, 0.078, 0.02, 0.05, 0, y + 0.02 - i * 0.022, z - 0.065, glove);
    box(g, 0.022, 0.03, 0.07, side > 0 ? -0.045 : 0.045, y + 0.02, z - 0.02, glove);
    box(g, 0.07, 0.03, 0.03, 0, y + 0.045, z - 0.01, dark);
    const a = new THREE.Group();
    a.position.set(side * 0.07, y - 0.06, z + 0.28); a.rotation.set(-0.25, side * -0.18, 0);
    g.add(a);
    cyl(a, 0.054, 0.044, 0.5, 0, 0, 0, sleeve, 8);
    cyl(a, 0.058, 0.058, 0.05, 0, 0, -0.2, glove, 8);
    box(a, 0.06, 0.012, 0.2, 0, 0.05, -0.06, dark);
  };
  hand(u.grip[0] - 0.02, u.grip[1] + 0.02, 0.4);
  hand(u.fore[0] - 0.03, u.fore[1], -0.7);
}

// Retourne un Group (ombre désactivée pour la vue subjective, activée pour les armes posées au sol).
export function buildWeaponModel(id, hands = false) {
  const g = new THREE.Group();
  const accent = new THREE.MeshPhongMaterial({ color: ACCENT[id] || 0x888888, shininess: 50 });
  (BUILD[id] || BUILD.rifle)(g, accent);
  if (hands) addHands(g);
  return g;
}

// Arme fusionnée en un seul maillage (couleurs par sommet), partagée : acteurs et butin au sol. { geo, ud }.
const MW = new Map();
export function mergedWeapon(id) {
  let w = MW.get(id);
  if (w) return w;
  const src = buildWeaponModel(id), parts = [], c = new THREE.Color();
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    if (!o.isMesh) return;
    let p = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (p.index) p = p.toNonIndexed();
    p.deleteAttribute('uv');
    const n = p.attributes.position.count, col = new Float32Array(n * 3);
    c.copy(o.material.color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    p.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(p);
  });
  MW.set(id, w = { geo: mergeGeometries(parts), ud: src.userData });
  return w;
}
