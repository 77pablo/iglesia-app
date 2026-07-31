# El menú del móvil, agrupado por temas — Diseño

**Fecha:** 31 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado por el dueño; listo para plan de implementación

## De qué se trata

El menú lateral (`web/app.js:8-30`, pintado por `buildNav()` en `:585`) enseña
una entrada por módulo visible. En escritorio caben todas de golpe. **En el
móvil es un cajón deslizante a pantalla completa** (`styles.css:381-383`, por
debajo de 900px), y con 19 entradas hay que desplazarse sí o sí para llegar a
casi cualquier cosa.

Cuántas entradas ve cada rol, medido contra la siembra:

| Rol | Entradas |
|---|---|
| **Pastor** | **19** |
| Líder de cuerpo | 12 |
| Tesorero · maestra de ED · músico | 10 |
| Feligrés | 9 |
| Obispo | 8 |
| Super-admin | 5 |

**El problema está concentrado en el pastor**, que es justo quien más módulos
tiene. Un feligrés ve 9, que no es un muro.

## Decisiones tomadas (31 jul 2026)

| Decisión | Elegido | Descartado |
|---|---|---|
| Dónde se arregla | **Solo el móvil.** En escritorio caben las 19 y verlas de golpe ayuda | Reorganizar también el escritorio: más trabajo, y obliga a reaprender a quien ya se sabe el menú |
| Forma | **Agrupar por temas con encabezados, todo a la vista** | **Secciones plegables** (acorta el scroll de verdad, pero cuesta un toque más en casi toda navegación); **barra inferior con los 4 más usados** (lo más cómodo… si se acierta con esos 4, y hoy **no se sabe** qué usa el pastor de verdad) |
| A quién se le agrupa | **Solo a quien tiene el menú largo** (umbral: **12** entradas) | Agrupar a todos: al feligrés le añadiría 4 líneas sin resolverle nada — pasaría de 9 líneas a 13 |
| Encabezados en escritorio | **No.** Se ocultan por CSS por encima de 900px | Mostrarlos también: no acorta nada donde ya caben, y toca una pantalla que nadie se quejó |

## Los grupos

Los **22** módulos del `NAV` quedan repartidos así. Cada uno pertenece a
**exactamente un** grupo, y no sobra ni falta ninguno:

| Grupo | Módulos |
|---|---|
| **Día a día** | `inicio` · `calendario` · `anuncios` · `mensajes` · `directorio` · `predica` |
| **Lo mío** | `mi_servicio` · `mi_grupo` · `ajustes` |
| **Pastoreo** | `panel_pastor` · `cuidado_pastoral` · `mensajes_portal` · `asistencia` · `reportes` · `panel_obispo` |
| **Ministerios** | `servicio_gestion` · `musicos` · `ninos` · `organizacion` |
| **Administración** | `tesoreria` · `admin` · `superadmin` |

Dos asignaciones que no son obvias y son deliberadas:

- **`predica` va en "Día a día", no en "Ministerios".** La ve **todo el mundo**
  (`app.js:400` la deja pasar siempre), no es un ministerio de nadie: es donde
  la congregación lee las notas del sermón.
- **`ajustes` va en "Lo mío", no en "Administración".** Es el tema y el color
  **de quien mira**, no administración de la iglesia. Bajo "Administración"
  sugeriría que toca algo de la congregación.

El **orden dentro de cada grupo** y el orden de los grupos son los de la tabla.
Respecto al `NAV` de hoy, ningún módulo cambia de posición relativa dentro de su
grupo.

## El umbral

**Se agrupa solo si la persona ve 12 entradas o más.** Por debajo, lista plana,
exactamente como hoy.

Qué se cuenta, sin ambigüedad: **las entradas del `NAV` que sobreviven al filtro
`tieneModulo()`** — es decir, las que esa persona vería pintadas. No los módulos
que devuelve el backend (`modulosVisibles`), que es una lista distinta: no
incluye los que el frontend deja pasar siempre (`predica`, `ajustes`, `mensajes`,
`directorio`, `inicio`) y sí incluye claves que no son entradas de menú
(`calendario_completo`). Contar la lista equivocada daría un umbral que no
corresponde a lo que se ve.

