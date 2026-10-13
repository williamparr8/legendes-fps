import * as THREE from 'three';
import { rng } from './testScene.js';
import { terrainMaterial } from './skin.js';

import { SEA } from './relief.js';
export { Heightfield, makeCoast, SEA, DEEP } from './relief.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Routes : polylignes [[x0,z0,x1,z1], …] ; distance au segment le plus proche.
export function roadDist(roads, x, z) {
  let best = 1e9;
  for (let i = 0; i < roads.length; i++) {
    const s = roads[i], vx = s[2] - s[0], vz = s[3] - s[1], l2 = vx * vx + vz * vz || 1;
    const t = clamp01(((x - s[0]) * vx + (z - s[1]) * vz) / l2);
    const d = Math.hypot(x - (s[0] + vx * t), z - (s[1] + vz * t));
    if (d < best) best = d;
  }
  return best;
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 128, 128);
  const r = rng(5);
  for (let i = 0; i < 1400; i++) {
    const v = 150 + ((r() * 100) | 0);
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Maillage du terrain : couleurs par altitude / pente / proximité des bâtiments, ombres reçues.
export function buildTerrainMesh(scene, hf, roads = []) {
  const seg = 224, size = hf.ext * 2;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cnt = pos.count;
  for (let i = 0; i < cnt; i++) pos.setY(i, hf.at(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, col = new Float32Array(cnt * 3);
  const grass = new THREE.Color(0x4f7d3a), dry = new THREE.Color(0x9a9a52), rock = new THREE.Color(0x7d786f), dirt = new THREE.Color(0x8c7c60);
  const sand = new THREE.Color(0xcdbb8c), wet = new THREE.Color(0x8d8466), bed = new THREE.Color(0x5f7a70), road = new THREE.Color(0x8f836a);
  const c = new THREE.Color();
  for (let i = 0; i < cnt; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), f = hf.free(x, z), ny = nor.getY(i), m = hf.coast(x, z);
    c.copy(grass).lerp(dry, clamp01((h - 1) / 9));
    if (f < 0.25 && m > 20) c.lerp(dirt, clamp01((0.25 - f) / 0.25));
    if (ny < 0.9) c.lerp(rock, clamp01((0.9 - ny) / 0.1));
    if (roads.length && m > 4) c.lerp(road, 1 - smooth(clamp01((roadDist(roads, x, z) - 1.6) / 2.6)));
    c.lerp(sand, 1 - smooth(clamp01((m - 4) / 12))); // plage
    if (h < SEA + 0.3) c.lerp(h < -1.6 ? bed : wet, 0.8);
    const n = 0.93 + 0.14 * (0.5 + 0.5 * Math.sin(x * 1.7 + Math.cos(z * 2.3) * 2.1) * Math.sin(z * 1.3 + x * 0.4));
    col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tex = grassTexture();
  tex.repeat.set(size / 7, size / 7);
  const mesh = new THREE.Mesh(geo, terrainMaterial(tex));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Mer : grand plan semi-transparent à SEA (reflet du soleil par spéculaire), débordant très loin dans la brume.
export function buildWater(scene) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x2a7fa0, specular: 0xffffff, shininess: 110, transparent: true, opacity: 0.84, side: THREE.DoubleSide }),
  );
  m.position.y = SEA;
  m.receiveShadow = false;
  scene.add(m);
}

// Chaîne de montagnes lointaines (décor), noyée dans la brume.
export function buildMountains(scene, seed) {
  const r = rng((seed | 0) + 99), N = 36;
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshLambertMaterial({ flatShading: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + r() * 0.2, d = 400 + r() * 70, w = 70 + r() * 60, h = 45 + r() * 60;
    p.set(Math.cos(a) * d, h / 2 - 6, Math.sin(a) * d); s.set(w, h, w);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 3);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.58, 0.18, 0.38 + r() * 0.12));
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
}

// Ciel : dégradé, nuages procéduraux, soleil (disque HDR pour le bloom) et halo ; couleurs définies en sRGB puis converties
// (tone mapping et espace colorimétrique appliqués comme pour les autres matériaux). Dôme centré sur la carte, indépendant du brouillard.
export const HORIZON = 0xd4e3f0; // = couleur du brouillard
function skyMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 sun;
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ return vn(p) * 0.5 + vn(p * 2.1) * 0.25 + vn(p * 4.3) * 0.125 + vn(p * 8.7) * 0.0625; }
      void main(){
        vec3 d = normalize(vD); float h = clamp(d.y, -0.2, 1.0);
        vec3 top = lin(vec3(0.17,0.38,0.80)), mid = lin(vec3(0.46,0.69,0.92)), hor = lin(vec3(0.83,0.89,0.94));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.3, h)); c = mix(c, top, smoothstep(0.2, 0.95, h));
        float s = max(dot(d, sun), 0.0);
        // nuages : plan projeté, bords doux, face éclairée côté soleil
        vec2 q = d.xz / (d.y + 0.18) * 0.55;
        float n = fbm(q + vec2(3.0, 1.0)), cl = smoothstep(0.5, 0.78, n) * smoothstep(0.03, 0.22, d.y);
        float lit = fbm(q + vec2(3.0, 1.0) + sun.xz * 0.08);
        vec3 cc = mix(lin(vec3(0.62,0.68,0.78)), lin(vec3(1.0,0.98,0.95)), clamp(0.55 + (n - lit) * 3.0, 0.0, 1.0));
        c = mix(c, cc, cl * 0.9);
        c += lin(vec3(1.0,0.88,0.62)) * (pow(s, 1200.0) * 40.0 + pow(s, 60.0) * 0.6 + pow(s, 7.0) * 0.14);
        c = mix(c, hor, (1.0 - smoothstep(0.0, 0.12, h)) * 0.8); // voile d'horizon
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Le ciel est statique : on le pré-calcule une fois dans un cube (HDR) au lancement du jeu ; chaque partie l'utilise comme fond.
let skyCube = null;
export function bakeSky(renderer, sunDir) {
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), skyMaterial(sunDir)));
  const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(0.1, 1000, rt).update(renderer, sc);
  skyCube = rt.texture;
}
export function buildSky(scene, sunDir) {
  if (skyCube) { scene.background = skyCube; return; }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), skyMaterial(sunDir));
  sky.renderOrder = -10;
  scene.add(sky);
}
