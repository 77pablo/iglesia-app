# Organización de eventos (hoja de logística + cuentas) — Diseño

**Fecha:** 2026-07-24
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado, listo para plan de implementación.

## Objetivo

Un apartado para **organizar y llevar la cuenta** de un evento: qué llevar y cuánto
(ej. "jugos nectar ×5", "bebidas ×4"), una hora de llegada común
("todos deben llegar a las 12:30") y el **gasto** del evento (lista de gastos que
se suma sola). Debe funcionar **pegado a un evento del calendario** y también como
**lista suelta** independiente.

Es un concepto NUEVO. No se solapa con:
- **Asignaciones** (`asignacion`): reparte *servicios* (predicar, ofrenda, música,
  aseo) a personas. No sirve para "traer 5 jugos".
- **Tesorería** (`movimiento`): ingresos/gastos generales de la iglesia. El gasto de
  una hoja de organización queda SEPARADO de la tesorería (decisión de visibilidad:
  los gastos de la hoja solo los ven líderes, no el tesorero ni la congregación).

## Enfoque elegido

**A — "Hoja de organización" reutilizable.** Un solo modelo (`evento_org`) que puede
apuntar a un evento o existir suelto. Cubre "pegado a evento" y "lista suelta" sin
duplicar código. Los gastos NO entran a Tesorería (se descartaron los enfoques B
"todo dentro del evento, sin sueltas" y C "gastos a Tesorería").

## Modelo de datos (3 tablas nuevas)

### `evento_org` — la hoja de organización
| campo | tipo | notas |
|---|---|---|
| `id` | INTEGER PK | |
| `iglesia_id` | INTEGER NOT NULL → iglesia(id) | aislamiento |
| `evento_id` | INTEGER NULL → evento(id) | NULL = hoja suelta; si no, hoja pegada |
| `titulo` | TEXT | solo hojas sueltas (la pegada muestra el título del evento) |
| `fecha` | TEXT | solo hojas sueltas |
| `hora_llegada` | TEXT | formato `HH:MM` (mismo patrón que `evento.hora_inicio`), opcional |
| `creado_por` | INTEGER → persona(id) | define quién puede editar |
| `creada_en` | TEXT DEFAULT datetime('now') | |

Regla: **una sola hoja por evento**. Se garantiza con un índice único parcial
`CREATE UNIQUE INDEX ... ON evento_org(evento_id) WHERE evento_id IS NOT NULL`
(el parcial evita colisionar todas las hojas sueltas, que tienen `evento_id = NULL`).

### `evento_org_cosa` — las cosas a llevar
`id`, `org_id` NOT NULL → evento_org(id), `nombre` TEXT NOT NULL,
`cantidad` INTEGER NOT NULL DEFAULT 1, `listo` INTEGER NOT NULL DEFAULT 0 (0/1),
`orden` INTEGER DEFAULT 0.

### `evento_org_gasto` — los gastos
`id`, `org_id` NOT NULL → evento_org(id), `concepto` TEXT NOT NULL,
`monto` REAL NOT NULL, `creado_en` TEXT DEFAULT datetime('now').

**Total gastado:** NO se persiste. Se calcula `SELECT COALESCE(SUM(monto),0)` al leer
la hoja, así nunca queda descuadrado.

### Cascada de borrado
- Borrar una hoja → borra sus `evento_org_cosa` y `evento_org_gasto` (transacción,
  patrón de `eventos.js DELETE`).
- Borrar un evento (`eventos.js`) → además de las tablas hijas actuales, borra su
  `evento_org` (y en cascada cosas/gastos). Añadir a la transacción existente.
- Borrar una iglesia → ya cubierto por el borrado dinámico
  (`eliminarIglesia.js`: cualquier tabla con `iglesia_id` + limpieza de huérfanos por
  `foreign_key_check`). `evento_org` tiene `iglesia_id`; cosas/gastos caen como
  huérfanos y se limpian solos. **No requiere cambios en `eliminarIglesia.js`.**

## Permisos y visibilidad

- **Ver:** solo líderes/admins y el pastor. Se usa `esLiderOAdmin(personaId)` (ya
  existe). Feligrés común → 403.
- **Editar** (crear/editar hoja, cosas, gastos, hora): SOLO `creado_por === persona_id`
  **o** `esPastor(persona_id)`. Un líder distinto la ve pero no la edita.
- Hoja pegada: el `evento_id` debe ser de un evento de la misma `iglesia_id`.
- Todo aislado por `iglesia_id` en cada consulta.

