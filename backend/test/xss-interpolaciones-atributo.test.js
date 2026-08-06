// ============================================================
//  Barrido: interpolaciones ${...} que forman EL VALOR de un atributo HTML.
//
//  Por qué existe esta prueba y no basta con xss-atributos.test.js:
//
//  xss-atributos.test.js prueba escJsAttr()/safeColor() invocándolos a mano
//  con cadenas de ataque, y un único patrón de texto que busca un filtro de
//  comillas hecho a mano DENTRO de un onclick. El fallo que se acaba de
//  arreglar (categoria/edad/hora sin escapar) no pasaba por esos ayudantes y
//  no estaba en un onclick, sino en el cuerpo de un innerHTML/atributo
//  value="...": ninguna de las dos comprobaciones lo tocaba. Una suite en
//  verde convivió meses con el fallo en producción.
//
//  Esta prueba no confía en una lista de patrones de ataque: recorre TODO
//  web/app.js con un tokenizador mínimo (respeta strings, comentarios,
//  regex y template literals anidados) y encuentra cada interpolación
//  ${...} cuyo valor es literalmente el contenido de un atributo entre
//  comillas dobles: `="${...}"` (todo el valor) o `="...${...}..."`
//  (mezclada con texto). Es la forma MÁS peligrosa -- basta una comilla
//  doble para salirse del atributo -- y la más acotada para barrer entera.
//
//  De las 908 interpolaciones ${...} que tiene hoy web/app.js, 232 arman el
//  valor de ALGÚN atributo entre comillas dobles. De esas, 137 (en 125
//  atributos distintos) son el ámbito de esta prueba: atributos "normales"
//  (value=, style=, class=, title=, id=...). Las otras 95 están dentro de un
//  manejador de evento (onclick=, onchange=, href="javascript:...") -- ahí
//  el dato entra en código JS, no en el valor plano del atributo, así que es
//  una categoría distinta (más cercana a escJsAttr()) que queda fuera a
//  propósito de este barrido. Las 676 restantes están en el cuerpo de texto,
//  fuera de cualquier atributo (${...} dentro de <div>, <b>, etc.): fuera de
//  esta prueba también, y son demasiadas para clasificar con el mismo rigor
//  en este mismo trabajo. Ver el informe de esta tarea para la decisión.
//
//  Qué cuenta como seguro (y por qué no me fío de esta lista sin más: cada
//  regla de abajo se corresponde con código real, comprobado leyendo
//  web/app.js, no con una suposición):
//   - Envuelto ENTERO en un ayudante que escapa: escHtml(), escJsAttr(),
//     safeColor(), money(), o encodeURIComponent() (neutraliza comillas al
//     codificar el componente de URL).
//   - Un acceso a propiedad que termina en .id o .length, o aritmética
//     entero±entero sobre un identificador: en este esquema (ver
//     backend/src/db.js) TODAS las columnas id son INTEGER, así que nunca
//     pueden traer una comilla.
//   - Una comparación (===, !==, ==, !=) entre dos identificadores/accesos:
//     el resultado siempre es el texto "true" o "false".
//   - Un ternario donde AMBAS ramas son, recursivamente, algo de esta lista
//     (incluyendo cadenas literales '...' o "...").
//
//  Lo que no encaja en ninguna regla anterior tiene que estar en
//  EXCEPCIONES, con un motivo concreto de por qué ese dato no puede venir de
//  una persona. Si la lista de excepciones creciera hasta hacerse ilegible,
//  la prueba deja de servir -- por eso cada entrada se valida por su TEXTO
//  COMPLETO de atributo (no solo el nombre de la variable): así una futura
//  interpolación distinta que por casualidad use el mismo nombre de
//  variable (n, r, c... son comunes en este archivo) no queda blanqueada
//  por error.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hallarAtributos, interpolacionesDelArchivo, esExprSegura } from './xss-analisis.js';
// El tokenizador y las reglas mecanicas viven en xss-analisis.js desde la
// tanda G (6-ago): los barridos de manejadores y de cuerpo de texto usan
// EXACTAMENTE el mismo mecanismo, en vez de tres copias que divergen.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
// CRLF -> LF: git puede sacar web/app.js con uno u otro fin de linea segun
// la maquina, y las firmas del barrido llevan posiciones/contexto del texto
// (sin normalizar, el mismo codigo daria firmas distintas segun el checkout).
const fuente = fs.readFileSync(APP_JS, 'utf8').replace(/\r\n/g, '\n');
// ------------------------------------------------------------
//  Excepciones: solo para lo que la regla mecánica no puede demostrar sin
//  rastrear de dónde viene la variable. Cada entrada se valida por la FIRMA
//  (nombre del atributo + texto completo de su valor), no por el nombre de
//  la variable, para que no blanquee sin querer un futuro atributo distinto
//  que reuse el mismo nombre corto (n, r, c... son comunes en este
//  archivo) -- por eso hay dos entradas para "r": son dos sitios distintos
//  (data-r y value) con motivos distintos, y sus firmas no colisionan.
// ------------------------------------------------------------
const EXCEPCIONES = [
  {
    firma: 'data-step::${n}',
    motivo: 'n es el número de paso del login (0..2); showStep(n) siempre se llama con un literal numérico escrito en el código, nunca con texto de un formulario.'
  },
  {
    firma: 'id::${prefijo}-dia',
    motivo: 'prefijo es el parámetro de fechaSelectHTML(prefijo,...); en cada llamada del archivo se le pasa un literal fijo (\'en\',\'ev\',\'dp-cumple\'...), nunca un dato que escriba una persona.'
  },
  {
    firma: 'id::${prefijo}-mes',
    motivo: 'mismo parámetro prefijo que arriba, mismo motivo: siempre un literal fijo del código.'
  },
  {
    firma: 'id::${prefijo}-anio',
    motivo: 'mismo parámetro prefijo que arriba, mismo motivo: siempre un literal fijo del código.'
  },
  {
    firma: 'value::${c}',
    motivo: 'formMov(): c recorre cats, un array literal (\'ofrenda\',\'diezmo\',...) definido dos líneas arriba en la misma función; no depende de ningún dato de entrada.'
  },
  {
    firma: 'class::${okClase}',
    motivo: 'okClase = opts.danger ? \'btn danger\' : \'btn\', un ternario entre dos literales de clase CSS asignado justo antes en la misma función (modalConfirm/modalPrompt); opts.danger es un booleano que decide la iglesia, nunca texto libre.'
  },
  {
    firma: 'data-r::${r}',
    motivo: 'modalReason(): r recorre [\'Trabajo\',\'Viaje\',\'Salud\',\'Familia\'], un array literal fijo en la misma línea.'
  },
  {
    firma: 'value::${r}',
    motivo: 'renderAdmin(): r recorre d.rolesDisponibles, que el backend llena con ROLES_GRUPO (backend/src/admin.js), una lista fija de roles del sistema, no texto que escriba una persona.'
  },
  {
    firma: 'title::${v.nombre}',
    motivo: 'vistaAjustes(): v es el valor de Object.entries(ACENTOS), una constante de paleta de colores declarada en este mismo archivo (v.nombre es una etiqueta fija como \'Cielo\', \'Pino\'...), no un dato de una iglesia.'
  },
  {
    firma: 'aria-label::Color ${v.nombre}',
    motivo: 'mismo v.nombre de ACENTOS explicado arriba, en el atributo aria-label del mismo botón.'
  },
  {
    firma: 'style::background:linear-gradient(135deg,${v.p} 0%,${v.p} 62%,${v.acc} 62%,${v.acc} 100%)',
    motivo: 'mismo v de Object.entries(ACENTOS) explicado arriba; v.p y v.acc son los hexadecimales fijos de la paleta (const ACENTOS en este archivo), no datos de una iglesia.'
  },
  {
    firma: 'style::width:${pct}%',
    motivo: 'vistaTesoreria(): pct = c.meta?Math.min(100,Math.round(c.recaudado/c.meta*100)):0, siempre resultado de Math.min/Math.round sobre números o el literal 0 -- nunca puede llevar una comilla.'
  },
  {
    firma: 'style::width:${size}px;height:${size}px',
    motivo: 'dirAvatar(p,size): en las tres llamadas de este archivo, size es un literal numérico (44, 48, 64) o se omite y cae al valor por defecto 48 (size=size||48); nunca un dato de persona.'
  },
  {
    firma: 'style::width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px',
    motivo: 'mismo size de dirAvatar() explicado arriba, en la variante sin foto (iniciales).'
  },
  {
    firma: 'id::ar-rol-${personaId}',
    motivo: 'adminFormRol(personaId): la única llamada del archivo es adminFormRol(${u.id}), un id numérico de la tabla persona.'
  },
  {
    firma: 'id::ar-grupo-${personaId}',
    motivo: 'mismo personaId de adminFormRol() explicado arriba.'
  },
  {
    firma: 'id::ar-acc-${personaId}',
    motivo: 'mismo personaId de adminFormRol() explicado arriba.'
  },
  {
    firma: 'value::rol:${rl}',
    motivo: 'toggleFormAnuncio(): rl recorre s.roles, que backend/src/notificaciones.js llena con un array literal fijo [\'admin\',\'lider_musica\',...] (endpoint /notificaciones/segmentos), no texto de una persona.'
  },
  {
    firma: 'class::estado-chip ${cls}',
    motivo: 'cargarCasos()/verCaso(): cls sale de CASO_ESTADO[c.estado] (o del fallback [\'\',\'\',\'\']), y CASO_ESTADO es una constante de este archivo con solo tres claves conocidas -- si c.estado trae cualquier otra cosa, la búsqueda falla y cls cae al fallback vacío, nunca al dato crudo.'
  },
  {
    firma: 'style::color:var(${varColor});text-align:right',
    motivo: 'varColor sale de PERS_PINTA[b.estado] (o PERS_PINTA.desconocido), una constante de este archivo con claves fijas; mismo razonamiento que CASO_ESTADO/cls de arriba.'
  },
  {
    firma: 'class::estado-chip estado-${a.estado}',
    motivo: 'a.estado es asignacion.estado: backend/src/asignaciones.js linea 84 lo fija siempre a los literales \'aceptado\' o \'rechazado\' (o el default \'pendiente\' del esquema); el endpoint nunca escribe el texto que manda la persona.'
  },
  {
    firma: 'for::ap-monto-${id}',
    motivo: 'formAporte(id): la única llamada del archivo es formAporte(${c.id}) desde filaCampania(), un id numérico de la tabla campania.'
  },
  {
    firma: 'id::ap-monto-${id}',
    motivo: 'mismo id de formAporte() explicado arriba: siempre c.id, un entero de la tabla campania.'
  },
  {
    firma: 'id::ap-error-${id}',
    motivo: 'mismo id de formAporte() explicado arriba: siempre c.id, un entero de la tabla campania.'
  },
  {
    firma: 'aria-controls::${id}',
    motivo: 'alternarGrupo(id): la única llamada de este archivo es el onclick que fija buildNav(), alternarGrupo(id) con id=`nav-g-${i+1}` generado en el propio forEach de secciones (un índice entero del bucle); nunca un dato que escriba una persona.'
  }
];

