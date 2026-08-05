# Pulido de agosto — cinco cabos chicos que ya estaban anotados

**Fecha:** 5 de agosto de 2026
**Rama:** `feat/pulido-agosto`
**Estado:** aprobado por el dueño (decisiones tomadas el 5-ago)

## Por qué esta tanda

Cinco pendientes chicos, todos ya anotados en `ESTADO.md`, que juntos caben en una
rama corta. Ninguno cambia el comportamiento de fondo de la app; cada uno cierra
una mentira, un ruido o un cabo suelto documentado.

## Decisiones del dueño (5-ago)

1. **El punto de sin-leer pasa a rojo**, el mismo del badge que representa.
   Mismo dato, mismo color: quien aprende "rojo = mensajes sin leer" lo
   reconoce en los dos sitios.
2. **Un tema con una sola entrada no lleva encabezado:** la entrada se pinta
   suelta en el menú, en el lugar del tema. Un toque menos, y no hay acordeón
   de un solo elemento.

## 1. El punto de sin-leer: rojo y con nombre accesible

**Hoy:** un tema cerrado con mensajes pendientes muestra un punto dorado en su
encabezado (`.nav-sec.con-sin-leer::after`, `web/styles.css` — la regla vive solo
en el `@media` del móvil). Es un `::after` con `content:""`: un lector de
pantalla no anuncia nada. Pendientes 5 y 6 de la sección del menú en `ESTADO.md`.

**⚠️ Corrección al planificar (5-ago):** la mitad del pendiente estaba
desfasada. `marcarGrupoConSinLeer()` (`web/app.js:812-829`) **ya pone y quita
el `aria-label`** ("Tema — mensajes sin leer"), y `menu-plegable.test.js`
(`:598-626`) **ya lo asierta**, puesto, quitado y contra estado obsoleto. Lo
trajo la reescritura del menú del 3-ago y el pendiente 5 de `ESTADO.md` nunca
se tachó. Es la enésima lista de pendientes que envejeció sin avisar.

**Diseño (lo que de verdad queda):**
- El punto pasa de `var(--gold)` a `var(--red)` (el badge usa `var(--red)`,
  `styles.css:247`). Es un cambio de una palabra en `styles.css:425`.
- Y un candado nuevo: una aserción que fija que la regla del punto usa
  `var(--red)`, para que color del punto y color del badge no vuelvan a
  divergir en silencio.
- No se toca el badge, ni `Chat._sinLeer`, ni `marcarGrupoConSinLeer`.

**Prueba:** aserción nueva en `menu-plegable.test.js` sobre la regla
`.nav-sec.con-sin-leer::after` del `@media` del móvil (leyendo la fuente CSS;
sin `.` que cruce `\r\n`, lección anotada en `ESTADO.md`).

## 2. El rótulo "(cuenta inactiva)" que miente mientras carga el directorio

**Hoy:** punto 7 de los pendientes de la fuente del gasto. El selector de
"quién pagó" inyecta una opción provisional con rótulo "(cuenta inactiva)"
mientras `/directorio` no responde. Al llegar la respuesta solo se reconcilia
si la inyectada es la opción **seleccionada**; si la persona cambió el selector
a mano mientras tanto, la inyectada queda en la lista con el rótulo falso y el
nombre duplicado. No mueve dinero (elegirla da el id correcto), pero es un
rótulo mentiroso en una pantalla de plata.

**Diseño:** la solución que el propio pendiente dejó escrita: al llegar
`/directorio`, la opción inyectada se quita **siempre que su gemela real (mismo
id) ya esté en la lista**, conservando `sel.value`. Si la inyectada era la
seleccionada, la selección pasa a la gemela real (mismo `value`, así que
conservar `sel.value` basta). No se toca el caso donde la persona de verdad
está inactiva: ahí el rótulo es verdad y se queda.

**Prueba:** la lógica se extrae a una función nombrada para poder ejecutarla en
el arnés de documento simulado (mismo patrón que `marcarGrupoConSinLeer`);
si al escribir el plan resulta que el código no se deja extraer sin reescribir
media pantalla, la comprobación queda manual y se anota en `ESTADO.md`, como se
hizo con la mitad de frontend de corregir-nombre.

## 3. Puertos de test dinámicos

**Hoy:** `upload-validacion.test.js` fija `PORT = 3941` y `seguridad.test.js`
fija el 3931, con un comentario que ya documenta el reparto a mano. Dos corridas
a la vez se pisan y el síntoma ("El servidor de pruebas no respondio a tiempo")
no dice nada de la causa. Pasó hoy mismo: una corrida dio fallos falsos y la
siguiente pasó limpia. Hueco anotado en `ESTADO.md` el 30-jul.

