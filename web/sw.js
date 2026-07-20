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

// --- Web Push (Fase 5): muestra la notificacion aunque la app este cerrada ---
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { texto: e.data && e.data.text ? e.data.text() : '' }; }
  const titulo = d.titulo || 'Iglesia';
  const opts = {
    body: d.texto || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: d.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(titulo, opts));
});

// Al tocar la notificacion: navega una pestaña abierta a la conversacion (o abre una nueva).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cli) => {
      for (const c of cli) {
        if ('focus' in c) {
          // navigate() puede no existir en navegadores viejos; si falla, igual enfocamos.
          if ('navigate' in c) { try { c.navigate(destino); } catch { /* ignorar */ } }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
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

  // Navegaciones (abrir la app): stale-while-revalidate.
  // Muestra el shell cacheado AL INSTANTE y actualiza en segundo plano,
  // así abrir la app no espera a la red (clave cuando Railway está lento/frío).
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then((cached) => {
        const red = fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copia));
          }
          return resp;
        }).catch(() => cached);
        return cached || red;
      })
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
