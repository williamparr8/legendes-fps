import items from './items.json';

// Munitions de réserve + soins consommables (touches 3/4/5). Un soin est interrompu par un dégât ou un tir.
const USE_KEYS = { Digit3: 'syringe', Digit4: 'medkit', Digit5: 'cell' };

export class Inventory {
  constructor() {
    this.ammo = { light: 0, shells: 0, sniper: 0, rocket: 0 };
    this.heal = { syringe: 0, medkit: 0, cell: 0 };
    this.useKey = null; this.useT = 0; this.useDur = 1;
  }

  // Ajoute jusqu'au plafond ; retourne la quantité réellement ajoutée.
  add(kind, key, amount) {
    const store = kind === 'ammo' ? this.ammo : this.heal;
    const cap = (kind === 'ammo' ? items.ammoCaps : items.healCaps)[key];
    const n = Math.min(cap - store[key], amount);
    if (n <= 0) return 0;
    store[key] += n;
    return n;
  }

  get progress() { return this.useKey ? 1 - this.useT / this.useDur : 0; }

  cancel(player) { this.useKey = null; player.useMul = 1; }

  tick(dt, input, player) {
    const h = player.health;
    if (this.useKey) {
      if (!h.alive || player.sinceDamage < dt * 1.5 || input.k.Mouse0) { this.cancel(player); return; }
      this.useT -= dt;
      if (this.useT <= 0) {
        const it = items.healing[this.useKey];
        this.heal[this.useKey]--;
        h.hp = Math.min(h.maxHp, h.hp + it.hp);
        h.shield = Math.min(h.maxShield, h.shield + it.shield);
        this.cancel(player);
      }
      return;
    }
    if (!h.alive) return;
    for (const code in USE_KEYS) {
      if (!input.pressed[code]) continue;
      this.startUse(USE_KEYS[code], player);
    }
  }

  // Démarre l'utilisation d'un soin si possible (touches 3/4/5 ou inventaire).
  startUse(key, player) {
    const it = items.healing[key], h = player.health;
    const needed = it.hp > 0 ? h.hp < h.maxHp : h.shield < h.maxShield;
    if (this.useKey || !h.alive || this.heal[key] <= 0 || !needed) return false;
    this.useKey = key; this.useT = this.useDur = it.time; player.useMul = 0.6;
    return true;
  }
}
