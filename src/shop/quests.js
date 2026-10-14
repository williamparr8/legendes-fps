import { profile, save } from './profile.js';

// Niveau (dérivé des points gagnés à vie : profile.earned, déjà dans le code de sauvegarde), défis quotidiens, hebdomadaires et de saison.
// Niveau n atteint à 30·n·(n−1) points cumulés ; 3 défis par jour (graine = date locale), 4 par semaine (du lundi), une saison de 12 semaines
// avec 6 défis cumulés + 20 paliers de saison (XP de saison = points gagnés pendant la saison). Récompenses en points créditées
// à l'accomplissement. Stockage séparé (localStorage) : ni les défis ni la saison ne sont dans le code de sauvegarde.
export function levelInfo() {
  const e = profile.earned | 0;
  let n = 1;
  while (e >= 30 * (n + 1) * n) n++;
  const lo = 30 * n * (n - 1), hi = 30 * (n + 1) * n;
  return { level: n, xp: e - lo, need: hi - lo };
}

const KEY = 'legendes-fps-quests';
// v : objectifs par palier de difficulté, f : contribution d'une partie (res : kills, damage, time, place, win)
const KIND = {
  kills: { txt: (n) => `Éliminer ${n} ennemis`, f: (r) => r.kills | 0 },
  dmg: { txt: (n) => `Infliger ${n} dégâts`, f: (r) => r.damage | 0 },
  games: { txt: (n) => `Jouer ${n} parties`, f: () => 1 },
  top3: { txt: (n) => `Finir dans le top 3 (${n} fois)`, f: (r) => ((r.place | 0) >= 1 && r.place <= 3 ? 1 : 0) },
  win: { txt: (n) => (n > 1 ? `Gagner ${n} parties` : 'Gagner une partie'), f: (r) => (r.win ? 1 : 0) },
  surv: { txt: (n) => `Survivre ${n} minutes (cumul)`, f: (r) => Math.floor((r.time | 0) / 60) },
};
const DAILY = [
  ['kills', [3, 5, 8], [40, 60, 90]], ['dmg', [400, 800, 1400], [40, 60, 90]], ['games', [2, 3, 4], [30, 50, 70]],
  ['top3', [1, 2, 3], [50, 80, 110]], ['win', [1, 1, 1], [100, 100, 100]], ['surv', [6, 10, 16], [40, 60, 90]],
];
const WEEKLY = [
  ['kills', [15, 25, 40], [150, 220, 320]], ['dmg', [2500, 4000, 6000], [150, 220, 320]], ['games', [6, 9, 12], [120, 180, 260]],
  ['top3', [3, 5, 7], [160, 240, 340]], ['win', [1, 2, 3], [250, 400, 600]], ['surv', [30, 50, 75], [140, 200, 300]],
];
const SEASON = [ // fixes : objectifs à long terme
  ['games', 40, 500], ['kills', 150, 800], ['dmg', 15000, 800], ['top3', 15, 700], ['win', 5, 1200], ['surv', 240, 600],
];
const NAMES = ['Éveil', 'Braise', 'Givre', 'Tempête', 'Aurore', 'Spectre'];
const SEASON_DAYS = 84, SEASON_START = Date.UTC(2026, 9, 1) / 864e5; // 1er octobre 2026
const TIERS = 20, TIER_XP = 200, tierReward = (t) => (t % 5 === 0 ? 250 : 40);

