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
//
// ⚠️ Cuenta llaves caracter a caracter, SIN distinguir cadenas ni comentarios.
// Hoy funciona porque ninguno de estos metodos lleva una llave suelta dentro de
// un comentario, de una plantilla o de un string. Falla de dos maneras, y la
// segunda es la peligrosa:
//
//  - Se QUEDA CORTO (una `}` de mas): el metodo sale a medias y revienta como
//    SyntaxError dentro del new Function() de mas abajo. Ruidoso, se ve.
//  - Se DESBORDA (una `{` de mas, p. ej. dentro del HTML de una plantilla): el
//    recorte se traga cientos de lineas hasta el final del fichero. Nada
//    revienta, pero las pruebas que buscan una cadena DENTRO del metodo pasan a
//    buscarla en medio archivo y **dejan de detectar** lo que cubrian. Le pasa
//    en concreto a la invariante de `_render` del final: desbordado, encuentra
//    los `Org._origenTocado=` de editarGasto/cancelarEdicionGasto y ya no se
//    entera de que _render dejo de reponerlo.
//
// Si ves un error de sintaxis raro al tocar web/app.js, mira aqui antes que en
// ningun otro sitio. Y si tocas el HTML de _render, comprueba que esta prueba
// sigue fallando al quitarle a _render una de sus lineas de reseteo.
//
// El corte NO puede ser "para cuando j > i": un metodo escrito entero en una
// linea (`_recargar(){ ... },`) ya cierra su llave en la primera, y esperar a
// la siguiente se tragaba el metodo de al lado. Se corta cuando el saldo vuelve
// a cero HABIENDO abierto al menos una llave, que es lo mismo para los metodos
// de varias lineas y lo correcto para los de una.
// Y desde hoy el desbordamiento tampoco pasa callado: si el bucle llega al
// final del fichero sin que el saldo vuelva a cero, el assert del final lo
// dice en vez de devolver medio app.js.
function recortarMetodo(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^  (?:async )?${nombre}\\(`).test(l));
  assert.ok(i >= 0, `no se encontro el metodo ${nombre} en web/app.js`);
  let saldo = 0, abierta = false, cerro = false;
  const trozo = [];
  for (let j = i; j < lineas.length; j++) {
    trozo.push(lineas[j]);
    for (const ch of lineas[j]) { if (ch === '{') { saldo++; abierta = true; } else if (ch === '}') saldo--; }
    if (abierta && saldo <= 0) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte del metodo ${nombre} llego al final de web/app.js sin cerrar: el saldo de llaves nunca volvio a cero, asi que esto devolveria desde la declaracion hasta el final del fichero. Desbordado no revienta nada y las comprobaciones de abajo -- la invariante de _render la primera -- buscarian su cadena en medio app.js, en verde. Mira si ${nombre} lleva una llave suelta dentro de una plantilla, de una cadena o de un comentario: lo que hay que arreglar es el corte, no la prueba`);
  return trozo.join('\n');
}

// `_porQue` esta aqui porque guardarGasto lo llama para meter en su aviso el
// motivo concreto del fallo de recarga. Se recorta el REAL (no un doble): si
// faltara, guardarGasto reventaria con un TypeError a mitad y el aviso —lo
// unico que estos tests miden— no llegaria a emitirse nunca.
const METODOS = ['_llenarQuienPago', 'cambioQuienPago', 'cambioFuente', '_ponerPagador', '_opcionAusente',
  '_opcionSinRegistrar', 'editarGasto', 'cancelarEdicionGasto', 'guardarGasto', '_porQue'];

