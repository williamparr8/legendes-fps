import * as THREE from 'three';

// Effets poolés : traçantes, impacts, explosions. Rien n'est créé pendant le jeu.
export class Fx {
  constructor(scene) {
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffe9a0 });
    this.tr = [];
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(6);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const line = new THREE.Line(g, lineMat);
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.tr.push({ line, pos, life: 0 });
    }
    this.tri = 0;
    const sg = new THREE.SphereGeometry(0.07, 6, 4);
    const mats = [0xffd080, 0xff3030, 0xffff40].map((c) => new THREE.MeshBasicMaterial({ color: c }));
    this.im = [];
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(sg, mats[0]);
      m.visible = false;
      scene.add(m);
      this.im.push({ m, life: 0 });
    }
    this.imi = 0; this.mats = mats;
    const eg = new THREE.SphereGeometry(1, 12, 8);
    this.ex = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ color: 0xff8020, transparent: true, opacity: 0.8 }));
      m.visible = false;
      scene.add(m);
      this.ex.push({ m, life: 0, r: 1 });
    }
    this.exi = 0;
    this.emit = null; // (kind, ...nombres) : relais réseau des effets produits localement
  }

  tracer(x0, y0, z0, x1, y1, z1, silent) {
    if (this.emit && !silent) this.emit(0, x0, y0, z0, x1, y1, z1);
    const t = this.tr[this.tri]; this.tri = (this.tri + 1) % this.tr.length;
    const p = t.pos;
    p[0] = x0; p[1] = y0; p[2] = z0; p[3] = x1; p[4] = y1; p[5] = z1;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true; t.life = 0.06;
  }

  // kind : 0 mur, 1 corps, 2 tête
  impact(x, y, z, kind, silent) {
    if (this.emit && !silent) this.emit(1, x, y, z, kind);
    const i = this.im[this.imi]; this.imi = (this.imi + 1) % this.im.length;
    i.m.material = this.mats[kind];
    i.m.position.set(x, y, z); i.m.scale.setScalar(1); i.m.visible = true; i.life = 0.25;
  }

  explosion(x, y, z, r, silent) {
    if (this.emit && !silent) this.emit(2, x, y, z, r);
    const e = this.ex[this.exi]; this.exi = (this.exi + 1) % this.ex.length;
    e.m.position.set(x, y, z); e.r = r; e.m.scale.setScalar(0.2); e.m.visible = true; e.life = 0.35;
  }

  tick(dt) {
    for (let i = 0; i < this.tr.length; i++) { const t = this.tr[i]; if (t.life > 0 && (t.life -= dt) <= 0) t.line.visible = false; }
    for (let i = 0; i < this.im.length; i++) {
      const t = this.im[i];
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.visible = false; else t.m.scale.setScalar(t.life * 4); }
    }
    for (let i = 0; i < this.ex.length; i++) {
      const e = this.ex[i];
      if (e.life > 0) {
        e.life -= dt;
        if (e.life <= 0) e.m.visible = false;
        else { const u = 1 - e.life / 0.35; e.m.scale.setScalar(e.r * (0.2 + 0.8 * u)); e.m.material.opacity = 0.8 * (1 - u); }
      }
    }
  }
}
