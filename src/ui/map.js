import { EXT } from '../world/island.js';

// Carte plein écran (touche T) : île, routes, lieux, zone actuelle / prochaine, joueur et coéquipiers. Dessinée seulement ouverte (~10 Hz).
const S = 720; // pixels du canvas
export class MapView {
  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,10,18,.72);z-index:30;pointer-events:none';
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = S;
    this.cv.style.cssText = 'height:min(90vh,90vw);width:min(90vh,90vw);border:2px solid #8cf;border-radius:6px;box-shadow:0 0 40px #000';
    this.el.appendChild(this.cv);
    document.body.appendChild(this.el);
    this.ctx = this.cv.getContext('2d');
    this.open = false; this.base = null; this.world = null; this.t = 0;
  }

  toggle() { this.open = !this.open; this.el.style.display = this.open ? 'flex' : 'none'; this.t = 0; }
  close() { this.open = false; this.el.style.display = 'none'; }

  px(v) { return (v / EXT * 0.5 + 0.5) * S; }

  // Fond mis en cache par monde : océan, terre (coast > 0), routes, lieux.
  bake(world) {
    const b = document.createElement('canvas'); b.width = b.height = S;
    const c = b.getContext('2d'), n = 180, cell = S / n;
    c.fillStyle = '#16314d'; c.fillRect(0, 0, S, S);
    const coast = world.coast;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n * 2 - 1) * EXT, z = ((j + 0.5) / n * 2 - 1) * EXT;
      const d = coast ? coast(x, z) : 1;
      if (d > 0) { c.fillStyle = d < 6 ? '#c8b98a' : (world.groundY(x, z) > 6 ? '#6f8a55' : '#56783f'); c.fillRect(i * cell, j * cell, cell + 1, cell + 1); }
    }
    c.strokeStyle = '#d8cfa8'; c.lineWidth = 2; c.beginPath();
    for (const r of world.roads || []) { c.moveTo(this.px(r[0]), this.px(r[1])); c.lineTo(this.px(r[2]), this.px(r[3])); }
    c.stroke();
    c.fillStyle = '#e8ecf0'; c.font = '13px sans-serif'; c.textAlign = 'center';
    for (const p of world.places || []) { c.fillText(p.name, this.px(p.x), this.px(p.z)); }
    c.fillStyle = '#ffd24a';
    for (const t of world.towers || []) c.fillRect(this.px(t[0]) - 3, this.px(t[1]) - 3, 6, 6);
    this.base = b; this.world = world;
  }

  draw(dt, m) {
    if (!this.open) return;
    if ((this.t -= dt) > 0) return;
    this.t = 0.1;
    if (this.world !== m.world) this.bake(m.world);
    const c = this.ctx, z = m.match && m.match.zone;
    c.drawImage(this.base, 0, 0);
    if (z && z.enabled) {
      // hors zone en rouge translucide (règle evenodd), cercle suivant en pointillés
      c.fillStyle = 'rgba(220,40,40,.28)'; c.beginPath(); c.rect(0, 0, S, S);
      c.arc(this.px(z.cx), this.px(z.cz), z.r / EXT * 0.5 * S, 0, 6.2832); c.fill('evenodd');
      c.strokeStyle = '#4aa8ff'; c.lineWidth = 3; c.beginPath(); c.arc(this.px(z.cx), this.px(z.cz), z.r / EXT * 0.5 * S, 0, 6.2832); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([8, 6]); c.beginPath(); c.arc(this.px(z.nx), this.px(z.nz), z.nr / EXT * 0.5 * S, 0, 6.2832); c.stroke(); c.setLineDash([]);
    }
    const sq = m.match && m.match.playerSquad ? m.match.playerSquad.members : [];
    c.fillStyle = '#6fe06f';
    for (const a of sq) { if (a === m.combat.pp || a.health.dead) continue; c.beginPath(); c.arc(this.px(a.x), this.px(a.z), 5, 0, 6.2832); c.fill(); }
    const p = m.player, x = this.px(p.x), y = this.px(p.z); // cap : avant = (-sin yaw, -cos yaw)
    c.save(); c.translate(x, y); c.rotate(-p.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.textAlign = 'left';
    c.fillText('Cercle bleu : zone actuelle · pointillés : prochaine zone · T pour fermer', 12, S - 12);
  }
}
