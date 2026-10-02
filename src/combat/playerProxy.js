import { zoneRay } from './target.js';

// Vue « cible » du joueur : permet aux bots et explosions de le traiter comme n'importe quel acteur.
export class PlayerProxy {
  constructor(p) { this.p = p; this.isPlayer = true; this.isHuman = true; this.id = 0; this.kills = 0; this.damage = 0; this.zone = -1; this.markT = 0; this.name = 'Vous'; this.reviveT = 0; this.lastAttacker = null; }
  get x() { return this.p.x; }
  get y() { return this.p.y; }
  get z() { return this.p.z; }
  get team() { return this.p.team; }
  get health() { return this.p.health; }
  get takenMul() { return this.p.takenMul; }
  get hs() { return this.p.h / 1.8; }
  get eye() { return this.p.eye; }
  ray(ox, oy, oz, dx, dy, dz, maxT) { return zoneRay(this, ox, oy, oz, dx, dy, dz, maxT); }
}
