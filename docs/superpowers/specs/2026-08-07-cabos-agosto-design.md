# Cabos de agosto: gasto a persona activa · corrección de nombre avisa · la hoja no se pisa

**Fecha:** 7 de agosto de 2026
**Aprobado por:** Pablo (los tres cabos, opción recomendada en los tres)
**Origen:** los pendientes verificados del ESTADO.md al 7-ago. De los candidatos
originales, la mitad ya estaba hecha (décima repetición de la lección: la fecha
de Cuidado pastoral ya usaba `fechaDeUTC`, `ninos.js` ya auditaba todo,
`directorio.js` ya tenía su guardia, y el gasto ya validaba la iglesia de la
persona). Lo que sigue son los tres huecos que **sí** existen en el código hoy.

---

## Cabo 1 — Un gasto nuevo no se puede atribuir a una cuenta inactiva

**El hueco (verificado):** `POST /:id/gastos` y `PATCH /gastos/:gastoId`
(`backend/src/organizacion.js`) comprueban que `pagado_por` sea de la misma
iglesia, pero **no que esté activa** — a diferencia del responsable de la hoja
(`organizacion.js:342`, que sí exige `activo = 1`).

**La regla:**
- **Alta** (`POST`): la persona debe estar **activa**. Mensaje idéntico al del
  responsable: *"Esa persona no esta en tu iglesia o su cuenta esta inactiva"*.
- **Corrección** (`PATCH`): se exige activa **solo si el pagador cambia**
  (`pagadoPor !== gasto.pagado_por`). Un gasto histórico cuyo pagador se dio de
  baja debe poder corregir su concepto o su monto sin que la app obligue a
  quitarle la atribución — es la misma filosofía del `PATCH` parcial que ya
  gobierna `fuente`/`pagado_por`, y la razón por la que el selector inyecta la
  opción "(cuenta inactiva)".

**Sin cambios de esquema ni de frontend.** El selector ya rotula "(cuenta
inactiva)"; quien la elija para un gasto **nuevo** recibirá el 400 con el
mensaje de arriba.

**Tests (TDD):** alta con persona inactiva → 400; corrección que solo toca
monto de un gasto con pagador inactivo → 200; corrección que **cambia** el
pagador a una inactiva → 400.

---

## Cabo 2 — Corregir un nombre avisa dónde sigue escrito el viejo

**El hueco:** `nino.autorizados` (quién puede retirar a un niño — texto libre,
se mira en la puerta de la sala) y `predica.predicador` / `sermon.predicador`
(texto libre, visible en el portal público) no se enteran cuando una persona
corrige su nombre. La ficha del niño seguiría autorizando a "juan perez".

**La decisión de diseño: avisar, nunca reescribir.** Son textos libres; un
reemplazo automático de subcadenas haría estropicios ("Juan" vive dentro de mil
frases). La app **no toca** esos textos: busca y avisa.

**Dónde:** en los **dos** endpoints que corrigen nombre —
`PATCH /api/directorio/perfil` (autoservicio) y
`PATCH /api/admin/usuarios/:id` (el pastor) — y **solo cuando el nombre cambió
de verdad** (los dos ya comparan contra el nombre viejo; el aviso cuelga de esa
misma comparación, no de que el campo venga).

**Qué se busca** (acotado por iglesia, `LIKE` sin distinguir mayúsculas, con el
nombre **viejo**): `nino.autorizados`, `predica.predicador`,
`sermon.predicador`.

**Qué ve cada uno** (la diferencia es de privacidad, no cosmética):
- **El pastor** (corrección asistida): detalle completo — *"El nombre anterior
  sigue escrito en: ficha de Pedrito (autorizados), 2 prédica(s). Corrígelo a
  mano donde corresponda."* El pastor ya ve esas fichas.
- **La propia persona** (autoservicio): solo **conteos, sin nombres de niños**
  — *"Tu nombre anterior aparece en la lista de retiro de 1 ficha de niño y en
  2 prédicas; pide a tu maestra o al pastor que lo actualicen."* Un feligrés no
  tiene por qué enterarse de qué fichas de niños mencionan un nombre — un
  `LIKE` con un nombre común puede casar con fichas de otra persona.

