import defs from './weapons.json';
import { Weapons } from './weapon.js';
import { Projectiles } from './projectiles.js';
import { Fx } from './fx.js';
import { Target } from './target.js';
import { PlayerProxy } from './playerProxy.js';
import { REVIVE_TIME, Health } from './health.js';

// Orchestrateur de combat : tir, dégâts par zone, explosions, réanimation. Valable pour joueur, bots et mannequins.
// `all` = tous les acteurs (mannequins/bots + proxy du joueur) ; `targets` = sans le joueur.
export class Combat {
  constructor(scene, world, player, input, inv, opts = {}) {
    this.scene = scene; this.world = world; this.player = player; this.input = input;
    this.friendlyFire = !!opts.friendlyFire;
    this.respawnPlayer = !!opts.respawnPlayer;
    this.pp = new PlayerProxy(player);
    this.targets = [];
    this.all = [this.pp];
    this.fx = new Fx(scene);
    this.proj = new Projectiles(scene, this);
    this.weapons = new Weapons(defs, this, inv);
    this.pp.w = this.weapons;
    this.hitT = 0; this.hitTarget = null; this.hitZone = -1;
    this.onDown = null; this.onDeath = null; this.onDamage = null;
    this.hitmark = 0; this.hitKind = 0; this.dmgSum = 0; this.dmgT = 0; this.hurt = 0;
    this.revive = 0; this.deadT = 0;
  }

  add(t) { this.targets.push(t); this.all.push(t); return t; }
  addTarget(x, z, team) { return this.add(new Target(this.scene, x, z, team)); }
  own(a) { return a === this.player ? this.pp : a; }

