// Événements à durée limitée : du vendredi 17 h au dimanche soir, un événement (tournant par semaine) modifie les parties et
// rapporte plus de points. Identique pour tous les joueurs de la même date ; en ligne, l'hôte impose le sien (cfg.event).
// Débogage / test : ajouter ?event=night (ou lune, jackpot, express) à l'adresse.
export const EVENT_MULT = 1.5; // multiplicateur de points pendant un événement

export const EVENTS = [
  { id: 'night', name: 'Nuit noire', desc: "L'île plongée dans la nuit : étoiles, lune et visibilité réduite.", theme: 4 },
  { id: 'lune', name: 'Gravité lunaire', desc: 'Sauts très hauts, chutes lentes : le jeu en vertical.', gravity: 0.55 },
  { id: 'jackpot', name: 'Jackpot de butin', desc: 'Armes rares et équipement bien plus fréquents partout.', rare: 3.5 },
  { id: 'express', name: 'Zone express', desc: 'Le cercle se referme 60 % plus vite : pas le temps de piller.', zone: 1.6, theme: 3 },
];

export const eventById = (id) => EVENTS.find((e) => e.id === id) || null;

const weekIdx = (d) => Math.floor((Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) + 3) / 7); // semaines du lundi

// Événement actif maintenant (ou null).
export function currentEvent(now = new Date()) {
  let q = null;
  try { q = new URLSearchParams(location.search).get('event'); } catch (e) { /* hors navigateur */ }
  if (q) return eventById(q);
  const d = now.getDay(), h = now.getHours();
  if (!(d === 6 || d === 0 || (d === 5 && h >= 17))) return null;
  // le week-end appartient à la semaine commencée le lundi précédent
  return EVENTS[weekIdx(now) % EVENTS.length];
}

// { ev, active } : l'événement actif, sinon celui du prochain week-end avec le délai restant (texte français).
export function eventInfo(now = new Date()) {
  const cur = currentEvent(now);
  if (cur) {
    let end = new Date(now); end.setHours(23, 59, 59, 0);
    while (end.getDay() !== 1 && end.getDay() !== 0) end = new Date(end.getTime() + 864e5); // fin : dimanche 23 h 59
    if (end.getDay() === 1) end = new Date(end.getTime() - 864e5);
    const left = Math.max(0, end - now), j = Math.floor(left / 864e5), hr = Math.floor((left % 864e5) / 36e5);
    return { ev: cur, active: true, text: j > 0 ? `encore ${j} j ${hr} h` : `encore ${hr} h` };
  }
  const t = new Date(now); t.setHours(17, 0, 0, 0);
  const add = (5 - t.getDay() + 7) % 7;
  t.setTime(t.getTime() + add * 864e5);
  if (t <= now) t.setTime(t.getTime() + 7 * 864e5);
  const left = t - now, j = Math.floor(left / 864e5), hr = Math.floor((left % 864e5) / 36e5);
  return { ev: EVENTS[weekIdx(t) % EVENTS.length], active: false, text: `dans ${j} j ${hr} h (vendredi 17 h)` };
}
