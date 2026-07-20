// ============================================================
//  Directorio de miembros + cumpleaños — pruebas (Task 1 y 2)
//  Cubre: privacidad de telefono/email (oculto por defecto, propio
//  siempre visible, NINGUN rol -ni pastor- ve lo oculto de otro),
//  PATCH /perfil solo el propio, cumpleaños del mes, generarCumpleanosHoy
//  (crea avisos + dedup en 2a corrida) y aislamiento entre iglesias.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken, SEM, generarCumpleanosHoy;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  ({ generarCumpleanosHoy } = await import('../src/directorio.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

function hoyMD() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { mm, dd };
}

test('esquema: persona tiene foto_url y toggles de privacidad (default 0 = oculto)', () => {
  const cols = db.prepare('PRAGMA table_info(persona)').all();
  const foto = cols.find(c => c.name === 'foto_url');
  const mt = cols.find(c => c.name === 'mostrar_telefono');
  const me = cols.find(c => c.name === 'mostrar_email');
  assert.ok(foto);
  assert.ok(mt);
  assert.ok(me);
});

test('GET /api/directorio: telefono/email de otra persona se oculta si su toggle esta en 0', async () => {
  db.prepare('UPDATE persona SET telefono = ?, email = ?, mostrar_telefono = 0, mostrar_email = 0 WHERE id = ?')
    .run('+56911111111', 'b@test.com', SEM.miembro2.id);

  const res = await fetch(base + '/api/directorio', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const lista = await res.json();
  const b = lista.find(p => p.id === SEM.miembro2.id);
  assert.ok(b, 'aparece en el listado');
  assert.equal(b.telefono, null);
  assert.equal(b.email, null);
});

test('GET /api/directorio: telefono/email de otra persona se muestra si su toggle esta en 1', async () => {
  db.prepare('UPDATE persona SET telefono = ?, email = ?, mostrar_telefono = 1, mostrar_email = 1 WHERE id = ?')
    .run('+56922222222', 'c@test.com', SEM.miembro2.id);

  const res = await fetch(base + '/api/directorio', { headers: H(SEM.miembro1) });
  const lista = await res.json();
  const b = lista.find(p => p.id === SEM.miembro2.id);
  assert.equal(b.telefono, '+56922222222');
  assert.equal(b.email, 'c@test.com');
});

test('GET /api/directorio: uno siempre ve su PROPIO telefono/email aunque los tenga ocultos', async () => {
  db.prepare('UPDATE persona SET telefono = ?, email = ?, mostrar_telefono = 0, mostrar_email = 0 WHERE id = ?')
    .run('+56933333333', 'yo@test.com', SEM.miembro1.id);

  const res = await fetch(base + '/api/directorio', { headers: H(SEM.miembro1) });
  const lista = await res.json();
  const yo = lista.find(p => p.id === SEM.miembro1.id);
  assert.equal(yo.telefono, '+56933333333');
  assert.equal(yo.email, 'yo@test.com');
  assert.equal(yo.es_yo, true);
});

test('GET /api/directorio: el PASTOR tampoco ve el telefono oculto de otro (sin excepcion de liderazgo)', async () => {
  db.prepare('UPDATE persona SET telefono = ?, mostrar_telefono = 0 WHERE id = ?')
    .run('+56944444444', SEM.miembro2.id);

  const res = await fetch(base + '/api/directorio', { headers: H(SEM.pastor) });
  const lista = await res.json();
  const b = lista.find(p => p.id === SEM.miembro2.id);
  assert.equal(b.telefono, null);
});

test('GET /api/directorio: incluye grupos (nombres) de cada persona', async () => {
  const res = await fetch(base + '/api/directorio', { headers: H(SEM.pastor) });
  const lista = await res.json();
  const m1 = lista.find(p => p.id === SEM.miembro1.id);
  assert.deepEqual(m1.grupos, ['Jovenes']);
});

test('GET /api/directorio?q= filtra por nombre', async () => {
  const res = await fetch(base + '/api/directorio?q=Ajeno', { headers: H(SEM.pastor) });
  const lista = await res.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, SEM.ajeno.id);
});

