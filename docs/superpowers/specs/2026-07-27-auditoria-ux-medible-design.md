# Auditoría UX medible + arreglos de accesibilidad y moneda — Diseño

**Fecha:** 27 de julio de 2026
**Motivo:** La tabla F3–F14 de `docs/AUDITORIA-2026-07-20.md` se venció: al verificarla contra el código actual, 6 de 7 hallazgos revisados ya estaban cerrados. El informe detallado que la respaldaba (`.superpowers/audit/frontend-ux.md`) ya no existe en el repo. Una lista que nadie puede re-verificar deja de ser útil a las pocas semanas.

## Objetivo

Reemplazar la lista vencida por un **script que se vuelve a correr**, y arreglar lo que encuentre.

## Qué se construye

### 1. `scripts/auditoria-ux.py` — el auditor

Recorre la app con Playwright y **mide** en vez de opinar. Por cada vista, ancho y tema, comprueba:

| Chequeo | Umbral | Por qué |
|---|---|---|
| Área táctil | < 44×44 px | Debajo de eso el dedo falla; es el mínimo de las guías de Apple y WCAG 2.5.5 |
| Botón de solo ícono sin nombre accesible | sin `aria-label`, `title` ni texto | Un lector de pantalla lo anuncia como "botón", sin más |
| Contraste de texto | < 4.5:1 (< 3:1 si es ≥ 24px o ≥ 19px en negrita) | WCAG 2.1 AA |
| Desborde horizontal | `scrollWidth > clientWidth` en `body` | Obliga a hacer scroll lateral en móvil |

**Cobertura:** login, inicio, calendario (mes y día), anuncios, mensajes, directorio, organización (lista y hoja), tesorería, asistencia y mi grupo. Se omiten los paneles de obispo y super-admin: los usa una sola persona y no justifican el costo del recorrido.

**Matriz:** 390 px (móvil), 768 px (tablet) y 1280 px (escritorio) × tema claro y oscuro.

**Salidas:** `auditoria-ux.json` con un hallazgo por línea (vista, ancho, tema, selector, medición, umbral) y una captura por combinación, para revisión visual de lo estético, que no se automatiza.

El script recibe la URL por parámetro y no siembra datos: la BD de prueba se prepara aparte, igual que en la verificación de Organización.

### 2. Arreglos

**Moneda (confirmado con el dueño: Chile, CLP).** Hoy conviven dos formatos: `money()` en Tesorería usa `es-MX` (`$13,000.00`) y `fmtMonto()` en Organización usa `es-CL` (`$13.000`). Se unifican en **un solo helper** en `es-CL`, sin decimales, usado por ambos módulos y por cualquier monto futuro. No se muestra el código "CLP" en pantalla: en Chile `$` se lee como peso sin ambigüedad, y añadirlo a cada cifra es ruido.

**Lo que levante el auditor** se arregla con esta regla, decidida de antemano para que el trabajo no se desborde:

- **Se arregla en el acto** lo acotado y sin decisión de producto detrás: `aria-label` faltante, `min-height`/`min-width` táctil, un color con contraste insuficiente, un desborde causado por un ancho fijo.
- **Se anota sin tocar** lo que exija rediseñar una vista o decidir algo de producto. Queda en el informe final para que el dueño decida.

## Verificación

El mismo script es la prueba: se corre antes (línea base), se arregla, y se vuelve a correr. Un hallazgo está cerrado cuando desaparece del JSON, no cuando parece corregido. Las capturas del después se revisan a ojo para confirmar que ningún arreglo rompió la composición.

La suite de backend (`cd backend && node --test`) debe seguir en verde: el helper de moneda es frontend, pero Tesorería tiene tests que podrían depender del formato.

## Fuera de alcance

- Rediseñar vistas.
- Paneles de obispo y super-admin.
- Accesibilidad de teclado y navegación por tabulador: es un trabajo propio, con su propio recorrido.
- Los hallazgos B5–B7 de la auditoría vieja: se verificaron cerrados en el código actual.
