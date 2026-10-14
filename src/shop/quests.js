import { profile, save } from './profile.js';

// Niveau (dérivé des points gagnés à vie : profile.earned, déjà dans le code de sauvegarde) et défis quotidiens.
// Niveau n atteint à 60·n·(n−1)/2 points cumulés ; défis : 3 par jour (graine = date locale), progression cumulée sur la journée,
// récompense en points créditée à l'accomplissement. Stockage séparé (localStorage) : les défis ne sont pas dans le code de sauvegarde.
export function levelInfo() {
  const e = profile.earned | 0;
  let n = 1;
  while (e >= 30 * (n + 1) * n) n++;
  const lo = 30 * n * (n - 1), hi = 30 * (n + 1) * n;
  return { level: n, xp: e - lo, need: hi - lo };
}

const KEY = 'legendes-fps-quests';
const POOL = [
  { id: 'kills', txt: (n) => `Éliminer ${n} ennemis`, v: [3, 5, 8], reward: [40, 60, 90], f: (r) => r.kills | 0 },
  { id: 'dmg', txt: (n) => `Infliger ${n} dégâts`, v: [400, 800, 1400], reward: [40, 60, 90], f: (r) => r.damage | 0 },
  { id: 'games', txt: (n) => `Jouer ${n} parties`, v: [2, 3, 4], reward: [30, 50, 70], f: () => 1 },
  { id: 'top3', txt: (n) => `Finir dans le top 3 (${n} fois)`, v: [1, 2, 3], reward: [50, 80, 110], f: (r) => ((r.place | 0) >= 1 && r.place <= 3 ? 1 : 0) },
  { id: 'win', txt: () => 'Gagner une partie', v: [1, 1, 1], reward: [100, 100, 100], f: (r) => (r.win ? 1 : 0) },
  { id: 'surv', txt: (n) => `Survivre ${n} minutes (cumul)`, v: [6, 10, 16], reward: [40, 60, 90], f: (r) => Math.floor((r.time | 0) / 60) },
];

const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
function pick(day) {
  let s = day * 2654435761 >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const idx = POOL.map((_, i) => i);
  const out = [];
  for (let k = 0; k < 3; k++) { const i = idx.splice(Math.floor(r() * idx.length), 1)[0], t = Math.min(2, Math.floor(r() * 3)); out.push({ i, t, p: 0, done: 0 }); }
  return out;
}

let st = null;
function load() {
  const day = today();
  if (st && st.day === day) return st;
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.day === day && Array.isArray(o.q) && o.q.length === 3) return (st = o); } catch (e) { /* ignoré */ }
  return (st = { day, q: pick(day) });
}
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* stockage indisponible */ } };

// Vue : [{ txt, p, n, reward, done }]
export function dailies() {
  return load().q.map((q) => { const d = POOL[q.i]; return { txt: d.txt(d.v[q.t]), p: Math.min(q.p, d.v[q.t]), n: d.v[q.t], reward: d.reward[q.t], done: !!q.done }; });
}

// À appeler une fois par partie (après awardMatch). Retourne les défis accomplis par cette partie (pour l'écran de résultats).
export function questsMatch(res) {
  if (res.quests) return res.quests;
  const s = load(), got = [];
  for (const q of s.q) {
    if (q.done) continue;
    const d = POOL[q.i];
    q.p += d.f(res);
    if (q.p >= d.v[q.t]) { q.done = 1; profile.pts += d.reward[q.t]; profile.earned += d.reward[q.t]; got.push({ txt: d.txt(d.v[q.t]), reward: d.reward[q.t] }); }
  }
  res.quests = got;
  store(); if (got.length) save();
  return got;
}
