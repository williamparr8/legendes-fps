import items from './items.json';
import { buildItemModel } from './itemModels.js';

const N = 400;

// Objets au sol (pool de 400 emplacements). Chaque emplacement crée à la demande un modèle par type d'objet (puis le réutilise).
// Ramassage avec E (même étage : écart de hauteur < 2,4 m) ; les armes remplacent l'arme tenue (l'ancienne tombe au sol).
export class LootField {
  constructor(scene, rand = Math.random, groundY = () => 0) {
    this.scene = scene; this.rand = rand; this.groundY = groundY;
    this.list = [];
    for (let i = 0; i < N; i++) this.list.push({ on: false, m: null, cache: {}, it: null, x: 0, y: 0, z: 0, amount: 0, i, ti: -1 });
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
  }

  hide(l) { l.on = false; if (l.m) l.m.visible = false; }

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
    let best = null, bd = 2.4 * 2.4;
    for (const l of this.list) {
      if (!l.on) continue;
      l.m.rotation.y += dt * 1.5;
      l.m.position.y = l.y + 0.3 + Math.sin(this.t * 2 + l.x) * 0.05;
      const dx = l.x - player.x, dz = l.z - player.z, d = dx * dx + dz * dz;
      if (d < bd && Math.abs(l.y - player.y) < 2.4) { bd = d; best = l; }
    }
    this.near = player.health.alive ? best : null;
    player.lootNear = !!this.near;
    if (!this.near) return;
    if (!player.prompt) player.prompt = 'E — Ramasser : ' + this.near.it.name + (this.near.it.kind === 'weapon' ? '' : ' x' + this.near.amount);
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

  pickup(l, player, inv, weapons) {
    const it = l.it;
    if (it.kind === 'weapon') {
      if (weapons.slots.includes(it.key)) {
        const n = inv.add('ammo', weapons.defs[it.key].ammo, weapons.defs[it.key].mag);
        if (n === 0) return;
      } else {
        const dropped = weapons.give(it.key);
        inv.add('ammo', weapons.defs[it.key].ammo, weapons.defs[it.key].mag * 2);
        if (dropped) this.spawn(items.table.find((e) => e.kind === 'weapon' && e.key === dropped), player.x, player.z, undefined, player.y);
      }
      this.hide(l); this.dirty.add(l.i);
      return;
    }
    const n = inv.add(it.kind, it.key, l.amount);
    if (n === 0) return;
    l.amount -= n; this.dirty.add(l.i);
    if (l.amount <= 0) this.hide(l);
  }
}
