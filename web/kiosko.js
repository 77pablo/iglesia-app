// ============================================================
//  Kiosko facial (Fase 3) - captura un frame cada ~2s y reconoce.
//  Reusa el token de localStorage (compartido con inscribir.js).
// ============================================================
const $ = (id) => document.getElementById(id);
const API = '';
const INTERVALO_MS = 2000;     // cada ~2 segundos
const SALUDO_MS = 4000;        // tiempo que se muestra el saludo

let token = localStorage.getItem('facial_token') || '';
let stream = null;
let bucle = null;
let saludando = false;
let ultimoNombre = null;       // evita re-saludar al mismo seguido

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const resp = await fetch(API + path, { ...opts, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || ('Error ' + resp.status));
  return data;
}

function msg(el, t, tipo) { el.className = 'msg ' + (tipo || 'info'); el.textContent = t; }

// --- LOGIN gate ---
$('btnLogin').addEventListener('click', async () => {
  const iglesia = $('iglesia').value.trim();
  const usuario = $('usuario').value.trim();
  const password = $('password').value;
  if (!iglesia || !usuario || !password)
    return msg($('loginMsg'), 'Completa todos los campos.', 'err');
  msg($('loginMsg'), 'Activando…', 'info');
  try {
    const data = await api('/api/login', {
      method: 'POST', body: JSON.stringify({ iglesia, usuario, password })
    });
    token = data.token;
    localStorage.setItem('facial_token', token);
    iniciarKiosko();
  } catch (e) {
    msg($('loginMsg'), e.message, 'err');
  }
});

async function iniciarKiosko() {
  $('loginGate').classList.add('hidden');
  $('stage').classList.remove('hidden');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    $('video').srcObject = stream;
  } catch (e) {
    $('title').textContent = 'No se pudo abrir la cámara';
    $('sub').textContent = e.message;
    return;
  }
  bucle = setInterval(tick, INTERVALO_MS);
}

function capturarFrame() {
  const v = $('video');
  if (!v.videoWidth) return null;
  const c = $('canvas');
  // Reducir resolucion: suficiente para detectar y mas rapido de enviar.
  const w = 480, h = Math.round(480 * (v.videoHeight / v.videoWidth));
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(v, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.8);
}

async function tick() {
  if (saludando) return;
  const frame = capturarFrame();
  if (!frame) return;
  try {
    const data = await api('/api/facial/reconocer', {
      method: 'POST', body: JSON.stringify({ image: frame })
    });
    if (data.reconocido) {
      mostrarSaludo(data.persona.nombre);
    } else {
      ultimoNombre = null; // libera para volver a saludar cuando reaparezca
    }
  } catch (e) {
    $('sub').innerHTML = '<span class="kiosko-dot"></span>' + e.message;
  }
}

function mostrarSaludo(nombre) {
  if (nombre === ultimoNombre) return; // ya lo saludamos hace un momento
  ultimoNombre = nombre;
  saludando = true;
  $('greetName').textContent = 'Hola, ' + nombre;
  $('greet').classList.add('show');
  setTimeout(() => {
    $('greet').classList.remove('show');
    saludando = false;
  }, SALUDO_MS);
}

// --- Inicio: si hay token valido arranca; si no, pide login ---
(async function init() {
  if (token) {
    try { await api('/api/me'); return iniciarKiosko(); }
    catch { localStorage.removeItem('facial_token'); token = ''; }
  }
  $('loginGate').classList.remove('hidden');
})();
