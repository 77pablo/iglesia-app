// ============================================================
//  Datos de prueba  -  crea una iglesia, pastor y feligreses
//  Ejecutar:  npm run seed
// ============================================================
import './env.js';   // por si DB_PATH viene de .env
import db from './db.js';
import { hashPassword } from './auth.js';

// Limpia datos previos (solo para desarrollo). Desactivamos las llaves foraneas
// durante el borrado para no depender del orden y cubrir TODAS las tablas.
db.exec('PRAGMA foreign_keys = OFF;');
for (const t of ['asistencia_nino','leccion','nino','clase_ed','movimiento','campania','contacto_cuidado','caso_cuidado',
                 'nota_personal','sermon','devocional','recordatorio_enviado',
                 'equipo_musica','ensayo','material_musica','setlist_item','cancion',
                 'tarea_grupo','recurso_grupo','aviso_grupo','predica_recurso','predica','rol_temporal',
                 'biometria_persona','notificacion','dispositivo_push','push_sub','fecha_no_disp',
                 'mensaje','conversacion_miembro','conversacion',
                 'asistencia','asignacion','evento','anuncio','pertenencia','recurso','grupo','persona','auditoria','iglesia']) {
  try { db.exec(`DELETE FROM ${t};`); } catch (e) { /* tabla puede no existir en BD vieja */ }
}
db.exec('PRAGMA foreign_keys = ON;');

// 1) Iglesia
const ig = db.prepare(
  'INSERT INTO iglesia (nombre, codigo_unico) VALUES (?, ?)'
).run('Iglesia Monte Sion', 'MONTESION');
const iglesiaId = ig.lastInsertRowid;

// 2) Grupos
const gJovenes = db.prepare('INSERT INTO grupo (iglesia_id, nombre, tipo, color) VALUES (?,?,?,?)')
  .run(iglesiaId, 'Jovenes', 'cuerpo', '#2D9CDB').lastInsertRowid;
const gMusica = db.prepare('INSERT INTO grupo (iglesia_id, nombre, tipo, color) VALUES (?,?,?,?)')
  .run(iglesiaId, 'Musica', 'ministerio', '#2DD4BF').lastInsertRowid;

// 3) Personas (usuario / contrasena)
const pastor = db.prepare(
  `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor)
   VALUES (?,?,?,?,1)`
).run(iglesiaId, 'pastor', 'Pastor Principal', hashPassword('1234')).lastInsertRowid;

const abel = db.prepare(
  `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash)
   VALUES (?,?,?,?)`
).run(iglesiaId, 'abel', 'Abel Espinoza', hashPassword('1234')).lastInsertRowid;

const joaquin = db.prepare(
  `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash)
   VALUES (?,?,?,?)`
).run(iglesiaId, 'joaquin', 'Joaquin Mora', hashPassword('1234')).lastInsertRowid;

const maria = db.prepare(
  `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash)
   VALUES (?,?,?,?)`
).run(iglesiaId, 'maria', 'Maria Lopez', hashPassword('1234')).lastInsertRowid;

// 4) Pertenencias (Persona + Grupo + Rol)
//    Abel: admin (lider) de Jovenes
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(abel, gJovenes, 'admin');
//    Joaquin: lider de musica + miembro de jovenes (roles multiples)
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(joaquin, gMusica, 'lider_musica');
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(joaquin, gJovenes, 'miembro');
//    Maria: solo feligresa (miembro de Jovenes)
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(maria, gJovenes, 'miembro');
//    Lucas: musico del ministerio de Musica (puede compartir material/notas)
const lucas = db.prepare(
  `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash) VALUES (?,?,?,?)`
).run(iglesiaId, 'lucas', 'Lucas Rivas', hashPassword('1234')).lastInsertRowid;
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(lucas, gMusica, 'musico');

// 5) Eventos de ejemplo
const evNoche = db.prepare(`INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, estado, creado_por)
            VALUES (?,?,?,?,?,?,?, 'aprobado', ?)`)
  .run(iglesiaId, gJovenes, 'Noche de Jovenes', '2026-06-28', '16:00', '18:00', 'Salon principal', abel).lastInsertRowid;
