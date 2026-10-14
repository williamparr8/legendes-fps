import * as THREE from 'three';
import { World } from './world.js';
import { rng } from './testScene.js';
import { Heightfield, makeCoast, roadDist, buildTerrainMesh, buildWater, buildMountains, buildSky, getSkyEnv, HORIZON } from './terrain.js';
import { buildBuilding } from './buildings.js';
import { buildDecor } from './decor.js';
import { makeTrees, makeRocks, makeBushes, makeGrass } from './props.js';

export const HALF = 270;        // demi-taille de référence (vaisseau, zone) ; le relief s'étend à HALF + 24
export const EXT = HALF + 24;
const WALLS = [[0x9a9ea6, 0x6c7078], [0xb7a88c, 0x7d7058], [0x94604f, 0x5e3c33], [0x7f93a6, 0x56667a], [0xa9a39a, 0x6f6a62]];
const CRATE = [0xb08a60, 0xa07a50, 0xc09a68, 0x9a7048];
const CONTAINER = [0x3d6a8f, 0x8f3d3d, 0x4f7a4a, 0xb0842f];
// Poids (caisse, conteneur, rocher) du décor par lieu
const DECOR = { Port: [0.35, 0.55, 0.1], Usine: [0.35, 0.55, 0.1], Ferme: [0.6, 0.1, 0.3], Ruines: [0.4, 0.1, 0.5], 'Base militaire': [0.35, 0.45, 0.2] };

