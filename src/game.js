import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { Post } from './core/post.js';
import { bakeSky } from './world/terrain.js';
import { Input } from './core/input.js';
import { Hud } from './core/hud.js';
import { sfx } from './core/audio.js';
import { buildTestScene } from './world/testScene.js';
import { buildIsland, HALF } from './world/island.js';
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
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { if (this.state !== 'playing' || this.chatting) return; e.preventDefault(); if (!e.repeat) this.inv.toggle(); }
      else if (e.code === 'Escape' && this.inv.open) { this.inv.close(); this.ui.show('pause'); }
    });
    const invite = cleanCode(new URLSearchParams(location.search).get('salon'));
    if (invite) this.ui.show('online', { code: invite }); else this.ui.show('main');
    startLoop((dt) => this.update(dt), (a, dt) => this.render(a, dt), () => !!this.m && !!this.m.net);
  }

  onLock(locked) {
    if (locked) { this.inv.close(); this.ui.hide(); this.hud.show(true); return; }
    if (this.chatting || this.inv.open) return;
    this.hud.show(false);
    if (this.state === 'playing') this.ui.show('pause');
  }

  // ---------- en ligne ----------
  async hostRoom(name, legend) {
    settings.name = name; saveSettings();
    const s = new HostSession(this, name, legend);
    await s.open();
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
    s.onLobby = (r) => this.ui.updateLobby(r);
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
  start(cfg, net = null) {
    this.dispose();
    const training = cfg.map === 'training';
    const scene = new THREE.Scene();
    scene.add(this.camera);
    this.renderer.shadowMap.enabled = !training && settings.shadows;
    this.renderer.shadowMap.autoUpdate = false; // ombres statiques : voir World.followSun
    const world = training ? buildTestScene(scene) : buildIsland(scene, cfg.seed, { shadows: settings.shadows });
    const inv = new Inventory();
    const player = new Player(world, this.input, sfx);
    player.allowRespawn = training;
    const combat = new Combat(scene, world, player, this.input, inv, { friendlyFire: training, respawnPlayer: training });
    const abilities = new Abilities(combat, player, scene);
    abilities.setLegend(cfg.legend);
    abilities.allowSwitch = training;
    const loot = new LootField(scene, world.rand || Math.random, world.groundY);
    const viewmodel = new Viewmodel(this.camera, combat.weapons);
    const m = { scene, world, inv, player, combat, abilities, loot, viewmodel, match: null, cfg, net };

    if (training) {
      for (const [x, z] of [[-6, -5], [5, -6], [0, -22], [14, -3], [-14, -12]]) combat.addTarget(x, z, 1);
      combat.addTarget(4, -2, 0);
      ['rifle', 'smg', 'shotgun', 'sniper', 'launcher'].forEach((w, i) => loot.spawnWeapon(w, -6 + i * 2, 9));
      for (let i = 0; i < 6; i++) loot.spawn(loot.roll(), -6 + i * 2, 11);
      combat.weapons.give('rifle');
      inv.ammo.light = 120; inv.heal.syringe = 3; inv.heal.cell = 2;
      this.camera.fov = 90; player.spawn();
    } else {
      m.nav = new NavGrid(world.colliders, HALF, 1.5, world.groundY);
      m.match = new Match({ scene, world, combat, abilities, nav: m.nav, loot, player, inv, net }, cfg, (res) => this.endMatch(res));
    }
    this.m = m;
    this.state = 'playing';
    if (net) { net.beginMatch(m); this.chatLog.innerHTML = ''; this.chatShow(true); }
    this.input.lock();
  }

  // Client : reconstruit le même monde (graine de l'hôte) ; le reste vient des snapshots.
  startClient(msg, net) {
    this.dispose();
    const scene = new THREE.Scene();
    scene.add(this.camera);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.autoUpdate = false;
    const world = buildIsland(scene, msg.cfg.seed, { shadows: settings.shadows });
    const inv = new Inventory();
    const player = new Player(world, this.input, sfx);
    const combat = new Combat(scene, world, player, this.input, inv, {});
    combat.pp.name = msg.you.name;
    const abilities = new Abilities(combat, player, scene);
    abilities.setLegend(msg.you.legend);
    const loot = new LootField(scene, Math.random, world.groundY);
    const viewmodel = new Viewmodel(this.camera, combat.weapons);
    player.team = msg.you.team;
    player.sx = msg.you.x; player.sz = msg.you.z; player.syaw = msg.you.yaw; player.spawn();
    const match = new ClientMatch(scene, world, combat, msg, net);
    this.m = { scene, world, inv, player, combat, abilities, loot, viewmodel, match, cfg: msg.cfg, net };
    this.state = 'playing';
    net.attach(this.m);
    this.chatLog.innerHTML = ''; this.chatShow(true);
    this.input.lock();
  }

  endMatch(res) {
    this.state = 'results';
    this.chatting = false; this.chatIn.style.display = 'none';
    document.exitPointerLock();
    this.ui.show('results', res);
  }

  dispose() {
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
    abilities.tick(dt, inp);
    inv.tick(dt, inp, player);
    loot.tick(dt, player, inv, combat.weapons, inp);
    if (match) match.tick(dt);
    combat.tick(dt);
    if (net) net.tick(dt);
    inp.endTick();
  }

  render(alpha, dt) {
    const m = this.m;
    if (!m || this.state === 'menu') { this.renderer.render(this.menuScene, this.camera); return; }
    if (this.input.locked && !m.player.health.dead) m.player.look(this.input.mx, this.input.my, this.input.sens * (1 - 0.6 * m.player.ads));
    this.input.mx = this.input.my = 0;
    m.player.getCamera(alpha, this.camera, dt);
    m.player.third(m.scene, dt);
    m.viewmodel.update(dt, this.camera.aspect);
    this.hud.update(m.player, dt, m.combat, m.abilities, m.inv, m.match);
    if (m.world.sun && m.world.followSun(m.player.x, m.player.z)) this.renderer.shadowMap.needsUpdate = true;
    const r = this.renderer;
    if (this.post.on) { this.post.render(m.scene, this.camera, m.player.tp < 0.5 ? m.viewmodel : null, dt); return; }
    r.render(m.scene, this.camera);
    r.autoClear = false; r.clearDepth();
    if (m.player.tp < 0.5) r.render(m.viewmodel.scene, m.viewmodel.cam);
    r.autoClear = true;
  }
}
