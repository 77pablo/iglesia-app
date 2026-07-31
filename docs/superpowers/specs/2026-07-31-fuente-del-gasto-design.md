# La fuente del gasto — Diseño

**Fecha:** 31 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado (Camino A, decisión ya tomada por el dueño); listo para plan de implementación

## De qué se trata

Cuando un líder organiza un almuerzo o un paseo, la hoja de **Organización** anota
los gastos con un concepto, un monto y **una persona: quien puso el dinero**
(`backend/src/organizacion.js:326-344`). Con eso arma un resumen, "Quién puso
qué", que es lo que el líder mira al final para saber a quién devolverle cuánto
(`organizacion.js:87-91`, `web/app.js:4054-4061`).

El problema: en la iglesia el dinero no siempre sale del bolsillo de alguien
que espera que se lo devuelvan. Pasan tres cosas distintas:

- El pastor **adelanta plata de la caja** de la iglesia.
- Alguien pone de su bolsillo **y se le devuelve**.
- Alguien pone de su bolsillo **y no quiere que se le devuelva** — es un aporte.

Hoy la casilla "quién puso el dinero" solo sabe expresar la segunda. Ejemplo:
el pastor entrega $30.000 en efectivo para la carne, la líder pone $8.000 de
las bebidas (se le devuelven) y doña Rosa pone $4.000 del pan (no quiere nada
de vuelta). Hoy esas tres líneas solo se pueden anotar como si las tres
personas hubieran puesto plata a devolver: el resumen diría "devolver $38.000
a la líder y $4.000 a Rosa", cuando lo real es "devolver $8.000 a la líder, a
Rosa nada, y $30.000 ya salieron de la caja". Eso no es un bug de programación,
es que **falta una casilla**.

## Verificación del análisis previo

El documento de partida
(`fuente-del-gasto-opciones.md`) acertó en casi todo lo que importa a esta
decisión. Dos matices que corrijo, comprobados leyendo el código:

**a) "Borrar un gasto no deja auditoría, a diferencia de casi todo lo demás del
módulo" — está exagerado.** Es cierto que `DELETE /organizacion/gastos/:id`
no llama a `auditar()` (`organizacion.js:346-353`). Pero **tampoco lo hacen**
crear una cosa, editar una cosa, borrarla, ni crear un gasto
(`organizacion.js:254-260, 271-312, 314-321, 332-344`). Lo único que se audita
en este módulo es el nivel de la **hoja**: crearla, editarla, borrarla,
duplicarla (`organizacion.js:135, 182, 200, 236`). Los gastos y las cosas,
como conjunto, nunca dejaron rastro de nada — no es que el borrado de gastos
sea la excepción, es que los ítems de la hoja son la excepción entera.

**b) El desfase de horario es real y hay que respetarlo, no arreglarlo aquí.**
`evento_org_gasto.creado_en` guarda `datetime('now')`, que en SQLite es **UTC**
(`db.js:135`). `movimiento.fecha`, en Tesorería, guarda
`date('now','localtime')`, hora de Chile (`db.js:276`). Este diseño no cruza
esas dos tablas — sigue sin tocar Tesorería — así que el desfase no se activa
aquí. Se deja anotado porque el plan toca `evento_org_gasto` y alguien podría
sentirse tentado a "aprovechar y arreglarlo": no, ese arreglo es un problema
aparte y esta app ya tuvo cinco fallos por tocar zonas horarias sin que
tocaran.

El resto del análisis se sostiene: los aportes de hoy son un `GROUP BY
pagado_por` sin tabla propia (`organizacion.js:87-91`), no se puede crear un
gasto sin persona por la app (`organizacion.js:335`, así que los `NULL`
históricos son un conjunto cerrado), y al anotar un gasto no se comprueba que
la persona esté activa, a diferencia de las cosas a llevar
(`organizacion.js:282-284` sí comprueba `activo=1`; `338-339` no).

## Decisiones tomadas (31 jul 2026)

