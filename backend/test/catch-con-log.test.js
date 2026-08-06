// ============================================================
//  Barrido: ningun catch que responda 500 puede tragarse el error en
//  silencio (backlog de las reviews del 5-ago).
//
//  En produccion (Render plan free) NO hay shell: los logs son lo unico que
//  existe para depurar. Un catch que hace ROLLBACK y devuelve un 500
//  generico sin console.error deja al que depura mirando "No se pudo X"
//  sin ninguna pista de por que — y ya habia ONCE asi, uno de ellos escrito
//  el mismo dia que este barrido (la convencion no estaba vigilada).
//
//  Regla: un catch cuyo cuerpo responde status(500) tiene que, o bien
//  console.error(e), o bien throw (el manejador global de server.js:419
//  loguea el stack y responde el JSON limpio). Los catch best-effort que no
//  responden 500 (borrar un archivo que quiza no existe, auditar tras
//  COMMIT) quedan fuera: no esconden un fallo que el cliente vaya a ver.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

// Extrae el cuerpo de cada catch: desde su '{' hasta el '}' balanceado,
// saltando strings y comentarios para no perder el balance.
function cuerposDeCatch(fuente) {
  const cuerpos = [];
  const re = /catch\s*(\([^)]*\))?\s*\{/g;
  let m;
  while ((m = re.exec(fuente)) !== null) {
    const inicio = m.index + m[0].length - 1; // el '{'
    let i = inicio, saldo = 0, comilla = null;
    for (; i < fuente.length; i++) {
      const c = fuente[i];
      if (comilla) {
        if (c === '\\') { i++; continue; }
        if (c === comilla) comilla = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { comilla = c; continue; }
      if (c === '/' && fuente[i + 1] === '/') { const nl = fuente.indexOf('\n', i); i = nl === -1 ? fuente.length : nl; continue; }
      if (c === '/' && fuente[i + 1] === '*') { const fin = fuente.indexOf('*/', i + 2); i = fin === -1 ? fuente.length : fin + 1; continue; }
      if (c === '{') saldo++;
      else if (c === '}') { saldo--; if (saldo === 0) break; }
    }
    cuerpos.push({
      cuerpo: fuente.slice(inicio, i + 1),
      linea: fuente.slice(0, m.index).split('\n').length
    });
  }
  return cuerpos;
}

test('todo catch que responde 500 loguea el error (console.error) o lo relanza al manejador global', () => {
  const archivos = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  assert.ok(archivos.length > 10, 'deberia haber decenas de modulos en src/');

  const mudos = [];
  let conQuinientos = 0;
  for (const f of archivos) {
    const fuente = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const { cuerpo, linea } of cuerposDeCatch(fuente)) {
      if (!cuerpo.includes('status(500')) continue;
      conQuinientos++;
      if (cuerpo.includes('console.error') || cuerpo.includes('throw')) continue;
      mudos.push(`${f}:${linea}`);
    }
  }
  assert.ok(conQuinientos > 5, 'el barrido deberia ver varios catch con 500; si ve muy pocos, el extractor se rompio');
  assert.deepEqual(mudos, [],
    'catch que responden 500 sin loguear ni relanzar (en Render no hay shell: sin console.error no hay NADA con que depurar ese fallo):\n' + mudos.join('\n'));
});

// Autocomprobacion: el extractor tiene que VER un catch mudo de mentira.
test('autocomprobación: el extractor marca un catch mudo y deja pasar el que loguea o relanza', () => {
  const mudo = `try { x(); } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'No' }); }`;
  const c1 = cuerposDeCatch(mudo);
  assert.equal(c1.length, 1);
  assert.ok(c1[0].cuerpo.includes('status(500') && !c1[0].cuerpo.includes('console.error'));

  const logueado = `try { x(); } catch (e) { console.error('[m]', e); return res.status(500).json({ error: 'No' }); }`;
  assert.ok(cuerposDeCatch(logueado)[0].cuerpo.includes('console.error'));

  const relanzado = `try { x(); } catch (e) { db.exec('ROLLBACK'); throw e; }`;
  assert.ok(cuerposDeCatch(relanzado)[0].cuerpo.includes('throw'));
});
