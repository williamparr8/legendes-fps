// Implémentations des habiletés, indexées par le champ "type" de legends.json.
// Signature : (sys, params). Les tactiques/ultimes retournent false pour annuler (pas de recharge).
const BIG = 1e9;

export const PASSIVES = {
  markOnHit: (s, p) => { s.pv.markOnHit = p.duration; },
  reloadBoost: (s, p) => { s.pv.reloadMul = p.mul; },
  shieldBoost: (s, p) => { const h = s.actor.health; h.maxShield += p.extra; h.shield = h.maxShield; },
  speedBoost: (s, p) => { s.pv.moveMul = p.mul; },
  regen: (s, p) => { s.pv.regen = p.rate; s.pv.regenDelay = p.delay; s.pv.reviveMul = p.reviveMul; },
  trapBoost: (s, p) => { s.pv.trapMul = p.mul; },
};

function mark(s, radius, dur) {
  const a = s.actor;
  for (const t of s.cb.all) {
    if (t.team !== a.team && !t.health.dead && Math.hypot(t.x - a.x, t.z - a.z) <= radius) t.markT = dur;
  }
}

function allies(s, fn, withDowned) {
  const a = s.actor;
  for (const t of s.cb.all) {
    if (t.team === a.team && t !== a && !t.health.dead && (withDowned || !t.health.downed)) fn(t);
  }
}

export const TACTICALS = {
  pulse: (s, p) => { mark(s, p.radius, p.duration); },

  grenade: (s, p) => {
    s.aim(50);
    s.cb.proj.spawn(s.ox + s.dx * 0.6, s.oy + s.dy * 0.6 - 0.1, s.oz + s.dz * 0.6, s.dx, s.dy, s.dz,
      { dmg: 0, projectile: { speed: p.speed, gravity: p.gravity, life: p.life, splashRadius: p.splashRadius, splashDmg: p.splashDmg } }, s.owner);
  },

  wall: (s, p) => s.placeWall(p),

  dash: (s, p) => {
    const a = s.actor, sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    a.vx += -sy * p.power; a.vz += -cy * p.power;
    if (a.vy < 3) a.vy = 3;
    a.grounded = false; a.sliding = false;
  },

  heal: (s, p) => {
    const a = s.actor, h = a.health;
    s.addEffect(p.duration, (dt) => {
      if (!h.alive) return;
      h.hp = Math.min(h.maxHp, h.hp + (p.hp * dt) / p.duration);
      h.shield = Math.min(h.maxShield, h.shield + (p.shield * dt) / p.duration);
    });
    allies(s, (t) => {
      if (Math.hypot(t.x - a.x, t.z - a.z) <= p.radius) t.health.hp = Math.min(t.health.maxHp, t.health.hp + p.allyHp);
    });
  },

  mine: (s, p) => s.placeMine(p),
};

export const ULTIMATES = {
  revealAll: (s, p) => { mark(s, BIG, p.duration); },

  rage: (s, p) => {
    const a = s.actor;
    a.dmgMul *= p.dmgMul; a.moveMul *= p.moveMul;
    s.addEffect(p.duration, null, () => { a.dmgMul /= p.dmgMul; a.moveMul /= p.moveMul; });
  },

  fortress: (s, p) => {
    const a = s.actor;
    a.health.shield = a.health.maxShield;
    a.takenMul *= p.takenMul;
    s.addEffect(p.duration, null, () => { a.takenMul /= p.takenMul; });
  },

  teleport: (s, p) => {
    const a = s.actor, c = s.cb.world.colliders;
    s.aim(p.range);
    let t = s.hitT;
    for (let i = 0; i < 8; i++, t -= 0.6) {
      if (t < 1) return false;
      const x = s.ox + s.dx * (t - 0.7), z = s.oz + s.dz * (t - 0.7);
      let y = s.oy + s.dy * (t - 0.7) - 1.6;
      const gy = s.cb.world.groundY(x, z);
      if (y < gy) y = gy;
      if (!c.query(x, y, z, 0.4, 1.8)) {
        a.x = x; a.y = y; a.z = z; a.vx = a.vy = a.vz = 0; a.grounded = false;
        a.px = x; a.py = y; a.pz = z; // pas d'interpolation sur la téléportation
        return true;
      }
    }
    return false;
  },

  revivePulse: (s, p) => {
    const a = s.actor, h = a.health;
    allies(s, (t) => {
      if (Math.hypot(t.x - a.x, t.z - a.z) > p.radius) return;
      if (t.health.downed) t.health.revived();
      t.health.hp = t.health.maxHp;
    }, true);
    if (h.alive) h.hp = Math.min(h.maxHp, h.hp + 50);
  },

  gas: (s, p) => s.placeGas(p),
};
