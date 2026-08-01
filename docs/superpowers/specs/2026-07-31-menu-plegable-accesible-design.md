# El menú del móvil: temas plegables y entradas usables con teclado

**Fecha:** 31 de julio de 2026
**Estado:** diseño aprobado por el dueño, pendiente de plan de implementación

---

## El problema

Esta misma tarde se agrupó el menú del móvil bajo cinco temas. Aquello mejoró
**buscar**, y se dijo desde el primer día que no iba a acortar el **scroll**: las
19 entradas del pastor siguen ahí, y ahora con cinco encabezados encima. La spec
de aquel trabajo lo dejó escrito como lo que quedaba sin resolver, y nombró la
respuesta: secciones plegables, con los grupos ya definidos como paso previo.

Esto es ese paso siguiente.

Va junto con otra carencia que quedó apuntada y sin tocar: las entradas del menú
son `<div onclick>`, así que **no se pueden usar con el teclado** y un lector de
pantalla no las anuncia como lo que son.

**Los dos son un solo trabajo, no dos.** Un encabezado que se pliega *es* un
control interactivo: hacerlo plegable sin hacerlo accesible crearía una barrera
nueva donde hoy solo hay un `<div>` inerte. Y hacerlo en dos pasos obligaría a
operar dos veces la misma función.

## Qué se construye

En el móvil, cada tema del menú se abre y se cierra. Al abrir el cajón está
abierto **solo** el tema que contiene la pantalla en la que estás; los demás,
cerrados. En el peor caso se ven unas 11 líneas en lugar de 19.

Y todo el menú —entradas y encabezados— pasa a ser operable con el teclado.

## Decisiones del dueño

Tomadas en la conversación de diseño, con las alternativas que se descartaron:

1. **Al abrir el cajón: solo el tema actual.** Se descartó "todos cerrados"
   (obligaría a dos toques *siempre*, cuando hoy basta uno) y "como lo dejó la
   última vez" (impredecible: si lo dejó todo abierto, vuelve al menú largo de
   hoy y el trabajo no sirve de nada).

2. **Acordeón: solo un tema abierto a la vez.** Abrir uno cierra el anterior. Es
   lo único que **garantiza** que el menú no vuelva a ser largo: el techo son los
   5 encabezados más las entradas de un tema. La alternativa —varios abiertos a
   la vez— tiene un peor caso de 24 líneas, *más* largo que el menú de hoy.

3. **Un punto en el encabezado cuando hay mensajes sin leer** dentro de un tema
   cerrado (ver más abajo, "el contador que se escondía"). Se descartó repetir el
   número exacto en el encabezado (habría que mantenerlo al día en dos sitios) y
   se descartó abrir el tema de Mensajes por su cuenta (le movería el menú sin que
   él lo pida, contradiciendo la decisión 1).

4. **Arquitectura: contenedores reales por tema** (enfoque A de tres estudiados).
   Ver la sección siguiente.

## Arquitectura: las dos formas del menú

`buildNav()` pasa a construir una de dos formas según el ancho de la pantalla.

**Escritorio (más de 900px)** — la lista plana en orden `NAV`, sin encabezados.

⚠️ Precisión, porque decir "el mismo DOM de hoy" sería falso: hoy `buildNav()`
pone `style="--ord:N"` en **todos** los elementos cuando el menú es largo, sin
mirar el ancho de pantalla — en escritorio esa variable existe y no la usa nadie,
porque la regla que la convierte en `order` vive dentro del `@media`. Con este
trabajo esos atributos **desaparecen**. Es un cambio real en el DOM del
escritorio, pero **invisible**: se retira algo que allí nunca hizo nada. Lo que
no puede cambiar es lo que se ve — mismas entradas, mismo orden, mismo aspecto.

**Móvil con menú largo** (12 entradas o más, o sea `NAV_UMBRAL_GRUPOS`) — cada
tema es un contenedor de verdad:

```html
<button class="nav-sec" aria-expanded="true" aria-controls="nav-g-2">Lo mío</button>
<div class="nav-grupo" id="nav-g-2">…sus entradas…</div>
```

**Móvil con menú corto** (un feligrés, 9 entradas) — igual que escritorio. Por
debajo del umbral no se agrupa, luego no hay nada que plegar. Los encabezados le
convertirían 9 líneas en 13: le empeorarían el menú para resolver un problema que
no tiene.

### Por qué esta forma y no seguir con el truco de hoy

