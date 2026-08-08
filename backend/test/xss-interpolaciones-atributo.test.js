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
//
//  CUANTOS SITIOS CUBRE CADA EXCEPCION (`sitios`, por defecto 1). Validar por
//  el texto completo del atributo cierra el caso del nombre de variable
//  repetido, pero NO cierra el del atributo repetido: dos trozos de HTML
//  escritos igual dan la misma firma. Mientras el barrido solo preguntase
//  "¿existe algun sitio con esta firma?", una excepcion escrita para una
//  funcion blanquearia en silencio a cualquier otra que naciera con el mismo
//  texto. Paso de verdad (7-ago) en el barrido de cuerpo: `modalAviso` nacio
//  con el mismo `<p class="muted" style="margin:8px 0 16px">${msg}</p>` que
//  `modalConfirm`, entro como sumidero de innerHTML NUEVO, y nadie pudo
//  decir nada. La prueba de alternarGrupo de mas abajo es este mismo miedo
//  resuelto a mano para UNA excepcion; el conteo lo resuelve para las 25 de
//  la lista EXCEPCIONES — y SOLO para esas. El atajo de location.origin, que
//  vive fuera de la lista, perdona sin contar: un segundo
//  value="${location.origin}/publico.html?ig=..." entraria con el barrido y
//  el conteo los dos en verde. Puede permitirselo porque perdona una
//  EXPRESION que es segura por si misma alla donde este (location.origin es
//  una API del navegador; nadie la escribe), no un SITIO que sea seguro por
//  quien lo llama. Es la diferencia con el `msg` de modalConfirm: aquel solo
//  era seguro porque sus llamadores escapaban, asi que un llamador nuevo lo
//  volvia peligroso y habia que enterarse. Si algun dia ese atajo se
//  ensancha a una expresion cuya seguridad dependa del contexto, tiene que
//  bajar a EXCEPCIONES y contar como todas.
//
//  Por eso cada excepcion declara a CUANTOS sitios cubre y el conteo se
//  comprueba. Rompe la suite en las dos direcciones, que son los dos
//  agujeros:
//   - de mas: un atributo nuevo que colisiona de firma con uno viejo y
//     hereda su permiso sin que nadie lo audite — obliga a auditarlo y
//     nombrarlo en el motivo.
//   - de menos: desaparece uno de los sitios que la excepcion cubria —
//     obliga a re-auditar el que queda en vez de heredarle el permiso.
//     (Cero sitios es el caso zombi: la excepcion sobra y hay que borrarla.)
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
    motivo: 'prefijo es el parámetro de fechaSelectHTML(prefijo,...); todas las llamadas del archivo le pasan un literal fijo (\'en\',\'ev\',\'dp-cumple\'...) menos UNA: formEditarLeccion le pasa \'el\'+id, y ese id le llega ya envuelto en Number() desde su único llamador (el botón Editar de la lista de lecciones), así que es \'el\' + un entero. Nunca un dato que escriba una persona. Esto no es una promesa: lo fija la prueba de fechaSelectHTML de mas abajo, que recorre TODAS las llamadas del archivo.'
  },
  {
    firma: 'id::${prefijo}-mes',
    motivo: 'mismo parámetro prefijo que arriba, mismo motivo y misma prueba de fechaSelectHTML detrás: literal fijo del código en todas las llamadas salvo el \'el\'+id entero de formEditarLeccion.'
  },
  {
    firma: 'id::${prefijo}-anio',
    motivo: 'mismo parámetro prefijo que arriba, mismo motivo y misma prueba de fechaSelectHTML detrás: literal fijo del código en todas las llamadas salvo el \'el\'+id entero de formEditarLeccion.'
  },
  {
    firma: 'value::${c}',
    motivo: 'formMov(): c recorre cats, un array literal (\'ofrenda\',\'diezmo\',...) definido dos líneas arriba en la misma función; no depende de ningún dato de entrada.'
  },
  {
    firma: 'class::${okClase}',
    sitios: 2,
    motivo: 'okClase = opts.danger ? \'btn danger\' : \'btn\', un ternario entre dos literales de clase CSS asignado justo antes en la misma función; opts.danger es un booleano que decide la iglesia, nunca texto libre. DOS sitios con el mismo class: el botón cf-ok de modalConfirm y el mp-ok de modalPrompt, cada uno con su propia línea okClase = opts.danger ? ... verificada.'
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
    sitios: 2,
    motivo: 'cargarCasos()/verCaso(): cls sale de CASO_ESTADO[c.estado] (o del fallback [\'\',\'\',\'\']), y CASO_ESTADO es una constante de este archivo con solo tres claves conocidas -- si c.estado trae cualquier otra cosa, la búsqueda falla y cls cae al fallback vacío, nunca al dato crudo. DOS sitios con el mismo chip: la lista de casos (cargarCasos) y el detalle del caso (verCaso), cada uno con su propio destructuring de CASO_ESTADO verificado.'
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

// El único atajo que vive FUERA de la lista EXCEPCIONES. Se extrae aquí para
// que el barrido y el conteo de abajo decidan con el MISMO criterio qué
// interpolación depende de la lista: si divergieran, el conteo mediría una
// cosa distinta de la que el barrido perdona y el candado no valdría nada.
// Por qué este atajo puede perdonar sin contar, y qué pasaría si se
// ensanchara a algo que dependa del contexto: ver la cabecera.
//
// Aquí hubo un segundo atajo hasta el 7-ago: un `if` que perdonaba editFn y
// delFn cuando atr.nombreAttr==='onclick'. Se borró porque era INALCANZABLE
// por construcción, no por casualidad: clasificarInterpolaciones() enruta
// cada grupo por su nombre de atributo, 'onclick' está en
// ATRIBUTOS_DE_MANEJADOR, y hallarAtributos() devuelve solo la mitad
// .atributo — así que nunca puede llegar aquí un grupo onclick. Un `if`
// muerto en una red de seguridad no es neutro: o no hace nada (hoy) o hace
// lo contrario de lo que se quiere (si mañana alguien saca 'onclick' de
// ATRIBUTOS_DE_MANEJADOR, vuelve a la vida y regala un permiso general SIN
// contarlo, justo el agujero que esta cabecera existe para cerrar). Sin él,
// ese día el barrido falla y obliga a re-auditar: falla cerrado.
// El sitio de verdad, onclick::${editFn}(${id}), tiene su excepción en
// xss-manejadores.test.js; la prueba de accionesBtns() de más abajo se queda
// porque es la que sostiene ESE motivo (ver la nota junto a ella).
function cubiertoPorAtajo(atr, item) {
  if (item.expr === 'location.origin' && atr.firma.startsWith(EXCEPCION_LOCATION_ORIGIN_FIRMA_PREFIJO)) return true;
  return false;
}

// Un "sitio" es un ATRIBUTO ENTERO (un grupo: un value="..." concreto), no
// cada ${...} suelto de dentro; y solo cuentan los atributos que de verdad
// dependen de la lista EXCEPCIONES, es decir los que tienen al menos una
// interpolación que ni las reglas mecánicas ni el atajo de arriba aprueban.
// Contar los ${...} daría un número que no significa nada:
// style="width:${size}px;height:${size}px" son dos interpolaciones y un solo
// sitio que auditar.
function sitiosQueNecesitanExcepcion() {
  const porFirma = new Map();
  for (const atr of hallarAtributos(fuente)) {
    if (!atr.items.some(item => !esExprSegura(item.expr) && !cubiertoPorAtajo(atr, item))) continue;
    if (!porFirma.has(atr.firma)) porFirma.set(atr.firma, []);
    porFirma.get(atr.firma).push(atr.linea);
  }
  return porFirma;
}

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
      if (cubiertoPorAtajo(atr, item)) continue;
      const exc = EXCEPCIONES_MAP.get(atr.firma);
      if (exc) continue;
      sinClasificar.push(`línea ${atr.linea}: atributo ${atr.nombreAttr}="${atr.textoValor}" (expresión sin escapar: ${JSON.stringify(item.expr)})`);
    }
  }
  assert.deepEqual(sinClasificar, [],
    'hay interpolaciones dentro de un atributo que no pasan por un ayudante seguro ni tienen excepción justificada:\n' + sinClasificar.join('\n'));

  // Una excepción que ya no encuentra su sitio es una excepción que blanquea
  // de más: el día que alguien escriba un atributo nuevo con ese mismo texto,
  // entrará perdonado por un motivo que se escribió para OTRO código. Si el
  // código cambió, la lista tiene que encoger con él.
  const firmasUsadas = sitiosQueNecesitanExcepcion();
  const sobrantes = EXCEPCIONES.filter(e => !firmasUsadas.has(e.firma)).map(e => e.firma);
  assert.deepEqual(sobrantes, [],
    'excepciones que ya no corresponden a ningún atributo del código: bórralas (una excepción sin sitio blanquea de más):\n' + sobrantes.join('\n'));
});