| Rol | Entradas | Resultado |
|---|---|---|
| Pastor | 19 | agrupado |
| Líder de cuerpo | 12 | agrupado |
| Tesorero · maestra · músico | 10 | plano |
| Feligrés | 9 | plano |
| Obispo | 8 | plano |
| Super-admin | 5 | plano |

El 12 es **un número elegido, no una verdad**. La lógica que lo sostiene: los
encabezados existen para resolver un problema de **largo**, así que solo
aparecen donde hay largo. Por debajo cuestan más de lo que ahorran — a un
feligrés le convertirían 9 líneas en 13.

> ⚠️ **Consecuencia asumida:** dos personas de la misma iglesia pueden ver el
> menú con estructura distinta. Es un paso pequeño sobre algo que ya pasa (cada
> rol ve entradas distintas), pero conviene saberlo antes de que alguien lo
> reporte como bug.

**Un encabezado cuyo grupo se quede sin entradas visibles no se pinta.** Con el
umbral en 12 no debería darse (quien agrupa tiene módulos de sobra), pero la
regla evita un encabezado huérfano si mañana cambian los permisos.

## Qué NO cambia

- **El backend no se toca.** Ni `modulosVisibles`, ni permisos, ni rutas.
- **Ninguna entrada aparece ni desaparece.** Quien veía un módulo lo sigue
  viendo; quien no, sigue sin verlo. Esto es **solo** presentación.
- **El escritorio queda idéntico** — los encabezados se ocultan por encima de
  900px, el mismo corte que ya usa el cajón (`styles.css:381`).
- **No se toca `tieneModulo()` ni `navTo()`.** Solo cómo `buildNav()` pinta.
- **El badge de mensajes sin leer** sigue colgando de su entrada
  (`app.js:590`).

## Cómo se comprueba

**Una prueba a nivel de código fuente** —el mismo patrón que ya usa la del
escapado de la bandeja— que fije que **toda clave del `NAV` pertenece a
exactamente un grupo**: ni sin asignar, ni en dos.

Ese es el modo de fallo que importa: si mañana alguien añade un módulo al `NAV`
y olvida meterlo en un grupo, la entrada **desaparecería del menú agrupado sin
dar ningún error** — el pastor dejaría de ver un módulo y nadie se enteraría.
Con la prueba, falla en voz alta al añadirlo.

**En navegador**, a 390px de ancho:

- Como **pastor**: los cinco encabezados, las 19 entradas bajo el suyo, y
  navegar sigue funcionando.
- Como **feligrés** (`maria`): **lista plana, sin ningún encabezado** — es el
  caso que el umbral protege.
- Ensanchando a escritorio: **los encabezados desaparecen** y el menú se ve
  como hoy.

## Fuera de alcance, a propósito

- **No se pliegan las secciones.** Se descartó: acorta el scroll pero cuesta un
  toque más en casi toda navegación, y hay que recordar qué estaba abierto.
- **No hay barra inferior ni accesos rápidos.** Dependen de saber qué usa la
  gente de verdad, y **hoy no se sabe**. Si algún día hay ese dato, se puede
  construir encima de esto sin deshacerlo.
- **No hay buscador en el menú.**
- **No se reordenan los módulos** más allá de agruparlos.
- **No se toca la accesibilidad de las entradas.** Hoy son `<div onclick>` y no
  botones reales; es una carencia previa y arreglarla es otro trabajo.

## Riesgo conocido

**Esto mejora buscar, no acorta el scroll.** Las 19 entradas siguen ahí y el
cajón sigue midiendo lo mismo, más los cinco encabezados. Lo que cambia es que
se salta por secciones en vez de leer 19 etiquetas seguidas.

Si al probarlo resulta que lo que molesta es **la longitud** y no la búsqueda,
la respuesta correcta es la opción que se descartó (secciones plegables), y este
diseño es el paso previo natural: los grupos ya estarían definidos.
