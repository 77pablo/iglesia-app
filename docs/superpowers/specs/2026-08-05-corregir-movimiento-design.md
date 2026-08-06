# Corregir un movimiento de Tesorería, con rastro

**Fecha:** 5 de agosto de 2026
**Rama:** `feat/corregir-movimiento`
**Estado:** aprobado por el dueño (decisiones del 5-ago)

## El problema

Una ofrenda mal tecleada queda para siempre. En toda la tesorería lo único que
se puede deshacer es un aporte de campaña (borrándolo), y esa asimetría ya
estaba anotada en `ESTADO.md` como la pregunta que alguien iba a hacer:
*"¿por qué se puede borrar un aporte y no corregir una ofrenda?"*.

## Decisiones del dueño (5-ago)

1. **Solo corregir, nunca borrar.** Se corrigen monto, descripción y
   categoría. Borrar sigue prohibido: un movimiento que desaparece no deja
   hueco visible en los libros; una corrección a otro valor con rastro logra
   el arreglo sin borrar historia. (El borrar de aportes de campaña ya
   existía y no se toca.)
2. **El rastro se ve donde se supervisa.** Cada movimiento corregido lleva la
   marca "✏️ corregido" y su historial en la lista de Movimientos — que ven
   la tesorera, el pastor y el obispo — incluida la vista mensual del obispo.
   ⚠️ **Premisa corregida sobre la marcha:** la primera versión de esta
   decisión hablaba de "visible en Transparencia para la congregación", y esa
   premisa era falsa — el módulo Tesorería entero (con su tarjeta
   Transparencia) solo lo ven tesorera, pastor y obispo, y la tarjeta solo
   trae totales por categoría, no movimientos. Se re-preguntó al dueño con la
   premisa corregida; la tarjeta Transparencia no cambia.

## Lo que NO entra, a propósito

- **El tipo (ingreso↔gasto) no se corrige.** Cambiar el tipo es
  conceptualmente borrar un movimiento y crear otro, y borrar está prohibido.
  `validar()` descarta las claves no declaradas en silencio (comportamiento
  conocido del proyecto); un test lo deja fijado para que nadie lo lea como
  "se puede".
- **La fecha no se corrige.** Mover un movimiento de mes toca los totales
  mensuales (`resumen`, reportes) y la fecha es una fecha de calendario pura
  con la trampa documentada en `backend/src/reportes.js:21-29`. Si en uso
  real duele, es una conversación aparte con esa nota delante.
- **El comprobante no se corrige** por esta vía: `comprobante_url` tiene su
  propia validación de subida y reemplazarlo es otro flujo (subir archivo
  nuevo). Queda anotado como posible siguiente paso.
- **Borrar, en bloque o individual, no existe** (fuera del aporte de campaña
  que ya existía).

## Diseño

### Backend (`backend/src/tesoreria.js`)

**`PATCH /api/tesoreria/movimientos/:id`** — `soloTesorero` + `limiterSensible`
+ `validar(correccionSchema)`:

- `correccionSchema`: `monto` (positivo), `descripcion` (máx 500),
  `categoria` (máx 100) — los tres opcionales, **al menos uno presente**
  (`.refine`). El PATCH es **parcial por diseño**: lo que no viene, no se
  toca (la regla que dejó escrita la fuente del gasto).
- El movimiento se busca **acotado por iglesia en la misma consulta**; el de
  otra iglesia recibe 404 sin confirmar que exista (convención del archivo).
- **Solo se audita lo que cambió de verdad**: cada campo recibido se compara
  con el valor guardado; si nada cambió, se responde `ok` sin escribir ni
  auditar. Es la lección repetida cinco veces en este proyecto (formularios
  que reenvían lo que nadie tocó).
- `UPDATE` y `auditar()` van **en la misma transacción**
  (`BEGIN`/`COMMIT`/`ROLLBACK`), la convención que quedó fijada el 31-jul:
  una corrección de dinero no puede quedar aplicada sin rastro.
- El apunte: acción `movimiento_corregir`, `ref` `{tabla:'movimiento', id}`,
  y el detalle dice **solo los campos que cambiaron**, en la forma
  `monto: $5.000 → $50.000 · descripcion: "..." → "..."`.
- **Los aportes de campaña también se corrigen** (son movimientos): el total
  de la campaña se calcula sumando aportes, así que la barra se ajusta sola,
  sin segunda escritura. Corregir el monto de un aporte NO exige que la
  campaña siga abierta: cerrada rechaza aportes *nuevos*, no arreglos de
  tecleo (y el rastro queda igual).

