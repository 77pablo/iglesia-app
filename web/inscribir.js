// ============================================================
//  Inscripcion facial (Fase 3) - login simple + camara + envio.
//  Reusa POST /api/login y POST /api/facial/inscribir.
// ============================================================
const $ = (id) => document.getElementById(id);
const API = ''; // mismo origen que sirve la web (backend en :3000)

let token = localStorage.getItem('facial_token') || '';
let stream = null;
let capturaB64 = null;

// --- Helpers de mensajes ---
function showMsg(el, texto, tipo) {
  el.className = 'msg ' + (tipo || 'info');
  el.textContent = texto;
}
function clearMsg(el) { el.className = ''; el.textContent = ''; }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const resp = await fetch(API + path, { ...opts, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || ('Error ' + resp.status));
  return data;
}

// --- LOGIN ---
$('btnLogin').addEventListener('click', async () => {
  const iglesia = $('iglesia').value.trim();
  const usuario = $('usuario').value.trim();
  const password = $('password').value;
  if (!iglesia || !usuario || !password)
    return showMsg($('loginMsg'), 'Completa iglesia, usuario y contraseña.', 'err');
  showMsg($('loginMsg'), 'Entrando…', 'info');
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ iglesia, usuario, password })
    });
    token = data.token;
    localStorage.setItem('facial_token', token);
    $('quien').textContent = data.persona.nombre;
    entrarPanel();
  } catch (e) {
    showMsg($('loginMsg'), e.message, 'err');
  }
});

$('salir').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('facial_token');
  token = '';
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  location.reload();
});

async function entrarPanel() {
  $('loginCard').classList.add('hidden');
  $('panel').classList.remove('hidden');
  await cargarPersonas();
}

async function cargarPersonas() {
  const sel = $('persona');
  try {
    const personas = await api('/api/personas');
    if (!personas.length) {
      sel.innerHTML = '<option value="">No hay personas</option>';
      return;
    }
    sel.innerHTML = '<option value="">— Selecciona —</option>' +
      personas.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  } catch (e) {
    sel.innerHTML = '<option value="">Error al cargar</option>';
    showMsg($('msg'), e.message, 'err');
  }
}

// --- CAMARA ---
$('btnCam').addEventListener('click', async () => {
  clearMsg($('msg'));
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const v = $('video');
    v.srcObject = stream;
    v.classList.remove('hidden');
    $('snap').classList.add('hidden');
    $('camPlaceholder').classList.add('hidden');
    $('btnCapture').disabled = false;
    $('btnCam').textContent = 'Cámara encendida';
  } catch (e) {
    showMsg($('msg'), 'No se pudo abrir la cámara: ' + e.message, 'err');
  }
});

$('btnCapture').addEventListener('click', () => {
  const v = $('video');
  const c = $('canvas');
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  capturaB64 = c.toDataURL('image/jpeg', 0.9);

  const img = $('snap');
  img.src = capturaB64;
  img.classList.remove('hidden');
  v.classList.add('hidden');

  $('btnRetake').classList.remove('hidden');
  $('btnSave').classList.remove('hidden');
  $('btnCapture').disabled = true;
  showMsg($('msg'), 'Foto capturada. Revisa y guarda.', 'info');
});

$('btnRetake').addEventListener('click', () => {
  capturaB64 = null;
  $('snap').classList.add('hidden');
  $('video').classList.remove('hidden');
  $('btnRetake').classList.add('hidden');
  $('btnSave').classList.add('hidden');
  $('btnCapture').disabled = false;
  clearMsg($('msg'));
});

$('btnSave').addEventListener('click', async () => {
  const persona_id = $('persona').value;
  if (!persona_id) return showMsg($('msg'), 'Elige primero una persona.', 'err');
  if (!capturaB64) return showMsg($('msg'), 'Captura una foto primero.', 'err');

  $('btnSave').disabled = true;
  showMsg($('msg'), 'Procesando rostro…', 'info');
  try {
    const data = await api('/api/facial/inscribir', {
      method: 'POST',
      body: JSON.stringify({ persona_id: Number(persona_id), image: capturaB64 })
    });
    showMsg($('msg'),
      `✅ Rostro de ${data.persona.nombre} inscrito (calidad ${(data.det_score || 0).toFixed(2)}).`, 'ok');
    // Reset para una nueva captura
    $('btnRetake').click();
    $('btnSave').classList.add('hidden');
    $('btnRetake').classList.add('hidden');
  } catch (e) {
    showMsg($('msg'), e.message, 'err');
  } finally {
    $('btnSave').disabled = false;
  }
});

// --- Auto-entrar si ya hay token guardado ---
(async function init() {
  if (!token) return;
  try {
    const me = await api('/api/me');
    $('quien').textContent = me.persona.nombre;
    await entrarPanel();
  } catch {
    localStorage.removeItem('facial_token');
    token = '';
  }
})();
