// ============================================================
//  Cabo 3 (agosto): la hoja no se pisa. El PATCH del gasto acepta `visto`
//  (lo que la pantalla mostraba al abrir el ✏️); si ya no coincide con lo
//  guardado, otro lo cambio en el medio: 409 y no se aplica nada. Sin
//  `visto` (cliente viejo) todo sigue como hoy.
//  Spec: docs/superpowers/specs/2026-08-07-cabos-agosto-design.md
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',0,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre).lastInsertRowid);
  const liderId = nueva('lid', 'Lider');
  const anaId = nueva('ana', 'Ana');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, Number(g.lastInsertRowid));
  return { iglesiaId, liderId, anaId };
}

async function hoja(b, S) {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Almuerzo' }) });
  return { hojaId: (await res.json()).id, auth };
}

// Siembra un gasto y devuelve {id, visto} — visto es la instantanea que una
// pantalla recien abierta habria capturado.
async function gastoSembrado(b, S, auth, hojaId) {
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: S.anaId })
  });
  const { id } = await res.json();
  return { id, visto: { concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: S.anaId } };
}

// ---------- El otro proceso, de verdad ----------
// En produccion NO hay un solo proceso tocando este fichero: el contenedor
// arranca `litestream replicate ... -exec "node src/server.js"` (ver
// docker-entrypoint.sh:64), o sea Litestream con su propia conexion de
// escritura a la misma base. El hueco entre "mirar" y "escribir" no es un
// futurible.
//
// Y SI se puede provocar desde una prueba, con un solo proceso de Node: una
// segunda conexion DatabaseSync al mismo fichero es exactamente lo que seria
// otro proceso, y una costura sincrona en db.exec la dispara en el instante
// preciso. La costura es fea, pero es la unica pieza que no puede fabricarse
// de otra forma: el manejador es sincrono de punta a punta, asi que no hay
// ningun await donde colarse desde fuera. Vive dentro de un solo test y se
// desmonta en el finally.
//
// (Esta prueba nacio de una revision: la que habia antes miraba DONDE estaba
// una cadena de texto, y con eso `.get(gasto.id)` -> `.get(-999) || gasto`
// borraba el cabo entero sin despeinar la suite.)
async function conOtroProceso(fn) {
  const otro = new DatabaseSync(process.env.DB_PATH);
  otro.exec('PRAGMA busy_timeout = 5000');
  const execOrig = db.exec.bind(db);
  let colado = false;
  // Se cuela JUSTO al abrir la transaccion del manejador: eso es despues de su
  // lectura temprana y antes de que escriba. El mismo entrelazado que produce
  // un segundo worker.
  const armar = (accion) => {
    db.exec = (sql) => {
      if (!colado && /^BEGIN/i.test(sql.trim())) {
        colado = true;
        otro.exec('BEGIN IMMEDIATE');
        accion(otro);
        otro.exec('COMMIT');
      }
      return execOrig(sql);
    };
  };
  try {
    return await fn(armar, otro, () => colado);
  } finally {
    db.exec = execOrig;
    otro.close();
  }
}

test('otro proceso escribe entre la lectura y la transaccion: 409, y lo suyo queda intacto', async () => {
  const b = await servidor();
  const S = sembrar('TOC1');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);

  const { res, cuerpo, fila, colado } = await conOtroProceso(async (armar, otro, seColo) => {
    armar(o => o.prepare('UPDATE evento_org_gasto SET monto = 22000 WHERE id = ?').run(id));
    const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
      method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Carne asada', visto })
    });
    return {
      res, cuerpo: await res.json(), colado: seColo(),
      fila: otro.prepare('SELECT concepto, monto FROM evento_org_gasto WHERE id = ?').get(id)
    };
  });

  assert.equal(colado, true, 'sin costura disparada esta prueba no prueba nada');
  assert.equal(res.status, 409, `se esperaba 409 y llego ${res.status} ${JSON.stringify(cuerpo)}`);
  assert.equal(fila.monto, 22000, 'la correccion del otro proceso sigue en pie');
  assert.equal(fila.concepto, 'Carne', 'y la nuestra no se aplico');
});

