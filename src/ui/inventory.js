import items from '../loot/items.json';

const AMMO_NAMES = { light: 'Munitions légères', shells: 'Cartouches', sniper: 'Munitions sniper', rocket: 'Roquettes' };
const AMMO_COL = { light: '#f0c040', shells: '#e05030', sniper: '#40c070', rocket: '#d08030' };
const HEAL_KEY = { syringe: 3, medkit: 4, cell: 5 };

// Inventaire (Tab) : armes, munitions, soins ; équiper / utiliser / lâcher. Ne met pas la partie en pause en ligne.
export class InventoryPanel {
  constructor(game) {
    this.g = game; this.open = false;
    const el = this.el = document.createElement('div');
    el.id = 'inv';
    el.style.display = 'none';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]');
      if (b) { e.stopPropagation(); this.act(b.dataset.a, b.dataset.k, +b.dataset.i); }
    });
    document.body.appendChild(el);
  }

  toggle(on = !this.open) {
    const g = this.g;
    if (on === this.open || (on && (g.state !== 'playing' || !g.m || g.chatting))) return;
    this.open = on;
    this.el.style.display = on ? 'flex' : 'none';
    if (on) { this.render(); this.timer = setInterval(() => this.render(), 400); document.exitPointerLock(); }
    else { clearInterval(this.timer); if (g.state === 'playing') g.input.lock(); }
  }

  close() { if (this.open) { this.open = false; clearInterval(this.timer); this.el.style.display = 'none'; } }

  render() {
    const m = this.g.m;
    if (!m || this.g.state !== 'playing') { this.close(); return; }
    const W = m.combat.weapons, inv = m.inv, h = m.player.health;
    const wep = W.slots.map((id, i) => {
      if (!id) return `<div class="iw empty">Emplacement ${i + 1} vide</div>`;
      const d = W.defs[id];
      return `<div class="iw${i === W.cur ? ' cur' : ''}"><b>${d.name}</b><span>${W.mags[id]} / ${inv.ammo[d.ammo]}</span><small style="color:${AMMO_COL[d.ammo]}">${AMMO_NAMES[d.ammo]}</small>`
        + `<div>${i === W.cur ? '<em>En main</em>' : `<button data-a="eq" data-i="${i}">Équiper</button>`}<button data-a="dw" data-i="${i}">Lâcher</button></div></div>`;
    }).join('');
    const ammo = Object.keys(AMMO_NAMES).map((k) => {
      const per = items.table.find((e) => e.kind === 'ammo' && e.key === k).amount;
      return `<div class="ir"><i style="background:${AMMO_COL[k]}"></i><b>${AMMO_NAMES[k]}</b><span>${inv.ammo[k]} / ${items.ammoCaps[k]}</span>`
        + `<button data-a="da" data-k="${k}"${inv.ammo[k] ? '' : ' disabled'}>Lâcher ${Math.min(per, inv.ammo[k]) || per}</button></div>`;
    }).join('');
    const heal = Object.keys(items.healing).map((k) => {
      const it = items.healing[k], full = it.hp > 0 ? h.hp >= h.maxHp : h.shield >= h.maxShield;
      const eff = (it.hp ? `+${it.hp} santé` : `+${it.shield} bouclier`) + ` · ${it.time} s`;
      return `<div class="ir"><i style="background:${items.table.find((e) => e.key === k).color}"></i><b>${it.name}</b><small>${eff} [${HEAL_KEY[k]}]</small><span>${inv.heal[k]} / ${items.healCaps[k]}</span>`
        + `<button data-a="uh" data-k="${k}"${inv.heal[k] && !full && h.alive ? '' : ' disabled'}>Utiliser</button><button data-a="dh" data-k="${k}"${inv.heal[k] ? '' : ' disabled'}>Lâcher</button></div>`;
    }).join('');
    this.el.innerHTML = `<div class="ipanel"><h2>Inventaire <small>Tab pour fermer</small></h2>`
      + `<div class="ist">Santé ${Math.round(h.hp)} / ${h.maxHp} · Bouclier ${Math.round(h.shield)} / ${h.maxShield}</div>`
      + `<h3>Armes</h3><div class="iws">${wep}</div><h3>Munitions</h3>${ammo}<h3>Soins</h3>${heal}</div>`;
  }

  act(a, k, i) {
    const m = this.g.m, W = m.combat.weapons, inv = m.inv, p = m.player;
    const ox = p.x - Math.sin(p.yaw) * 0.9, oz = p.z - Math.cos(p.yaw) * 0.9;
    const drop = (kind, key, n) => m.loot.spawn(items.table.find((e) => e.kind === kind && e.key === key), ox, oz, n, p.y);
    const ok = (l) => !!l || !!m.loot.net; // pool de butin plein (hors ligne) : on ne perd pas l'objet
    if (a === 'eq') { W.select(i); }
    else if (a === 'dw') { const id = W.slots[i]; if (id && ok(drop('weapon', id, 1))) { W.slots[i] = null; delete W.mags[id]; W.reload = 0; W.ads = 0; } }
    else if (a === 'da') { const per = items.table.find((e) => e.kind === 'ammo' && e.key === k).amount, n = Math.min(per, inv.ammo[k]); if (n > 0 && ok(drop('ammo', k, n))) inv.ammo[k] -= n; }
    else if (a === 'dh') { if (inv.heal[k] > 0 && ok(drop('heal', k, 1))) inv.heal[k]--; }
    else if (a === 'uh') { if (inv.startUse(k, p)) { this.toggle(false); return; } }
    this.render();
  }
}
