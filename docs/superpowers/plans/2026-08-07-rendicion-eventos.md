# Plan — Rendición: gastos de eventos en Tesorería (Camino C)

Spec: `docs/superpowers/specs/2026-08-07-rendicion-eventos-design.md`
Rama: `feat/rendicion-eventos` · TDD en cada tarea.

## Tarea 1 — Resumen con la verdad completa
- [ ] RED: saldo resta SOLO fuente='caja' (aporte/devuelve no tocan);
      gastosEventosMes del mes de la hoja/evento; gasMes intacto.
- [ ] GREEN en GET /resumen. Commit.

## Tarea 2 — GET /gastos-eventos
- [ ] RED: agrupado por hoja con sus gastos, aislamiento de iglesia,
      paginado de a 20 hojas, pagador con LEFT JOIN.
- [ ] GREEN. Transparencia con linea nueva. Commit.

## Tarea 3 — Pantalla
- [ ] Tarjeta plegable en Tesorería + linea del resumen. Barridos en verde.
- [ ] Commit.

## Tarea 4 — Docs y cierre
- [ ] ESTADO.md (pendiente 1 de fuente-del-gasto tachado + sección del día).
- [ ] Merge --no-ff, suite sobre la fusión.
