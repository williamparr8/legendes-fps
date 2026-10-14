import items from './items.json';
import { buildItemModel, makeBeacons, setBeacon } from './itemModels.js';
import { sfx } from '../core/audio.js';

const GEAR = { armor: 1, helmet: 1, pack: 1 };
const AUTO_R2 = 1.7 * 1.7; // ramassage automatique des munitions et des soins en passant dessus (rayon 1,7 m)

const N = 700;

// Objets au sol (pool de 400 emplacements). Chaque emplacement crée à la demande un modèle par type d'objet (puis le réutilise).
// Ramassage avec E (même étage : écart de hauteur < 2,4 m) ; les armes remplacent l'arme tenue (l'ancienne tombe au sol).
// Munitions et soins : ramassés automatiquement en passant dessus tant qu'il reste de la place dans le sac.
export class LootField {
  constructor(scene, rand = Math.random, groundY = () => 0) {
    this.scene = scene; this.rand = rand; this.groundY = groundY;
    this.list = [];
    for (let i = 0; i < N; i++) this.list.push({ on: false, m: null, cache: {}, it: null, x: 0, y: 0, z: 0, amount: 0, i, ti: -1 });
    this.beacons = makeBeacons(N); scene.add(this.beacons);
    this.near = null;
    this.t = 0;
    this.dirty = new Set(); // emplacements modifiés depuis le dernier envoi réseau (hôte)
    this.net = null;        // client : { pick(i), pickDone(i,on,amount), dropLoot(ti,x,z,amount,y) }
    this.pendT = 0;
  }

  // Active un emplacement avec le modèle de l'objet `ti`.
  place(l, ti, x, y, z, amount) {
    const it = items.table[ti];
    if (l.m) l.m.visible = false;
    l.m = l.cache[ti] || (l.cache[ti] = (() => { const g = buildItemModel(it); this.scene.add(g); return g; })());
    l.on = true; l.it = it; l.ti = ti; l.x = x; l.y = y; l.z = z; l.amount = amount;
    l.m.position.set(x, y + 0.3, z); l.m.visible = true;
    setBeacon(this.beacons, l.i, true, x, y + 0.3, z, it.color);
  }

  hide(l) { l.on = false; if (l.m) l.m.visible = false; setBeacon(this.beacons, l.i, false); }

  // Applique une liste [i, on, ti, x, z, amount, y] reçue de l'hôte.
  applyNet(entries) {
    for (const [i, on, ti, x, z, amount, y] of entries) {
      const l = this.list[i];
      if (!l) continue;
      if (!on) this.hide(l); else this.place(l, ti, x, y, z, amount);
    }
  }

  markAll() { for (const l of this.list) if (l.on) this.dirty.add(l.i); }

  // Tirage pondéré ; `weapons` = liste d'armes autorisées.
  roll(weapons) {
    const t = items.table.filter((e) => e.kind !== 'weapon' || !weapons || weapons.includes(e.key));
    let r = this.rand() * t.reduce((s, e) => s + e.w, 0);
    for (const e of t) { if ((r -= e.w) < 0) return e; }
    return t[0];
  }

  spawn(it, x, z, amount = it.amount, y = this.groundY(x, z)) {
    const ti = items.table.indexOf(it);
    if (this.net) { this.net.dropLoot(ti, x, z, amount, y); return null; }
    for (const l of this.list) {
      if (l.on) continue;
      this.place(l, ti, x, y, z, amount);
      this.dirty.add(l.i);
      return l;
    }
    return null;
  }

  spawnWeapon(key, x, z, y) { return this.spawn(items.table.find((e) => e.kind === 'weapon' && e.key === key), x, z, undefined, y); }

  // Butin lâché par un joueur/bot éliminé.
  drop(x, z, count, weapons, y) {
    for (let i = 0; i < count; i++) {
      const px = x + (this.rand() - 0.5) * 1.8, pz = z + (this.rand() - 0.5) * 1.8;
      this.spawn(this.roll(weapons), px, pz, undefined, y === undefined ? undefined : Math.max(y, this.groundY(px, pz)));
    }
  }

