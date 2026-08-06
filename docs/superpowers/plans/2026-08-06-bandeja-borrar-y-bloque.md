# Plan — Bandeja: borrar un mensaje y marcar atendido en bloque (Tanda E)

Spec: `docs/superpowers/specs/2026-08-06-bandeja-borrar-y-bloque-design.md`
Rama: `feat/bandeja-borrar-y-bloque` · TDD en cada tarea (RED antes que el código).

## Tarea 1 — `DELETE /api/publico/mensajes/:id`
- [ ] RED: tests en `bandeja-portal.test.js` — pastor borra (200, fila fuera,
      apunte `borrar_mensaje_portal` con el nombre), cruzado de iglesia (404 y
      la fila sigue), sin ser pastor (403). Verlos fallar.
- [ ] GREEN: ruta en `publico.js` — SELECT del nombre acotado por iglesia,
      404 si no hay; `BEGIN` → `DELETE` → `auditar` → `COMMIT`.
- [ ] Suite del archivo en verde.
- [ ] Commit: `feat(publico): el pastor puede borrar un mensaje del portal, auditado`

## Tarea 2 — `PATCH /api/publico/mensajes/atender-todos`
- [ ] RED: tests — marca solo los `nuevo` y devuelve el conteo; con
      `{previos:true}` solo los `previo`; 200 y `atendidos:0` sin nada que
      marcar; 403 sin ser pastor. Verlos fallar.
- [ ] GREEN: ruta en `publico.js`, un solo UPDATE acotado por iglesia+estado.
- [ ] Suite del archivo en verde.
- [ ] Commit: `feat(publico): marcar atendido en bloque (nuevos, y anteriores aparte)`

## Tarea 3 — Pantalla
- [ ] 🗑️ en `filaMensajePortal` + `borrarMensajePortal()` (modalConfirm danger,
      quita solo la tarjeta, baja contador de anteriores si toca).
- [ ] Botón en bloque arriba de la lista (solo si la primera página trae algún
      no-atendido) + botón de anteriores dentro de su caja; ambos recargan.
- [ ] Suite completa en verde (los barridos leen `web/app.js`).
- [ ] Commit: `feat(web): borrar mensaje y atender en bloque en la bandeja`

## Tarea 4 — Documentación y cierre
- [ ] Nota al pie en la spec del 31-jul (su "fuera de alcance" caducó en dos puntos).
- [ ] ESTADO.md: sección del 6-ago ampliada + tanda E tachada + pendiente 3 tachado.
- [ ] Suite completa. Merge `--no-ff` a `main`, borrar rama.
- [ ] Commit docs + merge.