Hoy el DOM va **siempre** en orden `NAV` y el agrupamiento visual del móvil sale
de `order` de flexbox (cada elemento lleva un `--ord`, y una única regla dentro
del `@media` lo convierte en `order`). Eso se hizo para que el escritorio no se
enterara de nada, y funciona.

Pero tiene una consecuencia que impide plegar bien: **las entradas de un mismo
tema no están juntas en el DOM**. Un encabezado plegable necesita decir qué
controla, y no puede señalar a un contenedor que no existe. Se estudió mantener
el DOM plano y plegar por CSS con un `data-grupo` por entrada: resolvía lo
plegable y **empeoraba** lo accesible — quien navegue por teclado oiría las
entradas en orden `NAV`, intercaladas con botones de temas que no les
corresponden, y los encabezados ya no podrían llevar el `aria-hidden` que hoy
tapa ese desajuste.

Con contenedores reales, en el móvil **el orden del DOM vuelve a ser el orden
visual**, y con eso **desaparecen `--ord` y la regla `order`**. Esto no añade
complejidad sobre el truco: lo elimina. Y ese truco es exactamente el que
provocó un fallo real el mismo día que se escribió (ver "riesgos conocidos").

### El breakpoint tiene que salir de un solo sitio

El JS necesita saber si está en móvil (`matchMedia`) y el CSS ya tiene su
`@media (max-width:900px)`. Si el número se escribe en los dos sitios, el día que
alguien cambie uno el menú se rompe **en silencio**: el JS pintaría la forma de
escritorio mientras el CSS aplica los estilos de móvil, o al revés.

Se declara una constante en `web/app.js` y **una prueba comprueba que el número
del `@media` de la hoja de estilos es ese mismo**. No hay forma de compartir un
valor entre JS y CSS en este proyecto (no hay compilador ni preprocesador), así
que la prueba es la única red posible.

### Repintado al cambiar de ancho

Se escucha el cambio del `matchMedia` y se vuelve a llamar a `buildNav()` al
cruzar los 900px. Girar el teléfono o cambiar el tamaño de la ventana no puede
dejar el menú con la forma del otro modo.

## El acordeón

- Al **abrir el cajón** se calcula desde cero: abierto el tema que contiene la
  pantalla activa, los otros cerrados. El enganche natural es `toggleSidebar()`
  (`app.js:731`), que es lo que abre el cajón.
- **Tocar otro tema** lo abre y cierra el que estuviera abierto.
- **Tocar el tema abierto** lo cierra. Se queda viendo los cinco encabezados: es
  una acción suya, no una sorpresa.
- **No se guarda nada** entre visitas. No hace falta `localStorage`: `navTo()`
  cierra el cajón al navegar (`app.js:731-732`), así que cada apertura parte del
  mismo estado predecible.

### Cómo se sabe cuál es el tema actual

De la entrada que lleva la clase `.active`, que es como el menú ya marca la
pantalla actual (`app.js:703`).

**Caso límite real:** en `app.js:1336` se quita el `.active` de **todas** las
entradas, o sea que existe el caso de "ninguna activa". Cuando no hay tema
actual, se abre el primero (Día a día). Nunca se muestra el menú con los cinco
temas cerrados de entrada.

### Cómo se oculta un tema cerrado

Con el atributo `hidden` en el contenedor, **más una regla explícita**:

```css
.nav-grupo[hidden]{display:none;}
```

La regla no es redundante. `hidden` oculta porque la hoja del navegador le pone
`display:none`, y **cualquier `display` que escribamos nosotros le gana**. El día
que alguien ponga `.nav-grupo{display:flex}` para separar las entradas, los temas
cerrados volverían a verse y no habría ningún error que lo avisara.

## Accesibilidad

Esta es la mitad del trabajo, no un extra.

- **Los encabezados pasan a ser `<button>`**, con `aria-expanded` que refleja su
  estado real y `aria-controls` apuntando al `id` de su contenedor.
- **Se les quita el `aria-hidden`** que llevan hoy. Ese atributo existía para tapar
  el desajuste entre el orden del DOM y el visual; con contenedores reales ya no
  hay desajuste que tapar, y un botón que se puede pulsar no puede estar oculto al
  lector de pantalla.
- **Las entradas pasan de `<div onclick>` a `<button>`**: alcanzables con Tab,
  activables con Enter y Espacio, y anunciadas como controles. En escritorio esto
  **añade** navegación por teclado donde hoy no la hay.
