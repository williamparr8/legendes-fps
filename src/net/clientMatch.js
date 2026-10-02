import { Zone } from '../match/zone.js';
import { ProxyActor } from './actors.js';

// Vue « client » d'une partie : mêmes champs que Match pour le HUD, alimentés par les snapshots de l'hôte.
export class ClientMatch {
  constructor(scene, world, combat, msg, net) {
    this.cfg = msg.cfg;
    this.zone = new Zone(scene, Math.random, !!msg.cfg.zone, world.half);
    this.stats = { kills: 0, damage: 0 };
    this.feed = [];
    this.aliveSquads = 0; this.playersAlive = 0; this.t = 0;
    this.proxies = new Map();
    this.playerSquad = { members: [combat.pp] };
    for (const a of msg.actors) {
      const mine = a.team === msg.you.team;
      const p = new ProxyActor(scene, a.id, a.team, a.name, mine, !!a.human, net);
      combat.add(p);
      this.proxies.set(a.id, p);
      if (mine) this.playerSquad.members.push(p);
    }
  }

  addFeed(text) { this.feed.push({ text, t: 7 }); if (this.feed.length > 6) this.feed.shift(); }

  applyZone(z) {
    const zn = this.zone;
    zn.cx = z[0]; zn.cz = z[1]; zn.r = z[2]; zn.nx = z[3]; zn.nz = z[4]; zn.nr = z[5]; zn.t = z[6]; zn.shrinking = !!z[7]; zn.phase = z[8];
  }

  tick(dt) {
    this.t += dt;
    for (const f of this.feed) f.t -= dt;
    while (this.feed.length && this.feed[0].t <= 0) this.feed.shift();
    const zn = this.zone;
    if (zn.enabled && zn.t < 1e8) zn.t -= dt;
    zn.sync();
  }
}
