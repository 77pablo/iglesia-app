// ============================================================
//  Las cosas a llevar tenían la asimetría que ESTADO.md dejó anotada: añadir,
//  quitar y marcar llamaban a `_recargar()` sin mirar el resultado. Si ese GET
//  falla, la lista se queda con la versión de ANTES y la persona ve el "Sin
//  conexión" genérico que suelta `abrir` por su cuenta — que dice que algo de
//  red falló, no que SU cambio sí quedó guardado. Y la lista no lo enseña, así
//  que lo natural es volver a añadir lo mismo: un duplicado en la hoja que el
//  grupo usa para repartirse qué lleva cada uno.
//
//  Mismo criterio que ya se aplicó al gasto (guardarGasto): esperar la recarga,
//  pedirla en SILENCIO para no apilar dos avisos, y si falla decir las dos
//  cosas — que el cambio sí se guardó y por qué no se ve — con el motivo
//  concreto que api() ya sabe, escapado.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
const lineas = fuente.split('\n');

// Mismo recortador de metodos de `const Org = {` que usan
// organizacion-pagador-selector.test.js:68 y organizacion-gasto-motivo-fallo,
// con la comprobacion anti-desbordamiento: un recorte que se pasa de largo
// mide codigo ajeno EN VERDE, y eso no puede depender de la suerte.
function recortarMetodo(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^  (?:async )?${nombre}\\s*\\(`).test(l));
  assert.ok(i >= 0, `no se encontro el metodo ${nombre} en el literal Org de web/app.js`);
  let saldo = 0, abierta = false, cerro = false;
  const trozo = [];
  for (let j = i; j < lineas.length; j++) {
    trozo.push(lineas[j]);
    for (const ch of lineas[j]) { if (ch === '{') { saldo++; abierta = true; } else if (ch === '}') saldo--; }
    if (abierta && saldo <= 0) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte de ${nombre} llego al final de web/app.js sin cerrar: devolveria medio fichero`);
  const hermanos = trozo.slice(1).filter(l => /^ {2}(?:async )?[a-zA-Z_$][\w$]*\s*\(/.test(l));
  assert.deepEqual(hermanos, [], `el recorte de ${nombre} se comio otro(s) metodo(s): ${hermanos.join(' | ')}`);
  return trozo.join('\n');
}

const METODOS = ['addCosa', 'toggleCosa', 'borrarCosa', '_porQue'];

function montar({ apiFalla = null, recargaOk = true, motivo = 'Espera un momento y vuelve a intentarlo' } = {}) {
  const visto = { toasts: [], avisos: [], recargas: [], llamadas: [] };
  const campos = {
    'org-cosa-nombre': { value: 'Vasos' },
    'org-cosa-cant': { value: '2' }
  };
  const contexto = {
    $: id => campos[id] || { value: '' },
    toast: m => visto.toasts.push(m),
    modalAviso: (m, t) => visto.avisos.push({ mensaje: m, titulo: t }),
    // El de verdad pregunta; aqui se acepta, que es el camino que se mide.
    // La promesa se GUARDA porque en la app real el callback corre desacoplado:
    // modalConfirm es sincrono y borrarCosa no lo espera, asi que `await
    // Org.borrarCosa(9)` vuelve antes de que el DELETE haya salido siquiera.
    // Sin esto el test medía el instante equivocado y fallaba en falso.
    modalConfirm: (_m, fn) => { visto.confirmado = fn(); },
    escHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    conBoton: async (_b, fn) => fn(),
    botonActual: () => null,
    api: async (ruta, opts) => {
      visto.llamadas.push({ ruta, metodo: (opts && opts.method) || 'GET' });
      if (apiFalla) throw apiFalla;
      return { ok: true };
    },
    recargarMock: async (silencioso) => {
      visto.recargas.push(silencioso === true);
      return recargaOk;
    }
  };
  const cuerpo = `
    const Org = {
      _hoja: { id: 3, cosas: [{ id: 9, nombre: 'Vasos' }] },
      _motivoFallo: ${recargaOk ? "''" : JSON.stringify(motivo)},
      _recargar(silencioso){ return recargarMock(silencioso); },
      ${METODOS.map(recortarMetodo).join('\n')}
    };
    return Org;`;
  const claves = Object.keys(contexto);
  const Org = new Function(...claves, cuerpo)(...claves.map(k => contexto[k]));
  return { Org, visto };
}

test('añadir una cosa y que la lista no se pueda releer: se dice que SÍ se añadió, y por qué no se ve', async () => {
  const { Org, visto } = montar({ recargaOk: false });
  await Org.addCosa();

  assert.equal(visto.avisos.length, 1, 'sin aviso, la persona no ve su cosa en la lista y la añade otra vez: duplicado');
  const m = visto.avisos[0].mensaje;
  assert.match(m, /s[ií] se a[ñn]adi/i, 'lo primero: su cambio NO se perdio');
  assert.match(m, /recarga/i, 'y el paso que falta para verlo');
  assert.ok(m.includes('Espera un momento'), 'con el motivo concreto que api() ya sabia: ' + m);
});

test('quitar una cosa y que la lista no se pueda releer: se dice que SÍ se quitó', async () => {
  const { Org, visto } = montar({ recargaOk: false });
  await Org.borrarCosa(9);
  await visto.confirmado;   // el callback del modal corre suelto: hay que esperarlo

  assert.equal(visto.avisos.length, 1, 'si no, la cosa sigue en pantalla y se vuelve a pulsar la ✕ sobre algo ya borrado');
  assert.match(visto.avisos[0].mensaje, /s[ií] se quit|s[ií] se borr/i);
});

test('la recarga se pide EN SILENCIO: un "Sin conexión" genérico taparía al aviso que sirve', async () => {
  const { Org, visto } = montar({ recargaOk: false });
  await Org.addCosa();
  assert.deepEqual(visto.recargas, [true],
    'es la misma leccion del gasto: dos avisos apilados de 2,8 s dejan arriba el generico y debajo el unico que dice que hacer');
  assert.deepEqual(visto.toasts, [], 'y ningun toast encima');
});

// toggleCosa es distinta a las otras dos: en el camino BUENO no recarga nada a
// proposito (la casilla ya se pinto sola). Su recarga vive en el catch, y esta
// ahi para devolver la pantalla a la verdad cuando el PATCH se rechaza. Si esa
// recarga tambien falla, la casilla se queda diciendo lo contrario de lo que el
// servidor tiene guardado — y quien mire la lista creera que ya esta llevado.
test('marcar una cosa: si el PATCH falla Y la lista tampoco se relee, se dice que lo que se ve no es lo guardado', async () => {
  const { Org, visto } = montar({
    apiFalla: Object.assign(new Error('No se pudo actualizar'), { status: 500 }),
    recargaOk: false
  });
  await Org.toggleCosa(9, true);

  assert.equal(visto.avisos.length, 1, 'la casilla miente y nadie lo dice');
  assert.match(visto.avisos[0].mensaje, /recarga/i);
  assert.equal(visto.toasts.length, 0, 'un toast encima del aviso vuelve a apilar dos mensajes');
  assert.deepEqual(visto.recargas, [true], 'y la recarga se pide en silencio');
});

test('marcar una cosa: si el PATCH falla pero la lista SÍ se relee, basta el toast de siempre', async () => {
  const { Org, visto } = montar({
    apiFalla: Object.assign(new Error('No se pudo actualizar'), { status: 500 }),
    recargaOk: true
  });
  await Org.toggleCosa(9, true);

  assert.deepEqual(visto.avisos, [], 'la lista ya se corrigio sola en pantalla: no hace falta parar a nadie');
  assert.deepEqual(visto.toasts, ['No se pudo actualizar']);
});

test('si todo va bien, nada de avisos: la lista repintada ya lo dice todo', async () => {
  const { Org, visto } = montar({ recargaOk: true });
  await Org.addCosa();
  assert.deepEqual(visto.avisos, []);
  assert.deepEqual(visto.toasts, []);
});

test('si lo que falla es el POST, sigue saliendo su error y NO un aviso de "sí se añadió"', async () => {
  const { Org, visto } = montar({ apiFalla: Object.assign(new Error('No se pudo añadir'), { status: 500 }) });
  await Org.addCosa();
  assert.deepEqual(visto.avisos, [], 'no se guardo nada: afirmar lo contrario seria mentir');
  assert.deepEqual(visto.toasts, ['No se pudo añadir']);
});

test('el motivo va ESCAPADO también aquí: modalAviso mete su texto crudo en innerHTML', async () => {
  const { Org, visto } = montar({ recargaOk: false, motivo: '<img src=x onerror=alert(1)>' });
  await Org.addCosa();
  const m = visto.avisos[0].mensaje;
  assert.ok(!m.includes('<img'), 'entra crudo en innerHTML: ' + m);
  assert.ok(m.includes('&lt;img'), 'tiene que aparecer, pero escapado: ' + m);
});
