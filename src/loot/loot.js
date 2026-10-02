import * as THREE from 'three';
import items from './items.json';

const N = 260;
const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const mats = {};
const mat = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 }));

// Objets au sol (pool). Ramassage avec E ; les armes remplacent l'arme tenue (l'ancienne tombe au sol).
export class LootField {
  constructor(scene, rand = Math.random) {
    this.rand = rand;
    this.list = [];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, mats[0] || mat('#ffffff'));
      m.visible = false;
      scene.add(m);
      this.list.push({ on: false, m, it: null, x: 0, z: 0, amount: 0, i, ti: -1 });
    }
    this.near = null;
    this.t = 0;
    this.dirty = new Set(); // emplacements modifiés depuis le dernier envoi réseau (hôte)
    this.net = null;        // client : { pick(i), pickDone(i,on,amount), dropLoot(ti,x,z,amount) }
    this.pendT = 0;
  }

  // Applique une liste [i, on, ti, x, z, amount] reçue de l'hôte.
  applyNet(entries) {
    for (const [i, on, ti, x, z, amount] of entries) {
      const l = this.list[i];
      if (!l) continue;
      if (!on) { l.on = false; l.m.visible = false; continue; }
      const it = items.table[ti];
      l.on = true; l.it = it; l.ti = ti; l.x = x; l.z = z; l.amount = amount;
      l.m.material = mat(it.color); l.m.position.set(x, 0.4, z); l.m.visible = true;
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

  spawn(it, x, z, amount = it.amount) {
    if (this.net) { this.net.dropLoot(items.table.indexOf(it), x, z, amount); return null; }
    for (const l of this.list) {
      if (l.on) continue;
      l.on = true; l.it = it; l.x = x; l.z = z; l.amount = amount; l.ti = items.table.indexOf(it); this.dirty.add(l.i);
      l.m.material = mat(it.color); l.m.position.set(x, 0.4, z); l.m.visible = true;
      return l;
    }
    return null;
  }

  spawnWeapon(key, x, z) { return this.spawn(items.table.find((e) => e.kind === 'weapon' && e.key === key), x, z); }

  // Butin lâché par un joueur/bot éliminé.
  drop(x, z, count, weapons) {
    for (let i = 0; i < count; i++) this.spawn(this.roll(weapons), x + (this.rand() - 0.5) * 1.8, z + (this.rand() - 0.5) * 1.8);
  }

  tick(dt, player, inv, weapons, input) {
    this.t += dt;
    if (this.pendT > 0) this.pendT -= dt;
    let best = null, bd = 2.4 * 2.4;
    for (const l of this.list) {
      if (!l.on) continue;
      l.m.rotation.y += dt * 1.5;
      l.m.position.y = 0.45 + Math.sin(this.t * 2 + l.x) * 0.06;
      const dx = l.x - player.x, dz = l.z - player.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = l; }
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
        if (dropped) this.spawn(items.table.find((e) => e.kind === 'weapon' && e.key === dropped), player.x, player.z);
      }
      l.on = false; l.m.visible = false; this.dirty.add(l.i);
      return;
    }
    const n = inv.add(it.kind, it.key, l.amount);
    if (n === 0) return;
    l.amount -= n; this.dirty.add(l.i);
    if (l.amount <= 0) { l.on = false; l.m.visible = false; }
  }
}
