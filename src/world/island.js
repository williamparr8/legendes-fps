import * as THREE from 'three';
import { World } from './world.js';
import { rng, gridTexture } from './testScene.js';

export const HALF = 120;
const WALL_H = 4.2;

// Carte « Île » : 240×240 m, bâtiments à portes, tours + tyroliennes, caisses, jump pads.
// Retourne le monde + points d'apparition, points de butin et points d'intérêt (navigation des bots).
export function buildIsland(scene, seed = 1) {
  const r = rng(seed);
  scene.background = new THREE.Color(0x9ec7e8);
  scene.fog = new THREE.Fog(0x9ec7e8, 70, 240);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 100, 30);
  scene.add(sun);
  const tex = gridTexture();
  tex.repeat.set(HALF * 2, HALF * 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const w = new World(scene);
  const c = w.colliders;
  const lootPoints = [], poi = [], solids = [];
  const near = (x, z, m) => solids.some((s) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m);

  // Enceinte
  const E = HALF + 2;
  w.box(-E, 0, -E, E, 8, -HALF, 0x556070); w.box(-E, 0, HALF, E, 8, E, 0x556070);
  w.box(-E, 0, -HALF, -HALF, 8, HALF, 0x556070); w.box(HALF, 0, -HALF, E, 8, HALF, 0x556070);

  // Bâtiment : 4 murs, 2 côtés avec porte de 3,6 m, toit, caisses intérieures.
  function building(cx, cz, sx, sz) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, t = 0.25, G = 3.6, col = 0x8a8f99;
    const doors = [r() < 0.5 ? 0 : 1, 2 + (r() < 0.5 ? 0 : 1)]; // un côté z (0/1) et un côté x (2/3)
    const segX = (z, door) => { // mur le long de x
      if (!door) return w.box(x0, 0, z - t, x1, WALL_H, z + t, col);
      const g0 = cx - G / 2 + (r() - 0.5) * (sx - G - 3), g1 = g0 + G;
      w.box(x0, 0, z - t, g0, WALL_H, z + t, col); w.box(g1, 0, z - t, x1, WALL_H, z + t, col);
    };
    const segZ = (x, door) => {
      if (!door) return w.box(x - t, 0, z0, x + t, WALL_H, z1, col);
      const g0 = cz - G / 2 + (r() - 0.5) * (sz - G - 3), g1 = g0 + G;
      w.box(x - t, 0, z0, x + t, WALL_H, g0, col); w.box(x - t, 0, g1, x + t, WALL_H, z1, col);
    };
    segX(z0, doors[0] === 0); segX(z1, doors[0] === 1); segZ(x0, doors[1] === 2); segZ(x1, doors[1] === 3);
    w.box(x0 - 0.3, WALL_H, z0 - 0.3, x1 + 0.3, WALL_H + 0.5, z1 + 0.3, 0x6d727c);
    // caisses dans les coins, loin des portes (centre libre)
    for (const [sxn, szn] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + sxn * (sx / 2 - 1.6), pz = cz + szn * (sz / 2 - 1.6);
      if (r() < 0.6) w.box(px - 0.6, 0, pz - 0.6, px + 0.6, 1.1, pz + 0.6, 0xb08a60);
      lootPoints.push([px + sxn * -0.1, pz + szn * -1.4]);
    }
    lootPoints.push([cx, cz]);
    solids.push([x0, z0, x1, z1]);
    poi.push([cx, cz]);
  }
  const sites = [];
  for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
    if (gx === 0 && gz === 0) continue;
    sites.push([gx * 65 + (r() - 0.5) * 20, gz * 65 + (r() - 0.5) * 20]);
  }
  for (const [x, z] of sites) building(x, z, 12 + r() * 6, 12 + r() * 6);
  building(0, 0, 10, 10);

  // Tours (escalier 13 marches de 0,5 m) reliées par une tyrolienne
  const towers = [[-100, -50], [95, 40], [20, 100]];
  const tops = [];
  for (const [x, z] of towers) {
    const H = 6.5;
    w.box(x - 3, 0, z - 3, x + 3, H, z + 3, 0x7a8896);
    for (let i = 0; i < 13; i++) w.box(x - 1.5, 0, z + 3 + 0.8 * (12 - i), x + 1.5, (i + 1) * 0.5, z + 3 + 0.8 * (13 - i), 0xa0aab4);
    solids.push([x - 3, z - 3, x + 3, z + 3 + 10.4]);
    poi.push([x, z + 8]); lootPoints.push([x, z], [x + 1, z + 1]);
    tops.push([x, z]);
  }
  const top = 6.5 + 2.0;
  w.zip(tops[0][0], top, tops[0][1], tops[1][0], top, tops[1][1]);
  w.zip(tops[1][0], top, tops[1][1], tops[2][0], top, tops[2][1]);

  // Caisses et rochers
  for (let i = 0; i < 70; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 8), z = (r() - 0.5) * 2 * (HALF - 8);
    if (near(x, z, 3) || Math.hypot(x, z) < 6) continue;
    const sx = 1 + r() * 3, sz = 1 + r() * 3, sy = 0.8 + r() * 1.8;
    w.box(x, 0, z, x + sx, sy, z + sz, 0x6a7a8a + ((r() * 0x202020) | 0));
    solids.push([x, z, x + sx, z + sz]);
    if (r() < 0.25) lootPoints.push([x + sx + 1, z + sz / 2]);
  }

  // Jump pads vers le centre
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, d = 40 + r() * 50, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (near(x, z, 3)) continue;
    w.pad(x, z, 18, -Math.cos(a), -Math.sin(a), 10);
  }

  // Butin au sol, un peu partout
  for (let i = 0; i < 110; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 6), z = (r() - 0.5) * 2 * (HALF - 6);
    if (!c.query(x, 0, z, 0.5, 2)) lootPoints.push([x, z]);
  }

  // Candidats d'apparition (visage vers le centre) ; Match choisit les plus éloignés entre eux.
  const spawns = [];
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.2832, d = 35 + r() * 73, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!c.query(x, 0, z, 1.5, 2)) spawns.push({ x, z, yaw: Math.atan2(x, z) });
  }
  w.finalize();
  w.half = HALF; w.lootPoints = lootPoints; w.poi = poi; w.spawns = spawns; w.rand = r;
  return w;
}
