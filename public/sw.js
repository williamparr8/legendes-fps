// Cache hors-ligne / chargement rapide : fichiers hachés (assets/) en cache d'abord, textures et modèles en « cache puis mise à jour »,
// page d'accueil réseau d'abord (toujours la dernière version quand on est en ligne).
const V = 'lfps-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
const keep = (c, r, res) => { if (res && res.status === 200 && res.type === 'basic') c.put(r, res.clone()); return res; };
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  const p = u.pathname;
  if (/\/assets\//.test(p)) {
    e.respondWith(caches.open(V).then(async (c) => (await c.match(r)) || keep(c, r, await fetch(r))));
  } else if (/\/(tex|models)\//.test(p)) {
    e.respondWith(caches.open(V).then(async (c) => {
      const hit = await c.match(r);
      const net = fetch(r).then((res) => keep(c, r, res)).catch(() => hit);
      return hit || net;
    }));
  } else if (r.mode === 'navigate') {
    e.respondWith(caches.open(V).then(async (c) => {
      try { return keep(c, new Request(u.origin + u.pathname), await fetch(r)); }
      catch { return (await c.match(new Request(u.origin + u.pathname))) || Response.error(); }
    }));
  }
});
