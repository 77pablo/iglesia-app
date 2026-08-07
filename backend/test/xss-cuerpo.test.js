// ============================================================
//  Barrido: interpolaciones ${...} en el CUERPO de texto (fuera de todo
//  atributo). Segunda mitad de la tanda G (6-ago); la primera es
//  xss-manejadores.test.js y el original es xss-interpolaciones-atributo.
//
//  Aqui el peligro es abrir una etiqueta: basta un '<' en el dato. Y aqui
//  construir HTML con ayudantes es LEGITIMO (filas, chips, listas), asi que
//  las reglas son mas anchas que en los otros dos barridos, y cada regla
//  ancha lleva su verificacion:
//
//  - Un template literal entero como expresion cuenta como literal
//    (opts.templatesComoLiteral): sus ${...} internos NO se saltan — el
//    tokenizador los recolecta aparte y este mismo barrido los clasifica
//    uno a uno. Lo unico que se da por bueno es el HTML fijo entre ellos.
//  - Una tabla de constantes EN MAYUSCULAS indexada (MESES[...]) es segura
//    (opts.tablasMayusculas) PORQUE el test de tablas de abajo exige que
//    cada una se declare con puros literales.
//  - AYUDANTES_CUERPO amplia la lista base con formateadores y
//    constructores de este archivo LEIDOS UNO A UNO (motivo junto a cada
//    nombre). Tres de ellos (parseFecha/fechaTxt/fechaDeUTC) devolvian
//    texto CRUDO en sus fallbacks y la tanda G los arreglo primero; los
//    candados de abajo fijan esos arreglos.
//
//  PENDIENTES nacio como trinquete con 199 firmas (la cola que la tanda G
//  no alcanzo a clasificar) y los lotes 1-3 del mismo 6-ago la QUEMARON
//  ENTERA: quedo VACIA y asi se queda — igual que la lista del barrido de
//  botones. Todo sitio vive ahora en una de tres casas: las reglas
//  mecanicas, AYUDANTES_CUERPO (verificados uno a uno), o EXCEPCIONES (con
//  motivo y zombie-check). Una interpolacion nueva sin escapar no tiene
//  donde esconderse: rompe la suite.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clasificarInterpolaciones, esExprSegura, AYUDANTES_SEGUROS } from './xss-analisis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
// CRLF -> LF: git puede sacar web/app.js con uno u otro fin de linea segun
// la maquina, y las firmas del barrido llevan posiciones/contexto del texto
// (sin normalizar, el mismo codigo daria firmas distintas segun el checkout).
const fuente = fs.readFileSync(APP_JS, 'utf8').replace(/\r\n/g, '\n');

// Cada nombre extra esta VERIFICADO leyendo su definicion en web/app.js:
const AYUDANTES_CUERPO = [...AYUDANTES_SEGUROS,
  'fechaTxt',    // parseFecha estricto (solo \d{4}-\d{2}-\d{2}) + fallback inofensivo — candados abajo
  'fechaDeUTC',  // fallback solo deja pasar forma de fecha — candado abajo
  'chipFecha',   // parseFecha estricto: x.d/x.m son digitos; el resto, HTML fijo
  'fechaChip',   // identico a chipFecha
  'duracionTxt', // Math.floor sobre Number(seg): solo numeros y unidades fijas
  'dirAvatar',   // escHtml(safeUrl(...)) y escHtml(ini); size numerico (excepciones del barrido de atributos)
  '_renderAcordes', // escHtml en TODAS sus ramas (linea a linea)
  'fechaSelectHTML', // devuelve un template: sus ${...} internos los barren este archivo y el de atributos
  'labelDe',     // NAV[..][2] literales; fallback k: claves internas de NAV, no datos de persona
  'iconDe',      // NAV[..][1] literales; fallback fijo
  'opt',         // flecha local de vistaAjustes; llamadas solo con literales (test en xss-manejadores)
  'pad',         // String(Number(n)).padStart: solo digitos
  'accionesBtns',   // template propio, barrido; args fijados por tests (atributos + manejadores)
  'errCargar',      // template propio; reintentar fijado por test en xss-manejadores
  'chipMensajePortal',       // tres ramas literales
  'botonBorrarMensajePortal', // Number(id) + booleano
  // Callbacks de .map(...).join() verificados para la regla mapJoin (lote 2):
  'filaMov',      // escHtml/money/Number en todo dato; su template lo barren estos archivos
  'filaAsist',    // escHtml(m.nombre) y escHtml(m.grupos); resto literales
  'filaCampania', // escHtml(c.nombre), money(), pct de Math.round
  'filaNotif',    // escHtml(n.titulo/n.texto); el onclick tiene su excepcion en xss-manejadores
  // Lote 3:
  'filaCampaniaCerrada', // escHtml(c.nombre), money(), escHtml(fechaDeUTC(...))
  'card',         // helper local del panel del obispo; card( y lista( SOLO se llaman
  'lista'         // ahi (verificado con grep), y las interpolaciones DENTRO de sus
                  // argumentos las barre este mismo archivo por separado
];
const OPTS = { templatesComoLiteral: true, tablasMayusculas: true, mapJoin: true };

