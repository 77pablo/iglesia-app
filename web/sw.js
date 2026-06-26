// ============================================================
//  Service Worker (Fase 4.2) — PWA basica
//  - Cachea el "shell" de la app (HTML/CSS/JS/iconos) para abrir offline.
//  - Navegaciones: network-first con fallback al shell cacheado.
//  - Estaticos del shell: cache-first.
//  - NO cachea /api ni /uploads (datos dinamicos): se dejan pasar a la red.
//    El contenido offline real (devocionales/notas) lo guarda la app en
//    IndexedDB/localStorage, no el service worker.
// ============================================================
// La versión se inyecta automáticamente al servir /sw.js desde el backend
// (basada en la fecha de los archivos del shell). Este valor es solo un fallback.
const CACHE = 'iglesia-shell-dev';
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/icon.svg',
  '/assets/himnario.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    // Tolerante a fallos: si un archivo del shell no carga, la instalación NO se cae.
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Solo gestionamos el mismo origen.
  if (url.origin !== self.location.origin) return;

  // Datos dinamicos: nunca cachear (siempre red).
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;

  // Navegaciones (abrir la app): network-first, cae al shell si no hay red.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Estaticos del shell: cache-first y se actualiza en segundo plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const red = fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      }).catch(() => cached);
      return cached || red;
    })
  );
});
