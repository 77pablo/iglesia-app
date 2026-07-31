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

const METODOS = ['_llenarQuienPago', 'cambioQuienPago', 'cambioFuente', '_ponerPagador', '_opcionAusente',
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
      _fuente: 'devuelve', _origenTocado: false,
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
  // El selector si sabe quien es (se comprueba ANTES de guardar: al guardar bien
  // se limpia el formulario): en cuanto alguien toque el origen, la deuda que
  // viaja es la de Maria y no la de quien esta corrigiendo.
  assert.equal(Org._pagador, '7');
  await Org.guardarGasto();

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].metodo, 'PATCH');
  // Ni siquiera se nombra al pagador: nadie toco el origen, asi que el PATCH
  // (parcial) deja fuente y pagado_por como estaban. La deuda sigue siendo de
  // Maria porque no se manda nada sobre ella.
  assert.deepEqual(llamadas[0].cuerpo, { concepto: 'Pan', monto: 5000 });
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
  assert.deepEqual(llamadas[0].cuerpo, { concepto: 'Bencina', monto: 20000 });

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

  assert.deepEqual(llamadas[0].cuerpo, { concepto: 'Pan', monto: 5000 });
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
  assert.deepEqual(llamadas[0].cuerpo, { concepto: 'Pan', monto: 5000 },
    'sin fuente ni pagado_por: el NULL se conserva y el historial no inventa un cambio de origen');
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
  assert.deepEqual(llamadas[0].cuerpo, { concepto: 'Carne', monto: 21000 });

  // Pero en cuanto la persona lo elige de verdad, si viaja.
  Org.editarGasto(12);
  Org.cambioFuente('devuelve', true);   // el onchange, aunque el valor no cambie
  await Org.guardarGasto();
  assert.deepEqual(llamadas[1].cuerpo, { concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: 7 });
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