// Verificadas una a una en el lote 1 (6-ago): sitios que NO son HTML o son
// internos de helpers ya demostrados. Cada firma debe seguir existiendo en el
// codigo (zombie = fallo), igual que las de PENDIENTES.
const EXCEPCIONES = [
  { firma: "div class=\"mini-date\"><b>⟨⟩x.d",
    motivo: "interno de chipFecha/fechaChip: x.d viene del parseFecha estricto (solo digitos) — el candado de parseFecha esta abajo" },
  { firma: "iv class=\"fecha-chip\"><b>⟨⟩x.d",
    motivo: "interno de chipFecha/fechaChip: x.d viene del parseFecha estricto (solo digitos) — el candado de parseFecha esta abajo" },
  { firma: "((s%3600)/60); return m?`⟨⟩h",
    motivo: "interno de duracionTxt(): h/m/d/s salen de Math.floor sobre Number(seg) dos lineas arriba, solo numeros" },
  { firma: "0)/60); return m?`${h} h ⟨⟩m",
    motivo: "interno de duracionTxt(): h/m/d/s salen de Math.floor sobre Number(seg) dos lineas arriba, solo numeros" },
  { firma: "urn m?`${h} h ${m} min`:`⟨⟩h",
    motivo: "interno de duracionTxt(): h/m/d/s salen de Math.floor sobre Number(seg) dos lineas arriba, solo numeros" },
  { firma: "%86400)/3600); return h?`⟨⟩d",
    motivo: "interno de duracionTxt(): h/m/d/s salen de Math.floor sobre Number(seg) dos lineas arriba, solo numeros" },
  { firma: "/3600); return h?`${d} d ⟨⟩h",
    motivo: "interno de duracionTxt(): h/m/d/s salen de Math.floor sobre Number(seg) dos lineas arriba, solo numeros" },
  { firma: "eturn h?`${d} d ${h} h`:`⟨⟩d",
    motivo: "interno de duracionTxt(): h/m/d/s salen de Math.floor sobre Number(seg) dos lineas arriba, solo numeros" },
  { firma: "w.matchMedia(`(max-width:⟨⟩NAV_MOVIL_MAX",
    motivo: "media query de matchMedia, no HTML; NAV_MOVIL_MAX es una constante numerica de este archivo" },
  { firma: "ue) return ''; return `⟨⟩a.value",
    motivo: "fechaSelectValor() devuelve la cadena YYYY-MM-DD de los <select> que la propia app construyo con digitos, no HTML" },
  { firma: "''; return `${a.value}-⟨⟩String(m.value).padStart(2,'0')",
    motivo: "fechaSelectValor() devuelve la cadena YYYY-MM-DD de los <select> que la propia app construyo con digitos, no HTML" },
  { firma: ".value).padStart(2,'0')}-⟨⟩String(d.value).padStart(2,'0')",
    motivo: "fechaSelectValor() devuelve la cadena YYYY-MM-DD de los <select> que la propia app construyo con digitos, no HTML" },
  { firma: "dia++){ const fecha=`⟨⟩y",
    motivo: "cadena de fecha `${y}-${pad(m+1)}-${pad(dia)}` con enteros del bucle del calendario, no HTML (candado de su forma en xss-manejadores)" },
  { firma: "h.n; if(!h.id) h.id=`⟨⟩h.seccion",
    motivo: "construccion del id interno estable de un himno (\"2-45\"), no HTML; h.seccion/h.n son enteros de _normalizarHimnos" },
  { firma: "h.id) h.id=`${h.seccion}-⟨⟩h.n",
    motivo: "construccion del id interno estable de un himno (\"2-45\"), no HTML; h.seccion/h.n son enteros de _normalizarHimnos" },
  { firma: "span class=\"muted small\">⟨⟩_hmTrans>0?'+'+_hmTrans:_hmTrans",
    motivo: "estado interno del transpositor de acordes (+/- semitonos): entero que solo tocan los botones, mostrado como +N/-N" },
  { firma: "span class=\"muted small\">⟨⟩_vcTrans>0?'+'+_vcTrans:_vcTrans",
    motivo: "estado interno del transpositor de acordes (+/- semitonos): entero que solo tocan los botones, mostrado como +N/-N" },
  { firma: "teriores a esta bandeja (⟨⟩d.previos",
    motivo: "textContent del contador de mensajes anteriores, no innerHTML: el navegador no interpreta HTML ahi" },
  { firma: "teriores a esta bandeja (⟨⟩_mpPreviosTotal",
    motivo: "textContent del contador de mensajes anteriores, no innerHTML: el navegador no interpreta HTML ahi" },
  { firma: "||h.fecha; let txt=`*⟨⟩titulo",
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" },
  { firma: "_llegada) txt+=`, llegar ⟨⟩h.hora_llegada",
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" },
  { firma: " if(lugar) txt+=`\\n📍 ⟨⟩lugar",
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" },
  { firma: "turn `${c.listo?'✅':'•'} ⟨⟩c.nombre",
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" },
  { firma: "to?'✅':'•'} ${c.nombre} ×⟨⟩c.cantidad",
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" },
  { firma: "{c.nombre} ×${c.cantidad}⟨⟩quien",
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" },
  { firma: " stroke-linejoin=\"round\">⟨⟩p",
    motivo: "_ic(p): sus llamadores son solo los literales SVG de la tabla NAV_ICON" },
  { firma: "📅 Próximos eventos</div>⟨⟩listaEventos",
    motivo: "renderDashboard: listas construidas ahi mismo con templates barridos (escHtml, chipFecha, Number)" },
  { firma: " Anuncios recientes</div>⟨⟩listaAnuncios",
    motivo: "renderDashboard: listas construidas ahi mismo con templates barridos (escHtml, chipFecha, Number)" },
  { firma: "<div class=\"anuncio-img\">⟨⟩IMG_AUDITORIO",
    motivo: "const SVG de puros literales declarada al tope del archivo" },
  { firma: " ${blanco?'selected':''}>⟨⟩t",
    motivo: "fechaSelectHTML: t es el parametro del placeholder ph(), llamado solo con los literales Dia/Mes/Año" },
  { firma: "{d===dDef?'selected':''}>⟨⟩d",
    motivo: "fechaSelectHTML/ajustarDias: enteros de bucle (dia/año) o nombres de MESES_LARGO" },
  { firma: "1)===mDef?'selected':''}>⟨⟩nm",
    motivo: "fechaSelectHTML/ajustarDias: enteros de bucle (dia/año) o nombres de MESES_LARGO" },
  { firma: "{a===yDef?'selected':''}>⟨⟩a",
    motivo: "fechaSelectHTML/ajustarDias: enteros de bucle (dia/año) o nombres de MESES_LARGO" },
  { firma: "\" style=\"max-width:90px\">⟨⟩diaOpts",
    motivo: "fechaSelectHTML: options construidas dos lineas arriba con enteros de bucle y MESES_LARGO" },
  { firma: "ustarDias('${prefijo}')\">⟨⟩mesOpts",
    motivo: "fechaSelectHTML: options construidas dos lineas arriba con enteros de bucle y MESES_LARGO" },
  { firma: "ustarDias('${prefijo}')\">⟨⟩anioOpts",
    motivo: "fechaSelectHTML: options construidas dos lineas arriba con enteros de bucle y MESES_LARGO" },
  { firma: "{x===dSel?'selected':''}>⟨⟩x",
    motivo: "fechaSelectHTML/ajustarDias: enteros de bucle (dia/año) o nombres de MESES_LARGO" },
  { firma: "ick=\"toggleFormEvento()\">⟨⟩label",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "d=>`<div class=\"cal-dow\">⟨⟩d",
    motivo: "calendario: dia de la semana de un array literal (L/M/X...)" },
  { firma: "`<div class=\"cal-puntos\">⟨⟩chips",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "ntos\">${chips}</div>`:''}⟨⟩mas",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " <div class=\"cal-grid\">⟨⟩celdas",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " ${fechaTxt(fecha)}</div>⟨⟩btnPedir",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "v style=\"margin-top:6px\">⟨⟩badge",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " style=\"margin-top:16px\">⟨⟩inner",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "tyle=\"margin-bottom:4px\">⟨⟩titulo",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "el><select id=\"ev-grupo\">⟨⟩opts",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "on value=\"rol:${rl}\">🏷️ ⟨⟩ROL_LABEL[rl]||rl",
    motivo: "ROL_LABEL[rl] con fallback rl: rl viene de s.roles, la lista fija de notificaciones.js (misma verificacion que la excepcion rol:${rl} del barrido de atributos)" },
  { firma: " Toda la iglesia</option>⟨⟩grupos",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "iglesia</option>${grupos}⟨⟩roles",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "exto:'')}</textarea> ⟨⟩segHtml",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "chip estado-${a.estado}\">⟨⟩si",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "stado-${a.estado}\">${si} ⟨⟩sl",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "Html(a.motivo):''}</span>⟨⟩acc",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "\"pintarNoDispServicio()\">⟨⟩ev",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "><select id=\"sv-persona\">⟨⟩ps",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "ight:600;margin-top:4px\">⟨⟩accion",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "iltrarPanel(this.value)\">⟨⟩opts",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "<select id=\"set-cancion\">⟨⟩opts",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " style=\"max-width:200px\">⟨⟩popts",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " style=\"max-width:150px\">⟨⟩iopts",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "-titulo\">🗓️ Ensayo</div>⟨⟩ensayoHtml",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "mber(numPersonas)})</div>⟨⟩equipoHtml",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "nas)})</div>${equipoHtml}⟨⟩addHtml",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " <div style=\"flex:1\">⟨⟩titulo",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "chip\">📌 Fijo</span>':''}⟨⟩sub",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "ass=\"estado-chip ${cls}\">⟨⟩si",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "stado-chip ${cls}\">${si} ⟨⟩sl",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "accion-${m.id}\"> ⟨⟩chip",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "${m.id}\"> ${chip}⟨⟩boton",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " : ''; z.innerHTML=`⟨⟩btnTodos",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "Todos}<div id=\"mp-lista\">⟨⟩lista",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " más</button>':''} ⟨⟩previos",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " small\">No se pudo cargar⟨⟩que?' '+que:''",
    motivo: "interior de errCargar: que es un literal en cada llamada (lo fija el test de errCargar en xss-manejadores)" },
  { firma: "n-items:center;gap:10px\">⟨⟩sel",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "\"><div style=\"flex:1\"><b>⟨⟩ic",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "span class=\"muted small\">⟨⟩link",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "\" style=\"margin-top:8px\">⟨⟩recs||'<p class=\"muted small\">Sin recursos.</p>'",
    motivo: "ternarios de literales o de templates barridos, escritos con parentesis o concatenacion — cada rama verificada en el lote 3" },
  { firma: "<div class=\"widget-head\">⟨⟩titulo",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "get-head\">${titulo}</div>⟨⟩inner",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: ":`<p class=\"muted small\">⟨⟩vacio",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "d small\">Iglesia:</span> ⟨⟩selIglesia",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "=\"flex:1;font-size:16px\">⟨⟩titulo",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "top:8px\">Sin notas.</p>'}⟨⟩recs?'<h3 class=\"section-title\" style=\"margin-top:14px\">Recursos</h3><div class=\"list\">'+recs+'</div>':''",
    motivo: "ternarios de literales o de templates barridos, escritos con parentesis o concatenacion — cada rama verificada en el lote 3" },
  { firma: ";gap:6px;flex-wrap:wrap\">⟨⟩chips",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "\" style=\"margin-top:6px\">⟨⟩contacto",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "s=\"reason\" data-r=\"${r}\">⟨⟩r",
    motivo: "modalConfirm/modalPrompt/modalDetalle/modalReason son sumideros POR DISEÑO: pintan lo que el llamador compone, y cada interpolacion de los llamadores la barre este mismo archivo en SU sitio" },
  { firma: "cHtml(u.usuario)}</span> ⟨⟩badges",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "v style=\"margin-top:6px\">⟨⟩chips",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "m-userform\"></div> ⟨⟩usuarios||'<p class=\"muted small\">Sin usuarios.</p>'",
    motivo: "ternarios de literales o de templates barridos, escritos con parentesis o concatenacion — cada rama verificada en el lote 3" },
  { firma: "-grupoform\"></div> ⟨⟩grupos||'<p class=\"muted small\">Sin grupos.</p>'",
    motivo: "ternarios de literales o de templates barridos, escritos con parentesis o concatenacion — cada rama verificada en el lote 3" },
  { firma: " al asignarlo.</p> ⟨⟩leyenda",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "l(${Number(personaId)})\">⟨⟩window._admRolesOpts",
    motivo: "renderAdmin: mismas options que ya valida la excepcion value::${r} del barrido de atributos" },
  { firma: "=\"ar-grupo-${personaId}\">⟨⟩window._admGruposOpts",
    motivo: "renderAdmin: mismas options que ya valida la excepcion value::${r} del barrido de atributos" },
  { firma: "olor});text-align:right\">⟨⟩ico",
    motivo: "_persFila: ico/motivo/cuando/retraso salen de PERS_PINTA (const de literales) y de escHtml/duracionTxt" },
  { firma: "Ajuste('${g}','${val}')\">⟨⟩label",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " <div class=\"org-quien\">⟨⟩ed?quien:(x.responsable_nombre?'👤 '+escHtml(x.responsable_nombre):'')",
    motivo: "ed?quien:(...): las dos ramas construidas con escHtml (verificado); quien cae en la regla de locales verificadas" },
  { firma: "an class=\"muted small\">· ⟨⟩fuenteTxt",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " <div id=\"org-cosas\">⟨⟩cosas",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " <div id=\"org-gastos\">⟨⟩gastos",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "tado)}</b></div> ⟨⟩aportes",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: " ${aportes} ⟨⟩correcciones",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "o)}\" de ${money(g.monto)}⟨⟩quien",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: "ow:auto;margin-top:10px\">⟨⟩opciones",
    motivo: "variable local construida en la misma funcion SOLO con templates ya barridos (escHtml/money/Number/safeUrl en todo dato) — verificada en el lote 3" },
  { firma: ".saldo)}</b></p> ⟨⟩trans.porCategoria.length ? trans.porCategoria.map(g=>{const pct=trans.gastado?Math.round(g.monto/trans.gastado*100):0; return `<div class=\"dato-row\"><span>${escHtml(cap(g.categoria))}</span><span class=\"val\">${Number(pct)}% · ${money(g.monto)}</span></div>`;}).join('') : '<p class=\"muted small\">Cuando se registren gastos, aquí se verá en qué se fue el dinero.</p>'",
    motivo: "flecha con cuerpo de bloque: la regla mapJoin no la matchea A PROPOSITO (fallo conservador); interior verificado — escHtml(cap()), Number(pct), money()" },
  { firma: "ding:18px;overflow:auto\">⟨⟩html",
    motivo: "modalConfirm/modalDetalle son sumideros POR DISEÑO: pintan lo que el llamador compone, y cada interpolacion de los llamadores la barre este mismo archivo en SU sitio" },
  { firma: "tyle=\"margin:8px 0 16px\">⟨⟩msg",
    motivo: "modalConfirm/modalDetalle son sumideros POR DISEÑO: pintan lo que el llamador compone, y cada interpolacion de los llamadores la barre este mismo archivo en SU sitio" },
  { firma: "=\"${okClase}\" id=\"cf-ok\">⟨⟩okLabel",
    motivo: "modalConfirm/modalDetalle son sumideros POR DISEÑO: pintan lo que el llamador compone, y cada interpolacion de los llamadores la barre este mismo archivo en SU sitio; okLabel ademas es un literal en cada llamada del archivo" },
  { firma: "tyle=\"margin:8px 0 14px\">⟨⟩msg",
    motivo: "modalConfirm/modalDetalle son sumideros POR DISEÑO: pintan lo que el llamador compone, y cada interpolacion de los llamadores la barre este mismo archivo en SU sitio" },
  { firma: "span class=\"muted small\">⟨⟩motivo",
    motivo: "_persFila: escHtml en motivo (con tabla PERS_MOTIVO), en cuando (haceTxt + toLocaleString) y en retraso (duracionTxt) — verificado en el lote 3" },
  { firma: "s=\"muted small\">${motivo}⟨⟩cuando",
    motivo: "_persFila: escHtml en motivo (con tabla PERS_MOTIVO), en cuando (haceTxt + toLocaleString) y en retraso (duracionTxt) — verificado en el lote 3" },
  { firma: "small\">${motivo}${cuando}⟨⟩retraso",
    motivo: "_persFila: escHtml en motivo (con tabla PERS_MOTIVO), en cuando (haceTxt + toLocaleString) y en retraso (duracionTxt) — verificado en el lote 3" },
  { firma: "responsable_nombre ? ` — ⟨⟩c.responsable_nombre",
    motivo: "texto para el portapapeles del compartir de Organizacion (clipboard.writeText); el unico camino a HTML pasa por escHtml(txt)" }
];
const EXCEPCIONES_MAP = new Map(EXCEPCIONES.map(e => [e.firma, e.motivo]));

const PENDIENTES_LISTA = [];
const PENDIENTES = new Set(PENDIENTES_LISTA);

const firmaDe = (it) =>
  fuente.slice(Math.max(0, it.inicio - 25), it.inicio).replace(/\s+/g, ' ')
  + '⟨⟩' + it.expr.replace(/\s+/g, ' ');

test('las tablas MAYUSCULAS indexadas se declaran con puros literales (condición de la regla tablasMayusculas)', () => {
  const { cuerpo } = clasificarInterpolaciones(fuente);
  const nombres = new Set();
  for (const it of cuerpo) {
    const m = it.expr.trim().match(/^([A-Z][A-Z_0-9]*)\[/);
    if (m) nombres.add(m[1]);
  }
  assert.ok(nombres.size >= 3, 'deberían usarse varias tablas; si no se encuentra ninguna, el patrón se rompió');
  for (const nombre of nombres) {
    const decl = fuente.match(new RegExp('const\\s+' + nombre + '\\s*=\\s*([\\[{])'));
    assert.ok(decl, `no se encontró la declaración de ${nombre}: la regla tablasMayusculas la daría por segura sin serlo`);
    let i = decl.index + decl[0].length - 1, saldo = 0, fin = -1, comilla = null;
    for (; i < fuente.length; i++) {
      const c = fuente[i];
      if (comilla) { if (c === '\\') { i++; continue; } if (c === comilla) comilla = null; continue; }
      if (c === "'" || c === '"') { comilla = c; continue; }
      if (c === '[' || c === '{') saldo++;
      else if (c === ']' || c === '}') { saldo--; if (saldo === 0) { fin = i; break; } }
    }
    assert.ok(fin > 0, `no se pudo cerrar la declaración de ${nombre}`);
    const inicializador = fuente.slice(decl.index, fin + 1);
    // Sin backticks, sin ${ y sin + fuera de strings: ninguna via para que un
    // dato de persona acabe dentro de la tabla. (_ic('...literal...') de
    // NAV_ICON pasa: llamada con literal, sin concatenar nada.)
    assert.ok(!/[`+]|\$\{/.test(inicializador.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '')),
      `la tabla ${nombre} ya no es de puros literales: la regla tablasMayusculas dejaría pasar datos crudos`);
  }
});

test('barrido: toda interpolación ${...} del cuerpo de texto pasa por un ayudante seguro, una regla mecánica, o está en PENDIENTES (y la lista solo encoge)', () => {
  const { cuerpo } = clasificarInterpolaciones(fuente);
  assert.ok(cuerpo.length > 400, 'el barrido debería ver cientos de interpolaciones de cuerpo; si ve muy pocas, el tokenizador se rompió');

  const malas = cuerpo.filter(it => !esExprSegura(it.expr, AYUDANTES_CUERPO, OPTS));
  const firmasVistas = new Set();
  const nuevas = [];
  for (const it of malas) {
    const firma = firmaDe(it);
    firmasVistas.add(firma);
    if (EXCEPCIONES_MAP.has(firma)) continue;
    if (!PENDIENTES.has(firma)) {
      nuevas.push(`línea ${it.linea}: ${JSON.stringify(firma)}`);
    }
  }
  assert.deepEqual(nuevas, [],
    'interpolaciones de cuerpo NUEVAS sin escapar (el código nuevo sale limpio: escHtml/money/Number o un ayudante de la lista, no una entrada más en PENDIENTES):\n' + nuevas.join('\n'));

  const zombies = PENDIENTES_LISTA.filter(f => !firmasVistas.has(f));
  assert.deepEqual(zombies, [],
    'firmas de PENDIENTES que ya no corresponden a ningún sitio (¿arreglaste o moviste el código? BORRA su firma — la lista solo puede encoger):\n' + zombies.join('\n'));

  const excZombies = EXCEPCIONES.filter(e => !firmasVistas.has(e.firma)).map(e => e.firma);
  assert.deepEqual(excZombies, [],
    'excepciones que ya no corresponden a ningún sitio del código: bórralas (una excepción sin sitio blanquea de más):\n' + excZombies.join('\n'));
});

test('todas las excepciones del cuerpo tienen un motivo real (no solo un nombre)', () => {
  for (const exc of EXCEPCIONES) {
    assert.ok(exc.motivo && exc.motivo.trim().length >= 20,
      `excepción sin motivo suficiente: ${JSON.stringify(exc.firma)}`);
  }
});

// ------------------------------------------------------------
//  Candados de los arreglos que hicieron whitelisteables los formateadores.
// ------------------------------------------------------------

test('parseFecha es estricto: solo YYYY-MM-DD de dígitos (sin esto, fechaTxt/chipFecha devuelven crudo el tercer trozo de cualquier "a-b-c")', () => {
  assert.ok(fuente.includes("const m=String(f||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/)"),
    'parseFecha ya no exige \\d{4}-\\d{2}-\\d{2}: chipFecha/fechaChip/fechaTxt dejan de ser seguros y hay que sacarlos de AYUDANTES_CUERPO');
});

test('fechaTxt: el fallback descarta cualquier texto peligroso (y NO escapa, para no doblar el escape de los llamadores)', () => {
  const i = fuente.indexOf('function fechaTxt(');
  assert.ok(i > 0, 'falta fechaTxt en web/app.js');
  const cuerpoFn = fuente.slice(i, fuente.indexOf('\n', i));
  assert.ok(cuerpoFn.includes('/^[^<>&"\'`]*$/.test(s)?s:\'—\''),
    'el fallback de fechaTxt ya no descarta texto peligroso: deja de ser seguro para AYUDANTES_CUERPO');
});

test('fechaDeUTC: el fallback solo deja pasar lo que tiene forma de fecha', () => {
  const i = fuente.indexOf('function fechaDeUTC(');
  assert.ok(i > 0, 'falta fechaDeUTC en web/app.js');
  const cuerpoFn = fuente.slice(i, fuente.indexOf('\n}', i));
  assert.ok(cuerpoFn.includes('/^\\d{4}-\\d{2}-\\d{2}$/.test(t)?t:\'—\''),
    'el fallback de fechaDeUTC ya no filtra por forma de fecha: deja de ser seguro para AYUDANTES_CUERPO');
});

// ------------------------------------------------------------
//  Autocomprobación: el clasificador tiene que VER un ataque de mentira.
// ------------------------------------------------------------

test('autocomprobación: un dato crudo en el cuerpo se marca; envuelto en escHtml pasa; y el template anidado NO esconde su interior', () => {
  const cruda = 'const x = `<div>${persona.nombre}</div>`;';
  const { cuerpo: c1 } = clasificarInterpolaciones(cruda);
  assert.equal(esExprSegura(c1[0].expr, AYUDANTES_CUERPO, OPTS), false,
    'persona.nombre crudo en el cuerpo tiene que marcarse');

  const envuelta = 'const x = `<div>${escHtml(persona.nombre)}</div>`;';
  const { cuerpo: c2 } = clasificarInterpolaciones(envuelta);
  assert.equal(esExprSegura(c2[0].expr, AYUDANTES_CUERPO, OPTS), true);

  // La regla del contenedor: la expresión externa (un ternario con template)
  // pasa, pero la interpolación cruda DE DENTRO del template se recolecta
  // aparte y se marca — el contenedor no blanquea su contenido.
  const anidada = "const x = `<div>${ok?`<b>${persona.nombre}</b>`:''}</div>`;";
  const { cuerpo: c3 } = clasificarInterpolaciones(anidada);
  const exprs = c3.map(it => it.expr);
  assert.ok(exprs.some(e => e === 'persona.nombre'), 'la interpolación interna tiene que recolectarse aparte');
  assert.equal(esExprSegura('persona.nombre', AYUDANTES_CUERPO, OPTS), false);
  const externa = exprs.find(e => e.includes('ok?'));
  assert.equal(esExprSegura(externa, AYUDANTES_CUERPO, OPTS), true,
    'el contenedor con HTML fijo sí pasa (su interior se juzga aparte)');
});

test('autocomprobación mapJoin: la flecha-template y el ayudante pasan; la flecha que devuelve crudo NO', () => {
  assert.equal(esExprSegura("xs.map(x=>`<b>${escHtml(x.n)}</b>`).join('')", AYUDANTES_CUERPO, OPTS), true,
    'flecha con template: sus ${} internos se barren aparte');
  assert.equal(esExprSegura("movs.filter(m=>m.ok).map(filaMov).join('')", AYUDANTES_CUERPO, OPTS), true,
    'callback nombrado de la lista de ayudantes');
  assert.equal(esExprSegura("xs.map(x=>x.nombre).join('')", AYUDANTES_CUERPO, OPTS), false,
    'una flecha que devuelve el dato crudo une nombres sin escapar: tiene que marcarse');
  assert.equal(esExprSegura("xs.map(fnCualquiera).join('')", AYUDANTES_CUERPO, OPTS), false,
    'un callback nombrado FUERA de la lista no se da por bueno');
});
