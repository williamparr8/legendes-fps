import * as THREE from 'three';
import { makeRig, WIDS } from '../combat/humanoid.js';
import { buildWeaponModel, applyWeaponSkin } from '../combat/models.js';
import { getSkyEnv } from '../world/terrain.js';
import { human } from '../combat/humanrig.js';
import legends from '../legends/legends.json';
import { profile, LIST, RAR, price, owns, buy, equip, exportCode, importCode, validCode } from './profile.js';
import { buySkin, GEM } from './pass.js';
import { offers, offerFor, buyOffer, leftText, markSeen } from './daily.js';
import { COSM, buyCosm } from './cosmetics.js';
import { thumbImg, thumbTick } from './thumbs.js';

// Écran Boutique : cartes de skins (personnage / arme), aperçu 3D à droite (rendu par Game.render via shopFrame), sauvegarde.
const S = { kind: 'perso', sel: -1, msg: '', saveOpen: false }; // sel : indice du skin affiché (-1 = tenue par défaut)
const $ = (id) => document.getElementById(id);

export function shopOpen() { S.sel = profile.eq[S.kind] - 1; S.msg = ''; S.saveOpen = false; markSeen(); }

// Onglets Emblèmes / Bannières : cartes simples (pas d'aperçu 3D d'arme).
function cosmHtml() {
  const k = S.kind, list = COSM[k], eq = profile.eq[k] - 1, d0 = list[S.sel];
  const tab = (t, n) => `<button class="tab${S.kind === t ? ' sel' : ''}" data-act="stab" data-k="${t}">${n}</button>`;
  const cards = list.map((d, i) => {
    const own = owns(k, i), st = eq === i ? '<em class="eq">Équipé</em>' : own ? '<em class="ow">Possédé</em>' : d.gems ? `<em class="${profile.gems >= d.gems ? 'ok' : 'pr'}" style="color:#ffd070">${GEM} ${d.gems}</em>` : `<em class="${profile.pts >= d.p ? 'ok' : 'pr'}">◆ ${d.p} pts</em>`;
    const pv = k === 'emb' ? `<div class="cp" style="color:${d.c}">${d.g}</div>` : `<div class="cp ban" style="background:linear-gradient(90deg,${d.a},${d.b})">Joueur</div>`;
    return `<div class="sc cosm${S.sel === i ? ' sel' : ''}" data-act="spick" data-i="${i}" style="border-color:${d.gems ? '#ffd070' : '#5a6573'}">${pv}<b>${d.n}</b><small style="color:${d.gems ? '#ffd070' : '#9aa5b1'}">${d.gems ? 'Premium' : 'Boutique en points'}</small>${st}</div>`;
  }).join('');
  let act = '<button disabled>Choisis un élément</button>';
  if (S.sel === -1) act = eq === -1 ? '<button disabled>Aucun équipé</button>' : '<button class="primary" data-act="seq" data-i="-1">Ne rien équiper</button>';
  else if (d0 && owns(k, S.sel)) act = eq === S.sel ? `<button class="primary" data-act="seq" data-i="-1">Retirer</button>` : `<button class="primary" data-act="seq" data-i="${S.sel}">Équiper</button>`;
  else if (d0) {
    const have = d0.gems ? profile.gems : profile.pts, cost = d0.gems || d0.p;
    act = have >= cost ? `<button class="primary" data-act="cbuy" data-k="${k}" data-i="${S.sel}">Acheter — ${d0.gems ? GEM + ' ' + cost : cost + ' pts'}</button>`
      : d0.gems ? `<button class="primary" data-act="gemsopen">Il manque ${cost - have} ${GEM} — Obtenir des Éclats</button>` : `<button disabled>Il manque ${cost - have} pts (${cost})</button>`;
  }
  return `<div class="panel shop"><h2>Boutique <span class="pts">${profile.pts} pts</span> <span class="pts" style="color:#ffe27a">${GEM} ${profile.gems}</span></h2>
    <div class="tabs">${tab('perso', 'Personnage')}${tab('arme', 'Arme')}${tab('emb', 'Emblèmes')}${tab('ban', 'Bannières')}</div>
    <p style="text-align:left;opacity:.75;margin:0 0 8px">${k === 'emb' ? 'Un emblème s\'affiche à côté de ton nom (hall, salon, résultats).' : 'Une bannière colore le fond de ta plaque de nom (hall, salon, résultats).'}</p>
    <div class="scards cosms">${cards}</div>
    <div class="row sact"><span class="smsg">${S.msg}</span>${act}</div>
    <div class="row"><button data-act="back">Retour</button></div></div>`;
}

