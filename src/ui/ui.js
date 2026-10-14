import { LEGENDS, LEGEND_IDS } from '../legends/abilities.js';
import wdefs from '../combat/weapons.json';
import diffs from '../bots/difficulty.json';
import { settings, saveSettings, applySettings } from './settings.js';
import { transportKind, errorText, cleanCode } from '../net/transport.js';
import { MAX_PLAYERS } from '../net/session.js';
import { QUALITY } from '../core/post.js';
import { profile } from '../shop/profile.js';
import { levelInfo, dailies, weeklies, season, pending, passSync, freeReward } from '../shop/quests.js';
import { premium, buyUrl, priceText, redeem, buyPass, PACK, PASS_PRICE, GEM, TIERS as PASS_TIERS, titleFor } from '../shop/pass.js';
import { LIST } from '../shop/profile.js';
import { shopHtml, shopAct, shopOpen } from '../shop/shop.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODES = {
  solo: { title: 'Solo contre bots', bots: 24, label: 'Adversaires (bots)', col: '#e0452f', desc: 'Seul contre 24 bots, zone qui se réduit' },
  squad: { title: 'Équipe contre bots', bots: 10, label: 'Escouades ennemies', col: '#3a8ee8', desc: 'Escouade de 3 contre 10 escouades' },
  custom: { title: 'Partie personnalisée', bots: 10, label: 'Escouades ennemies', col: '#a45be8', desc: 'Armes, limites, équipes : tes règles' },
  training: { title: 'Entraînement', bots: 0, label: '', col: '#3fae6c', desc: 'Mannequins et armes à volonté' },
  online: { title: 'Salon en ligne', bots: 6, label: 'Escouades de bots', col: '#e8b030', desc: 'Joue avec tes amis (code de salon)' },
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
      if (el && el.classList.contains('lo-modal') && e.target !== el) return; // clic dans la fenêtre : ne la ferme pas
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

  show(screen, data) { this.root.innerHTML = this[screen](data); this.root.style.display = 'flex'; this.screen = screen; this.root.classList.toggle('shopmode', screen === 'shop'); this.root.classList.toggle('lobbymode', screen === 'main'); if (screen !== 'main') { this.lobbyTab = null; this.modesOpen = false; } if ((screen === 'setup' && this.mode !== 'training') || (screen === 'main' && (this.mode === 'solo' || this.mode === 'squad')) || (screen === 'lobby' && this.game.session.role === 'host')) { const sd = this.seed, ss = this.game.session; if (screen === 'lobby' && ss.preSeed !== sd) { ss.preSeed = sd; ss.lobby(); } setTimeout(() => this.game.prewarm(sd), 60); } if (screen === 'lobby') { this.updateLobby(this.game.session.role === 'host' ? this.game.session.roster() : this.game.session.roster); this.redrawChat(); } }
  hide() { this.root.style.display = 'none'; }

  // Graine choisie d'avance : le monde peut être construit pendant que le joueur règle sa partie.
  get seed() { if (this._seed == null) this._seed = (Math.random() * 1e6) | 0; return this._seed; }

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
      case 'play': this.play(); break;
      case 'ltab': this.lobbyTab = this.lobbyTab === d.t || d.t === 'play' ? null : d.t; this.show('main'); break;
      case 'qopen': this.qTab = d.q; this.lobbyTab = 'quests'; this.show('main'); break;
      case 'qtab': this.qTab = d.q; this.show('main'); break;
      case 'passbuy': {
        const n = season().n;
        if (confirm('Dépenser ' + PASS_PRICE + ' ' + GEM + ' pour le Pass de la saison ' + n + ' ?')) {
          if (buyPass(n)) { const got = passSync(); this.passMsg = got.length ? got.length + ' récompense(s) déjà débloquée(s).' : ''; } else this.passMsg = "Pas assez d'Éclats.";
        }
        this.show('main'); break;
      }
      case 'gemsopen': this.lobbyTab = 'gems'; this.show('main'); break;
      case 'gemsbuy': { const u = buyUrl(); if (u) window.open(u, '_blank', 'noopener'); break; }
      case 'gemsredeem': this.redeemCode(); break;
      case 'lclose': this.lobbyTab = null; this.show('main'); break;
      case 'lmodes': this.modesOpen = !this.modesOpen; this.show('main'); break;
      case 'lmode': this.mode = d.mode; this.modesOpen = false; this.show('main'); break;
      case 'lleg': { const i = LEGEND_IDS.indexOf(this.legend); this.legend = LEGEND_IDS[(i + (+d.d) + LEGEND_IDS.length) % LEGEND_IDS.length]; this.show('main'); break; }
      case 'pick': this.legend = d.id; if (this.screen === 'main') this.show('main'); else document.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === d.id)); break;
      case 'start': g.start(this.readConfig()); break;
      case 'menu': g.quit(); break;
      case 'options': this.from = this.screen; this.show('options'); break;
      case 'back': this.show(this.from === 'pause' ? 'pause' : 'main'); break;
      case 'resume': g.input.lock(); if (g.m && g.m.net && g.m.net.role === 'client') g.m.net.setReady(); break;
      case 'replay': g.start(this.lastCfg); break;
      case 'online': this.show('online'); break;
      case 'host': case 'join': this.connect(a); break;
      case 'lstart': { this.mode = 'online'; g.session.start(this.readConfig()); break; }
      case 'lleave': g.quit(); break;
      case 'tolobby': g.session.backToLobby(); g.toLobby(); break;
      case 'shop': shopOpen(); this.from = 'main'; this.show('shop'); break;
      case 'copylink': { const el = $('lb-link'); el.select(); try { navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand('copy'); } $('lb-copied').textContent = 'Copié !'; break; }
      default: shopAct(this, a, d);
    }
  }

  // Hall (menu principal) : barre d'onglets en haut, opérateur 3D au centre (lobby.js), modes à gauche, bouton JOUER en bas.
  main() {
    const L = levelInfo(), D = dailies(), W = weeklies(), SE = season(), M = MODES[this.mode], LG = LEGENDS[this.legend];
    const left = pending(), nextQ = D.concat(W).find((q) => !q.done);
    const tab = (t, n, act, extra = '') => `<button class="lo-tab${(t === 'play' && !this.lobbyTab) || this.lobbyTab === t ? ' on' : ''}" data-act="${act}" data-t="${t}">${n}${extra}</button>`;
    const modeRows = Object.keys(MODES).map((k) => `<button class="lo-mrow${k === this.mode ? ' on' : ''}" data-act="lmode" data-mode="${k}" style="--a:${MODES[k].col}"><b>${MODES[k].title}</b><small>${MODES[k].desc}</small></button>`).join('');
    const qrows = (list) => list.map((q) => `<div class="lo-q${q.done ? ' done' : ''}"><span>${q.done ? '✔ ' : ''}${q.txt}</span><i style="--p:${Math.round(100 * q.p / q.n)}%"></i><em>${q.done ? 'fait' : q.p + ' / ' + q.n} · +${q.reward} pts</em></div>`).join('');
    const qt = this.qTab || 'day';
    const qtab = (k, n) => `<button class="lo-qt${qt === k ? ' on' : ''}" data-act="qtab" data-q="${k}">${n}</button>`;
    let modal = '';
    if (this.lobbyTab === 'quests') {
      const body = qt === 'week' ? `<p>Quatre défis, renouvelés chaque lundi.</p>${qrows(W)}`
        : qt === 'season' ? `<p>Saison ${SE.n} « ${SE.name} » · il reste ${SE.daysLeft} jour${SE.daysLeft > 1 ? 's' : ''}. L'XP de saison vient des points gagnés en partie et des défis.</p>
          <div class="lo-tier"><b>Palier ${SE.tier} / ${SE.tiers}</b><div class="lo-xp wide"><i style="width:${SE.tier >= SE.tiers ? 100 : Math.round(100 * (SE.tierXp - SE.toNext) / SE.tierXp)}%"></i></div>
          <small>${SE.tier >= SE.tiers ? 'Tous les paliers sont atteints' : SE.toNext + ' XP avant le palier ' + (SE.tier + 1) + ' (+' + SE.nextReward + ' pts)'}</small></div>
          <h3>Défis de saison</h3>${qrows(SE.list)}`
        : `<p>Trois défis, renouvelés chaque jour ; la récompense est créditée dès qu'un défi est accompli.</p>${qrows(D)}`;
      modal = `<h2>Défis</h2><div class="lo-qts">${qtab('day', 'Du jour')}${qtab('week', 'Hebdomadaires')}${qtab('season', 'De saison')}</div>${body}<p class="lo-lv">Niveau ${L.level} — ${L.xp} / ${L.need} XP</p>`;
    } else if (this.lobbyTab === 'pass') {
      const reward = (t) => {
        const r = premium(t);
        const sk = r.skins.map(([k, id]) => { const d = LIST[k].find((x) => x.id === id); const c = d ? (d.p ? d.p[2] : d.w[0]) : '#fff'; return `<span class="lo-sk"><i style="background:${c}"></i>${k === 'perso' ? 'Tenue' : 'Arme'} ${d ? esc(d.n) : id}</span>`; }).join('');
        return `<div class="lo-tr${t <= SE.tier ? ' got' : ''}"><b>${t}</b><div class="lo-fr">Gratuit<br>+${freeReward(t)} pts</div><div class="lo-pr${SE.pass ? '' : ' lock'}">${sk}${r.title ? `<span class="lo-ti">« ${r.title} »</span>` : ''}<span>+${r.pts} pts</span></div></div>`;
      };
      let t = '';
      for (let i = 1; i <= PASS_TIERS; i++) t += reward(i);
      const need = PASS_PRICE - profile.gems;
      const buy = SE.pass
        ? `<p class="lo-passok">✔ Pass actif — les récompenses premium se débloquent à chaque palier (palier ${SE.tier} atteint).</p>`
        : `<div class="lo-buy"><div><b class="lo-price">${GEM} ${PASS_PRICE}</b><small>Une fois, pour toute la saison ${SE.n}. 7 skins animés introuvables ailleurs, 3 titres, bonus de points à chaque palier. Ton solde : ${GEM} ${profile.gems}.</small></div>
            ${need <= 0 ? '<button class="primary" data-act="passbuy">Acheter le Pass</button>' : `<button class="primary" data-act="gemsopen">Il manque ${need} ${GEM} — Obtenir des Éclats</button>`}</div>
            <small class="lo-msg">${esc(this.passMsg || '')}</small>`;
      modal = `<h2>Pass de saison ${SE.n} — ${SE.name}</h2>${buy}<div class="lo-track">${t}</div><p class="lo-how">Les paliers avancent avec l'XP de saison (parties et défis). Les skins du Pass sont aussi visibles dans la Boutique.</p>`;
    } else if (this.lobbyTab === 'gems') {
      const url = buyUrl();
      modal = `<h2>${GEM} Éclats</h2><p>Solde : <b>${profile.gems} ${GEM}</b> — la monnaie premium : le Pass de saison (${PASS_PRICE} ${GEM}) et les skins uniques de la Boutique.</p>
        <div class="lo-buy"><div><b class="lo-price">${PACK.gems} ${GEM}</b><small>pour ${priceText()}, paiement par PayPal.</small></div>
          <button class="primary" data-act="gemsbuy" ${url ? '' : 'disabled'}>${url ? 'Acheter avec PayPal' : 'Achat bientôt disponible'}</button></div>
        <p class="lo-how">1. Paie par PayPal (écris ton pseudo en note). 2. Tu reçois ton code. 3. Colle-le ici :</p>
        <div class="linkrow"><input class="t" id="gem-code" placeholder="Code d'Éclats (commence par LE.)" autocomplete="off"><button data-act="gemsredeem">Utiliser le code</button></div>
        <small class="lo-msg">${esc(this.gemMsg || '')}</small>`;
    } else if (this.lobbyTab === 'legends') modal = `<h2>Choisis ta légende</h2><div class="cards">${this.legendCards()}</div>`;
    const name = esc(settings.name || 'Joueur');
    return `<div class="lo">
      <div class="lo-top">
        <div class="lo-id"><div class="lo-lvl">${L.level}</div><div><b>${name}</b>${titleFor(SE.tier, SE.n) ? `<small style="color:#ff7af0">« ${titleFor(SE.tier, SE.n)} »</small>` : ''}<div class="lo-xp"><i style="width:${Math.round(100 * L.xp / L.need)}%"></i></div><small>${L.xp} / ${L.need} XP</small></div></div>
        <nav class="lo-tabs">${tab('play', 'Jouer', 'ltab')}${tab('legends', 'Légendes', 'ltab')}${tab('quests', 'Défis', 'ltab', left ? `<span class="lo-badge">${left}</span>` : '')}${tab('pass', 'Pass', 'ltab', SE.pass ? '' : '<span class="lo-badge new">!</span>')}${tab('shop', 'Boutique', 'shop')}${tab('opt', 'Options', 'options')}</nav>
        <div class="lo-res"><span class="lo-pts" title="Points (Boutique)">◆ ${profile.pts}</span><button class="lo-gems" data-act="gemsopen" title="Obtenir des Éclats">${GEM} ${profile.gems} <i>+</i></button><button class="lo-gear" data-act="options" title="Options et commandes">⚙</button></div>
      </div>
      <div class="lo-left">
        <div class="lo-friend"><div class="lo-av" style="background:${LG.color}">${esc((settings.name || 'J')[0].toUpperCase())}</div><div><b>${name}</b><small>Niveau ${L.level} · ${LG.name}</small></div></div>
        <button class="lo-slot" data-act="online" title="Inviter des amis : salon en ligne">+</button>
        <button class="lo-slot" data-act="online" title="Inviter des amis : salon en ligne">+</button>
      </div>
      <button class="lo-season" data-act="qopen" data-q="season" title="Défis de saison"><small>Saison ${SE.n}</small><b>${SE.name}</b><span>Palier ${SE.tier} / ${SE.tiers} · ${SE.daysLeft} j restants${SE.pass ? ' · PASS ✔' : ''}</span><div class="lo-xp wide"><i style="width:${SE.tier >= SE.tiers ? 100 : Math.round(100 * (SE.tierXp - SE.toNext) / SE.tierXp)}%"></i></div></button>
      <div class="lo-bl">
        <div class="lo-stat"><b>Carrière</b><span>${profile.games} parties · ${profile.kills} éliminations · ${profile.wins} victoires</span></div>
        ${this.modesOpen ? `<div class="lo-mlist">${modeRows}</div>` : ''}
        <button class="lo-mode" data-act="lmodes" style="--a:${M.col}"><small>Mode de jeu ▴</small><b>${M.title}</b><span>${M.desc}</span></button>
      </div>
      <div class="lo-center">
        <div class="lo-leg"><button data-act="lleg" data-d="-1">◀</button><div><b style="color:${LG.color}">${LG.name}</b><small>${LG.role}</small></div><button data-act="lleg" data-d="1">▶</button></div>
        <div class="lo-playw"><button class="lo-play" data-act="play">${this.mode === 'training' ? "S'entraîner" : this.mode === 'online' ? 'Salon en ligne' : 'Jouer'}</button></div>
        ${this.mode === 'solo' || this.mode === 'squad' ? `<button class="lo-link" data-act="mode" data-mode="${this.mode}">Options de la partie</button>` : ''}
      </div>
      <div class="lo-br">
        <button class="lo-tile" data-act="ltab" data-t="quests"><small>Défis (jour · semaine)</small><b>${left ? left + ' à accomplir' : 'Tous accomplis ✔'}</b><span>${nextQ ? nextQ.txt : 'Reviens demain'}</span></button>
        <button class="lo-tile alt" data-act="shop"><small>Boutique</small><b>${profile.pts} points</b><span>Skins d'opérateur et d'arme</span></button>
      </div>
      ${modal ? `<div class="lo-modal" data-act="lclose"><div class="lo-mp${this.lobbyTab === 'pass' ? ' pass' : ''}" data-stop="1">${modal}<div class="row"><button class="primary" data-act="lclose">Fermer</button></div></div></div>` : ''}
    </div>`;
  }

  async redeemCode() {
    const el = $('gem-code');
    const r = await redeem(el ? el.value : '');
    this.gemMsg = r === 'used' ? 'Ce code a déjà été utilisé sur cet appareil.' : r ? '+' + r.gems + ' ' + GEM + ' ajoutés. Merci !' : 'Code invalide (copié en entier ?).';
    if (this.screen === 'main') this.show('main');
  }

  // Lancement depuis le hall : solo / équipe / entraînement démarrent tout de suite (réglages par défaut) ; les autres ouvrent leur écran.
  play() {
    const m = this.mode;
    if (m === 'custom') this.show('setup');
    else if (m === 'online') this.show('online');
    else this.game.start(this.readConfig());
  }

  shop() { return shopHtml(); }

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
      <label>${m.label}<input type="number" id="c-bots" min="${online ? 0 : 1}" max="${mode === 'solo' ? 60 : online ? 12 : 25}" value="${m.bots}"></label>
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
      difficulty: v('c-diff', 'normal'), enemySquads: +v('c-bots', MODES[m].bots), squadSize: m === 'solo' ? 1 : +v('c-size', 3),
      zone: ch('c-zone', m !== 'training'), timeLimit: +v('c-time', 0), killLimit: +v('c-kills', 0),
      weapons: list('.wc', Object.keys(wdefs)), legends: list('.lc', LEGEND_IDS), seed: this.seed,
    };
    this._seed = null;
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

  // Départ d'une partie reçu du réseau : un clic est nécessaire pour capturer la souris (et débloquer le son).
  go() {
    return `<div class="panel narrow"><h2 style="text-align:center">La partie commence</h2><p>Cliquez pour prendre le contrôle (la souris est capturée ; Échap pour la libérer).</p>
      <div class="menu"><button class="primary" data-act="resume">Jouer</button></div></div>`;
  }

  results(r) {
    const t = `${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}`;
    const s = this.game.session;
    const buttons = !s ? '<button data-act="menu">Menu</button><button class="primary" data-act="replay">Rejouer</button>'
      : s.role === 'host' ? '<button data-act="menu">Quitter</button><button class="primary" data-act="tolobby">Retour au salon (termine la partie pour tous)</button>'
        : '<button data-act="menu">Quitter</button><p style="margin:0;align-self:center">Retour au salon quand l\'hôte le décidera…</p>';
    return `<div class="panel narrow"><h2 style="text-align:center">${r.win ? 'VICTOIRE !' : 'Éliminé'}</h2>
      <div class="place">#${r.place}<small style="font-size:18px;opacity:.7"> / ${r.total}</small></div>
      ${r.pts !== undefined ? `<p class="gain">+${r.pts} points · total ${profile.pts} (Boutique au menu principal) · niveau ${levelInfo().level}</p>` : ''}
      ${(r.quests || []).map((q) => `<p class="gain">Défi accompli : ${q.txt} · +${q.reward} points</p>`).join('')}
      <div class="stats"><div><b>${r.kills}</b>Éliminations</div><div><b>${r.damage}</b>Dégâts infligés</div><div><b>${t}</b>Temps de survie</div><div><b>${LEGENDS[this.legend].name}</b>Légende</div></div>
      <div class="row">${buttons}</div></div>`;
  }
}
