import Peer from 'peerjs';
import extraTurn from './turn.json';

// Transport : un « lien » = { send(obj), close(), onmessage, onclose }. Deux implémentations :
//  - 'peer'  : WebRTC via PeerJS (courtier de signalisation public, pas de serveur de jeu) ;
//  - 'local' : BroadcastChannel, pour tester plusieurs onglets du même navigateur (URL avec ?local).
const PREFIX = 'legendes-fps-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Serveurs ICE : STUN (découverte d'adresse), relais TURN officiels de PeerJS (par défaut de la bibliothèque ; gratuits, sans garantie —
// mesurés injoignables le 2026-10-08), puis relais personnels de src/net/turn.json (liste de { urls, username, credential }).
// Sans relais joignable, deux joueurs dont l'un a un NAT strict (Wi-Fi d'école, 4G/5G…) ne peuvent pas se connecter : voir PROGRESS.md.
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ...extraTurn,
  ],
  iceCandidatePoolSize: 2,
};

// Sonde réseau (une fois par page, en arrière-plan) : ce navigateur obtient-il une adresse publique (STUN) et un relais (TURN) ?
// Sert uniquement à expliquer l'échec d'une connexion.
const probeState = { stun: null, relay: null, started: false };
function probeNetwork() {
  if (probeState.started || typeof RTCPeerConnection === 'undefined') return;
  probeState.started = true;
  try {
    const pc = new RTCPeerConnection({ iceServers: ICE.iceServers });
    probeState.stun = false; probeState.relay = false;
    pc.onicecandidate = (e) => {
      const t = e.candidate && / typ (\w+)/.exec(e.candidate.candidate);
      if (t && t[1] === 'srflx') probeState.stun = true;
      if (t && t[1] === 'relay') probeState.relay = true;
    };
    pc.createDataChannel('probe');
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {});
    setTimeout(() => pc.close(), 8000);
  } catch (e) { /* ignoré */ }
}

export const transportKind = () => (new URLSearchParams(location.search).has('local') ? 'local' : 'peer');
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function newLink(sendRaw, closeRaw) {
  const l = { onmessage: null, onclose: null, closed: false, send: (o) => { if (!l.closed) sendRaw(o); }, close: () => { if (l.closed) return; l.closed = true; closeRaw(); } };
  l.fire = () => { if (l.closed) return; l.closed = true; if (l.onclose) l.onclose(); };
  return l;
}

// ---------- PeerJS ----------
function wrapConn(conn, onDestroy) {
  const link = newLink((o) => { if (conn.open) conn.send(o); }, () => { try { conn.close(); } catch (e) { /* ignoré */ } if (onDestroy) onDestroy(); });
  conn.on('data', (d) => { if (link.onmessage) link.onmessage(d); });
  conn.on('close', () => link.fire());
  conn.on('error', () => link.fire());
  return link;
}

function peerHost(code, onlink) {
  probeNetwork();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { debug: 0, config: ICE });
    let opened = false;
    peer.on('open', () => { opened = true; resolve({ close: () => peer.destroy() }); });
    peer.on('error', (e) => { if (!opened) reject(e); });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('connection', (conn) => conn.on('open', () => onlink(wrapConn(conn))));
  });
}

function peerConnect(code) {
  probeNetwork();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0, config: ICE });
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { peer.destroy(); } catch (x) { /* ignoré */ } reject(e); };
    const timer = setTimeout(() => fail({ type: 'timeout' }), 25000);
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

export const hostListen = (code, onlink) => (transportKind() === 'local' ? localHost : peerHost)(code, onlink);
export const connectTo = (code) => (transportKind() === 'local' ? localConnect : peerConnect)(code);

export function errorText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'Salon introuvable : vérifiez le code.';
  if (t === 'timeout') {
    if (probeState.stun === false) return 'Connexion impossible : ce réseau bloque les connexions directes entre joueurs (UDP/WebRTC). Essayez un autre réseau ou le partage de connexion du téléphone.';
    if (!probeState.relay) return 'Connexion impossible : le réseau de l’un des joueurs (NAT strict : Wi-Fi d’école, 4G/5G…) refuse la connexion directe et aucun serveur relais n’est disponible. Essayez le partage de connexion du téléphone pour l’un des deux.';
    return 'Connexion impossible (délai dépassé), même via le relais. Réessayez ou changez de réseau.';
  }
  if (t === 'unavailable-id') return 'Ce code est déjà utilisé, réessayez.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Serveur de mise en relation injoignable. Vérifiez votre connexion Internet.';
  return 'Erreur de connexion' + (t ? ' (' + t + ')' : '') + '.';
}
