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
  ['mensajes','💬','Mensajes'],
  ['directorio','👤','Directorio'],
  ['mi_servicio','🙌','Mi Servicio'],
  ['mi_grupo','🧑‍🤝‍🧑','Mi Grupo'],
  ['servicio_gestion','🤝','Servicio'],
  ['asistencia','✅','Asistencia'],
  ['panel_pastor','📊','Panel del pastor'],
  ['reportes','📈','Reportes'],
  ['musicos','🎵','Grupo de Alabanza'],
  ['cuidado_pastoral','❤️','Cuidado pastoral'],
  ['mensajes_portal','📬','Mensajes del portal'],
  ['ninos','👶','Niños / Esc. Dominical'],
  ['tesoreria','💰','Tesorería'],
  ['organizacion','🗒️','Organización'],
  ['predica','📖','Prédica'],
  ['panel_obispo','👑','Panel del Obispo'],
  ['superadmin','🛡️','Super-admin'],
  ['ajustes','🎨','Ajustes'],
  ['admin','⚙️','Administración'],
];
// Los cinco temas del menu. Cada clave del NAV pertenece a EXACTAMENTE uno; hay
// una prueba que lo fija, porque una clave sin grupo desapareceria del menu
// agrupado sin dar ningun error.
//
// Dos asignaciones que no son obvias y son deliberadas:
//  - 'predica' va en "Dia a dia", no en "Ministerios": la ve TODO el mundo
//    (tieneModulo la deja pasar siempre), no es el ministerio de nadie.
//  - 'ajustes' va en "Lo mio", no en "Administracion": es el tema y el color de
//    quien mira, no administracion de la iglesia.
const GRUPOS_NAV = [
  { titulo: 'Día a día',      claves: ['inicio','calendario','anuncios','mensajes','directorio','predica'] },
  { titulo: 'Lo mío',         claves: ['mi_servicio','mi_grupo','ajustes'] },
  { titulo: 'Pastoreo',       claves: ['panel_pastor','cuidado_pastoral','mensajes_portal','asistencia','reportes','panel_obispo'] },
  { titulo: 'Ministerios',    claves: ['servicio_gestion','musicos','ninos','organizacion'] },
  { titulo: 'Administración', claves: ['tesoreria','admin','superadmin'] },
];

// A partir de cuantas entradas VISIBLES se agrupa. Es un numero elegido, no una
// verdad: los encabezados existen para resolver un problema de LARGO, asi que
// solo aparecen donde hay largo. Por debajo cuestan mas de lo que ahorran — a un
// feligres (9 entradas) le convertirian 9 lineas en 13.
const NAV_UMBRAL_GRUPOS = 12;

// Reparte las claves YA filtradas por tieneModulo(). Devuelve secciones:
// titulo === null significa "sin encabezado" (modo plano, como siempre).
// Funcion pura a proposito: buildNav toca el DOM y no se puede probar sin
// navegador; esto si.
function agruparNav(claves){
  // [...claves] y no `claves` a secas: devolver la MISMA referencia que se
  // recibio invita a que quien la use la ordene o la recorte y le cambie el
  // array a quien llamo, sin enterarse.
  if(claves.length < NAV_UMBRAL_GRUPOS) return [{titulo:null, claves:[...claves]}];
  return GRUPOS_NAV
    .map(g=>({titulo:g.titulo, claves:g.claves.filter(k=>claves.includes(k))}))
    .filter(g=>g.claves.length)    // un encabezado sin nada debajo es ruido
    // Y un encabezado con UNA sola cosa debajo tambien (decision del dueno,
    // 5-ago): titulo null = "sin encabezado", que buildNav ya sabe pintar.
    .map(g=>g.claves.length===1 ? {titulo:null, claves:g.claves} : g);
}
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
// Mensajes que entiende una persona, no un programador.
//
// Toda la app pide datos por aquí, y hay 114 sitios que hacen toast(e.message)
// o pintan e.message en rojo. Así que lo que salga de esta función es,
// literalmente, lo que lee la congregación cuando algo falla. Salían tres cosas
// que no se pueden leer:
//
//  - Sin señal, fetch rechaza con un TypeError cuyo mensaje es "Failed to
//    fetch". Una feligresa en el subterráneo del templo tocaba "✅ Acepto" y
//    leía eso, en inglés.
//  - El token dura 30 días. Al día 31 el backend responde 401 "Token invalido o
//    expirado", se pintaba en rojo en mitad de la pantalla y la app se quedaba
//    ahí: la única salida era saber buscar "Cerrar sesión" en el menú.
//  - Al pasarse del límite de peticiones, un 429 sin decir cuánto esperar.
const ERR_CONEXION = 'No hay conexión. Revisa tus datos o el wifi e inténtalo otra vez.';
const ERR_SESION   = 'Tu sesión se cerró por seguridad. Vuelve a entrar.';
let _avisandoSesion = false;
function _sesionCaducada(){
  // El 401 dice que esta sesión ya no es de nadie: se corta el push del
  // dispositivo sin esperar (la recarga de abajo no lo va a esperar) y sin
  // avisar al servidor (este token ya no autentica; la fila huérfana la poda
  // el 404/410 de enviarPush). Va ANTES de la salida temprana del arranque:
  // llegar con un token viejo guardado también es una sesión que terminó.
  pushCortarDispositivo({avisarServidor:false});
  localStorage.removeItem('token');
  const app=$('app');
  // Si la app todavía no está a la vista, estamos arrancando con un token viejo
  // y no hay nada que interrumpir: cargarApp() enseña el login por su cuenta.
  if(!app || app.classList.contains('hidden')) return;
  if(_avisandoSesion) return;   // varias peticiones a la vez → un solo aviso
  _avisandoSesion=true;
  try{ toast(ERR_SESION); }catch{}
  // Se recarga en vez de solo enseñar el login: media app quedaría pintada
  // detrás con los datos de la sesión anterior.
  setTimeout(()=>location.reload(), 1500);
}
async function api(path, opts={}){
  const teniaToken = !!token();
  // Doble toque = registro duplicado. Existía conBoton() para evitarlo, pero
  // solo lo usaban 9 de ~79 manejadores que escriben, y justo se quedaban fuera
  // los que usa la gente no técnica: guardar asistencia, crear una clase,
  // publicar un aviso, aceptar un servicio. En vez de envolverlos uno a uno
  // —79 sitios donde equivocarse, y el siguiente que alguien escriba volvería a
  // salir sin protección— se bloquea aquí, que es por donde pasan todos.
  //
  // botonActual() lee el `event` en curso, así que solo funciona mientras el
  // manejador va sin interrupciones. Los que suben un archivo primero (hay 6)
  // llegan aquí con el evento ya perdido: esos llevan su conBoton() explícito.
  const soltar = /^(POST|PATCH|PUT|DELETE)$/i.test(opts.method||'GET')
    ? _tomarBoton(botonActual()) : null;
  try{
    let r;
    try{
      r = await fetch(API+path, { ...opts,
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token(), ...(opts.headers||{}) }});
    }catch{ throw new Error(ERR_CONEXION); }
    const data = await r.json().catch(()=>({}));
    if(r.status===401 && teniaToken){ _sesionCaducada(); throw new Error(ERR_SESION); }
    if(r.status===429) throw new Error('Estás yendo muy rápido. Espera un momento y vuelve a intentarlo.');
    if(!r.ok) throw new Error(data.error||'No se pudo completar la acción. Inténtalo otra vez.');
    return data;
  } finally { if(soltar) soltar(); }
}
// Pone el https:// que el backend exige a un enlace pegado como lo copia la
// gente desde el navegador del teléfono ("www.youtube.com/watch?v=…").
// Dos cosas que NO hace, a propósito:
//  - Si ya trae esquema —incluido javascript:— lo deja tal cual y que decida el
//    backend. Anteponerle https:// convertiría un javascript: en una URL válida
//    y absurda, y de paso taparía el intento en vez de rechazarlo.
//  - Si no parece un enlace (sin punto, o con espacios) tampoco lo toca: así
//    "hola" no se convierte en "https://hola", que el backend aceptaría como
//    host válido. Mejor que llegue tal cual y el usuario vea el error claro.
function normalizarEnlace(v){
  const s=String(v||'').trim();
  if(!s) return '';
  if(/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(s)) return s;
  if(/\s/.test(s) || !s.includes('.')) return s;
  return 'https://'+s;
}
// Sube un archivo y devuelve su URL
async function uploadArchivo(file){
  const fd=new FormData(); fd.append('archivo',file);
  let r;
  // Subir por datos móviles es justo donde se corta la conexión, y aquí también
  // salía "Failed to fetch" (esta ruta no pasa por api()).
  try{ r=await fetch(API+'/upload',{method:'POST',headers:{Authorization:'Bearer '+token()},body:fd}); }
  catch{ throw new Error(ERR_CONEXION); }
  const d=await r.json().catch(()=>({}));
  if(r.status===401){ _sesionCaducada(); throw new Error(ERR_SESION); }
  if(!r.ok) throw new Error(d.error||'No se pudo subir el archivo');
  return d.url;
}
// Deshabilita el botón que disparó la acción mientras `fn` está en curso, para que
// un doble clic (o Enter repetido) durante el POST/PATCH no dispare una segunda petición.
// Uso: dentro de una función invocada por onclick="fn()" sin referencia al botón,
// llama conBoton(botonActual(), async()=>{ ... }) al inicio.
function botonActual(){
  try{ return (typeof event!=='undefined' && event && event.target && event.target.closest) ? event.target.closest('button') : (document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null); }
  catch{ return null; }
}
// Cuenta cuántas peticiones tiene en vuelo cada botón: dos peticiones seguidas
// del mismo manejador (subir el archivo y luego guardar) no pueden soltarlo a
// mitad de camino, que es justo cuando el segundo toque duplica el registro.
const _enVuelo=new WeakMap();
function _tomarBoton(btn, texto){
  if(!btn) return ()=>{};
  const n=(_enVuelo.get(btn)||0)+1;
  _enVuelo.set(btn,n);
  if(n===1){
    btn.disabled=true;
    if(texto){ btn.dataset.textoOriginal=btn.textContent; btn.textContent=texto; }
  }
  return ()=>{
    const m=(_enVuelo.get(btn)||1)-1;
    _enVuelo.set(btn,m);
    if(m<=0){
      btn.disabled=false;
      if(btn.dataset.textoOriginal!==undefined){ btn.textContent=btn.dataset.textoOriginal; delete btn.dataset.textoOriginal; }
    }
  };
}
async function conBoton(btn, fn, texto){
  if(btn && btn.disabled) return;
  const soltar=_tomarBoton(btn, texto);
  try{ return await fn(); }
  finally{ soltar(); }
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function parseFecha(f){ const p=String(f||'').split('-'); return (p.length===3)?{a:p[0],m:p[1],d:p[2]}:null; }
function chipFecha(f){ const x=parseFecha(f); if(!x) return `<div class="mini-date"><b>—</b><span></span></div>`; return `<div class="mini-date"><b>${x.d}</b><span>${MESES[(+x.m)-1]||''}</span></div>`; }
function fechaChip(f){ const x=parseFecha(f); if(!x) return `<div class="fecha-chip"><b>—</b><span></span></div>`; return `<div class="fecha-chip"><b>${x.d}</b><span>${MESES[(+x.m)-1]||''}</span></div>`; }
// conAnio: cuando el mismo mes-día puede repetirse en años distintos (p.ej.
// "5 ago" no distingue 2026 de 2027), pasa true para que se vea el año.
function fechaTxt(f, conAnio){ const x=parseFecha(f); if(!x) return String(f||'—'); return x.d+' '+(MESES[(+x.m)-1]||'')+(conAnio?' '+x.a:''); }
// Duración legible a partir de SEGUNDOS: "45 s", "16 min", "6 h 5 min", "3 d 2 h".
// Dos unidades y no una a propósito: para decidir si hay que actuar, 16 minutos
// y 6 horas de retraso son situaciones muy distintas, y redondear a una sola
// unidad las acerca ("1 h" tanto para 61 minutos como para 119).
function duracionTxt(seg){
  const s=Math.max(0,Math.floor(Number(seg)||0));
  if(s<60) return s+' s';
  if(s<3600) return Math.floor(s/60)+' min';
  if(s<86400){ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); return m?`${h} h ${m} min`:`${h} h`; }
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600); return h?`${d} d ${h} h`:`${d} d`;
}
// "hace 4 h" a partir de una fecha ISO. Un "28-07-2026 11:04" obliga a restar
// mentalmente para saber si eso es reciente; "hace 4 h" se entiende de un
// vistazo. Devuelve '' si la fecha no se entiende, para poder omitir el dato.
function haceTxt(iso){
  const t=Date.parse(iso);
  if(!Number.isFinite(t)) return '';
  const seg=(Date.now()-t)/1000;
  // Una fecha en el futuro (reloj desajustado o dato corrupto) no puede leerse
  // "hace -3 min", que parecería un error de la app en vez de del dato.
  if(seg<0) return 'con fecha futura';
  if(seg<45) return 'hace un momento';
  return 'hace '+duracionTxt(seg);
}
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
  // La iglesia se valida SOLO al avanzar a la pantalla de usuario (paso 2).
  // Antes usaba n>=2, así que al pasar de usuario a contraseña (paso 3) volvía
  // a exigirla y bloqueaba el login del super-admin, que va sin iglesia.
  if(n===2){ const ig=$('iglesia').value.trim(); if(!ig) return err('Escribe el nombre o código de tu iglesia'); $('ig-label').textContent='· '+ig; }
  if(n>=3 && !$('usuario').value.trim()) return err('Escribe tu usuario');
  err(''); showStep(n);
}
function err(m){ $('error').textContent=m; }
// Login del super-admin: NO tiene iglesia (en el lanzamiento real puede no
// existir ninguna todavía). Salta el paso de iglesia dejándola vacía; el
// backend lo reconoce por usuario + rol_global='super_admin'.
function loginAdmin(){
  $('iglesia').value='';
  $('ig-label').textContent='· administrador';
  err(''); showStep(2);
}
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
  try{
    ME=await api('/me');
    if(ME && ME.persona && ME.persona.debe_cambiar_pass) return mostrarCambioObligatorio();
    if(ME && ME.consentimiento_pendiente) return mostrarConsentimiento();
    abrirApp();
  }
  catch{ localStorage.removeItem('token'); mostrarLogin(); }
}
function mostrarLogin(){
  const fp=$('forzar-pass'); if(fp) fp.classList.add('hidden');
  $('app').classList.add('hidden'); $('login').classList.remove('hidden'); showStep(1);
}
// Cerrar sesion corta el push de este dispositivo (spec 2026-08-04): sin esto,
// en un dispositivo compartido las notificaciones del que se fue —cuidado
// pastoral incluido— siguen llegando a la vista del siguiente. 2 s de tope:
// cortar es cortesia, cerrar sesion es la orden.
async function salir(){
  try{
    await Promise.race([
      pushCortarDispositivo({avisarServidor:true}),
      new Promise(r=>setTimeout(r,2000))
    ]);
  }finally{
    localStorage.removeItem('token'); location.reload();
  }
}

