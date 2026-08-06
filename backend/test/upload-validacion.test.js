// ============================================================
//  Endurecimiento de la subida de archivos y de las URLs del cliente
//  Mismo arnes que seguridad.test.js: arranca src/server.js como proceso
//  hijo con una BD temporal y SEED_ON_EMPTY=1 (credenciales conocidas).
//  Diferencias a proposito:
//   - Puerto dinamico (test/puerto-libre.js): los puertos fijos 3941/3931
//     hacian que dos corridas a la vez se pisaran.
//   - DISABLE_RATE_LIMIT=1: /api/upload va detras de limiterSensible
//     (10 req/IP/15min) y este recorrido sube mas de 10 archivos.
//   - UPLOADS_DIR propio y temporal: asi se puede comprobar que un archivo
//     rechazado NO deja el temporal de multer tirado en disco.
//
//  Cubre:
//   1) Subida: extension permitida + MIME coherente + contenido real -> entra.
//   2) Extension prohibida (.exe) -> 400.
//   3) Extension permitida con MIME incoherente -> 400.
//   4) .png cuyo contenido no es PNG -> 400 y sin temporal huerfano.
//   5) URLs de archivo subido (adjunto_url): solo /uploads/...
//   6) URLs de enlace externo (recurso de predica tipo link): siguen
//      funcionando (regresion de la funcion documentada en ESTADO.md 4.7).
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { puertoLibre } from './puerto-libre.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');
let PORT;            // se pide al SO en before(): ver test/puerto-libre.js
// IP literal, no "localhost": este arranca con DISABLE_RATE_LIMIT=1 y no le
// afecta hoy, pero "localhost" resuelve a ::1 y a 127.0.0.1 a la vez y cada
// conexion compite entre ambas familias (autoSelectFamily). Cualquier cosa que
// el servidor cuente por IP veria dos clientes distintos. Ver seguridad.test.js.
let BASE;            // depende de PORT: se arma en before()
const SELLO = Date.now();
const DB_PATH = path.join(os.tmpdir(), `iglesia-test-upload-${SELLO}.db`);
const UPLOADS_DIR = path.join(os.tmpdir(), `iglesia-test-uploads-${SELLO}`);

let servidor;
let token;          // pastor
let tokenTesorera;  // solo el tesorero puede registrar movimientos (el pastor observa)
let tokenLider;     // Abel: lider del grupo Jovenes (comparte recursos)
let tokenMusico;    // Joaquin: lider de musica (comparte material/partituras)

// --- Contenidos de ejemplo (firmas reales de cada formato) ---
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),   // firma PNG
  Buffer.from('IHDR-de-mentira-pero-la-firma-es-la-de-verdad')
]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF-de-ejemplo')]);
// Un ejecutable de Windows empieza por "MZ": esto es lo que se intenta colar
// renombrandolo a .png.
const EJECUTABLE = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0x00, 0x03, 0x00]), Buffer.from('programa')]);

async function esperarListo(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* aun no levanta */ }
    await new Promise(res => setTimeout(res, 250));
  }
  throw new Error('El servidor de pruebas no respondio a tiempo');
}

// Sube un archivo con el nombre, el contenido y el MIME que se le indiquen
// (el MIME lo declara el cliente: justo lo que un atacante controla).
function subir(nombre, contenido, mime) {
  const fd = new FormData();
  fd.append('archivo', new Blob([contenido], { type: mime }), nombre);
  return fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
}

const archivosEnUploads = () => fs.readdirSync(UPLOADS_DIR).sort();

const postJson = (ruta, cuerpo, tk = token) => fetch(BASE + ruta, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
  body: JSON.stringify(cuerpo)
});

before(async () => {
  PORT = await puertoLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  servidor = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: 'secreto-de-pruebas-no-usar-en-produccion',
      DB_PATH,
      UPLOADS_DIR,
      SEED_ON_EMPTY: '1',
      NODE_ENV: '',
      CORS_ORIGIN: '',
      DISABLE_RATE_LIMIT: '1'   // el recorrido sube >10 archivos: limiterSensible cortaria
    },
    stdio: 'pipe'
  });
  // Descomenta para depurar el arranque del servidor de pruebas:
  // servidor.stdout.on('data', d => process.stdout.write(`[srv] ${d}`));
  // servidor.stderr.on('data', d => process.stderr.write(`[srv-err] ${d}`));
  await esperarListo();
  const entrar = async (usuario) => {
    const r = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iglesia: 'MONTESION', usuario, password: '1234' })
    });
    return (await r.json()).token;
  };
  token = await entrar('pastor');
  tokenTesorera = await entrar('raquel');
  tokenLider = await entrar('abel');
  tokenMusico = await entrar('joaquin');
  assert.ok(token, 'la siembra debe permitir entrar como pastor');
  assert.ok(tokenTesorera, 'la siembra debe traer una tesorera');
  assert.ok(tokenLider && tokenMusico, 'la siembra debe traer al lider de grupo y al de musica');
});

