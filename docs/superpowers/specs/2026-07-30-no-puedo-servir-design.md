# "No puedo servir ese día" — Diseño

**Fecha:** 30 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado; listo para plan de implementación

## De qué se trata

Media función lleva construida en el proyecto desde hace tiempo y no se ha
disparado ni una vez.

- La tabla **`fecha_no_disp`** existe (`backend/src/db.js:149-156`): `persona_id`,
  `desde`, `hasta`, `motivo`, `repetir`.
- Al asignar un servicio, el servidor **la consulta**
  (`backend/src/asignaciones.js:51-54`) y devuelve un aviso al líder.
- El frontend **ya pinta ese aviso** (`web/app.js:1117`):
  *"✅ Asignado y avisado. ⚠️ Esa persona marcó NO disponible (…)"*.
- **Nadie la escribe jamás.** No hay un solo `INSERT INTO fecha_no_disp` en todo
  el proyecto — verificado por búsqueda en `backend/` y `web/`.

Falta la pantalla donde una persona dice *"del 5 al 12 de agosto no puedo"*.
Este documento la diseña, y de paso cierra el fallo de orden que describe la
sección siguiente.

## El push fantasma

El orden real de `POST /api/asignaciones` (`asignaciones.js:51-69`) es:

1. consulta si la persona marcó no disponible — **el servidor ya lo sabe aquí**;
2. crea la asignación;
3. le manda notificación y **push**: *"Te asignaron: música"*;
4. recién ahora devuelve el aviso al líder.

O sea: el servidor sabe en el paso 1 que la persona no puede y en el paso 3 le
manda el push igual. El líder se entera en el paso 4, cuando el otro ya lo
recibió en el teléfono. Deshacerlo obliga a asignar a otro y dejar al primero con
una notificación que no corresponde.

Por eso el diseño no se queda en la pantalla: **el líder tiene que ver quién no
puede antes de pulsar**, no después.

## Decisiones tomadas (30 jul 2026)

| Decisión | Elegido | Descartado |
|---|---|---|
| Quién marca | **Solo uno mismo** | que el líder o el pastor marquen por otro |
| Quién ve el motivo | **El líder, como hoy** | ocultarlo; añadir aviso de "esto se ve" |
| Dónde vive la pantalla | **Dentro de "Mi Servicio"** | entrada propia en el menú; Ajustes |
| Repetición | **Solo rangos de fechas** | "todos los domingos" (columna `repetir`) |
| Alcance | **Pantalla + avisar antes de asignar** | solo la pantalla; añadir confirmación |

Sobre **`repetir`**: se queda sin usar. Nótese que la consulta que dispara el
aviso (`asignaciones.js:53`) hace `? BETWEEN desde AND hasta` y **no la mira**:
guardar ahí una regla semanal no haría saltar ningún aviso. Si algún día se
quiere, hay que cambiar también esa consulta y decidir hasta cuándo vale una
regla sin fecha de fin.

## Qué ve la gente

### La persona, en "Mi Servicio"

Una sección nueva **"Cuándo no puedo servir"**, debajo de sus asignaciones:

- Su lista de periodos: *"5 – 12 ago · Viaje"*, cada uno con una equis para quitarlo.
- Botón **"+ Marcar fechas"** que abre un panel en sitio — el patrón mayoritario
  de la app (17 de los formularios lo usan), no una pantalla aparte.
- Campos: **desde**, **hasta**, y **motivo** (opcional).
- Las fechas se eligen con `fechaSelectHTML`, el selector de día-mes-año que ya
  usa toda la app.
- Solo ve y toca las suyas. No hay forma de ver ni de tocar las de otro.

### El líder, en "Servicio" al asignar

- El desplegable de personas marca a quien no puede ese día:
  *"Marta Silva ⚠️ no disponible"*.
- Se recalcula al cambiar de evento **y al abrir la pantalla**: el desplegable de
  evento no tiene opción vacía, viene con el primero ya seleccionado
  (`web/app.js:1100`), así que sin esto la primera carga saldría sin marcar.
- Si asigna igual, todo funciona como hoy, aviso incluido. **Nunca bloquea** — se
  respeta la regla que el código ya tenía (`asignaciones.js:51`, "avisa, no bloquea").

### Fuera de alcance, a propósito

