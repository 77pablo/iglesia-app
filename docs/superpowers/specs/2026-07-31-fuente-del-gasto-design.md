# La fuente del gasto — Diseño

**Fecha:** 31 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado (Camino A, decisión ya tomada por el dueño); listo para plan de implementación
**Ampliado el 31 jul 2026** con la sección "El historial de correcciones, en la propia hoja" — la tarea que el dueño había decidido y quedaba sin escribir. Afecta a las Tasks 4 y 6 del plan; ver esa sección.

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
| **Que el rastro se VEA** *(decidido el 31 jul, ver sección propia)* | **`auditoria` gana dos columnas** (`ref_tabla`, `ref_id`) para poder preguntarle "las correcciones de esta hoja", y la hoja muestra su historial | Meter el id dentro del `detalle` y buscar por texto (frágil: cualquiera que reescriba la redacción lo rompe en silencio, y no usa índices); una tabla propia del módulo (aislada, pero escribe el mismo hecho dos veces y no sirve a ningún otro módulo); una pantalla de auditoría general (trabajo aparte y mayor) |
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

Cuando se escribió este párrafo por primera vez decía, con razón, que **nadie
veía esa tabla desde la pantalla**: `auditar()` guardaba el rastro en la base
de datos y solo se podía leer abriéndola por fuera. El dueño decidió el 31 de
julio que eso no basta — quiere ver las correcciones en la propia hoja — así
que **eso ya no es cierto**: ver la sección "El historial de correcciones, en
la propia hoja" más abajo, que es parte de este mismo diseño.

Lo que sí sigue siendo cierto es el alcance: **no se construye una pantalla de
auditoría general.** Lo que se ve es el historial de correcciones **de una
hoja**, dentro de esa hoja. `crear_org`, `editar_org`, `borrar_org` y
`duplicar_org` siguen escribiendo en `auditoria` sin que ninguna pantalla los
muestre, exactamente como hoy.

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

## El historial de correcciones, en la propia hoja

*(Añadido el 31 jul 2026, decisión del dueño. Esto es lo que faltaba por
escribir del plan.)*

Guardar el rastro y no enseñarlo no cumple lo que se pidió. Lo que el dueño
quiere ver, en la hoja, es esto:

> **Correcciones**
> Abel · "Pan" $12.000 → "Pan" $8.000 · 3 ago
> María · "Carne" $30.000 → "Carne" $28.500 · 1 ago

### El problema que hay que resolver primero

`auditoria` (`db.js:220-228`) tiene `iglesia_id`, `actor_id`, `accion`,
`modulo`, `detalle` y `fecha`. **No guarda a qué registro se refiere cada
apunte** — solo un `detalle` de texto libre. No hay forma limpia de pedir "las
correcciones de la hoja 7".

### La solución elegida: dos columnas de referencia

`auditoria` gana `ref_tabla TEXT` y `ref_id INTEGER`, aditivas por el mismo
`agregarColumna()` de siempre, más un índice sobre el par `(ref_tabla, ref_id)`.
Ambas nacen `NULL` para las filas históricas.

`auditar()` (`auth.js:186-190`) gana un **sexto parámetro opcional al final**.
Los ~40 sitios que ya la llaman **no se tocan**: siguen compilando igual,
siguen funcionando igual y escriben `NULL` en las dos columnas nuevas. La única
llamada que lo usa por ahora es la corrección de un gasto.

Se eligió esto sobre las dos alternativas por una razón que va más allá de esta
hoja: el día que cualquier otro módulo quiera mostrar su propio historial, la
estructura ya está y no hay que volver a inventarla. Las alternativas
descartadas y por qué están en la tabla de decisiones.

### La referencia apunta a la HOJA, no al gasto

`ref_tabla = 'evento_org'`, `ref_id =` el id de la hoja.

Es deliberado y es el punto fino de este diseño: **si mañana se borra el gasto,
su corrección sigue apareciendo en el historial de la hoja.** Si la referencia
apuntara al gasto, el rastro quedaría huérfano justo en el caso en que más
importa — alguien corrige un monto y después borra la línea entera.

### Cómo se lee

La hoja ya viaja en una sola respuesta (`armarHoja`), así que el historial viaja
con ella; no hace falta una ruta nueva ni una segunda petición. La consulta se
acota por `ref_tabla`, `ref_id` **y `iglesia_id`**, con `JOIN persona` sobre
`actor_id` para tener el nombre de quien corrigió.

Quien puede ver el historial es quien puede ver la hoja: no se añade ningún
permiso nuevo.

### Dos cosas que esto cambia del plan ya escrito

No son efectos colaterales imprevistos; son parte del trabajo y hay que
escribirlos en las tareas:

1. **La Task 4 escribe los montos sin formato** (`$12000`). Para que el
   historial se lea como el resto de la app (`$12.000`), la Task 4 pasa a
   formatearlos al escribir el `detalle`, con un ayudante de una línea dentro
   de `organizacion.js`. **Sin `toLocaleString`**: no se usa en ningún sitio del
   backend hoy (verificado: cero coincidencias en `backend/src/`) y haría
   depender el texto guardado de la configuración regional del servidor.
