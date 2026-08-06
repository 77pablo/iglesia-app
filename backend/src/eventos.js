// ============================================================
//  Modulo A: Calendario + Eventos  -  Fase 1B
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import {
  authMiddleware, esPastor, esAdminDeGrupo, esEncargadoGrupo, veCalendarioCompleto,
  gruposDeUsuario, auditar
} from './auth.js';
import { enviarPush } from './push.js';
import { validar } from './seguridad.js';
import { fechaLocal } from './fechas.js';

const r = Router();
r.use(authMiddleware);

// Aritmetica de fechas de calendario en UTC PURO sobre la cadena YYYY-MM-DD:
// la T00:00:00Z fija el mediodia... no: fija medianoche UTC, y como solo se
// suman dias enteros y se recorta a los 10 primeros caracteres, la zona
// horaria del proceso no toca nada (la trampa de las cinco fechas, ver
// reportes.js:21-29 antes de tocar esto).
function sumarDias(f, n) {
  const d = new Date(f + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const HORIZONTE_DIAS = 90;   // una serie llega hasta 3 meses adelante...
const UMBRAL_DIAS = 45;      // ...y se extiende cuando le queda menos que esto.

// Extension automatica (tanda H): al abrir el calendario, toda serie ACTIVA
// de la iglesia cuyo ultimo evento quede a menos de hoy+45 gana semanas hasta
// hoy+90, copiando su ultimo evento (titulo, horas, lugar, grupo). Los
// choques de lugar/hora se saltan, igual que al crear la serie. Una serie
// activa sin ningun evento (los borraron uno a uno) se apaga: no queda de
// donde copiar. La lapida activa=0 es lo que impide resucitar una serie que
// el pastor borro "desde aqui en adelante".
function extenderSeries(iglesiaId) {
  const hoy = fechaLocal();
  const umbral = sumarDias(hoy, UMBRAL_DIAS);
  const tope = sumarDias(hoy, HORIZONTE_DIAS);
  const series = db.prepare(
    `SELECT s.id, MAX(e.fecha) AS ultima FROM serie s
       LEFT JOIN evento e ON e.serie_id = s.id
      WHERE s.iglesia_id = ? AND s.activa = 1 GROUP BY s.id`
  ).all(iglesiaId);
  for (const s of series) {
    if (!s.ultima) { db.prepare('UPDATE serie SET activa = 0 WHERE id = ?').run(s.id); continue; }
    if (s.ultima >= umbral) continue;
    const p = db.prepare('SELECT * FROM evento WHERE serie_id = ? ORDER BY fecha DESC LIMIT 1').get(s.id);
    db.exec('BEGIN');
    try {
      for (let f = sumarDias(s.ultima, 7); f <= tope; f = sumarDias(f, 7)) {
        if (detectarChoque(iglesiaId, f, p.lugar, p.hora_inicio, p.hora_fin)) continue;
        db.prepare(
          `INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion, estado, creado_por, serie_id)
           VALUES (?,?,?,?,?,?,?,?,'aprobado',?,?)`
        ).run(iglesiaId, p.grupo_id, p.titulo, f, p.hora_inicio, p.hora_fin, p.lugar, p.descripcion, p.creado_por, s.id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[eventos] extender serie fallo:', e);
    }
  }
}

// --- Listar eventos (segun lo que el usuario puede ver) ---
r.get('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  extenderSeries(iglesia_id);
  let eventos;
  if (veCalendarioCompleto(persona_id)) {
    // Lideres/pastor: ven TODO el calendario de su iglesia
    eventos = db.prepare(
      `SELECT e.*, g.nombre AS grupo, g.color AS grupo_color FROM evento e
         LEFT JOIN grupo g ON g.id = e.grupo_id
        WHERE e.iglesia_id = ? ORDER BY e.fecha, e.hora_inicio`
    ).all(iglesia_id);
  } else {
    // Feligres / toda la congregacion: ve TODO el calendario aprobado de su iglesia
    eventos = db.prepare(
      `SELECT e.*, g.nombre AS grupo, g.color AS grupo_color FROM evento e
         LEFT JOIN grupo g ON g.id = e.grupo_id
        WHERE e.iglesia_id = ? AND e.estado = 'aprobado'
        ORDER BY e.fecha, e.hora_inicio`
    ).all(iglesia_id);
  }
  res.json(eventos);
});

// --- Grupos donde el usuario PUEDE crear eventos ---
r.get('/grupos-gestionables', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (esPastor(persona_id)) {
    return res.json(db.prepare('SELECT id, nombre FROM grupo WHERE iglesia_id = ?').all(iglesia_id));
  }
  const grupos = gruposDeUsuario(persona_id)
    .filter(g => esAdminDeGrupo(persona_id, g.id))
    .map(g => ({ id: g.id, nombre: g.nombre }));
  res.json(grupos);
});

// --- Crear evento ---
// hora_inicio/hora_fin: exige HH:MM (o vacio/omitido) para que la
// deteccion de choque (comparacion lexicografica de strings) sea correcta
// ('9:00' > '10:00' con formato libre; '09:00' < '10:00' con HH:MM fijo).
const horaSchema = z.string().trim().regex(/^\d{2}:\d{2}$/, 'hora invalida (usa HH:MM)').optional().or(z.literal(''));
const crearEventoSchema = z.object({
  grupo_id: z.coerce.number().int().positive('falta el grupo'),
  titulo: z.string().trim().min(1, 'falta el titulo'),
  fecha: z.string().trim().min(1, 'falta la fecha'),
  hora_inicio: horaSchema,
  hora_fin: horaSchema,
  lugar: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
  // Tanda H: "todos los domingos". Solo semanal, solo el pastor (se comprueba
  // en la ruta: el schema no sabe quien pregunta).
  repetir_semanal: z.boolean().optional()
});
// El grupo tiene que ser de TU iglesia. esAdminDeGrupo() no lo comprueba: le
// dice que si a cualquier pastor sea cual sea el grupo, asi que sin esto un
// evento podia quedar apuntando al grupo de otra congregacion (y el calendario
// mostraria su nombre y su color a gente que no es de ahi).
function grupoDeIglesia(grupoId, iglesiaId) {
  return db.prepare('SELECT id FROM grupo WHERE id = ? AND iglesia_id = ?').get(grupoId, iglesiaId);
}
function puedeUsarGrupo(personaId, grupoId, iglesiaId) {
  return !!grupoDeIglesia(grupoId, iglesiaId) && esAdminDeGrupo(personaId, Number(grupoId));
}

// Deteccion de choque: mismo dia + mismo lugar + horarios que se solapan.
// excluirId: al editar un evento, no debe chocar consigo mismo.
function detectarChoque(iglesiaId, fecha, lugar, hora_inicio, hora_fin, excluirId) {
  if (!(lugar && hora_inicio && hora_fin)) return null;
  return db.prepare(
    `SELECT titulo FROM evento
      WHERE iglesia_id = ? AND fecha = ? AND lugar = ? AND estado != 'rechazado'
        AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
        AND NOT (? <= hora_inicio OR ? >= hora_fin)
        AND id != ?`
  ).get(iglesiaId, fecha, lugar, hora_fin, hora_inicio, excluirId || 0);
}

r.post('/', validar(crearEventoSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const { grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion } = req.body;

  if (!puedeUsarGrupo(persona_id, grupo_id, iglesia_id))
    return res.status(403).json({ error: 'No tienes permiso para crear eventos en ese grupo' });

  // Serie semanal (tanda H): SOLO el pastor, y nace aprobada como todo lo
  // suyo. Se materializan las fechas hasta hoy+90 en una transaccion; la
  // semana cuyo lugar/hora ya esta ocupado SE SALTA y las demas se crean (la
  // respuesta dice cuantas). serie.activa=1 queda como el interruptor que la
  // extension automatica respeta.
  if (req.body.repetir_semanal === true) {
    if (!esPastor(persona_id))
      return res.status(403).json({ error: 'Solo el pastor puede crear eventos que se repiten' });
    const tope = sumarDias(fechaLocal(), HORIZONTE_DIAS);
    let creados = 0, serieId;
    db.exec('BEGIN');
    try {
      serieId = Number(db.prepare('INSERT INTO serie (iglesia_id) VALUES (?)').run(iglesia_id).lastInsertRowid);
      const ins = db.prepare(
        `INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion, estado, creado_por, serie_id)
         VALUES (?,?,?,?,?,?,?,?,'aprobado',?,?)`
      );
      for (let f = fecha; f <= tope; f = sumarDias(f, 7)) {
        if (detectarChoque(iglesia_id, f, lugar, hora_inicio, hora_fin)) continue;
        ins.run(iglesia_id, grupo_id, titulo, f, hora_inicio || null, hora_fin || null,
          lugar || null, descripcion || null, persona_id, serieId);
        creados++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[eventos] crear serie fallo:', e);
      return res.status(500).json({ error: 'No se pudo crear la serie' });
    }
    auditar(iglesia_id, persona_id, 'crear_serie', 'calendario', `${titulo} (${creados} fecha(s))`);
    return res.json({ ok: true, serie_id: serieId, creados });
  }

  const choque = detectarChoque(iglesia_id, fecha, lugar, hora_inicio, hora_fin);
  if (choque)
    return res.status(409).json({ error: `El lugar "${lugar}" ya esta ocupado a esa hora por "${choque.titulo}". Elige otro horario o lugar.` });

  // Si lo crea el pastor -> aprobado directo. Si un lider -> pendiente de aprobacion.
  const estado = esPastor(persona_id) ? 'aprobado' : 'pendiente';
  const info = db.prepare(
    `INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion, estado, creado_por)
     VALUES (?,?,?,?,?,?,?,?, ?, ?)`
  ).run(iglesia_id, grupo_id, titulo, fecha, hora_inicio || null, hora_fin || null, lugar || null, descripcion || null, estado, persona_id);

  if (estado === 'pendiente') {
    const pastores = db.prepare('SELECT id FROM persona WHERE iglesia_id = ? AND es_pastor = 1').all(iglesia_id);
    const st = db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)');
    for (const p of pastores) st.run(p.id, 'aprobacion', 'Solicitud de fecha', titulo + ' · ' + fecha);
    enviarPush(pastores.map(p => p.id), { titulo: 'Solicitud de fecha', texto: titulo + ' · ' + fecha }).catch(() => {});
  }
  auditar(iglesia_id, persona_id, 'crear_evento', 'calendario', titulo);
  res.json({ ok: true, id: info.lastInsertRowid, estado });
});

// --- Pendientes (bandeja del pastor) ---
r.get('/pendientes', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const items = db.prepare(
    `SELECT e.*, g.nombre AS grupo, p.nombre AS solicitante FROM evento e
       LEFT JOIN grupo g ON g.id = e.grupo_id
       LEFT JOIN persona p ON p.id = e.creado_por
      WHERE e.iglesia_id = ? AND e.estado = 'pendiente' ORDER BY e.fecha`
  ).all(req.user.iglesia_id);
  res.json(items);
});

// --- Aprobar / Rechazar (pastor) ---
r.patch('/:id/aprobar', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  db.prepare("UPDATE evento SET estado = 'aprobado' WHERE id = ?").run(ev.id);
  if (ev.creado_por) {
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(ev.creado_por, 'aprobacion', '✅ Tu fecha fue aprobada', ev.titulo + ' · ' + ev.fecha);
    enviarPush([ev.creado_por], { titulo: '✅ Tu fecha fue aprobada', texto: ev.titulo + ' · ' + ev.fecha }).catch(() => {});
  }
  limpiarSolicitud(ev);
  registrarAprobacion(req, ev, 'aprobado');
  auditar(req.user.iglesia_id, req.user.persona_id, 'aprobar_fecha', 'calendario', ev.titulo);
  res.json({ ok: true });
});