export function shopHtml() {
  if (S.kind === 'emb' || S.kind === 'ban') return cosmHtml();
  const k = S.kind, list = LIST[k], eq = profile.eq[k] - 1, cards = [];
  const card = (i, name, rar, pal, st, th = '') => `<div class="sc${S.sel === i ? ' sel' : ''}" data-act="spick" data-i="${i}" style="border-color:${rar ? rar.c : '#5a6573'}">
      ${th}<b>${name}</b><small style="color:${rar ? rar.c : '#9aa5b1'}">${rar ? rar.n : 'Par défaut'}</small>
      <span class="sw">${pal ? pal.map((c) => `<s style="background:${c}"></s>`).join('') : ''}</span>${st}</div>`;
  // sections : points ◆ (gratuit + points), Éclats ✦ (premium), Pass (paliers)
  const groups = { pts: [card(-1, 'Tenue d\'origine', null, null, `<em class="${eq === -1 ? 'eq' : 'ow'}">${eq === -1 ? 'Équipé' : 'Gratuit'}</em>`, '<div class="th th-none">Par défaut</div>')], gems: [], pass: [] };
  list.forEach((d, i) => {
    if (d.daily && !owns(k, i)) return; // visible seulement dans les offres du jour
    const c = price(d);
    const st = eq === i ? '<em class="eq">Équipé</em>' : owns(k, i) ? '<em class="ow">Possédé</em>' : d.pass ? `<em class="pr" style="color:#ff7af0">Pass · palier ${d.pass}</em>` : d.gems ? `<em class="${profile.gems >= d.gems ? 'ok' : 'pr'}" style="color:#ffd070">${GEM} ${d.gems}</em>` : `<em class="${profile.pts >= c ? 'ok' : 'pr'}">◆ ${c} pts</em>`;
    const html = card(i, d.n, d.pass ? { c: '#ff4af0', n: 'Exclusif Pass' } : d.gems ? { c: '#ffd070', n: 'Premium' } : RAR[d.r], d.p || d.w, st, thumbImg(k, d.id));
    (d.pass ? groups.pass : d.gems ? groups.gems : groups.pts).push(html);
  });
  const sec = (cls, title, sub, arr) => (arr.length ? `<div class="sgrp ${cls}"><b>${title}</b><span>${sub}</span></div>${arr.join('')}` : '');
  cards.push(sec('pts', '◆ Boutique en points', 'Gagnés en jouant (parties, défis, paliers de saison)', groups.pts),
    sec('gems', `${GEM} Boutique premium`, 'Skins uniques, achetés avec des Éclats', groups.gems),
    sec('pass', '★ Exclusifs du Pass de saison', 'Débloqués par paliers avec le Pass (pas à vendre)', groups.pass));
  // action pour le skin sélectionné
  let act;
  if (S.sel === -1) act = eq === -1 ? '<button disabled>Équipé</button>' : '<button class="primary" data-act="seq" data-i="-1">Équiper la tenue d\'origine</button>';
  else if (owns(k, S.sel)) act = eq === S.sel ? '<button disabled>Équipé</button>' : `<button class="primary" data-act="seq" data-i="${S.sel}">Équiper</button>`;
  else if (offerFor(k, S.sel)) {
    const o = offerFor(k, S.sel), have = o.cur === 'gems' ? profile.gems : profile.pts, sym = o.cur === 'gems' ? GEM : '◆', unit = o.cur === 'gems' ? '' : ' pts';
    act = have >= o.price ? `<button class="primary" data-act="soffer" data-k="${k}" data-i="${S.sel}">Offre du jour — ${sym} ${o.price}${unit} <s style="opacity:.6">${o.base}</s> (-${o.pct} %)</button>`
      : o.cur === 'gems' ? `<button class="primary" data-act="gemsopen">Il manque ${o.price - have} ${GEM} — Obtenir des Éclats</button>` : `<button disabled>Il manque ${o.price - have} pts (${o.price})</button>`;
  } else if (list[S.sel].daily) act = '<button disabled>Disponible seulement dans une offre du jour</button>';
  else if (list[S.sel].pass) act = `<button disabled>Exclusif au Pass de saison — palier ${list[S.sel].pass}</button>`;
  else if (list[S.sel].gems) {
    const c = list[S.sel].gems;
    act = profile.gems >= c ? `<button class="primary" data-act="sgem" data-i="${S.sel}">Acheter — ${GEM} ${c}</button>`
      : `<button class="primary" data-act="gemsopen">Il manque ${c - profile.gems} ${GEM} — Obtenir des Éclats</button>`;
  } else {
    const c = price(list[S.sel]);
    act = profile.pts >= c ? `<button class="primary" data-act="sbuy" data-i="${S.sel}">Acheter — ${c} pts</button>` : `<button disabled>Il manque ${c - profile.pts} pts (${c})</button>`;
  }
  const tab = (t, n) => `<button class="tab${S.kind === t ? ' sel' : ''}" data-act="stab" data-k="${t}">${n}</button>`;
  const total = LIST.perso.length + LIST.arme.length, got = ['perso', 'arme'].reduce((n, t) => n + LIST[t].filter((_, i) => owns(t, i)).length, 0);
  return `<div class="panel shop"><h2>Boutique <span class="pts">${profile.pts} pts</span> <span class="pts" style="color:#ffe27a">${GEM} ${profile.gems}</span></h2>
    <div class="sdaily"><div class="sgrp daily"><b>⏱ Offres du jour</b><span>Se renouvellent dans ${leftText()} · -25 % à -40 %</span></div><div class="soffers">${offers().map((o) => {
      const own = owns(o.kind, o.i), sym = o.cur === 'gems' ? GEM : '◆', rar = o.def.gems ? { c: '#ffd070' } : RAR[o.def.r];
      return `<div class="sc offer${S.kind === o.kind && S.sel === o.i ? ' sel' : ''}" data-act="soffsel" data-k="${o.kind}" data-i="${o.i}" style="border-color:${rar.c}">${o.star ? '<i class="star">-' + o.pct + ' %</i>' : '<i class="star n">-' + o.pct + ' %</i>'}
        ${thumbImg(o.kind, o.def.id)}<b>${o.def.n}</b><small>${o.kind === 'perso' ? 'Tenue' : 'Arme'}${o.def.daily ? ' · exclusif du jour' : ''}</small>
        ${own ? '<em class="ow">Possédé</em>' : `<em class="ok">${sym} ${o.price} <s>${o.base}</s></em>`}</div>`;
    }).join('')}</div></div>
    <div class="tabs">${tab('perso', 'Personnage')}${tab('arme', 'Arme')}${tab('emb', 'Emblèmes')}${tab('ban', 'Bannières')}</div>
    <div class="scards">${cards.join('')}</div>
    <div class="row sact"><span class="smsg">${S.msg}</span>${act}</div>
    <p class="sstats">Collection ${got} / ${total} · ${profile.games} parties · ${profile.kills} éliminations · ${profile.wins} victoires · ${profile.earned} pts gagnés</p>
    <details class="save"${S.saveOpen ? ' open' : ''}><summary>Sauvegarde et transfert (code)</summary>
      <p>Ta progression est gardée dans ce navigateur. Pour la garder ailleurs (autre ordinateur, données effacées), copie ce code :</p>
      <div class="linkrow"><input class="t" id="sv-out" readonly value="${exportCode()}"><button data-act="svcopy">Copier</button></div>
      <p>Pour restaurer une progression :</p>
      <div class="linkrow"><input class="t" id="sv-in" placeholder="Colle ton code ici" autocomplete="off"><button data-act="svload">Importer</button></div></details>
    <div class="row"><button data-act="back">Retour</button></div></div>`;
}

