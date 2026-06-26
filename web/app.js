// ============================================================
//  Iglesia App — lógica del frontend
// ============================================================
const API = '/api';
let ME = null;

// Menú lateral: [clave, icono, etiqueta]
const NAV = [
  ['inicio','🏠','Inicio'],
  ['calendario','📅','Calendario'],
  ['anuncios','📢','Anuncios'],
  ['mi_servicio','🙌','Mi Servicio'],
  ['mi_grupo','🧑‍🤝‍🧑','Mi Grupo'],
  ['servicio_gestion','🤝','Servicio'],
  ['asistencia','✅','Asistencia'],
  ['panel_pastor','📊','Panel del pastor'],
  ['musicos','🎵','Grupo de Alabanza'],
  ['cuidado_pastoral','❤️','Cuidado pastoral'],
  ['ninos','👶','Niños / Esc. Dominical'],
  ['tesoreria','💰','Tesorería'],
  ['predica','📖','Predica'],
  ['panel_obispo','👑','Panel del Obispo'],
  ['ajustes','🎨','Ajustes'],
  ['admin','⚙️','Administración'],
];
// Render minimalista de un auditorio/iglesia moderno (líneas rectas, luz difusa) para Anuncios.
const IMG_AUDITORIO=`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" style="width:100%;height:150px;display:block">
  <defs>
    <linearGradient id="au-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efece5"/><stop offset="1" stop-color="#ddd9d0"/></linearGradient>
    <radialGradient id="au-glow" cx="50%" cy="14%" r="62%"><stop offset="0" stop-color="#f8f1de"/><stop offset="1" stop-color="#efece5" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="180" fill="url(#au-sky)"/><rect width="400" height="180" fill="url(#au-glow)"/>
  <path d="M150 30 Q200 10 250 30 L250 96 L150 96 Z" fill="#fbf7ec" stroke="#cfc8b6" stroke-width="1"/>
  <line x1="200" y1="22" x2="200" y2="96" stroke="#dcd5c4" stroke-width="1"/>
  <g stroke="#d5cdbb" stroke-width="1"><line x1="60" y1="38" x2="60" y2="92"/><line x1="92" y1="34" x2="92" y2="94"/><line x1="308" y1="34" x2="308" y2="94"/><line x1="340" y1="38" x2="340" y2="92"/></g>
  <g stroke="#bcb4a0" stroke-width="2.4" stroke-linecap="round"><line x1="122" y1="112" x2="278" y2="112"/><line x1="106" y1="130" x2="294" y2="130"/><line x1="86" y1="150" x2="314" y2="150"/><line x1="64" y1="172" x2="336" y2="172"/></g>
  <path d="M196 106 L188 178 M204 106 L212 178" stroke="#d8d1c0" stroke-width="1"/>
</svg>`;
const TIPO_ICON = { predicar:'🎤', ofrenda:'💰', devocional:'🙏', musica:'🎵', aseo:'🧹' };
const ESTADO = { pendiente:['⏳','Pendiente'], aceptado:['✅','Aceptado'], rechazado:['❌','No puedo'], cumplido:['☑️','Cumplido'] };
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ---------- Helpers ----------
function $(id){ return document.getElementById(id); }
function token(){ return localStorage.getItem('token'); }
async function api(path, opts={}){
  const r = await fetch(API+path, { ...opts,
    headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token(), ...(opts.headers||{}) }});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||'Error');
  return data;
}
// Sube un archivo y devuelve su URL
async function uploadArchivo(file){
  const fd=new FormData(); fd.append('archivo',file);
  const r=await fetch(API+'/upload',{method:'POST',headers:{Authorization:'Bearer '+token()},body:fd});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||'No se pudo subir el archivo');
  return d.url;
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function parseFecha(f){ const p=String(f||'').split('-'); return (p.length===3)?{m:p[1],d:p[2]}:null; }
function chipFecha(f){ const x=parseFecha(f); if(!x) return `<div class="mini-date"><b>—</b><span></span></div>`; return `<div class="mini-date"><b>${x.d}</b><span>${MESES[(+x.m)-1]||''}</span></div>`; }
function fechaChip(f){ const x=parseFecha(f); if(!x) return `<div class="fecha-chip"><b>—</b><span></span></div>`; return `<div class="fecha-chip"><b>${x.d}</b><span>${MESES[(+x.m)-1]||''}</span></div>`; }
function fechaTxt(f){ const x=parseFecha(f); if(!x) return String(f||'—'); return x.d+' '+(MESES[(+x.m)-1]||''); }
// "Mi Grupo" muestra el nombre real del grupo (ej. "Jóvenes"); "Mis Grupos" si son varios.
function etiquetaMiGrupo(){
  const gs=[...new Set(((ME&&ME.roles&&ME.roles.pertenencias)||[]).map(p=>p.grupo))];
  if(gs.length===1) return gs[0];
  if(gs.length>1) return 'Mis Grupos';
  return 'Mi Grupo';
}
function labelDe(k){ if(k==='mi_grupo') return etiquetaMiGrupo(); const n=NAV.find(x=>x[0]===k); return n?n[2]:k; }
function iconDe(k){ const n=NAV.find(x=>x[0]===k); return n?n[1]:'📦'; }

// ============================================================
//  LOGIN (3 pasos)
// ============================================================
function showStep(n){
  document.querySelectorAll('#login .step').forEach(s=>s.classList.toggle('hidden', Number(s.dataset.step)!==n));
  document.querySelectorAll('.dot').forEach(d=>d.classList.toggle('active', Number(d.dataset.d)<=n));
  const inp=document.querySelector(`#login .step[data-step="${n}"] input`);
  if(inp) setTimeout(()=>inp.focus(),60);
}
function next(n){
  if(n>=2){ const ig=$('iglesia').value.trim(); if(!ig) return err('Escribe el nombre o código de tu iglesia'); $('ig-label').textContent='· '+ig; }
  if(n>=3 && !$('usuario').value.trim()) return err('Escribe tu usuario');
  err(''); showStep(n);
}
function err(m){ $('error').textContent=m; }
async function entrar(){
  const iglesia=$('iglesia').value.trim(), usuario=$('usuario').value.trim(), password=$('password').value;
  err('');
  try{
    const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({iglesia,usuario,password})});
    const data=await r.json();
    if(!r.ok) return err(data.error||'No se pudo entrar');
    localStorage.setItem('token',data.token); cargarApp();
  }catch{ err('No se pudo conectar con el servidor'); }
}
async function cargarApp(){
  if(!token()) return mostrarLogin();
  try{ ME=await api('/me'); abrirApp(); }
  catch{ localStorage.removeItem('token'); mostrarLogin(); }
}
function mostrarLogin(){ $('app').classList.add('hidden'); $('login').classList.remove('hidden'); showStep(1); }
function salir(){ localStorage.removeItem('token'); location.reload(); }

function puedePublicar(){
  return ME.persona.es_pastor || ME.roles.pertenencias.some(p=>['admin','lider_musica','lider_ed'].includes(p.rol));
}
// ¿Soy el ENCARGADO (líder) de este grupo? (el pastor NO lo es: solo observa)
function esEncargadoDe(grupoId){
  return ME.roles.pertenencias.some(p=>p.grupo_id===grupoId && ['admin','lider_musica','lider_ed'].includes(p.rol));
}
function tieneModulo(k){
  if(k==='inicio') return true;
  // Biblia/Devocional y Notas del sermón: disponibles para toda la iglesia (Fase 4)
  if(k==='predica'||k==='ajustes') return true;
  if(k==='calendario') return ME.modulos.includes('calendario')||ME.modulos.includes('calendario_completo');
  return ME.modulos.includes(k);
}