**`GET /api/tesoreria/movimientos`** (existente) gana por fila
`correcciones`: el conteo de apuntes `movimiento_corregir` que apuntan a ese
movimiento (subconsulta sobre `auditoria` por `ref_tabla`/`ref_id`). Cero
para todo lo no corregido — la pantalla decide con ese número si pinta la
marca.

**`GET /api/tesoreria/movimientos/:id/historial`** (nuevo) — visible para
quien ve el módulo (tesorera, pastor, obispo): devuelve los apuntes de
corrección del movimiento (fecha UTC, nombre del actor por JOIN a `persona`,
detalle). Se pide al tocar la marca, no se precarga en la lista.

**Vista del obispo:** el endpoint que alimenta su detalle mensual de
movimientos (`obispo.js`) gana el mismo conteo `correcciones` por fila, para
que el obispo vea la marca — es la mitad de la decisión 2.

### Frontend (`web/app.js`)

- **Botón ✏️ por movimiento, solo para la tesorera** (`esTesoreroUI()`),
  que abre un **panel en sitio** (la convención de los 17 formularios) con
  monto, descripción y categoría prellenados **de la fila recién leída**
  (nunca de una caché vieja — la lección de corregir-nombre).
- **El PATCH manda solo lo tocado**: se compara cada campo contra el valor
  original y viajan únicamente los distintos. Un guardar sin tocar nada no
  llama a la API.
- **Marca "✏️ corregido"** en la fila cuando `correcciones > 0`, visible
  para todos los que ven la lista. Tocarla pide el historial y lo muestra
  (fechas con `fechaDeUTC()` — son marcas de tiempo UTC, ver
  `reportes.js:21-29` antes de tocar cualquier fecha).
- **Vista mensual del obispo** (`obTesoreria`): la misma marca en las filas
  corregidas. Sin botón de editar — el obispo solo observa.
- Todo texto que escribe una persona pasa por `escHtml()` al pintarse
  (descripcion y categoria son texto libre; el historial los incluye).

### Tests (nuevos, en `backend/test/`)

Suite del PATCH con servidor del arnés in-process o el patrón del archivo de
tesorería existente (el que ya usen las pruebas de campañas):

1. La tesorera corrige el monto → 200, el movimiento cambia, un apunte de
   auditoría con `antes → después` en la misma transacción.
2. El pastor intenta corregir → 403 (observa, no toca).
3. Movimiento de otra iglesia → 404.
4. PATCH con los mismos valores → 200 y **cero apuntes nuevos** (no se
   audita lo que no cambió).
5. PATCH sin ningún campo → 400 (el `.refine`).
6. PATCH con `tipo` o `fecha` → se ignoran en silencio y el movimiento no
   los cambia (fija el comportamiento de `validar()`).
7. Corregir el monto de un aporte de campaña → el `recaudado` calculado de
   la campaña refleja el monto nuevo; funciona también con la campaña
   cerrada.
8. `GET /movimientos` trae `correcciones` correcto (0 y >0).
9. `GET /movimientos/:id/historial` → los apuntes con nombre de actor; para
   un movimiento de otra iglesia → 404.

## Consecuencias asumidas, escritas para que nadie las descubra de sorpresa

- **Borrar un aporte de campaña corregido deja su historial huérfano** en
  `auditoria` (el borrar ya existía y esta spec no lo toca): los apuntes
  siguen existiendo pero ya no hay fila que los muestre. Coherente con que
  borrar aportes fue decisión de alcance del dueño.
- **No hay control de concurrencia** en el PATCH (como en el resto del
  proyecto): dos tesoreras editando el mismo movimiento, la última gana. Con
  una sola tesorera por iglesia, riesgo mínimo; anotado.
- **Las correcciones anteriores a esta función no existen**: todo movimiento
  parte con historial vacío. No hay migración que inventar.

## Orden sugerido de tareas

1. Backend: `PATCH` + schema + transacción + auditoría condicional, con sus
   tests (1-7).
2. Backend: `correcciones` en el listado + endpoint de historial + conteo en
   la vista del obispo, con sus tests (8-9).
3. Frontend: panel de corrección de la tesorera (PATCH parcial de verdad).
4. Frontend: marca + historial en la lista y en la vista del obispo.
5. `ESTADO.md`.
