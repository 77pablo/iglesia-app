// ============================================================
//  Candado: en el PATCH /admin/usuarios/:id, ninguna guardia que RECHACE la
//  peticion puede vivir despues de una escritura en la BD.
//
//  El defecto que fija esta prueba: un PATCH con {activo:true, es_pastor:false}
//  sobre la propia cuenta escribia el `activo` y DESPUES chocaba con la guardia
//  de `es_pastor`, devolviendo 400. Un 400 tiene que significar "no hice nada";
//  ahi significaba "hice la mitad".
//
//  Hoy ese UPDATE concreto es inocuo, y conviene tener escrito por que: sobre
//  la propia cuenta `activo` solo puede escribirse a `true` (ponerlo a false da
//  400 antes, y el pastor que pide ya esta activo porque auth.js relee `activo`
//  en cada peticion), asi que el UPDATE no cambia ninguna fila. Es decir:
//  NINGUNA prueba de comportamiento puede distinguir el codigo bueno del malo
//  aqui. Por eso este candado mira la FORMA, y por eso existe: el dia que se
//  anada una guardia mas, o que `activo` deje de ser un no-op, el defecto deja
//  de ser inocuo y nadie se acordaria de esta nota.
//
//  Alcance a proposito: solo este handler. El barrido de clase sobre los 198
//  handlers de src/ ve ~20 sitios con esta forma —la mayoria son ramas
//  distintas, no escrituras seguidas de rechazo— y clasificarlos uno a uno es
//  una tanda propia, anotada en ESTADO.md.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin.js'), 'utf8');

// Recorta el registro completo de un handler: desde `r.<verbo>(` hasta el ')'
// balanceado, saltando strings y comentarios para no perder la cuenta.
// El flag `cerro` es la leccion del arnes de recortes: sin el, un balance que
// no dispara devuelve desde la declaracion hasta el final del fichero y las
// comprobaciones de abajo dejan de comprobar nada, en verde.
function recortarHandler(marca) {
  const inicio = fuente.indexOf(marca);
  assert.ok(inicio >= 0, `no se encontro ${marca} en src/admin.js`);
  // Empezar en el '(' de r.patch(, NO en el ultimo caracter de la marca: ahi
  // hay una comilla, y arrancar sobre ella hacia creer al bucle que abria una
  // cadena de texto. El recorte se desbordaba hasta handlers de mas abajo y la
  // prueba acusaba a este de un 4xx que era de otro.
  const abre = marca.indexOf('(');
  assert.ok(abre > 0, `la marca ${marca} tiene que incluir el parentesis de apertura`);
  let saldo = 0, comilla = null, cerro = false, fin = -1;
  for (let i = inicio + abre; i < fuente.length; i++) {
    const c = fuente[i];
    if (comilla) {
      if (c === '\\') { i++; continue; }
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { comilla = c; continue; }
    if (c === '/' && fuente[i + 1] === '/') { const nl = fuente.indexOf('\n', i); i = nl === -1 ? fuente.length : nl; continue; }
    if (c === '/' && fuente[i + 1] === '*') { const f = fuente.indexOf('*/', i + 2); i = f === -1 ? fuente.length : f + 1; continue; }
    if (c === '(') saldo++;
    else if (c === ')') { saldo--; if (saldo === 0) { cerro = true; fin = i; break; } }
  }
  assert.ok(cerro, `el recorte de ${marca} llego al final de src/admin.js sin cerrar el parentesis: devolveria medio fichero y esta prueba dejaria de cubrir lo que cubre, en verde`);
  const trozo = fuente.slice(inicio, fin + 1);
  // Cordura: un recorte que se desborda arrastra los handlers siguientes, y
  // entonces esta prueba acusa a este handler de un 4xx que es de otro. Que un
  // recorte se pase de largo tiene que hacer ruido SIEMPRE, no solo cuando por
  // suerte cae en rojo.
  const otros = trozo.slice(1).match(/\br\.(get|post|patch|put|delete)\s*\(/g);
  assert.equal(otros, null,
    `el recorte de ${marca} se comio ${otros?.length} registro(s) de handler mas (${otros?.join(', ')}): esta midiendo codigo que no es el suyo`);
  return trozo;
}

const RE_ESCRITURA = /db\.(prepare\(\s*['"`]\s*(UPDATE|INSERT|DELETE)|exec\()/i;
const RE_RECHAZO = /res\.status\(4\d\d\)/g;

// Devuelve null si esta bien; si no, los indices para explicar el fallo.
function rechazoDespuesDeEscribir(cuerpo) {
  const escritura = cuerpo.search(RE_ESCRITURA);
  if (escritura === -1) return null;
  let m, ultimo = -1;
  const re = new RegExp(RE_RECHAZO.source, 'g');
  while ((m = re.exec(cuerpo)) !== null) ultimo = m.index;
  if (ultimo <= escritura) return null;
  return { escritura, ultimo, linea: cuerpo.slice(0, ultimo).split('\n').length };
}

test('PATCH /admin/usuarios/:id: todas las guardias rechazan ANTES de tocar la base', () => {
  const cuerpo = recortarHandler("r.patch('/usuarios/:id'");
  const mal = rechazoDespuesDeEscribir(cuerpo);
  assert.equal(mal, null, mal && (
    'hay un res.status(4xx) DESPUES de la primera escritura en la BD (linea ' + mal.linea +
    ' del handler): con eso un rechazo puede dejar la mitad del cambio escrito. ' +
    'Las guardias van todas juntas arriba, antes del primer UPDATE.\n---\n' +
    cuerpo.slice(mal.escritura, mal.ultimo + 60)
  ));
});

// Autocomprobacion: el clasificador tiene que VER un caso malo de mentira, y
// dejar pasar el mismo codigo con la guardia movida arriba. Sin esto, el verde
// de arriba no distingue "no hay defecto" de "el detector se rompio".
test('autocomprobación: el clasificador marca escribir-y-luego-rechazar, y aprueba guardia-primero', () => {
  const malo = `(req, res) => {
    if (typeof activo === 'boolean') db.prepare('UPDATE persona SET activo = ?').run(1);
    if (p.id === yo) return res.status(400).json({ error: 'no' });
    res.json({ ok: true });
  }`;
  assert.notEqual(rechazoDespuesDeEscribir(malo), null, 'el clasificador no vio el rechazo posterior a la escritura');

  const bueno = `(req, res) => {
    if (p.id === yo) return res.status(400).json({ error: 'no' });
    if (typeof activo === 'boolean') db.prepare('UPDATE persona SET activo = ?').run(1);
    res.json({ ok: true });
  }`;
  assert.equal(rechazoDespuesDeEscribir(bueno), null, 'el clasificador marco como malo un handler con las guardias arriba');

  const sinEscritura = `(req, res) => { if (!p) return res.status(404).json({}); res.json({}); }`;
  assert.equal(rechazoDespuesDeEscribir(sinEscritura), null);
});