Helper interno `puedeEditarOrg(personaId, org)` = `org.creado_por === personaId || esPastor(personaId)`.

## Backend — `backend/src/organizacion.js`, montado en `/api/organizacion`

Router con `authMiddleware`. Gate de visibilidad (líder/pastor) al inicio.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | hojas sueltas + hojas de eventos de la iglesia (para el apartado de líderes). Incluye `total_gastado` por hoja. |
| GET | `/evento/:eventoId` | la hoja de ese evento; **la crea vacía** la primera vez (lazy). Devuelve hoja + cosas + gastos + total. |
| GET | `/:id` | detalle de una hoja (hoja + cosas + gastos + total). 404 si no es de la iglesia. |
| POST | `/` | crea hoja suelta `{ titulo, fecha?, hora_llegada? }`. |
| PATCH | `/:id` | edita `{ titulo?, fecha?, hora_llegada? }` (parcial, no borra lo ausente). Requiere editar. |
| DELETE | `/:id` | borra hoja + cosas + gastos (transacción). Requiere editar. |
| POST | `/:id/cosas` | añade cosa `{ nombre, cantidad? }`. Requiere editar. |
| PATCH | `/cosas/:cosaId` | edita/`toggle listo` `{ nombre?, cantidad?, listo? }`. Requiere editar (resuelve la hoja por la cosa). |
| DELETE | `/cosas/:cosaId` | borra la cosa. Requiere editar. |
| POST | `/:id/gastos` | añade gasto `{ concepto, monto }` (monto > 0). Requiere editar. |
| DELETE | `/gastos/:gastoId` | borra el gasto. Requiere editar. |

- Validación con `zod` + `validar(...)` (patrón del proyecto). `hora_llegada` con el
  `horaSchema` `HH:MM`. `cantidad` entero ≥ 1. `monto` número > 0.
- `auditar(iglesia_id, persona_id, accion, 'organizacion', detalle)` en las mutaciones.
- Montar en `server.js`: `app.use('/api/organizacion', organizacionRouter)`.

## Frontend — `web/app.js` (vanilla JS) + `web/styles.css`

- Nuevo apartado **"Organización"** en el menú, **visible solo a líderes** (misma
  lógica de visibilidad de nav que ya distingue roles): lista de hojas (título, fecha,
  nº cosas, total gastado) + botón "➕ Nueva lista".
- En el **detalle de un evento** (para quien lo ve como líder): botón
  "🗒️ Organización" que llama a `GET /organizacion/evento/:id` y abre la hoja.
- **Vista de la hoja:**
  - Cabecera: título + fecha + **hora de llegada** editable.
  - **Cosas:** cada línea `nombre ×cantidad` con checkbox (✓ listo) y ✕ para borrar;
    input para añadir. Marcar el check hace `PATCH /cosas/:id { listo }`.
  - **Gastos:** cada línea `concepto — $monto` con ✕; input concepto+monto para añadir;
    abajo el **Total gastado** en grande.
  - Botón editar solo aparece si el usuario puede editar (creador o pastor); si no,
    modo lectura.
  - Patrones existentes: `escHtml` en todo lo que venga del usuario, `conBoton` anti
    doble-submit, `toast` para feedback, montos formateados como el resto.

## Pruebas

**Backend (`backend/test/organizacion.test.js`, `node:test`):**
1. Crear hoja suelta y hoja de evento (lazy en `GET /evento/:id`); una sola hoja por evento.
2. Aislamiento: una iglesia no ve/edita hojas de otra (404).
3. Permiso de edición: creador y pastor editan; otro líder → 403 al mutar; feligrés → 403 al ver.
4. Cosas: añadir, marcar `listo`, borrar.
5. Gastos: añadir dos, `total_gastado` = suma; borrar uno recalcula.
6. Cascada: borrar hoja borra cosas/gastos; borrar evento borra su hoja; sin referencias
   rotas (`PRAGMA foreign_key_check` vacío).

**Navegador (Playwright):** como líder, crear lista suelta, añadir 2 cosas y marcar una,
añadir 2 gastos y ver el total, abrir la hoja de un evento desde su detalle. Sin errores
de consola.

## Fuera de alcance (v1)

- Integración con Tesorería (que el gasto entre al balance de la iglesia).
- Costo/responsable por línea de cosa (las líneas son nombre + cantidad + ✓).
- Plantillas de listas reutilizables, exportar a PDF, notificaciones de "trae tu parte".