db.prepare(`INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, estado, creado_por)
            VALUES (?,?,?,?,?,?,?, 'aprobado', ?)`)
  .run(iglesiaId, gMusica, 'Ensayo de musica', '2026-06-27', '19:00', '21:00', 'Templo', joaquin);

// 7) Asignaciones de ejemplo (servicios pendientes de confirmar)
db.prepare("INSERT INTO asignacion (evento_id, persona_id, tipo, estado) VALUES (?,?,?, 'pendiente')").run(evNoche, abel, 'predicar');
db.prepare("INSERT INTO asignacion (evento_id, persona_id, tipo, estado) VALUES (?,?,?, 'pendiente')").run(evNoche, maria, 'ofrenda');

// 8) Una solicitud de fecha PENDIENTE (bandeja del pastor)
db.prepare(`INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, estado, creado_por)
            VALUES (?,?,?,?,?,?,?, 'pendiente', ?)`)
  .run(iglesiaId, gJovenes, 'Retiro de Jovenes', '2026-07-19', '09:00', '17:00', 'Campamento', abel);

// 9) Asistencia de ejemplo (para el panel del pastor)
db.prepare("INSERT INTO asistencia (evento_id, persona_id, metodo) VALUES (?,?, 'lista')").run(evNoche, abel);
db.prepare("INSERT INTO asistencia (evento_id, persona_id, metodo) VALUES (?,?, 'lista')").run(evNoche, joaquin);

// 10) Cancionero de ejemplo (una con acordes/letra para probar el transpositor)
const _letraSublime =
`RE         RE7        SOL    RE
Sublime gracia del Señor
        RE              LA
que a un infeliz salvó;
RE        RE7      SOL      RE
fui ciego mas hoy miro yo,
       RE     LA     RE
perdido y Él me halló.`;
db.prepare('INSERT INTO cancion (iglesia_id, titulo, autor, tono) VALUES (?,?,?,?)').run(iglesiaId, 'Cuan Grande es El', 'Himno', 'G');
db.prepare('INSERT INTO cancion (iglesia_id, titulo, autor, tono, letra) VALUES (?,?,?,?,?)').run(iglesiaId, 'Sublime Gracia', 'Himno', 'RE', _letraSublime);
db.prepare('INSERT INTO cancion (iglesia_id, titulo, autor, tono) VALUES (?,?,?,?)').run(iglesiaId, 'Renuevame', 'Marcos Witt', 'A');

// 10b) Material de música siempre disponible: el himnario (archivo empaquetado en web/assets)
db.prepare('INSERT INTO material_musica (iglesia_id, titulo, archivo_url, creado_por) VALUES (?,?,?,?)')
  .run(iglesiaId, 'Himnario Nuevo (respaldo)', '/assets/himnario-nuevo.pdf', null);

// 11) Un caso de cuidado de ejemplo
db.prepare("INSERT INTO caso_cuidado (iglesia_id, persona_id, motivo, estado) VALUES (?,?,?, 'abierto')").run(iglesiaId, maria, 'ausente');

// 12) Tesoreria: grupo + tesorera + movimientos + campania
const gTes = db.prepare('INSERT INTO grupo (iglesia_id, nombre, tipo, color) VALUES (?,?,?,?)')
  .run(iglesiaId, 'Tesoreria', 'administracion', '#16A34A').lastInsertRowid;
const raquel = db.prepare('INSERT INTO persona (iglesia_id, usuario, nombre, password_hash) VALUES (?,?,?,?)')
  .run(iglesiaId, 'raquel', 'Raquel Tesorera', hashPassword('1234')).lastInsertRowid;
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(raquel, gTes, 'tesorero');

const mov = db.prepare('INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, fecha, creado_por) VALUES (?,?,?,?,?,?,?)');
mov.run(iglesiaId, 'ingreso', 'ofrenda', 2500, 'Ofrenda dominical', '2026-06-07', raquel);
mov.run(iglesiaId, 'ingreso', 'diezmo', 1700, 'Diezmos del mes', '2026-06-14', raquel);
mov.run(iglesiaId, 'gasto', 'servicios', 1200, 'Luz y agua', '2026-06-10', raquel);
mov.run(iglesiaId, 'gasto', 'eventos', 900, 'Materiales evento', '2026-06-18', raquel);
db.prepare('INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,?,?,?)').run(iglesiaId, 'Techo nuevo', 5000, 3200);

