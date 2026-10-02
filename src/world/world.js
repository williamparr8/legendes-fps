import * as THREE from 'three';
import { Colliders } from './collision.js';
import { skinMaterial } from './skin.js';

// Monde = colliders + rendu instancié (un InstancedMesh par type de matériau) + jump pads + tyroliennes.
// groundY(x, z) : hauteur du sol (0 sur la scène d'entraînement ; remplacé par le relief sur l'île).
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = new Colliders();
    this.pads = [];
    this.zips = [];
    this._boxes = [[], [], [], []];
    this.groundY = () => 0;
    this.sun = null;
  }
  // Boîte pleine (collision + rendu). kind : 0 béton, 1 bois, 2 roche, 3 tôle.
  box(x0, y0, z0, x1, y1, z1, color = 0x8a96a3, kind = 0) {
    this.colliders.add(x0, y0, z0, x1, y1, z1);
    this._boxes[kind].push(x0, y0, z0, x1, y1, z1, color);
  }
  // Boîte décorative (rendu seul, sans collision).
  deco(x0, y0, z0, x1, y1, z1, color = 0x444a52, kind = 0) { this._boxes[kind].push(x0, y0, z0, x1, y1, z1, color); }

  pad(x, z, vy, dx, dz, speed) {
    const y = this.groundY(x, z);
    this.pads.push({ x, y, z, r: 1.5, vy, vx: dx * speed, vz: dz * speed });
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.2, 24),
      new THREE.MeshLambertMaterial({ color: 0x20e0a0, emissive: 0x108060 }),
    );
    m.position.set(x, y + 0.1, z);
    m.receiveShadow = true;
    this.scene.add(m);
  }
  zip(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    this.zips.push({ ax, ay, az, dx: dx / len, dy: dy / len, dz: dz / len, len });
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, len, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd040 }),
    );
    cable.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    this.scene.add(cable);
  }
  // À appeler une fois après avoir ajouté toutes les boîtes.
  finalize() {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    this._boxes.forEach((b, kind) => {
      const n = b.length / 7;
      if (!n) return;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skinMaterial(kind), n);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        m.makeScale(b[o + 3] - b[o], b[o + 4] - b[o + 1], b[o + 5] - b[o + 2]);
        m.setPosition((b[o] + b[o + 3]) / 2, (b[o + 1] + b[o + 4]) / 2, (b[o + 2] + b[o + 5]) / 2);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(b[o + 6]));
      }
      mesh.frustumCulled = false;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
    this._boxes = null;
  }

  // Ombre du soleil : la fenêtre suit le joueur (alignée sur les texels pour éviter le scintillement).
  followSun(x, z) {
    const s = this.sun;
    if (!s) return;
    const q = 100 / 2048;
    x = Math.round(x / q) * q; z = Math.round(z / q) * q;
    s.target.position.set(x, 0, z);
    s.position.set(x + 60, 100, z + 30);
    s.target.updateMatrixWorld();
  }
}