// El zombie-check de arriba solo pregunta "¿queda ALGUN atributo con esta
// firma?", y la firma (atributo + texto completo del valor) no es única. Esto
// cuenta los sitios: una excepción tiene que cubrir exactamente los que dice.
//
// Sin este candado, un atributo NUEVO escrito con el mismo texto que uno
// viejo entra blanqueado y en silencio — que es lo que le pasó a modalAviso
// en el barrido de cuerpo al nacer (ver la cabecera).
test('cada excepción de atributo cubre exactamente los sitios que declara (una firma NO es única: dos atributos escritos igual la comparten)', () => {
  const porFirma = sitiosQueNecesitanExcepcion();
  const descuadres = [];
  for (const exc of EXCEPCIONES) {
    const lineas = porFirma.get(exc.firma) || [];
    const declarados = exc.sitios || 1;
    if (lineas.length !== declarados) {
      descuadres.push(`${JSON.stringify(exc.firma)}: declara ${declarados} sitio(s), el barrido ve ${lineas.length}` +
        (lineas.length ? ` (líneas ${lineas.join(', ')})` : ''));
    }
  }
  assert.deepEqual(descuadres, [],
    'excepciones cuyo número de sitios no cuadra. Si SOBRAN sitios, hay un atributo nuevo que heredó el permiso de otro sin que nadie lo auditara: audítalo y nómbralo en el motivo (o dale su propia firma). Si FALTAN, uno de los sitios desapareció: re-audita el que queda antes de bajar el número.\n' + descuadres.join('\n'));
});

