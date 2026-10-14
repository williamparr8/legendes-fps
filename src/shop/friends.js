import { dayNumber } from './profile.js';

// Amis : code ami personnel (6 caractères, permanent sur cet appareil) = code du salon quand on héberge. Pour ajouter un ami : saisir son
// code (ou le retrouver automatiquement après une partie ensemble) ; pour le rejoindre : « Rejoindre » tente de se connecter au salon qui porte
// son code (réussit seulement s'il en a un ouvert). Stockage local, sans serveur : pas de présence en ligne permanente.
const KEY = 'legendes-fps-friends', KEY_ME = 'legendes-fps-fc';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let list = [];
try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* stockage indisponible */ } };

export const cleanFc = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

let me = '';
export function myCode() {
  if (me) return me;
  try { me = cleanFc(localStorage.getItem(KEY_ME)); } catch (e) { me = ''; }
  if (me.length < 6) {
    me = Array.from({ length: 6 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
    try { localStorage.setItem(KEY_ME, me); } catch (e) { /* stockage indisponible */ }
  }
  return me;
}

export const friends = () => list.slice().sort((a, b) => b.d - a.d || b.c - a.c);

// players : [{ name, fc }] présents dans le salon (soi-même ignoré, par nom ou par code).
export function seen(players, selfName = '') {
  const d = dayNumber(), mine = myCode();
  let ch = false;
  for (const p of players) {
    const n = String(p.name || '').slice(0, 16).trim(), fc = cleanFc(p.fc);
    if (!n || n === selfName || fc === mine) continue;
    let f = (fc && list.find((x) => x.code === fc)) || list.find((x) => x.n === n);
    if (!f) { f = { n, d, c: 0, code: fc || '' }; list.push(f); ch = true; }
    if (fc && f.code !== fc) { f.code = fc; ch = true; }
    if (f.n !== n) { f.n = n; ch = true; }
    if (f.d !== d) { f.d = d; f.c++; ch = true; } else if (f.c === 0) { f.c = 1; ch = true; }
  }
  if (list.length > 40) { list.sort((a, b) => b.d - a.d); list.length = 40; }
  if (ch) store();
}

// Ajout manuel par code ami. Renvoie '' si ok, sinon le message d'erreur.
export function add(code, name = '') {
  const fc = cleanFc(code);
  if (fc.length < 4) return 'Code trop court.';
  if (fc === myCode()) return "C'est ton propre code.";
  if (list.some((f) => f.code === fc)) return 'Cet ami est déjà dans la liste.';
  list.push({ n: String(name || '').trim().slice(0, 16) || 'Ami ' + fc, d: dayNumber(), c: 0, code: fc });
  store();
  return '';
}

export function forget(key) { list = list.filter((f) => f.code !== key && f.n !== key); store(); }
export function ago(d) {
  const n = dayNumber() - d;
  return n <= 0 ? "aujourd'hui" : n === 1 ? 'hier' : `il y a ${n} j`;
}
