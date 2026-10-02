export const DOWN_HP = 50;   // PV de l'état « à terre »
export const BLEED = 2;       // PV/s perdus à terre
export const REVIVE_TIME = 3; // secondes

// PV + bouclier + états à terre / mort. damage() retourne les dégâts appliqués.
export class Health {
  constructor(maxHp = 100, maxShield = 50) {
    this.maxHp = maxHp;
    this.maxShield = maxShield;
    this.reset();
  }
  reset() {
    this.hp = this.maxHp;
    this.shield = this.maxShield;
    this.downed = false;
    this.dead = false;
    this.downedHp = DOWN_HP;
  }
  get alive() { return !this.downed && !this.dead; }
  damage(a) {
    if (this.dead) return 0;
    if (this.downed) {
      this.downedHp -= a;
      if (this.downedHp <= 0) { this.downed = false; this.dead = true; }
      return a;
    }
    const s = Math.min(this.shield, a);
    this.shield -= s;
    this.hp -= a - s;
    if (this.hp <= 0) { this.hp = 0; this.downed = true; this.downedHp = DOWN_HP; }
    return a;
  }
  tick(dt) {
    if (!this.downed) return;
    this.downedHp -= BLEED * dt;
    if (this.downedHp <= 0) { this.downed = false; this.dead = true; }
  }
  revived() { this.downed = false; this.hp = 30; this.shield = 0; }
}
