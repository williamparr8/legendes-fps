const SLOT_KEYS = ['Digit1', 'Digit2'];

// Armes du joueur : 2 emplacements, chargeur + munitions de réserve (Inventory), ADS, dispersion, recul.
export class Weapons {
  constructor(defs, combat, inv) {
    this.cb = combat; this.inv = inv;
    this.defs = defs;
    this.ids = Object.keys(defs); // tous les modèles (viewmodel)
    this.slots = [null, null];
    this.mags = {};
    this.cur = 0;
    this.cd = 0; this.reload = 0; this.swap = 0;
    this.ads = 0; this.bloom = 0; this.shots = 0; this.since = 99;
    this.accP = 0; this.accY = 0;
    this.kick = 0; // animation viewmodel
  }

  get id() { return this.slots[this.cur]; }
  get def() { const i = this.slots[this.cur]; return i ? this.defs[i] : null; }
  get mag() { const i = this.slots[this.cur]; return i ? this.mags[i] : 0; }
  get reserve() { const d = this.def; return d ? this.inv.ammo[d.ammo] : 0; }

  // Équipe une arme (chargeur plein). Retourne l'arme remplacée (à lâcher) ou null.
  give(id) {
    if (this.slots.includes(id)) return null;
    let slot = this.slots[this.cur] === null ? this.cur : this.slots.indexOf(null);
    let dropped = null;
    if (slot < 0) { slot = this.cur; dropped = this.slots[slot]; }
    this.slots[slot] = id;
    this.mags[id] = this.defs[id].mag;
    if (slot === this.cur) { this.reload = 0; this.swap = 0.35; this.ads = 0; this.shots = 0; }
    return dropped;
  }

  select(i) {
    if (i === this.cur) return;
    this.cur = i; this.reload = 0; this.swap = 0.35; this.ads = 0; this.shots = 0;
  }

  startReload(player) {
    const d = this.def;
    if (this.reload > 0 || !d || this.mag >= d.mag || this.reserve <= 0) return;
    this.reload = d.reload * player.pv.reloadMul;
  }

  tick(dt, input, player) {
    const k = input.k, pr = input.pressed, d = this.def;
    if (!player.health.alive) { this.ads = 0; this.reload = 0; player.speedMul = 1; player.ads = 0; return; }
    for (let i = 0; i < SLOT_KEYS.length; i++) if (pr[SLOT_KEYS[i]]) this.select(i);
    this.cd -= dt; this.since += dt;
    if (this.swap > 0) this.swap -= dt;
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 8);
    const busy = !!this.inv.useKey;
    if (!d) { this.ads = 0; player.speedMul = 1; player.ads = 0; return; }

    const want = k.Mouse2 && this.reload <= 0 && this.swap <= 0 && !busy ? 1 : 0;
    const step = dt / d.adsTime;
    this.ads += Math.max(-step, Math.min(step, want - this.ads));

    if (pr.KeyR && !busy) this.startReload(player);
    if (this.reload > 0) {
      if (busy) this.reload = 0;
      else if ((this.reload -= dt) <= 0) {
        this.reload = 0;
        const n = Math.min(d.mag - this.mag, this.reserve);
        this.mags[this.id] += n; this.inv.ammo[d.ammo] -= n;
      }
    }

    const fire = d.auto ? k.Mouse0 : pr.Mouse0;
    if (fire && !busy && this.cd <= 0 && this.reload <= 0 && this.swap <= 0) {
      if (this.mag > 0) this.shoot(player);
      else this.startReload(player);
    }

    // Dispersion et recul reviennent à zéro quand on arrête de tirer.
    if (this.since > 0.12) {
      this.bloom = Math.max(0, this.bloom - dt * 0.03);
      this.shots = 0;
      const r = d.recoil.recover * dt;
      const rp = Math.min(this.accP, r * 0.05), ry = Math.min(Math.abs(this.accY), r * 0.05);
      this.accP -= rp; player.pitch -= rp;
      const sgn = this.accY > 0 ? 1 : -1;
      this.accY -= sgn * ry; player.yaw -= sgn * ry;
    }
    player.speedMul = 1 - (1 - d.adsSpeed) * this.ads;
    player.ads = this.ads; player.adsFov = d.adsFov;
  }

  shoot(player) {
    const d = this.def;
    this.cd = 60 / d.rpm; this.since = 0; this.mags[this.id]--;
    const spread = d.spread + (d.adsSpread - d.spread) * this.ads + this.bloom;
    this.cb.fire(player, d, spread);
    this.bloom = Math.min(d.bloomMax, this.bloom + d.bloom);
    const pat = d.pattern, p = d.recoil.pitch * (1 - 0.4 * this.ads);
    const y = d.recoil.yaw * pat[this.shots % pat.length] * (1 - 0.4 * this.ads);
    this.shots++;
    player.pitch += p; player.yaw += y; this.accP += p; this.accY += y;
    this.kick = 1;
  }
}
