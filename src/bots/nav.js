import { FH, ND, SD } from '../world/buildings.js';

// Navigation 3D en couches : grille de base 2D (cases de 1,5 m, relief + obstacles) + une grille fine (0,75 m) par étage de
// bâtiment / plateau de tour, reliées par des « portails » placés au pied et au sommet de chaque escalier (liens bidirectionnels).
// Identifiants de nœuds : [0, N) cases de base · [N, N+C) cases d'étage · au-delà, portails.
// A* à 8 voisins (+ liens), lissage par ligne de vue dans une même couche. Tous les tampons sont préalloués et partagés :
// une recherche à la fois, aucune allocation en jeu.
const LC = 0.75;          // case des étages (m)
const MR = 0.45;          // marge autour des obstacles
const PMAX = 512;         // portails au plus
const D2 = Math.SQRT2;

export class NavGrid {
  constructor(colliders, half = 120, cell = 1.5, groundY = () => 0, world = null) {
    this.half = half; this.cell = cell; this.c = colliders; this.gy = groundY;
    this.n = Math.ceil((2 * half) / cell);
    const N = this.N = this.n * this.n;
    const base = new Uint8Array(N);
    this.buildBase(base, colliders, groundY);

    // ---- étages : une grille par niveau (dessus de dalle) et par plateau de tour ----
    const layers = this.layers = [];
    const areas = [];
    if (world) {
      world.buildings.forEach((b, bi) => { const nf = b.top !== undefined ? b.top : Math.round(b.roof / FH); for (let f = 1; f <= nf; f++) areas.push({ r: b.solid, y: f * FH, bi, f, ti: -1 }); });
      (world.towers || []).forEach(([x, z], ti) => areas.push({ r: [x - 3.3, z - 3.3, x + 3.3, z + 3.3], y: 6.9, bi: -1, f: 1, ti }));
    }
    let off = N;
    for (const a of areas) {
      const x0 = a.r[0], z0 = a.r[1], nx = Math.ceil((a.r[2] - x0) / LC), nz = Math.ceil((a.r[3] - z0) / LC);
      const arr = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * LC, z = z0 + (j + 0.5) * LC;
        // libre : rien à hauteur du corps, une dalle sous les pieds et sous les 4 points à 0,45 m (aucun bord de trémie ni de toit)
        const sup = (dx, dz) => colliders.query(x + dx, a.y - 0.25, z + dz, 0.05, 0.2);
        arr[j * nx + i] = !colliders.query(x, a.y + 0.02, z, MR, 1.7) && sup(0, 0) && sup(MR, 0) && sup(-MR, 0) && sup(0, MR) && sup(0, -MR) ? 0 : 1;
      }
      layers.push({ x0, z0, nx, nz, y: a.y, off, arr, bi: a.bi, f: a.f, ti: a.ti });
      off += nx * nz;
    }
    const C = this.C = off - N, M = this.M = off + PMAX;
    this.blocked = new Uint8Array(M);
    this.blocked.set(base);
    this.nodeLayer = new Int16Array(C);
    layers.forEach((L, k) => { this.blocked.set(L.arr, L.off); this.nodeLayer.fill(k, L.off - N, L.off - N + L.nx * L.nz); L.arr = null; });

    // ---- portails et liens d'escalier ----
    this.px = []; this.pz = []; this.py = []; this.links = new Map();
    this.entryB = []; this.entryT = []; // portail du rez-de-chaussée par bâtiment / par tour (guide la recherche vers un étage)
    const layerOf = (bi, ti, f) => layers.find((L) => L.f === f && (bi >= 0 ? L.bi === bi : L.ti === ti));
    if (world) {
      world.buildings.forEach((b, bi) => {
        for (const s of b.stairs || []) {
          const f = Math.round(s.yb / FH), lane = (s.lo + s.hi) / 2, end = s.s0 + s.dir * (ND * SD - 0.4); // sortie : dernière marche, au niveau de la dalle
          const bx = s.axis === 'z' ? lane : s.s0 - s.dir * 0.9, bz = s.axis === 'z' ? s.s0 - s.dir * 0.9 : lane;
          const tx = s.axis === 'z' ? lane : end, tz = s.axis === 'z' ? end : lane;
          const id = this.stairLink(bx, bz, f === 0 ? null : layerOf(bi, -1, f), tx, tz, layerOf(bi, -1, f + 1));
          if (f === 0 && id !== undefined) this.entryB[bi] = id;
        }
      });
      (world.towers || []).forEach(([x, z], ti) => { this.entryT[ti] = this.stairLink(x, z + 3 + 0.8 * 13 + 0.9, null, x, z + 1.8, layerOf(-1, ti, 1)); });
    }

