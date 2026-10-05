import * as THREE from 'three';

// Largage : vaisseau qui traverse la carte (trajectoire tirée de la graine, identique pour tous), saut libre, chute libre
// dirigeable, parachute (une seule ouverture ; une légende avec pv.chute > 0 peut le rouvrir en l'air).
// Phases d'un acteur : 0 au sol · 1 vaisseau · 2 chute libre · 3 parachute (stance réseau = phase + 3).
export const SHIP_ALT = 250, SHIP_SPEED = 11, CHUTE_ALT = 90, ZONE_DELAY = 40;
const frac = (v) => v - Math.floor(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Ship {
  constructor(scene, seed, half) {
    const r = (k) => frac(Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453);
    const a = r(1) * Math.PI * 2, off = (r(2) - 0.5) * half * 0.6, R = half + 60;
    this.dx = Math.cos(a); this.dz = Math.sin(a);
    this.sx = -this.dx * R - this.dz * off; this.sz = -this.dz * R + this.dx * off;
    this.T = (2 * R) / SHIP_SPEED;                  // fin du vol
    this.jumpT = (R - half) / SHIP_SPEED;           // saut permis dès que la carte est survolée
    this.ejectT = (R + half * 0.95) / SHIP_SPEED;   // éjection forcée des derniers passagers
    this.x = this.sx; this.z = this.sz;
    this.fog = scene.fog;
    this.mesh = buildShip();
    this.mesh.rotation.y = Math.atan2(-this.dx, -this.dz);
    scene.add(this.mesh);
    this.at(0);
  }

  at(t) {
    const d = Math.min(t, this.T) * SHIP_SPEED;
    this.x = this.sx + this.dx * d; this.z = this.sz + this.dz * d;
    this.mesh.position.set(this.x, SHIP_ALT, this.z);
    this.mesh.visible = t < this.T;
    if (this.fog) { const u = clamp((t - this.T) / 8, 0, 1); this.fog.near = 200 - 110 * u; this.fog.far = 700 - 360 * u; } // vue dégagée depuis le vaisseau
  }
}

function buildShip() {
  const g = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const hull = lam(0x6b7480), dark = lam(0x2b3038), glow = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.BoxGeometry(8, 3, 28), hull, 0, 0, 0);
  add(new THREE.BoxGeometry(5, 2, 8), dark, 0, 0.8, -11);
  add(new THREE.BoxGeometry(26, 0.6, 9), hull, 0, -0.6, 6);
  add(new THREE.BoxGeometry(1, 5, 4), dark, 0, 3, 11);
  add(new THREE.BoxGeometry(2.4, 2, 1), glow, -3, 0, 14.4);
  add(new THREE.BoxGeometry(2.4, 2, 1), glow, 3, 0, 14.4);
  return g;
}

const P_WAIT = 'Le vaisseau approche de la carte…';
const P_LEAD = 'ESPACE — Sauter (ton escouade te suit)';
const P_FOLLOW = 'Tu suis ton chef · ESPACE — sauter seul · X — te détacher';
const P_FREE = 'ESPACE — Sauter';

// Joueur : phases 1 à 3. Le sol redonne la main au Player normal. p.drop = { ship, t, leader } (leader = chef d'escouade, null si c'est nous).
export function tickPlayerDrop(p, dt) {
  const D = p.drop, ship = D.ship, pr = p.inp.pressed, k = p.inp.k, lead = D.leader;
  if (pr.KeyX) p.attached = false;
  if (p.phase === 1) {
    p.x = ship.x; p.z = ship.z; p.y = SHIP_ALT - 6; p.vx = p.vy = p.vz = 0; p.grounded = false; p.state = 'vaisseau';
    const over = D.t >= ship.jumpT, ledJump = !!lead && lead.stance >= 5;
    if (over && (pr.Space || D.t >= ship.ejectT || (p.attached && ledJump))) {
      if (pr.Space && lead && !ledJump) p.attached = false; // sauter avant le chef = quitter l'escouade
      p.phase = 2; p.dropT = 0; p.vx = ship.dx * SHIP_SPEED; p.vz = ship.dz * SHIP_SPEED; p.vy = -2; p.altC = -1;
    } else p.prompt = !over ? P_WAIT : !lead ? P_LEAD : p.attached ? P_FOLLOW : P_FREE;
    p.updateEye(dt);
    return;
  }
  // chute libre / parachute
  p.dropT += dt;
  const gy = p.w.groundY(p.x, p.z), alt = p.y - gy;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  if (p.attached && lead && lead.stance < 4) p.attached = false; // le chef a atterri
  let dx, dz, m = 1;
  if (p.attached && lead) {
    dx = lead.x - p.x; dz = lead.z - p.z;
    const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; if (d < 3) m = 0.2;
  } else {
    const fw = (k.KeyW || k.KeyZ ? 1 : 0) - (k.KeyS ? 1 : 0), st = (k.KeyD ? 1 : 0) - (k.KeyA || k.KeyQ ? 1 : 0);
    dx = -sy * fw + cy * st; dz = -cy * fw - sy * st;
    const l = Math.hypot(dx, dz);
    if (l > 0) { dx /= l; dz /= l; } else { dx = -sy; dz = -cy; m = 0.35; } // sans entrée : on dérive dans le sens du regard
  }
  const fall = p.phase === 2, f = fall ? clamp(-p.pitch / 1.1, 0, 1) : 0; // regarder vers le bas = plonger
  const H = (fall ? 30 - 20 * f : 13) * m, V = fall ? -(28 + 27 * f) : -9, a = Math.min(1, dt * 2.5);
  p.vx += (dx * H - p.vx) * a; p.vz += (dz * H - p.vz) * a; p.vy += (V - p.vy) * Math.min(1, dt * 4);
  p.grounded = false;
  p.moveH(p.vx * dt, p.vz * dt);
  p.moveV(dt, false);
  if (fall && (alt < CHUTE_ALT || (pr.Space && p.dropT > 0.5) || (p.attached && lead && lead.stance === 6))) p.phase = 3;
  if (p.grounded) { p.phase = 0; p.attached = false; p.vx = p.vz = 0; p.sfx.land(20); return; }
  p.state = fall ? 'chute libre' : 'parachute';
  const a10 = (alt / 10) | 0;
  if (a10 !== p.altC || p.phC !== p.phase) {
    p.altC = a10; p.phC = p.phase;
    p.dropMsg = (fall ? 'Altitude ' + a10 * 10 + ' m · ESPACE — parachute (auto à ' + CHUTE_ALT + ' m)' : 'Parachute ouvert · ' + a10 * 10 + ' m') + (p.attached ? ' · X — te détacher' : '');
  }
  p.prompt = p.dropMsg;
  p.updateEye(dt);
}
