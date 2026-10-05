import { Bot } from '../bots/bot.js';
import { Zone } from './zone.js';
import { Ship, ZONE_DELAY } from './drop.js';
import wdefs from '../combat/weapons.json';

// Escouade : les bots suivent un humain vivant de l'escouade (l'ancre) ; sans humain, le chef (premier bot vivant) choisit les destinations.
class Squad {
  constructor(team) {
    this.team = team; this.members = [];
    this.leader = null; this.anchor = null; this.ax = 0; this.az = 0; this.gx = 0; this.gz = 0; this.goalT = 0; this.place = 0; this.alive = true;
    this.hasHuman = false; this.done = false;
  }
  isFollower(b) { return this.anchor !== null || (this.leader !== null && this.leader !== b); }
  pickGoal(world, zone) {
    const poi = world.poi;
    for (let i = 0; i < 8; i++) {
      const p = poi[(world.rand() * poi.length) | 0];
      if (zone.safe(p[0], p[1])) { this.gx = p[0]; this.gz = p[1]; this.goalT = 25 + world.rand() * 15; return; }
    }
    const p = zone.randomSafe();
    this.gx = p[0]; this.gz = p[1]; this.goalT = 15;
  }
  update(dt) {
    this.goalT -= dt;
    this.leader = null; this.anchor = null;
    for (const m of this.members) {
      if (m.isBot) { if (this.leader === null && m.health.alive) this.leader = m; }
      else if (this.anchor === null && !m.health.dead) this.anchor = m;
    }
    const a = this.anchor || this.leader;
    if (a) { this.ax = a.x; this.az = a.z; }
  }
}

const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Partie « battle royale » : apparitions, butin, zone, escouades de bots, éliminations, classement.
export class Match {
  constructor(ctx, cfg, onEnd) {
    this.ctx = ctx; this.cfg = cfg; this.onEnd = onEnd;
    const { world, combat, scene, loot, player } = ctx;
    const r = world.rand;
    this.t = 0; this.ended = false; this.result = null; this.checkT = 0; this.pi = 0;
    this.stats = { kills: 0, damage: 0 };
    this.feed = []; this.outFeed = []; // outFeed : lignes à diffuser aux clients
    this.hold = false;
    const humans = cfg.humans || [{ id: 0, local: true, name: 'Vous', legend: cfg.legend }];
    this.humans = [];
    this.zone = new Zone(scene, r, cfg.zone, world.half);
    ctx.zone = this.zone;
    this.drop = ctx.drop = { ship: new Ship(scene, cfg.seed, world.half), t: 0, leader: null }; // tout le monde part du vaisseau
    if (cfg.zone) this.zone.t += ZONE_DELAY;
    this.squads = []; this.bots = [];

    shuffle(world.lootPoints, r);
    const nLoot = Math.min(world.lootPoints.length, cfg.lootCount || 260);
    for (let i = 0; i < nLoot; i++) loot.spawn(loot.roll(cfg.weapons), world.lootPoints[i][0], world.lootPoints[i][1], undefined, world.lootPoints[i][2]);

    // Échantillonnage du point le plus éloigné : escouades bien réparties sur la carte.
    const size = cfg.mode === 'solo' ? 1 : cfg.squadSize;
    const nHuman = Math.ceil(humans.length / size), total = nHuman + cfg.enemySquads;
    const cand = world.spawns, spawns = [cand[(r() * cand.length) | 0]];
    while (spawns.length < total) {
      let best = null, bd = -1;
      for (const c of cand) {
        let md = 1e9;
        for (const s of spawns) md = Math.min(md, Math.hypot(c.x - s.x, c.z - s.z));
        if (md > bd) { bd = md; best = c; }
      }
      spawns.push(best);
    }
    const mk = (team, count, sp, hs) => {
      const sq = new Squad(team);
      for (let i = 0; i < count; i++) {
        const ox = Math.cos(i * 2.1) * (i ? 2.2 : 0), oz = Math.sin(i * 2.1) * (i ? 2.2 : 0);
        if (hs[i]) {
          const h = hs[i];
          const m = h.local ? combat.pp : ctx.net.makeRemote(scene, h, team, sp.x + ox, sp.z + oz, sp.yaw);
          if (h.local) combat.pp.name = h.name; else { combat.add(m); m.stance = 4; }
          sq.members.push(m); this.humans.push(m); sq.hasHuman = true;
          continue;
        }
        const legend = cfg.legends[(r() * cfg.legends.length) | 0];
        const b = new Bot({ scene, combat, abilities: ctx.abilities, nav: ctx.nav, zone: this.zone, world, player, loot, drop: this.drop },
          sp.x + ox, sp.z + oz, team, { name: 'Bot ' + (this.bots.length + 1), squad: sq, index: i, difficulty: cfg.difficulty, legend, weapon: null, yaw: sp.yaw });
        b.id = 100 + this.bots.length;
        combat.add(b);
        sq.members.push(b); this.bots.push(b);
      }
      for (const m of sq.members) if (m.isBot) m.dropLead = sq.members[0] === m ? null : sq.members[0]; // chef de saut = premier membre (humain d'abord)
      this.squads.push(sq);
      return sq;
    };
    for (let k = 0; k < nHuman; k++) mk(k, size, spawns[k], humans.slice(k * size, (k + 1) * size));
    for (let i = 0; i < cfg.enemySquads; i++) mk(nHuman + i, size, spawns[(nHuman + i) % spawns.length], []);
    this.playerSquad = this.squads[0]; // l'hôte (ou le joueur local) est toujours le premier humain
    player.team = 0;
    player.sx = spawns[0].x; player.sz = spawns[0].z; player.syaw = spawns[0].yaw; player.spawn();
    const lead0 = this.squads[0].members[0];
    player.drop = this.drop; player.phase = 1; player.attached = lead0 !== combat.pp; this.drop.leader = lead0 === combat.pp ? null : lead0;
    this.aliveSquads = this.squads.length;
    this.total = this.squads.length;

    combat.onDeath = (t, att) => this.handleDeath(t, att);
    combat.onDown = (t, att) => this.addFeed(this.name(att) + ' ➜ ' + t.name + ' (à terre)');
    combat.onDamage = (t, amount, att) => { if (t.team !== att.team) (att === combat.pp ? this.stats : att).damage += amount; };
  }

