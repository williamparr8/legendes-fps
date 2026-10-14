import * as THREE from 'three';
import { makeRig, WIDS } from '../combat/humanoid.js';
import { human } from '../combat/humanrig.js';
import legends from '../legends/legends.json';
import { profile, LIST, RAR, price, owns, buy, equip, exportCode, importCode, validCode } from './profile.js';

// Écran Boutique : cartes de skins (personnage / arme), aperçu 3D à droite (rendu par Game.render via shopFrame), sauvegarde.
const S = { kind: 'perso', sel: -1, msg: '', saveOpen: false }; // sel : indice du skin affiché (-1 = tenue par défaut)
const $ = (id) => document.getElementById(id);

export function shopOpen() { S.sel = profile.eq[S.kind] - 1; S.msg = ''; S.saveOpen = false; }

export function shopHtml() {
  const k = S.kind, list = LIST[k], eq = profile.eq[k] - 1, cards = [];
  const card = (i, name, rar, pal, st) => `<div class="sc${S.sel === i ? ' sel' : ''}" data-act="spick" data-i="${i}" style="border-color:${rar ? rar.c : '#5a6573'}">
      <b>${name}</b><small style="color:${rar ? rar.c : '#9aa5b1'}">${rar ? rar.n : 'Par défaut'}</small>
      <span class="sw">${pal ? pal.map((c) => `<s style="background:${c}"></s>`).join('') : ''}</span>${st}</div>`;
  cards.push(card(-1, 'Tenue d\'origine', null, null, `<em class="${eq === -1 ? 'eq' : 'ow'}">${eq === -1 ? 'Équipé' : 'Gratuit'}</em>`));
  list.forEach((d, i) => {
    const c = price(d);
    const st = eq === i ? '<em class="eq">Équipé</em>' : owns(k, i) ? '<em class="ow">Possédé</em>' : `<em class="${profile.pts >= c ? 'ok' : 'pr'}">${c} pts</em>`;
    cards.push(card(i, d.n, RAR[d.r], d.p || d.w, st));
  });
  // action pour le skin sélectionné
  let act;
  if (S.sel === -1) act = eq === -1 ? '<button disabled>Équipé</button>' : '<button class="primary" data-act="seq" data-i="-1">Équiper la tenue d\'origine</button>';
  else if (owns(k, S.sel)) act = eq === S.sel ? '<button disabled>Équipé</button>' : `<button class="primary" data-act="seq" data-i="${S.sel}">Équiper</button>`;
  else {
    const c = price(list[S.sel]);
    act = profile.pts >= c ? `<button class="primary" data-act="sbuy" data-i="${S.sel}">Acheter — ${c} pts</button>` : `<button disabled>Il manque ${c - profile.pts} pts (${c})</button>`;
  }
  const tab = (t, n) => `<button class="tab${S.kind === t ? ' sel' : ''}" data-act="stab" data-k="${t}">${n}</button>`;
  const total = LIST.perso.length + LIST.arme.length, got = ['perso', 'arme'].reduce((n, t) => n + LIST[t].filter((_, i) => owns(t, i)).length, 0);
  return `<div class="panel shop"><h2>Boutique <span class="pts">${profile.pts} pts</span></h2>
    <div class="tabs">${tab('perso', 'Personnage')}${tab('arme', 'Arme')}</div>
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
    this.rig.animate(dt, 0, 0, this.a);
    const asp = innerWidth / innerHeight;
    if (this.cam.aspect !== asp) { this.cam.aspect = asp; this.cam.updateProjectionMatrix(); }
    this.g.position.x = 0.55 * 1.49 * asp; // centre de la zone droite (le panneau occupe ~55 % de la largeur)
    this.g.rotation.y = 2.4 + this.t * 0.5;
  }
}

let view = null;
// Appelé par Game.render quand l'écran Boutique est affiché : rend l'aperçu à la place du décor de menu.
export function shopFrame(game, dt) {
  if (!view) view = new ShopView();
  view.frame(dt, game.ui.legend);
  game.renderer.render(view.scene, view.cam);
}
