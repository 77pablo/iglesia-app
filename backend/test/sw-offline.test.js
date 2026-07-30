// ============================================================
//  El service worker no puede dejar la app en blanco.
//
//  Dos fallos encadenados que se comian la PWA entera:
//
//   1. El precacheo usaba Promise.allSettled sobre TODO el shell, asi que
//      "lo cachee entero" y "se me cayo /app.js" acababan igual: instalando.
//      Y el handler de activate borra todas las caches con nombre distinto al
//      actual, y el nombre cambia en cada despliegue (server.js lo calcula con
//      la fecha de los archivos del shell). Escenario: despliegue nuevo mientras
//      alguien va en 3G irregular; entra index.html, se cae app.js, se activa
//      igual y se borra la cache anterior -que si tenia app.js-. Esa persona
//      abre luego la app sin cobertura y ve el armazon HTML sin una linea de JS:
//      pantalla en blanco para siempre. No es "modo offline", es la app rota.
//
//   2. Los dos handlers de fetch hacian `fetch(req).catch(() => cached)`. Sin
//      red y sin nada cacheado, `cached` es undefined y respondWith(undefined)
//      mata la peticion con la pantalla de error del navegador, no con el aviso
//      de "sin conexion" de la app.
//
//  Se comprueba EJECUTANDO web/sw.js dentro de un navegador de mentira (caches,
//  fetch, self y los eventos), no mirando si el archivo "contiene tal cadena":
//  el fallo viejo tambien contenia las cadenas correctas.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, '..', '..', 'web');
const FUENTE = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');

const ORIGEN = 'https://iglesia.test';
const CRITICOS = ['/index.html', '/app.js', '/styles.css'];
const OPCIONALES = ['/', '/manifest.json', '/icon.svg', '/assets/himnario.json'];
const TODO = CRITICOS.concat(OPCIONALES);
const CACHE_VIEJA = 'iglesia-shell-build-1';
const CACHE_NUEVA = 'iglesia-shell-build-2';

// Misma sustitucion que hace backend/src/server.js al servir /sw.js. Si alguien
// reescribe la linea del `const CACHE` y deja de casar, la version dejaria de
// cambiar en cada despliegue y nadie recibiria nunca el shell nuevo: por eso se
// exige aqui que la sustitucion de verdad haga algo.
function inyectarVersion(fuente, nombre) {
  const salida = fuente.replace(/const CACHE = '[^']*';/, `const CACHE = '${nombre}';`);
  assert.notEqual(salida, fuente, 'server.js ya no puede inyectar la version de cache en sw.js');
  return salida;
}

// --- Navegador de mentira -------------------------------------------------
// `red` = rutas que el servidor consigue servir en este escenario; lo que no
// este en la lista se comporta como una descarga que se cae (3G irregular).
function montarSW({ red = TODO, cachesIniciales = {} } = {}) {
  const almacen = new Map();
  for (const [nombre, rutas] of Object.entries(cachesIniciales)) {
    almacen.set(nombre, new Map(rutas.map((u) => [u, new Response('viejo ' + u, { status: 200 })])));
  }
  const borradas = [];

  const clave = (x) => {
    const u = typeof x === 'string' ? x : x.url;
    return u.startsWith('/') ? u : new URL(u).pathname;
  };
  const traer = async (x) => {
    const k = clave(x);
    if (!red.includes(k)) throw new TypeError('Failed to fetch ' + k);
    return new Response('contenido de ' + k, { status: 200 });
  };

  const abrir = (nombre) => {
    if (!almacen.has(nombre)) almacen.set(nombre, new Map());
    const m = almacen.get(nombre);
    return {
      async add(u) { m.set(clave(u), await traer(u)); },
      // addAll del navegador: se piden todas y no se guarda NINGUNA si alguna
      // falla. Que sea atomico es justo lo que hace de cerrojo en install.
      async addAll(us) {
        const rs = await Promise.all(us.map((u) => traer(u)));
        us.forEach((u, i) => m.set(clave(u), rs[i]));
      },
      async put(k, v) { m.set(clave(k), v); },
      async match(k) { return m.get(clave(k)); }
    };
  };

  const caches = {
    open: async (n) => abrir(n),
    keys: async () => [...almacen.keys()],
    delete: async (n) => { borradas.push(n); return almacen.delete(n); },
    async match(k) {
      for (const m of almacen.values()) { const r = m.get(clave(k)); if (r) return r; }
      return undefined;
    }
  };

  const handlers = {};
  const cuenta = { skipWaiting: 0, claim: 0 };
  const self = {
    location: { origin: ORIGEN },
    addEventListener: (t, f) => { (handlers[t] ||= []).push(f); },
    skipWaiting: async () => { cuenta.skipWaiting++; },
    clients: { claim: async () => { cuenta.claim++; }, matchAll: async () => [] },
    registration: { showNotification: async () => {} }
  };

  const ctx = vm.createContext({ self, caches, fetch: traer, Response, URL, console });
  vm.runInContext(inyectarVersion(FUENTE, CACHE_NUEVA), ctx, { filename: 'web/sw.js' });

  return { handlers, almacen, borradas, cuenta };
}