after(async () => {
  if (servidor) servidor.kill();
  try { fs.unlinkSync(DB_PATH); } catch { /* puede no existir */ }
  try { fs.unlinkSync(DB_PATH + '-journal'); } catch { /* idem */ }
  try { fs.rmSync(UPLOADS_DIR, { recursive: true, force: true }); } catch { /* idem */ }
});

// ============================================================
//  1) SUBIDA: extension + MIME + contenido real
// ============================================================

test('POST /api/upload: un PNG de verdad (extension, MIME y firma coherentes) entra', async () => {
  const r = await subir('foto.png', PNG, 'image/png');
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.ok(b.url.startsWith('/uploads/'), 'la url devuelta debe ser interna');
  assert.ok(b.url.endsWith('.png'));
  assert.ok(fs.existsSync(path.join(UPLOADS_DIR, path.basename(b.url))), 'el archivo debe quedar guardado');
});

test('POST /api/upload: un PDF de verdad tambien entra', async () => {
  const r = await subir('acta.pdf', PDF, 'application/pdf');
  assert.equal(r.status, 200);
  assert.ok((await r.json()).url.endsWith('.pdf'));
});

test('POST /api/upload: un .txt entra (sin firma fiable, cubierto por extension+MIME)', async () => {
  const r = await subir('notas.txt', Buffer.from('hola congregacion'), 'text/plain');
  assert.equal(r.status, 200);
});

