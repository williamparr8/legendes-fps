import { LIST, profile, owns, save, price, dayNumber } from './profile.js';

// Boutique du jour : 4 offres qui changent chaque jour (même sélection pour tous les joueurs, tirée de la date), à prix réduit :
// -40 % sur l'offre vedette, -25 % sur les autres. Elles disparaissent à minuit (heure locale). Certains skins (« daily ») ne sont
// vendus que dans cette rotation. Le paiement se fait en points ou en Éclats selon le skin ; rien n'est aléatoire.
const KEY = 'legendes-fps-offers';

function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function offers(day = dayNumber()) {
  const pool = [];
  for (const kind of ['perso', 'arme']) LIST[kind].forEach((d, i) => { if (!d.pass && (d.daily || d.gems || d.r >= 2)) pool.push({ kind, i, d }); });
  const r = rng(day * 31 + 7);
  for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
  const pick = [];
  const take = (pred) => { const x = pool.find((e) => !pick.includes(e) && pred(e)); if (x) pick.push(x); };
  take((e) => e.d.daily);                                   // au moins un skin exclusif à la rotation
  take((e) => e.kind === 'perso' && !pick.some((p) => p.kind === 'perso'));
  take((e) => e.kind === 'arme' && !pick.some((p) => p.kind === 'arme'));
  while (pick.length < 4) take(() => true);
  return pick.slice(0, 4).map((e, n) => {
    const cur = e.d.gems ? 'gems' : 'pts', base = e.d.gems || price(e.d), pct = n === 0 ? 40 : 25;
    return { kind: e.kind, i: e.i, def: e.d, cur, base, pct, price: Math.max(1, Math.round(base * (1 - pct / 100))), star: n === 0 };
  });
}

export const offerFor = (kind, i) => offers().find((o) => o.kind === kind && o.i === i) || null;

export function buyOffer(kind, i) {
  const o = offerFor(kind, i);
  if (!o || owns(kind, i)) return false;
  if (o.cur === 'gems') { if (profile.gems < o.price) return false; profile.gems -= o.price; }
  else { if (profile.pts < o.price) return false; profile.pts -= o.price; }
  profile.own[kind] |= 1 << i; profile.eq[kind] = i + 1; save();
  return true;
}

export const msLeft = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n; };
export const leftText = () => { const m = Math.floor(msLeft() / 60000); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

// « Nouveau » : les offres du jour n'ont pas encore été regardées.
export function unseen() { try { return localStorage.getItem(KEY) !== String(dayNumber()); } catch (e) { return false; } }
export function markSeen() { try { localStorage.setItem(KEY, String(dayNumber())); } catch (e) { /* stockage indisponible */ } }
// Offres encore à acheter aujourd'hui.
export const openOffers = () => offers().filter((o) => !owns(o.kind, o.i));
