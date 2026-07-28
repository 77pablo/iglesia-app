# Organización de eventos v2 — Diseño

**Fecha:** 28 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** propuesta; hay decisiones de producto pendientes (ver el final)
**Antecedente:** `2026-07-24-organizacion-eventos-design.md` (v1, implementada)

## De qué se trata

v1 dejó seis cosas explícitamente fuera: responsable por línea, costo por línea,
plantillas de listas, export a PDF, notificaciones "trae tu parte" e integración
con Tesorería. Este documento las evalúa una por una con criterio de producto,
descarta tres, propone dos sustitutos más baratos, y diseña lo que queda.

## El diagnóstico

v1 funciona, pero mirada desde una iglesia real que organiza un almuerzo de
jóvenes, **la hoja hoy no sale del teléfono del líder**. El feligrés común recibe
403 en todo el módulo (`r.use` con `esLiderOAdmin`, `organizacion.js:17`). La
hoja dice "jugos néctar ×5" pero no dice quién los trae, y aunque lo dijera, esa
persona no podría verlo. En la práctica el líder sigue escribiendo la lista en
WhatsApp y coordinando ahí; la hoja queda como su cuaderno privado.

Eso reordena la prioridad de las seis pendientes:

- **Responsable por línea** y **notificaciones "trae tu parte"** no son dos
  funcionalidades: son una sola. Asignar sin avisar no sirve de nada, y avisar a
  alguien que no puede abrir la hoja tampoco. Juntas son la razón de ser del
  módulo.
- **Costo por línea** es útil pero secundario, y como está enunciado resuelve un
  dolor menor que el que sí duele de verdad (§ *Quién puso el dinero*).
- **Plantillas** y **export a PDF** son formas caras de resolver necesidades que
  tienen soluciones de una hora. Se descartan como están enunciadas y se
  proponen sustitutos.
- **Integración con Tesorería** se descarta, y no por costo: choca de frente con
  el modelo de permisos de `tesoreria.js` y con la decisión de v1 de que este
  dinero no es dinero de la iglesia.

---

## 1. Responsable por cosa, aviso y "Mi parte"  ← lo que hay que construir

La pieza central. Todo lo demás es accesorio comparado con esto.

### La decisión de arquitectura: abrir una rendija, no la puerta

El obstáculo real no es la columna `responsable_id`: es que el responsable pueda
ver lo suyo sin que se le abra la hoja entera. La hoja contiene **gastos**, y v1
decidió a propósito que los gastos solo los ven los líderes. Abrir la hoja a los
miembros para que vean qué traer sería revertir esa decisión de rebote.

