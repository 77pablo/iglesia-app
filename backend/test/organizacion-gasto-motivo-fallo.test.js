// ============================================================
//  Cuando el gasto SÍ se guardó pero la hoja no se pudo releer, el aviso
//  decía "la hoja no se pudo actualizar. Recarga la página" y se tragaba el
//  motivo concreto que api() ya sabía: con un 429 la app tiene escrito
//  "Espera un momento", y la persona leía en su lugar "recarga la página" —
//  que es justo lo que NO hay que hacer cuando el servidor pide esperar.
//  Estaba anotado en ESTADO.md como "intercambio aceptado" a cambio de no
//  apilar dos avisos; se puede tener las dos cosas: un solo aviso, con el
//  motivo dentro.
//
//  Sobre el arnés, con lo que se comprobó y no con lo que parecía: recortar
//  métodos del literal `const Org = {` YA sabía hacerlo
//  `organizacion-pagador-selector.test.js:68`, y este fichero usa la misma
//  técnica (cortar cuando el saldo de llaves vuelve a cero habiendo abierto
//  alguna). Lo que ESTADO.md daba por imposible ya estaba resuelto ahí; lo que
//  aquí se añade es la comprobación anti-desbordamiento por hermanos, que
//  aquel no tiene, y que cazó un fallo real de este mismo arnés mientras se
//  escribía: con `_porQue` —un método de UNA línea— la primera versión del
//  corte no paraba nunca.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
const lineas = fuente.split('\n');

