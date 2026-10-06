import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { skinMaterial } from './skin.js';
import { rng } from './testScene.js';

// Décor instancié (aucune collision ici : les colliders sont ajoutés par l'appelant). Matériaux procéduraux de skin.js.

// Teinte par sommet (dégradé de la base vers la pointe).
function tint(g, a, b) {
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), ca = new THREE.Color(a), cb = new THREE.Color(b), c = new THREE.Color();
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, h = g.boundingBox.max.y - y0 || 1;
  for (let i = 0; i < n; i++) { c.copy(ca).lerp(cb, (p.getY(i) - y0) / h); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Pins : tronc + 4 étages de feuillage (un seul maillage fusionné, dégradé clair vers le haut). list = [[x, y, z, échelle, teinte 0..1], ...]
export function makeTrees(scene, list) {
  const n = list.length;
  if (!n) return;
  const tier = (r, h, y, a, b) => tint(new THREE.ConeGeometry(r, h, 8).translate(0, y, 0), a, b);
  const foliage = mergeGeometries([
    tier(2.1, 2.8, 3.8, 0x22522c, 0x2f6b3a), tier(1.7, 2.6, 5.0, 0x2a5f33, 0x3a7a43),
    tier(1.25, 2.4, 6.3, 0x2f6b3a, 0x47894c), tier(0.8, 2.0, 7.4, 0x3a7a43, 0x58a05a),
  ]);
  const parts = [
    { geo: tint(new THREE.CylinderGeometry(0.16, 0.3, 3.6, 7).translate(0, 1.8, 0), 0x4a3320, 0x6b4a2f), mat: skinMaterial(5), color: 0xffffff, tint: false },
    { geo: foliage, mat: skinMaterial(4, true), color: 0xffffff, tint: true },
  ];
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const part of parts) {
    const mat = part.mat.clone();
    mat.vertexColors = true; mat.defines = part.mat.defines; mat.onBeforeCompile = part.mat.onBeforeCompile;
    const mesh = new THREE.InstancedMesh(part.geo, mat, n);
    for (let i = 0; i < n; i++) {
      const [x, y, z, k, t] = list[i];
      p.set(x, y, z); s.set(k * (0.9 + t * 0.2), k * (0.92 + (1 - t) * 0.16), k * (0.9 + t * 0.2));
      q.setFromAxisAngle(up, t * 6.28);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      c.setHex(part.color);
      if (part.tint) c.offsetHSL((t - 0.5) * 0.05, (t - 0.5) * 0.1, (t - 0.5) * 0.1);
      mesh.setColorAt(i, c);
    }
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// Rochers : icosaèdres déformés (facettes irrégulières, déterministes). list = [[x, y, z, rx, ry, rz, rotation, teinte], ...]
export function makeRocks(scene, list) {
  const n = list.length;
  if (!n) return;
  const g = new THREE.IcosahedronGeometry(1, 2), pos = g.attributes.position;
  const hash = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), f = 0.8 + 0.4 * hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40)) * (0.5 + 0.5 * hash(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9)));
    pos.setXYZ(i, x * f, y * f * (y < 0 ? 0.7 : 1), z * f);
  }
  const mesh = new THREE.InstancedMesh(g, skinMaterial(6, true), n);
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const [x, y, z, rx, ry, rz, rot, t] = list[i];
    p.set(x, y, z); s.set(rx, ry, rz);
    q.setFromAxisAngle(up, rot);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.09, 0.08, 0.38 + t * 0.14));
  }
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

// Buissons : blobs de feuillage aplatis, aucun collider. `ok(x, z)` accepte un emplacement.
export function makeBushes(scene, hf, seed, ok, count = 90) {
  const r = rng((seed | 0) * 13 + 5), list = [];
  for (let i = 0; i < count * 6 && list.length < count; i++) {
    const x = (r() - 0.5) * 2 * (hf.half - 6), z = (r() - 0.5) * 2 * (hf.half - 6), k = 0.6 + r() * 0.8, t = r();
    if (ok(x, z, 2.5)) list.push([x, hf.at(x, z) + 0.25 * k, z, k, t]);
  }
  if (!list.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), skinMaterial(4, true), list.length);
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach(([x, y, z, k, t], i) => {
    p.set(x, y, z); s.set(k * 1.1, k * 0.7, k * 1.0); q.setFromAxisAngle(up, t * 6.28);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.27 + (t - 0.5) * 0.05, 0.4, 0.2 + t * 0.1));
  });
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

// Herbe : touffes de brins (triangles recto-verso aux normales vers le haut, éclairés comme le sol), balancées par le vent
// dans le vertex shader. Positions tirées d'une graine dédiée (ne décale pas le reste de la génération).
export function makeGrass(scene, hf, seed, ok, count = 6000) {
  const r = rng((seed | 0) * 29 + 3), pos = [], nor = [], col = [];
  const lo = new THREE.Color(0x24401a), hi = new THREE.Color(0x86ad48), c = new THREE.Color();
  const tri = (a, b, d) => { // sommets [x,y,z] ; teinte par hauteur
    for (const v of [a, b, d]) { pos.push(v[0], v[1], v[2]); nor.push(0, 1, 0); c.copy(lo).lerp(hi, Math.min(1, v[1] / 0.5)); col.push(c.r, c.g, c.b); }
  };
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + r() * 0.6, ca = Math.cos(a), sa = Math.sin(a), d = 0.03 + r() * 0.07, h = 0.35 + r() * 0.3, lean = 0.08 + r() * 0.12;
    const bx = ca * d, bz = sa * d, w = 0.035, tx = bx + ca * lean, tz = bz + sa * lean;
    const L = [bx - sa * w, 0, bz + ca * w], R = [bx + sa * w, 0, bz - ca * w], T = [tx, h, tz];
    tri(L, R, T); tri(R, L, T);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const list = [];
  for (let i = 0; i < count * 5 && list.length < count; i++) {
    const x = (r() - 0.5) * 2 * (hf.half - 3), z = (r() - 0.5) * 2 * (hf.half - 3);
    if (ok(x, z, 0.8)) list.push([x, hf.at(x, z) - 0.02, z, 0.8 + r() * 0.9, r()]);
  }
  if (!list.length) return;
  const u = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 o = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float ph = o.x * 0.45 + o.z * 0.37, hh = position.y * position.y * 2.2;
          transformed.x += sin(uTime * 1.6 + ph) * 0.07 * hh; transformed.z += cos(uTime * 1.3 + ph * 1.3) * 0.045 * hh; }`);
  };
  const mesh = new THREE.InstancedMesh(g, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach(([x, y, z, k, t], i) => {
    p.set(x, y, z); s.set(k, k * (0.8 + t * 0.6), k); q.setFromAxisAngle(up, t * 6.28);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setRGB(0.85 + t * 0.3, 0.9 + t * 0.2, 0.8 + t * 0.2));
  });
  mesh.frustumCulled = false; mesh.receiveShadow = true;
  mesh.onBeforeRender = () => { u.value = performance.now() / 1000; };
  scene.add(mesh);
}