const dayNum = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
const dateKey = (n) => { const d = new Date(n * 864e5); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const weekNum = (d) => Math.floor((d + 3) / 7); // semaines du lundi au dimanche (le 1er janvier 1970 était un jeudi)
const seasonIdx = (d) => Math.max(0, Math.floor((d - SEASON_START) / SEASON_DAYS));

function pick(seed, pool, count) {
  let s = (seed * 2654435761) >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const idx = pool.map((_, i) => i), out = [];
  for (let k = 0; k < count; k++) { const i = idx.splice(Math.floor(r() * idx.length), 1)[0]; out.push({ i, t: Math.min(2, Math.floor(r() * 3)), p: 0, done: 0 }); }
  return out;
}

let st = null;
function load() {
  const d = dayNum(), w = weekNum(d), se = seasonIdx(d);
  if (!st) { try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; } }
  if (!st || typeof st !== 'object') st = {};
  if (st.day !== dateKey(d) || !Array.isArray(st.q) || st.q.length !== 3) { st.day = dateKey(d); st.q = pick(dateKey(d), DAILY, 3); }
  if (st.wk !== w || !Array.isArray(st.wq) || st.wq.length !== 4) { st.wk = w; st.wq = pick(w * 7919, WEEKLY, 4); }
  if (st.se !== se || !Array.isArray(st.sq) || st.sq.length !== SEASON.length) { st.se = se; st.sq = SEASON.map(() => ({ p: 0, done: 0 })); st.sxp = 0; st.tier = 0; }
  return st;
}
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* stockage indisponible */ } };

const view = (list, pool) => list.map((q) => { const [k, v, rw] = pool[q.i], n = v[q.t]; return { txt: KIND[k].txt(n), p: Math.min(q.p, n), n, reward: rw[q.t], done: !!q.done }; });

// Vues : [{ txt, p, n, reward, done }]
export const dailies = () => view(load().q, DAILY);
export const weeklies = () => view(load().wq, WEEKLY);
export function season() {
  const s = load(), d = dayNum(), n = seasonIdx(d);
  return {
    n: n + 1, name: NAMES[n % NAMES.length], daysLeft: SEASON_DAYS - ((d - SEASON_START) - n * SEASON_DAYS), xp: s.sxp, tier: s.tier, tiers: TIERS, tierXp: TIER_XP,
    toNext: s.tier >= TIERS ? 0 : TIER_XP - (s.sxp - s.tier * TIER_XP), nextReward: s.tier >= TIERS ? 0 : tierReward(s.tier + 1),
    list: s.sq.map((q, i) => { const [k, n2, rw] = SEASON[i]; return { txt: KIND[k].txt(n2), p: Math.min(q.p, n2), n: n2, reward: rw, done: !!q.done }; }),
  };
}
// Défis restants (jour + semaine) : pastille du menu
export const pending = () => dailies().concat(weeklies()).filter((q) => !q.done).length;

// À appeler une fois par partie (après awardMatch). Retourne ce qui a été accompli (pour l'écran de résultats).
export function questsMatch(res) {
  if (res.quests) return res.quests;
  const s = load(), got = [];
  let gain = 0;
  const run = (list, pool, tag) => {
    for (const q of list) {
      if (q.done) continue;
      const [k, v, rw] = pool[q.i], n = v[q.t];
      q.p += KIND[k].f(res);
      if (q.p >= n) { q.done = 1; profile.pts += rw[q.t]; profile.earned += rw[q.t]; gain += rw[q.t]; got.push({ txt: tag + KIND[k].txt(n), reward: rw[q.t] }); }
    }
  };
  run(s.q, DAILY, '');
  run(s.wq, WEEKLY, 'Hebdo : ');
  s.sq.forEach((q, i) => {
    if (q.done) return;
    const [k, n, rw] = SEASON[i];
    q.p += KIND[k].f(res);
    if (q.p >= n) { q.done = 1; profile.pts += rw; profile.earned += rw; gain += rw; got.push({ txt: 'Saison : ' + KIND[k].txt(n), reward: rw }); }
  });
  s.sxp += (res.pts | 0) + gain; // XP de saison : points de la partie + défis ; les paliers eux-mêmes n'en donnent pas
  while (s.tier < TIERS && s.sxp >= (s.tier + 1) * TIER_XP) {
    s.tier++;
    const r = tierReward(s.tier);
    profile.pts += r; profile.earned += r;
    got.push({ txt: `Saison : palier ${s.tier} atteint`, reward: r });
  }
  res.quests = got;
  store(); if (got.length) save();
  return got;
}
