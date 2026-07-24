# Eliminar iglesia (super-admin) — Diseño

**Fecha:** 2026-07-24
**Autor:** Pablo Espinoza (con Claude)
**Estado:** aprobado, pendiente de implementar

## Problema

El panel de super-admin solo permite **desactivar** una iglesia (la oculta pero
conserva todos sus datos). No hay forma de **eliminarla** por completo. Se
necesita para limpiar la iglesia demo "Monte Sion" (con cuentas `1234`) y las
iglesias de prueba mal creadas.

## Objetivo

Un botón permanente en el panel del super-admin que **borra por completo** una
iglesia: todos sus datos en las 45 tablas y todos sus archivos subidos. Uso
poco frecuente pero definitivo. **Irreversible.**

## Alcance

Incluye:
- Endpoint `DELETE /api/superadmin/iglesias/:id` (solo `rol_global='super_admin'`).
- Borrado en cascada, transaccional (todo-o-nada), de todos los datos de la iglesia.
- Borrado de los archivos subidos de la iglesia (`/uploads/...`).
- Botón "🗑️ Eliminar" en cada iglesia del panel, con doble confirmación.
- Rastro en auditoría a nivel sistema (sobrevive al borrado).
- Test de regresión que verifica que no queda rastro (ni filas ni archivos).

Fuera de alcance:
- Exportar/respaldar la iglesia antes de borrarla (no se pide; es borrado, no archivado).
- Deshacer / papelera de reciclaje.
- Borrar la cuenta del super-admin (tiene `iglesia_id=NULL`; nunca pertenece a una iglesia).

## Contexto técnico relevante

- SQLite con `PRAGMA foreign_keys = ON`. Las ~30 tablas que referencian
  `iglesia(id)` **no** tienen `ON DELETE CASCADE`, así que un `DELETE FROM
  iglesia` directo falla por violación de clave foránea.
- `PRAGMA foreign_keys` es no-op dentro de una transacción: hay que apagarlo
  **antes** del `BEGIN` y reactivarlo **después** del `COMMIT`.
- `node:sqlite` es síncrono y de un solo proceso: no hay transacciones
  concurrentes, así que apagar las FK alrededor del borrado es seguro.
- Archivos subidos: se guardan en `UPLOADS_DIR` y la BD guarda su ruta como
  `/uploads/<archivo>`. El respaldo usa `rclone sync` (espejo), así que borrar
  el archivo local también lo borra de Cloudflare R2 en el siguiente ciclo.
- Columnas que guardan archivos subidos (`/uploads/...`), verificadas en `db.js`:
  `persona.foto_url`, `mensaje.adjunto_url`, `material_musica.archivo_url`,
  `movimiento.comprobante_url`, `leccion.material_url`, `predica_recurso.url`
  (esta última guarda enlaces O archivos según `tipo`, así que solo cuentan las
  que empiezan por `/uploads/`). El plan de implementación confirma la lista
  final grepeando el código que escribe rutas `/uploads/` en columnas.
  Se ignoran rutas que no empiecen con `/uploads/` (assets de la app como
  `/assets/himnario-nuevo.pdf`, y enlaces externos como `grupo.drive_url`).
  Nota: `recurso` y `recurso_grupo` pueden tener columnas de enlace/archivo —
  el plan las revisa y las incluye si guardan `/uploads/`.

## Diseño

### Backend — `DELETE /api/superadmin/iglesias/:id`

Gate: reutiliza el `esSuperAdmin` del router `superadmin.js` (ya aplicado a todo
el router). Valida `id` entero > 0 y que la iglesia exista (404 si no).

Secuencia:

1. **Recolectar antes de borrar** (mientras las filas existen):
   - Las rutas `/uploads/...` de la iglesia, de todas las columnas de archivo
     listadas arriba (uniendo por `iglesia_id` o por la conversación/persona de
     la iglesia según la tabla).

