# Auditoría UX medible — 28 de julio de 2026 (recorrido ampliado a todas las vistas)

Continúa `AUDITORIA-UX-2026-07-27.md`. Aquella corrida cubría **11 vistas** y dejaba fuera siete: Administración, Panel del Pastor, Reportes, Música, Niños, Cuidado pastoral y Mi Servicio. Por eso se le escaparon hallazgos que luego aparecieron a mano. Ahora el recorrido las incluye y son **20 vistas** (16 claves de `navTo`, cuatro de ellas auditadas también en su sub-estado: día del calendario, hoja de organización, caso de cuidado, clase abierta de Escuela Dominical).

20 vistas × 3 anchos (390 / 768 / 1280) × 2 temas = **120 combinaciones**.

## El problema de permisos, y cómo se resolvió

Ninguna persona ve las 20 vistas: Administración, Panel del Pastor, Reportes y Cuidado son del pastor; Mi Grupo solo lo ve quien pertenece a un grupo; y Música y Niños las *edita* el líder de música y la maestra de Escuela Dominical — el pastor las ve, pero en modo observador, sin los botones de edición, que son la mitad de la interfaz que hay que medir.

La solución está dentro del propio script, no en correrlo varias veces a mano: **cada vista declara con qué usuario se audita**.

```python
VISTAS = [
    ("inicio",     "Inicio",  None, "pastor"),
    ...
    ("mi_grupo",   "Mi Grupo", None, "abel"),      # líder de Jóvenes
    ("musicos",    "Musica",   None, "joaquin"),   # líder de Música
    ("ninos",      "Ninos",    None, "marta"),     # maestra de Escuela Dominical
]
```

El script entra **una sola vez por usuario** (cuatro logins en total: `pastor`, `abel`, `joaquin`, `marta`), guarda cada token y recorre las vistas de cada uno inyectando el token que toca. Los hallazgos de los cuatro se fusionan en un único JSON, con el campo `usuario` en cada uno para saber desde qué sesión salió.

**Si una vista no está en el menú del usuario, el script no revienta ni audita una pantalla de error como si fuera real:** consulta `tieneModulo(clave)` en la propia página antes de navegar y, si da falso, la registra como omitida. Las omitidas salen por consola durante el recorrido, en el resumen final y en la clave `vistas_omitidas` del JSON. En esta corrida no hubo ninguna (0 omitidas): el reparto de usuarios cubre las 20 vistas.

## Cómo se corre (recetas comprobadas en Windows / PowerShell)

```powershell
# 1) BD temporal sembrada con los datos de demo. Puerto 3061, NO 3000:
#    en 3000 suele quedar un servidor huérfano de otra sesión con su BD vieja,
#    y da resultados falsos sin avisar.
#    DISABLE_RATE_LIMIT=1 es obligatorio: el recorrido hace ~400 llamadas y el
#    limitador general corta en 100 cada 15 min.
$env:DB_PATH="$env:TEMP\ux.db"; $env:SEED_ON_EMPTY="1"
$env:DISABLE_RATE_LIMIT="1";    $env:PORT="3061"
$p = Start-Process node -ArgumentList "src/server.js" -WorkingDirectory ".\backend" -PassThru

# 2) Esperar a que responda /api/health y correr el auditor.
#    PYTHONIOENCODING=utf-8: la consola de Windows es cp1252 y los print con emoji revientan.
$env:PYTHONIOENCODING="utf-8"
python scripts\auditoria-ux.py --url http://localhost:3061 `
    --iglesia MONTESION --password 1234 `
    --salida auditoria-ux.json --capturas .\capturas-ux

# 3) Matar el servidor al terminar (no usar with_server.py de la skill webapp-testing:
#    en Windows dice "Server stopped" pero el proceso node sobrevive).
Stop-Process -Id $p.Id
```

- Ya no se pasa `--usuario`: los usuarios salen de `VISTAS`. Sí se pasa `--password`, que es **la misma para todos** los usuarios de la semilla (`1234`).
- `--usuarios pastor,marta` limita el recorrido a esas sesiones, útil para iterar sobre una vista sin esperar los cuatro recorridos completos.
- Tras cada login aparece la **puerta de consentimiento legal**: hay que marcar `#cons-chk` y pulsar "Acepto y continúo", si no `#app` y `#login` quedan ambos ocultos y parece que el login falló. El script ya lo contempla para cada usuario.
- El JSON de salida pasó de ser una lista suelta a un objeto con dos claves: `hallazgos` y `vistas_omitidas`.

## Línea base de las 7 vistas nuevas

Total del recorrido completo: **2589 hallazgos**. De esos, **1239 caen en las vistas nuevas**:

| Chequeo | Vistas nuevas | Resto del recorrido |
|---|---|---|
| Contraste bajo AA (4.5:1) | **9** | 0 |
| Área táctil bajo el mínimo AA (24×24) | **18** | 0 |
| Botón de solo ícono sin nombre accesible | 0 | 0 |
| Desborde horizontal | 0 | **2** |
| Área táctil bajo lo recomendado (44×44) | 1212 | 1348 |

Literal, tal como salió del JSON (agrupado por selector; el ×N es el número de combinaciones ancho/tema en que aparece):

