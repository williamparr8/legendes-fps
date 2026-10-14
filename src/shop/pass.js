import { grant, profile, save, LIST } from './profile.js';
import KEY from './passkey.json';
import CFG from './passconfig.json';

// Monnaie premium « Éclats » (✦) et Pass de saison.
// Éclats : 1000 pour 1,99 $ (lien PayPal.me de passconfig.json) ; le vendeur émet ensuite un code signé
// (node tools/make_eclats_code.mjs) que le joueur colle dans « Éclats » ; le jeu ne contient que la clé PUBLIQUE, donc un code ne peut
// pas être fabriqué sans la clé privée. Un code ne crédite qu'une fois par appareil (nonce mémorisé).
// Le solde et les achats vivent dans le profil (code de sauvegarde, somme de contrôle seulement) : pas de serveur, donc
// un joueur déterminé peut modifier son propre profil (voir PROGRESS.md).
const USED = 'legendes-fps-codes';
export const GEM = '✦';
export const PACK = { gems: CFG.gems || 1000, amount: CFG.amount, currency: CFG.currency };
export const PASS_PRICE = 950;
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
  if (!d || !d.gems || profile.gems < d.gems || (profile.own[kind] >> i) & 1) return false;
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
