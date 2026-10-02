const $ = (id) => document.getElementById(id);
const HIT_COLORS = ['#fff', '#ffe040', '#ff3030'];
const HEAL_NAMES = [['syringe', 'Seringue', 3], ['medkit', 'Kit', 4], ['cell', 'Cellule', 5]];

// Réticule de lunette (viewBox 100×100, centré, cercle de rayon 37) : gros traits extérieurs, croix fine, repères de chute de balle.
const SCOPE_SVG = '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style="position:absolute;left:50%;top:50%;height:100vmin;width:100vmin;transform:translate(-50%,-50%)">'
  + '<g stroke="#000" fill="none"><path stroke-width="1.1" d="M13 50H44M56 50H87M50 13V44M50 56V87"/>'
  + '<path stroke-width="0.12" d="M44 50H56M50 44V56"/>'
  + '<g stroke-width="0.25"><path d="M50 58H52M50 63H53M50 68H52M50 73H53M50 78H52"/><path d="M58 50V52M63 50V53M68 50V52M72 50V52M42 50V52M37 50V52M32 50V52"/></g></g>'
  + '<circle cx="50" cy="50" r="0.35" fill="#e02020"/><circle cx="50" cy="50" r="37" fill="none" stroke="#000" stroke-width="0.6"/></svg>';

export class Hud {
  constructor() {
    this.root = $('hud');
    this.state = $('h-state'); this.speed = $('h-speed'); this.fps = $('h-fps'); this.prompt = $('h-prompt');
    this.hit = $('h-hit'); this.dmg = $('h-dmg'); this.hurt = $('h-hurt'); this.cross = $('cross');
    this.sh = $('b-sh'); this.hp = $('b-hp'); this.ammo = $('h-ammo'); this.wep = $('h-wep');
    this.abil = $('h-abil'); this.top = $('h-top'); this.feed = $('h-feed'); this.squad = $('h-squad'); this.inv = $('h-inv');
    this.rev = $('h-rev'); this.revI = this.rev.firstElementChild;
    this.scope = document.createElement('div');
    this.scope.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;display:none;background:radial-gradient(circle at center,transparent 0,transparent 37vmin,#000 37.4vmin)';
    this.scope.innerHTML = SCOPE_SVG;
    this.root.appendChild(this.scope);
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
    // viseur : toujours visible (point rouge en ADS) sauf lunette sniper
    const snip = w.id === 'sniper';
    this.cross.style.opacity = snip ? 0.8 * (1 - w.ads) : 0.85;
    const dot = w.ads > 0.5;
    if (this.last.dot !== dot) { this.last.dot = dot; this.cross.style.background = dot ? '#ff3030' : 'transparent'; this.cross.style.width = this.cross.style.height = dot ? '5px' : '6px'; this.cross.style.margin = dot ? '-2.5px' : '-3px'; }
    const sc = w.id === 'sniper' ? Math.max(0, (w.ads - 0.8) / 0.2) : 0;
    if (sc !== this.last.sc) { this.last.sc = sc; this.scope.style.opacity = sc; this.scope.style.display = sc > 0 ? 'block' : 'none'; }
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
