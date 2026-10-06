import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergedWeapon } from '../combat/models.js';

// Modèles d'objets au sol (munitions, soins, armes) + balise lumineuse colorée visible de loin.
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const M = {
  olive: lam(0x4d5a3a), darkOlive: lam(0x3a4430), brass: new THREE.MeshPhongMaterial({ color: 0xc9a14a, shininess: 90, specular: 0xffffff }),
  red: lam(0xc43a2a), white: lam(0xf2f2f2), crossRed: lam(0xd02020), dark: lam(0x222428), steel: new THREE.MeshPhongMaterial({ color: 0xaab0b8, shininess: 80 }),
  glass: new THREE.MeshPhongMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.55, shininess: 100 }),
  cell: new THREE.MeshLambertMaterial({ color: 0x3a78ff, emissive: 0x1840b0, emissiveIntensity: 0.7 }),
  orange: lam(0xe0782a), green: lam(0x3f7a4a), yellow: lam(0xe0c040),
};
const WPN = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 45, specular: 0x333333 });
const G = {};
const bx = (w, h, d) => G[`b${w}${h}${d}`] || (G[`b${w}${h}${d}`] = new THREE.BoxGeometry(w, h, d));
const cy = (r, h, s = 10) => G[`c${r}${h}${s}`] || (G[`c${r}${h}${s}`] = new THREE.CylinderGeometry(r, r, h, s));
const add = (g, geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m; };

function crate(g, label) {
  add(g, bx(0.42, 0.22, 0.28), M.olive, 0, 0.11, 0);
  add(g, bx(0.44, 0.05, 0.3), M.darkOlive, 0, 0.235, 0);
  add(g, bx(0.2, 0.09, 0.006), label, 0, 0.12, 0.143);
}

const MODEL = {
  'ammo:light': (g) => { crate(g, M.yellow); for (const x of [-0.1, 0, 0.1]) add(g, cy(0.022, 0.12, 8), M.brass, x, 0.32, 0, Math.PI / 2, 0); },
  'ammo:shells': (g) => { for (const x of [-0.1, 0, 0.1]) { add(g, cy(0.045, 0.2), M.red, x, 0.13, 0); add(g, cy(0.047, 0.06), M.brass, x, 0.03, 0); } },
  'ammo:sniper': (g) => { crate(g, M.green); for (const z of [-0.06, 0.06]) { add(g, cy(0.016, 0.3, 8), M.brass, 0, 0.3, z, 0, Math.PI / 2); } },
  'ammo:rocket': (g) => {
    add(g, cy(0.06, 0.4), M.olive, 0, 0.1, 0, 0, Math.PI / 2);
    const nose = add(g, new THREE.ConeGeometry(0.06, 0.14, 10), M.orange, 0.27, 0.1, 0); nose.rotation.z = -Math.PI / 2;
    for (const [y, z] of [[0.17, 0], [0.03, 0], [0.1, 0.07], [0.1, -0.07]]) add(g, bx(0.08, y === 0.1 ? 0.004 : 0.1, y === 0.1 ? 0.1 : 0.004), M.dark, -0.18, y, z);
  },
  'heal:syringe': (g) => {
    add(g, cy(0.032, 0.26, 10), M.glass, 0, 0.05, 0, 0, Math.PI / 2); add(g, cy(0.02, 0.2, 8), M.cell, 0, 0.05, 0, 0, Math.PI / 2);
    add(g, bx(0.012, 0.08, 0.12), M.steel, -0.14, 0.05, 0); add(g, cy(0.004, 0.14, 6), M.steel, 0.2, 0.05, 0, 0, Math.PI / 2); add(g, cy(0.008, 0.06, 6), M.steel, -0.18, 0.05, 0, 0, Math.PI / 2);
  },
  'heal:medkit': (g) => {
    add(g, bx(0.36, 0.22, 0.16), M.white, 0, 0.11, 0); add(g, bx(0.14, 0.05, 0.03), M.dark, 0, 0.245, 0);
    add(g, bx(0.1, 0.03, 0.006), M.crossRed, 0, 0.12, 0.083); add(g, bx(0.03, 0.1, 0.006), M.crossRed, 0, 0.12, 0.083);
  },
  'heal:cell': (g) => {
    add(g, cy(0.085, 0.24, 14), M.cell, 0, 0.14, 0); add(g, cy(0.09, 0.03, 14), M.dark, 0, 0.275, 0); add(g, cy(0.09, 0.03, 14), M.dark, 0, 0.015, 0);
    add(g, cy(0.03, 0.04, 8), M.steel, 0, 0.31, 0);
  },
};

// Fusionne les maillages d'un modèle en 1 (opaque) + 1 (verre transparent), couleurs par sommet (émissif ajouté à la couleur).
const SOLID = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: 0x222222 });
const GLASS = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.55, shininess: 100 });
const BAKED = {};
function bake(key, build) {
  if (BAKED[key]) return BAKED[key];
  const root = new THREE.Group(), solid = [], glass = [], c = new THREE.Color();
  build(root);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    let p = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (p.index) p = p.toNonIndexed();
    p.deleteAttribute('uv');
    c.copy(o.material.color);
    if (o.material.emissive) c.add(new THREE.Color().copy(o.material.emissive).multiplyScalar(o.material.emissiveIntensity));
    const n = p.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    p.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (o.material.transparent ? glass : solid).push(p);
  });
  return (BAKED[key] = { solid: mergeGeometries(solid), glass: glass.length ? mergeGeometries(glass) : null });
}
// Balise : mât + disque au sol en un seul maillage.
const BEACON = mergeGeometries([new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6).translate(0, 1.3, 0), new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20).translate(0, 0.01, 0)]);

// Toutes les balises = un seul InstancedMesh (une instance par emplacement de butin, couleur par instance).
export function makeBeacons(n) {
  const m = new THREE.InstancedMesh(BEACON, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }), n);
  const z = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(0xffffff);
  for (let i = 0; i < n; i++) { m.setMatrixAt(i, z); m.setColorAt(i, c); }
  m.frustumCulled = false;
  return m;
}
const _m = new THREE.Matrix4(), _c = new THREE.Color();
export function setBeacon(m, i, on, x = 0, y = 0, z = 0, color = 0) {
  if (on) { _m.makeTranslation(x, y, z); m.setColorAt(i, _c.set(color)); m.instanceColor.needsUpdate = true; } else _m.makeScale(0, 0, 0);
  m.setMatrixAt(i, _m); m.instanceMatrix.needsUpdate = true;
}

// `it` : entrée de items.json. Le modèle repose sur y = 0 ; la balise s'étend vers le haut.
export function buildItemModel(it) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  if (it.kind === 'weapon') {
    const w = new THREE.Mesh(mergedWeapon(it.key).geo, WPN);
    w.rotation.z = Math.PI / 2; w.position.y = 0.12; w.scale.setScalar(0.85);
    body.add(w);
  } else {
    const b = bake(`${it.kind}:${it.key}`, (MODEL[`${it.kind}:${it.key}`] || MODEL['ammo:light']));
    body.add(new THREE.Mesh(b.solid, SOLID));
    if (b.glass) body.add(new THREE.Mesh(b.glass, GLASS));
  }
  g.add(body);
  g.userData.body = body;
  return g;
}
