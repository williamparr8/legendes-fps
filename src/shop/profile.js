import data from './skins.json';

// Profil du joueur : points, skins possédés/équipés, statistiques.
// Stocké dans localStorage sous forme de « code de sauvegarde » (base64url + somme de contrôle) ; le même code sert à
// exporter/importer la progression (changer d'ordinateur, données effacées). Anti-triche : simple somme de contrôle (pas de serveur).
// Les listes de skins ne doivent qu'être AUGMENTÉES (l'ordre sert de masque de bits dans le code).
const KEY = 'legendes-fps-profile';
const SALT = 'legendes-fps/v1';

export const KINDS = ['perso', 'arme'];
export const LIST = { perso: data.perso, arme: data.arme };
export const RAR = data.rarities;
export const price = (def) => RAR[def.r].prix;

// own : masque de bits des skins possédés (bit i = LIST[kind][i]) ; eq : skin équipé = indice + 1 (0 = tenue par défaut).
export const profile = { pts: 0, own: { perso: 0, arme: 0 }, eq: { perso: 0, arme: 0 }, games: 0, kills: 0, wins: 0, earned: 0, gems: 0, pass: 0 };

const sum = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const b64 = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export function exportCode() {
  const p = profile, body = [2, p.pts, p.own.perso, p.own.arme, p.eq.perso, p.eq.arme, p.games, p.kills, p.wins, p.earned, p.gems, p.pass].join('.');
  return 'LF' + b64(body + '~' + sum(SALT + body));
}

// Renvoie un profil valide ou null (code abîmé, modifié, ou d'une version inconnue).
function decode(code) {
  try {
    const s = String(code).replace(/\s+/g, '');
    if (s.slice(0, 2) !== 'LF') return null;
    const [body, cs] = unb64(s.slice(2)).split('~');
    if (!body || cs !== sum(SALT + body)) return null;
    const v = body.split('.').map(Number);
    if (!((v[0] === 1 && v.length === 10) || (v[0] === 2 && v.length === 12)) || v.some((n) => !Number.isInteger(n) || n < 0)) return null;
    const [, pts, op, oa, ep, ea, games, kills, wins, earned, gems = 0, pass = 0] = v;
    if (ep > LIST.perso.length || ea > LIST.arme.length) return null;
    if (ep && !(op >> (ep - 1) & 1)) return null;
    if (ea && !(oa >> (ea - 1) & 1)) return null;
    return { pts, own: { perso: op, arme: oa }, eq: { perso: ep, arme: ea }, games, kills, wins, earned, gems, pass };
  } catch (e) { return null; }
}

export function save() { try { localStorage.setItem(KEY, exportCode()); } catch (e) { /* stockage indisponible */ } }

try {
  const d = decode(localStorage.getItem(KEY) || '');
  if (d) Object.assign(profile, d);
} catch (e) { /* stockage indisponible */ }

export const validCode = (code) => decode(code) !== null;

export function importCode(code) {
  const d = decode(code);
  if (!d) return false;
  Object.assign(profile, d);
  save();
  return true;
}

export const owns = (kind, i) => ((profile.own[kind] >> i) & 1) === 1;
// Accorde un skin (Pass) : renvoie true s'il était nouveau.
export function grant(kind, id) {
  const i = LIST[kind].findIndex((d) => d.id === id);
  if (i < 0 || owns(kind, i)) return false;
  profile.own[kind] |= 1 << i; save();
  return true;
}
// Skin équipé (définition) ou null = tenue par défaut.
export const equippedDef = (kind) => LIST[kind][profile.eq[kind] - 1] || null;

export function buy(kind, i) {
  const def = LIST[kind][i];
  if (!def || def.pass || def.gems || owns(kind, i)) return false; // Pass : par paliers ; premium : en Éclats (pass.js)
  const c = price(def);
  if (profile.pts < c) return false;
  profile.pts -= c; profile.own[kind] |= 1 << i;
  profile.eq[kind] = i + 1; // acheté = équipé tout de suite
  save();
  return true;
}

// idx : indice + 1 (0 = tenue par défaut).
export function equip(kind, idx) {
  if (idx && !owns(kind, idx - 1)) return false;
  profile.eq[kind] = idx; save();
  return true;
}

// Points d'une partie : 15 + 6 par élimination + bonus de classement ; × 0,6 sans autre humain ; réduit si peu d'escouades (anti-exploit).
const BONUS = [80, 50, 35, 20, 20, 10, 10, 10, 10, 10];
export function matchPoints(res) {
  const base = 15 + 6 * Math.min(res.kills | 0, 30) + (BONUS[(res.place | 0) - 1] || 0);
  const crowd = Math.min(1, Math.max(0.2, ((res.total | 0) - 1) / 5)); // 6 escouades ou plus = plein tarif
  return Math.round(base * ((res.humans | 0) > 1 ? 1 : 0.6) * crowd);
}

// À appeler une seule fois par partie (res.pts sert de drapeau). Renvoie les points gagnés.
export function awardMatch(res) {
  if (res.pts !== undefined) return res.pts;
  const pts = matchPoints(res);
  profile.pts += pts; profile.earned += pts; profile.games++; profile.kills += res.kills | 0; if (res.win) profile.wins++;
  res.pts = pts;
  save();
  return pts;
}
