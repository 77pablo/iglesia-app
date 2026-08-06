# Bandeja del portal: borrar un mensaje y marcar atendido en bloque

**Fecha:** 6 de agosto de 2026 · **Tanda E** (aprobada por Pablo el 5-ago, sin
decisiones pendientes) · Cierra el pendiente 3 de la bandeja del portal
(*"No se puede borrar un mensaje ni marcar atendido en bloque"*, spec
`2026-07-31-bandeja-portal-publico-design.md`).

## Qué se construye

Dos capacidades nuevas en la bandeja del pastor, y nada más:

1. **Borrar un mensaje** (uno a uno, con confirmación).
2. **Marcar atendido en bloque** (todos los nuevos de un clic; y aparte, todos
   los anteriores).

## Decisiones

| Decisión | Elección | Por qué |
|---|---|---|
| Quién borra | Solo el pastor (`soloPastorBandeja`, igual que el resto de la bandeja) | Es su bandeja; el obispo ni la ve |
| Qué se puede borrar | Cualquier mensaje, en cualquier estado (nuevo, atendido, previo) | "Borrar un mensaje" sin letra chica; un previo de hace meses es el caso de uso más probable |
| El borrado se audita | **Sí**: `borrar_mensaje_portal`, con el nombre del visitante en el detalle, y el `DELETE` + apunte **en la misma transacción** | Es la única destrucción sin vuelta atrás de la bandeja; la convención del 31-jul (una destrucción no puede quedar aplicada sin rastro) manda aquí también. El atender individual no audita y **sigue sin auditar**: no destruye nada |
| Alcance del "en bloque" principal | Solo `estado='nuevo'` → `'atendido'`. **No toca los previos** | "Marcar atendido es una afirmación del pastor" (spec 31-jul): atender en silencio meses que quizá nunca leyó sería afirmar lo que no hizo. Los previos tienen su propio botón, explícito, dentro de su caja |
| En bloque sin nada que marcar | 200 con `atendidos: 0`, no 404 | No es "un recurso que no existe"; es una orden que ya estaba cumplida |
| Confirmación en pantalla | `modalConfirm` con `danger:true` para el borrado y para los dos "en bloque" | Borrar no tiene vuelta; atender tampoco (no hay camino de vuelta a 'nuevo', decisión del 31-jul) |
| Tras un borrado | Se quita **solo esa tarjeta** del DOM (y baja el contador de anteriores si era de ahí) | Mismo motivo que `atenderMensajePortal`: recargar la vista resetea offsets y pliega la sección de anteriores |
| Tras un "en bloque" | Recarga completa de la vista | Cambió todo lo visible; repintar es lo honesto y lo simple |

## Rutas nuevas (`backend/src/publico.js`)

- **`DELETE /api/publico/mensajes/:id`** — auth + solo pastor. Acotado por
  iglesia **en la misma consulta** (la lección de musica.js). Si no hay fila:
  **404, no 403** (un 403 confirmaría que el id existe en otra iglesia). Se lee
  el nombre antes de borrar para el apunte; `DELETE` y `auditar()` van en
  `BEGIN`/`COMMIT`/`ROLLBACK`.
- **`PATCH /api/publico/mensajes/atender-todos`** — auth + solo pastor. Body
  opcional `{previos: true}`: sin él marca los `'nuevo'`, con él los
  `'previo'`. Un solo `UPDATE` acotado por iglesia y estado. Devuelve
  `{ok: true, atendidos: <changes>}`.
  ⚠️ No choca con `PATCH /mensajes/:id/atender`: son formas distintas
  (`/mensajes/atender-todos` tiene dos segmentos, la otra tres).

## Pantalla (`web/app.js`)

- `filaMensajePortal()` gana un 🗑️ (`<button>`, `aria-label` con el nombre,
  `Number(m.id)` en el onclick — la lección del barrido XSS del 5-ago).
- `borrarMensajePortal(id)`: confirma, llama al DELETE, quita `mp-msg-<id>` y
  baja el contador de anteriores si la tarjeta vivía en esa caja (misma lógica
  que el atender individual).
- Botón **"✅ Marcar todos como atendidos"** arriba de la lista principal,
  solo si la primera página trae algún no-atendido. ⚠️ Esa condición es
  **exacta, no aproximada**: el ORDER BY pone lo no atendido primero, así que
  si la primera página viene toda atendida, no queda nada por atender en
  ninguna otra.
- Botón equivalente **dentro de la caja de anteriores** ("Marcar todos los
  anteriores como atendidos"), visible con la caja abierta. Tras confirmar,
  ambos recargan la vista: los previos recién atendidos pasan a la lista
  principal como atendidos y la sección de anteriores desaparece (contador 0).

## Fuera de alcance, a propósito

- Deshacer un borrado o volver un atendido a 'nuevo'. No hay papelera.
- Borrar en bloque. Atender en bloque es corregir un contador; borrar en
  bloque es destruir el archivo de un clic. Nadie lo pidió.
- Responder, convertir en caso de Cuidado, widget en el panel: siguen fuera
  (spec del 31-jul).

## Cómo se verifica

- Tests nuevos en `bandeja-portal.test.js`: borrar (200, la fila desaparece,
  apunte con el nombre), borrar cruzado de iglesia (404 y la fila sigue),
  borrar sin ser pastor (403), atender-todos (marca solo los nuevos y devuelve
  el conteo; con `previos:true` solo los previos; 0 cuando no hay nada), y
  atender-todos sin ser pastor (403).
- Manual (Pablo, navegador): borrar un mensaje y ver la tarjeta irse sin que
  la sección de anteriores se pliegue; marcar todos y ver la lista repintada.
