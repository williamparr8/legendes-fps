import * as THREE from 'three';
import { Target } from '../combat/target.js';
import { REVIVE_TIME } from '../combat/health.js';
import { LEGENDS } from '../legends/abilities.js';
import diffs from './difficulty.json';
import wdefs from '../combat/weapons.json';

const PREF = { rifle: 20, smg: 12, shotgun: 7, sniper: 45, launcher: 25 }; // distance de combat préférée
const BASE_SPEED = 5.4, R = 0.4, H = 1.8;
// Quand un bot utilise une habileté : engage = ennemi en vue, hurt = sous le feu, heal = blessé au calme, revive = allié à terre.
const USE = { pulse: 'never', revealAll: 'never', grenade: 'engage', wall: 'hurt', dash: 'never', heal: 'heal', mine: 'engage', rage: 'engage', fortress: 'hurt', teleport: 'never', revivePulse: 'revive', gas: 'engage' };
const gunG = new THREE.BoxGeometry(0.08, 0.1, 0.5), gunM = new THREE.MeshLambertMaterial({ color: 0x222222 });
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// Bot : corps (Target) + perception, décisions (think, ~5 Hz) et action (act, 60 Hz).
// ctx = { scene, combat, abilities, nav, zone, world, player }.
export class Bot extends Target {
  constructor(ctx, x, z, team, o) {
    super(ctx.scene, x, z, team);
    this.ctx = ctx; this.isBot = true; this.noRespawn = true;
    this.y = ctx.world.groundY(x, z);
    this.name = o.name; this.squad = o.squad; this.index = o.index || 0;
    this.diff = diffs[o.difficulty]; this.legend = o.legend; this.wid = o.weapon; this.def = wdefs[o.weapon];
    this.mag = this.def.mag; this.reloadT = 0; this.cd = 0; this.burst = 0; this.pause = 0; this.aimHead = false;
    this.yaw = o.yaw || 0; this.pitch = 0; this.eye = 1.65;
    this.vx = this.vy = this.vz = 0; this.grounded = true; this.sliding = false;
    this.state = 'roam'; this.gx = x; this.gz = z; this.hasGoal = false; this.goalT = 0;
    this.path = new Int32Array(64); this.pathLen = 0; this.pathI = 0; this.needPath = false;
    this.enemy = null; this.seen = false; this.seeFor = 0; this.sinceSeen = 99; this.lastX = x; this.lastZ = z;
    this.alertT = 0; this.thinkT = Math.random() * 0.2; this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1;
    this.tCd = 5 + Math.random() * 10; this.uCharge = Math.random() * 20;
    this.healItems = 1 + ((Math.random() * 2) | 0); this.healT = 0;
    this.coverX = 0; this.coverZ = 0; this.coverT = 0; this.wantCover = false;
    this.wx = 0; this.wz = 0; this.lastPx = x; this.lastPz = z; this.stuckT = 0;
    this.gun = new THREE.Mesh(gunG, gunM); this.gun.position.set(0.28, 1.2, -0.35);
    this.group.add(this.gun);
    ctx.abilities.applyPassive(this, o.legend);
  }

  onHurt(attacker) {
    this.sinceDamage = 0; this.alertT = 4;
    if (attacker && !this.seen && attacker.team !== this.team) { this.lastX = attacker.x; this.lastZ = attacker.z; this.sinceSeen = 0; }
  }

  tick(dt) {
    super.tick(dt);
    const h = this.health;
    if (h.dead) return;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.sinceDamage += dt;
    if (h.downed) return;
    if (this.pv.regen > 0 && this.sinceDamage > this.pv.regenDelay && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + this.pv.regen * dt);
    this.tCd -= dt; this.uCharge += dt; this.alertT -= dt; this.sinceSeen += dt; this.goalT -= dt;
    if ((this.thinkT -= dt) <= 0) { this.thinkT = 0.18 + Math.random() * 0.08; this.think(); }
    this.act(dt);
    this.physics(dt);
  }