  tick(dt, player, inv, weapons, input) {
    this.t += dt;
    if (this.pendT > 0) this.pendT -= dt;
    let best = null, bd = 2.4 * 2.4, auto = null;
    const alive = player.health.alive;
    for (const l of this.list) {
      if (!l.on) continue;
      l.m.rotation.y += dt * 1.5;
      l.m.position.y = l.y + 0.3 + Math.sin(this.t * 2 + l.x) * 0.05;
      const dx = l.x - player.x, dz = l.z - player.z, d = dx * dx + dz * dz;
      l.m.userData.body.visible = d < 4900; // le modèle n'est dessiné que dans un rayon de 70 m (la balise reste visible de loin)
      if (d < bd && Math.abs(l.y - player.y) < 2.4) { bd = d; best = l; }
      if (!auto && alive && d < AUTO_R2 && (l.it.kind === 'ammo' || l.it.kind === 'heal') && Math.abs(l.y - player.y) < 2.4 && inv.room(l.it.kind, l.it.key) > 0) auto = l;
    }
    if (auto && this.pendT <= 0) { this.tryPickup(auto, player, inv, weapons); if (!auto.on && best === auto) best = null; }
    this.near = player.health.alive ? best : null;
    player.lootNear = !!this.near;
    if (!this.near) return;
    // pas d'invite pour ce qui est ramassé automatiquement
    if (!player.prompt && this.near !== auto) {
      const it = this.near.it;
      if (GEAR[it.kind]) player.prompt = it.rar <= inv.gear[it.kind] ? it.name + ' — tu as déjà mieux ou équivalent' : 'E — Équiper : ' + it.name + ' (' + gearEffect(it.kind, it.rar) + ')';
      else if (it.kind === 'weapon') player.prompt = 'E — Ramasser : ' + it.name;
      else player.prompt = 'E — Ramasser : ' + it.name + ' x' + this.near.amount;
    }
    if (input.pressed.KeyE) this.tryPickup(this.near, player, inv, weapons);
  }

  // Client : demande à l'hôte (qui peut refuser si quelqu'un a pris l'objet avant) ; hôte/solo : direct.
  tryPickup(l, player, inv, weapons) {
    if (!this.net) { this.pickup(l, player, inv, weapons); return; }
    if (this.pendT > 0) return;
    this.pendT = 1;
    this.net.pick(l.i);
  }

  // Client : l'hôte a accepté → on applique localement puis on rapporte le résultat.
  grant(i, player, inv, weapons) {
    this.pendT = 0;
    const l = this.list[i];
    if (!l || !l.on) return;
    this.pickup(l, player, inv, weapons);
    this.net.pickDone(i, l.on, l.amount);
  }

  entry(kind, key, rar) { return items.table.find((e) => e.kind === kind && e.key === key && (e.rar | 0) === (rar | 0)); }

  pickup(l, player, inv, weapons) {
    const it = l.it, rar = it.rar | 0;
    if (it.kind === 'weapon') {
      const key = it.key, W = weapons;
      if (W.slots.includes(key)) {
        if (rar > (W.rar[key] | 0)) { // version plus rare de l'arme tenue : échange sur place, l'ancienne tombe au sol
          const old = W.rar[key] | 0;
          W.setRarity(key, rar);
          this.spawn(this.entry('weapon', key, old), player.x, player.z, undefined, player.y);
        } else {
          const n = inv.add('ammo', W.defs[key].ammo, W.defs[key].mag);
          if (n === 0) return;
        }
      } else {
        const dropped = W.give(key, rar);
        inv.add('ammo', W.defs[key].ammo, W.defs[key].mag * 2);
        if (dropped) this.spawn(this.entry('weapon', dropped, W.rar[dropped] | 0), player.x, player.z, undefined, player.y);
      }
      sfx.pickup();
      this.hide(l); this.dirty.add(l.i);
      return;
    }
    if (GEAR[it.kind]) { // armure / casque / sac : seulement si meilleur que l'actuel (l'ancien tombe au sol)
      const cur = inv.gear[it.kind];
      if (rar <= cur) return;
      if (cur > 0) this.spawn(this.entry(it.kind, it.key, cur), player.x, player.z, undefined, player.y);
      inv.setGear(it.kind, rar, player);
      sfx.pickup();
      this.hide(l); this.dirty.add(l.i);
      return;
    }
    const n = inv.add(it.kind, it.key, l.amount);
    if (n === 0) return;
    sfx.pickup();
    l.amount -= n; this.dirty.add(l.i);
    if (l.amount <= 0) this.hide(l);
  }
}

// Texte d'effet d'une pièce d'équipement.
export function gearEffect(kind, tier) {
  const g = items.gear;
  if (kind === 'armor') return '+' + g.armor[tier] + ' bouclier max';
  if (kind === 'helmet') return '-' + Math.round(g.helmet[tier] * 100) + ' % dégâts à la tête';
  return '+' + Math.round((g.pack[tier] - 1) * 100) + ' % de capacité';
}
