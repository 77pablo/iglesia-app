# Rendición: los gastos de eventos llegan al libro de la tesorera (Camino C)

**Fecha:** 7 de agosto de 2026 · Decisiones tomadas con Pablo en brainstorming.
Cierra el pendiente 1 de la fuente del gasto (31-jul): *"los gastos de la hoja
de Organización siguen sin aparecer en Tesorería"*.

## Las decisiones del dueño, y la que cambió el diseño

| Decisión | Elección |
|---|---|
| Alcance | Se atacaban B (devoluciones) y C (rendición) juntos… |
| **La corrección de premisa** | **"La iglesia no devuelve dinero: dar es voluntario."** El Camino B (marcar devuelto + movimiento de devolución) **se muere antes de nacer**: no se construye |
| Mecanismo | **Calculado, sin copias** (la lección de campañas): Tesorería LEE los gastos de las hojas; no hay movimientos espejo ni dos escrituras que sincronizar |
| La opción "se le devuelve" del formulario | **Se queda**, por si un caso especial la necesita alguna vez. Sin mecanismo propio: si ese día llega, la tesorera anota la devolución como gasto manual en su libro (la salida de escape documentada) |

## Qué se construye

1. **Tesorería gana la sección "🗒️ Gastos de eventos"** (la ven tesorera,
   pastor y obispo, como todo el módulo): las hojas con gastos, de la más
   nueva a la más vieja, cada una con sus gastos — concepto, monto, quién puso
   la plata — **leídos de la hoja**. Se corrigen allá (su casa); el libro los
   muestra siempre al día.
2. **Solo lo que pagó la caja descuenta del saldo.** El `saldo` del resumen
   pasa a ser `ingresos − gastos del libro − gastos de eventos con
   fuente='caja'`. Lo que alguien puso de su bolsillo fue voluntario (aporte):
   se ve como transparencia, no toca la caja. Lo marcado "se le devuelve"
   tampoco descuenta (no ha salido plata de la caja, y la iglesia no devuelve).
3. **El resumen muestra la línea nueva por separado** (`gastosEventosMes`):
   `gasMes` (el libro) no cambia de significado — nada de mezclar peras con
   manzanas en un número ya publicado.
4. **Transparencia** gana el total "Gastos de eventos" junto a las categorías.

## Backend (`tesoreria.js`)

- `GET /resumen`: `saldo` resta el total histórico de gastos org con
  `fuente='caja'`; respuesta gana `gastosEventosMes` (mes local de la fecha de
  la hoja o de su evento; si ninguna tiene fecha, el mes del `creado_en` del
  gasto convertido a hora local — la trampa de las cinco fechas).
- `GET /gastos-eventos?offset=`: hojas con gastos de la iglesia, paginadas de
  a 20 hojas, cada una con `titulo`, `fecha`, `evento_id` y sus gastos
  (`concepto`, `monto`, `fuente`, `pagado_por_nombre` vía LEFT JOIN persona —
  el anonimizado sale "Usuario eliminado" por su propia fila).
- Todo acotado por iglesia **en la misma consulta**.

## Pantalla (`web/app.js`)

- Tarjeta "🗒️ Gastos de eventos" en Tesorería, plegable nacida cerrada (el
  patrón de siempre), entre campañas y transparencia. Cada hoja: título +
  fecha + sus gastos con su fuente en palabras ("pagó la caja", "puso María
  (aporte)", "se le devuelve a Pedro"). Botón por hoja "Ver hoja →" que lleva
  a la Organización del evento (la casa donde se corrige).
- El resumen pinta la línea nueva: "🗒️ Gastos de eventos (mes): $X".
- Todo pasa los tres barridos XSS sin excepciones nuevas (escHtml/money/
  Number/mapJoin).

## Consecuencias asumidas, escritas

- **Borrar un evento borra su hoja** (cascada existente) y con ella sus gastos
  del cálculo: el saldo "recupera" esa plata. Igual que ya pasaba con la barra
  de campañas al borrar un aporte — es la naturaleza de lo calculado.
- **El saldo histórico cambia el día del despliegue** (baja en el total de
  gastos-caja acumulados de todas las hojas). Es la corrección que esta tanda
  viene a hacer: ese dinero SÍ salió de la caja y el libro decía otra cosa.
- Sin control de concurrencia, como todo el proyecto.

## Cómo se verifica

- Tests: resumen (saldo resta solo fuente='caja'; aporte y devuelve no tocan;
  `gastosEventosMes` del mes correcto; `gasMes` intacto), gastos-eventos
  (agrupado por hoja, aislamiento de iglesia, paginado, pagador anonimizado),
  transparencia con la línea nueva.
- Manual (Pablo): anotar un gasto "lo pagó la caja" en la hoja de un evento y
  ver el saldo de Tesorería bajar al tiro; corregirlo en la hoja y ver el
  libro seguirlo sin tocar nada.
