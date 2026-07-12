/* DeepSignal service worker — network-first with cache fallback, so the console
   keeps operating in the field with no signal (OFFLINE MODE / reversionary mode).
   Network-first means a fresh deploy is always picked up when online; the cache
   only answers when the network fails. External buses (SIMBAD, Hips2Fits,
   Wikipedia, Open-Meteo, wheretheiss) are never intercepted. */
const CACHE = 'deepsignal-v1';
const PRECACHE = ['index.html', 'gallery.html', 'catalog.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});