test('otro proceso BORRA el gasto entre la lectura y la transaccion: 404 y ni un apunte', async () => {
  const b = await servidor();
  const S = sembrar('TOC2');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  const apuntes = () => db.prepare(
    "SELECT COUNT(*) n FROM auditoria WHERE iglesia_id = ? AND accion = 'editar_gasto'"
  ).get(S.iglesiaId).n;
  const antes = apuntes();

  const { res, colado } = await conOtroProceso(async (armar, otro, seColo) => {
    armar(o => o.prepare('DELETE FROM evento_org_gasto WHERE id = ?').run(id));
    const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
      method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Carne asada', visto })
    });
    return { res, colado: seColo() };
  });

  assert.equal(colado, true);
  // La misma respuesta que si el borrado hubiera llegado un instante ANTES: el
  // resultado no puede depender de en que lado de la lectura temprana cae.
  assert.equal(res.status, 404);
  assert.equal(apuntes(), antes, 'no se audita la correccion de una fila que ya no existe');
});

// Esta es la que separa "mover la comparacion" de "mover el calculo". El PATCH
// es parcial: lo que no viene se conserva de la fila. Si esa fila es la que se
// leyo al llegar la peticion, un PATCH que solo toca el monto reescribe el
// concepto viejo encima del que otro acaba de corregir — sin 409, porque el
// cliente viejo no manda instantanea y no hay nada que comparar.
test('lo que el PATCH no trae se conserva de la fila RELEIDA, no de la que se leyo al llegar', async () => {
  const b = await servidor();
  const S = sembrar('TOC3');
  const { hojaId, auth } = await hoja(b, S);
  const { id } = await gastoSembrado(b, S, auth, hojaId);   // "Carne", 20000

  const { res } = await conOtroProceso(async (armar, otro, seColo) => {
    armar(o => o.prepare("UPDATE evento_org_gasto SET concepto = 'Pan' WHERE id = ?").run(id));
    // Cliente viejo (sin `visto`) que solo corrige el monto.
    const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
      method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 25000 })
    });
    return { res, colado: seColo() };
  });

  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT concepto, monto FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Pan', 'el concepto que puso el otro sigue ahi: este PATCH no lo tocaba');
  assert.equal(fila.monto, 25000, 'y el monto es el que se pidio');
  const detalle = db.prepare(
    "SELECT detalle FROM auditoria WHERE iglesia_id = ? AND accion = 'editar_gasto' ORDER BY id DESC"
  ).get(S.iglesiaId).detalle;
  assert.match(detalle, /^"Pan" \$20\.000 -> "Pan" \$25\.000$/,
    'y el rastro dice el valor que de verdad habia antes, no uno que nunca estuvo');
});

// El BEGIN IMMEDIATE es la unica sentencia de este flujo capaz de esperar y
// despues lanzar. Aqui se provoca de verdad: el otro proceso se queda con el
// candado de escritura y no lo suelta. Lo que se comprueba es QUE MENSAJE lee
// la persona — con el BEGIN fuera del try, la excepcion se escapa al manejador
// generico de server.js y se convierte en "Ocurrió un error en el servidor",
// sin dejar en el registro la linea de esta ruta.
//
// De paso mide lo que cuesta: se baja el busy_timeout a 200 ms para que la
// prueba no tarde los 5 s reales del PRAGMA de db.js. Esos 5 s existen y, como
// DatabaseSync es sincrono, son 5 s con el bucle de eventos parado.
test('base ocupada al abrir la transaccion: contesta esta ruta, no el manejador generico', async () => {
  const b = await servidor();
  const S = sembrar('TOC4');
  const { hojaId, auth } = await hoja(b, S);
  const { id } = await gastoSembrado(b, S, auth, hojaId);

  const otro = new DatabaseSync(process.env.DB_PATH);
  let res, cuerpo, espera;
  try {
    otro.exec('BEGIN IMMEDIATE');          // y NO lo suelta: el candado se queda aqui
    db.exec('PRAGMA busy_timeout = 200');
    const t0 = Date.now();
    res = await fetch(b + `/api/organizacion/gastos/${id}`, {
      method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 25000 })
    });
    espera = Date.now() - t0;
    cuerpo = await res.json();
  } finally {
    db.exec('PRAGMA busy_timeout = 5000');
    otro.exec('ROLLBACK');
    otro.close();
  }

  assert.equal(res.status, 500);
  assert.equal(cuerpo.error, 'No se pudo corregir el gasto',
    'el mensaje de esta ruta; el generico significaria que la excepcion se escapo del try');
  assert.ok(espera >= 180, `tuvo que esperar el busy_timeout, y espero ${espera} ms`);
  assert.equal(db.prepare('SELECT monto FROM evento_org_gasto WHERE id = ?').get(id).monto, 20000,
    'y no se escribio nada');
});

