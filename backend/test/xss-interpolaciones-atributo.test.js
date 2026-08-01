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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

// ------------------------------------------------------------
//  Tokenizador mínimo. Necesario porque un indexOf('${') ingenuo se rompe
//  con regex literales (ej. /"/g) y comillas dentro de strings anidados:
//  malinterpretan una comilla de un regex como el inicio de un string y
//  el barrido pierde el balance de llaves.
// ------------------------------------------------------------
const PALABRAS_NO_VALOR = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'yield', 'case', 'do', 'else', 'throw', 'if', 'while', 'for', 'switch', 'function'
]);

function saltarComilla(src, i, comilla) {
  const n = src.length;
  let j = i + 1;
  while (j < n) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === comilla) return j + 1;
    j++;
  }
  return j;
}

function saltarRegex(src, i) {
  const n = src.length;
  let j = i + 1;
  let enClase = false;
  while (j < n) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '[') { enClase = true; j++; continue; }
    if (c === ']') { enClase = false; j++; continue; }
    if (c === '/' && !enClase) { j++; break; }
    if (c === '\n') break;
    j++;
  }
  while (j < n && /[a-z]/i.test(src[j])) j++;
  return j;
}

// Avanza desde el primer caracter DESPUÉS de un `${` (depth=1) hasta el `}`
// que lo cierra, saltando correctamente strings/templates/regex/comentarios
// anidados. Cada ${...} que encuentre en el camino (incluidos los de un
// template literal anidado) se añade a `interpolaciones`.
function escanearBalanceado(src, inicio, interpolaciones) {
  const n = src.length;
  let j = inicio;
  let ultimoFueValor = false;
  let profundidad = 1;
  while (j < n) {
    const c = src[j];
    if (c === '/' && src[j + 1] === '/') { const nl = src.indexOf('\n', j); j = nl === -1 ? n : nl + 1; continue; }
    if (c === '/' && src[j + 1] === '*') { const fin = src.indexOf('*/', j + 2); j = fin === -1 ? n : fin + 2; continue; }
    if (c === '"' || c === "'") { j = saltarComilla(src, j, c); ultimoFueValor = true; continue; }
    if (c === '`') { j = saltarTemplate(src, j, interpolaciones); ultimoFueValor = true; continue; }
    if (c === '/' && !ultimoFueValor) { j = saltarRegex(src, j); ultimoFueValor = true; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let k = j; while (k < n && /[A-Za-z0-9_$]/.test(src[k])) k++;
      const palabra = src.slice(j, k);
      ultimoFueValor = !PALABRAS_NO_VALOR.has(palabra);
      j = k; continue;
    }
    if (c === '{') { profundidad++; ultimoFueValor = false; j++; continue; }
    if (c === '}') { profundidad--; j++; if (profundidad === 0) return j; ultimoFueValor = false; continue; }
    if (c === ')' || c === ']') { ultimoFueValor = true; j++; continue; }
    if (/\s/.test(c)) { j++; continue; }
    ultimoFueValor = false;
    j++;
  }
  return j;
}

function saltarTemplate(src, i, interpolaciones) {
  const n = src.length;
  let j = i + 1;
  while (j < n) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '`') return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      const inicioDolar = j;
      const inicioExpr = j + 2;
      const fin = escanearBalanceado(src, inicioExpr, interpolaciones);
      interpolaciones.push({ inicio: inicioDolar, fin, expr: src.slice(inicioExpr, fin - 1) });
      j = fin;
      continue;
    }
    j++;
  }
  return j;
}

// Recorre TODO el archivo (no solo dentro de templates) para que strings,
// comentarios y regex de nivel superior tampoco confundan la búsqueda de
// backticks.
function interpolacionesDelArchivo(src) {
  const interpolaciones = [];
  const n = src.length;
  let i = 0;
  let ultimoFueValor = false;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? n : nl + 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const fin = src.indexOf('*/', i + 2); i = fin === -1 ? n : fin + 2; continue; }
    if (c === '"' || c === "'") { i = saltarComilla(src, i, c); ultimoFueValor = true; continue; }
    if (c === '`') { i = saltarTemplate(src, i, interpolaciones); ultimoFueValor = true; continue; }
    if (c === '/' && !ultimoFueValor) { i = saltarRegex(src, i); ultimoFueValor = true; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let k = i; while (k < n && /[A-Za-z0-9_$]/.test(src[k])) k++;
      const palabra = src.slice(i, k);
      ultimoFueValor = !PALABRAS_NO_VALOR.has(palabra);
      i = k; continue;
    }
    if (c === ')' || c === ']') { ultimoFueValor = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    ultimoFueValor = false;
    i++;
  }
  return interpolaciones;
}

function lineaDe(src, pos) { return src.slice(0, pos).split('\n').length; }

