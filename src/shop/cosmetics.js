import { profile, save, owns } from './profile.js';

// Emblèmes et bannières : cosmétiques d'identité, affichés à côté du nom (hall, salon, résultats). Achetés en points ou en Éclats,
// possédés/équipés dans profile.own / profile.eq (clés « emb » et « ban »). Les listes ne doivent qu'être AUGMENTÉES (masque de bits).
export const EMB = [
  { id: 'etoile', n: 'Étoile', g: '★', c: '#ffd070', p: 200 }, { id: 'eclair', n: 'Éclair', g: '⚡', c: '#fff060', p: 300 },
  { id: 'coeur', n: 'Cœur', g: '♥', c: '#ff6a8a', p: 300 }, { id: 'lune', n: 'Croissant', g: '☾', c: '#c0d0ff', p: 400 },
  { id: 'soleil', n: 'Soleil', g: '☀', c: '#ffb030', p: 400 }, { id: 'flocon', n: 'Flocon', g: '❄', c: '#a0e0ff', p: 500 },
  { id: 'drapeau', n: 'Drapeau', g: '⚑', c: '#ff5a4a', p: 600 }, { id: 'epees', n: 'Épées', g: '⚔', c: '#d0d8e0', p: 700 },
  { id: 'cavalier', n: 'Cavalier', g: '♞', c: '#c0a070', p: 800 }, { id: 'diamant', n: 'Diamant', g: '◆', c: '#40e0ff', p: 900 },
  { id: 'cible', n: 'Cible', g: '✪', c: '#ff9a3a', p: 1000 }, { id: 'radiation', n: 'Radiation', g: '☢', c: '#9aff40', p: 1200 },
  { id: 'melodie', n: 'Mélodie', g: '♫', c: '#d090ff', p: 1200 },
  { id: 'crane', n: 'Crâne', g: '☠', c: '#ffffff', gems: 120 }, { id: 'couronne', n: 'Couronne', g: '♛', c: '#ffd040', gems: 200 },
  { id: 'phenix', n: 'Phénix', g: '❂', c: '#ff7a2a', gems: 300 },
];
export const BAN = [
  { id: 'ardoise', n: 'Ardoise', a: '#2a3140', b: '#4a5568', p: 300 }, { id: 'ocean', n: 'Océan', a: '#0a3a6a', b: '#2ab0d0', p: 500 },
  { id: 'foret', n: 'Forêt', a: '#0e3a22', b: '#4aa060', p: 500 }, { id: 'braise', n: 'Braise', a: '#6a1a0a', b: '#ff8a20', p: 700 },
  { id: 'violette', n: 'Violette', a: '#2a0a5a', b: '#b060ff', p: 800 }, { id: 'rose', n: 'Néon rose', a: '#5a0a3a', b: '#ff40b0', p: 900 },
  { id: 'or', n: 'Or royal', a: '#5a4000', b: '#ffd040', p: 1500 },
  { id: 'aurore', n: 'Aurore', a: '#0a5a5a', b: '#b060ff', gems: 150 }, { id: 'magma', n: 'Magma', a: '#200000', b: '#ff3a00', gems: 150 },
  { id: 'galaxie', n: 'Galaxie', a: '#0a0030', b: '#ff40e0', gems: 250 },
];
export const COSM = { emb: EMB, ban: BAN };

// Emblème / bannière équipés (indice + 1, 0 = aucun) → glyphe coloré / style CSS.
export const embHtml = (idx) => { const d = EMB[(idx | 0) - 1]; return d ? `<span class="emb" style="color:${d.c}">${d.g}</span>` : ''; };
export const banCss = (idx) => { const d = BAN[(idx | 0) - 1]; return d ? `background:linear-gradient(90deg,${d.a},${d.b});` : ''; };

// Achète et équipe. Renvoie 'ok' | 'pts' | 'gems' (solde insuffisant) | 'no'.
export function buyCosm(kind, i) {
  const d = COSM[kind] && COSM[kind][i];
  if (!d || owns(kind, i)) return 'no';
  if (d.gems) { if (profile.gems < d.gems) return 'gems'; profile.gems -= d.gems; }
  else { if (profile.pts < d.p) return 'pts'; profile.pts -= d.p; }
  profile.own[kind] |= 1 << i; profile.eq[kind] = i + 1; save();
  return 'ok';
}
