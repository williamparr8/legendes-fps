import diffs from '../bots/difficulty.json';

// Équilibrage automatique d'une partie en ligne : « force » de chaque joueur (0-100, d'après son profil), moyenne du salon,
// puis difficulté des bots et nombre d'escouades ennemies recommandés. Les valeurs sont annoncées par chaque joueur dans le salon
// (non vérifiées : elles n'influencent que la difficulté).
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// profile : { games, wins, kills, st: { top3, shots, hits } } ; level : niveau du joueur.
export function powerOf(profile, level = 1) {
  const g = profile.games | 0, st = profile.st || {};
  if (g < 3) return clamp(Math.round(14 + level * 2), 10, 35); // trop peu de parties : estimation prudente selon le niveau
  const win = Math.min((profile.wins / g) * 3, 1);             // 33 % de victoires = maximum
  const top3 = Math.min(((st.top3 | 0) / g) * 2, 1);           // top 3 une partie sur deux = maximum
  const kpg = Math.min(profile.kills / g, 8) / 8;               // 8 éliminations par partie = maximum
  const acc = (st.shots | 0) > 50 ? Math.min((st.hits | 0) / st.shots, 0.6) / 0.6 : 0.3; // 60 % de précision = maximum
  const lv = Math.min(level, 20) / 20;
  return Math.round(clamp(100 * (0.25 * win + 0.2 * top3 + 0.3 * kpg + 0.15 * acc + 0.1 * lv), 5, 100));
}

export function powerLabel(p) { return p < 22 ? 'Débutant' : p < 45 ? 'Intermédiaire' : p < 68 ? 'Confirmé' : 'Expert'; }

// roster : [{ pw }] ; squadSize : taille des équipes (humains + bots). Renvoie la recommandation.
export function recommend(roster, squadSize = 3) {
  const humans = roster.length || 1;
  const avg = Math.round(roster.reduce((s, p) => s + (Number.isFinite(p.pw) ? p.pw : 20), 0) / humans);
  const diff = avg < 22 ? 'easy' : avg < 45 ? 'normal' : avg < 68 ? 'hard' : 'elite';
  const humanSquads = Math.ceil(humans / Math.max(1, squadSize));
  const total = clamp(Math.round(5 + avg / 8 + humans / 4), 6, 16);   // un groupe plus fort veut plus d'adversaires
  const enemySquads = clamp(total - humanSquads, 3, 14);
  return { avg, diff, diffName: diffs[diff].name, enemySquads, humans, humanSquads, total: enemySquads + humanSquads, label: powerLabel(avg) };
}
