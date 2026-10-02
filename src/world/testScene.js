import * as THREE from 'three';
import { World } from './world.js';

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4a3a'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#4d604d'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(300, 300);
  t.anisotropy = 8;
  return t;
}

// Scène de test : stairs, rebords de mantle, tunnel de glissade, pads, tyrolienne, couvertures.
export function buildTestScene(scene) {
  scene.background = new THREE.Color(0x9ec7e8);
  scene.fog = new THREE.Fog(0x9ec7e8, 60, 220);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ map: gridTexture() }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const w = new World(scene);

  // Tour A + escalier (14 marches de 0.5 m)
  w.box(-23, 0, -23, -17, 7, -17, 0x7a8896);
  for (let i = 0; i < 14; i++) {
    w.box(-21.5, 0, -17 + 0.8 * (13 - i), -18.5, (i + 1) * 0.5, -17 + 0.8 * (14 - i), 0xa0aab4);
  }
  // Tour B + tyrolienne A→B
  w.box(27, 0, -23, 33, 4, -17, 0x7a8896);
  w.zip(-20, 9, -20, 26, 6.2, -20);

  // Plateforme haute atteignable par jump pad
  w.box(2, 0, 12, 10, 6, 20, 0x8a7a96);
  w.pad(6, 6, 20, 0, 1, 6); // vy=20, direction +z à 6 m/s

  // Rebords à mantle (1.5, 2.0 ; 2.5 trop haut) et petite marche 0.3
  w.box(-12, 0, 2, -9, 1.5, 3, 0xb08a60);
  w.box(-8, 0, 2, -5, 2.0, 3, 0xb08a60);
  w.box(-4, 0, 2, -1, 4.5, 3, 0xb06060); // trop haut : infranchissable
  w.box(0, 0, 2, 3, 0.3, 3, 0x60a0b0);

  // Tunnel bas (accroupi/glissade) : toit à 1.3 m
  w.box(-3, 0, -14, -2, 1.3, -10, 0x607080);
  w.box(2, 0, -14, 3, 1.3, -10, 0x607080);
  w.box(-3, 1.3, -14, 3, 2.0, -10, 0x708090);

  // Couvertures aléatoires
  const r = rng(7);
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 120, z = (r() - 0.5) * 120;
    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
    if (x > -25 && x < 35 && z > -25 && z < -15) continue;
    if (x > -4 && x < 14 && z > -2 && z < 24) continue;
    if (Math.abs(x) < 8 && z > -18 && z < -8) continue;
    const sx = 1 + r() * 4, sz = 1 + r() * 4, sy = 0.8 + r() * 2.4;
    w.box(x, 0, z, x + sx, sy, z + sz, 0x6a7a8a + ((r() * 0x202020) | 0));
  }

  w.finalize();
  return w;
}
