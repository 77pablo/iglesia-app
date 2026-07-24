// ============================================================
//  Hub SSE en memoria (Fase 6): entrega en tiempo real.
//  Desacoplado de la BD: solo mapea persona_id -> conexiones abiertas.
//  Best-effort: si la persona no esta conectada, el evento se descarta
//  (el mensaje ya esta en BD y se recupera al abrir la conversacion).
// ============================================================

const conexiones = new Map();  // persona_id -> Set<res>

// Tope de conexiones simultaneas por persona: evita agotar descriptores si
// un cliente (o un abuso) abre el stream muchas veces sin cerrar el anterior.
// Al llegar al tope, se cierra la conexion MAS ANTIGUA de esa persona (Set
// conserva el orden de insercion) para dejar entrar a la nueva.
const MAX_CONEXIONES_POR_PERSONA = 5;

export function registrar(personaId, res) {
  const pid = Number(personaId);
  if (!conexiones.has(pid)) conexiones.set(pid, new Set());
  const set = conexiones.get(pid);
  if (set.size >= MAX_CONEXIONES_POR_PERSONA) {
    const masAntigua = set.values().next().value;
    set.delete(masAntigua);
    try { masAntigua.end(); } catch { /* ya estaba cerrada */ }
  }
  set.add(res);
  return function baja() {
    const set = conexiones.get(pid);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) conexiones.delete(pid);
  };
}

export function estaConectada(personaId) {
  const set = conexiones.get(Number(personaId));
  return !!(set && set.size);
}

export function emitir(personaIds, evento, data) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const pid of new Set(personaIds.map(Number))) {
    const set = conexiones.get(pid);
    if (!set) continue;
    for (const res of set) {
      try { res.write(payload); } catch { /* conexion muerta: se limpia en 'close' */ }
    }
  }
}
