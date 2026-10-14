import { profile, save } from './profile.js';
import { season } from './quests.js';

// Rang classé : 6 rangs de 4 divisions (100 RP par division), puis Légende. Les RP viennent du classement et des éliminations en fin de
// partie (au moins 4 escouades), pondérés par la difficulté ; on ne descend pas sous le début de son rang (protection). À chaque
// saison : récompense selon le meilleur rang, puis réinitialisation douce.
export const TIERS = [
  { n: 'Bronze', c: '#c8854a' }, { n: 'Argent', c: '#c0c8d0' }, { n: 'Or', c: '#ffd040' }, { n: 'Platine', c: '#40e0d0' },
  { n: 'Diamant', c: '#6ab0ff' }, { n: 'Maître', c: '#c070ff' }, { n: 'Légende', c: '#ff5a4a' },
];
const ROMAN = ['IV', 'III', 'II', 'I'];
const SEASON_PTS = [0, 100, 250, 450, 700, 1000, 1500]; // points offerts en fin de saison selon le rang atteint
const DIFF = { easy: 0.6, normal: 1, hard: 1.2, elite: 1.4 };
const PROT = [0, 0.5, 0.8, 1, 1, 1, 1];                  // part des pertes appliquée selon le rang (Bronze : aucune)

export function rankInfo(rp) {
  rp = Math.max(0, rp | 0);
  if (rp >= 2400) return { idx: 24, tier: 6, div: 0, name: 'Légende', color: TIERS[6].c, into: rp - 2400, need: 0, next: '', top: true, rp };
  const step = Math.floor(rp / 100), tier = Math.floor(step / 4), div = step % 4, nx = step + 1;
  return {
    idx: step, tier, div, name: `${TIERS[tier].n} ${ROMAN[div]}`, color: TIERS[tier].c, into: rp % 100, need: 100,
    next: nx >= 24 ? 'Légende' : `${TIERS[Math.floor(nx / 4)].n} ${ROMAN[nx % 4]}`, top: false, rp,
  };
}

// Variation de RP d'une partie (0 si elle ne compte pas).
export function rankDelta(res, rp = profile.rp) {
  const place = res.place | 0, total = res.total | 0, kills = Math.min(res.kills | 0, 10);
  if (!place || total < 4) return 0;
  const pct = (total - place) / Math.max(1, total - 1);       // 1 = victoire, 0 = dernier
  let d = (place === 1 ? 60 : Math.round(-20 + 70 * pct)) + kills * 3;
  d = d > 0 ? d * (DIFF[res.diff] || 1) : d * PROT[rankInfo(rp).tier];
  return Math.max(-30, Math.min(90, Math.round(d)));
}

// À appeler une fois par partie (après la fin) ; renseigne res.rank.
export function rankMatch(res) {
  if (res.rank) return res.rank;
  const before = rankInfo(profile.rp), delta = rankDelta(res);
  const floor = before.tier * 400;                               // protection : jamais sous le début du rang courant
  profile.rp = Math.max(floor, Math.max(0, profile.rp + delta));
  if (profile.rp > profile.peak) profile.peak = profile.rp;
  const after = rankInfo(profile.rp);
  res.rank = { delta, before, after, promoted: after.idx > before.idx, counted: (res.place | 0) >= 1 && (res.total | 0) >= 4 };
  save();
  return res.rank;
}

// Changement de saison : récompense + réinitialisation douce. Renvoie un texte (ou '') à afficher.
export function rankSeason() {
  const n = season().n;
  if (profile.rseason === n) return '';
  const first = !profile.rseason;
  let note = '';
  if (!first) {
    const t = rankInfo(profile.peak).tier, pts = SEASON_PTS[t];
    if (pts) { profile.pts += pts; profile.earned += pts; }
    note = `Fin de saison ${profile.rseason} : meilleur rang ${rankInfo(profile.peak).name}${pts ? ' → +' + pts + ' points' : ''}. Nouvelle saison, rang remis à ${rankInfo(Math.floor(profile.rp * 0.6)).name}.`;
    profile.rp = Math.floor(profile.rp * 0.6); profile.peak = profile.rp;
  }
  profile.rseason = n;
  save();
  return note;
}
