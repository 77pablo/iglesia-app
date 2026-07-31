// ============================================================
//  La tercera puerta del fallo del dinero: el <select> de "quien puso".
//
//  El fallo original (corregir una falta de ortografia le adjudicaba la deuda a
//  quien corregia) se tapo dos veces: en el backend (el PATCH que no toca el
//  pagador si no se lo mandan) y en la pantalla (la opcion "Sin registrar quien
//  puso"). Seguia vivo por una tercera puerta, y esta no necesita ninguna
//  condicion de carrera:
//
//   1. Las opciones del selector salen de /directorio, que filtra activo = 1.
//      El PATCH no exige que el pagador siga activo, asi que un gasto puede
//      apuntar perfectamente a alguien dado de baja. Asignarle a un <select> un
//      valor que no tiene ninguna <option> deja selectedIndex = -1 y .value ===
//      '', y guardarGasto releia ese '' del DOM como "lo puse yo".
//   2. Si /directorio falla, la excepcion saltaba ANTES de pintar las opciones,
//      asi que el selector se quedaba solo con "Lo puse yo": a partir de ahi
//      corregir CUALQUIER gasto reasignaba, incluido uno de la caja.
//   3. Y el llenado del selector iba sin await: los ✏️ ya eran clicables
//      mientras el directorio viajaba, y al llegar el innerHTML se llevaba por
//      delante la opcion y la seleccion que hubiera puesto editarGasto.
//
//  Se ejecutan las funciones REALES sacadas de web/app.js contra un <select> de
//  mentira que reproduce la unica regla que importa: asignar un valor que no
//  existe entre las opciones deja el selector vacio. Comprobar que el archivo
//  "ya no contiene tal cadena" pasaria igual con el arreglo mal escrito.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');
const lineas = fuente.split('\n');

