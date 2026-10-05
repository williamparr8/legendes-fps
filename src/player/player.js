import * as THREE from 'three';
import { tickPlayerDrop } from '../match/drop.js';
import { Rig } from '../combat/humanoid.js';
import { MOVE as M } from './config.js';
import { Health } from '../combat/health.js';

const R = M.radius;
const MANTLE_D = [1.0, 0.7];

// Contrôleur FPS : tick() à pas fixe (sans allocation), getCamera() interpolé au rendu.
export class Player {
  constructor(world, input, sfx) {
    this.w = world;
    this.c = world.colliders;
    this.inp = input;
    this.sfx = sfx;
    this.sx = 0; this.sy = 0; this.sz = 6; this.syaw = 0;
    this.health = new Health(100, 50);
    this.speedMul = 1; this.ads = 0; this.adsFov = 70;
    this.team = 0; this.dmgMul = 1; this.takenMul = 1; this.moveMul = 1; this.sinceDamage = 99;
    this.pv = { markOnHit: 0, reloadMul: 1, moveMul: 1, regen: 0, regenDelay: 5, reviveMul: 1, trapMul: 1 }; // passives
    this.tp = 0; this.rig = null; this.cx = this.cy = this.cz = 0; // tp : 0 = 1re personne, 1 = 3e personne (chute libre)
    this.onSpawn = null; this.allowRespawn = false; this.useMul = 1; this.lootNear = false;
    this.spawn();
    this.fov = M.fov;
  }

  spawn() {
    this.health.reset();
    if (this.onSpawn) this.onSpawn();
    this.x = this.sx; this.y = Math.max(this.sy, this.w.groundY(this.sx, this.sz)); this.z = this.sz;
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = this.syaw; this.pitch = 0;
    this.h = M.hStand;
    this.eye = this.peye = M.eyeStand;
    this.state = 'air';
    this.grounded = false;
    this.sliding = false;
    this.prompt = '';
    this.phase = 0; this.dropT = 0; this.attached = false; this.drop = this.drop || null; // largage (voir match/drop.js)
    this.padCd = 0; this.zipCd = 0;
    this.zip = null; this.zipT = 0; this.zipDir = 1; this.zipSpeed = 0;
    this.mt = 0; this.mx0 = 0; this.my0 = 0; this.mz0 = 0; this.mx1 = 0; this.my1 = 0; this.mz1 = 0;
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = 1.553;
    if (this.pitch > lim) this.pitch = lim; else if (this.pitch < -lim) this.pitch = -lim;
  }

