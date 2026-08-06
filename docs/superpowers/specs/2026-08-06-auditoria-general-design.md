# Tanda F — Registro de actividad (auditoría general del pastor)

**Fecha:** 6 de agosto de 2026 · Decisiones tomadas con Pablo en brainstorming
este mismo día. Cierra el pendiente anotado desde el 31-jul (*"No hay pantalla
de auditoría general"*): la tabla `auditoria` recibe ~40 tipos de acciones de
todos los módulos y hoy solo se ve por rendijas (el historial de una hoja de
Organización, el de un movimiento de tesorería).

## Decisiones del dueño

| Decisión | Elección | Por qué |
|---|---|---|
| Quién la ve | **Solo el pastor** (el router de Administración ya deja fuera al obispo) | El pastor es el responsable; el obispo tiene sus resúmenes y puede pedir cuentas. Empezar acotado |
| Qué muestra al abrir | **Solo los cambios**; una casilla "mostrar también accesos" agrega lo rutinario | Un muro de inicios de sesión esconde la corrección de dinero que importa |
| Filtros | **Por persona y por módulo**, combinables; "Ver más" de a 50 | "¿Qué hizo fulanito?" y "¿quién tocó tesorería?" son las dos preguntas reales |
| Ubicación | **Dentro de Administración**, sección plegable | Ya es solo del pastor; no agranda el menú |
| Qué NO hace | Ni borrar ni editar apuntes; sin rango de fechas; el obispo no la ve | Un registro que se puede podar no es un registro. Fechas: tanda futura si hace falta |

## Backend (`admin.js`)

- **`GET /api/admin/auditoria?offset=&persona=&modulo=&todo=1`** — hereda la
  guardia del router (pastor / super-admin). Acotado por `iglesia_id` **en la
  misma consulta**. `LEFT JOIN persona` para el nombre del actor (el mismo
  precedente de `tesoreria.js:153`: una cuenta anonimizada muestra "Usuario
  eliminado" por su propia fila; un actor sin fila sale NULL y la pantalla
  pinta "(cuenta eliminada)").
- **`RUTINARIAS`**, la lista de acciones de acceso/lectura que se esconden por
  defecto, vive **en el servidor**, exportada y con test:
  `login, recuperar_password, exportar_reporte, exportar_asistencia,
  obispo_resumen, obispo_informe`. Sin `todo=1` se filtran con
  `accion NOT IN (...)`; con `todo=1` sale todo.
- Filtros: `persona` (id numérico → `actor_id = ?`) y `modulo` (texto →
  `modulo = ?`), combinables entre sí y con `todo`.
- Paginación LIMIT+1 → `{ items, hayMas, offset }` (el patrón de
  notificaciones/bandeja). Con `offset=0` la respuesta agrega `actores`
  (DISTINCT actor de la iglesia presentes en el registro, con nombre) y
  `modulos` (DISTINCT modulo), para llenar los dos selectores sin viaje extra.

## Pantalla (`web/app.js`, dentro de `renderAdmin`)

- Sección **"📜 Registro de actividad"** plegable, nacida cerrada (el patrón
  de "mensajes anteriores" de la bandeja: `<button>` con `aria-expanded`,
  carga al abrirla por primera vez, plegar no descarta).
- Cada fila: **quién** (`escHtml`, o "(cuenta eliminada)"), **qué**
  (la acción legible + el `detalle` con `escHtml` — el detalle trae los
  "antes → después"), **cuándo** (`fechaDeUTC`: `auditoria.fecha` es UTC).
- Controles: selector de persona, selector de módulo, casilla "mostrar
  también accesos" — cambiar cualquiera recarga desde `offset=0`. "Ver más"
  pagina.
- Los nombres de acción se muestran tal cual (`corregir_nombre_usuario` →
  se legibiliza con un reemplazo simple de `_` por espacio; **sin** tabla de
  traducción que haya que mantener sincronizada con ~40 acciones).
- Todo lo nuevo pasa los tres barridos XSS y el de botones: `escHtml` en cada
  dato, `Number()` en ids de onclick, `<button>` reales.

## Cómo se verifica

- Tests de endpoint: pastor 200 / miembro 403 / obispo 403; por defecto
  esconde las `RUTINARIAS` y con `todo=1` las muestra; filtro por persona;
  filtro por módulo; combinados; aislamiento entre iglesias; paginación
  (`hayMas`); actor anonimizado muestra "Usuario eliminado".
- Test de que `RUTINARIAS` solo contiene acciones que existen de verdad en el
  código (que la lista no envejezca en silencio).
- Manual (Pablo): entrar como pastor a Administración, abrir el registro,
  filtrar por `raquel`, marcar "mostrar también accesos" y ver los logins.