// ------------------------------------------------------------
//  Clasificación: separa interpolaciones que están DENTRO del valor de un
//  atributo entre comillas dobles (justo tras `="`, cerrando en la `"` que
//  sigue), del resto (cuerpo de texto / fuera de un atributo). Agrupa las
//  que comparten un mismo atributo mixto (ej. `="a${x}b${y}c"`).
// ------------------------------------------------------------
function nombreDeAtributo(src, inicioValor) {
  // inicioValor apunta al `"` de apertura. El nombre del atributo es la
  // palabra (con guiones) que precede a `="`.
  const antes = src.slice(Math.max(0, inicioValor - 40), inicioValor - 1); // sin el '='
  const m = antes.match(/([A-Za-z_-][\w-]*)\s*$/);
  return m ? m[1] : '?';
}

// Para una interpolación, busca hacia atrás el `"` de apertura de SU
// atributo, si lo hay. No basta con mirar los dos caracteres justo antes
// (eso solo detecta el PRIMER trozo de un atributo mixto, ej.
// `title="${a}${b}"` perdería `${b}`): hay que retroceder hasta el primer
// `"`, `>` o backtick que aparezca, y comprobar que sea una comilla de
// apertura de atributo (precedida por `=`). Si lo primero que se encuentra
// retrocediendo es `>` o un backtick, la interpolación está en el cuerpo de
// texto, no en un atributo.
function inicioDeAtributoSiAplica(src, posInterpolacion) {
  let k = posInterpolacion - 1;
  while (k >= 0) {
    const c = src[k];
    if (c === '"' || c === '>' || c === '`') break;
    k--;
  }
  if (k < 0 || src[k] !== '"') return null;
  if (src[k - 1] !== '=') return null;
  return k; // posición del '"' de apertura
}

// Atributos de manejador de eventos (onclick, onchange...) y href="javascript:
// ...": lo que interpolan va dentro de CÓDIGO JS, no del valor plano del
// atributo. Es un riesgo real (basta una comilla doble para romper el
// atributo igual que en cualquier otro), pero es una categoría DISTINTA --
// ya parcialmente cubierta por el patrón de xss-atributos.test.js y por
// escJsAttr() -- y mezclarla aquí dispara el barrido de ~80 a más de 130
// sitios, la mayoría índices numéricos de un onclick que nunca se acercan a
// un dato de persona. Queda fuera a propósito de este barrido, que el
// encargo pide empezar acotado; ver el informe de esta tarea.
const ATRIBUTOS_DE_MANEJADOR = new Set([
  'onclick', 'onchange', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
  'oninput', 'onfocus', 'onblur', 'onkeydown', 'onkeyup', 'onsubmit', 'ondblclick'
]);

function hallarAtributos(src) {
  const todas = interpolacionesDelArchivo(src);
  const atributos = new Map(); // clave: posición del `"` de apertura -> {items:[...]}
  for (const r of todas) {
    const inicioValor = inicioDeAtributoSiAplica(src, r.inicio);
    if (inicioValor === null) continue;
    const nombreAttr = nombreDeAtributo(src, inicioValor);
    if (ATRIBUTOS_DE_MANEJADOR.has(nombreAttr)) continue;
    if (nombreAttr === 'href' && /^javascript:/.test(src.slice(inicioValor + 1, inicioValor + 12))) continue;
    if (!atributos.has(inicioValor)) atributos.set(inicioValor, { inicioValor, items: [] });
    atributos.get(inicioValor).items.push(r);
  }
  // Para cada atributo, hallar dónde cierra (la próxima comilla doble
  // literal tras la última interpolación del grupo) para poder reportar el
  // texto completo del VALOR como parte de la firma.
  const resultado = [];
  for (const { inicioValor, items } of atributos.values()) {
    const ultima = items[items.length - 1];
    let j = ultima.fin;
    while (j < src.length && src[j] !== '"') j++;
    const finValor = j; // índice de la comilla de cierre
    const textoValor = src.slice(inicioValor + 1, finValor); // sin las comillas
    const nombreAttr = nombreDeAtributo(src, inicioValor);
    // Firma estable: nombre del atributo + texto completo del valor. Evita
    // que dos atributos DISTINTOS que por casualidad interpolan una
    // variable con el mismo nombre corto (n, r, c...) se confundan bajo la
    // misma excepción -- ver comentario junto a EXCEPCIONES más abajo.
    const firma = `${nombreAttr}::${textoValor}`;
    resultado.push({ items, textoValor, nombreAttr, firma, linea: lineaDe(src, inicioValor) });
  }
  return resultado;
}

// ------------------------------------------------------------
//  Reglas mecánicas de seguridad sobre el TEXTO de una expresión ${...}.
// ------------------------------------------------------------
const AYUDANTES_SEGUROS = [
  'escHtml', 'escJsAttr', 'safeColor', 'money', 'encodeURIComponent',
  // Math.round/min/max/floor/ceil y Number(...) siempre devuelven un Number:
  // su forma de texto solo puede ser dígitos, '.', '-' o "NaN"/"Infinity",
  // nunca una comilla. Da igual qué reciban por dentro.
  'Math.round', 'Math.min', 'Math.max', 'Math.floor', 'Math.ceil', 'Number'
];