test('GET /api/directorio/perfil: devuelve mi perfil completo', async () => {
  const res = await fetch(base + '/api/directorio/perfil', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const p = await res.json();
  assert.equal(p.id, SEM.miembro1.id);
  assert.ok('telefono' in p);
  assert.ok('email' in p);
  assert.ok('cumple' in p);
  assert.ok('foto_url' in p);
  assert.ok('mostrar_telefono' in p);
  assert.ok('mostrar_email' in p);
});

test('PATCH /api/directorio/perfil: cambia solo MI fila (no la de otros); activar el toggle lo hace visible', async () => {
  let res = await fetch(base + '/api/directorio/perfil', {
    method: 'PATCH', headers: H(SEM.miembro1),
    body: JSON.stringify({ telefono: '+56955555555', mostrar_telefono: 1 })
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  // No afecto a miembro2
  const otro = db.prepare('SELECT telefono, mostrar_telefono FROM persona WHERE id = ?').get(SEM.miembro2.id);
  assert.equal(otro.telefono, null);
  assert.equal(otro.mostrar_telefono, 0);

  // miembro2 ahora ve el telefono de miembro1
  res = await fetch(base + '/api/directorio', { headers: H(SEM.miembro2) });
  const lista = await res.json();
  const m1 = lista.find(p => p.id === SEM.miembro1.id);
  assert.equal(m1.telefono, '+56955555555');
});

test('PATCH /api/directorio/perfil: valida cumple como YYYY-MM-DD o vacio', async () => {
  let res = await fetch(base + '/api/directorio/perfil', {
    method: 'PATCH', headers: H(SEM.miembro1), body: JSON.stringify({ cumple: 'no-es-fecha' })
  });
  assert.equal(res.status, 400);

  res = await fetch(base + '/api/directorio/perfil', {
    method: 'PATCH', headers: H(SEM.miembro1), body: JSON.stringify({ cumple: '1990-05-20' })
  });
  assert.equal(res.status, 200);
  const p = db.prepare('SELECT cumple FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(p.cumple, '1990-05-20');

  res = await fetch(base + '/api/directorio/perfil', {
    method: 'PATCH', headers: H(SEM.miembro1), body: JSON.stringify({ cumple: '' })
  });
  assert.equal(res.status, 200);
  const p2 = db.prepare('SELECT cumple FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(p2.cumple, '');
});

test('GET /api/directorio/cumpleanos: solo lista personas cuyo cumple es del mes actual', async () => {
  const { mm } = hoyMD();
  const otroMes = mm === '01' ? '02' : '01';
  db.prepare('UPDATE persona SET cumple = ? WHERE id = ?').run(`1990-${mm}-15`, SEM.miembro1.id);
  db.prepare('UPDATE persona SET cumple = ? WHERE id = ?').run(`1985-${otroMes}-10`, SEM.miembro2.id);

  const res = await fetch(base + '/api/directorio/cumpleanos', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, SEM.miembro1.id);
  assert.equal(lista[0].dia, 15);
});

test('aislamiento: alguien de otra iglesia no aparece ni es visible en el directorio', async () => {
  const ig2 = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA2')").run();
  const iglesia2Id = Number(ig2.lastInsertRowid);
  const p2 = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo, telefono, mostrar_telefono) VALUES (?,?,?,?,0,1,?,1)"
  ).run(iglesia2Id, 'externo', 'Externo', 'x', '+56900000000');
  const externoId = Number(p2.lastInsertRowid);

  const res = await fetch(base + '/api/directorio', { headers: H(SEM.pastor) });
  const lista = await res.json();
  assert.ok(!lista.find(p => p.id === externoId));

  // el externo, con token de su propia iglesia, tampoco ve a la iglesia SEM
  const resExt = await fetch(base + '/api/directorio', {
    headers: { Authorization: 'Bearer ' + signToken({ id: externoId, iglesia_id: iglesia2Id }) }
  });
  const listaExt = await resExt.json();
  assert.ok(!listaExt.find(p => p.id === SEM.miembro1.id));
});

// --- Task 2: cumpleaños automaticos ---

test('generarCumpleanosHoy: crea notificacion a los demas miembros cuando alguien cumple hoy; 2a corrida no duplica', () => {
  const { mm, dd } = hoyMD();
  db.prepare('UPDATE persona SET cumple = ? WHERE id = ?').run(`1990-${mm}-${dd}`, SEM.miembro1.id);

  const creados1 = generarCumpleanosHoy(SEM.iglesiaId);
  assert.ok(creados1 > 0, 'genero al menos una notificacion');

  // El cumpleañero no se auto-notifica
  const notifCumple = db.prepare("SELECT * FROM notificacion WHERE persona_id = ? AND tipo = 'cumple'").all(SEM.miembro1.id);
  assert.equal(notifCumple.length, 0);

  // Otros miembros de la iglesia SI reciben el aviso
  const notifPastor = db.prepare("SELECT * FROM notificacion WHERE persona_id = ? AND tipo = 'cumple'").all(SEM.pastor.id);
  assert.equal(notifPastor.length, 1);
  assert.match(notifPastor[0].titulo, /Miembro Uno/);

  // Segunda corrida el mismo dia: 0 nuevas (dedupe)
  const antes = db.prepare("SELECT COUNT(*) AS n FROM notificacion WHERE tipo = 'cumple'").get().n;
  const creados2 = generarCumpleanosHoy(SEM.iglesiaId);
  const despues = db.prepare("SELECT COUNT(*) AS n FROM notificacion WHERE tipo = 'cumple'").get().n;
  assert.equal(creados2, 0);
  assert.equal(despues, antes);
});

test('generarCumpleanosHoy: persona cuyo cumple es otro dia no genera nada', () => {
  const { mm, dd } = hoyMD();
  const otroDia = dd === '01' ? '02' : '01';
  db.prepare('UPDATE persona SET cumple = ? WHERE id = ?').run(`1990-${mm}-${otroDia}`, SEM.miembro1.id);

  const creados = generarCumpleanosHoy(SEM.iglesiaId);
  assert.equal(creados, 0);
  const notif = db.prepare("SELECT COUNT(*) AS n FROM notificacion WHERE tipo = 'cumple'").get().n;
  assert.equal(notif, 0);
});
