// ============================================================
//  Fase 6: Mensajeria interna (chat) — /api/mensajes
//  Conversaciones 1:1 / por grupo / a medida, tiempo real por SSE,
//  adjuntos, leido/no-leidos, "escribiendo...", moderacion del pastor.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, auditar } from './auth.js';
import { enviarPush } from './push.js';
import { emitir, estaConectada } from './sse.js';

const r = Router();

// (las rutas se agregan en las tareas siguientes)

export default r;
