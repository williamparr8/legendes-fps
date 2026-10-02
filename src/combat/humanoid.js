import * as THREE from 'three';

// Silhouette humanoïde procédurale low-poly (face = -Z, origine aux pieds, ~1,82 m).
// Géométries et matériaux partagés ; seuls les groupes d'articulations sont propres à chaque acteur.
// Hitboxes (target.js zoneRay) : tête sphère r 0,2 à y 1,62 ; torse y 0,8–1,45 ; jambes y 0–0,8.
const G = {
  leg: new THREE.BoxGeometry(0.2, 0.74, 0.22),
  boot: new THREE.BoxGeometry(0.22, 0.1, 0.32),
  torso: new THREE.BoxGeometry(0.46, 0.65, 0.3),
  stripe: new THREE.BoxGeometry(0.1, 0.5, 0.02),
  arm: new THREE.BoxGeometry(0.12, 0.5, 0.12),
  hand: new THREE.BoxGeometry(0.1, 0.1, 0.1),
  head: new THREE.SphereGeometry(0.17, 10, 8),
  helmet: new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  visor: new THREE.BoxGeometry(0.22, 0.05, 0.05),
  pack: new THREE.BoxGeometry(0.34, 0.42, 0.14),
  gun: new THREE.BoxGeometry(0.07, 0.12, 0.62),
};
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const M = {
  friend: lam(0x4080e0), enemy: lam(0xd04040), skin: lam(0xe0bc98), pants: lam(0x2a2e36),
  dark: lam(0x1c1f25), gun: lam(0x303338),
};
const accents = new Map();
const accentMat = hex => {
  let m = accents.get(hex);
  if (!m) accents.set(hex, m = new THREE.MeshBasicMaterial({ color: hex }));
  return m;
};
const NEUTRAL = 0xffffff;

export class Rig {
  constructor(group, friendly) {
    const mesh = (g, m, x, y, z, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
    const team = friendly ? M.friend : M.enemy;
    this.team = [];
    // jambes : pivot à la hanche
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.legL.position.set(-0.12, 0.84, 0); this.legR.position.set(0.12, 0.84, 0);
    group.add(this.legL, this.legR);
    for (const l of [this.legL, this.legR]) { mesh(G.leg, M.pants, 0, -0.37, 0, l); mesh(G.boot, M.dark, 0, -0.79, -0.05, l); }
    // buste
    this.torso = new THREE.Group(); this.torso.position.y = 1.125; group.add(this.torso);
    this.team.push(mesh(G.torso, team, 0, 0, 0, this.torso));
    this.stripe = mesh(G.stripe, accentMat(NEUTRAL), 0, 0, -0.16, this.torso);
    mesh(G.pack, M.dark, 0, 0.02, 0.2, this.torso);
    // tête
    mesh(G.head, M.skin, 0, 1.62, 0);
    this.team.push(mesh(G.helmet, team, 0, 1.64, 0));
    this.visor = mesh(G.visor, accentMat(NEUTRAL), 0, 1.63, -0.15);
    // bras tendus vers l'avant (arme à deux mains) : pivot à l'épaule
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.armL.position.set(-0.3, 1.4, 0); this.armR.position.set(0.3, 1.4, 0);
    this.armL.rotation.set(1.25, 0, -0.18); this.armR.rotation.set(1.35, 0, 0.1);
    group.add(this.armL, this.armR);
    for (const a of [this.armL, this.armR]) { this.team.push(mesh(G.arm, team, 0, -0.25, 0, a)); mesh(G.hand, M.skin, 0, -0.52, 0, a); }
    // arme tenue devant le buste
    this.weapon = mesh(G.gun, M.gun, 0.1, 1.2, -0.42);
    this.phase = 0; this.speed = 0; this.lx = 0; this.lz = 0; this.init = false;
  }

  setFriendly(f) { const m = f ? M.friend : M.enemy; for (const o of this.team) o.material = m; }

  // Couleur d'accent (légende) : visière + bande de poitrine.
  setAccent(hex) {
    const m = accentMat(typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex);
    this.visor.material = m; this.stripe.material = m;
  }

  // Marche/course déduite du déplacement réel (valable pour bots, joueurs distants et proxys).
  animate(dt, x, z) {
    if (!this.init) { this.init = true; this.lx = x; this.lz = z; }
    let sp = dt > 0 ? Math.hypot(x - this.lx, z - this.lz) / dt : 0;
    this.lx = x; this.lz = z;
    if (sp > 14) sp = 0; // téléportation / réapparition
    this.speed += (sp - this.speed) * Math.min(1, dt * 10);
    const s = this.speed;
    this.phase += dt * (3 + s * 1.1);
    const amp = Math.min(0.85, s * 0.16), sw = Math.sin(this.phase) * amp;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    const bob = Math.abs(Math.sin(this.phase)) * Math.min(0.05, s * 0.01);
    this.torso.position.y = 1.125 + bob;
    this.armL.rotation.x = 1.25 + Math.sin(this.phase * 2) * amp * 0.08;
    this.armR.rotation.x = 1.35 + Math.sin(this.phase * 2 + 1) * amp * 0.08;
  }
}