- **El foco no se pierde al plegar.** Si el foco está dentro del tema que se
  cierra, se mueve al `<button>` de ese encabezado. Sin esto, quien navegue con
  teclado se queda con el foco en un elemento oculto y vuelve al principio de la
  página.

**Cuidado con el aspecto:** un `<button>` trae fondo, borde, tipografía y
alineación propios del navegador. Hay que neutralizarlos para que el menú no
cambie ni un píxel — ni en móvil ni, sobre todo, en escritorio.

### Lo que sigue sin arreglarse

El resto de la app tiene 16 elementos más creados como `<div>` con `onclick`.
Este trabajo arregla el menú, que es la puerta de entrada a todo, y **no** los
demás. Queda apuntado, no resuelto.

## El contador que se escondía

Hoy el badge de mensajes sin leer cuelga de la entrada "Mensajes"
(`app.js:697`) y se ve siempre que abras el cajón. Con "Mensajes" dentro de un
tema cerrado dejaría de verse: el código no falla —el elemento sigue en el DOM y
`app.js:4154` lo encuentra— pero **la persona ya no se entera de que tiene
mensajes**. Es una pérdida real de información que el trabajo habría introducido
sin querer.

La solución acordada: el encabezado de un tema cerrado que contenga algo sin leer
muestra un punto. No dice cuántos son —el número exacto sigue dentro, en su
entrada— pero se ve que ahí hay algo. El punto aparece y desaparece con el mismo
dato que ya gobierna el badge, para que no haya dos verdades que mantener.

## Lo que NO debe cambiar

**En escritorio: nada visible.** Las mismas 19 entradas, en el mismo orden, con
el mismo aspecto. Lo único que cambia es que ahora se pueden usar con el teclado.

Esta es la restricción que manda sobre todas las demás, y no es teórica: **ya se
rompió una vez, hoy mismo.**

## Cómo se verifica

- **Ejecutando `buildNav()` de verdad en los dos modos**, como ya hace la prueba
  de `backend/test/menu-agrupado.test.js`. En modo escritorio: las 19 entradas en
  orden `NAV`, sin encabezados y sin ningún `--ord`. En modo móvil: **un
  contenedor por tema con entradas visibles** —cinco para el pastor, cuatro para
  un líder de cuerpo, porque "Administración" le queda vacía y no se pinta— y las
  claves correctas dentro de cada uno.
- **Que ninguna regla nueva de plegado viva fuera del `@media`.** La prueba
  existente ya vigila esto para `--ord`; hay que trasladarla a lo que la sustituya.
  Ese fue literalmente el fallo de esta tarde.
- **Que el número del `@media` coincida con la constante del JS** (ver arriba).
- **Que `aria-expanded` refleje el estado real** del contenedor, no un valor fijo.
- **A mano, en un navegador de verdad a 390px de ancho**, con los tres roles del
  seed (`MONTESION` / `1234`: pastor 19 entradas, líder 12, feligresa 9) — y
  recorriendo el menú **solo con el teclado**, que es lo que ninguna prueba
  automática de este proyecto puede comprobar.
  ⚠️ **Nunca con `scripts/with_server.py`**: en Windows deja el node huérfano y la
  siguiente ejecución lee una base de datos vieja.

## Lo que esto NO resuelve

- **El umbral de 12 sigue siendo un número elegido, no medido.** Nadie sabe aún
  cómo usa el pastor la app en el teléfono.
- **Dos personas de la misma iglesia siguen viendo el menú con estructura
  distinta**, según crucen o no el umbral.
- **A un líder de cuerpo se le pinta "Pastoreo" con una sola entrada debajo.** La
  regla descarta grupos vacíos, no grupos de uno. Sigue igual que hoy.
- **El resto de la app no se vuelve accesible por teclado** (ver arriba).

## Riesgos conocidos

**El precedente que importa.** El diseño del menú agrupado dio por hecho que
ocultar los encabezados por CSS equivalía a "el escritorio no cambia". No
equivalía: `buildNav()` reordenaba el DOM sin mirar el ancho, y en escritorio 12
de las 19 entradas del pastor cambiaban de sitio, con los encabezados
simplemente invisibles en vez de neutralizados. Se coló hasta la revisión final.

Este trabajo toca la misma función y tiene la misma restricción. La diferencia es
que ahora hay una prueba que ejecuta `buildNav()` de verdad — y esa prueba, a su
vez, **estuvo rota** por un detalle de finales de línea y no se descubrió hasta
fusionar. Las dos cosas juntas dicen lo mismo: en esta parte del código, una
prueba que no se ha visto fallar no cuenta como prueba.
