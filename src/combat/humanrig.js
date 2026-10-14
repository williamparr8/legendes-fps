import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { skinnedWeapon, mergedWeapon } from './models.js';
import { weaponDetail } from '../world/pbr.js';
import { skinFx, makeSkinUniforms, setSkinStyle } from '../shop/skinfx.js';
import skinData from '../shop/skins.json';
import wdefs from './weapons.json';
import legends from '../legends/legends.json';

// Personnage humain animé (glTF « Swat Guy » + 15 clips de capture de mouvement, voir assets-src/convert.py).
// Même interface que le Rig procédural (humanoid.js) : constructor(group, friendly), setFriendly, setAccent, setSkins, animate.
// Le modèle est chargé une fois et cloné par acteur (géométrie et textures partagées) ; un AnimationMixer par acteur.
const LEGS = Object.keys(legends), WIDS = Object.keys(wdefs);
export const human = { ready: false, scene: null, variants: [], bodies: {}, next: 0, clips: {}, cam: new THREE.Vector3(1e6, 0, 1e6) };

// url : premier modèle (avec les clips) ; extras : autres corps (même squelette, sans clips) pour varier les acteurs.
export function loadHuman(url, extras = []) {
  const prep = (scene) => scene.traverse((o) => { // pas d'environnement propre : matériaux mats (sinon le métal ressort noir)
    if (!o.isMesh) return;
    o.castShadow = false;
    const m = o.material;
    if (m) { m.metalness = 0.05; m.roughness = 0.85; if (m.map) m.map.anisotropy = 4; }
  });
  for (const u of extras) {
    new GLTFLoader().load(u, (g) => {
      prep(g.scene);
      const nm = u.split('/').pop().replace('.glb', '');
      if (nm === 'eve' || nm === 'maria') human.bodies[nm] = g.scene; // corps réservés aux skins (pas dans la rotation par défaut)
      else human.variants.push(g.scene);
    }, undefined, () => {});
  }
  return new Promise((res) => {
    new GLTFLoader().load(url, (g) => {
      human.scene = g.scene;
      human.variants.unshift(g.scene);
      for (const c of g.animations) human.clips[c.name] = c;
      g.scene.traverse((o) => { // pas d'environnement : matériaux mats (sinon le métal ressort noir)
        if (!o.isMesh) return;
        o.castShadow = false;
        const m = o.material;
        if (m) { m.metalness = 0.05; m.roughness = 0.85; if (m.map) m.map.anisotropy = 4; }
      });
      human.ready = true;
      res(true);
    }, undefined, () => res(false));
  });
}

const FRIEND = new THREE.MeshBasicMaterial({ color: 0x4080e0 }), ENEMY = new THREE.MeshBasicMaterial({ color: 0xd04040 });
// motif d'arme : échelle/origine dans l'espace de l'objet (arme ≈ 1 m)
const WSC = { k: { value: 2.2 }, o: { value: new THREE.Vector3() } };
const WMAT = new Map();
function weaponMat(def) {
  if (!def || !def.s) return WPN;
  let m = WMAT.get(def.id);
  if (!m) {
    const u = makeSkinUniforms(); setSkinStyle(u, def, 'w');
    m = weaponDetail(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5 + def.r * 0.1, roughness: 0.45 - def.r * 0.05 }), 'gunmetal', 0.22, 0.8);
    skinFx(m, u, WSC); WMAT.set(def.id, m);
  }
  return m;
}
const WPN = weaponDetail(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.45 }), 'gunmetal', 0.22, 0.8);
const FLASH = new THREE.MeshBasicMaterial({ color: 0xffd070 });
const CANOPY = new THREE.MeshLambertMaterial({ color: 0xf08a30, side: THREE.DoubleSide });
const accents = new Map();
const accentMat = (hex) => { let m = accents.get(hex); if (!m) accents.set(hex, m = new THREE.MeshBasicMaterial({ color: hex })); return m; };
const BAND = new THREE.CylinderGeometry(0.085, 0.085, 0.09, 12), BACK = new THREE.BoxGeometry(0.26, 0.14, 0.03);
const HEADBAND = new THREE.CylinderGeometry(0.112, 0.112, 0.022, 14), FLASH_G = new THREE.BoxGeometry(0.07, 0.07, 0.14);
const CANOPY_G = new THREE.SphereGeometry(1.6, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.5, 0.9, 1.5);
const WS = 0.9, PSIGN = -1; // échelle des armes ; sens de la flexion du buste à la visée

