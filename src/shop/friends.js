import { dayNumber } from './profile.js';

// Amis récents : les joueurs rencontrés dans un salon en ligne (stockage local, sans serveur : pas de présence en ligne).
// Sert à retrouver les noms et à envoyer le lien d'invitation en un clic.
const KEY = 'legendes-fps-friends';
let list = [];
try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* stockage indisponible */ } };

export const friends = () => list.slice().sort((a, b) => b.d - a.d || b.c - a.c);

// names : pseudos présents dans le salon (hors soi-même).
export function seen(names, self = '') {
  const d = dayNumber();
  let ch = false;
  for (const raw of names) {
    const n = String(raw || '').slice(0, 16).trim();
    if (!n || n === self) continue;
    let f = list.find((x) => x.n === n);
    if (!f) { f = { n, d, c: 0 }; list.push(f); }
    if (f.d !== d) { f.d = d; f.c++; ch = true; } else if (f.c === 0) { f.c = 1; ch = true; }
    ch = true;
  }
  if (list.length > 24) { list.sort((a, b) => b.d - a.d); list.length = 24; }
  if (ch) store();
}
export function forget(name) { list = list.filter((f) => f.n !== name); store(); }
export function ago(d) {
  const n = dayNumber() - d;
  return n <= 0 ? "aujourd'hui" : n === 1 ? 'hier' : `il y a ${n} j`;
}
