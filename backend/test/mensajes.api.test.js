import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';   // fija la BD temporal como efecto de import

let db;
before(async () => { db = await cargarDb(); });

test('esquema: existen las tablas del chat', () => {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.deepEqual(
    cols('conversacion').sort(),
    ['creado_en','creado_por','grupo_id','iglesia_id','id','tipo','titulo'].sort()
  );
  assert.deepEqual(
    cols('conversacion_miembro').sort(),
    ['conversacion_id','persona_id','rol','silenciado','ultimo_leido_mensaje_id'].sort()
  );
  assert.deepEqual(
    cols('mensaje').sort(),
    ['adjunto_tipo','adjunto_url','borrado','conversacion_id','creado_en','id','persona_id','texto'].sort()
  );
});