// Actions de l'écran ; renvoie true si traitée.
export function shopAct(ui, a, d) {
  S.msg = '';
  switch (a) {
    case 'stab': S.kind = d.k; S.sel = profile.eq[d.k] - 1; break;
    case 'spick': S.sel = +d.i; break;
    case 'seq': equip(S.kind, +d.i + 1); break;
    case 'cbuy': { const r = buyCosm(d.k, +d.i); S.msg = r === 'ok' ? 'Acheté et équipé !' : r === 'gems' ? "Pas assez d'Éclats." : r === 'pts' ? 'Pas assez de points.' : ''; break; }
    case 'soffsel': S.kind = d.k; S.sel = +d.i; break;
    case 'soffer': if (buyOffer(d.k, +d.i)) S.msg = 'Offre du jour achetée et équipée !'; else S.msg = 'Pas assez pour cette offre.'; break;
    case 'sgem': if (buySkin(S.kind, +d.i)) S.msg = 'Acheté et équipé !'; else S.msg = "Pas assez d'Éclats."; break;
    case 'sbuy': if (buy(S.kind, +d.i)) S.msg = 'Acheté et équipé !'; else S.msg = 'Pas assez de points.'; break;
    case 'svcopy': {
      const el = $('sv-out');
      el.select();
      try { navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand('copy'); }
      return true;
    }
    case 'svload': {
      const v = $('sv-in').value;
      S.saveOpen = true;
      if (!validCode(v)) S.msg = 'Code invalide (copié en entier ? modifié ?).';
      else if ((profile.games || profile.pts || profile.own.perso || profile.own.arme) && !confirm('Remplacer la progression de cet ordinateur par celle du code ?')) return true;
      else { importCode(v); S.sel = profile.eq[S.kind] - 1; S.msg = 'Progression restaurée.'; }
      break;
    }
    default: return false;
  }
  ui.show('shop');
  return true;
}

