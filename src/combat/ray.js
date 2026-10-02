// Intersections rayon (direction normalisée). Retournent t ≥ 0 ou -1. Aucune allocation.
export function rayAabb(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, maxT) {
  let tmin = 0, tmax = maxT, t0, t1, t, inv;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
  else { inv = 1 / dx; t0 = (x0 - ox) * inv; t1 = (x1 - ox) * inv; if (t0 > t1) { t = t0; t0 = t1; t1 = t; } if (t0 > tmin) tmin = t0; if (t1 < tmax) tmax = t1; if (tmin > tmax) return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
  else { inv = 1 / dy; t0 = (y0 - oy) * inv; t1 = (y1 - oy) * inv; if (t0 > t1) { t = t0; t0 = t1; t1 = t; } if (t0 > tmin) tmin = t0; if (t1 < tmax) tmax = t1; if (tmin > tmax) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
  else { inv = 1 / dz; t0 = (z0 - oz) * inv; t1 = (z1 - oz) * inv; if (t0 > t1) { t = t0; t0 = t1; t1 = t; } if (t0 > tmin) tmin = t0; if (t1 < tmax) tmax = t1; if (tmin > tmax) return -1; }
  return tmin;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  let t = -b - Math.sqrt(disc);
  if (t < 0) t = 0;
  return t <= maxT ? t : -1;
}
