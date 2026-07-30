// ============================================================
//  El pastor no administra las cuentas que estan por encima de la suya.
//
//  PATCH /api/admin/usuarios/:id (activar/desactivar, marcar pastor) no llevaba
//  el guardia de rol_global que si tenia el reset de clave 30 lineas mas abajo
//  (admin.js: "Esta cuenta no se administra desde la iglesia"). Y el obispo del
//  seed vive con el iglesia_id de una iglesia real, asi que personaDeIglesia()
//  lo encontraba.
//
//  Consecuencia: el pastor veia el boton "Desactivar" en la fila del obispo y de
//  un clic dejaba a su supervisor fuera de TODAS las iglesias (auth.js rechaza
//  el token de una cuenta desactivada). El supervisado apagando al supervisor.
//  La variante {es_pastor:true} le metia un pastor extra a la iglesia.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db;
before(async () => { db = await cargarDb(); });

let base, srv;
async function servidor() {
  if (srv) return base;
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
after(() => srv && new Promise(r => srv.close(r)));

const tok = (personaId, iglesiaId) => signToken({ id: personaId, iglesia_id: iglesiaId });

// Una iglesia con su pastor, un feligres normal, y el obispo y el super-admin
// alojados en ella (asi es como los siembra seed.js: el obispo tiene iglesia_id).
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, esPastor, rolGlobal) => {
    const r = db.prepare(
      'INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, rol_global, activo) VALUES (?,?,?,?,?,?,1)'
    ).run(iglesiaId, usuario + '_' + codigo, nombre, 'x', esPastor, rolGlobal);
    return Number(r.lastInsertRowid);
  };
  return {
    iglesiaId,
    pastorId: nueva('pastor', 'Pastor', 1, null),
    feligresId: nueva('maria', 'Maria', 0, null),
    obispoId: nueva('obispo', 'Obispo', 0, 'obispo'),
    superId: nueva('superadmin', 'Super Admin', 0, 'super_admin')
  };
}

const patch = (b, S, id, body) => fetch(b + '/api/admin/usuarios/' + id, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const activo = id => db.prepare('SELECT activo FROM persona WHERE id = ?').get(id).activo;
const esPastorEnBd = id => db.prepare('SELECT es_pastor FROM persona WHERE id = ?').get(id).es_pastor;

test('el pastor NO puede desactivar al obispo', async () => {
  const b = await servidor();
  const S = sembrar('OB1');
  const res = await patch(b, S, S.obispoId, { activo: false });
  assert.equal(res.status, 403);
  assert.equal(activo(S.obispoId), 1, 'el obispo sigue pudiendo entrar');
});

test('el pastor NO puede desactivar al super-admin', async () => {
  const b = await servidor();
  const S = sembrar('OB2');
  const res = await patch(b, S, S.superId, { activo: false });
  assert.equal(res.status, 403);
  assert.equal(activo(S.superId), 1);
});

test('el pastor NO puede hacer pastor al obispo', async () => {
  const b = await servidor();
  const S = sembrar('OB3');
  const res = await patch(b, S, S.obispoId, { es_pastor: true });
  assert.equal(res.status, 403);
  assert.equal(esPastorEnBd(S.obispoId), 0, 'el obispo no gana permisos de la iglesia');
});

test('el pastor SI sigue administrando a un feligres normal', async () => {
  // Control positivo: el arreglo no puede consistir en bloquear el boton entero.
  const b = await servidor();
  const S = sembrar('OB4');
  const res = await patch(b, S, S.feligresId, { activo: false });
  assert.equal(res.status, 200);
  assert.equal(activo(S.feligresId), 0);
});
