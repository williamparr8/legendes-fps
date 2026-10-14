import * as THREE from 'three';
import { sfx } from '../core/audio.js';

// Marqueurs : clic molette = pose un point là où l'on vise (lieu, ennemi repéré, objet), V = danger ; viser le marqueur d'un
// coéquipier et cliquer = lui répondre (✔). Visible à travers les décors par soi-même et par son équipe (événements réseau 5 et 6,
// voir net/session.js) ; les bots de l'escouade s'y rendent. Un seul marqueur par joueur ; il disparaît après LIFE secondes.
// Types : 0 lieu · 1 ennemi · 2 danger · 3 objet.
const LIFE = 9, MAX = 8, W = 128, H = 200;
export const PING_COL = ['#ffd040', '#ff4a40', '#ff8a00', '#7dff7d'];
const ICON = ['', '', '!', ''];

function draw(cv, p, dist) {
  const g = cv.getContext('2d'), color = PING_COL[p.type] || PING_COL[0];
  g.clearRect(0, 0, W, H);
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = color;
  g.beginPath(); g.moveTo(W / 2, 8); g.lineTo(W - 16, 44); g.lineTo(W / 2, 80); g.lineTo(16, 44); g.closePath();
  g.stroke(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.7)';
  if (ICON[p.type]) { g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ICON[p.type], W / 2, 46); }
  else { g.beginPath(); g.arc(W / 2, 44, 7, 0, 7); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.85)';
  const line = (t, y, size, col = '#fff') => { g.font = `bold ${size}px sans-serif`; g.strokeText(t, W / 2, y); g.fillStyle = col; g.fillText(t, W / 2, y); };
  if (p.label) line(p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label, 104, 20, color);
  line(Math.round(dist) + ' m', p.label ? 130 : 112, 28);
  if (p.who) line(p.who.slice(0, 12), 156, 18, '#9be8ff');
  if (p.ack) line('✔', 182, 30, '#7dff7d');
  g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, p.ack ? 192 : 168); g.lineTo(W / 2, H - 2); g.stroke();
}

export class Pings {
  constructor(scene) {
    this.items = [];
    for (let i = 0; i < MAX; i++) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
      sp.center.set(0.5, 0); sp.renderOrder = 20; sp.visible = false; sp.frustumCulled = false;
      scene.add(sp);
      this.items.push({ sp, cv, tex, life: 0, type: 0, d: -1, x: 0, y: 0, z: 0, owner: -9, label: '', who: '', ack: false });
    }
    this.cd = 0;
  }

  // Retire le marqueur d'un joueur ; renvoie true s'il existait.
  remove(owner) {
    let had = false;
    for (const p of this.items) if (p.owner === owner && p.life > 0) { p.life = 0; p.sp.visible = false; had = true; }
    return had;
  }

  // Un seul marqueur par joueur (owner : identifiant du joueur) : le nouveau remplace l'ancien.
  // toggle : viser (à moins de 3 m) le marqueur qu'on vient de poser le retire (renvoie 'removed').
  add(x, y, z, type = 0, owner = 0, toggle = false, label = '', who = '') {
    let it = null;
    for (const p of this.items) if (p.owner === owner && p.life > 0) { it = p; break; }
    if (it && toggle && Math.hypot(it.x - x, it.y - y, it.z - z) < 3) { it.life = 0; it.sp.visible = false; return 'removed'; }
    if (!it) for (const p of this.items) if (p.life <= 0) { it = p; break; }
    if (!it) { it = this.items[0]; for (const p of this.items) if (p.life < it.life) it = p; } // plus aucun emplacement libre : le plus ancien
    it.owner = owner; it.life = LIFE; it.type = type; it.d = -1; it.x = x; it.y = y; it.z = z; it.label = label; it.who = who; it.ack = false;
    it.sp.position.set(x, y + 0.15, z); it.sp.visible = true; it.sp.material.opacity = 1;
    sfx.ping();
    return 'added';
  }

  // Marque le marqueur d'un joueur comme « vu / j'y vais ».
  ack(owner) {
    for (const p of this.items) if (p.owner === owner && p.life > 0 && !p.ack) { p.ack = true; p.d = -1; sfx.ping(); return true; }
    return false;
  }

  // Marqueur d'un AUTRE joueur sur lequel on pointe le regard (≈ 7°) : sert à répondre.
  aimedAt(p, me) {
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = Math.sin(p.pitch), cp = Math.cos(p.pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp, ox = p.x, oy = p.y + p.eye, oz = p.z;
    let best = null, bd = Math.cos(0.12);
    for (const it of this.items) {
      if (it.life <= 0 || it.owner === me || it.ack) continue;
      const vx = it.x - ox, vy = it.y + 0.6 - oy, vz = it.z - oz, l = Math.hypot(vx, vy, vz) || 1;
      const c = (vx * fx + vy * fy + vz * fz) / l;
      if (c > bd) { bd = c; best = it; }
    }
    return best;
  }

  tick(dt, px, py, pz) {
    if (this.cd > 0) this.cd -= dt;
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.sp.visible = false; continue; }
      const d = Math.hypot(it.x - px, it.y - py, it.z - pz), di = Math.round(d);
      if (di !== it.d) { it.d = di; draw(it.cv, it, d); it.tex.needsUpdate = true; }
      const s = Math.min(14, Math.max(0.5, d * 0.1));
      it.sp.scale.set(s * (W / H), s, 1);
      it.sp.material.opacity = Math.min(1, it.life / 1.2);
    }
  }
}