const EXCEPCIONES_MAP = new Map(EXCEPCIONES.map(e => [e.firma, e]));

// location.origin es una API del navegador, no un dato que nadie escribe.
const EXCEPCION_LOCATION_ORIGIN_FIRMA_PREFIJO = 'value::${location.origin}/publico.html?ig=';

test('todas las excepciones tienen un motivo real (no solo un nombre)', () => {
  for (const exc of EXCEPCIONES) {
    assert.ok(exc.motivo && exc.motivo.trim().length >= 20,
      `excepción sin motivo suficiente: ${JSON.stringify(exc.firma)}`);
  }
});

test('barrido: toda interpolación ${...} que arma el valor de un atributo="..." pasa por un ayudante seguro, es un dato que no viene de una persona, o tiene una excepción con motivo', () => {
  const atributos = hallarAtributos(fuente);
  assert.ok(atributos.length > 40, 'el barrido debería encontrar decenas de atributos con interpolación; si encuentra muy pocos, el tokenizador se rompió');

  const sinClasificar = [];
  for (const atr of atributos) {
    for (const item of atr.items) {
      if (esExprSegura(item.expr)) continue;
      if (item.expr === 'location.origin' && atr.firma.startsWith(EXCEPCION_LOCATION_ORIGIN_FIRMA_PREFIJO)) continue;
      if ((item.expr === 'editFn' || item.expr === 'delFn') && atr.nombreAttr === 'onclick') continue; // ver la prueba de accionesBtns() más abajo, que verifica esto de verdad
      const exc = EXCEPCIONES_MAP.get(atr.firma);
      if (exc) continue;
      sinClasificar.push(`línea ${atr.linea}: atributo ${atr.nombreAttr}="${atr.textoValor}" (expresión sin escapar: ${JSON.stringify(item.expr)})`);
    }
  }
  assert.deepEqual(sinClasificar, [],
    'hay interpolaciones dentro de un atributo que no pasan por un ayudante seguro ni tienen excepción justificada:\n' + sinClasificar.join('\n'));
});

