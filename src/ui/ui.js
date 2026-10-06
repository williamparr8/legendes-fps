import { LEGENDS, LEGEND_IDS } from '../legends/abilities.js';
import wdefs from '../combat/weapons.json';
import diffs from '../bots/difficulty.json';
import { settings, saveSettings, applySettings } from './settings.js';
import { transportKind, errorText, cleanCode } from '../net/transport.js';
import { MAX_PLAYERS } from '../net/session.js';
import { QUALITY } from '../core/post.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODES = {
  solo: { title: 'Solo contre bots', bots: 11, label: 'Adversaires (bots)' },
  squad: { title: 'Équipe contre bots', bots: 5, label: 'Escouades ennemies' },
  custom: { title: 'Partie personnalisée', bots: 5, label: 'Escouades ennemies' },
  training: { title: 'Entraînement', bots: 0, label: '' },
  online: { title: 'Salon en ligne', bots: 5, label: 'Escouades de bots' },
};
const KEYS = [
  ['ZQSD / WASD', 'Déplacement'], ['Maj', 'Sprint'], ['Espace', 'Saut / escalade'], ['C / Ctrl', 'Accroupi ; en sprint : glissade'],
  ['E', 'Ramasser · tyrolienne · réanimer (maintenir)'], ['Clic G / D', 'Tirer / viser'], ['R', 'Recharger'], ['Tab', 'Inventaire'], ['1 / 2 / molette', 'Changer d\'arme'],
  ['3 / 4 / 5', 'Seringue / kit médical / cellule de bouclier'], ['F / G', 'Habileté tactique / ultime'], ['Entrée', 'Chat (en ligne)'], ['Échap', 'Pause'],
];

