// ============================================================
//  Modulo D: Asistencia simple (lista)  -  Fase 1B
//  El facial es el metodo final (Fase 3); esto es el puente.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esLiderOAdmin, esEncargadoGrupo, esPastor, auditar } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

function miembrosDeGrupo(grupoId) {
  return db.prepare(
    `SELECT DISTINCT p.id, p.nombre,
            (SELECT GROUP_CONCAT(g.nombre, ', ')
               FROM pertenencia pe2 JOIN grupo g ON g.id = pe2.grupo_id
              WHERE pe2.persona_id = p.id) AS grupos
       FROM persona p
       JOIN pertenencia pe ON pe.persona_id = p.id
      WHERE pe.grupo_id = ? AND p.activo = 1 ORDER BY p.nombre`
  ).all(grupoId);
}

// --- Hoja de asistencia de un evento ---
r.get('/evento/:id', (req, res) => {
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });

  const miembros = ev.grupo_id ? miembrosDeGrupo(ev.grupo_id) : [];
  const presentes = new Set(
    db.prepare('SELECT persona_id FROM asistencia WHERE evento_id = ?').all(ev.id).map(x => x.persona_id)
  );
  const lista = miembros.map(m => ({ id: m.id, nombre: m.nombre, grupos: m.grupos || '', presente: presentes.has(m.id) }));

  // Comparacion: ultima reunion del mismo grupo con asistencia
  let ultimaVez = null;
  if (ev.grupo_id) {
    const rows = db.prepare(
      `SELECT (SELECT COUNT(*) FROM asistencia a WHERE a.evento_id = e.id) AS n
         FROM evento e WHERE e.grupo_id = ? AND e.id != ? ORDER BY e.fecha DESC, e.id DESC`
    ).all(ev.grupo_id, ev.id);
    const f = rows.find(x => x.n > 0);
    if (f) ultimaVez = f.n;
  }

  // Solo el ENCARGADO del grupo puede editar; el pastor (y demas) solo ven.
  const puedeEditar = ev.grupo_id
    ? esEncargadoGrupo(req.user.persona_id, ev.grupo_id)
    : (esPastor(req.user.persona_id) || ev.creado_por === req.user.persona_id);
  res.json({
    evento: { id: ev.id, titulo: ev.titulo, fecha: ev.fecha, grupo_id: ev.grupo_id },
    miembros: lista, total: presentes.size, ultimaVez, puedeEditar
  });
});

// --- Guardar asistencia (lista de presentes) ---
const guardarAsistenciaSchema = z.object({
  presentes: z.array(z.coerce.number().int().positive()).optional()
});
r.post('/evento/:id', validar(guardarAsistenciaSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const puede = ev.grupo_id
    ? esEncargadoGrupo(persona_id, ev.grupo_id)
    : (esPastor(persona_id) || ev.creado_por === persona_id);
  if (!puede) return res.status(403).json({ error: 'Solo el encargado del grupo puede registrar la asistencia (el pastor solo puede verla).' });

  const idsRecibidos = Array.isArray(req.body.presentes) ? req.body.presentes : [];
  // No confiar en los ids tal cual: deben pertenecer al grupo del evento
  // (o, si el evento no tiene grupo, al menos a la misma iglesia). Sin este
  // filtro se puede marcar como "presente" a una persona ajena al grupo o
  // incluso de otra iglesia (ver auditoria backend.md #7).
  const validos = new Set(
    (ev.grupo_id
      ? db.prepare('SELECT persona_id AS id FROM pertenencia WHERE grupo_id = ?').all(ev.grupo_id)
      : db.prepare('SELECT id FROM persona WHERE iglesia_id = ?').all(iglesia_id)
    ).map(x => x.id)
  );
  const ids = idsRecibidos.filter(pid => validos.has(pid));

  db.prepare('DELETE FROM asistencia WHERE evento_id = ?').run(ev.id);
  const stmt = db.prepare("INSERT INTO asistencia (evento_id, persona_id, metodo) VALUES (?,?, 'lista')");
  for (const pid of ids) stmt.run(ev.id, pid);

  auditar(iglesia_id, persona_id, 'registrar_asistencia', 'asistencia', ev.titulo + ': ' + ids.length);
  res.json({ ok: true, total: ids.length });
});

export default r;