test('POST /api/upload: extension prohibida (.exe) -> 400 y no deja rastro', async () => {
  const antes = archivosEnUploads();
  const r = await subir('virus.exe', EJECUTABLE, 'application/x-msdownload');
  assert.equal(r.status, 400);
  const b = await r.json();
  assert.ok(b.error, 'debe responder {error: ...}');
  assert.ok(!/[A-Za-z]:\\|\/home\/|\/tmp\//.test(b.error), 'el error no debe filtrar rutas del servidor');
  assert.deepEqual(archivosEnUploads(), antes, 'no debe quedar ningun archivo nuevo');
});

test('POST /api/upload: extension permitida con MIME incoherente -> 400', async () => {
  const antes = archivosEnUploads();
  // El navegador declara un ejecutable pero el nombre dice .png.
  const r = await subir('trampa.png', PNG, 'application/x-msdownload');
  assert.equal(r.status, 400);
  assert.ok((await r.json()).error);
  assert.deepEqual(archivosEnUploads(), antes, 'no debe quedar ningun archivo nuevo');
});

test('POST /api/upload: .png con MIME de PDF -> 400 (extension y MIME no cuadran)', async () => {
  const r = await subir('otra.png', PNG, 'application/pdf');
  assert.equal(r.status, 400);
});

// El MIME lo pone el SISTEMA del que sube, no el navegador: en Windows sale del
// registro, en Android del proveedor de archivos. Cuando no conoce la extension
// manda 'application/octet-stream' = "no se lo que es". Rechazar eso dejaba a un
// feligres sin poder subir su comprobante, con un mensaje incomprensible, aunque
// el archivo fuera un PDF perfecto. Y no compraba seguridad: en los formatos con
// firma es la firma la que decide, como fija el test siguiente.
test('POST /api/upload: un PDF de verdad declarado como octet-stream entra (el sistema no siempre conoce el tipo)', async () => {
  const r = await subir('partitura.pdf', PDF, 'application/octet-stream');
  assert.equal(r.status, 200, 'un PDF valido no puede rechazarse por como lo etiquete el dispositivo');
  const b = await r.json();
  assert.match(b.url, /^\/uploads\//);
});

test('POST /api/upload: octet-stream NO es una puerta trasera: la firma sigue mandando', async () => {
  const antes = archivosEnUploads();
  const r = await subir('trampa.png', EJECUTABLE, 'application/octet-stream');
  assert.equal(r.status, 400, 'admitir "no se que es" no puede dejar pasar un ejecutable');
  assert.deepEqual(archivosEnUploads(), antes, 'no debe quedar ningun archivo nuevo');
});

test('POST /api/upload: un ejecutable renombrado a .png -> 400 y el temporal no queda en disco', async () => {
  const antes = archivosEnUploads();
  // Extension permitida y MIME coherente: solo los magic bytes lo delatan.
  const r = await subir('inocente.png', EJECUTABLE, 'image/png');
  assert.equal(r.status, 400);
  const b = await r.json();
  assert.ok(b.error);
  assert.ok(!/[A-Za-z]:\\|\/home\/|\/tmp\//.test(b.error), 'el error no debe filtrar rutas del servidor');
  assert.deepEqual(archivosEnUploads(), antes,
    'multer escribe el temporal antes de validarlo: hay que borrarlo al rechazar');
});

test('POST /api/upload: un .pdf que no empieza por %PDF- -> 400', async () => {
  const antes = archivosEnUploads();
  const r = await subir('falso.pdf', EJECUTABLE, 'application/pdf');
  assert.equal(r.status, 400);
  assert.deepEqual(archivosEnUploads(), antes);
});

test('POST /api/upload: un .jpg con contenido PNG -> 400 (la firma manda)', async () => {
  const r = await subir('cambiada.jpg', PNG, 'image/jpeg');
  assert.equal(r.status, 400);
});

test('POST /api/upload: un JPEG de verdad entra (mismo camino, control positivo)', async () => {
  const r = await subir('retrato.jpg', JPEG, 'image/jpeg');
  assert.equal(r.status, 200);
});

// ============================================================
//  2) URLs QUE MANDA EL CLIENTE
// ============================================================

async function conversacionCon(usuario) {
  const personas = await (await fetch(`${BASE}/api/personas`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const otro = personas.find(p => p.nombre === usuario) || personas[1];
  const r = await postJson('/api/mensajes/directo', { persona_id: otro.id });
  return (await r.json()).id;
}

test('adjunto_url apuntando a otro servidor -> 400 (es un campo de archivo SUBIDO)', async () => {
  const conv = await conversacionCon('Abel Espinoza');
  const r = await postJson(`/api/mensajes/conversacion/${conv}`,
    { texto: '', adjunto_url: 'https://evil.example/x.png', adjunto_tipo: 'archivo' });
  assert.equal(r.status, 400);
  assert.ok((await r.json()).error);
});

test('adjunto_url con javascript: -> 400', async () => {
  const conv = await conversacionCon('Abel Espinoza');
  const r = await postJson(`/api/mensajes/conversacion/${conv}`,
    { texto: '', adjunto_url: 'javascript:alert(1)', adjunto_tipo: 'archivo' });
  assert.equal(r.status, 400);
});

test('adjunto_url intentando salir de /uploads/ con .. -> 400', async () => {
  const conv = await conversacionCon('Abel Espinoza');
  const r = await postJson(`/api/mensajes/conversacion/${conv}`,
    { texto: '', adjunto_url: '/uploads/../../backend/.env', adjunto_tipo: 'archivo' });
  assert.equal(r.status, 400);
});

test('adjunto_url interno (/uploads/algo.png) sigue funcionando', async () => {
  const conv = await conversacionCon('Abel Espinoza');
  const r = await postJson(`/api/mensajes/conversacion/${conv}`,
    { texto: '', adjunto_url: '/uploads/algo.png', adjunto_tipo: 'archivo' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).mensaje.adjunto_url, '/uploads/algo.png');
});

test('comprobante_url de tesoreria a otro servidor -> 400; vacio y /uploads/ siguen valiendo', async () => {
  const fuera = await postJson('/api/tesoreria/movimientos',
    { tipo: 'ingreso', categoria: 'ofrenda', monto: 1000, fecha: '2026-07-01', comprobante_url: 'https://evil.example/c.pdf' },
    tokenTesorera);
  assert.equal(fuera.status, 400);

  const vacio = await postJson('/api/tesoreria/movimientos',
    { tipo: 'ingreso', categoria: 'ofrenda', monto: 1000, fecha: '2026-07-01', comprobante_url: '' },
    tokenTesorera);
  assert.equal(vacio.status, 200, 'el formulario manda "" cuando no se adjunta comprobante');

  const dentro = await postJson('/api/tesoreria/movimientos',
    { tipo: 'ingreso', categoria: 'ofrenda', monto: 2000, fecha: '2026-07-01', comprobante_url: '/uploads/c.pdf' },
    tokenTesorera);
  assert.equal(dentro.status, 200);
});

test('foto_url del perfil a otro servidor -> 400 (rastreo por imagen); /uploads/ sigue valiendo', async () => {
  const fuera = await fetch(`${BASE}/api/directorio/perfil`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ foto_url: 'https://evil.example/pixel.png' })
  });
  assert.equal(fuera.status, 400);

  const dentro = await fetch(`${BASE}/api/directorio/perfil`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ foto_url: '/uploads/mifoto.png' })
  });
  assert.equal(dentro.status, 200);
});

// --- Enlaces EXTERNOS a proposito: NO deben restringirse a /uploads/ ---