const rechazarEventoSchema = z.object({
  motivo: z.string().trim().optional()
});
r.patch('/:id/rechazar', validar(rechazarEventoSchema), (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  const motivo = req.body.motivo;
  db.prepare("UPDATE evento SET estado = 'rechazado' WHERE id = ?").run(ev.id);
  if (ev.creado_por) {
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(ev.creado_por, 'aprobacion', '🔴 Tu fecha fue rechazada', ev.titulo + (motivo ? ' · ' + motivo : ''));
    enviarPush([ev.creado_por], { titulo: '🔴 Tu fecha fue rechazada', texto: ev.titulo + (motivo ? ' · ' + motivo : '') }).catch(() => {});
  }
  limpiarSolicitud(ev);
  registrarAprobacion(req, ev, 'rechazado', motivo);
  auditar(req.user.iglesia_id, req.user.persona_id, 'rechazar_fecha', 'calendario', ev.titulo);
  res.json({ ok: true });
});

// --- Detalle ---
r.get('/:id', (req, res) => {
  const ev = db.prepare(
    `SELECT e.*, g.nombre AS grupo FROM evento e
       LEFT JOIN grupo g ON g.id = e.grupo_id
      WHERE e.id = ? AND e.iglesia_id = ?`
  ).get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  // Mismo criterio de visibilidad que el listado: quien no ve el calendario
  // completo solo puede ver el detalle de eventos ya aprobados (evita
  // enumerar ids para leer solicitudes pendientes/rechazadas ajenas).
  if (ev.estado !== 'aprobado' && !veCalendarioCompleto(req.user.persona_id))
    return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(ev);
});

