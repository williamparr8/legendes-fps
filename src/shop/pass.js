import { grant, profile, save, LIST } from './profile.js';
import KEY from './passkey.json';
import CFG from './passconfig.json';

// Monnaie premium « Éclats » (✦) et Pass de saison.
// Éclats : 1000 pour 1,99 $. Voie automatique : boutons PayPal Checkout (paypalClientId de passconfig.json) ; la commande est capturée
// dans la page puis les Éclats sont crédités tout de suite (une seule fois par identifiant de commande). Voie manuelle (sans client id) :
// lien PayPal.me + code signé (node tools/make_eclats_code.mjs) ; le jeu ne contient que la clé PUBLIQUE, donc un code ne peut pas être
// fabriqué sans la clé privée. Un code ne crédite qu'une fois par appareil (nonce mémorisé).
// Le solde et les achats vivent dans le profil (code de sauvegarde, somme de contrôle seulement) : pas de serveur, donc
// un joueur déterminé peut modifier son propre profil (voir PROGRESS.md).
const USED = 'legendes-fps-codes';
export const GEM = '✦';
export const PACK = { gems: CFG.gems || 1000, amount: CFG.amount, currency: CFG.currency };
export const PASS_PRICE = 950;
export const hasCheckout = () => !!CFG.paypalClientId;
export const buyUrl = () => (CFG.paypalMe ? `https://www.paypal.me/${encodeURIComponent(CFG.paypalMe)}/${CFG.amount}${CFG.currency}` : '');
export const priceText = () => `${String(CFG.amount).replace('.', ',')} $ ${CFG.currency}`;

// Récompenses premium par palier : points (60, 150 tous les 5) + skins exclusifs + titre. Les identifiants viennent de skins.json.
const SKINS = { 1: [['arme', 'aurore']], 4: [['perso', 'aurore']], 8: [['arme', 'magma']], 11: [['perso', 'magma']], 14: [['arme', 'holo']], 17: [['perso', 'prisme']], 20: [['perso', 'eveil'], ['arme', 'eveil']] };
const TITLES = { 1: 'Fondateur', 10: 'Flamme vive', 20: 'Éveillé' };
export const TIERS = 20;
export const premium = (t) => ({ pts: t % 5 === 0 ? 150 : 60, skins: SKINS[t] || [], title: TITLES[t] || '' });

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
let pubKey = null;
// Renvoie { gems, buyer, nonce } si le code est authentique, sinon null.
export async function verify(code) {
  try {
    const m = /^LE\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(code).replace(/\s+/g, ''));
    if (!m || !crypto.subtle) return null;
    if (!pubKey) pubKey = await crypto.subtle.importKey('jwk', KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const data = b64u(m[1]);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, b64u(m[2]), data))) return null;
    const [tag, gems, buyer, nonce] = new TextDecoder().decode(data).split('|');
    if (tag !== 'LE1' || !(+gems > 0) || !nonce) return null;
    return { gems: +gems, buyer: buyer || '', nonce };
  } catch (e) { return null; }
}

// Crédite un code d'Éclats. Renvoie { gems } | 'used' | null (invalide).
export async function redeem(code) {
  const v = await verify(code);
  if (!v) return null;
  let used = [];
  try { used = JSON.parse(localStorage.getItem(USED) || '[]'); } catch (e) { used = []; }
  if (used.includes(v.nonce)) return 'used';
  used.push(v.nonce);
  try { localStorage.setItem(USED, JSON.stringify(used)); } catch (e) { /* stockage indisponible */ }
  profile.gems += v.gems; save();
  return { gems: v.gems, buyer: v.buyer };
}

// Crédite les Éclats d'une commande PayPal capturée (identifiant unique). Renvoie { gems } | 'used'.
export function creditOrder(orderId) {
  const key = 'PP:' + orderId;
  let used = [];
  try { used = JSON.parse(localStorage.getItem(USED) || '[]'); } catch (e) { used = []; }
  if (used.includes(key)) return 'used';
  used.push(key);
  try { localStorage.setItem(USED, JSON.stringify(used)); } catch (e) { /* stockage indisponible */ }
  profile.gems += PACK.gems; save();
  return { gems: PACK.gems };
}

let sdk = null;
function loadSdk() {
  if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
  if (!sdk) {
    sdk = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CFG.paypalClientId)}&currency=${CFG.currency}&intent=capture&components=buttons&disable-funding=paylater`;
      s.onload = () => res(window.paypal); s.onerror = () => { sdk = null; rej(new Error('sdk')); };
      document.head.appendChild(s);
    });
  }
  return sdk;
}
// Affiche les boutons PayPal dans `el` ; onDone({ gems } | 'used' | 'error') après la commande.
export async function mountCheckout(el, onDone) {
  try {
    const pp = await loadSdk();
    if (!el.isConnected) return;
    el.textContent = '';
    pp.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 44 },
      createOrder: (d, actions) => actions.order.create({
        purchase_units: [{ description: `${PACK.gems} Éclats — Légendes FPS`, amount: { currency_code: CFG.currency, value: String(CFG.amount) } }],
      }),
      onApprove: async (d, actions) => {
        try {
          const o = await actions.order.capture();
          const amt = o && o.purchase_units && o.purchase_units[0] && o.purchase_units[0].payments && o.purchase_units[0].payments.captures && o.purchase_units[0].payments.captures[0];
          if (o && o.status === 'COMPLETED' && (!amt || amt.status === 'COMPLETED')) onDone(creditOrder(o.id));
          else onDone('error');
        } catch (e) { onDone('error'); }
      },
      onError: () => onDone('error'),
    }).render(el);
  } catch (e) { if (el.isConnected) el.textContent = 'PayPal est indisponible pour le moment.'; }
}

export const active = (season) => profile.pass === season;
// Achète le Pass de la saison avec des Éclats.
export function buyPass(season) {
  if (active(season) || profile.gems < PASS_PRICE) return false;
  profile.gems -= PASS_PRICE; profile.pass = season; save();
  return true;
}
// Achète un skin à prix en Éclats.
export function buySkin(kind, i) {
  const d = LIST[kind][i];
  if (!d || !d.gems || d.daily || profile.gems < d.gems || (profile.own[kind] >> i) & 1) return false; // « daily » : seulement via la boutique du jour (daily.js)
  profile.gems -= d.gems; profile.own[kind] |= 1 << i; profile.eq[kind] = i + 1; save();
  return true;
}

// Accorde la récompense premium d'un palier ; ajoute des lignes {txt, reward} à `got`.
export function grantTier(t, got) {
  const r = premium(t);
  profile.pts += r.pts; profile.earned += r.pts;
  got.push({ txt: `Pass palier ${t}`, reward: r.pts });
  for (const [k, id] of r.skins) if (grant(k, id)) { const d = LIST[k].find((x) => x.id === id); got.push({ txt: `Pass : skin exclusif « ${d ? d.n : id} » débloqué`, reward: 0 }); }
  save();
}
// Titre affiché (plus haut palier premium atteint, si le pass de la saison est actif).
export function titleFor(tier, season) {
  if (!active(season)) return '';
  let t = '';
  for (const k of Object.keys(TITLES)) if (+k <= tier) t = TITLES[k];
  return t;
}
