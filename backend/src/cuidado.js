// ============================================================
//  Fase 2.5: Cuidado Pastoral  -  SOLO el pastor
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, esObispo, auditar } from './auth.js';

const r = Router();
r.use(authMiddleware);
r.use((req, res, next) => {
  if (!esPastor(req.user.persona_id) && !esObispo(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  next();
});

// Lista de casos (abiertos primero)
r.get('/', (req, res) => {
  res.json(db.prepare(
    `SELECT cc.*, p.nombre FROM caso_cuidado cc JOIN persona p ON p.id = cc.persona_id
      WHERE cc.iglesia_id = ? ORDER BY (cc.estado = 'atendido'), cc.creado_en DESC`
  ).all(req.user.iglesia_id));
});

// Crear caso
r.post('/', (req, res) => {
  const { persona_id: aPersona, motivo } = req.body || {};
  if (!aPersona) return res.status(400).json({ error: 'Falta la persona' });
  const destino = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ?').get(aPersona, req.user.iglesia_id);
  if (!destino) return res.status(404).json({ error: 'Persona no encontrada en tu iglesia' });
  const info = db.prepare("INSERT INTO caso_cuidado (iglesia_id, persona_id, motivo, estado) VALUES (?,?,?, 'abierto')")
    .run(req.user.iglesia_id, aPersona, motivo || 'otro');
  auditar(req.user.iglesia_id, req.user.persona_id, 'crear_caso_cuidado', 'cuidado', 'persona ' + aPersona);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Detalle + historial de contactos
r.get('/:id', (req, res) => {
  const caso = db.prepare(
    `SELECT cc.*, p.nombre, p.telefono FROM caso_cuidado cc JOIN persona p ON p.id = cc.persona_id
      WHERE cc.id = ? AND cc.iglesia_id = ?`
  ).get(req.params.id, req.user.iglesia_id);
  if (!caso) return res.status(404).json({ error: 'No encontrado' });
  const contactos = db.prepare('SELECT * FROM contacto_cuidado WHERE caso_id = ? ORDER BY fecha DESC').all(caso.id);
  res.json({ caso, contactos });
});

// Registrar un contacto (visita, llamada, oración...)
r.post('/:id/contacto', (req, res) => {
  const caso = db.prepare('SELECT id FROM caso_cuidado WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
  const { tipo, nota } = req.body || {};
  db.prepare('INSERT INTO contacto_cuidado (caso_id, tipo, nota) VALUES (?,?,?)').run(caso.id, tipo || 'nota', nota || '');
  db.prepare("UPDATE caso_cuidado SET estado = 'seguimiento' WHERE id = ? AND estado = 'abierto'").run(caso.id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'contacto_cuidado', 'cuidado', 'caso ' + caso.id);
  res.json({ ok: true });
});

// Marcar atendido
r.patch('/:id/atender', (req, res) => {
  const caso = db.prepare('SELECT id FROM caso_cuidado WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
  db.prepare("UPDATE caso_cuidado SET estado = 'atendido' WHERE id = ?").run(caso.id);
  res.json({ ok: true });
});

export default r;
