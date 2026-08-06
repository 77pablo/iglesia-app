# Tanda G — el barrido XSS cubre las tres categorías

**Fecha:** 6 de agosto de 2026 · Aprobada por Pablo el 5-ago, sin decisiones
suyas pendientes. Extiende el barrido del 5-ago
(`xss-interpolaciones-atributo.test.js`) a las dos categorías que dejó fuera
a propósito: **manejadores de evento** (~110 interpolaciones) y **cuerpo de
texto** (~711). Esta spec se escribió al cierre: las decisiones de abajo
salieron de MEDIR primero (el script de medición vivió en el scratchpad).

## Qué quedó construido

- `xss-analisis.js` — el tokenizador y las reglas mecánicas, extraídos a un
  módulo compartido: los tres barridos usan EXACTAMENTE el mismo mecanismo.
- `xss-manejadores.test.js` — barrido de onclick/onchange/href-javascript,
  **con rigor completo**: cero pendientes. 22 sitios numéricos no demostrables
  por forma se envolvieron con `Number()` en `web/app.js`; 10 excepciones con
  motivo verificado, y los motivos que cargan más peso con prueba propia.
- `xss-cuerpo.test.js` — barrido del cuerpo de texto, **con trinquete**: las
  reglas nuevas y los arreglos bajaron la cola de 367 a **199 firmas**
  (`PENDIENTES`), que solo puede encoger.

## Los hallazgos que valían más que el barrido

**Tres formateadores devolvían texto CRUDO en sus fallbacks.** `parseFecha`
aceptaba cualquier cosa con dos guiones, así que `fechaTxt('a-b-<img...>')`
y `chipFecha` soltaban el tercer trozo sin escapar; y `fechaDeUTC` devolvía
los 10 primeros caracteres crudos de lo que no parseara. Arreglados en el
helper (no sitio por sitio): `parseFecha` exige `\d{4}-\d{2}-\d{2}`,
`fechaTxt` descarta fallbacks con `<>&"'` y backtick (descarta, NO escapa —
escapar doblaría el escape de los llamadores que ya hacen
`escHtml(fechaTxt(...))`), y `fechaDeUTC` solo deja pasar forma de fecha.
Con eso los tres se vuelven seguros POR CONSTRUCCIÓN y entran a la lista de
ayudantes del barrido de cuerpo; tres candados fijan los arreglos.
**Además `cap()` iba crudo en 6 sitios** (ahora `escHtml(cap(...))`) y los
dos leftovers anotados para esta tanda (los `onclick` de `filaMov` y el
`id="mov-corregir-…"`) **ya estaban arreglados** — la lista envejeció otra vez.

## Decisiones de diseño

| Decisión | Elección | Por qué |
|---|---|---|
| Sitios numéricos no demostrables (params locales `id`, `personaId`…) | Envolver con `Number()` en el código, no excepciones | Autodocumentado, encoge la lista de excepciones, y `Number()` ya estaba en la lista blanca |
| Regla `X\|\|Y` / `X&&Y` | Segura si todos los operandos lo son | El resultado de `\|\|`/`&&` es SIEMPRE uno de los operandos |
| Template anidado como expresión (cuerpo) | Cuenta como literal | Sus `${}` internos NO se saltan: el tokenizador los recolecta aparte y se clasifican uno a uno; lo único que se da por bueno es el HTML fijo del programador. Autocomprobación incluida |
| Tablas `MAYUSCULAS[...]` (cuerpo) | Seguras | SOLO porque un test exige que cada tabla usada se declare con puros literales |
| Ayudantes extra del cuerpo (16) | Lista blanca | Cada uno LEÍDO antes de entrar; el motivo va junto al nombre |
| La cola del cuerpo (199 firmas) | **Trinquete**, no clasificación total | Son labels y trozos de HTML en variables locales: clasificarlos con rigor pide rastrear asignaciones (dataflow) — un candado así de listo es un candado fácil de equivocar. El trinquete garantiza: código nuevo limpio, y la lista solo encoge (una firma sin sitio rompe la suite; un sitio sin firma también) |
| Firma del trinquete | 25 chars de contexto + `⟨⟩` + expresión (espacios normalizados) | Estable ante ediciones en otras partes del archivo; no depende de números de línea |

## Fuera de alcance, a propósito

- **Quemar las 199 firmas de PENDIENTES.** Es trabajo por lotes para tandas
  futuras: coger 20-30 firmas, verificar/arreglar cada sitio, borrarlas.
- Rastrear asignaciones de variables locales (dataflow) para clasificar
  `${chips}` y compañía mecánicamente.
- `kiosko.html`/`inscribir.html` (despliegue facial aparte, igual que el
  barrido de botones).

## Cómo se verifica

- 18 tests nuevos entre los dos barridos (autocomprobaciones incluidas: el
  clasificador tiene que VER un ataque de mentira en cada categoría).
- Suite completa en verde tras los arreglos de helpers (los tests de fechas
  conviven con el `parseFecha` estricto).