test('el pisoton da 409 y la fila queda como la dejo el otro', async () => {
  const b = await servidor();
  const S = sembrar('VI1');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  // B corrige el monto mientras A tiene el ✏️ abierto…
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 22000 }) });
  // …y A guarda con la instantanea vieja.
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ concepto: 'Carne asada', visto })
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /recarga la hoja/);
  const fila = db.prepare('SELECT concepto, monto FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Carne', 'no se aplico nada de A');
  assert.equal(fila.monto, 22000, 'lo de B sigue intacto');
});

test('con la instantanea fresca (tras recargar) el PATCH pasa', async () => {
  const b = await servidor();
  const S = sembrar('VI2');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ concepto: 'Carne asada', visto })
  });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT concepto FROM evento_org_gasto WHERE id = ?').get(id).concepto, 'Carne asada');
});

test('sin visto (cliente viejo) el PATCH sigue funcionando como hoy', async () => {
  const b = await servidor();
  const S = sembrar('VI3');
  const { hojaId, auth } = await hoja(b, S);
  const { id } = await gastoSembrado(b, S, auth, hojaId);
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 22000 }) });
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Carne asada' })
  });
  assert.equal(res.status, 200, 'compatibilidad: backend y frontend pueden no llegar juntos');
});

// --- Higiene A4: la comparacion se mudo DENTRO de la transaccion que escribe.
// Antes se hacia contra una fila leida al llegar la peticion, o sea contra el
// pasado, y con Litestream escribiendo en el mismo fichero eso no era un
// futurible. Quien guarda ese cabo es la prueba de las dos conexiones de mas
// arriba; lo de aqui abajo es un complemento, no un sustituto.
//
// Aqui se lee el CODIGO, y hay que ser honesto sobre por que: no porque el
// comportamiento no se pueda probar —se prueba arriba—, sino porque quedan dos
// cosas que ninguna peticion HTTP distingue:
//   - que la transaccion sea IMMEDIATE y no un BEGIN diferido. En la prueba de
//     arriba el otro proceso confirma ANTES de nuestro BEGIN, asi que no hay
//     pelea por el candado y las dos formas dan 409 igual. La diferencia solo
//     aparece cuando los dos escriben a la vez, que es justo lo que una prueba
//     de un proceso no puede orquestar.
//   - que no reaparezca una SEGUNDA comparacion antes del BEGIN. Volveria a
//     decidir mirando el pasado, y la de dentro taparia el sintoma.
// (Una version anterior de este comentario decia que NINGUNA prueba de Node
// podia observar el hueco. Era falso, y una revision lo demostro escribiendo
// la prueba. Se deja escrito para que nadie herede la conclusion cómoda.)
test('el codigo: transaccion IMMEDIATE, y una sola comparacion, dentro', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'organizacion.js'), 'utf8');
  const begin = src.indexOf("db.exec('BEGIN IMMEDIATE')");
  assert.notEqual(begin, -1, 'la correccion del gasto abre su transaccion con BEGIN IMMEDIATE');
  // El cierre, sea cual sea su forma: se busca COMMIT con la comilla pegada
  // para no tropezar con la palabra COMMIT escrita en los comentarios.
  const commit = src.indexOf("COMMIT'", begin);
  const relee = src.indexOf('SELECT concepto, monto, fuente, pagado_por FROM evento_org_gasto');
  assert.ok(relee > begin && relee < commit,
    'la relectura de la fila vive entre el BEGIN y el cierre de la transaccion');
  const compara = src.indexOf('visto.concepto !== ');
  assert.ok(compara > begin && compara < commit,
    'y la comparacion con `visto` tambien');
  assert.equal(src.indexOf('visto.concepto !== ', compara + 1), -1,
    'y es UNICA: una segunda comparacion antes del BEGIN volveria a decidir mirando el pasado');
});