// _llenarQuienPago llama a quitarAusenteDuplicada, una funcion de nivel
// superior (fuera del objeto Org). recortarMetodo solo sabe cortar metodos
// indentados con dos espacios dentro de Org, asi que aqui se recorta aparte
// balanceando llaves igual que hace organizacion-selector.test.js, y se
// inyecta como declaracion real en el mismo scope del new Function() de
// abajo -- para que se ejecute la funcion REAL, no un mock.
function recortarFuncionTop(nombre) {
  const i = fuente.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar ${nombre}`);
  return fuente.slice(i, fin);
}
const QUITAR_AUSENTE_DUPLICADA = recortarFuncionTop('quitarAusenteDuplicada');

// ---------- DOM de mentira ----------
class FakeOption {
  constructor() { this.value = ''; this.textContent = ''; this.dataset = {}; this.padre = null; }
  remove() {
    if (!this.padre) return;
    const sel = this.padre;
    sel.options.splice(sel.options.indexOf(this), 1);
    // DOM real: quitar la <option> SELECCIONADA resetea el select a su
    // primera opcion. Este fixture NO imitaba eso (el punto ciego anotado el
    // 5-ago: cualquier prueba escrita encima heredaba el agujero — la linea
    // `sel.value=valor` de produccion no se ejercitaba nunca). Misma mecanica
    // que el fixture corregido de organizacion-selector.test.js.
    if (sel._value === this.value)
      sel._value = sel.options.length ? sel.options[0].value : '';
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
//
// `responde` es lo que contesta el api() de mentira a todo lo que NO es
// /directorio; por defecto acepta. Puede LANZAR, que es la unica manera de
// entrar en el `catch` de guardarGasto — mientras no lo hiciera, la rama del
// choque de ediciones no la ejercitaba nada.
//
// `recargaOk` es lo que el _recargar de mentira contesta: true = la hoja se
// releyo, false = el GET fallo y la pantalla se queda con la version vieja.
//
// Lo que la persona VE se recoge en tres listas, y las tres hacen falta:
//   toasts  — los avisos de 2,8 s que se van solos
//   modales — los que se quedan hasta que se pulsa "Entendido" (modalAviso)
//   avisos  — los dos juntos, EN ORDEN: cuantas cosas le aparecen en total
//
// Contarlos juntos no es un lujo: el candado de "un solo aviso" se escribio
// mirando solo los toasts de guardarGasto, con _recargar sustituida entera por
// recargarMock — que no avisaba de nada. En produccion el catch de Org.abrir SI
// avisa por su cuenta, asi que la prueba afirmaba "un aviso" donde habia dos.
// Por eso recargarMock imita ahora ese aviso (y lo calla cuando le piden
// silencio, igual que hace el metodo real: candado abajo, con el fuente
// recortado de verdad).
function montar({ gastos, directorio, miId = 3, responde, recargaOk = true }) {
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
  const toasts = [];
  const modales = [];
  const recargas = [];
  const emitirToast = t => { toasts.push(t); avisos.push(t); };
  const contexto = {
    $: id => nodos[id] || null,
    document: { createElement: () => new FakeOption() },
    toast: emitirToast,
    modalAviso: m => { modales.push(m); avisos.push(m); },
    conBoton: async (_b, fn) => fn(),
    botonActual: () => null,
    ME: { persona: { id: miId } },
    api: async (ruta, opts) => {
      if (ruta === '/directorio') return directorio();
      llamadas.push({ ruta, cuerpo: JSON.parse((opts && opts.body) || '{}'), metodo: opts && opts.method });
      if (responde) return responde();
      return { ok: true };
    },
    // El _recargar de verdad (releer la hoja y repintarla) necesita _render, y
    // montar _render aqui seria un simulacro tan grande que ya no probaria gran
    // cosa. Lo que SI se prueba de verdad, mas abajo y con el metodo recortado
    // del fuente, es que _recargar informa de si lo consiguio.
    // Imita las DOS cosas que hace el _recargar real: contesta si lo consiguio
    // y, si no, deja que `abrir` avise por su cuenta — salvo que le pidan
    // silencio, que es lo que hace quien va a dar su propio aviso.
    recargarMock: async (silencioso) => {
      recargas.push(silencioso === true);
      if (!recargaOk && silencioso !== true) emitirToast('Sin conexión');
      return recargaOk;
    }
  };
  const cuerpo = `
    ${QUITAR_AUSENTE_DUPLICADA}
    const Org = {
      _hoja: HOJA, _gastoEditando: null, _pagador: '', _personas: null,
      _fuente: 'devuelve', _origenTocado: false, _visto: null,
      _recargar(silencioso){ return recargarMock(silencioso); },
      ${METODOS.map(recortarMetodo).join('\n')}
    };
    return Org;`;
  const claves = Object.keys(contexto);
  const fabricar = new Function(...claves, 'HOJA', cuerpo);
  const Org = fabricar(...claves.map(k => contexto[k]), { id: 1, gastos });
  return { Org, sel, nodos, llamadas, avisos, toasts, modales, recargas };
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
  // El selector si sabe quien es (se comprueba ANTES de guardar: al guardar bien
  // se limpia el formulario): en cuanto alguien toque el origen, la deuda que
  // viaja es la de Maria y no la de quien esta corrigiendo.
  assert.equal(Org._pagador, '7');
  await Org.guardarGasto();

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].metodo, 'PATCH');
  // Ni siquiera se nombra al pagador: nadie toco el origen, asi que el PATCH
  // (parcial) deja fuente y pagado_por como estaban. La deuda sigue siendo de
  // Maria porque no se manda nada sobre ella. `visto` viaja siempre en una
  // correccion (cabo 3): es la instantanea de la fila que editarGasto capturo
  // AL ABRIR el ✏️ (con la Maria dada de baja, no con lo que haya en el
  // formulario), y el backend la usa para detectar si alguien mas cambio el
  // gasto mientras el ✏️ seguia abierto.
  assert.deepEqual(llamadas[0].cuerpo, {
    concepto: 'Pan', monto: 5000,
    visto: { concepto: 'Pna', monto: 5000, fuente: 'devuelve', pagado_por: 7 }
  });
});

test('si ademas cambia el origen, la deuda del DADO DE BAJA sigue siendo suya (no de quien edita)', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => [ABEL] });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  nodos['org-gasto-concepto'].value = 'Pan';
  nodos['org-gasto-fuente'].value = 'aporte';
  Org.cambioFuente('aporte', true);   // lo que hace el onchange del <select>
  await Org.guardarGasto();

  assert.equal(llamadas[0].cuerpo.fuente, 'aporte');
  assert.equal(llamadas[0].cuerpo.pagado_por, 7, 'el aporte lo puso Maria, no quien corrige');
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
  assert.equal(Org._pagador, 'caja', 'el selector si pudo representar a la caja');
  await Org.guardarGasto();

  // Sin tocar el origen no se manda: el backend conserva el 'caja' que ya tenia.
  // `visto` es la fila que editarGasto capturo al abrir el ✏️ (con el 'Bencna'
  // sin corregir, la caja como fuente y sin pagador): el backend la compara con
  // lo guardado para detectar si otra persona cambio el gasto entretanto.
  assert.deepEqual(llamadas[0].cuerpo, {
    concepto: 'Bencina', monto: 20000,
    visto: { concepto: 'Bencna', monto: 20000, fuente: 'caja', pagado_por: null }
  });

  // Y si ademas se toca el origen, lo que viaja sigue siendo la caja — no una
  // deuda con quien esta corrigiendo.
  Org.editarGasto(4);
  Org.cambioQuienPago('caja', true);
  await Org.guardarGasto();
  assert.equal(llamadas[1].cuerpo.fuente, 'caja');
  assert.equal(llamadas[1].cuerpo.pagado_por, undefined, 'un gasto de la caja no tiene a quien devolverle nada');
});

test('con /directorio caido, corregir el gasto de una persona no le cambia de dueño', async () => {
  const gasto = { id: 5, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => { throw new Error('sin red'); } });
  await Org._llenarQuienPago();

  Org.editarGasto(5);
  nodos['org-gasto-concepto'].value = 'Pan';
  assert.equal(Org._pagador, '7', 'con el directorio caido, la opcion inyectada mantiene a Maria');
  await Org.guardarGasto();

  // `visto` es la fila que editarGasto capturo al abrir el ✏️, antes de la
  // correccion de ortografia.
  assert.deepEqual(llamadas[0].cuerpo, {
    concepto: 'Pan', monto: 5000,
    visto: { concepto: 'Pna', monto: 5000, fuente: 'devuelve', pagado_por: 7 }
  });
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
  // `visto` es la fila (fuente y pagador NULL, el caso de un gasto historico)
  // que editarGasto capturo al abrir el ✏️, antes de que llegara el directorio.
  assert.deepEqual(llamadas[0].cuerpo, {
    concepto: 'Carne asada', monto: 20000,
    visto: { concepto: 'Carne', monto: 20000, fuente: null, pagado_por: null }
  }, 'sin fuente ni pagado_por: el backend deja los dos como estaban');
});

// --- 4) la cuarta puerta: mandar el origen sin que nadie lo haya tocado ----
//
// En produccion TODOS los gastos guardados tienen fuente = NULL ("no se sabe /
// no se especifico"). El formulario reenviaba siempre los cuatro campos, asi que
// la primera vez que alguien tocara el ✏️ sobre cualquiera de ellos, fuente
// pasaba de NULL a 'devuelve' y el historial de la hoja estampaba
//   "Pna" $5.000 -> "Pan" $5.000 · se devuelve a Maria -> se devuelve a Maria
// una linea que existe precisamente para avisar de que cambio quien puso el
// dinero, afirmando un cambio que nadie hizo. Y con dos personas editando la
// misma hoja, esos campos reconstruidos desde la instantanea vieja reponian una
// deuda que la otra acababa de borrar.
test('corregir SOLO el concepto de un gasto historico (fuente NULL) manda concepto y monto, y nada mas', async () => {
  // fuente NULL pero CON persona, que es el caso de produccion: los gastos
  // viejos guardaron a quien puso el dinero, pero no si habia que devolverselo.
  const gasto = { id: 11, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: null };
  const MARIA = { id: 7, nombre: 'María' };
  const { Org, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => [ABEL, MARIA] });
  await Org._llenarQuienPago();

  Org.editarGasto(11);
  nodos['org-gasto-concepto'].value = 'Pan';   // solo la falta de ortografia
  await Org.guardarGasto();

  assert.equal(llamadas[0].metodo, 'PATCH');
  // `visto` es la fila tal como la mostraba la pantalla al abrir el ✏️ (con la
  // fuente NULL de un gasto historico), no lo que la persona acaba de escribir.
  assert.deepEqual(llamadas[0].cuerpo, {
    concepto: 'Pan', monto: 5000,
    visto: { concepto: 'Pna', monto: 5000, fuente: null, pagado_por: 7 }
  }, 'sin fuente ni pagado_por: el NULL se conserva y el historial no inventa un cambio de origen');
});

test('el gasto historico se PINTA como "Se devuelve" pero eso no basta para mandarlo', async () => {
  const gasto = { id: 12, concepto: 'Carne', monto: 20000, pagado_por: 7, pagado_por_nombre: 'María', fuente: null };
  const MARIA = { id: 7, nombre: 'María' };
  const { Org, nodos, llamadas } = montar({ gastos: [gasto], directorio: async () => [ABEL, MARIA] });
  await Org._llenarQuienPago();

  Org.editarGasto(12);
  assert.equal(nodos['org-gasto-fuente'].value, 'devuelve', 'el desplegable no tiene un tercer estado que dibujar');
  nodos['org-gasto-monto'].value = '21000';
  await Org.guardarGasto();
  // `visto` es la fila real (fuente NULL): lo que se PINTA en el desplegable
  // ("Se devuelve", porque no hay un tercer estado que dibujar) no es lo que
  // el backend usa para comparar.
  assert.deepEqual(llamadas[0].cuerpo, {
    concepto: 'Carne', monto: 21000,
    visto: { concepto: 'Carne', monto: 20000, fuente: null, pagado_por: 7 }
  });

  // Pero en cuanto la persona lo elige de verdad, si viaja. El gasto de
  // Org._hoja no cambio (guardarGasto no lo muta; _recargar es un mock vacio
  // aqui), asi que el segundo editarGasto(12) captura el mismo `visto`.
  Org.editarGasto(12);
  Org.cambioFuente('devuelve', true);   // el onchange, aunque el valor no cambie
  await Org.guardarGasto();
  assert.deepEqual(llamadas[1].cuerpo, {
    concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: 7,
    visto: { concepto: 'Carne', monto: 20000, fuente: null, pagado_por: 7 }
  });
});

// --- el choque de ediciones: dos personas corrigiendo el mismo gasto -------
//
// El backend responde 409 cuando la instantanea que manda la pantalla ya no
// coincide con la fila guardada: otra persona la cambio mientras el ✏️ seguia
// abierto. Esa rama del `catch` no la ejercitaba NADA (el api de mentira solo
// sabia aceptar), asi que se podia borrar entera y la suite seguia verde.
//
// Lo que la persona ve al chocar tiene tres partes, y las tres importan: el
// aviso, la edicion cerrada y la hoja releida.
const MARIA = { id: 7, nombre: 'María' };
const choqueDeEdiciones = () => {
  // Tal como llega desde api(): el texto del backend y el codigo en `.status`.
  const e = new Error('Alguien cambió este gasto mientras lo mirabas — recarga la hoja');
  e.status = 409;
  throw e;
};

test('si otra persona cambio el gasto, la correccion se descarta: aviso, edicion cerrada y hoja releida', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, avisos, toasts, modales, recargas } = montar({
    gastos: [gasto], directorio: async () => [ABEL, MARIA], responde: choqueDeEdiciones
  });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  assert.equal(Org._gastoEditando, null,
    'la edicion tiene que cerrarse: con el ✏️ abierto, el siguiente intento reenvia la misma instantanea caduca y vuelve a chocar');
  assert.equal(Org._visto, null, 'y con ella la instantanea, que ya no describe nada que exista');
  assert.equal(recargas.length, 1, 'hay que releer la hoja: lo que la pantalla enseña ya no es lo que hay guardado');
  assert.equal(avisos.length, 1, 'un solo aviso, no un silencio ni tres');
  // Y por que canal sale. Este es el aviso mas consecuente de la hoja: la hoja
  // se acaba de repintar sola debajo de la persona, el formulario se vacio, y
  // el que tiene delante es el de ALTA. Si no lee que hay que volver a abrir el
  // ✏️, teclea ahi y crea un gasto duplicado. Un toast de 2,8 s no basta: la
  // propia app tiene modalAviso escrito para "avisos que la persona necesita
  // LEER", y este lo es mas que ninguno.
  assert.equal(modales.length, 1, 'el aviso del choque tiene que quedarse en pantalla hasta que se lea, no irse solo a los 2,8 s');
  assert.equal(toasts.length, 0, 'y no salir ademas por toast: es un aviso, no dos');
});

test('el aviso del choque dice que la correccion no se guardo, y no manda recargar algo ya recargado', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, modales } = montar({
    gastos: [gasto], directorio: async () => [ABEL, MARIA], responde: choqueDeEdiciones
  });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  const aviso = modales[0];
  // Al chocar se vacia el formulario: lo que la persona acababa de teclear
  // desaparece de la pantalla. Si el aviso no lo dice, se queda creyendo que
  // guardo.
  assert.match(aviso, /no se guard/i,
    'lo unico imprescindible: que su correccion NO quedo guardada y hay que volver a escribirla');
  assert.match(aviso, /otra persona|alguien/i, 'y por que: no fue un fallo suyo');
  // Y el paso que falta, que es el que evita el fallo que corrompe datos: para
  // cuando esto se lee, el formulario ya se vacio y _render lo repinto como el
  // de un gasto NUEVO (boton "Añadir"). Quien teclee ahi la correccion crea un
  // gasto DUPLICADO. Sin esta asercion se podia borrar esa mitad del mensaje y
  // la suite seguia verde.
  assert.match(aviso, /✏️/,
    'tiene que nombrar el ✏️: sin ese paso la persona teclea en el formulario de alta y duplica el gasto');
  // El texto del backend ("recarga la hoja") describe el momento ANTERIOR a
  // recargar; para cuando esto se lee, la linea de al lado ya la recargo. Si se
  // reemite tal cual, la persona recarga el navegador entero sin necesidad o se
  // queda esperando a hacer algo que ya esta hecho.
  assert.doesNotMatch(aviso, /recarga la hoja/i,
    'la hoja ya se releyo sola: pedirlo otra vez manda a la persona a hacer algo que ya esta hecho');
  assert.doesNotMatch(aviso, /409|conflict|patch|visto/i, 'nada de jerga ni de codigos');
});

// I3: la recarga tambien puede fallar (datos moviles). Si nadie mira si
// funciono, Org._hoja se queda con la version vieja INDEFINIDAMENTE y cada
// correccion siguiente captura una instantanea caduca, choca otra vez y vuelve
// a borrar lo tecleado. Unica salida real: recargar la pagina — y hay que
// decirlo, porque desde dentro no se distingue de la mala suerte.
test('si ademas falla la recarga, se le dice que recargue la pagina (o el choque se repite en bucle)', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, avisos, toasts, recargas } = montar({
    gastos: [gasto], directorio: async () => [ABEL, MARIA], responde: choqueDeEdiciones, recargaOk: false
  });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  assert.equal(recargas.length, 1, 'se intenta igual');
  // Es EL camino de los dos avisos apilados: `abrir` avisa por su cuenta desde
  // el catch ("Sin conexión") y guardarGasto avisa detras. Los dos a la vez
  // dejan el generico tapando al unico que dice que hacer, asi que aqui —y
  // solo aqui, porque guardarGasto da el suyo— se le pide silencio.
  assert.deepEqual(recargas, [true],
    'guardarGasto tiene que pedirle silencio a la recarga: si no, salen dos avisos y el generico tapa al que sirve');
  assert.equal(toasts.length, 0, 'nada de un "Sin conexión" apilado encima');
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /recarga(r)? la p[aá]gina/i,
    'con la hoja vieja en pantalla toda correccion vuelve a chocar: la unica salida es recargar el navegador');
  assert.match(avisos[0], /no se guard/i, 'sigue haciendo falta saber que la correccion se perdio');
  assert.doesNotMatch(avisos[0], /al d[ií]a|actualizada:/i,
    'no se puede afirmar que la hoja esta al dia cuando la recarga acaba de fallar');
});

// --- y el camino FELIZ, que tambien depende de esa recarga ---------------
//
// El PATCH sale bien y el GET siguiente falla (datos moviles). Org._hoja se
// queda con la fila de ANTES de la correccion, el proximo ✏️ captura esa
// instantanea caduca, el backend la compara con la fila que uno MISMO acaba de
// actualizar y responde 409: "Otra persona cambio este gasto" — acusando a un
// companero de lo propio y borrando lo tecleado. Hay que esperar la recarga
// (si no, ni siquiera se sabe si funciono) y, si fallo, decirlo.
test('si el gasto se guardo pero la hoja no se pudo releer, se dice — no se da por bueno y ya', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, toasts, modales, recargas } = montar({
    gastos: [gasto], directorio: async () => [ABEL, MARIA], recargaOk: false
  });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  assert.equal(recargas.length, 1);
  assert.equal(modales.length, 1,
    'con la hoja vieja en pantalla, el proximo ✏️ choca contra uno mismo: eso hay que leerlo, no verlo pasar en 2,8 s');
  assert.match(modales[0], /s[ií] se guard|s[ií] se anot/i,
    'lo primero, que su correccion NO se perdio: el PATCH salio bien');
  assert.match(modales[0], /recarga(r)? la p[aá]gina/i, 'y lo unico que lo arregla');
  assert.equal(toasts.length, 0,
    'y NADA de un "Gasto corregido" a secas: afirma que todo esta al dia cuando la hoja se quedo vieja');
});

test('cuando todo sale bien, el gasto corregido se avisa con un toast y sin modales', async () => {
  const gasto = { id: 9, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const { Org, nodos, toasts, modales } = montar({
    gastos: [gasto], directorio: async () => [ABEL, MARIA]
  });
  await Org._llenarQuienPago();

  Org.editarGasto(9);
  nodos['org-gasto-concepto'].value = 'Pan';
  await Org.guardarGasto();

  assert.deepEqual(toasts, ['Gasto corregido'], 'el camino feliz no puede volverse ruidoso: se va solo');
  assert.equal(modales.length, 0, 'ni parar a la persona con un modal cuando no ha pasado nada');
});

// Y el otro extremo de lo mismo, con el metodo REAL recortado del fuente: de
// nada sirve que guardarGasto pregunte si la recarga funciono si `abrir` se
// traga su propio fallo y contesta lo mismo pase lo que pase.
function montarRecarga({ api }) {
  const avisos = [];
  const pintados = [];
  const contexto = { api, toast: t => avisos.push(t), pintados };
  const cuerpo = `
    const Org = {
      _hoja: { id: 7 },
      _render(h){ pintados.push(h); },
      ${['abrir', '_recargar'].map(recortarMetodo).join('\n')}
    };
    return Org;`;
  const claves = Object.keys(contexto);
  const Org = new Function(...claves, cuerpo)(...claves.map(k => contexto[k]));
  return { Org, avisos, pintados };
}

test('cuando la hoja se relee de verdad, _recargar lo confirma', async () => {
  const { Org, pintados } = montarRecarga({ api: async () => ({ id: 7, cosas: [], gastos: [] }) });
  assert.equal(await Org._recargar(), true);
  assert.equal(pintados.length, 1, 'y la pantalla se repinta con lo que acaba de llegar');
});

test('si el GET de la hoja falla, _recargar lo dice en vez de tragarselo', async () => {
  const { Org, avisos, pintados } = montarRecarga({ api: async () => { throw new Error('Sin conexión'); } });
  assert.equal(await Org._recargar(), false,
    'quien recarga por un choque de ediciones tiene que poder enterarse de que la hoja NO se releyo');
  assert.equal(pintados.length, 0);
  assert.equal(avisos.length, 1, 'abrir sigue avisando por su cuenta: los otros cinco llamantes dependen de ese aviso');
});

// El otro lado del silencio: lo de arriba es un mock, esto es el fuente. Sin
// esta prueba, recargarMock podria imitar un `silencioso` que produccion no
// tiene y las tres pruebas del choque pasarian igual — que es exactamente la
// forma del candado falso que se esta corrigiendo.
test('_recargar(true) se calla: quien lo pide es porque va a dar su propio aviso', async () => {
  const { Org, avisos, pintados } = montarRecarga({ api: async () => { throw new Error('Sin conexión'); } });
  assert.equal(await Org._recargar(true), false, 'sigue contestando la verdad: la hoja NO se releyo');
  assert.equal(pintados.length, 0);
  assert.equal(avisos.length, 0,
    'el aviso generico de abrir tiene que callarse aqui: guardarGasto da uno mas concreto y dos apilados tapan al que sirve');
});

test('sin hoja abierta no hay nada que releer, y tampoco se miente diciendo que si', async () => {
  const { Org, avisos } = montarRecarga({ api: async () => ({ id: 7, cosas: [], gastos: [] }) });
  Org._hoja = null;
  assert.equal(await Org._recargar(), false);
  assert.equal(avisos.length, 0, 'no hay nada que avisar: no se intento abrir nada');
});

// --- el rotulo falso "(cuenta inactiva)" sobre alguien activo -------------
test('cuando llega el directorio con la persona ACTIVA, se quita la opcion inyectada', async () => {
  const gasto = { id: 13, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const MARIA = { id: 7, nombre: 'María' };
  let soltar;
  const lento = new Promise(res => { soltar = res; });
  const { Org, sel } = montar({ gastos: [gasto], directorio: () => lento });

  const llenando = Org._llenarQuienPago();   // igual que _render: SIN await
  Org.editarGasto(13);                       // el ✏️ ya es clicable
  assert.match(sel.querySelector('option[data-ausente]').textContent, /cuenta inactiva/);
  soltar([ABEL, MARIA]);                     // Maria si estaba activa
  await llenando;

  assert.equal(sel.querySelector('option[data-ausente]'), null,
    'el rotulo "(cuenta inactiva)" sobre una persona activa, y su nombre duplicado, tienen que irse');
  assert.equal(sel.options.filter(o => o.value === '7').length, 1);
  assert.equal(sel.value, '7');
});

test('el directorio no le pisa la eleccion a quien ya cambio el selector a mano', async () => {
  const gasto = { id: 14, concepto: 'Pna', monto: 5000, pagado_por: 7, pagado_por_nombre: 'María', fuente: 'devuelve' };
  const MARIA = { id: 7, nombre: 'María' };
  let soltar;
  const lento = new Promise(res => { soltar = res; });
  const { Org, sel } = montar({ gastos: [gasto], directorio: () => lento });

  const llenando = Org._llenarQuienPago();
  Org.editarGasto(14);
  sel.value = 'caja';
  Org.cambioQuienPago('caja', true);   // lo que hace el onchange
  soltar([ABEL, MARIA]);
  await llenando;

  assert.equal(sel.value, 'caja', 'lo que eligio la persona manda sobre lo que trae el directorio');
  assert.equal(Org._pagador, 'caja');
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
//
// ⚠️ Esto NO comprueba la impresion: no hay navegador ni CSS aqui. Comprueba
// solo el MARCADO — que el contenedor de los botones de cada gasto lleva escrita
// la clase `no-print`. Que esa clase oculte algo de verdad depende de la cascada
// de estilos, y eso esta verificado a mano, no aqui. Y como localiza el
// contenedor mirando tres lineas por encima del ✏️, meter una linea de mas entre
// medio la hace fallar sin que nada se haya roto. Se deja asi a proposito: es
// barato y avisa si alguien le quita la clase; si algun dia hace falta la
// garantia de verdad, hace falta una prueba de navegador.
test('el contenedor del ✏️ y el ✕ de cada gasto lleva la clase no-print en el marcado', () => {
  const i = lineas.findIndex(l => l.includes('Org.editarGasto(${g.id})'));
  assert.ok(i > 0, 'no se encontro el boton de corregir el gasto');
  const contenedor = lineas.slice(Math.max(0, i - 3), i).find(l => l.includes('<div class="row'));
  assert.ok(contenedor && contenedor.includes('no-print'),
    'la card de gastos es la que el modo rendicion vuelve visible: estos botones tienen que llevar no-print');
});

// --- la quinta puerta: estado de formulario que sobrevive al repintado -------
//
// `guardarGasto` ya NO relee el <select> del DOM (ese fue el arreglo de la
// cuarta puerta): lee `Org._fuente` y `Org._pagador`. Eso convierte el reseteo
// de `_render` en la unica cosa que mantiene sincronizados lo que la pantalla
// ENSEÑA y lo que se GUARDA — porque `_render` recrea el formulario entero y el
// <select> recreado nace siempre en 'devuelve'.
//
// Paso de verdad: `_fuente` se quedaba en 'aporte' de un gasto anterior y
// bastaba con anadir una cosa a llevar (que llama a _recargar -> _render) para
// que el gasto SIGUIENTE se guardara como donado mientras la pantalla decia que
// habia que devolverlo. Eso BORRA una deuda, en un gasto nuevo, con un solo
// usuario y sin ninguna carrera.
//
// Se comprueba sobre el codigo fuente y no ejecutando `_render` a proposito:
// esa funcion pinta la pantalla entera y montarla aqui seria un simulacro tan
// grande que ya no probaria gran cosa.
//
// ⚠️ SE HUMILLA IGUAL QUE EL TEST DE ABAJO: esto comprueba que _render CONTIENE
// una asignacion a cada campo espejado. NO comprueba que le asigne el valor
// correcto, ni que la asignacion se ejecute (pasaria con `Org._fuente='aporte'`
// o con la asignacion detras de un return temprano). Fija la invariante
// estructural —"todo campo espejado se repone donde el DOM se recrea"—, que es
// la forma que tuvo este fallo; no la correccion del valor.
//
// La lista NO esta escrita a mano: se DERIVA de lo que lee `guardarGasto`, que
// es quien define que es "estado espejado". Asi un sexto campo futuro queda
// cubierto sin que nadie se acuerde de venir a apuntarlo aqui — que es
// exactamente el descuido que dejo pasar la quinta puerta. Se excluyen las
// referencias con parentesis (`Org._recargar()`): son metodos, no estado.
test('_render repone cada campo espejado que lee guardarGasto (no el valor, solo que lo repone)', () => {
  const cuerpoRender = recortarMetodo('_render');
  const espejados = [...recortarMetodo('guardarGasto').matchAll(/Org\.(_[a-zA-Z]+)(\s*\()?/g)]
    .filter(m => !m[2])            // sin parentesis = propiedad, no llamada
    .map(m => m[1]);
  const unicos = [...new Set(espejados)];

  assert.ok(unicos.length >= 4, `se esperaban al menos 4 campos espejados, se derivaron ${unicos.length}`);
  for (const campo of unicos) {
    // RegExp desde string normal, NO desde plantilla: dentro de una plantilla
    // `\.` se resuelve a `.` y `\s` a `s`, y la expresion acaba siendo
    // /Org._fuentes*=/ — que pasa de casualidad y falla en falso en cuanto
    // alguien escriba `Org._fuente = 'devuelve'` con espacios.
    assert.match(cuerpoRender, new RegExp('Org\\.' + campo + '\\s*='),
      `_render no repone Org.${campo}: la pantalla dira una cosa y se guardara otra`);
  }
});
