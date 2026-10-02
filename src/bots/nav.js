// Grille de navigation 2D (cases de 1,5 m) construite depuis les colliders + A* à 8 voisins.
// Tous les tampons sont préalloués et partagés : une recherche à la fois, aucune allocation en jeu.
export class NavGrid {
  constructor(colliders, half = 120, cell = 1.5) {
    this.half = half; this.cell = cell;
    this.n = Math.ceil((2 * half) / cell);
    const N = this.n * this.n;
    this.blocked = new Uint8Array(N);
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.open = new Uint32Array(N);   // marque « vu » par recherche
    this.closed = new Uint32Array(N);
    this.sid = 0;
    this.hi = new Int32Array(N * 4);
    this.hf = new Float32Array(N * 4);
    this.hn = 0;
    this.rev = new Int32Array(2048);
    this.build(colliders);
  }

  build(c) {
    const { half, cell, n, blocked } = this, m = 0.45, b = c.b;
    for (let i = 0, o = 0; i < c.n; i++, o += 6) {
      if (b[o + 4] <= 0.6 || b[o + 1] >= 2.0 || b[o] > 1e5) continue; // marche franchissable / toit / emplacement vide
      const x0 = Math.max(0, Math.floor((b[o] - m + half) / cell)), x1 = Math.min(n - 1, Math.floor((b[o + 3] + m + half) / cell));
      const z0 = Math.max(0, Math.floor((b[o + 2] - m + half) / cell)), z1 = Math.min(n - 1, Math.floor((b[o + 5] + m + half) / cell));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * n + x] = 1;
    }
  }

  ix(v) { const i = Math.floor((v + this.half) / this.cell); return i < 0 ? 0 : i >= this.n ? this.n - 1 : i; }
  cx(i) { return -this.half + ((i % this.n) + 0.5) * this.cell; }
  cz(i) { return -this.half + (Math.floor(i / this.n) + 0.5) * this.cell; }
  cellOf(x, z) { return this.ix(z) * this.n + this.ix(x); }
  isFree(x, z) { return !this.blocked[this.cellOf(x, z)]; }

  // Case libre la plus proche (spirale), -1 si aucune.
  nearestFree(i) {
    const n = this.n, bx = i % n, bz = (i / n) | 0;
    if (!this.blocked[i]) return i;
    for (let r = 1; r <= 8; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = bx + dx, z = bz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        if (!this.blocked[z * n + x]) return z * n + x;
      }
    }
    return -1;
  }

  los(i0, i1) { // ligne de vue entre cases (Bresenham)
    const n = this.n;
    let x0 = i0 % n, z0 = (i0 / n) | 0;
    const x1 = i1 % n, z1 = (i1 / n) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    for (;;) {
      if (this.blocked[z0 * n + x0]) return false;
      if (x0 === x1 && z0 === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }

  push(i, f) {
    let k = this.hn++;
    while (k > 0) { const p = (k - 1) >> 1; if (this.hf[p] <= f) break; this.hf[k] = this.hf[p]; this.hi[k] = this.hi[p]; k = p; }
    this.hf[k] = f; this.hi[k] = i;
  }
  pop() {
    const top = this.hi[0], f = this.hf[--this.hn], i = this.hi[this.hn];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= this.hn) break;
      if (c + 1 < this.hn && this.hf[c + 1] < this.hf[c]) c++;
      if (this.hf[c] >= f) break;
      this.hf[k] = this.hf[c]; this.hi[k] = this.hi[c]; k = c;
    }
    this.hf[k] = f; this.hi[k] = i;
    return top;
  }

  // Chemin A* de (sx,sz) vers (gx,gz) ; écrit des indices de cases dans `out` (lissés), retourne le nombre (0 = échec).
  find(sx, sz, gx, gz, out) {
    const n = this.n, start = this.nearestFree(this.cellOf(sx, sz)), goal = this.nearestFree(this.cellOf(gx, gz));
    if (start < 0 || goal < 0) return 0;
    if (start === goal) { out[0] = goal; return 1; }
    const sid = ++this.sid, gX = goal % n, gZ = (goal / n) | 0;
    this.hn = 0;
    this.g[start] = 0; this.parent[start] = -1; this.open[start] = sid;
    this.push(start, 0);
    let found = false, iter = 0;
    while (this.hn > 0 && iter++ < 9000) {
      const cur = this.pop();
      if (this.closed[cur] === sid) continue;
      this.closed[cur] = sid;
      if (cur === goal) { found = true; break; }
      const cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const ni = z * n + x;
        if (this.blocked[ni] || this.closed[ni] === sid) continue;
        if (dx && dz && (this.blocked[cz * n + x] || this.blocked[z * n + cx])) continue; // pas de coupe d'angle
        const g = this.g[cur] + (dx && dz ? 1.414 : 1);
        if (this.open[ni] === sid && g >= this.g[ni]) continue;
        this.open[ni] = sid; this.g[ni] = g; this.parent[ni] = cur;
        const ddx = Math.abs(x - gX), ddz = Math.abs(z - gZ);
        this.push(ni, g + Math.max(ddx, ddz) + 0.414 * Math.min(ddx, ddz));
      }
    }
    if (!found) return 0;
    let len = 0;
    for (let i = goal; i !== -1 && len < this.rev.length; i = this.parent[i]) this.rev[len++] = i;
    // rev[len-1] = départ ; lissage par ligne de vue
    let a = len - 1, cnt = 0;
    while (a > 0 && cnt < out.length) {
      let b = a - 1;
      while (b > 0 && this.los(this.rev[a], this.rev[b - 1])) b--;
      out[cnt++] = this.rev[b];
      a = b;
    }
    return cnt;
  }
}