// ============================================================
//  APP SHELL
// ============================================================
function abrirApp(){
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  // usuario en el sidebar
  const ini = ME.persona.nombre.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  $('avatar').textContent = ini;
  $('u-nombre').textContent = ME.persona.nombre;
  $('u-rol').textContent = ME.persona.rol_global==='obispo' ? 'Obispo'
    : ME.persona.rol_global==='super_admin' ? 'Super-admin'
    : ME.persona.es_pastor ? 'Pastor'
    : (ME.roles.pertenencias.map(p=>cap(p.rol.replace('_',' '))).join(', ') || 'Feligrés');
  buildNav();
  actualizarCampana();
  navTo('inicio');
}
// Iconos de línea (outline, heredan el color del texto del menú)
const _ic=(p)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const NAV_ICON={
  inicio:_ic('<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/>'),
  calendario:_ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  anuncios:_ic('<path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
  mi_servicio:_ic('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M9 12h6M9 16h6"/>'),
  mi_grupo:_ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>'),
  servicio_gestion:_ic('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
  asistencia:_ic('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  panel_pastor:_ic('<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-3"/>'),
  musicos:_ic('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  cuidado_pastoral:_ic('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>'),
  ninos:_ic('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>'),
  tesoreria:_ic('<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  predica:_ic('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'),
  panel_obispo:_ic('<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M2 20h20"/>'),
  ajustes:_ic('<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>'),
  admin:_ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>'),
};
function buildNav(){
  const nav=$('nav'); nav.innerHTML='';
  NAV.filter(n=>tieneModulo(n[0])).forEach(([key,ic,label])=>{
    const el=document.createElement('div');
    el.className='nav-item'; el.dataset.key=key;
    el.innerHTML=`<span class="ic">${NAV_ICON[key]||ic}</span> ${labelDe(key)}`;
    el.onclick=()=>navTo(key);
    nav.appendChild(el);
  });
}
function navTo(key){
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active', i.dataset.key===key));
  $('page-title').textContent = labelDe(key);
  closeSidebar();
  if(key==='inicio') return renderDashboard();
  if(key==='calendario') return vistaCalendario();
  if(key==='anuncios') return vistaAnuncios();
  if(key==='mi_servicio') return vistaMiServicio();
  if(key==='mi_grupo') return vistaMiGrupo();
  if(key==='servicio_gestion') return vistaServicio();
  if(key==='asistencia') return vistaAsistencia();
  if(key==='panel_pastor') return vistaPanel();
  if(key==='musicos') return vistaMusica();
  if(key==='cuidado_pastoral') return vistaCuidado();
  if(key==='tesoreria') return vistaTesoreria();
  if(key==='ninos') return vistaNinos();
  if(key==='predica') return vistaPredica();
  if(key==='panel_obispo') return vistaPanelObispo();
  if(key==='ajustes') return vistaAjustes();
  $('content').innerHTML=`<div class="placeholder"><div class="big">${iconDe(key)}</div>
    <h2>${labelDe(key)}</h2><p>Este módulo se construye en una próxima fase.</p></div>`;
}
function toggleSidebar(){ $('sidebar').classList.toggle('open'); $('overlay').classList.toggle('show'); }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('overlay').classList.remove('show'); }

// ============================================================
//  DASHBOARD (Inicio)
// ============================================================
async function renderDashboard(){
  const c=$('content');
  c.innerHTML=`<div class="hero"><h2>Hola, ${ME.persona.nombre.split(' ')[0]} 👋</h2>
    <p>${ME.iglesia?ME.iglesia.nombre:''} · ${$('u-rol').textContent}</p></div>
    <div id="dash" class="muted small" style="margin-top:18px">Cargando…</div>`;

  // Traer todo en paralelo (tolerante a fallos individuales)
  const safe = p => p.then(r=>r).catch(()=>null);
  const [ev,mio,an,noti] = await Promise.all([
    safe(api('/eventos')), safe(api('/asignaciones/mio')),
    safe(api('/anuncios')), safe(api('/notificaciones'))
  ]);
  const eventos=ev||[], servicios=mio||[], anuncios=an||[];
  const pendientes=servicios.filter(a=>a.estado==='pendiente');
  const proximo=eventos[0]||null;
  const sinLeer=noti?(noti.noLeidas||0):0;

  // --- Resumen: 3 métricas clicables ---
  const resumen=`<div class="widgets" style="margin-bottom:20px">
    <div class="widget" style="cursor:pointer" onclick="navTo('calendario')">
      <div class="widget-head">📅 Próximo evento</div>
      ${proximo
        ? `<div class="stat-num" style="font-size:22px">${fechaTxt(proximo.fecha)}</div><div class="muted small">${proximo.titulo}${proximo.hora_inicio?' · '+proximo.hora_inicio:''}</div>`
        : '<div class="empty">Sin eventos próximos</div>'}
    </div>
    <div class="widget" style="cursor:pointer" onclick="navTo('mi_servicio')">
      <div class="widget-head">🙌 Servicios por confirmar</div>
      <div class="stat-num" style="color:${pendientes.length?'var(--amber)':'var(--green)'}">${pendientes.length}</div>
    </div>
    <div class="widget" style="cursor:pointer" onclick="verNotificaciones()">
      <div class="widget-head">🔔 Notificaciones sin leer</div>
      <div class="stat-num" style="color:${sinLeer?'var(--primary)':'var(--muted)'}">${sinLeer}</div>
    </div>
  </div>`;

  // --- Lo más útil: lo que TE toca confirmar (accionable aquí mismo) ---
  let accionables='';
  if(pendientes.length){
    accionables=`<div class="card" style="margin-bottom:20px;border-left:4px solid var(--amber)">
      <div class="widget-head">⏳ Te toca confirmar (${pendientes.length})</div>
      ${pendientes.map(a=>`<div class="item-card flex" style="margin-top:10px">
        <div style="flex:1"><b>${TIPO_ICON[a.tipo]||'📋'} ${cap(a.tipo)}</b>
          <div class="muted small">${escHtml(a.evento)} · ${fechaTxt(a.fecha)}${a.lugar?' · 📍 '+a.lugar:''}</div></div>
        <div class="row" style="width:auto">
          <button class="btn small-btn" onclick="responderDash(${a.id},'aceptar')">✅ Acepto</button>
          <button class="btn ghost small-btn" onclick="responderDash(${a.id},'rechazar')">❌ No puedo</button>
        </div></div>`).join('')}
    </div>`;
  }

  // --- Próximos eventos + Anuncios recientes ---
  const listaEventos=eventos.length
    ? `<div class="mini-list">`+eventos.slice(0,4).map(e=>
        `<div class="mini-item" style="cursor:pointer" onclick="navTo('calendario')">${chipFecha(e.fecha)}
         <div><b>${escHtml(e.titulo)}</b><br><span class="muted small">${e.grupo||''}${e.hora_inicio?' · '+e.hora_inicio:''}</span></div></div>`).join('')+`</div>`
    : '<div class="empty">No hay eventos próximos.</div>';
  const listaAnuncios=anuncios.length
    ? `<div class="mini-list">`+anuncios.slice(0,3).map(a=>
        `<div class="mini-item" style="cursor:pointer" onclick="navTo('anuncios')"><span style="font-size:20px">${a.urgente?'🔴':'📢'}</span>
         <div><b>${escHtml(a.titulo)}</b><br><span class="muted small">${(a.texto||'').slice(0,80)}</span></div></div>`).join('')+`</div>`
    : '<div class="empty">Sin anuncios.</div>';
  const columnas=`<div class="widgets">
    <div class="widget"><div class="widget-head">📅 Próximos eventos</div>${listaEventos}</div>
    <div class="widget"><div class="widget-head">📢 Anuncios recientes</div>${listaAnuncios}
      <div class="anuncio-img">${IMG_AUDITORIO}</div></div>
  </div>`;

  $('dash').className='';
  const tagline=`<p style="text-align:center;color:var(--muted);margin-top:30px;padding-top:20px;border-top:1px solid var(--border);letter-spacing:.04em;font-weight:500">Comunidad, Fe, Futuro</p>`;
  $('dash').innerHTML = resumen + accionables + columnas + tagline;
}

// Confirmar/rechazar un servicio desde el Inicio (sin salir del dashboard)
async function responderDash(id,accion){
  if(accion==='aceptar'){
    try{ await api('/asignaciones/'+id,{method:'PATCH',body:JSON.stringify({accion})}); toast('¡Gracias por servir! 🙌'); renderDashboard(); }
    catch(e){ toast(e.message); } return;
  }
  modalReason(async(motivo)=>{
    try{ await api('/asignaciones/'+id,{method:'PATCH',body:JSON.stringify({accion:'rechazar',motivo})}); toast('Listo, avisamos al líder'); renderDashboard(); }
    catch(e){ toast(e.message); }
  });
}

// ============================================================
//  MÓDULO A: CALENDARIO
// ============================================================
const MESES_LARGO=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CAL_DOW=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
let _calRef=null;            // {y, m}  mes que se está mostrando
let _calDiaSel=null;         // fecha seleccionada (YYYY-MM-DD)

async function vistaCalendario(){
  const c=$('content');
  c.innerHTML=`<div id="bandeja"></div>
    <div class="head-row"><h2>Calendario</h2><span id="crear-zona"></span></div>
    <div id="form-zona"></div>
    <div id="cal" class="muted">Cargando…</div>
    <div id="cal-dia"></div>`;
  cargarBandeja();
  try{
    const grupos=await api('/eventos/grupos-gestionables');
    if(grupos.length){ // solo líderes/pastor pueden pedir fecha
      window._grupos=grupos;
      const label = ME.persona.es_pastor ? '+ Crear evento' : '+ Pedir fecha';
      $('crear-zona').innerHTML=`<button class="btn small-btn" onclick="toggleFormEvento()">${label}</button>`;
    }
  }catch{}
  if(!_calRef){ const h=new Date(); _calRef={y:h.getFullYear(), m:h.getMonth()}; }
  await cargarEventos();
}
// Recarga los eventos y repinta el calendario (lo usan guardar/borrar/aprobar)
async function cargarEventos(){
  try{ window._eventos=await api('/eventos'); }
  catch{ window._eventos=window._eventos||[]; }
  renderCalendario();
  if(_calDiaSel) verDia(_calDiaSel);
}
function calMover(d){
  let {y,m}=_calRef; m+=d;
  if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
  _calRef={y,m}; _calDiaSel=null; $('cal-dia').innerHTML=''; renderCalendario();
}
function calHoy(){ const h=new Date(); _calRef={y:h.getFullYear(), m:h.getMonth()}; renderCalendario(); }
function renderCalendario(){
  const {y,m}=_calRef;
  const pad=n=>String(n).padStart(2,'0');
  const offset=(new Date(y,m,1).getDay()+6)%7;        // lunes primero
  const dias=new Date(y,m+1,0).getDate();
  const hoy=new Date(); const mesActual = hoy.getFullYear()===y && hoy.getMonth()===m;
  const evs=window._eventos||[];

  let celdas=CAL_DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<offset;i++) celdas+=`<div class="cal-cell empty"></div>`;
  for(let dia=1;dia<=dias;dia++){
    const fecha=`${y}-${pad(m+1)}-${pad(dia)}`;
    const delDia=evs.filter(e=>e.fecha===fecha);
    const finde=((new Date(y,m,dia).getDay()+6)%7)>=5;
    const esHoy=mesActual && hoy.getDate()===dia;
    const sel=_calDiaSel===fecha;
    const chips=delDia.slice(0,3).map(e=>{
      const col=e.grupo_color||'var(--primary)';
      const pend=e.estado && e.estado!=='aprobado';
      return `<div class="cal-ev${pend?' pend':''}" style="border-left-color:${col}"
        title="${(e.titulo||'').replace(/"/g,'&quot;')}${e.grupo?' · '+e.grupo:''}${e.hora_inicio?' · '+e.hora_inicio:''}"
        onclick="event.stopPropagation();abrirEvento(${e.id})">${e.hora_inicio?'<b>'+e.hora_inicio+'</b> ':''}${escHtml(e.titulo)}</div>`;
    }).join('');
    const mas=delDia.length>3?`<div class="cal-mas">+${delDia.length-3} más</div>`:'';
    celdas+=`<div class="cal-cell${esHoy?' today':''}${finde?' finde':''}${sel?' sel':''}${delDia.length?' tiene':''}" onclick="verDia('${fecha}')">
      <div class="cal-daynum">${dia}</div>${chips}${mas}</div>`;
  }
  const resto=(7-((offset+dias)%7))%7;
  for(let i=0;i<resto;i++) celdas+=`<div class="cal-cell empty"></div>`;

  $('cal').className='cal-wrap';
  $('cal').innerHTML=`
    <div class="cal-nav">
      <button class="cal-navbtn" onclick="calMover(-1)" aria-label="Mes anterior">‹</button>
      <h3>${MESES_LARGO[m]} ${y}</h3>
      <div class="row" style="width:auto;gap:8px">
        <button class="btn ghost small-btn" onclick="calHoy()">Hoy</button>
        <button class="cal-navbtn" onclick="calMover(1)" aria-label="Mes siguiente">›</button>
      </div>
    </div>
    <div class="cal-grid">${celdas}</div>
    <div id="cal-leyenda"></div>`;
  // leyenda de grupos (colores)
  const leg=new Map(); evs.forEach(e=>{ if(e.grupo) leg.set(e.grupo, e.grupo_color||'#2563EB'); });
  $('cal-leyenda').innerHTML = leg.size
    ? '<div class="cal-leyenda">'+[...leg].map(([n,c])=>`<span class="cal-leg"><span class="cal-leg-dot" style="background:${c}"></span>${n}</span>`).join('')+'</div>' : '';
}
function verDia(fecha){
  _calDiaSel=fecha; renderCalendario();
  const evs=(window._eventos||[]).filter(e=>e.fecha===fecha);
  const cont=$('cal-dia');
  // Solo los líderes/pastor (los que tienen grupos gestionables) pueden pedir fecha
  const puedePedir=(window._grupos||[]).length>0;
  const btnPedir = puedePedir
    ? `<button class="btn small-btn" onclick="pedirFecha('${fecha}')">${ME.persona.es_pastor?'+ Crear evento':'📩 Pedir esta fecha'}</button>` : '';
  let inner=`<div class="head-row"><div class="widget-head" style="margin:0">📅 ${fechaTxt(fecha)}</div>${btnPedir}</div>`;
  if(!evs.length) inner+='<p class="muted small" style="margin-top:8px">Día libre — sin eventos.</p>';
  else inner+=evs.map(e=>{
    const puede=puedeGestionarEvento(e);
    const badge=e.estado==='pendiente'?'<span class="estado-chip estado-pendiente">⏳ Pendiente</span>':e.estado==='rechazado'?'<span class="estado-chip estado-rechazado">🔴 Rechazada</span>':'<span class="estado-chip estado-aceptado">✅ Aprobado</span>';
    return `<div class="item-card flex" style="margin-top:10px;border-left:4px solid ${e.grupo_color||'var(--primary)'}">
      <div style="flex:1"><div class="item-titulo">${escHtml(e.titulo)}</div>
        <div class="muted small">${e.grupo?'🏷️ '+e.grupo:''}${e.hora_inicio?' · 🕐 '+e.hora_inicio+(e.hora_fin?'–'+e.hora_fin:''):''}${e.lugar?' · 📍 '+e.lugar:''}</div>
        <div style="margin-top:6px">${badge}</div></div>
      ${puede?accionesBtns('editarEvento','borrarEvento',e.id):''}</div>`;
  }).join('');
  cont.innerHTML=`<div class="card" style="margin-top:16px">${inner}</div>`;
}
// Editar/borrar: si ya está aprobado, solo el pastor; si no, el encargado o el creador.
function puedeGestionarEvento(e){
  if(e.estado==='aprobado') return ME.persona.es_pastor;
  return esEncargadoDe(e.grupo_id)||e.creado_por===ME.persona.id;
}
function abrirEvento(id){
  const e=(window._eventos||[]).find(x=>x.id===id); if(!e) return;
  if(puedeGestionarEvento(e)) toggleFormEvento(e);
  else verDia(e.fecha);
}
// Abre el formulario para PEDIR una fecha concreta (no togglea: siempre abre)
function pedirFecha(fecha){
  if(fecha) _calDiaSel=fecha;
  $('form-zona').innerHTML='';
  toggleFormEvento();
  $('form-zona').scrollIntoView({behavior:'smooth',block:'center'});
}
function toggleFormEvento(ev){
  const z=$('form-zona'); if(z.innerHTML && !ev){ z.innerHTML=''; return; }
  window._editEvId = ev ? ev.id : null;
  const v=(x)=>x?String(x).replace(/"/g,'&quot;'):'';
  const opts=(window._grupos||[]).map(g=>`<option value="${g.id}" ${ev&&ev.grupo_id===g.id?'selected':''}>${escHtml(g.nombre)}</option>`).join('');
  // Fecha como tres listas: día / mes / año (en vez del input nativo)
  const fBase = ev&&ev.fecha ? ev.fecha : (_calDiaSel||'');
  const p = fBase ? fBase.split('-').map(Number) : [];
  const hoy=new Date();
  const yDef=p[0]||hoy.getFullYear(), mDef=p[1]||(hoy.getMonth()+1), dDef=p[2]||hoy.getDate();
  const diaOpts=Array.from({length:31},(_,i)=>i+1).map(d=>`<option ${d===dDef?'selected':''}>${d}</option>`).join('');
  const mesOpts=MESES_LARGO.map((nm,i)=>`<option value="${i+1}" ${(i+1)===mDef?'selected':''}>${nm}</option>`).join('');
  let anioOpts=''; for(let a=hoy.getFullYear()-1;a<=hoy.getFullYear()+3;a++) anioOpts+=`<option ${a===yDef?'selected':''}>${a}</option>`;
  const esPastorUI = ME.persona.es_pastor;
  const titulo = ev ? 'Editar evento' : (esPastorUI ? 'Nuevo evento' : 'Pedir fecha');
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:4px">${titulo}</h3>
    ${(!ev && !esPastorUI)?'<p class="muted small" style="margin-bottom:8px">Tu solicitud se enviará al pastor para aprobación.</p>':''}
    <label>Grupo</label><select id="ev-grupo">${opts}</select>
    <label>Nombre del evento</label><input id="ev-titulo" value="${ev?v(ev.titulo):''}" placeholder="Ej. Noche de Jóvenes" />
    <label>Fecha</label>
    <div class="row" style="gap:8px">
      <select id="ev-dia" title="Día">${diaOpts}</select>
      <select id="ev-mes" title="Mes">${mesOpts}</select>
      <select id="ev-anio" title="Año">${anioOpts}</select></div>
    <div class="row" style="margin-top:10px"><div style="flex:1"><label>Hora inicio</label><input id="ev-ini" type="time" value="${ev&&ev.hora_inicio?ev.hora_inicio:''}" /></div>
      <div style="flex:1"><label>Hora fin</label><input id="ev-fin" type="time" value="${ev&&ev.hora_fin?ev.hora_fin:''}" /></div></div>
    <label>Lugar</label><input id="ev-lugar" value="${ev?v(ev.lugar):''}" placeholder="Ej. Salón principal" />
    <p id="ev-error" class="error"></p>
    <button class="btn" style="margin-top:14px" onclick="guardarEvento()">${ev?'Guardar cambios':(esPastorUI?'Crear evento':'📩 Enviar al pastor')}</button></div>`;
}
function editarEvento(id){ const ev=(window._eventos||[]).find(e=>e.id===id); if(ev) toggleFormEvento(ev); }
function borrarEvento(id){ modalConfirm('¿Eliminar este evento? No se puede deshacer.', async()=>{
  try{ await api('/eventos/'+id,{method:'DELETE'}); cargarEventos(); toast('Evento eliminado'); }catch(e){ toast(e.message); } }); }
async function guardarEvento(){
  const fecha=`${$('ev-anio').value}-${String($('ev-mes').value).padStart(2,'0')}-${String($('ev-dia').value).padStart(2,'0')}`;
  const body={grupo_id:$('ev-grupo').value,titulo:$('ev-titulo').value.trim(),fecha,
    hora_inicio:$('ev-ini').value,hora_fin:$('ev-fin').value,lugar:$('ev-lugar').value.trim()};
  const e=$('ev-error'); e.textContent='';
  if(!body.titulo){ e.textContent='Pon al menos el título'; return; }
  try{
    if(window._editEvId){ await api('/eventos/'+window._editEvId,{method:'PATCH',body:JSON.stringify(body)}); toast('Evento actualizado'); }
    else {
      const r=await api('/eventos',{method:'POST',body:JSON.stringify(body)});
      toast(r.estado==='pendiente' ? '📨 Enviado · pendiente de aprobación del pastor' : '✅ Evento creado y aprobado');
    }
    window._editEvId=null; $('form-zona').innerHTML=''; cargarEventos();
  } catch(ex){ e.textContent=ex.message; }
}

// ============================================================
//  MÓDULO B: ANUNCIOS
// ============================================================
async function vistaAnuncios(){
  const c=$('content');
  c.innerHTML=`<div class="head-row"><h2>Anuncios</h2><span id="crear-zona"></span></div>
    <div id="form-zona"></div><div id="lista" class="muted">Cargando…</div>`;
  if(puedePublicar()) $('crear-zona').innerHTML=`<button class="btn small-btn" onclick="toggleFormAnuncio()">+ Publicar</button>`;
  cargarAnuncios();
}
async function cargarAnuncios(){
  const cont=$('lista');
  try{
    const list=await api('/anuncios'); window._anuncios=list;
    if(!list.length){ cont.className='muted'; cont.innerHTML='<p>No hay anuncios aún.</p>'; return; }
    const puede=puedePublicar();
    cont.className='list';
    cont.innerHTML=list.map(a=>`<div class="item-card anuncio-card ${a.urgente?'urgente':''}" style="display:flex;gap:12px;align-items:flex-start">
      <div style="flex:1"><div class="item-titulo">${a.urgente?'🔴 ':''}${escHtml(a.titulo)}</div>
      ${a.texto?`<div class="muted" style="margin:4px 0">${escHtml(a.texto)}</div>`:''}
      <div class="muted small">por ${a.autor||'la iglesia'}</div></div>
      ${puede?accionesBtns('editarAnuncio','borrarAnuncio',a.id):''}</div>`).join('');
  }catch{ cont.innerHTML='<p class="error">No se pudieron cargar.</p>'; }
}
const ROL_LABEL = { admin:'Líderes de cuerpo', lider_musica:'Líderes de música', lider_ed:'Maestros (Esc. Dominical)', tesorero:'Tesoreros', musico:'Músicos', miembro:'Miembros' };
async function toggleFormAnuncio(a){
  const z=$('form-zona'); if(z.innerHTML && !a){ z.innerHTML=''; return; }
  window._editAnId = a ? a.id : null;
  const v=(x)=>x?String(x).replace(/"/g,'&quot;'):'';
  // Cargar segmentos disponibles (grupos + roles) para dirigir el aviso (Fase 4.1)
  let segHtml='';
  if(!a){
    try{
      const s=await api('/notificaciones/segmentos'); window._segmentos=s;
      const grupos=s.grupos.map(g=>`<option value="grupo:${g.id}">👥 ${escHtml(g.nombre)}</option>`).join('');
      const roles=s.roles.map(rl=>`<option value="rol:${rl}">🏷️ ${ROL_LABEL[rl]||rl}</option>`).join('');
      segHtml=`<label>Dirigir a (segmento)</label>
        <select id="an-segmento"><option value="todos">📣 Toda la iglesia</option>${grupos}${roles}</select>`;
    }catch{ segHtml=''; }
  }
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>${a?'Editar anuncio':'Nuevo anuncio'}</h3>
    <label>Título</label><input id="an-titulo" value="${a?v(a.titulo):''}" placeholder="Título" />
    <label>Mensaje</label><textarea id="an-texto" rows="3" placeholder="Mensaje (opcional)">${a&&a.texto?a.texto:''}</textarea>
    ${segHtml}
    <label class="check"><input type="checkbox" id="an-urgente" ${a&&a.urgente?'checked':''}/> 🔴 Marcar como urgente</label>
    <p id="an-error" class="error"></p>
    <button class="btn" onclick="guardarAnuncio()">${a?'Guardar cambios':'Publicar y avisar'}</button></div>`;
}
// Lee el selector de segmento del formulario -> objeto {tipo,grupo_id?,rol?}
function leerSegmento(){
  const el=$('an-segmento'); if(!el) return {tipo:'todos'};
  const val=el.value||'todos';
  if(val.startsWith('grupo:')) return {tipo:'grupo', grupo_id:Number(val.slice(6))};
  if(val.startsWith('rol:')) return {tipo:'rol', rol:val.slice(4)};
  return {tipo:'todos'};
}
function editarAnuncio(id){ const a=(window._anuncios||[]).find(x=>x.id===id); if(a) toggleFormAnuncio(a); }
function borrarAnuncio(id){ modalConfirm('¿Eliminar este anuncio?', async()=>{
  try{ await api('/anuncios/'+id,{method:'DELETE'}); cargarAnuncios(); toast('Anuncio eliminado'); }catch(e){ toast(e.message); } }); }
async function guardarAnuncio(){
  const body={titulo:$('an-titulo').value.trim(),texto:$('an-texto').value.trim(),urgente:$('an-urgente').checked};
  const e=$('an-error'); e.textContent='';
  if(!body.titulo){ e.textContent='Pon un título'; return; }
  try{
    if(window._editAnId){ await api('/anuncios/'+window._editAnId,{method:'PATCH',body:JSON.stringify(body)}); toast('Anuncio actualizado'); }
    else {
      body.segmento=leerSegmento();
      const r=await api('/anuncios',{method:'POST',body:JSON.stringify(body)}); actualizarCampana();
      toast('📢 Publicado · '+(r.enviadas||0)+' avisados');
    }
    window._editAnId=null; $('form-zona').innerHTML=''; cargarAnuncios();
  } catch(ex){ e.textContent=ex.message; }
}

// ============================================================
//  MÓDULO C: SERVICIO
// ============================================================
async function vistaMiServicio(){
  const c=$('content'); c.innerHTML=`<div id="ms" class="muted">Cargando…</div>`;
  const safe=p=>p.then(r=>r).catch(()=>[]);
  const [servicios,musica,tareas]=await Promise.all([
    safe(api('/asignaciones/mio')), safe(api('/musica/mis-asignaciones')), safe(api('/grupo/mis-tareas'))
  ]);
  const cont=$('ms');
  const total=(servicios?.length||0)+(musica?.length||0)+(tareas?.length||0);
  if(!total){ cont.className=''; cont.innerHTML='<div class="placeholder"><div class="big">🙌</div><p>No tienes nada asignado por ahora.</p></div>'; return; }
  cont.className='';
  let html='';

  // 1) Servicios (aceptar / no puedo)
  if(servicios.length){
    html+='<h3 class="section-title">🤝 Servicios</h3><div class="list" style="margin-bottom:18px">'+servicios.map(a=>{
      const [si,sl]=ESTADO[a.estado]||['',a.estado];
      const acc=a.estado==='pendiente'?`<div class="row" style="margin-top:12px">
        <button class="btn small-btn" onclick="responder(${a.id},'aceptar')">✅ Acepto</button>
        <button class="btn ghost small-btn" onclick="responder(${a.id},'rechazar')">❌ No puedo</button></div>`:'';
      return `<div class="item-card"><div class="item-titulo">${TIPO_ICON[a.tipo]||'📋'} ${cap(a.tipo)}</div>
        <div class="muted small">${escHtml(a.evento)} · ${fechaTxt(a.fecha)}${a.lugar?' · 📍 '+a.lugar:''}</div>
        <span class="estado-chip estado-${a.estado}">${si} ${sl}${a.motivo?' · '+a.motivo:''}</span>${acc}</div>`;
    }).join('')+'</div>';
  }
  // 2) Me toca tocar (grupo de alabanza)
  if(musica.length){
    html+='<h3 class="section-title">🎵 Me toca tocar</h3><div class="list" style="margin-bottom:18px">'+musica.map(m=>
      `<div class="item-card flex"><div style="flex:1"><div class="item-titulo">${m.instrumento||'Música'} · ${escHtml(m.titulo)}</div>
        <div class="muted small">📅 ${fechaTxt(m.fecha)}${m.hora_inicio?' · 🕐 '+m.hora_inicio:''}</div></div>
        <button class="btn ghost small-btn" onclick="navTo('musicos')">Ver detalles ›</button></div>`).join('')+'</div>';
  }
  // 3) Tareas de grupo
  if(tareas.length){
    html+='<h3 class="section-title">📋 Tareas de grupo</h3><div class="list">'+tareas.map(t=>
      `<div class="item-card flex"><div style="flex:1"><div class="item-titulo">${escHtml(t.titulo)} <span class="muted small">· ${escHtml(t.grupo)}</span></div>
        ${t.detalle?`<div class="muted small">${escHtml(t.detalle)}</div>`:''}
        <span class="estado-chip ${t.estado==='hecho'?'estado-aceptado':'estado-pendiente'}">${t.estado==='hecho'?'✅ Hecho':'⏳ Pendiente'}</span></div>
        <div class="row" style="width:auto;gap:8px">${t.estado!=='hecho'?`<button class="btn small-btn" onclick="tareaHecha(${t.id})">Hecho</button>`:''}
        <button class="btn ghost small-btn" onclick="navTo('mi_grupo')">Ver detalles ›</button></div></div>`).join('')+'</div>';
  }
  cont.innerHTML=html;
}
async function tareaHecha(id){ try{ await api('/grupo/tareas/'+id+'/hecho',{method:'PATCH'}); vistaMiServicio(); toast('✅ Marcada como hecha'); }catch(e){ toast(e.message); } }
async function responder(id,accion){
  if(accion==='aceptar'){
    try{ await api('/asignaciones/'+id,{method:'PATCH',body:JSON.stringify({accion})}); vistaMiServicio(); toast('¡Gracias por servir! 🙌'); }
    catch(e){ toast(e.message); } return;
  }
  modalReason(async(motivo)=>{
    try{ await api('/asignaciones/'+id,{method:'PATCH',body:JSON.stringify({accion:'rechazar',motivo})}); vistaMiServicio(); toast('Listo, avisamos al líder'); }
    catch(e){ toast(e.message); }
  });
}
async function vistaServicio(){
  const c=$('content'); c.innerHTML=`<div id="sv" class="muted">Cargando…</div>`;
  try{
    const [eventos,personas]=await Promise.all([api('/eventos'),api('/personas')]);
    const ev=eventos.map(e=>`<option value="${e.id}">${escHtml(e.titulo)} (${fechaTxt(e.fecha)})</option>`).join('');
    const ps=personas.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
    $('sv').innerHTML=`<div class="card" style="max-width:480px">
      <h3 style="margin-bottom:4px">Asignar un servicio</h3>
      <label>Evento</label><select id="sv-ev">${ev}</select>
      <label>Persona</label><select id="sv-persona">${ps}</select>
      <label>Servicio</label><select id="sv-tipo">
        <option value="predicar">🎤 Predicar</option><option value="ofrenda">💰 Ofrenda</option>
        <option value="devocional">🙏 Devocional</option><option value="musica">🎵 Música</option>
        <option value="aseo">🧹 Aseo</option></select>
      <p id="sv-msg" class="small" style="margin-top:10px"></p>
      <button class="btn" style="margin-top:8px" onclick="asignar()">Asignar y avisar</button></div>`;
  }catch{ $('sv').innerHTML='<p class="error">Error.</p>'; }
}
async function asignar(){
  const body={evento_id:$('sv-ev').value,persona_id:$('sv-persona').value,tipo:$('sv-tipo').value};
  const m=$('sv-msg');
  try{ const r=await api('/asignaciones',{method:'POST',body:JSON.stringify(body)});
    m.style.color='var(--green)'; m.textContent='✅ Asignado y avisado.'+(r.aviso?'  ⚠️ '+r.aviso:'');
  }catch(e){ m.style.color='var(--red)'; m.textContent=e.message; }
}

// ============================================================
//  NOTIFICACIONES
// ============================================================
async function actualizarCampana(){
  try{ const d=await api('/notificaciones'); const b=$('bell-count');
    if(d.noLeidas>0){ b.textContent=d.noLeidas; b.classList.remove('hidden'); } else b.classList.add('hidden');
  }catch{}
}
async function verNotificaciones(){
  $('page-title').textContent='Notificaciones';
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  const c=$('content'); c.innerHTML=`<div id="ln" class="muted">Cargando…</div>`;
  try{
    const d=await api('/notificaciones'); const cont=$('ln');
    if(!d.items.length){ cont.innerHTML='<div class="placeholder"><div class="big">🔔</div><p>Sin notificaciones.</p></div>'; return; }
    cont.className='';
    const botonLeer = d.noLeidas>0 ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px">
      <button class="btn ghost small-btn" onclick="marcarLeidas()">Marcar todas como leídas</button></div>` : '';
    cont.innerHTML=botonLeer + d.items.map(n=>{
      const dest=_destinoNotif(n.tipo);
      const accion=n.tipo==='aprobacion'?'Revisar y aprobar ›':(dest?'Ver ›':'');
      return `<div class="notif-item ${n.leida?'':'no-leida'}" ${dest?`style="cursor:pointer" onclick="abrirNotif('${n.tipo}')"`:''}>
      <div style="font-weight:600">${n.titulo}</div>${n.texto?`<div class="muted small">${n.texto}</div>`:''}
      ${accion?`<div class="small" style="color:var(--primary);font-weight:600;margin-top:4px">${accion}</div>`:''}</div>`;
    }).join('');
    actualizarCampana();
  }catch{ $('ln').innerHTML='<p class="error">No se pudieron cargar.</p>'; }
}
function _destinoNotif(tipo){
  return {aprobacion:'calendario', musica:'musicos', grupo:'mi_grupo', recordatorio:'mi_servicio', predica:'predica'}[tipo]||'';
}
function abrirNotif(tipo){ const d=_destinoNotif(tipo); if(d) navTo(d); }
async function marcarLeidas(){
  try{ await api('/notificaciones/leer',{method:'PATCH'}); verNotificaciones(); actualizarCampana(); }
  catch(e){ toast(e.message); }
}

// ============================================================
//  MÓDULO D: ASISTENCIA
// ============================================================
let _asist = { eventoId:null, present:new Set() };

async function vistaAsistencia(){
  const c=$('content');
  c.innerHTML=`<p class="muted small" style="margin-bottom:12px">Elige un evento para tomar asistencia:</p>
    <div id="lista" class="muted">Cargando…</div>`;
  try{
    const ev=await api('/eventos');
    if(!ev.length){ $('lista').innerHTML='<div class="placeholder"><div class="big">✅</div><p>No hay eventos para registrar.</p></div>'; return; }
    $('lista').className='list';
    $('lista').innerHTML=ev.map(e=>`<div class="item-card flex" style="cursor:pointer" onclick="hojaAsistencia(${e.id})">
      ${fechaChip(e.fecha)}<div style="flex:1"><div class="item-titulo">${escHtml(e.titulo)}</div>
      <div class="muted small">${e.grupo||''}</div></div><span class="muted" style="font-size:20px">›</span></div>`).join('');
  }catch{ $('lista').innerHTML='<p class="error">Error.</p>'; }
}

async function hojaAsistencia(id){
  try{
    const d=await api('/asistencia/evento/'+id);
    _asist.eventoId=id;
    _asist.present=new Set(d.miembros.filter(m=>m.presente).map(m=>m.id));
    renderHoja(d);
  }catch{ toast('No se pudo abrir la hoja'); }
}
function renderHoja(d){
  window._hojaMiembros = d.miembros;
  window._puedeEditar = !!d.puedeEditar;
  const editable = window._puedeEditar;
  const c=$('content');
  c.innerHTML=`<button class="link" onclick="vistaAsistencia()">‹ Eventos</button>
    <div class="card">
      <h3 style="font-size:18px">${d.evento.titulo}</h3>
      <div class="muted small">${fechaTxt(d.evento.fecha)}</div>
      <div class="asist-stat">
        <div class="asist-total">Asistieron: <b id="contador">${_asist.present.size}</b> de ${d.miembros.length}</div>
        ${d.ultimaVez!=null?`<div class="asist-prev">Última vez: <b>${d.ultimaVez}</b></div>`:''}
      </div>
      ${editable
        ? '<p class="muted small" style="margin-top:8px">Toca un nombre para marcar/desmarcar su asistencia.</p>'
        : '<p class="muted small" style="margin-top:8px">👁️ Solo lectura — solo el encargado del grupo puede editar la asistencia.</p>'}
    </div>
    ${d.miembros.length? `<div id="listas-asist"></div>
      ${editable?'<button class="btn" style="margin-top:16px" onclick="guardarAsistencia()">Guardar asistencia</button>':''}`
      : '<div class="placeholder"><p>Este evento no tiene un grupo con miembros.</p></div>'}`;
  if(d.miembros.length) renderListasAsist();
}
function filaAsist(m, on){
  const editable = window._puedeEditar;
  return `<div class="asist-row ${on?'on':''}" ${editable?`onclick="togglePresente(${m.id})"`:'style="cursor:default"'}>
    <div><div>${escHtml(m.nombre)}</div>${m.grupos?`<div class="muted small">🏷️ ${m.grupos}</div>`:''}</div>
    <span class="tick">${on?'✅':'○'}</span></div>`;
}
function renderListasAsist(){
  const miembros = window._hojaMiembros || [];
  const asistieron = miembros.filter(m=>_asist.present.has(m.id));
  const ausentes   = miembros.filter(m=>!_asist.present.has(m.id));
  $('listas-asist').innerHTML=`
    <h3 class="section-title" style="margin-top:18px;color:var(--green)">✅ Asistieron (${asistieron.length})</h3>
    <div class="list">${asistieron.length? asistieron.map(m=>filaAsist(m,true)).join('') : '<p class="muted small">Nadie marcado aún.</p>'}</div>
    <h3 class="section-title" style="margin-top:18px;color:var(--red)">❌ No asistieron (${ausentes.length})</h3>
    <div class="list">${ausentes.length? ausentes.map(m=>filaAsist(m,false)).join('') : '<p class="muted small">¡Todos asistieron! 🎉</p>'}</div>`;
}
function togglePresente(id){
  if(_asist.present.has(id)) _asist.present.delete(id); else _asist.present.add(id);
  $('contador').textContent=_asist.present.size;
  renderListasAsist();
}
async function guardarAsistencia(){
  try{
    const r=await api('/asistencia/evento/'+_asist.eventoId,{method:'POST',body:JSON.stringify({presentes:[..._asist.present]})});
    toast('✅ Asistencia guardada: '+r.total+' presentes');
  }catch(e){ toast(e.message); }
}

// ============================================================
//  FASE 2: Bandeja del pastor (aprobar fechas) + Panel
// ============================================================
async function cargarBandeja(){
  if(!ME.persona.es_pastor) return;
  try{
    const p=await api('/eventos/pendientes');
    if(!p.length) return;
    $('bandeja').innerHTML=`<div class="card bandeja"><div class="widget-head">🟡 Solicitudes por aprobar (${p.length})</div>
      ${p.map(e=>`<div class="item-card flex" style="margin-top:10px">
        <div style="flex:1"><b>${escHtml(e.titulo)}</b><div class="muted small">${fechaTxt(e.fecha)} · ${e.grupo||''} · pidió ${e.solicitante||''}</div></div>
        <div class="row" style="width:auto">
          <button class="btn small-btn" onclick="aprobarFecha(${e.id})">Aprobar</button>
          <button class="btn ghost small-btn" onclick="rechazarFecha(${e.id})">Rechazar</button>
        </div></div>`).join('')}</div>`;
  }catch{}
}
async function aprobarFecha(id){
  try{ await api('/eventos/'+id+'/aprobar',{method:'PATCH'}); toast('✅ Fecha aprobada'); vistaCalendario(); }
  catch(e){ toast(e.message); }
}
async function rechazarFecha(id){
  modalReason(async(motivo)=>{
    try{ await api('/eventos/'+id+'/rechazar',{method:'PATCH',body:JSON.stringify({motivo})}); toast('Fecha rechazada'); vistaCalendario(); }
    catch(e){ toast(e.message); }
  });
}

let _panelGrupo='';
async function vistaPanel(){
  const c=$('content'); c.innerHTML=`<div id="pn" class="muted">Cargando…</div>`;
  try{
    const d=await api('/panel'+(_panelGrupo?('?grupo_id='+_panelGrupo):''));
    const max=Math.max(1,...d.reuniones.map(r=>r.total));
    $('pn').className='';
    const opts='<option value="">Toda la iglesia</option>'+
      (d.grupos||[]).map(g=>`<option value="${g.id}" ${String(g.id)===String(_panelGrupo)?'selected':''}>${escHtml(g.nombre)}</option>`).join('');
    $('pn').innerHTML=`
      <div class="head-row" style="margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <select id="pn-grupo" style="max-width:240px" onchange="filtrarPanel(this.value)">${opts}</select>
        <button class="btn ghost small-btn" onclick="exportarAsistencia()">📥 Exportar CSV</button>
      </div>
      <div class="widgets" style="margin-bottom:18px">
        <div class="widget"><div class="widget-head">👥 Miembros</div><div class="stat-num">${d.miembros}</div></div>
        <div class="widget"><div class="widget-head">📊 Promedio asistencia</div><div class="stat-num">${d.promedio}</div></div>
        <div class="widget"><div class="widget-head">✅ Última reunión</div><div class="stat-num">${d.ultima?d.ultima.total:'—'}</div></div>
      </div>
      <div class="card" style="margin-bottom:18px"><div class="widget-head">📈 Tendencia de asistencia</div>
        ${d.reuniones.length? d.reuniones.map(r=>`<div class="trend-row">
          <span class="trend-label">${fechaTxt(r.fecha)}</span>
          <div class="trend-track"><div class="trend-bar" style="width:${Math.round(r.total/max*100)}%">${r.total}</div></div>
        </div>`).join('') : '<p class="muted small">Aún no hay asistencia registrada.</p>'}
      </div>
      <div class="card"><div class="widget-head">⚠️ Se están alejando</div>
        ${d.ausentes.length? '<div class="list" style="margin-top:6px">'+d.ausentes.map(a=>`<div class="item-card flex">
          <div style="flex:1"><b>${a.nombre}</b><div class="muted small">No asistió a la última reunión</div></div>
          <span class="estado-chip estado-rechazado">Ausente</span></div>`).join('')+'</div>'
          : '<p class="muted small" style="margin-top:6px">Nadie ausente en la última reunión 🎉</p>'}
      </div>`;
  }catch(e){ $('pn').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function filtrarPanel(grupoId){ _panelGrupo=grupoId||''; vistaPanel(); }
async function exportarAsistencia(){
  try{
    const r=await fetch(API+'/panel/export.csv'+(_panelGrupo?('?grupo_id='+_panelGrupo):''),
      {headers:{Authorization:'Bearer '+token()}});
    if(!r.ok) throw new Error('No se pudo exportar');
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='asistencia.csv'; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
    toast('📥 Asistencia exportada');
  }catch(e){ toast(e.message); }
}

// ============================================================
//  FASE 2.3: MÚSICA (cancionero + orden del servicio)
// ============================================================
// Edición: SOLO el encargado real (el pastor observa, no edita).
function esLiderMusicaUI(){ return ME.roles.pertenencias.some(p=>p.rol==='lider_musica'); }
function esLiderEdUI(){ return ME.roles.pertenencias.some(p=>p.rol==='lider_ed'); }
function esTesoreroUI(){ return ME.roles.pertenencias.some(p=>p.rol==='tesorero'); }
// Ministerio de música: músico o líder — pueden compartir material/notas.
function esMinisterioMusicaUI(){ return ME.roles.pertenencias.some(p=>p.rol==='musico'||p.rol==='lider_musica'); }

async function vistaMusica(){
  const c=$('content');
  c.innerHTML=`
    <div class="card" style="margin-bottom:16px">
      <div class="head-row"><h3 style="font-size:16px">Cancionero</h3><span id="add-cancion-zona"></span></div>
      <div id="form-cancion"></div>
      <input id="buscar-cancion" placeholder="🔎 Buscar alabanza…" oninput="filtrarCanciones(this.value)" style="margin-bottom:12px"/>
      <div id="lista-canciones" class="muted">Cargando…</div></div>
    <div class="card"><h3 style="font-size:16px;margin-bottom:10px">Orden del servicio</h3>
      <label>Evento</label><select id="set-ev"></select>
      <div id="setlist" style="margin-top:14px" class="muted">…</div>
      <h3 style="font-size:16px;margin:20px 0 10px">🎸 Equipo y ensayo</h3>
      <div id="plan" class="muted">…</div></div>
    <div class="card" style="margin-top:16px">
      <div class="head-row"><h3 style="font-size:16px">📎 Material / Partituras</h3><span id="add-material-zona"></span></div>
      <p class="muted small" style="margin:-2px 0 12px">Notas, acordes o partituras (PDF, Word, foto…) para todo el equipo.</p>
      <div id="form-material-mus"></div><div id="material-mus" class="muted">Cargando…</div></div>`;
  if(esLiderMusicaUI())
    $('add-cancion-zona').innerHTML=`<button class="btn small-btn" onclick="toggleFormCancion()">+ Canción</button>`;
  // El material lo puede compartir cualquier integrante del ministerio de música.
  if(esMinisterioMusicaUI())
    $('add-material-zona').innerHTML=`<button class="btn small-btn" onclick="toggleFormMaterialMus()">+ Material</button>`;
  cargarCanciones();
  cargarMaterialMusica();
  try{
    const ev=await api('/eventos');
    $('set-ev').innerHTML=ev.length? ev.map(e=>`<option value="${e.id}">${escHtml(e.titulo)} (${fechaTxt(e.fecha)})</option>`).join('') : '<option value="">(sin eventos)</option>';
    $('set-ev').onchange=()=>{ cargarSetlist($('set-ev').value); cargarPlan($('set-ev').value); };
    if(ev.length){ cargarSetlist(ev[0].id); cargarPlan(ev[0].id); }
    else $('plan').innerHTML='<p class="muted small">Crea un evento para planificar el equipo y el ensayo.</p>';
  }catch{}
}
function _claveCanciones(){ return 'canciones_'+(ME.iglesia?ME.iglesia.id:0); }
async function cargarCanciones(){
  try{
    const list=await api('/musica/canciones'); window._canciones=list;
    try{ localStorage.setItem(_claveCanciones(), JSON.stringify(list)); }catch{}   // caché para offline
    renderCanciones($('buscar-cancion')?$('buscar-cancion').value:'');
  }catch{
    // Sin conexión: usar la última copia guardada
    try{ window._canciones=JSON.parse(localStorage.getItem(_claveCanciones())||'[]'); }catch{ window._canciones=[]; }
    renderCanciones('');
  }
}
function filtrarCanciones(q){ renderCanciones(q); }
function renderCanciones(q){
  const cont=$('lista-canciones'); if(!cont) return;
  const term=(q||'').toLowerCase().trim();
  const todas=window._canciones||[];
  const lista=todas.filter(c=> !term || (c.titulo||'').toLowerCase().includes(term) || (c.autor||'').toLowerCase().includes(term));
  if(!lista.length){ cont.className='muted'; cont.innerHTML='<p class="small">'+(todas.length?'Sin resultados para “'+(q||'')+'”.':'Aún no hay canciones.')+'</p>'; return; }
  cont.className='list';
  const puede=esLiderMusicaUI();
  cont.innerHTML=lista.map(c=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(c.titulo)}</b>
    <span class="estado-chip">${c.tono||'—'}</span><div class="muted small">${c.autor||''}</div></div>
    ${puede?`<button class="link" style="color:var(--red)" onclick="borrarCancion(${c.id})">🗑️</button>`:''}</div>`).join('');
}
function borrarCancion(id){ modalConfirm('¿Eliminar esta canción del cancionero?', async()=>{
  try{ await api('/musica/canciones/'+id,{method:'DELETE'}); cargarCanciones(); toast('Canción eliminada'); }catch(e){ toast(e.message); } }); }
function toggleFormCancion(){
  const z=$('form-cancion'); if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:14px">
    <div class="row"><input id="cn-titulo" placeholder="Título de la canción" />
      <input id="cn-tono" placeholder="Tono" style="max-width:110px" /></div>
    <input id="cn-autor" placeholder="Autor (opcional)" style="margin-top:10px" />
    <p id="cn-error" class="error"></p>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarCancion()">Guardar</button></div>`;
}
async function guardarCancion(){
  const body={titulo:$('cn-titulo').value.trim(),tono:$('cn-tono').value.trim(),autor:$('cn-autor').value.trim()};
  if(!body.titulo){ $('cn-error').textContent='Pon un título'; return; }
  try{ await api('/musica/canciones',{method:'POST',body:JSON.stringify(body)}); $('form-cancion').innerHTML=''; cargarCanciones(); toast('🎵 Canción agregada'); }
  catch(e){ $('cn-error').textContent=e.message; }
}
async function cargarSetlist(eventoId){
  window._setEv=eventoId;
  try{
    const items=await api('/musica/setlist/'+eventoId); const lider=esLiderMusicaUI();
    let html = items.length
      ? '<div class="list">'+items.map((s,i)=>`<div class="item-card flex">
          <span class="mini-date" style="min-width:34px"><b>${i+1}</b></span>
          <div style="flex:1"><b>${escHtml(s.titulo)}</b> <span class="estado-chip">${s.tono_dia||s.tono||'—'}</span>
          <div class="muted small">${s.autor||''}</div></div>
          ${lider?`<button class="link" onclick="quitarSetlist(${s.id})">Quitar</button>`:''}</div>`).join('')+'</div>'
      : '<p class="muted small">Sin canciones en este servicio.</p>';
    if(lider){
      const opts=(window._canciones||[]).map(c=>`<option value="${c.id}">${escHtml(c.titulo)} (${c.tono||'—'})</option>`).join('');
      html+=`<div class="row" style="margin-top:12px"><select id="set-cancion">${opts}</select>
        <button class="btn small-btn" onclick="agregarSetlist()">Agregar</button></div>`;
    }
    $('setlist').className=''; $('setlist').innerHTML=html;
  }catch{ $('setlist').innerHTML='<p class="error">Error.</p>'; }
}
async function agregarSetlist(){
  try{ await api('/musica/setlist/'+window._setEv,{method:'POST',body:JSON.stringify({cancion_id:$('set-cancion').value})}); cargarSetlist(window._setEv); }
  catch(e){ toast(e.message); }
}
async function quitarSetlist(id){
  try{ await api('/musica/setlist/item/'+id,{method:'DELETE'}); cargarSetlist(window._setEv); }
  catch(e){ toast(e.message); }
}

// ---------- EQUIPO + ENSAYO (por evento) ----------
async function cargarPlan(eventoId){
  if(!eventoId){ $('plan').innerHTML='<p class="muted small">Selecciona un evento.</p>'; return; }
  window._planEv=eventoId;
  try{
    const d=await api('/musica/plan/'+eventoId); const lider=d.puedeEditar;
    const en=d.ensayo||{};
    // Ensayo
    let ensayoHtml = lider
      ? `<div class="row" style="flex-wrap:wrap;gap:8px">
          <input id="en-fecha" type="date" value="${en.fecha||''}" style="max-width:160px"/>
          <input id="en-hora" type="time" value="${en.hora||''}" style="max-width:120px"/>
          <input id="en-lugar" placeholder="Lugar" value="${(en.lugar||'').replace(/"/g,'&quot;')}" style="max-width:180px"/>
          <button class="btn small-btn" onclick="guardarEnsayo()">Guardar ensayo</button></div>`
      : (en.fecha? `<div class="muted small">🗓️ ${fechaTxt(en.fecha)}${en.hora?' · '+en.hora:''}${en.lugar?' · 📍 '+en.lugar:''}</div>`
                 : '<div class="muted small">Ensayo sin agendar.</div>');
    // Equipo: una tarjeta por PERSONA, con todos sus instrumentos como chips
    const porPersona=new Map();
    d.equipo.forEach(m=>{
      if(!porPersona.has(m.persona_id)) porPersona.set(m.persona_id,{nombre:m.nombre,items:[]});
      porPersona.get(m.persona_id).items.push(m);
    });
    const numPersonas=porPersona.size;
    let equipoHtml = numPersonas
      ? '<div class="list" style="margin-top:6px">'+[...porPersona.values()].map(p=>`<div class="item-card flex">
          <div style="flex:1"><b>${p.nombre}</b>
            <span style="display:inline-flex;flex-wrap:wrap;gap:6px;margin-left:6px;vertical-align:middle">${p.items.map(it=>
              `<span class="estado-chip">${it.instrumento||'—'}${lider?` <span title="Quitar" style="cursor:pointer;color:var(--red);font-weight:700;margin-left:2px" onclick="quitarIntegrante(${it.id})">×</span>`:''}</span>`).join('')}</span>
          </div></div>`).join('')+'</div>'
      : '<p class="muted small" style="margin-top:6px">Aún no hay equipo asignado.</p>';
    // Form para agregar (solo líder)
    let addHtml='';
    if(lider){
      const personas=window._personasCache||(window._personasCache=await api('/personas'));
      const popts=personas.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
      const iopts=d.instrumentos.map(i=>`<option value="${i}">${i}</option>`).join('');
      addHtml=`<div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px">
        <select id="eq-persona" style="max-width:200px">${popts}</select>
        <select id="eq-inst" style="max-width:150px">${iopts}</select>
        <button class="btn small-btn" onclick="agregarIntegrante()">+ Agregar</button>
        <button class="btn ghost small-btn" onclick="avisarEquipo()">📣 Avisar al equipo</button></div>`;
    }
    $('plan').className='';
    $('plan').innerHTML=`<div style="margin-bottom:14px"><div class="widget-head" style="font-size:14px">🗓️ Ensayo</div>${ensayoHtml}</div>
      <div class="widget-head" style="font-size:14px">🎸 Equipo (${numPersonas})</div>${equipoHtml}${addHtml}`;
  }catch{ $('plan').innerHTML='<p class="error">No se pudo cargar el plan.</p>'; }
}
async function guardarEnsayo(){
  const body={fecha:$('en-fecha').value,hora:$('en-hora').value,lugar:$('en-lugar').value.trim()};
  try{ await api('/musica/plan/'+window._planEv+'/ensayo',{method:'POST',body:JSON.stringify(body)}); toast('🗓️ Ensayo guardado'); cargarPlan(window._planEv); }
  catch(e){ toast(e.message); }
}
async function agregarIntegrante(){
  const body={persona_id:$('eq-persona').value,instrumento:$('eq-inst').value};
  try{ await api('/musica/plan/'+window._planEv+'/equipo',{method:'POST',body:JSON.stringify(body)}); toast('🎵 Integrante agregado y avisado'); cargarPlan(window._planEv); }
  catch(e){ toast(e.message); }
}
async function quitarIntegrante(id){
  try{ await api('/musica/plan/equipo/'+id,{method:'DELETE'}); cargarPlan(window._planEv); }
  catch(e){ toast(e.message); }
}
async function avisarEquipo(){
  try{ const r=await api('/musica/plan/'+window._planEv+'/avisar',{method:'POST'}); toast('📣 Avisados: '+r.avisados); }
  catch(e){ toast(e.message); }
}

// ---------- MATERIAL / PARTITURAS (compartido con el equipo) ----------
async function cargarMaterialMusica(){
  try{
    const list=await api('/musica/material'); const cont=$('material-mus'); const lider=esLiderMusicaUI();
    if(!list.length){ cont.className='muted'; cont.innerHTML='<p class="small">Aún no hay material compartido.</p>'; return; }
    cont.className='list';
    cont.innerHTML=list.map(m=>{
      const permanente = String(m.archivo_url||'').startsWith('/assets/');
      const esHimnario = m.archivo_url==='/assets/himnario-nuevo.pdf';
      const puedeBorrar = !permanente && (lider || m.creado_por===ME.persona.id);
      const titulo = esHimnario
        ? `<b style="cursor:pointer;color:var(--primary)" onclick="abrirHimnario()">🎵 ${escHtml(m.titulo)}</b>`
        : `<b>${escHtml(m.titulo)}</b>`;
      const sub = esHimnario
        ? `<div class="muted small"><a href="javascript:abrirHimnario()">🔎 Abrir cancionero (buscar y transponer)</a> · <a href="${m.archivo_url}" target="_blank">descargar PDF</a></div>`
        : `<div class="muted small">📎 <a href="${m.archivo_url}" target="_blank">Ver / descargar</a>${m.creado_en?' · '+fechaTxt(m.creado_en.slice(0,10)):''}</div>`;
      return `<div class="item-card flex">
      <div style="flex:1">${titulo}${permanente?' <span class="estado-chip">📌 Fijo</span>':''}${sub}</div>
      ${puedeBorrar?`<button class="link" style="color:var(--red)" onclick="borrarMaterialMus(${m.id})">🗑️</button>`:''}</div>`;
    }).join('');
  }catch{ $('material-mus').innerHTML='<p class="error">Error al cargar el material.</p>'; }
}
function toggleFormMaterialMus(){
  const z=$('form-material-mus'); if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:12px">
    <input id="mm-titulo" placeholder="Título (ej. Acordes Cuán Grande es Él)"/>
    <label style="margin-top:10px">📎 Archivo (PDF, Word, imagen…)</label>
    <input id="mm-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"/>
    <button class="btn small-btn" style="margin-top:12px" onclick="guardarMaterialMus()">Subir</button></div>`;
}
async function guardarMaterialMus(){
  const titulo=$('mm-titulo').value.trim();
  if(!titulo){ toast('Pon un título'); return; }
  const file=$('mm-file').files[0];
  if(!file){ toast('Elige un archivo'); return; }
  try{
    toast('Subiendo archivo…');
    const archivo_url=await uploadArchivo(file);
    await api('/musica/material',{method:'POST',body:JSON.stringify({titulo,archivo_url})});
    $('form-material-mus').innerHTML=''; cargarMaterialMusica(); toast('📎 Material compartido');
  }catch(e){ toast(e.message); }
}
function borrarMaterialMus(id){ modalConfirm('¿Eliminar este material?', async()=>{
  try{ await api('/musica/material/'+id,{method:'DELETE'}); cargarMaterialMusica(); toast('Material eliminado'); }catch(e){ toast(e.message); } }); }

// ============================================================
//  HIMNARIO: buscador + transpositor de tono (estilo cifraclub)
// ============================================================
const _SOLF=['DO','DO#','RE','RE#','MI','FA','FA#','SOL','SOL#','LA','LA#','SI'];
const _ENG=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const _ES2I={'DO':0,'DO#':1,'REB':1,'RE':2,'RE#':3,'MIB':3,'MI':4,'FA':5,'FA#':6,'SOLB':6,'SOL':7,'SOL#':8,'LAB':8,'LA':9,'LA#':10,'SIB':10,'SI':11};
const _EN2I={'C':0,'C#':1,'DB':1,'D':2,'D#':3,'EB':3,'E':4,'F':5,'F#':6,'GB':6,'G':7,'G#':8,'AB':8,'A':9,'A#':10,'BB':10,'B':11};
const _RAIZ=/^(SOL#|SOLb|DO#|RE#|FA#|LA#|REb|MIb|FAb|LAb|SIb|DOb|DO|RE|MI|FA|SOL|LA|SI)/;
function _transRaiz(tok,n){
  let m=tok.match(_RAIZ), fam=_SOLF, idx;
  if(m){ idx=_ES2I[m[0].toUpperCase()]; }
  else { m=tok.match(/^([A-G](#|b)?)/); if(m){ fam=_ENG; idx=_EN2I[m[0].toUpperCase()]; } }
  if(!m||idx===undefined) return tok;
  return fam[((idx+n)%12+12)%12]+tok.slice(m[0].length);
}
function _transAcorde(tok,n){ const p=tok.split('/'); let o=_transRaiz(p[0],n); if(p.length===2)o+='/'+_transRaiz(p[1],n); return o; }
const _ACORDE=/^(SOL#|SOLb|DO#|RE#|FA#|LA#|REb|MIb|FAb|LAb|SIb|DOb|DO|RE|MI|FA|SOL|LA|SI|[A-G])(#|b)?(m|maj7|maj|min|sus2|sus4|sus|add9|dim|aug|°|\+|6|7|9|11|13|2|4|5|m7|m9|m6)*(\/(SOL#|SOLb|DO#|RE#|FA#|LA#|REb|MIb|SIb|LAb|DO|RE|MI|FA|SOL|LA|SI|[A-G])(#|b)?)?$/;
function _esAcorde(t){ return _ACORDE.test(t); }
function _esLineaAcordes(l){ const t=l.trim().split(/\s+/).filter(Boolean); if(!t.length)return false; const a=t.filter(_esAcorde).length; return a>=1 && a/t.length>=0.6; }
function _esc(s){ return escHtml(s); }   /* alias: una sola fuente de verdad para escapar */
// Devuelve HTML: líneas de acordes con los acordes resaltados y transpuestos.
function _renderAcordes(contenido,n){
  return contenido.split('\n').map(l=>{
    if(_esLineaAcordes(l)) return l.replace(/\S+/g, t=> _esAcorde(t)? `<span class="ac">${_esc(_transAcorde(t,n))}</span>` : _esc(t));
    return _esc(l);
  }).join('\n');
}

async function _cargarHimnos(){
  if(window._himnos) return window._himnos;
  try{
    const r=await fetch('/assets/himnario.json'); const j=await r.json();
    window._himnos=j; try{ localStorage.setItem('himnario_json', JSON.stringify(j)); }catch{}
  }catch{
    try{ window._himnos=JSON.parse(localStorage.getItem('himnario_json')||'[]'); }catch{ window._himnos=[]; }
  }
  return window._himnos;
}
let _hmSel=null, _hmTrans=0;
async function abrirHimnario(){
  let ov=$('hm-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='hm-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" onclick="event.stopPropagation()">
    <div class="hmodal-head">
      <b style="flex:1;font-size:16px">🎵 Himnario</b>
      <input id="hm-buscar" placeholder="🔎 Buscar alabanza…" oninput="himnarioBuscar(this.value)" style="max-width:260px;margin:0"/>
      <button class="cal-navbtn" onclick="cerrarHimnario()" aria-label="Cerrar" style="margin-left:8px">✕</button>
    </div>
    <div class="hmodal-body">
      <div class="hmodal-lista" id="hm-lista">Cargando…</div>
      <div class="hmodal-ver" id="hm-ver"><p class="muted small">Elige una alabanza de la lista.</p></div>
    </div></div>`;
  ov.onclick=cerrarHimnario;
  await _cargarHimnos();
  himnarioBuscar('');
}
function cerrarHimnario(){ const ov=$('hm-ov'); if(ov) ov.remove(); }
function himnarioBuscar(q){
  const term=(q||'').toLowerCase().trim();
  const lista=(window._himnos||[]).filter(h=> !term || (h.titulo||'').toLowerCase().includes(term) || String(h.n).includes(term));
  const cont=$('hm-lista'); if(!cont) return;
  if(!lista.length){ cont.innerHTML='<p class="muted small">Sin resultados.</p>'; return; }
  cont.innerHTML=lista.slice(0,300).map(h=>`<div class="hmodal-song ${_hmSel&&_hmSel.n===h.n?'sel':''}" onclick="himnarioSel(${h.n})">
    <b>#${h.n}</b> ${_esc(h.titulo)} <span class="muted small">(${_esc(h.tono||'')})</span></div>`).join('')
    + (lista.length>300?`<p class="muted small" style="padding:8px">Mostrando 300 de ${lista.length}. Afina la búsqueda.</p>`:'');
}
function himnarioSel(n){
  _hmSel=(window._himnos||[]).find(h=>h.n===n); _hmTrans=0;
  himnarioBuscar($('hm-buscar')?$('hm-buscar').value:''); // refresca selección en la lista
  renderHimno();
}
function himnarioTrans(d){ _hmTrans+=d; renderHimno(); }
function himnarioReset(){ _hmTrans=0; renderHimno(); }
function renderHimno(){
  const v=$('hm-ver'); if(!v||!_hmSel) return;
  const tonoBase=_hmSel.tono||'';
  const tonoAhora=_transAcorde(tonoBase, _hmTrans);
  v.innerHTML=`<div class="transbar">
      <h3 style="flex:1;font-size:17px;margin:0">#${_hmSel.n} ${_esc(_hmSel.titulo)}</h3>
    </div>
    <div class="transbar">
      <span class="muted small">Tono:</span> <b style="color:var(--primary)">${_esc(tonoAhora)||'—'}</b>
      <button class="cal-navbtn" onclick="himnarioTrans(-1)" title="Bajar ½ tono">−</button>
      <button class="cal-navbtn" onclick="himnarioTrans(1)" title="Subir ½ tono">+</button>
      ${_hmTrans!==0?`<button class="btn ghost small-btn" onclick="himnarioReset()">Original (${_esc(tonoBase)})</button>`:''}
      <span class="muted small">${_hmTrans>0?'+'+_hmTrans:_hmTrans} semitono(s)</span>
    </div>
    <div class="acordes">${_renderAcordes(_hmSel.contenido||'', _hmTrans)}</div>`;
}

// ============================================================
//  FASE 2.5: CUIDADO PASTORAL (solo el pastor)
// ============================================================
const MOTIVO_ICON={enfermo:'🤒',ausente:'📉',nuevo:'🌱',crisis:'🆘',duelo:'🕊️',otro:'❔'};
const CASO_ESTADO={abierto:['🆕','Abierto','estado-rechazado'],seguimiento:['🔄','En seguimiento','estado-pendiente'],atendido:['✅','Atendido','estado-aceptado']};
const CT_LABEL={llamada:'📞 Llamada',visita:'🏠 Visita',mensaje:'💬 Mensaje',oracion:'🙏 Oración',nota:'📝 Nota'};

async function vistaCuidado(){
  $('content').innerHTML=`<div class="head-row"><h2>❤️ Cuidado pastoral</h2>
    <button class="btn small-btn" onclick="toggleFormCaso()">+ Nuevo caso</button></div>
    <div id="form-caso"></div><div id="lista-casos" class="muted">Cargando…</div>`;
  cargarCasos();
}
async function cargarCasos(){
  try{
    const casos=await api('/cuidado'); const cont=$('lista-casos');
    if(!casos.length){ cont.className='muted'; cont.innerHTML='<div class="placeholder"><div class="big">❤️</div><p>No hay casos de cuidado.</p></div>'; return; }
    cont.className='list';
    cont.innerHTML=casos.map(c=>{const[si,sl,cls]=CASO_ESTADO[c.estado]||['','',''];
      return `<div class="item-card flex" style="cursor:pointer" onclick="verCaso(${c.id})">
        <div style="flex:1"><b>${MOTIVO_ICON[c.motivo]||'❔'} ${c.nombre}</b><div class="muted small">${cap(c.motivo||'')}</div></div>
        <span class="estado-chip ${cls}">${si} ${sl}</span></div>`;}).join('');
  }catch(e){ $('lista-casos').innerHTML='<p class="error">'+e.message+'</p>'; }
}
async function toggleFormCaso(){
  const z=$('form-caso'); if(z.innerHTML){ z.innerHTML=''; return; }
  const personas=await api('/personas');
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>Nuevo caso</h3>
    <label>Persona</label><select id="caso-persona">${personas.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')}</select>
    <label>Motivo</label><select id="caso-motivo">
      <option value="enfermo">🤒 Enfermo</option><option value="ausente">📉 Ausente</option>
      <option value="nuevo">🌱 Nuevo</option><option value="crisis">🆘 En crisis</option>
      <option value="duelo">🕊️ Duelo</option><option value="otro">❔ Otro</option></select>
    <button class="btn" style="margin-top:14px" onclick="guardarCaso()">Crear caso</button></div>`;
}
async function guardarCaso(){
  try{ await api('/cuidado',{method:'POST',body:JSON.stringify({persona_id:$('caso-persona').value,motivo:$('caso-motivo').value})});
    $('form-caso').innerHTML=''; cargarCasos(); toast('Caso creado'); }
  catch(e){ toast(e.message); }
}
async function verCaso(id){
  $('content').innerHTML=`<button class="link" onclick="vistaCuidado()">‹ Casos</button><div id="caso-det" class="muted">Cargando…</div>`;
  try{
    const d=await api('/cuidado/'+id); const[si,sl,cls]=CASO_ESTADO[d.caso.estado]||['','',''];
    $('caso-det').className='';
    $('caso-det').innerHTML=`<div class="card">
      <h3>${MOTIVO_ICON[d.caso.motivo]||'❔'} ${d.caso.nombre}</h3>
      <div class="muted small">Motivo: ${cap(d.caso.motivo||'')} · <span class="estado-chip ${cls}">${si} ${sl}</span></div>
      ${d.caso.telefono?`<div class="muted small" style="margin-top:4px">📞 ${d.caso.telefono}</div>`:''}
      <div style="margin-top:16px;font-weight:700">Historial de cuidado</div>
      <div class="list" style="margin-top:8px">${d.contactos.length? d.contactos.map(x=>`<div class="item-card">
        <b>${CT_LABEL[x.tipo]||x.tipo}</b> <span class="muted small">${(x.fecha||'').slice(0,10)}</span>
        ${x.nota?`<div class="muted small">${x.nota}</div>`:''}</div>`).join('') : '<p class="muted small">Sin contactos aún.</p>'}</div>
      <label>Registrar contacto</label>
      <select id="ct-tipo"><option value="llamada">📞 Llamada</option><option value="visita">🏠 Visita</option>
        <option value="mensaje">💬 Mensaje</option><option value="oracion">🙏 Oración</option></select>
      <textarea id="ct-nota" placeholder="Nota (opcional)" style="margin-top:10px"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn" onclick="agregarContacto(${id})">Guardar contacto</button>
        ${d.caso.estado!=='atendido'?`<button class="btn ghost" onclick="atenderCaso(${id})">Marcar atendido</button>`:''}</div>
    </div>`;
  }catch(e){ $('caso-det').innerHTML='<p class="error">'+e.message+'</p>'; }
}
async function agregarContacto(id){
  try{ await api('/cuidado/'+id+'/contacto',{method:'POST',body:JSON.stringify({tipo:$('ct-tipo').value,nota:$('ct-nota').value.trim()})});
    verCaso(id); toast('Contacto registrado'); }
  catch(e){ toast(e.message); }
}
async function atenderCaso(id){
  try{ await api('/cuidado/'+id+'/atender',{method:'PATCH'}); verCaso(id); toast('Caso marcado como atendido'); }
  catch(e){ toast(e.message); }
}

// ============================================================
//  FASE 3: TESORERÍA (contabilidad + transparencia)
// ============================================================
function money(n){ return '$'+Number(n||0).toLocaleString('es-MX'); }

let _movOffset=0;
async function vistaTesoreria(){
  _movOffset=0;
  $('content').innerHTML=`<div id="tz" class="muted">Cargando…</div>`;
  try{
    const [res,movResp,camps,trans]=await Promise.all([
      api('/tesoreria/resumen'), api('/tesoreria/movimientos'),
      api('/tesoreria/campanias'), api('/tesoreria/transparencia')]);
    // El endpoint puede devolver un array (compat.) o {items,hayMas}
    const movs=Array.isArray(movResp)?movResp:(movResp.items||[]);
    const hayMas=Array.isArray(movResp)?false:!!movResp.hayMas;
    $('tz').className='';
    $('tz').innerHTML=`
      <div class="widgets" style="margin-bottom:18px">
        <div class="widget"><div class="widget-head">💰 Saldo actual</div><div class="stat-num">${money(res.saldo)}</div></div>
        <div class="widget"><div class="widget-head">↑ Ingresos del mes</div><div class="stat-num" style="color:var(--green)">${money(res.ingMes)}</div></div>
        <div class="widget"><div class="widget-head">↓ Gastos del mes</div><div class="stat-num" style="color:var(--red)">${money(res.gasMes)}</div></div>
      </div>
      ${esTesoreroUI()
        ? `<div class="row" style="margin-bottom:14px">
        <button class="btn small-btn" onclick="formMov('ingreso')">+ Ingreso</button>
        <button class="btn ghost small-btn" onclick="formMov('gasto')">+ Gasto</button></div>`
        : `<p class="muted small" style="margin-bottom:14px">👁️ Solo lectura — solo el tesorero registra movimientos.</p>`}
      <div id="mov-form"></div>
      <div class="card" style="margin-bottom:18px"><div class="widget-head">🎯 Campañas</div>
        ${camps.length? camps.map(c=>{const pct=c.meta?Math.min(100,Math.round(c.recaudado/c.meta*100)):0;
          return `<div style="margin:12px 0"><div style="display:flex;justify-content:space-between;font-size:14px">
            <b>${c.nombre}</b><span class="muted">${money(c.recaudado)} / ${money(c.meta)}</span></div>
            <div class="trend-track" style="margin-top:6px"><div class="trend-bar" style="width:${pct}%">${pct}%</div></div></div>`;}).join('')
          : '<p class="muted small">Sin campañas.</p>'}
      </div>
      <div class="card" style="margin-bottom:18px"><div class="widget-head">🔓 Transparencia</div>
        <p class="small" style="margin:6px 0">Recaudado <b>${money(trans.recaudado)}</b> · Usado <b>${money(trans.gastado)}</b> · Saldo <b>${money(trans.saldo)}</b></p>
        ${trans.porCategoria.map(g=>{const pct=trans.gastado?Math.round(g.monto/trans.gastado*100):0;
          return `<div style="display:flex;justify-content:space-between;font-size:13px;margin:4px 0"><span>${cap(g.categoria)}</span><span class="muted">${pct}% · ${money(g.monto)}</span></div>`;}).join('')}
      </div>
      <div class="card"><div class="widget-head">Movimientos</div>
        <div class="list" id="mov-list" style="margin-top:8px">${movs.map(filaMov).join('')}</div>
        ${hayMas?`<button class="btn ghost small-btn" id="mov-mas" style="margin-top:10px" onclick="cargarMasMovimientos()">Ver más</button>`:''}
      </div>`;
  }catch(e){ $('tz').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function filaMov(m){
  return `<div class="item-card flex">
    <div style="flex:1"><b>${m.tipo==='ingreso'?'↑':'↓'} ${cap(m.categoria||m.tipo)}</b>
    <div class="muted small">${m.descripcion||''} · ${m.fecha}${m.comprobante_url?` · 📎 <a href="${m.comprobante_url}" target="_blank">comprobante</a>`:''}</div></div>
    <b style="color:${m.tipo==='ingreso'?'var(--green)':'var(--red)'}">${m.tipo==='ingreso'?'+':'−'}${money(m.monto)}</b></div>`;
}
async function cargarMasMovimientos(){
  _movOffset+=50;
  try{
    const resp=await api('/tesoreria/movimientos?offset='+_movOffset);
    const items=Array.isArray(resp)?resp:(resp.items||[]);
    const hayMas=Array.isArray(resp)?false:!!resp.hayMas;
    $('mov-list').insertAdjacentHTML('beforeend', items.map(filaMov).join(''));
    if(!hayMas){ const b=$('mov-mas'); if(b) b.remove(); }
  }catch(e){ toast(e.message); }
}
function formMov(tipo){
  const z=$('mov-form');
  const cats=tipo==='ingreso'?['ofrenda','diezmo','donacion','otro']:['servicios','eventos','ayuda','otro'];
  const hoy=new Date().toISOString().slice(0,10);
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>${tipo==='ingreso'?'Nuevo ingreso':'Nuevo gasto'}</h3>
    <label>Categoría</label><select id="mv-cat">${cats.map(c=>`<option value="${c}">${cap(c)}</option>`).join('')}</select>
    <label>Monto</label><input id="mv-monto" type="number" placeholder="0" />
    <label>Fecha ${tipo==='ingreso'?'del ingreso':'del gasto'}</label><input id="mv-fecha" type="date" value="${hoy}" />
    <label>${tipo==='ingreso'?'Descripción / origen':'¿En qué se gastó?'}</label>
    <input id="mv-desc" placeholder="${tipo==='ingreso'?'Ej. Ofrenda dominical':'Ej. Compra de materiales para el evento'}" />
    <label>📎 Comprobante / voucher (foto o archivo)</label>
    <input id="mv-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" />
    <p id="mv-error" class="error"></p>
    <button class="btn" style="margin-top:12px" onclick="guardarMov('${tipo}')">Guardar</button></div>`;
}
async function guardarMov(tipo){
  const monto=$('mv-monto').value;
  if(!monto){ $('mv-error').textContent='Pon un monto'; return; }
  try{
    let comprobante_url='';
    const f=$('mv-file').files[0];
    if(f){ toast('Subiendo comprobante…'); comprobante_url=await uploadArchivo(f); }
    const body={tipo,categoria:$('mv-cat').value,monto,descripcion:$('mv-desc').value.trim(),fecha:$('mv-fecha').value,comprobante_url};
    await api('/tesoreria/movimientos',{method:'POST',body:JSON.stringify(body)}); toast('💰 Registrado'); vistaTesoreria();
  }catch(e){ $('mv-error').textContent=e.message; }
}

// ============================================================
//  FASE 3: NIÑOS / ESCUELA DOMINICAL
// ============================================================
let _claseActual=null;
async function vistaNinos(){
  $('content').innerHTML=`<div class="head-row"><h2>👶 Escuela Dominical</h2>
    ${esLiderEdUI()?`<button class="btn small-btn" onclick="formClase()">+ Clase</button>`:''}</div>
    ${esLiderEdUI()?'':'<p class="muted small" style="margin-bottom:10px">👁️ Solo lectura — solo el encargado de Escuela Dominical edita.</p>'}
    <div id="form-clase"></div><div id="clases" class="muted">Cargando…</div>`;
  cargarClases();
}
async function cargarClases(){
  try{
    const cl=await api('/ninos/clases'); const c=$('clases');
    if(!cl.length){ c.className='muted'; c.innerHTML='<div class="placeholder"><div class="big">👶</div><p>No hay clases aún.</p></div>'; return; }
    c.className='grid';
    c.innerHTML=cl.map(x=>`<div class="module-card" onclick="vistaClase(${x.id},'${(x.nombre||'').replace(/['"\\]/g,'')}')">
      <div class="icon">📚</div><div class="label">${x.nombre}</div>
      <div class="muted small">${x.edad||''} · ${x.ninos} niños</div></div>`).join('');
  }catch(e){ $('clases').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function formClase(){ const z=$('form-clase'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>Nueva clase</h3>
    <label>Nombre</label><input id="cl-nombre" placeholder="Ej. Primarios"/>
    <label>Edades</label><input id="cl-edad" placeholder="Ej. 6-8 años"/>
    <button class="btn" style="margin-top:12px" onclick="guardarClase()">Crear</button></div>`; }
async function guardarClase(){
  try{ await api('/ninos/clases',{method:'POST',body:JSON.stringify({nombre:$('cl-nombre').value.trim(),edad:$('cl-edad').value.trim()})});
    $('form-clase').innerHTML=''; cargarClases(); toast('Clase creada'); }catch(e){ toast(e.message);} }

async function vistaClase(id,nombre){
  _claseActual=id;
  const editar=esLiderEdUI();
  $('content').innerHTML=`<button class="link" onclick="vistaNinos()">‹ Clases</button><h2>📚 ${nombre||'Clase'}</h2>
    <div class="card" style="margin:12px 0"><div class="head-row"><h3 style="font-size:16px">📖 Material</h3>
      ${editar?`<button class="btn small-btn" onclick="formMaterial()">+ Lección</button>`:''}</div>
      <div id="form-material"></div><div id="material" class="muted">…</div></div>
    <div class="card" style="margin-bottom:14px"><div class="head-row"><h3 style="font-size:16px">👦 Niños</h3>
      ${editar?`<button class="btn small-btn" onclick="formNino()">+ Niño</button>`:''}</div>
      <div id="form-nino"></div><div id="ninos-lista" class="muted">…</div></div>
    <div class="card"><h3 style="font-size:16px;margin-bottom:8px">✅ Asistencia</h3>
      <div id="asist-ninos" class="muted">…</div></div>`;
  cargarMaterial(); cargarNinos();
}
async function cargarMaterial(){
  try{ const m=await api('/ninos/clase/'+_claseActual+'/material'); const c=$('material');
    c.className=m.length?'list':'muted';
    c.innerHTML=m.length? m.map(x=>`<div class="item-card"><b>${x.titulo}</b>${x.fecha?' <span class="muted small">· '+fechaTxt(x.fecha)+'</span>':''}
      ${x.versiculo?`<div class="muted small">📖 ${x.versiculo}</div>`:''}
      ${x.material_url?`<div class="muted small">📎 <a href="${x.material_url}" target="_blank">Ver documento</a></div>`:''}</div>`).join('') : '<p class="small">Sin lecciones.</p>';
  }catch{}
}
function formMaterial(){ const z=$('form-material'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:12px">
    <input id="m-titulo" placeholder="Título de la lección"/>
    <div class="row" style="margin-top:10px"><input id="m-fecha" type="date"/><input id="m-vers" placeholder="Versículo"/></div>
    <label style="margin-top:10px">📎 Subir documento (PDF, imagen, Word…)</label>
    <input id="m-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"/>
    <button class="btn small-btn" style="margin-top:12px" onclick="guardarMaterial()">Guardar</button></div>`; }
async function guardarMaterial(){
  const titulo=$('m-titulo').value.trim();
  if(!titulo){ toast('Pon un título'); return; }
  const file=$('m-file').files[0];
  try{
    let material_url='';
    if(file){ toast('Subiendo documento…'); material_url=await uploadArchivo(file); }
    await api('/ninos/material',{method:'POST',body:JSON.stringify({clase_id:_claseActual,titulo,fecha:$('m-fecha').value,versiculo:$('m-vers').value.trim(),material_url})});
    $('form-material').innerHTML=''; cargarMaterial(); toast('📖 Lección agregada');
  }catch(e){ toast(e.message); }
}
async function cargarNinos(){
  try{ const n=await api('/ninos/clase/'+_claseActual+'/ninos'); window._ninos=n; const c=$('ninos-lista');
    c.className=n.length?'list':'muted';
    c.innerHTML=n.length? n.map(x=>`<div class="item-card"><b>${x.nombre}</b>${x.edad?' <span class="muted small">'+x.edad+' años</span>':''}
      ${x.alergias?` <span class="estado-chip estado-rechazado">⚠️ ${x.alergias}</span>`:''}
      <div class="muted small">${x.familia?'Familia '+x.familia:''}</div></div>`).join('') : '<p class="small">Sin niños.</p>';
    renderAsistNinos();
  }catch{}
}
function formNino(){ const z=$('form-nino'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:12px">
    <div class="row"><input id="n-nombre" placeholder="Nombre"/><input id="n-edad" type="number" placeholder="Edad" style="max-width:90px"/></div>
    <input id="n-familia" placeholder="Familia" style="margin-top:10px"/>
    <input id="n-alergias" placeholder="Alergias / notas" style="margin-top:10px"/>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarNino()">Guardar</button></div>`; }
async function guardarNino(){
  try{ await api('/ninos/ninos',{method:'POST',body:JSON.stringify({clase_id:_claseActual,nombre:$('n-nombre').value.trim(),edad:$('n-edad').value,familia:$('n-familia').value.trim(),alergias:$('n-alergias').value.trim()})});
    $('form-nino').innerHTML=''; cargarNinos(); toast('Niño agregado'); }catch(e){ toast(e.message);} }
function renderAsistNinos(){
  const c=$('asist-ninos'); const ninos=window._ninos||[];
  if(!ninos.length){ c.className='muted'; c.innerHTML='<p class="small">Agrega niños primero.</p>'; return; }
  c.className='';
  const editar=esLiderEdUI();
  c.innerHTML=`<label>Fecha</label><input id="asist-fecha" type="date" style="max-width:200px"/>
    <div class="list" style="margin-top:10px">${ninos.map(n=>`<div class="item-card flex">
      <label class="check" style="margin:0;flex:1"><input type="checkbox" class="nino-chk" data-id="${n.id}" ${editar?'':'disabled'}/> ${n.nombre}</label></div>`).join('')}</div>
    ${editar?`<button class="btn" style="margin-top:12px" onclick="guardarAsistNinos()">Guardar asistencia</button>`:''}`;
}
async function guardarAsistNinos(){
  const fecha=$('asist-fecha').value; if(!fecha) return toast('Pon la fecha');
  const presentes=[...document.querySelectorAll('.nino-chk')].filter(c=>c.checked).map(c=>({ nino_id:c.dataset.id }));
  if(!presentes.length) return toast('Marca al menos un niño');
  try{ const r=await api('/ninos/asistencia',{method:'POST',body:JSON.stringify({clase_id:_claseActual,fecha,presentes})});
    toast('✅ Asistencia guardada: '+r.total+' niños'); }catch(e){ toast(e.message);} }

// ============================================================
// ============================================================
//  Helper de escape para innerHTML (seguro)
// ============================================================
function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
//  MI GRUPO — centro del líder de cuerpo (ej. Jóvenes)
// ============================================================
let _grupoSel=null;
async function vistaMiGrupo(){
  const c=$('content'); c.innerHTML='<div id="mg" class="muted">Cargando…</div>';
  let grupos;
  try{ grupos=await api('/grupo/mis'); }catch{ $('mg').innerHTML='<p class="error">No se pudo cargar.</p>'; return; }
  if(!grupos.length){ $('mg').innerHTML='<div class="placeholder"><div class="big">🧑‍🤝‍🧑</div><p>No perteneces a ningún grupo todavía.</p></div>'; return; }
  window._misGrupos=grupos;
  if(!_grupoSel || !grupos.find(g=>g.id===_grupoSel)) _grupoSel=grupos[0].id;
  renderMiGrupo();
}
function renderMiGrupo(){
  const grupos=window._misGrupos||[];
  const g=grupos.find(x=>x.id===_grupoSel)||grupos[0];
  window._grupoLider=!!g.soyLider;
  const sel = grupos.length>1
    ? `<select onchange="_grupoSel=Number(this.value);renderMiGrupo()" style="max-width:220px">${grupos.map(x=>`<option value="${x.id}" ${x.id===g.id?'selected':''}>${x.nombre}</option>`).join('')}</select>`
    : `<h2 style="margin:0">${escHtml(g.nombre)}</h2>`;
  $('mg').className='';
  $('mg').innerHTML=`
    <div class="head-row" style="align-items:center;gap:10px">${sel}
      ${g.soyLider?'<span class="estado-chip estado-aceptado">Líder</span>':'<span class="estado-chip">Miembro</span>'}</div>
    <div class="card" style="margin-bottom:16px"><div class="widget-head">📁 Carpeta de Google Drive</div>
      ${g.drive_url
        ? `<a class="btn small-btn" href="${escHtml(g.drive_url)}" target="_blank" rel="noopener">Abrir carpeta en Drive ↗</a>`
        : `<p class="muted small">${g.soyLider?'Aún no has vinculado una carpeta.':'El líder aún no vinculó una carpeta de Drive.'}</p>`}
      ${g.soyLider?`<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
        <input id="mg-drive" placeholder="Pega el enlace de tu carpeta de Drive…" value="${escHtml(g.drive_url||'')}" style="flex:1;min-width:200px"/>
        <button class="btn small-btn" onclick="guardarDriveGrupo()">${g.drive_url?'Actualizar':'Vincular'}</button>
        ${g.drive_url?`<button class="btn ghost small-btn" onclick="quitarDriveGrupo()">Quitar</button>`:''}</div>
        <p class="muted small" style="margin-top:8px">En Drive: clic derecho a la carpeta → <b>Compartir</b> → "Cualquiera con el enlace" → copia el enlace.</p>`:''}
    </div>
    <div class="card" style="margin-bottom:16px"><div class="head-row"><h3 style="font-size:16px">📢 Avisos y recordatorios</h3>${g.soyLider?`<button class="btn small-btn" onclick="formAvisoGrupo()">+ Aviso</button>`:''}</div>
      <div id="mg-aviso-form"></div><div id="mg-avisos" class="muted">…</div></div>
    <div class="card" style="margin-bottom:16px"><div class="head-row"><h3 style="font-size:16px">🔗 Recursos (links y archivos)</h3>${g.soyLider?`<button class="btn small-btn" onclick="formRecursoGrupo()">+ Recurso</button>`:''}</div>
      <div id="mg-rec-form"></div><div id="mg-recursos" class="muted">…</div></div>
    <div class="card" style="margin-bottom:16px"><div class="head-row"><h3 style="font-size:16px">👥 Miembros</h3>${g.soyLider?`<button class="btn small-btn" onclick="formAgregarMiembro()">+ Agregar</button>`:''}</div>
      ${g.soyLider?`<div id="mg-avisar" style="margin:8px 0 14px"></div>`:''}
      <div id="mg-add-form"></div><div id="mg-miembros" class="muted">…</div></div>
    ${g.soyLider?`<div class="card"><div class="head-row"><h3 style="font-size:16px">📋 Tareas asignadas</h3><button class="btn small-btn" onclick="formTareaGrupo()">+ Tarea</button></div>
      <div id="mg-tarea-form"></div><div id="mg-tareas" class="muted">…</div></div>`:''}`;
  cargarAvisosGrupo(); cargarRecursosGrupo(); cargarMiembrosGrupo();
  if(g.soyLider) cargarTareasGrupo();
}
// --- Carpeta de Google Drive del grupo ---
async function guardarDriveGrupo(){
  const url=$('mg-drive').value.trim();
  try{ await api('/grupo/'+_grupoSel+'/drive',{method:'POST',body:JSON.stringify({url})}); toast('📁 Carpeta de Drive vinculada'); vistaMiGrupo(); }
  catch(e){ toast(e.message); }
}
function quitarDriveGrupo(){ modalConfirm('¿Quitar la carpeta de Drive del grupo?', async()=>{
  try{ await api('/grupo/'+_grupoSel+'/drive',{method:'POST',body:JSON.stringify({url:''})}); toast('Carpeta quitada'); vistaMiGrupo(); }catch(e){ toast(e.message); } }); }
// --- Avisos / recordatorios ---
async function cargarAvisosGrupo(){
  try{ const list=await api('/grupo/'+_grupoSel+'/avisos'); const c=$('mg-avisos'); const lider=window._grupoLider;
    if(!list.length){ c.className='muted'; c.innerHTML='<p class="small">Sin avisos todavía.</p>'; return; }
    c.className='list';
    c.innerHTML=list.map(a=>`<div class="item-card flex"><div style="flex:1"><b>${a.tipo==='recordatorio'?'⏰':'📢'} ${escHtml(a.titulo)}</b>${a.fecha?` <span class="estado-chip">${fechaTxt(a.fecha)}</span>`:''}<div class="muted small">${a.texto||''}</div></div>${lider?`<button class="link" style="color:var(--red)" onclick="borrarAvisoGrupo(${a.id})">🗑️</button>`:''}</div>`).join('');
  }catch{ $('mg-avisos').innerHTML='<p class="error">Error.</p>'; }
}
function formAvisoGrupo(){ const z=$('mg-aviso-form'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:12px">
    <div class="row" style="gap:8px"><select id="ag-tipo" style="max-width:170px"><option value="aviso">📢 Aviso</option><option value="recordatorio">⏰ Recordatorio</option></select>
      <input id="ag-fecha" type="date" style="max-width:170px"/></div>
    <input id="ag-titulo" placeholder="Título del aviso" style="margin-top:10px"/>
    <textarea id="ag-texto" placeholder="Detalle (opcional)" style="margin-top:10px"></textarea>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarAvisoGrupo()">Publicar y avisar al grupo</button></div>`;
}
async function guardarAvisoGrupo(){
  const titulo=$('ag-titulo').value.trim(); if(!titulo) return toast('Pon un título');
  try{ const r=await api('/grupo/'+_grupoSel+'/avisos',{method:'POST',body:JSON.stringify({tipo:$('ag-tipo').value,titulo,texto:$('ag-texto').value.trim(),fecha:$('ag-fecha').value})});
    $('mg-aviso-form').innerHTML=''; cargarAvisosGrupo(); toast('📢 Publicado · avisados '+r.avisados); }catch(e){ toast(e.message); }
}
function borrarAvisoGrupo(id){ modalConfirm('¿Eliminar este aviso?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/avisos/'+id,{method:'DELETE'}); cargarAvisosGrupo(); }catch(e){ toast(e.message);} }); }
// --- Recursos (links / archivos) ---
async function cargarRecursosGrupo(){
  try{ const list=await api('/grupo/'+_grupoSel+'/recursos'); const c=$('mg-recursos'); const lider=window._grupoLider;
    if(!list.length){ c.className='muted'; c.innerHTML='<p class="small">Sin recursos todavía.</p>'; return; }
    c.className='list';
    c.innerHTML=list.map(rc=>`<div class="item-card flex"><div style="flex:1"><b>${rc.tipo==='archivo'?'📎':'🔗'} ${escHtml(rc.titulo)}</b><div class="muted small"><a href="${rc.url}" target="_blank">${rc.tipo==='archivo'?'Abrir / descargar':'Abrir enlace'}</a></div></div>${lider?`<button class="link" style="color:var(--red)" onclick="borrarRecursoGrupo(${rc.id})">🗑️</button>`:''}</div>`).join('');
  }catch{ $('mg-recursos').innerHTML='<p class="error">Error.</p>'; }
}
function formRecursoGrupo(){ const z=$('mg-rec-form'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:12px">
    <input id="rg-titulo" placeholder="Título (ej. Canción del campamento)"/>
    <div class="row" style="gap:8px;margin-top:10px">
      <select id="rg-tipo" onchange="_rgTipo(this.value)" style="max-width:140px"><option value="link">🔗 Link</option><option value="archivo">📎 Archivo</option></select>
      <input id="rg-url" placeholder="Pega el link (YouTube, Drive…)" style="flex:1"/></div>
    <div id="rg-file-zona" style="margin-top:10px;display:none"><input id="rg-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"/></div>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarRecursoGrupo()">Compartir</button></div>`;
}
function _rgTipo(v){ const link=v==='link'; if($('rg-url'))$('rg-url').style.display=link?'':'none'; if($('rg-file-zona'))$('rg-file-zona').style.display=link?'none':''; }
async function guardarRecursoGrupo(){
  const titulo=$('rg-titulo').value.trim(); if(!titulo) return toast('Pon un título');
  const tipo=$('rg-tipo').value;
  try{
    let url;
    if(tipo==='archivo'){ const f=$('rg-file').files[0]; if(!f) return toast('Elige un archivo'); toast('Subiendo…'); url=await uploadArchivo(f); }
    else { url=$('rg-url').value.trim(); if(!url) return toast('Pega el link'); }
    await api('/grupo/'+_grupoSel+'/recursos',{method:'POST',body:JSON.stringify({tipo,titulo,url})});
    $('mg-rec-form').innerHTML=''; cargarRecursosGrupo(); toast('🔗 Recurso compartido');
  }catch(e){ toast(e.message); }
}
function borrarRecursoGrupo(id){ modalConfirm('¿Eliminar este recurso?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/recursos/'+id,{method:'DELETE'}); cargarRecursosGrupo(); }catch(e){ toast(e.message);} }); }
// --- Miembros + avisar a uno/todos ---
async function cargarMiembrosGrupo(){
  try{ const list=await api('/grupo/'+_grupoSel+'/miembros'); window._mgMiembros=list.filter(m=>!m.esLider); const c=$('mg-miembros'); const lider=window._grupoLider;
    c.className='list';
    c.innerHTML=list.map(m=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(m.nombre)}</b>${m.esLider?' <span class="estado-chip estado-aceptado">Líder</span>':''}</div>${(lider&&!m.esLider)?`<button class="link" style="color:var(--red)" onclick="quitarMiembroGrupo(${m.id},'${(m.nombre||'').replace(/['"\\]/g,'')}')">Quitar</button>`:''}</div>`).join('');
    if(lider) renderAvisarBox();
  }catch{ $('mg-miembros').innerHTML='<p class="error">Error.</p>'; }
}
function renderAvisarBox(){
  const cont=$('mg-avisar'); if(!cont) return;
  const ms=window._mgMiembros||[];
  cont.innerHTML=`<div class="row" style="flex-wrap:wrap;gap:8px;background:var(--bg);padding:12px;border-radius:10px">
    <select id="mg-av-quien" style="max-width:200px"><option value="">📣 A todos</option>${ms.map(m=>`<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('')}</select>
    <input id="mg-av-msg" placeholder="Mensaje rápido…" style="flex:1;min-width:150px"/>
    <button class="btn small-btn" onclick="avisarGrupo()">Enviar</button></div>`;
}
async function avisarGrupo(){
  const titulo=$('mg-av-msg').value.trim(); if(!titulo) return toast('Escribe el mensaje');
  const persona_id=$('mg-av-quien').value||undefined;
  try{ const r=await api('/grupo/'+_grupoSel+'/avisar',{method:'POST',body:JSON.stringify({persona_id,titulo})}); $('mg-av-msg').value=''; toast('💬 Avisados: '+r.avisados); }
  catch(e){ toast(e.message); }
}
async function formAgregarMiembro(){ const z=$('mg-add-form'); if(z.innerHTML){z.innerHTML='';return;}
  let libres=[]; try{ libres=await api('/grupo/'+_grupoSel+'/candidatos'); }catch{}
  if(!libres.length){ z.innerHTML='<p class="muted small" style="margin-bottom:10px">No hay más personas para agregar.</p>'; return; }
  z.innerHTML=`<div class="row" style="gap:8px;margin-bottom:12px"><select id="mg-nuevo" style="flex:1">${libres.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')}</select><button class="btn small-btn" onclick="agregarMiembroGrupo()">Agregar al grupo</button></div>`;
}
async function agregarMiembroGrupo(){ try{ await api('/grupo/'+_grupoSel+'/miembros',{method:'POST',body:JSON.stringify({persona_id:$('mg-nuevo').value})}); $('mg-add-form').innerHTML=''; cargarMiembrosGrupo(); toast('👋 Agregado y avisado'); }catch(e){ toast(e.message); } }
function quitarMiembroGrupo(id,nombre){ modalConfirm('¿Quitar a '+nombre+' del grupo?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/miembros/'+id,{method:'DELETE'}); cargarMiembrosGrupo(); toast('Listo'); }catch(e){ toast(e.message);} }); }
// --- Tareas (el líder asigna tareas a un miembro → aparecen en "Mi Servicio") ---
function formTareaGrupo(){ const z=$('mg-tarea-form'); if(z.innerHTML){z.innerHTML='';return;}
  const ms=window._mgMiembros||[];
  if(!ms.length){ z.innerHTML='<p class="muted small" style="margin-bottom:10px">Agrega miembros primero.</p>'; return; }
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:12px">
    <select id="tg-persona" style="max-width:220px">${ms.map(m=>`<option value="${m.id}">${escHtml(m.nombre)}</option>`).join('')}</select>
    <input id="tg-titulo" placeholder="Tarea (ej. Traer la ofrenda especial)" style="margin-top:10px"/>
    <textarea id="tg-detalle" placeholder="Detalle (opcional)" style="margin-top:10px"></textarea>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarTareaGrupo()">Asignar y avisar</button></div>`;
}
async function guardarTareaGrupo(){
  const titulo=$('tg-titulo').value.trim(); if(!titulo) return toast('Escribe la tarea');
  try{ await api('/grupo/'+_grupoSel+'/tareas',{method:'POST',body:JSON.stringify({persona_id:$('tg-persona').value,titulo,detalle:$('tg-detalle').value.trim()})});
    $('mg-tarea-form').innerHTML=''; cargarTareasGrupo(); toast('📋 Tarea asignada y avisada'); }catch(e){ toast(e.message); }
}
async function cargarTareasGrupo(){
  const cont=$('mg-tareas'); if(!cont) return;
  let list=[]; try{ list=await api('/grupo/'+_grupoSel+'/tareas'); }catch{}
  if(!list.length){ cont.className='muted'; cont.innerHTML='<p class="small">Sin tareas asignadas.</p>'; return; }
  cont.className='list';
  cont.innerHTML=list.map(t=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(t.titulo)}</b> <span class="muted small">→ ${escHtml(t.nombre)}</span>${t.detalle?`<div class="muted small">${escHtml(t.detalle)}</div>`:''} <span class="estado-chip ${t.estado==='hecho'?'estado-aceptado':'estado-pendiente'}">${t.estado==='hecho'?'✅ Hecho':'⏳ Pendiente'}</span></div><button class="link" style="color:var(--red)" onclick="borrarTareaGrupo(${t.id})">🗑️</button></div>`).join('');
}
function borrarTareaGrupo(id){ modalConfirm('¿Eliminar esta tarea?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/tareas/'+id,{method:'DELETE'}); cargarTareasGrupo(); }catch(e){ toast(e.message);} }); }

// ============================================================
//  PREDICA — historial de prédicas (Devocional + Notas fusionados)
// ============================================================
async function vistaPredica(){
  const c=$('content'); c.innerHTML='<div id="pr" class="muted">Cargando…</div>';
  let data; try{ data=await api('/predica'); }catch{ $('pr').innerHTML='<p class="error">No se pudo cargar.</p>'; return; }
  window._predicaEdit=!!data.puedeEditar;
  $('pr').className='';
  $('pr').innerHTML=`<div class="head-row"><h2>📖 Predica</h2>${data.puedeEditar?'<button class="btn small-btn" onclick="formPredica(0)">+ Nueva prédica</button>':''}</div>
    ${ME.persona.es_pastor?'<div id="pr-pred"></div>':''}
    <div id="pr-lista" class="muted">…</div>`;
  renderPredicas(data.items||[]);
  if(ME.persona.es_pastor) cargarPredicadores();
}
function renderPredicas(items){
  const c=$('pr-lista');
  if(!items.length){ c.className='muted'; c.innerHTML='<p class="small">Aún no hay prédicas registradas.</p>'; return; }
  c.className='list';
  c.innerHTML=items.map(p=>`<div class="item-card flex" style="cursor:pointer" onclick="verPredica(${p.id})">
    ${chipFecha(p.fecha||'')}<div style="flex:1"><div class="item-titulo">${escHtml(p.titulo)}</div>
    <div class="muted small">${p.predicador?'🎤 '+p.predicador:''}${p.recursos?' · 📎 '+p.recursos+' recurso(s)':''}</div></div>
    <span class="muted" style="font-size:20px">›</span></div>`).join('');
}
async function verPredica(id){
  $('content').innerHTML='<button class="link" onclick="vistaPredica()">‹ Predicas</button><div id="prd" class="muted">Cargando…</div>';
  let d; try{ d=await api('/predica/'+id); }catch{ $('prd').innerHTML='<p class="error">Error.</p>'; return; }
  window._predActual=id; const edit=d.puedeEditar;
  const recs=(d.recursos||[]).map(r=>{
    const ic=r.tipo==='archivo'?'📎':r.tipo==='libro'?'📚':'🔗';
    const link=r.url?`<a href="${r.url}" target="_blank">${r.tipo==='archivo'?'Abrir / descargar':'Abrir'}</a>`:'';
    return `<div class="item-card flex"><div style="flex:1"><b>${ic} ${r.titulo}</b> <span class="muted small">${link}</span></div>${edit?`<button class="link" style="color:var(--red)" onclick="borrarRecPredica(${r.id})">🗑️</button>`:''}</div>`;
  }).join('');
  $('prd').className='';
  $('prd').innerHTML=`<div class="card">
    <div class="head-row"><h2 style="font-size:20px;margin:0">${escHtml(d.titulo)}</h2>${edit?`<div class="row" style="width:auto;gap:10px"><button class="link" onclick="formPredica(${id})">✏️ Editar</button><button class="link" style="color:var(--red)" onclick="borrarPredica(${id})">🗑️</button></div>`:''}</div>
    <div class="muted small" style="margin-top:4px">${d.fecha?'📅 '+fechaTxt(d.fecha):''}${d.predicador?' · 🎤 '+d.predicador:''}</div>
    ${d.notas?`<div style="margin-top:14px;white-space:pre-wrap;line-height:1.5">${escHtml(d.notas)}</div>`:'<p class="muted small" style="margin-top:10px">Sin notas.</p>'}
  </div>
  <div class="card" style="margin-top:16px"><div class="head-row"><h3 style="font-size:16px">📎 Recursos (links, archivos, libros)</h3>${edit?`<button class="btn small-btn" onclick="formRecPredica()">+ Recurso</button>`:''}</div>
    <div id="prd-recform"></div>
    <div class="list" style="margin-top:8px">${recs||'<p class="muted small">Sin recursos.</p>'}</div></div>`;
}
async function formPredica(id){
  let p={}; if(id){ try{ p=await api('/predica/'+id); }catch{} }
  const v=(x)=>x?String(x).replace(/"/g,'&quot;'):'';
  $('content').innerHTML=`<button class="link" onclick="${id?`verPredica(${id})`:'vistaPredica()'}">‹ Volver</button>
   <div class="card" style="margin-top:8px"><h2 style="font-size:18px">${id?'Editar prédica':'Nueva prédica'}</h2>
    <label>Nombre de la prédica</label><input id="pp-titulo" value="${v(p.titulo)}" placeholder="Ej. El amor de Dios"/>
    <label>Fecha</label><input id="pp-fecha" type="date" value="${p.fecha||''}"/>
    <label>Predicador</label><input id="pp-predicador" value="${v(p.predicador)}" placeholder="Quién predicó"/>
    <label>Notas / bosquejo</label><textarea id="pp-notas" style="min-height:150px">${p.notas||''}</textarea>
    <p id="pp-error" class="error"></p>
    <button class="btn" style="margin-top:12px" onclick="guardarPredica(${id||0})">${id?'Guardar cambios':'Crear prédica'}</button></div>`;
}
async function guardarPredica(id){
  const body={titulo:$('pp-titulo').value.trim(),fecha:$('pp-fecha').value,predicador:$('pp-predicador').value.trim(),notas:$('pp-notas').value};
  if(!body.titulo){ $('pp-error').textContent='Pon el nombre de la prédica'; return; }
  try{
    if(id){ await api('/predica/'+id,{method:'PATCH',body:JSON.stringify(body)}); toast('Prédica actualizada'); verPredica(id); }
    else { const r=await api('/predica',{method:'POST',body:JSON.stringify(body)}); toast('📖 Prédica creada'); verPredica(r.id); }
  }catch(e){ $('pp-error').textContent=e.message; }
}
function borrarPredica(id){ modalConfirm('¿Eliminar esta prédica y sus recursos?', async()=>{ try{ await api('/predica/'+id,{method:'DELETE'}); toast('Eliminada'); vistaPredica(); }catch(e){ toast(e.message);} }); }
function formRecPredica(){ const z=$('prd-recform'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:10px">
    <input id="prr-titulo" placeholder="Título (ej. Romanos 8, Link del sermón…)"/>
    <div class="row" style="gap:8px;margin-top:10px">
      <select id="prr-tipo" onchange="_prrTipo(this.value)" style="max-width:140px"><option value="link">🔗 Link</option><option value="libro">📚 Libro</option><option value="archivo">📎 Archivo</option></select>
      <input id="prr-url" placeholder="Link o referencia" style="flex:1"/></div>
    <div id="prr-file-zona" style="margin-top:10px;display:none"><input id="prr-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"/></div>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarRecPredica()">Agregar</button></div>`;
}
function _prrTipo(v){ const f=v==='archivo'; if($('prr-file-zona'))$('prr-file-zona').style.display=f?'':'none'; if($('prr-url'))$('prr-url').style.display=f?'none':''; }
async function guardarRecPredica(){
  const titulo=$('prr-titulo').value.trim(); if(!titulo) return toast('Pon un título');
  const tipo=$('prr-tipo').value;
  try{
    let url='';
    if(tipo==='archivo'){ const f=$('prr-file').files[0]; if(!f) return toast('Elige un archivo'); toast('Subiendo…'); url=await uploadArchivo(f); }
    else { url=$('prr-url').value.trim(); }
    await api('/predica/'+window._predActual+'/recurso',{method:'POST',body:JSON.stringify({tipo,titulo,url})});
    toast('Recurso agregado'); verPredica(window._predActual);
  }catch(e){ toast(e.message); }
}
function borrarRecPredica(rid){ modalConfirm('¿Eliminar este recurso?', async()=>{ try{ await api('/predica/recurso/'+rid,{method:'DELETE'}); verPredica(window._predActual); }catch(e){ toast(e.message);} }); }
// --- Gestión del rol Predicador (solo el pastor) ---
async function cargarPredicadores(){
  const cont=$('pr-pred'); if(!cont) return;
  let list=[]; try{ list=await api('/predica/predicadores'); }catch{}
  const personas=window._personasCache||(window._personasCache=await api('/personas').catch(()=>[]));
  cont.innerHTML=`<div class="card" style="margin-bottom:16px"><div class="widget-head">🎤 Predicadores (rol con vigencia)</div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin:10px 0">
      <select id="prp-persona" style="max-width:200px">${personas.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')}</select>
      <input id="prp-desde" type="date" title="Desde" style="max-width:160px"/>
      <input id="prp-hasta" type="date" title="Hasta" style="max-width:160px"/>
      <button class="btn small-btn" onclick="asignarPredicador()">Asignar</button></div>
    ${list.length?'<div class="list">'+list.map(x=>`<div class="item-card flex"><div style="flex:1"><b>${x.nombre}</b> ${x.vigente?'<span class="estado-chip estado-aceptado">Vigente</span>':'<span class="estado-chip">Inactivo</span>'}<div class="muted small">${fechaTxt(x.desde)} → ${fechaTxt(x.hasta)}</div></div><button class="link" style="color:var(--red)" onclick="quitarPredicador(${x.id})">Quitar</button></div>`).join('')+'</div>':'<p class="muted small">Nadie con rol predicador todavía.</p>'}
  </div>`;
}
async function asignarPredicador(){
  const body={persona_id:$('prp-persona').value,desde:$('prp-desde').value,hasta:$('prp-hasta').value};
  if(!body.desde||!body.hasta) return toast('Indica desde y hasta qué fecha');
  try{ await api('/predica/predicadores',{method:'POST',body:JSON.stringify(body)}); toast('🎤 Predicador asignado'); cargarPredicadores(); }catch(e){ toast(e.message); }
}
function quitarPredicador(id){ modalConfirm('¿Quitar este rol de predicador?', async()=>{ try{ await api('/predica/predicadores/'+id,{method:'DELETE'}); cargarPredicadores(); }catch(e){ toast(e.message);} }); }

// ============================================================
//  PANEL DEL OBISPO — visión de todas las iglesias (solo lectura)
// ============================================================
async function vistaPanelObispo(){
  const c=$('content'); c.innerHTML='<div id="ob" class="muted">Cargando…</div>';
  let list; try{ list=await api('/obispo/resumen'); }catch(e){ $('ob').innerHTML='<p class="error">'+e.message+'</p>'; return; }
  window._obIglesias=list;
  $('ob').className='';
  $('ob').innerHTML=`<div class="hero"><h2>👑 Panel del Obispo</h2><p>Visión de todas las iglesias (${list.length}) · 👁️ solo lectura</p></div>
    <div class="grid" style="margin-top:18px">${list.map(i=>`
      <div class="module-card" style="text-align:left;align-items:stretch" onclick="verIglesiaObispo(${i.id})">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="label" style="font-size:16px">⛪ ${i.nombre}</div><span class="estado-chip">${i.codigo_unico}</span></div>
        <div class="muted small" style="margin:6px 0 10px">Pastor: ${i.pastor||'—'}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="estado-chip">👥 ${i.miembros}</span>
          <span class="estado-chip">📅 ${i.eventos}</span>
          <span class="estado-chip">📊 asist. ${i.asistenciaPromedio}</span>
          <span class="estado-chip">💰 ${money(i.saldo)}</span>
        </div></div>`).join('')}</div>`;
}
let _obMes=null;
async function verIglesiaObispo(id, mes){
  if(mes!==undefined) _obMes=mes;
  $('content').innerHTML='<button class="link" onclick="vistaPanelObispo()">‹ Todas las iglesias</button><div id="obd" class="muted">Cargando…</div>';
  let d; try{ d=await api('/obispo/iglesia/'+id+(_obMes?('?mes='+_obMes):'')); }catch(e){ $('obd').innerHTML='<p class="error">'+e.message+'</p>'; return; }
  _obMes=d.mes;
  const igs=window._obIglesias||[];
  const selIglesia=`<select onchange="verIglesiaObispo(Number(this.value))" style="max-width:220px">${igs.map(i=>`<option value="${i.id}" ${i.id===id?'selected':''}>${i.nombre}</option>`).join('')}</select>`;
  const card=(titulo,inner)=>`<div class="card" style="margin-bottom:16px"><div class="widget-head">${titulo}</div>${inner}</div>`;
  const lista=(arr,fn,vacio)=>arr.length?'<div class="list" style="margin-top:6px">'+arr.map(fn).join('')+'</div>':`<p class="muted small">${vacio}</p>`;
  $('obd').className='';
  $('obd').innerHTML=`
    <div class="hero"><h2>⛪ ${d.iglesia.nombre}</h2><p>${d.iglesia.codigo_unico} · Pastor: ${d.pastor} · 👁️ informe mensual (solo lectura)</p></div>
    <div class="head-row" style="margin:16px 0;gap:10px;flex-wrap:wrap;align-items:center">
      <span class="muted small">Iglesia:</span> ${selIglesia}
      <span class="muted small" style="margin-left:8px">Mes:</span>
      <input type="month" value="${d.mes}" onchange="verIglesiaObispo(${id}, this.value)" style="max-width:170px"/>
    </div>
    <div class="widgets" style="margin-bottom:18px">
      <div class="widget"><div class="widget-head">👥 Miembros</div><div class="stat-num">${d.miembros}</div></div>
      <div class="widget" style="cursor:pointer" onclick="obAsistencia(${id})"><div class="widget-head">✅ Asistencia prom. (mes)</div><div class="stat-num">${d.asistencia.promedio}</div><div class="small" style="color:var(--primary)">${d.asistencia.reuniones} reunión(es) · ver detalle ›</div></div>
      <div class="widget" style="cursor:pointer" onclick="obTesoreria(${id})"><div class="widget-head">💰 Balance del mes</div><div class="stat-num" style="color:${d.tesoreria.balanceMes>=0?'var(--green)':'var(--red)'}">${money(d.tesoreria.balanceMes)}</div><div class="small" style="color:var(--primary)">Saldo total ${money(d.tesoreria.saldoTotal)} · ver movimientos ›</div></div>
    </div>
    ${card('💰 Tesorería del mes', `<div class="muted small">↑ Ingresos <b style="color:var(--green)">${money(d.tesoreria.ingresosMes)}</b> · ↓ Gastos <b style="color:var(--red)">${money(d.tesoreria.gastosMes)}</b> · Balance <b>${money(d.tesoreria.balanceMes)}</b></div><button class="btn ghost small-btn" style="margin-top:10px" onclick="obTesoreria(${id})">Ver movimientos ›</button>`)}
    ${card('📅 Eventos del mes', lista(d.eventosMes, e=>`<div class="item-card flex">${chipFecha(e.fecha)}<div style="flex:1"><div class="item-titulo">${escHtml(e.titulo)}</div><div class="muted small">${e.grupo||''} · ${e.estado}</div></div><span class="estado-chip">✅ ${e.asistencia}</span></div>`, 'Sin eventos este mes.'))}
    ${card('📖 Prédicas del mes', lista(d.predicasMes, p=>`<div class="item-card flex" style="cursor:pointer" onclick="obPredica(${p.id})">${chipFecha(p.fecha||'')}<div style="flex:1"><b>${escHtml(p.titulo)}</b><div class="muted small">${p.predicador||''}</div></div><span class="muted" style="font-size:18px">›</span></div>`, 'Sin prédicas este mes.'))}
    <div class="widgets" style="margin-bottom:16px">
      <div class="widget"><div class="widget-head">📢 Anuncios (mes)</div><div class="stat-num">${d.anunciosMes}</div></div>
      <div class="widget"><div class="widget-head">❤️ Casos de cuidado abiertos</div><div class="stat-num">${d.cuidado.casosAbiertos}</div></div>
      <div class="widget"><div class="widget-head">👶 Niños / clases</div><div class="stat-num">${d.ninos.ninos}</div><div class="muted small">${d.ninos.clases} clase(s)</div></div>
    </div>
    ${card('🧩 Grupos', lista(d.grupos, g=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(g.nombre)}</b></div><span class="estado-chip">👥 ${g.miembros}</span></div>`, 'Sin grupos.'))}
    ${card('⭐ Líderes', lista(d.lideres, l=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(l.nombre)}</b><div class="muted small">${cap((l.rol||'').replace('_',' '))} · ${l.grupo}</div></div></div>`, 'Sin líderes.'))}`;
}
// --- Modal genérico de detalle (drill-down del obispo) ---
function modalDetalle(titulo, html){
  let ov=$('det-ov'); if(!ov){ ov=document.createElement('div'); ov.id='det-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" onclick="event.stopPropagation()" style="max-width:600px">
    <div class="hmodal-head"><b style="flex:1;font-size:16px">${titulo}</b><button class="cal-navbtn" onclick="cerrarDetalle()">✕</button></div>
    <div style="padding:18px;overflow:auto">${html}</div></div>`;
  ov.onclick=cerrarDetalle;
}
function cerrarDetalle(){ const o=$('det-ov'); if(o) o.remove(); }
const _qmes=()=>_obMes?('?mes='+_obMes):'';
async function obTesoreria(id){
  try{ const m=await api('/obispo/iglesia/'+id+'/tesoreria'+_qmes());
    const ing=m.filter(x=>x.tipo==='ingreso').reduce((a,b)=>a+b.monto,0), gas=m.filter(x=>x.tipo==='gasto').reduce((a,b)=>a+b.monto,0);
    modalDetalle('💰 Movimientos · '+_obMes, m.length
      ? `<div class="muted small" style="margin-bottom:10px">↑ ${money(ing)} · ↓ ${money(gas)} · balance ${money(ing-gas)}</div><div class="list">`+m.map(x=>`<div class="item-card flex"><div style="flex:1"><b>${x.tipo==='ingreso'?'↑':'↓'} ${cap(x.categoria||x.tipo)}</b><div class="muted small">${x.descripcion||''} · ${x.fecha}${x.comprobante_url?` · 📎 <a href="${x.comprobante_url}" target="_blank">comprobante</a>`:''}</div></div><b style="color:${x.tipo==='ingreso'?'var(--green)':'var(--red)'}">${x.tipo==='ingreso'?'+':'−'}${money(x.monto)}</b></div>`).join('')+'</div>'
      : '<p class="muted small">Sin movimientos este mes.</p>');
  }catch(e){ toast(e.message); }
}
async function obAsistencia(id){
  try{ const evs=await api('/obispo/iglesia/'+id+'/asistencia'+_qmes());
    modalDetalle('✅ Asistencia · '+_obMes, evs.length
      ? evs.map(e=>`<div style="margin-bottom:14px"><b>${escHtml(e.titulo)}</b> <span class="muted small">${fechaTxt(e.fecha)} · ${e.presentes.length} asist.</span>${e.presentes.length?'<div class="muted small" style="margin-top:4px">'+e.presentes.join(' · ')+'</div>':'<div class="muted small" style="margin-top:4px">Sin registro de asistencia.</div>'}</div>`).join('')
      : '<p class="muted small">Sin eventos este mes.</p>');
  }catch(e){ toast(e.message); }
}
async function obPredica(pid){
  try{ const p=await api('/obispo/predica/'+pid);
    const recs=(p.recursos||[]).map(r=>`<div class="item-card flex"><div style="flex:1"><b>${r.tipo==='archivo'?'📎':r.tipo==='libro'?'📚':'🔗'} ${r.titulo}</b></div>${r.url?`<a href="${r.url}" target="_blank" class="link">abrir</a>`:''}</div>`).join('');
    modalDetalle('📖 '+p.titulo, `<div class="muted small">${p.fecha?'📅 '+fechaTxt(p.fecha):''}${p.predicador?' · 🎤 '+p.predicador:''}</div>${p.notas?`<div style="margin-top:12px;white-space:pre-wrap;line-height:1.5">${p.notas}</div>`:'<p class="muted small" style="margin-top:8px">Sin notas.</p>'}${recs?'<h3 class="section-title" style="margin-top:14px">Recursos</h3><div class="list">'+recs+'</div>':''}`);
  }catch(e){ toast(e.message); }
}

// ============================================================
//  TOAST + MODAL (toques profesionales)
// ============================================================
function toast(msg){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  $('toast-wrap').appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); },2800);
}
function cerrarModal(){ const r=$('modal-root'); r.classList.remove('show'); r.innerHTML=''; }
// Botones de editar/borrar para las listas
function accionesBtns(editFn, delFn, id){
  return `<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
    <button class="link" onclick="${editFn}(${id})">✏️ Editar</button>
    <button class="link" style="color:var(--red)" onclick="${delFn}(${id})">🗑️ Borrar</button></div>`;
}
// Modal de confirmación genérico
function modalConfirm(msg, onYes){
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>Confirmar</h3>
    <p class="muted" style="margin:8px 0 16px">${msg}</p>
    <div class="row"><button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
    <button class="btn" id="cf-ok">Sí, continuar</button></div></div></div>`;
  root.classList.add('show');
  $('cf-ok').onclick=()=>{ cerrarModal(); onYes(); };
}
function modalReason(cb){
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal">
    <h3>¿Por qué no puedes?</h3>
    <p class="muted small" style="margin-bottom:12px">Ayuda al líder a reorganizar.</p>
    <div class="reason-grid">
      ${['Trabajo','Viaje','Salud','Familia'].map(r=>`<button class="reason" data-r="${r}">${r}</button>`).join('')}
    </div>
    <input id="reason-otro" placeholder="Otro motivo (opcional)" style="margin-top:12px" />
    <div class="row" style="margin-top:14px">
      <button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
      <button class="btn" id="reason-ok">Enviar</button>
    </div></div></div>`;
  root.classList.add('show');
  let sel=null;
  root.querySelectorAll('.reason').forEach(b=>b.onclick=()=>{
    root.querySelectorAll('.reason').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); sel=b.dataset.r;
  });
  $('reason-ok').onclick=()=>{
    const otro=$('reason-otro').value.trim();
    const motivo=otro||sel||'Sin especificar';
    cerrarModal(); cb(motivo);
  };
}

// ============================================================
//  AJUSTES — apariencia (tema, color de acento, tamaño de texto)
// ============================================================
const ACENTOS={
  pino:     {nombre:'Pino',     p:'#0F5C57',p7:'#0B4745',p6:'#0E5450',turq:'#C19E55'},
  azul:     {nombre:'Azul',     p:'#2563EB',p7:'#1D4ED8',p6:'#1E54D9',turq:'#0EA5E9'},
  esmeralda:{nombre:'Esmeralda',p:'#059669',p7:'#047857',p6:'#059669',turq:'#10B981'},
  violeta:  {nombre:'Violeta',  p:'#7C3AED',p7:'#6D28D9',p6:'#7C3AED',turq:'#A855F7'},
  naranja:  {nombre:'Naranja',  p:'#EA580C',p7:'#C2410C',p6:'#EA580C',turq:'#F59E0B'},
  rosa:     {nombre:'Rosa',     p:'#DB2777',p7:'#BE185D',p6:'#DB2777',turq:'#F472B6'},
  grafito:  {nombre:'Grafito',  p:'#334155',p7:'#1E293B',p6:'#334155',turq:'#64748B'},
};
function ajustes(){ try{ return JSON.parse(localStorage.getItem('ajustes')||'{}'); }catch{ return {}; } }
function aplicarAjustes(){
  const a=ajustes(), root=document.documentElement;
  const ac=ACENTOS[a.acento]||ACENTOS.pino;
  root.style.setProperty('--primary',ac.p);
  root.style.setProperty('--primary-700',ac.p7);
  root.style.setProperty('--primary-600',ac.p6);
  root.style.setProperty('--turq',ac.turq);
  root.style.setProperty('--grad','linear-gradient(135deg,'+ac.p+' 0%,'+ac.turq+' 100%)');
  root.style.fontSize=({sm:'15px',md:'16px',lg:'18px'}[a.texto]||'16px');
  const dark = a.tema==='dark' || (a.tema==='auto' && window.matchMedia && matchMedia('(prefers-color-scheme:dark)').matches);
  root.setAttribute('data-theme', dark?'dark':'light');
}
function setAjuste(k,v){ const a=ajustes(); a[k]=v; localStorage.setItem('ajustes',JSON.stringify(a)); aplicarAjustes(); vistaAjustes(); }
function vistaAjustes(){
  const a=ajustes(), acSel=a.acento||'pino', temaSel=a.tema||'light', txtSel=a.texto||'md';
  const opt=(g,val,act,label)=>`<button class="ajuste-opt ${val===act?'sel':''}" onclick="setAjuste('${g}','${val}')">${label}</button>`;
  $('content').innerHTML=`
    <div class="card" style="max-width:560px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">🎨 Ajustes de apariencia</h2>
      <p class="muted small" style="margin-bottom:18px">Personaliza cómo se ve la app. Se guarda en este dispositivo.</p>
      <div class="ajuste-grupo"><label style="margin:0">Color de acento</label>
        <div class="ajuste-opts">${Object.entries(ACENTOS).map(([k,v])=>`<div class="swatch ${k===acSel?'sel':''}" title="${v.nombre}" style="background:${v.p}" onclick="setAjuste('acento','${k}')"></div>`).join('')}</div></div>
      <div class="ajuste-grupo"><label style="margin:0">Tema</label>
        <div class="ajuste-opts">${opt('tema','light',temaSel,'☀️ Claro')}${opt('tema','dark',temaSel,'🌙 Oscuro')}${opt('tema','auto',temaSel,'🖥️ Automático')}</div></div>
      <div class="ajuste-grupo"><label style="margin:0">Tamaño del texto</label>
        <div class="ajuste-opts">${opt('texto','sm',txtSel,'A− Pequeño')}${opt('texto','md',txtSel,'A Normal')}${opt('texto','lg',txtSel,'A+ Grande')}</div></div>
      <button class="btn ghost small-btn" style="margin-top:8px" onclick="localStorage.removeItem('ajustes');aplicarAjustes();vistaAjustes();toast('Ajustes restablecidos')">Restablecer</button>
    </div>`;
}

// Al abrir
aplicarAjustes();
cargarApp();