| Decisión | Elegido | Descartado |
|---|---|---|
| Camino | **A — una casilla más por gasto**, con condición de poder corregir | B (+ "ya se devolvió"), C (puente con Tesorería), D (modelar el adelanto) — quedan escritos como pasos futuros posibles. D en particular se descarta porque el dueño confirmó que la caja adelanta en 0-2 de cada 10 eventos: no es el caso mayoritario, así que modelar "el sobre" completo sería trabajo de más para lo que hoy es la excepción |
| Semántica de la casilla nueva | Columna `fuente` con 3 valores: `caja` · `devuelve` · `aporte` | Reciclar `pagado_por IS NULL` para significar "pagó la iglesia" — choca con los `NULL` históricos, que significan "no se sabe quién puso" |
| Corregir un gasto | **Sí, con `PATCH`**, condición explícita del dueño | Dejarlo fijo una vez anotado; borrar y volver a crear (pierde lo poco de historia que hay) |
| Dónde vive el rastro de la corrección | La tabla `auditoria` que ya existe, vía `auditar()` — mismo mecanismo que usa el resto de la app | Una tabla de historial de gastos (antes/después por versión) — más trabajo del que pide la decisión ya tomada |
| Fuente por defecto de un gasto viejo | `fuente = NULL` = "de antes de esta casilla, no se especificó" (igual que hoy con `pagado_por` histórico) | Asumir `devuelve` o `caja` para lo ya guardado — inventaría un dato que nadie anotó |
| Comprobar que la persona esté activa al anotar un gasto | Fuera de alcance, sigue como hoy | Arreglarlo de paso, ya que se toca el archivo — es un bug aparte, no de esta decisión |

## Qué ve el líder en pantalla

Donde hoy hay un desplegable "Lo puse yo / lista de personas"
(`web/app.js:4110-4112`), aparece una opción nueva arriba — **"La caja de la
iglesia"** — y, al lado, un segundo desplegable chico que solo se muestra
cuando se eligió una persona: **"Se devuelve"** / **"Es un aporte"**.

Cada línea de gasto ya anotado muestra su fuente:

> Carne — $30.000 · pagó la caja de la iglesia
> Bebidas — $8.000 · puso Carolina (se le devuelve)
> Pan — $4.000 · puso Rosa (aporte, no se devuelve)

Y el resumen de abajo, que hoy es una sola lista ("Quién puso qué"), pasa a
tener tres bloques, en vez de mezclar en uno lo que son cosas distintas:

> Pagó la caja de la iglesia — $30.000
> Por devolver: Carolina — $8.000
> Aporte donado: Rosa — $4.000
> *(si hay gastos de antes de esta casilla)* Sin registrar quién puso — $X

Cada gasto de la hoja gana un botón **✏️ Corregir** junto al de borrar (✕), que
reabre las mismas casillas del alta, ya llenas, para arreglar el concepto, el
monto o la fuente equivocada.

## Cómo se modela la fuente del gasto

Una columna nueva, `evento_org_gasto.fuente TEXT`, migrada de forma aditiva
igual que se hizo con `pagado_por` (`db.js:567-568, 584`). Tres valores
posibles: `'caja'` · `'devuelve'` · `'aporte'`. `NULL` es el estado de
**"no especificado"**.

**Cómo se relaciona con `pagado_por` (la casilla que ya existe):**

| `fuente` | `pagado_por` | Significa |
|---|---|---|
| `'caja'` | siempre `NULL` | Pagó la caja de la iglesia; no hay persona |
| `'devuelve'` | una persona | Esa persona puso el dinero y se le debe devolver |
| `'aporte'` | una persona | Esa persona puso el dinero y no se le devuelve |
| `NULL` | una persona | De antes de esta casilla — se interpreta como "por devolver" (es lo que ya significaba `pagado_por` antes de que `fuente` existiera; no cambia) |
| `NULL` | `NULL` | Gasto anterior al propio `pagado_por` (`db.js:584`) — "no se sabe quién puso", conjunto cerrado |

El punto que evita reciclar el hueco de `pagado_por`: cuando paga la caja,
`pagado_por` también queda `NULL`, pero **el significado no sale de ahí, sale
de `fuente = 'caja'`**. La fila con `fuente = 'caja'` y la fila histórica con
`fuente = NULL` tienen el mismo `pagado_por` vacío y significan cosas
distintas — porque ahora hay una columna aparte que las distingue. No es
reciclar el hueco, es dejar de necesitar mirarlo solo.

**El resumen ("Quién puso qué") deja de ser un único `GROUP BY` y pasa a ser
tres consultas**, una por bloque:

- `total_caja` — `SUM(monto)` de los gastos con `fuente = 'caja'`.
- `por_devolver` — `GROUP BY pagado_por` de los gastos con persona y
  `fuente IN ('devuelve', NULL)` (esto último para que los gastos de antes de
  la casilla sigan contando como "hay que devolver", que es lo que ya
  significaban).
- `aportes_donados` — `GROUP BY pagado_por` de los gastos con
  `fuente = 'aporte'`.

Lo que no cae en ninguno de los tres (gastos con `pagado_por` y `fuente` ambos
`NULL`, el conjunto cerrado más antiguo) se sigue mostrando aparte como "Sin
registrar quién puso", calculado por diferencia con el total — exactamente
como hoy (`web/app.js:4051-4060`).

## Cómo se corrige un gasto, y dónde vive el rastro

Se agrega `PATCH /api/organizacion/gastos/:gastoId`, con el mismo patrón
`PATCH` parcial que ya usan la hoja y las cosas
(`organizacion.js:172-184, 271-312`): los campos que no vienen no se tocan.
Acepta `concepto`, `monto`, `pagado_por` y `fuente`.

**El rastro vive en la tabla `auditoria` que ya existe**, con
`auditar(iglesia_id, actor_id, 'editar_gasto', 'organizacion', detalle)`
(`auth.js:186-190`). Esa tabla ya guarda **quién** (`actor_id`) y **cuándo**
(`fecha`, con default automático) para cada acción que la llama; es el mismo
mecanismo que usa el resto de este módulo para crear/editar/borrar/duplicar la
hoja. El `detalle` describe qué cambió (concepto y monto, antes → después),
igual que otras acciones auditadas de la app dejan un resumen legible.

Es "lo más simple que cumple" la condición del dueño, y punto honesto que hay
que decir: **hoy nadie ve esta tabla desde la pantalla.** No existe ninguna
vista de auditoría en `web/app.js`, y ninguna ruta del backend expone un
listado de `auditoria` (verificado: cero coincidencias de una vista de
auditoría en el frontend). Esto no es una carencia nueva de este diseño — es
exactamente como ya funcionan `crear_org`, `editar_org`, `borrar_org` y
`duplicar_org` hoy — pero significa que "queda escrito" hoy es literal:
queda escrito en la base de datos, consultable por quien tenga acceso a ella,
no por el pastor abriendo una pantalla. Si en algún momento se quiere que el
pastor pueda *ver* quién corrigió qué, eso es una pantalla nueva sobre una
tabla que ya existe — no un cambio de este diseño.

**Reglas de la corrección**, para que la fuente y la persona no queden
contradictorias:

- Si el `PATCH` deja (o pone) `fuente = 'caja'`, `pagado_por` se fuerza a
  `NULL` sin importar qué se haya mandado — pagó la caja, no hay persona.
- Si la `fuente` final es `'devuelve'` o `'aporte'`, tiene que quedar una
  persona: si no viene `pagado_por` en el `PATCH` se conserva la que ya
  tenía el gasto; si al final no hay ninguna, **400** — no puede quedar "se
  devuelve" sin nadie a quien devolverle.
- Igual que al crear, la persona debe ser de la misma iglesia
  (`organizacion.js:338-339`). No se agrega la comprobación de activa —
  sigue fuera de alcance, ver tabla de decisiones.

**Quién puede corregir:** lo mismo que hoy edita cualquier cosa de la hoja
— el creador de la hoja o el pastor (`puedeEditarOrg`,
`organizacion.js:63-65`). No un permiso nuevo.

## Qué pasa con los gastos ya guardados

Nada. La columna `fuente` nace `NULL` para toda fila existente — es
exactamente el mismo mecanismo aditivo que ya se usó para `pagado_por`
(`db.js:567-568`). Ningún gasto guardado cambia de valor, ninguna hoja deja de
abrir, y el resumen sigue mostrando "Sin registrar quién puso" para lo que de
verdad no tiene dueño. Es un conjunto cerrado que solo puede achicarse
(`organizacion.js:335`: hoy es imposible crear un gasto sin persona por la
app), y con esta casilla tampoco se agranda: nadie puede volver a producir un
gasto con `pagado_por` y `fuente` ambos `NULL` a partir de esta función.

## Fuera de alcance, a propósito

