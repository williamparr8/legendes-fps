import * as THREE from 'three';
import { buildWeaponModel } from './models.js';

// Armes en vue subjective : modèles détaillés rendus dans une scène à part (profondeur effacée, FOV fixe, éclairage propre),
// dessinée par-dessus le monde par Game.render.
const SCALE = 0.62; // les modèles sont à taille réelle ; la vue subjective les réduit un peu

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
    if (!id) { this.flash.visible = false; return; }
    const a = w.ads, u = this.models[id].userData;
    const swapDrop = w.swap > 0 ? w.swap * 0.6 : 0;
    const reloadDrop = w.reload > 0 ? 0.18 : 0;
    // en ADS la ligne de visée (sightY) vient se centrer sur l'écran
    this.root.position.set(0.17 * (1 - a), -0.17 * (1 - a) - u.sightY * SCALE * a - swapDrop - reloadDrop, -0.42 + w.kick * 0.05);
    this.root.rotation.set(w.kick * 0.05 + (w.reload > 0 ? -0.5 : 0), 0, 0);
    this.flash.visible = w.kick > 0.85;
    this.flash.position.set(0, 0.01, u.muzzle - 0.02);
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    if (a >= 0.98 && id === 'sniper') this.root.visible = false; // lunette : on masque l'arme en ADS
  }
}
