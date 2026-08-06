// ============================================================
//  Tanda F: el registro de actividad del pastor.
//  GET /api/admin/auditoria — la tabla auditoria recibe ~40 acciones de
//  todos los modulos y hasta hoy solo se veia por rendijas.
//  Spec: docs/superpowers/specs/2026-08-06-auditoria-general-design.md
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken, SEM;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM auditoria');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});
const pedir = (qs = '', quien = SEM.pastor, iglesiaId) =>
  fetch(base + '/api/admin/auditoria' + qs, { headers: H(quien, iglesiaId) });

// Apunte directo en la tabla, como lo escribiria auditar().
function apunte(accion, { actor = SEM.pastor.id, modulo = 'admin', detalle = '', iglesia = SEM.iglesiaId } = {}) {
  db.prepare('INSERT INTO auditoria (iglesia_id, actor_id, accion, modulo, detalle) VALUES (?,?,?,?,?)')
    .run(iglesia, actor, accion, modulo, detalle);
}

test('solo el pastor: un miembro y el obispo reciben 403', async () => {
  assert.equal((await pedir('', SEM.miembro1)).status, 403);
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.miembro2.id);
  assert.equal((await pedir('', SEM.miembro2)).status, 403,
    'el obispo es solo lectura en TODO el sistema pero Administracion queda fuera de su vista (decision del dueño)');
});

test('por defecto muestra los cambios y esconde lo rutinario; con todo=1 sale completo', async () => {
  apunte('movimiento_corregir', { modulo: 'tesoreria', detalle: 'monto: 5000 -> 50000' });
  apunte('login', { modulo: 'auth' });
  apunte('exportar_reporte', { modulo: 'reportes' });

  const porDefecto = await (await pedir()).json();
  assert.equal(porDefecto.items.length, 1, 'login y exportar_reporte son rutinarios: escondidos');
  assert.equal(porDefecto.items[0].accion, 'movimiento_corregir');
  assert.equal(porDefecto.items[0].detalle, 'monto: 5000 -> 50000');

  const completo = await (await pedir('?todo=1')).json();
  assert.equal(completo.items.length, 3, 'con todo=1 lo rutinario tambien sale');
});

test('filtro por persona, por modulo, y los dos combinados', async () => {
  apunte('editar_nino', { actor: SEM.lider.id, modulo: 'ninos' });
  apunte('publicar_anuncio', { actor: SEM.lider.id, modulo: 'anuncios' });
  apunte('editar_grupo', { actor: SEM.pastor.id, modulo: 'admin' });

  const porPersona = await (await pedir('?persona=' + SEM.lider.id)).json();
  assert.deepEqual(porPersona.items.map(i => i.accion).sort(), ['editar_nino', 'publicar_anuncio']);

  const porModulo = await (await pedir('?modulo=ninos')).json();
  assert.deepEqual(porModulo.items.map(i => i.accion), ['editar_nino']);

  const combinado = await (await pedir(`?persona=${SEM.lider.id}&modulo=anuncios`)).json();
  assert.deepEqual(combinado.items.map(i => i.accion), ['publicar_anuncio']);
});

test('no cruza iglesias: el apunte de otra congregacion no aparece', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRAAUD')").run().lastInsertRowid);
  apunte('eliminar_evento', { iglesia: otraIg, modulo: 'eventos' });
  apunte('editar_grupo', { modulo: 'admin' });

  const d = await (await pedir()).json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].accion, 'editar_grupo');
});

test('pagina de a 50 con hayMas, y el orden es de lo mas nuevo a lo mas viejo', async () => {
  for (let i = 0; i < 55; i++) apunte('editar_grupo', { detalle: 'n' + i });
  const p1 = await (await pedir()).json();
  assert.equal(p1.items.length, 50);
  assert.equal(p1.hayMas, true);
  assert.equal(p1.items[0].detalle, 'n54', 'lo mas nuevo primero');
  const p2 = await (await pedir('?offset=50')).json();
  assert.equal(p2.items.length, 5);
  assert.equal(p2.hayMas, false);
});

test('el actor anonimizado sale como "Usuario eliminado" y el inexistente como null', async () => {
  db.prepare("UPDATE persona SET nombre = 'Usuario eliminado' WHERE id = ?").run(SEM.miembro1.id);
  apunte('eliminar_cuenta', { actor: SEM.miembro1.id, modulo: 'cuenta' });
  apunte('editar_grupo', { actor: 999999 });

  const d = await (await pedir('?todo=1')).json();
  const porAccion = Object.fromEntries(d.items.map(i => [i.accion, i.actor]));
  assert.equal(porAccion.eliminar_cuenta, 'Usuario eliminado');
  assert.equal(porAccion.editar_grupo, null, 'sin fila de persona: null, y la pantalla pinta "(cuenta eliminada)"');
});

test('con offset=0 la respuesta trae actores y modulos para los selectores; con offset>0, no', async () => {
  apunte('editar_nino', { actor: SEM.lider.id, modulo: 'ninos' });
  apunte('editar_grupo', { actor: SEM.pastor.id, modulo: 'admin' });

  const p0 = await (await pedir()).json();
  assert.ok(Array.isArray(p0.actores) && p0.actores.length === 2);
  assert.ok(p0.actores.every(a => typeof a.id === 'number' && typeof a.nombre === 'string'));
  assert.deepEqual(p0.modulos.sort(), ['admin', 'ninos']);

  const p1 = await (await pedir('?offset=50')).json();
  assert.equal(p1.actores, undefined);
  assert.equal(p1.modulos, undefined);
});

// La lista de lo rutinario no puede envejecer en silencio: cada accion que
// esconde tiene que seguir existiendo en el codigo que la escribe. Si una se
// renombra o se retira, esta prueba obliga a actualizar la lista.
test('RUTINARIAS solo contiene acciones que el codigo escribe de verdad', async () => {
  const { RUTINARIAS } = await import('../src/admin.js');
  assert.ok(Array.isArray(RUTINARIAS) && RUTINARIAS.length >= 4);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readdirSync(path.join(__dirname, '..', 'src'))
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'))
    .join('\n');
  for (const accion of RUTINARIAS) {
    assert.ok(src.includes(`'${accion}'`),
      `RUTINARIAS esconde '${accion}' pero ningun modulo escribe esa accion: lista envejecida`);
  }
});