// 13) Escuela Dominical: grupo + maestra + clase + niños + lección
const gEd = db.prepare('INSERT INTO grupo (iglesia_id, nombre, tipo, color) VALUES (?,?,?,?)')
  .run(iglesiaId, 'Escuela Dominical', 'ministerio', '#F59E0B').lastInsertRowid;
const marta = db.prepare('INSERT INTO persona (iglesia_id, usuario, nombre, password_hash) VALUES (?,?,?,?)')
  .run(iglesiaId, 'marta', 'Marta Maestra', hashPassword('1234')).lastInsertRowid;
db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(marta, gEd, 'lider_ed');
const claseP = db.prepare('INSERT INTO clase_ed (iglesia_id, nombre, edad) VALUES (?,?,?)').run(iglesiaId, 'Primarios', '6-8 años').lastInsertRowid;
db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre, edad, familia, autorizados) VALUES (?,?,?,?,?,?)')
  .run(iglesiaId, claseP, 'Sofia Gomez', 7, 'Gomez', 'Ana (mama), Carlos (papa)');
db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre, edad, familia, alergias) VALUES (?,?,?,?,?,?)')
  .run(iglesiaId, claseP, 'Mateo Ruiz', 8, 'Ruiz', 'Mani');
db.prepare('INSERT INTO leccion (iglesia_id, clase_id, fecha, titulo, versiculo) VALUES (?,?,?,?,?)')
  .run(iglesiaId, claseP, '2026-06-28', 'David y Goliat', '1 Samuel 17:47');

// 6) Anuncio de ejemplo (segmento por defecto: toda la iglesia)
db.prepare('INSERT INTO anuncio (iglesia_id, titulo, texto, urgente, creado_por, segmento) VALUES (?,?,?,?,?,?)')
  .run(iglesiaId, 'Bienvenidos a la app', 'Ya pueden ver el calendario y sus servicios desde aqui.', 0, pastor, 'todos');

// 14) Fase 4.2: Devocional de ejemplo (lectura offline)
db.prepare('INSERT INTO devocional (iglesia_id, titulo, fecha, texto_base, contenido, creado_por) VALUES (?,?,?,?,?,?)')
  .run(iglesiaId, 'La paz que sobrepasa todo entendimiento', '2026-06-28', 'Filipenses 4:6-7',
       'No se afanen por nada; mas bien, en toda ocasion, con oracion y ruego, presenten sus peticiones a Dios y denle gracias. Y la paz de Dios cuidara sus corazones y sus pensamientos en Cristo Jesus.', pastor);

// 15) Fase 4.3: Sermon (bosquejo) de ejemplo asociado a la Noche de Jovenes
db.prepare(`INSERT INTO sermon (iglesia_id, evento_id, titulo, predicador, fecha, texto_base, bosquejo, puntos, creado_por)
            VALUES (?,?,?,?,?,?,?,?,?)`)
  .run(iglesiaId, evNoche, 'Caminando en fe', 'Pastor Principal', '2026-06-28', 'Hebreos 11:1',
       'La fe es la certeza de lo que se espera, la conviccion de lo que no se ve.',
       JSON.stringify(['La fe es certeza', 'La fe se prueba en el desierto', 'La fe agrada a Dios']), pastor);

// 15b) Fase 4.8: Prédica de ejemplo (módulo Predica) + recursos
const pred1 = db.prepare('INSERT INTO predica (iglesia_id, titulo, fecha, predicador, notas, creado_por) VALUES (?,?,?,?,?,?)')
  .run(iglesiaId, 'El amor de Dios', '2026-06-21', 'Pastor Principal',
       'Juan 3:16 — Porque de tal manera amó Dios al mundo...\n\n1. Un amor que da\n2. Un amor que salva\n3. Un amor que permanece', pastor).lastInsertRowid;
db.prepare("INSERT INTO predica_recurso (predica_id, tipo, titulo, url) VALUES (?,?,?,?)").run(pred1, 'libro', 'Comentario de Juan (Hendriksen)', '');
db.prepare("INSERT INTO predica_recurso (predica_id, tipo, titulo, url) VALUES (?,?,?,?)").run(pred1, 'link', 'Video del sermón', 'https://youtube.com/');