function envueltaPorAyudante(expr) {
  for (const nombre of AYUDANTES_SEGUROS) {
    const prefijo = nombre + '(';
    if (expr.startsWith(prefijo) && expr.endsWith(')')) {
      // Comprobar que el paréntesis de apertura cierra justo al final (que
      // no sea `escHtml(a)+b` disfrazado).
      let profundidad = 0;
      let ok = true;
      for (let k = prefijo.length - 1; k < expr.length; k++) {
        const c = expr[k];
        if (c === '(') profundidad++;
        else if (c === ')') { profundidad--; if (profundidad === 0 && k !== expr.length - 1) { ok = false; break; } }
      }
      if (ok) return true;
    }
  }
  return false;
}

// Divide un ternario de NIVEL SUPERIOR "A ? B : C" respetando paréntesis y
// comillas. Devuelve null si no hay un ternario de nivel superior.
function partirTernario(expr) {
  let profundidad = 0;
  let comilla = null;
  let idxInterrogacion = -1;
  for (let k = 0; k < expr.length; k++) {
    const c = expr[k];
    if (comilla) { if (c === '\\') { k++; continue; } if (c === comilla) comilla = null; continue; }
    if (c === '"' || c === "'" || c === '`') { comilla = c; continue; }
    if (c === '(' || c === '[' || c === '{') profundidad++;
    else if (c === ')' || c === ']' || c === '}') profundidad--;
    else if (c === '?' && profundidad === 0 && expr[k + 1] !== '.' && idxInterrogacion === -1) { idxInterrogacion = k; break; }
  }
  if (idxInterrogacion === -1) return null;
  // Buscar el ':' que le corresponde, respetando anidamiento de otros ?: y paréntesis.
  profundidad = 0;
  comilla = null;
  let anidado = 0;
  for (let k = idxInterrogacion + 1; k < expr.length; k++) {
    const c = expr[k];
    if (comilla) { if (c === '\\') { k++; continue; } if (c === comilla) comilla = null; continue; }
    if (c === '"' || c === "'" || c === '`') { comilla = c; continue; }
    if (c === '(' || c === '[' || c === '{') profundidad++;
    else if (c === ')' || c === ']' || c === '}') profundidad--;
    else if (c === '?' && profundidad === 0) anidado++;
    else if (c === ':' && profundidad === 0) {
      if (anidado > 0) { anidado--; continue; }
      return { cond: expr.slice(0, idxInterrogacion), a: expr.slice(idxInterrogacion + 1, k), b: expr.slice(k + 1) };
    }
  }
  return null;
}

// Divide "A + B + C" en sus partes de NIVEL SUPERIOR (respetando paréntesis
// y comillas), para el patrón `' · '+escHtml(x)` -- texto literal
// concatenado con algo ya escapado. No confía en que sea aritmética: cada
// parte se valida por separado con esExprSegura, así que una parte insegura
// (ej. `x.nombre+'!'` con x.nombre crudo) sigue marcándose mal.
function partirConcat(expr) {
  const partes = [];
  let profundidad = 0;
  let comilla = null;
  let inicio = 0;
  let huboMas = false;
  for (let k = 0; k < expr.length; k++) {
    const c = expr[k];
    if (comilla) { if (c === '\\') { k++; continue; } if (c === comilla) comilla = null; continue; }
    if (c === '"' || c === "'" || c === '`') { comilla = c; continue; }
    if (c === '(' || c === '[' || c === '{') profundidad++;
    else if (c === ')' || c === ']' || c === '}') profundidad--;
    else if (c === '+' && profundidad === 0) {
      partes.push(expr.slice(inicio, k));
      inicio = k + 1;
      huboMas = true;
    }
  }
  if (!huboMas) return null;
  partes.push(expr.slice(inicio));
  return partes;
}

function esExprSegura(expr) {
  const e = expr.trim();
  if (e === '') return true;
  // Literal numérico.
  if (/^\d+$/.test(e)) return true;
  // Literal de cadena.
  if (/^'[^'\\]*'$/.test(e) || /^"[^"\\]*"$/.test(e)) return true;
  // Cadena de propiedades que termina en .id o .length.
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\.(id|length)$/.test(e)) return true;
  // Identificador/propiedad ± entero (aritmética de índice).
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\s*[+\-]\s*\d+$/.test(e)) return true;
  // Comparación simple -> siempre "true"/"false".
  if (/^[\w$.]+\s*(===|!==|==|!=)\s*[\w$.]+$/.test(e)) return true;
  // Envuelta entera por un ayudante que escapa.
  if (envueltaPorAyudante(e)) return true;
  // Ternario PRIMERO: en JS el ternario liga más flojo que "+", así que si
  // hay un ternario de nivel superior, sus ramas son las unidades correctas
  // a validar (una rama puede contener perfectamente un "+", ej.
  // `cond?' · '+escHtml(x):''`; partirlo por "+" antes de por "?:" cortaría
  // esa rama por la mitad).
  const tern = partirTernario(e);
  if (tern) return esExprSegura(tern.a) && esExprSegura(tern.b);
  // Concatenación de nivel superior: cada parte, recursivamente, segura.
  const partes = partirConcat(e);
  if (partes) return partes.every(p => esExprSegura(p));
  return false;
}

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
