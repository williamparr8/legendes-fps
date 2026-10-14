import data from './skins.json';
import legends from '../legends/legends.json';
import { EVENT_MULT } from '../match/events.js';

// Profil du joueur : points, Éclats, skins, légendes débloquées, succès, série de connexion, statistiques.
// Stocké dans localStorage sous forme de « code de sauvegarde » (base64url + somme de contrôle) ; le même code sert à
// exporter/importer la progression (changer d'ordinateur, données effacées). Anti-triche : simple somme de contrôle (pas de serveur).
// Les listes de skins ne doivent qu'être AUGMENTÉES (l'ordre sert de masque de bits dans le code).
// Format : v1 (10 nombres), v2 (+ Éclats, Pass), v3 (+ succès, série, légendes, statistiques) ; les anciens codes restent importables.
const KEY = 'legendes-fps-profile';
const SALT = 'legendes-fps/v1';

export const KINDS = ['perso', 'arme'];
export const LIST = { perso: data.perso, arme: data.arme };
export const RAR = data.rarities;
export const price = (def) => RAR[def.r].prix;

export const LEG = Object.keys(legends);                       // ordre = bit de `legs`
const FREE_MASK = LEG.reduce((m, id, i) => (legends[id].price ? m : m | (1 << i)), 0) || 1;
const ALL_MASK = (1 << LEG.length) - 1;
const SLOTS_W = 8, SLOTS_L = 8, HIST = 12;                    // tailles fixes des tableaux de statistiques

const blankStats = () => ({ shots: 0, hits: 0, hs: 0, dmg: 0, top3: 0, bestPlace: 0, bestKills: 0, heals: 0, w: Array(SLOTS_W).fill(0), l: Array(SLOTS_L).fill(0), hist: Array(HIST).fill(0) });

// own : masque de bits des skins possédés (bit i = LIST[kind][i]) ; eq : skin équipé = indice + 1 (0 = tenue par défaut).
export const profile = {
  pts: 0, own: { perso: 0, arme: 0 }, eq: { perso: 0, arme: 0 }, games: 0, kills: 0, wins: 0, earned: 0, gems: 0, pass: 0,
  ach: 0, title: 0, streak: 0, lastDay: 0, claimed: 0, legs: FREE_MASK, st: blankStats(),
  rp: 0, peak: 0, rseason: 0, // rang classé : points de rang, meilleur de la saison, saison courante (voir rank.js)
};

