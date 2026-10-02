import * as THREE from 'three';
import { World } from './world.js';
import { rng } from './testScene.js';
import { Heightfield, buildTerrainMesh, buildMountains, buildSky } from './terrain.js';
import { buildBuilding } from './buildings.js';
import { makeTrees, makeRocks } from './props.js';

export const HALF = 120;
const WALLS = [[0x9a9ea6, 0x6c7078], [0xb7a88c, 0x7d7058], [0x94604f, 0x5e3c33], [0x7f93a6, 0x56667a], [0xa9a39a, 0x6f6a62]];
const CRATE = [0xb08a60, 0xa07a50, 0xc09a68, 0x9a7048];
const CONTAINER = [0x3d6a8f, 0x8f3d3d, 0x4f7a4a, 0xb0842f];

// Carte « Île » : 240×240 m, relief (collines, plaines plates autour des bâtiments), bâtiments à étages et toits praticables,
// tours + tyroliennes, caisses, conteneurs, rochers, arbres, jump pads. Générée uniquement depuis la graine.
// opts.shadows : ombres du soleil (suit le joueur, voir World.followSun).
export function buildIsland(scene, seed = 1, opts = {}) {
  const r = rng(seed);
  scene.background = new THREE.Color(0xcfe0ee);
  scene.fog = new THREE.Fog(0xcfe0ee, 90, 340);
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x66724e, 0.95));
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.55);
  if (opts.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -50; sc.right = sc.top = 50; sc.near = 20; sc.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  }
  sun.position.set(60, 100, 30);
  scene.add(sun, sun.target);
  buildSky(scene, new THREE.Vector3(60, 100, 30));
  buildMountains(scene, seed);

  // ---- 1. plan : sites des bâtiments et tours (avant le relief, qui s'aplatit autour d'eux) ----
  const sites = [{ cx: 0, cz: 0, sx: 26, sz: 26, floors: 3 }];
  for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
    if (gx === 0 && gz === 0) continue;
    const k = r(), cx = gx * 65 + (r() - 0.5) * 16, cz = gz * 65 + (r() - 0.5) * 16;
    if (k < 0.35) sites.push({ cx, cz, sx: 14 + r() * 3, sz: 14 + r() * 3, floors: r() < 0.3 ? 2 : 1 });
    else if (k < 0.75) sites.push({ cx, cz, sx: 18 + r() * 5, sz: 18 + r() * 5, floors: 2 });
    else sites.push({ cx, cz, sx: 25 + r() * 6, sz: 25 + r() * 6, floors: 3 });
  }
  const towers = [[-100, -50], [95, 40], [20, 100]];
  const zones = [];
  for (const s of sites) { const rf = Math.max(s.sx, s.sz) * 0.72 + 3; zones.push([s.cx, s.cz, rf, rf + 16]); }
  for (const [x, z] of towers) zones.push([x, z + 5, 12, 30]);

  const hf = new Heightfield(HALF, seed, zones);
  buildTerrainMesh(scene, hf);

  const w = new World(scene);
  w.groundY = (x, z) => hf.at(x, z);
  w.colliders.terrain = hf; w.hf = hf;
  w.sun = opts.shadows ? sun : null;
  const c = w.colliders;
  const lootPoints = [], poi = [], solids = [], buildingsInfo = [];
  const near = (x, z, m) => solids.some((s) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m);

  // Enceinte (haute : le relief est plat contre elle)
  const E = HALF + 2, WH = 20;
  w.box(-E, -2, -E, E, WH, -HALF, 0x5a6472, 2); w.box(-E, -2, HALF, E, WH, E, 0x5a6472, 2);
  w.box(-E, -2, -HALF, -HALF, WH, HALF, 0x5a6472, 2); w.box(HALF, -2, -HALF, E, WH, HALF, 0x5a6472, 2);

  // ---- 2. bâtiments ----
  for (const s of sites) {
    const [wall, trim] = WALLS[(r() * WALLS.length) | 0];
    const b = buildBuilding(w, r, { ...s, wall, trim });
    for (const p of b.lootPoints) lootPoints.push(p);
    buildingsInfo.push(b);
    solids.push(b.solid);
    poi.push([s.cx, s.cz]);
  }

  // ---- 3. tours (escalier 13 marches de 0,5 m) reliées par une tyrolienne ----
  const tops = [];
  for (const [x, z] of towers) {
    const H = 6.5;
    w.box(x - 3, 0, z - 3, x + 3, H, z + 3, 0x7a8896, 0);
    w.box(x - 3.3, H, z - 3.3, x + 3.3, H + 0.4, z + 3.3, 0x5c6874, 0);
    for (let i = 0; i < 13; i++) w.box(x - 1.5, 0, z + 3 + 0.8 * (12 - i), x + 1.5, (i + 1) * 0.5, z + 3 + 0.8 * (13 - i), 0xa0aab4, 0);
    solids.push([x - 3.3, z - 3.3, x + 3.3, z + 3 + 10.4]);
    poi.push([x, z + 8]); lootPoints.push([x, z, H + 0.4], [x + 1, z + 1, H + 0.4]);
    tops.push([x, z]);
  }
  const top = 6.5 + 2.0;
  w.zip(tops[0][0], top, tops[0][1], tops[1][0], top, tops[1][1]);
  w.zip(tops[1][0], top, tops[1][1], tops[2][0], top, tops[2][1]);

  // ---- 4. couvertures : caisses, conteneurs, rochers ----
  const rocks = [];
  const pick = (a) => a[(r() * a.length) | 0];
  const cell = (x0, z0, x1, z1) => {
    const g = [hf.at(x0, z0), hf.at(x1, z0), hf.at(x0, z1), hf.at(x1, z1)];
    return [Math.min(...g), Math.max(...g)];
  };
  for (let i = 0; i < 90; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 8), z = (r() - 0.5) * 2 * (HALF - 8), k = r();
    if (near(x, z, 3) || Math.hypot(x, z) < 6) continue;
    if (k < 0.55) { // caisses (parfois empilées)
      const s = 1.1 + r() * 1.3, [lo, hi] = cell(x, z, x + s, z + s);
      w.box(x, lo - 0.4, z, x + s, hi + s, z + s, pick(CRATE), 1);
      if (r() < 0.35) w.box(x + 0.2, hi + s, z + 0.2, x + s - 0.2, hi + s * 1.7, z + s - 0.2, pick(CRATE), 1);
      solids.push([x, z, x + s, z + s]);
      if (r() < 0.3) lootPoints.push([x + s + 1, z + s / 2, hf.at(x + s + 1, z + s / 2)]);
    } else if (k < 0.7) { // conteneur
      const alongX = r() < 0.5, lx = alongX ? 6 : 2.4, lz = alongX ? 2.4 : 6, [lo, hi] = cell(x, z, x + lx, z + lz);
      w.box(x, lo - 0.4, z, x + lx, hi + 2.6, z + lz, pick(CONTAINER), 3);
      solids.push([x, z, x + lx, z + lz]);
    } else { // rocher
      const rx = 1.2 + r() * 2.2, rz = 1.2 + r() * 2.2, ry = 0.9 + r() * 1.6, gy = hf.at(x, z);
      rocks.push([x, gy + ry * 0.35, z, rx, ry, rz, r() * 3, r()]);
      const h = Math.min(rx, rz) * 0.62;
      c.add(x - h, gy - 0.3, z - h, x + h, gy + ry * 1.2, z + h);
      solids.push([x - rx, z - rz, x + rx, z + rz]);
    }
  }
  makeRocks(scene, rocks);

  // ---- 5. arbres (hors zones plates), tronc = collision ----
  const trees = [];
  for (let i = 0; i < 260 && trees.length < 150; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 10), z = (r() - 0.5) * 2 * (HALF - 10);
    if (hf.free(x, z) < 0.9 || hf.slope(x, z) > 0.45 || near(x, z, 4) || Math.hypot(x, z) < 10) continue;
    const gy = hf.at(x, z), k = 0.8 + r() * 0.8;
    trees.push([x, gy - 0.1, z, k, r()]);
    c.add(x - 0.3 * k, gy - 0.4, z - 0.3 * k, x + 0.3 * k, gy + 3.6 * k, z + 0.3 * k);
  }
  makeTrees(scene, trees);

  // ---- 6. jump pads vers le centre ----
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, d = 40 + r() * 50, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (near(x, z, 3)) continue;
    w.pad(x, z, 18, -Math.cos(a), -Math.sin(a), 10);
  }

  // ---- 7. butin au sol, un peu partout ----
  for (let i = 0; i < 110; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 6), z = (r() - 0.5) * 2 * (HALF - 6), g = hf.at(x, z);
    if (!c.query(x, g, z, 0.5, 2)) lootPoints.push([x, z, g]);
  }

  // ---- 8. apparitions : candidats loin des bâtiments, pente douce (Match choisit les plus éloignés entre eux) ----
  const spawns = [];
  for (let i = 0; i < 160 && spawns.length < 90; i++) {
    const a = r() * 6.2832, d = 35 + r() * 73, x = Math.cos(a) * d, z = Math.sin(a) * d, g = hf.at(x, z);
    if (c.query(x, g, z, 1.5, 2) || hf.slope(x, z) > 0.4) continue;
    spawns.push({ x, z, yaw: Math.atan2(x, z) });
  }
  w.finalize();
  w.half = HALF; w.lootPoints = lootPoints; w.poi = poi; w.spawns = spawns; w.rand = r; w.buildings = buildingsInfo;
  return w;
}
