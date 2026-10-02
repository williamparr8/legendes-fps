import * as THREE from 'three';

const N = 8;

// Projectiles poolés (roquettes) : balistique + collision par rayon sur le segment parcouru.
export class Projectiles {
  constructor(scene, combat) {
    this.cb = combat;
    const g = new THREE.SphereGeometry(0.15, 8, 6), mat = new THREE.MeshBasicMaterial({ color: 0xff6030 });
    this.p = [];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(g, mat);
      m.visible = false;
      scene.add(m);
      this.p.push({ on: false, m, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, g: 0, def: null, owner: null });
    }
  }

  spawn(x, y, z, dx, dy, dz, def, owner) {
    const pr = def.projectile;
    for (let i = 0; i < N; i++) {
      const q = this.p[i];
      if (q.on) continue;
      q.on = true; q.m.visible = true; q.def = def; q.owner = owner;
      q.x = x; q.y = y; q.z = z;
      q.vx = dx * pr.speed; q.vy = dy * pr.speed; q.vz = dz * pr.speed;
      q.life = pr.life; q.g = pr.gravity;
      return;
    }
  }

  tick(dt) {
    const cb = this.cb;
    for (let i = 0; i < N; i++) {
      const q = this.p[i];
      if (!q.on) continue;
      q.vy -= q.g * dt;
      const sx = q.vx * dt, sy = q.vy * dt, sz = q.vz * dt;
      const len = Math.hypot(sx, sy, sz);
      const dx = sx / len, dy = sy / len, dz = sz / len;
      q.life -= dt;
      if (cb.trace(q.x, q.y, q.z, dx, dy, dz, len, q.owner, cb.friendlyFire ? -1 : q.owner.team)) {
        const t = cb.hitT;
        const hx = q.x + dx * t, hy = q.y + dy * t, hz = q.z + dz * t;
        if (cb.hitTarget && q.def.dmg > 0) cb.applyDamage(cb.hitTarget, q.def.dmg * q.owner.dmgMul, cb.hitZone, q.owner);
        cb.explode(hx, hy, hz, q.def.projectile, q.owner);
        q.on = false; q.m.visible = false;
        continue;
      }
      q.x += sx; q.y += sy; q.z += sz;
      q.m.position.set(q.x, q.y, q.z);
      if (q.life <= 0) { q.on = false; q.m.visible = false; }
    }
  }
}