// El SW no devuelve nada: entrega su trabajo por waitUntil/respondWith.
const disparar = (sw, tipo, extra = {}) => {
  let entregado;
  const ev = { ...extra, waitUntil: (p) => { entregado = p; }, respondWith: (p) => { entregado = p; } };
  for (const h of sw.handlers[tipo] || []) h(ev);
  return entregado;
};
const instalar = (sw) => disparar(sw, 'install');
const activar = (sw) => disparar(sw, 'activate');
const pedir = (sw, url, mode) => disparar(sw, 'fetch', { request: { url: ORIGEN + url, method: 'GET', mode } });

const tiene = (sw, cache, ruta) => sw.almacen.has(cache) && sw.almacen.get(cache).has(ruta);

// --- 1. El fallo gordo: precacheo critico a medias --------------------------

test('si /app.js no llega, la version nueva NI activa NI borra la cache anterior', async () => {
  // 3G irregular en mitad de un despliegue: el HTML y el CSS entran, el JS no.
  const sw = montarSW({
    red: TODO.filter((u) => u !== '/app.js'),
    cachesIniciales: { [CACHE_VIEJA]: TODO }
  });

  await assert.rejects(instalar(sw), 'la instalacion DEBE caerse si falta un archivo critico');
  assert.equal(sw.cuenta.skipWaiting, 0, 'no se puede llamar a skipWaiting con el shell incompleto');
  assert.deepEqual(sw.borradas, [], 'no se puede borrar ninguna cache si la instalacion fallo');
  assert.ok(tiene(sw, CACHE_VIEJA, '/app.js'), 'la cache anterior tenia app.js y debe seguir teniendolo');
});

test('aunque el navegador activara una instalacion a medias, la cache vieja sobrevive', async () => {
  // Segundo cerrojo. Borrar caches es irreversible y sin cobertura no hay forma
  // de recuperarlas: activate solo debe purgar si el shell critico esta entero.
  const sw = montarSW({
    red: TODO.filter((u) => u !== '/styles.css'),
    cachesIniciales: { [CACHE_VIEJA]: TODO }
  });
  await assert.rejects(instalar(sw));
  await activar(sw);

  assert.deepEqual(sw.borradas, [], 'activate purgo con el shell critico incompleto');
  for (const u of CRITICOS) assert.ok(tiene(sw, CACHE_VIEJA, u), `se perdio ${u} de la cache anterior`);
});

test('y con la cache vieja intacta la app sigue abriendo sin red', async () => {
  // La prueba de que el cerrojo sirve para algo: despues del despliegue fallido
  // y sin cobertura, index.html y app.js siguen saliendo de la cache anterior.
  const sw = montarSW({
    red: TODO.filter((u) => u !== '/app.js'),
    cachesIniciales: { [CACHE_VIEJA]: TODO }
  });
  await assert.rejects(instalar(sw));
  await activar(sw);

  const sinRed = montarSW({ red: [], cachesIniciales: Object.fromEntries([[CACHE_VIEJA, TODO]]) });
  const html = await pedir(sinRed, '/', 'navigate');
  const js = await pedir(sinRed, '/app.js', 'no-cors');
  assert.match(await html.text(), /viejo \/index\.html/, 'la navegacion deberia servir el shell cacheado');
  assert.match(await js.text(), /viejo \/app\.js/, 'app.js deberia salir de la cache, no faltar');
});