**Cómo viaja:** el `PATCH` responde además `apariciones: {ninos, predicas}`
(para el autoservicio, números; para admin, también las listas). El frontend lo
muestra en el toast/panel del guardado. Escapado con `escHtml` — el barrido XSS
lo va a exigir de todos modos.

**Asumido y escrito:** la búsqueda es por texto — si la abuela quedó anotada
como "la sra. Juanita" no la va a encontrar (falso negativo posible), y un
tocayo puede generar un aviso de más (falso positivo aceptable: el aviso pide
revisar, no afirma). El aviso **no bloquea** la corrección.

**Tests (TDD):** corrección con apariciones → el response las trae (y el
autoservicio NO trae nombres de niños); corrección sin apariciones → conteos en
cero; corrección que no cambia el nombre → sin búsqueda ni aviso; acotado por
iglesia (el niño de otra congregación no aparece).

---

## Cabo 3 — Corregir un gasto que otro ya cambió da 409, no lo pisa

**El hueco (punto 10 del 31-jul):** la hoja queda abierta durante todo el
almuerzo; dos personas corrigiendo el mismo gasto se pisan y gana el último,
sin aviso.

**El diseño: comparar-y-guardar, sin tocar la base de datos.** El `PATCH` del
gasto gana un campo **opcional** `visto`: lo que la pantalla estaba mostrando
al abrir el ✏️ (`{concepto, monto, fuente, pagado_por}`). Dentro de la misma
transacción que ya existe, el servidor compara `visto` contra la fila guardada;
si **cualquiera** difiere, no aplica nada y responde
**409** *"Alguien cambió este gasto mientras lo mirabas — recarga la hoja"*
(el precedente del 409 con mensaje en castellano ya existe en Escuela
Dominical). Sin `visto` (un cliente viejo), el `PATCH` sigue funcionando como
hoy — por eso es opcional y no rompe el despliegue si backend y frontend no
llegan juntos.

**Detalles que importan:**
- La comparación de `fuente` y `pagado_por` trata `null` como valor (un gasto
  histórico "no se sabe" es un estado real que también se puede pisar).
- `monto` es entero (pesos chilenos); comparación exacta, sin líos de decimales.
- El frontend captura el snapshot **al abrir el formulario** de ✏️ (que ya se
  prellena desde la fila), lo manda en el `PATCH`, y ante un 409 muestra el
  mensaje y **recarga la hoja**. No intenta fusionar nada.
- **Borrar** un gasto que otro acaba de borrar ya da 404 hoy; queda fuera.

**Tests (TDD):** dos "sesiones": A abre (lee), B corrige, A corrige con su
`visto` viejo → 409 y la fila queda como la dejó B; A recarga y corrige → 200;
`PATCH` sin `visto` → sigue funcionando (compatibilidad); `visto` con `null`
en fuente detecta el pisotón igual.

---

## Fuera de alcance, a propósito

- **Reemplazo automático** de nombres en textos libres (cabo 2) — descartado
  por diseño, no por pereza.
- **Reabrir la asistencia de niños** para saber quién retiró — sigue siendo
  otra conversación (decisión del dueño pendiente de uso real).
- **`If-Match`/versión generalizada** para toda la app — el cabo 3 arregla la
  pantalla de vida larga que ya mordió; generalizarlo sin un segundo caso real
  sería especular.
- **Borrar en concurrencia** (cabo 3): el 404 existente basta.

## Verificación

`cd backend && npm test` (la suite parte en **721**). Verificación manual de
Pablo al final: como `raquel`, intentar anotar un gasto a nombre de una cuenta
inactiva (debe negarse); corregir su propio nombre y leer el aviso; y el
pisotón: abrir el mismo gasto en dos pestañas, guardar en una, guardar en la
otra y leer el 409.
