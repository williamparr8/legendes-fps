import { hostListen, connectTo, makeCode } from './transport.js';
import { RemotePlayer, r1, r2 } from './actors.js';
import items from '../loot/items.json';

export const MAX_PLAYERS = 8;
const SEND_EVERY = 3;      // 60 Hz / 3 = 20 messages par seconde
const TIMEOUT = 12000;     // ms sans nouvelle d'un pair avant de le considérer perdu
const clean = (s, d) => String(s || '').replace(/[<>&"']/g, '').trim().slice(0, 16) || d;

// Applique un effet reçu du réseau (traçante, impact, explosion, mur, nuage) sur une partie locale.
// Événements : [0,x0,y0,z0,x1,y1,z1] [1,x,y,z,type] [2,x,y,z,rayon] [3,x0,y0,z0,x1,y1,z1,durée] [4,x,y,z,rayon,durée]
function applyEvent(m, e) {
  const fx = m.combat.fx, ab = m.abilities;
  switch (e[0]) {
    case 0: fx.tracer(e[1], e[2], e[3], e[4], e[5], e[6], true); break;
    case 1: fx.impact(e[1], e[2], e[3], e[4], true); break;
    case 2: fx.explosion(e[1], e[2], e[3], e[4], true); break;
    case 3: ab.setWall(e[1], e[2], e[3], e[4], e[5], e[6], e[7]); break;
    case 4: ab.showGas(e[1], e[2], e[3], e[4], e[5]); break;
  }
}

// ======================================================================================================
// HÔTE : salon, puis simulation autoritaire (monde, bots, zone, butin). Les clients gèrent leur propre
// déplacement, leur santé et leurs tirs (touches rapportées à l'hôte, qui les applique).
// ======================================================================================================
export class HostSession {
  constructor(game, name, legend) {
    this.game = game; this.role = 'host'; this.id = 0;
    this.name = clean(name, 'Hôte'); this.legend = legend; this.code = '';
    this.players = new Map(); this.nextId = 1; this.state = 'lobby';
    this.onLobby = null; this.onChat = null;
    this.m = null; this.n = 0; this.evq = []; this.waiting = new Set(); this.waitT = 0;
    this.timer = setInterval(() => this.checkPeers(), 1000);
  }

  async open() {
    for (let i = 0; i < 6; i++) {
      const code = makeCode();
      try { this.srv = await hostListen(code, (l) => this.onLink(l)); this.code = code; return; }
      catch (e) { if (!e || e.type !== 'unavailable-id' || i === 5) throw e; }
    }
  }

  roster() {
    const r = [{ id: 0, name: this.name, legend: this.legend, host: 1 }];
    for (const p of this.players.values()) r.push({ id: p.id, name: p.name, legend: p.legend });
    return r;
  }
  broadcast(msg, except) { for (const p of this.players.values()) if (p !== except && !p.link.closed) p.link.send(msg); }
  lobby() { const r = this.roster(); this.broadcast({ t: 'lobby', players: r }); if (this.onLobby) this.onLobby(r); }
  say(from, text) { text = String(text).slice(0, 200); this.broadcast({ t: 'chat', from, text }); if (this.onChat) this.onChat(from, text); }
  setLegend(l) { this.legend = l; if (this.state === 'lobby') this.lobby(); }
  setName(n) { this.name = clean(n, 'Hôte'); }

  onLink(link) {
    const ent = { link, id: 0, name: '', legend: 'scout', seen: performance.now(), joined: false, actor: null, ready: false };
    link.onmessage = (m) => { ent.seen = performance.now(); this.onMsg(ent, m); };
    link.onclose = () => this.drop(ent);
  }

  refuse(ent, why) { ent.link.send({ t: 'refuse', why }); setTimeout(() => ent.link.close(), 300); }

  onMsg(ent, m) {
    if (m.t === 'join') {
      if (ent.joined) return;
      if (this.state !== 'lobby') return this.refuse(ent, 'Une partie est déjà en cours dans ce salon.');
      if (this.players.size >= MAX_PLAYERS - 1) return this.refuse(ent, 'Le salon est plein.');
      let name = clean(m.name, 'Joueur'), k = 2;
      const taken = (n) => n === this.name || [...this.players.values()].some((p) => p.name === n);
      while (taken(name)) name = clean(m.name, 'Joueur').slice(0, 13) + k++;
      ent.id = this.nextId++; ent.name = name; ent.legend = String(m.legend || 'scout'); ent.joined = true;
      this.players.set(ent.id, ent);
      ent.link.send({ t: 'welcome', id: ent.id, name });
      this.lobby();
      this.say('', name + ' a rejoint le salon.');
      return;
    }
    if (!ent.joined) return;
    switch (m.t) {
      case 'legend': ent.legend = String(m.legend); if (this.state === 'lobby') this.lobby(); break;
      case 'chat': this.say(ent.name, m.text); break;
      case 'ready': ent.ready = true; this.waiting.delete(ent.id); this.sendFullLoot(ent); break;
      case 'bye': this.drop(ent); ent.link.close(); break;
      case 'st': this.onState(ent, m); break;
      case 'pick': {
        const l = this.m && this.m.loot.list[m.i], r = ent.actor;
        if (l && l.on && r && !r.health.dead && Math.hypot(l.x - r.x, l.z - r.z) < 6 && Math.abs(l.y - r.y) < 3.5) ent.link.send({ t: 'pk', i: m.i });
        break;
      }
      case 'pk2': {
        const l = this.m && this.m.loot.list[m.i];
        if (!l) break;
        if (!m.on) this.m.loot.hide(l); else l.amount = m.amt;
        this.m.loot.dirty.add(m.i);
        break;
      }
      case 'drop': if (this.m && items.table[m.ti]) this.m.loot.spawn(items.table[m.ti], m.x, m.z, m.a, m.y); break;
      case 'rv': { const t = this.byId && this.byId.get(m.id); if (t && t.health.downed) t.health.revived(); break; }
      case 'hl': {
        const t = this.byId && this.byId.get(m.id);
        if (t && t.health.alive && m.d > 0 && m.d < 200) { const h = t.health; if (m.k === 0) h.hp = Math.min(h.maxHp, h.hp + m.d); else h.shield = Math.min(h.maxShield, h.shield + m.d); }
        break;
      }
    }
  }

  drop(ent) {
    if (!ent.joined || !this.players.has(ent.id)) return;
    this.players.delete(ent.id);
    this.waiting.delete(ent.id);
    if (this.state === 'lobby') { this.lobby(); this.say('', ent.name + ' a quitté le salon.'); }
    else if (ent.actor) {
      ent.actor.leave();
      if (this.m) this.m.match.addFeed(ent.name + ' s\'est déconnecté');
    }
  }

  checkPeers() {
    const now = performance.now();
    if ((this.pingN = (this.pingN || 0) + 1) % 2 === 0) this.broadcast({ t: 'ping' }); // le client en déduit que l'hôte est vivant
    for (const p of [...this.players.values()]) if (now - p.seen > TIMEOUT) { p.link.close(); this.drop(p); }
  }

  // ---------- partie ----------
  start(cfg) {
    this.state = 'game';
    const humans = [{ id: 0, name: this.name, legend: this.legend, local: true }];
    for (const p of this.players.values()) humans.push({ id: p.id, name: p.name, legend: p.legend, ent: p });
    cfg.humans = humans; cfg.legend = this.legend;
    this.game.start(cfg, this);
  }

  // Appelé par Match pour chaque joueur distant.
  makeRemote(scene, h, team, x, z, yaw) {
    const r = new RemotePlayer(scene, h, team, x, z, yaw);
    r.ent = h.ent; h.ent.actor = r;
    return r;
  }

  // Match construit : on branche le réseau et on envoie le départ à chaque client.
  beginMatch(m) {
    this.m = m; this.byId = new Map(); this.evq = []; this.n = 0;
    const cb = m.combat;
    this.byId.set(0, cb.pp);
    for (const t of cb.targets) { this.byId.set(t.id, t); if (t.isRemote) t.combat = cb; }
    const emit = (k, ...a) => this.evq.push([0, [k, ...a.map(r1)]]);
    cb.fx.emit = emit; m.abilities.emit = emit;
    m.loot.markAll();
    this.waiting = new Set(); this.waitT = 25;
    for (const p of this.players.values()) { p.ready = false; this.waiting.add(p.id); }
    const actors = cb.all.map((t) => ({ id: t === cb.pp ? 0 : t.id, team: t.team, name: t.name, human: t.isHuman ? 1 : 0 }));
    const c = m.cfg;
    for (const p of this.players.values()) {
      const r = p.actor;
      p.link.send({
        t: 'start',
        cfg: { seed: c.seed, zone: c.zone, squadSize: c.squadSize, timeLimit: c.timeLimit, killLimit: c.killLimit },
        you: { id: p.id, team: r.team, x: r.spawn.x, z: r.spawn.z, yaw: r.spawn.yaw, legend: p.legend, name: p.name },
        actors: actors.filter((a) => a.id !== p.id),
      });
    }
  }

  get holding() { return this.waiting.size > 0; }

  // État complet du butin pour un client qui vient de charger (les changements suivants arrivent en différentiel).
  sendFullLoot(ent) {
    if (!this.m) return;
    const lt = [];
    for (const l of this.m.loot.list) if (l.on) lt.push([l.i, 1, l.ti, r1(l.x), r1(l.z), l.amount, r1(l.y)]);
    ent.link.send({ t: 'loot', lt });
  }

  sendResult(r, res) { if (r.ent && !r.ent.link.closed) r.ent.link.send({ t: 'end', res }); }

  onState(ent, s) {
    const r = ent.actor;
    if (!r || !this.m) return;
    if (!Number.isFinite(s.x + s.y + s.z + s.w + s.p + s.hp + s.sh + s.dh)) return; // état invalide : ignoré
    r.applyState(s);
    if (s.ev) for (const e of s.ev) { applyEvent(this.m, e); this.evq.push([ent.id, e]); }
    if (s.hit && !r.health.dead) {
      const cb = this.m.combat;
      for (const [id, amount, zone] of s.hit) {
        const t = this.byId.get(id);
        if (!t || t.health.dead || !(amount > 0) || amount > 400) continue;
        cb.applyDamage(t, amount, zone, r);
      }
    }
  }

  tick() {
    if (this.waiting.size && (this.waitT -= 1 / 60) <= 0) this.waiting.clear(); // on n'attend pas indéfiniment un client lent
    if (++this.n < SEND_EVERY) return;
    this.n = 0;
    this.flush();
  }

  flush() {
    const m = this.m, cb = m.combat, match = m.match, zn = match.zone, loot = m.loot;
    const a = [];
    for (const t of cb.all) {
      const h = t.health, id = t === cb.pp ? 0 : t.id;
      if (h.dead) { a.push([id, 2]); continue; }
      a.push([id, r2(t.x), r2(t.y), r2(t.z), r2(t === cb.pp ? m.player.yaw : t.yaw), r1(h.hp), r1(h.shield), h.downed ? 1 : 0, r1(h.downedHp)]);
    }
    const base = {
      t: 's', a, al: match.playersAlive, sq: match.aliveSquads,
      z: [r1(zn.cx), r1(zn.cz), r1(zn.r), r1(zn.nx), r1(zn.nz), r1(zn.nr), zn.t > 1e8 ? 1e9 : r1(zn.t), zn.shrinking ? 1 : 0, zn.phase],
    };
    if (loot.dirty.size) {
      const lt = [];
      for (const i of loot.dirty) { const l = loot.list[i]; lt.push(l.on ? [i, 1, l.ti, r1(l.x), r1(l.z), l.amount, r1(l.y)] : [i, 0]); }
      loot.dirty.clear();
      base.lt = lt;
    }
    if (match.outFeed.length) base.fd = match.outFeed.slice();
    for (const p of this.players.values()) {
      const r = p.actor;
      if (!r || p.link.closed) continue;
      if (!p.ready) { r.pending.length = 0; r.cmds.length = 0; continue; }
      const msg = Object.assign({ k: r.kills }, base);
      if (r.pending.length) { msg.dm = r.pending; r.pending = []; }
      if (r.cmds.length) { msg.cm = r.cmds; r.cmds = []; }
      const ev = [];
      for (const e of this.evq) if (e[0] !== p.id) ev.push(e[1]);
      if (ev.length) msg.ev = ev;
      p.link.send(msg);
    }
    this.evq.length = 0; match.outFeed.length = 0;
  }

  backToLobby() {
    this.state = 'lobby'; this.m = null; this.byId = null; this.waiting.clear();
    for (const p of this.players.values()) { p.actor = null; p.ready = false; }
    this.broadcast({ t: 'back' });
    this.lobby();
  }

  close() {
    clearInterval(this.timer);
    this.broadcast({ t: 'bye' });
    setTimeout(() => { for (const p of this.players.values()) p.link.close(); if (this.srv) this.srv.close(); }, 250);
  }
}

// ======================================================================================================
// CLIENT : se connecte à l'hôte, reçoit les snapshots, envoie son état et ses touches.
// ======================================================================================================
export class ClientSession {
  constructor(game, name, legend) {
    this.game = game; this.role = 'client'; this.id = -1;
    this.name = clean(name, 'Joueur'); this.legend = legend; this.code = '';
    this.roster = []; this.onLobby = null; this.onChat = null; this.onClosed = null;
    this.m = null; this.n = 0; this.hitq = []; this.evq = []; this.left = false;
  }

  async join(code) {
    const link = await connectTo(code);
    this.link = link; this.code = code;
    const welcome = new Promise((res, rej) => { this.joinOk = res; this.joinFail = rej; setTimeout(() => rej({ type: 'timeout' }), 8000); });
    link.onmessage = (m) => this.onMsg(m);
    link.onclose = () => { if (this.joinFail) this.joinFail({ type: 'closed' }); this.closed('Connexion perdue avec l\'hôte.'); };
    link.send({ t: 'join', name: this.name, legend: this.legend });
    try { await welcome; } catch (e) { this.left = true; link.close(); throw e; }
    this.joinOk = this.joinFail = null;
    this.seen = performance.now();
    this.ping = setInterval(() => {
      link.send({ t: 'ping' });
      if (performance.now() - this.seen > TIMEOUT) this.closed('Connexion perdue avec l\'hôte.');
    }, 2000);
  }

  closed(text) {
    if (this.left) return;
    this.left = true;
    clearInterval(this.ping);
    try { this.link.close(); } catch (e) { /* ignoré */ }
    if (this.onClosed) this.onClosed(text);
  }

  send(o) { if (!this.left) this.link.send(o); }
  setLegend(l) { this.legend = l; this.send({ t: 'legend', legend: l }); }
  say(text) { this.send({ t: 'chat', text }); }
  setReady() { this.send({ t: 'ready' }); }

  onMsg(m) {
    this.seen = performance.now();
    switch (m.t) {
      case 'welcome': this.id = m.id; this.name = m.name; if (this.joinOk) this.joinOk(); break;
      case 'refuse': if (this.joinFail) this.joinFail({ type: 'refused', why: m.why }); break;
      case 'lobby': this.roster = m.players; if (this.onLobby) this.onLobby(m.players); break;
      case 'chat': if (this.onChat) this.onChat(m.from, m.text); break;
      case 'start': this.game.startClient(m, this); break;
      case 's': if (this.m) this.snapshot(m); break;
      case 'loot': if (this.m) this.m.loot.applyNet(m.lt); break;
      case 'end': this.game.endMatch(m.res); break;
      case 'back': this.m = null; this.game.toLobby(); break;
      case 'pk': if (this.m) this.m.loot.grant(m.i, this.m.player, this.m.inv, this.m.combat.weapons); break;
      case 'bye': this.closed('L\'hôte a fermé le salon.'); break;
    }
  }

  // Appelé par Game.startClient une fois la scène construite.
  attach(m) {
    this.m = m; this.n = 0; this.hitq = []; this.evq = [];
    const emit = (k, ...a) => this.evq.push([k, ...a.map(r1)]);
    m.combat.fx.emit = emit; m.abilities.emit = emit;
    m.loot.net = {
      pick: (i) => this.send({ t: 'pick', i }),
      pickDone: (i, on, amt) => this.send({ t: 'pk2', i, on: on ? 1 : 0, amt }),
      dropLoot: (ti, x, z, a, y) => this.send({ t: 'drop', ti, x: r1(x), z: r1(z), a, y: r1(y) }),
    };
    this.setReady();
  }

  // Interface utilisée par ProxyActor
  queueHit(id, amount, zone) {
    for (const h of this.hitq) if (h[0] === id && h[2] === zone) { h[1] = r1(h[1] + amount); return; }
    this.hitq.push([id, r1(amount), zone]);
  }
  sendHeal(id, k, d) { this.send({ t: 'hl', id, k, d }); }
  sendRevive(id) { this.send({ t: 'rv', id }); }

  snapshot(s) {
    const m = this.m, cm = m.match, cb = m.combat, now = performance.now() / 1000;
    for (const e of s.a) {
      if (e[0] === this.id) continue;
      const p = cm.proxies.get(e[0]);
      if (!p) continue;
      if (e.length === 2) p.health.setState(0, 0, e[1], 0);
      else { p.push(now, e[1], e[2], e[3], e[4]); p.health.setState(e[5], e[6], e[7], e[8]); }
    }
    cm.applyZone(s.z);
    cm.playersAlive = s.al; cm.aliveSquads = s.sq; cm.stats.kills = s.k;
    if (s.lt) m.loot.applyNet(s.lt);
    if (s.fd) for (const t of s.fd) cm.addFeed(t);
    if (s.ev) for (const e of s.ev) applyEvent(m, e);
    if (s.dm) for (const [amt, zone, aid] of s.dm) cb.applyDamage(cb.pp, amt, zone, aid >= 0 ? cm.proxies.get(aid) || null : null);
    if (s.cm) {
      const h = m.player.health;
      for (const c of s.cm) {
        if (c[0] === 'rv') { if (h.downed) h.revived(); }
        else if (c[0] === 'kd') { h.downed = false; h.dead = true; h.hp = 0; }
        else if (h.alive) { if (c[1] === 0) h.hp = Math.min(h.maxHp, h.hp + c[2]); else h.shield = Math.min(h.maxShield, h.shield + c[2]); }
      }
    }
  }

  tick() {
    if (!this.m || ++this.n < SEND_EVERY) return;
    this.n = 0;
    const p = this.m.player, h = p.health;
    const s = { t: 'st', x: r2(p.x), y: r2(p.y), z: r2(p.z), w: r2(p.yaw), p: r2(p.pitch), hp: r1(h.hp), sh: r1(h.shield), dn: h.downed ? 1 : 0, dd: h.dead ? 1 : 0, dh: r1(h.downedHp) };
    if (this.evq.length) { s.ev = this.evq; this.evq = []; }
    if (this.hitq.length) { s.hit = this.hitq; this.hitq = []; }
    this.link.send(s);
  }

  close() {
    this.left = true;
    clearInterval(this.ping);
    try { this.link.send({ t: 'bye' }); } catch (e) { /* ignoré */ }
    setTimeout(() => this.link.close(), 200);
  }
}
