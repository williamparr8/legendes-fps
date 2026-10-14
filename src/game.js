import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { Post } from './core/post.js';
import { loadHuman, human } from './combat/humanrig.js';
import { bakeSky } from './world/terrain.js';
import { Input } from './core/input.js';
import { Hud } from './core/hud.js';
import { sfx } from './core/audio.js';
import { buildTestScene } from './world/testScene.js';
import { buildIsland, EXT } from './world/island.js';
import { Player } from './player/player.js';
import { Combat } from './combat/combat.js';
import { Viewmodel } from './combat/viewmodel.js';
import { Abilities } from './legends/abilities.js';
import { Inventory } from './loot/inventory.js';
import { LootField } from './loot/loot.js';
import { NavGrid } from './bots/nav.js';
import { Match } from './match/match.js';
import { UI } from './ui/ui.js';
import { applySettings, settings, saveSettings } from './ui/settings.js';
import { HostSession, ClientSession } from './net/session.js';
import { ClientMatch } from './net/clientMatch.js';
import { cleanCode } from './net/transport.js';
import { InventoryPanel } from './ui/inventory.js';
import { MapView } from './ui/map.js';
import { profile, equippedDef, awardMatch } from './shop/profile.js';
import { questsMatch } from './shop/quests.js';
import { achMatch } from './shop/achievements.js';
import { touchDay } from './shop/profile.js';
import { shopFrame } from './shop/shop.js';
import { lobbyFrame } from './ui/lobby.js';
import { Pings } from './combat/pings.js';
import { MOVE } from './player/config.js';
import { eventById, currentEvent } from './match/events.js';
import items from './loot/items.json';
const _cv = new THREE.Vector3();
const BASE_GRAVITY = MOVE.gravity;