  tick(dt) {
    const inp = this.inp, k = inp.k, pr = inp.pressed;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.peye = this.eye;
    this.prompt = '';
    if (this.zipCd > 0) this.zipCd -= dt;
    if (this.padCd > 0) this.padCd -= dt;
    if (this.phase) { tickPlayerDrop(this, dt); return; }
    if (pr.KeyP && this.allowRespawn) { this.spawn(); return; } // debug : entraînement uniquement
    const down = !this.health.alive; // à terre ou mort : ramper, pas de saut/glissade/mantle/tyrolienne

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy;

    if (this.state === 'mantle') { this.tickMantle(dt); this.updateEye(dt); return; }
    if (this.state === 'tyrolienne') { this.tickZip(dt, fx, fz); this.updateEye(dt); return; }

    // --- intentions ---
    const live = !this.health.dead;
    const fw = live ? (k.KeyW || k.KeyZ ? 1 : 0) - (k.KeyS ? 1 : 0) : 0;
    const st = live ? (k.KeyD ? 1 : 0) - (k.KeyA || k.KeyQ ? 1 : 0) : 0;
    let wx = fx * fw + cy * st, wz = fz * fw - sy * st;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const crouchHeld = down || !!(k.KeyC || k.ControlLeft);
    const crouchPressed = !down && !!(pr.KeyC || pr.ControlLeft);
    const sprint = !down && !!k.ShiftLeft && fw > 0;
    const speedH = Math.hypot(this.vx, this.vz);

    // --- glissade ---
    if (this.grounded && !this.sliding && crouchPressed && speedH > M.walk + 0.5) {
      const s = Math.min(speedH * M.slideBoost, M.slideMax) / speedH;
      this.vx *= s; this.vz *= s;
      this.sliding = true;
      this.sfx.slide();
    }
    if (this.sliding && (!crouchHeld || speedH < M.slideMin || !this.grounded)) this.sliding = false;

    // --- hauteur (accroupi) ---
    const wantH = crouchHeld || this.sliding ? M.hCrouch : M.hStand;
    if (wantH !== this.h) {
      if (wantH < this.h || !this.c.query(this.x, this.y, this.z, R, wantH)) this.h = wantH;
    }
    const crouching = this.h < M.hStand;

    // --- sol / air ---
    if (this.grounded) {
      if (this.sliding) {
        const sp = Math.hypot(this.vx, this.vz);
        const ns = Math.max(0, sp - M.slideDecel * dt);
        if (sp > 0) { this.vx *= ns / sp; this.vz *= ns / sp; }
      } else {
        const sp = Math.hypot(this.vx, this.vz);
        if (sp > 0) {
          const ns = Math.max(0, sp - Math.max(sp, M.stopSpeed) * M.friction * dt);
          this.vx *= ns / sp; this.vz *= ns / sp;
        }
        const max = (down ? M.crawl : crouching ? M.crouch : sprint ? M.sprint : M.walk) * this.speedMul * this.moveMul * this.pv.moveMul * this.useMul;
        if (wl > 0) this.accelerate(wx, wz, max, M.groundAccel, dt);
      }
      if (k.Space && !down) {
        this.vy = M.jump;
        this.grounded = false;
        this.sliding = false;
        this.sfx.jump();
      }
    } else if (wl > 0) {
      this.accelerate(wx, wz, M.airCap, M.airAccel, dt);
    }
    this.vy -= M.gravity * dt;
    // parachute rouvrable seulement par une compétence de légende (pv.chute)
    if (this.pv.chute > 0 && pr.Space && !this.grounded && this.vy < -6 && this.drop && this.y - this.w.groundY(this.x, this.z) > 6) { this.pv.chute--; this.phase = 3; this.dropT = 1; this.altC = -1; return; }

    // --- jump pads ---
    if (this.padCd <= 0) {
      const pads = this.w.pads;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const dx = this.x - p.x, dz = this.z - p.z;
        if (dx * dx + dz * dz < p.r * p.r && this.y < p.y + 0.5) {
          this.vy = p.vy; this.vx = p.vx; this.vz = p.vz;
          this.grounded = false; this.sliding = false; this.padCd = M.padCooldown;
          this.sfx.pad();
          break;
        }
      }
    }

    // --- déplacement + collisions ---
    const wasGrounded = this.grounded;
    const preVy = this.vy;
    this.moveH(this.vx * dt, this.vz * dt);
    this.moveV(dt, wasGrounded);
    if (!wasGrounded && this.grounded && preVy < -9) this.sfx.land(-preVy);

    // --- mantle / tyrolienne ---
    if (!down) {
      if (!this.grounded && this.vy < 3 && (fw > 0 || k.Space) && this.tryMantle(fx, fz)) { this.updateEye(dt); return; }
      this.checkZip(fx, fz, pr);
      if (this.state === 'tyrolienne') { this.updateEye(dt); return; }
    }

