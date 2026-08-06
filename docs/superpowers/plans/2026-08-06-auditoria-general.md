# Plan — Tanda F: Registro de actividad del pastor

Spec: `docs/superpowers/specs/2026-08-06-auditoria-general-design.md`
Rama: `feat/auditoria-general` · TDD en cada tarea.

## Tarea 1 — Endpoint GET /api/admin/auditoria
- [ ] RED: tests (accesos, RUTINARIAS por defecto, todo=1, filtros persona/
      modulo/combinados, aislamiento de iglesia, hayMas, actor anonimizado,
      actores/modulos solo con offset=0). Verlos fallar.
- [ ] GREEN: ruta en admin.js con RUTINARIAS exportada.
- [ ] Test de que RUTINARIAS ⊆ acciones reales del codigo.
- [ ] Commit: `feat(admin): endpoint del registro de actividad del pastor`

## Tarea 2 — Pantalla en Administracion
- [ ] Seccion plegable "📜 Registro de actividad" en renderAdmin: filtros,
      casilla de accesos, lista, Ver mas.
- [ ] Suite completa en verde (barridos XSS y botones incluidos).
- [ ] Commit: `feat(web): registro de actividad en Administracion`

## Tarea 3 — Docs y cierre
- [ ] ESTADO.md (tanda F tachada + seccion del dia) y casillas de este plan.
- [ ] Merge --no-ff a main, borrar rama, suite sobre la fusion.
