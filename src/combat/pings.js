import * as THREE from 'three';
import { sfx } from '../core/audio.js';

// Marqueurs (ping) : clic molette = pose un point là où l'on vise ; visible à travers les décors par soi-même et par les coéquipiers
// (événement réseau 5, voir net/session.js). Un losange + la distance, de taille constante à l'écran, qui disparaît après LIFE secondes.
const LIFE = 8, MAX = 8, W = 128, H = 176;
const COL = ['#ffd040', '#40d0ff', '#ff4a40']; // 0 : le mien · 1 : un coéquipier · 2 : ennemi repéré

function draw(cv, color, dist) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = color;
  g.beginPath(); g.moveTo(W / 2, 6); g.lineTo(W - 18, 42); g.lineTo(W / 2, 78); g.lineTo(18, 42); g.closePath();
  g.stroke(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(W / 2, 42, 7, 0, 7); g.fill();
  g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.85)';
  const t = Math.round(dist) + ' m';
  g.strokeText(t, W / 2, 112); g.fillStyle = '#fff'; g.fillText(t, W / 2, 112);
  g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, 128); g.lineTo(W / 2, H - 4); g.stroke();
}

export class Pings {
  constructor(scene) {
    this.items = [];
    for (let i = 0; i < MAX; i++) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
      sp.center.set(0.5, 0); sp.renderOrder = 20; sp.visible = false; sp.frustumCulled = false;
      scene.add(sp);
      this.items.push({ sp, cv, tex, life: 0, kind: 0, d: -1, x: 0, y: 0, z: 0 });
    }
    this.cd = 0;
  }

  // kind : 0 le mien · 1 coéquipier · 2 ennemi
  add(x, y, z, kind = 0) {
    let it = null;
    for (const p of this.items) if (p.life <= 0) { it = p; break; }
    if (!it) { it = this.items[0]; for (const p of this.items) if (p.life < it.life) it = p; } // le plus ancien est remplacé
    it.life = LIFE; it.kind = kind; it.d = -1; it.x = x; it.y = y; it.z = z;
    it.sp.position.set(x, y + 0.15, z); it.sp.visible = true; it.sp.material.opacity = 1;
    sfx.ping();
  }

  tick(dt, px, py, pz) {
    if (this.cd > 0) this.cd -= dt;
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.sp.visible = false; continue; }
      const d = Math.hypot(it.x - px, it.y - py, it.z - pz), di = Math.round(d);
      if (di !== it.d) { it.d = di; draw(it.cv, COL[it.kind], d); it.tex.needsUpdate = true; }
      const s = Math.min(14, Math.max(0.5, d * 0.1));
      it.sp.scale.set(s * (W / H), s, 1);
      it.sp.material.opacity = Math.min(1, it.life / 1.2);
    }
  }
}
