import * as THREE from 'three';
import legends from './legends.json';
import { PASSIVES, TACTICALS, ULTIMATES } from './handlers.js';
import { defaultPv } from '../combat/target.js';

export const LEGEND_IDS = Object.keys(legends);
export const LEGENDS = legends;
const MAX_FX = 64;

// Système d'habiletés générique (1 passive + tactique F + ultime G), piloté par JSON.
// Une seule instance sert le joueur (tick) et les bots (castFor) : les pools (murs, mines, gaz, effets) sont partagés.
// Interface « acteur » : team, x/y/z, yaw, pitch, eye, vx/vy/vz, grounded, health, pv, dmgMul, takenMul, moveMul.
export class Abilities {
  constructor(combat, player, scene) {
    this.cb = combat; this.player = player; this.actor = player; this.pv = player.pv;
    this.owner = combat.own(player);
    this.id = ''; this.L = null;
    this.tCd = 0; this.uCharge = 0;
    this.emit = null; // (kind, ...nombres) : relais réseau des murs/nuages posés localement
    this.fx = [];
    for (let i = 0; i < MAX_FX; i++) this.fx.push({ t: 0, tick: null, end: null });
    this.ox = this.oy = this.oz = this.dx = this.dy = this.dz = this.hitT = 0;
    const c = combat.world.colliders;
    const glass = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
    this.walls = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass(0x60d0ff, 0.45)); m.visible = false; scene.add(m);
      this.walls.push({ slot: c.addSlot(), m, t: 0 });
    }
    const mineG = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), mineM = new THREE.MeshBasicMaterial({ color: 0xe0c040 });
    this.mines = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(mineG, mineM); m.visible = false; scene.add(m);
      this.mines.push({ on: false, m, x: 0, y: 0, z: 0, team: 0, arm: 0, p: null, order: 0, owner: null });
    }
    this.mineSeq = 0;
    this.gases = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glass(0x90e040, 0.25)); m.visible = false; scene.add(m);
      this.gases.push({ on: false, m, x: 0, y: 0, z: 0, r: 1, t: 0, dps: 0, team: 0, owner: null });
    }
    player.onSpawn = () => this.reset();
    this.setLegend(LEGEND_IDS[0]);
  }

  setLegend(id) { this.id = id; this.L = legends[id]; this.reset(); }
  nextLegend() { this.setLegend(LEGEND_IDS[(LEGEND_IDS.indexOf(this.id) + 1) % LEGEND_IDS.length]); }

  // Applique la passive d'une légende à un acteur (joueur ou bot).
  applyPassive(actor, id) {
    const L = legends[id];
    const prev = this.actor, prevPv = this.pv;
    this.actor = actor; this.pv = actor.pv;
    actor.pv = this.pv = Object.assign(actor.pv || {}, defaultPv());
    actor.health.maxShield = 50; actor.health.shield = 50;
    PASSIVES[L.passive.type](this, L.passive);
    this.actor = prev; this.pv = prevPv;
  }

  // Remet buffs, pièges et recharges du joueur à zéro puis applique la passive.
  reset() {
    const a = this.player;
    for (const f of this.fx) { if (f.t > 0 && f.end) f.end(); f.t = 0; f.tick = f.end = null; }
    a.dmgMul = 1; a.takenMul = 1; a.moveMul = 1;
    this.clearPools();
    this.tCd = 0; this.uCharge = 0;
    if (this.L) this.applyPassive(a, this.id);
  }

  clearPools() {
    const c = this.cb.world.colliders;
    for (const w of this.walls) { c.clearSlot(w.slot); w.m.visible = false; w.t = 0; }
    for (const m of this.mines) { m.on = false; m.m.visible = false; }
    for (const g of this.gases) { g.on = false; g.m.visible = false; }
  }

  get ultReady() { return this.uCharge >= this.L.ultimate.charge; }

  // Lance une habileté pour un bot : retourne true si elle a été utilisée.
  castFor(actor, slot, id) {
    const L = legends[id][slot];
    const fn = (slot === 'tactical' ? TACTICALS : ULTIMATES)[L.type];
    const prev = this.actor, prevPv = this.pv, prevOwner = this.owner;
    this.actor = actor; this.pv = actor.pv; this.owner = this.cb.own(actor);
    const r = fn(this, L) !== false;
    this.actor = prev; this.pv = prevPv; this.owner = prevOwner;
    return r;
  }

  // Origine (œil) et direction de visée ; trace jusqu'à `range` → hitT.
  aim(range) {
    const a = this.actor, sy = Math.sin(a.yaw), cy = Math.cos(a.yaw), sp = Math.sin(a.pitch), cp = Math.cos(a.pitch);
    this.ox = a.x; this.oy = a.y + a.eye; this.oz = a.z;
    this.dx = -sy * cp; this.dy = sp; this.dz = -cy * cp;
    this.cb.trace(this.ox, this.oy, this.oz, this.dx, this.dy, this.dz, range, this.owner);
    this.hitT = this.cb.hitT;
  }

  addEffect(duration, tick, end) {
    for (const f of this.fx) if (f.t <= 0) { f.t = duration; f.tick = tick; f.end = end || null; return; }
  }

  placeWall(p) {
    const a = this.actor;
    const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    const cx = a.x - sy * 3, cz = a.z - cy * 3, hw = p.width / 2, th = 0.25;
    const alongX = Math.abs(sy) < Math.abs(cy);
    const sx = alongX ? hw : th, sz = alongX ? th : hw;
    this.setWall(cx - sx, a.y, cz - sz, cx + sx, a.y + p.height, cz + sz, p.duration);
    if (this.emit) this.emit(3, cx - sx, a.y, cz - sz, cx + sx, a.y + p.height, cz + sz, p.duration);
  }

  // Pose un mur (aussi utilisé pour répliquer les murs des autres joueurs).
  setWall(x0, y0, z0, x1, y1, z1, dur) {
    const w = this.walls.find((x) => x.t <= 0) || this.walls[0];
    this.cb.world.colliders.setSlot(w.slot, x0, y0, z0, x1, y1, z1);
    w.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); w.m.scale.set(x1 - x0, y1 - y0, z1 - z0); w.m.visible = true;
    w.t = dur;
  }

  placeMine(p) {
    const a = this.actor;
    let n = 0, oldest = null, free = null;
    for (const m of this.mines) {
      if (m.on && m.owner === this.owner) { n++; if (!oldest || m.order < oldest.order) oldest = m; }
      else if (!m.on && !free) free = m;
    }
    const m = n >= p.max ? oldest : free;
    if (!m) return false;
    m.on = true; m.team = a.team; m.owner = this.owner; m.x = a.x; m.y = a.y; m.z = a.z; m.arm = 1; m.p = p; m.order = ++this.mineSeq;
    m.m.position.set(a.x, a.y + 0.05, a.z); m.m.visible = true;
  }

  placeGas(p) {
    this.aim(p.range);
    const g = this.gases.find((x) => !x.on) || this.gases[0];
    g.on = true; g.team = this.actor.team; g.owner = this.owner; g.vis = false;
    g.x = this.ox + this.dx * this.hitT; g.z = this.oz + this.dz * this.hitT;
    g.y = Math.max(this.cb.world.groundY(g.x, g.z), this.oy + this.dy * this.hitT);
    g.r = p.radius; g.t = p.duration; g.dps = p.dps;
    g.m.position.set(g.x, g.y, g.z); g.m.scale.setScalar(p.radius); g.m.visible = true;
    if (this.emit) this.emit(4, g.x, g.y, g.z, g.r, g.t);
  }

  // Nuage purement visuel (réplication du nuage d'un autre joueur : les dégâts sont gérés par son propriétaire).
  showGas(x, y, z, r, dur) {
    const g = this.gases.find((q) => !q.on) || this.gases[0];
    g.on = true; g.vis = true; g.team = -99; g.owner = null; g.x = x; g.y = y; g.z = z; g.r = r; g.t = dur; g.dps = 0;
    g.m.position.set(x, y, z); g.m.scale.setScalar(r); g.m.visible = true;
  }

  tick(dt, input) {
    const a = this.player, pr = input.pressed, L = this.L, alive = a.health.alive;
    if (pr.KeyL && this.allowSwitch) { this.nextLegend(); return; }
    if (pr.KeyY && this.allowSwitch) this.uCharge = L.ultimate.charge; // debug (entraînement)
    if (this.tCd > 0) this.tCd -= dt;
    if (this.uCharge < L.ultimate.charge) this.uCharge += dt;

    if (alive) {
      if (pr.KeyF && this.tCd <= 0 && TACTICALS[L.tactical.type](this, L.tactical) !== false) {
        this.tCd = L.tactical.cooldown * (L.tactical.trap ? a.pv.trapMul : 1);
      }
      if (pr.KeyG && this.ultReady && ULTIMATES[L.ultimate.type](this, L.ultimate) !== false) this.uCharge = 0;
      const pv = a.pv, h = a.health;
      if (pv.regen > 0 && a.sinceDamage > pv.regenDelay && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + pv.regen * dt);
    }
    a.sinceDamage += dt;

    for (const f of this.fx) {
      if (f.t <= 0) continue;
      if (f.tick) f.tick(dt);
      if ((f.t -= dt) <= 0) { if (f.end) f.end(); f.tick = f.end = null; }
    }
    const c = this.cb.world.colliders, tg = this.cb.all;
    for (const w of this.walls) if (w.t > 0 && (w.t -= dt) <= 0) { c.clearSlot(w.slot); w.m.visible = false; }
    for (const m of this.mines) {
      if (!m.on) continue;
      if (m.arm > 0) { m.arm -= dt; continue; }
      let hit = false;
      for (let i = 0; i < tg.length; i++) {
        const t = tg[i];
        if (t.team !== m.team && !t.health.dead && Math.hypot(t.x - m.x, t.z - m.z) < m.p.triggerRadius) { hit = true; break; }
      }
      if (hit) { m.on = false; m.m.visible = false; this.cb.explode(m.x, m.y + 0.3, m.z, m.p, m.owner); }
    }
    for (const g of this.gases) {
      if (!g.on) continue;
      g.t -= dt;
      if (g.t <= 0) { g.on = false; g.m.visible = false; continue; }
      if (g.vis) continue;
      for (let i = 0; i < tg.length; i++) {
        const t = tg[i];
        if (t.team !== g.team && !t.health.dead && Math.hypot(t.x - g.x, t.z - g.z) < g.r && t.y < g.y + g.r) this.cb.applyDamage(t, g.dps * dt, 1, g.owner);
      }
    }
  }
}