**Diseño:** nace `backend/test/puerto-libre.js`: le pide al sistema un puerto
libre (`net.createServer().listen(0)` → leer el puerto → cerrar) y lo devuelve.
Los dos tests lo usan en vez del número fijo; `BASE` se construye después de
obtenerlo. No se toca ningún código de producción. La ventana de carrera entre
"cerrar el socket" y "arrancar el hijo" existe y se acepta: es órdenes de
magnitud más chica que el choque determinista de hoy.

**Prueba:** la suite entera en verde es la prueba; además las dos suites deben
poder correr a la vez (`node --test test/upload-validacion.test.js` y
`test/seguridad.test.js` lanzados juntos) sin pisarse.

## 4. Limpieza de lo muerto

**Hoy:** anotado el 30-jul: la tabla `recurso` tiene cero referencias (nada la
escribió jamás — no confundir con `recurso_grupo` ni `predica_recurso`, que sí
se usan), y `dispositivo_push` es legacy del push viejo pero su endpoint de
escritura `POST /api/dispositivo` (`server.js:350`) sigue vivo y expuesto.
Verificado hoy: nada en `web/` llama a `/api/dispositivo`; el push real usa
`push_sub`.

**Diseño:**
- `recurso`: fuera su `CREATE TABLE` de `db.js`, fuera su mención de la lista
  de reseteo de `seed.js`, y una migración de una sola vez hace
  `DROP TABLE IF EXISTS recurso` (guardada como las demás migraciones
  idempotentes de `db.js`). Borrar una tabla que por construcción está vacía
  no pierde nada.
- `POST /api/dispositivo`: se elimina el endpoint y su `dispositivoSchema`.
  La tabla `dispositivo_push` **se queda**: puede tener filas viejas en
  producción y el borrado ARCO (`cuenta.js:200`) ya la limpia. Solo muere la
  puerta de escritura. Se quita su fila de `backend/README.md`.
  `INFORME-SEGURIDAD.md` no se toca: es un informe histórico.

**Prueba:** `POST /api/dispositivo` con token válido → 404. Y una consulta a
`sqlite_master` en una BD recién creada: `recurso` no existe,
`dispositivo_push` sí.

## 5. Un tema con una sola entrada se pinta suelto

**Hoy:** pendiente 7 de la sección del menú: al líder de cuerpo se le pinta el
encabezado "Pastoreo" con una sola entrada debajo (Asistencia). La regla
descarta grupos vacíos, no grupos de uno.

**Diseño:** en `buildNav()` (camino móvil), un grupo que queda con **una** sola
entrada tras filtrar por rol se pinta como entrada suelta — sin `<button
class="nav-sec">`, sin contenedor, sin acordeón — en la posición donde iría el
tema. Grupos vacíos siguen desapareciendo. El acordeón, el rescate de foco y
`vigilarAnchoDelMenu()` no cambian: una entrada suelta se comporta como las del
menú corto plano, que ya existen.

**Caso cruzado con el punto 1:** si la entrada `mensajes` quedara suelta, no hay
encabezado que marcar — `marcarGrupoConSinLeer` ya maneja "no hay contenedor"
devolviéndose temprano, y el badge de la entrada se ve directo, que es mejor.
Hoy `mensajes` vive en un grupo grande y esto no ocurre con los roles del seed;
el caso queda cubierto por la forma de la función, no por un dato de hoy.

**Prueba:** el arnés que ya ejecuta `buildNav()`/`agruparNav()` en
`menu-plegable.test.js`: un juego de módulos donde un grupo queda con una
entrada debe producirla suelta (sin `nav-sec` para ese tema), y el resto de
grupos intactos.

## Fuera de alcance, a propósito

- Nada del menú de **escritorio** cambia (sigue plano).
- No se toca `push_sub` ni ninguna parte del push vigente.
- No se borra la tabla `dispositivo_push` (datos reales posibles en producción).
- El umbral `NAV_UMBRAL_GRUPOS = 12` y el reparto de `GRUPOS_NAV` quedan igual.
- Los otros pendientes del menú (dos personas ven estructuras distintas, umbral
  elegido y no medido) siguen abiertos y anotados.

## Orden sugerido de tareas

1. Puertos dinámicos (independiente, des-ruida la suite para el resto).
2. Limpieza de lo muerto (backend puro, tests directos).
3. Punto rojo + `aria-label`.
4. Grupo de uno suelto.
5. Rótulo "(cuenta inactiva)".

Cada tarea con su commit; suite en verde entre tarea y tarea.