- **Tesorería no se toca.** Los gastos de la hoja siguen sin aparecer en el
  libro del tesorero, sea cual sea su fuente. Sigue siendo el Camino C
  (rendición) el que resolvería eso, y no está decidido.
- **No se registra si ya se devolvió el dinero.** El bloque "Por devolver"
  dice cuánto se debe hoy, para siempre — no hay fecha ni casilla de "ya se
  le pagó". Es el Camino B, no decidido.
- **No se comprueba que la persona esté activa** al anotar o corregir un
  gasto, aunque sí se comprueba en las cosas a llevar
  (`organizacion.js:282-284`). Bug preexistente, no de esta decisión.
- **No hay historial de versiones de un gasto** (qué decía antes de cada
  corrección) — solo el resumen del último cambio en `auditoria`. Si algún
  día hace falta reconstruir cada edición, hay que replantear esto con una
  tabla de historial propia.
- **La zona horaria de `creado_en` no se toca** (sigue en UTC, ver
  "Verificación" arriba). No se agrega ninguna fecha nueva a `evento_org_gasto`
  que pudiera introducir el mismo problema.
- **No se avisa a nadie** cuando un gasto se corrige (ni push, ni
  notificación in-app). El resumen simplemente se ve distinto la próxima vez
  que alguien abra la hoja.
- **Borrar un gasto sigue sin auditar**, a propósito: solo se agrega
  auditoría a la corrección (`PATCH`), que es la condición explícita del
  dueño. `DELETE /organizacion/gastos/:id` queda exactamente como hoy — sin
  rastro, igual que crear/editar/borrar una cosa de la hoja (ver
  "Verificación del análisis previo"). Si más adelante se decide auditar todo
  el nivel de ítems (cosas y gastos, crear y borrar), es un cambio aparte y
  parejo para los dos, no un parche solo al gasto.

## Forma técnica

| Endpoint | Cambia |
|---|---|
| `POST /api/organizacion/:id/gastos` | Acepta `fuente` opcional (`'caja'` \| `'devuelve'` \| `'aporte'`); si no viene, se comporta exactamente como hoy |
| `PATCH /api/organizacion/gastos/:gastoId` | **Nuevo.** Corrige `concepto`, `monto`, `pagado_por` y/o `fuente`; audita el cambio |
| `GET /api/organizacion/:id` y `GET /api/organizacion/evento/:eventoId` | La hoja devuelve `total_caja`, `por_devolver` y `aportes_donados` en vez del único `aportes` de hoy |

**Sin migración de datos, aditiva:** una columna nueva en `evento_org_gasto`
vía el mismo `agregarColumna()` que ya usa el resto de `db.js`.

**Aislamiento entre iglesias:** el `PATCH` nuevo resuelve el gasto acotado por
`iglesia_id` en la **misma** consulta (`JOIN evento_org` en el `WHERE`), no en
una comprobación posterior — el resto del módulo ya tiene el hábito de resolver
el ítem sin ese acotador y dejar que un segundo `SELECT` (`hojaEditable`) lo
filtre después; sigue siendo seguro porque ese segundo `SELECT` sí filtra por
iglesia, pero la ruta nueva no repite ese patrón: se ata a la iglesia desde el
primer `SELECT`.

## Validación (zod)

Mensajes en castellano **dentro del esquema**, que es de donde los toma el
middleware `validar()` cuando no vienen vacíos (`seguridad.js:162-169`). En
zod 4 el parámetro para el mensaje de un enum es `error`, **nunca `errorMap`**
— ya hay un caso real de este proyecto donde `errorMap` se ignoró en silencio
(`registro.js:23-26`).

## Riesgo conocido

**El rastro de la corrección no es visible desde ninguna pantalla, solo desde
la base de datos.** `auditar()` escribe correctamente quién y cuándo, pero
"quién puede corregir un gasto" es exactamente "quien puede editar la hoja" —
el creador o el pastor —, y si el creador se equivoca dos veces y lo corrige
dos veces, nadie lo va a notar sin mirar la tabla `auditoria` a mano. Esto no
es peor que el resto de la app hoy (nada de este módulo se ve desde una
pantalla de auditoría), pero es la primera vez que se le pide *explícitamente*
que deje rastro por una condición del dueño, así que vale la pena decirlo
claro: si el uso real demuestra que hace falta que alguien lo *vea*, es una
pantalla nueva, no un cambio a este diseño.