test('el 409 no deja rastro: el apunte de auditoria vive en la transaccion que se deshace', async () => {
  const b = await servidor();
  const S = sembrar('VI5');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  const apuntes = () => db.prepare(
    "SELECT COUNT(*) n FROM auditoria WHERE iglesia_id = ? AND accion = 'editar_gasto'"
  ).get(S.iglesiaId).n;
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 22000 }) });
  const antes = apuntes();
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Carne asada', visto })
  });
  assert.equal(res.status, 409);
  assert.equal(apuntes(), antes, 'una correccion que no se aplico no puede figurar en el historial de la hoja');
});

// Con la instantanea vieja Y datos incoherentes manda el 409, no el 400: la
// fila se mira antes de aplicarle nada encima. Es el orden util —"recarga la
// hoja" explica lo que pasa; "elige quien puso el dinero" culparia a quien
// escribio bien— y ademas es el unico coherente, porque la coherencia de lo
// que entra se juzga CONTRA la fila, y la fila es la releida.
//
// (Una version intermedia de este cabo movio solo la comparacion y dejaba los
// calculos colgando de la lectura temprana; con aquello esto respondia 400.
// Se fijo aqui como si fuera el precio a pagar. No lo era: era una mudanza a
// medias.)
test('instantanea vieja y datos incoherentes: manda el 409, y la fila no se toca', async () => {
  const b = await servidor();
  const S = sembrar('VI6');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  // B lo pasa a "lo pago la caja": la fila queda con fuente 'caja' y sin pagador.
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'caja' }) });
  // A, con su instantanea de antes, lo devuelve a 'devuelve' sin decir a quien:
  // incoherente contra la fila de ahora (no hay pagador que conservar).
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve', visto })
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /recarga la hoja/);
  const fila = db.prepare('SELECT fuente, pagado_por FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.fuente, 'caja', 'lo de B sigue intacto');
  assert.equal(fila.pagado_por, null);
});

test('el NULL tambien es un valor: pasar a "lo pago la caja" (fuente y pagador en null) se detecta', async () => {
  const b = await servidor();
  const S = sembrar('VI4');
  const { hojaId, auth } = await hoja(b, S);
  // Gasto sin fuente: el POST por defecto lo atribuye a quien lo registra
  // (el lider), asi que la instantanea fiel lleva fuente null y ESE pagador.
  const alta = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 3000 })
  });
  const { id } = await alta.json();
  const visto = { concepto: 'Pan', monto: 3000, fuente: null, pagado_por: S.liderId };
  // Control: con la instantanea fiel, corregir pasa (demuestra que el 409 de
  // abajo no sale de una instantanea mal sembrada).
  const ok = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 3500, visto })
  });
  assert.equal(ok.status, 200);
  const visto2 = { ...visto, monto: 3500 };
  // B lo pasa a "lo pago la caja" (fuente 'caja' y pagador null)…
  await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'caja' })
  });
  // …y A guarda con su instantanea de antes: fuente null vs 'caja' y pagador
  // vs null difieren — 409.
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ concepto: 'Pan integral', visto: visto2 })
  });
  assert.equal(res.status, 409);
});