No repite semanalmente · no se puede marcar por otro · no avisa a nadie cuando
alguien marca fechas · no toca las asignaciones ya hechas si alguien marca un
periodo que las pisa.

## Forma técnica

**Módulo propio `backend/src/disponibilidad.js`.** `asignaciones.js` tiene 100
líneas y añadirle cuatro rutas lo duplicaría; el repo ya separa por asunto.

| Endpoint | Quién | Qué hace |
|---|---|---|
| `GET /api/disponibilidad/mias` | cualquier sesión | mis periodos, ordenados por `desde` |
| `POST /api/disponibilidad` | cualquier sesión | crea uno **mío** (`persona_id` sale del token, nunca del body) |
| `DELETE /api/disponibilidad/:id` | cualquier sesión | borra **solo el mío** |
| `GET /api/disponibilidad/no-disponibles?fecha=` | `esLiderOAdmin` (el mismo guardia que ya protege `POST /api/asignaciones`) | ids de quien no puede ese día |

### Cuatro cosas que hay que clavar

Son las que ya mordieron antes en este proyecto:

1. **Aislamiento entre iglesias.** `fecha_no_disp` **no tiene columna de iglesia**:
   cuelga de la persona. La consulta del líder debe unir con `persona` y filtrar
   por su `iglesia_id`. Es la clase de fallo que la auditoría encontró tres veces,
   incluido un borrado que cruzaba iglesias.
2. **Nada de zonas horarias.** Son fechas sin hora y la comparación es de texto
   `YYYY-MM-DD`. Cinco fallos de este proyecto salieron de convertir a hora local
   cosas que no lo necesitaban. Aquí **no se convierte nada**, ni al guardar ni al
   comparar.
3. **El endpoint del líder devuelve solo ids, no motivos.** Basta para pintar
   "⚠️ no disponible" y evita mandar al navegador del líder los motivos de toda
   la iglesia. El motivo sigue apareciendo donde ya aparecía: en el aviso al asignar.
4. **Borrar mi cuenta borra mis periodos.** Hoy `cuenta.js` limpia al darse de
   baja `reset_codigo`, las notificaciones de cumpleaños, `push_sub` y
   `dispositivo_push` (`cuenta.js:74,193,199,200`) — **`fecha_no_disp` no está en
   esa lista**. Como el motivo es texto libre y puede ser delicado ("operación de
   mi mamá"), sus datos sobrevivirían a la baja. Se añade a la misma transacción.

### Validación (zod, vía `validar()`)

- `desde` y `hasta`: formato `YYYY-MM-DD` (mismo patrón que usa `tesoreria.js`).
- `hasta` no anterior a `desde` → 400.
- `motivo`: opcional, **máximo 200 caracteres** (es una nota corta, no un relato;
  y lo va a leer otra persona).
- Los mensajes se escriben en castellano **dentro del esquema**, que es de donde
  el middleware los toma desde hoy (ver `INFORME-SEGURIDAD.md`, sección 3).

### Casos aceptados sin regla extra

Periodos solapados y fechas pasadas se permiten: no hacen daño y añadir reglas
solo daría errores que la persona no entiende.

## Cómo se prueba

Suite de siempre (`node:test`, `backend/test/`):

- crear, listar y borrar lo propio;
- **no** se puede borrar lo de otro: responde **404**, no 403 ni 200. Se elige 404
  a propósito, para no confirmar que ese periodo existe;
- `persona_id` del body se ignora: se usa el del token;
- un líder de **otra iglesia** no ve a mi gente en `no-disponibles`;
- `hasta` anterior a `desde` → 400 con mensaje en castellano;
- al eliminar la cuenta desaparecen los periodos;
- de punta a punta: marcar no disponible → asignar → el aviso de siempre sigue
  saliendo (esto es la regresión que protege lo ya construido).

Y una comprobación en **navegador real** con Playwright, como la de hoy: que la
sección aparece en "Mi Servicio", que se marca y se borra un periodo, que el
desplegable del líder pinta la marca al abrir y al cambiar de evento, y que no
salen errores de consola.

## Riesgo conocido

El motivo es texto libre y lo lee el líder. Se decidió a conciencia (tabla de
decisiones). No lleva aviso de "esto lo verá tu líder"; si la gente empieza a
escribir cosas delicadas, ese aviso es el primer sitio donde mirar.
