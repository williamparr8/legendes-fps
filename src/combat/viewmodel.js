import * as THREE from 'three';
import { buildWeaponModel, applyWeaponSkin } from './models.js';
import { getSkyEnv } from '../world/terrain.js';

// Armes en vue subjective : modèles détaillés rendus dans une scène à part (profondeur effacée, FOV fixe, éclairage propre),
// dessinée par-dessus le monde par Game.render.
const SCALE = 0.62; // les modèles sont à taille réelle ; la vue subjective les réduit un peu

const MAGZ = { rifle: -0.05, smg: 0.01, shotgun: -0.08, sniper: -0.04, launcher: -0.04 }; // z du chargeur animé
const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Viewmodel {
  constructor(camera, weapons) {
    this.w = weapons;
    this.scene = new THREE.Scene();
    if (getSkyEnv()) { this.scene.environment = getSkyEnv(); this.scene.environmentIntensity = 0.7; } // reflets du ciel sur le métal
    this.cam = new THREE.PerspectiveCamera(58, camera.aspect, 0.02, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.2));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
    key.position.set(-0.6, 1, 0.8);
    this.scene.add(key);
    this.root = new THREE.Group();
    this.root.scale.setScalar(SCALE);
    this.scene.add(this.root);
    this.models = {};
    this.flash = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const a of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm); p.rotation.z = a; this.flash.add(p); }
    this.flash.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    this.flash.visible = false;
    for (const id of weapons.ids) {
      const g = buildWeaponModel(id, true);
      g.visible = false;
      this.root.add(g);
      this.models[id] = g;
    }
    this.root.add(this.flash);
    // chargeur animé pendant le rechargement (sort, tombe, puis un neuf remonte)
    this.mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), new THREE.MeshLambertMaterial({ color: 0x1c1f25 }));
    this.mag.visible = false;
    this.root.add(this.mag);
    // bras : deux avant-bras (manche + main) qui tiennent la poignée et le garde-main, fixés à l'arme
    this.arms = [];
    const mk = (from, to, w) => {
      const grp = new THREE.Group(), len = from.distanceTo(to);
      const sl = new THREE.Mesh(new THREE.BoxGeometry(w, w, len * 0.72), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9 }));
      const hd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, w * 0.8, len * 0.3), new THREE.MeshStandardMaterial({ color: 0xe0bc98, roughness: 0.8 }));
      sl.position.z = len * 0.36; hd.position.z = -len * 0.14;
      grp.add(sl, hd);
      grp.position.copy(to); grp.lookAt(from); // l'axe +z du groupe pointe vers l'épaule (hors champ)
      this.root.add(grp);
      this.arms.push([sl, hd]);
    };
    mk(new THREE.Vector3(0.16, -0.42, 0.5), new THREE.Vector3(0.0, -0.1, 0.07), 0.075);   // main de la poignée
    mk(new THREE.Vector3(-0.22, -0.4, 0.28), new THREE.Vector3(0.0, -0.06, -0.26), 0.07); // main du garde-main
    this.cur = null;
  }

  // Couleurs des bras d'après la tenue équipée (entrée de skins.json ou null).
  setArms(def) {
    const p = def && def.p;
    for (const [sl, hd] of this.arms) { sl.material.color.set(p ? p[0] : 0x3a3f4a); hd.material.color.set(p ? p[3] : 0xe0bc98); }
  }

  // Skin d'arme cosmétique (entrée de skins.json ou null).
  setSkin(def) { for (const id in this.models) applyWeaponSkin(this.models[id], def); }

  dispose() { this.scene.clear(); }

  update(dt, aspect) {
    if (this.cam.aspect !== aspect) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
    const w = this.w, id = w.id;
    if (this.cur !== id) {
      if (this.cur) this.models[this.cur].visible = false;
      this.cur = id;
      if (id) this.models[id].visible = true;
    }
    this.root.visible = !!id;
    if (!id) { this.flash.visible = false; this.mag.visible = false; return; }
    const a = w.ads, u = this.models[id].userData;
    const swapDrop = w.swap > 0 ? w.swap * 0.6 : 0;
    // rechargement : p 0→1 ; arme inclinée, chargeur éjecté puis remplacé, armement final
    let k = 0, rk = 0, mx = 0;
    this.mag.visible = false;
    if (w.reload > 0) {
      const p = 1 - w.reload / w.reloadTotal;
      k = Math.min(sstep(p / 0.16), sstep((1 - p) / 0.14));
      if (p > 0.18 && p < 0.82) {
        const q = (p - 0.18) / 0.64, drop = q < 0.4 ? sstep(q / 0.4) : q < 0.55 ? 1 : 1 - sstep((q - 0.55) / 0.45);
        this.mag.visible = true;
        this.mag.position.set(0, -0.12 - 0.4 * drop, MAGZ[id] || 0);
        this.mag.rotation.z = drop * 0.5;
      }
      if (p > 0.84) mx = Math.sin((p - 0.84) / 0.16 * Math.PI) * 0.06; // culasse armée : à-coup en arrière
      rk = p;
    }
    // en ADS : arme plus petite, reculée et abaissée pour dégager la ligne de visée
    const sc = SCALE * (1 - 0.3 * a);
    this.root.scale.setScalar(sc);
    this.root.position.set(0.17 * (1 - a) - 0.07 * k, -0.17 * (1 - a) - u.sightY * sc * a - (id === 'sniper' ? 0.035 : 0.075) * a - swapDrop + 0.03 * k, -0.42 - 0.05 * a + w.kick * 0.05 + mx);
    this.root.rotation.set(w.kick * 0.05 + 0.3 * k, 0.4 * k, -0.5 * k + (rk ? Math.sin(rk * 18) * 0.015 * k : 0));
    this.flash.visible = w.kick > 0.85;
    this.flash.position.set(0, 0.01, u.muzzle - 0.02);
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    if (a >= 0.8 && id === 'sniper') this.root.visible = false; // lunette : l'arme est remplacée par l'overlay de la lunette
  }
}
