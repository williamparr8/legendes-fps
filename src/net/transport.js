import Peer from 'peerjs';
import extraTurn from './turn.json';
import { relayHost, relayConnect } from './relay.js';

// Transport : un « lien » = { send(obj), close(), onmessage, onclose }. Implémentations :
//  - 'peer'  : WebRTC via PeerJS (liaison directe) PUIS, si elle échoue, relais publics MQTT (relay.js) ; l'hôte écoute sur les deux ;
//  - 'relay' : relais MQTT seuls (URL avec ?relay) ;
//  - 'local' : BroadcastChannel, pour tester plusieurs onglets du même navigateur (URL avec ?local).
const PREFIX = 'legendes-fps-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Serveurs ICE : STUN (découverte d'adresse), relais TURN officiels de PeerJS (par défaut de la bibliothèque ; gratuits, sans garantie :
// mesurés injoignables le 2026-10-08), puis relais personnels de src/net/turn.json (liste de { urls, username, credential }).
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ...extraTurn,
  ],
  iceCandidatePoolSize: 2,
};

const flag = (k) => new URLSearchParams(location.search).has(k);
export const transportKind = () => (flag('local') ? 'local' : flag('relay') ? 'relay' : 'peer');
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function newLink(sendRaw, closeRaw) {
  const l = { onmessage: null, onclose: null, closed: false, send: (o) => { if (!l.closed) sendRaw(o); }, close: () => { if (l.closed) return; l.closed = true; closeRaw(); } };
  l.fire = () => { if (l.closed) return; l.closed = true; if (l.onclose) l.onclose(); };
  return l;
}

// ---------- PeerJS (liaison directe WebRTC) ----------
function wrapConn(conn, onDestroy) {
  const link = newLink((o) => { if (conn.open) conn.send(o); }, () => { try { conn.close(); } catch (e) { /* ignoré */ } if (onDestroy) onDestroy(); });
  conn.on('data', (d) => { if (link.onmessage) link.onmessage(d); });
  conn.on('close', () => link.fire());
  conn.on('error', () => link.fire());
  return link;
}

function peerHost(code, onlink) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { debug: 0, config: ICE });
    let opened = false;
    peer.on('open', () => { opened = true; resolve({ close: () => peer.destroy() }); });
    peer.on('error', (e) => { if (!opened) reject(e); });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('connection', (conn) => conn.on('open', () => onlink(wrapConn(conn))));
  });
}

function peerConnect(code, ms = 25000) {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0, config: ICE });
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { peer.destroy(); } catch (x) { /* ignoré */ } reject(e); };
    const timer = setTimeout(() => fail({ type: 'timeout' }), ms);
    peer.on('error', fail);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
      conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(wrapConn(conn, () => peer.destroy())); });
      conn.on('error', fail);
    });
  });
}

// ---------- BroadcastChannel (tests locaux) ----------
const clone = (o) => JSON.parse(JSON.stringify(o));

function localHost(code, onlink) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel('legendes-local-' + code);
    const links = new Map();
    let taken = false;
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.k === 'probe') { bc.postMessage({ k: 'taken' }); return; }
      if (m.k === 'taken') { taken = true; return; }
      if (m.k === 'hello') {
        const cid = m.from;
        const link = newLink((o) => bc.postMessage({ k: 'd', to: cid, from: 'host', d: clone(o) }), () => { bc.postMessage({ k: 'bye', to: cid }); links.delete(cid); });
        links.set(cid, link);
        bc.postMessage({ k: 'ack', to: cid });
        onlink(link);
      } else if (m.k === 'd' && m.to === 'host') { const l = links.get(m.from); if (l && l.onmessage) l.onmessage(m.d); }
      else if (m.k === 'bye' && m.to === 'host') { const l = links.get(m.from); if (l) { links.delete(m.from); l.fire(); } }
    };
    bc.postMessage({ k: 'probe' });
    setTimeout(() => {
      if (taken) { bc.close(); reject({ type: 'unavailable-id' }); return; }
      resolve({ close: () => { for (const l of links.values()) l.close(); bc.close(); } });
    }, 200);
  });
}

function localConnect(code) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel('legendes-local-' + code);
    const cid = 'c' + Math.random().toString(36).slice(2);
    let link = null;
    const timer = setTimeout(() => { bc.close(); reject({ type: 'peer-unavailable' }); }, 1500);
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.to !== cid) return;
      if (m.k === 'ack') {
        clearTimeout(timer);
        link = newLink((o) => bc.postMessage({ k: 'd', to: 'host', from: cid, d: clone(o) }), () => { bc.postMessage({ k: 'bye', to: 'host', from: cid }); bc.close(); });
        resolve(link);
      } else if (m.k === 'd' && link && link.onmessage) link.onmessage(m.d);
      else if (m.k === 'bye' && link) link.fire();
    };
    bc.postMessage({ k: 'hello', from: cid });
  });
}

// ---------- Hôte / client : liaison directe puis relais ----------
// Hôte : écoute sur les deux voies ; réussit si au moins une est ouverte (réseau d'école : seul le relais répond).
async function dualHost(code, onlink) {
  const late = (p, ms) => new Promise((resolve, reject) => {
    let over = false;
    const t = setTimeout(() => { over = true; reject({ type: 'network' }); }, ms);
    p.then((v) => { if (over) v.close(); else { clearTimeout(t); resolve(v); } }, (e) => { clearTimeout(t); reject(e); });
  });
  const jobs = [relayHost(code, onlink, newLink)];
  if (transportKind() === 'peer') jobs.push(late(peerHost(code, onlink), 8000));
  const res = await Promise.allSettled(jobs);
  const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value), bad = res.filter((r) => r.status === 'rejected').map((r) => r.reason);
  const used = bad.find((e) => e && e.type === 'unavailable-id');
  if (used || !ok.length) { ok.forEach((o) => o.close()); throw used || bad[0]; }
  return { close: () => ok.forEach((o) => o.close()) };
}

// Client : liaison directe d'abord (6 s), puis relais publics (12 s).
async function dualConnect(code) {
  let first = null;
  if (transportKind() === 'peer') {
    try { return await peerConnect(code, 6000); } catch (e) { first = e; }
  }
  try { return await relayConnect(code, 12000, newLink); } catch (e) {
    throw first && first.type === 'timeout' ? first : e;
  }
}

export const hostListen = (code, onlink) => (transportKind() === 'local' ? localHost(code, onlink) : dualHost(code, onlink));
export const connectTo = (code) => (transportKind() === 'local' ? localConnect(code) : dualConnect(code));

export function errorText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'Salon introuvable : vérifiez le code.';
  if (t === 'timeout') return 'Connexion impossible : ni la liaison directe ni les relais publics n’ont répondu. Réseau très restrictif ? Essayez un autre réseau ou le partage de connexion du téléphone.';
  if (t === 'unavailable-id') return 'Ce code est déjà utilisé, réessayez.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Serveur de mise en relation injoignable. Vérifiez votre connexion Internet.';
  return 'Erreur de connexion' + (t ? ' (' + t + ')' : '') + '.';
}
