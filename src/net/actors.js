import { Target } from '../combat/target.js';
import { Health } from '../combat/health.js';

export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;

// Santé « miroir » : l'état réel vient du réseau. Les soins/réanimations faits localement sur le miroir
// (habiletés, réanimation) sont transmis au propriétaire réel via onHeal(0 = PV | 1 = bouclier, delta) et onRevive().
export class NetHealth extends Health {
  get hp() { return this._hp; }
  set hp(v) { const d = v - this._hp; this._hp = v; if (d > 0 && !this.ext && this.onHeal) this.onHeal(0, d); }
  get shield() { return this._sh; }
  set shield(v) { const d = v - this._sh; this._sh = v; if (d > 0 && !this.ext && this.onHeal) this.onHeal(1, d); }
  // f : bit 1 = à terre, bit 2 = mort
  setState(hp, sh, f, dhp) {
    this.ext = true;
    this._hp = hp; this._sh = sh; this.downed = (f & 1) !== 0; this.dead = (f & 2) !== 0; this.downedHp = dhp;
    this.ext = false;
  }
  revived() {
    this.ext = true; super.revived(); this.ext = false;
    if (this.onRevive) this.onRevive();
  }
}

const TAU = Math.PI * 2;
const angLerp = (a, b, u) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * u; };

// Joueur humain distant vu par l'hôte. Position/santé = dernier état rapporté par son client ;
// les dégâts qu'il subit sont mis en file puis envoyés à son client (qui applique ses propres boucliers/habiletés).
export class RemotePlayer extends Target {
  constructor(scene, ent, team, x, z, yaw) {
    super(scene, x, z, team, false);
    this.id = ent.id; this.name = ent.name; this.legend = ent.legend;
    this.isHuman = true; this.isRemote = true; this.netOwned = true; this.noRespawn = true;
    this.kills = 0; this.damage = 0; this.gone = false;
    this.yaw = yaw; this.pitch = 0;
    this.spawn = { x, z, yaw };
    this.health = new NetHealth(100, 100);
    this.pending = []; // dégâts à transmettre : [montant, zone, id de l'attaquant (-1 = zone)]
    this.cmds = [];    // ordres (soin, réanimation) à transmettre
    this.health.onHeal = (k, d) => this.cmds.push(['hl', k, r1(d)]);
    this.health.onRevive = () => this.cmds.push(['rv']);
    this.combat = null;
    this.gx = x; this.gz = z;
    this.addTag(this.name);
  }

  sendDamage(amount, zone, attacker) {
    const aid = attacker ? attacker.id : -1;
    for (const p of this.pending) if (p[2] === aid && p[1] === zone) { p[0] += amount; return; }
    this.pending.push([amount, zone, aid]);
  }

  applyState(s) {
    this.x = s.x; this.y = s.y; this.z = s.z; this.yaw = s.w; this.pitch = s.p;
    const h = this.health, wasDown = h.downed;
    h.setState(s.hp, s.sh, (s.dn ? 1 : 0) | (s.dd ? 2 : 0), s.dh);
    if (!wasDown && h.downed && this.combat && this.combat.onDown) this.combat.onDown(this, this.lastAttacker);
  }

  leave() {
    this.gone = true;
    this.health.setState(0, 0, 2, 0);
  }

  tick(dt) {
    const h = this.health;
    this.group.visible = !h.dead;
    const k = Math.min(1, dt * 20);
    this.gx += (this.x - this.gx) * k; this.gz += (this.z - this.gz) * k;
    this.group.position.set(this.gx, this.y, this.gz);
    this.group.rotation.y = this.yaw;
    this.group.scale.y = this.hs;
    if (this.markT > 0) this.markT -= dt;
    this.marker.visible = this.markT > 0 && !h.dead;
  }
}

const DELAY = 0.1; // retard d'interpolation (s)

// Acteur répliqué côté client (bot, autre joueur) : position interpolée entre les derniers snapshots de l'hôte.
// net = { queueHit(id, amount, zone), sendHeal(id, kind, d), sendRevive(id) }
export class ProxyActor extends Target {
  constructor(scene, id, team, name, friendly, human, net) {
    super(scene, 0, 0, team, friendly);
    this.id = id; this.name = name; this.isHuman = human; this.netOwned = true; this.noRespawn = true;
    this.yaw = 0; this.buf = [];
    this.health = new NetHealth(100, 100);
    this.health.onHeal = (k, d) => net.sendHeal(id, k, r1(d));
    this.health.onRevive = () => net.sendRevive(id);
    this.net = net;
    if (human) this.addTag(name);
  }

  sendDamage(amount, zone) { this.net.queueHit(this.id, amount, zone); }

  push(t, x, y, z, yaw) {
    const b = this.buf;
    if (!b.length) { this.x = x; this.y = y; this.z = z; this.yaw = yaw; }
    b.push({ t, x, y, z, yaw });
    if (b.length > 8) b.shift();
  }

  tick(dt) {
    const h = this.health, b = this.buf;
    this.group.visible = !h.dead && b.length > 0;
    if (b.length) {
      const rt = performance.now() / 1000 - DELAY;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > rt) i--;
      const p = b[i], n = b[i + 1];
      if (i === 0 && p.t > rt) { this.x = p.x; this.y = p.y; this.z = p.z; this.yaw = p.yaw; }
      else if (!n) { this.x = p.x; this.y = p.y; this.z = p.z; this.yaw = p.yaw; }
      else {
        const u = Math.max(0, Math.min(1, (rt - p.t) / (n.t - p.t || 1)));
        this.x = p.x + (n.x - p.x) * u; this.y = p.y + (n.y - p.y) * u; this.z = p.z + (n.z - p.z) * u;
        this.yaw = angLerp(p.yaw, n.yaw, u);
      }
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.group.scale.y = this.hs;
    if (this.markT > 0) this.markT -= dt;
    this.marker.visible = this.markT > 0 && !h.dead;
  }
}