    // tampons de recherche
    this.g = new Float32Array(M);
    this.parent = new Int32Array(M);
    this.open = new Uint32Array(M);   // marque « vu » par recherche
    this.closed = new Uint32Array(M);
    this.sid = 0;
    this.hi = new Int32Array(M * 3);
    this.hf = new Float32Array(M * 3);
    this.hn = 0;
    this.rev = new Int32Array(4096);
    this.cap = 12000; this.iters = 0; this.hw = 2.2; // hw : poids de l'heuristique (A* pondéré : bien moins d'expansions, chemins de longueur équivalente)
    this.gwx = 0; this.gwz = 0; this.viaX = NaN; this.viaZ = 0; this.hBias = 0;
  }

  buildBase(blocked, c, groundY) {
    const { half, cell, n } = this, m = cell / 2, b = c.b; // marge = demi-case : une case est bloquée si son centre est à moins de m d'une boîte (aucun trou dans un mur fin, portes de 3,6 m franchissables)
    for (let i = 0, o = 0; i < c.n; i++, o += 6) {
      if (b[o] > 1e5) continue; // emplacement vide
      const g = groundY((b[o] + b[o + 3]) / 2, (b[o + 2] + b[o + 5]) / 2);
      if (b[o + 4] - g <= 0.6 || b[o + 1] - g >= 2.0) continue; // marche franchissable / étage ou toit
      const x0 = Math.max(0, Math.ceil((b[o] - m + half) / cell - 0.5)), x1 = Math.min(n - 1, Math.floor((b[o + 3] + m + half) / cell - 0.5));
      const z0 = Math.max(0, Math.ceil((b[o + 2] - m + half) / cell - 0.5)), z1 = Math.min(n - 1, Math.floor((b[o + 5] + m + half) / cell - 0.5));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * n + x] = 1;
    }
    // mer : cases dont le sol est sous le seuil de profondeur praticable
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (groundY(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell) < -1.9) blocked[j * n + i] = 1;
  }

  // ---------- portails ----------
  portal(x, z, y, L) {
    const id = this.N + this.C + this.px.length;
    this.px.push(x); this.pz.push(z); this.py.push(y);
    // relie aux cases libres voisines (étage : 1,6 m ; sol : cases de base autour)
    const cand = [];
    if (L) {
      const r = Math.ceil(1.6 / LC);
      const ci = Math.floor((x - L.x0) / LC), cj = Math.floor((z - L.z0) / LC);
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
        const k = L.off + j * L.nx + i;
        if (!this.blocked[k]) cand.push([k, Math.hypot(L.x0 + (i + 0.5) * LC - x, L.z0 + (j + 0.5) * LC - z)]);
      }
    } else {
      const bi = Math.floor((x + this.half) / this.cell), bj = Math.floor((z + this.half) / this.cell);
      for (let j = bj - 1; j <= bj + 1; j++) for (let i = bi - 1; i <= bi + 1; i++) {
        if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
        const k = j * this.n + i;
        if (!this.blocked[k]) cand.push([k, Math.hypot(-this.half + (i + 0.5) * this.cell - x, -this.half + (j + 0.5) * this.cell - z)]);
      }
    }
    cand.sort((a, b) => a[1] - b[1]);
    for (const [k, d] of cand.slice(0, 4)) this.edge(id, k, d / this.cell);
    return id;
  }

  edge(a, b, cost) {
    if (!this.links.has(a)) this.links.set(a, []);
    if (!this.links.has(b)) this.links.set(b, []);
    this.links.get(a).push(b, cost); this.links.get(b).push(a, cost);
  }

  stairLink(bx, bz, bL, tx, tz, tL) {
    if (!tL || this.px.length + 2 > PMAX) return;
    const a = this.portal(bx, bz, bL ? bL.y : this.gy(bx, bz), bL), b = this.portal(tx, tz, tL.y, tL);
    this.edge(a, b, Math.hypot(tx - bx, tz - bz) / this.cell + 2);
    return a;
  }

  // ---------- accès aux nœuds ----------
  ix(v) { const i = Math.floor((v + this.half) / this.cell); return i < 0 ? 0 : i >= this.n ? this.n - 1 : i; }
  cx(i) {
    if (i < this.N) return -this.half + ((i % this.n) + 0.5) * this.cell;
    if (i < this.N + this.C) { const L = this.layers[this.nodeLayer[i - this.N]]; return L.x0 + (((i - L.off) % L.nx) + 0.5) * LC; }
    return this.px[i - this.N - this.C];
  }
  cz(i) {
    if (i < this.N) return -this.half + (Math.floor(i / this.n) + 0.5) * this.cell;
    if (i < this.N + this.C) { const L = this.layers[this.nodeLayer[i - this.N]]; return L.z0 + (Math.floor((i - L.off) / L.nx) + 0.5) * LC; }
    return this.pz[i - this.N - this.C];
  }
  // hauteur des pieds sur ce nœud (sol, dalle ou portail)
  cy(i) {
    if (i < this.N) return this.gy(this.cx(i), this.cz(i));
    if (i < this.N + this.C) return this.layers[this.nodeLayer[i - this.N]].y;
    return this.py[i - this.N - this.C];
  }
  cellOf(x, z) { return this.ix(z) * this.n + this.ix(x); }

  // Nœud sous (x, z, y) : étage si y est nettement au-dessus du sol, portail si on est sur un escalier, sinon case de base.
  nodeAt(x, z, y) {
    if (y === undefined || y !== y || y - this.gy(x, z) <= 1.2) return this.cellOf(x, z);
    for (const L of this.layers) {
      if (Math.abs(L.y - y) > 0.7 || x < L.x0 || z < L.z0 || x >= L.x0 + L.nx * LC || z >= L.z0 + L.nz * LC) continue;
      return L.off + Math.floor((z - L.z0) / LC) * L.nx + Math.floor((x - L.x0) / LC);
    }
    let best = -1, bd = 36;
    for (let k = 0; k < this.px.length; k++) {
      const d = (this.px[k] - x) ** 2 + (this.pz[k] - z) ** 2;
      if (d < bd && Math.abs(this.py[k] - y) < 4.5) { bd = d; best = k; }
    }
    return best >= 0 ? this.N + this.C + best : this.cellOf(x, z);
  }

  // y optionnel : en dehors du niveau du sol, teste la case de l'étage correspondant.
  isFree(x, z, y) { return !this.blocked[this.nodeAt(x, z, y)]; }

  // Nœud libre le plus proche (même couche), -1 si aucun.
  nearestFree(i) {
    if (i >= this.N + this.C) return i;
    if (!this.blocked[i]) return i;
    if (i >= this.N) {
      const L = this.layers[this.nodeLayer[i - this.N]], k = i - L.off, bx = k % L.nx, bz = (k / L.nx) | 0;
      for (let r = 1; r <= 4; r++) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = bx + dx, z = bz + dz;
          if (x < 0 || z < 0 || x >= L.nx || z >= L.nz) continue;
          if (!this.blocked[L.off + z * L.nx + x]) return L.off + z * L.nx + x;
        }
      }
      return -1;
    }
    const n = this.n, bx = i % n, bz = (i / n) | 0;
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

  // Ligne de vue entre deux nœuds d'une même couche (Bresenham) ; portails et couches différentes : jamais.
  los(i0, i1) {
    const N = this.N;
    let w, off, x0, z0, x1, z1;
    if (i0 < N && i1 < N) { w = this.n; off = 0; x0 = i0 % w; z0 = (i0 / w) | 0; x1 = i1 % w; z1 = (i1 / w) | 0; }
    else if (i0 >= N && i1 >= N && i0 < N + this.C && i1 < N + this.C && this.nodeLayer[i0 - N] === this.nodeLayer[i1 - N]) {
      const L = this.layers[this.nodeLayer[i0 - N]];
      w = L.nx; off = L.off; x0 = (i0 - off) % w; z0 = ((i0 - off) / w) | 0; x1 = (i1 - off) % w; z1 = ((i1 - off) / w) | 0;
    } else return false;
    const bl = this.blocked, dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1, nz = off ? this.layers[this.nodeLayer[i0 - this.N]].nz : this.n;
    let err = dx - dz;
    for (;;) {
      // ligne « épaisse » : la case et ses 4 voisines doivent être libres (pas de coupe d'angle dans un chambranle)
      if (bl[off + z0 * w + x0]) return false;
      if (x0 > 0 && bl[off + z0 * w + x0 - 1]) return false;
      if (x0 < w - 1 && bl[off + z0 * w + x0 + 1]) return false;
      if (z0 > 0 && bl[off + (z0 - 1) * w + x0]) return false;
      if (z0 < nz - 1 && bl[off + (z0 + 1) * w + x0]) return false;
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

  // Relâche un voisin : coût g, estimation h (distance monde au but, en cases de base).
  relax(cur, ni, step, wx, wz, sid) {
    if (this.blocked[ni] || this.closed[ni] === sid) return;
    const g = this.g[cur] + step;
    if (this.open[ni] === sid && g >= this.g[ni]) return;
    this.open[ni] = sid; this.g[ni] = g; this.parent[ni] = cur;
    // but à l'étage : en bas on vise d'abord l'escalier du bâtiment (sinon la recherche s'étale sur toute la carte)
    const via = ni < this.N && this.viaX === this.viaX, ax = Math.abs(wx - (via ? this.viaX : this.gwx)), az = Math.abs(wz - (via ? this.viaZ : this.gwz));
    this.push(ni, g + ((Math.max(ax, az) + 0.414 * Math.min(ax, az)) / this.cell + (via ? this.hBias : 0)) * this.hw);
  }

  // Chemin A* de (sx,sz[,sy]) vers (gx,gz[,gy]) ; écrit des identifiants de nœuds dans `out` (lissés), retourne le nombre (0 = échec).
  find(sx, sz, gx, gz, out, sy, gy) {
    const n = this.n, N = this.N, C = this.C;
    const start = this.nearestFree(this.nodeAt(sx, sz, sy)), goal = this.nearestFree(this.nodeAt(gx, gz, gy));
    if (start < 0 || goal < 0) return 0;
    if (start === goal) { out[0] = goal; return 1; }
    const sid = ++this.sid, cell = this.cell, half = this.half;
    this.gwx = this.cx(goal); this.gwz = this.cz(goal);
    this.viaX = NaN; this.hBias = 0;
    if (goal >= N && goal < N + C) {
      const L = this.layers[this.nodeLayer[goal - N]], e = L.bi >= 0 ? this.entryB[L.bi] : this.entryT[L.ti];
      if (e !== undefined) { this.viaX = this.cx(e); this.viaZ = this.cz(e); this.hBias = Math.hypot(this.viaX - this.gwx, this.viaZ - this.gwz) / cell + 5 * L.f; }
    }
    this.hn = 0;
    this.g[start] = 0; this.parent[start] = -1; this.open[start] = sid;
    this.push(start, 0);
    let found = false, iter = 0;
    while (this.hn > 0 && iter++ < this.cap) {
      const cur = this.pop();
      if (this.closed[cur] === sid) continue;
      this.closed[cur] = sid;
      if (cur === goal) { found = true; break; }
      if (cur < N) { // case de base
        const cx = cur % n, cz = (cur / n) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          if (dx && dz && (this.blocked[cz * n + x] || this.blocked[z * n + cx])) continue; // pas de coupe d'angle
          this.relax(cur, z * n + x, dx && dz ? D2 : 1, -half + (x + 0.5) * cell, -half + (z + 0.5) * cell, sid);
        }
      } else if (cur < N + C) { // case d'étage
        const L = this.layers[this.nodeLayer[cur - N]], k = cur - L.off, cx = k % L.nx, cz = (k / L.nx) | 0, bl = this.blocked;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= L.nx || z >= L.nz) continue;
          if (dx && dz && (bl[L.off + cz * L.nx + x] || bl[L.off + z * L.nx + cx])) continue;
          this.relax(cur, L.off + z * L.nx + x, (dx && dz ? D2 : 1) * LC / cell, L.x0 + (x + 0.5) * LC, L.z0 + (z + 0.5) * LC, sid);
        }
      }
      const ls = this.links.get(cur);
      if (ls) for (let k = 0; k < ls.length; k += 2) this.relax(cur, ls[k], ls[k + 1], this.cx(ls[k]), this.cz(ls[k]), sid);
    }
    this.iters = iter;
    if (!found) return 0;
    let len = 0;
    for (let i = goal; i !== -1 && len < this.rev.length; i = this.parent[i]) this.rev[len++] = i;
    // rev[len-1] = départ ; lissage par ligne de vue (dans une même couche)
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
