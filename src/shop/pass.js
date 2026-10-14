import { grant, profile, save, LIST } from './profile.js';
import KEY from './passkey.json';
import CFG from './passconfig.json';

// Pass de saison (payant) : voie premium parallèle aux 20 paliers de saison (quests.js).
// Paiement : lien PayPal.me (passconfig.json) → le vendeur émet un code signé (tools/make_pass_code.mjs, clé privée locale) →
// le joueur le colle dans « Pass ». Le jeu ne contient que la clé PUBLIQUE : un code ne peut pas être fabriqué sans la clé privée.
// Un code vaut pour une saison et peut être partagé (il porte le nom de l'acheteur) ; les récompenses obtenues restent à vie.
const STORE = 'legendes-fps-pass';
export const PRICE = CFG;
export const buyUrl = () => (CFG.paypalMe ? `https://www.paypal.me/${encodeURIComponent(CFG.paypalMe)}/${CFG.amount}${CFG.currency}` : '');
export const priceText = () => `${String(CFG.amount).replace('.', ',')} $${CFG.currency === 'USD' ? ' US' : ' CA'}`;

// Récompenses premium par palier : points (60, 150 tous les 5) + skins exclusifs + titre. Les identifiants viennent de skins.json.
const SKINS = { 1: [['arme', 'aurore']], 4: [['perso', 'aurore']], 8: [['arme', 'magma']], 11: [['perso', 'magma']], 14: [['arme', 'holo']], 17: [['perso', 'prisme']], 20: [['perso', 'eveil'], ['arme', 'eveil']] };
const TITLES = { 1: 'Fondateur', 10: 'Flamme vive', 20: 'Éveillé' };
export const TIERS = 20;
export const premium = (t) => ({ pts: t % 5 === 0 ? 150 : 60, skins: SKINS[t] || [], title: TITLES[t] || '' });

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
let pubKey = null;
// Renvoie { buyer, season } si le code est authentique, sinon null.
export async function verify(code) {
  try {
    const m = /^LP\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(code).replace(/\s+/g, ''));
    if (!m || !crypto.subtle) return null;
    if (!pubKey) pubKey = await crypto.subtle.importKey('jwk', KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const data = b64u(m[1]);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, b64u(m[2]), data))) return null;
    const [tag, season, buyer] = new TextDecoder().decode(data).split('|');
    if (tag !== 'LP1' || !(+season > 0)) return null;
    return { buyer: buyer || '', season: +season };
  } catch (e) { return null; }
}

const state = { ok: false, buyer: '', season: 0, code: '' };
let saved = '';
try { saved = localStorage.getItem(STORE) || ''; } catch (e) { /* stockage indisponible */ }
// Vérification du code mémorisé (asynchrone) ; l'interface se redessine à la fin.
export const ready = saved ? verify(saved).then((v) => { if (v) Object.assign(state, v, { ok: true, code: saved }); }) : Promise.resolve();

export async function activate(code) {
  const v = await verify(code);
  if (!v) return null;
  Object.assign(state, v, { ok: true, code: String(code).replace(/\s+/g, '') });
  try { localStorage.setItem(STORE, state.code); } catch (e) { /* stockage indisponible */ }
  return v;
}
export const info = () => ({ ok: state.ok, buyer: state.buyer, season: state.season });
export const active = (season) => state.ok && state.season === season;

// Accorde la récompense premium d'un palier ; ajoute des lignes {txt, reward} à `got`.
export function grantTier(t, got) {
  const r = premium(t);
  profile.pts += r.pts; profile.earned += r.pts;
  got.push({ txt: `Pass palier ${t}`, reward: r.pts });
  for (const [k, id] of r.skins) if (grant(k, id)) { const d = LIST[k].find((x) => x.id === id); got.push({ txt: `Pass : skin exclusif « ${d ? d.n : id} » débloqué`, reward: 0 }); }
  save();
}
// Titre affiché (plus haut palier premium atteint, si le pass est actif).
export function titleFor(tier, season) {
  if (!active(season)) return '';
  let t = '';
  for (const k of Object.keys(TITLES)) if (+k <= tier) t = TITLES[k];
  return t;
}