// ============================================================
//  REGISTRO ("Primera vez") — un feligrés se une con el código de su iglesia
// ============================================================
function abrirRegistro(){
  let ov=$('reg-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='reg-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" style="max-width:420px" onclick="event.stopPropagation()">
    <div class="hmodal-head"><b style="flex:1;font-size:16px">🙌 Únete a tu iglesia</b>
      <button class="cal-navbtn" onclick="cerrarRegistro()" aria-label="Cerrar">✕</button></div>
    <div style="padding:16px">
      <p class="muted small" style="margin:0 0 12px">Pide el <b>código de tu iglesia</b> a tu pastor o líder, y crea tu cuenta.</p>
      <label for="reg-codigo">Código de tu iglesia</label>
      <input id="reg-codigo" placeholder="Ej. MONTESION" autocapitalize="characters" onkeydown="if(event.key==='Enter')confirmarRegistro()" />
      <label for="reg-nombre" style="margin-top:8px">Tu nombre completo</label>
      <input id="reg-nombre" placeholder="Nombre y apellido" onkeydown="if(event.key==='Enter')confirmarRegistro()" />
      <label for="reg-usuario" style="margin-top:8px">Elige un usuario</label>
      <input id="reg-usuario" placeholder="Usuario (para entrar)" onkeydown="if(event.key==='Enter')confirmarRegistro()" />
      <label style="margin-top:8px">Elige una contraseña</label>
      <div class="row" style="gap:8px">
        <input id="reg-pass" type="password" placeholder="Contraseña" onkeydown="if(event.key==='Enter')confirmarRegistro()" />
        <button class="btn ghost small-btn" type="button" style="max-width:52px" onclick="toggleVerPass('reg-pass',this)" title="Ver/ocultar">👁️</button>
      </div>
      <label for="reg-email" style="margin-top:8px">Correo <span class="muted">(opcional)</span></label>
      <input id="reg-email" type="email" placeholder="tucorreo@ejemplo.com" onkeydown="if(event.key==='Enter')confirmarRegistro()" />
      <label for="reg-telefono" style="margin-top:8px">Teléfono <span class="muted">(opcional)</span></label>
      <input id="reg-telefono" placeholder="+56 9 ..." onkeydown="if(event.key==='Enter')confirmarRegistro()" />
      <label class="check" style="margin-top:12px;align-items:flex-start"><input type="checkbox" id="reg-acepto" style="margin-top:3px"/>
        <span>He leído y acepto los <a href="/legal/terminos.html" target="_blank" rel="noopener">Términos</a> y la <a href="/legal/privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
      <button class="btn" style="width:100%;margin-top:14px" onclick="confirmarRegistro()">Crear mi cuenta</button>
      <p id="reg-msg" class="error" style="margin-top:10px"></p>
    </div></div>`;
  ov.onclick=cerrarRegistro;
  setTimeout(()=>{ const i=$('reg-codigo'); if(i) i.focus(); },50);
}
function cerrarRegistro(){ const ov=$('reg-ov'); if(ov) ov.remove(); }
async function confirmarRegistro(){
  const m=$('reg-msg'); m.className='error'; m.textContent='';
  const codigo=$('reg-codigo').value.trim();
  const nombre=$('reg-nombre').value.trim();
  const usuario=$('reg-usuario').value.trim();
  const password=$('reg-pass').value;
  const email=$('reg-email').value.trim();
  const telefono=$('reg-telefono').value.trim();
  if(!codigo){ m.textContent='Escribe el código de tu iglesia (te lo entrega tu iglesia)'; return; }
  if(!nombre){ m.textContent='Escribe tu nombre'; return; }
  if(!usuario){ m.textContent='Elige un usuario'; return; }
  if(password.length<8){ m.textContent='La contraseña debe tener al menos 8 caracteres'; return; }
  if(!$('reg-acepto').checked){ m.textContent='Debes aceptar los Términos y la Política de Privacidad'; return; }
  const body={codigo,nombre,usuario,password,acepto:true};
  if(email) body.email=email;
  if(telefono) body.telefono=telefono;
  await conBoton(botonActual(), async()=>{
    try{
      const r=await fetch(API+'/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||'No se pudo crear la cuenta. Revisa el código de tu iglesia.');
      localStorage.setItem('token',data.token);
      cerrarRegistro();
      cargarApp();
    }catch(e){ m.textContent=(e&&e.message)||'No se pudo conectar con el servidor'; }
  });
}

// ============================================================
//  CAMBIO DE CONTRASEÑA OBLIGATORIO (pantalla bloqueante)
// ============================================================
function mostrarCambioObligatorio(){
  $('login').classList.add('hidden'); $('app').classList.add('hidden');
  const fp=$('forzar-pass'); if(!fp) return abrirApp();
  fp.classList.remove('hidden');
  const err=$('fp-error'); if(err) err.textContent='';
  ['fp-actual','fp-nueva','fp-confirmar'].forEach(id=>{ const i=$(id); if(i) i.value=''; });
  setTimeout(()=>{ const i=$('fp-actual'); if(i) i.focus(); },60);
}
async function confirmarCambioObligatorio(){
  const err=$('fp-error'); err.textContent='';
  const actual=$('fp-actual').value, nueva=$('fp-nueva').value, confirmar=$('fp-confirmar').value;
  if(!actual){ err.textContent='Escribe tu contraseña actual (la temporal)'; return; }
  if(nueva.length<8){ err.textContent='La nueva contraseña debe tener al menos 8 caracteres'; return; }
  if(nueva!==confirmar){ err.textContent='Las contraseñas no coinciden'; return; }
  try{
    await api('/cuenta/password',{method:'PATCH',body:JSON.stringify({actual,nueva})});
    if(ME && ME.persona) ME.persona.debe_cambiar_pass=0;
    $('forzar-pass').classList.add('hidden');
    toast('🔒 Contraseña actualizada');
    if(ME && ME.consentimiento_pendiente) return mostrarConsentimiento();
    abrirApp();
  }catch(e){ err.textContent=(e&&e.message)||'No se pudo cambiar la contraseña'; }
}

// ============================================================
//  CONSENTIMIENTO LEGAL (pantalla bloqueante)
// ============================================================
function mostrarConsentimiento(){
  $('login').classList.add('hidden'); $('app').classList.add('hidden');
  let ov=$('cons-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='cons-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" style="max-width:460px" onclick="event.stopPropagation()">
    <div class="hmodal-head"><b style="flex:1;font-size:16px">📜 Antes de continuar</b></div>
    <div style="padding:16px">
      <p class="muted small" style="margin:0 0 12px">Para usar la app necesitamos tu consentimiento para tratar tus datos según nuestros documentos legales.</p>
      <label class="check" style="align-items:flex-start"><input type="checkbox" id="cons-chk" style="margin-top:3px"/>
        <span>He leído y acepto los <a href="/legal/terminos.html" target="_blank" rel="noopener">Términos</a> y la <a href="/legal/privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
      <button class="btn" style="width:100%;margin-top:14px" onclick="aceptarConsentimiento()">Acepto y continúo</button>
      <button class="btn ghost small-btn" style="width:100%;margin-top:8px" onclick="salir()">Cerrar sesión</button>
      <p id="cons-msg" class="error" style="margin-top:10px"></p>
    </div></div>`;
  ov.onclick=null; // no se cierra tocando fuera
}
async function aceptarConsentimiento(){
  const m=$('cons-msg'); if(m) m.textContent='';
  if(!$('cons-chk').checked){ if(m) m.textContent='Marca la casilla para continuar'; return; }
  try{
    await api('/consentimiento/aceptar',{method:'POST'});
    if(ME) ME.consentimiento_pendiente=false;
    const ov=$('cons-ov'); if(ov) ov.remove();
    abrirApp();
  }catch(e){ if(m) m.textContent=(e&&e.message)||'No se pudo registrar tu aceptación'; }
}

function puedePublicar(){
  return ME.persona.es_pastor || ME.roles.pertenencias.some(p=>['admin','lider_musica','lider_ed'].includes(p.rol));
}
// ¿Soy el ENCARGADO (líder) de este grupo? (el pastor NO lo es: solo observa)
function esEncargadoDe(grupoId){
  return ME.roles.pertenencias.some(p=>p.grupo_id===grupoId && ['admin','lider_musica','lider_ed'].includes(p.rol));
}
function tieneModulo(k){
  if(k==='superadmin') return !!(ME.persona && ME.persona.rol_global==='super_admin');
  // Super-admin = rol administrativo (crear/editar/borrar iglesias). No ve el
  // Panel del Obispo ni los módulos de miembro; solo su panel + inicio + ajustes.
  if(ME.persona && ME.persona.rol_global==='super_admin') return k==='inicio'||k==='ajustes';
  if(k==='inicio') return true;
  // Biblia/Devocional y Notas del sermón: disponibles para toda la iglesia (Fase 4)
  if(k==='predica'||k==='ajustes'||k==='mensajes'||k==='directorio') return true;
  const mods = ME.modulos||[];
  if(k==='calendario') return mods.includes('calendario')||mods.includes('calendario_completo');
  if(k==='organizacion') return puedePublicar();   // solo líderes/pastor (igual que el gate del backend)
  return mods.includes(k);
}

// ============================================================
//  APP SHELL
// ============================================================
// Nombre + iniciales del pie de la barra lateral. Vive aparte de abrirApp()
// porque ya no basta con pintarlo al entrar: ahora el nombre se puede corregir
// desde "Mi perfil", y sin repintar aqui la persona ve el toast verde y abajo
// a la izquierda sigue el nombre viejo — parece que no se guardo.
function pintarUsuarioLateral(){
  const nom = ME.persona.nombre || '';
  $('avatar').textContent = nom.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  $('u-nombre').textContent = nom;
}
function abrirApp(){
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  const fp=$('forzar-pass'); if(fp) fp.classList.add('hidden');
  // usuario en el sidebar
  pintarUsuarioLateral();
  $('u-rol').textContent = ME.persona.rol_global==='obispo' ? 'Obispo'
    : ME.persona.rol_global==='super_admin' ? 'Super-admin'
    : ME.persona.es_pastor ? 'Pastor'
    // rolLabel() y no cap(rol.replace('_',' ')): esto sale bajo el nombre de la
    // persona en TODAS las pantallas, y la maestra de Escuela Dominical leía
    // "Lider ed", el líder de música "Lider musica" y el de jóvenes "Admin" —
    // los nombres de la base de datos. La traducción ya estaba escrita.
    : (ME.roles.pertenencias.map(p=>rolLabel(p.rol)).join(', ') || 'Feligrés');
  buildNav();
  vigilarAnchoDelMenu();
  // (La campana la actualiza el dashboard con su propia carga; evitamos pedir /notificaciones dos veces.)
  pushAutoResuscribir();   // mantiene el push activo entre sesiones (si ya dio permiso)
  Chat.refrescarBadge();  // badge de mensajes sin leer, visible aunque no se abra la vista
  navTo(ME.persona.rol_global==='super_admin' ? 'superadmin' : 'inicio');
}
function setCampana(n){
  const b=$('bell-count'); if(!b) return;
  if(n>0){ b.textContent=n; b.classList.remove('hidden'); } else b.classList.add('hidden');
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
  superadmin:_ic('<path d="M12 2 3 6v6c0 5 3.8 8.4 9 10 5.2-1.6 9-5 9-10V6z"/><path d="M9.5 12l2 2 3.5-3.5"/>'),
  ajustes:_ic('<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>'),
  admin:_ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>'),
  mensajes:_ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  directorio:_ic('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c.6-2.1 2.1-3 4-3s3.4.9 4 3"/><path d="M4 8h1M4 12h1M4 16h1"/>'),
  organizacion:_ic('<rect x="8" y="4" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M8 12h8M8 16h5"/>'),
};
// ============================================================
//  EMOJIS → ÍCONOS DE LÍNEA (mismo estilo del menú lateral)
//  Un mapa emoji→SVG + un MutationObserver que reemplaza cualquier
//  emoji que aparezca en pantalla (contenido, toasts, notificaciones…).
// ============================================================
const EMOJI_ICON={
  '✅':_ic('<polyline points="20 6 9 17 4 12"/>'),
  '☑':_ic('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  '❌':_ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  '📎':_ic('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
  '🎵':NAV_ICON.musicos, '🎸':NAV_ICON.musicos,
  '📅':NAV_ICON.calendario, '🗓':NAV_ICON.calendario,
  '📢':NAV_ICON.anuncios, '📣':NAV_ICON.anuncios,
  '💰':NAV_ICON.tesoreria,
  '🎤':_ic('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
  '🗑':_ic('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  '👁':_ic('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  '🙈':_ic('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
  '📖':NAV_ICON.predica, '📚':NAV_ICON.predica,
  '🔔':_ic('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  '👥':NAV_ICON.mi_grupo, '🧑‍🤝‍🧑':NAV_ICON.mi_grupo, '🤝':NAV_ICON.mi_grupo,
  '🧑':_ic('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  '👤':_ic('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  '👦':NAV_ICON.ninos, '👶':NAV_ICON.ninos,
  '🔗':_ic('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  '📋':NAV_ICON.mi_servicio,
  '🔴':_ic('<circle cx="12" cy="12" r="8"/>'), '🟡':_ic('<circle cx="12" cy="12" r="8"/>'),
  '✏':_ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  '📝':_ic('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
  '🙌':_ic('<path d="M7 11V6a2 2 0 0 1 4 0"/><path d="M11 11V4a2 2 0 0 1 4 0v7"/><path d="M15 11V7a2 2 0 0 1 4 0v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3"/>'),
  '🙏':_ic('<path d="M12 3v8"/><path d="M12 11c-1-2-3-3-5-3 0 3 2 5 5 5"/><path d="M12 11c1-2 3-3 5-3 0 3-2 5-5 5"/><path d="M7 21l5-6 5 6"/>'),
  '⏳':_ic('<path d="M6 2h12M6 22h12"/><path d="M6 2c0 5 4 6 6 10 2-4 6-5 6-10"/><path d="M6 22c0-5 4-6 6-10 2 4 6 5 6 10"/>'),
  '⏰':_ic('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6M22 6l-3-3"/>'),
  '🕐':_ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  '🕊':_ic('<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>'),
  '❤':NAV_ICON.cuidado_pastoral,
  '📍':_ic('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  '🏷':_ic('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
  '❔':_ic('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  '💬':_ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  '🔑':_ic('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2m-4 0 4 4-4 3"/>'),
  '🏠':NAV_ICON.inicio,
  '📊':NAV_ICON.panel_pastor,
  '📈':_ic('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
  '📉':_ic('<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'),
  '👋':_ic('<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  '⚠':_ic('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  '🔎':_ic('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  '📞':_ic('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  '⛪':_ic('<path d="M12 2v6M9 5h6"/><path d="M5 22V11l7-4 7 4v11"/><path d="M9 22v-5a3 3 0 0 1 6 0v5"/>'),
  '👑':NAV_ICON.panel_obispo,
  '🎨':_ic('<circle cx="13.5" cy="6.5" r=".8"/><circle cx="17.5" cy="10.5" r=".8"/><circle cx="8.5" cy="7.5" r=".8"/><circle cx="6.5" cy="12.5" r=".8"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C22 6 17.5 2 12 2z"/>'),
  '🧹':_ic('<path d="M3 21l6-6"/><path d="M14 4l6 6-5 5-6-6z"/><path d="M9 15l-3 6h6"/>'),
  '📩':_ic('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  '📬':_ic('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  '📨':_ic('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  '✉':_ic('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  '🎉':_ic('<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01"/><path d="M22 2 19.76 2.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L12 14l4 4 5.5-5.5"/>'),
  '📥':_ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  '🤒':_ic('<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>'),
  '🌱':_ic('<path d="M7 20h10M12 20V9"/><path d="M12 9C12 6 10 4 7 4c0 3 2 5 5 5z"/><path d="M12 11c0-2 2-4 5-4 0 2-2 4-5 4z"/>'),
  '🆘':_ic('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="9.17" y1="14.83" x2="4.93" y2="19.07"/>'),
  '📁':_ic('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  '📦':_ic('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22" x2="12" y2="12"/>'),
  '🔒':_ic('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  '🔓':_ic('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
  '⚙':NAV_ICON.ajustes,
  '🎯':_ic('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  '🆕':_ic('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  '🔄':_ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
  '↗':_ic('<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>'),
  '🧩':_ic('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  '⭐':_ic('<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>'),
  '☀':_ic('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>'),
  '🌙':_ic('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  '🖥':_ic('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
  '📌':_ic('<line x1="12" y1="17" x2="12" y2="22"/><path d="M9 2h6l-1 7 3 3v2H7v-2l3-3z"/>'),
  '🛡':NAV_ICON.superadmin,
  '🎂':_ic('<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s1-1 2.5-1 2.5 2 4 2 2.5-2 4-2 2.5 1 2.5 1"/><line x1="2" y1="21" x2="22" y2="21"/><path d="M7 8v2M12 8v2M17 8v2"/><path d="M7 4h.01M12 4h.01M17 4h.01"/>'),
  '⛔':_ic('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'),
  '🌐':_ic('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  '🖨':_ic('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
};
const _EMOJI_RE=/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
function _iconForGrapheme(g){
  const k=g.replace(/\uFE0F/g,'');
  if(EMOJI_ICON[k]) return EMOJI_ICON[k];
  const first=[...k][0];
  return EMOJI_ICON[first]||null;
}
function _iconizeTextNode(node){
  const txt=node.nodeValue; if(!txt) return;
  _EMOJI_RE.lastIndex=0; if(!_EMOJI_RE.test(txt)) return;
  _EMOJI_RE.lastIndex=0;
  const frag=document.createDocumentFragment(); let last=0,m,changed=false;
  while((m=_EMOJI_RE.exec(txt))){
    const svg=_iconForGrapheme(m[0]); if(!svg) continue;
    if(m.index>last) frag.appendChild(document.createTextNode(txt.slice(last,m.index)));
    const span=document.createElement('span'); span.className='emi'; span.innerHTML=svg;
    frag.appendChild(span); last=m.index+m[0].length; changed=true;
  }
  if(!changed) return;
  if(last<txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
  if(node.parentNode) node.parentNode.replaceChild(frag,node);
}
function iconizar(root){
  if(!root) return;
  if(root.nodeType===3){ _iconizeTextNode(root); return; }
  if(root.nodeType!==1) return;
  if(root.classList&&root.classList.contains('emi')) return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:(n)=>
    (n.parentNode&&n.parentNode.classList&&n.parentNode.classList.contains('emi'))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[]; let n; while(n=w.nextNode()) nodes.push(n);
  nodes.forEach(_iconizeTextNode);
}
function iniciarIconos(){
  try{ iconizar(document.body); }catch{}
  if(window._emojiObs) return;
  window._emojiObs=new MutationObserver((muts)=>{
    for(const mu of muts){
      if(mu.addedNodes) mu.addedNodes.forEach(node=>{ try{ iconizar(node); }catch{} });
      if(mu.type==='characterData') { try{ _iconizeTextNode(mu.target); }catch{} }
    }
  });
  window._emojiObs.observe(document.body,{childList:true,subtree:true,characterData:true});
}

// El ancho por debajo del cual el menu se agrupa por temas y se pliega.
//
// ⚠️ TIENE que ser el mismo numero que el `@media` de web/styles.css. Si se
// separan, el JS pinta una forma del menu mientras el CSS aplica los estilos de
// la otra, y no salta ningun error: el menu simplemente aparece roto, y solo en
// los anchos que queden entre los dos numeros. No hay manera de compartir un
// valor entre JS y CSS en este proyecto, asi que lo vigila una prueba
// (backend/test/menu-plegable.test.js).
const NAV_MOVIL_MAX = 900;
function esMovil(){ return window.matchMedia(`(max-width:${NAV_MOVIL_MAX}px)`).matches; }

// Girar el telefono o cambiar el tamano de la ventana no puede dejar el menu con
// la forma del otro modo. El guardia evita registrar el oyente dos veces si se
// vuelve a entrar en la app sin recargar la pagina.
function vigilarAnchoDelMenu(){
  if(vigilarAnchoDelMenu._puesto) return;
  vigilarAnchoDelMenu._puesto=true;
  window.matchMedia(`(max-width:${NAV_MOVIL_MAX}px)`)
    .addEventListener('change', ()=>{ if($('nav')) buildNav(); });
}

// Pinta el menu lateral. Tiene DOS formas segun el ancho de pantalla.
//
// Escritorio: la lista plana en el orden del NAV, sin encabezados. Es la de
// siempre.
//
// Movil con el menu largo (>= NAV_UMBRAL_GRUPOS entradas): cada tema es un
// <button> encabezado seguido de un <div class="nav-grupo"> con sus entradas
// DENTRO. Con contenedores de verdad el orden del DOM vuelve a ser el orden
// visual, y por eso aqui ya no hay ningun `--ord`: el truco de `order` que
// sostenia el agrupamiento anterior se retiro entero.
//
// ⚠️ Historia que conviene no repetir: la primera version del menu agrupado
// pintaba en orden de grupo SIN mirar el ancho, y ocultaba los encabezados por
// CSS. Eso reordenaba tambien el escritorio (12 de las 19 entradas del pastor
// cambiaban de sitio), porque el CSS no puede deshacer un reordenamiento hecho
// en el DOM. De ahi que la decision de la forma se tome aqui, con esMovil().
function buildNav(){
  const nav=$('nav');
  // vigilarAnchoDelMenu() llama a buildNav() cada vez que se cruza el
  // breakpoint, y buildNav() borra todo el DOM del menu (nav.innerHTML='').
  // La clase ".active" de la entrada actual vive SOLO en ese DOM -- navTo() es
  // el unico otro sitio que la pone -- asi que sin esto, cambiar el ancho de
  // la ventana apaga el resaltado y no queda nada marcado. Por eso la clave
  // activa se guarda ANTES de borrar, y se restaura al crear su entrada.
  //
  // La consulta se protege porque el arnes de pruebas ejecuta este mismo
  // buildNav() contra un `document` de juguete sin querySelector.
  const claveActiva=(typeof document.querySelector==='function' && document.querySelector('.nav-item.active'))
    ? document.querySelector('.nav-item.active').dataset.key : null;
  nav.innerHTML='';
  const visibles=NAV.filter(n=>tieneModulo(n[0])).map(n=>n[0]);
  const secciones=agruparNav(visibles);
  // Se agrupa solo en el movil Y solo si el menu es largo. agruparNav() decide
  // lo segundo (devuelve una sola seccion sin titulo por debajo del umbral).
  const agrupado=esMovil() && secciones.some(s=>s.titulo);

  // Crea la entrada y le devuelve su resaltado si es la que estaba activa.
  const conActiva=key=>{
    const el=crearEntradaNav(key);
    if(key===claveActiva) el.className='nav-item active';
    return el;
  };

  if(!agrupado){
    visibles.forEach(key=>nav.appendChild(conActiva(key)));
    // El repintado por cambio de ancho destruye el badge en las dos formas
    // del menu, no solo en la agrupada: hay que reaplicarlo tambien aqui.
    if(typeof Chat!=='undefined'&&Chat._sinLeer) Chat.actualizarBadgeNav(Chat._sinLeer);
    return;
  }

  let primerGrupo=null;   // el fallback del acordeon: el primer tema REAL
  secciones.forEach((seccion,i)=>{
    // El id se calcula para toda seccion, incluida la que se pinta suelta y
    // no lo usa: por eso puede haber huecos (nav-g-1, nav-g-3, sin nav-g-2) si
    // el segundo tema quedo de una sola entrada. No es un bug -- aria-controls
    // siempre sale de esta misma variable, asi que header y contenedor jamas
    // se desincronizan aunque la numeracion salte.
    const id=`nav-g-${i+1}`;
    // Tema de una sola entrada (titulo null): la entrada va suelta, en el
    // lugar del tema, sin acordeon que abrir para una sola cosa.
    if(!seccion.titulo){
      seccion.claves.forEach(k=>nav.appendChild(conActiva(k)));
      return;
    }
    if(primerGrupo===null) primerGrupo=id;
    const h=document.createElement('button');
    h.type='button';
    h.className='nav-sec';
    // textContent, no innerHTML: los titulos son fijos, pero no hay motivo para
    // abrir esa puerta en el menu.
    h.textContent=seccion.titulo;
    h.setAttribute('aria-controls',id);
    h.setAttribute('aria-expanded','true');
    h.onclick=()=>alternarGrupo(id);
    nav.appendChild(h);

    const cont=document.createElement('div');
    cont.className='nav-grupo';
    cont.id=id;
    seccion.claves.forEach(k=>cont.appendChild(conActiva(k)));
    nav.appendChild(cont);
  });

  // Estado inicial: abierto solo el tema de la pantalla actual. Si no hay
  // ninguna activa, el primero -- nunca los cinco cerrados de entrada.
  // Protegido igual que claveActiva arriba: el arnes de pruebas de buildNav
  // ejecuta esta funcion contra un `document` de juguete que puede no tener
  // querySelector/querySelectorAll -- y grupoActivo() usa el primero antes de
  // que abrirGrupo() use el segundo, asi que el guardia tiene que cubrir los dos.
  if(typeof document.querySelector==='function' && typeof document.querySelectorAll==='function'){
    abrirGrupo(grupoActivo()||primerGrupo);
    // El menu se acaba de repintar: el punto de sin-leer se perdio con el DOM
    // anterior. Se reaplica con el ultimo dato conocido, sin volver a pedirlo.
    if(typeof Chat!=='undefined'&&Chat._sinLeer) Chat.actualizarBadgeNav(Chat._sinLeer);
  }
}

// Una entrada del menu. Es un <button> de verdad, no un <div onclick>: asi se
// alcanza con Tab, se activa con Enter y con Espacio, y un lector de pantalla la
// anuncia como el control que es.
function crearEntradaNav(key){
  const el=document.createElement('button');
  el.type='button';   // sin esto, dentro de un formulario lo enviaria
  el.className='nav-item';
  el.dataset.key=key;
  el.innerHTML=`<span class="ic">${NAV_ICON[key]||iconDe(key)}</span> ${labelDe(key)}${key==='mensajes'?'<span id="nav-badge-mensajes" class="badge hidden">0</span>':''}`;
  el.onclick=()=>navTo(key);
  return el;
}

// El tema que contiene la pantalla en la que esta. Devuelve null si no hay
// ninguna entrada marcada como activa: pasa de verdad, hay pantallas que no
// tienen entrada en el menu.
function grupoActivo(){
  const activa=document.querySelector('.nav-item.active');
  const cont=activa&&activa.closest('.nav-grupo');
  return cont?cont.id:null;
}

// El primer tema REAL del menu pintado. Es la respuesta a "que abro si no hay
// ninguna entrada activa": desde que un tema de una sola entrada se pinta
// suelto (sin contenedor), el primer contenedor ya no es necesariamente
// 'nav-g-1' -- se le pregunta al DOM en vez de repetir el calculo de
// buildNav, para que no haya dos verdades que mantener sincronizadas.
function primerGrupoNav(){
  const g=document.querySelector('#nav .nav-grupo');
  return g?g.id:null;
}

// Deja abierto exactamente el tema `id` y cierra los demas. Con null, cierra
// todos. `aria-expanded` sale del estado real, no de un valor fijo: si mintiera,
// un lector de pantalla anunciaria como abierto algo que esta cerrado.
function abrirGrupo(id){
  document.querySelectorAll('#nav .nav-grupo').forEach(g=>{
    const abierto=(g.id===id);
    g.hidden=!abierto;
    const h=document.querySelector(`.nav-sec[aria-controls="${g.id}"]`);
    if(h) h.setAttribute('aria-expanded',abierto?'true':'false');
  });
}

// Lo que hace tocar un encabezado: si estaba abierto lo cierra, y si no, lo abre
// cerrando el anterior.
function alternarGrupo(id){
  const g=document.getElementById(id);
  if(!g) return;
  const seCierra=!g.hidden;
  // Si el foco esta dentro del tema que se cierra hay que rescatarlo: un foco en
  // un elemento oculto se pierde y el navegador lo manda al principio de la
  // pagina, que para quien navega con teclado es volver a empezar.
  if(seCierra&&g.contains&&g.contains(document.activeElement)){
    const h=document.querySelector(`.nav-sec[aria-controls="${id}"]`);
    if(h&&h.focus) h.focus();
  }
  abrirGrupo(seCierra?null:id);
}

// Un tema cerrado esconde el badge de su entrada. Sin esto, tener mensajes sin
// leer dejaria de verse en cuanto su tema no fuera el abierto — una perdida real
// respecto a como funcionaba antes de plegar el menu.
//
// El punto NO cuenta nada por su cuenta: sale del mismo numero que ya gobierna
// el badge, para que no haya dos verdades que mantener.
function marcarGrupoConSinLeer(entradaBadge, n){
  // El punto (::after, puro CSS) es invisible para un lector de pantalla: sin
  // aria-label el encabezado se anuncia solo con su titulo, como si el tema no
  // tuviera nada pendiente. Se limpia siempre junto con la clase, para que un
  // encabezado nunca quede diciendo "mensajes sin leer" de una llamada vieja.
  document.querySelectorAll('#nav .nav-sec').forEach(h=>{
    h.classList.remove('con-sin-leer');
    h.removeAttribute('aria-label');
  });
  if(!n||!entradaBadge||!entradaBadge.closest) return;
  const cont=entradaBadge.closest('.nav-grupo');
  if(!cont) return;   // menu plano (escritorio o menu corto): el badge ya se ve
  const h=document.querySelector(`.nav-sec[aria-controls="${cont.id}"]`);
  if(h){
    h.classList.add('con-sin-leer');
    h.setAttribute('aria-label', h.textContent+' — mensajes sin leer');
  }
}

function navTo(key){
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active', i.dataset.key===key));
  $('page-title').textContent = labelDe(key);
  closeSidebar();
  if(key==='inicio') return renderDashboard();
  if(key==='calendario') return vistaCalendario();
  if(key==='anuncios') return vistaAnuncios();
  if(key==='mensajes') return vistaMensajes();
  if(key==='directorio') return vistaDirectorio();
  if(key==='mi_servicio') return vistaMiServicio();
  if(key==='mi_grupo') return vistaMiGrupo();
  if(key==='servicio_gestion') return vistaServicio();
  if(key==='asistencia') return vistaAsistencia();
  if(key==='panel_pastor') return vistaPanel();
  if(key==='reportes') return vistaReportes();
  if(key==='musicos') return vistaMusica();
  if(key==='cuidado_pastoral') return vistaCuidado();
  if(key==='mensajes_portal') return vistaMensajesPortal();
  if(key==='tesoreria') return vistaTesoreria();
  if(key==='organizacion') return vistaOrganizacion();
  if(key==='ninos') return vistaNinos();
  if(key==='predica') return vistaPredica();
  if(key==='panel_obispo') return vistaPanelObispo();
  if(key==='admin') return vistaAdmin();
  if(key==='superadmin') return vistaSuperadmin();
  if(key==='ajustes') return vistaAjustes();
  $('content').innerHTML=`<div class="placeholder"><div class="big">${iconDe(key)}</div>
    <h2>${labelDe(key)}</h2><p>Este módulo se construye en una próxima fase.</p></div>`;
}
// Al ABRIR el cajon se recalcula que tema dejar abierto. Por eso no hace falta
// guardar nada entre visitas: navTo() cierra el cajon al navegar, asi que cada
// apertura parte del mismo estado predecible.
function toggleSidebar(){
  const abriendo=!$('sidebar').classList.contains('open');
  $('sidebar').classList.toggle('open'); $('overlay').classList.toggle('show');
  if(abriendo) abrirGrupo(grupoActivo()||primerGrupoNav());
}
function closeSidebar(){ $('sidebar').classList.remove('open'); $('overlay').classList.remove('show'); }

// ============================================================
//  DASHBOARD (Inicio)
// ============================================================
async function renderDashboard(){
  const c=$('content');
  c.innerHTML=`<div class="hero"><h2>Hola, ${escHtml(ME.persona.nombre.split(' ')[0])} 👋</h2>
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
  setCampana(sinLeer);   // actualiza la campana con esta misma carga (sin pedir /notificaciones aparte)

  // --- Resumen: 3 métricas clicables ---
  const resumen=`<div class="widgets" style="margin-bottom:20px">
    <button type="button" class="btn-plano widget" onclick="navTo('calendario')">
      <div class="widget-head">📅 Próximo evento</div>
      ${proximo
        ? `<div class="stat-num" style="font-size:22px">${fechaTxt(proximo.fecha)}</div><div class="muted small">${escHtml(proximo.titulo)}${proximo.hora_inicio?' · '+escHtml(proximo.hora_inicio):''}</div>`
        : '<div class="empty">Sin eventos próximos</div>'}
    </button>
    <button type="button" class="btn-plano widget" onclick="navTo('mi_servicio')">
      <div class="widget-head">🙌 Servicios por confirmar</div>
      <div class="stat-num" style="color:${pendientes.length?'var(--amber-tx)':'var(--green-tx)'}">${pendientes.length}</div>
    </button>
    <button type="button" class="btn-plano widget" onclick="verNotificaciones()">
      <div class="widget-head">🔔 Notificaciones sin leer</div>
      <div class="stat-num" style="color:${sinLeer?'var(--primary)':'var(--muted)'}">${sinLeer}</div>
    </button>
  </div>`;

  // --- Lo más útil: lo que TE toca confirmar (accionable aquí mismo) ---
  let accionables='';
  if(pendientes.length){
    accionables=`<div class="card" style="margin-bottom:20px;border-left:4px solid var(--amber)">
      <div class="widget-head">⏳ Te toca confirmar (${pendientes.length})</div>
      ${pendientes.map(a=>`<div class="item-card flex" style="margin-top:10px">
        <div style="flex:1"><b>${TIPO_ICON[a.tipo]||'📋'} ${cap(a.tipo)}</b>
          <div class="muted small">${escHtml(a.evento)} · ${fechaTxt(a.fecha)}${a.lugar?' · 📍 '+escHtml(a.lugar):''}</div></div>
        <div class="row" style="width:auto">
          <button class="btn small-btn" onclick="responderDash(${a.id},'aceptar')">✅ Acepto</button>
          <button class="btn ghost small-btn" onclick="responderDash(${a.id},'rechazar')">❌ No puedo</button>
        </div></div>`).join('')}
    </div>`;
  }

  // --- Próximos eventos + Anuncios recientes ---
  const listaEventos=eventos.length
    ? `<div class="mini-list">`+eventos.slice(0,4).map(e=>
        `<button type="button" class="btn-plano mini-item" onclick="navTo('calendario')">${chipFecha(e.fecha)}
         <div><b>${escHtml(e.titulo)}</b><br><span class="muted small">${escHtml(e.grupo||'')}${e.hora_inicio?' · '+e.hora_inicio:''}</span></div></button>`).join('')+`</div>`
    : '<div class="empty">No hay eventos próximos.</div>';
  const listaAnuncios=anuncios.length
    ? `<div class="mini-list">`+anuncios.slice(0,3).map(a=>
        `<button type="button" class="btn-plano mini-item" onclick="navTo('anuncios')"><span style="font-size:20px">${a.urgente?'🔴':'📢'}</span>
         <div><b>${escHtml(a.titulo)}</b><br><span class="muted small">${escHtml((a.texto||'').slice(0,80))}</span></div></button>`).join('')+`</div>`
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

// ---------- SELECTOR DE FECHA: día / mes / año ----------
// Reemplaza al <input type="date"> nativo para que SIEMPRE sea día-mes-año
// (de izquierda a derecha: día, luego mes, luego año), sin depender del idioma
// del navegador. Pinta con fechaSelectHTML(prefijo, valor, opts) y lee el valor
// 'YYYY-MM-DD' con fechaSelectValor(prefijo). opts: {opcional, desde, hasta}.
// Nº de días reales de un mes/año (mes en 1..12). Si no hay mes elegido aún, usa 31
// (no hay nada que acotar); si no hay año elegido, usa el año actual (basta para saber
// si febrero tiene 28 o 29 en la inmensa mayoría de los casos de uso reales).
function _diasEnMes(anio, mes){
  if(!mes) return 31;
  const y = anio || new Date().getFullYear();
  return new Date(y, mes, 0).getDate();
}
function fechaSelectHTML(prefijo, valor, opts){
  const o=opts||{};
  const hoy=new Date();
  const p=(valor && /^\d{4}-\d{2}-\d{2}/.test(valor)) ? valor.split('-').map(Number) : [];
  // Sin valor: si es opcional queda "en blanco"; si no, por defecto hoy.
  const yDef=p[0] || (o.opcional?undefined:hoy.getFullYear());
  const mDef=p[1] || (o.opcional?undefined:hoy.getMonth()+1);
  let dDef=p[2] || (o.opcional?undefined:hoy.getDate());
  const blanco=!p.length && o.opcional;
  const aDesde=o.desde!=null?o.desde:hoy.getFullYear()-2;
  const aHasta=o.hasta!=null?o.hasta:hoy.getFullYear()+3;
  const ph=(t)=> o.opcional ? `<option value="" ${blanco?'selected':''}>${t}</option>` : '';
  const maxDias=_diasEnMes(yDef, mDef);
  if(dDef && dDef>maxDias) dDef=maxDias;
  const diaOpts=ph('Día')+Array.from({length:maxDias},(_,i)=>i+1).map(d=>`<option ${d===dDef?'selected':''}>${d}</option>`).join('');
  const mesOpts=ph('Mes')+MESES_LARGO.map((nm,i)=>`<option value="${i+1}" ${(i+1)===mDef?'selected':''}>${nm}</option>`).join('');
  let anioOpts=ph('Año'); for(let a=aDesde;a<=aHasta;a++) anioOpts+=`<option ${a===yDef?'selected':''}>${a}</option>`;
  return `<span class="fecha-select" style="display:inline-flex;gap:8px;flex-wrap:wrap">
    <select id="${prefijo}-dia" title="Día" data-opcional="${o.opcional?'1':''}" style="max-width:90px">${diaOpts}</select>
    <select id="${prefijo}-mes" title="Mes" style="max-width:140px" onchange="fechaSelectAjustarDias('${prefijo}')">${mesOpts}</select>
    <select id="${prefijo}-anio" title="Año" style="max-width:110px" onchange="fechaSelectAjustarDias('${prefijo}')">${anioOpts}</select></span>`;
}
// Recalcula las opciones del <select> de día según el mes/año elegidos, para que
// nunca se pueda dejar seleccionado (ni el backend guardar) un día que no existe en
// ese mes (ej. "30 de febrero"). Si el día elegido ya no es válido, lo ajusta al
// último día real de ese mes.
function fechaSelectAjustarDias(prefijo){
  const d=$(prefijo+'-dia'), m=$(prefijo+'-mes'), a=$(prefijo+'-anio');
  if(!d||!m||!a) return;
  const mes=m.value?Number(m.value):null;
  const anio=a.value?Number(a.value):null;
  const maxDias=_diasEnMes(anio, mes);
  const opcional=d.dataset.opcional==='1';
  const actual=d.value?Number(d.value):null;
  const dSel = (actual && actual>maxDias) ? maxDias : actual;
  const ph = opcional ? `<option value="" ${dSel?'':'selected'}>Día</option>` : '';
  d.innerHTML = ph + Array.from({length:maxDias},(_,i)=>i+1).map(x=>`<option ${x===dSel?'selected':''}>${x}</option>`).join('');
}
function fechaSelectValor(prefijo){
  const d=$(prefijo+'-dia'), m=$(prefijo+'-mes'), a=$(prefijo+'-anio');
  if(!d||!m||!a||!d.value||!m.value||!a.value) return '';
  return `${a.value}-${String(m.value).padStart(2,'0')}-${String(d.value).padStart(2,'0')}`;
}
let _calRef=null;            // {y, m}  mes que se está mostrando
let _calDiaSel=null;         // fecha seleccionada (YYYY-MM-DD)

async function vistaCalendario(){
  const c=$('content');
  c.innerHTML=`<div id="bandeja"></div>
    <div class="head-row"><h2>Calendario</h2><span id="crear-zona"></span></div>
    <div id="form-zona"></div>
    <div id="cal" class="muted">Cargando…</div>
    <div id="cal-dia"></div>
    <div id="cal-historial"></div>`;
  cargarBandeja();
  cargarHistorialAprob();
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
      const pend=e.estado && e.estado!=='aprobado';
      return `<div class="cal-ev${pend?' pend':''}" style="border-left-color:${safeColor(e.grupo_color)}"
        title="${escHtml(e.titulo)}${e.grupo?' · '+escHtml(e.grupo):''}${e.hora_inicio?' · '+escHtml(e.hora_inicio):''}"
        onclick="event.stopPropagation();abrirEvento(${e.id})">${e.hora_inicio?'<b>'+e.hora_inicio+'</b> ':''}${escHtml(e.titulo)}</div>`;
    }).join('');
    const mas=delDia.length>3?`<div class="cal-mas">+${delDia.length-3} más</div>`:'';
    celdas+=`<button type="button" class="btn-plano cal-cell${esHoy?' today':''}${finde?' finde':''}${sel?' sel':''}${delDia.length?' tiene':''}" onclick="verDia('${fecha}')">
      <div class="cal-daynum">${dia}</div>${chips?`<div class="cal-puntos">${chips}</div>`:''}${mas}</button>`;
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
    ? '<div class="cal-leyenda">'+[...leg].map(([n,c])=>`<span class="cal-leg"><span class="cal-leg-dot" style="background:${safeColor(c,'#2563EB')}"></span>${escHtml(n)}</span>`).join('')+'</div>' : '';
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
    const puede=puedeGestionarEvento(e), puedeBorrar=puedeBorrarEvento(e);
    const badge=e.estado==='pendiente'?'<span class="estado-chip estado-pendiente">⏳ Pendiente</span>':e.estado==='rechazado'?'<span class="estado-chip estado-rechazado">🔴 Rechazada</span>':'<span class="estado-chip estado-aceptado">✅ Aprobado</span>';
    return `<div class="item-card flex" style="margin-top:10px;border-left:4px solid ${safeColor(e.grupo_color)}">
      <div style="flex:1"><div class="item-titulo">${escHtml(e.titulo)}</div>
        <div class="muted small">${e.grupo?'🏷️ '+escHtml(e.grupo):''}${e.hora_inicio?' · 🕐 '+e.hora_inicio+(e.hora_fin?'–'+e.hora_fin:''):''}${e.lugar?' · 📍 '+escHtml(e.lugar):''}</div>
        <div style="margin-top:6px">${badge}</div></div>
      ${(puede||puedeBorrar||puedePublicar())?`<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
        ${puedePublicar()?`<button class="link" onclick="Org.abrirEvento(${e.id})">🗒️ Organización</button>`:''}
        ${puede?`<button class="link" onclick="editarEvento(${e.id})">✏️ Editar</button>`:''}
        ${puedeBorrar?`<button class="link" style="color:var(--red-tx)" onclick="borrarEvento(${e.id})">🗑️ Borrar</button>`:''}
      </div>`:''}</div>`;
  }).join('');
  cont.innerHTML=`<div class="card" style="margin-top:16px">${inner}</div>`;
}
// Editar: si ya está aprobado, solo el pastor; si no, el encargado o el creador.
function puedeGestionarEvento(e){
  if(e.estado==='aprobado') return ME.persona.es_pastor;
  return esEncargadoDe(e.grupo_id)||e.creado_por===ME.persona.id;
}
// Borrar: el pastor puede eliminar CUALQUIER evento (aprobado/rechazado/pendiente);
// los demás, solo los suyos o los de su grupo.
function puedeBorrarEvento(e){
  if(ME.persona.es_pastor) return true;
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
  const opts=(window._grupos||[]).map(g=>`<option value="${g.id}" ${ev&&ev.grupo_id===g.id?'selected':''}>${escHtml(g.nombre)}</option>`).join('');
  // Fecha como tres listas: día / mes / año (en vez del input nativo)
  const fBase = ev&&ev.fecha ? ev.fecha : (_calDiaSel||'');
  const esPastorUI = ME.persona.es_pastor;
  const titulo = ev ? 'Editar evento' : (esPastorUI ? 'Nuevo evento' : 'Pedir fecha');
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:4px">${titulo}</h3>
    ${(!ev && !esPastorUI)?'<p class="muted small" style="margin-bottom:8px">Tu solicitud se enviará al pastor para aprobación.</p>':''}
    <label for="ev-grupo">Grupo</label><select id="ev-grupo">${opts}</select>
    <label for="ev-titulo">Nombre del evento</label><input id="ev-titulo" value="${ev?escHtml(ev.titulo):''}" placeholder="Ej. Noche de Jóvenes" />
    <label>Fecha</label>
    <div>${fechaSelectHTML('ev', fBase)}</div>
    <div class="row" style="margin-top:10px"><div style="flex:1"><label for="ev-ini">Hora inicio</label><input id="ev-ini" type="time" value="${ev&&ev.hora_inicio?escHtml(ev.hora_inicio):''}" /></div>
      <div style="flex:1"><label for="ev-fin">Hora fin</label><input id="ev-fin" type="time" value="${ev&&ev.hora_fin?escHtml(ev.hora_fin):''}" /></div></div>
    <label for="ev-lugar">Lugar</label><input id="ev-lugar" value="${ev?escHtml(ev.lugar):''}" placeholder="Ej. Salón principal" />
    <p id="ev-error" class="error"></p>
    <button class="btn" style="margin-top:14px" onclick="guardarEvento()">${ev?'Guardar cambios':(esPastorUI?'Crear evento':'📩 Enviar al pastor')}</button></div>`;
}
function editarEvento(id){ const ev=(window._eventos||[]).find(e=>e.id===id); if(ev) toggleFormEvento(ev); }
function borrarEvento(id){ modalConfirm('¿Eliminar este evento? No se puede deshacer.', async()=>{
  try{ await api('/eventos/'+id,{method:'DELETE'}); cargarEventos(); toast('Evento eliminado'); }catch(e){ toast(e.message); } }); }
async function guardarEvento(){
  const fecha=fechaSelectValor('ev');
  const body={grupo_id:$('ev-grupo').value,titulo:$('ev-titulo').value.trim(),fecha,
    hora_inicio:$('ev-ini').value,hora_fin:$('ev-fin').value,lugar:$('ev-lugar').value.trim()};
  const e=$('ev-error'); e.textContent='';
  if(!body.titulo){ e.textContent='Pon al menos el título'; return; }
  await conBoton(botonActual(), async()=>{
    try{
      if(window._editEvId){ await api('/eventos/'+window._editEvId,{method:'PATCH',body:JSON.stringify(body)}); toast('Evento actualizado'); }
      else {
        const r=await api('/eventos',{method:'POST',body:JSON.stringify(body)});
        toast(r.estado==='pendiente' ? '📨 Enviado · pendiente de aprobación del pastor' : '✅ Evento creado y aprobado');
      }
      window._editEvId=null; $('form-zona').innerHTML=''; cargarEventos();
    } catch(ex){ e.textContent=ex.message; }
  });
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
      <div class="muted small">por ${escHtml(a.autor||'la iglesia')}</div></div>
      ${puede?accionesBtns('editarAnuncio','borrarAnuncio',a.id):''}</div>`).join('');
  }catch{ cont.innerHTML='<p class="error">No se pudieron cargar.</p>'; }
}
const ROL_LABEL = { admin:'Líderes de cuerpo', lider_musica:'Líderes de música', lider_ed:'Maestros (Esc. Dominical)', tesorero:'Tesoreros', musico:'Músicos', miembro:'Miembros' };
async function toggleFormAnuncio(a){
  const z=$('form-zona'); if(z.innerHTML && !a){ z.innerHTML=''; return; }
  window._editAnId = a ? a.id : null;
  // Cargar segmentos disponibles (grupos + roles) para dirigir el aviso (Fase 4.1)
  let segHtml='';
  if(!a){
    try{
      const s=await api('/notificaciones/segmentos'); window._segmentos=s;
      const grupos=s.grupos.map(g=>`<option value="grupo:${g.id}">👥 ${escHtml(g.nombre)}</option>`).join('');
      const roles=s.roles.map(rl=>`<option value="rol:${rl}">🏷️ ${ROL_LABEL[rl]||rl}</option>`).join('');
      segHtml=`<label for="an-segmento">Dirigir a (segmento)</label>
        <select id="an-segmento"><option value="todos">📣 Toda la iglesia</option>${grupos}${roles}</select>`;
    }catch{ segHtml=''; }
  }
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>${a?'Editar anuncio':'Nuevo anuncio'}</h3>
    <label for="an-titulo">Título</label><input id="an-titulo" value="${a?escHtml(a.titulo):''}" placeholder="Título" />
    <label for="an-texto">Mensaje</label><textarea id="an-texto" rows="3" placeholder="Mensaje (opcional)">${escHtml(a&&a.texto?a.texto:'')}</textarea>
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
  await conBoton(botonActual(), async()=>{
    try{
      if(window._editAnId){ await api('/anuncios/'+window._editAnId,{method:'PATCH',body:JSON.stringify(body)}); toast('Anuncio actualizado'); }
      else {
        body.segmento=leerSegmento();
        const r=await api('/anuncios',{method:'POST',body:JSON.stringify(body)}); actualizarCampana();
        toast('📢 Publicado · '+(r.enviadas||0)+' avisados');
      }
      window._editAnId=null; $('form-zona').innerHTML=''; cargarAnuncios();
    } catch(ex){ e.textContent=ex.message; }
  });
}

// ============================================================
//  MÓDULO C: SERVICIO
// ============================================================
async function vistaMiServicio(){
  const c=$('content'); c.innerHTML=`<div id="ms" class="muted">Cargando…</div>`;
  const safe=p=>p.then(r=>r).catch(()=>[]);
  const [servicios,musica,tareas,misCosas]=await Promise.all([
    safe(api('/asignaciones/mio')), safe(api('/musica/mis-asignaciones')), safe(api('/grupo/mis-tareas')),
    safe(api('/organizacion/mis-cosas'))
  ]);
  const cont=$('ms');
  const total=(servicios?.length||0)+(musica?.length||0)+(tareas?.length||0)+(misCosas?.length||0);
  // Ojo: aunque no tengas NADA asignado, la seccion de "cuando no puedo servir"
  // tiene que salir igual — si no, quien todavia no sirve nunca podria marcar
  // sus fechas, que es justo cuando mas falta hace avisarlo.
  const vacio = !total ? '<div class="placeholder"><div class="big">🙌</div><p>No tienes nada asignado por ahora.</p></div>' : '';
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
        <div class="muted small">${escHtml(a.evento)} · ${fechaTxt(a.fecha)}${a.lugar?' · 📍 '+escHtml(a.lugar):''}</div>
        <span class="estado-chip estado-${a.estado}">${si} ${sl}${a.motivo?' · '+escHtml(a.motivo):''}</span>${acc}</div>`;
    }).join('')+'</div>';
  }
  // 2) Me toca tocar (grupo de alabanza)
  if(musica.length){
    html+='<h3 class="section-title">🎵 Me toca tocar</h3><div class="list" style="margin-bottom:18px">'+musica.map(m=>
      `<div class="item-card flex"><div style="flex:1"><div class="item-titulo">${escHtml(m.instrumento||'Música')} · ${escHtml(m.titulo)}</div>
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

  // 4) Mi parte: lo que me comprometí a llevar (Organización). Va aquí y no en un
  // apartado propio: este es el lugar donde alguien mira "qué me toca".
  if(misCosas.length){
    html+='<h3 class="section-title">📦 Mi parte</h3><div class="list" style="margin-bottom:18px">'+misCosas.map(c=>{
      const donde=c.evento_titulo||c.hoja_titulo||'';
      const fecha=c.evento_fecha||c.fecha;
      return `<div class="item-card flex">
        <div style="flex:1"><div class="item-titulo ${c.listo?'org-listo':''}">${escHtml(c.nombre)} <b>×${c.cantidad}</b></div>
          <div class="muted small">${escHtml(donde)}${fecha?' · '+fechaTxt(fecha):''}${c.hora_llegada?' · 🕐 llegar '+escHtml(c.hora_llegada):''}${c.lugar?' · 📍 '+escHtml(c.lugar):''}</div></div>
        <button class="btn ${c.listo?'ghost ':''}small-btn" onclick="Org.marcarMio(${c.id}, ${c.listo?0:1})">${c.listo?'✓ Listo':'Ya lo tengo'}</button>
      </div>`;
    }).join('')+'</div>';
  }
  cont.innerHTML = vacio + html + seccionNoDisp();
  cargarNoDisp();
}
// ============================================================
//  "Cuando no puedo servir" — cada quien marca SOLO lo suyo.
//  La tabla existia desde siempre y asignaciones.js ya avisaba al lider; lo que
//  faltaba era esto. Ver docs/superpowers/specs/2026-07-30-no-puedo-servir-design.md
// ============================================================
function seccionNoDisp(){
  return `<h3 class="section-title">📆 Cuándo no puedo servir</h3>
    <div class="card">
      <div class="head-row"><p class="muted small" style="margin:0">Marca los días que no estarás. Tu líder lo verá al asignar.</p>
        <button class="btn small-btn" onclick="formNoDisp()">+ Marcar fechas</button></div>
      <div id="form-nodisp"></div>
      <div id="nodisp-lista" class="muted">…</div>
    </div>`;
}
async function cargarNoDisp(){
  const c=$('nodisp-lista'); if(!c) return;
  try{
    const p=await api('/disponibilidad/mias');
    c.className=p.length?'list':'muted';
    c.innerHTML=p.length? p.map(x=>`<div class="item-card flex">
      <div style="flex:1"><div class="item-titulo">${fechaTxt(x.desde,true)} – ${fechaTxt(x.hasta,true)}</div>
        ${x.motivo?`<div class="muted small">${escHtml(x.motivo)}</div>`:''}</div>
      <button class="btn ghost small-btn" aria-label="Quitar este periodo" onclick="borrarNoDisp(${x.id})">✕</button>
    </div>`).join('') : '<p class="small">No has marcado ningún día.</p>';
  }catch{
    c.className='muted';
    c.innerHTML=errCargar('cargarNoDisp()','tus fechas');
  }
}
function formNoDisp(){ const z=$('form-nodisp'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="form-panel">
    <label>Desde</label><div>${fechaSelectHTML('nd1','',{opcional:true})}</div>
    <label style="margin-top:10px">Hasta</label><div>${fechaSelectHTML('nd2','',{opcional:true})}</div>
    <label for="nd-motivo" style="margin-top:10px">Motivo (opcional)</label>
    <input id="nd-motivo" maxlength="200" placeholder="Ej. Viaje"/>
    <button class="btn small-btn" style="margin-top:12px" onclick="guardarNoDisp()">Guardar</button></div>`; }
async function guardarNoDisp(){
  const desde=fechaSelectValor('nd1'), hasta=fechaSelectValor('nd2');
  if(!desde||!hasta) return toast('Elige las dos fechas');
  await conBoton(botonActual(), async()=>{
    try{
      await api('/disponibilidad',{method:'POST',body:JSON.stringify({desde,hasta,motivo:$('nd-motivo').value.trim()})});
      $('form-nodisp').innerHTML=''; cargarNoDisp(); toast('📆 Fechas marcadas');
    }catch(e){ toast(e.message); }
  }, 'Guardando…');
}
function borrarNoDisp(id){
  modalConfirm('¿Quitar este periodo? Volverás a aparecer como disponible esos días.', async()=>{
    try{ await api('/disponibilidad/'+id,{method:'DELETE'}); cargarNoDisp(); toast('Quitado'); }
    catch(e){ toast(e.message); }
  }, {okLabel:'Quitar', danger:true});
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
    // La fecha de cada evento viaja en el <option> para saber que dia consultar.
    const ev=eventos.map(e=>`<option value="${e.id}" data-fecha="${escHtml(e.fecha)}">${escHtml(e.titulo)} (${fechaTxt(e.fecha)})</option>`).join('');
    const ps=personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
    $('sv').innerHTML=`<div class="card" style="max-width:480px">
      <h3 style="margin-bottom:4px">Asignar un servicio</h3>
      <label for="sv-ev">Evento</label><select id="sv-ev" onchange="pintarNoDispServicio()">${ev}</select>
      <label for="sv-persona">Persona</label><select id="sv-persona">${ps}</select>
      <label for="sv-tipo">Servicio</label><select id="sv-tipo">
        <option value="predicar">🎤 Predicar</option><option value="ofrenda">💰 Ofrenda</option>
        <option value="devocional">🙏 Devocional</option><option value="musica">🎵 Música</option>
        <option value="aseo">🧹 Aseo</option></select>
      <p id="sv-msg" class="small" style="margin-top:10px"></p>
      <button class="btn" style="margin-top:8px" onclick="asignar()">Asignar y avisar</button></div>`;
    pintarNoDispServicio();   // el select de evento ya viene con uno elegido
  }catch{ $('sv').innerHTML=errCargar('vistaServicio()','los servicios'); }
}
// Mensaje de error propio de pintarNoDispServicio(): se compara antes de
// limpiar #sv-msg para no borrar un aviso de asignar() (ver mas abajo).
const MSG_NO_DISP_ERROR='No se pudo comprobar quién no está disponible; puedes asignar igual.';
// Marca en el desplegable a quien dijo que no puede ese dia.
// Se hace ANTES de asignar a proposito: el aviso de despues llega cuando a la
// persona ya le salto el push "te asignaron".
async function pintarNoDispServicio(){
  const selEv=$('sv-ev'), selP=$('sv-persona'), m=$('sv-msg');
  if(!selEv||!selP) return;
  const fecha=selEv.selectedOptions[0]?.dataset.fecha||'';
  // Limpiar siempre primero: si falla la consulta, mejor sin marcas que con
  // marcas del evento anterior, que serian mentira.
  for(const o of selP.options) o.textContent=o.dataset.nombre||o.textContent;
  for(const o of selP.options) if(!o.dataset.nombre) o.dataset.nombre=o.textContent;
  if(!fecha) return;
  try{
    const ids=await api('/disponibilidad/no-disponibles?fecha='+encodeURIComponent(fecha));
    // Si mientras esperabamos la respuesta cambio el evento elegido (p.ej. al
    // recorrer el desplegable con las flechas), esta respuesta ya es vieja:
    // pintarla marcaria a gente segun una fecha que ya no es la seleccionada.
    if((selEv.selectedOptions[0]?.dataset.fecha||'')!==fecha) return;
    const set=new Set(ids.map(String));
    for(const o of selP.options) if(set.has(o.value)) o.textContent=o.dataset.nombre+' ⚠️ no disponible';
    // Esta funcion se lanza sin await al cargar la vista: si asignar() ya
    // escribio su aviso de "marco NO disponible" en #sv-msg antes de que esta
    // consulta resolviera, no lo pisamos limpiando algo que no es nuestro.
    if(m && m.textContent===MSG_NO_DISP_ERROR){ m.style.color='var(--muted)'; m.textContent=''; }
  }catch{
    // Misma guarda que la rama de exito: si la respuesta (fallida) ya es
    // vieja porque el evento elegido cambio mientras esperabamos, no hay que
    // pintar "no se pudo comprobar" encima de una comprobacion posterior que
    // si funciono.
    if((selEv.selectedOptions[0]?.dataset.fecha||'')!==fecha) return;
    // Nunca bloquea ni rompe la pantalla: sin marcas se puede asignar igual.
    // Pero sin este aviso, "nadie marco nada" y "no se pudo comprobar" se ven
    // identicos (el desplegable queda igual de limpio en los dos casos).
    if(m){ m.style.color='var(--muted)'; m.textContent=MSG_NO_DISP_ERROR; }
  }
}
async function asignar(){
  const body={evento_id:$('sv-ev').value,persona_id:$('sv-persona').value,tipo:$('sv-tipo').value};
  const m=$('sv-msg');
  try{ const r=await api('/asignaciones',{method:'POST',body:JSON.stringify(body)});
    m.style.color='var(--green-tx)'; m.textContent='✅ Asignado y avisado.'+(r.aviso?'  ⚠️ '+r.aviso:'');
  }catch(e){ m.style.color='var(--red-tx)'; m.textContent=e.message; }
}

// ============================================================
//  NOTIFICACIONES
// ============================================================
async function actualizarCampana(){
  try{ const d=await api('/notificaciones'); setCampana(d.noLeidas||0); }catch{}
}
async function verNotificaciones(){
  $('page-title').textContent='Notificaciones';
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  // Con "‹ Inicio", como el resto de sub-pantallas. Se llega aquí tocando la
  // campana, y no había ninguna salida: además esta vista apaga el resaltado
  // del menú, así que quien entraba desde el móvil ni siquiera sabía dónde
  // estaba. La única forma de salir era abrir la hamburguesa y adivinar.
  const c=$('content'); c.innerHTML=`
    <button class="link" onclick="navTo('inicio')" style="margin-bottom:10px">‹ Inicio</button>
    <div id="ln" class="muted">Cargando…</div>`;
  try{
    const d=await api('/notificaciones'); const cont=$('ln');
    if(!d.items.length){ cont.innerHTML='<div class="placeholder"><div class="big">🔔</div><p>Sin notificaciones.</p></div>'; return; }
    cont.className='';
    const botonLeer = d.noLeidas>0 ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px">
      <button class="btn ghost small-btn" onclick="marcarLeidas()">Marcar todas como leídas</button></div>` : '';
    _notifOffset=0;
    cont.innerHTML=botonLeer + `<div id="ln-lista">${d.items.map(filaNotif).join('')}</div>` +
      (d.hayMas?'<button class="btn ghost small-btn" id="ln-mas" style="margin-top:10px" onclick="cargarMasNotificaciones()">Ver más</button>':'');
    actualizarCampana();
  }catch{ $('ln').innerHTML='<p class="error">No se pudieron cargar.</p>'; }
}
// Se saca a su propia función porque ahora la usan dos sitios: la carga inicial
// y el "Ver más".
function filaNotif(n){
  const dest=_destinoNotif(n.tipo);
  const accion=n.tipo==='aprobacion'?'Revisar y aprobar ›':(dest?'Ver ›':'');
  return `${dest?`<button type="button" class="btn-plano notif-item ${n.leida?'':'no-leida'}" onclick="abrirNotif('${n.tipo}')">`:`<div class="notif-item ${n.leida?'':'no-leida'}">`}
    <div style="font-weight:600">${escHtml(n.titulo)}</div>${n.texto?`<div class="muted small">${escHtml(n.texto)}</div>`:''}
    ${accion?`<div class="small" style="color:var(--primary);font-weight:600;margin-top:4px">${accion}</div>`:''}${dest?'</button>':'</div>'}`;
}
// El backend ya paginaba de 50 en 50 y mandaba hayMas (notificaciones.js:79-92);
// esta pantalla simplemente nunca lo miró, así que pasadas 50 notificaciones las
// viejas eran irrecuperables para cualquiera.
let _notifOffset=0;
async function cargarMasNotificaciones(){
  await conBoton($('ln-mas'), async()=>{
    const siguiente=_notifOffset+50;
    try{
      const d=await api('/notificaciones?offset='+siguiente);
      _notifOffset=siguiente;
      $('ln-lista').insertAdjacentHTML('beforeend', d.items.map(filaNotif).join(''));
      if(!d.hayMas){ const b=$('ln-mas'); if(b) b.remove(); }
    }catch(e){ toast(e.message); }
  });
}
function _destinoNotif(tipo){
  // contacto_publico: sin esta línea la notificación 📬 del portal no se puede
  // pulsar (abrirNotif no navega si el destino es ''), y era el único aviso de
  // que alguien había escrito.
  return {aprobacion:'calendario', musica:'musicos', grupo:'mi_grupo', recordatorio:'mi_servicio',
    predica:'predica', contacto_publico:'mensajes_portal'}[tipo]||'';
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
    $('lista').innerHTML=ev.map(e=>`<button type="button" class="btn-plano item-card flex" onclick="hojaAsistencia(${e.id})">
      ${fechaChip(e.fecha)}<div style="flex:1"><div class="item-titulo">${escHtml(e.titulo)}</div>
      <div class="muted small">${escHtml(e.grupo||'')}</div></div><span class="muted" style="font-size:20px">›</span></button>`).join('');
  }catch{ $('lista').innerHTML=errCargar('vistaAsistencia()','la hoja de asistencia'); }
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
      <h3 style="font-size:18px">${escHtml(d.evento.titulo)}</h3>
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
  return `${editable?`<button type="button" class="btn-plano asist-row ${on?'on':''}" aria-pressed="${on?'true':'false'}" onclick="togglePresente(${m.id})">`:`<div class="asist-row ${on?'on':''}" style="cursor:default">`}
    <div><div>${escHtml(m.nombre)}</div>${m.grupos?`<div class="muted small">🏷️ ${escHtml(m.grupos)}</div>`:''}</div>
    <span class="tick">${on?'✅':'○'}</span>${editable?'</button>':'</div>'}`;
}
function renderListasAsist(){
  const miembros = window._hojaMiembros || [];
  const asistieron = miembros.filter(m=>_asist.present.has(m.id));
  const ausentes   = miembros.filter(m=>!_asist.present.has(m.id));
  $('listas-asist').innerHTML=`
    <h3 class="section-title" style="margin-top:18px;color:var(--green-tx)">✅ Asistieron (${asistieron.length})</h3>
    <div class="list">${asistieron.length? asistieron.map(m=>filaAsist(m,true)).join('') : '<p class="muted small">Nadie marcado aún.</p>'}</div>
    <h3 class="section-title" style="margin-top:18px;color:var(--red-tx)">❌ No asistieron (${ausentes.length})</h3>
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
        <div style="flex:1"><b>${escHtml(e.titulo)}</b><div class="muted small">${fechaTxt(e.fecha)} · ${escHtml(e.grupo||'')} · pidió ${escHtml(e.solicitante||'')}</div></div>
        <div class="row" style="width:auto">
          <button class="btn small-btn" onclick="aprobarFecha(${e.id})">Aprobar</button>
          <button class="btn ghost small-btn" onclick="rechazarFecha(${e.id})">Rechazar</button>
        </div></div>`).join('')}</div>`;
  }catch{
    const b=$('bandeja'); if(b) b.innerHTML='<p class="error small">No se pudo cargar la bandeja de solicitudes · <a href="javascript:cargarBandeja()" class="link" style="display:inline;padding:0">Reintentar</a></p>';
  }
}
async function cargarHistorialAprob(){
  if(!ME.persona.es_pastor) return;
  const z=$('cal-historial'); if(!z) return;
  try{
    const h=await api('/eventos/historial/aprobaciones');
    if(!h.length){ z.innerHTML=''; return; }
    z.innerHTML=`<div class="card" style="margin-top:16px"><div class="widget-head">Historial de aprobaciones</div>
      <div class="list" style="margin-top:8px">${h.slice(0,30).map(x=>`<div class="item-card flex">
        <div style="flex:1"><b>${escHtml(x.evento_titulo||'')}</b>
          ${x.accion==='aprobado'?'<span class="estado-chip estado-aceptado">Aprobado</span>':'<span class="estado-chip estado-rechazado">Rechazado</span>'}
          <div class="muted small">${x.grupo?escHtml(x.grupo)+' · ':''}${escHtml(x.fecha_evento||'')}${x.motivo?' · '+escHtml(x.motivo):''}</div></div>
        <span class="muted small">${escHtml(fechaDeUTC(x.creado_en))}</span></div>`).join('')}</div></div>`;
  }catch{
    z.innerHTML='<p class="error small" style="margin-top:16px">No se pudo cargar el historial de aprobaciones · <a href="javascript:cargarHistorialAprob()" class="link" style="display:inline;padding:0">Reintentar</a></p>';
  }
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
          <div style="flex:1"><b>${escHtml(a.nombre)}</b><div class="muted small">No asistió a la última reunión</div></div>
          <span class="estado-chip estado-rechazado">Ausente</span></div>`).join('')+'</div>'
          : '<p class="muted small" style="margin-top:6px">Nadie ausente en la última reunión 🎉</p>'}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="head-row"><h3 style="font-size:16px">🌐 Portal público</h3>
          <button class="btn ghost small-btn" onclick="togglePortalInfo()">Editar información pública</button></div>
        <p class="muted small" style="margin:-2px 0 12px">Página sin login con tus próximos eventos aprobados, tu última prédica y estos datos de contacto.</p>
        <div class="row" style="gap:8px;margin-bottom:6px">
          <input id="portal-link" readonly value="${location.origin}/publico.html?ig=${encodeURIComponent(ME.iglesia?ME.iglesia.codigo_unico:'')}" />
          <button class="btn ghost small-btn" type="button" onclick="copiarLinkPortal()">Copiar</button>
        </div>
        <div id="portal-info-form" class="hidden" style="margin-top:12px"></div>
      </div>`;
  }catch(e){ $('pn').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function copiarLinkPortal(){
  const inp=$('portal-link'); inp.select();
  navigator.clipboard?.writeText(inp.value).then(()=>toast('🔗 Enlace copiado')).catch(()=>{});
}
let _portalInfoAbierto=false;
async function togglePortalInfo(){
  const zona=$('portal-info-form');
  _portalInfoAbierto=!_portalInfoAbierto;
  if(!_portalInfoAbierto){ zona.classList.add('hidden'); zona.innerHTML=''; return; }
  zona.classList.remove('hidden');
  zona.innerHTML='<p class="muted small">Cargando…</p>';
  try{
    const info=await api('/publico/info');
    zona.innerHTML=`
      <label for="pi-horarios">Horarios de culto</label><textarea id="pi-horarios" placeholder="Ej: Domingos 10:00 y 18:00">${escHtml(info.horarios||'')}</textarea>
      <label for="pi-direccion">Dirección</label><input id="pi-direccion" value="${escHtml(info.direccion||'')}" placeholder="Calle, número, ciudad" />
      <label for="pi-telefono">Teléfono de contacto</label><input id="pi-telefono" value="${escHtml(info.telefono||'')}" placeholder="+56 9 ..." />
      <label for="pi-descripcion">Sobre nosotros</label><textarea id="pi-descripcion" placeholder="Una breve bienvenida para tus visitantes">${escHtml(info.descripcion||'')}</textarea>
      <button class="btn" style="margin-top:12px" onclick="guardarPortalInfo()">Guardar</button>`;
  }catch(e){ zona.innerHTML='<p class="error">'+e.message+'</p>'; }
}
async function guardarPortalInfo(){
  try{
    await api('/publico/info',{method:'PATCH',body:JSON.stringify({
      horarios:$('pi-horarios').value, direccion:$('pi-direccion').value,
      telefono:$('pi-telefono').value, descripcion:$('pi-descripcion').value
    })});
    toast('✅ Información pública guardada');
  }catch(e){ toast(e.message); }
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
//  REPORTES Y ESTADÍSTICAS (panel del pastor)
//  Tendencias de asistencia/tesorería/crecimiento + export CSV.
//  Gráficos dibujados a mano en <canvas> (sin librerías externas:
//  la CSP no permite cargar CDNs).
// ============================================================
function mesLabel(m){
  const p=String(m||'').split('-');
  if(p.length<2) return String(m||'—');
  return (MESES[(+p[1])-1]||p[1])+' '+p[0].slice(2);
}
// Ajusta el canvas a su tamaño real en pantalla (nítido en pantallas retina).
function _prepararCanvas(cv){
  const dpr=window.devicePixelRatio||1;
  const w=Math.max(1,cv.clientWidth||300), h=Math.max(1,cv.clientHeight||220);
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  return { ctx, w, h };
}
// Gráfico de línea simple: una serie de valores contra etiquetas de mes.
function trazarLineas(canvasId, labels, valores, color){
  const cv=$(canvasId); if(!cv) return;
  const { ctx, w, h } = _prepararCanvas(cv);
  const pad={l:34,r:14,t:16,b:24};
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const max=Math.max(1,...valores);
  const n=labels.length, stepX=n>1?plotW/(n-1):0;
  ctx.strokeStyle='rgba(84,96,122,.28)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(pad.l,pad.t); ctx.lineTo(pad.l,pad.t+plotH); ctx.lineTo(pad.l+plotW,pad.t+plotH); ctx.stroke();
  ctx.strokeStyle=color; ctx.lineWidth=2.4; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.beginPath();
  valores.forEach((v,i)=>{ const x=pad.l+stepX*i, y=pad.t+plotH-(v/max*plotH); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();
  ctx.fillStyle=color;
  valores.forEach((v,i)=>{ const x=pad.l+stepX*i, y=pad.t+plotH-(v/max*plotH); ctx.beginPath(); ctx.arc(x,y,3.4,0,Math.PI*2); ctx.fill(); });
  ctx.fillStyle='#54607a'; ctx.font='11px Inter,system-ui,sans-serif'; ctx.textAlign='center';
  labels.forEach((l,i)=>{ ctx.fillText(l, pad.l+stepX*i, h-6); });
}
// Gráfico de barras (una o varias series agrupadas por mes).
function trazarBarras(canvasId, labels, series){
  const cv=$(canvasId); if(!cv) return;
  const { ctx, w, h } = _prepararCanvas(cv);
  const pad={l:40,r:14,t:16,b:24};
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const n=Math.max(1,labels.length);
  const max=Math.max(1,...series.flatMap(s=>s.valores));
  ctx.strokeStyle='rgba(84,96,122,.28)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(pad.l,pad.t); ctx.lineTo(pad.l,pad.t+plotH); ctx.lineTo(pad.l+plotW,pad.t+plotH); ctx.stroke();
  const groupW=plotW/n;
  const barW=Math.min(26, groupW/(series.length+1));
  labels.forEach((l,i)=>{
    const gx=pad.l+groupW*i+groupW/2;
    series.forEach((s,si)=>{
      const v=s.valores[i]||0, bh=(v/max)*plotH;
      const x=gx-(series.length*barW)/2+si*barW;
      ctx.fillStyle=s.color;
      ctx.fillRect(x, pad.t+plotH-bh, Math.max(2,barW-3), bh);
    });
    ctx.fillStyle='#54607a'; ctx.font='11px Inter,system-ui,sans-serif'; ctx.textAlign='center';
    ctx.fillText(l, gx, h-6);
  });
}
async function vistaReportes(){
  const c=$('content'); c.innerHTML=`<div id="rep" class="muted">Cargando…</div>`;
  try{
    const [asis, teso, crec]=await Promise.all([
      api('/reportes/asistencia'), api('/reportes/tesoreria'), api('/reportes/crecimiento')
    ]);
    $('rep').className='';
    const ultimaAsis=asis.mensual[asis.mensual.length-1];
    const mesActual=mesLocal();
    const altasMesActual=(crec.mensual.find(m=>m.mes===mesActual)||{altas:0}).altas;

    $('rep').innerHTML=`
      <div class="btn-fila no-print" style="margin-bottom:18px">
        <button class="btn ghost small-btn" onclick="exportarReporte('asistencia')">📥 Asistencia CSV</button>
        <button class="btn ghost small-btn" onclick="exportarReporte('tesoreria')">📥 Tesorería CSV</button>
        <button class="btn ghost small-btn" onclick="exportarReporte('crecimiento')">📥 Crecimiento CSV</button>
        <button class="btn ghost small-btn" style="margin-left:auto" onclick="window.print()">🖨️ Imprimir</button>
      </div>
      <div class="widgets cifras" style="margin-bottom:18px">
        <div class="widget"><div class="widget-head">✅ Asistencia último mes</div><div class="stat-num">${ultimaAsis?ultimaAsis.total:'—'}</div></div>
        <div class="widget"><div class="widget-head">💰 Saldo total</div><div class="stat-num">${money(teso.saldoTotal)}</div></div>
        <div class="widget"><div class="widget-head">👥 Miembros activos</div><div class="stat-num">${crec.totalActivos}</div></div>
        <div class="widget"><div class="widget-head">🌱 Altas este mes</div><div class="stat-num">${altasMesActual}</div></div>
      </div>
      <div class="card" style="margin-bottom:18px">
        <div class="widget-head">📈 Tendencia de asistencia (por mes)</div>
        ${asis.mensual.length?'<canvas id="cv-asis" height="220" style="width:100%;height:220px;display:block"></canvas>'
          :'<p class="muted small">Aún no hay datos de asistencia.</p>'}
      </div>
      <div class="card" style="margin-bottom:18px">
        <div class="widget-head">💰 Ingresos vs. gastos (por mes)</div>
        ${teso.mensual.length?'<canvas id="cv-teso" height="220" style="width:100%;height:220px;display:block"></canvas>'+
          '<div class="chart-legend"><span><i style="background:#16A34A"></i>Ingresos</span><span><i style="background:#DC2626"></i>Gastos</span></div>'
          :'<p class="muted small">Aún no hay movimientos de tesorería.</p>'}
      </div>
      <div class="card">
        <div class="widget-head">🌱 Crecimiento: altas de miembros por mes</div>
        ${crec.mensual.length?'<canvas id="cv-crec" height="220" style="width:100%;height:220px;display:block"></canvas>'
          :'<p class="muted small">Aún no hay datos de crecimiento.</p>'}
      </div>`;

    if(asis.mensual.length) trazarLineas('cv-asis', asis.mensual.map(m=>mesLabel(m.mes)), asis.mensual.map(m=>m.total), '#1C61A6');
    if(teso.mensual.length) trazarBarras('cv-teso', teso.mensual.map(m=>mesLabel(m.mes)), [
      {nombre:'Ingresos', color:'#16A34A', valores:teso.mensual.map(m=>m.ingresos)},
      {nombre:'Gastos', color:'#DC2626', valores:teso.mensual.map(m=>m.gastos)}
    ]);
    if(crec.mensual.length) trazarBarras('cv-crec', crec.mensual.map(m=>mesLabel(m.mes)), [
      {nombre:'Altas', color:'#F5A623', valores:crec.mensual.map(m=>m.altas)}
    ]);
  }catch(e){ $('rep').innerHTML='<p class="error">'+e.message+'</p>'; }
}
async function exportarReporte(tipo){
  try{
    const r=await fetch(API+'/reportes/export.csv?tipo='+tipo, {headers:{Authorization:'Bearer '+token()}});
    if(!r.ok) throw new Error('No se pudo exportar');
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='reporte-'+tipo+'.csv'; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
    toast('📥 Reporte exportado');
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
      <input id="buscar-cancion" placeholder="Buscar alabanza…" oninput="filtrarCanciones(this.value)" style="margin-bottom:12px"/>
      <div id="lista-canciones" class="muted">Cargando…</div></div>
    <div class="card"><h3 style="font-size:16px;margin-bottom:10px">Orden del servicio</h3>
      <label for="set-ev">Evento</label><select id="set-ev"></select>
      <div id="setlist" style="margin-top:14px" class="muted">…</div>
      <h3 style="font-size:16px;margin:28px 0 16px">🎸 Equipo y ensayo</h3>
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
    $('set-ev').innerHTML=ev.length? ev.map(e=>`<option value="${e.id}">${escHtml(e.titulo)} (${fechaTxt(e.fecha)})</option>`).join('') : '<option value="">Todavía no hay eventos</option>';
    $('set-ev').onchange=()=>{ cargarSetlist($('set-ev').value); cargarPlan($('set-ev').value); };
    if(ev.length){ cargarSetlist(ev[0].id); cargarPlan(ev[0].id); }
    else {
      // Sin eventos nadie tocaba #setlist, que arranca con "…": el líder de
      // música veía tres puntos suspensivos que no se resolvían nunca y parecía
      // que la app se había colgado. Se explica igual que #plan.
      $('plan').innerHTML='<p class="muted small">Crea un evento para planificar el equipo y el ensayo.</p>';
      const s=$('setlist'); if(s){ s.className=''; s.innerHTML='<p class="muted small">Crea un evento en el Calendario para armar el orden del servicio.</p>'; }
    }
  }catch{
    const retry='<a href="javascript:vistaMusica()" class="link" style="display:inline;padding:0">Reintentar</a>';
    const set=$('setlist'); if(set){ set.className='error small'; set.innerHTML='No se pudo cargar · '+retry; }
    const plan=$('plan'); if(plan){ plan.className='error small'; plan.innerHTML='No se pudo cargar · '+retry; }
  }
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
  if(!lista.length){ cont.className='muted'; cont.innerHTML='<p class="small">'+(todas.length?'Sin resultados para “'+escHtml(q||'')+'”.':'Aún no hay canciones.')+'</p>'; return; }
  cont.className='list';
  const puede=esLiderMusicaUI();
  cont.innerHTML=lista.map(c=>`<div class="item-card flex"><button type="button" class="btn-plano" style="flex:1" onclick="abrirVisorCancion(${c.id})" title="Ver y transponer"><b>${escHtml(c.titulo)}</b>
    <span class="estado-chip">${escHtml(c.tono||'—')}</span>${(c.letra||'').trim()?' <span class="estado-chip estado-aceptado">🎸 acordes</span>':''}<div class="muted small">${escHtml(c.autor||'')}</div></button>
    ${puede?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar canción" onclick="borrarCancion(${c.id})">🗑️</button>`:''}</div>`).join('');
}
function borrarCancion(id){ modalConfirm('¿Eliminar esta canción del cancionero?', async()=>{
  try{ await api('/musica/canciones/'+id,{method:'DELETE'}); cargarCanciones(); toast('Canción eliminada'); }catch(e){ toast(e.message); } }); }
function toggleFormCancion(){
  const z=$('form-cancion'); if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:14px">
    <div class="row"><input id="cn-titulo" placeholder="Título de la canción" />
      <input id="cn-tono" placeholder="Tono (ej. SOL, G)" style="max-width:130px" /></div>
    <input id="cn-autor" placeholder="Autor (opcional)" style="margin-top:10px" />
    <label for="cn-letra" style="margin-top:10px">Acordes / letra (opcional)</label>
    <textarea id="cn-letra" rows="8" style="width:100%;font-family:monospace;white-space:pre" placeholder="Pega aquí los acordes y la letra. Ej.:&#10;SOL        RE&#10;Cuán grande es Él&#10;Las líneas con acordes se transponen solas."></textarea>
    <p id="cn-error" class="error"></p>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarCancion()">Guardar</button></div>`;
}
async function guardarCancion(){
  const body={titulo:$('cn-titulo').value.trim(),tono:$('cn-tono').value.trim(),autor:$('cn-autor').value.trim(),letra:$('cn-letra').value};
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
          <button type="button" class="btn-plano" style="flex:1" onclick="abrirVisorSetlist(${s.cancion_id},${escJsAttr(s.tono_dia||'')})" title="Ver y transponer"><b>${escHtml(s.titulo)}</b> <span class="estado-chip">${escHtml(s.tono_dia||s.tono||'—')}</span>${(s.letra||'').trim()?' 🎸':''}
          <div class="muted small">${escHtml(s.autor||'')}</div></button>
          ${lider?`<button class="link" onclick="quitarSetlist(${s.id})">Quitar</button>`:''}</div>`).join('')+'</div>'
      : '<p class="muted small">Sin canciones en este servicio.</p>';
    if(lider){
      const opts=(window._canciones||[]).map(c=>`<option value="${c.id}">${escHtml(c.titulo)} (${escHtml(c.tono||'—')})</option>`).join('');
      html+=`<div class="row" style="margin-top:12px"><select id="set-cancion">${opts}</select>
        <button class="btn small-btn" onclick="agregarSetlist()">Agregar</button></div>`;
    }
    $('setlist').className=''; $('setlist').innerHTML=html;
  }catch{ $('setlist').className=''; $('setlist').innerHTML=errCargar('cargarSetlist(window._setEv)','el orden del servicio'); }
}
async function agregarSetlist(){
  try{ await api('/musica/setlist/'+window._setEv,{method:'POST',body:JSON.stringify({cancion_id:$('set-cancion').value})}); cargarSetlist(window._setEv); }
  catch(e){ toast(e.message); }
}
function quitarSetlist(id){ modalConfirm('¿Quitar esta canción del orden del servicio?', async()=>{
  try{ await api('/musica/setlist/item/'+id,{method:'DELETE'}); cargarSetlist(window._setEv); toast('Canción quitada del orden'); }
  catch(e){ toast(e.message); } }); }

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
          ${fechaSelectHTML('en', en.fecha||'', {opcional:true})}
          <input id="en-hora" type="time" value="${escHtml(en.hora||'')}" style="max-width:120px"/>
          <input id="en-lugar" placeholder="Lugar" value="${escHtml(en.lugar||'')}" style="max-width:180px"/>
          <button class="btn small-btn" onclick="guardarEnsayo()">Guardar ensayo</button></div>`
      : (en.fecha? `<div class="muted small">🗓️ ${fechaTxt(en.fecha)}${en.hora?' · '+escHtml(en.hora):''}${en.lugar?' · 📍 '+escHtml(en.lugar):''}</div>`
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
          <div style="flex:1"><b>${escHtml(p.nombre)}</b>
            <span style="display:inline-flex;flex-wrap:wrap;gap:6px;margin-left:6px;vertical-align:middle">${p.items.map(it=>
              `<span class="estado-chip">${escHtml(it.instrumento||'—')}${lider?` <button type="button" class="btn-plano" title="Quitar" aria-label="Quitar del equipo" style="color:var(--red-tx);font-weight:700;margin-left:2px" onclick="quitarIntegrante(${it.id})">×</button>`:''}</span>`).join('')}</span>
          </div></div>`).join('')+'</div>'
      : '<p class="muted small" style="margin-top:6px">Aún no hay equipo asignado.</p>';
    // Form para agregar (solo líder)
    let addHtml='';
    if(lider){
      const personas=await _personas();
      const popts=personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
      const iopts=d.instrumentos.map(i=>`<option value="${escHtml(i)}">${escHtml(i)}</option>`).join('');
      addHtml=`<div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px">
        <select id="eq-persona" style="max-width:200px">${popts}</select>
        <select id="eq-inst" style="max-width:150px">${iopts}</select>
        <button class="btn small-btn" onclick="agregarIntegrante()">+ Agregar</button>
        <button class="btn ghost small-btn" onclick="avisarEquipo()">📣 Avisar al equipo</button></div>`;
    }
    $('plan').className='';
    $('plan').innerHTML=`<div class="sub-bloque"><div class="sub-titulo">🗓️ Ensayo</div>${ensayoHtml}</div>
      <div class="sub-bloque"><div class="sub-titulo">🎸 Equipo (${numPersonas})</div>${equipoHtml}${addHtml}</div>`;
  }catch{ $('plan').innerHTML='<p class="error">No se pudo cargar el plan.</p>'; }
}
async function guardarEnsayo(){
  const body={fecha:fechaSelectValor('en'),hora:$('en-hora').value,lugar:$('en-lugar').value.trim()};
  try{ await api('/musica/plan/'+window._planEv+'/ensayo',{method:'POST',body:JSON.stringify(body)}); toast('🗓️ Ensayo guardado'); cargarPlan(window._planEv); }
  catch(e){ toast(e.message); }
}
async function agregarIntegrante(){
  const body={persona_id:$('eq-persona').value,instrumento:$('eq-inst').value};
  try{ const r=await api('/musica/plan/'+window._planEv+'/equipo',{method:'POST',body:JSON.stringify(body)}); toast('🎵 Integrante agregado y avisado'+(r.aviso?'  ⚠️ '+r.aviso:'')); cargarPlan(window._planEv); }
  catch(e){ toast(e.message); }
}
function quitarIntegrante(id){ modalConfirm('¿Quitar a este integrante del equipo?', async()=>{
  try{ await api('/musica/plan/equipo/'+id,{method:'DELETE'}); cargarPlan(window._planEv); toast('Integrante quitado del equipo'); }
  catch(e){ toast(e.message); } }); }
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
        ? `<button type="button" class="btn-plano mus-himnario" style="font-weight:700" onclick="abrirHimnario()">🎵 ${escHtml(m.titulo)}</button>`
        : `<b>${escHtml(m.titulo)}</b>`;
      const sub = esHimnario
        ? `<div class="muted small"><a href="javascript:abrirHimnario()">🔎 Abrir cancionero (buscar y transponer)</a> · <a href="${escHtml(safeUrl(m.archivo_url))}" target="_blank">descargar PDF</a></div>`
        : `<div class="muted small">📎 <a href="${escHtml(safeUrl(m.archivo_url))}" target="_blank">Ver / descargar</a>${m.creado_en?' · '+escHtml(fechaDeUTC(m.creado_en)):''}</div>`;
      return `<div class="item-card flex">
      <div style="flex:1">${titulo}${permanente?' <span class="estado-chip">📌 Fijo</span>':''}${sub}</div>
      ${puedeBorrar?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar material" onclick="borrarMaterialMus(${m.id})">🗑️</button>`:''}</div>`;
    }).join('');
  }catch{ $('material-mus').innerHTML='<p class="error">Error al cargar el material.</p>'; }
}
function toggleFormMaterialMus(){
  const z=$('form-material-mus'); if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div class="form-panel">
    <input id="mm-titulo" placeholder="Título (ej. Acordes Cuán Grande es Él)"/>
    <label for="mm-file" style="margin-top:10px">📎 Archivo (PDF, Word, imagen…)</label>
    <input id="mm-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"/>
    <button class="btn small-btn" style="margin-top:12px" onclick="guardarMaterialMus()">Subir</button></div>`;
}
async function guardarMaterialMus(){
  const titulo=$('mm-titulo').value.trim();
  if(!titulo){ toast('Pon un título'); return; }
  const file=$('mm-file').files[0];
  if(!file){ toast('Elige un archivo'); return; }
  // Subir por datos móviles tarda, y el aviso "Subiendo…" se borraba solo a los
  // 2,8 s: el botón seguía vivo y sin cambiar de aspecto, así que quien tocaba
  // otra vez subía el archivo dos veces. El texto del botón lo dice mientras dura.
  await conBoton(botonActual(), async()=>{
    try{
      const archivo_url=await uploadArchivo(file);
      await api('/musica/material',{method:'POST',body:JSON.stringify({titulo,archivo_url})});
      $('form-material-mus').innerHTML=''; cargarMaterialMusica(); toast('📎 Material compartido');
    }catch(e){ toast(e.message); }
  }, 'Subiendo…');
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
/* _esc: alias eliminado — usar escHtml directamente (una sola fuente de verdad) */
// Devuelve HTML: líneas de acordes con los acordes resaltados y transpuestos.
function _renderAcordes(contenido,n){
  return contenido.split('\n').map(l=>{
    if(_esLineaAcordes(l)) return l.replace(/\S+/g, t=> _esAcorde(t)? `<span class="ac">${escHtml(_transAcorde(t,n))}</span>` : escHtml(t));
    return escHtml(l);
  }).join('\n');
}

// El himnario tiene DOS secciones y la numeración se reinicia en la segunda, así
// que el número NO identifica a un himno: el 45 existe dos veces. Cada himno
// trae un `id` estable ("2-45"). Esto le pone uno a los que vengan de una copia
// vieja guardada en el teléfono, que se grabó antes de que el campo existiera.
function _normalizarHimnos(lista){
  let sec=1, prev=0;
  for(const h of (lista||[])){
    if(h.n<=prev) sec++;
    if(!h.seccion) h.seccion=sec;
    prev=h.n;
    if(!h.id) h.id=`${h.seccion}-${h.n}`;
  }
  return lista||[];
}
async function _cargarHimnos(){
  if(window._himnos) return window._himnos;
  try{
    const r=await fetch('/assets/himnario.json'); const j=await r.json();
    window._himnos=_normalizarHimnos(j); try{ localStorage.setItem('himnario_json', JSON.stringify(j)); }catch{}
  }catch{
    try{ window._himnos=_normalizarHimnos(JSON.parse(localStorage.getItem('himnario_json')||'[]')); }catch{ window._himnos=[]; }
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
      <input id="hm-buscar" placeholder="Buscar alabanza…" oninput="himnarioBuscar(this.value)" style="max-width:260px;margin:0"/>
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
  // Se pintan TODOS. Antes se cortaba en 300 y, con 522 himnos, los últimos no
  // aparecían nunca al abrir el himnario: había que adivinar el título para que
  // el buscador los sacara. Son 522 <div>: el navegador con eso no se despeina.
  cont.innerHTML=lista.map(h=>`<button type="button" class="btn-plano hmodal-song ${_hmSel&&_hmSel.id===h.id?'sel':''}" onclick="himnarioSel(${escJsAttr(h.id)})">
    <b>#${h.n}</b> ${escHtml(h.titulo)} <span class="muted small">(${escHtml(h.tono||'')})</span>${h.seccion===2?' <span class="muted small">· coros</span>':''}</button>`).join('');
}
// Se selecciona por `id`, no por número: los números se repiten entre las dos
// secciones y un find(h=>h.n===n) devolvía SIEMPRE el de la primera. Tocar
// cualquier corito abría el himno tradicional que compartía número, así que
// media colección era inalcanzable desde la app.
function himnarioSel(id){
  _hmSel=(window._himnos||[]).find(h=>h.id===id); _hmTrans=0;
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
      <h3 style="flex:1;font-size:17px;margin:0">#${_hmSel.n} ${escHtml(_hmSel.titulo)}${_hmSel.seccion===2?' <span class="muted small" style="font-weight:400">· coros</span>':''}</h3>
    </div>
    ${_hmSel.nota?`<p class="muted small" style="margin:4px 0 0">✏️ ${escHtml(_hmSel.nota)}</p>`:''}
    <div class="transbar">
      <span class="muted small">Tono:</span> <b style="color:var(--primary)">${escHtml(tonoAhora)||'—'}</b>
      <button class="cal-navbtn" onclick="himnarioTrans(-1)" title="Bajar ½ tono" aria-label="Bajar medio tono">−</button>
      <button class="cal-navbtn" onclick="himnarioTrans(1)" title="Subir ½ tono" aria-label="Subir medio tono">+</button>
      ${_hmTrans!==0?`<button class="btn ghost small-btn" onclick="himnarioReset()">Original (${escHtml(tonoBase)})</button>`:''}
      <span class="muted small">${_hmTrans>0?'+'+_hmTrans:_hmTrans} semitono(s)</span>
    </div>
    ${_hmSel.sin_letra
      ? '<p class="muted small" style="margin-top:12px">Esta alabanza aparece en el himnario solo con el título: el documento no trae su letra ni sus acordes.</p>'
      : `<div class="acordes">${_renderAcordes(_hmSel.contenido||'', _hmTrans)}</div>`}`;
}

// ---------- VISOR DE CANCIÓN DEL CANCIONERO (con transpositor) ----------
// Reusa la misma maquinaria de acordes que el Himnario (_renderAcordes/_transAcorde).
// Semitonos para pasar de un tono base a otro (ej. base SOL → tono del día LA = +2).
function _semitonosEntre(base, destino){
  const idx=t=>{ const s=String(t||'').toUpperCase(); let m=s.match(_RAIZ); if(m) return _ES2I[m[0]];
    m=s.match(/^([A-G](#|B)?)/); return m?_EN2I[m[0]]:undefined; };
  const a=idx(base), b=idx(destino);
  if(a===undefined||b===undefined) return 0;
  return ((b-a)%12+12)%12;
}
let _vcSel=null, _vcTrans=0;
function abrirVisorCancion(id, trans){
  const c=(window._canciones||[]).find(x=>x.id===id); if(!c){ toast('Canción no disponible'); return; }
  _vcSel=c; _vcTrans=trans||0;
  let ov=$('vc-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='vc-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  const puede=esLiderMusicaUI();
  ov.innerHTML=`<div class="hmodal" onclick="event.stopPropagation()">
    <div class="hmodal-head">
      <b style="flex:1;font-size:16px">🎵 ${escHtml(c.titulo)}</b>
      ${puede?`<button class="cal-navbtn" onclick="editarLetraCancion(${c.id})" title="Editar acordes" aria-label="Editar acordes">✏️</button>`:''}
      <button class="cal-navbtn" onclick="cerrarVisorCancion()" aria-label="Cerrar" style="margin-left:8px">✕</button>
    </div>
    <div class="hmodal-body"><div class="hmodal-ver" id="vc-ver" style="width:100%">…</div></div></div>`;
  ov.onclick=cerrarVisorCancion;
  renderVisorCancion();
}
// Abre desde el setlist: transpone al tono del día (si hay) respecto al tono base.
function abrirVisorSetlist(cancionId, tonoDia){
  const c=(window._canciones||[]).find(x=>x.id===cancionId);
  const n=(c&&tonoDia)?_semitonosEntre(c.tono, tonoDia):0;
  abrirVisorCancion(cancionId, n);
}
function cerrarVisorCancion(){ const ov=$('vc-ov'); if(ov) ov.remove(); }
function visorCancionTrans(d){ _vcTrans+=d; renderVisorCancion(); }
function visorCancionReset(){ _vcTrans=0; renderVisorCancion(); }
function renderVisorCancion(){
  const v=$('vc-ver'); if(!v||!_vcSel) return;
  const c=_vcSel;
  if(!(c.letra||'').trim()){
    v.innerHTML=`<p class="muted small">Esta canción aún no tiene acordes cargados.${esLiderMusicaUI()?' Toca ✏️ arriba para agregarlos.':''}</p>`;
    return;
  }
  const tonoBase=c.tono||'';
  const tonoAhora=tonoBase?_transAcorde(tonoBase,_vcTrans):'';
  v.innerHTML=`<div class="transbar">
      <span class="muted small">${c.autor?escHtml(c.autor)+' · ':''}Tono:</span> <b style="color:var(--primary)">${escHtml(tonoAhora)||'—'}</b>
      <button class="cal-navbtn" onclick="visorCancionTrans(-1)" title="Bajar ½ tono" aria-label="Bajar medio tono">−</button>
      <button class="cal-navbtn" onclick="visorCancionTrans(1)" title="Subir ½ tono" aria-label="Subir medio tono">+</button>
      ${_vcTrans!==0?`<button class="btn ghost small-btn" onclick="visorCancionReset()">Original${tonoBase?' ('+escHtml(tonoBase)+')':''}</button>`:''}
      <span class="muted small">${_vcTrans>0?'+'+_vcTrans:_vcTrans} semitono(s)</span>
    </div>
    <div class="acordes">${_renderAcordes(c.letra||'', _vcTrans)}</div>`;
}
function editarLetraCancion(id){
  const c=(window._canciones||[]).find(x=>x.id===id); if(!c) return;
  const v=$('vc-ver'); if(!v) return;
  v.innerHTML=`<label for="vc-tono">Tono base</label>
    <input id="vc-tono" value="${escHtml(c.tono||'')}" placeholder="ej. SOL, G" style="max-width:140px"/>
    <label for="vc-letra" style="margin-top:10px">Acordes / letra</label>
    <textarea id="vc-letra" rows="14" style="width:100%;font-family:monospace;white-space:pre">${escHtml(c.letra||'')}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn small-btn" onclick="guardarLetraCancion(${id})">Guardar</button>
      <button class="btn ghost small-btn" onclick="renderVisorCancion()">Cancelar</button></div>`;
}
async function guardarLetraCancion(id){
  const c=(window._canciones||[]).find(x=>x.id===id); if(!c) return;
  const body={titulo:c.titulo, autor:c.autor, enlace:c.enlace, tono:$('vc-tono').value.trim(), letra:$('vc-letra').value};
  try{
    await api('/musica/canciones/'+id,{method:'PATCH',body:JSON.stringify(body)});
    c.tono=body.tono; c.letra=body.letra;   // refresca la copia en memoria/caché
    try{ localStorage.setItem(_claveCanciones(), JSON.stringify(window._canciones||[])); }catch{}
    toast('✅ Acordes guardados'); _vcTrans=0; renderVisorCancion();
    renderCanciones($('buscar-cancion')?$('buscar-cancion').value:'');
  }catch(e){ toast(e.message); }
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
      return `<button type="button" class="btn-plano item-card flex" onclick="verCaso(${c.id})">
        <div style="flex:1"><b>${MOTIVO_ICON[c.motivo]||'❔'} ${escHtml(c.nombre)}</b><div class="muted small">${cap(c.motivo||'')}</div></div>
        <span class="estado-chip ${cls}">${si} ${sl}</span></button>`;}).join('');
  }catch(e){ $('lista-casos').innerHTML='<p class="error">'+e.message+'</p>'; }
}
async function toggleFormCaso(){
  const z=$('form-caso'); if(z.innerHTML){ z.innerHTML=''; return; }
  let personas;
  try{ personas=await api('/personas'); }catch(e){ toast(e.message||'No se pudo cargar la lista de personas'); return; }
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>Nuevo caso</h3>
    <label for="caso-persona">Persona</label><select id="caso-persona">${personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('')}</select>
    <label for="caso-motivo">Motivo</label><select id="caso-motivo">
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
      <h3>${MOTIVO_ICON[d.caso.motivo]||'❔'} ${escHtml(d.caso.nombre)}</h3>
      <div class="muted small">Motivo: ${cap(d.caso.motivo||'')} · <span class="estado-chip ${cls}">${si} ${sl}</span></div>
      ${d.caso.telefono?`<div class="muted small" style="margin-top:4px">📞 ${escHtml(d.caso.telefono)}</div>`:''}
      <div style="margin-top:16px;font-weight:700">Historial de cuidado</div>
      <div class="list" style="margin-top:8px">${d.contactos.length? d.contactos.map(x=>`<div class="item-card">
        <b>${CT_LABEL[x.tipo]||escHtml(x.tipo)}</b> <span class="muted small">${escHtml(fechaDeUTC(x.fecha))}</span>
        ${x.nota?`<div class="muted small">${escHtml(x.nota)}</div>`:''}</div>`).join('') : '<p class="muted small">Sin contactos aún.</p>'}</div>
      <label for="ct-tipo">Registrar contacto</label>
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
//  MENSAJES DEL PORTAL PÚBLICO (solo el pastor)
//  Los manda gente sin cuenta desde "Planifica tu visita". Antes se guardaban
//  y no los leía nadie: no había ninguna pantalla que los mostrara.
// ============================================================
let _mpOffset=0, _mpPreviosOffset=0;
// La seccion de "anteriores" es un desplegable de verdad: se abre Y se cierra.
// _mpPreviosCargados evita volver a pedirlos al reabrir — plegar solo oculta.
let _mpPreviosAbierto=false, _mpPreviosCargados=false, _mpPreviosTotal=0;

// Un solo lugar para el chip de estado: lo usan filaMensajePortal (al listar)
// y atenderMensajePortal (al marcar, sin recargar la tarjeta) — si vivieran
// duplicados, la tarjeta recien marcada podria verse distinta de las demas
// hasta la proxima recarga.
function chipMensajePortal(estado){
  return estado==='atendido'
    ? '<span class="estado-chip estado-aceptado">✅ Atendido</span>'
    : estado==='previo'
    ? '<span class="estado-chip estado-pendiente">📥 Anterior</span>'
    : '<span class="estado-chip estado-pendiente">🆕 Nuevo</span>';
}

// El texto de aquí lo escribe un desconocido de internet, sin cuenta y sin
// moderación: es el dato menos confiable de la app. escHtml SIEMPRE.
function filaMensajePortal(m){
  const chip = chipMensajePortal(m.estado);
  const boton = m.estado==='atendido' ? ''
    : `<button class="btn ghost small-btn" onclick="atenderMensajePortal(${m.id})">Marcar atendido</button>`;
  // id en la tarjeta y en el bloque de accion: asi atenderMensajePortal puede
  // actualizar solo esta tarjeta sin recargar toda la vista (ver esa funcion).
  return `<div class="item-card flex" style="margin-top:10px;align-items:flex-start" id="mp-msg-${m.id}">
      <div style="flex:1"><b>${escHtml(m.nombre)}</b>
        <div class="muted small" style="white-space:pre-wrap;margin-top:4px">${escHtml(m.mensaje)}</div>
        <div class="muted small" style="margin-top:6px">${escHtml(fechaDeUTC(m.creado_en))}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0" id="mp-accion-${m.id}">
        ${chip}${boton}
      </div>
    </div>`;
}

async function vistaMensajesPortal(){
  _mpOffset=0; _mpPreviosOffset=0; _mpPreviosAbierto=false; _mpPreviosCargados=false; _mpPreviosTotal=0;
  $('content').innerHTML='<div id="mp" class="muted">Cargando…</div>';
  try{
    const d=await api('/publico/mensajes');
    const z=$('mp'); z.className='';
    const lista = d.items.length
      ? d.items.map(filaMensajePortal).join('')
      : '<div class="placeholder"><div class="big">📬</div><p>No hay mensajes del portal.</p></div>';
    // La sección de los anteriores nace PLEGADA: es lo que evita que la primera
    // apertura sea un muro de meses acumulados. El número va a la vista para
    // que no se ignoren sin querer.
    _mpPreviosTotal=d.previos;
    const previos = d.previos>0
      ? `<button class="link" id="mp-ver-previos" style="margin-top:18px"
                 aria-expanded="false" aria-controls="mp-previos" onclick="verPreviosPortal()">
           <span id="mp-previos-flecha">▸</span> 📥 <span id="mp-previos-txt">Mensajes anteriores a esta bandeja (${d.previos})</span></button>
         <div id="mp-previos" style="display:none"></div>`
      : '';
    z.innerHTML=`<div id="mp-lista">${lista}</div>
      ${d.hayMas?'<button class="btn ghost small-btn" id="mp-mas" style="margin-top:10px" onclick="cargarMasMensajesPortal()">Ver más</button>':''}
      ${previos}`;
  }catch(e){ $('mp').innerHTML='<p class="error">'+escHtml(e.message||'No se pudieron cargar')+'</p>'; }
}

async function cargarMasMensajesPortal(){
  await conBoton($('mp-mas'), async()=>{
    const siguiente=_mpOffset+50;
    try{
      const d=await api('/publico/mensajes?offset='+siguiente);
      _mpOffset=siguiente;
      $('mp-lista').insertAdjacentHTML('beforeend', d.items.map(filaMensajePortal).join(''));
      if(!d.hayMas){ const b=$('mp-mas'); if(b) b.remove(); }
    }catch(e){ toast(e.message); }
  });
}

// Abre y CIERRA la seccion de anteriores. Antes solo abria: la flecha ▸
// prometia un desplegable y no habia forma de volver a plegarlo, asi que una vez
// abierto el muro de meses se quedaba delante de lo nuevo hasta cambiar de
// pantalla. La cabecera conserva siempre su etiqueta y su numero; la paginacion
// vive DENTRO de la caja, para que plegar se la lleve tambien.
async function verPreviosPortal(){
  const caja=$('mp-previos'), flecha=$('mp-previos-flecha'), btn=$('mp-ver-previos');
  if(!caja) return;

  if(_mpPreviosAbierto){
    // Plegar no descarta nada: solo oculta. Al reabrir sigue lo que ya se trajo.
    _mpPreviosAbierto=false;
    caja.style.display='none';
    if(flecha) flecha.textContent='▸';
    if(btn) btn.setAttribute('aria-expanded','false');
    return;
  }

  _mpPreviosAbierto=true;
  caja.style.display='';
  if(flecha) flecha.textContent='▾';
  if(btn) btn.setAttribute('aria-expanded','true');
  if(_mpPreviosCargados) return;   // ya estan en el DOM: no se vuelve a pedir

  await conBoton(btn, async()=>{
    try{
      const d=await api('/publico/mensajes?previos=1&offset=0');
      _mpPreviosOffset=0; _mpPreviosCargados=true;
      caja.innerHTML=d.items.map(filaMensajePortal).join('');
      if(d.hayMas) _mpAnadirBotonMasPrevios(caja);
    }catch(e){
      toast(e.message);
      // Si fallo, se vuelve a PLEGAR del todo. Dejarla abierta y vacia era peor
      // que no abrirla: la cabecera seguiria diciendo "(12)" sobre una caja sin
      // nada —o sea, un numero que contradice lo que se ve— y el siguiente clic
      // habria CERRADO en vez de reintentar, porque para el estado ya estaba
      // abierta. Justo la clase de flecha que promete algo que no cumple, que es
      // lo que este arreglo vino a quitar. Asi el clic obvio reintenta.
      _mpPreviosCargados=false;
      _mpPreviosAbierto=false;
      caja.style.display='none';
      if(flecha) flecha.textContent='▸';
      if(btn) btn.setAttribute('aria-expanded','false');
    }
  });
}

// El "ver mas" de los anteriores va dentro de la caja plegable, no fuera: si
// estuviera fuera seguiria visible con la seccion cerrada.
function _mpAnadirBotonMasPrevios(caja){
  const b=document.createElement('button');
  b.className='btn ghost small-btn';
  b.id='mp-previos-mas';
  b.style.marginTop='10px';
  b.textContent='Ver más anteriores';
  b.onclick=cargarMasPreviosPortal;
  caja.appendChild(b);
}

async function cargarMasPreviosPortal(){
  await conBoton($('mp-previos-mas'), async()=>{
    const siguiente=_mpPreviosOffset+50;
    try{
      const d=await api('/publico/mensajes?previos=1&offset='+siguiente);
      _mpPreviosOffset=siguiente;
      const b=$('mp-previos-mas');
      // beforebegin: las filas nuevas van ANTES del boton, que sigue al final.
      if(b) b.insertAdjacentHTML('beforebegin', d.items.map(filaMensajePortal).join(''));
      if(!d.hayMas && b) b.remove();
    }catch(e){ toast(e.message); }
  });
}

async function atenderMensajePortal(id){
  try{
    await api('/publico/mensajes/'+id+'/atender',{method:'PATCH'});
    toast('✅ Marcado como atendido');
    // Se actualiza SOLO esta tarjeta, en vez de recargar toda la vista: una
    // recarga completa reseteaba los offsets de paginacion y volvia a plegar
    // la seccion de "mensajes anteriores" aunque el pastor la hubiera abierto.
    const acciones=$('mp-accion-'+id);
    if(acciones) acciones.innerHTML=chipMensajePortal('atendido');

    // Si el que se atendio era uno de los ANTERIORES, baja el numero de la
    // cabecera. Antes daba igual porque ese numero solo se veia con la seccion
    // plegada y estando plegada no habia tarjetas que marcar; ahora que se puede
    // volver a plegar, un numero sin bajar seria una cuenta que miente.
    const caja=$('mp-previos');
    if(caja && acciones && caja.contains(acciones) && _mpPreviosTotal>0){
      _mpPreviosTotal--;
      const txt=$('mp-previos-txt');
      if(txt) txt.textContent=`Mensajes anteriores a esta bandeja (${_mpPreviosTotal})`;
    }
  }catch(e){ toast(e.message); }
}

// ============================================================
//  FASE 3: TESORERÍA (contabilidad + transparencia)
// ============================================================
// Formato unico de dinero para toda la app (CLP: miles con punto, sin decimales).
// Antes convivian dos: 'es-MX' aqui y 'es-CL' en Organizacion, asi que el mismo
// monto se veia distinto segun el modulo.
function money(n){ return '$'+Number(n||0).toLocaleString('es-CL'); }

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
        <div class="widget"><div class="widget-head">↑ Ingresos del mes</div><div class="stat-num" style="color:var(--green-tx)">${money(res.ingMes)}</div></div>
        <div class="widget"><div class="widget-head">↓ Gastos del mes</div><div class="stat-num" style="color:var(--red-tx)">${money(res.gasMes)}</div></div>
      </div>
      ${esTesoreroUI()
        ? `<div class="row" style="margin-bottom:14px">
        <button class="btn small-btn" onclick="formMov('ingreso')">+ Ingreso</button>
        <button class="btn ghost small-btn" onclick="formMov('gasto')">+ Gasto</button></div>`
        : `<p class="muted small" style="margin-bottom:14px">👁️ Solo lectura — solo el tesorero registra movimientos.</p>`}
      <div id="mov-form"></div>
      <div class="card" style="margin-bottom:18px"><div class="widget-head">🎯 Campañas</div>
        ${esTesoreroUI()?`<div class="row" style="margin:10px 0">
          <button class="btn small-btn" onclick="formCampania()">+ Campaña</button></div>
          <div id="camp-form"></div>`:''}
        ${camps.filter(c=>!c.cerrada_en).length
          ? camps.filter(c=>!c.cerrada_en).map(filaCampania).join('')
          : `<p class="muted small">Todavía no hay campañas.${esTesoreroUI()?' Una campaña sirve para juntar para algo concreto —el techo, un viaje misionero— y ver cuánto falta.':''}</p>`}
        ${camps.some(c=>c.cerrada_en)
          ? `<div class="widget-head" style="margin-top:20px">Cerradas</div>
             ${camps.filter(c=>c.cerrada_en).map(filaCampaniaCerrada).join('')}`
          : ''}
      </div>
      <div class="card" style="margin-bottom:18px"><div class="widget-head">🔓 Transparencia</div>
        <p class="small" style="margin:6px 0 14px">Recaudado <b>${money(trans.recaudado)}</b> · Usado <b>${money(trans.gastado)}</b> · Saldo <b>${money(trans.saldo)}</b></p>
        ${trans.porCategoria.length
          ? trans.porCategoria.map(g=>{const pct=trans.gastado?Math.round(g.monto/trans.gastado*100):0;
              return `<div class="dato-row"><span>${cap(g.categoria)}</span><span class="val">${pct}% · ${money(g.monto)}</span></div>`;}).join('')
          : '<p class="muted small">Cuando se registren gastos, aquí se verá en qué se fue el dinero.</p>'}
      </div>
      <div class="card"><div class="widget-head">Movimientos</div>
        <div class="list" id="mov-list" style="margin-top:8px">${movs.length
          ? movs.map(filaMov).join('')
          : `<p class="muted small">Todavía no hay movimientos registrados.${esTesoreroUI()?' Toca «+ Ingreso» para anotar la primera ofrenda.':''}</p>`}</div>
        ${hayMas?`<button class="btn ghost small-btn" id="mov-mas" style="margin-top:10px" onclick="cargarMasMovimientos()">Ver más</button>`:''}
      </div>`;
  }catch(e){ $('tz').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function filaMov(m){
  return `<div class="item-card flex">
    <div style="flex:1"><b>${m.tipo==='ingreso'?'↑':'↓'} ${m.campania_nombre?escHtml(m.campania_nombre):escHtml(cap(m.categoria||m.tipo))}</b>
    <div class="muted small">${escHtml(m.descripcion||'')} · ${escHtml(m.fecha)}${m.comprobante_url?` · 📎 <a href="${escHtml(safeUrl(m.comprobante_url))}" target="_blank">comprobante</a>`:''}</div></div>
    <b style="color:${m.tipo==='ingreso'?'var(--green-tx)':'var(--red-tx)'}">${m.tipo==='ingreso'?'+':'−'}${money(m.monto)}</b></div>`;
}
// Una campania activa. Sin meta NO se pinta barra: con el codigo anterior
// saldria "$50.000 / $0" y una barra al 0%, que se lee como un error.
function filaCampania(c){
  const pct = c.meta ? Math.min(100, Math.round(c.recaudado/c.meta*100)) : null;
  return `<div style="margin:14px 0">
    <div style="display:flex;justify-content:space-between;font-size:14px">
      <b>${escHtml(c.nombre)}</b>
      <span class="muted">${money(c.recaudado)}${c.meta?' / '+money(c.meta):''}</span></div>
    ${pct===null?'':`<div class="trend-track" style="margin-top:6px"><div class="trend-bar" style="width:${pct}%">${pct}%</div></div>`}
    ${esTesoreroUI()?`<div class="row" style="margin-top:8px">
      <button class="btn ghost small-btn" onclick="formAporte(${c.id})">+ Aporte</button>
      <button class="btn ghost small-btn" onclick="cerrarCampania(${c.id})">Cerrar campaña</button></div>
      <div id="aporte-form-${c.id}"></div>`:''}
    ${c.aportes.length?`<div class="list" style="margin-top:8px">${c.aportes.map(a=>`
      <div class="item-card flex">
        <span class="muted small">${escHtml(fechaTxt(a.fecha))}</span>
        <b style="flex:1;text-align:right">${money(a.monto)}</b>
        ${esTesoreroUI()?`<button class="btn-ico" title="Borrar este aporte" onclick="borrarAporte(${c.id},${a.id})">🗑️</button>`:''}
      </div>`).join('')}</div>`:''}
  </div>`;
}
// Una campania cerrada: se consulta, no se toca. Ningun boton.
function filaCampaniaCerrada(c){
  return `<div style="margin:12px 0;opacity:.75">
    <div style="display:flex;justify-content:space-between;font-size:14px">
      <b>${escHtml(c.nombre)}</b>
      <span class="muted">${money(c.recaudado)}${c.meta?' / '+money(c.meta):''}</span></div>
    <div class="muted small">Cerrada el ${escHtml(fechaDeUTC(c.cerrada_en))}</div>
  </div>`;
}
async function cargarMasMovimientos(){
  const btn=$('mov-mas');
  await conBoton(btn, async()=>{
    const offsetSiguiente=_movOffset+50;
    try{
      const resp=await api('/tesoreria/movimientos?offset='+offsetSiguiente);
      const items=Array.isArray(resp)?resp:(resp.items||[]);
      const hayMas=Array.isArray(resp)?false:!!resp.hayMas;
      _movOffset=offsetSiguiente;
      $('mov-list').insertAdjacentHTML('beforeend', items.map(filaMov).join(''));
      if(!hayMas){ const b=$('mov-mas'); if(b) b.remove(); }
    }catch(e){ toast(e.message); }
  });
}
function formMov(tipo){
  const z=$('mov-form');
  const cats=tipo==='ingreso'?['ofrenda','diezmo','donacion','otro']:['servicios','eventos','ayuda','otro'];
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>${tipo==='ingreso'?'Nuevo ingreso':'Nuevo gasto'}</h3>
    <label for="mv-cat">Categoría</label><select id="mv-cat">${cats.map(c=>`<option value="${c}">${cap(c)}</option>`).join('')}</select>
    <label for="mv-monto">Monto</label><input id="mv-monto" type="number" min="0.01" step="0.01" placeholder="0" />
    <label>Fecha ${tipo==='ingreso'?'del ingreso':'del gasto'}</label><div>${fechaSelectHTML('mv','')}</div>
    <label for="mv-desc">${tipo==='ingreso'?'Descripción / origen':'¿En qué se gastó?'}</label>
    <input id="mv-desc" placeholder="${tipo==='ingreso'?'Ej. Ofrenda dominical':'Ej. Compra de materiales para el evento'}" />
    <label for="mv-file">📎 Comprobante / voucher (foto o archivo)</label>
    <input id="mv-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" />
    <p id="mv-error" class="error"></p>
    <button class="btn" style="margin-top:12px" onclick="guardarMov('${tipo}')">Guardar</button></div>`;
}
async function guardarMov(tipo){
  const monto=$('mv-monto').value;
  if(!(Number(monto)>0)){ $('mv-error').textContent='Monto inválido'; toast('Monto inválido'); return; }
  await conBoton(botonActual(), async()=>{
    try{
      let comprobante_url='';
      const f=$('mv-file').files[0];
      if(f){ toast('Subiendo comprobante…'); comprobante_url=await uploadArchivo(f); }
      const body={tipo,categoria:$('mv-cat').value,monto,descripcion:$('mv-desc').value.trim(),fecha:fechaSelectValor('mv'),comprobante_url};
      await api('/tesoreria/movimientos',{method:'POST',body:JSON.stringify(body)}); toast('💰 Registrado'); vistaTesoreria();
    }catch(e){ $('mv-error').textContent=e.message; }
  });
}

// Crear campaña: la meta es OPCIONAL (una campaña puede juntar "lo que se
// pueda" sin un tope fijado de antemano).
function formCampania(){
  const z=$('camp-form'); if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>Nueva campaña</h3>
    <label for="cp-nombre">Nombre</label><input id="cp-nombre" placeholder="Ej. Techo nuevo" />
    <label for="cp-meta">Meta (opcional)</label><input id="cp-meta" type="number" min="0.01" step="0.01" placeholder="$0" />
    <p id="cp-error" class="error"></p>
    <div class="row" style="margin-top:12px">
      <button class="btn small-btn" onclick="guardarCampania()">Crear</button>
      <button class="btn ghost small-btn" onclick="$('camp-form').innerHTML=''">Cancelar</button></div></div>`;
}
async function guardarCampania(){
  const nombre=$('cp-nombre').value.trim();
  if(!nombre){ $('cp-error').textContent='Ponle un nombre a la campaña'; return; }
  const metaTxt=$('cp-meta').value;
  await conBoton(botonActual(), async()=>{
    try{
      const body={nombre};
      if(metaTxt) body.meta=metaTxt;
      await api('/tesoreria/campanias',{method:'POST',body:JSON.stringify(body)});
      toast('🎯 Campaña creada'); vistaTesoreria();
    }catch(e){ $('cp-error').textContent=e.message; }
  });
}
// Aportar: el formulario vive DENTRO de la tarjeta de la campaña (un
// contenedor por campaña), no uno solo compartido, porque puede haber varias
// campañas activas a la vez.
function formAporte(id){
  const z=$('aporte-form-'+id); if(!z) return;
  if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div class="card" style="margin:10px 0"><h3>Nuevo aporte</h3>
    <label for="ap-monto-${id}">Monto</label><input id="ap-monto-${id}" type="number" min="0.01" step="0.01" placeholder="0" />
    <p id="ap-error-${id}" class="error"></p>
    <div class="row" style="margin-top:12px">
      <button class="btn small-btn" onclick="guardarAporte(${id})">Guardar</button>
      <button class="btn ghost small-btn" onclick="$('aporte-form-${id}').innerHTML=''">Cancelar</button></div></div>`;
}
async function guardarAporte(id){
  const monto=$('ap-monto-'+id).value;
  if(!(Number(monto)>0)){ $('ap-error-'+id).textContent='Monto inválido'; return; }
  await conBoton(botonActual(), async()=>{
    try{
      await api('/tesoreria/campanias/'+id+'/aportar',{method:'PATCH',body:JSON.stringify({monto})});
      toast('💰 Aporte registrado'); vistaTesoreria();
    }catch(e){ $('ap-error-'+id).textContent=e.message; }
  });
}
// Borrar un aporte: se está borrando dinero, así que pide confirmación.
function borrarAporte(campaniaId, movId){
  modalConfirm('¿Borrar este aporte? El monto se descuenta de la campaña y de los movimientos. No se puede deshacer.', async()=>{
    try{
      await api('/tesoreria/campanias/'+campaniaId+'/aportes/'+movId,{method:'DELETE'});
      toast('Aporte borrado'); vistaTesoreria();
    }catch(e){ toast(e.message); }
  }, {okLabel:'Sí, borrar', danger:true});
}
// Cerrar una campaña: no se puede reabrir, así que pide confirmación.
function cerrarCampania(id){
  modalConfirm('¿Cerrar esta campaña? Ya no admitirá más aportes y no se puede reabrir.', async()=>{
    try{
      await api('/tesoreria/campanias/'+id+'/cerrar',{method:'PATCH'});
      toast('🎯 Campaña cerrada'); vistaTesoreria();
    }catch(e){ toast(e.message); }
  }, {okLabel:'Sí, cerrar', danger:true});
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
    c.innerHTML=cl.map(x=>`<button type="button" class="btn-plano module-card" onclick="vistaClase(${x.id},${escJsAttr(x.nombre||'')})">
      <div class="icon">📚</div><div class="label">${escHtml(x.nombre)}</div>
      <div class="muted small">${escHtml(x.edad||'')} · ${x.ninos} niños</div></button>`).join('');
  }catch(e){ $('clases').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function formClase(){ const z=$('form-clase'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>Nueva clase</h3>
    <label for="cl-nombre">Nombre</label><input id="cl-nombre" placeholder="Ej. Primarios"/>
    <label for="cl-edad">Edades</label><input id="cl-edad" placeholder="Ej. 6-8 años"/>
    <button class="btn" style="margin-top:12px" onclick="guardarClase()">Crear</button></div>`; }
async function guardarClase(){
  try{ await api('/ninos/clases',{method:'POST',body:JSON.stringify({nombre:$('cl-nombre').value.trim(),edad:$('cl-edad').value.trim()})});
    $('form-clase').innerHTML=''; cargarClases(); toast('Clase creada'); }catch(e){ toast(e.message);} }

async function vistaClase(id,nombre){
  _claseActual=id;
  const editar=esLiderEdUI();
  $('content').innerHTML=`<button class="link" onclick="vistaNinos()">‹ Clases</button><h2>📚 ${escHtml(nombre||'Clase')}</h2>
    <div class="card" style="margin:12px 0"><div class="head-row"><h3 style="font-size:16px">📖 Material</h3>
      ${editar?`<button class="btn small-btn" onclick="formMaterial()">+ Lección</button>`:''}</div>
      <div id="form-material"></div><div id="material" class="muted">…</div></div>
    <div class="card" style="margin-bottom:14px"><div class="head-row"><h3 style="font-size:16px">👦 Niños</h3>
      ${editar?`<button class="btn small-btn" onclick="formNino()">+ Niño</button>`:''}</div>
      <div id="form-nino"></div><div id="ninos-lista" class="muted">…</div></div>`;
  cargarMaterial(); cargarNinos();
}
async function cargarMaterial(){
  const c=$('material');
  try{ const m=await api('/ninos/clase/'+_claseActual+'/material');
    c.className=m.length?'list':'muted';
    c.innerHTML=m.length? m.map(x=>`<div class="item-card"><b>${escHtml(x.titulo)}</b>${x.fecha?' <span class="muted small">· '+fechaTxt(x.fecha)+'</span>':''}
      ${x.versiculo?`<div class="muted small">📖 ${escHtml(x.versiculo)}</div>`:''}
      ${x.material_url?`<div class="muted small">📎 <a href="${escHtml(safeUrl(x.material_url))}" target="_blank">Ver documento</a></div>`:''}</div>`).join('') : '<p class="small">Sin lecciones.</p>';
  }catch{
    if(c){ c.className='muted'; c.innerHTML='<p class="error small">No se pudo cargar · <a href="javascript:cargarMaterial()" class="link" style="display:inline;padding:0">Reintentar</a></p>'; }
  }
}
function formMaterial(){ const z=$('form-material'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="form-panel">
    <input id="m-titulo" placeholder="Título de la lección"/>
    <div class="row" style="margin-top:10px;align-items:center">${fechaSelectHTML('m','',{opcional:true})}<input id="m-vers" placeholder="Versículo"/></div>
    <label for="m-file" style="margin-top:10px">📎 Subir documento (PDF, imagen, Word…)</label>
    <input id="m-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"/>
    <button class="btn small-btn" style="margin-top:12px" onclick="guardarMaterial()">Guardar</button></div>`; }
async function guardarMaterial(){
  const titulo=$('m-titulo').value.trim();
  if(!titulo){ toast('Pon un título'); return; }
  const file=$('m-file').files[0];
  // Este es el caso que lo destapó: la maestra sube el PDF de la lección desde
  // datos móviles, el aviso desaparece a los 2,8 s, no pasa nada durante 20, y
  // al volver a tocar "Guardar" quedan DOS lecciones.
  await conBoton(botonActual(), async()=>{
    try{
      let material_url='';
      if(file) material_url=await uploadArchivo(file);
      await api('/ninos/material',{method:'POST',body:JSON.stringify({clase_id:_claseActual,titulo,fecha:fechaSelectValor('m'),versiculo:$('m-vers').value.trim(),material_url})});
      $('form-material').innerHTML=''; cargarMaterial(); toast('📖 Lección agregada');
    }catch(e){ toast(e.message); }
  }, file?'Subiendo…':'Guardando…');
}
async function cargarNinos(){
  const c=$('ninos-lista');
  try{ const n=await api('/ninos/clase/'+_claseActual+'/ninos'); window._ninos=n;
    c.className=n.length?'list':'muted';
    const editar = esLiderEdUI();
    c.innerHTML=n.length? n.map(x=>`<div class="item-card flex">
      <div style="flex:1"><b>${escHtml(x.nombre)}</b>${x.edad?' <span class="muted small">'+escHtml(String(x.edad))+' años</span>':''}
      ${x.alergias?` <span class="estado-chip estado-rechazado">⚠️ ${escHtml(x.alergias)}</span>`:''}
      <div class="muted small">${x.familia?'Familia '+escHtml(x.familia):''}</div>
      ${x.autorizados?`<div class="muted small">🤝 Puede retirarlo: ${escHtml(x.autorizados)}</div>`:''}</div>
      ${editar?`<div class="row" style="width:auto;gap:8px">
        <button class="btn ghost small-btn" aria-label="Corregir la ficha de ${escHtml(x.nombre)}" onclick="formNino(${x.id})">Editar</button>
        <button class="btn ghost small-btn" aria-label="Borrar a ${escHtml(x.nombre)}" onclick="borrarNino(${x.id})">🗑️</button></div>`:''}</div>`).join('') : '<p class="small">Sin niños.</p>';
  }catch{
    if(c){ c.className='muted'; c.innerHTML='<p class="error small">No se pudo cargar · <a href="javascript:cargarNinos()" class="link" style="display:inline;padding:0">Reintentar</a></p>'; }
    window._ninos=[];
  }
}
function formNino(id){ const z=$('form-nino'); if(z.innerHTML && !id){z.innerHTML='';return;}
  const x=(window._ninos||[]).find(n=>n.id===id)||{};
  z.innerHTML=`<div class="form-panel">
    <div class="row"><input id="n-nombre" placeholder="Nombre" value="${escHtml(x.nombre||'')}"/><input id="n-edad" type="number" placeholder="Edad" style="max-width:90px" value="${escHtml(String(x.edad||''))}"/></div>
    <input id="n-familia" placeholder="Familia" style="margin-top:10px" value="${escHtml(x.familia||'')}"/>
    <input id="n-alergias" placeholder="Alergias / notas" style="margin-top:10px" value="${escHtml(x.alergias||'')}"/>
    <label for="n-autorizados" style="margin-top:10px">Quién puede retirarlo</label>
    <input id="n-autorizados" maxlength="300" placeholder="Ej. Ana Rojas (abuela), Juan Pérez (papá)" value="${escHtml(x.autorizados||'')}"/>
    <p class="muted small" style="margin-top:4px">Nombre y parentesco. No hace falta teléfono ni RUT.</p>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarNino(${id||0})">${id?'Guardar cambios':'Guardar'}</button></div>`;
  z.scrollIntoView({behavior:'smooth',block:'center'}); }
async function guardarNino(id){
  const nombre=$('n-nombre').value.trim();
  if(!nombre) return toast('Pon el nombre');
  const datos={nombre,edad:$('n-edad').value,familia:$('n-familia').value.trim(),
    alergias:$('n-alergias').value.trim(),autorizados:$('n-autorizados').value.trim()};
  await conBoton(botonActual(), async()=>{
    try{
      if(id) await api('/ninos/ninos/'+id,{method:'PATCH',body:JSON.stringify(datos)});
      else   await api('/ninos/ninos',{method:'POST',body:JSON.stringify({clase_id:_claseActual,...datos})});
      $('form-nino').innerHTML=''; cargarNinos(); toast(id?'Ficha corregida':'Niño agregado');
    }catch(e){ toast(e.message); }
  }, 'Guardando…');
}
function borrarNino(id){
  const x=(window._ninos||[]).find(n=>n.id===id)||{};
  modalConfirm(`¿Borrar la ficha de ${escHtml(x.nombre||'este niño')}?`, ()=>{
    modalConfirm('Se irá también su historial de asistencia. Esto NO se puede deshacer.', async()=>{
      try{ await api('/ninos/ninos/'+id,{method:'DELETE'}); $('form-nino').innerHTML=''; cargarNinos(); toast('Ficha borrada'); }
      catch(e){ toast(e.message); }
    }, {okLabel:'Sí, borrar', danger:true});
  }, {okLabel:'Continuar', danger:true});
}
// Aquí vivían renderAsistNinos() y guardarAsistNinos(): pasar lista de los
// niños. Se retiraron el 30 jul 2026 porque la iglesia no la usa. La tabla
// asistencia_nino se conserva en la base de datos con lo ya anotado.

// ============================================================
// ============================================================
//  Helper de escape para innerHTML (seguro)
// ============================================================
function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// SQLite guarda datetime('now') en UTC SIEMPRE, aunque el proceso corra en hora
// de Chile. Cortar el texto con .slice(0,10) muestra el dia equivocado: un
// mensaje enviado un lunes a las 21:00 se veria fechado el martes. Se arregla
// al MOSTRAR, nunca cambiando lo guardado (eso volveria inconsistentes las
// filas viejas con las nuevas, y esta app ya se llevo cinco fallos por tocar
// zonas horarias sin necesidad).
//
// La fecha sale en la zona de quien mira, que es lo correcto: para la iglesia
// es Chile, y para el pastor de viaje es donde este.
function fechaDeUTC(s){
  if(!s) return '';
  const d=new Date(String(s).replace(' ','T')+'Z');   // sin la Z se leeria como hora local
  // Mismo formato que fechaTxt(f, true) ("28 Jul 2026") en vez de
  // toLocaleDateString ("28-07-2026"): la conversion de UTC a hora local es
  // la razon de ser de esta funcion, el formato de salida no tiene por que
  // ser distinto del resto de la app. Con año SIEMPRE (a diferencia de
  // fechaTxt, que lo deja opcional): esta lista no borra nada (ver Política
  // de Privacidad 4.9), asi que van a convivir mensajes de años distintos y
  // "28 Jul" no los distingue.
  return isNaN(d.getTime()) ? String(s).slice(0,10) : d.getDate()+' '+(MESES[d.getMonth()]||'')+' '+d.getFullYear();
}
// Neutraliza URLs peligrosas (javascript:, data:, vbscript:) antes de ponerlas en un href.
// Deja pasar http/https, rutas relativas y enlaces sin esquema (no rompe links legítimos).
function safeUrl(u){ const s=String(u==null?'':u).trim(); return /^\s*(javascript|data|vbscript):/i.test(s) ? '#' : s; }

// Un texto que va a viajar como ARGUMENTO de una función dentro de un onclick.
// Devuelve el literal JS entrecomillado y ya escapado para HTML: se usa SIN
// comillas alrededor —  onclick="f(${escJsAttr(x)})"  — no con ellas.
//
// Hacía falta porque quitar a mano las comillas del texto (.replace(/'/g,'')) no
// basta y falla de dos maneras distintas, ambas explotadas en la app:
//   1. Filtrar solo la comilla simple deja pasar la doble, que cierra el propio
//      atributo y permite añadir otro (onmouseover=…). Pasaba con el tono de una
//      canción, que escribe el líder de música y ejecuta hasta el pastor.
//   2. Filtrar las tres comillas deja pasar el "&": el parser de HTML decodifica
//      las entidades del atributo ANTES de que el JS se compile, así que un
//      nombre guardado como &#39;+alert(1)+&#39; llega al motor ya como comillas.
// JSON.stringify neutraliza comillas y barras; escHtml neutraliza el "&" que
// haría el truco de las entidades. La CSP no ayuda aquí: usa 'unsafe-inline'.
function escJsAttr(v){ return escHtml(JSON.stringify(String(v==null?'':v))); }

// Un color que viene de la BD y va dentro de un atributo style. Lista blanca:
// solo #rgb, #rrggbb o var(--algo). Cualquier otra cosa cae al color por defecto.
// El color de un grupo lo pone el pastor con <input type="color">, pero la API lo
// acepta como texto libre: un PATCH a mano con  red" onmouseover="…  cerraba el
// atributo, y ese chip lo ve TODA la iglesia en el calendario. Se valida por
// forma y no escapando, porque un color tiene una forma conocida y corta.
function safeColor(c, porDefecto='var(--primary)'){
  const s=String(c==null?'':c).trim();
  return /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|var\(--[a-zA-Z0-9-]+\))$/.test(s) ? s : porDefecto;
}

// Bloque de "no se pudo cargar", con enlace para volver a intentarlo.
//
// Siete pantallas mostraban únicamente «Error.», que no dice qué falló, ni si
// es culpa de la persona, ni qué puede hacer — y deja la vista muerta: la única
// salida era cambiar de módulo y volver a entrar. El mismo archivo ya lo
// resolvía bien en otros ocho sitios, con el enlace de reintentar; esto pone
// los siete restantes en esa misma forma, ahora escrita una sola vez.
//
// `reintentar` es una llamada literal escrita aquí en el código, nunca un dato
// del usuario: va dentro de un href="javascript:…".
function errCargar(reintentar, que=''){
  return `<p class="error small">No se pudo cargar${que?' '+que:''} · `
    + `<a href="javascript:${reintentar}" class="link" style="display:inline;padding:0">Reintentar</a></p>`;
}

// La lista de personas de la iglesia, guardada en memoria para no pedirla en
// cada pantalla. Solo se guarda si trae a alguien.
//
// Antes era  cache || (cache = await api('/personas').catch(()=>[]))  y un fallo
// puntual —el límite de peticiones, la red del teléfono, el arranque frío del
// servidor— dejaba `[]` guardado. Y `[]` es truthy, así que el `||` no volvía a
// intentarlo jamás: hasta recargar la página, los desplegables de "+ Agregar
// integrante" y de "Predicadores" salían en blanco, sin ningún mensaje. El líder
// de música concluía que en la iglesia no hay nadie a quien poner en el equipo.
async function _personas(){
  if(window._personasCache && window._personasCache.length) return window._personasCache;
  const l=await api('/personas');
  if(l && l.length) window._personasCache=l;
  return l||[];
}

// El mes en curso como "AAAA-MM", en hora de Chile. new Date().toISOString() da
// el mes en UTC: el 31 a las 21:00 ya es día 1 del mes siguiente, y la tarjeta
// "Altas este mes" mostraba 0 aunque ese mes hubieran entrado doce personas.
function mesLocal(d=new Date()){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}

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
    ? `<select onchange="_grupoSel=Number(this.value);renderMiGrupo()" style="max-width:220px">${grupos.map(x=>`<option value="${x.id}" ${x.id===g.id?'selected':''}>${escHtml(x.nombre)}</option>`).join('')}</select>`
    : `<h2 style="margin:0">${escHtml(g.nombre)}</h2>`;
  $('mg').className='';
  $('mg').innerHTML=`
    <div class="head-row" style="align-items:center;gap:10px">${sel}
      ${g.soyLider?'<span class="estado-chip estado-aceptado">Líder</span>':'<span class="estado-chip">Miembro</span>'}</div>
    <div class="card" style="margin-bottom:16px"><div class="widget-head">📁 Carpeta de Google Drive</div>
      ${g.drive_url
        ? `<a class="btn small-btn" href="${escHtml(safeUrl(g.drive_url))}" target="_blank" rel="noopener">Abrir carpeta en Drive ↗</a>`
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
  const url=normalizarEnlace($('mg-drive').value);
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
    c.innerHTML=list.map(a=>`<div class="item-card flex"><div style="flex:1"><b>${a.tipo==='recordatorio'?'⏰':'📢'} ${escHtml(a.titulo)}</b>${a.fecha?` <span class="estado-chip">${fechaTxt(a.fecha)}</span>`:''}<div class="muted small">${escHtml(a.texto||'')}</div></div>${lider?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar aviso" onclick="borrarAvisoGrupo(${a.id})">🗑️</button>`:''}</div>`).join('');
  }catch{ $('mg-avisos').innerHTML=errCargar('cargarAvisosGrupo()','los avisos del grupo'); }
}
function formAvisoGrupo(){ const z=$('mg-aviso-form'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="form-panel">
    <div class="row" style="gap:8px;align-items:center"><select id="ag-tipo" style="max-width:170px"><option value="aviso">📢 Aviso</option><option value="recordatorio">⏰ Recordatorio</option></select>
      ${fechaSelectHTML('ag','',{opcional:true})}</div>
    <input id="ag-titulo" placeholder="Título del aviso" style="margin-top:10px"/>
    <textarea id="ag-texto" placeholder="Detalle (opcional)" style="margin-top:10px"></textarea>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarAvisoGrupo()">Publicar y avisar al grupo</button></div>`;
}
async function guardarAvisoGrupo(){
  const titulo=$('ag-titulo').value.trim(); if(!titulo) return toast('Pon un título');
  try{ const r=await api('/grupo/'+_grupoSel+'/avisos',{method:'POST',body:JSON.stringify({tipo:$('ag-tipo').value,titulo,texto:$('ag-texto').value.trim(),fecha:fechaSelectValor('ag')})});
    $('mg-aviso-form').innerHTML=''; cargarAvisosGrupo(); toast('📢 Publicado · avisados '+r.avisados); }catch(e){ toast(e.message); }
}
function borrarAvisoGrupo(id){ modalConfirm('¿Eliminar este aviso?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/avisos/'+id,{method:'DELETE'}); cargarAvisosGrupo(); toast('Aviso eliminado'); }catch(e){ toast(e.message);} }); }
// --- Recursos (links / archivos) ---
async function cargarRecursosGrupo(){
  try{ const list=await api('/grupo/'+_grupoSel+'/recursos'); const c=$('mg-recursos'); const lider=window._grupoLider;
    if(!list.length){ c.className='muted'; c.innerHTML='<p class="small">Sin recursos todavía.</p>'; return; }
    c.className='list';
    c.innerHTML=list.map(rc=>`<div class="item-card flex"><div style="flex:1"><b>${rc.tipo==='archivo'?'📎':'🔗'} ${escHtml(rc.titulo)}</b><div class="muted small"><a href="${escHtml(safeUrl(rc.url))}" target="_blank">${rc.tipo==='archivo'?'Abrir / descargar':'Abrir enlace'}</a></div></div>${lider?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar recurso" onclick="borrarRecursoGrupo(${rc.id})">🗑️</button>`:''}</div>`).join('');
  }catch{ $('mg-recursos').innerHTML=errCargar('cargarRecursosGrupo()','los recursos del grupo'); }
}
function formRecursoGrupo(){ const z=$('mg-rec-form'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="form-panel">
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
  const archivo = tipo==='archivo' ? ($('rg-file').files[0]||null) : null;
  if(tipo==='archivo' && !archivo) return toast('Elige un archivo');
  await conBoton(botonActual(), async()=>{
    try{
      let url;
      if(archivo) url=await uploadArchivo(archivo);
      else { url=normalizarEnlace($('rg-url').value); if(!url) return toast('Pega el link'); }
      await api('/grupo/'+_grupoSel+'/recursos',{method:'POST',body:JSON.stringify({tipo,titulo,url})});
      $('mg-rec-form').innerHTML=''; cargarRecursosGrupo(); toast('🔗 Recurso compartido');
    }catch(e){ toast(e.message); }
  }, archivo?'Subiendo…':'Guardando…');
}
function borrarRecursoGrupo(id){ modalConfirm('¿Eliminar este recurso?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/recursos/'+id,{method:'DELETE'}); cargarRecursosGrupo(); toast('Recurso eliminado'); }catch(e){ toast(e.message);} }); }
// --- Miembros + avisar a uno/todos ---
async function cargarMiembrosGrupo(){
  try{ const list=await api('/grupo/'+_grupoSel+'/miembros'); window._mgMiembros=list.filter(m=>!m.esLider); const c=$('mg-miembros'); const lider=window._grupoLider;
    c.className='list';
    c.innerHTML=list.map(m=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(m.nombre)}</b>${m.esLider?' <span class="estado-chip estado-aceptado">Líder</span>':''}</div>${(lider&&!m.esLider)?`<button class="link" style="color:var(--red-tx)" onclick="quitarMiembroGrupo(${m.id},${escJsAttr(m.nombre||'')})">Quitar</button>`:''}</div>`).join('');
    if(lider) renderAvisarBox();
  }catch{ $('mg-miembros').innerHTML=errCargar('cargarMiembrosGrupo()','los miembros del grupo'); }
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
async function formAgregarMiembro(){ const z=$('mg-add-form'); if(z.innerHTML){z.innerHTML='';return;} await _renderAgregarMiembro(); }
async function _renderAgregarMiembro(){
  const z=$('mg-add-form'); if(!z) return;
  let libres=[];
  try{ libres=await api('/grupo/'+_grupoSel+'/candidatos'); }
  catch{ z.innerHTML='<p class="error small" style="margin-bottom:10px">No se pudo cargar · <a href="javascript:_renderAgregarMiembro()" class="link" style="display:inline;padding:0">Reintentar</a></p>'; return; }
  if(!libres.length){ z.innerHTML='<p class="muted small" style="margin-bottom:10px">No hay más personas para agregar.</p>'; return; }
  z.innerHTML=`<div class="row" style="gap:8px;margin-bottom:12px"><select id="mg-nuevo" style="flex:1">${libres.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('')}</select><button class="btn small-btn" onclick="agregarMiembroGrupo()">Agregar al grupo</button></div>`;
}
async function agregarMiembroGrupo(){ try{ await api('/grupo/'+_grupoSel+'/miembros',{method:'POST',body:JSON.stringify({persona_id:$('mg-nuevo').value})}); $('mg-add-form').innerHTML=''; cargarMiembrosGrupo(); toast('👋 Agregado y avisado'); }catch(e){ toast(e.message); } }
function quitarMiembroGrupo(id,nombre){ modalConfirm('¿Quitar a '+escHtml(nombre)+' del grupo?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/miembros/'+id,{method:'DELETE'}); cargarMiembrosGrupo(); toast('Listo'); }catch(e){ toast(e.message);} }); }
// --- Tareas (el líder asigna tareas a un miembro → aparecen en "Mi Servicio") ---
function formTareaGrupo(){ const z=$('mg-tarea-form'); if(z.innerHTML){z.innerHTML='';return;}
  const ms=window._mgMiembros||[];
  if(!ms.length){ z.innerHTML='<p class="muted small" style="margin-bottom:10px">Agrega miembros primero.</p>'; return; }
  z.innerHTML=`<div class="form-panel">
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
  let list=[];
  try{ list=await api('/grupo/'+_grupoSel+'/tareas'); }
  catch{ cont.className='muted'; cont.innerHTML='<p class="error small">No se pudo cargar · <a href="javascript:cargarTareasGrupo()" class="link" style="display:inline;padding:0">Reintentar</a></p>'; return; }
  if(!list.length){ cont.className='muted'; cont.innerHTML='<p class="small">Sin tareas asignadas.</p>'; return; }
  cont.className='list';
  cont.innerHTML=list.map(t=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(t.titulo)}</b> <span class="muted small">→ ${escHtml(t.nombre)}</span>${t.detalle?`<div class="muted small">${escHtml(t.detalle)}</div>`:''} <span class="estado-chip ${t.estado==='hecho'?'estado-aceptado':'estado-pendiente'}">${t.estado==='hecho'?'✅ Hecho':'⏳ Pendiente'}</span></div><button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar tarea" onclick="borrarTareaGrupo(${t.id})">🗑️</button></div>`).join('');
}
function borrarTareaGrupo(id){ modalConfirm('¿Eliminar esta tarea?', async()=>{ try{ await api('/grupo/'+_grupoSel+'/tareas/'+id,{method:'DELETE'}); cargarTareasGrupo(); toast('Tarea eliminada'); }catch(e){ toast(e.message);} }); }

// ============================================================
//  PREDICA — historial de prédicas (Devocional + Notas fusionados)
// ============================================================
async function vistaPredica(){
  const c=$('content'); c.innerHTML='<div id="pr" class="muted">Cargando…</div>';
  let data; try{ data=await api('/predica'); }catch{ $('pr').innerHTML='<p class="error">No se pudo cargar.</p>'; return; }
  window._predicaEdit=!!data.puedeEditar;
  $('pr').className='';
  $('pr').innerHTML=`<div class="head-row"><h2>📖 Prédica</h2>${data.puedeEditar?'<button class="btn small-btn" onclick="formPredica(0)">+ Nueva prédica</button>':''}</div>
    <div id="form-predica"></div>
    ${ME.persona.es_pastor?'<div id="pr-pred"></div>':''}
    <div id="pr-lista" class="muted">…</div>`;
  renderPredicas(data.items||[]);
  if(ME.persona.es_pastor) cargarPredicadores();
}
function renderPredicas(items){
  const c=$('pr-lista');
  if(!items.length){ c.className='muted'; c.innerHTML='<p class="small">Aún no hay prédicas registradas.</p>'; return; }
  c.className='list';
  c.innerHTML=items.map(p=>`<button type="button" class="btn-plano item-card flex" onclick="verPredica(${p.id})">
    ${chipFecha(p.fecha||'')}<div style="flex:1"><div class="item-titulo">${escHtml(p.titulo)}</div>
    <div class="muted small">${p.predicador?'🎤 '+escHtml(p.predicador):''}${p.recursos?' · 📎 '+p.recursos+' recurso(s)':''}</div></div>
    <span class="muted" style="font-size:20px">›</span></button>`).join('');
}
async function verPredica(id){
  $('content').innerHTML='<button class="link" onclick="vistaPredica()">‹ Prédicas</button><div id="prd" class="muted">Cargando…</div>';
  let d; try{ d=await api('/predica/'+id); }catch{ $('prd').innerHTML=errCargar('verPredica('+Number(id)+')','la prédica'); return; }
  window._predActual=id; const edit=d.puedeEditar;
  const recs=(d.recursos||[]).map(r=>{
    const ic=r.tipo==='archivo'?'📎':r.tipo==='libro'?'📚':'🔗';
    const link=r.url?`<a href="${escHtml(safeUrl(r.url))}" target="_blank">${r.tipo==='archivo'?'Abrir / descargar':'Abrir'}</a>`:'';
    return `<div class="item-card flex"><div style="flex:1"><b>${ic} ${escHtml(r.titulo)}</b> <span class="muted small">${link}</span></div>${edit?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar recurso" onclick="borrarRecPredica(${r.id})">🗑️</button>`:''}</div>`;
  }).join('');
  $('prd').className='';
  $('prd').innerHTML=`<div id="form-predica"></div>
  <div class="card">
    <div class="head-row"><h2 style="font-size:20px;margin:0">${escHtml(d.titulo)}</h2>${edit?`<div class="row" style="width:auto;gap:10px"><button class="link" onclick="formPredica(${id})">✏️ Editar</button><button class="link icon-only" style="color:var(--red-tx)" aria-label="Eliminar predicación" onclick="borrarPredica(${id})">🗑️</button></div>`:''}</div>
    <div class="muted small" style="margin-top:4px">${d.fecha?'📅 '+fechaTxt(d.fecha):''}${d.predicador?' · 🎤 '+escHtml(d.predicador):''}</div>
    ${d.notas?`<div style="margin-top:14px;white-space:pre-wrap;line-height:1.5">${escHtml(d.notas)}</div>`:'<p class="muted small" style="margin-top:10px">Sin notas.</p>'}
  </div>
  <div class="card" style="margin-top:16px"><div class="head-row"><h3 style="font-size:16px">📎 Recursos (links, archivos, libros)</h3>${edit?`<button class="btn small-btn" onclick="formRecPredica()">+ Recurso</button>`:''}</div>
    <div id="prd-recform"></div>
    <div class="list" style="margin-top:8px">${recs||'<p class="muted small">Sin recursos.</p>'}</div></div>`;
}
// Crear/editar una prédica en un panel que se abre EN SITIO, como el resto de
// la app (evento, anuncio, caso, clase, lección, niño, aviso, recurso, tarea,
// usuario, grupo…). Era la única entidad cuyo "+ Nuevo" se llevaba por delante
// la pantalla entera: se perdía de vista la lista y para volver había un "‹
// Volver" que no decía a dónde. El mismo botón que abre el panel lo cierra,
// igual que en los demás.
async function formPredica(id){
  const z=$('form-predica'); if(!z) return;
  if(z.innerHTML){ z.innerHTML=''; return; }
  let p={}; if(id){ try{ p=await api('/predica/'+id); }catch{} }
  z.innerHTML=`<div class="card" style="margin-bottom:16px"><h3>${id?'Editar prédica':'Nueva prédica'}</h3>
    <label for="pp-titulo">Nombre de la prédica</label><input id="pp-titulo" value="${escHtml(p.titulo||'')}" placeholder="Ej. El amor de Dios"/>
    <label>Fecha</label><div>${fechaSelectHTML('pp', p.fecha||'')}</div>
    <label for="pp-predicador">Predicador</label><input id="pp-predicador" value="${escHtml(p.predicador||'')}" placeholder="Quién predicó"/>
    <label for="pp-notas">Notas / bosquejo</label><textarea id="pp-notas" style="min-height:150px">${escHtml(p.notas||'')}</textarea>
    <p id="pp-error" class="error"></p>
    <button class="btn" style="margin-top:12px" onclick="guardarPredica(${id||0})">${id?'Guardar cambios':'Crear prédica'}</button></div>`;
}
async function guardarPredica(id){
  const body={titulo:$('pp-titulo').value.trim(),fecha:fechaSelectValor('pp'),predicador:$('pp-predicador').value.trim(),notas:$('pp-notas').value};
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
  const archivo = tipo==='archivo' ? ($('prr-file').files[0]||null) : null;
  if(tipo==='archivo' && !archivo) return toast('Elige un archivo');
  await conBoton(botonActual(), async()=>{
    try{
      let url='';
      if(archivo) url=await uploadArchivo(archivo);
      // Solo 'link' es una URL. 'libro' es una referencia de texto libre
      // ("Comentario de Juan (Hendriksen)") y ponerle https:// la destrozaría.
      else { const v=$('prr-url').value; url = tipo==='link' ? normalizarEnlace(v) : v.trim(); }
      await api('/predica/'+window._predActual+'/recurso',{method:'POST',body:JSON.stringify({tipo,titulo,url})});
      toast('Recurso agregado'); verPredica(window._predActual);
    }catch(e){ toast(e.message); }
  }, archivo?'Subiendo…':'Guardando…');
}
function borrarRecPredica(rid){ modalConfirm('¿Eliminar este recurso?', async()=>{ try{ await api('/predica/recurso/'+rid,{method:'DELETE'}); verPredica(window._predActual); toast('Recurso eliminado'); }catch(e){ toast(e.message);} }); }
// --- Gestión del rol Predicador (solo el pastor) ---
async function cargarPredicadores(){
  const cont=$('pr-pred'); if(!cont) return;
  let list=[], fallo=false;
  try{ list=await api('/predica/predicadores'); }catch{ fallo=true; }
  const personas=await _personas().catch(()=>[]);
  cont.innerHTML=`<div class="card" style="margin-bottom:16px"><div class="widget-head">🎤 Predicadores (rol con vigencia)</div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin:10px 0;align-items:center">
      <select id="prp-persona" style="max-width:200px">${personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('')}</select>
      <span class="muted small">Desde:</span>${fechaSelectHTML('prp-desde','')}
      <span class="muted small">Hasta:</span>${fechaSelectHTML('prp-hasta','')}
      <button class="btn small-btn" onclick="asignarPredicador()">Asignar</button></div>
    ${fallo?'<p class="error small">No se pudo cargar la lista de predicadores · <a href="javascript:cargarPredicadores()" class="link" style="display:inline;padding:0">Reintentar</a></p>'
      :(list.length?'<div class="list">'+list.map(x=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(x.nombre)}</b> ${x.vigente?'<span class="estado-chip estado-aceptado">Vigente</span>':'<span class="estado-chip">Inactivo</span>'}<div class="muted small">${fechaTxt(x.desde)} → ${fechaTxt(x.hasta)}</div></div><button class="link" style="color:var(--red-tx)" onclick="quitarPredicador(${x.id})">Quitar</button></div>`).join('')+'</div>':'<p class="muted small">Nadie con rol predicador todavía.</p>')}
  </div>`;
}
async function asignarPredicador(){
  const body={persona_id:$('prp-persona').value,desde:fechaSelectValor('prp-desde'),hasta:fechaSelectValor('prp-hasta')};
  if(!body.desde||!body.hasta) return toast('Indica desde y hasta qué fecha');
  try{ await api('/predica/predicadores',{method:'POST',body:JSON.stringify(body)}); toast('🎤 Predicador asignado'); cargarPredicadores(); }catch(e){ toast(e.message); }
}
function quitarPredicador(id){ modalConfirm('¿Quitar este rol de predicador?', async()=>{ try{ await api('/predica/predicadores/'+id,{method:'DELETE'}); cargarPredicadores(); toast('Rol de predicador quitado'); }catch(e){ toast(e.message);} }); }

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
      <button type="button" class="btn-plano module-card" style="text-align:left;align-items:stretch" onclick="verIglesiaObispo(${i.id})">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="label" style="font-size:16px">⛪ ${escHtml(i.nombre)}</div><span class="estado-chip">${escHtml(i.codigo_unico)}</span></div>
        <div class="muted small" style="margin:6px 0 10px">Pastor: ${escHtml(i.pastor||'—')}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="estado-chip">👥 ${i.miembros}</span>
          <span class="estado-chip">📅 ${i.eventos}</span>
          <span class="estado-chip">📊 asist. ${i.asistenciaPromedio}</span>
          <span class="estado-chip">💰 ${money(i.saldo)}</span>
        </div></button>`).join('')}</div>`;
}
let _obMes=null;
async function verIglesiaObispo(id, mes){
  if(mes!==undefined) _obMes=mes;
  $('content').innerHTML='<button class="link" onclick="vistaPanelObispo()">‹ Todas las iglesias</button><div id="obd" class="muted">Cargando…</div>';
  let d; try{ d=await api('/obispo/iglesia/'+id+(_obMes?('?mes='+_obMes):'')); }catch(e){ $('obd').innerHTML='<p class="error">'+e.message+'</p>'; return; }
  _obMes=d.mes;
  const igs=window._obIglesias||[];
  const selIglesia=`<select onchange="verIglesiaObispo(Number(this.value))" style="max-width:220px">${igs.map(i=>`<option value="${i.id}" ${i.id===id?'selected':''}>${escHtml(i.nombre)}</option>`).join('')}</select>`;
  const card=(titulo,inner)=>`<div class="card" style="margin-bottom:16px"><div class="widget-head">${titulo}</div>${inner}</div>`;
  const lista=(arr,fn,vacio)=>arr.length?'<div class="list" style="margin-top:6px">'+arr.map(fn).join('')+'</div>':`<p class="muted small">${vacio}</p>`;
  $('obd').className='';
  $('obd').innerHTML=`
    <div class="hero"><h2>⛪ ${escHtml(d.iglesia.nombre)}</h2><p>${escHtml(d.iglesia.codigo_unico)} · Pastor: ${escHtml(d.pastor)} · 👁️ informe mensual (solo lectura)</p></div>
    <div class="head-row" style="margin:16px 0;gap:10px;flex-wrap:wrap;align-items:center">
      <span class="muted small">Iglesia:</span> ${selIglesia}
      <span class="muted small" style="margin-left:8px">Mes:</span>
      <input type="month" value="${escHtml(d.mes)}" onchange="verIglesiaObispo(${id}, this.value)" style="max-width:170px"/>
    </div>
    <div class="widgets" style="margin-bottom:18px">
      <div class="widget"><div class="widget-head">👥 Miembros</div><div class="stat-num">${d.miembros}</div></div>
      <button type="button" class="btn-plano widget" onclick="obAsistencia(${id})"><div class="widget-head">✅ Asistencia prom. (mes)</div><div class="stat-num">${d.asistencia.promedio}</div><div class="small" style="color:var(--primary)">${d.asistencia.reuniones} reunión(es) · ver detalle ›</div></button>
      <button type="button" class="btn-plano widget" onclick="obTesoreria(${id})"><div class="widget-head">💰 Balance del mes</div><div class="stat-num" style="color:${d.tesoreria.balanceMes>=0?'var(--green-tx)':'var(--red-tx)'}">${money(d.tesoreria.balanceMes)}</div><div class="small" style="color:var(--primary)">Saldo total ${money(d.tesoreria.saldoTotal)} · ver movimientos ›</div></button>
    </div>
    ${card('💰 Tesorería del mes', `<div class="muted small">↑ Ingresos <b style="color:var(--green-tx)">${money(d.tesoreria.ingresosMes)}</b> · ↓ Gastos <b style="color:var(--red-tx)">${money(d.tesoreria.gastosMes)}</b> · Balance <b>${money(d.tesoreria.balanceMes)}</b></div><button class="btn ghost small-btn" style="margin-top:10px" onclick="obTesoreria(${id})">Ver movimientos ›</button>`)}
    ${card('📅 Eventos del mes', lista(d.eventosMes, e=>`<div class="item-card flex">${chipFecha(e.fecha)}<div style="flex:1"><div class="item-titulo">${escHtml(e.titulo)}</div><div class="muted small">${escHtml(e.grupo||'')} · ${escHtml(e.estado)}</div></div><span class="estado-chip">✅ ${e.asistencia}</span></div>`, 'Sin eventos este mes.'))}
    ${card('📖 Prédicas del mes', lista(d.predicasMes, p=>`<button type="button" class="btn-plano item-card flex" onclick="obPredica(${p.id})">${chipFecha(p.fecha||'')}<div style="flex:1"><b>${escHtml(p.titulo)}</b><div class="muted small">${escHtml(p.predicador||'')}</div></div><span class="muted" style="font-size:18px">›</span></button>`, 'Sin prédicas este mes.'))}
    <div class="widgets" style="margin-bottom:16px">
      <div class="widget"><div class="widget-head">📢 Anuncios (mes)</div><div class="stat-num">${d.anunciosMes}</div></div>
      <div class="widget"><div class="widget-head">❤️ Casos de cuidado abiertos</div><div class="stat-num">${d.cuidado.casosAbiertos}</div></div>
      <div class="widget"><div class="widget-head">👶 Niños / clases</div><div class="stat-num">${d.ninos.ninos}</div><div class="muted small">${d.ninos.clases} clase(s)</div></div>
    </div>
    ${card('🧩 Grupos', lista(d.grupos, g=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(g.nombre)}</b></div><span class="estado-chip">👥 ${g.miembros}</span></div>`, 'Sin grupos.'))}
    ${card('⭐ Líderes', lista(d.lideres, l=>`<div class="item-card flex"><div style="flex:1"><b>${escHtml(l.nombre)}</b><div class="muted small">${escHtml(rolLabel(l.rol||''))} · ${escHtml(l.grupo)}</div></div></div>`, 'Sin líderes.'))}`;
}
// --- Modal genérico de detalle (drill-down del obispo) ---
function modalDetalle(titulo, html){
  let ov=$('det-ov'); if(!ov){ ov=document.createElement('div'); ov.id='det-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" onclick="event.stopPropagation()" style="max-width:600px">
    <div class="hmodal-head"><b style="flex:1;font-size:16px">${titulo}</b><button class="cal-navbtn" onclick="cerrarDetalle()" aria-label="Cerrar">✕</button></div>
    <div style="padding:18px;overflow:auto">${html}</div></div>`;
  ov.onclick=cerrarDetalle;
}
function cerrarDetalle(){ const o=$('det-ov'); if(o) o.remove(); }
const _qmes=()=>_obMes?('?mes='+_obMes):'';
async function obTesoreria(id){
  try{ const m=await api('/obispo/iglesia/'+id+'/tesoreria'+_qmes());
    const ing=m.filter(x=>x.tipo==='ingreso').reduce((a,b)=>a+b.monto,0), gas=m.filter(x=>x.tipo==='gasto').reduce((a,b)=>a+b.monto,0);
    modalDetalle('💰 Movimientos · '+_obMes, m.length
      ? `<div class="muted small" style="margin-bottom:10px">↑ ${money(ing)} · ↓ ${money(gas)} · balance ${money(ing-gas)}</div><div class="list">`+m.map(x=>`<div class="item-card flex"><div style="flex:1"><b>${x.tipo==='ingreso'?'↑':'↓'} ${escHtml(cap(x.categoria||x.tipo))}</b><div class="muted small">${escHtml(x.descripcion||'')} · ${escHtml(x.fecha)}${x.comprobante_url?` · 📎 <a href="${escHtml(safeUrl(x.comprobante_url))}" target="_blank">comprobante</a>`:''}</div></div><b style="color:${x.tipo==='ingreso'?'var(--green-tx)':'var(--red-tx)'}">${x.tipo==='ingreso'?'+':'−'}${money(x.monto)}</b></div>`).join('')+'</div>'
      : '<p class="muted small">Sin movimientos este mes.</p>');
  }catch(e){ toast(e.message); }
}
async function obAsistencia(id){
  try{ const evs=await api('/obispo/iglesia/'+id+'/asistencia'+_qmes());
    modalDetalle('✅ Asistencia · '+_obMes, evs.length
      ? evs.map(e=>`<div style="margin-bottom:14px"><b>${escHtml(e.titulo)}</b> <span class="muted small">${fechaTxt(e.fecha)} · ${e.presentes.length} asist.</span>${e.presentes.length?'<div class="muted small" style="margin-top:4px">'+e.presentes.map(escHtml).join(' · ')+'</div>':'<div class="muted small" style="margin-top:4px">Sin registro de asistencia.</div>'}</div>`).join('')
      : '<p class="muted small">Sin eventos este mes.</p>');
  }catch(e){ toast(e.message); }
}
async function obPredica(pid){
  try{ const p=await api('/obispo/predica/'+pid);
    const recs=(p.recursos||[]).map(r=>`<div class="item-card flex"><div style="flex:1"><b>${r.tipo==='archivo'?'📎':r.tipo==='libro'?'📚':'🔗'} ${escHtml(r.titulo)}</b></div>${r.url?`<a href="${escHtml(safeUrl(r.url))}" target="_blank" class="link">abrir</a>`:''}</div>`).join('');
    modalDetalle('📖 '+escHtml(p.titulo), `<div class="muted small">${p.fecha?'📅 '+fechaTxt(p.fecha):''}${p.predicador?' · 🎤 '+escHtml(p.predicador):''}</div>${p.notas?`<div style="margin-top:12px;white-space:pre-wrap;line-height:1.5">${escHtml(p.notas)}</div>`:'<p class="muted small" style="margin-top:8px">Sin notas.</p>'}${recs?'<h3 class="section-title" style="margin-top:14px">Recursos</h3><div class="list">'+recs+'</div>':''}`);
  }catch(e){ toast(e.message); }
}

// ============================================================
//  DIRECTORIO — buscador de la congregación + cumpleaños + mi perfil
// ============================================================
let _dirDebounce=null, _dirQ='';
async function vistaDirectorio(){
  const c=$('content');
  c.innerHTML=`<div class="head-row"><h2>👤 Directorio</h2><button class="btn ghost small-btn" onclick="vistaPerfilDirectorio()">✏️ Mi perfil</button></div>
    <div id="dir-cumple" class="muted small" style="margin:10px 0 18px">Cargando cumpleaños…</div>
    <input id="dir-buscar" placeholder="Buscar por nombre…" oninput="dirBuscarInput(this.value)" style="margin-bottom:14px"/>
    <div id="dir-lista" class="muted">Cargando…</div>`;
  _dirQ='';
  cargarCumpleanosDirectorio();
  cargarDirectorio('');
}
function dirBuscarInput(v){
  clearTimeout(_dirDebounce);
  _dirDebounce=setTimeout(()=>cargarDirectorio(v.trim()),250);
}
async function cargarCumpleanosDirectorio(){
  const cont=$('dir-cumple'); if(!cont) return;
  let list=[];
  try{ list=await api('/directorio/cumpleanos'); }
  catch{ cont.innerHTML='<p class="error small">No se pudo cargar los cumpleaños · <a href="javascript:cargarCumpleanosDirectorio()" class="link" style="display:inline;padding:0">Reintentar</a></p>'; return; }
  if(!list.length){ cont.innerHTML='<p class="small">🎂 Nadie cumple años este mes.</p>'; return; }
  cont.className='';
  cont.innerHTML=`<div class="widget-head" style="margin-bottom:8px">🎂 Cumpleaños del mes</div>
    <div class="dir-cumple-row">${list.map(p=>`<div class="dir-cumple-item">${dirAvatar(p,44)}<div class="dir-cumple-nombre">${escHtml(p.nombre)}</div><div class="muted small">día ${escHtml(String(p.dia==null?'':p.dia))}</div></div>`).join('')}</div>`;
}
function dirAvatar(p, size){
  size=size||48;
  if(p.foto_url) return `<img src="${escHtml(safeUrl(p.foto_url))}" alt="" class="dir-avatar" style="width:${size}px;height:${size}px">`;
  const ini=(p.nombre||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return `<div class="dir-avatar dir-avatar-ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px">${escHtml(ini)}</div>`;
}
async function cargarDirectorio(q){
  _dirQ=q||'';
  const cont=$('dir-lista'); if(!cont) return;
  cont.className='muted'; cont.innerHTML='Cargando…';
  let list=[];
  try{ list=await api('/directorio?q='+encodeURIComponent(_dirQ)); }
  catch{ cont.innerHTML='<p class="error small">No se pudo cargar el directorio · <a href="javascript:cargarDirectorio(\''+_dirQ.replace(/'/g,'')+'\')" class="link" style="display:inline;padding:0">Reintentar</a></p>'; return; }
  if(!list.length){ cont.className='muted'; cont.innerHTML=`<div class="placeholder"><div class="big">🔎</div><p>${_dirQ?'Sin resultados para “'+escHtml(_dirQ)+'”.':'Aún no hay personas para mostrar.'}</p></div>`; return; }
  cont.className='list';
  cont.innerHTML=list.map(p=>{
    const chips=(p.grupos||[]).map(g=>`<span class="estado-chip" style="margin-top:0">${escHtml(g)}</span>`).join('');
    const contacto=[
      p.telefono?`<a href="tel:${escHtml(p.telefono)}" class="link" style="display:inline;padding:0;margin:0 12px 0 0">📞 ${escHtml(p.telefono)}</a>`:'',
      p.email?`<a href="mailto:${escHtml(p.email)}" class="link" style="display:inline;padding:0">✉️ ${escHtml(p.email)}</a>`:''
    ].filter(Boolean).join('');
    return `<div class="item-card flex">
      ${dirAvatar(p,48)}
      <div style="flex:1">
        <b>${escHtml(p.nombre)}${p.es_yo?' <span class="estado-chip" style="margin-top:0">Tú</span>':''}</b>
        ${chips?`<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${chips}</div>`:''}
        ${contacto?`<div class="muted small" style="margin-top:6px">${contacto}</div>`:''}
      </div></div>`;
  }).join('');
}
// --- Mi perfil (dentro del directorio): foto, teléfono, correo, cumpleaños, visibilidad ---
async function vistaPerfilDirectorio(){
  const c=$('content');
  c.innerHTML='<button class="link" onclick="vistaDirectorio()">‹ Directorio</button><div id="dir-perfil" class="muted">Cargando…</div>';
  let p;
  try{ p=await api('/directorio/perfil'); }
  catch{ $('dir-perfil').innerHTML='<p class="error">No se pudo cargar tu perfil · <a href="javascript:vistaPerfilDirectorio()" class="link" style="display:inline;padding:0">Reintentar</a></p>'; return; }
  // Punto de reconciliacion de ME: es la unica pantalla que pide el perfil
  // entero al servidor. ME solo se carga al abrir la app y no se refresca nunca,
  // asi que si el PASTOR te corrige el nombre, la barra lateral y el saludo del
  // panel ("Hola, Juan") seguian con el viejo mientras esta pantalla ya ensenaba
  // el nuevo: la app mostrando dos nombres tuyos a la vez.
  if(ME.persona && p.nombre && ME.persona.nombre!==p.nombre){
    ME.persona.nombre=p.nombre;
    pintarUsuarioLateral();
  }
  const z=$('dir-perfil'); z.className='';
  // Todo el formulario se prellena con `p` —lo que ACABA de responder
  // /directorio/perfil—, incluido el nombre. Con ME.persona.nombre (una cache
  // del arranque de la app, que no se refresca nunca) pasaba esto: si el
  // pastor te corregia el nombre desde Administracion mientras tu tenias la
  // app abierta, aqui seguia leyendose el viejo, y guardar el telefono lo
  // devolvia atras — sin error, y con un apunte de auditoria diciendo que lo
  // habias cambiado tu.
  z.innerHTML=`<div class="card" style="max-width:520px;margin-top:10px">
    <h2 style="font-size:1.2rem;margin-bottom:14px">✏️ Mi perfil</h2>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div id="dp-foto-preview">${dirAvatar({nombre:p.nombre,foto_url:p.foto_url},64)}</div>
      <div style="flex:1">
        <label for="dp-foto" style="margin:0">Foto de perfil</label>
        <input id="dp-foto" type="file" accept="image/*"/>
      </div>
    </div>
    <label for="dp-nombre">Nombre</label>
    <input id="dp-nombre" value="${escHtml(p.nombre||'')}" maxlength="120"/>
    <label for="dp-tel">Teléfono</label>
    <input id="dp-tel" type="tel" value="${escHtml(p.telefono||'')}" placeholder="Ej. +56 9 1234 5678"/>
    <label for="dp-email" style="margin-top:10px">Correo</label>
    <input id="dp-email" type="email" value="${escHtml(p.email||'')}" placeholder="tucorreo@ejemplo.com"/>
    <label style="margin-top:10px">Fecha de cumpleaños</label>
    <div>${fechaSelectHTML('dp-cumple', p.cumple||'', {opcional:true, desde:new Date().getFullYear()-100, hasta:new Date().getFullYear()})}</div>
    <label class="check" style="margin-top:16px"><input type="checkbox" id="dp-mostrar-tel" ${p.mostrar_telefono?'checked':''}/> Mostrar mi teléfono en el directorio</label>
    <label class="check" style="margin-top:2px"><input type="checkbox" id="dp-mostrar-email" ${p.mostrar_email?'checked':''}/> Mostrar mi correo en el directorio</label>
    <p class="muted small" style="margin-top:6px">Por defecto tu teléfono y correo están <b>ocultos</b> para el resto de la iglesia; solo tú los ves aquí. Actívalo si quieres que aparezcan en tu tarjeta del directorio.</p>
    <button class="btn" style="margin-top:16px" onclick="guardarPerfilDirectorio()">Guardar</button>
  </div>`;
}
async function guardarPerfilDirectorio(){
  const body={
    nombre:$('dp-nombre').value.trim(),
    telefono:$('dp-tel').value.trim(),
    email:$('dp-email').value.trim(),
    cumple:fechaSelectValor('dp-cumple'),
    mostrar_telefono:$('dp-mostrar-tel').checked,
    mostrar_email:$('dp-mostrar-email').checked,
  };
  const file=$('dp-foto').files[0];
  await conBoton(botonActual(), async()=>{
    try{
      if(file) body.foto_url=await uploadArchivo(file);
      await api('/directorio/perfil',{method:'PATCH',body:JSON.stringify(body)});
      if(ME.persona){ ME.persona.nombre=body.nombre; pintarUsuarioLateral(); }
      toast('✅ Perfil actualizado');
      vistaDirectorio();
    }catch(e){ toast(e.message); }
  }, file?'Subiendo foto…':'Guardando…');
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
    <button class="link" style="color:var(--red-tx)" onclick="${delFn}(${id})">🗑️ Borrar</button></div>`;
}
// Modal de confirmación genérico
// Modal de confirmación genérico. opts: { okLabel, danger }.
function modalConfirm(msg, onYes, opts){
  opts = opts || {};
  const okLabel = opts.okLabel || 'Sí, continuar';
  const okClase = opts.danger ? 'btn danger' : 'btn';
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>Confirmar</h3>
    <p class="muted" style="margin:8px 0 16px">${msg}</p>
    <div class="row"><button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
    <button class="${okClase}" id="cf-ok">${okLabel}</button></div></div></div>`;
  root.classList.add('show');
  $('cf-ok').onclick=()=>{ cerrarModal(); onYes(); };
}
// Hermano de modalConfirm, pero con un campo de texto: sustituye a prompt(), que
// abre una ventanita gris del sistema, sin el tipo de letra ni los colores de la
// app, y que en varios navegadores de móvil se puede silenciar para siempre —
// entonces el botón deja de hacer nada y nadie sabe por qué.
//
// opts:
//   titulo      — encabezado del modal (por defecto "Confirmar")
//   placeholder — pista dentro del campo
//   valor       — texto de partida (editar en vez de crear)
//   okLabel     — texto del botón de aceptar
//   danger      — botón rojo, para lo destructivo
//   requerido   — palabra EXACTA que hay que teclear para poder aceptar; es lo
//                 que convierte una pregunta en un acto deliberado.
//   ayuda       — línea pequeña bajo el campo
// Igual que modalConfirm, `msg` se mete crudo en innerHTML (a propósito: varios
// mensajes llevan <b>), así que lo que se interpole ahí va con escHtml().
function modalPrompt(msg, cb, opts){
  opts = opts || {};
  const okClase = opts.danger ? 'btn danger' : 'btn';
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>${escHtml(opts.titulo||'Confirmar')}</h3>
    <p class="muted" style="margin:8px 0 14px">${msg}</p>
    <input id="mp-txt" type="text" autocomplete="off" placeholder="${escHtml(opts.placeholder||'')}" value="${escHtml(opts.valor||'')}" />
    ${opts.ayuda?`<p class="muted small" style="margin-top:6px">${escHtml(opts.ayuda)}</p>`:''}
    <div class="row" style="margin-top:16px"><button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
    <button class="${okClase}" id="mp-ok">${escHtml(opts.okLabel||'Guardar')}</button></div></div></div>`;
  root.classList.add('show');
  const inp=$('mp-txt'), ok=$('mp-ok');
  // El botón nace apagado y solo se enciende cuando lo escrito vale: así el
  // requisito se ve, en vez de descubrirse al tocar y que no pase nada.
  const vale=()=> opts.requerido ? inp.value.trim()===opts.requerido : inp.value.trim().length>0;
  const refrescar=()=>{ ok.disabled=!vale(); };
  const aceptar=()=>{ if(!vale()) return; const v=inp.value.trim(); cerrarModal(); cb(v); };
  inp.oninput=refrescar;
  inp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); aceptar(); } };
  ok.onclick=aceptar;
  refrescar();
  inp.focus();
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
//  ADMINISTRACIÓN (solo el pastor): usuarios, roles y grupos
// ============================================================
// Cada rol y los accesos/permisos que otorga (para el "agregado rápido").
const ROL_INFO={
  admin:        {label:'Líder de cuerpo',        acc:['Calendario completo','Asistencia','Gestión de servicio','Mi Grupo']},
  lider_musica: {label:'Líder de música',        acc:['Grupo de Alabanza (cancionero, equipo, material)','Calendario completo']},
  musico:       {label:'Músico',                 acc:['Compartir material / partituras del ministerio']},
  lider_ed:     {label:'Líder Esc. Dominical',   acc:['Niños / Escuela Dominical','Calendario completo']},
  tesorero:     {label:'Tesorero',               acc:['Tesorería']},
  miembro:      {label:'Miembro',                acc:['Pertenece al grupo (ve "Mi Grupo", recibe avisos)']},
};
// El nombre del cargo tal como se dice en la iglesia. El respaldo ya no
// devuelve la clave cruda: si mañana aparece un rol que no está en ROL_INFO,
// "lider_nuevo" se leería con el guion bajo a la vista bajo el nombre de la
// persona. Al menos sale como "Lider nuevo" mientras nadie le pone su nombre.
function rolLabel(r){
  const s=String(r||'');
  return (ROL_INFO[s]&&ROL_INFO[s].label) || (s?cap(s.replace(/_/g,' ')):'');
}

async function vistaAdmin(){
  $('content').innerHTML='<div id="adm" class="muted">Cargando…</div>';
  try{
    const d=await api('/admin/datos'); window._admin=d;
    renderAdmin();
  }catch(e){ $('adm').innerHTML='<p class="error">'+e.message+'</p>'; }
}
function renderAdmin(){
  const d=window._admin; const cont=$('adm'); if(!cont) return;
  cont.className='';
  const gruposOpts=d.grupos.map(g=>`<option value="${g.id}">${escHtml(g.nombre)}</option>`).join('');
  const rolesOpts=d.rolesDisponibles.map(r=>`<option value="${r}">${escHtml(rolLabel(r))}</option>`).join('');
  window._admGruposOpts=gruposOpts; window._admRolesOpts=rolesOpts;
  // --- Usuarios ---
  const usuarios=d.usuarios.map(u=>{
    const chips=u.roles.length
      ? u.roles.map(r=>`<span class="estado-chip" style="margin:2px 4px 2px 0">${escHtml(r.grupo)} · ${escHtml(rolLabel(r.rol))}
          <a href="javascript:adminQuitarRol(${r.pertenencia_id})" style="color:var(--red-tx);margin-left:4px" title="Quitar">✕</a></span>`).join('')
      : '<span class="muted small">Sin roles</span>';
    // anonimizada: la persona ejercio su derecho ARCO a eliminar su cuenta
    // (cuenta.js). El dato lo manda el backend (u.anonimizada), no se adivina
    // aqui del nombre o del usuario ('eliminado_<id>' es solo texto: una
    // persona real podria llamarse asi). El candado de verdad esta en el
    // servidor (admin.js responde 403 a las mismas acciones); esconder los
    // botones aqui es solo el acompañamiento visual.
    const badges=`${u.es_pastor?'<span class="estado-chip estado-aceptado">⛪ Pastor</span> ':''}${!u.activo?'<span class="estado-chip estado-rechazado">Inactivo</span>':''}${u.anonimizada?' <span class="estado-chip" style="opacity:.8">🔒 Eliminada por su titular</span>':''}`;
    // El super-admin y el obispo no son miembros de la congregación: el pastor
    // no los administra (el backend responde 403 en las tres acciones). Antes
    // solo se ocultaba "Restablecer contraseña", así que el botón "Desactivar"
    // seguía pintado en la fila del obispo — y desactivarlo lo dejaba fuera de
    // TODAS las iglesias, no solo de esta.
    const yo = ME && ME.persona && ME.persona.id;
    const esCuentaDeSistema = u.rol_global==='super_admin' || u.rol_global==='obispo';
    const puedeResetear = u.id!==yo && !esCuentaDeSistema && !u.anonimizada;
    return `<div class="item-card" style="margin-top:10px">
      <div class="flex" style="align-items:flex-start">
        <div style="flex:1">
          <b>${escHtml(u.nombre)}</b> <span class="muted small">@${escHtml(u.usuario)}</span> ${badges}
          <div class="muted small">${u.email?'✉️ '+escHtml(u.email):'sin correo'}</div>
          <div style="margin-top:6px">${chips}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          ${esCuentaDeSistema?'<span class="muted small">Cuenta de sistema</span>':
            u.anonimizada?'<span class="muted small">Eliminó su cuenta: no se puede modificar</span>':`
          <button class="btn ghost small-btn" onclick="adminFormRol(${u.id})">+ Rol</button>
          <button class="link" onclick="adminTogglePastor(${u.id},${u.es_pastor})">${u.es_pastor?'Quitar pastor':'Hacer pastor'}</button>
          <button class="link" onclick="adminCorregirNombre(${u.id})">✏️ Corregir nombre</button>
          ${puedeResetear?`<button class="link" onclick="adminResetClave(${u.id})">🔑 Restablecer contraseña</button>`:''}
          <button class="link" style="color:${u.activo?'var(--red-tx)':'var(--green-tx)'}" onclick="adminToggleActivo(${u.id},${u.activo})">${u.activo?'Desactivar':'Activar'}</button>`}
        </div>
      </div>
      <div id="adm-rolform-${u.id}"></div>
    </div>`;
  }).join('');
  // --- Grupos ---
  const grupos=d.grupos.map(g=>`<div class="item-card flex" style="margin-top:8px">
      <span style="width:14px;height:14px;border-radius:4px;background:${safeColor(g.color)};flex-shrink:0;margin-right:8px"></span>
      <div style="flex:1"><b>${escHtml(g.nombre)}</b></div>
      <button class="link" onclick="adminFormGrupo(${g.id})">✏️ Editar</button></div>`).join('');
  // --- Leyenda de roles ---
  // Sin la clave interna al lado: "Líder Esc. Dominical (lider_ed)" no le dice
  // nada al pastor, que es quien lee esta leyenda para repartir los roles.
  const leyenda=Object.entries(ROL_INFO).map(([k,v])=>`<div style="margin:6px 0">
      <b>${escHtml(v.label)}</b>
      <div class="muted small">Accesos: ${v.acc.map(escHtml).join(' · ')}</div></div>`).join('');

  cont.innerHTML=`
    <div class="card" style="margin-bottom:16px">
      <div class="head-row"><h3 style="font-size:16px">👥 Usuarios</h3>
        <button class="btn small-btn" onclick="adminFormUsuario()">+ Crear usuario</button></div>
      <p class="muted small" style="margin:-2px 0 8px">Crea cuentas y asigna roles. Un mismo rol puede tener varios usuarios.</p>
      <div id="adm-userform"></div>
      ${usuarios||'<p class="muted small">Sin usuarios.</p>'}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="head-row"><h3 style="font-size:16px">🏷️ Grupos / Ministerios</h3>
        <button class="btn small-btn" onclick="adminFormGrupo(0)">+ Grupo</button></div>
      <div id="adm-grupoform"></div>
      ${grupos||'<p class="muted small">Sin grupos.</p>'}
    </div>
    <div class="card">
      <h3 style="font-size:16px;margin-bottom:6px">🔑 Roles y accesos</h3>
      <p class="muted small" style="margin:-2px 0 8px">Qué permisos otorga cada rol al asignarlo.</p>
      ${leyenda}
    </div>`;
}

// --- Crear usuario ---
function adminFormUsuario(){
  const z=$('adm-userform'); if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div class="form-panel">
    <div class="row" style="gap:8px"><input id="au-nombre" placeholder="Nombre completo"/><input id="au-usuario" placeholder="Usuario (para entrar)"/></div>
    <div class="row" style="gap:8px;margin-top:8px">
      <input id="au-pass" type="text" placeholder="Contraseña inicial"/>
      <input id="au-email" type="email" placeholder="Correo (opcional)"/></div>
    <p id="au-err" class="error"></p>
    <button class="btn small-btn" style="margin-top:8px" onclick="adminCrearUsuario()">Crear</button></div>`;
}
async function adminCrearUsuario(){
  const body={nombre:$('au-nombre').value.trim(),usuario:$('au-usuario').value.trim(),password:$('au-pass').value,email:$('au-email').value.trim()};
  if(!body.nombre||!body.usuario){ $('au-err').textContent='Pon nombre y usuario'; return; }
  if((body.password||'').length<8){ $('au-err').textContent='La contraseña debe tener al menos 8 caracteres'; return; }
  await conBoton(botonActual(), async()=>{
    try{ await api('/admin/usuarios',{method:'POST',body:JSON.stringify(body)}); toast('✅ Usuario creado'); vistaAdmin(); }
    catch(e){ $('au-err').textContent=e.message; }
  });
}

// --- Asignar rol (agregado rápido, con accesos visibles) ---
function adminFormRol(personaId){
  const z=$('adm-rolform-'+personaId); if(!z) return; if(z.innerHTML){ z.innerHTML=''; return; }
  z.innerHTML=`<div style="background:var(--bg);padding:12px;border-radius:12px;margin-top:10px">
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <select id="ar-rol-${personaId}" onchange="adminPreviewRol(${personaId})">${window._admRolesOpts}</select>
      <select id="ar-grupo-${personaId}">${window._admGruposOpts}</select>
      <button class="btn small-btn" onclick="adminAsignarRol(${personaId})">Asignar</button>
    </div>
    <p class="muted small" id="ar-acc-${personaId}" style="margin:8px 0 0"></p></div>`;
  adminPreviewRol(personaId);
}
function adminPreviewRol(personaId){
  const rol=$('ar-rol-'+personaId).value; const info=ROL_INFO[rol];
  const el=$('ar-acc-'+personaId); if(el&&info) el.innerHTML='Este rol otorga: <b>'+info.acc.map(escHtml).join(' · ')+'</b>';
}
async function adminAsignarRol(personaId){
  const rol=$('ar-rol-'+personaId).value, grupo_id=$('ar-grupo-'+personaId).value;
  try{ await api('/admin/usuarios/'+personaId+'/rol',{method:'POST',body:JSON.stringify({rol,grupo_id})}); toast('🔑 Rol asignado'); vistaAdmin(); }
  catch(e){ toast(e.message); }
}
function adminQuitarRol(pertId){ modalConfirm('¿Quitar este rol al usuario?', async()=>{
  try{ await api('/admin/rol/'+pertId,{method:'DELETE'}); toast('Rol quitado'); vistaAdmin(); }catch(e){ toast(e.message); } }); }

function adminTogglePastor(id, actual){
  const txt=actual?'¿Quitar el rol de Pastor a este usuario?':'¿Hacer Pastor a este usuario? Tendrá acceso total a la iglesia.';
  modalConfirm(txt, async()=>{
    try{ await api('/admin/usuarios/'+id,{method:'PATCH',body:JSON.stringify({es_pastor:!actual})}); toast('Listo'); vistaAdmin(); }catch(e){ toast(e.message); } });
}
function adminToggleActivo(id, actual){
  modalConfirm(actual?'¿Desactivar esta cuenta? No podrá iniciar sesión.':'¿Reactivar esta cuenta?', async()=>{
    try{ await api('/admin/usuarios/'+id,{method:'PATCH',body:JSON.stringify({activo:!actual})}); toast('Listo'); vistaAdmin(); }catch(e){ toast(e.message); } });
}

// --- Restablecer la contraseña de un miembro (clave temporal) ---
// El que olvida su contraseña no puede recuperarla solo (el envío de correo
// puede no estar configurado): el pastor le genera una clave temporal y se la
// dicta. La clave se muestra en un MODAL, no en un toast: tiene que quedar en
// pantalla para copiarla o leerla en voz alta, y no se puede volver a consultar.
function adminResetClave(id){
  const d=window._admin; const u=(d&&d.usuarios||[]).find(x=>x.id===id); if(!u) return;
  const btn=botonActual();   // se captura ANTES de abrir el modal (luego ya no hay evento)
  modalConfirm(
    'Se generará una <b>contraseña temporal</b> para <b>'+escHtml(u.nombre)+'</b>. Su contraseña actual dejará de funcionar y tendrá que cambiarla al entrar. ¿Continuar?',
    async()=>{
      await conBoton(btn, async()=>{
        try{
          const r=await api('/admin/usuarios/'+id+'/clave',{method:'POST'});
          adminMostrarClaveTemporal(u, (r&&r.password_temporal)||'');
        }catch(e){ toast((e&&e.message)||'No se pudo restablecer la contraseña'); }
      });
    }
  );
}
// Quien se registró mal ("juan perez") se quedaba así para siempre si no
// sabía llegar a "Mi perfil" o no podía entrar a la app. Mismo argumento que
// "Restablecer contraseña": el pastor lo arregla por ella. Sin razón de
// seguridad para bloquear que se lo haga a sí mismo (ya puede desde su
// perfil), así que este botón va fuera del if(puedeResetear).
function adminCorregirNombre(id){
  // El guardia `d && d.usuarios` es el mismo de adminResetClave: si la lista
  // aun no cargo, window._admin es undefined y leerle .usuarios reventaria la
  // pantalla entera en vez de no hacer nada.
  const d=window._admin; const u=(d&&d.usuarios||[]).find(x=>x.id===id); if(!u) return;
  modalPrompt(`Nuevo nombre para <b>${escHtml(u.nombre)}</b>.`, async(nombre)=>{
    try{ await api('/admin/usuarios/'+id,{method:'PATCH',body:JSON.stringify({nombre})});
      // Este boton tambien sale sobre la propia fila del pastor: si se corrige
      // a si mismo, el pie de la barra lateral tiene que repintarse igual que
      // desde "Mi perfil".
      if(ME.persona&&ME.persona.id===id){ ME.persona.nombre=nombre; pintarUsuarioLateral(); }
      toast('✅ Nombre corregido'); vistaAdmin(); }
    catch(e){ toast(e.message); }
  }, {titulo:'Corregir nombre', placeholder:'Nombre completo', valor:u.nombre, okLabel:'Guardar'});
}
function adminMostrarClaveTemporal(u, pass){
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal">
    <h3>🔑 Contraseña temporal</h3>
    <p class="muted small" style="margin:8px 0 12px">Para <b>${escHtml(u.nombre)}</b> (usuario: <b>${escHtml(u.usuario)}</b>).
      Anótala o cópiala ahora: por seguridad <b>no se puede volver a ver</b>.</p>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
      <p class="muted small" style="margin-bottom:6px">Entrégasela — la app le pedirá cambiarla al entrar:</p>
      <div id="adm-pass-temporal" style="font-size:1.6rem;font-weight:800;letter-spacing:.08em;color:var(--primary);word-break:break-all">${escHtml(pass)}</div>
      <button class="btn small-btn" style="margin-top:10px" onclick="saCopiar($('adm-pass-temporal').textContent)">📋 Copiar contraseña</button>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" style="width:100%" onclick="cerrarModal()">Cerrar</button></div>
  </div></div>`;
  root.classList.add('show');
}

// --- Crear / editar grupo ---
function adminFormGrupo(id){
  const z=$('adm-grupoform'); const g=id?(window._admin.grupos.find(x=>x.id===id)||{}):{};
  if(z.innerHTML && z.dataset.id===String(id)){ z.innerHTML=''; z.dataset.id=''; return; }
  z.dataset.id=String(id);
  z.innerHTML=`<div class="form-panel">
    <div class="row" style="gap:8px">
      <input id="ag-nombre" placeholder="Nombre del grupo" value="${escHtml(g.nombre||'')}"/>
      <input id="ag-color" type="color" value="${safeColor(g.color,'#1C61A6')}" style="max-width:60px;padding:4px"/></div>
    <p id="ag-err" class="error"></p>
    <button class="btn small-btn" style="margin-top:8px" onclick="adminGuardarGrupo(${id})">${id?'Guardar':'Crear'}</button></div>`;
}
async function adminGuardarGrupo(id){
  const body={nombre:$('ag-nombre').value.trim(),color:$('ag-color').value};
  if(!body.nombre){ $('ag-err').textContent='Pon un nombre'; return; }
  try{
    if(id) await api('/admin/grupos/'+id,{method:'PATCH',body:JSON.stringify(body)});
    else await api('/admin/grupos',{method:'POST',body:JSON.stringify(body)});
    toast('Listo'); vistaAdmin();
  }catch(e){ $('ag-err').textContent=e.message; }
}

// ============================================================
//  SUPER-ADMIN: crear iglesias (visible solo si rol_global==='super_admin')
// ============================================================
async function vistaSuperadmin(){
  $('content').innerHTML=`
    <div class="card" style="max-width:640px;margin-bottom:20px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">💾 Respaldo</h2>
      <p class="muted small" style="margin-bottom:14px">Si esto no está en verde, un reinicio del servicio borra los datos.</p>
      <div id="sa-persistencia" class="muted small">Comprobando…</div>
    </div>
    <div class="card" style="max-width:640px;margin-bottom:20px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">🛡️ Crear iglesia</h2>
      <p class="muted small" style="margin-bottom:14px">Crea una nueva iglesia junto a la cuenta de su pastor. El código que se genera se lo entregas a la iglesia para que sus feligreses puedan unirse.</p>
      <label for="sa-nombre-ig">Nombre de la iglesia</label>
      <input id="sa-nombre-ig" placeholder="Ej. Iglesia Monte Sion"/>
      <label for="sa-codigo" style="margin-top:8px">Código <span class="muted">(opcional — se genera solo si lo dejas vacío)</span></label>
      <input id="sa-codigo" placeholder="Ej. MONTESION"/>
      <label for="sa-pastor-nombre" style="margin-top:8px">Nombre del pastor</label>
      <input id="sa-pastor-nombre" placeholder="Nombre y apellido"/>
      <label for="sa-pastor-usuario" style="margin-top:8px">Usuario del pastor</label>
      <input id="sa-pastor-usuario" placeholder="Usuario para entrar"/>
      <label for="sa-pastor-email" style="margin-top:8px">Correo del pastor</label>
      <input id="sa-pastor-email" type="email" placeholder="correo@ejemplo.com"/>
      <label style="margin-top:8px">Contraseña temporal del pastor</label>
      <div class="row" style="gap:8px">
        <input id="sa-pastor-pass" type="password" placeholder="Contraseña temporal"/>
        <button class="btn ghost small-btn" type="button" style="max-width:52px" onclick="toggleVerPass('sa-pastor-pass',this)" title="Ver/ocultar">👁️</button>
      </div>
      <p id="sa-error" class="error"></p>
      <button class="btn" style="width:100%;margin-top:12px" onclick="saCrearIglesia()">Crear iglesia</button>
      <div id="sa-resultado"></div>
    </div>
    <div class="card" style="max-width:640px">
      <h3 style="font-size:16px;margin-bottom:10px">⛪ Iglesias creadas</h3>
      <div id="sa-lista" class="muted small">Cargando…</div>
    </div>`;
  saCargarLista();
  saCargarPersistencia();
}
let SA_IGLESIAS=[]; // cache de la última lista cargada (para abrir el modal de editar sin otro fetch)
async function saCargarLista(){
  const z=$('sa-lista'); if(!z) return;
  try{
    const lista=await api('/superadmin/iglesias');
    SA_IGLESIAS=lista||[];
    z.className='';
    z.innerHTML = (lista&&lista.length) ? lista.map(ig=>{
      const codigo = ig.codigo_unico||ig.codigo||'';
      const activa = ig.activa!==0 && ig.activa!==false;
      return `<div class="item-card" style="margin-top:8px">
        <div class="flex">
          <div style="flex:1">
            <b>${escHtml(ig.nombre)}</b>
            <span class="estado-chip ${activa?'estado-aceptado':'estado-rechazado'}" style="margin-top:0;margin-left:6px;vertical-align:middle">${activa?'Activa':'Desactivada'}</span>
            <div class="muted small">Código: <code>${escHtml(codigo)}</code> · Pastor: ${escHtml(ig.pastor||'—')} · ${ig.miembros||0} miembro(s)</div>
          </div>
          <button class="btn ghost small-btn" onclick="saCopiar('${escHtml(codigo)}')">📋 Copiar</button>
        </div>
        <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn ghost small-btn" onclick="saEditarIglesia(${ig.id})">✏️ Editar</button>
          <button class="btn ghost small-btn" onclick="saToggleActiva(${ig.id})">${activa?'⛔ Desactivar':'✅ Reactivar'}</button>
          <button class="btn ghost small-btn" onclick="saResetPastor(${ig.id})">🔑 Resetear contraseña del pastor</button>
          <button class="btn ghost small-btn" style="color:var(--red-tx)" onclick="saEliminarIglesia(${ig.id})">🗑️ Eliminar</button>
        </div>
      </div>`;
    }).join('') : '<p class="muted small">Aún no hay iglesias creadas.</p>';
  }catch(e){ z.className='error'; z.textContent='No se pudo cargar la lista: '+((e&&e.message)||'error'); }
}
// Pinta el estado del respaldo. Cuatro estados, no dos: "no pude comprobarlo"
// (ambar) no es lo mismo que "esta mal" (rojo), y "esta instancia no replica"
// (gris) es lo normal en desarrollo, no una alarma.
const PERS_PINTA={ok:['✅','--green-tx','Respaldando'],mal:['⛔','--red-tx','SIN RESPALDO'],
  desconocido:['⚠️','--amber-tx','No se pudo comprobar'],no_aplica:['—','--muted','Esta instancia no replica']};
const PERS_MOTIVO={sin_generaciones:'nunca se ha replicado nada',retraso_alto:'el respaldo va muy atrasado',
  formato_no_reconocido:'respuesta inesperada de Litestream',comando_fallo:'Litestream devolvió un error',
  salida_con_error:'Litestream no pudo leer el respaldo (revisa las variables R2_*/LITESTREAM_*)',
  tiempo_agotado:'Litestream no respondió a tiempo',binario_ausente:'no hay Litestream en esta máquina',
  sello_ausente:'el respaldo de archivos no ha corrido nunca',sello_viejo:'el respaldo de archivos está detenido',
  arrancando:'el servicio acaba de arrancar',error_interno:'error al comprobar',
  sin_configurar:'faltan las variables R2_*/LITESTREAM_* en el entorno'};

function _persFila(etiqueta,b){
  const [ico,varColor,texto]=PERS_PINTA[b.estado]||PERS_PINTA.desconocido;
  const motivo=b.motivo?` · ${escHtml(PERS_MOTIVO[b.motivo]||b.motivo)}`:'';
  // Tiempo relativo, con la fecha exacta a un paso (el title, al pasar el
  // cursor): lo que se necesita saber de un respaldo es cuánto hace, no a qué
  // hora fue.
  const hace=haceTxt(b.ultimo);
  const cuando=hace
    ? ` · último: <span title="${escHtml(new Date(b.ultimo).toLocaleString('es-CL'))}">${escHtml(hace)}</span>`
    : '';
  // El retraso en números. El backend ya lo calculaba pero no se pintaba: con
  // el motivo 'retraso_alto' la tarjeta no distinguía 16 minutos de 6 horas, y
  // en verde explica por qué un "último" viejo puede ser sano (nadie escribió,
  // así que no hay nada pendiente de replicar).
  const retraso=Number.isFinite(b.retraso_seg)?` · retraso: ${escHtml(duracionTxt(b.retraso_seg))}`:'';
  return `<div class="row" style="justify-content:space-between;gap:10px;margin:6px 0">
    <span>${escHtml(etiqueta)}</span>
    <span style="color:var(${varColor});text-align:right">${ico} ${escHtml(texto)}<span class="muted small">${motivo}${cuando}${retraso}</span></span>
  </div>`;
}

// "El servicio acaba de arrancar" es un estado TRANSITORIO: el backend perdona
// los 3 primeros minutos para no dar una alarma falsa mientras el respaldo da su
// primera vuelta (GRACIA_ARRANQUE_SEG en persistencia.js). Pero esta tarjeta se
// pintaba UNA sola vez al abrir el panel, asi que ese texto se quedaba congelado
// en pantalla indefinidamente y quien lo leia no tenia forma de saber que solo
// hacia falta esperar -- ni de distinguirlo de un indicador roto. Se vuelve a
// preguntar sola mientras el estado siga siendo transitorio.
//
// Cada 30 s porque es lo que el backend cachea ese estado (CACHE_ARRANCANDO_MS):
// preguntar antes devuelve el mismo valor cacheado. Y CON TOPE: sondear para
// siempre por si acaso es otra forma de no tener indicador, y el propio caso que
// motivo esto -- un servicio que reinicia en bucle y nunca sale de la gracia --
// dejaria la pestana pidiendo cada 30 s durante horas.
const PERS_REINTENTO_MS=30*1000;
const PERS_REINTENTOS_MAX=8;          // ~4 min: cubre la gracia de 3 min con margen
let _persTimer=null,_persIntentos=0;

async function saCargarPersistencia(){
  const c=$('sa-persistencia'); if(!c) return;
  if(_persTimer){ clearTimeout(_persTimer); _persTimer=null; }
  try{
    const e=await api('/superadmin/persistencia');
    c.className='muted small';
    c.innerHTML=_persFila('Base de datos',e.bd)+_persFila('Archivos subidos',e.uploads);
    const transitorio=e.bd.motivo==='arrancando'||e.uploads.motivo==='arrancando';
    if(transitorio&&_persIntentos<PERS_REINTENTOS_MAX){
      _persIntentos++;
      c.innerHTML+=`<div class="muted small" style="margin-top:6px">⏳ Comprobando de nuevo en
        ${PERS_REINTENTO_MS/1000} s (intento ${_persIntentos} de ${PERS_REINTENTOS_MAX})…</div>`;
      _persTimer=setTimeout(saCargarPersistencia,PERS_REINTENTO_MS);
    }else if(transitorio){
      // Agotados los reintentos y sigue "arrancando": eso ya NO es el arranque
      // normal. Lo mas probable es que el servicio se este reiniciando en bucle,
      // que es justo lo que paso el 29 jul con /api/health limitada. Decirlo,
      // en vez de dejar un "no se pudo comprobar" que parece inocente.
      c.innerHTML+=`<div style="margin-top:6px;color:var(--red-tx)">⚠️ Lleva
        ${Math.round(PERS_REINTENTOS_MAX*PERS_REINTENTO_MS/60000)} minutos diciendo que acaba de
        arrancar. Si fuera un arranque normal ya habría terminado: puede que el servicio se esté
        reiniciando en bucle. Mira los registros del servicio (Events/Logs).</div>`;
    }else{
      _persIntentos=0;   // estado resuelto: el proximo arranque vuelve a tener sus 8 intentos
    }
  }catch(err){ c.className='error'; c.textContent='No se pudo consultar el estado del respaldo.'; }
  // El super-admin no pasa por el dashboard, que es quien normalmente rellena
  // la campana: aqui se hace explicito, si no su aviso no se veria nunca.
  // El orden importa y es el que esta: GET /superadmin/persistencia crea el
  // aviso ANTES de responder (superadmin.js), asi que cuando se llega a esta
  // linea el aviso de esta misma carga ya esta en la BD. Antes lo creaba solo
  // la comprobacion lanzada y olvidada desde /api/me, que podia terminar
  // despues de esta peticion: la tarjeta salia roja y la campana en 0.
  // GET /api/notificaciones devuelve { items, noLeidas, hayMas, offset }
  // (notificaciones.js:79-92) y setCampana(n) espera el numero (app.js:309).
  try{ const n=await api('/notificaciones'); setCampana(n.noLeidas); }catch{}
}
// ---------- Editar iglesia (nombre / código) ----------
function saEditarIglesia(id){
  const ig=SA_IGLESIAS.find(i=>i.id===id); if(!ig) return;
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal">
    <h3>✏️ Editar iglesia</h3>
    <label for="sa-ed-nombre">Nombre</label>
    <input id="sa-ed-nombre" value="${escHtml(ig.nombre)}"/>
    <label for="sa-ed-codigo" style="margin-top:8px">Código</label>
    <input id="sa-ed-codigo" value="${escHtml(ig.codigo_unico||'')}"/>
    <p id="sa-ed-error" class="error"></p>
    <div class="row" style="margin-top:14px">
      <button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
      <button class="btn" id="sa-ed-ok">Guardar</button>
    </div></div></div>`;
  root.classList.add('show');
  $('sa-ed-ok').onclick=async()=>{
    const err=$('sa-ed-error'); err.textContent='';
    const nombre=$('sa-ed-nombre').value.trim();
    const codigo=$('sa-ed-codigo').value.trim();
    if(!nombre){ err.textContent='El nombre no puede quedar vacío'; return; }
    if(!codigo){ err.textContent='El código no puede quedar vacío'; return; }
    try{
      await api('/superadmin/iglesias/'+id,{method:'PATCH',body:JSON.stringify({nombre,codigo})});
      cerrarModal(); toast('✅ Iglesia actualizada'); saCargarLista();
    }catch(e){ err.textContent=(e&&e.message)||'No se pudo guardar'; }
  };
}
// ---------- Desactivar / Reactivar ----------
async function saToggleActiva(id){
  const ig=SA_IGLESIAS.find(i=>i.id===id); if(!ig) return;
  const activa = ig.activa!==0 && ig.activa!==false;
  const hacer=async()=>{
    try{
      await api('/superadmin/iglesias/'+id,{method:'PATCH',body:JSON.stringify({activa:!activa})});
      toast(activa?'⛔ Iglesia desactivada':'✅ Iglesia reactivada'); saCargarLista();
    }catch(e){ toast((e&&e.message)||'No se pudo actualizar'); }
  };
  if(activa){
    modalConfirm('Nadie de <b>'+escHtml(ig.nombre)+'</b> podrá entrar mientras esté desactivada. ¿Desactivar esta iglesia?', hacer);
  } else {
    hacer();
  }
}
// ---------- Resetear contraseña del pastor ----------
async function saResetPastor(id){
  const ig=SA_IGLESIAS.find(i=>i.id===id); if(!ig) return;
  modalConfirm('Se generará una nueva contraseña temporal para el pastor de <b>'+escHtml(ig.nombre)+'</b>. La contraseña anterior dejará de funcionar. ¿Continuar?', async()=>{
    try{
      const r=await api('/superadmin/iglesias/'+id+'/reset-pastor',{method:'POST'});
      const pass=(r&&r.password_temporal)||'';
      const root=$('modal-root');
      root.innerHTML=`<div class="modal-bg"><div class="modal">
        <h3>🔑 Contraseña temporal generada</h3>
        <p class="muted small" style="margin:8px 0 12px">Pastor: <b>${escHtml((r.pastor&&r.pastor.nombre)||'')}</b> (usuario: ${escHtml((r.pastor&&r.pastor.usuario)||'')})</p>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
          <p class="muted small" style="margin-bottom:6px">Entrégasela al pastor — deberá cambiarla al ingresar:</p>
          <div id="sa-pass-temporal" style="font-size:1.6rem;font-weight:800;letter-spacing:.08em;color:var(--primary)">${escHtml(pass)}</div>
          <button class="btn small-btn" style="margin-top:10px" onclick="saCopiar('${escHtml(pass)}')">📋 Copiar contraseña</button>
        </div>
        <div class="row" style="margin-top:14px"><button class="btn ghost" style="width:100%" onclick="cerrarModal()">Cerrar</button></div>
      </div></div>`;
      root.classList.add('show');
    }catch(e){ toast((e&&e.message)||'No se pudo resetear la contraseña'); }
  });
}
// ---------- Eliminar iglesia por completo (doble confirmación) ----------
function saEliminarIglesia(id){
  const ig=SA_IGLESIAS.find(i=>i.id===id); if(!ig) return;
  const miembros=ig.miembros||0, eventos=ig.eventos||0;
  modalConfirm(
    `Vas a eliminar <b>${escHtml(ig.nombre)}</b>: <b>${miembros}</b> miembro(s), <b>${eventos}</b> evento(s), y toda su tesorería, mensajes, niños y archivos subidos.<br><br><b>Esto NO se puede deshacer.</b>`,
    ()=>{
      modalConfirm(
        `¿De verdad quieres eliminar <b>${escHtml(ig.nombre)}</b>? Esta acción es <b>definitiva</b>.`,
        async()=>{
          try{
            const r=await api('/superadmin/iglesias/'+id,{method:'DELETE'});
            toast('🗑️ Iglesia eliminada'+((r&&r.archivos_borrados)?` (${r.archivos_borrados} archivo(s))`:''));
            saCargarLista();
          }catch(e){ toast((e&&e.message)||'No se pudo eliminar'); }
        },
        { okLabel:'Sí, eliminar definitivamente', danger:true }
      );
    },
    { okLabel:'Sí, eliminar', danger:true }
  );
}
async function saCrearIglesia(){
  const err=$('sa-error'); err.textContent='';
  const body={
    nombre_iglesia: $('sa-nombre-ig').value.trim(),
    pastor_nombre: $('sa-pastor-nombre').value.trim(),
    pastor_usuario: $('sa-pastor-usuario').value.trim(),
    pastor_email: $('sa-pastor-email').value.trim(),
    pastor_password: $('sa-pastor-pass').value,
  };
  const codigo=$('sa-codigo').value.trim();
  if(codigo) body.codigo=codigo;
  if(!body.nombre_iglesia){ err.textContent='Escribe el nombre de la iglesia'; return; }
  if(!body.pastor_nombre||!body.pastor_usuario||!body.pastor_email){ err.textContent='Completa nombre, usuario y correo del pastor'; return; }
  if((body.pastor_password||'').length<8){ err.textContent='La contraseña temporal debe tener al menos 8 caracteres'; return; }
  await conBoton(botonActual(), async()=>{
    try{
      const r=await api('/superadmin/iglesias',{method:'POST',body:JSON.stringify(body)});
      toast('✅ Iglesia creada');
      const igCodigo=(r.iglesia&&(r.iglesia.codigo_unico||r.iglesia.codigo))||codigo||'';
      const pastorUsuario=(r.pastor&&r.pastor.usuario)||body.pastor_usuario;
      $('sa-resultado').innerHTML=`
        <div style="margin-top:14px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
          <p class="muted small" style="margin-bottom:6px">Código de la iglesia — compártelo con tu comunidad:</p>
          <div style="font-size:1.8rem;font-weight:800;letter-spacing:.08em;color:var(--primary)">${escHtml(igCodigo)}</div>
          <button class="btn small-btn" style="margin-top:10px" onclick="saCopiar('${escHtml(igCodigo)}')">📋 Copiar código</button>
          <p class="muted small" style="margin-top:10px">Pastor creado: <b>${escHtml(pastorUsuario)}</b></p>
        </div>`;
      ['sa-nombre-ig','sa-codigo','sa-pastor-nombre','sa-pastor-usuario','sa-pastor-email','sa-pastor-pass'].forEach(id=>{ const i=$(id); if(i) i.value=''; });
      saCargarLista();
    }catch(e){ err.textContent=(e&&e.message)||'No se pudo crear la iglesia'; }
  });
}
function saCopiar(codigo){
  if(!codigo) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(codigo).then(()=>toast('📋 Copiado')).catch(()=>toast('No se pudo copiar. Cópialo manualmente: '+codigo));
  } else { toast('Copia manual: '+codigo); }
}

// ============================================================
//  AJUSTES — apariencia (tema, color de acento, tamaño de texto)
// ============================================================
// Cada acento trae su propio tono de barra lateral (`side`) y su realce (`acc`),
// para que al cambiarlo NO quede la app a medias con el azul fijo del CSS.
const ACENTOS={
  cielo:    {nombre:'Cielo',    p:'#1C61A6',p7:'#154E86',p6:'#1A5B9C',side:'#0F3355',acc:'#D98C1F'},  // paleta del logo
  pino:     {nombre:'Pino',     p:'#0F5C57',p7:'#0B4745',p6:'#0E5450',side:'#08332F',acc:'#C19E55'},
  azul:     {nombre:'Azul',     p:'#2563EB',p7:'#1D4ED8',p6:'#1E54D9',side:'#152A63',acc:'#F0A32C'},
  esmeralda:{nombre:'Esmeralda',p:'#059669',p7:'#047857',p6:'#059669',side:'#06382B',acc:'#D6A840'},
  violeta:  {nombre:'Violeta',  p:'#7C3AED',p7:'#6D28D9',p6:'#7C3AED',side:'#2E1A55',acc:'#E0A32E'},
  naranja:  {nombre:'Naranja',  p:'#EA580C',p7:'#C2410C',p6:'#EA580C',side:'#4A2109',acc:'#FBBF24'},
  rosa:     {nombre:'Rosa',     p:'#DB2777',p7:'#BE185D',p6:'#DB2777',side:'#4A1030',acc:'#E8B04B'},
  grafito:  {nombre:'Grafito',  p:'#334155',p7:'#1E293B',p6:'#334155',side:'#16202B',acc:'#B07D2B'},
};
function ajustes(){ try{ return JSON.parse(localStorage.getItem('ajustes')||'{}'); }catch{ return {}; } }
function aplicarAjustes(){
  const a=ajustes(), root=document.documentElement;
  const ac=ACENTOS[a.acento]||ACENTOS.cielo;
  root.style.setProperty('--primary',ac.p);
  root.style.setProperty('--primary-700',ac.p7);
  root.style.setProperty('--primary-600',ac.p6);
  root.style.setProperty('--sidebar',ac.side);
  root.style.setProperty('--gold',ac.acc);
  root.style.setProperty('--turq',ac.acc);
  // Un solo color en dos tonos (igual que el CSS): el realce va aparte, no dentro del degradado.
  root.style.setProperty('--grad','linear-gradient(135deg,'+ac.p+' 0%,'+ac.p7+' 100%)');
  root.style.setProperty('--grad-hero','linear-gradient(120deg,'+ac.side+' 0%,'+ac.p7+' 62%,'+ac.p+' 100%)');
  root.style.fontSize=({sm:'15px',md:'16px',lg:'18px'}[a.texto]||'16px');
  const dark = a.tema==='dark' || (a.tema==='auto' && window.matchMedia && matchMedia('(prefers-color-scheme:dark)').matches);
  root.setAttribute('data-theme', dark?'dark':'light');
}
function setAjuste(k,v){ const a=ajustes(); a[k]=v; localStorage.setItem('ajustes',JSON.stringify(a)); aplicarAjustes(); vistaAjustes(); }

// ---------- WEB PUSH (notificaciones reales) ----------
function _urlB64ToUint8(base64){
  const pad='='.repeat((4-base64.length%4)%4);
  const b=(base64+pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b), arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
  return arr;
}
function pushSoportado(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
async function pushEstado(){
  if(!pushSoportado()) return {soportado:false};
  try{ const reg=await navigator.serviceWorker.ready; const sub=await reg.pushManager.getSubscription();
    return {soportado:true, permiso:Notification.permission, suscrito:!!sub}; }
  catch{ return {soportado:true, permiso:Notification.permission, suscrito:false}; }
}
async function activarPush(){
  if(!pushSoportado()){ toast('Tu navegador no soporta notificaciones push'); return; }
  try{
    const info=await api('/push/clave-publica');
    if(!info.activo||!info.clave){ toast('El servidor aún no tiene push configurado'); return; }
    const permiso=await Notification.requestPermission();
    if(permiso!=='granted'){ toast('Permiso de notificaciones denegado'); return; }
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:_urlB64ToUint8(info.clave)});
    await api('/push/suscribir',{method:'POST',body:JSON.stringify(sub)});
    toast('🔔 Notificaciones activadas'); vistaAjustes();
  }catch(e){
    const m=(e&&e.message)||String(e);
    if(/push service|Registration failed/i.test(m))
      toast('No se pudo activar. Si usas Brave: abre brave://settings/privacy, activa "Usar los servicios de Google para mensajería push", reinicia Brave y reintenta. (En Chrome/Edge funciona directo.)');
    else toast('No se pudo activar: '+m);
  }
}
// Al abrir la app: si ya diste permiso, re-suscribe en silencio para que las
// notificaciones sigan llegando sin tener que reactivar cada vez.
async function pushAutoResuscribir(){
  if(!pushSoportado() || Notification.permission!=='granted') return;
  try{
    const info=await api('/push/clave-publica');
    if(!info.activo||!info.clave) return;
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:_urlB64ToUint8(info.clave)});
    await api('/push/suscribir',{method:'POST',body:JSON.stringify(sub)});
  }catch{}
}
// Corta el push de ESTE dispositivo: baja en el servidor (si avisarServidor;
// el fallo se traga, porque tras eliminar la cuenta o caducar la sesion el
// token ya no autentica) y siempre des-suscribe el navegador, que es el corte
// real. Nunca lanza: cerrar sesion no puede quedarse a medias por la red.
async function pushCortarDispositivo({avisarServidor=true}={}){
  if(!pushSoportado()) return true;
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(!sub) return true;
    // fetch crudo, no api(): con la cuenta recien eliminada el token ya no
    // autentica, y el 401 no puede disparar _sesionCaducada desde dentro del
    // propio corte (pisaria el aviso de "cuenta eliminada" con el de sesion).
    if(avisarServidor) await fetch(API+'/push/baja',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
    await sub.unsubscribe();
    return true;
  }catch{ return false; }
}
async function desactivarPush(){
  const ok=await pushCortarDispositivo({avisarServidor:true});
  toast(ok?'Notificaciones desactivadas':'No se pudo desactivar. Inténtalo otra vez.');
  vistaAjustes();
}
async function probarPush(){
  try{ await api('/push/probar',{method:'POST'}); toast('Enviado — debería llegar la notificación 🔔'); }
  catch(e){ toast(e.message); }
}
async function renderPushAjuste(){
  const cont=$('push-ajuste'); if(!cont) return;
  const st=await pushEstado();
  if(!st.soportado){ cont.innerHTML='<p class="muted small" style="margin:0">Este navegador no soporta notificaciones push.</p>'; return; }
  let info={activo:false}; try{ info=await api('/push/clave-publica'); }catch{}
  if(!info.activo){ cont.innerHTML='<p class="muted small" style="margin:0">El servidor aún no tiene las notificaciones push configuradas.</p>'; return; }
  if(st.permiso==='denied'){ cont.innerHTML='<p class="muted small" style="margin:0">Bloqueaste las notificaciones en el navegador. Habilítalas para este sitio desde los ajustes del navegador.</p>'; return; }
  if(st.suscrito){
    cont.innerHTML=`<p class="small" style="margin:0 0 10px">🔔 Activadas en este dispositivo.</p>
      <div class="ajuste-opts"><button class="btn small-btn" onclick="probarPush()">Probar</button>
      <button class="btn ghost small-btn" onclick="desactivarPush()">Desactivar</button></div>`;
  } else {
    cont.innerHTML=`<p class="muted small" style="margin:0 0 10px">Recibe avisos aunque tengas la app cerrada.</p>
      <button class="btn small-btn" onclick="activarPush()">Activar notificaciones</button>`;
  }
}

// ---------- MI CUENTA (correo + contraseña) ----------
function toggleVerPass(id, btn){
  const i=$(id); if(!i) return;
  i.type = i.type==='password' ? 'text' : 'password';
  if(btn) btn.textContent = i.type==='password' ? '👁️' : '🙈';
}
async function guardarEmailCuenta(){
  const email=$('cta-email').value.trim();
  try{ const r=await api('/cuenta/email',{method:'PATCH',body:JSON.stringify({email})});
    ME.persona.email=r.email; toast('✅ Correo guardado'); }
  catch(e){ toast(e.message); }
}
async function cargarTelefonoCuenta(){
  try{ const p=await api('/directorio/perfil');
    const t=$('cta-tel'); if(t) t.value=p.telefono||'';
    const m=$('cta-tel-mostrar'); if(m) m.checked=!!p.mostrar_telefono;
  }catch{ /* si falla, el campo queda vacio */ }
}
async function guardarTelefonoCuenta(){
  const telefono=$('cta-tel').value.trim();
  const mostrar_telefono=$('cta-tel-mostrar').checked?1:0;
  try{ await api('/directorio/perfil',{method:'PATCH',body:JSON.stringify({telefono,mostrar_telefono})});
    if(ME.persona) ME.persona.telefono=telefono; toast('✅ Teléfono guardado'); }
  catch(e){ toast(e.message); }
}
async function cambiarPassCuenta(){
  const actual=$('cta-actual').value, nueva=$('cta-nueva').value;
  if(nueva.length<8){ toast('La nueva contraseña debe tener al menos 8 caracteres'); return; }
  try{ await api('/cuenta/password',{method:'PATCH',body:JSON.stringify({actual,nueva})});
    toast('🔒 Contraseña cambiada'); $('cta-actual').value=''; $('cta-nueva').value=''; }
  catch(e){ toast(e.message); }
}

// ---------- RECUPERAR CONTRASEÑA (desde el login, por código al correo) ----------
function abrirRecuperar(){
  let ov=$('rec-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='rec-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" style="max-width:380px" onclick="event.stopPropagation()">
    <div class="hmodal-head"><b style="flex:1;font-size:16px">🔑 Recuperar contraseña</b>
      <button class="cal-navbtn" onclick="cerrarRecuperar()" aria-label="Cerrar">✕</button></div>
    <div style="padding:16px">
      <div id="rec-paso1">
        <label for="rec-email">Tu correo (Gmail)</label>
        <input id="rec-email" type="email" placeholder="tucorreo@gmail.com"/>
        <p class="muted small" style="margin:6px 0 0">Te enviaremos un código de 6 dígitos.</p>
        <button class="btn" style="width:100%;margin-top:10px" onclick="recEnviar()">Enviar código</button>
      </div>
      <div id="rec-paso2" class="hidden">
        <label for="rec-codigo">Código (6 dígitos)</label>
        <input id="rec-codigo" inputmode="numeric" maxlength="6" placeholder="000000"/>
        <label style="margin-top:8px">Nueva contraseña</label>
        <div class="row" style="gap:8px"><input id="rec-nueva" type="password" placeholder="Nueva contraseña"/>
          <button class="btn ghost small-btn" type="button" onclick="toggleVerPass('rec-nueva',this)">👁️</button></div>
        <button class="btn" style="width:100%;margin-top:10px" onclick="recConfirmar()">Cambiar contraseña</button>
      </div>
      <p id="rec-msg" class="error" style="margin-top:10px"></p>
    </div></div>`;
  ov.onclick=cerrarRecuperar;
  setTimeout(()=>{ const i=$('rec-email'); if(i) i.focus(); },50);
}
function cerrarRecuperar(){ const ov=$('rec-ov'); if(ov) ov.remove(); }
async function recEnviar(){
  const email=$('rec-email').value.trim(), m=$('rec-msg'); m.className='error'; m.textContent='';
  if(!email){ m.textContent='Escribe tu correo'; return; }
  try{ await api('/cuenta/recuperar',{method:'POST',body:JSON.stringify({email})});
    window._recEmail=email; $('rec-paso1').classList.add('hidden'); $('rec-paso2').classList.remove('hidden');
    m.className='muted small'; m.textContent='Si el correo está registrado, te llegó un código. Revísalo.';
    setTimeout(()=>{ const i=$('rec-codigo'); if(i) i.focus(); },50);
  }catch(e){ m.textContent=e.message; }
}
async function recConfirmar(){
  const m=$('rec-msg'); m.className='error'; m.textContent='';
  const codigo=$('rec-codigo').value.trim(), nueva=$('rec-nueva').value;
  if(!/^\d{6}$/.test(codigo)){ m.textContent='El código son 6 dígitos'; return; }
  if(nueva.length<8){ m.textContent='La nueva contraseña debe tener al menos 8 caracteres'; return; }
  try{ await api('/cuenta/recuperar/confirmar',{method:'POST',body:JSON.stringify({email:window._recEmail,codigo,nueva})});
    cerrarRecuperar(); toast('🔒 Contraseña cambiada. Ya puedes iniciar sesión.');
  }catch(e){ m.textContent=e.message; }
}

function vistaAjustes(){
  const a=ajustes(), acSel=a.acento||'cielo', temaSel=a.tema||'light', txtSel=a.texto||'md';
  const emailActual=(ME.persona&&ME.persona.email)||'';
  const opt=(g,val,act,label)=>`<button class="ajuste-opt ${val===act?'sel':''}" aria-pressed="${val===act}" onclick="setAjuste('${g}','${val}')">${label}</button>`;
  $('content').innerHTML=`
    <div class="card" style="max-width:560px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">🎨 Ajustes de apariencia</h2>
      <p class="muted small" style="margin-bottom:18px">Personaliza cómo se ve la app. Se guarda en este dispositivo.</p>
      <div class="ajuste-grupo"><label style="margin:0">Color de acento</label>
        <div class="ajuste-opts">${Object.entries(ACENTOS).map(([k,v])=>`<button type="button" class="swatch ${k===acSel?'sel':''}" title="${v.nombre}" aria-label="Color ${v.nombre}" aria-pressed="${k===acSel}" style="background:linear-gradient(135deg,${v.p} 0%,${v.p} 62%,${v.acc} 62%,${v.acc} 100%)" onclick="setAjuste('acento','${k}')"></button>`).join('')}</div></div>
      <div class="ajuste-grupo"><label style="margin:0">Tema</label>
        <div class="ajuste-opts">${opt('tema','light',temaSel,'☀️ Claro')}${opt('tema','dark',temaSel,'🌙 Oscuro')}${opt('tema','auto',temaSel,'🖥️ Automático')}</div></div>
      <div class="ajuste-grupo"><label style="margin:0">Tamaño del texto</label>
        <div class="ajuste-opts">${opt('texto','sm',txtSel,'A− Pequeño')}${opt('texto','md',txtSel,'A Normal')}${opt('texto','lg',txtSel,'A+ Grande')}</div></div>
      <button class="btn ghost small-btn" style="margin-top:8px" onclick="localStorage.removeItem('ajustes');aplicarAjustes();vistaAjustes();toast('Ajustes restablecidos')">Restablecer</button>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">🔔 Notificaciones</h2>
      <p class="muted small" style="margin-bottom:14px">Avisos push en este dispositivo (servicios, música, recordatorios, anuncios…).</p>
      <div id="push-ajuste"><p class="muted small" style="margin:0">Cargando…</p></div>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">👤 Mi cuenta</h2>
      <p class="muted small" style="margin-bottom:14px">Tu correo y contraseña.</p>
      <label>Correo (Gmail)</label>
      <div class="row" style="gap:8px">
        <input id="cta-email" type="email" value="${escHtml(emailActual)}" placeholder="tucorreo@gmail.com"/>
        <button class="btn small-btn" onclick="guardarEmailCuenta()">Guardar</button>
      </div>
      <p class="muted small" style="margin:6px 0 0">Sirve para recuperar tu contraseña si la olvidas.</p>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
      <label>Teléfono</label>
      <div class="row" style="gap:8px">
        <input id="cta-tel" type="tel" placeholder="Tu teléfono"/>
        <button class="btn small-btn" onclick="guardarTelefonoCuenta()">Guardar</button>
      </div>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="cta-tel-mostrar"/> Mostrar mi teléfono en el directorio</label>
      <p class="muted small" style="margin:4px 0 0">Por defecto tu teléfono está <b>oculto</b>; actívalo si quieres que aparezca en tu tarjeta del directorio.</p>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
      <label for="cta-actual">Cambiar contraseña</label>
      <input id="cta-actual" type="password" placeholder="Contraseña actual" style="margin-bottom:8px"/>
      <div class="row" style="gap:8px">
        <input id="cta-nueva" type="password" placeholder="Nueva contraseña"/>
        <button class="btn ghost small-btn" type="button" onclick="toggleVerPass('cta-nueva',this)" title="Ver/ocultar">👁️</button>
      </div>
      <button class="btn small-btn" style="margin-top:10px" onclick="cambiarPassCuenta()">Cambiar contraseña</button>
    </div>
    <p class="muted small" style="text-align:center;margin-top:18px">
      <a href="/legal/privacidad.html" target="_blank" rel="noopener">Privacidad</a> ·
      <a href="/legal/terminos.html" target="_blank" rel="noopener">Términos</a> ·
      <a href="/legal/cookies.html" target="_blank" rel="noopener">Cookies</a> ·
      <a href="/legal/aviso-legal.html" target="_blank" rel="noopener">Aviso legal</a> ·
      <a href="/legal/consentimientos.html" target="_blank" rel="noopener">Consentimientos</a>
    </p>
    <div class="card" style="max-width:560px;margin-top:16px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">🔐 Mis datos y privacidad</h2>
      <p class="muted small" style="margin-bottom:14px">Ejerce tus derechos sobre tus datos personales.</p>
      <button class="btn ghost small-btn" onclick="descargarMisDatos()">⬇️ Descargar mis datos</button>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
      <p class="muted small" style="margin:0 0 8px">Retirar tu consentimiento elimina tu cuenta: se borran tus datos personales (nombre, correo, teléfono, foto, cumpleaños) y no podrás volver a entrar. Esta acción no se puede deshacer.</p>
      <button class="btn ghost small-btn" style="color:var(--danger,#c0392b)" onclick="eliminarMiCuenta()">Retirar consentimiento y eliminar mi cuenta</button>
    </div>`;
  renderPushAjuste();
  cargarTelefonoCuenta();
}

async function descargarMisDatos(){
  try{
    const data=await api('/cuenta/mis-datos');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='mis-datos.json'; a.click();
    URL.revokeObjectURL(url);
    toast('⬇️ Datos descargados');
  }catch(e){ toast((e&&e.message)||'No se pudo descargar'); }
}
// La acción más destructiva de la app: borra la cuenta y anonimiza los datos,
// sin vuelta atrás. Se pregunta dentro de la app (modalPrompt) y no con el
// prompt() del navegador, que sale como una ventanita gris del sistema, sin los
// colores ni el tipo de letra de la app — y que en el móvil se puede silenciar,
// dejando el botón mudo. Teclear ELIMINAR sigue siendo obligatorio: es lo que
// separa un toque sin querer de una decisión.
async function eliminarMiCuenta(){
  modalPrompt(
    'Se borrarán tu nombre, correo, teléfono, foto y cumpleaños, y no podrás volver a entrar. <b>Esto no se puede deshacer.</b>',
    async()=>{
      try{
        await api('/cuenta/eliminar',{method:'POST'});
        toast('Tu cuenta fue eliminada');
        setTimeout(()=>salir(),800);
      }catch(e){ toast((e&&e.message)||'No se pudo eliminar la cuenta'); }
    },
    { titulo:'Eliminar mi cuenta', requerido:'ELIMINAR', placeholder:'ELIMINAR',
      ayuda:'Escribe ELIMINAR en mayúsculas para habilitar el botón.',
      okLabel:'Eliminar mi cuenta', danger:true }
  );
}

// ============================================================
//  MENSAJES (chat) — lista de conversaciones + hilo + SSE en vivo
// ============================================================
function vistaMensajes(){
  $('content').innerHTML=`<div class="chat-wrap">
    <aside id="chatLista" class="chat-lista"><p class="muted small">Cargando…</p></aside>
    <div id="chatHilo" class="chat-hilo"><div class="chat-vacio">Elige una conversación</div></div>
  </div>`;
  Chat.abrirVista();
}
const Chat = {
  convActual: null,
  escribiendoTimer: null,
  es: null,
  // buildNav() lo lee (":699" y ":733") para reaplicar el badge/punto tras un
  // repintado del menu. Declarado aqui, no solo asignado dentro de
  // actualizarBadgeNav, para que la forma del objeto no dependa de que ese
  // metodo ya se haya llamado alguna vez.
  _sinLeer: 0,
  async abrirVista(){
    await this.cargarLista();
    this.conectarSSE();
  },
  async actualizarBadgeNav(n){
    this._sinLeer=n;   // se reaplica si el menu se repinta al cambiar de ancho
    const b=$('nav-badge-mensajes');
    if(b){ b.classList.toggle('hidden', !n); b.textContent=n; }
    marcarGrupoConSinLeer(b, n);
  },
  // Trae solo el total de no-leidos, sin tocar la vista (se llama desde abrirApp).
  async refrescarBadge(){
    try{
      const convs=await api('/mensajes/conversaciones');
      this.actualizarBadgeNav(convs.reduce((a,c)=>a+(c.no_leidos||0),0));
    }catch{ /* sin conexion aun (p.ej. antes del login) */ }
  },
  async cargarLista(){
    let convs=[];
    try{ convs=await api('/mensajes/conversaciones'); }
    catch(e){ const c=$('chatLista'); if(c) c.innerHTML='<p class="error small">'+escHtml(e.message)+'</p>'; return; }
    // El contador del menú se actualiza ANTES de mirar si la vista de Mensajes
    // está montada. Antes iba al final, después de un `if(!cont) return`: como
    // el manejador de SSE llama a cargarLista() con cada mensaje entrante, el
    // badge solo subía si ya estabas dentro de Mensajes — justo cuando no hace
    // falta. Estando en Calendario podían llegar cinco mensajes y el menú
    // seguía marcando cero.
    const totalNoLeidos=convs.reduce((a,c)=>a+(c.no_leidos||0),0);
    this.actualizarBadgeNav(totalNoLeidos);
    const cont=$('chatLista'); if(!cont) return;
    cont.innerHTML='<button id="btnNuevoChat" class="btn ghost small-btn" style="width:100%;margin-bottom:10px">+ Nuevo chat</button><div id="nuevoChatForm"></div>';
    for(const c of convs){
      const el=document.createElement('div');
      el.className='chat-item'+(c.no_leidos?' no-leido':'')+(c.id===this.convActual?' sel':'');
      el.innerHTML=`<div class="ci-titulo">${escHtml(c.titulo||'(sin nombre)')}</div>
        <div class="ci-ultimo">${escHtml(c.ultimo?c.ultimo.texto||'':'Sin mensajes todavía')}</div>
        ${c.no_leidos?`<span class="badge">${c.no_leidos}</span>`:''}`;
      el.onclick=()=>this.abrirConversacion(c.id, c.titulo);
      cont.appendChild(el);
    }
    $('btnNuevoChat').onclick=()=>this.toggleNuevoChat();
  },
  async toggleNuevoChat(){
    const z=$('nuevoChatForm'); if(!z) return;
    if(z.innerHTML){ z.innerHTML=''; return; }
    let contactos=[];
    try{ contactos=await api('/mensajes/contactos'); }catch(e){ return toast(e.message); }
    if(!contactos.length){ z.innerHTML='<p class="muted small">No hay contactos disponibles.</p>'; return; }
    z.innerHTML=`<div style="background:var(--bg);padding:10px;border-radius:10px;margin-bottom:10px">
      <select id="nc-persona">${contactos.map(c=>`<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('')}</select>
      <button type="button" class="btn small-btn" style="margin-top:8px;width:100%" onclick="Chat.iniciarChat()">Iniciar chat</button>
    </div>`;
  },
  async iniciarChat(){
    const sel=$('nc-persona'); if(!sel) return;
    const personaId=Number(sel.value); if(!personaId) return;
    const nombre=sel.options[sel.selectedIndex].textContent;
    try{
      const conv=await api('/mensajes/directo',{method:'POST',body:JSON.stringify({persona_id:personaId})});
      $('nuevoChatForm').innerHTML='';
      await this.abrirConversacion(conv.id, nombre);
    }catch(e){ toast(e.message); }
  },
  async abrirConversacion(id, titulo){
    this.convActual=id;
    let data;
    try{ data=await api('/mensajes/conversacion/'+id); }catch(e){ return toast(e.message); }
    if(this.convActual!==id) return; // el usuario abrió otra conversación mientras cargaba esta
    const mensajes=data.mensajes||[];
    const conv=data.conversacion||{};
    const hilo=$('chatHilo'); if(!hilo) return;
    hilo.innerHTML='';
    const head=document.createElement('header'); head.className='chat-head';
    head.textContent=titulo||conv.titulo||'(sin nombre)';
    const msgs=document.createElement('div'); msgs.id='chatMsgs'; msgs.className='chat-msgs';
    const escrib=document.createElement('div'); escrib.id='chatEscribiendo'; escrib.className='chat-escribiendo';
    const form=document.createElement('form'); form.id='chatForm'; form.className='chat-form';
    form.innerHTML=`<button type="button" id="chatAdjuntar" class="btn-ico" title="Adjuntar">📎</button>
      <input id="chatInput" autocomplete="off" placeholder="Escribe un mensaje…" maxlength="4000"/>
      <button class="btn">Enviar</button>`;
    hilo.appendChild(head); hilo.appendChild(msgs); hilo.appendChild(escrib); hilo.appendChild(form);
    for(const m of mensajes.slice().reverse()) msgs.appendChild(this.burbuja(m));
    msgs.scrollTop=msgs.scrollHeight;
    if(mensajes.length) this.marcarLeido(id, mensajes[0].id);
    form.onsubmit=(e)=>{ e.preventDefault(); this.enviar(id); };
    $('chatInput').oninput=()=>this.pingEscribiendo(id);
    $('chatAdjuntar').onclick=()=>this.adjuntar(id);
    await this.cargarLista();
  },
  // Construye la burbuja con DOM (nunca innerHTML con texto de usuario) → a salvo de XSS.
  burbuja(m){
    const el=document.createElement('div');
    const esMia=m.persona_id===ME.persona.id;
    el.className='burbuja'+(esMia?' mia':'');
    el.dataset.id=m.id;
    if(m.borrado){ el.classList.add('borrado'); el.textContent='mensaje eliminado'; return el; }
    const autor=document.createElement('span'); autor.className='autor'; autor.textContent=m.nombre||'';
    el.appendChild(autor);
    const cuerpo=document.createElement('div');
    if(m.texto) cuerpo.appendChild(document.createTextNode(m.texto));
    if(m.adjunto_url){
      const a=document.createElement('a'); a.className='adj'; a.href=safeUrl(m.adjunto_url); a.target='_blank'; a.rel='noopener';
      a.textContent='📎 archivo';
      cuerpo.appendChild(a);
    }
    el.appendChild(cuerpo);
    if(esMia){ const chk=document.createElement('span'); chk.className='check'; chk.textContent='✓✓'; el.appendChild(chk); }
    return el;
  },
  async enviar(id){
    const input=$('chatInput'); if(!input) return;
    const texto=input.value.trim(); if(!texto) return;
    input.value='';
    try{
      const {mensaje}=await api('/mensajes/conversacion/'+id,{method:'POST',body:JSON.stringify({texto})});
      const cont=$('chatMsgs');
      if(cont && this.convActual===id){ cont.appendChild(this.burbuja(mensaje)); cont.scrollTop=cont.scrollHeight; }
      this.cargarLista();
    }catch(e){ toast(e.message); input.value=texto; }
  },
  async adjuntar(id){
    const inp=document.createElement('input'); inp.type='file';
    inp.onchange=async()=>{
      const f=inp.files[0]; if(!f) return;
      try{
        toast('Subiendo…');
        const url=await uploadArchivo(f);
        const {mensaje}=await api('/mensajes/conversacion/'+id,{method:'POST',body:JSON.stringify({texto:'',adjunto_url:url,adjunto_tipo:'archivo'})});
        const cont=$('chatMsgs');
        if(cont && this.convActual===id){ cont.appendChild(this.burbuja(mensaje)); cont.scrollTop=cont.scrollHeight; }
        this.cargarLista();
      }catch(e){ toast(e.message); }
    };
    inp.click();
  },
  pingEscribiendo(id){
    if(this.escribiendoTimer) return;
    api('/mensajes/conversacion/'+id+'/escribiendo',{method:'POST',body:JSON.stringify({})}).catch(()=>{});
    this.escribiendoTimer=setTimeout(()=>{ this.escribiendoTimer=null; },3000);
  },
  marcarLeido(id, mensajeId){
    api('/mensajes/conversacion/'+id+'/leido',{method:'POST',body:JSON.stringify({mensaje_id:mensajeId})}).catch(()=>{});
  },
  conectarSSE(){
    if(this.es) return;
    this.es=new EventSource('/api/mensajes/stream?token='+encodeURIComponent(token()));
    this.es.addEventListener('mensaje',(ev)=>{
      let data; try{ data=JSON.parse(ev.data); }catch{ return; }
      const {conversacion_id, mensaje}=data;
      if(conversacion_id===this.convActual){
        const cont=$('chatMsgs');
        if(cont){
          if(mensaje.borrado){
            const b=cont.querySelector('[data-id="'+mensaje.id+'"]');
            if(b){ b.className='burbuja borrado'; b.textContent='mensaje eliminado'; }
          }else if(mensaje.persona_id!==ME.persona.id){
            cont.appendChild(this.burbuja(mensaje)); cont.scrollTop=cont.scrollHeight;
            this.marcarLeido(conversacion_id, mensaje.id);
          }
        }
      }
      this.cargarLista();
    });
    this.es.addEventListener('escribiendo',(ev)=>{
      let data; try{ data=JSON.parse(ev.data); }catch{ return; }
      const {conversacion_id, nombre}=data;
      if(conversacion_id!==this.convActual) return;
      const e=$('chatEscribiendo'); if(!e) return;
      e.textContent=(nombre||'Alguien')+' está escribiendo…';
      clearTimeout(this._escTimer);
      this._escTimer=setTimeout(()=>{ e.textContent=''; },3000);
    });
    this.es.addEventListener('leido',(ev)=>{
      let data; try{ data=JSON.parse(ev.data); }catch{ return; }
      const {conversacion_id, ultimo_leido_mensaje_id}=data;
      if(conversacion_id!==this.convActual) return;
      const cont=$('chatMsgs'); if(!cont) return;
      cont.querySelectorAll('.burbuja.mia').forEach(b=>{
        const id=Number(b.dataset.id);
        if(id && id<=ultimo_leido_mensaje_id) b.classList.add('leido');
      });
    });
    this.es.onerror=()=>{ /* EventSource reconecta solo */ };
  }
};

// ============================================================
//  ORGANIZACIÓN DE EVENTOS: hoja de cosas a llevar + gastos (total que se suma).
//  Ver: líderes/pastor. Editar: solo el creador o el pastor (lo dice puede_editar).
// ============================================================

async function vistaOrganizacion(){
  const c=$('content');
  c.innerHTML=`<div class="head-row"><h2>🗒️ Organización</h2>
    <button class="btn small-btn" onclick="Org.nuevaHoja()">➕ Nueva lista</button></div>
    <div id="org-lista" class="muted">Cargando…</div>`;
  try{
    const hojas=await api('/organizacion');
    const z=$('org-lista'); z.className='';
    z.innerHTML = hojas.length ? hojas.map(h=>{
      const titulo = h.evento_titulo || h.titulo || '(sin título)';
      const fecha = h.evento_fecha || h.fecha;
      return `<button type="button" class="btn-plano item-card flex" style="margin-top:10px" onclick="Org.abrir(${h.id},'organizacion')">
        <div style="flex:1"><div class="item-titulo">${escHtml(titulo)}</div>
          <div class="muted small">${h.evento_id?'📅 De un evento':'📝 Lista suelta'}${fecha?' · '+fechaTxt(fecha):''} · ${h.n_cosas||0} cosa(s)</div></div>
        <div style="text-align:right"><b>${money(h.total_gastado)}</b><div class="muted small">gastado</div></div>
      </button>`;
    }).join('') : '<p class="muted small">Aún no hay listas. Crea una con "Nueva lista".</p>';
  }catch(e){ const z=$('org-lista'); z.className='error'; z.textContent=(e&&e.message)||'No se pudo cargar'; }
}

// A la misma hoja se llega por dos puertas, y el "volver" tiene que devolver
// por la que se entró: desde la lista de Organización, o desde el día abierto
// del calendario (el botón "🗒️ Organización" de un evento). Antes siempre
// llevaba a la lista, así que quien venía del calendario perdía el día que
// estaba mirando y el menú lateral seguía marcando Calendario: el botón decía
// una cosa y hacía otra.
const ORG_ORIGEN = {
  organizacion: { etiqueta:'Organización', ir:()=>vistaOrganizacion() },
  calendario:   { etiqueta:'Calendario',   ir:()=>navTo('calendario') },
};

// La opcion inyectada "(cuenta inactiva)" del selector de quien pago
// (Org._opcionAusente) es PROVISIONAL: existe para que el selector pueda
// representar a un pagador que /directorio aun no trajo. Si el directorio
// llega y trae a esa misma persona (gemela real, mismo value), la inyectada
// sobra: su rotulo pasa a ser mentira y el nombre sale dos veces. Se quita
// SIEMPRE que haya gemela -- no solo si esta seleccionada, que era el hueco
// (pendiente 7 de la fuente del gasto) -- conservando la eleccion: si la
// seleccionada era la inyectada, reasignar el mismo value cae en la real.
// Sin gemela no se toca nada: la persona esta inactiva de verdad.
function quitarAusenteDuplicada(sel){
  const ausente=sel.querySelector('option[data-ausente]');
  if(!ausente) return;
  const hayGemela=Array.prototype.some.call(sel.options, o=>o!==ausente && o.value===ausente.value);
  if(!hayGemela) return;
  const valor=sel.value;
  ausente.remove();
  sel.value=valor;
}

const Org = {
  // Crea una lista suelta (pide título) y la abre.
  nuevaHoja(){
    modalPrompt('Ponle un nombre para reconocerla en la lista.', async(titulo)=>{
      try{ const r=await api('/organizacion',{method:'POST',body:JSON.stringify({titulo})}); Org.abrir(r.id,'organizacion'); }
      catch(e){ toast((e&&e.message)||'No se pudo crear'); }
    }, { titulo:'Nueva lista', placeholder:'Ej. Almuerzo de jóvenes', okLabel:'Crear lista' });
  },
  // Abre la hoja de un evento (la crea vacía la 1a vez). Se llega desde el
  // calendario, así que ahí es a donde vuelve.
  async abrirEvento(eventoId){
    try{ const h=await api('/organizacion/evento/'+eventoId); Org._render(h,'calendario'); }
    catch(e){ toast((e&&e.message)||'No se pudo abrir'); }
  },
  // Abre una hoja por id. `origen` solo se pasa al ENTRAR: las recargas de la
  // propia hoja (añadir una cosa, un gasto) lo omiten y conservan el de entrada.
  async abrir(id, origen){
    try{ const h=await api('/organizacion/'+id); Org._render(h, origen); }
    catch(e){ toast((e&&e.message)||'No se pudo abrir'); }
  },
  _origen:'organizacion',
  volver(){ (ORG_ORIGEN[Org._origen]||ORG_ORIGEN.organizacion).ir(); },
  _hoja:null,
  _render(h, origen){
    Org._hoja=h;
    // INVARIANTE: todo estado de formulario que vive FUERA del DOM se
    // reinicializa aqui, porque esta funcion recrea el formulario entero. Si un
    // campo espejado se queda sin reponer, la pantalla dice una cosa y se guarda
    // otra — y guardarGasto ya NO relee el DOM, a proposito.
    //
    // Paso de verdad con _fuente: quedaba en 'aporte' de un gasto anterior, el
    // <select> recreado nacia en 'devuelve', y anadir una cosa a llevar (que
    // llama a _recargar -> _render) bastaba para que el gasto siguiente se
    // guardara como donado mientras la pantalla decia que habia que devolverlo.
    // Eso BORRA una deuda: quien puso el dinero de su bolsillo se queda sin que
    // se lo devuelvan, sin ningun aviso.
    Org._gastoEditando=null;   // una hoja recien abierta nunca esta "editando" un gasto
    Org._pagador='';           // ...ni arrastra el pagador de la correccion anterior
    Org._fuente='devuelve';    // ...ni la fuente elegida antes de repintar
    Org._origenTocado=false;   // ...ni la marca de "esto lo eligio una persona"
    if(origen && ORG_ORIGEN[origen]) Org._origen=origen;
    const volver=ORG_ORIGEN[Org._origen]||ORG_ORIGEN.organizacion;
    const ed=!!h.puede_editar;
    const titulo=(h.evento&&h.evento.titulo)||h.titulo||'(sin título)';
    const fecha=(h.evento&&h.evento.fecha)||h.fecha;
    const cosas=h.cosas.map(x=>{
      // La cuenta desactivada no borra el dato: se avisa para que el líder reasigne.
      const inactivo = x.responsable_id && !x.responsable_activo;
      // Al imprimir: el nombre se conserva (una hoja sin nombres no sirve) y lo
      // que aún no tiene responsable deja una línea para anotarlo a mano.
      const quien = x.responsable_id
        ? `<button class="link org-asignado" onclick="Org.asignar(${x.id})" title="Reasignar">👤 ${escHtml(x.responsable_nombre||'')}${inactivo?' <span style="color:var(--red-tx)">(cuenta inactiva — reasignar)</span>':''}</button>`
        : `<button class="link org-sin-asignar" onclick="Org.asignar(${x.id})">👤 Asignar</button><span class="org-firma"></span>`;
      return `<div class="org-row">
        <label class="org-check"><input type="checkbox" ${x.listo?'checked':''} ${ed?'':'disabled'} onchange="Org.toggleCosa(${x.id}, this.checked)">
          <span class="${x.listo?'org-listo':''}">${escHtml(x.nombre)} <b>×${x.cantidad}</b></span></label>
        <div class="org-quien">${ed?quien:(x.responsable_nombre?'👤 '+escHtml(x.responsable_nombre):'')}</div>
        ${ed?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Quitar ${escHtml(x.nombre)}" onclick="Org.borrarCosa(${x.id})">✕</button>`:''}
      </div>`;
    }).join('') || '<p class="muted small">Sin cosas todavía.</p>';
    const gastos=h.gastos.map(g=>{
      // Como se lee la fuente en la fila: 'caja' no tiene persona (le pone su
      // propio texto); con persona, el matiz (se devuelve / es aporte) solo
      // se agrega si YA se especifico — un gasto de antes de esta casilla
      // (fuente NULL con persona) se ve igual que siempre, sin inventar nada.
      const fuenteTxt = g.fuente==='caja' ? 'pagó la caja de la iglesia'
        : g.pagado_por_nombre ? `puso ${escHtml(g.pagado_por_nombre)}${g.fuente==='aporte'?' (aporte, no se devuelve)':g.fuente==='devuelve'?' (se le devuelve)':''}`
        : '';
      return `<div class="org-row">
        <span>${escHtml(g.concepto)} — <b>${money(g.monto)}</b>${fuenteTxt?` <span class="muted small">· ${fuenteTxt}</span>`:''}</span>
        <!-- no-print: la card de gastos es la que el modo rendicion vuelve a
             mostrar, y en el papel que se le lleva al tesorero el ✏️ y el ✕ son
             ruido (ademas de dos botones que en un papel no se pueden tocar). -->
        ${ed?`<div class="row no-print" style="width:auto;gap:4px">
          <button class="link icon-only" aria-label="Corregir el gasto ${escHtml(g.concepto)}" onclick="Org.editarGasto(${g.id})">✏️</button>
          <button class="link icon-only" style="color:var(--red-tx)" aria-label="Quitar el gasto ${escHtml(g.concepto)}" onclick="Org.borrarGasto(${g.id})">✕</button>
        </div>`:''}
      </div>`;
    }).join('') || '<p class="muted small">Sin gastos todavía.</p>';
    // "Quién puso qué", en tres bloques (ya no es una sola lista): lo que
    // pagó la caja, a quién hay que devolverle, y los aportes donados. Lo que
    // no cae en ninguno de los tres es de antes de que existiera pagado_por
    // (ni siquiera hay a quién atribuirlo): se dice aparte en vez de
    // callarlo, si no el resumen parece una cuenta mal hecha.
    const totalCaja=Number(h.total_caja||0);
    const porDevolver=h.por_devolver||[];
    const aportesDonados=h.aportes_donados||[];
    const sumaConocida=totalCaja
      +porDevolver.reduce((s,a)=>s+Number(a.total||0),0)
      +aportesDonados.reduce((s,a)=>s+Number(a.total||0),0);
    const sinRegistrar=Number(h.total_gastado||0)-sumaConocida;
    const hayResumen=totalCaja>0||porDevolver.length||aportesDonados.length||sinRegistrar>0;
    // Historial de correcciones de la hoja. Solo aparece si hubo alguna.
    // escHtml en las dos cosas: el detalle lleva DENTRO el concepto que tecleó
    // una persona (y con comillas dobles: `"Pan" $12.000 -> "Pan" $8.000`), y
    // el nombre sale de la base de datos.
    const correcciones=(h.correcciones||[]).length
      ? `<div class="org-aportes" style="margin-top:14px"><b class="muted small">Correcciones</b>
          ${h.correcciones.map(c=>`<div class="org-row"><span class="muted small">
            ${escHtml(c.actor_nombre||'Alguien')} · ${escHtml(c.detalle||'')}</span>
            <span class="muted small">${escHtml(fechaDeUTC(c.fecha))}</span></div>`).join('')}</div>`
      : '';
    const aportes=hayResumen
      ? `<div class="org-aportes"><b class="muted small">Quién puso qué</b>
          ${totalCaja>0?`<div class="org-row"><span>Pagó la caja de la iglesia</span><b>${money(totalCaja)}</b></div>`:''}
          ${porDevolver.map(a=>`<div class="org-row"><span>Por devolver: ${escHtml(a.nombre)}</span><b>${money(a.total)}</b></div>`).join('')}
          ${aportesDonados.map(a=>`<div class="org-row"><span>Aporte donado: ${escHtml(a.nombre)}</span><b>${money(a.total)}</b></div>`).join('')}
          ${sinRegistrar>0?`<div class="org-row muted small"><span>Sin registrar quién puso</span><b>${money(sinRegistrar)}</b></div>`:''}</div>`
      : '';

    $('content').innerHTML=`
      <!-- Cabecera que SOLO sale en papel: la hoja se pega en la puerta de la
           iglesia y allí nadie sabe de dónde salió ni si es la última versión.
           En pantalla sobra, porque el nombre de la iglesia ya está en el menú. -->
      <div class="solo-print">${escHtml(ME.iglesia?ME.iglesia.nombre:'')} · impreso el ${escHtml(new Date().toLocaleDateString('es-CL'))}</div>
      <!-- El "volver" va arriba a la izquierda y con la forma "‹ Destino" del
           resto de sub-pantallas (Casos, Clases, Prédicas, Directorio…), no
           mezclado entre los botones de acción de la derecha. -->
      <button class="link no-print" onclick="Org.volver()">‹ ${escHtml(volver.etiqueta)}</button>
      <div class="head-row"><h2>🗒️ ${escHtml(titulo)}</h2>
        <!-- btn-fila, no row: .row reparte a lo ancho sin permitir salto de linea y a
             390px estos cuatro botones desbordaban la pagina (405px de contenido). -->
        <div class="btn-fila no-print" style="width:auto;gap:6px">
          <button class="btn ghost small-btn" onclick="Org.duplicar()">⧉ Duplicar</button>
          <button class="btn ghost small-btn" onclick="Org.copiarParaWhatsapp()">📋 Copiar</button>
          <button class="btn ghost small-btn" onclick="Org.imprimir()"
            title="En el diálogo de impresión, elige &quot;Guardar como PDF&quot; en el destino">🖨️ Imprimir / PDF</button>
          ${(h.gastos&&h.gastos.length)?`<button class="btn ghost small-btn" onclick="Org.imprimirRendicion()"
            title="El papel de las cuentas, para llevárselo al tesorero">🧾 Rendición</button>`:''}
        </div></div>
      <div class="card">
        <div class="muted small">${h.evento_id?'📅 De un evento':'📝 Lista suelta'}${fecha?' · '+fechaTxt(fecha):''}</div>
        <!-- org-hora: la rendicion la oculta. Al tesorero la hora de llegada no
             le dice nada, y comparte card con el contexto, que si sale. -->
        <div class="org-hora" style="margin-top:10px"><b>🕐 Hora de llegada:</b>
          ${ed?`<input id="org-hora" type="time" value="${escHtml(h.hora_llegada||'')}" onchange="Org.guardarHora(this.value)" style="max-width:130px;display:inline-block">`
              :`<span>${escHtml(h.hora_llegada||'—')}</span>`}</div>
      </div>
      <div class="card card-cosas" style="margin-top:14px"><h3 style="font-size:16px">📦 Cosas a llevar</h3>
        <div id="org-cosas">${cosas}</div>
        ${ed?`<div class="row no-print" style="gap:6px;margin-top:10px">
          <input id="org-cosa-nombre" placeholder="Ej. Jugos nectar">
          <input id="org-cosa-cant" type="number" min="1" value="1" style="max-width:80px">
          <button class="btn small-btn" onclick="Org.addCosa()">Añadir</button></div>`:''}
      </div>
      <div class="card no-print card-gastos" style="margin-top:14px"><h3 style="font-size:16px">💵 Gastos</h3>
        <div id="org-gastos">${gastos}</div>
        <div class="org-total">Total gastado: <b>${money(h.total_gastado)}</b></div>
        ${aportes}
        ${correcciones}
        <!-- Solo en el papel de rendicion: el tesorero firma que recibio las
             cuentas. En pantalla no pinta nada, y en la hoja de la puerta
             tampoco (alli no hay cuentas que recibir). -->
        <div class="solo-rendicion">Recibí conforme: ______________________
          &nbsp;&nbsp;&nbsp; Fecha: ________________</div>
        ${ed?`<div class="row no-print" style="gap:6px;margin-top:10px;flex-wrap:wrap">
          <input id="org-gasto-concepto" placeholder="Ej. Pan">
          <input id="org-gasto-monto" type="number" min="1" placeholder="Monto" style="max-width:110px">
          <select id="org-gasto-quien" style="max-width:150px" title="¿Quién puso el dinero?" onchange="Org.cambioQuienPago(this.value, true)">
            <option value="">Lo puse yo</option>
          </select>
          <select id="org-gasto-fuente" style="max-width:130px" title="¿Se le devuelve?" onchange="Org.cambioFuente(this.value, true)">
            <option value="devuelve">Se devuelve</option>
            <option value="aporte">Es un aporte</option>
          </select>
          <button class="btn small-btn" id="org-gasto-guardar" onclick="Org.guardarGasto()">Añadir</button>
          <button class="link" id="org-gasto-cancelar" style="display:none" onclick="Org.cancelarEdicionGasto()">Cancelar</button></div>`:''}
        ${ed?`<div class="no-print" style="margin-top:16px;text-align:right"><button class="link" style="color:var(--red-tx)" onclick="Org.borrarHoja()">🗑️ Borrar esta lista</button></div>`:''}
      </div>`;
    if(ed) Org._llenarQuienPago();
  },
  // El selector de "¿quién puso el dinero?" se llena aparte para no cargar cada
  // lectura de la hoja con la lista entera de la iglesia. Se cachea por sesión.
  //
  // Las dos opciones fijas se pintan ANTES de pedir el directorio, y la gente se
  // AÑADE después (appendChild, no innerHTML). Los dos detalles importan:
  //  - si /directorio falla, "La caja de la iglesia" ya está puesta. Antes se
  //    creaba dentro de la misma asignación que se saltaba al lanzar la
  //    excepción, así que el selector se quedaba SOLO con "Lo puse yo" y
  //    corregir un gasto de la caja lo convertía en una deuda con quien corregía.
  //  - la petición tarda y los ✏️ ya son clicables mientras viaja: añadiendo
  //    opciones no se pisa ni la selección ni la opción que haya puesto entre
  //    medio una corrección en curso (con innerHTML se las llevaba por delante).
  async _llenarQuienPago(){
    const sel=$('org-gasto-quien'); if(!sel) return;
    sel.innerHTML='<option value="">Lo puse yo</option><option value="caja">La caja de la iglesia</option>';
    try{
      if(!Org._personas) Org._personas=await api('/directorio');
      for(const p of Org._personas){
        const o=document.createElement('option');
        o.value=String(p.id);
        o.textContent=p.nombre;   // textContent, no innerHTML: el nombre lo escribe una persona
        sel.appendChild(o);
      }
    }catch{ /* sin directorio quedan "Lo puse yo" y "La caja de la iglesia", ya pintadas arriba */ }
    // El directorio acaba de llegar: si trajo a la persona de la opcion
    // inyectada, la inyectada sobra -- se quita conservando la eleccion.
    quitarAusenteDuplicada(sel);
    // Y si aun así hay una corrección en curso cuyo pagador el selector ya no
    // representa, se repone. Dejarlo en blanco es exactamente lo que le
    // adjudicaba la deuda a quien solo venía a corregir una falta de ortografía.
    //
    // Y se reconcilia TAMBIÉN cuando la opción puesta es la inyectada: si la
    // persona sí estaba activa y su <option> real acaba de llegar con el
    // directorio, sin esto se queda para siempre el rótulo falso "(cuenta
    // inactiva)" sobre alguien activo, y su nombre dos veces en la lista.
    // _ponerPagador es idempotente: quita la inyectada y solo la repone si de
    // verdad sigue sin estar.
    //
    // Se exige que la inyectada sea la SELECCIONADA para no pisar a quien haya
    // cambiado el selector a mano mientras el directorio viajaba: en ese caso su
    // elección ya es la buena y reponer al pagador original se la borraría.
    const g=Org._gastoEditando ? (Org._hoja&&Org._hoja.gastos||[]).find(x=>x.id===Org._gastoEditando) : null;
    if(g){
      const ausente=sel.querySelector('option[data-ausente]');
      if(sel.value!==Org._pagador || (ausente && ausente.value===sel.value)) Org._ponerPagador(g);
    }
    else Org.cambioQuienPago(sel.value);
  },
  // El segundo selector (se devuelve / es un aporte) solo tiene sentido si hay
  // una persona: si pago la caja no hay a quien devolverle nada, y si el gasto
  // es de los antiguos "sin registrar" no se esta afirmando nada de nadie.
  //
  // loEligioAlguien: SOLO lo pasa el onchange del <select>, que es el unico
  // momento en que el valor lo eligio una persona. Ahi —y solo ahi— se guarda en
  // Org._pagador, que es lo que guardarGasto manda al backend. Las llamadas de
  // dentro del codigo no deben fijar ese estado: quien lo fija al corregir es
  // _ponerPagador, despues de COMPROBAR que el selector pudo representarlo.
  cambioQuienPago(valor, loEligioAlguien){
    if(loEligioAlguien){ Org._pagador=valor; Org._origenTocado=true; }
    const f=$('org-gasto-fuente');
    if(f) f.style.display = (valor==='caja'||valor==='sin') ? 'none' : '';
  },
  // El segundo selector, igual que el primero: su valor se lleva en Org._fuente
  // y NO se relee del DOM al guardar. Era la ultima relectura del DOM que
  // quedaba en el camino del dinero.
  //
  // loEligioAlguien: SOLO lo pasa el onchange del <select>. Es lo unico que
  // convierte una correccion en "esta persona quiso cambiar de donde salio el
  // dinero"; las llamadas internas (pintar el formulario, cancelarlo) ponen el
  // valor pero no lo marcan como tocado.
  cambioFuente(valor, loEligioAlguien){
    Org._fuente = valor==='aporte' ? 'aporte' : 'devuelve';
    if(loEligioAlguien) Org._origenTocado=true;
  },
  // Deja el selector apuntando a quien puso el dinero DE VERDAD en ese gasto y
  // devuelve el valor que quedo puesto (null si no se pudo).
  //
  // Por que hace falta: las opciones salen de /directorio, que filtra activo=1,
  // y el PATCH del backend NO exige que el pagador siga activo — la app modela
  // ese caso a proposito en otras pantallas ("cuenta inactiva - reasignar"). Si
  // Maria se dio de baja, su <option> no existe, y asignarle a un <select> un
  // valor que no tiene deja selectedIndex=-1 y .value===''. Ese '' significa
  // "lo puse yo": corregir la ortografia de "Pan - $5.000 - puso Maria" pasaba
  // los $5.000 a "Por devolver: quien editaba", sin mas aviso que un desplegable
  // en blanco. Por eso se le inyecta su propia opcion, con su nombre, en vez de
  // dejar el hueco: asi ademas la persona VE de quien se trata.
  _ponerPagador(g){
    const sel=$('org-gasto-quien'); if(!sel) return null;
    // "No se puede decir quien puso": el gasto historico (sin fuente y sin
    // pagador) y cualquier fila con fuente de persona pero sin persona. En los
    // dos, la correccion va sin tocar el pagador.
    const sinPagador = g.fuente!=='caja' && g.pagado_por==null;
    Org._opcionSinRegistrar(sinPagador);
    Org._opcionAusente(null);
    const quien = sinPagador ? 'sin' : (g.fuente==='caja' ? 'caja' : String(g.pagado_por));
    if(!Array.prototype.some.call(sel.options, o=>o.value===quien)){
      Org._opcionAusente(quien, g.fuente==='caja' ? 'La caja de la iglesia'
        : g.pagado_por_nombre ? g.pagado_por_nombre+' (cuenta inactiva)'
        : 'Quien puso el dinero (ya no está en la lista)');
    }
    sel.value=quien;
    // Comprobado, no supuesto. Si ni aun asi el selector puede representarlo, la
    // correccion se guardara SIN tocar el pagador (Org._pagador=null: mandar
    // solo concepto y monto, que el backend lee como "dejalo como estaba").
    // Antes de adjudicarle la plata a quien esta editando, mejor no tocarla.
    if(sel.value!==quien){ Org._pagador=null; Org.cambioQuienPago(''); return null; }
    Org._pagador=quien;
    Org.cambioQuienPago(quien);
    return quien;
  },
  // La opcion del pagador que ya no sale en el directorio. Se pinta con
  // textContent (nunca innerHTML): el nombre lo escribe una persona.
  // _opcionAusente(null) la quita.
  _opcionAusente(valor, etiqueta){
    const sel=$('org-gasto-quien'); if(!sel) return;
    const ya=sel.querySelector('option[data-ausente]');
    if(ya) ya.remove();
    if(valor==null) return;
    const o=document.createElement('option');
    o.value=valor; o.textContent=etiqueta; o.dataset.ausente='1';
    sel.appendChild(o);
  },
  // "Sin registrar quien puso" NO es una opcion al crear un gasto: ese conjunto
  // esta cerrado y solo puede achicarse (ver el spec). Solo aparece mientras se
  // corrige un gasto que YA estaba asi, para poder arreglarle el concepto o el
  // monto sin verse obligado a inventarle un pagador.
  _opcionSinRegistrar(mostrar){
    const sel=$('org-gasto-quien'); if(!sel) return;
    const ya=sel.querySelector('option[value="sin"]');
    if(mostrar && !ya){
      const o=document.createElement('option');
      o.value='sin'; o.textContent='Sin registrar quién puso';
      sel.appendChild(o);
    }else if(!mostrar && ya){ ya.remove(); }
  },
  _personas:null,
  _recargar(){ if(Org._hoja) Org.abrir(Org._hoja.id); },
  async addCosa(){
    const nombre=$('org-cosa-nombre').value.trim(); const cantidad=Number($('org-cosa-cant').value)||1;
    if(!nombre) return toast('Escribe qué llevar');
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/'+Org._hoja.id+'/cosas',{method:'POST',body:JSON.stringify({nombre,cantidad})}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo añadir'); }
    });
  },
  async toggleCosa(id, listo){
    try{ await api('/organizacion/cosas/'+id,{method:'PATCH',body:JSON.stringify({listo})}); }
    catch(e){ toast((e&&e.message)||'No se pudo actualizar'); Org._recargar(); }
  },
  // Preguntar antes de borrar: la ✕ es un botón pequeño en una lista larga, en
  // un teléfono, y esta línea puede llevar ya un responsable asignado y avisado.
  async borrarCosa(id){
    // escHtml: modalConfirm mete el mensaje crudo en innerHTML, y el nombre de
    // la cosa lo escribe cualquier líder.
    const c=(Org._hoja&&Org._hoja.cosas||[]).find(x=>x.id===id);
    modalConfirm(`¿Quitar "${escHtml((c&&c.nombre)||'esta cosa')}" de la lista?`, async()=>{
      try{ await api('/organizacion/cosas/'+id,{method:'DELETE'}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
    }, {danger:true});
  },
  _gastoEditando:null,
  // Quien puso el dinero, segun el formulario: '' = yo · 'caja' = la caja ·
  // 'sin' = no se sabe (no tocarlo) · null = no se pudo determinar (no tocarlo)
  // · un id = esa persona. Es lo que manda guardarGasto: NO se relee del DOM.
  _pagador:'',
  // 'devuelve' | 'aporte', segun el segundo selector. Tampoco se relee del DOM.
  _fuente:'devuelve',
  // ¿Tocó la persona alguno de los dos selectores del origen en esta corrección?
  // Solo lo ponen los dos onchange. Mientras siga en false, una corrección manda
  // SOLO concepto y monto, y el PATCH (parcial por diseño) deja el origen tal
  // como estaba. Sin esto, el formulario reenviaba siempre los cuatro campos
  // reconstruidos desde Org._hoja —la instantánea de cuando se abrió la
  // pantalla— con dos consecuencias: (1) todo gasto histórico (fuente NULL)
  // pasaba a 'devuelve' con solo tocar el ✏️, y el historial estampaba un
  // "se devuelve a María -> se devuelve a María" afirmando un cambio que nadie
  // hizo; (2) con dos personas editando la misma hoja, corregir una falta de
  // ortografía con la pantalla vieja RESUCITABA una deuda que la otra acababa
  // de borrar. En un ALTA no aplica: ahí el origen se manda siempre.
  _origenTocado:false,
  // Abre el formulario ya lleno con los datos del gasto, para corregirlo. Los
  // inputs son los mismos del alta: no hace falta un panel aparte.
  editarGasto(id){
    const g=(Org._hoja&&Org._hoja.gastos||[]).find(x=>x.id===id); if(!g) return;
    Org._gastoEditando=id;
    Org._origenTocado=false;   // empieza limpia: nadie ha tocado el origen todavia
    $('org-gasto-concepto').value=g.concepto;
    $('org-gasto-monto').value=g.monto;
    // Un gasto de los antiguos (sin fuente y sin pagador) NO se puede pintar
    // como "Lo puse yo": esa opcion afirma que paga quien esta editando, y
    // guardar una correccion de ortografia le adjudicaria una deuda que nadie
    // contrajo. De eso —y de que el selector pueda representar a un pagador
    // que ya no sale en el directorio— se ocupa _ponerPagador.
    if(Org._ponerPagador(g)==null) toast('No se puede mostrar quién puso el dinero: se corregirá sin cambiarlo');
    // El gasto historico (fuente NULL) se PINTA como "Se devuelve" porque el
    // desplegable no tiene un tercer estado que dibujar — pero eso es lo que se
    // ve, no lo que se manda: mientras nadie lo toque, la correccion viaja sin
    // fuente y el backend conserva el NULL ("no se sabe").
    $('org-gasto-fuente').value = g.fuente==='aporte' ? 'aporte' : 'devuelve';
    Org.cambioFuente($('org-gasto-fuente').value);
    $('org-gasto-guardar').textContent='Guardar cambios';
    $('org-gasto-cancelar').style.display='inline-flex';
    $('org-gasto-concepto').scrollIntoView({behavior:'smooth', block:'center'});
  },
  cancelarEdicionGasto(){
    Org._gastoEditando=null;
    Org._pagador='';                  // un gasto NUEVO lo pone quien lo registra
    Org._origenTocado=false;
    Org._opcionSinRegistrar(false);   // no debe quedar disponible para un gasto NUEVO
    Org._opcionAusente(null);         // ni la persona ausente del gasto que se corregia
    $('org-gasto-concepto').value=''; $('org-gasto-monto').value='';
    $('org-gasto-quien').value=''; Org.cambioQuienPago('');
    $('org-gasto-fuente').value='devuelve'; Org.cambioFuente('devuelve');
    $('org-gasto-guardar').textContent='Añadir';
    $('org-gasto-cancelar').style.display='none';
  },
  // Sirve para añadir (Org._gastoEditando vacío) y para corregir (con id):
  // mismo patrón que formNino/guardarNino en el módulo de Escuela Dominical.
  async guardarGasto(){
    const concepto=$('org-gasto-concepto').value.trim();
    const monto=Number($('org-gasto-monto').value);
    if(!concepto) return toast('Escribe el concepto');
    if(!(monto>0)) return toast('El monto debe ser mayor a 0');
    // El pagador NO se relee del DOM: se lleva en Org._pagador, que fija
    // _ponerPagador (comprobando que el selector pueda representarlo) y
    // actualiza el onchange cuando lo elige una persona. Releerlo era la tercera
    // puerta del fallo: bastaba con que la <option> del pagador no existiera
    // —cuenta desactivada, o /directorio caido— para que el '' de un <select>
    // sin seleccion se leyera como "lo puse yo" y la deuda cambiara de dueño.
    const quien=Org._pagador;   // '' = yo · 'caja' = caja · 'sin'/null = no tocar · id = otra persona
    const id=Org._gastoEditando;
    // El PATCH del backend es PARCIAL POR DISEÑO: lo que no viene, no se toca.
    // Asi que una CORRECCION solo manda el origen si la persona toco alguno de
    // los dos selectores. Reenviarlo siempre —reconstruido desde Org._hoja, la
    // instantanea de cuando se abrio la pantalla— anulaba esa garantia: le
    // inventaba un 'devuelve' a todo gasto historico con solo pulsar el ✏️ (y el
    // historial anotaba un cambio de origen que nadie hizo), y con dos personas
    // editando reponia una deuda que la otra acababa de borrar.
    //
    // En un ALTA se manda siempre: el gasto nace ahora y hay que decir de donde
    // salio el dinero.
    //
    // 'sin' (y null) tampoco lo mandan nunca: sin fuente ni pagado_por, el PATCH
    // deja los dos como estaban (ver la regla del backend en la Task 4). Es lo
    // que permite corregir un gasto sin cambiar de quien es el dinero.
    const cuerpo={concepto,monto};
    if((!id || Org._origenTocado) && quien!=null && quien!=='sin'){
      if(quien==='caja') cuerpo.fuente='caja';
      else {
        cuerpo.fuente=Org._fuente||'devuelve';
        cuerpo.pagado_por = quien?Number(quien):ME.persona.id;
      }
    }
    await conBoton(botonActual(), async()=>{
      try{
        if(id) await api('/organizacion/gastos/'+id,{method:'PATCH',body:JSON.stringify(cuerpo)});
        else   await api('/organizacion/'+Org._hoja.id+'/gastos',{method:'POST',body:JSON.stringify(cuerpo)});
        Org.cancelarEdicionGasto();
        Org._recargar();
        toast(id?'Gasto corregido':'Gasto añadido');
      }catch(e){ toast((e&&e.message)||'No se pudo guardar'); }
    });
  },
  // Un gasto lleva el monto y quién puso el dinero: es el registro con el que se
  // le devuelve la plata a esa persona, y al borrarlo no queda rastro. Iba sin
  // preguntar, a un toque, mientras quitar una canción del repertorio —que se
  // rehace en dos toques— sí preguntaba.
  async borrarGasto(id){
    // escHtml: modalConfirm mete el mensaje crudo en innerHTML, y tanto el
    // concepto como el nombre de quien pagó vienen de la base de datos.
    const g=(Org._hoja&&Org._hoja.gastos||[]).find(x=>x.id===id);
    const quien=g&&g.pagado_por_nombre?` que puso ${escHtml(g.pagado_por_nombre)}`:'';
    modalConfirm(
      g?`¿Borrar el gasto "${escHtml(g.concepto)}" de ${money(g.monto)}${quien}? No queda registro de él.`
       :'¿Borrar este gasto? No queda registro de él.',
      async()=>{
        try{ await api('/organizacion/gastos/'+id,{method:'DELETE'}); Org._recargar(); }
        catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
      }, {danger:true});
  },
  // Duplicar: se copia la lista de cosas en limpio para el evento que viene.
  // No hace falta poder editar la hoja, así que un líder puede partir de la
  // lista de otro sin tocarla — la copia queda a su nombre.
  duplicar(){
    modalConfirm('Se creará una lista nueva con las mismas cosas, sin marcar y sin responsables. Los gastos no se copian.', async()=>{
      try{
        const r=await api('/organizacion/'+Org._hoja.id+'/duplicar',{method:'POST'});
        toast('⧉ Lista duplicada');
        // La copia nace suelta (sin evento), así que vive en la lista de
        // Organización: de ahí en adelante ese es su "volver".
        Org.abrir(r.id,'organizacion');
      }catch(e){ toast((e&&e.message)||'No se pudo duplicar'); }
    }, { okLabel:'Sí, duplicar' });
  },
  // Imprimir la hoja — y de paso, guardarla como PDF: el diálogo del navegador
  // ya ofrece "Guardar como PDF" en Chrome, Android y iOS, así que no hace falta
  // ninguna librería. Lo que sí hacía falta es el nombre del archivo: el
  // navegador lo saca de document.title, que aquí es la cadena fija "Iglesia
  // App" (index.html), y así toda hoja guardada salía como "Iglesia App.pdf" —
  // cinco eventos distintos, cinco archivos homónimos en el teléfono.
  //
  // Los dos papeles de la hoja pasan por aquí. `rendicion` decide cuál: la
  // clase en el <body> es lo único que mira el CSS de impresión.
  //
  // Restaurar va en 'afterprint' y NO justo después de print(): en escritorio
  // print() bloquea hasta que se cierra el diálogo, pero en móvil vuelve
  // enseguida y se restauraría antes de que el navegador lo lea. El
  // temporizador es la red de seguridad para el navegador que no dispare el
  // evento; restaurar dos veces no hace daño, dejarlo mal para siempre sí.
  _conPapel(rendicion){
    const h=Org._hoja;
    // El modo se limpia SIEMPRE al empezar, no solo al terminar: sus reglas
    // viven dentro de @media print, así que una clase pegada no se ve en
    // pantalla y sacaría los gastos en el siguiente papel normal. Así se cura
    // sola en el próximo uso en vez de acumularse.
    document.body.classList.remove('modo-rendicion');
    if(!h){ window.print(); return; }   // sin hoja cargada no hay nada que nombrar
    const titulo=(h.evento&&h.evento.titulo)||h.titulo||'Lista';
    const fecha=(h.evento&&h.evento.fecha)||h.fecha;
    const previo=document.title;
    document.title=(rendicion?'Rendición — ':'')+titulo+(fecha?' — '+fechaTxt(fecha):'');
    if(rendicion) document.body.classList.add('modo-rendicion');
    const restaurar=()=>{ document.title=previo; document.body.classList.remove('modo-rendicion'); };
    window.addEventListener('afterprint',restaurar,{once:true});
    setTimeout(restaurar,60000);
    window.print();
  },
  // La hoja que se pega en la puerta de la iglesia: cosas a llevar, sin gastos.
  imprimir(){ Org._conPapel(false); },
  // El papel de las cuentas, para el tesorero: gastos, total y quién puso qué.
  imprimirRendicion(){ Org._conPapel(true); },
  // Texto plano para pegar en el grupo de WhatsApp, que es por donde la iglesia
  // realmente comparte esto. SIN gastos a propósito: se pega en un grupo donde
  // hay feligreses, y las cuentas son cosa de líderes (misma decisión que la
  // hoja impresa, que termina en la puerta de la iglesia).
  async copiarParaWhatsapp(){
    const h=Org._hoja; if(!h) return;
    const titulo=(h.evento&&h.evento.titulo)||h.titulo||'Lista';
    const fecha=(h.evento&&h.evento.fecha)||h.fecha;
    let txt=`*${titulo}*`;
    if(fecha) txt+=` — ${fechaTxt(fecha)}`;
    if(h.hora_llegada) txt+=`, llegar ${h.hora_llegada}`;
    const lugar=h.evento&&h.evento.lugar;
    if(lugar) txt+=`\n📍 ${lugar}`;
    txt+='\n';
    txt+=(h.cosas||[]).map(c=>{
      const quien=c.responsable_nombre ? ` — ${c.responsable_nombre}` : ' — *pendiente*';
      return `${c.listo?'✅':'•'} ${c.nombre} ×${c.cantidad}${quien}`;
    }).join('\n') || '(sin cosas todavía)';
    try{
      await navigator.clipboard.writeText(txt);
      toast('📋 Copiado, pégalo en el grupo');
    }catch{
      // Sin permiso de portapapeles (o sin HTTPS): se muestra para copiar a mano.
      modalConfirm('<b>Copia este texto:</b><br><textarea readonly rows="8" style="margin-top:8px">'+escHtml(txt)+'</textarea>',
        ()=>{}, { okLabel:'Listo' });
    }
  },
  // Selector de responsable: cualquier persona activa de la iglesia (decisión del
  // dueño). GET /directorio ya devuelve un array plano de activos, ordenado por
  // nombre, y es visible para todos: no hay que filtrar ni ordenar aquí.
  async asignar(cosaId){
    let personas=[];
    try{ personas=await api('/directorio'); }
    catch(e){ return toast((e&&e.message)||'No se pudo cargar la lista'); }
    const opciones=personas.map(p=>`<button class="link org-persona" style="display:block;padding:10px 0;text-align:left;width:100%"
        onclick="Org.guardarResponsable(${cosaId}, ${p.id})">${escHtml(p.nombre)}</button>`).join('')
      || '<p class="muted small">No hay personas en el directorio.</p>';
    const root=$('modal-root');
    root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>¿Quién lo trae?</h3>
      <input id="org-buscar-persona" placeholder="Buscar por nombre" oninput="Org.filtrarPersonas(this.value)" />
      <div id="org-personas" style="max-height:46vh;overflow:auto;margin-top:10px">${opciones}</div>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
        <button class="btn" onclick="Org.guardarResponsable(${cosaId}, null)">Quitar responsable</button>
      </div></div></div>`;
    root.classList.add('show');
  },
  filtrarPersonas(q){
    const t=(q||'').toLowerCase();
    $('org-personas').querySelectorAll('.org-persona').forEach(b=>{
      b.style.display = b.textContent.toLowerCase().includes(t) ? 'block' : 'none';
    });
  },
  async guardarResponsable(cosaId, personaId){
    cerrarModal();
    try{
      await api('/organizacion/cosas/'+cosaId,{method:'PATCH',body:JSON.stringify({responsable_id:personaId})});
      toast(personaId?'✅ Asignado y avisado':'Responsable quitado');
      Org._recargar();
    }catch(e){ toast((e&&e.message)||'No se pudo asignar'); }
  },
  // "Ya lo tengo" desde Mi Servicio (feligrés): usa la rendija, no la hoja.
  async marcarMio(id, listo){
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/mis-cosas/'+id,{method:'PATCH',body:JSON.stringify({listo:!!listo})}); vistaMiServicio(); }
      catch(e){ toast((e&&e.message)||'No se pudo actualizar'); }
    });
  },
  async guardarHora(v){
    try{ await api('/organizacion/'+Org._hoja.id,{method:'PATCH',body:JSON.stringify({hora_llegada:v})}); toast('✅ Hora guardada'); }
    catch(e){ toast((e&&e.message)||'No se pudo guardar'); }
  },
  borrarHoja(){
    modalConfirm('¿Borrar esta lista con sus cosas y gastos? No se puede deshacer.', async()=>{
      // Se sale por donde se entró: si la hoja se abrió desde un evento del
      // calendario, borrarla no puede dejar a nadie en una lista que no estaba
      // mirando.
      try{ await api('/organizacion/'+Org._hoja.id,{method:'DELETE'}); toast('🗑️ Lista borrada'); Org.volver(); }
      catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
    }, { okLabel:'Sí, borrar', danger:true });
  }
};

// Al abrir
aplicarAjustes();
iniciarIconos();   // reemplaza emojis por íconos de línea en toda la app
cargarApp();
