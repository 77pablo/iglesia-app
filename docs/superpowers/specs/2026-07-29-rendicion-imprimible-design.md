# Rendición del evento, en papel — Diseño

**Fecha:** 29 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado; listo para plan de implementación
**Antecedente:** `2026-07-28-organizacion-v2-design.md` (v2, implementada)

## De qué se trata

El líder que organiza un evento adelanta dinero de su bolsillo, o se lo adelanta
gente de su grupo. Después tiene que rendirle cuentas al tesorero para que la
iglesia devuelva esa plata. **Hoy ese papel no existe**: la hoja impresa sale a
propósito sin gastos, porque se pega en la puerta de la iglesia y las cuentas son
cosa de líderes (`web/app.js`, la card de gastos lleva `no-print`; el porqué está
comentado en `web/styles.css`, dentro del bloque `@media print`).

Este documento diseña un **segundo imprimible** de la misma vista: la rendición.

## Por qué esto y no la integración con Tesorería

La integración Organización ↔ Tesorería sigue sin existir y es la única pendiente
real de v2. Pero antes de escribir una fila en `movimiento` conviene probar el
papel, por tres razones:

1. **Es lo que la iglesia hace hoy.** El líder ya le rinde cuentas al tesorero de
   palabra o por WhatsApp. Un papel ordenado puede cubrir el caso entero.
2. **No toca permisos.** La integración choca de frente con ellos: el tesorero
   recibe **403 en todo `/api/organizacion`** (`'tesorero'` no está en
   `esLiderOAdmin`, `backend/src/auth.js`), y el pastor edita en Organización
   pero no puede escribir en Tesorería (`soloTesorero`, `backend/src/tesoreria.js`).
   Cualquier botón "enviar a Tesorería" sería un bypass de ese candado.
3. **No toca el esquema.** La integración exige antes poder decir "esto lo pagó
   la caja de la iglesia", y hoy `evento_org_gasto.pagado_por` siempre apunta a
   una persona. Ese cambio es el primer paso del spec de Tesorería, no de este.

**Corrección a un antecedente:** el spec de v2 descartó la integración con
Tesorería apoyándose, entre otras cosas, en que "este dinero no es dinero de la
iglesia". El 29 de julio el dueño precisó que el modelo real es **mixto**: a veces
paga la caja y a veces las personas, y **a quien pone se le devuelve**. Esa
premisa de v2 era falsa. No cambia la decisión de este documento (el papel no
depende de ella), pero sí invalida uno de los argumentos con que se cerró la
integración, y por eso queda dicho aquí.

## Alcance

**Entra:** un segundo imprimible, en frontend y CSS.

**No entra**, por decisión explícita del 29 de julio: marcar la fuente del gasto
("lo pagó la iglesia"). Se hace notar que **las cifras del papel ya salen
correctas sin eso**: la consulta de aportes usa `JOIN` y no `LEFT JOIN`
(`backend/src/organizacion.js`), así que un gasto sin pagador registrado no entra
en el resumen de quién puso qué. Lo único ambiguo es la línea "Sin registrar quién
puso", que hoy mezcla dos casos distintos —un gasto anterior a la función y un
gasto que pagó la caja—, y esa desambiguación pertenece al spec de Tesorería.

## Lo que ya está construido

El papel elegido está pintado casi entero, y esto es lo que hace el trabajo
barato. El bloque **"Quién puso qué"** (`.org-aportes`) ya vive dentro de la card
de gastos, con los aportes ordenados de mayor a menor y una línea "Sin registrar
quién puso" cuando el total no cuadra con la suma. Está construido, probado en
uso, y solo lleva la etiqueta `no-print`.

**No hace falta tocar el backend.** `GET /api/organizacion/:id` ya devuelve todo:
`gastos` (con `pagado_por_nombre`), `total_gastado` y `aportes` agrupados.

## Diseño

### 1. Cómo se dispara

Un segundo botón junto a "🖨️ Imprimir / PDF", con la etiqueta "🧾 Rendición",
en la misma `btn-fila` (que lleva `flex-wrap:wrap`, así que un botón más no
desborda a 390px).

`Org.imprimirRendicion()` repite lo que hace `Org.imprimir()` —fijar
`document.title`, imprimir, restaurar en `afterprint` con temporizador de red de
seguridad— y añade una sola cosa: pone `modo-rendicion` en el `<body>` y la quita
en el mismo `restaurar()`.

El nombre del archivo guardado es `Rendición — <título> — <fecha>`, donde la fecha
es **la del evento** (la misma que ya usa `Org.imprimir()`), no la de impresión.
Así no se confunde con la hoja de cosas del mismo evento.