// --- 2. Control positivo: lo opcional sigue siendo tolerante ---------------

test('si solo falla un icono, la version nueva SI se instala y se activa', async () => {
  // Si esto no pasara, el arreglo seria "no desplegar nunca": que falte el icono
  // o el manifest no rompe nada y no puede bloquear una version buena.
  const sw = montarSW({
    red: TODO.filter((u) => u !== '/icon.svg'),
    cachesIniciales: { [CACHE_VIEJA]: TODO }
  });

  await instalar(sw);
  assert.equal(sw.cuenta.skipWaiting, 1, 'con el shell critico entero hay que activar');
  for (const u of CRITICOS) assert.ok(tiene(sw, CACHE_NUEVA, u), `falta ${u} en la cache nueva`);

  await activar(sw);
  assert.deepEqual(sw.borradas, [CACHE_VIEJA], 'la cache vieja si debe limpiarse cuando todo fue bien');
  assert.equal(sw.cuenta.claim, 1);
});

test('con todo el shell disponible se cachea el shell entero', async () => {
  const sw = montarSW({ cachesIniciales: { [CACHE_VIEJA]: TODO } });
  await instalar(sw);
  for (const u of TODO) assert.ok(tiene(sw, CACHE_NUEVA, u), `falta ${u} en la cache nueva`);
});

// --- 3. respondWith nunca puede recibir undefined -------------------------

test('sin red y sin nada cacheado, la navegacion devuelve un aviso de verdad', async () => {
  // Primera visita con el movil sin datos: antes esto resolvia a undefined y el
  // navegador pintaba su propio "no se puede acceder a este sitio".
  const sw = montarSW({ red: [] });
  const p = pedir(sw, '/', 'navigate');
  assert.notEqual(p, undefined, 'el handler ni siquiera respondio a la navegacion');

  const res = await p;
  assert.ok(res instanceof Response, `respondWith recibio ${res} en vez de un Response`);
  const cuerpo = await res.text();
  assert.match(cuerpo, /Sin conexión/i, 'el aviso tiene que entenderse en castellano');
  assert.match(res.headers.get('content-type') || '', /text\/html/, 'una navegacion necesita HTML');
});

test('sin red y sin nada cacheado, un estatico devuelve un aviso de verdad', async () => {
  const sw = montarSW({ red: [] });
  const p = pedir(sw, '/app.js', 'no-cors');
  assert.notEqual(p, undefined, 'el handler ni siquiera respondio al estatico');

  const res = await p;
  assert.ok(res instanceof Response, `respondWith recibio ${res} en vez de un Response`);
  assert.match(await res.text(), /Sin conexión/i, 'el aviso tiene que entenderse en castellano');
});

test('ningun camino del handler de fetch puede resolver a undefined', async () => {
  // Barrido: con red, sin red, con cache y sin ella. /api y /uploads se dejan
  // pasar a la red (el handler no responde) y por eso se excluyen.
  for (const red of [TODO, []]) {
    for (const cachesIniciales of [{}, { [CACHE_VIEJA]: TODO }]) {
      const sw = montarSW({ red, cachesIniciales });
      for (const [url, mode] of [['/', 'navigate'], ['/app.js', 'no-cors'], ['/styles.css', 'no-cors'],
                                 ['/icon.svg', 'no-cors'], ['/assets/himnario.json', 'no-cors']]) {
        const res = await pedir(sw, url, mode);
        assert.ok(res instanceof Response,
          `${url} (red=${red.length ? 'si' : 'no'}, cache=${Object.keys(cachesIniciales).length ? 'si' : 'no'}) dio ${res}`);
      }
    }
  }
});

test('los datos dinamicos siguen sin pasar por el service worker', async () => {
  // /api y /uploads no se cachean nunca: si el SW respondiera, la gente veria
  // datos viejos de la iglesia (asistencias, mensajes) creyendolos actuales.
  const sw = montarSW();
  assert.equal(pedir(sw, '/api/me', 'cors'), undefined, 'el SW no puede responder a /api');
  assert.equal(pedir(sw, '/uploads/foto.jpg', 'no-cors'), undefined, 'el SW no puede responder a /uploads');
});
