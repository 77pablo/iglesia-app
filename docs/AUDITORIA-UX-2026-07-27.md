# Auditoría UX medible — 27 de julio de 2026

Reemplaza la tabla F3–F14 de `AUDITORIA-2026-07-20.md`, que quedó desactualizada: al verificarla contra el código, 6 de 7 hallazgos revisados ya estaban cerrados y el informe que la respaldaba había desaparecido del repo.

**Cómo se repite esta auditoría** (esta vez la lista no se vence, porque se vuelve a generar):

```bash
# 1. Sembrar una BD de prueba con datos en cada módulo
node <semilla> ux.db
# 2. Arrancar el servidor con el limitador desactivado (el recorrido hace ~260 llamadas
#    y el límite general corta en 100 cada 15 min)
DB_PATH=ux.db DISABLE_RATE_LIMIT=1 node backend/src/server.js
# 3. Correr el auditor
python scripts/auditoria-ux.py --iglesia MONTESION --usuario lider --password demo1234
```

Recorre 11 vistas × 3 anchos (390/768/1280) × 2 temas = 66 combinaciones, y mide área táctil, nombre accesible, contraste y desborde horizontal.

## Resultado

| Chequeo | Antes | Después |
|---|---|---|
| Botón de solo ícono sin nombre accesible | 36 | **0** |
| Área táctil bajo el mínimo AA (24×24) | 54 | **0** |
| Contraste bajo AA (4.5:1) | 75 | **0** |
| Área táctil bajo lo recomendado (44×44) | 1062 | 1080 |
| Desborde horizontal | 0 | 0 |

La última fila no es un defecto: son ítems de menú de 42px de alto y botones pequeños de 36px, todos por encima del mínimo exigible. Subirlos altera el ritmo visual de la app entera, así que quedan como decisión de diseño, no como deuda.

## Qué se arregló

**Moneda unificada (CLP).** Convivían dos formatos: `es-MX` en Tesorería (`$1,250,000`) y `es-CL` en Organización (`$1.250.000`). Ahora hay un solo `money()` en `es-CL` para toda la app. No se muestra el código "CLP": en Chile `$` se lee como peso sin ambigüedad.

**El acento como texto se separó del acento como fondo.** Causa de fondo del contraste en tema oscuro: `aplicarAjustes()` fija los colores del acento como estilos en línea sobre `:root`, con los mismos valores en ambos temas. El azul del logo (`#1C61A6`) sobre una superficie oscura da 2.7:1, y el tono 700 sobre el fondo de chip daba **1.78:1** — el número del día del calendario era prácticamente invisible. No se podía aclarar `--primary` sin más, porque también es el fondo de los botones (texto blanco encima). Se añadió `--primary-tx`: igual al acento en claro, aclarado con `color-mix` en oscuro, y sigue al acento que cada persona elija en Ajustes.

**Rojos y verdes de texto.** 23 estilos en línea usaban `var(--red)` y `var(--green)` —los colores vivos, pensados para fondos e íconos— como color de texto. Ahora usan `--red-tx` y `--green-tx`, el par que la propia paleta ya tenía definido para eso en ambos temas.

**Organización (el módulo nuevo, y los tres eran míos):** los botones ✕ medían 11×31 px y no tenían nombre accesible (un lector de pantalla los anunciaba solo como "botón"); ahora usan `.link.icon-only` con `aria-label` que nombra la cosa o el gasto. El checkbox de "cosas a llevar" medía 13×13 px, el tamaño nativo; ahora mide 24×24.

**El calendario en móvil escondía el fin de semana** (arreglado el 28 de julio). A 390px la grilla tenía un ancho mínimo de 480px con scroll lateral, así que se veía de LUN a VIE: sábado y domingo quedaban fuera, justo los dos días que más importan en una app de iglesia. Ningún chequeo automático lo marcaba —no hay desborde de página, la grilla tenía su propio scroll— pero saltaba a la vista en la captura. Ahora las 7 columnas entran en pantalla y cada evento se muestra como un punto del color de su grupo, igual que en los calendarios de iOS y Android; el toque va a la casilla y abre el detalle del día con títulos, horas y lugares. En escritorio no cambia nada: los eventos siguen con su texto.

## Lo que queda abierto (decisión de producto, no se tocó)

**El límite de peticiones es demasiado bajo para una red compartida.** `limiterGeneral` permite **100 peticiones cada 15 minutos por IP**, y cada vista de la app hace entre 1 y 6 llamadas. Toda la congregación conectada al wifi del templo sale por una sola IP pública: entre todos agotan la cuota en minutos y la app empieza a responder "Demasiadas peticiones" a gente que no hizo nada raro. Lo mismo con `limiterLogin` (5 intentos por IP cada 15 min) si varias personas entran seguidas desde el mismo lugar. Esto no es teórico: bloqueó la propia auditoría dos veces. La corrección natural es contar por persona autenticada cuando hay token, y dejar el conteo por IP solo para el tráfico anónimo.

**Botones por debajo de lo recomendado.** Menú lateral a 42px de alto y botones `small-btn` a 36px. Cumplen el mínimo AA; quedan cortos frente a los 44px recomendados.

## Notas sobre el propio recorrido

- El servidor debe arrancarse con `DISABLE_RATE_LIMIT=1`, si no la auditoría se autobloquea.
- El auditor entra **una sola vez** y reutiliza el token: un login por combinación agota el limitador al sexto.
- El contraste no se mide cuando el fondo es un degradado o una imagen: ahí depende del píxel exacto. Sin ese corte, el texto blanco sobre el hero se reportaba como "1.08:1", que es falso.
