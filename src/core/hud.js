import { OPTICS, OPTIC_STYLE } from './optics.js';
const $ = (id) => document.getElementById(id);
const HIT_COLORS = ['#fff', '#ffe040', '#ff3030'];
const HEAL_NAMES = [['syringe', 'Seringue', 3], ['medkit', 'Kit', 4], ['cell', 'Cellule', 5]];

export class Hud {
  constructor() {
    this.root = $('hud');
    this.state = $('h-state'); this.speed = $('h-speed'); this.fps = $('h-fps'); this.prompt = $('h-prompt');
    this.hit = $('h-hit'); this.dmg = $('h-dmg'); this.hurt = $('h-hurt'); this.cross = $('cross');
    this.sh = $('b-sh'); this.hp = $('b-hp'); this.ammo = $('h-ammo'); this.wep = $('h-wep');
    this.abil = $('h-abil'); this.top = $('h-top'); this.feed = $('h-feed'); this.squad = $('h-squad'); this.inv = $('h-inv');
    this.rev = $('h-rev'); this.revI = this.rev.firstElementChild;
    // viseurs en surimpression (un par arme), affichés selon l'ADS
    this.optics = {};
    for (const id in OPTICS) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;display:none;' + (OPTIC_STYLE[id] || '');
      el.innerHTML = OPTICS[id];
      this.root.appendChild(el);
      this.optics[id] = { el, v: -1 };
    }
    this.last = {};
    this._acc = 0; this._n = 0;
  }

  show(v) { this.root.style.display = v ? 'block' : 'none'; }

  // Écrit dans le DOM seulement si la valeur a changé.
  set(el, key, val, html) {
    if (this.last[key] === val) return;
    this.last[key] = val;
    if (html) el.innerHTML = val; else el.textContent = val;
  }

  update(p, dt, cb, ab, inv, match) {
    this.set(this.state, 's', p.state);
    this.set(this.speed, 'v', Math.round(Math.hypot(p.vx, p.vz) * 10) / 10 + ' m/s');
    this.set(this.prompt, 'p', p.prompt);

    const h = p.health;
    const sh = Math.round((h.shield / h.maxShield) * 100);
    const hp = Math.round((h.downed ? h.downedHp / 50 : h.hp / h.maxHp) * 100);
    if (this.last.sh !== sh) { this.last.sh = sh; this.sh.style.width = sh + '%'; }
    if (this.last.hp !== hp) { this.last.hp = hp; this.hp.style.width = hp + '%'; this.hp.style.background = h.downed ? '#e04040' : '#6fe06f'; }

    const w = cb.weapons, d = w.def;
    this.set(this.ammo, 'a', !d ? '—' : w.reload > 0 ? 'RECHARGE…' : w.mag + ' / ' + w.reserve);
    this.set(this.wep, 'w', d ? d.name : 'Aucune arme (ramassez-en une)');
    this.cross.style.opacity = 0.85 * (1 - w.ads); // en ADS le viseur de l'arme prend le relais
    for (const id in this.optics) {
      const o = this.optics[id], v = w.id !== id ? 0 : id === 'sniper' ? Math.max(0, (w.ads - 0.8) / 0.2) : Math.max(0, (w.ads - 0.3) / 0.7);
      if (v === o.v) continue;
      o.v = v; o.el.style.opacity = v; o.el.style.display = v > 0 ? 'block' : 'none';
    }
    this.set(this.inv, 'i', HEAL_NAMES.map(([k, n, key]) => `${n} ${inv.heal[k]} [${key}]`).join(' · ') + ' — ' + `Lég. ${inv.ammo.light} · Cart. ${inv.ammo.shells} · Snip. ${inv.ammo.sniper} · Roq. ${inv.ammo.rocket}`);

    const hm = cb.hitmark > 0 ? Math.min(1, cb.hitmark / 0.18) : 0;
    this.hit.style.opacity = hm;
    if (this.last.hk !== cb.hitKind) { this.last.hk = cb.hitKind; this.hit.style.color = HIT_COLORS[cb.hitKind]; }
    this.set(this.dmg, 'd', cb.dmgT > 0 ? String(Math.round(cb.dmgSum)) : '');
    this.hurt.style.opacity = cb.hurt > 0 ? Math.min(1, cb.hurt * 2.5) : 0;

    const prog = inv.useKey ? inv.progress : cb.revive;
    this.rev.style.display = prog > 0 ? 'block' : 'none';
    if (prog > 0) this.revI.style.width = Math.min(100, prog * 100) + '%';

    const L = ab.L;
    const tc = ab.tCd > 0 ? Math.ceil(ab.tCd) + ' s' : 'PRÊT';
    const uc = ab.ultReady ? 'PRÊT' : Math.floor((ab.uCharge / L.ultimate.charge) * 100) + ' %';
    this.set(this.abil, 'ab', L.name + ' — [F] ' + L.tactical.name + ' : ' + tc + ' · [G] ' + L.ultimate.name + ' : ' + uc);
    this.abil.style.color = L.color;

    if (match) {
      this.set(this.top, 'top', `Vivants : ${match.playersAlive} · Escouades : ${match.aliveSquads}<br>Éliminations : ${match.stats.kills}<br><span style="color:#8cf">${match.zone.label()}</span>`, true);
      this.set(this.feed, 'feed', match.feed.map((f) => f.text).join('<br>'), true);
      let sq = '';
      for (const m of match.playerSquad.members) {
        if (m === cb.pp) continue;
        const hh = m.health, pct = hh.dead ? 0 : Math.round((hh.downed ? hh.downedHp / 50 : hh.hp / hh.maxHp) * 100);
        sq += `<div class="m">${m.name}${hh.dead ? ' ✕' : hh.downed ? ' (à terre)' : ''}<div class="b"><i style="width:${pct}%;background:${hh.downed ? '#e04040' : '#6fe06f'}"></i></div></div>`;
      }
      this.set(this.squad, 'sq', sq, true);
    } else {
      this.set(this.top, 'top', '', true); this.set(this.feed, 'feed', '', true); this.set(this.squad, 'sq', '', true);
    }

    this._acc += dt; this._n++;
    if (this._acc >= 0.5) {
      this.fps.textContent = Math.round(this._n / this._acc) + ' FPS';
      this._acc = 0; this._n = 0;
    }
  }
}