  pickWeapon(allowed, r) {
    const pool = allowed.filter((w) => wdefs[w]);
    const w = pool[(r() * pool.length) | 0];
    return w === 'launcher' && r() < 0.6 ? pool[0] : w;
  }

  name(a) { return a ? a.name : 'La zone'; }
  addFeed(text) { this.feed.push({ text, t: 7 }); if (this.feed.length > 6) this.feed.shift(); this.outFeed.push(text); }

  handleDeath(t, att) {
    const { loot, combat, player } = this.ctx;
    this.addFeed(this.name(att) + ' ✕ ' + t.name);
    if (att && att.isHuman && t !== att && t.team !== att.team) { if (att === combat.pp) this.stats.kills++; else att.kills++; }
    if (t.isBot) {
      loot.drop(t.x, t.z, 3, this.cfg.weapons, t.y);
      if (t.wid) loot.spawnWeapon(t.wid, t.x + 0.6, t.z, t.y);
    } else if (t === combat.pp || t.isRemote) loot.drop(t.x, t.z, 2, this.cfg.weapons, t.y);
  }

  tick(dt) {
    if (this.ended) return;
    const { combat, nav } = this.ctx;
    this.t += dt;
    combat.matchT = this.t;
    this.drop.t = this.t; this.drop.ship.at(this.t);
    for (const f of this.feed) f.t -= dt;
    while (this.feed.length && this.feed[0].t <= 0) this.feed.shift();
    this.zone.tick(dt, combat);
    for (const s of this.squads) s.update(dt);
    const n = this.bots.length;
    for (let k = 0; k < n; k++) {
      const b = this.bots[(this.pi + k) % n];
      if (b.needPath && b.health.alive) {
        b.pathLen = nav.find(b.x, b.z, b.gx, b.gz, b.path); b.pathI = 0; b.needPath = false;
        this.pi = (this.pi + k + 1) % n;
        break;
      }
    }
    if ((this.checkT -= dt) <= 0) { this.checkT = 0.5; this.checkTeams(); }
  }

  kills(m) { return m === this.ctx.combat.pp ? this.stats.kills : m.kills; }

  checkTeams() {
    const cfg = this.cfg;
    for (const s of this.squads) {
      if (!s.alive || s.members.some((m) => m.health.alive)) continue;
      s.alive = false; s.place = this.aliveSquads--;
      for (const m of s.members) if (m.health.downed) { m.health.downed = false; m.health.dead = true; this.ctx.combat.sendDeath(m); if (m.isRemote) m.cmds.push(['kd']); }
      this.finishSquad(s, s.place, false);
    }
    if (this.aliveSquads <= 1) {
      const w = this.squads.find((s) => s.alive);
      if (w) this.finishSquad(w, 1, true);
    } else if (cfg.killLimit > 0) {
      const top = this.humans.find((m) => this.kills(m) >= cfg.killLimit);
      if (top) { this.finishSquad(this.squads.find((s) => s.members.includes(top)), 1, true); for (const s of this.squads) if (s.alive) this.finishSquad(s, this.aliveSquads, false); }
    }
    if (cfg.timeLimit > 0 && this.t > cfg.timeLimit * 60) for (const s of this.squads) if (s.alive) this.finishSquad(s, this.aliveSquads, this.aliveSquads <= 1);
    if (this.squads.every((s) => !s.hasHuman || s.done)) this.ended = true;
  }

  // Résultat d'une escouade : envoyé à chacun de ses humains (local → écran de résultats ; distant → message).
  finishSquad(s, place, win) {
    if (s.done) return;
    s.done = true;
    for (const m of s.members) {
      if (!m.isHuman) continue;
      const local = m === this.ctx.combat.pp;
      const res = { win, place, total: this.total, kills: this.kills(m), damage: Math.round(local ? this.stats.damage : m.damage), time: Math.round(this.t), squadSize: this.cfg.squadSize };
      if (local) { this.result = res; this.onEnd(res); } else this.ctx.net.sendResult(m, res);
    }
  }

  get playersAlive() { let n = 0; for (const s of this.squads) for (const m of s.members) if (m.health.alive) n++; return n; }
}
