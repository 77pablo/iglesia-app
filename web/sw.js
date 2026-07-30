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

// El shell va partido en dos porque no todos los archivos duelen igual cuando faltan.
//
// CRITICO: sin estos tres la app no es "una app en modo offline", es una pagina
// en blanco. index.html sin app.js pinta el armazon y ahi se queda para siempre.
// Se cachean de forma ATOMICA: o entran los tres o la instalacion se cae.
const SHELL_CRITICO = [
  '/index.html',
  '/app.js',
  '/styles.css'
];
// OPCIONAL: que falte el icono, el manifest o el himnario es una molestia, no una
// rotura; la app abre y funciona igual. Aqui si toleramos fallos.
// '/' va aqui a proposito aunque sirva el mismo HTML que /index.html: las
// navegaciones caen sobre caches.match('/index.html'), asi que perder la entrada
// de '/' no deja a nadie sin shell, y exigirla solo daria una razon mas para que
// la instalacion se cayera en una red mala.
const SHELL_OPCIONAL = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/assets/himnario.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Antes esto era un allSettled sobre TODO el shell, y allSettled no
      // distingue "lo cachee todo" de "fallo /app.js": instalaba igual, activaba
      // igual y el handler de activate borraba la cache vieja (que si tenia
      // app.js, porque el nombre de la cache cambia en cada despliegue).
      // Escenario real: despliegue nuevo mientras alguien va en 3G irregular.
      // Entra index.html, se cae /app.js, se borra lo anterior, y cuando esa
      // persona vuelve a abrir la app sin cobertura ve el HTML del shell y NADA
      // mas: pantalla en blanco permanente. No es modo offline, es la app rota.
      //
      // addAll es todo-o-nada: si uno de los criticos no llega, rechaza. Esa
      // promesa rechazada hace fracasar el install, asi que NO se llama a
      // skipWaiting, el SW nuevo no activa y el SW viejo -con su cache intacta-
      // sigue mandando. El navegador reintentara la instalacion mas adelante.
      await c.addAll(SHELL_CRITICO);
      // Si addAll dejase algo a medias en algun navegador daria igual: esta cache
      // solo se usa despues de activar, y sin instalacion no hay activacion.
      await Promise.allSettled(SHELL_OPCIONAL.map((u) => c.add(u)));
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Segundo cerrojo antes de tirar de la cadena. Borrar las caches viejas es
    // irreversible y offline no hay forma de recuperarlas, asi que solo se hace
    // si la cache nueva tiene de verdad el shell critico. Si por lo que sea se
    // activa una version a medio instalar (una entrada desalojada por falta de
    // espacio, por ejemplo), preferimos quedarnos con basura vieja de mas antes
    // que dejar a alguien sin app.
    const c = await caches.open(CACHE);
    const presentes = await Promise.all(SHELL_CRITICO.map((u) => c.match(u)));
    if (presentes.every(Boolean)) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    }
    return self.clients.claim();
  })());
});

// respondWith() NO admite undefined: si la promesa resuelve a undefined el
// navegador da por muerta la peticion y pinta SU pantalla de error de red, la de
// "no se puede acceder a este sitio", que a la gente le parece que la app se
// rompio. Pasaba siempre que se caia la red y ademas no habia nada cacheado
// (primera visita, o un archivo que nunca llego a entrar). Devolvemos un Response
// de verdad, en castellano, para que se entienda que es la conexion y no la app.
function respuestaSinConexion(esNavegacion) {
  const cuerpo = esNavegacion
    ? '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Sin conexión</title></head><body style="font-family:system-ui,sans-serif;' +
      'margin:0;display:grid;place-items:center;min-height:100vh;text-align:center;padding:1.5rem">' +
      '<div><h1 style="font-size:1.25rem;margin:0 0 .5rem">Sin conexión</h1>' +
      '<p style="margin:0 0 1rem;color:#555">No pudimos cargar la app porque no hay internet. ' +
      'Vuelve a intentarlo cuando tengas señal.</p>' +
      '<button onclick="location.reload()" style="padding:.6rem 1.2rem;font-size:1rem">Reintentar</button>' +
      '</div></body></html>'
    : 'Sin conexión: este archivo no está guardado en el teléfono y no hay internet para descargarlo.';
  return new Response(cuerpo, {
    status: 503,
    // Sin tilde a proposito: statusText solo admite caracteres ASCII y con la "ó"
    // el constructor de Response lanza. La tilde va en el cuerpo, que si la admite.
    statusText: 'Sin conexion',
    headers: {
      'Content-Type': esNavegacion ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

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
        }).catch(() => cached || respuestaSinConexion(true));
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
      }).catch(() => cached || respuestaSinConexion(false));
      return cached || red;
    })
  );
});