// Chef d'orchestre : menus ↔ partie. Une partie = une scène neuve (monde, joueur, combat, butin, match).
// En ligne : `m.net` = HostSession (simulation autoritaire) ou ClientSession (monde répliqué).
export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.quality === 0, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    document.body.prepend(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(90, innerWidth / innerHeight, 0.05, 900);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    bakeSky(this.renderer, new THREE.Vector3(60, 100, 30).normalize());
    this.post = new Post(this.renderer);
    this.post.setQuality(settings.quality);
    loadHuman(import.meta.env.BASE_URL + 'models/swat.glb', [import.meta.env.BASE_URL + 'models/gasmask.glb', import.meta.env.BASE_URL + 'models/eve.glb', import.meta.env.BASE_URL + 'models/maria.glb']); // personnage animé ; en attendant, silhouette procédurale
    this.menuScene = new THREE.Scene();
    this.menuScene.background = new THREE.Color(0x0b0f14);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.post.resize();
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });
    this.input = new Input(this.renderer.domElement);
    applySettings(this.input);
    this.hud = new Hud();
    this.ui = new UI(this);
    this.state = 'menu';
    this.m = null;
    this.session = null; this.chatting = false;
    this.input.onLock = (l) => this.onLock(l);
    this.initChat();
    this.inv = new InventoryPanel(this);
    this.map = new MapView();
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { if (this.state !== 'playing' || this.chatting) return; e.preventDefault(); if (!e.repeat) this.inv.toggle(); }
      else if (e.code === 'KeyT' && !e.repeat && this.state === 'playing' && !this.chatting && this.m && this.m.match) this.map.toggle();
      else if (e.code === 'Escape' && this.map.open) this.map.close();
      else if (e.code === 'Escape' && this.inv.open) { this.inv.close(); this.ui.show('pause'); }
    });
    touchDay(); // série de connexion
    const invite = cleanCode(new URLSearchParams(location.search).get('salon'));
    if (invite) this.ui.show('online', { code: invite }); else this.ui.show('main');
    startLoop((dt) => this.update(dt), (a, dt) => this.render(a, dt), () => !!this.m && !!this.m.net);
  }

  onLock(locked) {
    if (locked) {
      this.inv.close(); this.ui.hide(); this.hud.show(true);
      const n = this.m && this.m.net;
      if (n && n.role === 'client') n.setReady();
      return;
    }
    if (this.chatting || this.inv.open) return;
    this.hud.show(false);
    if (this.state === 'playing') this.ui.show('pause');
  }

  // ---------- en ligne ----------
  async hostRoom(name, legend) {
    settings.name = name; saveSettings();
    const s = new HostSession(this, name, legend);
    await s.open();
    s.preSeed = this.ui.seed;
    this.wire(s);
    this.ui.show('lobby');
  }

  async joinRoom(name, code, legend) {
    settings.name = name; saveSettings();
    const s = new ClientSession(this, name, legend);
    await s.join(code);
    this.wire(s);
    this.ui.show('lobby');
  }

  wire(s) {
    this.session = s;
    s.onLobby = (r) => { this.ui.updateLobby(r); if (s.seed != null) setTimeout(() => this.prewarm(s.seed), 60); };
    s.onChat = (from, text) => this.chatLine(from, text);
    s.onClosed = (text) => this.sessionLost(text);
    this.ui.chatBuf = [];
  }

  leaveSession() {
    const s = this.session;
    this.session = null;
    if (s) { s.onClosed = null; s.close(); }
  }

  sessionLost(text) {
    this.session = null;
    this.dispose();
    this.state = 'menu'; this.chatting = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.show(false); this.chatShow(false);
    this.ui.show('online', { msg: text });
  }

  // Retour au salon après une partie.
  toLobby() {
    this.dispose();
    this.state = 'menu'; this.chatting = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.show(false); this.chatShow(false);
    this.ui.show('lobby');
  }

  // ---------- chat (Entrée en partie) ----------
  initChat() {
    this.chatEl = document.getElementById('chat'); this.chatLog = document.getElementById('chat-log'); this.chatIn = document.getElementById('chat-in');
    addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.session && this.state === 'playing' && this.input.locked) { e.preventDefault(); this.openChat(); }
    });
    this.chatIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { const t = this.chatIn.value.trim(); if (t && this.session) this.sendChat(t); this.closeChat(); }
      else if (e.code === 'Escape') this.closeChat();
    });
  }
  chatShow(v) { this.chatEl.style.display = v ? 'block' : 'none'; }
  sendChat(t) { const s = this.session; if (s.role === 'host') s.say(s.name, t); else s.say(t); }
  openChat() { this.chatting = true; this.chatIn.style.display = 'block'; this.chatIn.value = ''; document.exitPointerLock(); this.chatIn.focus(); }
  closeChat() { this.chatting = false; this.chatIn.style.display = 'none'; this.chatIn.blur(); if (this.state === 'playing') this.input.lock(); }
  chatLine(from, text) {
    this.ui.addChat(from, text);
    if (!this.m) return;
    const d = document.createElement('div');
    d.textContent = (from ? from + ' : ' : '') + text;
    this.chatLog.appendChild(d);
    while (this.chatLog.children.length > 8) this.chatLog.firstChild.remove();
    setTimeout(() => d.remove(), 12000);
  }

  // ---------- parties ----------
  // Construit le monde d'avance (salon / préparation) : le lancement ne coûte plus la génération.
  prewarm(seed) {
    const sh = settings.shadows, ev = currentEvent(), key = ev ? ev.id : '';
    if (this.pre && this.pre.seed === seed && this.pre.sh === sh && this.pre.ev === key) return;
    const scene = new THREE.Scene();
    try { this.pre = { seed, sh, ev: key, scene, world: buildIsland(scene, seed, { shadows: sh, theme: ev ? ev.theme : undefined }) }; } catch (e) { this.pre = null; }
  }

  takeWorld(seed, ev = null) {
    const p = this.pre; this.pre = null;
    return p && p.seed === seed && p.sh === settings.shadows && p.ev === (ev ? ev.id : '') ? p : null;
  }

  start(cfg, net = null) {
    this.dispose();
    this.ema = 0; this.playT = 0; this.slowT = 0;
    const training = cfg.map === 'training';
    const ev = training ? null : eventById(cfg.event);
    const pre = training ? null : this.takeWorld(cfg.seed, ev);
    const scene = pre ? pre.scene : new THREE.Scene();
    scene.add(this.camera);
    this.renderer.shadowMap.enabled = !training && settings.shadows;
    this.renderer.shadowMap.autoUpdate = false; // ombres statiques : voir World.followSun
    const world = pre ? pre.world : training ? buildTestScene(scene) : buildIsland(scene, cfg.seed, { shadows: settings.shadows, theme: ev ? ev.theme : undefined });
    MOVE.gravity = BASE_GRAVITY * ((ev && ev.gravity) || 1); // événement « Gravité lunaire »
    const inv = new Inventory();
    const player = new Player(world, this.input, sfx);
    player.allowRespawn = training;
    const combat = new Combat(scene, world, player, this.input, inv, { friendlyFire: training, respawnPlayer: training });
    const abilities = new Abilities(combat, player, scene);
    abilities.setLegend(cfg.legend);
    abilities.allowSwitch = training;
    const loot = new LootField(scene, world.rand || Math.random, world.groundY);
    loot.rareBoost = (ev && ev.rare) || 1;
    const viewmodel = new Viewmodel(this.camera, combat.weapons);
    this.dress(combat, player, viewmodel);
    const m = { scene, world, inv, player, combat, abilities, loot, viewmodel, match: null, cfg, net, pings: new Pings(scene) };

    if (training) {
      for (const [x, z] of [[-6, -5], [5, -6], [0, -22], [14, -3], [-14, -12]]) combat.addTarget(x, z, 1);
      combat.addTarget(4, -2, 0);
      ['rifle', 'smg', 'shotgun', 'sniper', 'launcher', 'pistol', 'lmg'].forEach((w, i) => loot.spawnWeapon(w, -7 + i * 2, 9));
      for (let i = 0; i < 6; i++) loot.spawn(loot.roll(), -6 + i * 2, 11);
      combat.weapons.give('rifle');
      inv.ammo.light = 120; inv.heal.syringe = 3; inv.heal.cell = 2;
      this.camera.fov = 90; player.spawn();
    } else {
      m.nav = new NavGrid(world.colliders, EXT, 1.5, world.groundY, world);
      m.match = new Match({ scene, world, combat, abilities, nav: m.nav, loot, player, inv, net }, cfg, (res) => this.endMatch(res));
    }
    this.m = m;
    try { this.renderer.compile(scene, this.camera); } catch (e) { /* ignoré */ } // compile les shaders avant le 1er rendu (évite le pic au premier tick)
    this.state = 'playing';
    if (world.theme) this.banner('Carte : ' + world.theme + (ev ? ' · ' + ev.name : ''));
    if (net) { net.beginMatch(m); this.chatLog.innerHTML = ''; this.chatShow(true); }
    this.input.lock();
  }

  // Client : reconstruit le même monde (graine de l'hôte) ; le reste vient des snapshots.
  startClient(msg, net) {
    this.dispose();
    this.ema = 0; this.playT = 0; this.slowT = 0;
    const ev = eventById(msg.cfg.event);
    const pre = this.takeWorld(msg.cfg.seed, ev);
    const scene = pre ? pre.scene : new THREE.Scene();
    scene.add(this.camera);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.autoUpdate = false;
    const world = pre ? pre.world : buildIsland(scene, msg.cfg.seed, { shadows: settings.shadows, theme: ev ? ev.theme : undefined });
    MOVE.gravity = BASE_GRAVITY * ((ev && ev.gravity) || 1);
    const inv = new Inventory();
    const player = new Player(world, this.input, sfx);
    const combat = new Combat(scene, world, player, this.input, inv, {});
    combat.pp.name = msg.you.name;
    const abilities = new Abilities(combat, player, scene);
    abilities.setLegend(msg.you.legend);
    const loot = new LootField(scene, Math.random, world.groundY);
    const viewmodel = new Viewmodel(this.camera, combat.weapons);
    this.dress(combat, player, viewmodel);
    player.team = msg.you.team;
    player.sx = msg.you.x; player.sz = msg.you.z; player.syaw = msg.you.yaw; player.spawn();
    const match = new ClientMatch(scene, world, combat, msg, net);
    this.m = { scene, world, inv, player, combat, abilities, loot, viewmodel, match, cfg: msg.cfg, net, pings: new Pings(scene) };
    try { this.renderer.compile(scene, this.camera); } catch (e) { /* ignoré */ } // compile les shaders avant le 1er rendu (évite le pic au premier tick)
    this.state = 'playing';
    if (world.theme) this.banner('Carte : ' + world.theme + (ev ? ' · ' + ev.name : ''));
    net.attach(this.m);
    this.chatLog.innerHTML = ''; this.chatShow(true);
    this.ui.show('go'); // le départ vient du réseau : pas de geste utilisateur, donc la souris ne peut pas être capturée sans un clic
    this.input.lock();
  }

  // Skins équipés (profil) : apparence réseau du joueur, modèle 3e personne et arme en vue subjective.
  dress(combat, player, viewmodel) {
    combat.pp.skinP = player.skinP = profile.eq.perso;
    combat.pp.skinW = player.skinW = profile.eq.arme;
    viewmodel.setSkin(equippedDef('arme'));
    viewmodel.setArms(equippedDef('perso'));
  }

  endMatch(res) {
    const m = this.m;
    if (m && res.ms === undefined) { // statistiques locales de la partie + contexte (légende, événement)
      res.ms = Object.assign({}, m.combat.mstat, { heals: m.inv.healUsed | 0 });
      res.leg = this.ui.legend; res.event = m.cfg && m.cfg.event ? m.cfg.event : null;
    }
    awardMatch(res); // points de la partie (une seule fois : res.pts sert de drapeau)
    questsMatch(res); // défis quotidiens, hebdomadaires, saison
    achMatch(res); // succès
    this.state = 'results';
    this.chatting = false; this.chatIn.style.display = 'none';
    document.exitPointerLock();
    this.ui.show('results', res);
  }

  dispose() {
    MOVE.gravity = BASE_GRAVITY; // fin d'un événement « Gravité lunaire »
    if (this.map) this.map.close();
    if (this.m) this.m.viewmodel.dispose(this.camera);
    this.m = null;
  }

  quit() {
    if (this.session && this.session.role === 'host' && this.session.players.size && !confirm('Quitter ferme le salon pour tous les joueurs. Continuer ?')) return;
    this.leaveSession();
    this.dispose();
    this.state = 'menu'; this.chatting = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.show(false); this.chatShow(false);
    this.ui.show('main');
  }

  update(dt) {
    const m = this.m;
    if (!m) return;
    const net = m.net, inp = this.input;
    if (net) {
      // En ligne le monde ne s'arrête jamais (pause, chat, résultats) : sans souris verrouillée, aucune entrée.
      if (this.state !== 'playing' && this.state !== 'results') return;
      if (!inp.locked) {
        for (const c in inp.k) inp.k[c] = false;
        for (const c in inp.pressed) inp.pressed[c] = false;
        inp.mx = inp.my = 0;
      }
      if (net.holding) { m.player.prompt = 'En attente des autres joueurs…'; net.tick(dt); inp.endTick(); return; }
    } else if (this.state !== 'playing' || !inp.locked) return;
    const { player, abilities, inv, loot, combat, match } = m;
    player.tick(dt);
    // marqueurs : clic molette = lieu / ennemi / objet (selon la visée), V = danger, viser le marqueur d'un coéquipier = répondre.
    // Événement 5 : x, y, z, équipe, type (0 lieu, 1 ennemi, 2 danger, 3 objet), propriétaire, retrait, indice d'objet ; 6 : réponse.
    if (m.pings) {
      const want = inp.pressed.Mouse1 ? 'ping' : inp.pressed.KeyV ? 'danger' : null;
      if (want && player.health.alive && m.pings.cd <= 0) {
        m.pings.cd = 0.4;
        const me = net ? net.id : 0, em = combat.fx.emit;
        const asked = want === 'ping' ? m.pings.aimedAt(player, me) : null;
        if (asked) { m.pings.ack(asked.owner); if (em) em(6, asked.owner, me, player.team); }
        else {
          const r = combat.pingRay(player, loot);
          if (r) {
            const type = want === 'danger' ? 2 : r.enemy ? 1 : r.ti >= 0 ? 3 : 0;
            const res = m.pings.add(r.x, r.y, r.z, type, me, true, type === 3 ? items.table[r.ti].name : '', '');
            if (em) em(5, r.x, r.y, r.z, player.team, type, me, res === 'removed' ? 1 : 0, r.ti);
            if (res !== 'removed' && match && match.squadPing) match.squadPing(player.team, r.x, r.y, r.z, type);
          }
        }
      }
      m.pings.tick(dt, player.x, player.y, player.z);
    }
    abilities.tick(dt, inp);
    inv.tick(dt, inp, player);
    loot.tick(dt, player, inv, combat.weapons, inp);
    if (match) match.tick(dt);
    combat.tick(dt);
    this.specTick(m);
    if (net) net.tick(dt);
    inp.endTick();
  }

  // Spectateur : mort avec des coéquipiers encore en vie → on suit l'un d'eux (clic / Espace : suivant, clic droit : précédent).
  specTick(m) {
    const p = m.player;
    if (!p.health.dead || !m.match || (m.cfg && m.cfg.map === 'training')) { m.spec = null; return; }
    const sq = m.match.playerSquad;
    const mem = sq ? sq.members.filter((t) => t !== m.combat.pp && !t.health.dead) : [];
    if (!mem.length) { m.spec = null; return; }
    let i = mem.indexOf(m.spec);
    if (i < 0) i = 0;
    const pr = this.input.pressed;
    if (pr.Mouse0 || pr.Space) i = (i + 1) % mem.length; else if (pr.Mouse2) i = (i - 1 + mem.length) % mem.length;
    m.spec = mem[i];
    p.prompt = 'Spectateur · ' + (m.spec.name || 'coéquipier') + (mem.length > 1 ? ' — clic : suivant · clic droit : précédent' : '');
  }

  // Qualité automatique : si la fluidité reste mauvaise (< ~25 images/s pendant 5 s), on coupe d'abord les ombres, puis les effets d'image.
  autoQuality(dt) {
    this.ema = this.ema ? this.ema * 0.97 + dt * 0.03 : dt;
    this.playT = (this.playT || 0) + dt;
    if (this.playT < 6) return;
    // résolution dynamique : vise ~58 images/s en réduisant doucement le nombre de pixels (jusqu'à 55 %), la remonte quand il y a de la marge
    this.dynT = (this.dynT || 0) + dt;
    if (this.dynT > 1.5 && this.ema > 1 / 54 && this.post.sc > 0.56) { this.dynT = 0; this.post.setScale(Math.max(0.55, this.post.sc - 0.1)); }
    else if (this.dynT > 8 && this.ema < 1 / 57 && this.post.sc < 1) { this.dynT = 0; this.post.setScale(Math.min(1, this.post.sc + 0.05)); }
    this.slowT = Math.max(0, (this.slowT || 0) + (this.ema > 0.04 && this.post.sc <= 0.6 ? dt : -dt));
    if (this.slowT < 5) return;
    this.slowT = 0;
    const r = this.renderer;
    let msg = '';
    if (r.shadowMap.enabled) {
      r.shadowMap.enabled = false; settings.shadows = false;
      this.m.scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = false; for (const mt of [].concat(o.material || [])) mt.needsUpdate = true; });
      msg = 'Performances faibles : ombres désactivées';
    } else if (settings.quality > 0) {
      settings.quality = 0; this.post.setQuality(0); msg = "Performances faibles : effets d'image réduits (qualité Bas)";
    } else return;
    saveSettings();
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);background:rgba(10,14,20,.88);color:#ffd070;padding:8px 16px;border:1px solid #556;border-radius:6px;z-index:50;font:14px sans-serif';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 6000);
  }

  // Bandeau temporaire (nom de la carte).
  banner(txt) {
    const d = document.createElement('div');
    d.textContent = txt;
    d.style.cssText = 'position:fixed;top:9%;left:50%;transform:translateX(-50%);color:#fff;text-shadow:0 2px 8px #000;font:600 26px sans-serif;letter-spacing:2px;z-index:40;pointer-events:none;transition:opacity 1.2s';
    document.body.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; }, 3500);
    setTimeout(() => d.remove(), 5000);
  }

  render(alpha, dt) {
    const m = this.m;
    if (m && this.state === 'playing') this.autoQuality(dt);
    if (!m || this.state === 'menu') {
      if (this.ui.screen === 'shop') shopFrame(this, dt); else if (this.ui.screen === 'main') lobbyFrame(this, dt); else this.renderer.render(this.menuScene, this.camera);
      return;
    }
    if (this.input.locked && !m.player.health.dead) m.player.look(this.input.mx, this.input.my, this.input.sens * (1 - 0.6 * m.player.ads));
    this.input.mx = this.input.my = 0;
    m.player.getCamera(alpha, this.camera, dt);
    if (m.spec) { // vue à la 3e personne sur le coéquipier suivi (lissée)
      const t = m.spec, sy = Math.sin(t.yaw || 0), cy = Math.cos(t.yaw || 0), tx = t.x + sy * 3.4, tz = t.z + cy * 3.4;
      _cv.set(tx, Math.max(t.y + 2.1, m.world.groundY(tx, tz) + 0.7), tz);
      this.camera.position.lerp(_cv, Math.min(1, dt * 6));
      this.camera.lookAt(t.x, t.y + 1.3, t.z);
    }
    human.cam.copy(this.camera.position);
    m.player.third(m.scene, dt);
    m.viewmodel.update(dt, this.camera.aspect);
    this.hud.update(m.player, dt, m.combat, m.abilities, m.inv, m.match);
    this.map.draw(dt, m);
    const fx = m.spec || m.player;
    if (m.world.sun && m.world.followSun(fx.x, fx.z)) this.renderer.shadowMap.needsUpdate = true;
    const r = this.renderer;
    if (this.post.on) { this.post.render(m.scene, this.camera, m.player.tp < 0.5 && !m.spec ? m.viewmodel : null, dt); return; }
    r.render(m.scene, this.camera);
    r.autoClear = false; r.clearDepth();
    if (m.player.tp < 0.5) r.render(m.viewmodel.scene, m.viewmodel.cam);
    r.autoClear = true;
  }
}
