# Directorio de miembros + cumpleaños — Plan

**Goal:** Directorio de la iglesia con perfil (foto, contacto, cumpleaños), **contacto oculto por
defecto** (cada persona lo activa; sin excepción para liderazgo), y **aviso de cumpleaños a toda la
iglesia** el día del cumpleaños.

**Stack:** Node ESM + Express + `node:sqlite`; frontend vanilla JS (NAV generado en JS). Pruebas
`node --test`. Sin dependencias nuevas.

## Global Constraints
- Aislamiento por `iglesia_id` en toda consulta.
- **Privacidad:** `telefono`/`email` de otra persona se muestran **solo si esa persona activó el
  toggle**. Excepción única: **tu propio** perfil siempre ves todo. **NingÚn** rol (ni pastor/líder)
  ve el contacto oculto de otro.
- Reusar helpers existentes: `authMiddleware`, `enviarPush`, patrón `notificar`, dedupe
  `recordatorio_enviado (iglesia_id, persona_id, clave)` con `INSERT OR IGNORE`.
- Español sin tildes en identificadores. ESM.

---

## Task 1 — BD + backend `directorio.js` (perfil + listado con privacidad)

**Files:** crear `backend/src/directorio.js`; modificar `backend/src/db.js` (ALTER idempotente),
`backend/src/server.js` (montar router); test `backend/test/directorio.test.js`.

**BD (db.js, con el helper `columnaExiste` ya existente):**
- `ALTER TABLE persona ADD COLUMN foto_url TEXT` (si falta).
- `ALTER TABLE persona ADD COLUMN mostrar_telefono INTEGER NOT NULL DEFAULT 0` (si falta).
- `ALTER TABLE persona ADD COLUMN mostrar_email INTEGER NOT NULL DEFAULT 0` (si falta).
  (Default **0 = oculto**.)

**Endpoints (`/api/directorio`, todos con `authMiddleware`):**
- `GET /` (opcional `?q=`): lista miembros activos de mi iglesia. Por cada persona devuelve
  `{ id, nombre, foto_url, grupos:[nombre], es_yo }` y **`telefono`/`email` solo si**
  `persona.id === req.user.persona_id` **o** el flag `mostrar_*` de esa persona es 1; si no, el campo
  va `null`. `grupos` = nombres de sus grupos (via `pertenencia`+`grupo`). Filtra por `nombre LIKE`
  si viene `q`. Orden por `nombre`.
- `GET /cumpleanos`: personas activas de mi iglesia con `cumple` cuyo **mes** = mes actual, con
  `{ id, nombre, foto_url, dia }` ordenado por día. (Usar `strftime('%m', cumple)` = mes actual;
  ignorar `cumple` nulo o no-ISO.)
- `GET /perfil`: mi perfil completo `{ id, nombre, telefono, email, cumple, foto_url,
  mostrar_telefono, mostrar_email }`.
- `PATCH /perfil`: actualiza **mi** perfil. Campos aceptados: `telefono`, `email`, `cumple`
  (validar formato `YYYY-MM-DD` o vacío), `foto_url` (string), `mostrar_telefono`,
  `mostrar_email` (0/1). Ignora campos no enviados. Devuelve `{ ok:true }`.

**Tests (node:test, arnés estilo del proyecto — BD temporal + siembra):**
- feligrés A ve el `telefono` de B **solo** si B tiene `mostrar_telefono=1`; si B lo oculta → `null`.
- A siempre ve su **propio** teléfono aunque lo tenga oculto.
- **El pastor tampoco** ve el teléfono oculto de B (sin excepción de liderazgo).
- `PATCH /perfil` de A cambia solo su fila (no la de otros); activar `mostrar_telefono` hace que
  B lo vea.
- `GET /cumpleanos` lista solo los del mes actual.
- Aislamiento: usuario de otra iglesia no aparece ni es visible.

## Task 2 — Cumpleaños automáticos (aviso a toda la iglesia, deduplicado)

**Files:** `backend/src/directorio.js` (`generarCumpleanosHoy`); `backend/src/server.js`
(llamarla en `GET /api/me`, junto a `generarRecordatoriosThrottled`); test en
`backend/test/directorio.test.js`.

- `export function generarCumpleanosHoy(iglesiaId)`: busca personas activas cuyo `cumple` coincide
  con **hoy** (día y mes; `strftime('%m-%d', cumple) = strftime('%m-%d','now','localtime')`). Por
  cada cumpleañero/a, notifica a **todos** los miembros activos de la iglesia con
  `INSERT OR IGNORE INTO recordatorio_enviado (iglesia_id, persona_id, clave)` usando
  `clave = 'cumple:' || cumpleañeroId || ':' || fechaHoy`; solo crea la `notificacion` (tipo
  `'cumple'`, "🎂 Hoy cumple <Nombre>") + `enviarPush` si el INSERT insertó (dedupe). El
  cumpleañero/a **no** se auto-notifica (opcional: excluirlo). No re-notifica el mismo día.
- En `server.js`, dentro de `GET /api/me`, tras `generarRecordatoriosThrottled`, llamar
  `try { generarCumpleanosHoy(persona.iglesia_id); } catch {}`.

**Tests:**
- Con una persona cuyo `cumple` = hoy (mismo mes-día), correr `generarCumpleanosHoy` → crea
  notificación a los demás miembros; segunda corrida → 0 nuevas (dedupe).
- Una persona cuyo `cumple` es otro día → no genera nada.

## Task 3 — Frontend: vista Directorio + Mi Perfil

**Files:** `web/app.js`, `web/styles.css` (index.html no se toca: NAV/vistas en JS).

- Ítem de NAV **Directorio** (icono de línea) visible para todos (agregar al array `NAV` y su icono
  como hacen los demás módulos — **detectar los nombres reales primero**).
- Vista Directorio:
  - Sección **"🎂 Cumpleaños del mes"** (de `GET /api/directorio/cumpleanos`).
  - Buscador (input que llama `GET /?q=`).
  - Tarjetas: foto (o inicial), nombre, grupos; si hay `telefono`/`email` visibles → enlaces
    `tel:`/`mailto:`. Escapar TODO texto de usuario (usar el helper de escape real).
  - Botón **"Mi perfil"** → editor: subir foto (helper de upload real), teléfono, correo, fecha
    (selector día/mes/año existente), y switches **"Mostrar mi teléfono / correo"**. Guardar =
    `PATCH /perfil`.
- Verificación: `node --check web/app.js`; arrancar server y `curl` de `/` 200.

## Task 4 — Docs

- Actualizar `ESTADO.md` (nueva sección "Directorio + cumpleaños") y anotar los ALTER de `persona`.