// Carte « Île » : île irrégulière d'environ 430 m (silhouette générée, plages, mer), lieux nommés (citadelle, village, base militaire,
// usine, ferme, port, ruines, hameau, phare) reliés par des routes, forêts par amas, massifs, tours + tyroliennes, jump pads.
// Générée uniquement depuis la graine. opts.shadows : ombres du soleil (suit le joueur, voir World.followSun).
export function buildIsland(scene, seed = 1, opts = {}) {
  const r = rng(seed);
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 80, 440);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x6a7550, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
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
  if (getSkyEnv()) { scene.environment = getSkyEnv(); scene.environmentIntensity = 0.42; }
  buildMountains(scene, seed);
  buildWater(scene);

  const coast = makeCoast(seed);

  // ---- 1. plan : lieux, bâtiments, tours, massifs (avant le relief, qui s'aplatit autour des bâtiments et des tours) ----
  const sites = [], places = [{ name: 'Citadelle', x: 0, z: 0, r: 48 }];
  const addB = (cx, cz, sx, sz, floors, style = 'default') => {
    const rf = Math.max(sx, sz) * 0.72 + 3;
    if (coast(cx, cz) < rf + 24) return false;
    for (const s of sites) if (Math.abs(cx - s.cx) < (sx + s.sx) / 2 + 5 && Math.abs(cz - s.cz) < (sz + s.sz) / 2 + 5) return false;
    sites.push({ cx, cz, sx, sz, floors, style });
    return true;
  };
  const small = () => [14 + r() * 3, 14 + r() * 3, r() < 0.3 ? 2 : 1];
  const medium = () => [18 + r() * 5, 18 + r() * 5, 2];
  const put = (x, z, s, st) => addB(x, z, s[0], s[1], s[2], st);
  const LAYOUT = {
    Citadelle: (x, z) => {
      addB(x, z, 26, 26, 3, 'default');
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(x + a * 42 + (r() - 0.5) * 8, z + b * 42 + (r() - 0.5) * 8, r() < 0.5 ? medium() : small(), r() < 0.5 ? 'default' : 'house');
    },
    Village: (x, z) => {
      const alongX = r() < 0.5;
      for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) {
        if (r() < 0.2) continue;
        const u = i * 23 + (r() - 0.5) * 4, v = s * (16 + (r() - 0.5) * 4), big = r() >= 0.8;
        put(alongX ? x + u : x + v, alongX ? z + v : z + u, big ? medium() : small(), big ? 'default' : 'house');
      }
    },
    'Base militaire': (x, z) => {
      addB(x, z, 28, 28, 3, 'military');
      put(x - 36, z - 6, medium(), 'military'); put(x + 36, z + 8, medium(), 'military'); if (r() < 0.7) put(x + 2, z + 38, small(), 'military');
    },
    Usine: (x, z) => { addB(x - 21, z, 30, 26, 3, 'industrial'); addB(x + 21, z + 4, 28, 22, 2, 'industrial'); put(x, z - 32, small(), 'warehouse'); },
    Ferme: (x, z) => { addB(x, z, 24, 16, 1, 'farm'); addB(x + 26, z - 4, 14, 14, 2, 'farm'); addB(x - 24, z + 14, 14, 14, 1, 'farm'); },
    Port: (x, z) => { addB(x - 21, z, 26, 16, 1, 'warehouse'); addB(x + 21, z + 2, 26, 16, 1, 'warehouse'); },
    Ruines: (x, z) => { for (let k = 0; k < 3; k++) addB(x + (r() - 0.5) * 44, z + (r() - 0.5) * 44, 14 + r() * 3, 14 + r() * 3, 1, 'ruin'); },
    Hameau: (x, z) => { for (let k = 0; k < 3; k++) put(x + (r() - 0.5) * 46, z + (r() - 0.5) * 46, small(), 'house'); },
    Phare: (x, z) => { addB(x, z, 11, 11, 4, 'phare'); },
  };
  LAYOUT.Citadelle(0, 0);
  for (const [name, rad, lo, hi] of [['Village', 52, 45, 1e9], ['Base militaire', 48, 50, 1e9], ['Usine', 44, 50, 1e9], ['Ferme', 36, 45, 1e9],
    ['Port', 40, 40, 58], ['Ruines', 34, 45, 1e9], ['Hameau', 32, 45, 1e9], ['Phare', 14, 36, 48]]) {
    for (let t = 0; t < 500; t++) {
      const a = r() * 6.2832, d = 45 + r() * 210, x = Math.cos(a) * d, z = Math.sin(a) * d, m = coast(x, z);
      if (m < lo || m > hi || !places.every((p) => Math.hypot(x - p.x, z - p.z) > rad + p.r + 14)) continue;
      places.push({ name, x, z, r: rad });
      LAYOUT[name](x, z);
      break;
    }
  }
  // tours (escalier 13 marches de 0,5 m au sud) : 8 emplacements répartis autour de l'île
  const free = (x0, z0, x1, z1, m) => !sites.some((s) => x1 + m > s.cx - s.sx / 2 && x0 - m < s.cx + s.sx / 2 && z1 + m > s.cz - s.sz / 2 && z0 - m < s.cz + s.sz / 2);
  const towers = [];
  for (let k = 0; k < 8; k++) {
    for (let t = 0; t < 30; t++) {
      const a = k * 0.7854 + (r() - 0.5) * 0.5, d = 85 + r() * 90, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (coast(x, z + 5) < 50 || !free(x - 6, z - 6, x + 6, z + 16, 14)) continue;
      if (towers.some((q) => Math.hypot(q[0] - x, q[1] - z) < 36)) continue;
      towers.push([x, z]);
      break;
    }
  }
  // massifs : 3 grosses collines loin des bâtiments
  const hills = [];
  for (let k = 0; k < 3; k++) {
    for (let t = 0; t < 40; t++) {
      const a = r() * 6.2832, d = 70 + r() * 110, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 28 + r() * 16;
      if (coast(x, z) < 70 || sites.some((q) => Math.hypot(x - q.cx, z - q.cz) < s * 1.3 + Math.max(q.sx, q.sz)) || towers.some((q) => Math.hypot(x - q[0], z - q[1]) < s * 1.3 + 25)) continue;
      hills.push([x, z, s, 12 + r() * 10]);
      break;
    }
  }
  // routes : arbre couvrant minimal entre les lieux (un coude par tronçon)
  const roads = [], inTree = [0], rest = places.map((_, i) => i).slice(1);
  while (rest.length) {
    let bi = 0, bj = 0, bd = 1e9;
    for (const i of inTree) for (const j of rest) {
      const d = Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const A = places[bi], B = places[bj], mx = (A.x + B.x) / 2 + (r() - 0.5) * 30, mz = (A.z + B.z) / 2 + (r() - 0.5) * 30;
    roads.push([A.x, A.z, mx, mz], [mx, mz, B.x, B.z]);
    inTree.push(bj); rest.splice(rest.indexOf(bj), 1);
  }

  const zones = [];
  for (const s of sites) { const rf = Math.max(s.sx, s.sz) * 0.72 + 3; zones.push([s.cx, s.cz, rf, rf + 16]); }
  for (const [x, z] of towers) zones.push([x, z + 5, 12, 30]);

  const hf = new Heightfield(HALF, seed, zones, coast, hills);
  buildTerrainMesh(scene, hf, roads);

  const w = new World(scene);
  w.groundY = (x, z) => hf.at(x, z);
  w.colliders.terrain = hf; w.hf = hf;
  w.sun = opts.shadows ? sun : null;
  const c = w.colliders;
  const lootPoints = [], poi = [], solids = [], buildingsInfo = [];
  const near = (x, z, m) => solids.some((s) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m);

  // ---- 2. bâtiments ----
  for (const s of sites) {
    const [wall, trim] = WALLS[(r() * WALLS.length) | 0];
    const b = buildBuilding(w, r, { ...s, wall, trim });
    for (const p of b.lootPoints) lootPoints.push(p);
    buildingsInfo.push(b);
    solids.push(b.solid);
  }
  for (const p of places) if (p.name !== 'Phare') poi.push([p.x, p.z]);
  for (const p of places) if (p.name === 'Phare') poi.push([p.x, p.z + 12]);

  // ---- 3. tours reliées par des tyroliennes ----
  const tops = [];
  for (const [x, z] of towers) {
    const H = 6.5;
    w.box(x - 3, 0, z - 3, x + 3, H, z + 3, 0x7a8896, 0);
    w.box(x - 3.3, H, z - 3.3, x + 3.3, H + 0.4, z + 3.3, 0x5c6874, 0);
    for (let i = 0; i < 13; i++) w.box(x - 1.5, 0, z + 3 + 0.8 * (12 - i), x + 1.5, (i + 1) * 0.5, z + 3 + 0.8 * (13 - i), 0xa0aab4, 0);
    solids.push([x - 3.3, z - 3.3, x + 3.3, z + 3 + 10.4]);
    poi.push([x, z + 8]); lootPoints.push([x - 2.4, z - 2.4, H + 0.4], [x + 2.4, z - 2.4, H + 0.4]); // aux coins : loin du câble, pour ne pas bloquer E (tyrolienne)
    tops.push([x, z]);
  }

  // ---- 4. couvertures : caisses, conteneurs, rochers (par lieu, puis dispersés) ----
  const rocks = [];
  const pick = (a) => a[(r() * a.length) | 0];
  const cell = (x0, z0, x1, z1) => {
    const g = [hf.at(x0, z0), hf.at(x1, z0), hf.at(x0, z1), hf.at(x1, z1)];
    return [Math.min(...g), Math.max(...g)];
  };
  const decor = (x, z, wt) => {
    const k = r();
    if (coast(x, z) < 14 || near(x, z, 3) || Math.hypot(x, z) < 6 || roadDist(roads, x, z) < 3.5 || hf.slope(x, z) > 0.45) return;
    if (k < wt[0]) { // caisses (parfois empilées)
      const s = 1.1 + r() * 1.3, [lo, hi] = cell(x, z, x + s, z + s);
      w.box(x, lo - 0.4, z, x + s, hi + s, z + s, pick(CRATE), 1);
      if (r() < 0.35) w.box(x + 0.2, hi + s, z + 0.2, x + s - 0.2, hi + s * 1.7, z + s - 0.2, pick(CRATE), 1);
      solids.push([x, z, x + s, z + s]);
      if (r() < 0.3) lootPoints.push([x + s + 1, z + s / 2, hf.at(x + s + 1, z + s / 2)]);
    } else if (k < wt[0] + wt[1]) { // conteneur
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
  };
  for (const p of places) {
    if (p.name === 'Phare') continue;
    const wt = DECOR[p.name] || [0.5, 0.15, 0.35], n = Math.round(p.r / 3);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.2832, d = Math.sqrt(r()) * p.r;
      decor(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, wt);
    }
  }
  for (let i = 0; i < 90; i++) decor((r() - 0.5) * 2 * (HALF - 20), (r() - 0.5) * 2 * (HALF - 20), [0.35, 0.1, 0.55]);
  // merlons de sacs/béton autour des bases militaires (4 côtés, passages tous les 18 m)
  for (const p of places) {
    if (p.name !== 'Base militaire') continue;
    const S = 46;
    for (let u = -S; u < S - 8; u += 18) {
      for (const [x0, z0, x1, z1] of [[p.x + u, p.z - S, p.x + u + 12, p.z - S + 0.9], [p.x + u, p.z + S, p.x + u + 12, p.z + S + 0.9],
        [p.x - S, p.z + u, p.x - S + 0.9, p.z + u + 12], [p.x + S, p.z + u, p.x + S + 0.9, p.z + u + 12]]) {
        if (coast(x0, z0) < 12 || coast(x1, z1) < 12) continue;
        const [lo, hi] = cell(x0, z0, x1, z1);
        w.box(x0, lo - 0.4, z0, x1, hi + 1.3, z1, 0x9a9a8a, 0);
        solids.push([x0, z0, x1, z1]);
      }
    }
  }
  buildDecor(w, { r, hf, coast, roads, places, solids, near });
  makeRocks(scene, rocks);

  // ---- 5. forêts par amas (tronc = collision), arbres isolés, buissons, herbe ----
  const trees = [];
  const plant = (x, z) => {
    if (trees.length >= 420 || hf.free(x, z) < 0.9 || hf.slope(x, z) > 0.45 || near(x, z, 4) || Math.hypot(x, z) < 10 || roadDist(roads, x, z) < 5) return;
    const gy = hf.at(x, z), k = 0.8 + r() * 0.8;
    trees.push([x, gy - 0.1, z, k, r()]);
    c.add(x - 0.3 * k, gy - 0.4, z - 0.3 * k, x + 0.3 * k, gy + 3.6 * k, z + 0.3 * k);
  };
  for (let f = 0; f < 18; f++) {
    const a = r() * 6.2832, d = 20 + r() * 210, cx = Math.cos(a) * d, cz = Math.sin(a) * d, rad = 18 + r() * 20;
    if (coast(cx, cz) < 18) continue;
    for (let i = 0; i < 26; i++) {
      const b = r() * 6.2832, e = Math.sqrt(r()) * rad;
      plant(cx + Math.cos(b) * e, cz + Math.sin(b) * e);
    }
  }
  for (let i = 0; i < 90; i++) plant((r() - 0.5) * 2 * (HALF - 10), (r() - 0.5) * 2 * (HALF - 10));
  makeTrees(scene, trees);
  const ok = (x, z, m) => hf.free(x, z) > 0.9 && hf.slope(x, z) < 0.5 && !near(x, z, m) && Math.hypot(x, z) > 6 && roadDist(roads, x, z) > 3;
  makeBushes(scene, hf, seed, ok, 150);
  makeGrass(scene, hf, seed, ok, 10000);

  // ---- 5b. tyroliennes : ancrages = sommets des tours (câble à 9,2 m) et mâts des grands toits (câble à 3,3 m au-dessus du toit,
  // au-dessus du parapet). Une ligne qui toucherait relief, bâtiment ou arbre est refusée (échantillon tous les mètres).
  const anchors = tops.map(([x, z]) => ({ x, z, y: 9.2 }));
  for (const b of buildingsInfo) if (b.zip) anchors.push({ x: b.zip[0], z: b.zip[1], y: b.roof + 3.3 });
  const clear = (a, b) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > 260 || len < 35) return false;
    for (let d = 2.5; d <= len - 2.5; d += 1) {
      const t = d / len, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, feet = a.y + (b.y - a.y) * t - 1.95;
      if (hf.at(x, z) + 0.6 > feet || c.query(x, feet, z, 0.5, 1.9)) return false;
    }
    return true;
  };
  const pairs = [], deg = anchors.map(() => 0);
  for (let p = 0; p < anchors.length; p++) for (let q = p + 1; q < anchors.length; q++) pairs.push([p, q, Math.hypot(anchors[p].x - anchors[q].x, anchors[p].z - anchors[q].z)]);
  pairs.sort((u, v) => u[2] - v[2]); // les lignes les plus courtes d'abord, 3 lignes au plus par ancrage
  for (const [p, q] of pairs) {
    if (deg[p] >= 3 || deg[q] >= 3 || !clear(anchors[p], anchors[q])) continue;
    w.zip(anchors[p].x, anchors[p].y, anchors[p].z, anchors[q].x, anchors[q].y, anchors[q].z); deg[p]++; deg[q]++;
  }

  // ---- 6. jump pads vers le centre ----
  for (let i = 0, k = 0; i < 20 && k < 6; i++) {
    const a = r() * 6.2832, d = 70 + r() * 110, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (near(x, z, 3) || coast(x, z) < 25 || hf.slope(x, z) > 0.3) continue;
    w.pad(x, z, 18, -Math.cos(a), -Math.sin(a), 10); k++;
  }

  // ---- 7. butin au sol, un peu partout (sur la terre ferme) ----
  for (let i = 0, k = 0; i < 1100 && k < 320; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 10), z = (r() - 0.5) * 2 * (HALF - 10);
    if (coast(x, z) < 10) continue;
    const g = hf.at(x, z);
    if (!c.query(x, g, z, 0.5, 2)) { lootPoints.push([x, z, g]); k++; }
  }

  // ---- 8. apparitions : candidats sur la terre, loin des bâtiments, pente douce (Match choisit les plus éloignés entre eux) ----
  const spawns = [];
  for (let i = 0; i < 700 && spawns.length < 120; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 20), z = (r() - 0.5) * 2 * (HALF - 20), g = hf.at(x, z);
    if (coast(x, z) < 25 || c.query(x, g, z, 1.5, 2) || hf.slope(x, z) > 0.4) continue;
    spawns.push({ x, z, yaw: Math.atan2(x, z) });
  }
  w.finalize();
  w.half = HALF; w.ext = EXT; w.lootPoints = lootPoints; w.poi = poi; w.spawns = spawns; w.rand = r; w.buildings = buildingsInfo;
  w.places = places; w.roads = roads; w.coast = coast; w.towers = towers;
  return w;
}