2. **Borrado transaccional de datos** (todo-o-nada):
   - `PRAGMA foreign_keys = OFF` (fuera de transacción).
   - `BEGIN`.
   - Borrar las filas de la iglesia en **todas** las tablas:
     - directamente las que tienen `iglesia_id` (`WHERE iglesia_id = ?`);
     - las tablas hijas sin `iglesia_id`, por su padre de la iglesia
       (p. ej. `pertenencia`/`fecha_no_disp`/`push_sub`/`dispositivo_push`/
       `reset_codigo`/`nota_personal`/`biometria_persona` → `persona`;
       `asignacion`/`asistencia`/`setlist_item` → `evento`;
       `contacto_cuidado` → `caso_cuidado`; `leccion`/`asistencia_nino`/`nino`
       → `clase_ed`; `predica_recurso` → `predica`;
       `conversacion_miembro`/`mensaje` → `conversacion`;
       `recurso_grupo`/`aviso_grupo`/`tarea_grupo` → `grupo`).
     La lista exacta de tablas y su orden la fija el plan de implementación,
     enumerando las 45 tablas de `db.js`.
   - Borrar la fila de `iglesia`.
   - **Verificaciones antes de confirmar** (si alguna falla → `ROLLBACK` + 500):
     - a) ninguna tabla con `iglesia_id` conserva filas de esta iglesia;
     - b) `PRAGMA foreign_key_check` no reporta huérfanos (red de seguridad que
       atrapa cualquier tabla hija olvidada).
   - `COMMIT`.
   - `PRAGMA foreign_keys = ON`.

3. **Borrado de archivos** (solo si el `COMMIT` fue exitoso; mejor esfuerzo):
   - Por cada ruta `/uploads/...` recolectada, `fs.unlinkSync` sobre
     `path.join(UPLOADS_DIR, path.basename(ruta))`, ignorando errores de
     "archivo no existe" (reutiliza el patrón ya usado en `cuenta.js` y
     `mensajes.js`). `rclone` propaga las bajas a R2.

4. **Auditoría a nivel sistema:** registrar `superadmin_eliminar_iglesia` con
   `iglesia_id = NULL` (no con el id borrado, que desaparecería), guardando
   nombre y código de la iglesia eliminada. Así el rastro sobrevive.

Orden justificado: los datos se borran primero y solo si el borrado de datos
tiene éxito se tocan los archivos. Nunca se borra un archivo mientras su
registro sigue vivo; si el borrado de datos se revierte, los archivos quedan
intactos.

### Frontend — panel de super-admin (`vistaSuperadmin` / `saCargarLista`)

- Añadir botón **"🗑️ Eliminar"** (rojo/peligro) en la fila de acciones de cada
  iglesia, junto a Editar / Desactivar / Resetear.
- Al pulsarlo, **doble confirmación** con `modalConfirm`:
  1. Primera ventana con **los números reales** de lo que se borrará
     (ej. *"Vas a eliminar 'Monte Sion': 12 miembros, 8 eventos, tesorería,
     mensajes… Esto NO se puede deshacer."*). Los conteos salen de los datos que
     el panel ya tiene (`miembros`) más los que haga falta exponer en el `GET
     /iglesias` (p. ej. nº de eventos) o un conteo liviano; detalle en el plan.
  2. Segunda ventana: *"¿De verdad? Esta acción es definitiva."*
- Al confirmar: `DELETE /api/superadmin/iglesias/:id`, toast de éxito
  ("🗑️ Iglesia eliminada") y refrescar la lista (`saCargarLista`).
- Manejo de error: si el backend responde error, toast con el mensaje; la lista
  no cambia.

## Manejo de errores

- Iglesia inexistente → 404, el frontend muestra el mensaje y refresca.
- Fallo a mitad del borrado de datos → `ROLLBACK`: la iglesia queda **intacta**,
  responde 500 con mensaje genérico; nada queda a medias.
- Fallo al borrar un archivo → se ignora (mejor esfuerzo); el borrado de datos
  ya está confirmado, el archivo huérfano es inofensivo.

## Pruebas

Test de integración nuevo (backend), con FKs reales:
- Sembrar 2 iglesias con datos cruzados (miembros, eventos, tesorería, grupos,
  conversaciones con mensajes, niños, etc.).
- `DELETE` de la iglesia A.
- Verificar: 0 filas de A en toda tabla con `iglesia_id`; `PRAGMA
  foreign_key_check` limpio; la iglesia B **intacta** (mismo nº de filas que
  antes) — prueba de aislamiento entre iglesias.
- Verificar el registro de auditoría a nivel sistema (`iglesia_id = NULL`).
- Gate: un pastor / un obispo reciben 403; iglesia inexistente → 404.
- (Archivos: verificar que se llama al borrado de las rutas `/uploads/`
  recolectadas, con un `UPLOADS_DIR` temporal.)

## Riesgos

- **Olvidar una tabla hija** al enumerar → mitigado por `PRAGMA
  foreign_key_check` antes del commit y por el test de "0 filas / B intacta".
- **Toggle global de `foreign_keys`** → seguro por ser proceso único síncrono;
  se reactiva siempre tras el commit.
- **Irreversibilidad** → mitigada por la doble confirmación con conteos reales.