La solución es un **par de rutas nuevas, registradas ANTES del gate de líderes**,
que devuelven exclusivamente lo asignado a quien pregunta:

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/organizacion/mis-cosas` | Solo las cosas donde `responsable_id = yo`. Devuelve `nombre, cantidad, listo` + el título/fecha/`hora_llegada` de la hoja + título y lugar del evento. **Nunca** gastos, totales ni las cosas de otros. |
| PATCH | `/api/organizacion/mis-cosas/:cosaId` | Solo `{ listo }`. Autoriza por `responsable_id === persona_id`, no por `hojaEditable`. |

Detalle de implementación que hay que respetar: en Express el `r.use` del gate
corre por orden de registro, así que estas dos rutas van **arriba del archivo**,
antes del middleware de visibilidad y antes de `GET /:id` (que hoy haría
`Number('mis-cosas') → NaN` y respondería 404, pero conviene no depender de eso).

Con esto, el feligrés sigue sin poder listar hojas, abrir hojas ajenas ni ver un
peso de gastos. Solo ve su línea.

### Modelo de datos

Dos columnas idempotentes sobre la tabla que ya existe, con el helper
`agregarColumna` de `db.js:558`:

```js
agregarColumna('evento_org_cosa', 'responsable_id', 'INTEGER REFERENCES persona(id)');
agregarColumna('evento_org_cosa', 'asignada_en',    'TEXT');
```

Sin tablas nuevas. `asignada_en` sirve para no re-notificar y para el recordatorio.

### De quién se elige el responsable

La pregunta tiene trampa: **la mitad de las hojas no tiene grupo**. Una hoja
suelta (`evento_id IS NULL`) no cuelga de ningún evento y por tanto de ningún
`grupo_id`, así que "elegir de los miembros del grupo" no está definido para
ellas. Y en una iglesia real, el almuerzo de jóvenes lo abastece gente que no
está formalmente en el grupo "Jóvenes" de la app: la señora que trae la torta, el
papá que presta el auto. Restringir al grupo produce "no encuentro a Fulanita" el
primer día de uso.

**Recomendación:** el universo válido es **cualquier persona activa de la
iglesia** — la misma validación que ya usa `asignaciones.js:48`
(`persona WHERE id=? AND iglesia_id=? AND activo=1`). El backend valida eso y
nada más; el orden del selector es un asunto de interfaz: **primero los miembros
del grupo del evento, luego el resto, con buscador**. El caso común se resuelve
en un toque y el caso raro no queda bloqueado.

### Qué pasa cuando esa persona se va o se desactiva

- **Se va del grupo:** no pasa nada, y es lo correcto. El universo nunca fue el
  grupo, así que salirse no invalida el compromiso de traer los jugos.
- **Le desactivan la cuenta** (`activo = 0`, que es también lo que hace "eliminar
  mi cuenta" en `cuenta.js`): **no se toca el dato**. Nada de poner
  `responsable_id = NULL` con un hook: eso sería acoplar `cuenta.js` y `admin.js`
  a este módulo para borrar información en silencio. En su lugar, `armarHoja`
  hace `LEFT JOIN persona` y expone `responsable_nombre` y `responsable_activo`;
  la hoja pinta *"Ana (cuenta inactiva) — reasignar"*. Un aviso visible es mejor
  que una línea que aparece huérfana sin explicación. El selector filtra por
  `activo = 1`, así que este estado solo puede aparecer después del hecho.
- **Borrado real de la persona:** solo ocurre al eliminar la iglesia entera
  (`eliminarIglesia.js`), que limpia huérfanos por `foreign_key_check`.
  `evento_org_cosa` no tiene `iglesia_id`, así que cae por huérfana igual que
  hoy — pero al añadir una FK nueva, el plan **debe** añadir una aserción de
  regresión al test de eliminar-iglesia (`PRAGMA foreign_key_check` limpio).

### Endpoints (además de los dos de arriba)

- `PATCH /cosas/:cosaId` — se amplía `editarCosaSchema` con
  `responsable_id: z.coerce.number().int().positive().nullable().optional()`
  (`null` explícito = desasignar; ausente = no tocar, igual que el resto de los
  campos del PATCH parcial de v1). Valida que la persona sea de la iglesia y esté
  activa; si no, 400.
- `GET /:id` y `GET /evento/:eventoId` — `armarHoja` añade `responsable_id`,
  `responsable_nombre`, `responsable_activo` a cada cosa.

### El aviso

Al pasar `responsable_id` de vacío (o de otra persona) a alguien, se notifica con
el patrón ya establecido en `asignaciones.js:61` y `grupo.js:234`: fila en
`notificacion` + `enviarPush(...).catch(()=>{})`.

```
📦 Traer: Jugos néctar ×5
Para "Almuerzo de jóvenes" · sáb 8 de agosto · llegar 12:30
```

**Solo cuando el responsable cambia de verdad.** Si el PATCH manda el mismo
`responsable_id`, o cambia el nombre o la cantidad de la línea, no se avisa: el
líder edita la lista muchas veces mientras la arma y no puede bombardear a la
gente.

### El recordatorio

`recordatorios.js` ya recorre asignaciones y eventos con dedupe por
`recordatorio_enviado`. Se añade un tercer generador, ~15 líneas, con clave
`org_cosa:<id>:dia-1`, sobre la fecha del evento o la `fecha` de la hoja suelta
(si es `NULL`, se omite). Esto es lo que hace que la función sirva: la gente
olvida, y el aviso del día que se asignó no alcanza.

### Interfaz

- **En la hoja (líder):** cada línea gana un chip "👤 Asignar". Al tocarlo, un
  modal con buscador: miembros del grupo del evento arriba, resto de la iglesia
  abajo. Asignada, la línea muestra el nombre; se puede reasignar o quitar.
- **En "Mi Servicio" (todos):** una sección nueva **"📦 Mi parte"**, igual que
  "Tareas de grupo". `vistaMiServicio` ya hace `Promise.all` con `safe()` sobre
  tres endpoints (`app.js:910`): se añade `safe(api('/organizacion/mis-cosas'))`
  como cuarto. Cada ítem muestra qué traer, para qué evento, la hora de llegada,
  y un botón "Ya lo tengo" → `PATCH /mis-cosas/:id { listo: true }`.
- **Nada de un apartado nuevo en el menú.** `mi_servicio` ya es visible para
  todos (`auth.js:98`) y es exactamente el lugar donde alguien va a mirar "qué me
  toca". Un módulo aparte sería un tercer buzón compitiendo con los otros dos.

---

## 2. Quién puso el dinero — la contrapropuesta a "costo por línea"

Antes de diseñar el costo por línea, vale nombrar el problema de plata que sí
existe en un almuerzo de jóvenes y que v1 no resuelve: **el líder puso de su
bolsillo la carne, otro puso las bebidas, y al final nadie sabe a quién hay que
devolverle cuánto.** `evento_org_gasto` guarda el concepto y el monto, pero no
quién lo pagó.

Es una columna:

```js
agregarColumna('evento_org_gasto', 'pagado_por', 'INTEGER REFERENCES persona(id)');
```

El `POST /:id/gastos` la acepta (opcional; por defecto, quien registra el gasto).
La hoja muestra *"Pan — $5.000 · puso Marta"* y, bajo el total, un resumen
*"Quién puso qué"* con un `GROUP BY pagado_por`. Permisos sin cambios: esto es
información de líderes y se queda en la hoja.

Una columna, un `GROUP BY`, y resuelve una discusión que en la vida real ocurre
cada vez. Mi recomendación es construirlo antes que el costo estimado.

---

## 3. Costo por línea, reencuadrado como presupuesto

La funcionalidad como fue enunciada ("costo por línea") tiene valor, pero el
valor no está en el costo: está en poder **estimar antes**. Hoy los gastos solo
registran lo que ya se gastó. Lo que el líder necesita saber la semana anterior
es "¿cuánto va a salir esto?" para decidir si cobra una cuota.

```js
agregarColumna('evento_org_cosa', 'costo_estimado', 'REAL');
```

`armarHoja` añade `total_estimado = COALESCE(SUM(costo_estimado), 0)`,
**calculado al leer y nunca persistido**, misma regla que `total_gastado`. La
cabecera de la hoja muestra *Estimado $X · Gastado $Y · Diferencia*.

**Decisión abierta:** ¿el costo es por unidad o por línea? Recomiendo **por
línea** (lo que cuesta ese ítem en total). Un líder piensa "las empanadas salen
30 lucas", no "cada empanada sale mil"; y multiplicar por `cantidad` da resultados
absurdos cuando la cantidad cuenta objetos que no se compran ("sillas ×20").

**Riesgo a mitigar con texto, no con código:** la gente va a contar dos veces
—poner el costo en la línea *y además* registrar el gasto—. Las etiquetas deben
separar con claridad **"Presupuesto (estimado)"** de **"Gastos (real)"**. Si el
dueño no confirma que los líderes efectivamente presupuestan antes, esta pieza
puede quedarse sin construir sin que se note.

---

## 4. Plantillas → "Duplicar lista"

**Se descarta la funcionalidad como está enunciada.** Un sistema de plantillas
—catálogo con nombre, CRUD, aplicar sobre una hoja nueva— es una tabla, cuatro
endpoints y una vista, para una iglesia que hace tres o cuatro eventos de este
tipo al año. La necesidad real ("el año pasado hicimos esta misma lista") se
cubre en un 90% con un botón:

`POST /api/organizacion/:id/duplicar` → crea una hoja **suelta** nueva, en una
transacción, copiando título ("Copia de …"), `hora_llegada` y todas las cosas
(`nombre`, `cantidad`, `orden`, `costo_estimado` si existe) con `listo = 0` y
`responsable_id = NULL`. **Los gastos no se copian nunca**: pertenecen al evento
pasado.

Permiso: puede duplicar cualquiera que pueda **ver** la hoja, y el `creado_por`
de la copia es quien duplica. De paso resuelve de forma sana la incomodidad de
que un líder no pueda tocar la hoja de otro: no la edita, se hace la suya.

Cero tablas nuevas, un endpoint, una transacción.

---

## 5. Export a PDF → imprimir y copiar

**Se descarta generar PDF en el servidor.** Requiere una dependencia nueva
(`pdfkit`, o peor, un navegador headless) en un proyecto que hoy no tiene
ninguna, desplegado en Render con recursos acotados. Y no hace falta: el proyecto
**ya usa `window.print()`** en Reportes (`app.js:1309`), y el navegador ofrece
"Guardar como PDF" gratis, en escritorio y en móvil.

- Un bloque `@media print` en `styles.css` que oculte navegación, botones e
  inputs y deje la hoja limpia, con nombres y casillas para marcar a mano. Botón
  🖨️ en la cabecera de la hoja.
- Además, y probablemente más usado: **"📋 Copiar para WhatsApp"**, que arma el
  texto plano de la lista y lo deja en el portapapeles
  (`navigator.clipboard.writeText`). Sin backend. Es el canal por el que la
  iglesia realmente comparte esto.

```
*Almuerzo de jóvenes* — sáb 8 de agosto, llegar 12:30
• Jugos néctar ×5 — Ana
• Pan ×3 — pendiente
```

**Decisión abierta:** una hoja impresa se pega en la puerta de la iglesia. ¿Debe
llevar los gastos? Recomiendo que **no** por defecto, coherente con la decisión
de v1 de que el dinero es de líderes; con una casilla "incluir gastos" para quien
la quiera para rendir cuentas.

---

## 6. Integración con Tesorería → se descarta

No es cuestión de costo. Hay tres razones de fondo:

1. **Ese dinero no es de la iglesia.** El almuerzo se financia con una cuota
   entre los propios jóvenes y nunca pasa por la caja. Empujarlo a `movimiento`
   infla los libros y ensucia `/tesoreria/transparencia`, que es un resumen
   público del balance de la congregación.
2. **Choca con los permisos.** `tesoreria.js:20` es tajante: solo
   `esTesoreroEstricto` escribe movimientos, y el pastor únicamente observa. En
   Organización edita el creador de la hoja, que es cualquier líder. Si un gasto
   de hoja creara un `movimiento` automáticamente, cualquier líder estaría
   escribiendo en el libro de tesorería por la puerta de atrás. Eso no es una
   funcionalidad, es un agujero de gobernanza.
3. **No hay vuelta atrás.** `movimiento` solo tiene `POST`: no se edita ni se
   borra. Borrar un gasto en la hoja dejaría un movimiento huérfano en los libros
   sin forma de corregirlo.

**Si el dueño lo pide igual,** la única forma defendible es al revés y a mano:
un botón **en Tesorería**, accionado por **el tesorero**, "traer un gasto de una
hoja de organización", que crea el `movimiento` y guarda su `movimiento_id` en la
fila del gasto para no importarlo dos veces. Nunca automático, nunca iniciado
desde Organización. Aun así, yo lo aplazaría hasta que un tesorero lo pida.

---

## Riesgos

- **Dos buzones de "lo que debo".** Ya existe `tarea_grupo` con exactamente la
  misma forma (asignar, notificar, aparece en Mi Servicio, marcar hecho). Poner
  "Mi parte" dentro de Mi Servicio y no en un módulo aparte es lo que evita que
  se dupliquen. No fusionarlos: una tarea de grupo no tiene cantidad ni hoja.
- **Spam de notificaciones.** Mitigado por notificar solo al cambiar realmente el
  responsable. Hay que probarlo explícitamente.
- **Fuga de privacidad por `mis-cosas`.** Es la ruta que perfora el gate: debe
  tener su propio test con token de feligrés verificando que no devuelve gastos,
  ni totales, ni cosas de otras personas, ni nada de otra iglesia.
- **`creado_por` de la hoja perezosa.** Hoy la hoja de un evento queda a nombre
  del primer líder que la abre (`organizacion.js:76`), y solo él o el pastor
  pueden editarla. Con responsables asignados, que el "dueño" sea un accidente de
  quién hizo clic primero duele más. Es una decisión de producto (abajo), no un
  arreglo obvio.
- **Deriva de alcance.** La hoja está a un paso de convertirse en un gestor de
  proyectos. Límite explícito para v2: **sin fechas de vencimiento por línea, sin
  dependencias entre líneas, sin comentarios por línea.**

## Decisiones que necesita tomar el dueño

1. **Universo de responsables:** ¿toda la iglesia (mi recomendación, con los del
   grupo primero en el selector) o solo miembros del grupo del evento?
2. **¿Aceptar/rechazar?** `asignacion` tiene flujo de aceptación porque servir es
   un compromiso público. Traer 5 jugos es más liviano. Recomiendo **sin** flujo:
   se ve, y se marca ✓ cuando se tiene. Si no se puede, se avisa por el chat que
   ya existe.
3. **¿Ven los feligreses los gastos?** Mi diseño mantiene el "no" de v1, y de esa
   respuesta depende que `mis-cosas` siga siendo una rendija estrecha.
4. **Costo estimado:** ¿por línea (mi recomendación) o por unidad? ¿Y se construye
   siquiera, o los líderes no presupuestan antes?
5. **Quién edita una hoja:** hoy creador + pastor. ¿Se amplía al encargado del
   grupo dueño del evento? Y en relación con eso: ¿es intencional que la hoja de
   un evento quede a nombre de quien la abre primero?
6. **La hoja impresa:** ¿con o sin gastos por defecto?
7. **Recordatorio:** ¿solo un día antes, o 3 y 1 como las asignaciones?

## Recomendación priorizada

1. **Responsable + aviso + "Mi parte" + recordatorio** (§1). Es la razón de ser
   del módulo; sin esto la hoja no sale del teléfono del líder.
2. **Imprimir y copiar para WhatsApp** (§5). Horas de trabajo, valor visible el
   mismo día.
3. **`pagado_por` en los gastos** (§2). Una columna; resuelve la discusión de los
   reembolsos.
4. **Duplicar lista** (§4). Un endpoint; reemplaza a las plantillas.
5. **Presupuesto estimado** (§3). Solo si el dueño confirma que se presupuesta.
6. **Se descartan:** plantillas como sistema (→ 4), export PDF en servidor
   (→ 2), e integración con Tesorería (§6).
