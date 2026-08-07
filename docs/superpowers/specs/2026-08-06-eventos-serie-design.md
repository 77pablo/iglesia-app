# Tanda H — Eventos que se repiten ("todos los domingos")

**Fecha:** 6 de agosto de 2026 · Decisiones tomadas con Pablo en brainstorming
ese mismo día. El culto de cada domingo hoy hay que crearlo a mano domingo
por domingo.

## Decisiones del dueño

| Decisión | Elección | Por qué |
|---|---|---|
| Frecuencia | **Solo semanal** | Cubre culto, escuela dominical y ensayos — los casos reales |
| Horizonte | **3 meses, y la serie se extiende sola** | Al abrir el calendario, si a una serie activa le queda menos de un mes y medio, se agregan fechas hasta volver a 3 meses. Nadie tiene que acordarse |
| Cambios | **Borrar una fecha o la serie entera**; sin "editar la serie" | El feriado se borra suelto; cambiar la hora = borrar serie y crear de nuevo |
| Quién crea series | **Solo el pastor**; nacen aprobadas | Los eventos fijos son decisión suya; no se construye "aprobación de series" |

## El modelo: materializar, no dibujar

Las fechas se crean **de verdad** (filas de `evento`): asignaciones, música,
asistencia y organización cuelgan de un evento concreto con id, y así siguen
funcionando sin tocarse. Lo nuevo:

- **Tabla `serie`** (`id, iglesia_id, activa DEFAULT 1`): el estado de la
  serie. Sin ella, "borrar la serie" y la extensión automática se contradicen
  — la extensión resucitaría lo que el pastor mató. `activa=0` es la lápida.
- **`evento.serie_id`** (nullable, migración idempotente con guarda PRAGMA).

## Backend (`eventos.js`, `db.js`)

- **`POST /api/eventos` acepta `repetir_semanal`** (boolean). Con él: solo
  pastor (403 si no), crea la fila de `serie` y ~13 eventos (cada 7 días
  hasta hoy+90), todos `aprobado`, en una transacción. Una fecha que **choca**
  (lugar/hora ocupados) **se salta y las demás se crean** — la respuesta dice
  cuántas se crearon. Auditado como `crear_serie` con el conteo.
- **Extensión automática en `GET /api/eventos`**: para cada serie **activa**
  de la iglesia cuyo último evento quede a menos de hoy+45, se generan
  semanas hasta hoy+90 **copiando el último evento de la serie** (título,
  horas, lugar, grupo, descripción). Los choques se saltan. Una serie activa
  que se quedó **sin ningún evento** (los borraron uno a uno) se apaga: no
  queda de dónde copiar.
- **`DELETE /api/eventos/serie/:serieId?desde=YYYY-MM-DD`** (default hoy,
  solo pastor): apaga la serie (`activa=0`) y borra sus eventos con
  `fecha >= desde` usando **la misma cascada de 6 tablas** del borrado de un
  evento — extraída a `borrarEventoEnCascada()` compartida, todo en una
  transacción. Las fechas pasadas quedan como historia. Auditado como
  `eliminar_serie`.
- Aritmética de fechas con cadenas `YYYY-MM-DD` en UTC puro (sumar días a la
  cadena, sin `new Date()` local — la trampa de las 5 fechas). El "hoy" es
  `fechaLocal()` de `fechas.js`.
- **Limpieza:** `fecha_no_disp.repetir` no la escribió nadie nunca (cero
  INSERT en la historia del repo, igual que la tabla `recurso` del 5-ago):
  se retira con migración idempotente. "No puedo servir los martes" queda
  explícitamente FUERA de esta tanda.

## Pantalla (`web/app.js`)

- En el formulario de evento, **solo el pastor y solo al crear** (no al
  editar): casilla "🔁 repetir todas las semanas (3 meses)".
- Un evento de serie muestra el chip **"🔁 se repite cada semana"** en el
  panel del día — para que nadie borre uno creyendo que borra todos.
- Para el pastor, junto al borrar normal: **"Borrar esta y las siguientes"**
  (confirmación con `modalConfirm` danger), que llama al DELETE de la serie
  con `desde` = la fecha de ese evento.
- Todo pasa los tres barridos XSS y el de botones sin firmas nuevas.

## Fuera de alcance, a propósito

- Editar la serie hacia adelante; frecuencias no semanales; series pedidas
  por líderes; disponibilidad recurrente ("no puedo los martes").

## Cómo se verifica

- Tests: creación (13 fechas, 7 días entre sí, mismo `serie_id`, aprobadas),
  líder → 403 y cero filas, extensión (activa se extiende, inactiva no, sin
  eventos se apaga), borrar serie desde una fecha (futuras fuera CON su
  cascada — se siembra una asignación y desaparece —, pasadas quedan, y NO
  resucita en el siguiente GET), borrar una fecha suelta no toca la serie,
  choque al crear se salta, migraciones idempotentes (serie_id existe,
  repetir ya no, correr dos veces no rompe).
- Manual (Pablo): crear "Culto — todos los domingos", ver ~13 domingos, borrar
  uno suelto, y "borrar esta y las siguientes" desde un domingo del medio.
