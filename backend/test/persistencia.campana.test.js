// ============================================================
//  La campana no puede quedarse en 0 justo en la carga que DETECTA el fallo.
//
//  El panel del super-admin hace dos peticiones seguidas: primero
//  /superadmin/persistencia (que pinta la tarjeta roja) y despues
//  /notificaciones (que rellena el numero de la campana). El aviso, en cambio,
//  lo creaba solo vigilarPersistenciaThrottled, disparado y olvidado desde
//  /api/me: si esa comprobacion todavia no habia terminado cuando se pidieron
//  las notificaciones, la tarjeta salia roja y la campana en 0 -- la mitad de la
//  señal, y justo la mitad que se sigue viendo al cambiar de pantalla.
//
//  El arreglo: la propia peticion que descubre el fallo crea el aviso ANTES de
//  responder. Nada de sincronizar dos caminos; se usa el que ya tiene el
//  veredicto en la mano. La clave diaria de avisarSiMal sigue impidiendo que
//  esto duplique nada.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';
import { _limpiarCache } from '../src/persistencia.js';

let db, base, srv, superId;

// Deja el entorno en el unico escenario de fallo que se puede provocar sin
// contenedor: produccion sin variables de R2 = 'mal'/sin_configurar.
const previas = {};
function forzarMal() {
  for (const k of ['R2_BUCKET', 'LITESTREAM_ACCESS_KEY_ID', 'R2_ENDPOINT', 'NODE_ENV']) previas[k] = process.env[k];
  delete process.env.R2_BUCKET; delete process.env.LITESTREAM_ACCESS_KEY_ID; delete process.env.R2_ENDPOINT;
  process.env.NODE_ENV = 'production';
  _limpiarCache();
}
function restaurar() {
  for (const [k, v] of Object.entries(previas)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  _limpiarCache();
}

before(async () => {
  db = await cargarDb();
  superId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super_camp','Super','x','super_admin',1)"
  ).run().lastInsertRowid);
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => { restaurar(); return srv && new Promise(r => srv.close(r)); });

const cabeceras = () => ({ Authorization: 'Bearer ' + signToken({ id: superId, iglesia_id: null }) });
const pedirPersistencia = () => fetch(base + '/api/superadmin/persistencia', { headers: cabeceras() });
const pedirNotificaciones = () => fetch(base + '/api/notificaciones', { headers: cabeceras() }).then(r => r.json());

test('la peticion que descubre el fallo deja el aviso creado ANTES de responder', async () => {
  forzarMal();
  try {
    assert.equal((await pedirNotificaciones()).noLeidas, 0, 'de partida la campana esta limpia');

    // Exactamente la secuencia del panel: primero el estado, luego la campana.
    const e = await (await pedirPersistencia()).json();
    assert.equal(e.ok, false, 'comprobacion del propio test: este escenario si es un fallo');

    const n = await pedirNotificaciones();
    assert.equal(n.noLeidas, 1, 'la tarjeta roja y el numero de la campana deben aparecer en la MISMA carga');
  } finally { restaurar(); }
});

test('refrescar el panel el mismo dia no duplica el aviso', async () => {
  forzarMal();
  try {
    await pedirPersistencia();
    await pedirPersistencia();
    assert.equal((await pedirNotificaciones()).noLeidas, 1, 'la clave del dia sigue mandando: un aviso, no uno por refresco');
  } finally { restaurar(); }
});

test('con el respaldo sano, consultar el estado no crea ningun aviso', async () => {
  // Sin variables de R2 y FUERA de produccion el estado es no_aplica (gris),
  // que no es 'mal': mirar el panel no puede inventarse una alarma.
  for (const k of ['R2_BUCKET', 'LITESTREAM_ACCESS_KEY_ID', 'R2_ENDPOINT', 'NODE_ENV']) previas[k] = process.env[k];
  delete process.env.R2_BUCKET; delete process.env.LITESTREAM_ACCESS_KEY_ID; delete process.env.R2_ENDPOINT;
  delete process.env.NODE_ENV;
  _limpiarCache();
  try {
    const antes = (await pedirNotificaciones()).noLeidas;
    const e = await (await pedirPersistencia()).json();
    assert.equal(e.bd.estado, 'no_aplica');
    assert.equal((await pedirNotificaciones()).noLeidas, antes, 'un estado gris no avisa');
  } finally { restaurar(); }
});