test('accionesBtns: editFn/delFn solo se llaman con literales, nunca con datos', () => {
  // Verificación real (no una afirmación en un comentario) de que la
  // excepción de arriba es cierta: cada llamada a accionesBtns( en el
  // archivo debe pasar como primeros dos argumentos un identificador o una
  // cadena literal (ambas formas se usan en este archivo), nunca una
  // expresión que dependa de un dato guardado por una persona.
  const llamadas = [...fuente.matchAll(/accionesBtns\(([^,]+),([^,]+),/g)];
  assert.ok(llamadas.length > 0, 'no se encontró ninguna llamada a accionesBtns(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  const literalOIdentificador = /^\s*(?:[A-Za-z_$][\w$]*|'[A-Za-z_$][\w$]*'|"[A-Za-z_$][\w$]*")\s*$/;
  for (const m of llamadas) {
    const [, arg1, arg2] = m;
    assert.ok(literalOIdentificador.test(arg1), `accionesBtns: primer argumento no es un identificador/literal fijo: ${arg1}`);
    assert.ok(literalOIdentificador.test(arg2), `accionesBtns: segundo argumento no es un identificador/literal fijo: ${arg2}`);
  }
});

test('formAporte: solo se llama con un id (algo.id), nunca con un dato de persona', () => {
  // Verificación real de las tres excepciones de arriba (for::ap-monto-${id},
  // id::ap-monto-${id}, id::ap-error-${id}): su motivo dice que la única
  // llamada del archivo es formAporte(${c.id}). Sin esta prueba, si mañana
  // alguien agrega formAporte(persona.nombre) las excepciones seguirían
  // blanqueando esa interpolación sin que nada se entere.
  const llamadas = [...fuente.matchAll(/onclick="formAporte\(\$\{([^)]+)\}\)"/g)];
  assert.ok(llamadas.length > 0, 'no se encontró ninguna llamada a formAporte(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  const formaSegura = /^\s*[A-Za-z_$][\w$]*\.id\s*$/;
  for (const m of llamadas) {
    const [, arg] = m;
    assert.ok(formaSegura.test(arg), `formAporte: argumento no es un id numérico de la forma algo.id: ${arg}`);
  }
});

test('alternarGrupo: aria-controls::${id} vive SOLO ahí, y su única llamada pasa el id local del bucle de buildNav', () => {
  // Verificación real de la excepción aria-controls::${id} de arriba: su
  // motivo dice que la única llamada del archivo es el onclick que fija
  // buildNav(), con id=`nav-g-${i+1}` generado en el propio bucle. Sin esta
  // prueba, si mañana aparece OTRA interpolación aria-controls="${id}" con un
  // id que sí venga de una persona, tendría la misma firma y la excepción de
  // arriba la blanquearía en silencio -- es justo el riesgo que describe el
  // comentario de diseño junto a EXCEPCIONES más arriba.

  // (a) La interpolación vive solo dentro del cuerpo de alternarGrupo.
  const inicioFn = fuente.indexOf('function alternarGrupo(');
  assert.ok(inicioFn >= 0, 'no se encontró alternarGrupo() en web/app.js');
  let saldo = 0, finFn = -1;
  for (let j = fuente.indexOf('{', inicioFn); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { finFn = j + 1; break; } }
  }
  assert.ok(finFn > 0, 'no se pudo cerrar alternarGrupo()');
  const cuerpoFn = fuente.slice(inicioFn, finFn);
  const resto = fuente.slice(0, inicioFn) + fuente.slice(finFn);

  assert.ok(cuerpoFn.includes('aria-controls="${id}"'),
    'alternarGrupo ya no interpola aria-controls="${id}": actualizar o borrar esta prueba junto con la excepción de arriba');
  assert.ok(!resto.includes('aria-controls="${id}"'),
    'hay OTRA interpolación aria-controls="${id}" fuera de alternarGrupo: la excepción de arriba la blanquearía sin comprobar si es segura');

  // (b) La única llamada a alternarGrupo( del archivo (no la declaración de la
  // función) pasa el identificador local "id", nada más.
  const llamadas = [...fuente.matchAll(/(?<!function )alternarGrupo\(([^)]*)\)/g)];
  assert.ok(llamadas.length > 0,
    'no se encontró ninguna llamada a alternarGrupo(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  for (const m of llamadas) {
    assert.equal(m[1].trim(), 'id',
      `alternarGrupo se llama con algo distinto del identificador local "id": ${m[1]}`);
  }

  // Y ese "id" local es exactamente el nav-g-${i+1} del bucle de buildNav, un
  // entero controlado por el propio código, no cualquier variable que se
  // llame igual por casualidad.
  assert.ok(/const id=`nav-g-\$\{i\+1\}`;/.test(fuente),
    'el id que buildNav pasa a alternarGrupo ya no es el nav-g-${i+1} del bucle: revisar si sigue siendo un entero controlado por el código antes de mantener esta excepción');
});

// --- Cuántas interpolaciones hay en total, cuántas son de atributo, y qué
//     queda pendiente fuera de esta prueba. Ver el informe de esta tarea
//     para la decisión sobre ese resto. ---
test('medición: tamaño del barrido (informativo, no falla)', () => {
  const todas = interpolacionesDelArchivo(fuente);
  const atributos = hallarAtributos(fuente);
  const enAtributo = atributos.reduce((n, a) => n + a.items.length, 0);
  // No es una aserción de comportamiento: es la medición que pide el
  // encargo. Si el tokenizador se rompe con una edición futura, que falle
  // aquí con un número absurdo en vez de fallar en silencio.
  assert.ok(todas.length > enAtributo, 'las interpolaciones de atributo no pueden ser más que el total');
  assert.ok(todas.length > 500 && todas.length < 2000, `total de interpolaciones fuera de rango esperado: ${todas.length}`);
});

// --- Autocomprobación del clasificador: si el barrido nunca se ha visto
//     fallar, no cuenta. Esto prueba la LÓGICA del clasificador contra un
//     ataque de mentira, sin tocar el archivo real (la comprobación contra
//     el archivo real, editándolo a propósito, se hizo a mano una vez y se
//     documenta en el informe). ---
test('autocomprobación: el clasificador SÍ marca una interpolación sin escapar dentro de un atributo', () => {
  const fuenteFalsa = 'const x = `<input value="${persona.nombre}">`;';
  const atributos = hallarAtributos(fuenteFalsa);
  assert.equal(atributos.length, 1);
  assert.equal(esExprSegura(atributos[0].items[0].expr), false,
    'persona.nombre crudo dentro de value="..." tiene que marcarse como inseguro');
});

test('autocomprobación: el clasificador deja pasar el mismo dato ya envuelto en escHtml()', () => {
  const fuenteFalsa = 'const x = `<input value="${escHtml(persona.nombre)}">`;';
  const atributos = hallarAtributos(fuenteFalsa);
  assert.equal(esExprSegura(atributos[0].items[0].expr), true);
});
