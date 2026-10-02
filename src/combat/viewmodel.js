import * as THREE from 'three';
import { buildWeaponModel } from './models.js';

// Armes en vue subjective : modèles détaillés rendus dans une scène à part (profondeur effacée, FOV fixe, éclairage propre),
// dessinée par-dessus le monde par Game.render.
const SCALE = 0.62; // les modèles sont à taille réelle ; la vue subjective les réduit un peu

const MAGZ = { rifle: -0.05, smg: 0.01, shotgun: -0.08, sniper: -0.04, launcher: -0.04 }; // z du chargeur animé
const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Viewmodel {
  constructor(camera, weapons) {
    this.w = weapons;
    this.scene = new THREE.Scene();
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
    this.cur = null;
  }

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
    this.root.position.set(0.17 * (1 - a) - 0.07 * k, -0.17 * (1 - a) - u.sightY * sc * a - 0.035 * a - swapDrop + 0.03 * k, -0.42 - 0.05 * a + w.kick * 0.05 + mx);
    this.root.rotation.set(w.kick * 0.05 + 0.3 * k, 0.4 * k, -0.5 * k + (rk ? Math.sin(rk * 18) * 0.015 * k : 0));
    this.flash.visible = w.kick > 0.85;
    this.flash.position.set(0, 0.01, u.muzzle - 0.02);
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    if (a >= 0.8 && id === 'sniper') this.root.visible = false; // lunette : l'arme est remplacée par l'overlay de la lunette
  }
}