test('accionesBtns: editFn/delFn solo se llaman con literales, nunca con datos', () => {
  // Esta prueba vive aquí por historia, pero el sitio que sostiene NO está en
  // este barrido: onclick="${editFn}(${id})" es un manejador, y su excepción
  // está en xss-manejadores.test.js, cuyo motivo dice literalmente "lo fija la
  // prueba de accionesBtns del barrido de atributos". No la borres por
  // parecer huérfana desde que el atajo de editFn/delFn se fue de este
  // archivo (ver la nota en cubiertoPorAtajo): si se va, ese motivo se queda
  // sin nada que lo sostenga.
  //
  // Verificación real (no una afirmación en un comentario): cada llamada a accionesBtns( en el
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

test('fechaSelectHTML: el prefijo de cada llamada es un literal fijo (o \'el\'+un id entero)', () => {
  // Verificación real de CUATRO excepciones, tres aquí y una en el otro
  // barrido; si esta prueba se borra, las cuatro se quedan sin nada que las
  // sostenga y vuelven a ser una afirmación en un comentario:
  //   - id::${prefijo}-dia, id::${prefijo}-mes, id::${prefijo}-anio (arriba)
  //   - onchange::fechaSelectAjustarDias('${prefijo}') (xss-manejadores.test.js)
  // Las cuatro dicen lo mismo: `prefijo` nunca trae un dato que escriba una
  // persona. Eso solo es cierto mientras TODAS las llamadas del archivo le
  // pasen un literal fijo, y el día que alguien escriba
  // fechaSelectHTML(p.nombre, ...) el id y el onchange que salen de ahí se
  // los tragan las cuatro excepciones sin que nada se entere. Esto lo caza.
  //
  // Formas admitidas para el PRIMER argumento, y solo estas dos:
  //   (a) una cadena literal: 'ev', 'dp-cumple', 'prp-desde'...
  //   (b) EXACTAMENTE 'el'+id, la de formEditarLeccion. No "cualquier
  //       'literal'+identificador": esa forma general se admitió hasta el
  //       7-ago y era una puerta abierta, porque fechaSelectHTML('x'+nombre)
  //       pasaba en verde y su prefijo sale literal dentro de
  //       onchange="fechaSelectAjustarDias('${prefijo}')", donde una comilla
  //       simple se sale del literal JS. Detrás no hay otra red: añadir una
  //       LLAMADA no crea sitios de atributo nuevos, así que el conteo de
  //       sitios no puede verlo — es ciego a esto por construcción, y esta
  //       prueba es lo único que mira. Que ese id sea entero tampoco se da
  //       por supuesto: se fija abajo.
  // Si aparece una llamada que no encaja, NO ensanches esta lista para que
  // quepa: averigua de dónde sale ese prefijo. Si puede venir de una persona,
  // es un fallo de seguridad, no un número que ajustar.
  const cabezaSegura = /^fechaSelectHTML\(\s*(?:'[\w-]+'|'el'\s*\+\s*id\b)\s*[,)]/;
  // El archivo menciona fechaSelectHTML( en un comentario de documentación
  // (la firma de la función); eso no es una llamada. Se descarta solo si la
  // línea EMPIEZA por //: buscar '//' en cualquier posición contaba el de un
  // https:// dentro de una cadena, y entonces una llamada escondida en una
  // línea con una URL se descartaba sola y pasaba en verde. En una red de
  // seguridad, el descarte tiene que fallar cerrado: ante la duda, se mira.
  const enComentario = (pos) => /^\s*\/\//.test(fuente.slice(fuente.lastIndexOf('\n', pos) + 1, pos));
  const sitios = [...fuente.matchAll(/fechaSelectHTML\(/g)]
    .filter(m => !/function $/.test(fuente.slice(Math.max(0, m.index - 9), m.index)))
    .filter(m => !enComentario(m.index));
  assert.ok(sitios.length >= 10, 'no se encontraron las llamadas a fechaSelectHTML(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  for (const m of sitios) {
    const cabeza = fuente.slice(m.index, m.index + 160);
    assert.ok(cabezaSegura.test(cabeza),
      `fechaSelectHTML: el prefijo no es un literal fijo ni 'el'+id — de aquí salen los id="${'${prefijo}'}-dia/-mes/-anio" y el onchange, que cuatro excepciones dan por seguros: ${cabeza.split('\n')[0]}`);
  }

  // La única llamada de la forma (b) es 'el'+id, dentro de
  // formEditarLeccion(id). Que ese id sea un entero no es una promesa: su
  // único llamador lo envuelve en Number(), y esto lo fija.
  const sitiosLeccion = [...fuente.matchAll(/formEditarLeccion\(/g)]
    .filter(m => !/function $/.test(fuente.slice(Math.max(0, m.index - 9), m.index)))
    .filter(m => !enComentario(m.index));
  assert.ok(sitiosLeccion.length > 0, 'no se encontró ninguna llamada a formEditarLeccion(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  for (const m of sitiosLeccion) {
    const cabeza = fuente.slice(m.index, m.index + 80);
    assert.ok(/^formEditarLeccion\(\$\{Number\([\w$.]+\)\}\)/.test(cabeza),
      `formEditarLeccion ya no recibe su id envuelto en Number(): entonces 'el'+id deja de ser 'el'+un entero y el prefijo de fechaSelectHTML deja de ser demostrable: ${cabeza.split('\n')[0]}`);
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