async function primeraPredica() {
  const r = await fetch(`${BASE}/api/predica`, { headers: { Authorization: `Bearer ${token}` } });
  const { items } = await r.json();
  assert.ok(items.length, 'la siembra debe traer al menos una predica');
  return items[0].id;
}

test('REGRESION: un recurso de predica tipo link (YouTube) sigue guardandose', async () => {
  const id = await primeraPredica();
  const r = await postJson(`/api/predica/${id}/recurso`,
    { tipo: 'link', titulo: 'Video del sermon', url: 'https://youtube.com/watch?v=abc' });
  assert.equal(r.status, 200, 'los links externos son una funcion documentada (ESTADO.md 4.7)');
});

test('REGRESION: un recurso de predica tipo libro (referencia de texto, sin url) sigue guardandose', async () => {
  const id = await primeraPredica();
  const r = await postJson(`/api/predica/${id}/recurso`,
    { tipo: 'libro', titulo: 'Comentario de Juan', url: '' });
  assert.equal(r.status, 200);
});

test('un recurso de predica tipo link con javascript: -> 400', async () => {
  const id = await primeraPredica();
  const r = await postJson(`/api/predica/${id}/recurso`,
    { tipo: 'link', titulo: 'Trampa', url: 'javascript:alert(document.cookie)' });
  assert.equal(r.status, 400);
});

test('un recurso de predica tipo ARCHIVO apuntando fuera -> 400 (ese si es un subido)', async () => {
  const id = await primeraPredica();
  const r = await postJson(`/api/predica/${id}/recurso`,
    { tipo: 'archivo', titulo: 'Bosquejo', url: 'https://evil.example/x.pdf' });
  assert.equal(r.status, 400);
  const ok = await postJson(`/api/predica/${id}/recurso`,
    { tipo: 'archivo', titulo: 'Bosquejo', url: '/uploads/bosquejo.pdf' });
  assert.equal(ok.status, 200);
});

// --- Recursos de grupo: la funcion de ESTADO.md 4.7 ("el lider sube links") ---
async function grupoDelLider() {
  const r = await fetch(`${BASE}/api/grupo/mis`, { headers: { Authorization: `Bearer ${tokenLider}` } });
  const grupos = await r.json();
  const g = grupos.find(x => x.soyLider);
  assert.ok(g, 'Abel debe ser lider de algun grupo en la siembra');
  return g.id;
}

test('REGRESION: el lider sigue pudiendo compartir un link de YouTube/Drive en su grupo', async () => {
  const gid = await grupoDelLider();
  const yt = await postJson(`/api/grupo/${gid}/recursos`,
    { tipo: 'link', titulo: 'Cancion del campamento', url: 'https://www.youtube.com/watch?v=abc' }, tokenLider);
  assert.equal(yt.status, 200, 'los links externos son la funcion documentada en ESTADO.md 4.7');
  const drive = await postJson(`/api/grupo/${gid}/recursos`,
    { tipo: 'link', titulo: 'Carpeta', url: 'https://drive.google.com/drive/folders/xyz' }, tokenLider);
  assert.equal(drive.status, 200);
});

test('un recurso de grupo tipo link con javascript: -> 400', async () => {
  const gid = await grupoDelLider();
  const r = await postJson(`/api/grupo/${gid}/recursos`,
    { tipo: 'link', titulo: 'Trampa', url: 'javascript:fetch("/api/me")' }, tokenLider);
  assert.equal(r.status, 400);
});

test('un recurso de grupo tipo ARCHIVO apuntando fuera -> 400; /uploads/ sigue valiendo', async () => {
  const gid = await grupoDelLider();
  const fuera = await postJson(`/api/grupo/${gid}/recursos`,
    { tipo: 'archivo', titulo: 'Ficha', url: 'https://evil.example/ficha.pdf' }, tokenLider);
  assert.equal(fuera.status, 400);
  const dentro = await postJson(`/api/grupo/${gid}/recursos`,
    { tipo: 'archivo', titulo: 'Ficha', url: '/uploads/ficha.pdf' }, tokenLider);
  assert.equal(dentro.status, 200);
});

test('material de musica: archivo_url fuera del servidor -> 400; /uploads/ sigue valiendo', async () => {
  const fuera = await postJson('/api/musica/material',
    { titulo: 'Partitura', archivo_url: 'https://evil.example/p.pdf' }, tokenMusico);
  assert.equal(fuera.status, 400);
  const dentro = await postJson('/api/musica/material',
    { titulo: 'Partitura', archivo_url: '/uploads/p.pdf' }, tokenMusico);
  assert.equal(dentro.status, 200);
});