// Recorta un metodo del literal `const Org = {`: desde su declaracion (dos
// espacios de indentacion) hasta la llave que lo cierra, que en un literal de
// objeto es `  },`. Las dos comprobaciones de abajo son la leccion del arnes
// de recortes: quedarse corto es ruidoso (SyntaxError dentro del
// new Function), pero DESBORDARSE no revienta nada — se arrastran los metodos
// siguientes y la prueba mide codigo que no es el suyo, en verde.
function recortarMetodoDeOrg(nombre) {
  const decl = new RegExp(`^  (?:async )?${nombre}\\s*\\(`);
  const i = lineas.findIndex(l => decl.test(l));
  assert.ok(i >= 0, `no se encontro el metodo ${nombre} en el literal Org de web/app.js`);
  // Misma tecnica que organizacion-pagador-selector.test.js:68, y por su misma
  // razon: cortar cuando el saldo vuelve a cero HABIENDO abierto una llave vale
  // igual para el metodo largo y para el de UNA linea (`_porQue(){ ... },`).
  // La primera version de esto exigia la llave en linea propia y con `_porQue`
  // no paraba nunca — lo cazo el anti-desbordamiento de abajo, no la suerte.
  let saldo = 0, abierta = false, trozo = [], cerro = false;
  for (let j = i; j < lineas.length; j++) {
    const l = lineas[j];
    trozo.push(l);
    for (const ch of l) { if (ch === '{') { saldo++; abierta = true; } else if (ch === '}') saldo--; }
    if (abierta && saldo <= 0) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte del metodo ${nombre} llego al final de web/app.js sin cerrar: devolveria desde la declaracion hasta el final del fichero`);
  // Anti-desbordamiento: si el trozo arrastro la declaracion de OTRO metodo
  // hermano, esta midiendo codigo ajeno. Tiene que hacer ruido siempre, no
  // solo cuando por suerte caiga en rojo.
  const hermanos = trozo.slice(1).filter(l => /^ {2}(?:async )?[a-zA-Z_$][\w$]*\s*\(/.test(l));
  assert.deepEqual(hermanos, [],
    `el recorte de ${nombre} se comio la declaracion de otro(s) metodo(s) de Org: ${hermanos.join(' | ')}`);
  return trozo.join('\n');
}

// Monta el metodo recortado sobre dobles. Se ejecuta el codigo REAL de
// web/app.js; lo simulado es todo lo que lo rodea.
function montar({ respuestaApi, recargaOk, motivoRecarga }) {
  const visto = { toasts: [], avisos: [] };
  const campos = {
    'org-gasto-concepto': { value: 'Pan' },
    'org-gasto-monto': { value: '5000' }
  };
  const deps = {
    $: id => campos[id] || { value: '', style: {}, textContent: '' },
    toast: m => visto.toasts.push(m),
    modalAviso: (m, t) => visto.avisos.push({ mensaje: m, titulo: t }),
    escHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    api: async () => { if (respuestaApi instanceof Error) throw respuestaApi; return respuestaApi; },
    conBoton: async (_b, fn) => fn(),
    botonActual: () => ({}),
    ME: { persona: { id: 7 } },
    orgBase: {
      _hoja: { id: 3, gastos: [] },
      _gastoEditando: 42,          // corrigiendo un gasto
      _pagador: 'sin',
      _fuente: 'devuelve',
      _origenTocado: false,
      _visto: { monto: 1000 },
      cancelarEdicionGasto() {},
      // Doble de la recarga con la MISMA interfaz que la de verdad: devuelve
      // si/no y deja el motivo en Org._motivoFallo. Que `abrir` cumpla de
      // verdad esa interfaz lo comprueba el ultimo test de este fichero, con
      // el `abrir` real recortado — si no, esto solo probaria al doble.
      async _recargar() {
        if (recargaOk) { this._motivoFallo = ''; return true; }
        this._motivoFallo = motivoRecarga;
        return false;
      }
    }
  };
  const crear = new Function('deps', `
    const {$, toast, modalAviso, escHtml, api, conBoton, botonActual, ME} = deps;
    const Org = Object.assign({}, deps.orgBase, {
${recortarMetodoDeOrg('guardarGasto')}
${recortarMetodoDeOrg('_porQue')}
    });
    return Org;
  `);
  return { Org: crear(deps), visto, deps };
}

test('el arnés recorta un método de Org sin arrastrar a sus hermanos', () => {
  const trozo = recortarMetodoDeOrg('guardarGasto');
  assert.ok(trozo.startsWith('  async guardarGasto('), 'el recorte empieza en la declaracion');
  assert.ok(trozo.includes('org-gasto-concepto'), 'el recorte trae el cuerpo del metodo');
  assert.ok(trozo.trimEnd().endsWith('},'), 'el recorte acaba en la llave del metodo');
  assert.ok(trozo.split('\n').length < 200, 'un recorte de cientos de lineas seria un desbordamiento');
});

test('la hoja no se pudo releer: el aviso dice el MOTIVO concreto, no solo "recarga la página"', async () => {
  const { Org, visto } = montar({
    respuestaApi: { ok: true },
    recargaOk: false,
    motivoRecarga: 'Espera un momento y vuelve a intentarlo'
  });
  await Org.guardarGasto();

  assert.equal(visto.avisos.length, 1, 'un solo aviso, no dos apilados');
  const m = visto.avisos[0].mensaje;
  assert.ok(m.includes('sí se guardó') || m.includes('sí se anotó'),
    'lo primero sigue siendo que el dinero SI quedo anotado: ' + m);
  assert.ok(m.includes('Espera un momento'),
    'el motivo que api() ya sabia se perdia por el camino; con un 429 la app dice "espera" y la persona leia "recarga la pagina", que es lo contrario. Mensaje: ' + m);
});

test('el motivo del servidor va ESCAPADO: modalAviso mete su texto crudo en innerHTML', async () => {
  const { Org, visto } = montar({
    respuestaApi: { ok: true },
    recargaOk: false,
    motivoRecarga: '<img src=x onerror=alert(1)>'
  });
  await Org.guardarGasto();

  const m = visto.avisos[0].mensaje;
  assert.ok(!m.includes('<img'), 'el motivo entra crudo en innerHTML: es exactamente la puerta de XSS que ya mordio a este proyecto. Mensaje: ' + m);
  assert.ok(m.includes('&lt;img'), 'tiene que aparecer, pero escapado. Mensaje: ' + m);
});

// Sin este test, los de arriba solo probarian al doble de _recargar: es `abrir`
// quien tiene que dejar el motivo donde el aviso lo busca, y es un metodo real
// de Org que hasta ahora ningun arnes sabia recortar.
test('abrir() deja el motivo en Org._motivoFallo y sigue devolviendo un sí/no, no el motivo', async () => {
  const toasts = [];
  const deps = {
    api: async () => { const e = new Error('Espera un momento y vuelve a intentarlo'); throw e; },
    toast: m => toasts.push(m)
  };
  const crear = new Function('deps', `
    const {api, toast} = deps;
    const Org = Object.assign({ _render(){}, _motivoFallo:'x' }, {
${recortarMetodoDeOrg('abrir')}
    });
    return Org;
  `);
  const Org = crear(deps);

  const r = await Org.abrir(3, undefined, true);
  assert.equal(r, false, 'tiene que devolver un booleano: quien lo llama hace `if(alDia)`, y un texto no vacio siempre seria "si"');
  assert.equal(Org._motivoFallo, 'Espera un momento y vuelve a intentarlo');
  assert.deepEqual(toasts, [], 'silencioso: el aviso lo da quien mira el resultado, y apilar dos tapa al que sirve');

  // Y en silencio NO significa a ciegas: sin `silencioso` sigue avisando solo.
  const Org2 = crear(deps);
  await Org2.abrir(3);
  assert.deepEqual(toasts, ['Espera un momento y vuelve a intentarlo']);
});

test('una recarga que SÍ funciona limpia el motivo viejo: el aviso siguiente no hereda el de antes', async () => {
  const crear = new Function('deps', `
    const {api, toast} = deps;
    const Org = Object.assign({ _render(){}, _motivoFallo:'un fallo de hace media hora' }, {
${recortarMetodoDeOrg('abrir')}
    });
    return Org;
  `);
  const Org = crear({ api: async () => ({ id: 3, cosas: [], gastos: [] }), toast: () => {} });
  assert.equal(await Org.abrir(3), true);
  assert.equal(Org._motivoFallo, '', 'un motivo viejo pegado explicaria el fallo de hoy con la causa de ayer');
});

test('si la hoja se relee bien, no hay aviso ni motivo: solo el toast de siempre', async () => {
  const { Org, visto } = montar({ respuestaApi: { ok: true }, recargaOk: true });
  await Org.guardarGasto();
  assert.deepEqual(visto.avisos, [], 'nada que avisar cuando todo fue bien');
  assert.deepEqual(visto.toasts, ['Gasto corregido']);
});
