import { profile, save } from './profile.js';
import { levelInfo } from './quests.js';
import { EMB, BAN } from './cosmetics.js';
import legends from '../legends/legends.json';

// Récompenses de niveau : chaque niveau gagné donne des points, et certains paliers (5, 10, 15…) un emblème, une bannière, des Éclats
// ou une légende. Réclamées automatiquement à la fin d'une partie (et au lancement, pour les niveaux déjà atteints : rattrapage).
const SPECIAL = {
  5: { emb: 'etoile' }, 10: { ban: 'ocean', gems: 15 }, 15: { emb: 'eclair' }, 20: { gems: 30, legend: 'bulwark' },
  25: { ban: 'braise', emb: 'cible' }, 30: { gems: 50, legend: 'phantom' },
};
export const MAX_REWARD_LEVEL = 30;

export function levelReward(n) {
  const sp = SPECIAL[n] || {};
  return { pts: Math.min(220, 20 + 10 * n), ...sp };
}
const embName = (id) => (EMB.find((e) => e.id === id) || {}).n;
const banName = (id) => (BAN.find((b) => b.id === id) || {}).n;

// Texte d'une récompense (liste lisible).
export function rewardText(r) {
  const t = [`+${r.pts} pts`];
  if (r.gems) t.push(`+${r.gems} ✦`);
  if (r.emb) t.push(`emblème « ${embName(r.emb)} »`);
  if (r.ban) t.push(`bannière « ${banName(r.ban)} »`);
  if (r.legend) t.push(`légende ${legends[r.legend].name}`);
  return t.join(' · ');
}

// Accorde les récompenses des niveaux atteints et pas encore réclamés. Renvoie [{ level, txt }].
export function claimLevels() {
  const lv = Math.min(levelInfo().level, MAX_REWARD_LEVEL), got = [];
  while (profile.lvClaimed < lv) {
    const n = ++profile.lvClaimed, r = levelReward(n);
    profile.pts += r.pts; profile.earned += r.pts; profile.gems += r.gems | 0;
    for (const [k, list, key] of [['emb', EMB, 'emb'], ['ban', BAN, 'ban']]) {
      if (!r[k]) continue;
      const i = list.findIndex((x) => x.id === r[k]);
      if (i >= 0 && !((profile.own[key] >> i) & 1)) { profile.own[key] |= 1 << i; if (!profile.eq[key]) profile.eq[key] = i + 1; }
    }
    if (r.legend) { const i = Object.keys(legends).indexOf(r.legend); if (i >= 0) profile.legs |= 1 << i; }
    got.push({ level: n, txt: rewardText(r) });
  }
  if (got.length) save();
  return got;
}

// Prochaines récompenses (pour l'affichage) : niveaux n+1 … n+count.
export function nextRewards(count = 3) {
  const out = [];
  for (let n = profile.lvClaimed + 1; out.length < count && n <= MAX_REWARD_LEVEL; n++) out.push({ level: n, txt: rewardText(levelReward(n)), special: !!SPECIAL[n] });
  return out;
}
