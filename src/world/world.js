import * as THREE from 'three';
import { Colliders } from './collision.js';

// Monde = colliders + rendu instancié + jump pads + tyroliennes.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = new Colliders();
    this.pads = [];
    this.zips = [];
    this._boxes = [];
  }
  // Boîte pleine (collision + rendu). Coordonnées min/max.
  box(x0, y0, z0, x1, y1, z1, color = 0x8a96a3) {
    this.colliders.add(x0, y0, z0, x1, y1, z1);
    this._boxes.push(x0, y0, z0, x1, y1, z1, color);
  }
  pad(x, z, vy, dx, dz, speed) {
    this.pads.push({ x, y: 0, z, r: 1.5, vy, vx: dx * speed, vz: dz * speed });
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.15, 24),
      new THREE.MeshLambertMaterial({ color: 0x20e0a0, emissive: 0x108060 }),
    );
    m.position.set(x, 0.075, z);
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
    const n = this._boxes.length / 7;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), n);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const b = this._boxes;
    for (let i = 0; i < n; i++) {
      const o = i * 7;
      m.makeScale(b[o + 3] - b[o], b[o + 4] - b[o + 1], b[o + 5] - b[o + 2]);
      m.setPosition((b[o] + b[o + 3]) / 2, (b[o + 1] + b[o + 4]) / 2, (b[o + 2] + b[o + 5]) / 2);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(b[o + 6]));
    }
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this._boxes = null;
  }
}
