import * as THREE from 'three';
import { Colliders } from './collision.js';
import { skinMaterial } from './skin.js';

// Formes non cubiques (unitaires, centrées, côté 1) : cylindre, cône, sphère, prisme à pignon (arête sur z).
const GEO = {};
function shapeGeo(t) {
  if (GEO[t]) return GEO[t];
  let g;
  if (t === 'cyl') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  else if (t === 'cone') g = new THREE.ConeGeometry(0.5, 1, 14);
  else if (t === 'sph') g = new THREE.SphereGeometry(0.5, 14, 10);
  else {
    const v = [-.5,-.5,.5, .5,-.5,.5, 0,.5,.5,  .5,-.5,-.5, -.5,-.5,-.5, 0,.5,-.5, // pignons avant / arrière
      -.5,-.5,-.5, -.5,-.5,.5, 0,.5,.5,  -.5,-.5,-.5, 0,.5,.5, 0,.5,-.5,            // pan gauche
      .5,-.5,.5, .5,-.5,-.5, 0,.5,-.5,  .5,-.5,.5, 0,.5,-.5, 0,.5,.5,              // pan droit
      -.5,-.5,-.5, .5,-.5,-.5, .5,-.5,.5,  -.5,-.5,-.5, .5,-.5,.5, -.5,-.5,.5];     // dessous
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
  }
  return (GEO[t] = g);
}

// Monde = colliders + rendu instancié (un InstancedMesh par type de matériau) + jump pads + tyroliennes.
// groundY(x, z) : hauteur du sol (0 sur la scène d'entraînement ; remplacé par le relief sur l'île).
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = new Colliders();
    this.pads = [];
    this.zips = [];
    this._boxes = [[], [], [], [], [], [], [], [], []];
    this._shapes = new Map();   // 'forme|matériau' → [[x,y,z, qx,qy,qz,qw, sx,sy,sz, couleur], …]
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

  // Forme instanciée centrée en (x,y,z), dimensions (sx,sy,sz), rotation = quaternion q [x,y,z,w] ou ry (autour de y).
  // solid : [x0,y0,z0,x1,y1,z1] → boîte de collision ajoutée en plus.
  shape(type, kind, x, y, z, sx, sy, sz, color, ry = 0, q = null, solid = null) {
    const k = type + '|' + kind;
    if (!this._shapes.has(k)) this._shapes.set(k, []);
    const h = ry / 2;
    this._shapes.get(k).push([x, y, z, q ? q[0] : 0, q ? q[1] : Math.sin(h), q ? q[2] : 0, q ? q[3] : Math.cos(h), sx, sy, sz, color]);
    if (solid) this.colliders.add(solid[0], solid[1], solid[2], solid[3], solid[4], solid[5]);
  }
  // Cylindre vertical de rayon r, de y0 à y0+h ; solid = boîte de collision englobante.
  cyl(x, y0, z, r, h, color = 0x8a8f96, kind = 0, solid = false) {
    this.shape('cyl', kind, x, y0 + h / 2, z, r * 2, h, r * 2, color, 0, null, solid ? [x - r, y0, z - r, x + r, y0 + h, z + r] : null);
  }
  // Poutre / câble / tuyau entre deux points (cylindre fin orienté).
  beam(ax, ay, az, bx, by, bz, r = 0.05, color = 0x3a3f46, kind = 0) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-6;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    this.shape('cyl', kind, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, r * 2, L, r * 2, color, 0, [q.x, q.y, q.z, q.w]);
  }
  // Toit à deux pans sur [x0,x1]×[z0,z1], de y0 à y0+h ; l'arête suit l'axe le plus long.
  gable(x0, z0, x1, z1, y0, h, color = 0x7a4b3a, kind = 3) {
    const w = x1 - x0, d = z1 - z0, alongX = w >= d;
    // arête sur z par défaut ; sur x : rotation de 90° autour de y (largeur ↔ longueur)
    this.shape('prism', kind, (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, alongX ? d : w, h, alongX ? w : d, color, alongX ? Math.PI / 2 : 0);
  }

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
      mesh.castShadow = kind !== 8; mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
    this._boxes = null;
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [key, list] of this._shapes) {
      const [type, kind] = key.split('|');
      const mesh = new THREE.InstancedMesh(shapeGeo(type), skinMaterial(+kind), list.length);
      list.forEach((o, i) => {
        p.set(o[0], o[1], o[2]); q.set(o[3], o[4], o[5], o[6]); s.set(o[7], o[8], o[9]);
        m.compose(p, q, s); mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(o[10]));
      });
      mesh.frustumCulled = false;
      mesh.castShadow = +kind !== 8; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this._shapes = null;
  }

  // Ombre du soleil : la fenêtre suit le joueur (alignée sur les texels pour éviter le scintillement).
  // Renvoie true quand la fenêtre a bougé (pas de 64 texels = 3,1 m) : la carte d'ombres, statique, n'est alors recalculée qu'à ce moment.
  followSun(x, z) {
    const s = this.sun;
    if (!s) return false;
    const q = (100 / 2048) * 64;
    x = Math.round(x / q) * q; z = Math.round(z / q) * q;
    if (x === this._sx && z === this._sz) return false;
    this._sx = x; this._sz = z;
    s.target.position.set(x, 0, z);
    s.position.set(x + 60, 100, z + 30);
    s.target.updateMatrixWorld();
    return true;
  }
}