```
-- contraste (9) --
  x3 Musica [dark] a "Abrir cancionero (buscar y tra"  :: 1.79:1 (rgb(0, 0, 238) sobre rgb(22,30,39), 13px)
  x3 Musica [dark] a "descargar PDF"                    :: 1.79:1 (rgb(0, 0, 238) sobre rgb(22,30,39), 13px)
  x3 Musica [dark] b "Himnario Nuevo (respaldo)"        :: 2.65:1 (rgb(28, 97, 166) sobre rgb(22,30,39), 16px)

-- area_tactil_critica (18) --
  x6  Musica                b "Himnario Nuevo (respaldo)" :: 228x20   (umbral 24x24)
  x12 Ninos (clase abierta) input.nino-chk                :: 23x23    (umbral 24x24)

-- desborde_horizontal (2) --  [no es de las nuevas, pero apareció al ampliar el recorrido]
  x2 Organizacion (hoja) [movil] html :: 405px de contenido en 390px de viewport
```

## Qué se arregló

**El enlace suelto no tenía color propio.** Todo `<a>` sin clase (adjuntos, comprobantes, "descargar PDF", "Ver documento", pie legal) heredaba el azul por defecto del navegador, `#0000EE`. Sobre el fondo oscuro eso da **1.79:1**: prácticamente invisible. Se añadió una regla global `a{color:var(--primary-tx)}` en `styles.css`. `--primary-tx` es el acento **como texto** que ya existía desde la Fase 9: sigue al acento que cada persona elija en Ajustes y se aclara solo en tema oscuro. Los enlaces con clase (`.link`, `.btn`, `.legal-footnav a`) no cambian: su propia regla tiene más especificidad.

**El título del himnario fijo, en Música.** Era un `<b>` clicable con `style="color:var(--primary)"` en línea: **2.65:1** en oscuro (el acento como fondo usado como texto, la misma causa que la Fase 9) y **228×20 px** de área táctil, por debajo del mínimo de 24 px. Ahora es `.mus-himnario`, con `--primary-tx` y `min-height:24px` + `padding` (queda en 228×28).

**El checkbox de asistencia de Escuela Dominical medía 23×23.** La regla `.check input` pedía 20 px y los agrandaba con `transform:scale(1.15)`, que pinta 23 px reales: se queda a un píxel del mínimo de WCAG 2.5.8. Ahora son **24×24 de verdad**, sin el `transform`. Es la misma corrección que ya se le había hecho a `.org-check` en la Fase 8, aplicada al checkbox genérico.

**La hoja de Organización desbordaba a lo ancho en móvil** (405 px de contenido en 390 px de viewport). Los cuatro botones de la cabecera —Duplicar, Copiar, Imprimir, Volver— estaban en un `div.row`, que reparte a lo ancho y **no permite salto de línea**. Ahora usan `.btn-fila`, la clase que ya existía justo para un grupo de botones de acción. De regalo, en escritorio los botones dejan de tener la etiqueta partida en dos líneas: con `.row` se les forzaba `flex:1` y "⧉ Duplicar" se rompía.

**Los dos enlaces de la pantalla de login** (`¿Primera vez?…` y `¿Olvidaste tu contraseña?`) llevaban `color:var(--primary)` en línea: 2.65:1 en tema oscuro. Pasan a `--primary-tx`. No los detectó el auditor —el recorrido empieza después del login— pero son exactamente el mismo defecto y el arreglo es un token.

## Resultado

| Chequeo | Antes | Después |
|---|---|---|
| Contraste bajo AA (4.5:1) | 9 | **0** |
| Área táctil bajo el mínimo AA (24×24) | 18 | **0** |
| Botón de solo ícono sin nombre accesible | 0 | 0 |
| Desborde horizontal | 2 | **0** |
| Área táctil bajo lo recomendado (44×44) | 2560 | 2602 |
| **Total** | **2589** | **2602** |

En las 11 vistas que ya estaban limpias **no apareció ningún hallazgo nuevo** de contraste, área táctil crítica, nombre accesible ni desborde: después del arreglo, el único tipo que queda en todo el recorrido es `area_tactil_baja`.

## Lo que no se arregló, y por qué

**`area_tactil_baja` (por debajo de 44×44): 2602 casos, ninguno tocado.** Son ítems del menú lateral (42 px de alto) y botones `small-btn` (36-38 px). Todos superan el mínimo exigible de 24 px (WCAG 2.5.8 AA); los 44 px son el objetivo cómodo de WCAG 2.5.5 (AAA). Subirlos mueve el ritmo visual de la app entera, así que están declarados en `ESTADO.md` como **decisión de diseño, no deuda**.

**Los 42 casos de más en esa fila son el reverso de los arreglos, no una regresión:**
- **18** son los elementos que estaban en `area_tactil_critica` y ahora cumplen el mínimo: el checkbox de niños (23×23 → 24×24) y el título del himnario (228×20 → 228×28). Siguen por debajo de 44, así que el chequeo los sigue nombrando — pero en el nivel de aviso, no en el de defecto.
- **24** son los cuatro botones de la hoja de Organización (6 combinaciones × 4). Antes medían 54 px de alto **porque su etiqueta se partía en dos líneas**, lo que los sacaba del chequeo; ahora miden 38, la altura normal de un `small-btn`, y entran en la misma fila que el resto de los `small-btn` de la app.

**El límite de peticiones sigue siendo un problema de producto** (ver el documento del 27 de julio). No se tocó: es backend.

**`.legal-footnav a` usa `var(--primary)`** en las páginas legales. Se dejó como está: esas páginas no cargan `app.js`, nunca se pintan en tema oscuro, y sobre blanco el acento da 6.35:1.