// ---------- aperçu 3D : un opérateur qui tourne sur un socle, dans la partie droite de l'écran (le menu y est transparent) ----------
class ShopView {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f14);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    this.cam.position.set(0, 1.15, 5.2); this.cam.lookAt(0, 0.95, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
    key.position.set(2, 3, 3);
    this.scene.add(key);
    this.g = new THREE.Group(); this.scene.add(this.g);
    this.g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 32).translate(0, -0.03, 0), new THREE.MeshLambertMaterial({ color: 0x1b2d40 })));
    this.wg = new THREE.Group(); this.wg.visible = false; this.g.add(this.wg); // grande arme (onglet Arme)
    this.wm = {}; this.wkey = null;
    this.a = { health: { downed: false }, stance: 0, wid: WIDS[0], shots: 0, reloading: false, pitch: 0 };
    this.t = 0; this.sig = -1;
  }

  // (Re)construit l'opérateur quand le modèle animé / les corps de skins finissent de charger (sinon silhouette procédurale).
  build() {
    if (this.m) this.g.remove(this.m);
    this.m = new THREE.Group(); this.g.add(this.m);
    this.rig = makeRig(this.m, true);
    this.legend = '';
    this.sig = (human.ready ? 1 : 0) + Object.keys(human.bodies).length * 2;
  }

  frame(dt, legend) {
    this.t += dt;
    if (this.sig !== (human.ready ? 1 : 0) + Object.keys(human.bodies).length * 2) this.build();
    const w = WIDS[Math.floor(this.t / 5) % WIDS.length];
    this.a.wid = w;
    if (legend !== this.legend && legends[legend]) { this.legend = legend; this.rig.setAccent(legends[legend].color, legend); }
    const k = S.kind, i = S.sel;
    this.rig.setSkins(k === 'perso' ? i + 1 : profile.eq.perso, k === 'arme' ? i + 1 : profile.eq.arme);
    const showW = k === 'arme';
    this.m.visible = !showW; this.wg.visible = showW;
    const env = showW ? getSkyEnv() : null; // reflets du ciel sur le métal de l'arme (sinon elle ressort noire)
    if (this.scene.environment !== env) { this.scene.environment = env; this.scene.environmentIntensity = 0.9; }
    if (showW) this.weaponFrame(w, i);
    else this.rig.animate(dt, 0, 0, this.a);
    const asp = innerWidth / innerHeight;
    if (this.cam.aspect !== asp) { this.cam.aspect = asp; this.cam.updateProjectionMatrix(); }
    this.g.position.x = 0.55 * 1.49 * asp; // centre de la zone droite (le panneau occupe ~55 % de la largeur)
    this.g.rotation.y = showW ? 0 : 2.4 + this.t * 0.5;
  }

  // Onglet Arme : l'arme seule, en grand, tourne sur le socle (le skin sélectionné est appliqué à toutes les armes qui défilent).
  weaponFrame(wid, sel) {
    const def = sel >= 0 ? LIST.arme[sel] : null, key = def ? def.id : '';
    let m = this.wm[wid];
    if (!m) {
      const g = buildWeaponModel(wid), box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      g.position.sub(c);
      const o = new THREE.Group(); o.add(g);
      o.scale.setScalar(1.9 / Math.max(s.x, s.z, 0.5));
      this.wg.add(o);
      m = this.wm[wid] = { o, g, key: null };
    }
    for (const id in this.wm) this.wm[id].o.visible = id === wid;
    if (m.key !== key) { applyWeaponSkin(m.g, def); m.key = key; }
    this.wg.position.y = 1.0 + Math.sin(this.t * 1.3) * 0.05;
    this.wg.rotation.y = Math.PI / 2 + Math.sin(this.t * 0.5) * 0.9;
    this.wg.rotation.x = 0.08;
  }
}

let view = null;
// Appelé par Game.render quand l'écran Boutique est affiché : rend l'aperçu à la place du décor de menu.
export function shopFrame(game, dt) {
  if (!view) view = new ShopView();
  thumbTick(game.renderer); // miniatures des cartes : avant le rendu principal
  view.frame(dt, game.ui.legend);
  game.renderer.render(view.scene, view.cam);
}
