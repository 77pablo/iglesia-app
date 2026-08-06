# Plan — Tanda H: eventos que se repiten

Spec: `docs/superpowers/specs/2026-08-06-eventos-serie-design.md`
Rama: `feat/eventos-serie` · TDD en cada tarea.

## Tarea 1 — Migraciones
- [ ] RED: test de que evento.serie_id existe, la tabla serie existe, y
      fecha_no_disp.repetir YA NO; migraciones corridas dos veces no rompen.
- [ ] GREEN: tabla serie + ALTER guardado serie_id + drop de repetir en db.js.
- [ ] Commit: `feat(db): tabla serie, evento.serie_id, y fuera la columna muerta repetir`

## Tarea 2 — Crear y extender
- [ ] RED: tests de POST con repetir_semanal (13 fechas/7 dias/aprobadas/403
      lider/choque se salta) y de la extension en GET (activa si, inactiva no,
      sin eventos se apaga).
- [ ] GREEN: POST + extenderSeries() en GET, sumarDias() en UTC puro.
- [ ] Commit: `feat(eventos): series semanales que se extienden solas`

## Tarea 3 — Borrar serie
- [ ] RED: tests del DELETE /serie/:id (futuras fuera con cascada, pasadas
      quedan, activa=0, no resucita; una fecha suelta no apaga la serie).
- [ ] GREEN: borrarEventoEnCascada() compartida + ruta.
- [ ] Commit: `feat(eventos): borrar esta y las siguientes apaga la serie`

## Tarea 4 — Pantalla
- [ ] Casilla del pastor al crear, chip 🔁 en el panel del dia, boton
      "Borrar esta y las siguientes" con confirmacion.
- [ ] Suite completa en verde (barridos incluidos).
- [ ] Commit: `feat(web): series en el formulario y el panel del dia`

## Tarea 5 — Docs y cierre
- [ ] ESTADO.md + casillas. Merge --no-ff, borrar rama, suite final.
