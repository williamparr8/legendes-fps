import * as THREE from 'three';
import { makeRig } from '../combat/humanoid.js';
import { human } from '../combat/humanrig.js';
import { buildWeaponModel, applyWeaponSkin } from '../combat/models.js';
import { getSkyEnv } from '../world/terrain.js';
import { LIST } from './profile.js';

// Aperçus (miniatures) des skins pour la Boutique et le Pass : chaque skin est rendu une fois dans une petite zone du canvas
// principal puis copié dans une image (dataURL), mise en cache. Le rendu se fait en début de trame du menu (thumbTick), avant le rendu
// principal, donc rien n'est visible à l'écran. Les motifs animés sont figés sur l'instant du rendu.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const SIZE = { perso: [200, 250], arme: [260, 150] };
const BG = 0x111a24;
const cache = new Map(), pending = new Set(), queue = [];
let rigScene = null, wScene = null, c2d = null;

export function thumbUrl(kind, id) {
  const k = kind + ':' + id, u = cache.get(k);
  if (u) return u;
  if (!pending.has(k)) { pending.add(k); queue.push([kind, id]); }
  return BLANK;
}
// <img> d'aperçu ; src remplacé dès que la miniature est prête (voir thumbTick).
export const thumbImg = (kind, id, cls = '') => `<img class="th th-${kind} ${cls}" data-th="${kind}:${id}" src="${thumbUrl(kind, id)}" alt="">`;

const ready = () => human.ready && (Object.keys(human.bodies).length >= 2 || performance.now() > 30000);

function lights(sc) {
  sc.background = new THREE.Color(BG);
  sc.add(new THREE.HemisphereLight(0xcfd8ff, 0x403050, 1.2));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(-2, 3, 4); sc.add(key);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.4); rim.position.set(3, 2, -3); sc.add(rim);
  if (getSkyEnv()) { sc.environment = getSkyEnv(); sc.environmentIntensity = 0.5; }
}

function persoScene() {
  const sc = new THREE.Scene(); lights(sc);
  const g = new THREE.Group(); sc.add(g);
  g.rotation.y = Math.PI - 0.55;
  const m = new THREE.Group(); g.add(m);
  const rig = makeRig(m, true);
  const cam = new THREE.PerspectiveCamera(30, SIZE.perso[0] / SIZE.perso[1], 0.1, 30);
  cam.position.set(0, 0.95, 3.8); cam.lookAt(0, 0.9, 0);
  return { sc, rig, cam, a: { health: { downed: false }, stance: 0, wid: 'rifle', shots: 0, reloading: false, pitch: 0 }, built: human.ready };
}
function weaponScene() {
  const sc = new THREE.Scene(); lights(sc);
  const cam = new THREE.PerspectiveCamera(28, SIZE.arme[0] / SIZE.arme[1], 0.05, 20);
  return { sc, cam, g: null };
}

function frame(renderer, sc, cam, kind) {
  const [w, h] = SIZE[kind], pr = renderer.getPixelRatio(), cv = renderer.domElement;
  if (cv.width < w * pr || cv.height < h * pr) return null; // fenêtre trop petite : on réessaiera plus tard
  const vp = new THREE.Vector4(), sc0 = new THREE.Vector4(), st = renderer.getScissorTest();
  renderer.getViewport(vp); renderer.getScissor(sc0);
  renderer.setScissorTest(true); renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
  renderer.render(sc, cam);
  if (!c2d) c2d = document.createElement('canvas');
  c2d.width = w; c2d.height = h;
  c2d.getContext('2d').drawImage(cv, 0, cv.height - h * pr, w * pr, h * pr, 0, 0, w, h);
  renderer.setViewport(vp); renderer.setScissor(sc0); renderer.setScissorTest(st);
  return c2d.toDataURL('image/jpeg', 0.88);
}

function renderOne(renderer, kind, id) {
  const def = LIST[kind].find((d) => d.id === id);
  if (!def) return BLANK;
  if (kind === 'perso') {
    if (!rigScene || !rigScene.built) rigScene = persoScene();
    const { rig, a, sc, cam } = rigScene;
    rig.setSkins(LIST.perso.indexOf(def) + 1, 0);
    for (let i = 0; i < 8; i++) rig.animate(0.05, 0, 0, a);
    return frame(renderer, sc, cam, 'perso');
  }
  if (!wScene) wScene = weaponScene();
  if (wScene.g) wScene.sc.remove(wScene.g);
  const g = buildWeaponModel('rifle');
  applyWeaponSkin(g, def);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  g.position.sub(c);
  const o = new THREE.Group(); o.add(g); o.rotation.y = Math.PI / 2 - 0.3; o.rotation.x = 0.1;
  wScene.sc.add(o); wScene.g = o;
  const len = Math.max(s.x, s.z), d = (len * 0.62) / Math.tan(THREE.MathUtils.degToRad(14)) / (SIZE.arme[0] / SIZE.arme[1]) * 1.15;
  wScene.cam.position.set(0, 0.1, Math.max(1.2, d)); wScene.cam.lookAt(0, 0, 0);
  return frame(renderer, wScene.sc, wScene.cam, 'arme');
}

// À appeler en début de trame du menu (avant le rendu principal) : produit jusqu'à 2 miniatures.
export function thumbTick(renderer) {
  if (!queue.length || !ready()) return;
  if (rigScene && !rigScene.built) rigScene = null;
  for (let n = 0; n < 2 && queue.length; n++) {
    const [kind, id] = queue[0];
    let url = null;
    try { url = renderOne(renderer, kind, id); } catch (e) { url = BLANK; }
    if (url === null) return; // pas possible pour l'instant
    queue.shift();
    const k = kind + ':' + id;
    cache.set(k, url); pending.delete(k);
    for (const img of document.querySelectorAll(`img[data-th="${k}"]`)) img.src = url;
  }
}
