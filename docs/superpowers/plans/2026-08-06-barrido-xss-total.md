# Plan — Tanda G: barrido XSS de manejadores y cuerpo de texto

Spec: `docs/superpowers/specs/2026-08-06-barrido-xss-total-design.md`
Rama: `feat/barrido-xss-total`. La spec se escribió al cierre (medir primero);
este plan registra lo ejecutado y deja anotada la deuda.

## Tarea 1 — Módulo compartido
- [x] Extraer tokenizador + reglas a `xss-analisis.js`; el barrido de
      atributos lo importa sin cambio de comportamiento (8/8 idénticos).
- [x] Commit: `refactor(test): el tokenizador XSS se extrae a xss-analisis.js`

## Tarea 2 — Barrido de manejadores (rigor completo)
- [x] Medir: 110 interpolaciones, 36 sin clasificar.
- [x] `Number()` en los 22 sitios numéricos no demostrables por forma.
- [x] Regla `X||Y`/`X&&Y` en el clasificador.
- [x] 10 excepciones con motivo verificado; los de más peso con prueba propia
      (errCargar, accionesBtns, formMov, guarda `dest` de filaNotif, opt,
      fecha del calendario). Excepción sobrante = fallo (lista que encoge).
- [x] Commit: `feat(test): barrido XSS de manejadores de evento`

## Tarea 3 — Barrido de cuerpo (reglas + trinquete)
- [x] Arreglar los fallbacks crudos: parseFecha estricto, fechaTxt descarta,
      fechaDeUTC filtra por forma; escHtml en los 6 cap(); pad numérico.
- [x] Reglas nuevas verificadas: template-como-contenedor (autocomprobación),
      tablas MAYUSCULAS (test de puros literales), `.size`.
- [x] 16 ayudantes leídos y whitelisted con motivo en línea.
- [x] Cola restante (199 firmas) a PENDIENTES como trinquete: nuevas gritan,
      zombies gritan, la lista solo encoge.
- [x] Suite completa en verde (689).
- [x] Commit: `feat(test): barrido XSS del cuerpo de texto con trinquete`

## Tarea 4 — Documentación y cierre
- [x] Spec al cierre + este plan.
- [x] ESTADO.md: tanda G tachada + sección del día + deuda anotada.
- [x] Merge `--no-ff` a `main`, borrar rama, suite sobre la fusión.

## 🔥 Deuda que deja esta tanda (para quemar por lotes)
- **199 firmas en `PENDIENTES` de `xss-cuerpo.test.js`.** Lote sugerido:
  20-30 firmas por tanda — verificar el sitio (¿el dato puede venir de una
  persona?), arreglar con escHtml/Number o anotar el motivo si se promueve a
  regla/ayudante, y BORRAR la firma. La suite obliga a borrar firmas cuyo
  sitio desaparezca, así que la lista no puede envejecer en silencio.
