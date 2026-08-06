// ============================================================
//  Tokenizador y clasificador compartido de los barridos XSS.
//
//  Nacio dentro de xss-interpolaciones-atributo.test.js (5-ago); se extrajo
//  aqui en la tanda G (6-ago) para que los barridos nuevos —manejadores de
//  evento y cuerpo de texto— usen EXACTAMENTE el mismo tokenizador y las
//  mismas reglas mecanicas, en vez de tres copias que divergen en silencio.
//  Los comentarios de diseño del tokenizador viven en ese archivo original;
//  aqui solo esta el mecanismo.
//
//  Exporta:
//   - interpolacionesDelArchivo(src): todas las ${...} con posiciones.
//   - clasificarInterpolaciones(src): las separa en { atributo, manejador,
//     cuerpo } segun donde viven (valor de atributo normal, manejador de
//     evento / href="javascript:", o fuera de un atributo).
//   - esExprSegura(expr): reglas mecanicas (ayudantes que escapan, .id/.length,
//     comparaciones, ternarios y concatenaciones recursivas).
//   - lineaDe(src, pos), AYUDANTES_SEGUROS, ATRIBUTOS_DE_MANEJADOR.
// ============================================================

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

export function interpolacionesDelArchivo(src) {
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

export function lineaDe(src, pos) { return src.slice(0, pos).split('\n').length; }

export function nombreDeAtributo(src, inicioValor) {
  const antes = src.slice(Math.max(0, inicioValor - 40), inicioValor - 1);
  const m = antes.match(/([A-Za-z_-][\w-]*)\s*$/);
  return m ? m[1] : '?';
}

export function inicioDeAtributoSiAplica(src, posInterpolacion) {
  let k = posInterpolacion - 1;
  while (k >= 0) {
    const c = src[k];
    if (c === '"' || c === '>' || c === '`') break;
    k--;
  }
  if (k < 0 || src[k] !== '"') return null;
  if (src[k - 1] !== '=') return null;
  return k;
}

export const ATRIBUTOS_DE_MANEJADOR = new Set([
  'onclick', 'onchange', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
  'oninput', 'onfocus', 'onblur', 'onkeydown', 'onkeyup', 'onsubmit', 'ondblclick'
]);

function esHrefJavascript(src, inicioValor, nombreAttr) {
  return nombreAttr === 'href' && /^javascript:/.test(src.slice(inicioValor + 1, inicioValor + 12));
}

// Separa TODAS las interpolaciones del archivo en tres categorias por donde
// viven. Las de atributo (normal o manejador) vienen agrupadas por atributo,
// con su texto completo de valor y su firma "attr::valor" (la misma firma que
// usan las listas de excepciones). Las de cuerpo vienen sueltas.
export function clasificarInterpolaciones(src) {
  const todas = interpolacionesDelArchivo(src);
  const grupos = new Map(); // posicion del '"' de apertura -> {items}
  const cuerpo = [];
  for (const r of todas) {
    const inicioValor = inicioDeAtributoSiAplica(src, r.inicio);
    if (inicioValor === null) {
      cuerpo.push({ ...r, linea: lineaDe(src, r.inicio) });
      continue;
    }
    if (!grupos.has(inicioValor)) grupos.set(inicioValor, { inicioValor, items: [] });
    grupos.get(inicioValor).items.push(r);
  }
  const atributo = [], manejador = [];
  for (const { inicioValor, items } of grupos.values()) {
    const ultima = items[items.length - 1];
    let j = ultima.fin;
    while (j < src.length && src[j] !== '"') j++;
    const textoValor = src.slice(inicioValor + 1, j);
    const nombreAttr = nombreDeAtributo(src, inicioValor);
    const g = { items, textoValor, nombreAttr, firma: `${nombreAttr}::${textoValor}`, linea: lineaDe(src, inicioValor) };
    if (ATRIBUTOS_DE_MANEJADOR.has(nombreAttr) || esHrefJavascript(src, inicioValor, nombreAttr)) manejador.push(g);
    else atributo.push(g);
  }
  return { atributo, manejador, cuerpo };
}

// La vista del barrido original (solo atributos normales), conservada para
// que xss-interpolaciones-atributo.test.js siga midiendo lo mismo.
export function hallarAtributos(src) {
  return clasificarInterpolaciones(src).atributo;
}

// ------------------------------------------------------------
//  Reglas mecanicas de seguridad sobre el TEXTO de una expresion ${...}.
// ------------------------------------------------------------
export const AYUDANTES_SEGUROS = [
  'escHtml', 'escJsAttr', 'safeColor', 'money', 'encodeURIComponent',
  'Math.round', 'Math.min', 'Math.max', 'Math.floor', 'Math.ceil', 'Number'
];

export function envueltaPorAyudante(expr, ayudantes = AYUDANTES_SEGUROS) {
  for (const nombre of ayudantes) {
    const prefijo = nombre + '(';
    if (expr.startsWith(prefijo) && expr.endsWith(')')) {
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

export function partirTernario(expr) {
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

export function partirConcat(expr) {
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

export function esExprSegura(expr, ayudantes = AYUDANTES_SEGUROS) {
  const e = expr.trim();
  if (e === '') return true;
  if (/^\d+$/.test(e)) return true;
  if (/^'[^'\\]*'$/.test(e) || /^"[^"\\]*"$/.test(e)) return true;
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\.(id|length)$/.test(e)) return true;
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\s*[+\-]\s*\d+$/.test(e)) return true;
  if (/^[\w$.]+\s*(===|!==|==|!=)\s*[\w$.]+$/.test(e)) return true;
  if (envueltaPorAyudante(e, ayudantes)) return true;
  const tern = partirTernario(e);
  if (tern) return esExprSegura(tern.a, ayudantes) && esExprSegura(tern.b, ayudantes);
  const partes = partirConcat(e);
  if (partes) return partes.every(p => esExprSegura(p, ayudantes));
  return false;
}