2. **Eso rompe a propósito una prueba de la Task 4**, la que busca `1000` en el
   `detalle`: pasa a buscar `1.000`.

Y la Task 6 (dejarlo en `ESTADO.md`) pierde uno de sus tres pendientes: el
rastro **ya** tiene pantalla.

### En el papel también

El historial sale también en la **🧾 Rendición impresa**, no solo en pantalla.
La rendición es el documento con el que se rinde cuentas ante la iglesia: si un
monto se corrigió, que se vea ahí es justamente el punto — nadie cambia una
cifra sin que quede dicho. Solo ocupa espacio si hubo correcciones.

### Seguridad

El `detalle` contiene **el concepto que tecleó una persona** (`"Pan"`), y el
nombre de quien corrigió sale de la base de datos. Los dos van con `escHtml`.

Merece decirse explícito porque el texto guardado **lleva comillas dobles
dentro** (`"Pan" $12.000 -> "Pan" $8.000`), que es exactamente el sitio donde
se cuelan los descuidos al interpolar en `innerHTML` o en un atributo. Un gasto
llamado `<script>…` se ejecutaría al abrir la hoja de cualquiera que la mire.

### Las fechas, otra vez UTC

`auditoria.fecha` es `datetime('now')`: **UTC**, igual que `creado_en`. Una
corrección hecha a las 21:00 hora de Chile mostraría el día siguiente si se
corta el texto sin convertir. Se usa el mismo ayudante de conversión al mostrar
que se introduce en el diseño de la bandeja del portal público
(`2026-07-31-bandeja-portal-publico-design.md`). **No se cambia lo que se
guarda** — ver la regla de la sección "Verificación del análisis previo": las
zonas horarias se arreglan al mostrar, no al guardar.

### Pruebas

- las columnas nuevas nacen `NULL` en todo lo histórico
- `auditar()` llamada **sin** el parámetro nuevo sigue escribiendo igual
  (retrocompatibilidad de los ~40 sitios que ya la usan)
- corregir un gasto deja la referencia apuntando a **la hoja**
- la hoja devuelve sus correcciones, con el nombre de quien corrigió
- un líder de **otra** iglesia no ve esas correcciones
- **borrar el gasto no borra su corrección** del historial de la hoja

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
- **No hay historial de versiones del gasto como objeto.** `auditoria` es
  append-only, así que cada corrección deja su propia fila y el historial de la
  hoja las muestra todas, en orden — no solo la última. Lo que no existe es
  poder pedirle a la app "cómo estaba este gasto el 2 de agosto" y que lo
  reconstruya sola: eso se lee encadenando los "antes → después" a ojo. Si
  alguna vez hace falta reconstruirlo de verdad, es una tabla de versiones
  propia y un replanteo, no un ajuste de esto.
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
| `GET /api/organizacion/:id` y `GET /api/organizacion/evento/:eventoId` | La hoja devuelve `total_caja`, `por_devolver` y `aportes_donados` en vez del único `aportes` de hoy, **y además `correcciones`** (el historial de esa hoja) |

**Sin migración de datos, aditiva:** una columna nueva en `evento_org_gasto` y
dos en `auditoria` (`ref_tabla`, `ref_id`), todas vía el mismo
`agregarColumna()` que ya usa el resto de `db.js`, más un índice sobre
`(ref_tabla, ref_id)`. Ninguna fila existente cambia de valor.

**`auditar()` cambia de firma de forma retrocompatible:** un sexto parámetro
opcional al final. Ninguno de los ~40 sitios que ya la llaman se toca.

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

> **Nota:** este apartado decía que el rastro no se veía desde ninguna
> pantalla. Con la sección "El historial de correcciones, en la propia hoja"
> eso quedó resuelto, y el riesgo es ahora otro.

**El historial solo cuenta lo que pasó por el `PATCH`.** Un gasto que se
**borra** no deja nada (`DELETE` sigue sin auditar, a propósito, ver "Fuera de
alcance"), y un gasto que se borra y se vuelve a crear con otro monto es, para
el historial, un gasto nuevo sin correcciones. Quien quiera esquivar el rastro
tiene esa puerta abierta.

No se cierra aquí por coherencia: en este módulo **ningún** ítem (ni las cosas
ni los gastos) deja rastro al crearse o borrarse, y auditar solo el borrado del
gasto sería un parche asimétrico. Si se decide auditar el nivel de ítems, va
parejo para cosas y gastos, crear y borrar — y es un cambio aparte.

Segundo riesgo, menor: **el `detalle` es texto libre y el historial lo muestra
tal cual se guardó.** Si alguien cambia la redacción de ese texto en el futuro,
las correcciones viejas se seguirán viendo con la redacción antigua y las
nuevas con la nueva. Es aceptable —el texto sigue siendo legible— pero conviene
saber que no hay forma de re-formatear lo ya escrito.
