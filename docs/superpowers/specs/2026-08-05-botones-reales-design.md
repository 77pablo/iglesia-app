# Botones de verdad fuera del menú — Diseño

**Fecha:** 5 de agosto de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado (5 ago 2026); listo para escribir el plan. Ver "Decidido por el dueño" al final.

## De qué se trata

Es la mitad pendiente de la brecha de accesibilidad que dejó anotada el trabajo
del menú (ESTADO, sección del 31-jul, punto 4 de "sigue sin resolver"): el menú
ya se usa con teclado, pero **fuera de él quedan 21 controles que son `<div>`
(y un `<span>`) con `onclick`** — no se alcanzan con Tab, no se activan con
Enter ni Espacio, y un lector de pantalla no los anuncia como nada.

Inventario medido hoy sobre `web/app.js` (los números de línea son del commit
`58e221c` y van a moverse; lo estable es la descripción):

| Zona | Qué es | Líneas |
|---|---|---|
| Panel de inicio | 3 widgets (calendario, mi servicio, notificaciones) | 893, 899, 903 |
| Panel de inicio | 2 mini-items (próximo evento, anuncio) | 927, 932 |
| Calendario | las celdas de día (`cal-cell`) | 1080 |
| Notificaciones | `notif-item` cuando es navegable | 1494 |
| Asistencia | tarjeta de evento (`hojaAsistencia`) | 1539 |
| Asistencia | fila de persona, **toggle** presente/ausente | 1577 |
| Música | zona clicable de la tarjeta de canción | 1935 |
| Música | zona clicable de la fila del setlist | 1965 |
| Música | `×` de quitar integrante (`<span>`) | 2012 |
| Himnario | canción del modal (`hmodal-song`) | 2178 |
| Cuidado pastoral | tarjeta de caso | 2308 |
| Escuela Dominical | `module-card` de clase | 2756 |
| Prédicas | tarjeta de prédica | 3154 |
| Obispo | tarjeta de iglesia, 2 widgets, tarjeta de prédica | 3267, 3298, 3299, 3303 |
| Organización | tarjeta de hoja | 4612 |

**No son controles y quedan fuera:** los 6 `onclick="event.stopPropagation()"`
de los modales, y el overlay del cajón del menú (`index.html:100`), que es un
fondo, no un control.

## La decisión: botones de verdad, no ARIA imitada

De los dos enfoques (convertir a `<button>` real · dejar los divs con
`role="button"` + `tabindex` + manejador global de teclado), el dueño eligió
**botones de verdad**. Es el precedente exacto del menú — *"son `<button>` de
verdad, no `<div onclick>`"* — y compra la semántica completa gratis: foco,
Enter, Espacio y anuncio del lector, sin ritual que recordar en cada div
nuevo.

## Comportamiento

- Los 21 controles pasan a `<button type="button">` **conservando sus clases y
  sus `onclick` actuales**. Ningún handler ni lógica JS cambia; cambia la
  etiqueta que los envuelve.
- Visual **idéntico a hoy**: la clase nueva `.btn-plano` neutraliza la
  apariencia nativa del botón y deja que las clases existentes (`widget`,
  `item-card`, `cal-cell`, …) manden en layout, padding y color.
- Foco visible: `.btn-plano:focus-visible` con outline `--primary`. El
  contenido va sobre fondo claro; el aro blanco del menú era por el fondo
  oscuro de la barra y aquí no aplica.

## Cambios concretos

1. **`web/styles.css`:** la clase de reseteo, una vez:
   `.btn-plano{appearance:none;-webkit-appearance:none;background:none;border:0;font:inherit;color:inherit;text-align:inherit;padding:0;cursor:pointer}`
   y `.btn-plano:focus-visible{outline:2px solid var(--primary);outline-offset:2px}`.
   Los `style="cursor:pointer"` sueltos de esos divs se vuelven redundantes y
   se quitan al convertir cada uno.
2. **`web/app.js`:** cada control del inventario cambia `<div …
   onclick=…>` por `<button type="button" class="btn-plano …" onclick=…>`
   (y el `</div>` de cierre correspondiente por `</button>`), conservando el
   resto de atributos. Casos finos:
   - **Fila de asistencia** (toggle): botón con `aria-pressed="${on}"`, para
     que el lector diga el estado. Cuando no es editable (`editable` falso),
     sigue siendo el div estático de hoy.
   - **Notificación:** botón solo cuando `dest` existe; si no, div como hoy.
   - **Canción y setlist:** se convierte **solo la zona clicable interna**
     (el div con `flex:1`), nunca la tarjeta entera — al lado hay botones
     reales y un botón no puede anidar otro.
   - **`×` de quitar integrante:** `<button type="button" class="btn-plano"
     aria-label="Quitar del equipo" …>×</button>` (hoy solo tiene `title`;
     un lector leería "×").
   - **Celdas del calendario** (`cal-cell`): botón por celda; la grilla y las
     clases de estado (`today`, `finde`, `sel`, `tiene`) quedan igual.

## Errores y casos borde

- **Botón dentro de botón está prohibido por HTML** y el navegador lo
  desanida en silencio, rompiendo el layout: por eso canción/setlist
  convierten la zona interna. La caminata visual del final revisa
  específicamente esas dos pantallas.
- Los botones nativos no heredan `font` ni `color` — sin `.btn-plano` cada
  conversión se vería distinta. La clase va **antes** que las conversiones en
  el orden del plan para que nunca exista un commit con botones sin reseteo.
- `width`: las clases existentes gobiernan el ancho (flex/grid/block); si a
  algún caso el shrink-to-fit nativo del botón le encoge el ancho, el arreglo
  es `display` en su clase existente o `width:100%` puntual — se detecta en la
  caminata visual, no se preventiva a ciegas.

## Testing

- **Barrido-candado nuevo** (`backend/test/botones-reales.test.js`): lee
  `web/app.js` y exige que todo `<div`/`<span` con `onclick` restante sea
  exactamente uno de los 6 `stopPropagation` de modales (lista blanca con
  motivo escrito). Cualquier div clicable futuro rompe el test con un mensaje
  que dice qué usar en su lugar. Con `\r?` antes de cada `\n` en los regex
  (lección CRLF del ESTADO).
- **Candado CSS:** `.btn-plano` y su `:focus-visible` existen en
  `web/styles.css`.
- **Caminata Playwright final** (como la del menú): en 390 px y 1280 px,
  visual idéntico, Tab recorre y Enter activa, sobre panel de inicio,
  calendario, asistencia (incluido el toggle con `aria-pressed`) y música.
- Suite completa (`cd backend && npm test`, **621** al partir) en verde en
  cada tarea.

## Riesgo residual, aceptado

- Los tests son candados de fuente, no de comportamiento en navegador — es la
  convención de la casa (no hay banco de pruebas de navegador). La caminata
  Playwright cubre el hueco una vez; no queda automatizada.
- El overlay del cajón sigue sin ser control de teclado (es fondo); si algún
  día se quiere Esc-para-cerrar explícito, es trabajo aparte.

## Decidido por el dueño

- Enfoque **A: botones de verdad** con clase de reseteo compartida; nada de
  `role="button"` sobre divs.
- Visual idéntico como requisito: cualquier descuadre visible es un fallo a
  arreglar antes de fusionar.
- Alcance: solo `web/app.js` + `web/styles.css`. Los 6 `stopPropagation`, el
  overlay, `kiosko.html`/`inscribir.html` y las páginas legales quedan fuera.
