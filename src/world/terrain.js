import * as THREE from 'three';
import { rng } from './testScene.js';
import { terrainMaterial } from './skin.js';

const CELL = 1;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Relief : carte de hauteurs précalculée (1 m), échantillonnée par interpolation bilinéaire (aucune allocation).
// Déterministe d'après la graine : hôte et clients obtiennent exactement le même terrain.
// zones : [x, z, rayon plat, rayon de fondu] — le relief s'aplatit autour des bâtiments et des tours.
export class Heightfield {
  constructor(half, seed, zones) {
    this.half = half; this.ext = half + 24;
    const n = this.n = Math.ceil((2 * this.ext) / CELL) + 1;
    this.h = new Float32Array(n * n);
    this.flat = new Float32Array(n * n); // 0 = zone plate, 1 = relief libre
    this.max = 0;
    const r = rng((seed | 0) * 7 + 13);
    const hills = [];
    for (let i = 0; i < 7; i++) {
      const s = 16 + r() * 24;
      hills.push([(r() - 0.5) * 2 * (half - 8), (r() - 0.5) * 2 * (half - 8), s, Math.min(s * 0.25, 2 + r() * 3.5)]);
    }
    const L = 64, lat = new Float32Array(L * L);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const vn = (x, z) => {
      const xi = Math.floor(x), zi = Math.floor(z), fx = smooth(x - xi), fz = smooth(z - zi);
      const a = lat[(zi & 63) * L + (xi & 63)], b = lat[(zi & 63) * L + ((xi + 1) & 63)];
      const c = lat[((zi + 1) & 63) * L + (xi & 63)], d = lat[((zi + 1) & 63) * L + ((xi + 1) & 63)];
      return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.ext + i * CELL, z = -this.ext + j * CELL;
        let v = 0;
        for (let k = 0; k < hills.length; k++) {
          const hl = hills[k], dx = x - hl[0], dz = z - hl[1];
          v += hl[3] * Math.exp(-(dx * dx + dz * dz) / (2 * hl[2] * hl[2]));
        }
        v += (vn(x * 0.05, z * 0.05) - 0.5) * 1.8 + (vn(x * 0.17, z * 0.17) - 0.5) * 0.5;
        if (v > 3) v = 3 + (v - 3) * 0.4; // compresse les cumuls de collines superposées
        let f = 1;
        for (let k = 0; k < zones.length; k++) {
          const q = zones[k], d = Math.hypot(x - q[0], z - q[1]);
          const t = smooth(clamp01((d - q[2]) / (q[3] - q[2])));
          if (t < f) f = t;
        }
        f *= smooth(clamp01((half - 4 - Math.max(Math.abs(x), Math.abs(z))) / 26)); // plat contre l'enceinte
        v *= f;
        if (v < -1.5) v = -1.5;
        this.h[j * n + i] = v; this.flat[j * n + i] = f;
        if (v > this.max) this.max = v;
      }
    }
  }

  at(x, z) {
    const n = this.n, u = (x + this.ext) / CELL, v = (z + this.ext) / CELL;
    if (u < 0 || v < 0 || u >= n - 1 || v >= n - 1) return 0;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * n + i, h = this.h;
    return (h[k] * (1 - fu) + h[k + 1] * fu) * (1 - fv) + (h[k + n] * (1 - fu) + h[k + n + 1] * fu) * fv;
  }

  // 0 = zone plate (bâtiment), 1 = relief libre
  free(x, z) {
    const n = this.n, i = Math.round((x + this.ext) / CELL), j = Math.round((z + this.ext) / CELL);
    return i < 0 || j < 0 || i >= n || j >= n ? 0 : this.flat[j * n + i];
  }

  slope(x, z) { return Math.hypot(this.at(x + 1, z) - this.at(x - 1, z), this.at(x, z + 1) - this.at(x, z - 1)) / 2; }
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
export function buildTerrainMesh(scene, hf) {
  const seg = 176, size = hf.ext * 2;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cnt = pos.count;
  for (let i = 0; i < cnt; i++) pos.setY(i, hf.at(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, col = new Float32Array(cnt * 3);
  const grass = new THREE.Color(0x4f7d3a), dry = new THREE.Color(0x9a9a52), rock = new THREE.Color(0x7d786f), dirt = new THREE.Color(0x8c7c60), low = new THREE.Color(0x3d6330);
  const c = new THREE.Color();
  for (let i = 0; i < cnt; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), f = hf.free(x, z), ny = nor.getY(i);
    c.copy(grass).lerp(dry, clamp01((h - 1) / 9));
    if (h < -0.3) c.lerp(low, clamp01(-h / 1.2));
    if (f < 0.45) c.lerp(dirt, clamp01((0.45 - f) / 0.35));
    if (ny < 0.9) c.lerp(rock, clamp01((0.9 - ny) / 0.1));
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

// Chaîne de montagnes lointaines (décor), noyée dans la brume.
export function buildMountains(scene, seed) {
  const r = rng((seed | 0) + 99), N = 30;
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshLambertMaterial({ flatShading: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + r() * 0.2, d = 230 + r() * 50, w = 45 + r() * 50, h = 40 + r() * 60;
    p.set(Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d); s.set(w, h, w);
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
export function buildSky(scene, sunDir) {
  const mat = new THREE.ShaderMaterial({
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), mat);
  sky.renderOrder = -10;
  scene.add(sky);
}