// 16) Fase 4.9: Obispo (ve TODAS las iglesias) + una 2da iglesia para demostrarlo
const obispo = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global) VALUES (?,?,?,?, 'obispo')")
  .run(iglesiaId, 'obispo', 'Obispo Regional', hashPassword('1234')).lastInsertRowid;
const ig2 = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Iglesia Getsemani', 'GETSEMANI').lastInsertRowid;
const pas2 = db.prepare('INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor) VALUES (?,?,?,?,1)').run(ig2, 'pastorg', 'Pastor Daniel Soto', hashPassword('1234')).lastInsertRowid;
const e1 = db.prepare('INSERT INTO persona (iglesia_id, usuario, nombre, password_hash) VALUES (?,?,?,?)').run(ig2, 'ester', 'Ester Vega', hashPassword('1234')).lastInsertRowid;
const p2 = db.prepare('INSERT INTO persona (iglesia_id, usuario, nombre, password_hash) VALUES (?,?,?,?)').run(ig2, 'pablo', 'Pablo Reyes', hashPassword('1234')).lastInsertRowid;
const g2j = db.prepare("INSERT INTO grupo (iglesia_id, nombre, tipo, color) VALUES (?,?,?,?)").run(ig2, 'Jovenes', 'cuerpo', '#9B51E0').lastInsertRowid;
const g2a = db.prepare("INSERT INTO grupo (iglesia_id, nombre, tipo, color) VALUES (?,?,?,?)").run(ig2, 'Alabanza', 'ministerio', '#27AE60').lastInsertRowid;
db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,'admin')").run(e1, g2j);
db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,'lider_musica')").run(p2, g2a);
const ev2 = db.prepare("INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, estado, creado_por) VALUES (?,?,?,?,?,?,?, 'aprobado', ?)")
  .run(ig2, g2j, 'Vigilia de oracion', '2026-06-27', '20:00', '23:00', 'Templo Getsemani', pas2).lastInsertRowid;
db.prepare("INSERT INTO asistencia (evento_id, persona_id, metodo) VALUES (?,?, 'lista')").run(ev2, e1);
db.prepare("INSERT INTO asistencia (evento_id, persona_id, metodo) VALUES (?,?, 'lista')").run(ev2, p2);
db.prepare("INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por) VALUES (?,?,?,?,?,?)").run(ig2, 'ingreso', 'ofrenda', 1500, 'Ofrenda dominical', pas2);
db.prepare("INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por) VALUES (?,?,?,?,?,?)").run(ig2, 'gasto', 'servicios', 400, 'Luz', pas2);
db.prepare('INSERT INTO predica (iglesia_id, titulo, fecha, predicador, notas, creado_por) VALUES (?,?,?,?,?,?)')
  .run(ig2, 'La fe que vence', '2026-06-14', 'Pastor Daniel Soto', '1 Juan 5:4 — Esta es la victoria que vence al mundo: nuestra fe.', pas2);

// 17) Fase 6: Chat demo (mensajeria interna) - 1:1 abel <-> maria
const cvDemo = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, creado_por) VALUES (?, 'directo', ?)")
  .run(iglesiaId, abel).lastInsertRowid;
db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)').run(cvDemo, abel, 'miembro');
db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)').run(cvDemo, maria, 'miembro');
db.prepare("INSERT INTO mensaje (conversacion_id, persona_id, texto) VALUES (?,?, 'Hola Maria, ¿vienes el sabado?')").run(cvDemo, abel);
db.prepare("INSERT INTO mensaje (conversacion_id, persona_id, texto) VALUES (?,?, '¡Si! Ahi estare 🙌')").run(cvDemo, maria);

console.log('\n[seed] Datos de prueba creados:');
console.log('  Iglesia: Monte Sion  (codigo: MONTESION)');
console.log('  Usuarios (contrasena = 1234):');
console.log('    - pastor   (Pastor, ve todo)');
console.log('    - abel     (Lider de Jovenes)');
console.log('    - joaquin  (Lider de Musica + miembro de Jovenes)');
console.log('    - maria    (Feligresa, solo miembro de Jovenes)');
console.log('    - raquel   (Tesorera)');
console.log('    - marta    (Maestra de Escuela Dominical)\n');
