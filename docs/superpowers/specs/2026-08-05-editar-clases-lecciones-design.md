# Escuela Dominical: editar y borrar clases y lecciones

**Fecha:** 5 de agosto de 2026
**Rama:** `feat/editar-clases-lecciones`
**Estado:** aprobado por el dueño (decisión del 5-ago: una clase solo se borra vacía)

## El problema

Desde la Fase 13 los NIÑOS se pueden corregir y borrar; las CLASES y las
LECCIONES siguen sin poder: una clase mal escrita o una lección subida por
error se quedan para siempre (pendiente anotado en `ESTADO.md` desde el 31-jul).

## Decisión del dueño (5-ago)

**Una clase solo se borra si no tiene niños.** Con niños inscritos responde
409 con un mensaje claro ("mueve o borra sus fichas primero"): borrar datos
de menores en bloque, sin mirar ficha por ficha, es demasiado fácil de hacer
por error. Cada borrado de niño ya existe, se confirma y se audita.

## Diseño

### Backend (`backend/src/ninos.js`)

- **`PATCH /clases/:id`** — `soloEncargado` + `validar` (nombre min 1,
  edad max 60, ambos opcionales, al menos uno). Lista blanca, acotado por
  iglesia en la misma consulta (404). **Solo se audita lo que cambió de
  verdad** (`editar_clase`, detalle "antes → después" — la regla que estrenó
  Tesorería hoy mismo).
- **`DELETE /clases/:id`** — `soloEncargado`. Si `COUNT(nino)` > 0 → **409**
  con el número en el mensaje. Vacía de niños: borra en **una transacción**
  sus filas viejas de `asistencia_nino` (huérfanas de niños movidos o
  borrados: ese historial ya no lo muestra ninguna pantalla — mismo
  razonamiento que el borrado de niños de la Fase 13), sus `leccion` y la
  `clase_ed`. Audita `eliminar_clase` (nombre + cuántas lecciones se fueron).
  ⚠️ Los archivos subidos de esas lecciones quedan huérfanos en `/uploads`
  — consecuencia asumida, pasa igual en el resto de la app.
- **`PATCH /material/:id`** — `soloEncargado` + `validar` (titulo min 1,
  fecha, versiculo — opcionales, al menos uno). Acotado por
  `leccion.iglesia_id` directo (la tabla lo tiene). Audita solo cambios
  (`editar_leccion`). **El documento (`material_url`) NO se cambia por esta
  vía**: un archivo equivocado se arregla borrando la lección y subiéndola
  de nuevo — anotado.
- **`DELETE /material/:id`** — `soloEncargado`, acotado por iglesia, audita
  `eliminar_leccion` (título).
- **Se cierra el hueco de auditoría del 30-jul:** `POST /clases`,
  `POST /ninos` y `POST /material` ganan su `auditar()` (`crear_clase`,
  `inscribir_nino`, `crear_leccion`) — nada de este módulo dejaba rastro al
  crear.

### Frontend (`web/app.js`)

- `cargarClases` guarda `window._clasesEd`; `cargarMaterial` guarda
  `window._materialEd` (para prellenar sin releer).
- **Clase:** en `vistaClase`, junto al título, ✏️ y 🗑️ (solo encargada,
  `esLiderEdUI()`). ✏️ abre panel en sitio (nombre/edad prellenados);
  guardar → PATCH → repinta el título. 🗑️ → `modalConfirm` **con el nombre
  escapado** (la trampa de XSS del plan de la Fase 13 está documentada);
  el 409 del backend se muestra tal cual (trae el conteo de niños).
- **Lección:** cada fila gana Editar/🗑️ (solo encargada, botones de
  verdad). Editar = panel con título/fecha/versículo; el formulario manda
  sus campos como hace `guardarNino` (convención del módulo) — el backend
  audita solo lo que cambió, así que reenviar lo igual no ensucia el rastro.
  🗑️ → `modalConfirm` con el título escapado.

### Tests (`backend/test/clases-lecciones.test.js`, arnés in-process)

1. Corregir nombre de clase → 200 + apunte antes→después; mismos valores →
   cero apuntes. 2. Pastor → 403. 3. Clase ajena → 404. 4. Borrar clase con
   niños → 409 y nada cambia. 5. Borrar clase vacía con lecciones y
   asistencia vieja → todo fuera en transacción + apunte. 6. Corregir
   lección → 200 + apunte solo-cambios; `material_url` en el body se ignora.
   7. Borrar lección ajena → 404; propia → 200 + apunte. 8. Los tres POST
   dejan apunte de creación.

## Fuera de alcance, a propósito

- Mover niños entre clases en bloque (se mueven uno a uno editando la ficha).
- Reemplazar el documento de una lección por PATCH.
- Limpiar los archivos huérfanos de `/uploads`.
- La tabla `asistencia_nino` sigue existiendo (decisión del 30-jul intacta).