const sum = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const b64 = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export function exportCode() {
  const p = profile, s = p.st;
  const v = [4, p.pts, p.own.perso, p.own.arme, p.eq.perso, p.eq.arme, p.games, p.kills, p.wins, p.earned, p.gems, p.pass,
    p.ach, p.title, p.streak, p.lastDay, p.claimed, p.legs, s.shots, s.hits, s.hs, s.dmg, s.top3, s.bestPlace, s.bestKills, s.heals, ...s.w, ...s.l, ...s.hist, p.rp, p.peak, p.rseason];
  const body = v.join('.');
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
    const ver = v[0], need = ver === 1 ? 10 : ver === 2 ? 12 : ver === 3 ? 54 : ver === 4 ? 57 : -1;
    if (v.length !== need || v.some((n) => !Number.isInteger(n) || n < 0)) return null;
    const [, pts, op, oa, ep, ea, games, kills, wins, earned, gems = 0, pass = 0] = v;
    if (ep > LIST.perso.length || ea > LIST.arme.length) return null;
    if (ep && !(op >> (ep - 1) & 1)) return null;
    if (ea && !(oa >> (ea - 1) & 1)) return null;
    const o = { pts, own: { perso: op, arme: oa }, eq: { perso: ep, arme: ea }, games, kills, wins, earned, gems, pass, ach: 0, title: 0, streak: 0, lastDay: 0, claimed: 0, legs: games > 0 ? ALL_MASK : FREE_MASK, st: blankStats(), rp: 0, peak: 0, rseason: 0 };
    if (ver >= 3) {
      let i = 12;
      o.ach = v[i++]; o.title = v[i++]; o.streak = v[i++]; o.lastDay = v[i++]; o.claimed = v[i++]; o.legs = v[i++] | FREE_MASK;
      const st = o.st;
      st.shots = v[i++]; st.hits = v[i++]; st.hs = v[i++]; st.dmg = v[i++]; st.top3 = v[i++]; st.bestPlace = v[i++]; st.bestKills = v[i++]; st.heals = v[i++];
      for (let k = 0; k < SLOTS_W; k++) st.w[k] = v[i++];
      for (let k = 0; k < SLOTS_L; k++) st.l[k] = v[i++];
      for (let k = 0; k < HIST; k++) st.hist[k] = v[i++];
      if (ver === 4) { o.rp = v[i++]; o.peak = v[i++]; o.rseason = v[i++]; }
    }
    return o;
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

// ---------- légendes ----------
export const legendIndex = (id) => LEG.indexOf(id);
export const legendUnlocked = (id) => { const i = LEG.indexOf(id); return i >= 0 && ((profile.legs >> i) & 1) === 1; };
export const legendPrice = (id) => (legends[id] && legends[id].price) || 0;
export function unlockLegend(id) {
  const i = LEG.indexOf(id), c = legendPrice(id);
  if (i < 0 || legendUnlocked(id) || profile.pts < c) return false;
  profile.pts -= c; profile.legs |= 1 << i; save();
  return true;
}
export const firstUnlockedLegend = () => LEG.find((id) => legendUnlocked(id)) || LEG[0];

// ---------- série de connexion ----------
export const dayNumber = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
// À appeler à l'ouverture du jeu : un jour de plus = série +1 ; jours manqués : la série est divisée par deux (jamais remise à zéro).
export function touchDay() {
  const today = dayNumber();
  if (profile.lastDay === today) return;
  const gap = profile.lastDay ? today - profile.lastDay : 0;
  if (!profile.lastDay) profile.streak = 1;
  else if (gap === 1) profile.streak++;
  else profile.streak = Math.max(1, Math.ceil(profile.streak / 2)) + 1;
  profile.lastDay = today;
  save();
}
export const dailyBonus = () => 20 + 15 * Math.min(profile.streak, 7);
export const dailyClaimable = () => profile.claimed !== dayNumber() && profile.lastDay === dayNumber();
export function claimDaily() {
  if (!dailyClaimable()) return 0;
  const n = dailyBonus();
  profile.claimed = dayNumber(); profile.pts += n; profile.earned += n;
  save();
  return n;
}

// Points d'une partie : 15 + 6 par élimination + bonus de classement ; × 0,6 sans autre humain ; réduit si peu d'escouades (anti-exploit).
const BONUS = [80, 50, 35, 20, 20, 10, 10, 10, 10, 10];
export function matchPoints(res) {
  const base = 15 + 6 * Math.min(res.kills | 0, 30) + (BONUS[(res.place | 0) - 1] || 0);
  const crowd = Math.min(1, Math.max(0.2, ((res.total | 0) - 1) / 5)); // 6 escouades ou plus = plein tarif
  return Math.round(base * ((res.humans | 0) > 1 ? 1 : 0.6) * crowd * (res.event ? EVENT_MULT : 1));
}

// À appeler une seule fois par partie (res.pts sert de drapeau). Renvoie les points gagnés.
// res.ms : statistiques de la partie (tirs, touches, têtes, éliminations par arme, soins) ; res.leg : légende jouée.
export function awardMatch(res) {
  if (res.pts !== undefined) return res.pts;
  const pts = matchPoints(res);
  profile.pts += pts; profile.earned += pts; profile.games++; profile.kills += res.kills | 0; if (res.win) profile.wins++;
  const st = profile.st, ms = res.ms || {};
  st.shots += ms.shots | 0; st.hits += ms.hits | 0; st.hs += ms.hs | 0; st.heals += ms.heals | 0; st.dmg += res.damage | 0;
  const pl = res.place | 0;
  if (pl >= 1 && pl <= 3) st.top3++;
  if (pl >= 1 && (!st.bestPlace || pl < st.bestPlace)) st.bestPlace = pl;
  if ((res.kills | 0) > st.bestKills) st.bestKills = res.kills | 0;
  for (const k in ms.wk || {}) if (+k < SLOTS_W) st.w[+k] += ms.wk[k] | 0;
  const li = LEG.indexOf(res.leg);
  if (li >= 0 && li < SLOTS_L) st.l[li]++;
  st.hist.push(pts); while (st.hist.length > HIST) st.hist.shift();
  res.pts = pts;
  save();
  return pts;
}