**El botón no aparece si la hoja no tiene gastos.** Llevarle al tesorero un papel
que dice "Total: $0" es ruido. (La hoja de cosas sí se imprime vacía, y así se
queda: sirve para llenarla a mano, cosa que una rendición no.) La condición se
evalúa al pintar la vista, así que al añadir el primer gasto el botón aparece solo
en el redibujado que ya hace `Org._recargar()`.

### 2. Qué sale en cada papel

Todo ocurre dentro del `@media print` que ya existe. Lo nuevo son las reglas bajo
`.modo-rendicion`. Hace falta darles nombre a las dos cards (`card-cosas`,
`card-gastos`), que hoy son `.card` a secas.

| | Hoja de cosas (existe) | Rendición (nueva) |
|---|---|---|
| Cabecera iglesia + fecha de impresión | sí | sí, la misma |
| Título de la hoja | sí | sí |
| Contexto (tipo · fecha del evento) | sí | sí |
| Hora de llegada | sí | **no** — al tesorero no le dice nada |
| Cosas a llevar | sí | **no** |
| Gastos + total + "Quién puso qué" | **no** | sí |
| Línea de firma | no | sí |

Ojo con una fila de esa tabla: **el contexto y la hora de llegada viven hoy en la
misma card**, así que no basta con mostrar u ocultar cards enteras. La línea de la
hora necesita su propio enganche (una clase) para poder ocultarla sola en modo
rendición.

La línea de firma es un bloque nuevo, visible solo en papel y solo en modo
rendición: `Recibí conforme: ______________   Fecha: ____________`.

### 3. Una cosa que se decidió NO hacer

**El rótulo "Quién puso qué" se queda como está**, en vez de rebautizarse
"A devolver" en el papel. Dos nombres para el mismo bloque obligan a mantener los
dos y a que alguien decida cuál es el bueno. Y "Quién puso qué" es además **más
exacto**: en el modelo mixto no todo lo que alguien puso tiene por qué devolverse.
La sección cumple su función sin cambiarle el nombre.

### 4. Manejo de errores y estado pegado

Éste es el punto delicado del diseño, y no es teórico.

Las reglas de `modo-rendicion` viven **dentro** de `@media print`. Consecuencia:
si la clase se queda pegada, **en pantalla no se nota nada**, pero la siguiente
impresión normal saldría con los gastos — el fallo se manifiesta en papel, delante
de la gente, y en un sitio distinto del que lo causó.

Dos candados, deliberadamente redundantes:

1. `restaurar()` quita la clase igual que devuelve el título, y lo llaman tanto
   `afterprint` como el temporizador de 60 s.
2. `Org.imprimir()` (la hoja de cosas) **quita la clase explícitamente antes de
   imprimir**. Así un estado pegado se cura solo en el siguiente uso, en vez de
   acumularse.

Si no hay hoja cargada (`Org._hoja` nulo), el comportamiento es el mismo que ya
tiene `Org.imprimir()`: no se toca el título ni la clase.

### 5. El riesgo de CSS, dicho por su nombre

La card de gastos lleva `.no-print`, cuya regla en `@media print` es
`display:none !important`. Para mostrarla en modo rendición hace falta `!important`
**y** mayor especificidad: `.modo-rendicion .card-gastos` son dos clases contra
una.

Esto no es un detalle de implementación: es **la misma trampa** que el 29 de julio
por la mañana casi deja sin cabecera la hoja impresa (`.solo-print` se encendía
dentro de `@media print` y se apagaba más abajo en el archivo, misma especificidad,
ganaba la última). En pantalla todo se veía bien. **Ninguna prueba automática del
repo puede ver esto**, así que va tratado como punto de verificación obligatorio,
no como detalle.

## Verificación

No hay cambio de backend: ningún test de Node cubre esto, igual que hoy. La
verificación es el script de Playwright, con `page.emulate_media(media='print')`,
que es la única forma de ver el papel sin imprimirlo.

Debe comprobar:

1. El botón de rendición aparece cuando hay gastos y **no** aparece cuando no los hay.
2. En modo rendición: los gastos se ven, el total se ve, "Quién puso qué" se ve,
   la línea de firma se ve, y las cosas a llevar **no**.
3. La hora de llegada no sale en la rendición.
4. `document.title`, **en el momento de llamar a `print()`**, dice "Rendición" y
   lleva el título de la hoja.
5. **Regresión:** la impresión normal sigue saliendo con las cosas y **sin** gastos.
6. La clase `modo-rendicion` no queda pegada después de `afterprint`.
7. El autocurado: con la clase puesta a mano, `Org.imprimir()` la quita.
8. Sin errores de consola.

## Criterio de terminado

- Los ocho puntos de verificación en verde, con captura del papel de rendición.
- Los 317 tests del backend siguen en verde (no deberían verse afectados; si
  alguno cambia, es señal de que el trabajo se salió del alcance).
- `ESTADO.md` actualizado en el mismo commit que el código.