// Recorta un metodo del objeto literal Org (indentado con dos espacios),
// balanceando llaves hasta cerrarlo.
function recortarMetodo(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^  (?:async )?${nombre}\\(`).test(l));
  assert.ok(i >= 0, `no se encontro el metodo ${nombre} en web/app.js`);
  let saldo = 0;
  const trozo = [];
  for (let j = i; j < lineas.length; j++) {
    trozo.push(lineas[j]);
    for (const ch of lineas[j]) { if (ch === '{') saldo++; else if (ch === '}') saldo--; }
    if (j > i && saldo <= 0) break;
  }
  return trozo.join('\n');
}

const METODOS = ['_llenarQuienPago', 'cambioQuienPago', '_ponerPagador', '_opcionAusente',
  '_opcionSinRegistrar', 'editarGasto', 'cancelarEdicionGasto', 'guardarGasto'];

// ---------- DOM de mentira ----------
class FakeOption {
  constructor() { this.value = ''; this.textContent = ''; this.dataset = {}; this.padre = null; }
  remove() {
    if (!this.padre) return;
    this.padre.options.splice(this.padre.options.indexOf(this), 1);
    this.padre = null;
  }
}
class FakeSelect {
  constructor() { this.options = []; this._value = ''; this.style = {}; }
  set innerHTML(html) {
    this.options = [];
    for (const m of html.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)) {
      const o = new FakeOption();
      o.value = m[1]; o.textContent = m[2]; o.padre = this;
      this.options.push(o);
    }
    this._value = this.options.length ? this.options[0].value : '';
  }
  appendChild(o) { o.padre = this; this.options.push(o); if (this.options.length === 1) this._value = o.value; }
  querySelector(sel) {
    if (sel === 'option[data-ausente]') return this.options.find(o => o.dataset.ausente != null) || null;
    const m = /^option\[value="(.*)"\]$/.exec(sel);
    if (m) return this.options.find(o => o.value === m[1]) || null;
    return null;
  }
  // La regla que lo desencadenaba todo: un valor sin <option> no se puede
  // seleccionar, y el navegador deja .value === '' (selectedIndex = -1).
  get value() { return this._value; }
  set value(v) { this._value = this.options.some(o => o.value === v) ? v : ''; }
}
class FakeInput {
  constructor(v) { this.value = v === undefined ? '' : v; this.style = {}; this.textContent = ''; }
  scrollIntoView() {}
}

// Monta un Org real con el DOM de mentira. `directorio` es una funcion que
// devuelve la promesa de /directorio (puede rechazar, o tardar).
function montar({ gastos, directorio, miId = 3 }) {
  const sel = new FakeSelect();
  // Estado de partida: el <select> del HTML trae solo "Lo puse yo".
  sel.innerHTML = '<option value="">Lo puse yo</option>';
  const nodos = {
    'org-gasto-quien': sel,
    'org-gasto-fuente': new FakeInput('devuelve'),
    'org-gasto-concepto': new FakeInput(''),
    'org-gasto-monto': new FakeInput(''),
    'org-gasto-guardar': new FakeInput(''),
    'org-gasto-cancelar': new FakeInput('')
  };
  const llamadas = [];
  const avisos = [];
  const contexto = {
    $: id => nodos[id] || null,
    document: { createElement: () => new FakeOption() },
    toast: t => avisos.push(t),
    conBoton: async (_b, fn) => fn(),
    botonActual: () => null,
    ME: { persona: { id: miId } },
    api: async (ruta, opts) => {
      if (ruta === '/directorio') return directorio();
      llamadas.push({ ruta, cuerpo: JSON.parse((opts && opts.body) || '{}'), metodo: opts && opts.method });
      return { ok: true };
    }
  };
  const cuerpo = `
    const Org = {
      _hoja: HOJA, _gastoEditando: null, _pagador: '', _personas: null,
      _recargar(){},
      ${METODOS.map(recortarMetodo).join('\n')}
    };
    return Org;`;
  const claves = Object.keys(contexto);
  const fabricar = new Function(...claves, 'HOJA', cuerpo);
  const Org = fabricar(...claves.map(k => contexto[k]), { id: 1, gastos });
  return { Org, sel, nodos, llamadas, avisos };
}

const ABEL = { id: 3, nombre: 'Abel' };

// --- 1) el pagador desactivado -------------------------------------------
test('corregir el concepto de un gasto de alguien DADO DE BAJA no le pasa la deuda a quien edita', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  // /directorio solo trae gente activa: Maria no sale.
  const { Org, sel, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => [ABEL] });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  // El selector SI puede representar a Maria (con su nombre, no un hueco).
  assert.equal(sel.value, '7');
  assert.match(sel.querySelector('option[data-ausente]').textContent, /María/);

  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].metodo, 'PATCH');
  assert.equal(llamadas[0].cuerpo.concepto, 'Pan');
  assert.equal(llamadas[0].cuerpo.pagado_por, 7, 'la deuda tiene que seguir siendo de Maria');
});

// --- 2) el directorio caido ----------------------------------------------
test('si /directorio falla, "La caja de la iglesia" sigue estando en el selector', async () => {
  const { Org, sel } = montar({ gastos: [], directorio: async () => { throw new Error('sin red'); } });
  await Org._llenarQuienPago();
  assert.ok(sel.options.some(o => o.value === 'caja'),
    'la opcion de la caja se pintaba dentro de la misma asignacion que se saltaba al fallar');
});

test('con /directorio caido, corregir un gasto DE LA CAJA lo deja pagado por la caja', async () => {
  const gasto = { id: 4, concepto: 'Bencna', monto: 20000, pagado_por: null, pagado_por_nombre: null, fuente: 'caja' };
  const { Org, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => { throw new Error('sin red'); } });
  await Org._llenarQuienPago();

  Org.editarGasto(4);
  nodos['org-gasto-concepto'].value = 'Bencina';
  await Org.guardarGasto();

  assert.equal(llamadas[0].cuerpo.fuente, 'caja');
  assert.equal(llamadas[0].cuerpo.pagado_por, undefined, 'un gasto de la caja no tiene a quien devolverle nada');
});

test('con /directorio caido, corregir el gasto de una persona no le cambia de dueño', async () => {
  const gasto = { id: 5, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => { throw new Error('sin red'); } });
  await Org._llenarQuienPago();

  Org.editarGasto(5);
  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  assert.equal(llamadas[0].cuerpo.pagado_por, 7);
});

// --- 3) la carrera con el llenado del selector ----------------------------
test('tocar ✏️ mientras el directorio viaja no deja el gasto historico en "Lo puse yo"', async () => {
  const gasto = { id: 2, concepto: 'Carne', monto: 20000, pagado_por: null, pagado_por_nombre: null, fuente: null };
  let soltar;
  const lento = new Promise(res => { soltar = res; });
  const { Org, sel, nodos, llamadas } = montar({ gastos: [gasto], directorio: () => lento });

  const llenando = Org._llenarQuienPago();   // igual que _render: SIN await
  Org.editarGasto(2);                        // el ✏️ ya es clicable
  assert.equal(sel.value, 'sin');
  soltar([ABEL]);                            // llega el directorio
  await llenando;

  assert.equal(sel.value, 'sin', 'el directorio no puede pisar la correccion en curso');
  nodos['org-gasto-concepto'].value = 'Carne asada';
  await Org.guardarGasto();
  assert.deepEqual(llamadas[0].cuerpo, { concepto: 'Carne asada', monto: 20000 },
    'sin fuente ni pagado_por: el backend deja los dos como estaban');
});

// --- lo que sigue funcionando igual --------------------------------------
test('un gasto nuevo sin tocar el selector lo sigue pagando quien lo registra', async () => {
  const { Org, nodos, llamadas } = montar({ gastos: [], directorio: async () => [ABEL] });
  await Org._llenarQuienPago();
  nodos['org-gasto-concepto'].value = 'Pan';
  nodos['org-gasto-monto'].value = '5000';
  await Org.guardarGasto();
  assert.equal(llamadas[0].metodo, 'POST', 'es un alta, no una correccion');
  assert.equal(llamadas[0].cuerpo.pagado_por, 3);
  assert.equal(llamadas[0].cuerpo.fuente, 'devuelve');
});

test('cambiar a mano el selector durante una correccion si cambia el pagador', async () => {
  const gasto = { id: 9, concepto: 'Pan', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, sel, llamadas } = montar({ gastos: [gasto], directorio: async () => [ABEL] });
  await Org._llenarQuienPago();
  Org.editarGasto(9);
  sel.value = 'caja';
  Org.cambioQuienPago('caja', true);   // lo que hace el onchange del <select>
  await Org.guardarGasto();
  assert.equal(llamadas[0].cuerpo.fuente, 'caja');
});

// --- el papel del tesorero ------------------------------------------------
test('el ✏️ y el ✕ de cada gasto no se imprimen en la rendicion', () => {
  const i = lineas.findIndex(l => l.includes('Org.editarGasto(${g.id})'));
  assert.ok(i > 0, 'no se encontro el boton de corregir el gasto');
  const contenedor = lineas.slice(Math.max(0, i - 3), i).find(l => l.includes('<div class="row'));
  assert.ok(contenedor && contenedor.includes('no-print'),
    'la card de gastos es la que el modo rendicion vuelve visible: estos botones tienen que llevar no-print');
});