// ¿Puede gestionar (editar/borrar) este evento?
//  - Si YA está APROBADO: solo el pastor (la fecha quedó confirmada en el calendario).
//  - Si está pendiente/rechazado: el encargado del grupo o quien lo creó.
function puedeGestionar(personaId, ev) {
  if (ev.estado === 'aprobado') return esPastor(personaId);
  return esEncargadoGrupo(personaId, ev.grupo_id) || ev.creado_por === personaId;
}
// Borrar es mas permisivo: el pastor puede ELIMINAR cualquier evento
// (aprobado/rechazado/pendiente), util para limpiar el calendario.
function puedeBorrar(personaId, ev) {
  if (esPastor(personaId)) return true;
  return esEncargadoGrupo(personaId, ev.grupo_id) || ev.creado_por === personaId;
}
// Quita la notificacion-solicitud ("Revisar y aprobar") cuando la fecha ya se
// resolvio o se borro, para que no quede activa.
function limpiarSolicitud(ev) {
  // La tabla notificacion no tiene iglesia_id: filtramos por persona_id
  // perteneciente a la iglesia del evento para no borrar avisos de otra
  // iglesia que coincidan en titulo+fecha (ver auditoria backend.md #6).
  db.prepare(
    `DELETE FROM notificacion WHERE tipo='aprobacion' AND titulo='Solicitud de fecha' AND texto = ?
       AND persona_id IN (SELECT id FROM persona WHERE iglesia_id = ?)`
  ).run(ev.titulo + ' · ' + ev.fecha, ev.iglesia_id);
}
// Registra en el historial de aprobaciones/rechazos del pastor.
function registrarAprobacion(req, ev, accion, motivo) {
  const actor = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id);
  const grupo = ev.grupo_id ? (db.prepare('SELECT nombre FROM grupo WHERE id = ?').get(ev.grupo_id) || {}).nombre : null;
  db.prepare(`INSERT INTO aprobacion_log (iglesia_id, evento_titulo, fecha_evento, grupo, accion, motivo, actor_id, actor_nombre)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.user.iglesia_id, ev.titulo, ev.fecha, grupo, accion, motivo || null, req.user.persona_id, actor ? actor.nombre : null);
}

// --- Historial de aprobaciones/rechazos (pastor) ---
r.get('/historial/aprobaciones', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  res.json(db.prepare(
    'SELECT * FROM aprobacion_log WHERE iglesia_id = ? ORDER BY id DESC LIMIT 100'
  ).all(req.user.iglesia_id));
});

// --- Editar evento ---
// grupo_id va aqui porque el formulario de edicion SIEMPRE lo manda (pinta el
// desplegable de Grupo tambien al editar). Sin declararlo, validar() lo tiraba
// en silencio —no da 400, se limita a quedarse con las claves que conoce— y
// cambiar de grupo respondia "Evento actualizado" sin cambiar nada.
const editarEventoSchema = z.object({
  grupo_id: z.coerce.number().int().positive().optional(),
  titulo: z.string().trim().optional(),
  fecha: z.string().trim().optional(),
  hora_inicio: horaSchema,
  hora_fin: horaSchema,
  lugar: z.string().trim().optional(),
  descripcion: z.string().trim().optional()
});
r.patch('/:id', validar(editarEventoSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  if (!puedeGestionar(persona_id, ev)) return res.status(403).json({ error: 'No tienes permiso' });
  const { grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion } = req.body;

  // Cambiar de grupo se revalida: el permiso se comprueba al CREAR, y sin esto
  // editar seria la puerta de atras para meter un evento en el grupo de otro.
  const grupoFinal = grupo_id ?? ev.grupo_id;
  if (grupo_id !== undefined && Number(grupo_id) !== ev.grupo_id &&
      !puedeUsarGrupo(persona_id, grupo_id, iglesia_id))
    return res.status(403).json({ error: 'No tienes permiso para mover el evento a ese grupo' });

  // PATCH parcial: un campo ausente (undefined) conserva el valor actual,
  // no lo borra (ver auditoria backend.md #3).
  const fechaFinal = fecha ?? ev.fecha;
  const horaInicioFinal = hora_inicio ?? ev.hora_inicio;
  const horaFinFinal = hora_fin ?? ev.hora_fin;
  const lugarFinal = lugar ?? ev.lugar;

  // Re-validar choque de lugar/hora tambien al editar (la creacion ya lo
  // hace; sin esto un PATCH podia mover un evento a un horario/lugar ya
  // ocupado sin ser detectado). Se excluye el propio evento.
  const choque = detectarChoque(iglesia_id, fechaFinal, lugarFinal, horaInicioFinal, horaFinFinal, ev.id);
  if (choque)
    return res.status(409).json({ error: `El lugar "${lugarFinal}" ya esta ocupado a esa hora por "${choque.titulo}". Elige otro horario o lugar.` });

  db.prepare('UPDATE evento SET grupo_id=?, titulo=?, fecha=?, hora_inicio=?, hora_fin=?, lugar=?, descripcion=? WHERE id=?')
    .run(
      grupoFinal,
      titulo ?? ev.titulo,
      fechaFinal,
      horaInicioFinal,
      horaFinFinal,
      lugarFinal,
      descripcion ?? ev.descripcion,
      ev.id
    );
  auditar(iglesia_id, persona_id, 'editar_evento', 'calendario', ev.titulo);
  res.json({ ok: true });
});

// --- Eliminar evento ---
// La cascada completa de UN evento: 6 tablas hijas, el bosquejo desvinculado,
// la solicitud de aprobacion, la hoja de organizacion (cosas + gastos + hoja)
// y el propio evento. SIN transaccion propia a proposito: el que llama pone
// el BEGIN — el borrado suelto envuelve un evento; el de serie, todos los
// suyos, para que "borrar esta y las siguientes" no pueda quedar a medias.
function borrarEventoEnCascada(ev) {
  db.prepare('DELETE FROM asignacion WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM asistencia WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM setlist_item WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM equipo_musica WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM ensayo WHERE evento_id=?').run(ev.id);
  // El bosquejo del sermón puede vivir sin evento: lo desvinculamos (no lo borramos).
  db.prepare('UPDATE sermon SET evento_id=NULL WHERE evento_id=?').run(ev.id);
  limpiarSolicitud(ev);   // quita la notificación "Revisar y aprobar" si seguía activa
  // Hoja de organizacion del evento: cosas + gastos + la hoja. Va antes del
  // DELETE del evento porque evento_org.evento_id lo referencia.
  db.prepare('DELETE FROM evento_org_cosa  WHERE org_id IN (SELECT id FROM evento_org WHERE evento_id=?)').run(ev.id);
  db.prepare('DELETE FROM evento_org_gasto WHERE org_id IN (SELECT id FROM evento_org WHERE evento_id=?)').run(ev.id);
  db.prepare('DELETE FROM evento_org WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM evento WHERE id=?').run(ev.id);
}

r.delete('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  if (!puedeBorrar(persona_id, ev)) return res.status(403).json({ error: 'No tienes permiso' });
  // Borra 6 tablas hijas + evento en una sola transaccion: si algo falla a
  // mitad de camino, no debe quedar el evento a medio borrar (huerfanos en
  // unas tablas si o si no en otras). Patron identico al de cuenta.js /eliminar.
  // Ojo: borrar UNA fecha de una serie NO la apaga — el feriado suelto no
  // mata el culto de todas las semanas (y si borran todas una a una, la
  // extension automatica apaga la serie al verla vacia).
  db.exec('BEGIN');
  try {
    borrarEventoEnCascada(ev);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[eventos] eliminar evento fallo:', e);
    return res.status(500).json({ error: 'No se pudo eliminar el evento' });
  }
  auditar(iglesia_id, persona_id, 'eliminar_evento', 'calendario', ev.titulo);
  res.json({ ok: true });
});

// "Borrar esta y las siguientes" (tanda H): apaga la serie (activa=0, la
// lapida que la extension automatica respeta) y borra sus eventos con
// fecha >= desde, cada uno con la MISMA cascada del borrado suelto, todo en
// una transaccion. Las fechas pasadas quedan como historia.
r.delete('/serie/:serieId', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esPastor(persona_id))
    return res.status(403).json({ error: 'Solo el pastor puede borrar una serie' });
  // Acotada por iglesia en la MISMA consulta; 404 y no 403 (no se confirma
  // que la serie exista en otra congregacion).
  const s = db.prepare('SELECT * FROM serie WHERE id = ? AND iglesia_id = ?')
    .get(Number(req.params.serieId), iglesia_id);
  if (!s) return res.status(404).json({ error: 'Serie no encontrada' });

  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? String(req.query.desde) : fechaLocal();
  const evs = db.prepare('SELECT * FROM evento WHERE serie_id = ? AND iglesia_id = ? AND fecha >= ?')
    .all(s.id, iglesia_id, desde);
  db.exec('BEGIN');
  try {
    for (const ev of evs) borrarEventoEnCascada(ev);
    db.prepare('UPDATE serie SET activa = 0 WHERE id = ?').run(s.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[eventos] borrar serie fallo:', e);
    return res.status(500).json({ error: 'No se pudo borrar la serie' });
  }
  auditar(iglesia_id, persona_id, 'eliminar_serie', 'calendario',
    `${evs.length ? evs[0].titulo : ''} (${evs.length} fecha(s) desde ${desde})`);
  res.json({ ok: true, borrados: evs.length });
});

export default r;