    this.state = down ? (this.health.dead ? 'mort' : 'à terre') : this.sliding ? 'glissade' : !this.grounded ? 'air' : crouching ? 'accroupi'
      : speedH > 0.3 ? (sprint ? 'sprint' : 'marche') : 'immobile';
    this.updateEye(dt);
  }

  accelerate(wx, wz, max, accel, dt) {
    const add = max - (this.vx * wx + this.vz * wz);
    if (add <= 0) return;
    let a = accel * max * dt;
    if (a > add) a = add;
    this.vx += wx * a; this.vz += wz * a;
  }

  moveH(dx, dz) {
    const c = this.c;
    if (dx !== 0) {
      const nx = this.x + dx;
      if (!c.query(nx, this.y, this.z, R, this.h)) this.x = nx;
      else if (!this.tryStep(nx, this.z)) this.vx = 0;
    }
    if (dz !== 0) {
      const nz = this.z + dz;
      if (!c.query(this.x, this.y, nz, R, this.h)) this.z = nz;
      else if (!this.tryStep(this.x, nz)) this.vz = 0;
    }
  }

  // Marche automatique ≤ step ; suppose que c.query vient d'échouer à (nx,nz).
  tryStep(nx, nz) {
    if (!this.grounded) return false;
    const c = this.c, top = c.hitTop, d = top - this.y;
    if (d <= 0 || d > M.step) return false;
    if (c.query(nx, top, nz, R, this.h)) return false;
    this.x = nx; this.z = nz; this.y = top;
    return true;
  }

  moveV(dt, wasGrounded) {
    const c = this.c, ny = this.y + this.vy * dt;
    if (c.query(this.x, ny, this.z, R, this.h)) {
      if (this.vy < 0) { this.y = c.hitTop; this.grounded = true; }
      else this.y = c.hitBottom - this.h - 0.001;
      this.vy = 0;
    } else {
      this.y = ny;
      this.grounded = false;
    }
    // Relief : on colle au sol (pentes montantes et descendantes) sauf pendant un saut / une impulsion.
    const g = this.w.groundY(this.x, this.z);
    if (this.y <= g || (wasGrounded && this.vy <= 0 && this.y - g < 0.4)) { this.y = g; if (this.vy < 0) this.vy = 0; this.grounded = true; }
  }

  // --- mantle ---
  tryMantle(fx, fz) {
    const b = this.c.b, n = this.c.n;
    const px = this.x + fx * 0.7, pz = this.z + fz * 0.7;
    for (let i = 0, o = 0; i < n; i++, o += 6) {
      if (px + 0.1 <= b[o] || px - 0.1 >= b[o + 3] || pz + 0.1 <= b[o + 2] || pz - 0.1 >= b[o + 5]) continue;
      const top = b[o + 4], dh = top - this.y;
      if (dh < M.mantleMin || dh > M.mantleMax || b[o + 1] > this.y + 1.0) continue;
      for (let j = 0; j < 2; j++) {
        const tx = this.x + fx * MANTLE_D[j], tz = this.z + fz * MANTLE_D[j];
        if (tx < b[o] || tx > b[o + 3] || tz < b[o + 2] || tz > b[o + 5]) continue;
        if (this.c.query(tx, top, tz, R, M.hStand)) continue;
        this.state = 'mantle'; this.mt = 0; this.sliding = false;
        this.mx0 = this.x; this.my0 = this.y; this.mz0 = this.z;
        this.mx1 = tx; this.my1 = top; this.mz1 = tz;
        this.vx = this.vy = this.vz = 0;
        this.sfx.mantle();
        return true;
      }
    }
    return false;
  }

  tickMantle(dt) {
    this.mt += dt / M.mantleTime;
    const u = Math.min(1, this.mt);
    const yu = Math.min(1, u / 0.6), hu = Math.max(0, (u - 0.4) / 0.6);
    this.y = this.my0 + (this.my1 - this.my0) * yu;
    this.x = this.mx0 + (this.mx1 - this.mx0) * hu;
    this.z = this.mz0 + (this.mz1 - this.mz0) * hu;
    if (u >= 1) {
      this.state = 'immobile'; this.grounded = true;
      this.h = M.hStand;
      this.vx = (this.mx1 - this.mx0) * 3; this.vz = (this.mz1 - this.mz0) * 3;
    }
  }

  // --- tyrolienne ---
  checkZip(fx, fz, pr) {
    if (this.zipCd > 0 || this.lootNear) return;
    const zs = this.w.zips, ey = this.y + this.eye;
    // plusieurs câbles peuvent partir d'une même tour : on prend celui le mieux aligné avec le regard
    let best = null, bt = 0, bs = -1;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      let t = (this.x - z.ax) * z.dx + (ey - z.ay) * z.dy + (this.z - z.az) * z.dz;
      t = t < 0 ? 0 : t > z.len ? z.len : t;
      const ex = this.x - (z.ax + z.dx * t), ez = this.z - (z.az + z.dz * t), ey2 = ey - (z.ay + z.dy * t);
      if (ex * ex + ey2 * ey2 + ez * ez > M.zipReach * M.zipReach) continue;
      const sc = Math.abs(fx * z.dx + fz * z.dz);
      if (sc > bs) { bs = sc; best = z; bt = t; }
    }
    if (!best) return;
    const z = best;
    this.prompt = 'E — Tyrolienne';
    if (pr.KeyE) {
      this.zip = z; this.zipT = bt; this.zipSpeed = 3;
      this.zipDir = fx * z.dx + fz * z.dz >= 0 ? 1 : -1;
      this.state = 'tyrolienne'; this.sliding = false; this.grounded = false;
      this.h = M.hStand;
      this.vx = this.vy = this.vz = 0;
      this.sfx.zip();
    }
  }

  tickZip(dt, fx, fz) {
    const z = this.zip, pr = this.inp.pressed;
    this.prompt = 'Espace : sauter — E : lâcher';
    this.zipSpeed = Math.min(M.zipSpeed, this.zipSpeed + M.zipAccel * dt);
    this.zipT += this.zipDir * this.zipSpeed * dt;
    let end = false;
    if (this.zipT <= 0) { this.zipT = 0; end = true; } else if (this.zipT >= z.len) { this.zipT = z.len; end = true; }
    this.x = z.ax + z.dx * this.zipT;
    this.y = z.ay + z.dy * this.zipT - M.zipHang;
    this.z = z.az + z.dz * this.zipT;
    const jump = pr.Space;
    // garde-fou : relief ou bâtiment sur le trajet (hors extrémités) -> on lâche au lieu de traverser
    if (this.zipT > 5 && this.zipT < z.len - 5 && (this.w.groundY(this.x, this.z) > this.y - 0.1 || this.w.colliders.query(this.x, this.y + 0.1, this.z, 0.3, 1.6))) end = true;
    if (end || jump || pr.KeyE) {
      const s = this.zipDir * this.zipSpeed;
      this.vx = z.dx * s; this.vy = z.dy * s + (jump ? M.zipJump : 0); this.vz = z.dz * s;
      this.state = 'air'; this.zip = null; this.zipCd = 0.6;
      if (jump) this.sfx.jump();
    }
  }

  updateEye(dt) {
    const target = this.sliding ? M.eyeSlide : this.h < M.hStand ? M.eyeCrouch : M.eyeStand;
    this.eye += (target - this.eye) * Math.min(1, dt * 14);
  }

  // Modèle du joueur, visible en 3e personne (créé à la demande ; stance = phase + 3 pendant le largage).
  third(scene, dt) {
    if (this.tp < 0.3) { if (this.rig) this.rig.g.visible = false; return; }
    if (!this.rig) {
      const g = new THREE.Group(); scene.add(g);
      this.rig = { g, r: new Rig(g, true), a: { health: this.health, stance: 0, wid: null, shots: 0, reloading: false, pitch: 0 } };
    }
    const R = this.rig, a = R.a;
    a.stance = this.phase ? this.phase + 3 : 0; a.pitch = this.pitch;
    R.g.visible = true; R.g.position.set(this.cx, this.cy, this.cz); R.g.rotation.y = this.yaw;
    R.r.animate(dt, this.cx, this.cz, a);
  }

  // Applique la pose interpolée à la caméra (rendu).
  getCamera(alpha, cam, dt) {
    this.tp += ((this.phase === 2 ? 1 : 0) - this.tp) * Math.min(1, dt * 5);
    const x = this.cx = this.px + (this.x - this.px) * alpha, y = this.cy = this.py + (this.y - this.py) * alpha, z = this.cz = this.pz + (this.z - this.pz) * alpha;
    let ey = y + this.peye + (this.eye - this.peye) * alpha, cx = x, cz = z;
    if (this.tp > 0.01) { // caméra derrière et au-dessus du personnage
      const cp = Math.cos(this.pitch), d = 4.5 * this.tp;
      cx -= -Math.sin(this.yaw) * cp * d; cz -= -Math.cos(this.yaw) * cp * d; ey += -Math.sin(this.pitch) * d + 0.6 * this.tp;
      ey = Math.max(ey, this.w.groundY(cx, cz) + 0.4);
    }
    cam.position.set(cx, ey, cz);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    let tf = this.sliding ? M.fovSlide : this.state === 'sprint' || this.state === 'tyrolienne' || this.phase === 2 ? M.fovSprint : M.fov;
    tf += (this.adsFov - tf) * this.ads;
    if (Math.abs(tf - this.fov) > 0.01) {
      this.fov += (tf - this.fov) * Math.min(1, dt * 8);
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