  // ---------- perception ----------
  perceive() {
    const cb = this.ctx.combat, all = cb.all, d = this.diff;
    let best = null, bs = 1e9;
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (t === this || t.team === this.team || !t.health.alive) continue;
      const dx = t.x - this.x, dz = t.z - this.z, dist = Math.hypot(dx, dz);
      if (dist > d.view) continue;
      if (dist > 14 && this.alertT <= 0 && Math.abs(angDiff(Math.atan2(-dx, -dz), this.yaw)) > 1.05) continue;
      if (!cb.los(this, t)) continue;
      const s = dist - (t === this.enemy ? 8 : 0);
      if (s < bs) { bs = s; best = t; }
    }
    if (best) {
      if (best !== this.enemy) this.seeFor = 0;
      this.enemy = best; this.seen = true; this.lastX = best.x; this.lastZ = best.z; this.sinceSeen = 0;
    } else this.seen = false;
  }

  downedMate() {
    let best = null, bd = 60;
    for (const t of this.ctx.combat.all) {
      if (t === this || t.team !== this.team || !t.health.downed) continue;
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // ---------- décisions ----------
  think() {
    const c = this.ctx, h = this.health, z = c.zone;
    this.perceive();
    const e = this.seen ? this.enemy : null;
    const dist = e ? Math.hypot(e.x - this.x, e.z - this.z) : 0;
    this.useAbilities(e, dist);
    const prev = this.state;
    const rotate = !z.safe(this.x, this.z);
    const mate = this.downedMate();
    let st;
    if (e && !(rotate && dist > 18)) st = 'engage';
    else if (rotate) st = 'rotate';
    else if (mate && this.sinceSeen > 1.5) st = 'revive';
    else if ((h.hp < 60 || h.shield < 10) && this.healItems > 0 && this.sinceSeen > 2.5) st = 'heal';
    else if (this.sinceSeen < 8) st = 'search';
    else st = this.squad.isFollower(this) ? 'follow' : 'roam';
    if (st !== prev) { this.state = st; this.pathLen = 0; this.hasGoal = false; if (st === 'heal') this.healT = 3; }

    this.wantCover = this.reloadT > 0 || (h.hp < 45 && h.shield < 10);
    switch (st) {
      case 'engage':
        if (this.wantCover && e) { if (this.coverT <= 0) this.findCover(e); }
        else if (e && dist > PREF[this.wid] * 1.3 && !c.combat.los(this, e)) this.setGoal(e.x, e.z);
        break;
      case 'rotate': if (!this.hasGoal || this.goalT <= 0) { const p = z.randomSafe(); this.setGoal(p[0], p[1]); this.goalT = 8; } break;
      case 'revive': if (mate) this.setGoal(mate.x, mate.z); break;
      case 'search': this.setGoal(this.lastX, this.lastZ); break;
      case 'follow': {
        const s = this.squad, a = (this.index / 3) * TAU;
        if (Math.hypot(s.ax - this.x, s.az - this.z) < 8) { this.hasGoal = false; this.pathLen = 0; } else this.setGoal(s.ax + Math.cos(a) * 5, s.az + Math.sin(a) * 5);
        break;
      }
      case 'roam': { const s = this.squad; if (s.goalT <= 0 || Math.hypot(s.gx - this.x, s.gz - this.z) < 4) s.pickGoal(c.world, z); this.setGoal(s.gx, s.gz); break; }
    }
    if (this.coverT > 0) this.coverT -= 0.2;
  }

  setGoal(x, z) {
    if (!this.hasGoal || Math.hypot(x - this.gx, z - this.gz) > 3 || (this.pathI >= this.pathLen && this.goalT <= 0)) {
      this.gx = x; this.gz = z; this.needPath = true; this.hasGoal = true; this.goalT = 3;
    } else { this.gx = x; this.gz = z; }
  }

  findCover(e) {
    const nav = this.ctx.nav, c = this.ctx.combat.world.colliders;
    let bestD = 1e9, found = false;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, r = 3 + Math.random() * 6;
      const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
      if (!nav.isFree(x, z)) continue;
      const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
      if (c.ray(e.x, e.y + 1.5, e.z, dx / d, 0, dz / d, d) < 0) continue; // visible depuis l'ennemi : pas un abri
      if (r < bestD) { bestD = r; this.coverX = x; this.coverZ = z; found = true; }
    }
    this.coverT = 3;
    if (found) this.setGoal(this.coverX, this.coverZ);
  }

  useAbilities(e, dist) {
    const L = LEGENDS[this.legend], ab = this.ctx.abilities;
    if (Math.random() > this.diff.ability) return;
    const ok = (kind) => kind === 'engage' ? !!e && dist < 40 : kind === 'hurt' ? !!e && this.sinceDamage < 2.5
      : kind === 'heal' ? !e && this.health.hp < 70 : kind === 'revive' ? !!this.downedMate() : false;
    if (this.tCd <= 0 && ok(USE[L.tactical.type]) && ab.castFor(this, 'tactical', this.legend)) {
      this.tCd = L.tactical.cooldown * (L.tactical.trap ? this.pv.trapMul : 1);
    }
    if (this.uCharge >= L.ultimate.charge && ok(USE[L.ultimate.type]) && ab.castFor(this, 'ultimate', this.legend)) this.uCharge = 0;
  }

  // ---------- action (60 Hz) ----------
  act(dt) {
    const d = this.diff, st = this.state, e = this.seen ? this.enemy : null;
    const speed = BASE_SPEED * d.speed * this.moveMul * this.pv.moveMul;
    let mx = 0, mz = 0, moving = false;

    if (e) { this.seeFor += dt; this.aimAt(e, dt); }
    else { this.seeFor = 0; this.pitch *= 1 - Math.min(1, dt * 4); }

    if (st === 'engage' && e) {
      const dx = e.x - this.x, dz = e.z - this.z, dist = Math.hypot(dx, dz) || 1, nx = dx / dist, nz = dz / dist, pref = PREF[this.wid];
      if (this.wantCover && this.hasGoal && this.coverT > 0) moving = this.followPath();
      else if (dist > pref * 1.3) { if (this.ctx.combat.los(this, e)) { this.wx = nx; this.wz = nz; moving = true; } else moving = this.followPath(); }
      else if (dist < pref * 0.55) { this.wx = -nx; this.wz = -nz; moving = true; }
      else {
        if ((this.strafeT -= dt) <= 0) { this.strafeDir = -this.strafeDir; this.strafeT = 0.8 + Math.random() * 1.8; }
        this.wx = -nz * this.strafeDir; this.wz = nx * this.strafeDir; moving = true;
        mx = this.wx * speed * d.strafe; mz = this.wz * speed * d.strafe;
      }
      if (moving && !mx && !mz) { mx = this.wx * speed; mz = this.wz * speed; }
    } else if (st === 'heal') {
      if ((this.healT -= dt) <= 0) {
        this.healItems--; this.health.hp = Math.min(this.health.maxHp, this.health.hp + 60); this.health.shield = Math.min(this.health.maxShield, this.health.shield + 30);
      }
    } else if (st === 'revive') {
      const mate = this.downedMate();
      if (mate && Math.hypot(mate.x - this.x, mate.z - this.z) < 1.8) {
        if (!mate.isHuman && (mate.reviveT += dt / REVIVE_TIME) >= 1) { mate.health.revived(); mate.reviveT = 0; }
      } else if (this.followPath()) { mx = this.wx * speed; mz = this.wz * speed; moving = true; }
    } else if (this.followPath()) {
      mx = this.wx * speed; mz = this.wz * speed; moving = true;
      if (!e) this.turnTo(Math.atan2(-this.wx, -this.wz), dt, 0.6);
    }

    // séparation entre bots
    const all = this.ctx.combat.targets;
    for (let i = 0; i < all.length; i++) {
      const o = all[i];
      if (o === this || !o.isBot || o.health.dead) continue;
      const ox = this.x - o.x, oz = this.z - o.z, dd = ox * ox + oz * oz;
      if (dd < 0.64 && dd > 1e-4) { const k = 2 / Math.sqrt(dd); mx += ox * k * 0.5; mz += oz * k * 0.5; }
    }
    const a = Math.min(1, dt * 10);
    this.vx += (mx - this.vx) * a; this.vz += (mz - this.vz) * a;
    this.shoot(dt, e);
  }

  followPath() {
    const nav = this.ctx.nav;
    while (this.pathI < this.pathLen) {
      const ci = this.path[this.pathI], dx = nav.cx(ci) - this.x, dz = nav.cz(ci) - this.z, dd = Math.hypot(dx, dz);
      if (dd < 0.9) { this.pathI++; continue; }
      this.wx = dx / dd; this.wz = dz / dd;
      return true;
    }
    if (this.hasGoal && !this.needPath) {
      const dx = this.gx - this.x, dz = this.gz - this.z, dd = Math.hypot(dx, dz);
      if (dd > 1.5) { this.wx = dx / dd; this.wz = dz / dd; return true; }
    }
    return false;
  }

  turnTo(yaw, dt, rate = 1) {
    const dy = angDiff(yaw, this.yaw), m = this.diff.turn * rate * dt;
    this.yaw += Math.max(-m, Math.min(m, dy));
  }

  aimAt(e, dt) {
    const dx = e.x - this.x, dz = e.z - this.z, dist = Math.hypot(dx, dz) || 1;
    this.turnTo(Math.atan2(-dx, -dz), dt);
    const ty = e.y + (this.aimHead ? 1.62 : 1.1) * e.hs - (this.y + this.eye);
    const tp = Math.atan2(ty, dist), m = this.diff.turn * dt;
    this.pitch += Math.max(-m, Math.min(m, tp - this.pitch));
  }

  shoot(dt, e) {
    const d = this.diff, def = this.def;
    this.cd -= dt;
    if (this.reloadT > 0) { if ((this.reloadT -= dt) <= 0) this.mag = def.mag; return; }
    if (this.pause > 0) this.pause -= dt;
    if (this.ctx.combat.matchT < 8) return; // les bots ne tirent pas pendant les premières secondes
    const st = this.state;
    if (!e || st === 'heal' || st === 'revive' || this.seeFor < d.react || this.pause > 0) return;
    const dx = e.x - this.x, dz = e.z - this.z;
    if (Math.abs(angDiff(Math.atan2(-dx, -dz), this.yaw)) > 0.18) return;
    if (this.cd > 0) return;
    if (this.mag <= 0) { this.reloadT = def.reload; return; }
    const dist = Math.hypot(dx, dz), moving = Math.hypot(this.vx, this.vz) > 2;
    const err = d.aimErr * (1 + dist / 50) * (moving ? 1.4 : 1) * (1 - 0.4 * Math.min(1, this.seeFor / 3));
    this.ctx.combat.botShot(this, def, e.x, e.y + (this.aimHead ? 1.62 : 1.1) * e.hs, e.z, err, this.dmgMul * d.dmg);
    this.cd = 60 / def.rpm; this.mag--;
    if (--this.burst <= 0) {
      this.burst = def.auto ? 3 + ((Math.random() * 5) | 0) : 1;
      this.pause = (def.auto ? 0.35 : 0.2) + Math.random() * 0.8 * (1.4 - d.strafe * 0.5);
      this.aimHead = Math.random() < d.headChance;
    }
  }

  // ---------- physique ----------
  physics(dt) {
    const c = this.ctx.combat.world.colliders;
    let nx = this.x + this.vx * dt;
    if (!c.query(nx, this.y, this.z, R, H)) this.x = nx; else this.tryStep(c, nx, this.z);
    const nz = this.z + this.vz * dt;
    if (!c.query(this.x, this.y, nz, R, H)) this.z = nz; else this.tryStep(c, this.x, nz);
    const wasG = this.grounded;
    this.vy -= 24 * dt;
    const ny = this.y + this.vy * dt;
    if (c.query(this.x, ny, this.z, R, H)) { if (this.vy < 0) { this.y = c.hitTop; this.grounded = true; } else this.y = c.hitBottom - H - 0.001; this.vy = 0; }
    else { this.y = ny; this.grounded = false; }
    const g = this.ctx.world.groundY(this.x, this.z);
    if (this.y <= g || (wasG && this.vy <= 0 && this.y - g < 0.4)) { this.y = g; if (this.vy < 0) this.vy = 0; this.grounded = true; }
    // bloqué ? on recalcule le chemin
    if ((this.stuckT += dt) >= 1.2) {
      const moved = Math.hypot(this.x - this.lastPx, this.z - this.lastPz);
      if (moved < 0.5 && Math.hypot(this.vx, this.vz) > 0.5 || (moved < 0.2 && this.hasGoal && this.pathI < this.pathLen)) { this.needPath = true; this.goalT = 0; this.vx += (Math.random() - 0.5) * 6; this.vz += (Math.random() - 0.5) * 6; }
      this.lastPx = this.x; this.lastPz = this.z; this.stuckT = 0;
    }
  }

  tryStep(c, nx, nz) {
    if (!this.grounded) return;
    const top = c.hitTop, d = top - this.y;
    if (d > 0 && d <= 0.55 && !c.query(nx, top, nz, R, H)) { this.x = nx; this.z = nz; this.y = top; }
  }
}