// Écrans DOM : menu principal, préparation (légende + options), salon en ligne, options, pause, résultats.
export class UI {
  constructor(game) {
    this.game = game; this.root = $('ui');
    this.legend = LEGEND_IDS[0]; this.mode = 'solo'; this.lastCfg = null;
    this.chatBuf = [];
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el) this.act(el.dataset.act, el.dataset);
    });
    this.root.addEventListener('change', (e) => {
      if (e.target.id === 'lb-legend') { this.legend = e.target.value; const s = this.game.session; if (s) s.setLegend(this.legend); }
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.target.id === 'lb-say' && e.code === 'Enter') {
        const t = e.target.value.trim(); e.target.value = '';
        if (t && this.game.session) this.game.sendChat(t);
      } else if ((e.target.id === 'n-name' || e.target.id === 'n-code') && e.code === 'Enter') this.act(this.joinOrHost(), {});
    });
    this.root.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'o-sens') settings.sens = +e.target.value;
      else if (id === 'o-fov') settings.fov = +e.target.value;
      else if (id === 'o-vol') settings.volume = +e.target.value;
      else if (id === 'o-shadows') { settings.shadows = e.target.checked; saveSettings(); return; }
      else if (id === 'o-quality') { settings.quality = +e.target.value; saveSettings(); this.game.post.setQuality(settings.quality); return; }
      else return;
      applySettings(this.game.input); saveSettings();
      $('v-' + id.slice(2)).textContent = e.target.value;
    });
  }

  show(screen, data) { this.root.innerHTML = this[screen](data); this.root.style.display = 'flex'; this.screen = screen; if (screen === 'lobby') { this.updateLobby(this.game.session.role === 'host' ? this.game.session.roster() : this.game.session.roster); this.redrawChat(); } }
  hide() { this.root.style.display = 'none'; }

  joinOrHost() { return $('n-code') && $('n-code').value.trim() ? 'join' : 'host'; }

  async connect(act) {
    const g = this.game, msg = $('n-msg'), name = ($('n-name').value.trim() || 'Joueur').slice(0, 16);
    const set = (t, err) => { msg.textContent = t; msg.style.color = err ? '#ff8080' : ''; };
    for (const b of this.root.querySelectorAll('button')) b.disabled = true;
    try {
      if (act === 'host') { set('Création du salon…'); await g.hostRoom(name, this.legend); }
      else {
        const code = cleanCode($('n-code').value);
        if (code.length < 4) { set('Entrez le code du salon.', true); for (const b of this.root.querySelectorAll('button')) b.disabled = false; return; }
        set('Connexion…'); await g.joinRoom(name, code, this.legend);
      }
    } catch (e) {
      if (!$('n-msg')) return;
      set(e && e.type === 'refused' ? e.why : errorText(e), true);
      for (const b of this.root.querySelectorAll('button')) b.disabled = false;
    }
  }

  act(a, d) {
    const g = this.game;
    switch (a) {
      case 'mode': this.mode = d.mode; this.show('setup'); break;
      case 'pick': this.legend = d.id; document.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === d.id)); break;
      case 'start': g.start(this.readConfig()); break;
      case 'menu': g.quit(); break;
      case 'options': this.from = this.screen; this.show('options'); break;
      case 'back': this.show(this.from === 'pause' ? 'pause' : 'main'); break;
      case 'resume': g.input.lock(); break;
      case 'replay': g.start(this.lastCfg); break;
      case 'online': this.show('online'); break;
      case 'host': case 'join': this.connect(a); break;
      case 'lstart': { this.mode = 'online'; g.session.start(this.readConfig()); break; }
      case 'lleave': g.quit(); break;
      case 'tolobby': g.session.backToLobby(); g.toLobby(); break;
      case 'copylink': { const el = $('lb-link'); el.select(); try { navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand('copy'); } $('lb-copied').textContent = 'Copié !'; break; }
    }
  }

  main() {
    return `<div class="panel narrow"><h1>LÉGENDES</h1><p>Hero shooter 3D dans le navigateur</p><div class="menu">
      <button data-act="mode" data-mode="solo">Solo contre bots</button>
      <button data-act="mode" data-mode="squad">Équipe contre bots</button>
      <button data-act="mode" data-mode="custom">Partie personnalisée</button>
      <button data-act="mode" data-mode="training">Entraînement</button>
      <button class="primary" data-act="online">Salon en ligne (amis)</button>
      <button data-act="options">Options &amp; commandes</button></div></div>`;
  }

  legendCards() {
    return LEGEND_IDS.map((id) => {
      const L = LEGENDS[id];
      return `<div class="card ${id === this.legend ? 'sel' : ''}" data-act="pick" data-id="${id}" style="border-color:${L.color}">
        <b style="color:${L.color}">${L.name}</b><i>${L.role}</i>
        <small>◆ ${L.passive.name} : ${L.passive.desc}</small><small>[F] ${L.tactical.name} : ${L.tactical.desc}</small><small>[G] ${L.ultimate.name} : ${L.ultimate.desc}</small></div>`;
    }).join('');
  }

  // Options de partie. `mode` : solo | squad | custom | online (les limites/armes/personnages ne sont proposés qu'en custom/online).
  optionsHtml(mode) {
    const m = MODES[mode], custom = mode === 'custom' || mode === 'online', online = mode === 'online';
    const diff = Object.entries(diffs).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v.name}</option>`).join('');
    const wChecks = Object.keys(wdefs).map((k) => `<label class="chk"><input type="checkbox" class="wc" value="${k}" checked> ${wdefs[k].name}</label>`).join('');
    const lChecks = LEGEND_IDS.map((k) => `<label class="chk"><input type="checkbox" class="lc" value="${k}" checked> ${LEGENDS[k].name}</label>`).join('');
    return `<div class="opts">
      <label>Difficulté des bots<select id="c-diff">${diff}</select></label>
      <label>${m.label}<input type="number" id="c-bots" min="${online ? 0 : 1}" max="${mode === 'solo' ? 14 : 8}" value="${m.bots}"></label>
      ${mode === 'solo' ? '' : `<label>Taille des équipes<select id="c-size">${(custom ? [1, 2, 3] : [2, 3]).map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
      <label class="chk"><input type="checkbox" id="c-zone" checked> Zone qui se réduit</label>
      ${custom ? `<label>Limite de temps (min, 0 = aucune)<input type="number" id="c-time" min="0" max="60" value="0"></label>
      <label>Limite d'éliminations (0 = aucune)<input type="number" id="c-kills" min="0" max="50" value="0"></label>
      <div class="wide">Armes autorisées<div class="checks">${wChecks}</div></div>
      <div class="wide">Personnages autorisés (bots)<div class="checks">${lChecks}</div></div>` : ''}
      ${online ? `<p class="wide" style="text-align:left">Les joueurs sont répartis par ordre d'arrivée dans des équipes de la taille choisie ; les places libres sont comblées par des bots.</p>` : ''}</div>`;
  }

  setup() {
    const m = MODES[this.mode], train = this.mode === 'training';
    return `<div class="panel"><h2>${m.title} — choisissez votre légende</h2><div class="cards">${this.legendCards()}</div>${train ? '' : this.optionsHtml(this.mode)}
      <div class="row"><button data-act="menu">Retour</button><button class="primary" data-act="start">Lancer la partie</button></div></div>`;
  }

  readConfig() {
    const m = this.mode, v = (id, d) => ($(id) ? $(id).value : d), ch = (id, d) => ($(id) ? $(id).checked : d);
    const list = (cls, all) => { const a = [...document.querySelectorAll(cls)].filter((x) => x.checked).map((x) => x.value); return a.length ? a : all; };
    const cfg = {
      mode: m, map: m === 'training' ? 'training' : 'island', legend: this.legend,
      difficulty: v('c-diff', 'normal'), enemySquads: +v('c-bots', 0), squadSize: m === 'solo' ? 1 : +v('c-size', 3),
      zone: ch('c-zone', false), timeLimit: +v('c-time', 0), killLimit: +v('c-kills', 0),
      weapons: list('.wc', Object.keys(wdefs)), legends: list('.lc', LEGEND_IDS), seed: (Math.random() * 1e6) | 0,
    };
    this.lastCfg = cfg;
    return cfg;
  }

  // ---------- salon en ligne ----------
  online(d = {}) {
    const code = d.code || '';
    return `<div class="panel narrow"><h2>Salon en ligne</h2>
      <p>Jouez avec vos amis : un joueur crée le salon, les autres le rejoignent avec le code ou le lien.</p>
      <div class="opts" style="grid-template-columns:1fr"><label>Votre pseudo<input class="t" id="n-name" maxlength="16" value="${esc(settings.name || '')}" placeholder="Pseudo"></label></div>
      <div class="menu"><button class="primary" data-act="host">Créer un salon</button></div>
      <div class="menu" style="margin-top:22px"><label class="opts" style="display:flex;flex-direction:column;gap:4px;font-size:13px">Ou rejoindre avec un code
        <input class="t" id="n-code" maxlength="8" placeholder="CODE" value="${esc(code)}" style="text-transform:uppercase;letter-spacing:3px"></label>
        <button data-act="join">Rejoindre</button></div>
      <p id="n-msg" style="min-height:1.4em;margin-top:14px">${d.msg ? esc(d.msg) : ''}</p>
      <div class="row"><button data-act="menu">Retour</button></div></div>`;
  }

  lobby() {
    const s = this.game.session, host = s.role === 'host';
    const opts = LEGEND_IDS.map((id) => `<option value="${id}" ${id === this.legend ? 'selected' : ''}>${LEGENDS[id].name}</option>`).join('');
    const link = location.origin + location.pathname + '?salon=' + s.code + (transportKind() === 'local' ? '&local' : '');
    return `<div class="panel"><h2>Salon <span class="code">${s.code}</span></h2>
      <div class="linkrow"><input class="t" id="lb-link" readonly value="${esc(link)}"><button data-act="copylink">Copier le lien</button><span id="lb-copied"></span></div>
      <div class="lobbygrid"><div><h3>Joueurs <small id="lb-count"></small></h3><div id="lb-players"></div>
        <label class="lbl">Ma légende<select class="t" id="lb-legend">${opts}</select></label>
        <h3>Chat</h3><div id="lb-chat" class="chatlog"></div><input class="t" id="lb-say" maxlength="200" placeholder="Message… (Entrée pour envoyer)"></div>
        <div>${host ? `<h3>Options de la partie</h3>${this.optionsHtml('online')}` : '<h3>Partie</h3><p style="text-align:left">En attente du lancement par l\'hôte…</p>'}</div></div>
      <div class="row"><button data-act="lleave">Quitter le salon</button>${host ? '<button class="primary" data-act="lstart">Lancer la partie</button>' : ''}</div></div>`;
  }

  updateLobby(roster) {
    const el = $('lb-players');
    if (!el || this.screen !== 'lobby') return;
    el.innerHTML = roster.map((p) => `<div class="pl"><b>${esc(p.name)}</b>${p.host ? ' <small>(hôte)</small>' : ''}<i style="color:${LEGENDS[p.legend] ? LEGENDS[p.legend].color : '#fff'}">${LEGENDS[p.legend] ? LEGENDS[p.legend].name : ''}</i></div>`).join('');
    $('lb-count').textContent = `${roster.length} / ${MAX_PLAYERS}`;
  }

  addChat(from, text) {
    this.chatBuf.push([from, text]);
    if (this.chatBuf.length > 40) this.chatBuf.shift();
    const el = $('lb-chat');
    if (el && this.screen === 'lobby') this.drawChatLine(el, from, text);
  }
  drawChatLine(el, from, text) {
    const d = document.createElement('div');
    if (from) { const b = document.createElement('b'); b.textContent = from + ' : '; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
    else { d.className = 'sys'; d.textContent = text; }
    el.appendChild(d); el.scrollTop = el.scrollHeight;
  }
  redrawChat() { const el = $('lb-chat'); if (el) for (const [f, t] of this.chatBuf) this.drawChatLine(el, f, t); }

  options() {
    const keys = KEYS.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('');
    return `<div class="panel narrow"><h2>Options</h2><div class="opts" style="grid-template-columns:1fr">
      <label>Sensibilité souris : <b id="v-sens">${settings.sens}</b><input type="range" id="o-sens" min="0.3" max="3" step="0.1" value="${settings.sens}"></label>
      <label>Champ de vision : <b id="v-fov">${settings.fov}</b><input type="range" id="o-fov" min="70" max="110" step="1" value="${settings.fov}"></label>
      <label>Volume : <b id="v-vol">${settings.volume}</b><input type="range" id="o-vol" min="0" max="1" step="0.05" value="${settings.volume}"></label>
      <label>Qualité graphique : <select id="o-quality">${QUALITY.map((n, i) => `<option value="${i}" ${settings.quality === i ? 'selected' : ''}>${n}</option>`).join('')}</select> <small>(Bloom, couleurs, vignette ; baisser si ça rame)</small></label>
      <label class="chk"><input type="checkbox" id="o-shadows" ${settings.shadows ? 'checked' : ''}> Ombres du soleil (appliqué à la prochaine partie ; décocher si ça rame)</label></div>
      <table class="keys">${keys}</table><div class="row"><button data-act="back">Retour</button></div></div>`;
  }

  pause() {
    const on = this.game.session;
    return `<div class="panel narrow"><h2>Pause</h2>${on ? '<p>En ligne : la partie continue pendant la pause.</p>' : ''}<div class="menu">
      <button class="primary" data-act="resume">Reprendre</button>
      <button data-act="options">Options</button><button data-act="menu">Quitter vers le menu</button></div></div>`;
  }

  results(r) {
    const t = `${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}`;
    const s = this.game.session;
    const buttons = !s ? '<button data-act="menu">Menu</button><button class="primary" data-act="replay">Rejouer</button>'
      : s.role === 'host' ? '<button data-act="menu">Quitter</button><button class="primary" data-act="tolobby">Retour au salon (termine la partie pour tous)</button>'
        : '<button data-act="menu">Quitter</button><p style="margin:0;align-self:center">Retour au salon quand l\'hôte le décidera…</p>';
    return `<div class="panel narrow"><h2 style="text-align:center">${r.win ? 'VICTOIRE !' : 'Éliminé'}</h2>
      <div class="place">#${r.place}<small style="font-size:18px;opacity:.7"> / ${r.total}</small></div>
      <div class="stats"><div><b>${r.kills}</b>Éliminations</div><div><b>${r.damage}</b>Dégâts infligés</div><div><b>${t}</b>Temps de survie</div><div><b>${LEGENDS[this.legend].name}</b>Légende</div></div>
      <div class="row">${buttons}</div></div>`;
  }
}
