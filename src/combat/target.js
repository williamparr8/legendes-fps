import * as THREE from 'three';
import { rayAabb, raySphere } from './ray.js';
import { Health } from './health.js';

const legG = new THREE.BoxGeometry(0.5, 0.8, 0.4);
const torsoG = new THREE.BoxGeometry(0.6, 0.65, 0.44);
const markG = new THREE.BoxGeometry(0.85, 1.95, 0.6);
const markMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.4, depthTest: false });
const headG = new THREE.SphereGeometry(0.2, 12, 8);

// Hitboxes par zone (0 tête, 1 torse, 2 jambes) pour tout acteur ayant x,y,z,hs. Renseigne a.zone.
export function zoneRay(a, ox, oy, oz, dx, dy, dz, maxT) {
  const hs = a.hs, x = a.x, z = a.z, y = a.y;
  let best = -1, zone = -1, t = raySphere(ox, oy, oz, dx, dy, dz, x, y + 1.62 * hs, z, 0.2, maxT);
  if (t >= 0) { best = t; zone = 0; }
  t = rayAabb(ox, oy, oz, dx, dy, dz, x - 0.3, y + 0.8 * hs, z - 0.22, x + 0.3, y + 1.45 * hs, z + 0.22, best >= 0 ? best : maxT);
  if (t >= 0 && (best < 0 || t < best)) { best = t; zone = 1; }
  t = rayAabb(ox, oy, oz, dx, dy, dz, x - 0.25, y, z - 0.2, x + 0.25, y + 0.8 * hs, z + 0.2, best >= 0 ? best : maxT);
  if (t >= 0 && (best < 0 || t < best)) { best = t; zone = 2; }
  a.zone = zone;
  return best;
}

export const defaultPv = () => ({ markOnHit: 0, reloadMul: 1, moveMul: 1, regen: 0, regenDelay: 5, reviveMul: 1, trapMul: 1 });

// Cible/mannequin. Les bots en héritent. État à terre = hauteur ÷ 2.
export class Target {
  constructor(scene, x, z, team, friendly = team === 0) {
    this.x = x; this.y = 0; this.z = z; this.team = team;
    this.health = new Health(100, 50);
    this.zone = -1; this.name = 'Cible';
    this.respawnT = 0; this.noRespawn = false; this.reviveT = 0;
    this.dmgMul = 1; this.takenMul = 1; this.moveMul = 1; this.pv = defaultPv();
    this.lastAttacker = null; this.sinceDamage = 99;
    const mat = this.mat = new THREE.MeshLambertMaterial({ color: friendly ? 0x4080e0 : 0xd04040 });
    this.group = new THREE.Group();
    const legs = new THREE.Mesh(legG, mat); legs.position.y = 0.4;
    const torso = new THREE.Mesh(torsoG, mat); torso.position.y = 1.125;
    const head = new THREE.Mesh(headG, new THREE.MeshLambertMaterial({ color: 0xf0d0b0 })); head.position.y = 1.62;
    this.group.add(legs, torso, head);
    this.markT = 0;
    this.marker = new THREE.Mesh(markG, markMat);
    this.marker.position.y = 0.95; this.marker.renderOrder = 998; this.marker.visible = false;
    this.group.add(this.marker);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  get hs() { return this.health.downed ? 0.5 : 1; }

  setFriendly(f) { this.mat.color.setHex(f ? 0x4080e0 : 0xd04040); }

  // Étiquette de nom flottante (joueurs humains).
  addTag(name) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = 'bold 30px system-ui,sans-serif'; g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(name, 128, 34);
    g.fillStyle = '#fff'; g.fillText(name, 128, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(1.6, 0.3, 1); sp.position.y = 2.15; sp.renderOrder = 997;
    this.group.add(sp);
  }

  ray(ox, oy, oz, dx, dy, dz, maxT) { return zoneRay(this, ox, oy, oz, dx, dy, dz, maxT); }

  tick(dt) {
    const h = this.health;
    if (h.dead) {
      this.group.visible = false;
      if (!this.noRespawn && (this.respawnT -= dt) <= 0) { h.reset(); this.group.visible = true; }
    } else {
      h.tick(dt);
      if (h.dead) this.respawnT = 5;
      if (h.downed && this.reviveT > 0) this.reviveT = Math.max(0, this.reviveT - dt * 0.5);
    }
    this.group.scale.y = this.hs;
    if (this.markT > 0) this.markT -= dt;
    this.marker.visible = this.markT > 0 && !h.dead;
  }
}