// Accessoires par légende (boîtes dans le repère de l'os Spine2 : y vers le haut, z vers l'avant), couleur d'accent.
const EXTRA = [
  [[0.16, 0.09, 0.07, 0.1, 0.02, 0.17], [0.012, 0.3, 0.012, 0.12, 0.25, -0.2]],             // jumelles + antenne
  [[0.5, 0.06, 0.03, 0, 0.05, 0.175, 0.75], [0.05, 0.08, 0.04, 0.12, -0.12, 0.18]],         // bandoulière de munitions
  [[0.2, 0.09, 0.24, -0.27, 0.16, 0], [0.2, 0.09, 0.24, 0.27, 0.16, 0], [0.2, 0.2, 0.02, 0, 0.0, 0.18]], // épaulières + plastron
  [[0.15, 0.42, 0.04, 0, -0.1, -0.2], [0.26, 0.07, 0.22, 0, 0.2, 0]],                         // écharpe + col
  [[0.2, 0.06, 0.02, 0, 0.0, -0.22], [0.06, 0.2, 0.02, 0, 0.0, -0.22]],                      // croix médicale dans le dos
  [[0.12, 0.12, 0.12, -0.2, -0.28, 0.1], [0.12, 0.12, 0.12, 0.2, -0.28, 0.1], [0.08, 0.06, 0.05, 0.1, -0.1, 0.18]], // mines + détonateur
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();

export class HumanRig {
  constructor(group, friendly) {
    this.g = group; this.friendly = friendly; this.body = null;
    this.build(null);
  }

  // Construit le corps (scene = modèle imposé par un skin, sinon corps varié d'un acteur à l'autre) et tous ses attachements.
  build(scene) {
    const group = this.g, friendly = this.friendly;
    this.root = clone(scene || human.variants[human.next++ % human.variants.length] || human.scene);
    this.root.rotation.y = Math.PI; // le modèle regarde +z, le jeu -z
    const box = new THREE.Box3().setFromObject(this.root);
    this.root.position.y = -box.min.y;
    group.add(this.root);
    this.bones = {};
    this.root.traverse((o) => {
      if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o;
      if (o.isSkinnedMesh) o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7), o.frustumCulled = true;
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.cur = null; this.curName = '';
    this.acc = 0; this.n = 0;
    // repères alignés sur le modèle (x droite, y haut, z avant) rattachés aux os : les pièces s'y placent sans connaître l'orientation de l'os
    this.root.updateMatrixWorld(true);
    const sv = new THREE.Vector3(), rq = new THREE.Quaternion(), bq = new THREE.Quaternion(), ry = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const aligned = (bone) => {
      const g = new THREE.Group();
      bone.getWorldQuaternion(bq);
      rq.copy(ry).multiply(bq); // orientation de l'os dans le repère du modèle
      g.quaternion.copy(rq).invert();
      bone.getWorldScale(sv);
      g.scale.set(1 / sv.x, 1 / sv.y, 1 / sv.z); // les os sont en cm : le repère aligné est en mètres
      bone.add(g);
      return g;
    };
    // marques : brassards (couleur d'équipe, autour du bras, vers le coude), plaque dorsale, bandeau de la légende
    const tm = friendly ? FRIEND : ENEMY, Y = new THREE.Vector3(0, 1, 0);
    this.team = [];
    for (const k of ['LeftArm', 'RightArm']) {
      const bone = this.bones[k], child = bone && bone.children.find((c) => c.isBone);
      if (!bone || !child) continue;
      const g = aligned(bone);
      bone.getWorldQuaternion(bq);
      const dir = child.position.clone().applyQuaternion(rq.copy(ry).multiply(bq)); // direction du bras dans le repère du modèle
      bone.getWorldScale(sv);
      const len = dir.length() * sv.x; // en mètres
      dir.normalize();
      const m = new THREE.Mesh(BAND, tm);
      m.position.copy(dir).multiplyScalar(len * 0.4);
      m.quaternion.setFromUnitVectors(Y, dir);
      g.add(m); this.team.push(m);
    }
    this.spineG = this.bones.Spine2 ? aligned(this.bones.Spine2) : new THREE.Group();
    { const m = new THREE.Mesh(BACK, tm); m.position.set(0, 0.0, -0.2); this.spineG.add(m); this.team.push(m); }
    this.band = new THREE.Mesh(HEADBAND, accentMat(0xffffff));
    if (this.bones.Head) { const hg = aligned(this.bones.Head); this.band.position.set(0, 0.12, 0); hg.add(this.band); }
    this.extra = new THREE.Group();
    this.spineG.add(this.extra);
    this.leg = -1;
    // arme tenue : placée sur la main droite, orientée selon la visée
    this.wp = new THREE.Group(); group.add(this.wp);
    this.wmesh = new THREE.Mesh(mergedWeapon(WIDS[0]).geo, WPN); this.wmesh.scale.setScalar(WS); this.wp.add(this.wmesh);
    this.wmesh.visible = false;
    this.flash = new THREE.Mesh(FLASH_G, FLASH); this.flash.visible = false; this.wp.add(this.flash);
    this.canopy = new THREE.Mesh(CANOPY_G, CANOPY); this.canopy.position.y = 3.1; this.canopy.visible = false; group.add(this.canopy);
    this.wid = undefined; this.ud = null; this.pskin = 0; this.wskin = 0;
    this.lx = 0; this.lz = 0; this.init = false; this.speed = 0; this.vx = 0; this.vz = 0;
    this.kick = 0; this.sc = 0;
    this.mats = null; this.sk = null;
  }

  // Change de corps (skins de personnage à modèle propre) en conservant équipe, légende, arme.
  setBody(name) {
    const sc = name ? human.bodies[name] : null;
    if (name && !sc) return;
    this.g.remove(this.root, this.wp, this.canopy);
    this.mixer.stopAllAction();
    const wid = this.wid;
    this.build(sc);
    this.body = name;
    this.curName = ''; this.cur = null;
    this.setFriendly(this.friendly);
    if (this.accHex != null) this.setAccent(this.accHex, this.accLeg);
    if (wid) this.setWeapon(wid);
  }

  setFriendly(f) { this.friendly = f; const m = f ? FRIEND : ENEMY; for (const o of this.team) o.material = m; }

  // Couleur d'accent + accessoire propre à la légende.
  setAccent(hex, legend) {
    this.accHex = hex; this.accLeg = legend;
    const h = typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex, m = accentMat(h);
    this.band.material = m;
    const i = LEGS.indexOf(legend);
    if (i !== this.leg) {
      this.leg = i;
      this.extra.clear();
      for (const [w, hh, d, x, y, z, rz] of EXTRA[i >= 0 ? i % EXTRA.length : 0] || []) {
        const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
        o.position.set(x, y, z); if (rz) o.rotation.z = rz;
        this.extra.add(o);
      }
    }
    for (const o of this.extra.children) o.material = m;
  }

  // Skins cosmétiques (indices + 1 dans skins.json) : teinte du personnage ; skin d'arme appliqué à l'arme tenue.
  setSkins(ps, ws) {
    if (ps !== this.pskin) {
      const def = skinData.perso[ps - 1];
      const want = def && def.body && human.bodies[def.body] ? def.body : null;
      if (want !== this.body) this.setBody(want);
      this.pskin = ps;
      if (!this.mats) { // matériaux propres à l'acteur seulement quand une teinte est demandée
        this.mats = [];
        this.root.traverse((o) => { if (o.isSkinnedMesh) { o.material = o.material.clone(); this.mats.push(o.material); } });
      }
      // teinte franche (le jaune/vert/bleu du skin domine la texture) ; rares et au-delà : lueur de l'accent, éclat métallique
      // motif réel (camouflage, flammes, circuit…) + éclat métallique pour les skins épiques et au-delà
      if (!this.sk) {
        this.sk = makeSkinUniforms();
        const bb = new THREE.Box3();
        this.root.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox); } });
        const hgt = Math.max(bb.max.y - bb.min.y, 1e-3);
        this.sc2 = { k: { value: 1.8 / hgt }, o: { value: new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2) } };
        for (const m of this.mats) skinFx(m, this.sk, this.sc2);
      }
      setSkinStyle(this.sk, def, 'p');
      const me = def ? (def.r >= 3 ? 0.55 : def.r >= 2 ? 0.3 : 0) : 0;
      for (const m of this.mats) { if (m.userData.m0 === undefined) m.userData.m0 = m.metalness; m.metalness = Math.max(m.userData.m0, me); if (def && def.s === 5) { m.metalness = 0.95; m.roughness = 0.28; } }
    }
    if (ws !== this.wskin) { this.wskin = ws; if (this.wid) this.setWeapon(this.wid); }
  }

  setWeapon(id) {
    this.wid = id;
    const w = id ? skinnedWeapon(id, skinData.arme[this.wskin - 1]) : null;
    this.ud = w ? w.ud : null;
    if (w) { this.wmesh.geometry = w.geo; this.wmesh.material = weaponMat(skinData.arme[this.wskin - 1]); }
  }

  play(name, loop = true, fade = 0.18, scale = 1) {
    const clip = human.clips[name];
    if (!clip) return;
    if (name === this.curName) { if (this.cur) this.cur.timeScale = scale; return; }
    const a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = scale;
    a.fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a; this.curName = name;
  }

  // Posture déduite de l'acteur, direction de marche déduite du déplacement réel ; `a` : health, stance, wid, reloading, shots, pitch.
  animate(dt, x, z, a) {
    if (!this.init) { this.init = true; this.lx = x; this.lz = z; this.sc = a.shots & 15; }
    let vx = dt > 0 ? (x - this.lx) / dt : 0, vz = dt > 0 ? (z - this.lz) / dt : 0;
    this.lx = x; this.lz = z;
    if (Math.hypot(vx, vz) > 14) vx = vz = 0; // téléportation / réapparition
    const k = Math.min(1, dt * 10);
    this.vx += (vx - this.vx) * k; this.vz += (vz - this.vz) * k;
    const s = Math.hypot(this.vx, this.vz), dn = a.health.downed, st = dn ? 3 : a.stance || 0;
    this.speed = s;
    this.root.visible = st !== 4;
    this.canopy.visible = st === 6;
    // choix du clip
    const yaw = this.g.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const lon = this.vx * fx + this.vz * fz, lat = this.vx * -fz + this.vz * fx;
    const armed = !!a.wid && !dn && st < 4;
    if (dn || st === 3) this.play('Rifle_Death', false, 0.2);
    else if (st >= 5) this.play('Falling_Idle', true, 0.25);
    else if (st === 2) this.play('Running_Slide', true, 0.12);
    else if (st === 1) { if (s > 0.5) this.play('Rifle_Crouch_Walk', true, 0.18, clamp(s / 1.8, 0.6, 1.6)); else this.play('Crouch_Idle', true, 0.2); }
    else if (a.reloading && armed) this.play('Reloading', false, 0.15, 1.5);
    else if (s > 0.6) {
      if (Math.abs(lat) > Math.abs(lon) * 0.9) this.play(lat > 0 ? 'Run_Right' : 'Run_Left', true, 0.15, clamp(s / 5.2, 0.6, 1.6));
      else if (lon < -0.3) this.play('Backwards_Rifle_Run', true, 0.15, clamp(s / 4.4, 0.6, 1.6));
      else if (s > 3.4) this.play('Rifle_Run', true, 0.15, clamp(s / 5.0, 0.7, 1.7));
      else this.play('Rifle_Walk', true, 0.15, clamp(s / 1.6, 0.6, 1.5));
    } else this.play(armed ? 'Rifle_Aiming_Idle' : 'Rifle_Idle', true, 0.25);
    // mise à jour du mixeur : moins souvent quand l'acteur est loin de la caméra
    const dx = this.g.position.x - human.cam.x, dz = this.g.position.z - human.cam.z, d2 = dx * dx + dz * dz;
    const step = d2 > 14400 ? 6 : d2 > 3600 ? 3 : 1;
    this.acc += dt;
    if (this.n++ % step === 0) { this.mixer.update(this.acc); this.acc = 0; }
    // visée : le buste et la tête suivent la hauteur du regard
    const pitch = clamp(a.pitch || 0, -0.9, 0.9);
    if (st < 3 && !dn) {
      const b = this.bones;
      if (b.Spine1) b.Spine1.rotateX(pitch * 0.3 * PSIGN);
      if (b.Spine2) b.Spine2.rotateX(pitch * 0.3 * PSIGN);
      if (b.Head) b.Head.rotateX(pitch * 0.25 * PSIGN);
    }
    // arme
    if (a.wid !== this.wid) this.setWeapon(a.wid);
    const show = armed && d2 < 40000 && !!this.ud;
    this.wmesh.visible = show;
    const sc = a.shots & 15;
    if (sc !== this.sc) { this.sc = sc; this.kick = 1; }
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 9);
    if (!show) { this.flash.visible = false; return; }
    this.root.updateMatrixWorld(true);
    const hand = this.bones.RightHand;
    if (hand) {
      this.g.worldToLocal(_v.setFromMatrixPosition(hand.matrixWorld));
      const u = this.ud, rx = pitch * 0.9 + this.kick * 0.07, cx = Math.cos(rx), sx = Math.sin(rx);
      const gy = u.grip[0] * WS, gz = u.grip[1] * WS;
      this.wp.position.set(_v.x, _v.y - (gy * cx - gz * sx), _v.z - (gy * sx + gz * cx) + this.kick * 0.04);
      this.wp.rotation.set(rx, 0, 0);
      this.flash.visible = this.kick > 0.65;
      if (this.flash.visible) this.flash.position.set(0, 0.01, (u.muzzle - 0.06) * WS);
    }
  }
}
