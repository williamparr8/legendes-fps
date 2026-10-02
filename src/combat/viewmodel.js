import * as THREE from 'three';

const COLORS = { rifle: 0x445566, smg: 0x554466, shotgun: 0x665544, sniper: 0x334433, launcher: 0x664433 };
// [longueur, épaisseur] du canon par arme
const SHAPE = { rifle: [0.55, 0.07], smg: [0.4, 0.07], shotgun: [0.6, 0.09], sniper: [0.85, 0.05], launcher: [0.7, 0.14] };

// Armes en vue subjective : boîtes attachées à la caméra, dessinées par-dessus le monde.
export class Viewmodel {
  constructor(camera, weapons) {
    this.w = weapons;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.models = {};
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd060, depthTest: false }));
    this.flash.renderOrder = 1000; this.flash.visible = false;
    for (const id of weapons.ids) {
      const [len, th] = SHAPE[id] || [0.5, 0.07];
      const mat = new THREE.MeshBasicMaterial({ color: COLORS[id] || 0x555555, depthTest: false });
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.3), mat); body.position.set(0, 0, 0);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(th, th, len), mat); barrel.position.set(0, 0.02, -0.15 - len / 2);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), mat); grip.position.set(0, -0.1, 0.05);
      g.add(body, barrel, grip);
      g.traverse((o) => { o.renderOrder = 999; });
      g.userData.muzzle = -0.15 - len;
      g.visible = false;
      this.root.add(g);
      this.models[id] = g;
    }
    this.root.add(this.flash);
    this.cur = null;
  }

  dispose(camera) { camera.remove(this.root); }

  update(dt) {
    const w = this.w, id = w.id;
    if (this.cur !== id) {
      if (this.cur) this.models[this.cur].visible = false;
      this.cur = id;
      if (id) this.models[id].visible = true;
    }
    this.root.visible = !!id;
    if (!id) { this.flash.visible = false; return; }
    const a = w.ads;
    const swapDrop = w.swap > 0 ? w.swap * 0.6 : 0;
    const reloadDrop = w.reload > 0 ? 0.18 : 0;
    this.root.position.set(0.22 * (1 - a), -0.2 + 0.07 * a - swapDrop - reloadDrop, -0.45 + w.kick * 0.06);
    this.root.rotation.set(w.kick * 0.05 + (w.reload > 0 ? -0.5 : 0), 0, 0);
    this.flash.visible = w.kick > 0.85;
    this.flash.position.set(0, 0.02, this.models[id].userData.muzzle);
    if (a >= 0.98 && id === 'sniper') this.root.visible = false; // lunette : on masque l'arme en ADS
  }
}
