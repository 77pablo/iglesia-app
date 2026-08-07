# Plan — Rendición: gastos de eventos en Tesorería (Camino C)

Spec: `docs/superpowers/specs/2026-08-07-rendicion-eventos-design.md`
Rama: `feat/rendicion-eventos` · TDD en cada tarea.

## Tarea 1 — Resumen con la verdad completa
- [x] RED: saldo resta SOLO fuente='caja' (aporte/devuelve no tocan);
      gastosEventosMes del mes de la hoja/evento; gasMes intacto.
- [x] GREEN en GET /resumen. Commit.

## Tarea 2 — GET /gastos-eventos
- [x] RED: agrupado por hoja con sus gastos, aislamiento de iglesia,
      paginado de a 20 hojas, pagador con LEFT JOIN.
- [x] GREEN. Transparencia con linea nueva. Commit.

## Tarea 3 — Pantalla
- [x] Tarjeta plegable en Tesorería + linea del resumen. Barridos en verde.
- [x] Commit.

## Tarea 4 — Docs y cierre
- [x] ESTADO.md (pendiente 1 de fuente-del-gasto tachado + sección del día).
- [x] Merge --no-ff, suite sobre la fusión.