  // Rayon contre monde + acteurs (hors `ignore`). Renseigne hitT/hitTarget/hitZone.
  trace(ox, oy, oz, dx, dy, dz, maxT, ignore, ignoreTeam = -1) {
    let best = maxT, tgt = null, zone = -1;
    const w = this.world.colliders.ray(ox, oy, oz, dx, dy, dz, maxT);
    if (w >= 0) best = w;
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (t === ignore || t.team === ignoreTeam || t.health.dead) continue;
      const r = t.ray(ox, oy, oz, dx, dy, dz, best);
      if (r >= 0 && r < best) { best = r; tgt = t; zone = t.zone; }
    }
    this.hitT = best; this.hitTarget = tgt; this.hitZone = zone;
    return tgt !== null || w >= 0;
  }

  // Ligne de vue œil→torse entre deux acteurs (monde uniquement).
  los(a, b) {
    const ox = a.x, oy = a.y + 1.5, oz = a.z;
    let dx = b.x - ox, dy = b.y + 1.1 * b.hs - oy, dz = b.z - oz;
    const d = Math.hypot(dx, dy, dz);
    dx /= d; dy /= d; dz /= d;
    return this.world.colliders.ray(ox, oy, oz, dx, dy, dz, d) < 0;
  }

  applyDamage(t, amount, zone, attacker) {
    if (attacker && attacker !== t && attacker.team === t.team && !this.friendlyFire) return;
    const h = t.health, wasDown = h.downed, wasDead = h.dead;
    if (wasDead) return;
    let down, dead;
    if (t.netOwned) {
      // Santé gérée ailleurs (joueur distant / acteur répliqué) : on transmet les dégâts bruts et on prédit
      // l'issue sur une copie, uniquement pour le retour visuel (hitmarker). L'état réel arrive par le réseau.
      if (attacker) t.lastAttacker = attacker;
      t.sendDamage(amount, zone, attacker);
      const s = this._tmp || (this._tmp = new Health());
      s.hp = h.hp; s.shield = h.shield; s.downed = h.downed; s.dead = h.dead; s.downedHp = h.downedHp;
      s.damage(amount);
      down = s.downed; dead = s.dead;
    } else {
      amount *= t.takenMul;
      h.damage(amount);
      if (attacker) t.lastAttacker = attacker;
      if (t.isPlayer) { this.hurt = 0.4; this.player.sinceDamage = 0; }
      else if (t.onHurt) t.onHurt(attacker, amount);
      down = h.downed; dead = h.dead;
    }
    if (attacker === this.pp && t !== this.pp) {
      const kill = (dead && !wasDead) || (down && !wasDown);
      this.hitKind = kill ? 2 : zone === 0 ? 1 : 0;
      this.hitmark = 0.18;
      this.dmgSum += amount; this.dmgT = 1;
      const mk = this.player.pv.markOnHit;
      if (mk > 0 && t.markT < mk) t.markT = mk;
      if (this.onDamage) this.onDamage(t, amount, attacker);
    } else if (attacker && attacker.isHuman && attacker !== t && this.onDamage) this.onDamage(t, amount, attacker);
    if (t.netOwned) return;
    if (this.onDown && h.downed && !wasDown) this.onDown(t, attacker);
    if (h.dead && !wasDead) this.sendDeath(t);
  }

  // Notifie une seule fois la mort d'un acteur (dégâts ou saignement).
  sendDeath(t) {
    if (t._ds) return;
    t._ds = true;
    if (this.onDeath) this.onDeath(t, t.lastAttacker);
  }

  damagePlayer(a) { this.applyDamage(this.pp, a, 1, null); }

  // Un projectile hitscan (joueur ou bot) : trace, dégâts par zone, effets.
  hitscan(att, ox, oy, oz, dx, dy, dz, d, mul, mx, my, mz) {
    this.trace(ox, oy, oz, dx, dy, dz, d.range, att, this.friendlyFire ? -1 : att.team);
    const t = this.hitT, hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
    this.fx.tracer(mx, my, mz, hx, hy, hz);
    const tg = this.hitTarget;
    if (tg) {
      const z = this.hitZone;
      this.applyDamage(tg, d.dmg * mul * (z === 0 ? d.headMult : z === 2 ? d.legMult : 1), z, att);
      this.fx.impact(hx, hy, hz, z === 0 ? 2 : 1);
    } else if (t < d.range) this.fx.impact(hx, hy, hz, 0);
  }

  // Tir du joueur (appelé par Weapons.shoot).
  fire(p, d, spread) {
    this.pp.shots++;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = Math.sin(p.pitch), cp = Math.cos(p.pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    const rx = cy, rz = -sy;
    const ux = sy * sp, uy = cp, uz = cy * sp;
    const ox = p.x, oy = p.y + p.eye, oz = p.z;
    const a = p.ads || 0, sx = 0.25 * (1 - a), sd = 0.2 * (1 - a) + 0.07 * a; // en ADS l'arme est centrée : la traçante part du canon
    const mx = ox + fx * 0.8 + rx * sx - ux * sd, my = oy + fy * 0.8 - uy * sd, mz = oz + fz * 0.8 + rz * sx - uz * sd;
    const n = d.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, rad = Math.sqrt(Math.random()) * spread;
      const ca = Math.cos(a) * rad, sa = Math.sin(a) * rad;
      let dx = fx + rx * ca + ux * sa, dy = fy + uy * sa, dz = fz + rz * ca + uz * sa;
      const l = Math.hypot(dx, dy, dz);
      dx /= l; dy /= l; dz /= l;
      if (d.projectile) { this.proj.spawn(ox + dx * 0.6, oy + dy * 0.6 - 0.15, oz + dz * 0.6, dx, dy, dz, d, this.pp); continue; }
      this.hitscan(this.pp, ox, oy, oz, dx, dy, dz, d, p.dmgMul, mx, my, mz);
    }
  }

  // Tir d'un bot vers (tx,ty,tz) avec une erreur de visée `err` (rayon du cône).
  botShot(b, d, tx, ty, tz, err, mul) {
    const ox = b.x, oy = b.y + b.eye * b.hs, oz = b.z;
    b.shots++;
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l0 = Math.hypot(dx, dy, dz) || 1;
    dx /= l0; dy /= l0; dz /= l0;
    const n = d.pellets || 1;
    for (let i = 0; i < n; i++) {
      let ex = dx + (Math.random() - 0.5) * 2 * (err + d.spread * 0.5), ey = dy + (Math.random() - 0.5) * 2 * (err + d.spread * 0.5), ez = dz + (Math.random() - 0.5) * 2 * (err + d.spread * 0.5);
      const l = Math.hypot(ex, ey, ez);
      ex /= l; ey /= l; ez /= l;
      if (d.projectile) { this.proj.spawn(ox + ex * 0.6, oy + ey * 0.6 - 0.15, oz + ez * 0.6, ex, ey, ez, d, b); continue; }
      this.hitscan(b, ox, oy, oz, ex, ey, ez, d, mul, ox + ex * 0.6, oy - 0.2 + ey * 0.6, oz + ez * 0.6);
    }
  }

  explode(x, y, z, pr, owner = this.pp) {
    this.fx.explosion(x, y, z, pr.splashRadius);
    const R = pr.splashRadius, all = this.all;
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (t.health.dead) continue;
      const px = t.x - x, py = t.y + 0.9 * t.hs - y, pz = t.z - z, d = Math.hypot(px, py, pz);
      if (d >= R) continue;
      const f = 1 - d / R;
      if (t.isPlayer && t.health.alive) {
        const l = d || 1, p = this.player;
        p.vx += (px / l) * f * 12; p.vy += (py / l) * f * 12 + f * 3; p.vz += (pz / l) * f * 12;
        p.grounded = false;
      }
      this.applyDamage(t, pr.splashDmg * f * (t === owner ? 0.4 : 1), 1, owner);
    }
  }

  tick(dt) {
    const p = this.player, k = this.input.k, pr = this.input.pressed, h = p.health;
    this.weapons.tick(dt, this.input, p);
    this.proj.tick(dt);
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      t.tick(dt);
      if (t.health.dead) this.sendDeath(t); else t._ds = false;
    }
    this.fx.tick(dt);
    if (this.hitmark > 0) this.hitmark -= dt;
    if (this.hurt > 0) this.hurt -= dt;
    if (this.dmgT > 0 && (this.dmgT -= dt) <= 0) this.dmgSum = 0;
    if (pr.KeyT && this.respawnPlayer) this.damagePlayer(50); // debug : s'infliger 50 dégâts

    h.tick(dt);
    if (h.dead) this.sendDeath(this.pp); else this.pp._ds = false;
    let prompt = '';
    if (h.dead) {
      if (this.respawnPlayer) {
        this.deadT += dt;
        prompt = 'Éliminé — réapparition…';
        if (this.deadT > 3) { p.spawn(); this.deadT = 0; }
      } else prompt = 'Éliminé';
    } else if (h.downed) {
      let ally = null;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (t.team === p.team && t.health.alive && Math.hypot(t.x - p.x, t.z - p.z) < 4) { ally = t; break; }
      }
      if (ally) { this.revive += dt / REVIVE_TIME; prompt = 'Un allié vous réanime…'; } else { this.revive = 0; prompt = 'À TERRE — rampez vers un allié'; }
      if (this.revive >= 1) { h.revived(); this.revive = 0; }
    } else {
      let near = null;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (t.team === p.team && t.health.downed && Math.hypot(t.x - p.x, t.z - p.z) < 2.5) { near = t; break; }
      }
      if (near) {
        prompt = 'Maintenir E — Réanimer';
        if (k.KeyE) {
          this.revive += dt / (REVIVE_TIME * p.pv.reviveMul);
          if (this.revive >= 1) { near.health.revived(); this.revive = 0; }
        } else this.revive = 0;
      } else this.revive = 0;
    }
    if (prompt) p.prompt = prompt;
  }
}
