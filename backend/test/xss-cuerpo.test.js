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
//  ⚠️ LA DEUDA, explicita: PENDIENTES es la cola que quedo sin clasificar
//  con rigor (labels y trozos de HTML guardados en variables locales, en su
//  mayoria). Es un TRINQUETE: cada sitio nuevo tiene que salir limpio (no
//  se puede añadir a la lista sin que el barrido de este archivo lo grite),
//  y cuando se arregle o clasifique un sitio viejo hay que BORRAR su firma
//  (una firma sin sitio hace fallar la suite). La lista solo puede encoger.
//  El plan de la tanda G deja anotado quemarla por lotes.
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
  'filaNotif'     // escHtml(n.titulo/n.texto); el onclick tiene su excepcion en xss-manejadores
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
    motivo: "texto para el portapapeles del boton compartir de Organizacion (clipboard.writeText); el unico camino a HTML es el fallback, que pasa por escHtml(txt)" }
];
const EXCEPCIONES_MAP = new Map(EXCEPCIONES.map(e => [e.firma, e.motivo]));

const PENDIENTES_LISTA = [
" stroke-linejoin=\"round\">⟨⟩p",
"' ')[0])} 👋</h2> <p>⟨⟩ME.iglesia?ME.iglesia.nombre:''",
"?ME.iglesia.nombre:''} · ⟨⟩$('u-rol').textContent",
"\">${escHtml(e.grupo||'')}⟨⟩e.hora_inicio?' · '+e.hora_inicio:''",
"📅 Próximos eventos</div>⟨⟩listaEventos",
" Anuncios recientes</div>⟨⟩listaAnuncios",
"<div class=\"anuncio-img\">⟨⟩IMG_AUDITORIO",
" ${blanco?'selected':''}>⟨⟩t",
"{d===dDef?'selected':''}>⟨⟩d",
"1)===mDef?'selected':''}>⟨⟩nm",
"{a===yDef?'selected':''}>⟨⟩a",
"\" style=\"max-width:90px\">⟨⟩diaOpts",
"ustarDias('${prefijo}')\">⟨⟩mesOpts",
"ustarDias('${prefijo}')\">⟨⟩anioOpts",
"{x===dSel?'selected':''}>⟨⟩x",
"ick=\"toggleFormEvento()\">⟨⟩label",
"d=>`<div class=\"cal-dow\">⟨⟩d",
"();abrirEvento(${e.id})\">⟨⟩e.hora_inicio?'<b>'+e.hora_inicio+'</b> ':''",
"`<div class=\"cal-puntos\">⟨⟩chips",
"ntos\">${chips}</div>`:''}⟨⟩mas",
" <h3>${MESES_LARGO[m]} ⟨⟩y",
" <div class=\"cal-grid\">⟨⟩celdas",
" ${fechaTxt(fecha)}</div>⟨⟩btnPedir",
"\udff7️ '+escHtml(e.grupo):''}⟨⟩e.hora_inicio?' · 🕐 '+e.hora_inicio+(e.hora_fin?'–'+e.hora_fin:''):''",
"v style=\"margin-top:6px\">⟨⟩badge",
" style=\"margin-top:16px\">⟨⟩inner",
"tyle=\"margin-bottom:4px\">⟨⟩titulo",
"el><select id=\"ev-grupo\">⟨⟩opts",
"nclick=\"guardarEvento()\">⟨⟩ev?'Guardar cambios':(esPastorUI?'Crear evento':'📩 Enviar al pastor')",
"on value=\"rol:${rl}\">🏷️ ⟨⟩ROL_LABEL[rl]||rl",
" Toda la iglesia</option>⟨⟩grupos",
"iglesia</option>${grupos}⟨⟩roles",
"exto:'')}</textarea> ⟨⟩segHtml",
"chip estado-${a.estado}\">⟨⟩si",
"stado-${a.estado}\">${si} ⟨⟩sl",
"Html(a.motivo):''}</span>⟨⟩acc",
"\">📅 ${fechaTxt(m.fecha)}⟨⟩m.hora_inicio?' · 🕐 '+m.hora_inicio:''",
"\"pintarNoDispServicio()\">⟨⟩ev",
"><select id=\"sv-persona\">⟨⟩ps",
"ight:600;margin-top:4px\">⟨⟩accion",
"ist-prev\">Última vez: <b>⟨⟩d.ultimaVez",
"3> <div class=\"list\">⟨⟩asistieron.length? asistieron.map(m=>filaAsist(m,true)).join('') : '<p class=\"muted small\">Nadie marcado aún.</p>'",
"3> <div class=\"list\">⟨⟩ausentes.length? ausentes.map(m=>filaAsist(m,false)).join('') : '<p class=\"muted small\">¡Todos asistieron! 🎉</p>'",
"iltrarPanel(this.value)\">⟨⟩opts",
"iv><div class=\"stat-num\">⟨⟩d.ultima?d.ultima.total:'—'",
"iv><div class=\"stat-num\">⟨⟩ultimaAsis?ultimaAsis.total:'—'",
"<select id=\"set-cancion\">⟨⟩opts",
" style=\"max-width:200px\">⟨⟩popts",
" style=\"max-width:150px\">⟨⟩iopts",
"-titulo\">🗓️ Ensayo</div>⟨⟩ensayoHtml",
"mber(numPersonas)})</div>⟨⟩equipoHtml",
"nas)})</div>${equipoHtml}⟨⟩addHtml",
" <div style=\"flex:1\">⟨⟩titulo",
"chip\">📌 Fijo</span>':''}⟨⟩sub",
"ass=\"estado-chip ${cls}\">⟨⟩si",
"stado-chip ${cls}\">${si} ⟨⟩sl",
"accion-${m.id}\"> ⟨⟩chip",
"${m.id}\"> ${chip}⟨⟩boton",
" : ''; z.innerHTML=`⟨⟩btnTodos",
"Todos}<div id=\"mp-lista\">⟨⟩lista",
" más</button>':''} ⟨⟩previos",
"true})}); toast(`✅ ⟨⟩d.atendidos",
"radas</div> ⟨⟩camps.filter(c=>c.cerrada_en).map(filaCampaniaCerrada).join('')",
"</span><span class=\"val\">⟨⟩pct",
".saldo)}</b></p> ⟨⟩trans.porCategoria.length ? trans.porCategoria.map(g=>{const pct=trans.gastado?Math.round(g.monto/trans.gastado*100):0; return `<div class=\"dato-row\"><span>${escHtml(cap(g.categoria))}</span><span class=\"val\">${pct}% · ${money(g.monto)}</span></div>`;}).join('') : '<p class=\"muted small\">Cuando se registren gastos, aquí se verá en qué se fue el dinero.</p>'",
"r\" style=\"width:${pct}%\">⟨⟩pct",
"${escHtml(x.edad||'')} · ⟨⟩x.ninos",
" small\">No se pudo cargar⟨⟩que?' '+que:''",
"n-items:center;gap:10px\">⟨⟩sel",
"escHtml(p.predicador):''}⟨⟩p.recursos?' · 📎 '+p.recursos+' recurso(s)':''",
"\"><div style=\"flex:1\"><b>⟨⟩ic",
"span class=\"muted small\">⟨⟩link",
"\" style=\"margin-top:8px\">⟨⟩recs||'<p class=\"muted small\">Sin recursos.</p>'",
"ignar</button></div> ⟨⟩fallo?'<p class=\"error small\">No se pudo cargar la lista de predicadores · <a href=\"javascript:cargarPredicadores()\" class=\"link\" style=\"display:inline;padding:0\">Reintentar</a></p>' :(list.length?'<div class=\"list\">'+list.map(x=>`<div class=\"item-card flex\"><div style=\"flex:1\"><b>${escHtml(x.nombre)}</b> ${x.vigente?'<span class=\"estado-chip estado-aceptado\">Vigente</span>':'<span class=\"estado-chip\">Inactivo</span>'}<div class=\"muted small\">${fechaTxt(x.desde)} → ${fechaTxt(x.hasta)}</div></div><button class=\"link\" style=\"color:var(--red-tx)\" onclick=\"quitarPredicador(${x.id})\">Quitar</button></div>`).join('')+'</div>':'<p class=\"muted small\">Nadie con rol predicador todavía.</p>')",
"n class=\"estado-chip\">👥 ⟨⟩i.miembros",
"n class=\"estado-chip\">📅 ⟨⟩i.eventos",
"=\"estado-chip\">📊 asist. ⟨⟩i.asistenciaPromedio",
"<div class=\"widget-head\">⟨⟩titulo",
"get-head\">${titulo}</div>⟨⟩inner",
":`<p class=\"muted small\">⟨⟩vacio",
"d small\">Iglesia:</span> ⟨⟩selIglesia",
"iv><div class=\"stat-num\">⟨⟩d.asistencia.promedio",
"e=\"color:var(--primary)\">⟨⟩d.asistencia.reuniones",
"</button> </div> ⟨⟩card('💰 Tesorería del mes', `<div class=\"muted small\">↑ Ingresos <b style=\"color:var(--green-tx)\">${money(d.tesoreria.ingresosMes)}</b> · ↓ Gastos <b style=\"color:var(--red-tx)\">${money(d.tesoreria.gastosMes)}</b> · Balance <b>${money(d.tesoreria.balanceMes)}</b></div><button class=\"btn ghost small-btn\" style=\"margin-top:10px\" onclick=\"obTesoreria(${Number(id)})\">Ver movimientos ›</button>`)",
"an class=\"estado-chip\">✅ ⟨⟩e.asistencia",
"ientos ›</button>`)} ⟨⟩card('📅 Eventos del mes', lista(d.eventosMes, e=>`<div class=\"item-card flex\">${chipFecha(e.fecha)}<div style=\"flex:1\"><div class=\"item-titulo\">${escHtml(e.titulo)}</div><div class=\"muted small\">${escHtml(e.grupo||'')} · ${escHtml(e.estado)}</div></div><span class=\"estado-chip\">✅ ${e.asistencia}</span></div>`, 'Sin eventos este mes.'))",
"ventos este mes.'))} ⟨⟩card('📖 Prédicas del mes', lista(d.predicasMes, p=>`<button type=\"button\" class=\"btn-plano item-card flex\" onclick=\"obPredica(${p.id})\">${chipFecha(p.fecha||'')}<div style=\"flex:1\"><b>${escHtml(p.titulo)}</b><div class=\"muted small\">${escHtml(p.predicador||'')}</div></div><span class=\"muted\" style=\"font-size:18px\">›</span></button>`, 'Sin prédicas este mes.'))",
"iv><div class=\"stat-num\">⟨⟩d.anunciosMes",
"iv><div class=\"stat-num\">⟨⟩d.cuidado.casosAbiertos",
"iv><div class=\"stat-num\">⟨⟩d.ninos.ninos",
"<div class=\"muted small\">⟨⟩d.ninos.clases",
"n class=\"estado-chip\">👥 ⟨⟩g.miembros",
"iv></div> </div> ⟨⟩card('🧩 Grupos', lista(d.grupos, g=>`<div class=\"item-card flex\"><div style=\"flex:1\"><b>${escHtml(g.nombre)}</b></div><span class=\"estado-chip\">👥 ${g.miembros}</span></div>`, 'Sin grupos.'))",
">`, 'Sin grupos.'))} ⟨⟩card('⭐ Líderes', lista(d.lideres, l=>`<div class=\"item-card flex\"><div style=\"flex:1\"><b>${escHtml(l.nombre)}</b><div class=\"muted small\">${escHtml(rolLabel(l.rol||''))} · ${escHtml(l.grupo)}</div></div></div>`, 'Sin líderes.'))",
"=\"flex:1;font-size:16px\">⟨⟩titulo",
"ding:18px;overflow:auto\">⟨⟩html",
"top:8px\">Sin notas.</p>'}⟨⟩recs?'<h3 class=\"section-title\" style=\"margin-top:14px\">Recursos</h3><div class=\"list\">'+recs+'</div>':''",
";gap:6px;flex-wrap:wrap\">⟨⟩chips",
"\" style=\"margin-top:6px\">⟨⟩contacto",
"tyle=\"margin:8px 0 16px\">⟨⟩msg",
"=\"${okClase}\" id=\"cf-ok\">⟨⟩okLabel",
"tyle=\"margin:8px 0 14px\">⟨⟩msg",
"s=\"reason\" data-r=\"${r}\">⟨⟩r",
"cHtml(u.usuario)}</span> ⟨⟩badges",
"v style=\"margin-top:6px\">⟨⟩chips",
"m-userform\"></div> ⟨⟩usuarios||'<p class=\"muted small\">Sin usuarios.</p>'",
"-grupoform\"></div> ⟨⟩grupos||'<p class=\"muted small\">Sin grupos.</p>'",
" al asignarlo.</p> ⟨⟩leyenda",
"l(${Number(personaId)})\">⟨⟩window._admRolesOpts",
"=\"ar-grupo-${personaId}\">⟨⟩window._admGruposOpts",
"cHtml(ig.pastor||'—')} · ⟨⟩ig.miembros||0",
"olor});text-align:right\">⟨⟩ico",
"span class=\"muted small\">⟨⟩motivo",
"s=\"muted small\">${motivo}⟨⟩cuando",
"small\">${motivo}${cuando}⟨⟩retraso",
"ando de nuevo en ⟨⟩PERS_REINTENTO_MS/1000",
"ENTO_MS/1000} s (intento ⟨⟩_persIntentos",
"ento ${_persIntentos} de ⟨⟩PERS_REINTENTOS_MAX",
"Html(ig.nombre)}</b>: <b>⟨⟩miembros",
"bros}</b> miembro(s), <b>⟨⟩eventos",
"&r.archivos_borrados)?` (⟨⟩r.archivos_borrados",
"Ajuste('${g}','${val}')\">⟨⟩label",
"<div class=\"ajuste-opts\">⟨⟩Object.entries(ACENTOS).map(([k,v])=>`<button type=\"button\" class=\"swatch ${k===acSel?'sel':''}\" title=\"${v.nombre}\" aria-label=\"Color ${v.nombre}\" aria-pressed=\"${k===acSel}\" style=\"background:linear-gradient(135deg,${v.p} 0%,${v.p} 62%,${v.acc} 62%,${v.acc} 100%)\" onclick=\"setAjuste('acento','${k}')\"></button>`).join('')",
"dos?`<span class=\"badge\">⟨⟩c.no_leidos",
" '+fechaTxt(fecha):''} · ⟨⟩h.n_cosas||0",
"${escHtml(x.nombre)} <b>×⟨⟩x.cantidad",
" <div class=\"org-quien\">⟨⟩ed?quien:(x.responsable_nombre?'👤 '+escHtml(x.responsable_nombre):'')",
"an class=\"muted small\">· ⟨⟩fuenteTxt",
" <div id=\"org-cosas\">⟨⟩cosas",
" <div id=\"org-gastos\">⟨⟩gastos",
"tado)}</b></div> ⟨⟩aportes",
" ${aportes} ⟨⟩correcciones",
"o)}\" de ${money(g.monto)}⟨⟩quien",
"responsable_nombre ? ` — ⟨⟩c.responsable_nombre",
"ow:auto;margin-top:10px\">⟨⟩opciones"
];
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
