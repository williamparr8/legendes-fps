import { profile, save, LIST, owns } from './profile.js';
import { levelInfo } from './quests.js';
import wdefs from '../combat/weapons.json';

// Succès et titres : se débloquent en jouant (totaux du profil + résultat de la partie), récompensés en points ; chaque succès
// donne un titre à afficher. Le masque `profile.ach` (un bit par succès, 30 max) est dans le code de sauvegarde.
const WI = (k) => Object.keys(wdefs).indexOf(k);
const killsWith = (k) => profile.st.w[WI(k)] | 0;
const ownedCount = () => ['perso', 'arme'].reduce((n, t) => n + LIST[t].filter((_, i) => owns(t, i)).length, 0);
const legendsPlayed = () => profile.st.l.filter((n) => n > 0).length;

// c : [valeur, objectif] pour la progression ; m : condition propre à la partie qui vient de finir (res, ms)
export const ACH = [
  { id: 'win1', n: 'Première victoire', d: 'Gagner une partie', t: 'Vainqueur', r: 100, c: () => [profile.wins, 1] },
  { id: 'wins5', n: 'Habitué du podium', d: 'Gagner 5 parties', t: 'Champion', r: 250, c: () => [profile.wins, 5] },
  { id: 'games25', n: 'Vétéran', d: 'Jouer 25 parties', t: 'Vétéran', r: 150, c: () => [profile.games, 25] },
  { id: 'sniper10', n: "Tireur d'élite", d: '10 éliminations au sniper', t: 'Sniper', r: 150, c: () => [killsWith('sniper'), 10] },
  { id: 'shotgun10', n: 'Corps à corps', d: '10 éliminations au fusil à pompe', t: 'Brise-porte', r: 150, c: () => [killsWith('shotgun'), 10] },
  { id: 'rocket5', n: 'Pyromane', d: '5 éliminations au lance-roquettes', t: 'Pyromane', r: 150, c: () => [killsWith('launcher'), 5] },
  { id: 'pistol5', n: 'Dernier recours', d: '5 éliminations au pistolet', t: 'Duelliste', r: 150, c: () => [killsWith('pistol'), 5] },
  { id: 'hs50', n: 'Chasseur de têtes', d: '50 tirs à la tête', t: 'Chasseur de têtes', r: 200, c: () => [profile.st.hs, 50] },
  { id: 'nowin', n: 'Ascète', d: 'Gagner sans utiliser un seul soin', t: 'Ascète', r: 300, c: () => [0, 1], m: (res, ms) => !!res.win && !(ms.heals | 0) },
  { id: 'kills10', n: 'Massacre', d: '10 éliminations en une partie', t: 'Massacreur', r: 250, c: () => [profile.st.bestKills, 10] },
  { id: 'dmg5000', n: 'Démolisseur', d: '5 000 dégâts infligés au total', t: 'Démolisseur', r: 150, c: () => [profile.st.dmg, 5000] },
  { id: 'acc40', n: 'Précis', d: '40 % de précision sur au moins 200 tirs', t: 'Précis', r: 200, c: () => [profile.st.shots >= 200 ? Math.round(100 * profile.st.hits / profile.st.shots) : 0, 40] },
  { id: 'top3x10', n: 'Habitué du top 3', d: 'Finir 10 fois dans le top 3', t: 'Survivant', r: 200, c: () => [profile.st.top3, 10] },
  { id: 'master', n: "Maître d'armes", d: '25 éliminations avec la même arme', t: "Maître d'armes", r: 250, c: () => [Math.max(0, ...profile.st.w), 25] },
  { id: 'collector', n: 'Collectionneur', d: 'Posséder 10 skins', t: 'Collectionneur', r: 300, c: () => [ownedCount(), 10] },
  { id: 'streak7', n: 'Fidèle', d: 'Série de connexion de 7 jours', t: 'Fidèle', r: 200, c: () => [profile.streak, 7] },
  { id: 'rich', n: 'Fortune', d: 'Gagner 3 000 points au total', t: 'Magnat', r: 250, c: () => [profile.earned, 3000] },
  { id: 'lvl10', n: 'Légende vivante', d: 'Atteindre le niveau 10', t: 'Légende vivante', r: 300, c: () => [levelInfo().level, 10] },
  { id: 'multi', n: "Touche-à-tout", d: 'Jouer avec 5 légendes différentes', t: 'Polyvalent', r: 200, c: () => [legendsPlayed(), 5] },
];

export const hasAch = (i) => ((profile.ach >> i) & 1) === 1;
export const achCount = () => ACH.filter((_, i) => hasAch(i)).length;
export const titleName = () => (profile.title > 0 && ACH[profile.title - 1] && hasAch(profile.title - 1) ? ACH[profile.title - 1].t : '');
export function setTitle(i) { if (i === 0 || (ACH[i - 1] && hasAch(i - 1))) { profile.title = i; save(); } }

// À appeler une fois par partie, après awardMatch : débloque les succès atteints et renvoie [{ txt, reward }].
export function achMatch(res) {
  if (res.ach) return res.ach;
  const ms = res.ms || {}, got = [];
  ACH.forEach((a, i) => {
    if (hasAch(i)) return;
    const done = a.m ? a.m(res, ms) : (() => { const [v, g] = a.c(); return v >= g; })();
    if (!done) return;
    profile.ach |= 1 << i; profile.pts += a.r; profile.earned += a.r;
    got.push({ txt: `Succès : ${a.n} — titre « ${a.t} »`, reward: a.r });
  });
  res.ach = got;
  if (got.length) save();
  return got;
}
