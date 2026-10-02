import * as THREE from 'three';

// Décor instancié (aucune collision ici : les colliders sont ajoutés par l'appelant).

// Pins : tronc + 2 cônes. list = [[x, y, z, échelle, teinte 0..1], ...]
export function makeTrees(scene, list) {
  const n = list.length;
  if (!n) return;
  const parts = [
    { geo: new THREE.CylinderGeometry(0.16, 0.28, 3.4, 6), y: 1.7, color: 0x6b4a2f, tint: false },
    { geo: new THREE.ConeGeometry(1.8, 3.4, 7), y: 4.1, color: 0x2f6b3a, tint: true },
    { geo: new THREE.ConeGeometry(1.3, 2.8, 7), y: 6.0, color: 0x3a7a43, tint: true },
  ];
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geo, new THREE.MeshLambertMaterial({ flatShading: true }), n);
    for (let i = 0; i < n; i++) {
      const [x, y, z, k, t] = list[i];
      p.set(x, y + part.y * k, z); s.set(k, k, k);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 6.28);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      c.setHex(part.color);
      if (part.tint) c.offsetHSL((t - 0.5) * 0.04, 0, (t - 0.5) * 0.1);
      mesh.setColorAt(i, c);
    }
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// Rochers : icosaèdres écrasés. list = [[x, y, z, rx, ry, rz, rotation, teinte], ...]
export function makeRocks(scene, list) {
  const n = list.length;
  if (!n) return;
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const [x, y, z, rx, ry, rz, rot, t] = list[i];
    p.set(x, y, z); s.set(rx, ry, rz);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.09, 0.08, 0.38 + t * 0.14));
  }
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}
