# 📌 ESTADO DEL PROYECTO — App de Iglesia

## 🆕 8 DE AGOSTO DE 2026 · TARDE (2) — 🧺 las cosas a llevar avisan igual que el gasto

**Fusionada a `main`** (merge de `chore/cosas-avisan`, `--no-ff`, suite
**795/795 verde medida SOBRE la fusión**, rama borrada; no queda ninguna rama
viva). Cierra la **asimetría** que este documento tenía anotada.

`addCosa`, `borrarCosa` y `toggleCosa` llamaban a `_recargar()` **sin mirar el
resultado**. Cuando ese GET falla, la lista se queda con la versión de antes y
lo único que la persona lee es el *"Sin conexión"* genérico que suelta `abrir`
por su cuenta — que habla de la red, no de **su** cambio. Y como la lista no lo
enseña, lo natural es **volver a añadir lo mismo** (un duplicado en la hoja con
la que el grupo se reparte qué lleva cada uno) o **volver a pulsar la ✕** sobre
algo que ya no existe.

Las tres esperan ahora su recarga, la piden **en silencio** (dos avisos
apilados dejan arriba el genérico y debajo el único que dice qué hacer) y, si
falla, dicen las dos cosas: que el cambio **sí** se guardó y por qué no se ve,
con el motivo concreto de `api()` y **escapado**. `toggleCosa` es la distinta:
en el camino bueno no recarga a propósito (la casilla ya se pintó sola), así
que su aviso cubre el caso de que la casilla quede diciendo lo contrario de lo
que hay guardado.

⚠️ **Y destapó un arnés frágil, que se reparó:** el test *"borrar un gasto y
borrar una cosa preguntan antes"* leía una **ventana fija de 14 líneas**
(`slice(i, i + 14)`). Al crecer `borrarCosa`, el `danger:true` se salió por
abajo y el test acusó al código de un defecto que no tenía. Ahora recorta el
método contando llaves, con aviso si se desborda. **Un número mágico de líneas
mide el tamaño del método, no lo que dice.** Acreditado por mutación: quitándole
el `danger:true` a `borrarCosa` (`07ea187a` → `dbb5d221`) el test cae, y
restaurado vuelve a verde.

---

## 🆕 8 DE AGOSTO DE 2026 · TARDE — 🪢 tres cabos cortos cerrados y fusionados

**FUSIONADA a `main`** (merge `851c6e7`, `--no-ff`), con la suite en **787/787
verde medida SOBRE la fusión**, la rama borrada y el árbol limpio: **no queda
ninguna rama viva**. Partía de 784, que es lo que dejó la fusión del arnés de
recortes. ⬆️ **Sin subir:** 8 commits contados con
`git log origin/main..main --oneline` (los 3 del arnés con su fusión, los 3 de
esta tanda con la suya), **más el commit de documentación que estás leyendo,
que hace 9**. Vuelve a contarlos igualmente: esa suma se equivocó tres veces
seguidas el 7-ago, siempre por olvidar el commit que se estaba escribiendo.

**El día empezó midiendo, y desmintió a las notas dos veces:**
1. Lo del 7 y 8 de agosto **ya estaba subido y desplegado** (`main` ==
   `origin/main` en `6245410`, `/api/health` en 200). La memoria decía "12
   commits sin subir": caducado.
2. Había una rama viva que **ninguna nota mencionaba**, `chore/arnes-recortes`,
   con la suite verde medida sobre ella. Fusionada (`c838d43`), 778 verde sobre
   la fusión, y borrada junto a `chore/limpieza-profunda`, que ya estaba dentro
   de `main` entera.

**Los tres cabos:**

- **`admin.js` — el `UPDATE` que se aplicaba y después devolvía 400.** Las dos
  guardias de "no puedes hacerte esto a ti mismo" vivían cada una dentro de su
  bloque, así que un PATCH con `{activo:true, es_pastor:false}` sobre la propia
  cuenta escribía el `activo` y **luego** rechazaba: un 400 con media petición
  hecha. Ahora van juntas y antes de la primera escritura.
  ⚠️ **Ninguna prueba de comportamiento puede distinguir el código bueno del
  malo aquí** —sobre la propia cuenta `activo` solo puede escribirse a `true`,
  y quien pide ya está activo—, y por eso el candado mira la **forma**
  (`admin-guardias-antes-de-escribir.test.js`), acreditado por los dos lados
  con el fichero real: sin el arreglo (sha `5F413BFC`) rojo citando la línea,
  con él (sha `B278F246`) verde.
- **`nino.familia` queda FUERA del aviso del nombre, y por fin con motivo
  escrito** (spec de corregir-nombre, sección 2-bis nueva). El motivo es lo que
  de verdad se guarda ahí: el *apellido* de la familia (`'Gomez'`, `'Ruiz'`), que
  el frontend pinta como `Familia ${x.familia}` — y la búsqueda es un `LIKE` del
  nombre **completo** viejo, que en un apellido no cabe. Fijado con un test y
  **acreditado por mutación** (ampliar el `LIKE` a `familia`, sha `74dd2911` →
  `90dec1ad`, lo pone rojo).
- **El motivo del fallo de recarga deja de perderse** en los dos caminos
  silenciosos de `guardarGasto`. Decía "la hoja no se pudo actualizar. Recarga
  la página" y se tragaba lo que `api()` ya sabía: con un 429 la app tiene
  escrito *"Espera un momento"* y la persona leía lo contrario de lo que hay que
  hacer. `abrir()` guarda el motivo en `Org._motivoFallo` y **sigue devolviendo
  un booleano a propósito** (quien lo llama hace `if(alDia)`, y un texto no
  vacío siempre sería "sí" — el mismo fallo que este bloque ya pagó con una
  promesa sin `await`). `Org._porQue()` lo entrega **escapado**, con test de
  `<img onerror>`, porque `modalAviso` mete su texto crudo en `innerHTML`.

**El cabo del `await` nunca estuvo abierto — y la nota que lo abría se
equivocaba en las DOS mitades.** Decía: *"quitar los dos `await` deja la suite
en verde: hoy la única defensa es un comentario"*, y que para arreglarlo hacía
falta un arnés que no existía. Medido con el mutador (`web/app.js`, sha
`5761d17c` → `580ff0e8`, dos ocurrencias sustituidas y verificadas):
**quitar los dos `await` tira CUATRO tests**. Dos son de esta tanda, pero los
otros dos —*"si además falla la recarga…"* y *"si el gasto se guardó pero la
hoja no se pudo releer…"*— **ya estaban en `6245410`**, con las mismas
aserciones (`recargaOk:false` → `modales.length === 1`), y esta tanda no tocó su
lógica: solo añadió `_porQue` a la lista de métodos que montan. Sin el `await`,
`alDia` es una promesa, toda promesa es "sí", sale el toast de "Gasto
corregido" y esos dos asserts caen. **El candado llevaba ahí desde el 7-ago y
nadie lo comprobó antes de escribir que no existía.**

**Una corrección más a este mismo documento:** la sección del 8-ago · madrugada
decía que hacía falta "un arnés que sepa recortar métodos del literal
`const Org = {`" y que eso no era un arreglo de cinco líneas. **Ya existía**,
en `organizacion-pagador-selector.test.js:68`, y monta nueve métodos reales de
`Org`. Lo que sí faltaba, y se añadió, es la comprobación
**anti-desbordamiento por hermanos**: un recorte que se pasa de largo mide
código ajeno *en verde*. Cazó un fallo real del arnés nuevo mientras se
escribía — con `_porQue`, un método de una línea, el corte no paraba nunca.
Es la misma lección de siempre: **lo que este documento da por imposible hay
que medirlo antes de creerlo.**

**Lo que sigue abierto de la lista corta:** la asimetría de
`addCosa`/`borrarCosa`/`toggleCosa`, que `sitios` **cuente pero no
identifique**, y el `wip` `125c954`. Y uno **nuevo, medido hoy**: el barrido de
clase de "escribir y después rechazar" ve **20 handlers** de los 198 de `src/`
con esa forma (la mayoría son ramas distintas, no defectos) — clasificarlos uno
a uno es una tanda propia, no un cabo.

---

## 🆕 8 DE AGOSTO DE 2026 · MADRUGADA — 🧹 higiene de agosto: se cerraron los cabos, y aparecieron cuatro cosas que valen más

**Rama `chore/higiene-agosto`, 9 commits sobre `main`, aprobada para fusionar y
SIN FUSIONAR al escribirse esto** — la fusión, el borrado de la rama y el push
son de Pablo; compruébalo con `git branch --no-merged main`. Informe y revisión
en `.superpowers/sdd/higiene-a-report.md` y `…-review.md`.
⚠️ **Los 9 commits llevan el trailer `Claude Opus 5 (1M context)`** en vez del
`Claude Fable 5` del resto de agosto, porque los escribió otro modelo. La rama
queda con los dos mezclados: no es un error que haya que arreglar, solo que no
sorprenda a quien mire el historial.

**Lo que cerró** (los seis cabos que la sección del 7-ago dejó anotados, ya
tachados allí): los comodines `LIKE` escapados en `apariciones-nombre.js` · el
helper de consulta de persona · la prueba que faltaba del
`PATCH /admin/usuarios/:id` con `nombre` **y** `activo` a la vez · la
comparación del 409, ahora dentro de la transacción · el comentario del `await`
que prometía un mecanismo que no actúa · y `apariciones.ninos` con dos tipos
bajo la misma clave.
⚠️ **Un matiz del helper que la nota vieja tenía mal:** eran **cuatro** sitios,
no tres — había una cuarta consulta parecida en `descOrigenGasto` que nadie
había contado. Y lo que se repetía y se podía olvidar en el quinto **no era la
consulta, era el `AND iglesia_id = ?`**, que es la línea que aísla a las
congregaciones. `personaDeLaIglesia()` devuelve la fila tal cual y **la regla se
queda en cada llamador**, porque las cuatro son distintas (responsable y pagador
nuevo exigen cuenta activa; el pagador de una corrección solo si la atribución
cambia; el rastro solo quiere el nombre). Un booleano en el helper para elegir
cuál aplicar habría sido peor que la duplicación que sustituye.

🔴 **Y ahora lo que de verdad importa de esta tanda: cuatro hallazgos, ninguno
en el encargo.**

**1. La app YA corre con un segundo proceso escribiendo el mismo fichero, y
nadie lo sabía.** `Dockerfile:53` arranca `docker-entrypoint.sh`, y ese script
en su **línea 64** hace `exec litestream replicate … -exec "node
src/server.js"`: Litestream es un proceso aparte con su propia conexión a
`/data/iglesia.db`, y escribe en la base. O sea que el TOCTOU del 409 **no era
"el día que la app corra en más de un proceso"**: ese día ya llegó.
⚠️ Y por eso hizo falta **`BEGIN IMMEDIATE`, no el `BEGIN` a secas** del resto
del módulo — esta es la única transacción del repo que **lee antes de
escribir**. Con el diferido el candado de escritura se pide recién en el
`UPDATE`, y si otro confirma en el medio SQLite rechaza subir a escritor
(`SQLITE_BUSY_SNAPSHOT`) **y el `busy_timeout` no lo reintenta**: la corrección
**se pierde** y la persona lee un 500. Verificado con dos conexiones de verdad,
no razonado: con `BEGIN` el monto final era el del otro y la corrección se
esfumó; con `IMMEDIATE`, se aplica.
⚠️ **El precio, escrito para que nadie lo descubra de golpe:** el que llega
segundo espera el `busy_timeout` **entero — 5 s** (`PRAGMA` de `db.js:21`;
medido, 5,5 s) y, como `DatabaseSync` es **síncrono**, esos segundos son el
bucle de eventos de ese proceso **parado**. Es el intercambio correcto —antes se
perdía el dato, ahora se espera—, pero no es gratis.
*(Revisadas las otras 20 transacciones del repo: ninguna lee antes de escribir
dentro de su `BEGIN`, así que ninguna necesita cambiar. La única excepción
parcial es `eliminarIglesia.js:73-92`, preexistente y ruta de super-admin:
anotada, no tocada.)*

**2. "Ninguna prueba de Node puede observar esto" resultó FALSO, y la frase iba
a quedarse escrita en el repo.** El implementador la usó como justificación de
por qué el arreglo del 409 no llevaba prueba del escenario real. El revisor la
desmintió de la única forma que vale: **escribiendo la prueba**, en ~40 líneas y
sin dependencias nuevas — una segunda conexión `DatabaseSync` al mismo fichero
(que es literalmente lo que sería otro proceso) y una costura síncrona en
`db.exec` que la dispara justo cuando el manejador abre su transacción. Y lo que
midió es peor de lo que se temía: sobre el código de **antes** del arreglo, el
escenario no solo respondía **200** — **devolvía el monto a su valor viejo,
llevándose por delante la corrección del otro proceso**. Si la frase se queda,
le enseña a la siguiente tanda a no intentarlo.

**3. La prueba que guardaba el cabo de riesgo no lo guardaba.** Comprobaba
**dónde estaba una cadena de texto**, no que la fila se releyera: sustituyendo
la relectura por `.get(-999) || gasto` —la forma se conserva, la relectura no—
la suite entera seguía en verde. Se podía vaciar el arreglo de sustancia sin que
cayera una sola prueba. **Es la tercera vez este mes** que un candado resulta
guardar la forma en vez del comportamiento.

**4. Renombrar no basta para que un fallo deje de ser silencioso — y la nota que
este documento tenía escrita era falsa.** Decía que un `ninos_n` / `ninos` haría
el cruce de los dos avisos "imposible". **Está medido que no:** con las claves ya
distintas y sin comprobación de forma, la lista del pastor leída en modo conteo
produce *«Tu nombre anterior sigue escrito en 1 prédica(s)»* — la ficha del niño
**se cae del aviso y lo que queda parece un aviso completo**, que es peor que
desaparecer, porque nadie sospecha que falta justo la mitad que importa. Hicieron
falta **tres** piezas, no una: claves distintas, **un solo lector**
(`avisoNombreViejo(apariciones, modo)`, `web/app.js:3801`) al que cada pantalla
le **declara qué forma espera** y que **grita** ante una que no cuadra en vez de
enseñar medio aviso, y un candado que impide que vuelva a haber un segundo
lector. Ese candado no es decorativo: hay una mutación (la pantalla del pastor
pidiendo el modo `conteo`) que **solo él** detecta, de las 778 pruebas.

⚠️ **La regla de método, que ya nos ha costado ocho veces y va aquí en grande.**
Un mutador por **shell se come las barras** (tres intentos perdidos del
implementador, y otros tres del revisor), y un patrón **multilínea con `\n` no
casa nunca** porque estos ficheros están en **CRLF** (tres más del revisor). En
los dos casos el resultado es un **verde que no significa nada**. Lo que sí
funciona, y es lo que hay que usar de aquí en adelante: **mutador en Node,
cadenas de una sola línea, que EXIJA encontrar el texto y enseñe el hash del
fichero antes y después.** Léase junto con el falso verde por CRLF de la sección
"7-ago · noche (2)": **es la misma enfermedad**, y su regla es la misma — un rojo
se demuestra solo, un verde hay que acreditarlo.

**Tres cabos nuevos, anotados a propósito y NO arreglados:**
- ⚠️ **`backend/src/admin.js:193-199` — un `UPDATE` que se aplica y después
  devuelve 400.** Un `PATCH /admin/usuarios/:id` con `{activo:true,
  es_pastor:false}` sobre la propia cuenta escribe el `activo` y **luego** choca
  con la guardia de `es_pastor`. Hoy es **inocuo por una razón sólida que
  conviene tener escrita**: `auth.js:157-158` relee `activo` en cada petición y
  401ea a una cuenta desactivada, así que quien llega ahí estaba activo por
  fuerza y el `UPDATE` no cambia nada. Pero el patrón "guardia **después** del
  `UPDATE`" está a una sustitución de volverse real.
- ⚠️ **La razón principal del `await` no la fija ninguna prueba.** Sin él,
  `alDia` es una promesa —y una promesa siempre es "sí"—, así que el `else` que
  avisa de "la hoja no se pudo actualizar" sería **código muerto en el 100 % de
  las ejecuciones** y la app diría "Gasto corregido" con el GET caído. Quitar los
  dos `await` deja la suite en verde: hoy la única defensa es un comentario. Lo
  que haría falta no es un arreglo de cinco líneas: que el arnés sepa recortar
  **métodos del literal `const Org = {`**, no solo funciones de nivel superior —
  y eso no serviría solo aquí, `Org` tiene hoy más manejadores sin arnés posible.
- `nino.familia` sigue siendo otro texto libre que puede nombrar a una persona y
  **no está ni entre los sitios que busca el aviso del nombre ni en el "Fuera de
  alcance" de la spec**. Probablemente correcto dejarlo fuera; solo que no está
  escrito.

**Lo que NO cerró esta tanda y sigue abierto** (comprobado): la pérdida del texto
específico del error en los dos caminos silenciosos (intercambio aceptado), la
asimetría de `addCosa`/`borrarCosa`/`toggleCosa`, que `sitios` **cuenta pero no
identifica**, y el `wip` `125c954` con la suite roja ya dentro de `main`.

Suite: **778** (partía de 755; medida sobre el head `fad70a3` con
`cd backend && npm test`; **caduca con la próxima rama**).

---

## 🆕 7 DE AGOSTO DE 2026 · NOCHE (2) — 🔒 el candado de los sitios, ya en los tres barridos XSS

**Rama `chore/candado-barridos-xss`, 5 commits sobre `main`.** ~~Aprobada para
fusionar y SIN FUSIONAR al escribirse esto~~ — **fusionada el mismo 7-ago (merge
`a85de3c`, rama borrada, suite 755 verde sobre la fusión) y subida a GitHub esa
noche**; compruébalo con `git branch --no-merged main`, no con esta línea. Cierra el
cabo que dejaron los cabos de agosto unas horas antes: el candado nuevo estaba
en **uno de los tres** barridos. Ahora está en los tres. **Ningún commit toca
`web/app.js`**: es todo red de seguridad. Informe y revisión en
`.superpowers/sdd/candado-barridos-report.md` y `…-review.md`.

**Qué ganó cada barrido.** `xss-manejadores.test.js` gana el conteo de sitios;
`xss-interpolaciones-atributo.test.js` gana el conteo **y el zombie-check, que
no tenía** (nadie comprobaba allí que una excepción siguiera correspondiendo a
algún sitio del código). Las **tres colisiones** que se midieron al cerrar los
cabos están declaradas con `sitios: 2` y sus **seis sitios re-auditados uno a
uno**: `onchange::fechaSelectAjustarDias('${prefijo}')` (los `<select>` de mes y
de año), `class::${okClase}` (el `cf-ok` de `modalConfirm` y el `mp-ok` de
`modalPrompt`) y `class::estado-chip ${cls}` (la lista de casos y el detalle).

**Se borró un atajo que era código muerto ESTRUCTURALMENTE, no por casualidad.**
El barrido de atributos perdonaba `editFn`/`delFn` cuando el atributo era
`onclick`, y ese `if` era inalcanzable: `clasificarInterpolaciones()` enruta cada
grupo por su atributo, `'onclick'` está en `ATRIBUTOS_DE_MANEJADOR`, y
`hallarAtributos()` devuelve solo la otra mitad. **El revisor lo midió en vez de
razonarlo:** sacando `'onclick'` de ese `Set`, con el `if` quedaban 9 sitios sin
clasificar y sin él **11** — los dos de diferencia son exactamente `editFn` y
`delFn`. O sea que el día del refactor ese `if` habría **regalado un permiso
general a dos sitios sin contarlos**, mientras el barrido mandaba auditar los
otros nueve: justo el agujero que esta rama existe para cerrar. Sin él, salen en
la lista de fallos. **Falla cerrado**, que es la única dirección aceptable en una
red de seguridad.

**Cuatro excepciones que descansaban en un comentario tienen ahora una prueba
detrás:** las tres `id::${prefijo}-dia/-mes/-anio` y el `onchange` del otro
fichero decían que `prefijo` nunca trae un dato de una persona. Ahora lo fija una
prueba que recorre **las 12 llamadas** a `fechaSelectHTML` del archivo y solo
admite dos formas: un literal, o exactamente `'el'+id` (la de
`formEditarLeccion`) — y que ese `id` sea entero tampoco se da por supuesto: otra
aserción exige que su único llamador lo siga envolviendo en `Number()`.

🔴 **La lección de esta rama, que es lo que este documento premia: la prueba
nueva nació BURLABLE DE DOS FORMAS, y las dos las encontró el revisor MUTANDO, no
leyendo.**
1. El regex admitía cualquier `'literal'+identificador`, así que
   `fechaSelectHTML('x'+nombre, …)` pasaba en verde — y ese prefijo sale literal
   dentro de `onchange="fechaSelectAjustarDias('${prefijo}')"`, donde una comilla
   simple se sale del literal JS.
2. El descarte del comentario de documentación usaba `includes('//')`, que se
   traga cualquier línea con un `https://` dentro: una llamada escondida en una
   línea con una URL **se autodescartaba**. Es decir, un descarte que falla
   **abierto** dentro de una red de seguridad. Ahora es `/^\s*\/\//` (solo si la
   línea empieza por `//`), y el revisor comprobó con un control positivo que ese
   descarte **sigue haciendo falta**: quitándolo, la prueba salta sobre el
   comentario de la línea 1010.

⚠️ **Y hubo un FALSO VERDE por CRLF, que le pasó al implementador y al revisor.**
Un script de mutación buscaba `\n` en ficheros que git devuelve con **CRLF**, así
que no llegó a mutar nada y la mutación "pasó" sin haberse aplicado — que se
parece muchísimo a un candado que no muerde. De ahí sale **la regla que conviene
no olvidar: un resultado ROJO se demuestra solo** (el `AssertionError` de estos
candados cita el texto mutado — `'x'+nombre`, `líneas 1039, 1040`…, y eso no puede
salir de un archivo sin mutar); **el VERDE no prueba nada** sin (a) enseñar que el
archivo cambió de verdad y (b) un control positivo que salga rojo por el mismo
camino. Las rojas se autoacreditan; las verdes hay que acreditarlas.

**Y lo que más vale de la rama no es el arreglo: es que se dejó de declarar la
zona limpia.** El cierre anterior decía *"ya no queda ninguna afirmación conocida
sin prueba detrás"*, y era falso — **tres veces en esta misma rama** una frase
prometió más de lo que el código sostiene. En su lugar hay ahora un **mapa de los
bordes**, de lo que cada candado **NO** cubre (está en la sección "N-3" del
informe, y los bordes de cada pieza también en los comentarios de cada fichero):
- **El conteo de sitios** no dice si un motivo es *cierto*, solo que el número
  cuadra; **no ve las llamadas** a los helpers (añadir una llamada no crea sitios
  de atributo), que solo cubren las pruebas propias de `fechaSelectHTML`,
  `accionesBtns`, `formAporte`, `formMov`, `errCargar`, `opt` y `alternarGrupo`
  — cualquier helper sin una de esas siete sigue descansando en un comentario; y
  no alcanza al atajo de `location.origin`, que **perdona sin contar** (puede,
  porque perdona una *expresión* segura en cualquier sitio, no un *sitio* seguro
  por quien lo llama — y con su condición de caducidad escrita: si algún día se
  ensancha a algo que dependa del contexto, baja a `EXCEPCIONES` y cuenta).
- **La prueba del prefijo** no fija que `'el'+id` siga siendo el único caso de esa
  forma si mañana aparece otro con ese mismo nombre de variable (se ata al
  nombre, no a la procedencia; el revisor lo reprodujo en las dos direcciones),
  ni mira el segundo argumento.
- **Los tres barridos miran `web/app.js` y solo ese archivo, por análisis de
  texto:** HTML generado en el servidor o cargado aparte no pasa por aquí.

Si alguien encuentra otro borde, **el sitio de apuntarlo es esa lista, no una
frase que diga que ya no quedan.**

Suite: **755** (752 + 3; medida sobre el head `fd0bee1` con
`cd backend && npm test`, 755 pass / 0 fail; **caduca con la próxima rama**).

---

## 🆕 7 DE AGOSTO DE 2026 · NOCHE — 🧵 los tres cabos de agosto: el gasto a quien existe, el nombre que se quedó escrito, y la hoja que se pisaba

**Rama `feat/cabos-agosto` TERMINADA y revisada (14 commits sobre `8b89fb4`),
pero SIN FUSIONAR al escribirse esto** — la fusión (`--no-ff`), el borrado de la
rama y el push los hace Pablo. No te fíes de esta línea: compruébalo con
`git branch --no-merged main`. Spec:
`docs/superpowers/specs/2026-08-07-cabos-agosto-design.md`; plan:
`docs/superpowers/plans/2026-08-07-cabos-agosto.md`; el ledger tarea a tarea en
`.superpowers/sdd/progress.md` ("Plan 2026-08-07 cabos-agosto") y las dos
vueltas de la revisión de rama en `.superpowers/sdd/review-final-rama.md`.

**Cabo 1 — un gasto nuevo ya no puede nacer a nombre de una cuenta dada de
baja.** El alta (`POST`) exige persona **activa** de la misma iglesia, con el
mismo mensaje que ya usaba el responsable de la hoja. El matiz está en la
corrección: el `PATCH` solo exige cuenta activa **si la atribución cambia**
(`pagadoPor !== gasto.pagado_por`), porque arreglarle una falta de ortografía al
gasto histórico de alguien que se dio de baja no puede obligar a quitarle la
atribución. Cierra el punto 5 de los pendientes de "Fuente del gasto".

**Cabo 2 — corregir un nombre avisa dónde sigue escrito el viejo.** La decisión
de producto, escrita para que no se vuelva a discutir: **avisar, nunca
reescribir.** La lista de quién puede retirar a un niño (`nino.autorizados`, la
que se mira en la puerta de la sala) y el predicador de una prédica o un sermón
(que se ven en el portal público) son **textos libres**: un reemplazo automático
de subcadenas haría estropicios, porque "Juan" vive dentro de mil frases. La app
busca (`LIKE` acotado por iglesia, con el nombre **viejo**, y solo cuando el
nombre cambió de verdad) y avisa; no toca una letra.
⚠️ **Y el aviso no es el mismo para todos, a propósito.** Quien se corrige a sí
mismo desde "Mi perfil" ve **solo conteos**; el pastor, desde Administración, ve
**el detalle** con el nombre de las fichas. Un `LIKE` con un nombre común casa
con fichas de otra gente, y de qué niño hablan esas fichas no es asunto de un
feligrés. La diferencia vive en el **servidor**, no en la pantalla:
`directorio.js` manda `ninos: <número>` y `admin.js` manda
`ninos: [{id, nombre}]`.

**Cabo 3 — corregir un gasto que otro ya cambió da 409, no lo pisa.**
Comparar-y-guardar sin tocar el esquema: al abrir el ✏️ la pantalla captura lo
que estaba mostrando (`{concepto, monto, fuente, pagado_por}`), lo manda en el
`PATCH` como `visto`, y el servidor lo compara contra la fila guardada **antes**
de aplicar nada. `null` cuenta como valor ("no se sabe quién puso" también se
puede pisar). **El campo es OPCIONAL, y eso no es un detalle de zod:** un
`app.js` viejo que no lo mande sigue corrigiendo gastos como siempre, así que
backend y frontend **no** tienen que desplegarse juntos — justo al revés de lo
que exigió la fuente del gasto (punto 8 de sus pendientes). Cierra el punto 10.
⚠️ **El aviso del choque NO es el mensaje del backend.** El servidor dice
"recarga la hoja", pero para cuando eso se lee la hoja ya se releyó sola y el
formulario quedó vacío y repintado como el de un gasto **nuevo**: quien vuelva a
teclear ahí crea un **duplicado**. La pantalla escribe el suyo —dice que la
corrección no se guardó y manda a abrir otra vez el ✏️ de ese gasto— y va por
`modalAviso`, que se queda hasta que se pulsa "Entendido", no por un toast de
2,8 s.

🔴 **Las dos lecciones de review de esta tanda, que es lo que más vale de ella:
en las dos, quien implementaba tenía razón contra quien revisaba.**
1. **El agujero del barrido XSS: se arregló la clase, no la instancia.**
   `modalAviso` (nacido en esta misma rama) compartía firma **byte a byte** con
   `modalConfirm` —el mismo `<p style="margin:8px 0 16px">`— y el barrido
   descarta **por firma, no por sitio**: el sumidero nuevo entró blanqueado por
   una excepción escrita para otra función, y nada falló. La review propuso dos
   remedios —cambiarle el margen al `<p>` para que generara firma propia, o
   enmendar el `motivo`— y el implementador **demostró que los dos eran
   peores**: el primero mueve HTML de producción por una razón que solo existe
   en el test y **no impide que vuelva a pasar** con otras dos funciones; el
   segundo deja la garantía donde estaba, en un comentario que nada comprueba.
   Lo que hizo en su lugar: cada excepción declara a **cuántos sitios** cubre
   (`sitios`, por defecto 1) y el conteo se comprueba en las dos direcciones. **La
   prueba de que era la clase y no la instancia:** al declararlo aparecieron
   **otras cuatro** excepciones que ya cubrían dos sitios cada una sin decirlo
   (`matchMedia`, el chip de estado de casos ×2, el contador de la bandeja).
   Ninguna de las dos propuestas de la review las habría encontrado. El revisor
   reprodujo las dos mutaciones él mismo y le dio la razón.
2. **M2: el diagnóstico de la review encadenaba mal la causa.** Decía "sin
   `await` → `Org._hoja` caduca → 409 que acusa a un compañero de lo propio". El
   eslabón del medio no depende del `await`: **si el GET falla, la hoja se queda
   caduca con `await` y sin él.** El `await` no es el arreglo, es la
   **precondición** para poder *saber* si la hoja se releyó. Lo que cierra el
   daño es el `else` que el implementador añadió por su cuenta: cuando la
   recarga falla, un aviso dice que el gasto **sí** se guardó y que hay que
   recargar la página, en vez de un "Gasto corregido" a secas que ahí es
   afirmativamente falso. El revisor retiró su diagnóstico y aprobó el alcance
   extra.

⚠️ **Verificación manual pendiente de Pablo.** Toda la evidencia de esta rama es
unitaria, con DOM de mentira: **nadie ha abierto esta app en dos navegadores.**
Estos son los pasos de `review-final-rama.md` **ya corregidos por su adenda**
(los originales pedían otra cosa en dos de ellos y les faltaba el 2):
1. **El pisotón (cabo 3), el que importa.** Abre la app en dos navegadores (o
   uno normal y uno de incógnito) y entra en los dos con una cuenta que pueda
   editar la hoja (`raquel`); abre en los dos **la misma** hoja de Organización,
   con al menos un gasto. En **A**: ✏️ de ese gasto, cambia el concepto, **NO
   guardes**. En **B**: ✏️ del **mismo** gasto, cambia el monto y **guarda**.
   Vuelve a **A** y pulsa "Guardar cambios". Tiene que pasar: la corrección de A
   **no** se aplica, la hoja de A se repinta sola con el monto de B, y sale un
   aviso que dice que no se guardó y que abra otra vez el ✏️. **Lo que hay que
   juzgar ya no es si dio tiempo a leerlo** (se queda hasta "Entendido"), sino
   **que el aviso aparezca de verdad** después de que la hoja se repinta debajo:
   está seguido en el código (`_render` no toca `modal-root`), pero nadie lo ha
   visto en un navegador.
2. **La recarga que falla** (el alcance que se añadió en M2). Con la hoja
   abierta, corrige un gasto y, **en cuanto pulses "Guardar cambios"**, corta la
   red (modo avión, o DevTools → Network → Offline) para que falle la relectura.
   Debe salir un aviso diciendo que la corrección **sí** se guardó pero que hay
   que recargar la página — **no** un "Gasto corregido" a secas.
3. **La cuenta inactiva (cabo 1).** Como líder, abre una hoja de Organización y
   **déjala abierta sin recargar**. En otra ventana, como pastor, desactiva en
   Administración a alguien que salga en el selector de "quién puso el dinero".
   Vuelve a la ventana del líder (sin recargar) y añade un gasto a nombre de esa
   persona: se niega con un mensaje en castellano que dice que la cuenta está
   inactiva, y hay que comprobar que el gasto **no** quedó anotado.
4. **El aviso del nombre (cabo 2).** Elige a alguien que salga en los
   `autorizados` de alguna ficha de niño **y en ninguna prédica**. Entra como esa
   persona, Directorio → "Mi perfil", cámbiale el nombre y guarda: el modal debe
   decir *"…en 1 ficha(s) de niños (lista de quién puede retirarlos). Pídele a tu
   maestra…"*, **sin ningún "y 0 prédica(s)"** (eso era M1, arreglado antes de
   cerrar). Después, como pastor, Administración → "Corregir nombre" sobre esa
   misma persona: ahí el modal **sí** nombra la ficha del niño, y el nombre del
   niño tiene que salir bien escrito.

Suite: **752** (partió en 721; medida sobre el head `8db4546` con
`cd backend && npm test`, 752 pass / 0 fail; **caduca con la próxima rama** — no
la repitas de memoria).

**Lo que queda anotado y sin cerrar.** Ninguno bloquea; los dos primeros son los
que hay que entender antes de tocar nada:

- **(cerrado esa misma noche, unas horas después, por la rama
  `chore/candado-barridos-xss`** — ver la sección "7 de agosto · noche (2)". Los
  tres barridos cuentan ya los sitios, el de atributos ganó además el
  zombie-check que le faltaba, y **las tres colisiones que se midieron aquí están
  declaradas con `sitios: 2` y sus seis sitios re-auditados**. De paso cayó un
  atajo que era código muerto y habría perdonado dos sitios sin contarlos el día
  de un refactor. La medición de abajo es la que abrió esa rama, así que se deja
  escrita entera.**)** ~~🔴 **La misma clase de agujero sigue abierta en los otros dos barridos XSS.**
  El `sitios` solo se aplicó a `xss-cuerpo.test.js`. `xss-manejadores.test.js:79`
  y `xss-interpolaciones-atributo.test.js:186` siguen construyendo su
  `EXCEPCIONES_MAP` con la clave-firma y comprobando **mera existencia**, que es
  exactamente lo que dejó entrar a `modalAviso`. Y no es teórico: **hoy hay tres
  excepciones que cubren dos sitios cada una sin declararlo** —
  `onchange::fechaSelectAjustarDias('${prefijo}')` (los selectores de mes y de
  año), `class::${okClase}` (el `cf-ok` de `modalConfirm` y el `mp-ok` de
  `modalPrompt`) y `class::estado-chip ${cls}` (la lista de casos y el detalle
  del caso). Los tres `motivo` **sí** nombran hoy los dos sitios, así que no hay
  nada blanqueado sin auditar; lo que falta es el candado que lo compruebe.
  ⚠️ *Medido, no leído: se corrió el clasificador de `xss-analisis.js` sobre
  `web/app.js` al cerrar la tanda. La adenda de la review afirma que no hay
  colisiones vivas en las otras dos listas — **es falso**, son tres.* El arreglo
  se aplicó a **uno de los tres** barridos: candidato claro para la próxima tanda
  de higiene.~~
  ⚠️ **Lo que NO cerró esa rama y sigue en pie:** el `sitios` **cuenta, no
  identifica** (bullet de abajo), y el mapa de bordes de la sección "noche (2)"
  lista lo que ningún candado cubre. La frase "ya no queda nada" no vale aquí.
- 🔴 **El commit `125c954` es un `wip` con la suite ROJA a sabiendas, y aterriza
  en `main` con el merge `--no-ff`. Se deja a propósito.** Está ahí porque la
  sesión se cortó a mitad de la tarea 6 y se prefirió guardar el estado real a
  inventar un commit verde. **No hay CI en este repo** (verificado: no existe
  `.github`), así que no rompe nada automático; el único coste es que un
  `git bisect` futuro sobre `main` se pare en un commit rojo. Fundirlo en
  `4f8d909` es un rebase no interactivo trivial, pero **rehacer la historia es
  decisión de Pablo**, no del agente que lo escribió.
- ⚠️ **`sitios` cuenta, no identifica.** Si uno de los dos sitios que cubre una
  excepción lo sustituye otra función distinta y el total sigue en 2, el candado
  no lo ve. Mucho mejor que antes, pero no es hermético.
- **(cerrado el 8-ago, higiene de agosto** — el comentario dice ahora las dos
  cosas que el `await` sí da: que `alDia` sea un sí/no y no una promesa, y que no
  se pueda encadenar otra corrección desde el mismo botón. ⚠️ **Pero de ahí salió
  un cabo nuevo:** esa razón principal **no la fija ninguna prueba** — ver la
  sección del 8-ago.**)** ~~**El comentario del `await` promete un mecanismo que no es el que actúa**
  (`web/app.js:5561-5566`): dice que `conBoton` mantiene el botón apagado "hasta
  que la hoja esté repintada" para justificar que se cierra la carrera del ✏️,
  pero `conBoton` apaga **solo el botón que se pulsó**, no los ✏️ de las filas,
  que no los desactiva nadie. Esa ventana se cura sola cuando el GET aterriza (y
  si falla, es justo el caso que cubre el `else` nuevo). El código es correcto;
  la frase, no.~~
- **Se pierde el texto específico del error en los dos caminos silenciosos:** si
  el GET falla, la persona lee "recarga la página" en vez del mensaje concreto de
  `api()` (con un 429 diría eso en lugar de "espera un momento"). Intercambio
  aceptado a cambio de quitar el aviso apilado.
- **Asimetría con el resto de la hoja:** `addCosa` / `borrarCosa` / `toggleCosa`
  siguen llamando a `_recargar()` sin mirar el resultado, así que si su GET falla
  la persona ve el "Sin conexión" genérico y no se entera de que su cambio sí se
  guardó. Justificado —solo el gasto compara-y-guarda, y por tanto solo ahí una
  hoja caduca provoca una acusación falsa—, pero visible.
- **(cerrado el 8-ago, higiene de agosto** — ver la sección del 8-ago. 🔴 **Y la
  última frase de aquí abajo era FALSA, está medido:** renombrar a secas no lo
  hace imposible. Con las claves ya distintas y sin comprobación de forma, el
  cruce produce *«…sigue escrito en 1 prédica(s)»* — la ficha del niño se cae y
  el aviso **parece completo**, que es peor que desaparecer. Hicieron falta tres
  piezas: claves distintas, **un solo lector** que grita ante una forma que no
  cuadra, y un candado contra el segundo lector.**)** ~~**`apariciones.ninos` viaja con dos tipos bajo la misma clave:** número desde
  autoservicio, array desde admin. La diferencia de privacidad es correcta y está
  en la spec, pero si alguien cruza los manejadores, `[{…}] > 0` es `false` y el
  aviso **desaparece en silencio** en vez de romperse. Un `ninos_n` / `ninos` lo
  haría imposible.~~
- **(cerrado el 8-ago, higiene de agosto** — `comoTextoLiteral()` escapa `%`, `_`
  y la propia barra, y las tres consultas declaran `ESCAPE '\'`.**)** ~~**Comodines `LIKE` sin escapar** (`backend/src/apariciones-nombre.js:20`):
  `perfilSchema` solo exige 1..120 caracteres, así que quien se ponga `%` de
  nombre y luego lo corrija recibe el recuento de **todas** las fichas de niños
  con autorizados y de todas las prédicas **de su propia iglesia**. Es solo un
  número, el aislamiento entre iglesias se respeta y las prédicas ya son públicas
  en el portal: daño bajo. Se cierra escapando `%`, `_`, `\` y añadiendo
  `ESCAPE '\'`.~~
- **(cerrado el 8-ago, higiene de agosto:** la comparación vive dentro, y la
  transacción es `BEGIN IMMEDIATE`. 🔴 **La frase tachada de abajo era falsa en su
  parte clave, y el error fue mío:** grepear `cluster`/`worker_threads` en
  `server.js`, `render.yaml` y `Dockerfile` **no es comprobar que hay un solo
  proceso**. El segundo escritor entra por un fichero que no abrí,
  `docker-entrypoint.sh:64`, donde `litestream replicate -exec "node
  src/server.js"` corre desde el `ENTRYPOINT` del `Dockerfile:53`. **Ya había dos
  procesos contra el mismo `iglesia.db` cuando esto se escribió.** Ver la sección
  del 8-ago.**)** ~~**La comparación del 409 vive fuera de la transacción**
  (`backend/src/organizacion.js:463-468` frente al `BEGIN` de `:536`), al revés
  de lo que dice la spec. **Hoy no hay fallo:** el manejador es síncrono desde el
  `SELECT` hasta el `COMMIT` y Node es de un solo hilo, y no hay cluster ni
  workers en `server.js`, `render.yaml` ni `Dockerfile` (verificado). Pasa a ser
  un TOCTOU real el día que la app corra en más de un proceso o instancia.~~
- **(cerrado el 8-ago, higiene de agosto:** `personaDeLaIglesia()`. ⚠️ **Eran
  cuatro sitios, no tres** — faltaba contar el de `descOrigenGasto` —, y lo que se
  repetía no era la consulta sino el `AND iglesia_id = ?`.**)** ~~La consulta de persona-activa está **duplicada en tres sitios**
  (`organizacion.js:342`, `:414` y la del `PATCH` en `:494`, que lee `activo` en
  vez de filtrarlo): candidato natural a helper, sin urgencia.~~
- **Dos huecos de cobertura y alcance:** ~~falta la prueba del
  `PATCH /admin/usuarios/:id` con `nombre` **y** `activo` a la vez~~ **(escrita el
  8-ago)**, y `nino.familia` es otro texto libre que puede nombrar a la persona y
  que no está ni entre los tres sitios que busca el cabo 2 ni en el "Fuera de
  alcance" de la spec (probablemente correcto dejarlo fuera; solo que no está
  escrito) — **este sigue abierto**.


## 🆕 7 DE AGOSTO DE 2026 — 💰 el libro de la tesorera por fin cuenta los eventos (Camino C)

**Fusionada a `main` el mismo día** (merge `--no-ff`, rama
`feat/rendicion-eventos` borrada). **Sin subir a GitHub** al escribirse esto —
compruébalo con `git log origin/main..main --oneline`. Spec:
`docs/superpowers/specs/2026-08-07-rendicion-eventos-design.md`.

**La decisión que cambió el diseño vino del dueño:** *"la iglesia no devuelve
dinero — dar es voluntario"*. Con eso el **Camino B** (marcar devuelto +
movimiento de devolución) **murió antes de nacer**: no se construyó nada. La
opción "se le devuelve" del formulario **se queda** por si un caso especial la
necesita; la salida de escape documentada es que la tesorera anote esa
devolución como gasto manual en su libro.

**El Camino C quedó calculado, sin copias** (la lección de campañas): el saldo
del resumen y el de transparencia restan lo que la caja pagó en eventos
(`fuente='caja'`) **leyéndolo de las hojas** — un solo dato, imposible que
libro y hoja discrepen. Lo voluntario (`aporte`) y lo marcado "se le devuelve"
**no descuentan** (no salió plata de la caja). `gasMes` sigue siendo SOLO el
libro; la línea nueva `gastosEventosMes` viaja aparte (el mes es el de la
hoja/evento, o el `creado_en` en hora local). Tarjeta plegable "🗒️ Gastos de
eventos" en Tesorería con cada hoja, sus gastos y la fuente en palabras, y
"Ver hoja ›" a la casa donde se corrige. `GET /gastos-eventos` pagina de a 20
hojas.

⚠️ **Consecuencias asumidas, escritas:** el saldo histórico **baja** el día
del despliegue (todos los gastos-caja de hojas viejas por fin descuentan — esa
plata SÍ salió y el libro decía otra cosa); y borrar un evento se lleva sus
gastos del cálculo (naturaleza de lo calculado, igual que la barra de
campañas).

⚠️ **Verificación manual pendiente de Pablo:** como `raquel`, anotar en la
hoja de un evento un gasto "lo pagó la caja" y ver el saldo de Tesorería bajar
al tiro; abrir "🗒️ Gastos de eventos" y saltar a la hoja con "Ver hoja ›".

Suite: **721** (714 + 7; medida al cerrar la rama; caduca con la próxima rama).

---
*Última actualización: 8 de agosto de 2026, **tarde (2)** (**las cosas a llevar avisan**: cerrada la asimetría de `addCosa`/`borrarCosa`/`toggleCosa`, y reparado un arnés que medía una ventana fija de 14 líneas; suite **795**, fusionada, sin ramas vivas). Lo anterior de la misma tarde: **tres cabos cortos** — el 400 que escribía media petición, `nino.familia` decidido, y el motivo del fallo de recarga dentro del aviso; suite **787**. ⚠️ **Queda UNA rama local sin fusionar, `chore/cabos-cortos`** (3 commits) — la fusión, el borrado y el push son de Pablo; mídelo con `git branch --no-merged main` y `git log origin/main..main --oneline`, no con esta línea. ⬆️ **Sin subir:** los 3 de la rama, más el commit de documentación que estás leyendo, más el de fusión si se hace — y encima los **3 del arnés de recortes ya fusionado hoy** (`c838d43`), que tampoco están arriba. **Cuéntalos, no los heredes:** esta línea se equivocó tres veces seguidas el 7-ago por olvidar el commit que se estaba escribiendo. ⚠️ Esta tanda **sí toca `web/app.js`** (`Org._porQue`, `Org._motivoFallo`), así que el despliegue sí se puede verificar buscando ese símbolo en el `app.js` que sirve Render — comparando por CONTENIDO, nunca por tamaño (el servido pesa un byte menos por línea, LF contra CRLF).*

*Lo anterior, que ya caducó y se deja solo como aviso de cómo envejecen estas líneas: 8 de agosto de 2026, madrugada (**higiene de agosto**: los seis cabos del 7-ago cerrados, suite **778**). ⚠️ **Queda UNA rama local sin fusionar, `chore/higiene-agosto`** — aprobada; la fusión `--no-ff`, el borrado de la rama y el push son de Pablo. Compruébalo con `git branch --no-merged main`, no te fíes de esta línea. ⬆️ **Sin subir:** hoy `main` va **1** commit por delante de `origin/main`, y con esta rama fusionada serán **12** — los 9 de la rama, el commit de documentación que estás leyendo, y el commit de fusión. (Esta cuenta se equivocó **tres veces seguidas** el 7-ago, siempre por olvidar el commit que se estaba haciendo; ahora se cuentan los tres sumandos por separado a propósito. Mídelo igual: `git log origin/main..main --oneline`.) ⚠️ **Ningún commit de esta rama toca `web/app.js` salvo comentarios**, así que el despliegue no se verifica buscando código nuevo en el `app.js` de Render.*
*Lo anterior, que sigue valiendo: los **cabos de agosto** (merge `1961032`) y el **candado de los sitios en los tres barridos XSS** (merge `a85de3c`, suite 755 medida sobre la fusión) ✅ **SUBIDOS Y DESPLEGADOS el mismo 7-ago:** Pablo hizo el push de los 33 commits; `main` y `origin/main` sincronizados, `/api/health` en 200, y el `app.js` que sirve Render ya trae `modalAviso` (8 apariciones, las mismas que el local) y el mensaje del choque de ediciones. ⚠️ Antes de subirse, esta línea llegó a decir **31** y luego **32**: las dos veces por no contar el commit de documentación que se estaba haciendo. Mide el número, no lo heredes. ⚠️ Y al comparar el `app.js` de producción con el local, **el desplegado pesa menos**: exactamente un byte por línea (CRLF contra LF). Eso **no** es un despliegue viejo — compara por contenido (`modalAviso`, una frase nueva), nunca por tamaño. **Cuántos planes quedan por ejecutar, el número de tests, y si `main` está fusionada, subida o desplegada caducan con cada rama** — no repitas de memoria nada de eso escrito aquí (ni siquiera esta línea): mira "POR DÓNDE RETOMAR (7-ago · noche 2)" aquí abajo, y compruébalo con `npm test`, `git branch --no-merged main` y `git log origin/main..main --oneline`, y contra el `app.js` que sirve Render.*

---

## 👉 POR DÓNDE RETOMAR (8-ago · tarde)

**Lo primero es de Pablo, no de código, y en este orden:**
1. ~~Fusionar `chore/cabos-cortos`~~ **hecho** (merge `851c6e7`, 787 verde medido sobre la fusión, rama borrada). **No queda ninguna rama viva** — compruébalo con `git branch --no-merged main`, no te fíes de esta línea.
2. **Push** con GitHub Desktop — sube de una vez lo del arnés y lo de esta tanda. Cuenta los commits con `git log origin/main..main --oneline`, no te fíes de ningún número escrito aquí. ⚠️ Esta tanda **sí toca `web/app.js`**: tras el deploy, `Org._motivoFallo` tiene que aparecer en el `app.js` que sirve Render. ⚠️ Si algo "no cambió", sospecha de la **caché del service worker** antes que de un bug: `web/sw.js` es cache-first, probar en incógnito.
3. ⚠️ **Sigue en GitHub la rama `origin/chore/higiene-agosto`** en `3573032` (estado intermedio, anterior a los arreglos de su review). No contiene nada que `main` no tenga; borrarla es decisión de Pablo.

   ⚠️ En `main` sigue el `wip` `125c954` con la **suite roja a sabiendas**: explicado en la sección del 7-ago · noche. Aplastarlo con un rebase o dejarlo **sigue siendo decisión suya**, y cada tanda le añade commits encima.
4. **Las cuatro comprobaciones de navegador de los cabos de agosto** (el pisotón en dos ventanas, la recarga que falla con la red cortada, el gasto a una cuenta inactiva, el aviso del nombre) — están escritas paso a paso en la sección del 7-ago · noche. **Ninguna prueba de Node puede hacerlas**: nadie ha abierto todavía esta app en dos navegadores a la vez. ⚠️ **La higiene del 8-ago cambió el aviso del nombre por dentro** (un solo lector con comprobación de forma), así que al hacer la del nombre hay que mirar además que el modal siga saliendo bien en las **dos** pantallas: conteos en "Mi perfil", ficha del niño en la del pastor.
5. **Las comprobaciones de navegador que siguen pendientes de antes:** las tres del 5-ago (como `raquel`, corregir un movimiento de Tesorería; como `marta`, editar/borrar clases y lecciones y leer el 409; como `pastor`, ver historiales sin lápiz), la de la tanda E (borrar un mensaje de la bandeja y marcar todos como atendidos), la de la tanda F (Registro de actividad filtrado por `raquel`, con la casilla de accesos), la de la tanda H (crear "Culto — todos los domingos" y borrar "esta y las siguientes") y la del Camino C (un gasto "lo pagó la caja" y ver bajar el saldo de Tesorería).
6. Las acciones de Render de siempre siguen abiertas (SMTP, `SUPERADMIN_PASSWORD`, confirmar `R2_*`, `VAPID_*`, abogado) — ver su sección más abajo. **`SMTP_USER`/`SMTP_PASS` es lo único roto de cara a la gente:** sin ellas nadie recupera su contraseña (503).

**Y queda una conversación abierta, no de código:** qué cosa nueva necesita la iglesia. Pablo iba a contarlo y no llegó a responderse.

**No queda ninguna tanda aprobada pendiente.** Los cabos que dejaron los cabos de agosto están cerrados en dos tandas: el candado de los sitios en los tres barridos (`chore/candado-barridos-xss`, esa misma noche) y los seis restantes (`chore/higiene-agosto`, esta madrugada). **Lo que sigue abierto, y es corto** (actualizado la tarde del 8-ago, ver la sección de arriba): ~~el `UPDATE` antes del 400 en `admin.js`~~ **cerrado**, ~~`nino.familia`~~ **decidido y escrito**, ~~el texto del error en los caminos silenciosos~~ **cerrado**. ~~la razón principal del `await` sin prueba~~ **nunca estuvo abierto: medido el 8-ago por la tarde** (ver abajo). ~~la asimetría de `addCosa`~~ **cerrada la misma tarde** (ver la sección de las cosas a llevar). Queda: que `sitios` cuente pero no identifique, y el `wip` `125c954`. **Nuevo, medido el 8-ago por la tarde:** 20 de los 198 handlers de `src/` tienen la forma "escribe y después rechaza" (la mayoría son ramas distintas, no defectos): clasificarlos es una tanda, no un cabo. Y lo que **ningún** candado cubre sigue en el **mapa de bordes** de la sección "7-ago · noche (2)" — que es el sitio donde apuntar cualquier borde nuevo, en vez de volver a escribir que ya no quedan.

**Las tandas que Pablo aprobó el 5-ago, todas cerradas** (se dejan aquí porque cada una explica qué cazó y qué dejó anotado):
- ~~**Tanda D — cabos ARCO**~~ **hecha y fusionada el 6-ago** — ver su sección abajo. ⚠️ De sus dos cabos, **uno ya estaba hecho desde antes** (el bloqueo de des-anonimizar, commit `3c1aaad`, con guardia en servidor + botón escondido + test propio): otra vez la lista de pendientes envejeció sin avisar. Solo hubo que hacer el de `pertenencia`.
- ~~**Tanda E — bandeja del portal:** poder borrar un mensaje y marcar atendido en bloque (pendiente 3 de la bandeja).~~ **hecha y fusionada el 6-ago** — ver su sección abajo. Spec: `docs/superpowers/specs/2026-08-06-bandeja-borrar-y-bloque-design.md`.
- ~~**Tanda F — pantalla de auditoría general para el pastor** (hoy el rastro solo se ve hoja por hoja; con lo del 5-ago hay MÁS rastro que nunca esperando una pantalla).~~ **hecha y fusionada el 6-ago** — ver su sección abajo. Spec: `docs/superpowers/specs/2026-08-06-auditoria-general-design.md`.
- ~~**Tanda G — extender el barrido XSS** a manejadores de evento (95) y cuerpo de texto (676). Dos leftovers ya anotados para esta tanda: `id="mov-corregir-${m.id}"` sin `Number()` y los `onclick` de `filaMov`.~~ **hecha y fusionada el 6-ago** — ver su sección abajo. ⚠️ Los dos leftovers **ya estaban arreglados** (la lista envejeció otra vez), y en cambio aparecieron cosas que nadie tenía anotadas: tres formateadores de fecha devolvían texto crudo en sus fallbacks, y `cap()` iba sin escapar en 6 sitios. 🔥 **Deja deuda explícita:** el trinquete `PENDIENTES` de `xss-cuerpo.test.js`, para quemar por lotes (ver el plan). Nació con 199 firmas; los lotes 1 y 2 del mismo día la dejaron en **135** (contadores con `Number()`, 25 excepciones verificadas, y la regla `mapJoin` para listas construidas con `.map(...).join()` — el barrido ganó excepciones con motivo, zombie-check y autocomprobaciones nuevas).
- ~~**Tanda H — eventos que se repiten** ("todos los domingos"; conecta con la columna `repetir` de `fecha_no_disp` que hoy no hace nada).~~ **hecha y fusionada el 6-ago** — ver su sección abajo. La columna muerta `repetir` se retiró (cero INSERT en la historia, mismo criterio que la tabla `recurso`); "no puedo servir los martes" quedó explícitamente fuera. **Ya no queda NINGUNA tanda aprobada pendiente.**
- ~~**Backlog que dejaron las reviews del 5-ago:** `PATCH /ninos/:id` sigue reenviando todo y auditando sin diff (contradice la regla nueva del propio módulo — candidato natural para `soloCambios()`); barrido de `catch` sin `console.error(e)`; el `FakeSelect` de `organizacion-pagador-selector.test.js` con el punto ciego del `remove()`; `z.coerce.number()` acepta booleanos (POST y PATCH de tesorería).~~ **Los cuatro cerrados el 6-ago** (rama `feat/backlog-reviews-5ago`, TDD en cada uno): el PATCH del niño usa `soloCambios()` con bitácora "antes -> después"; `numeroEstricto()` en los cuatro esquemas con dinero (true→1 y [5000]→5000 ya no pasan; el texto numérico de un formulario sigue valiendo); el `FakeOption.remove()` viejo imita al DOM real; y **once** `catch` con 500 mudo ahora loguean, con barrido nuevo (`catch-con-log.test.js`) que exige `console.error` o `throw` en todo catch que responda 500 — uno de los once se había escrito **ese mismo día**: una convención sin candado no se sostiene.

El detalle fino de la ejecución de las tres tandas del 5-ago (quién revisó qué, qué cazó cada review) está en `.superpowers/sdd/progress.md`.

---

## 🆕 6 DE AGOSTO DE 2026 — 🔒 tanda D cerrada: el borrado ARCO ya se lleva las pertenencias

**Fusionada a `main` el mismo día** (merge `--no-ff`, rama
`feat/limpiar-pertenencia-arco` borrada; suite re-corrida sobre la fusión:
662 en verde). **Sin subir a GitHub** al escribirse esto — compruébalo con
`git log origin/main..main --oneline`.

**El día empezó verificando, no programando, y valió la pena dos veces:**
1. Los 43 commits del 5-ago **ya estaban subidos y desplegados** (0 pendientes
   contra `origin/main`; `quitarAusenteDuplicada` y `verHistorialMov` presentes
   en el `app.js` que sirve Render; `/api/health` ok).
2. **El primer cabo de la tanda D ya estaba hecho** — el bloqueo de que
   "Corregir nombre" des-anonimice una cuenta eliminada existía desde el commit
   `3c1aaad` (guardia `bloqueaSiAnonimizada()` en `admin.js:128`, botón
   escondido en el frontend, test `admin-cuenta-anonimizada-arco.test.js`). La
   lista de pendientes de este documento lo daba por hacer. **Octava vez que la
   lección se repite: comprobar un punto cuesta lo mismo que creérselo.**

**Lo único que faltaba de verdad: `DELETE FROM pertenencia` en la transacción
de anonimización** (`cuenta.js`), junto a los borrados de `push_sub`,
`dispositivo_push` y `fecha_no_disp`. La fila anonimizada no identifica a
nadie, pero "miembro de Jóvenes" es un dato de la persona y no debe sobrevivir
a su baja. Hecho con TDD: la aserción vieja del test (que fijaba "la
pertenencia NO se borra") se invirtió primero y se vio fallar antes de tocar
`cuenta.js`.

**Consecuencia en cadena, resuelta con un 404 honesto:** el test del "rol
residual" (`el pastor SÍ puede quitarle un rol a una cuenta ya eliminada`)
documentaba un escenario que **ya no puede existir** — la anonimización borra
las pertenencias y asignar un rol nuevo a una cuenta anonimizada da 403. El
test ahora fija lo contrario: tras eliminar la cuenta no queda nada que borrar
y el `DELETE /admin/rol/:id` del pastor da **404, no 403** (la ruta sigue sin
guardia de anonimizada **a propósito** — borrar solo quita datos; ver el
comentario en `admin.js`).

Suite: **662** (misma cifra que ayer: se invirtieron dos tests, no se sumaron;
medida con `cd backend && npm test`; caduca con la próxima rama — no la repitas
de memoria).

---

## 🆕 6 DE AGOSTO DE 2026 (5) — 🔁 el culto de todos los domingos se crea una sola vez

**Tanda H, fusionada a `main` el mismo día** (merge `--no-ff`, rama
`feat/eventos-serie` borrada). **Sin subir a GitHub** al escribirse esto —
compruébalo. Brainstorming con Pablo esa noche; sus decisiones (solo semanal;
3 meses con extensión automática; borrar una fecha o la serie, sin "editar la
serie"; solo el pastor, nacen aprobadas) en la spec:
`docs/superpowers/specs/2026-08-06-eventos-serie-design.md`.

**El modelo es materializar, no dibujar:** las fechas se crean DE VERDAD como
filas de `evento` (con `serie_id`), así que asignaciones, música, asistencia y
organización siguen colgando de eventos concretos sin enterarse de que existen
las series. La tabla nueva `serie` (`activa DEFAULT 1`) existe por una sola
razón: **que "borrar la serie" y la extensión automática no se contradigan** —
`activa=0` es la lápida que impide que el calendario resucite lo que el pastor
mató.

**Crear:** el pastor marca "🔁 repetir todas las semanas" y salen ~13 fechas
aprobadas (hasta hoy+90). La semana cuyo lugar/hora ya está ocupado **se salta
y las demás se crean**. **Extender:** al abrir el calendario, toda serie
activa con menos de hoy+45 de horizonte gana semanas hasta hoy+90, copiando su
último evento; una serie activa que se quedó sin eventos se apaga (no hay de
dónde copiar). **Borrar:** el feriado suelto se borra como cualquier evento y
NO apaga la serie; "Borrar esta y las siguientes" (solo pastor) apaga la serie
y borra las futuras **cada una con la cascada completa de 6 tablas** —
extraída a `borrarEventoEnCascada()`, compartida con el borrado suelto, todo
en una transacción. Las pasadas quedan como historia.

**Fechas sin trampa de zona horaria:** la aritmética de semanas es UTC puro
sobre la cadena `YYYY-MM-DD` (`sumarDias()`), y el "hoy" es `fechaLocal()` de
Chile. **Limpieza:** `fecha_no_disp.repetir` se retiró — nadie la escribió
nunca (cero INSERT en la historia del repo, el criterio de la tabla `recurso`
del 5-ago); "no puedo servir los martes" queda fuera a propósito.

⚠️ **Verificación manual pendiente de Pablo:** como `pastor`, crear "Culto —
todos los domingos" y ver ~13 domingos en el calendario con su chip 🔁; borrar
un domingo suelto (los demás quedan); y "Borrar esta y las siguientes" desde
un domingo del medio (los anteriores quedan, el calendario no la resucita).

Suite: **714** (705 + 9; medida al cerrar la rama; caduca con la próxima rama).

---

## 🆕 6 DE AGOSTO DE 2026 (4) — 📜 el pastor ya ve todo el rastro: Registro de actividad

**Tanda F, fusionada a `main` el mismo día** (merge `--no-ff`, rama
`feat/auditoria-general` borrada). **Sin subir a GitHub** al escribirse esto —
compruébalo. Brainstorming con Pablo esa misma tarde; sus decisiones (solo el
pastor; cambios por defecto con casilla para accesos; filtros por persona y
módulo; dentro de Administración; ni borrar ni editar) en la spec:
`docs/superpowers/specs/2026-08-06-auditoria-general-design.md`.

**`GET /api/admin/auditoria`** hereda la guardia del router (el obispo queda
fuera), filtra **en la misma consulta** acotada por iglesia, esconde por
defecto las acciones **`RUTINARIAS`** (login, recuperar clave, exportaciones,
consultas del obispo — la lista vive en el servidor con un test que exige que
cada acción siga existiendo en el código que la escribe), pagina LIMIT+1 y
manda los datos de los selectores solo con la primera página. El actor
anonimizado sale "Usuario eliminado" por su propia fila (LEFT JOIN, el
precedente de tesorería); sin fila, null → "(cuenta eliminada)".

**La pantalla** es una sección plegable al final de Administración, nacida
cerrada. Detalle que importa: **"ya cargada" se decide mirando el DOM, no solo
una bandera** — `renderAdmin` repinta la pantalla entera tras cada acción del
pastor y se lleva la zona; la bandera sola habría dicho "ya está" sobre una
caja vacía (la lección de `_clasesEd`, aplicada antes de que mordiera).

**Y el trinquete XSS demostró que funciona:** la primera versión de la
pantalla usaba tres variables locales con HTML (`actores`, `modulos`,
`quien`) y el barrido de cuerpo la rechazó — el código nuevo no puede
agregarse a la deuda. Se reescribió en las formas demostrables (map().join()
inline con flecha-template, ternario con escHtml y literal) y pasó sin
excepciones nuevas. **El candado obligó a escribir mejor el código el mismo
día que se estrenó.**

⚠️ **Verificación manual pendiente de Pablo:** como `pastor`, en
Administración abrir "📜 Registro de actividad", filtrar por `raquel`, marcar
"mostrar también accesos" y comprobar que aparecen los inicios de sesión.

Suite: **705** (697 + 8; medida al cerrar la rama; caduca con la próxima rama).

---

## 🆕 6 DE AGOSTO DE 2026 (3) — 🛡️ el barrido XSS ya cubre las tres categorías

**Tanda G, fusionada a `main` el mismo día** (merge `--no-ff`, rama
`feat/barrido-xss-total` borrada). **Sin subir a GitHub** al escribirse esto —
compruébalo. Spec (escrita al cierre, tras medir):
`docs/superpowers/specs/2026-08-06-barrido-xss-total-design.md`; el plan deja
anotada la deuda.

**Lo más valioso no fue el barrido, fueron sus hallazgos.** Tres formateadores
devolvían texto **CRUDO** en sus fallbacks: `parseFecha` aceptaba cualquier
cosa con dos guiones (así que `fechaTxt('a-b-<img...>')` y `chipFecha`
soltaban el tercer trozo sin escapar al HTML), y `fechaDeUTC` devolvía los 10
primeros caracteres crudos de lo que no parseara. Arreglados **en el helper**,
no sitio por sitio: `parseFecha` exige `\d{4}-\d{2}-\d{2}` (toda fecha real de
la app es ISO), `fechaTxt` descarta fallbacks peligrosos (descarta, NO escapa
— escapar doblaría el escape de los llamadores), y `fechaDeUTC` solo deja
pasar forma de fecha. Tres candados fijan los arreglos. Además `cap()` iba
crudo en 6 sitios (ahora `escHtml(cap(...))`). ⚠️ Y los dos leftovers que esta
tanda tenía anotados **ya estaban arreglados** — novena vez de la misma
lección.

**El mecanismo:** el tokenizador se extrajo a `xss-analisis.js` (un solo
mecanismo para los tres barridos, no tres copias). `xss-manejadores.test.js`
cubre onclick/onchange/href-javascript **con rigor completo**: 22 sitios
numéricos envueltos con `Number()`, regla nueva `X||Y` (el resultado siempre
es un operando), 10 excepciones con motivo y los de más peso con prueba
propia. `xss-cuerpo.test.js` cubre el cuerpo con reglas más anchas, cada una
verificada: template anidado como contenedor (sus `${}` internos se barren
aparte — hay autocomprobación), tablas `MAYUSCULAS[...]` (un test exige que
se declaren con puros literales), y 16 ayudantes leídos uno a uno.

🔥 ~~**La deuda, explícita y con candado:** la cola del cuerpo que no se pudo
clasificar con rigor mecánico (HTML en variables locales, en su mayoría) son
**199 firmas** en `PENDIENTES` de `xss-cuerpo.test.js`, y es un **trinquete**:
el código nuevo tiene que salir limpio (una interpolación cruda nueva rompe la
suite), y una firma cuyo sitio desaparece también rompe — la lista **solo
puede encoger**. Quemarla por lotes de 20-30 (el plan lo deja anotado).~~
**(QUEMADA ENTERA el mismo 6-ago, lotes 1-3: `PENDIENTES` quedó VACÍA y así se
queda — como la lista del barrido de botones. En el camino cayeron arreglos
reales: `ME.iglesia.nombre` iba crudo en el saludo del panel, las horas de
eventos sin escapar, ~40 contadores sin `Number()`. Todo sitio vive ahora en
reglas mecánicas con autocomprobación, ayudantes verificados uno a uno, o
excepciones con motivo y zombie-check. El detalle por lote, en el plan.)**

Suite: **689** (671 + 18; medida al cerrar la rama; caduca con la próxima rama
que se fusione — no la repitas de memoria).

---

## 🆕 6 DE AGOSTO DE 2026 (2) — 📬 la bandeja ya borra mensajes y atiende en bloque

**Tanda E, fusionada a `main` el mismo día** (merge `--no-ff`, rama
`feat/bandeja-borrar-y-bloque` borrada). **Sin subir a GitHub** al escribirse
esto — compruébalo. Spec:
`docs/superpowers/specs/2026-08-06-bandeja-borrar-y-bloque-design.md`, plan
con casillas en `docs/superpowers/plans/2026-08-06-bandeja-borrar-y-bloque.md`.
Cierra el pendiente 3 de la bandeja del 31-jul (su "fuera de alcance" caducó
en dos puntos; la spec vieja lleva nota al pie).

**Borrar un mensaje** (`DELETE /api/publico/mensajes/:id`, solo pastor): es la
única destrucción sin vuelta atrás de la bandeja, así que **se audita**
(`borrar_mensaje_portal`, con el nombre del visitante en el detalle — después
del borrado no queda fila que diga de quién era) y el `DELETE` y su apunte van
**en la misma transacción**. Acotado por iglesia en la misma consulta; 404 y no
403. ⚠️ El test cruzado de iglesia pasaba en RED de rebote (una ruta
inexistente ya da 404), así que **se verificó por mutación**: sin el acotado,
cae. El atender individual **sigue sin auditar**: no destruye nada.

**Atender en bloque** (`PATCH /api/publico/mensajes/atender-todos`): sin body
marca los `'nuevo'`; con `{previos:true}`, los `'previo'`. **Nunca los dos** —
"marcar atendido es una afirmación del pastor" (spec 31-jul): atender en
silencio meses que quizá nunca leyó sería afirmar lo que no hizo. Cada alcance
tiene su botón: el principal arriba de la lista (solo si la primera página trae
algún no-atendido — condición **exacta**, el ORDER BY pone lo no atendido
primero), el de anteriores dentro de su caja plegable. Sin nada que marcar:
200 con `atendidos: 0`, una orden ya cumplida, no un 404.

**Los dos detalles finos de la pantalla, para que nadie los rompa sin querer:**
el 🗑️ vive en un helper (`botonBorrarMensajePortal`) porque se pinta desde
**dos** sitios — la fila y el repintado en sitio de `atenderMensajePortal`,
que reemplaza el `innerHTML` del bloque de acción y antes se lo habría comido.
Y `esPrevio` viaja como **booleano al onclick**: borrar decide con el dato si
baja el contador de "anteriores", no oliendo clases del DOM; un previo atendido
en sitio se repinta con `false` porque su contador ya bajó al atender (si no,
borrarlo descontaría dos veces).

**Fuera de alcance, a propósito:** deshacer un borrado, volver un atendido a
'nuevo', y **borrar en bloque** (atender en bloque corrige un contador; borrar
en bloque destruiría el archivo de un clic — nadie lo pidió).

⚠️ **Verificación manual pendiente de Pablo** (no hay banco de pruebas de
navegador): como `pastor`, borrar un mensaje (la tarjeta se va, la sección de
anteriores no se pliega, el contador baja solo si era un anterior sin atender)
y marcar todos como atendidos (confirmación, toast con el conteo, lista
repintada).

Suite: **671** (662 + 9; medida al cerrar la rama con `cd backend && npm test`;
caduca con la próxima rama que se fusione — no la repitas de memoria).

---

## 🆕 5 DE AGOSTO DE 2026 — ⌨️ toda la app se usa con teclado: los 21 divs clicables son botones

**Fusionado a `main` el mismo día** (merge `92b36b1`, `--no-ff`, rama `feat/botones-reales`
borrada; suite re-corrida sobre la fusión: 624 en verde). **Sin subir a GitHub** al momento
de escribirse esto — compruébalo con `git log origin/main..main --oneline`.

La otra mitad de la brecha de accesibilidad que dejó anotada el menú (su punto
4 de "sigue sin resolver") quedó cerrada: **los 22 controles clicables que no
eran `<button>` fuera del menú lo son ahora, de verdad** — panel de inicio,
celdas del calendario, notificaciones, asistencia (el toggle de presente lleva
`aria-pressed`), música (el × de quitar integrante ganó `aria-label`, y el 🎵
del himnario era un `<b>`), himnario, cuidado pastoral, Escuela Dominical,
prédicas, panel del obispo y hojas de Organización. Visual idéntico: la clase
`.btn-plano` (`web/styles.css`) neutraliza el estilo nativo y las clases de
siempre mandan.

**El candado es un barrido multilínea** (`backend/test/botones-reales.test.js`):
cualquier etiqueta clicable que no sea `<button>`/`<a>` rompe la suite con un
mensaje que dice qué usar, salvo las 6 guardas puras de `stopPropagation` de
los modales y **una excepción con motivo escrito**: el chip `cal-ev` del
calendario, que vive dentro de la celda-botón (anidar botones está prohibido)
y cuyo contenido completo se alcanza por teclado vía celda → panel del día.
La lista `PENDIENTES` del barrido quedó vacía y así se queda.
⚠️ La primera versión del barrido era de una sola línea y solo `div`/`span`:
así se escaparon el `<b>` del himnario y el chip — lo cazó la review de la
primera tarea. Si un barrido futuro filtra por forma, que busque la forma
del fallo, no la forma del ejemplo.

**Fuera de alcance, a propósito:** el overlay del cajón del menú (es fondo, no
control), `kiosko.html`/`inscribir.html` (despliegue facial aparte) y las
páginas legales. Spec: `docs/superpowers/specs/2026-08-05-botones-reales-design.md`.

---

## 🆕 5 DE AGOSTO DE 2026 · TARDE — 🧹 pulido de agosto: cinco cabos chicos

Ninguno de los cinco es función nueva: son cabos que **este mismo documento ya
tenía anotados** y que llevaban semanas envejeciendo. Rama `feat/pulido-agosto`,
**sin fusionar** al escribirse esto — compruébalo, no te lo creas. Spec:
`docs/superpowers/specs/2026-08-05-pulido-agosto-design.md`.

**El arnés de pruebas dejó de pisarse a sí mismo.** `seguridad.test.js` y
`upload-validacion.test.js` levantan cada uno un servidor de verdad, y fijaban
los puertos **3931 y 3941 escritos a mano**: dos corridas a la vez chocaban y el
síntoma era *"El servidor de pruebas no respondió a tiempo"*, una frase que no
apunta a ninguna causa. Estaba anotado como hueco desde el 30 de julio y **hoy
mordió**: el fallo falso que apareció al abrir esta rama era exactamente eso.
Ahora los dos piden un puerto libre al sistema operativo
(`backend/test/puerto-libre.js`). ⚠️ Queda una ventana de carrera aceptada a
propósito —entre cerrar ese socket y que el proceso hijo abra el suyo— que es
órdenes de magnitud más chica que el choque determinista de un número fijo.

**Fuera dos restos legacy, y uno se queda con motivo.** La tabla `recurso`
("espacio/equipo reservable") **nunca la escribió nadie**: cero `INSERT` en toda
la historia del repo, así que está vacía por construcción en cualquier
despliegue. Se va con `migrarQuitarRecurso()`, un `DROP TABLE IF EXISTS` que no
lleva la guarda `PRAGMA` de las otras migraciones porque ya es idempotente por
sí solo. Y se retira `POST /api/dispositivo`, el registro de token del push
viejo: nada del frontend lo llamaba nunca. ⚠️ **`dispositivo_push`, la tabla, NO
se borra**, y la diferencia con `recurso` es toda la diferencia: esa sí pudo
recibir filas reales de gente que usó la app antes de `push_sub`, y el borrado
ARCO (`cuenta.js:200`) la sigue limpiando. Murió su endpoint de escritura, no la
tabla. Candado nuevo: `backend/test/limpieza-legacy.test.js`.

**El punto de sin-leer del menú es rojo**, el mismo rojo del badge que
representa. Salen del mismo dato (`Chat._sinLeer`) y ahora lo dicen con el mismo
color (decisión del dueño: mismo dato, mismo color); una aserción fija
`var(--red)` en `web/styles.css` para que no vuelvan a separarse.
⚠️ **Y aquí está lo que vale más que el arreglo:** de los dos pendientes que ese
punto tenía anotados, **uno ya estaba hecho desde hacía dos días y nadie lo
tachó**. El pendiente 5 pedía un `aria-label` en el encabezado cuando lleva
mensajes pendientes — y la reescritura del menú del **3 de agosto ya lo había
puesto, con pruebas** (`menu-plegable.test.js`, commit `67799a3`). La lista
seguía diciendo que faltaba solo porque nadie volvió a mirarla. **Una lista de
pendientes envejece sin avisar**, y comprobar un punto cuesta lo mismo que
creérselo: antes de "arreglar" algo que dice este documento, mira el código.

**Un tema del menú móvil que queda con UNA sola entrada se pinta suelto**, sin
encabezado ni acordeón (decisión del dueño). El caso real estaba verificado y
anotado como pendiente 7 de la sección del menú: un líder de cuerpo veía
"Pastoreo" con `asistencia` debajo y nada más — un encabezado que hay que abrir
para llegar a una sola cosa. La regla descartaba los grupos **vacíos**; ahora
`agruparNav()` marca también el grupo de uno con `titulo:null` ("sin
encabezado", que `buildNav()` ya sabía pintar) y la entrada va suelta, en el
lugar del tema.
🔴 **La review cazó un hueco que el plan no vio,** y del tipo que no rompe
ninguna prueba existente: `toggleSidebar()` tenía **su propio** `'nav-g-1'`
escrito a mano como tema a abrir. Con un primer tema suelto ese contenedor puede
no existir, así que abrir el cajón sin pantalla activa dentro de ningún tema
habría dejado **todos los temas cerrados**. Arreglado con `primerGrupoNav()`,
que le pregunta al DOM cuál es el primer contenedor real en vez de repetir el
cálculo de `buildNav()`: **una sola verdad, no dos que sincronizar** — el mismo
principio que retiró el `--ord` de flexbox el 3 de agosto.

**El rótulo "(cuenta inactiva)" ya no miente en el selector de quién pagó**
(cierra el pendiente 7 de la fuente del gasto). Mientras `/directorio` viaja, la
pantalla inyecta una opción provisional para poder representar al pagador de un
gasto; si el directorio llega y trae a esa misma persona, la inyectada sobra: el
rótulo pasa a ser falso y el nombre sale dos veces. Antes se reconciliaba **solo
si estaba seleccionada**, así que quien tocaba el selector a mano mientras tanto
se quedaba con la mentira en la lista. Ahora `quitarAusenteDuplicada()` la quita
**siempre** que aparezca su gemela real, conservando la elección. Y si no hay
gemela **la opción se queda**: ahí la persona está inactiva de verdad y el
rótulo dice la verdad.
🔴 **Segunda lección de review, y esta es sobre las pruebas:** el `<select>` de
juguete que traía el plan imitaba un `remove()` que **no es el del DOM real**.
En el navegador, quitar la `<option>` seleccionada resetea el selector a su
primera opción **por identidad de nodo**, aunque otra opción comparta el mismo
`value` — y es justo eso lo que obliga al `sel.value=valor` del código de
producción. Con el juguete mal hecho esa línea no se ejercitaba nunca, y el test
clave **no podía fallar**: se demostró por mutación, borrando esa línea del
código real, y el test seguía en verde. Corregido el fixture, la mutación ahora
sí lo rompe. Si un `<select>`, un `<form>` o cualquier otro doble de DOM se
escribe de memoria, la prueba que cuelga de él no prueba nada.
⚠️ **El arnés preexistente `organizacion-pagador-selector.test.js` tiene el
mismo punto ciego** (su `FakeOption.remove()` tampoco toca el `value`
seleccionado). Queda **anotado y sin tocar**: las pruebas nuevas de este arreglo
viven en `organizacion-selector.test.js` y sí muerden, pero cualquier prueba que
se escriba encima de aquel fixture hereda el agujero.

Suite: **636** (medida al cerrar la rama con `cd backend && npm test`; caduca con
la próxima rama que se fusione — no la repitas de memoria).

---

## 🆕 5 DE AGOSTO DE 2026 · NOCHE — ✏️ una ofrenda mal tecleada ya se puede corregir

La pregunta que **este mismo documento** dejó anotada el 1 de agosto —*"¿por qué
se puede borrar un aporte de campaña y no corregir una ofrenda mal tecleada?"*—
ya tiene respuesta. Rama `feat/corregir-movimiento`, **sin fusionar** al
escribirse esto (la fusión va después de la review final) — compruébalo, no te
lo creas. Spec:
`docs/superpowers/specs/2026-08-05-corregir-movimiento-design.md`.

**La tesorera corrige monto, descripción y categoría** de cualquier movimiento,
desde un panel en sitio (la convención de los 17) prellenado con la fila que la
lista **acaba de leer**, nunca de una caché vieja. El `PATCH` manda **solo lo
que quedó distinto**: guardar sin tocar nada ni siquiera llama a la API.

**El tipo y la fecha NO se corrigen, y las dos ausencias son decisiones, no
olvidos.** Cambiar el tipo (ingreso↔gasto) es conceptualmente borrar un
movimiento y crear otro, y borrar sigue prohibido. Mover la fecha cambia de mes
los totales, y `movimiento.fecha` es una fecha de calendario pura con la trampa
documentada en `backend/src/reportes.js:21-29`. `validar()` descarta esas dos
claves **en silencio** (comportamiento conocido del proyecto) y hay un test que
lo deja fijado, para que nadie lea el silencio como "se puede".

**Solo se audita lo que cambió de verdad.** Cada campo recibido se compara con
el guardado; si nada cambió, la respuesta es `ok` y **no se escribe ni se
audita nada**. Es la sexta aparición del mismo fallo en este proyecto —el
formulario que reenvía entero lo que nadie tocó, el "Juan Pérez → Juan Pérez"—
y esta vez la regla venía escrita en la spec **antes** que la ruta, con su test
propio (*"PATCH con los MISMOS valores: 200 y CERO apuntes nuevos"*). El detalle
de auditoría escribe el número crudo (`monto: 5000 -> 50000`), **no**
formateado con `money()` — a propósito, libre de formato de locale; que nadie
lo "arregle" después. El `UPDATE` y
el apunte van **en la misma transacción** (la convención fijada el 31-jul: una
corrección de dinero no puede quedar aplicada sin rastro), y el `SET` se arma
desde una **lista blanca de tres columnas**, jamás desde las claves del cuerpo.
Un `''` se normaliza a `NULL` igual que en el `POST`, para que no haya dos
vacíos distintos.

**La marca "✏️ corregido" y su historial —"antes → después", quién y cuándo— los
ven la tesorera, el pastor y el obispo.** El lápiz de editar, solo la tesorera.
⚠️ **Premisa corregida durante el diseño, y vale más que la función:** la
primera pregunta al dueño hablaba de *"transparencia visible para la
congregación"*, y esa premisa era **falsa** — el módulo Tesorería entero solo lo
ven esos tres roles, y la tarjeta Transparencia trae totales por categoría, no
movimientos. Se re-preguntó **con la premisa corregida** antes de construir
nada, y la tarjeta no cambió. Una pregunta sobre un mundo que no existe da una
respuesta que tampoco.

**En la vista mensual del obispo la marca es pasiva** (un `<span>`, no un
botón). El obispo mira las iglesias por `/obispo/iglesia/:id/tesoreria`, pero el
historial se resuelve contra **la iglesia de quien pregunta**
(`req.user.iglesia_id`), no contra la que está mirando: un botón ahí solo podría
dar 404. Mejor ningún botón que uno que únicamente sabe fallar.

**Los aportes de campaña también se corrigen, y la barra se ajusta sola:** el
total se **calcula** sumando sus ingresos (decisión del 1-ago), así que no hay
segunda escritura que sincronizar. Corregir el monto de un aporte no exige que
la campaña siga abierta — cerrada rechaza aportes *nuevos*, no arreglos de
tecleo.

**El plan también se revisa.** Dos divergencias corregidas contra el código, no
contra el papel: el plan citaba `escJsAttr` para el `value=` de un `<input>`, y
el ayudante correcto **en esa posición** es `escHtml` — verificado contra los
**24** sitios que `main` ya tenía así (`grep -o 'value="${escHtml(' web/app.js`
sobre `main`; en esta rama salen 26 porque el panel nuevo pone dos, y contar
esos dos como precedente habría sido citarse a uno mismo). Y un `${id}` pelado
dentro del panel tropezó el barrido XSS — se resolvió con `Number(id)`,
ayudante que **ya estaba en su lista blanca**, sin añadir ninguna excepción
nueva. Cuando un candado se queja, la salida barata es ensanchar su lista de
excepciones; la correcta es que el código deje de merecer la queja.

⚠️ **Consecuencias asumidas, escritas para que nadie las descubra de sorpresa:**
borrar un aporte de campaña corregido deja su historial **huérfano** en
`auditoria` (los apuntes siguen ahí, sin fila que los muestre) — el borrar ya
existía y esta rama no lo toca; **no hay control de concurrencia**, como en todo
el proyecto: dos tesoreras sobre el mismo movimiento, la última gana; y
`z.coerce.number` acepta booleanos y arrays de un elemento, que es
**preexistente** (el `POST` de movimientos ya lo hacía) y queda anotado, no
arreglado aquí.

⚠️ **Verificación manual pendiente de Pablo** (no hay banco de pruebas de
navegador; el humo de esta rama se hizo a nivel de API): entrar como **raquel**,
corregir un movimiento y comprobar el toast, la lista repintada y el historial
con sus dos filas; y entrar como **pastor** para confirmar que ve la marca y su
historial pero **NO** el lápiz ✏️.

Suite: **650** (medida al cerrar la rama con `cd backend && npm test`; caduca con
la próxima rama que se fusione — no la repitas de memoria).

---

## 🆕 5 DE AGOSTO DE 2026 · NOCHE (2) — 👶 las clases y las lecciones ya se corrigen y se borran

El pendiente que la **Fase 13** dejó escrito el 31 de julio —*"siguen sin poder
editarse ni borrarse las clases ni las lecciones. Solo niños"*— ya está tachado.
Rama `feat/editar-clases-lecciones`, **sin fusionar** al escribirse esto —
compruébalo, no te lo creas. Spec:
`docs/superpowers/specs/2026-08-05-editar-clases-lecciones-design.md`.

**Una clase se corrige (nombre y edades) y se borra, pero SOLO si está vacía.**
La decisión es del dueño y el motivo cabe en una línea: borrar una clase con
niños dentro sería **borrar fichas de menores en bloque**, y eso no puede pasar
por un clic de más. Con niños, el servidor responde **409 con el conteo**
(*"La clase tiene 3 niño(s): mueve o borra sus fichas primero"*), y ese texto se
muestra tal cual en la pantalla — el número le dice a la maestra cuánto trabajo
tiene por delante, no solo que no puede. Borrar niños **ya existe** desde la
Fase 13: uno a uno, confirmado y auditado. Aquí no se ha quitado ninguna
capacidad; se ha quitado el atajo peligroso.

**Borrar una clase vacía se lleva sus lecciones y sus filas viejas de
asistencia**, en una sola transacción. Las de asistencia son huérfanas de niños
movidos o borrados, y **ese historial ya no lo muestra ninguna pantalla** desde
que se retiró la asistencia de niños el 30 de julio: es exactamente el
razonamiento con el que el borrado de un niño se lleva el suyo. ⚠️ **Los
archivos de las lecciones quedan huérfanos en `/uploads`**, asumido y escrito
aquí para que nadie lo descubra de sorpresa — como en el resto de la app.

**El documento de una lección NO se cambia por `PATCH`**, y también es decisión,
no olvido: un archivo equivocado se arregla **borrando la lección y subiéndola
de nuevo**. `material_url` ni siquiera está en el esquema del PATCH, así que
`validar()` lo descarta **en silencio** (comportamiento conocido del proyecto),
y hay un test que fija ese silencio para que nadie lo lea como "se puede". Se
corrigen título, fecha y versículo.

**Y el módulo de niños por fin deja rastro entero.** Este documento tenía
anotado desde el 30 de julio, en "Huecos verificados", que *"nada del módulo de
niños se audita"*. La Fase 13 cerró la mitad —editar y borrar— y quedó abierta
la otra: **crear**. Ahora crear una clase, inscribir un niño y subir una lección
dejan apunte (`crear_clase`, `inscribir_nino`, `crear_leccion`). Editar y borrar
auditan **solo lo que cambió de verdad**: cada campo recibido se compara con el
guardado, y si nada cambió la respuesta es `ok` y no se escribe ni se audita
nada — la misma regla que estrenó Tesorería esta misma noche, aquí extraída a un
ayudante compartido (`soloCambios()` en `backend/src/ninos.js`) que arma a la
vez el `UPDATE` y la bitácora *"col: antes -> después"*. El `UPDATE` y su apunte
van en la misma transacción, y el `SET` se construye desde lista blanca, jamás
desde las claves del cuerpo.

🔴 **La lección de review de esta rama es la séptima aparición del mismo fallo,
y esta vez el síntoma era peor que las anteriores.** La caché
`window._clasesEd` —la que prellena el panel de corrección— **no se actualizaba
al guardar**. Consecuencia real: corregías el nombre de una clase, abrías el ✏️
otra vez en la misma sesión y el panel te prellenaba **lo viejo**; guardar sin
tocar ese campo **REVERTÍA en silencio la corrección recién hecha**. No es
"datos desactualizados en pantalla": es deshacer trabajo ya guardado. Arreglado
en sitio, y **la prueba se demostró por mutación** antes de creérsela. Los
candados nuevos son dos y leen el propio `web/app.js`: uno exige que
`guardarEdicionClase()` toque `_clasesEd` **después** del `await` al PATCH (si
se escribiera antes, un PATCH que falla dejaría en la caché algo que el servidor
nunca guardó — el mismo problema al revés); el otro deja escrito **por qué
`guardarEdicionLeccion()` ya era segura** —llama a `cargarMaterial()`, que
re-lee la lista entera del servidor— para que si algún día deja de re-leerla,
algo se caiga. **Verificar por qué algo NO falla vale tanto como arreglar lo que
falla**: la diferencia entre las dos funciones era invisible hasta que se
escribió.

⚠️ **Verificación manual pendiente de Pablo** (no hay banco de pruebas de
navegador; el humo se hizo a nivel de API): entrar como **marta** (maestra de
Escuela Dominical) y corregir una clase, **intentar borrar una que tenga niños y
leer el 409 con el conteo**, y borrar una lección; y entrar como **pastor** para
confirmar que sigue viendo Escuela Dominical **solo de lectura**, sin ✏️ ni 🗑️.

Suite: **662** (medida al cerrar la rama con `cd backend && npm test`, 662 pass /
0 fail; caduca con la próxima rama que se fusione — no la repitas de memoria).

---

## 🆕 4 DE AGOSTO DE 2026 — el menú plegable quedó en `main`, y el hallazgo del 500 del perfil, cerrado

**El menú plegable accesible se fusionó a `main`** (merge `40122f5`, `--no-ff`, rama
`feat/menu-plegable` borrada). El mecanismo está descrito en la sección del 31 de julio
(reescrita entonces para contar el mecanismo real). Verificación al fusionar: suite en
verde y caminata Playwright de 21 comprobaciones (escritorio intacto, acordeón, teclado
con rescate de foco, cruce 390↔1280 restaurando `.active`, menú corto plano, consola
limpia). Detalle fino de la ejecución: `.superpowers/sdd/progress.md`.

**Y el hallazgo de auditoría del perfil quedó cerrado** (merge del mismo día): `PATCH
/api/directorio/perfil` hacía `.nombre` sobre una fila que podía no existir — 500 donde
su gemelo `GET /perfil` daba 404. **Matiz honesto:** ese 500 hoy es *inalcanzable por
HTTP*, porque `authMiddleware` relee la persona en cada petición y devuelve 401 antes de
llegar a la ruta (revocación de la limpieza profunda). El guard nuevo es la segunda
línea por si esa revocación cambia, y una prueba fija el 401 real de la cadena.

De los 8 hallazgos de la auditoría **ya no queda ninguno abierto**: el push
cruzado en dispositivo compartido se cerró el mismo 4 de agosto (rama
`feat/push-muere-con-sesion`) — cerrar sesión y la sesión caducada cortan el
push del dispositivo (baja en servidor + des-suscripción del navegador, en un
solo helper `pushCortarDispositivo` en `web/app.js`), con timeout de 2 s para
que el logout nunca se cuelgue. Spec:
`docs/superpowers/specs/2026-08-04-push-dispositivo-compartido-design.md`.
⚠️ **Riesgo residual aceptado:** quien abandona un dispositivo compartido SIN
cerrar sesión sigue filtrando push hasta que otra persona entre (el login del
siguiente reasigna el canal — el `ON CONFLICT` de `push.js:70-72` se queda a
propósito, ahora como mitigación). ⚠️ **Verificación manual pendiente de
Pablo** (no hay banco de pruebas de navegador): activar push como una persona,
cerrar sesión, entrar como otra en el mismo navegador y comprobar con
`/push/probar` que no llega nada del anterior.
⚠️ La nota del 31-jul sobre la fecha de Cuidado pastoral (`verCaso`) **caducó**: se
arregló el 1-ago en `59772ca` junto con aprobaciones y material musical.

Suite: **617** (medida hoy con `cd backend && npm test`; caduca con cada rama).

---

## 🆕 1 DE AGOSTO DE 2026 — 🎯 las campañas de tesorería por fin se pueden usar

La pantalla anunciaba la función —*"una campaña sirve para juntar para algo concreto —el techo, un viaje misionero— y ver cuánto falta"*— y **no tenía ni un solo botón**. El backend sí existía: `POST /campanias` y `PATCH /campanias/:id/aportar` estaban escritos, validados y protegidos, y nadie los llamaba nunca.

**Pero conectarlo tal cual habría creado algo peor.** `aportar` hacía `UPDATE campania SET recaudado = recaudado + ?` y **no creaba ningún movimiento**: la plata subía en la barra de la campaña **sin aparecer en Movimientos ni en Transparencia**. Dos contabilidades que no cuadraban entre sí, en la pantalla del dinero.

**El total de una campaña ahora se CALCULA** sumando los ingresos que llevan su `campania_id`. Es lo que hace imposible que la barra y los libros discrepen: no hay dos números que mantener sincronizados, hay uno derivado del otro.

⚠️ **`campania.recaudado` sigue en la tabla y NO dice la verdad.** Ningún código la lee ni la escribe; la única excepción es la migración, una sola vez, que convierte un saldo anterior en su ingreso para que esa plata no desaparezca de la barra. Hay una prueba que ensucia esa columna con un valor imposible y exige que la respuesta la ignore.

**Un aporte se puede borrar**, y al borrarlo desaparece del libro también. ~~Es la **única** cosa que se puede deshacer en toda la tesorería: **ningún otro movimiento se puede corregir ni borrar**.~~ Alguien va a preguntar por qué se puede borrar un aporte de campaña y no una ofrenda mal tecleada — la respuesta es que fue una decisión de alcance del dueño, no un olvido, y que lo otro sigue pendiente. **(Desfasado el 5-ago: borrar un aporte sigue siendo lo único que se BORRA, pero ya no es lo único que se deshace — la tesorera corrige monto, descripción y categoría de cualquier movimiento, con rastro en auditoría. La pregunta anotada aquí terminó siendo la spec de esa noche; ver la sección "5 de agosto · noche". Borrar sigue prohibido fuera de los aportes.)**

⚠️ **La ruta de borrar no puede alcanzar un movimiento normal**, y eso descansa en una sola condición del `WHERE`: `campania_id = ?`. Los movimientos normales tienen `campania_id` NULL y en SQL `NULL = cualquier cosa` **nunca** es cierto. Comprobado quitándola: sin esa condición, la ruta borraba un movimiento cualquiera pasando un id de campaña — era un borrador general de la contabilidad de la iglesia.

**Una campaña se cierra, no se borra:** deja de admitir aportes —rechazados **en el servidor**, no escondiendo el botón— y baja a una sección de cerradas, para no perder el historial de para qué se juntó.

⚠️ **En la misma tarjeta hay dos fechas que se pintan con funciones distintas, y no es un descuido:** la del aporte con `fechaTxt()` (`movimiento.fecha` es una fecha de calendario pura) y la del cierre con `fechaDeUTC()` (`campania.cerrada_en` es una marca de tiempo UTC). Unificarlas desplaza una de las dos un día. Ver `backend/src/reportes.js:21-29`.

**Nada va envuelto en transacciones, a propósito:** al calcularse el total, aportar es un solo `INSERT` y borrar un solo `DELETE`. El diseño eliminó el problema de las dos escrituras en vez de obligar a envolverlo.

Suite: 566 → **589**.

---

## 🆕 1 DE AGOSTO DE 2026 — ⚖️ una cuenta eliminada por su titular ya no se puede resucitar (fusionado y subido)

Al ejercer el derecho a eliminar la cuenta (ARCO), la fila **no se borra: se anonimiza** (`backend/src/cuenta.js`). Pero seguía apareciendo en el panel del pastor **con sus botones operativos**, así que el pastor podía reactivarla, **devolverle su nombre real** —lo que deshace la anonimización y además lo propaga a `aprobacion_log`— o marcarla como pastor.

**Revisando el panel entero resultaron ser SEIS acciones, no las tres que se habían visto**: también restablecer la contraseña (`POST /admin/usuarios/:id/clave`) y asignar un rol nuevo (`POST /admin/usuarios/:id/rol`). Se bloquean cinco. **Quitar un rol** (`DELETE /admin/rol/:id`) se deja a propósito: solo borra datos, no reactiva nada ni devuelve información, y va en la misma dirección que el borrado. Está documentado en el código y tiene su prueba.

**La marca es una columna explícita, `anonimizada_en`, y NO el patrón `usuario LIKE 'eliminado_%'`.** El campo `usuario` se valida con `z.string().trim().min(1)`, sin restricción de formato (`registro.js:19`, `admin.js:60`): una persona real podría llamarse `eliminado_7` y habría quedado bloqueada sin motivo. El relleno de las filas ya anonimizadas exige las **tres señales a la vez** (usuario, `activo = 0` y `nombre = 'Usuario eliminado'`) y vive **dentro de la guarda de existencia de la columna**, igual que `migrarEstadoContactoPublico`.

**El candado está en el servidor.** Los botones ocultos son el acompañamiento: la ruta se puede llamar directamente.

~~**Queda un hueco aparte, no tocado:** `pertenencia` (las membresías de grupo) **no se limpia** cuando alguien ejerce ARCO en `cuenta.js`. La fila ya está anonimizada, así que no identifica a nadie, pero es un cabo suelto del borrado.~~ **(Cerrado el 6-ago, tanda D: el `DELETE FROM pertenencia` va en la misma transacción de anonimización — ver la sección del 6 de agosto.)**

Suite: 554 → **566**.

---

## 🆕 1 DE AGOSTO DE 2026 — las fechas en hora de Chile, no en UTC (fusionado y subido)

`date('now')` y `datetime('now')` de SQLite son **siempre UTC**, aunque el proceso corra con `TZ=America/Santiago`: esa variable solo afecta al lado JavaScript. Chile va 3 o 4 horas por detrás, así que **desde las 20:00 o 21:00 hora de Chile, para SQLite ya es el día siguiente**.

**El rol de predicador se activaba y se apagaba en esa franja.** El pastor lo daba del 5 al 7 y la persona lo recibía la noche del 4 y lo perdía la noche del 6 (`backend/src/auth.js:261`, `backend/src/predica.js:29`). Arreglado con `date('now','localtime')`, el mismo patrón que ya usaba `directorio.js:172`.

**Y tres pantallas mostraban el día siguiente por la tarde** (`web/app.js:1497`, `:1929`, `:2205`): un contacto de cuidado pastoral registrado un lunes a las 21:00 aparecía fechado el martes. Ahora usan `fechaDeUTC()`, que ya existía y ya se aplicaba bien en otros dos sitios del mismo archivo.

⚠️ **Antes de tocar cualquier fecha, lee `backend/src/reportes.js:21-29`.** `'localtime'` es el arreglo sobre una **marca de tiempo** y es un **fallo nuevo** sobre una **fecha de calendario pura**, a la que le resta un día. Por eso ese archivo lo lleva en unos sitios y deliberadamente no en otros. No lo "unifiques".

**Cómo se prueba sin mentir:** una prueba que inserte un rol y mire si está vigente solo distinguiría el código bueno del malo durante esas ~4 horas al día; el resto del día pasaría en verde con el fallo puesto. La prueba que hay saca la consulta **real** del código fuente y le sustituye `'now'` por un instante fijo: corre SQL de verdad y además no depende de la hora a la que se ejecute.

Suite: 549 → **554**.

---

## 🆕 1 DE AGOSTO DE 2026 — 🔴 XSS en categoría, edad y hora (fusionado y subido)

Tres datos que escribe una persona llegaban al HTML **sin escapar**. El peor estaba en el **panel del obispo** (`web/app.js:3092`), que ve **todas las iglesias**: un tesorero de cualquier iglesia guardaba una categoría con `<script>` y le ejecutaba código al obispo al abrir su panel. Eso **saltaba el aislamiento entre iglesias**, que es la garantía de fondo de la app. Los otros dos: la edad de una clase de Escuela Dominical (`:2523`) y la hora del ensayo (`:1863`), esta última dentro de un `value="..."`, donde basta una comilla doble para salirse del atributo.

**No fue por no saber:** en la misma línea del panel del obispo ya se escapaban la descripción, la fecha y la URL del comprobante. Se saltó uno. `cap()` (`:209`) no escapa nada, solo pone la primera letra en mayúscula.

La hora del ensayo ahora además **exige formato**, con el mismo `horaSchema` que ya usaban `eventos.js` y `organizacion.js` — la incoherencia estaba ahí desde antes.

**⚠️ Lo que importa más que el arreglo:** había una suite de XSS **en verde al lado** todo este tiempo (`backend/test/xss-atributos.test.js`). Miraba un patrón de comillas hecho a mano **dentro de un `onclick`**, y estos tres estaban en el cuerpo de un `innerHTML`: no los rozaba. Una red con el agujero justo en la forma del fallo.

Ahora hay un barrido (`backend/test/xss-interpolaciones-atributo.test.js`) que recorre las interpolaciones que arman el valor de un atributo y exige que pasen por un ayudante seguro, que sean un dato que no viene de una persona, o que tengan una **excepción con motivo escrito**. Las excepciones se validan por el **texto completo del atributo**, no por el nombre de la variable: así una interpolación futura que use `n` o `c` por casualidad no queda blanqueada.

**Hasta dónde llega ese barrido, para que nadie se confíe:** cubre **137 de las 908** interpolaciones del archivo — las de valor de atributo. **Quedan fuera 95 dentro de manejadores de evento (`onclick`, `href="javascript:`) y 676 del cuerpo de texto.** Está a propósito y es lo siguiente que habría que barrer.

Suite: 536 → **549**.

---

## 🆕 31 DE JULIO DE 2026 — el menú del móvil, agrupado por temas (fusionado, subido y **desplegado**; el mecanismo con el que se desplegó ese día —`order` de flexbox— **se retiró entero el 3 de agosto**, en la rama local `feat/menu-plegable`, todavía sin fusionar: lo de abajo ya describe el nuevo)

En el teléfono el menú lateral es un cajón a pantalla completa y el pastor ve sus 19 entradas seguidas: para llegar a casi cualquier cosa hay que desplazarse. Ahora se agrupan bajo cinco temas — **Día a día · Lo mío · Pastoreo · Ministerios · Administración** — pero **solo para quien tiene el menú largo**: `GRUPOS_NAV` (`web/app.js`) reparte las claves del `NAV`, y `NAV_UMBRAL_GRUPOS = 12` decide si se agrupa; por debajo del umbral, `agruparNav()` devuelve una sola sección sin título — la lista plana de siempre.

**El mecanismo real, reescrito el 3 de agosto (el de `order` de flexbox de más abajo ya no existe):** en el móvil cada tema es un `<div class="nav-grupo" id="nav-g-N">` **de verdad**, con sus entradas dentro, precedido por un `<button class="nav-sec" aria-controls="nav-g-N">`. `buildNav()` decide la forma con `esMovil()`: en escritorio sigue pintando la lista plana de siempre, sin encabezados ni contenedores — eso no cambió. **`--ord` y la regla `order` que lo sustituían ya no existen, y no hacen falta**: con contenedores reales el orden del DOM vuelve a ser el orden visual, así que no hay dos órdenes que mantener sincronizados. El ancho del quiebre sale de una sola constante, `NAV_MOVIL_MAX = 900` (`web/app.js`), y una prueba (`backend/test/menu-plegable.test.js`) comprueba que el `@media` de `web/styles.css` usa ese mismo número. `vigilarAnchoDelMenu()` repinta el menú al cruzar el quiebre (girar el teléfono, redimensionar la ventana) y restaura el resaltado `.active` y el punto/badge de sin-leer en las **dos** formas del menú.

**Se pliega en acordeón:** un solo tema abierto a la vez, el de la pantalla actual en el momento de abrir el cajón (`toggleSidebar` lo recalcula cada vez que se abre); no se guarda nada entre visitas, ni en `localStorage` ni en ningún otro sitio.

**Las entradas y los encabezados son `<button>` de verdad, no `<div onclick>`:** se alcanzan con Tab, se activan con Enter y con Espacio, y un lector de pantalla los anuncia como el control que son. Si el foco está dentro de un tema cuando se cierra, se rescata al encabezado (`alternarGrupo`) — sin eso, el navegador lo manda al principio de la página, que para quien navega con teclado es volver a empezar. El aro de foco de la barra lateral pasó a blanco (`.nav-item:focus-visible,.nav-sec:focus-visible{outline-color:#fff}`, `web/styles.css:206-208`): el azul de `--primary` no llega al 3:1 que pide WCAG sobre el fondo oscuro de la barra. **El resto de la app sigue sin este arreglo:** un barrido de hoy sobre `web/app.js` cuenta cerca de **20** `<div onclick>` fuera del menú (tarjetas del panel, del calendario, del visor de canciones…) que no se alcanzan con teclado — no cuenta los pocos `onclick="event.stopPropagation()"` de los modales, que no son controles que activar. Es trabajo aparte, sin empezar.

**Un tema cerrado con mensajes sin leer muestra un punto dorado en su encabezado** (`marcarGrupoConSinLeer`), que sale del mismo dato que ya gobierna el badge (`Chat._sinLeer`) — no hay un segundo conteo que mantener sincronizado — y se apaga en cuanto el tema se abre, porque ahí el badge de la entrada ya se ve.

**Arreglo posterior al plan, y vale la pena dejarlo escrito:** el barrido de XSS de atributos (`backend/test/xss-interpolaciones-atributo.test.js`) ganó una excepción nueva para `aria-controls="${id}"` dentro de `alternarGrupo`. No es solo una excepción con motivo escrito, como el precedente de `formAporte`: además comprueba que la única llamada a `alternarGrupo` del archivo pasa el entero local del bucle de `buildNav()`, así que si algún día alguien la llama con un dato que escriba una persona, la prueba se cae antes de que la excepción blanquee nada.

⚠️ **Si una prueba lee código fuente con un regex, ponle `\r?` antes de cada `\n`** (lección del mecanismo anterior, ya retirado, pero sigue valiendo para cualquier prueba nueva que haga lo mismo). En JavaScript el `.` no casa con `\r`, y git deja los archivos en disco con finales de línea de Windows (`git ls-files --eol web/app.js` → `i/lf  w/crlf`). La prueba que ejecutaba el `buildNav()` de entonces recortaba `const _ic=` con `/const _ic=.*\n/` y **no encontraba nada**: pasaba en la rama solo porque allí git había materializado el archivo con finales de línea Unix, y se cayó sola al fusionar. Arreglado en `8130087`; barridas las otras 12 pruebas que leen fuente, ninguna más tenía el mismo agujero.

Dos asignaciones deliberadas, que el reemplazo del mecanismo no tocó: **`predica`** va en "Día a día" — la ve todo el mundo, no es el ministerio de nadie — y **`ajustes`** en "Lo mío" — es el tema y el color de quien mira, no administración de la iglesia.

Suite aquel 31 de julio: partió en 526, llegó a **536**. Hoy, con el mecanismo entero sustituido (rama `feat/menu-plegable`, sin fusionar), la suite mide **615 tests, 0 fallan** (medido ahora mismo con `cd backend && npm test`; ese número caduca con la próxima rama que se fusione — no lo repitas de memoria).

**Desplegado y comprobado en producción** (1 ago 2026, 02:32 UTC) — **pero de la versión vieja:** el `app.js` que servía Render ese día traía `GRUPOS_NAV`, `NAV_UMBRAL_GRUPOS` y `setProperty('--ord')`, y su `styles.css` tenía **exactamente una** regla `order:var(--ord)`. ⚠️ **Desfasado por lo de arriba:** ese `--ord` es justo el mecanismo que este documento acaba de decir que ya no existe. Se retiró entero en `feat/menu-plegable`, todavía sin fusionar ni desplegar: mientras esa rama no se fusione, lo que sirve Render sigue siendo el `--ord` de este párrafo, no los contenedores reales de más arriba. No lo des por cierto sin mirar `git log origin/main..main` y el `app.js` real que sirve Render.

> **Sigue sin resolver**, a propósito o por quedar fuera de alcance:
> 1. ~~Esto mejora buscar, no acorta el scroll.~~ **(desfasado, resuelto):** era justo el hueco que cerró el acordeón de `feat/menu-plegable` — con un solo tema abierto a la vez el scroll SÍ se acorta ahora. No hizo falta esperar a un trabajo futuro de "secciones plegables": es lo que hay descrito arriba.
> 2. **Dos personas de la misma iglesia ven el menú con estructura distinta**, según crucen o no el umbral de 12. Sigue igual: es un paso pequeño sobre algo que ya pasaba (cada rol ve entradas distintas), pero conviene tenerlo escrito antes de que alguien lo reporte como fallo.
> 3. **El umbral de 12 sigue siendo un número elegido, no medido.** Nadie sabe todavía cómo usa el pastor la app en el teléfono. Cuando haya ese dato, se puede ajustar — o sustituir todo esto por accesos rápidos a lo que de verdad se usa.
> 4. **(desfasado, resuelto el 5-ago:** ver la sección de esa fecha**)** ~~**El resto de la app sigue sin botones reales.** El menú ya es accesible por teclado; fuera de él quedan cerca de 20 `<div onclick>` (contados hoy con un grep sobre `web/app.js`, sin contar los que solo cortan la propagación de un clic dentro de un modal) que no se alcanzan con Tab. Es la mitad de la brecha de accesibilidad que quedaba anotada aquí; la otra mitad, el menú mismo, ya se cerró.~~
> 5. **(desfasado — y lo estaba desde antes de que nadie lo tocara; comprobado el 5-ago:** el `aria-label` **ya existía desde la reescritura del 3-ago**, con pruebas que lo fijan en `menu-plegable.test.js` (commit `67799a3`). Este punto llevaba dos días diciendo que faltaba algo que ya estaba hecho, porque nadie volvió a mirarlo. Lo único que seguía abierto de verdad era el color, el punto 6**)** ~~**El punto de sin-leer no tiene nombre accesible.** Es un `::after` puramente visual (`content:""`, `web/styles.css:420-421`): un lector de pantalla no anuncia nada distinto en un encabezado con mensajes pendientes. Hoy el punto solo lo ve quien ve. Falta un `aria-label` (o un texto oculto) en el encabezado cuando lleva la clase `con-sin-leer`.~~
> 6. **(resuelto el 5-ago:** ver la sección de esa fecha**)** ~~**El punto es dorado y el badge que representa es rojo.** Comparten el mismo dato (`Chat._sinLeer`), pero no el mismo color — nadie decidió que debieran combinar, simplemente no combinan.~~
> 7. **(resuelto el 5-ago:** ver la sección de esa fecha — el dueño decidió, y un tema de una sola entrada se pinta suelto, sin encabezado**)** ~~**A un líder de cuerpo se le pinta el encabezado "Pastoreo" con una sola entrada debajo** (verificado a mano: de los 12 módulos que ve ese rol, "Pastoreo" solo trae `asistencia`; "Administración" directamente desaparece, por vacío). La regla descarta grupos **vacíos**, no grupos de uno. Sigue siendo un dato de interfaz, no un defecto: queda decidir si un encabezado para una sola entrada compensa.~~

---

## 🆕 30 DE JULIO DE 2026 · TARDE — cuatro frentes en paralelo

Los 11 commits de la mañana **ya están subidos y desplegados** (verificado: el `app.js` que sirve Render trae `escJsAttr` y `safeColor`). Lo de esta tarde es lo siguiente, y **está sin subir**.

### 🗣️ Los mensajes de error hablaban en jerga de programador
`validar()` (`seguridad.js`) respondía `'Datos invalidos: revisa ' + las CLAVES de zod`: la gente leía *"revisa hora_inicio"*, *"revisa persona_id"*. Y de paso **tiraba a la basura los mensajes en castellano que los esquemas ya traían escritos**. Ahora el 400 sale de ahí; si el campo no tiene mensaje propio, se le nombra en castellano ("revisa la contraseña").

**El caso grave estaba en la puerta legal del registro:** `registro.js` usaba `z.literal(true, { errorMap: … })`, que es el nombre de **zod 3**. El proyecto usa **zod 4**, donde el parámetro se llama `error` y `errorMap` **se ignora en silencio** — así que quien no marcaba la casilla de consentimiento leía *"Datos invalidos: revisa acepto"*. Era el único `errorMap` del proyecto.

> **El log NO cambió a propósito:** `[seguridad] entrada rechazada: … campos invalidos: acepto` sigue diciendo el nombre técnico. Cambia lo que ve la persona, no lo que ve quien depura. **No existía ningún test que asertara ese log** (el que provocaba el rechazo solo miraba el 400); ahora sí.

Se re-midieron contra un servidor real las cuatro salidas que `INFORME-SEGURIDAD.md` citaba como medidas: **las cuatro habían dejado de ser ciertas**, y una lo era desde antes (decía que el login rechazaba `iglesia`, campo que pasó a ser opcional con el login de super-admin).

### ✨ Pulido de UX
Los **7 botones de "volver" son ahora idénticos y todos nombran su destino** — el de la hoja de Organización te dejaba en la lista aunque hubieras entrado desde el calendario, y ahora vuelve al calendario **con el mismo día abierto**. Nuevo helper **`modalPrompt`**: ya no queda ni un `prompt`/`confirm`/`alert` nativo en `web/`, incluido el de **eliminar mi cuenta** (hay que teclear `ELIMINAR` exacto; el botón nace apagado). **"Prédica"** con tilde. Y `formPredica`, el único "+ Nuevo" que se llevaba la pantalla por delante, pasa a panel en sitio como los otros 17.

> Inventario de las formas de crear: **17 panel en sitio · 1 pantalla completa · 4 fila de inputs siempre visible**. Las 4 filas **no se tocaron y está justificado**: son alta repetitiva de renglones dentro de una lista que ya estás editando.

### 👶 Escuela Dominical ya no pasa lista — decisión del dueño
La iglesia no la usa. Fuera la tarjeta "✅ Asistencia" y fuera `POST /api/ninos/asistencia`. Se quedan las clases, los niños y las lecciones.

> **La tabla `asistencia_nino` NO se borró, a propósito.** Borrarla es irreversible y en producción hay una iglesia de verdad; su índice único sigue en `db.js` protegiendo lo ya anotado. Nada la escribe ahora.
> **Consecuencia asumida:** `retiro_por` ("quién se llevó al niño ese domingo") queda sin forma de rellenarse. `nino.autorizados` —quién *puede* retirarlo— vive en la ficha del niño y sigue en pie.
> Efecto lateral encontrado al sacarlo: `auditar` era importado y **lo único que se auditaba en el módulo era la asistencia**. Crear una clase, inscribir un niño o subir una lección **nunca se auditaron**. Hueco previo, sigue abierto.

---

## 🆕 30 DE JULIO DE 2026 — auditoría con agentes y tres tandas de arreglos

Cinco agentes en paralelo (backend, frontend, pulido/UX, modelo Organización↔Tesorería, ideas nuevas) sobre el código ya desplegado. **Encontraron cosas que llevaban meses ahí.** Tres commits, ninguno subido todavía.

### 🔴 `TZ` no estaba definida: los tres arreglos de fecha eran INERTES en producción
`fechaLocal()` (`backend/src/fechas.js`) calcula el día con `getFullYear/getMonth/getDate`, que dependen de **la zona del proceso**. El `Dockerfile` definía `NODE_ENV`, `PORT`, `DB_PATH` y `UPLOADS_DIR` — **pero no `TZ`**, y `node:24-slim` corre en UTC. O sea que todo el trabajo de fechas de las fases anteriores no hacía nada en el servidor, y arrastraba dos fallos más que nadie había visto: el saludo de cumpleaños salía la víspera a las 20:00, el "📅 mañana tienes X" llegaba **dos** días antes, y los ingresos del último día del mes caían en el mes siguiente.
**Lo que hacía pasar la suite:** los tests de fecha se fijan `TZ` a mano — eran los únicos sitios del proyecto donde el código corría en la zona correcta. **Lección:** un test que se arregla a sí mismo el entorno no prueba que el entorno esté arreglado.
Cerrado en `Dockerfile` y en `render.yaml`, y el arranque anuncia la zona en el log.

### 🔴 Borrar una canción vaciaba el orden del servicio de OTRA iglesia
`musica.js` hacía `DELETE FROM setlist_item WHERE cancion_id = ?` con el id crudo de la URL y filtraba por iglesia **una línea después**. Un líder de música podía dejar sin repertorio el domingo de otra congregación y recibía un 404 que le decía que no había pasado nada. Ahora resuelve acotado por iglesia, borra en transacción y audita.

### 🟠 El pastor podía desactivar al obispo
`PATCH /admin/usuarios/:id` no llevaba el guardia de `rol_global` que sí tenía el reset de clave 30 líneas más abajo, y el botón "Desactivar" **se pintaba** en su fila. Un clic y el obispo quedaba fuera de **todas** las iglesias. Cerrado en backend y ocultado en la interfaz.

### 🔴 Tres XSS almacenados en atributos
El **tono de una canción** (escalada líder de música → pastor), el **color de un grupo** (lo ejecuta toda la iglesia al abrir el calendario) y **dos nombres** que filtraban comillas pero no el `&`, con lo que las entidades HTML se decodificaban a comillas antes de compilar el JS. Nuevos `escJsAttr()` y `safeColor()` en `web/app.js` + validación hexadecimal en la API. ⚠️ **La CSP no cubre nada de esto: usa `'unsafe-inline'`.**

### 🎵 El himnario: eran 450 alabanzas y son 522
Regenerado desde el PDF nuevo del dueño (*Respaldo Himnario Nuevo*, 224 págs). Comparado antes contra el viejo: **448 coincidían exactas en título y tono, 0 títulos perdidos**. Cuatro fallos:
1. **72 alabanzas quedaban PEGADAS dentro de la anterior** porque su título no lleva el tono entre paréntesis. Buscar *"Días de Elías"* o *"Si mi pueblo"* no daba nada; 16 vivían dentro de *"Fidelidad"*.
2. **La app seleccionaba por número** (`find(h=>h.n===n)`) y los números **se repiten entre las dos secciones**: tocar cualquier corito abría el himno tradicional del mismo número. **Media colección era inalcanzable**, sin dar ningún error. Cada alabanza lleva ahora un **`id` estable** (`"2-45"`).
3. La **alineación del acorde sobre su sílaba** se había perdido en las 450 sin excepción. Ahora se conserva en 465.
4. El **índice alfabético** del final del PDF se pegaba entero a la última alabanza (12.237 caracteres) y un himno arrastraba folios sueltos.
Aplicadas las **4 anotaciones a lápiz** del dueño (págs. 1, 14, 49 y 114). Van como **línea de acordes pura**, sin guiones ni prosa: `_esLineaAcordes()` pide que el 60% de las palabras sean acordes, y de otro modo el transpositor las ignoraría y al cambiar de tono la anotación se quedaría en el viejo.
> ⏳ **Decisión pendiente del dueño:** el PDF descargable (`web/assets/himnario-nuevo.pdf`) sigue siendo el **viejo**, así que va desacompasado con la letra. Reemplazarlo por el nuevo implica que **los trazos a lápiz quedan visibles** para toda la congregación.

### 🔴 La PWA podía quedarse en blanco para siempre
`web/sw.js` instalaba el shell con `Promise.allSettled` —que nunca rechaza— y activaba igual, y `activate` borraba **todas** las cachés con nombre distinto al actual, sin condiciones. Como `server.js` reescribe el nombre en cada despliegue, **la purga siempre se llevaba la caché buena**. Un despliegue mientras alguien va en 3G irregular: instala `index.html`, falla `/app.js`, borra la caché vieja que sí lo tenía → esa persona abre la app sin cobertura y ve **la página en blanco, sin JS, para siempre**. Ahora el shell crítico va por `addAll()` (todo-o-nada) y `activate` solo purga si los críticos están de verdad cacheados. Además, los dos handlers podían resolver a `undefined` en vez de a un `Response`.
> ⏳ **Queda por mirar en un móvil de verdad:** cómo se comporta Chrome ante un install rechazado, y cómo se ve la página de "Sin conexión". Los 9 tests corren en un navegador simulado con `node:vm`.

### 🟠 Cinco fallos que mentían al usuario
Cambiar **el grupo de un evento** decía "actualizado" y no cambiaba nada (`validar()` descarta en silencio las claves que el esquema no declara) · el **contador de mensajes** no subía nunca fuera de la vista de Mensajes · un fallo de red dejaba **`[]` cacheado para siempre** en la lista de personas y los desplegables salían vacíos el resto de la sesión · **"Altas este mes"** se ponía a 0 las últimas horas de cada mes (**quinta** aparición del desfase UTC; ahora hay `mesLocal()`) · **"Orden del servicio"** se quedaba en `…` para siempre sin eventos.

---

## 🆕 FASE 12 (30 jul 2026): "No puedo servir ese día" — la mitad que faltaba

**443 tests.** Rama `feat/no-puedo-servir` (seis commits originales, más ocho de una revisión posterior que cerró un camino sin avisar en música, un permiso de más y cuatro fallos menores de interfaz — y una tercera revisión más, ya cerrada, que no queda contada aquí a mano: el número exacto envejece con cada commit, incluido el que escribe este párrafo). Spec en `docs/superpowers/specs/2026-07-30-no-puedo-servir-design.md`, plan en `docs/superpowers/plans/2026-07-30-no-puedo-servir.md`.

Media función llevaba construida en el proyecto desde hacía meses **y no se había disparado ni una vez**: la tabla `fecha_no_disp` existía, `asignaciones.js` la consultaba al asignar y la pantalla del líder ya pintaba el aviso — pero **no había un solo `INSERT` en todo el proyecto**. Faltaba la pantalla donde alguien dice "del 5 al 12 no puedo".

**Lo que hay ahora:**
- En **"Mi Servicio"**, sección *"Cuándo no puedo servir"*: la persona marca rangos con motivo opcional y los quita. Solo los suyos; nadie puede marcar por otro.
- En **"Servicio"**, el desplegable de personas marca `⚠️ no disponible` a quien no puede el día del evento elegido.
- En **"Musicos"**, agregar a alguien al equipo del evento también avisa si esa persona marcó no disponible ese día (ver más abajo: era el camino que faltaba).
- Backend nuevo `disponibilidad.js` (4 rutas), **17 tests**.

### 🟠 Una revisión posterior encontró seis fallos más — todos cerrados
- **Música no avisaba.** Había dos caminos por los que a alguien le asignan servir, y solo uno consultaba `fecha_no_disp`: `POST /api/asignaciones` sí, `POST /api/musica/plan/:eventoId/equipo` nunca. Justo música es donde más rota la gente, y la sección de "Mi Servicio" prometía "tu líder lo verá al asignar" — mentira para música. Cerrado replicando la misma consulta y el mismo texto de aviso; nunca bloquea, el integrante se agrega igual.
- **El permiso del endpoint del líder era más ancho de lo aprobado.** `GET /api/disponibilidad/no-disponibles` usaba `esLiderOAdmin`, que también deja pasar a `lider_musica` y `lider_ed` — ninguno de los dos ve la pantalla que lo consume, pero podían pedirlo a mano y reconstruir el calendario de ausencias de toda la congregación. Nuevo helper `veServicioGestion` (auth.js): el pastor, o quien tenga una pertenencia con `rol='admin'` (líder de cuerpo) — el mismo criterio que ya usa `modulosVisibles` para el módulo `servicio_gestion`.
- **La comprobación de "elige las dos fechas" era código muerto.** `fechaSelectHTML('nd1','')` sin `{opcional:true}` arrancaba siempre en la fecha de hoy, así que el guardia nunca saltaba: abrir el panel y pulsar Guardar sin tocar nada creaba en silencio un periodo de un día para hoy.
- **Los periodos se listaban sin año.** El selector permite hasta tres años adelante y dos agostos distintos se veían idénticos.
- **El fallo de la comprobación era invisible para el líder.** Un `catch{}` vacío no bloqueaba nada (correcto) pero tampoco distinguía "nadie marcó nada" de "no se pudo comprobar". Ahora hay un aviso pequeño y neutro, sin bloquear.
- Dos limpiezas menores: un bloque de "no se pudo cargar" reescrito a mano en vez de reusar `errCargar()`, y el arnés de tests (`helpers.js`) sin `fecha_no_disp` en su lista de tablas a reiniciar.

### 🔴 El push fantasma, que es la razón de fondo
El orden de `POST /api/asignaciones` era: (1) consulta si la persona no está disponible — **ya lo sabe aquí**; (2) crea la asignación; (3) le manda push *"Te asignaron"*; (4) recién le devuelve el aviso al líder. **El servidor sabía en el paso 1 que no podía y le mandaba el push igual**, y el líder se enteraba cuando el otro ya lo tenía en el teléfono; deshacerlo dejaba a alguien con una notificación fantasma. Por eso la marca se pinta **antes**, en el desplegable.

### Decisiones del dueño
Solo uno mismo marca (nadie por otro) · **el líder ve el motivo, como ya hacía el código, y sin aviso previo de que se verá** · vive dentro de "Mi Servicio", no en el menú · solo rangos de fechas.

> ⚠️ **La columna `repetir` sigue sin usarse, y no es un olvido:** la consulta que dispara el aviso (`asignaciones.js:53`) hace `? BETWEEN desde AND hasta` y **no la mira**. Guardar ahí una regla semanal no haría saltar ningún aviso. Si algún día se quiere "todos los domingos", hay que cambiar también esa consulta y decidir hasta cuándo vale una regla sin fecha de fin.
> ⚠️ **Riesgo asumido:** el motivo es texto libre y lo lee el líder, sin ningún aviso de que se verá. Si la gente empieza a escribir cosas delicadas, ese aviso es el primer sitio donde mirar.

### Tres cosas que aparecieron por el camino
1. **Darse de baja no borraba estos periodos.** `cuenta.js` limpiaba `reset_codigo`, cumpleaños, `push_sub` y `dispositivo_push`, pero no `fecha_no_disp` — y el motivo es texto libre que puede ser un dato de salud, enganchado a una persona que la baja **anonimiza** en vez de borrar. Cerrado en la misma transacción.
2. **Carrera al cambiar de evento**, encontrada en revisión: dos consultas en vuelo y la que llegaba tarde pintaba las marcas de la fecha anterior — una marca mentirosa justo en la decisión que la función existe para informar. Cerrada comparando la fecha capturada contra la seleccionada antes de pintar.
3. **`validar(schema, 'query')` no se usaba en ningún sitio del proyecto**; esta es la primera ruta que lo estrena. Funciona (Express 4 permite reasignar `req.query`) y hay un test que lo demuestra de verdad: sin el middleware la ruta habría devuelto 200 con `[]`, no 400.

> 🌱 **Dato del seed que estaba mal documentado:** **`pastor` NO tiene asignaciones** con el `seed.js` actual, así que cae en el camino "no tienes nada asignado". Para probar el camino con asignaciones sirve **`abel`**; para el vacío, `lucas`.

---

## 🆕 FASE 13 (31 jul 2026): Quién puede retirar a cada niño

**455 tests.** Rama `feat/retiro-seguro-ninos`. Spec en `docs/superpowers/specs/2026-07-30-retiro-seguro-ninos-design.md`, plan en `docs/superpowers/plans/2026-07-30-retiro-seguro-ninos.md`.

**La escena:** termina la Escuela Dominical, un adulto que la maestra no conoce dice *"vengo por la Sofi"*, y **la maestra no tiene dónde mirar** quién puede llevársela.

Otro cajón con la etiqueta puesta y vacío: la columna `nino.autorizados` existía y el servidor **ya la aceptaba y la guardaba** al inscribir — pero el frontend **no la mandaba nunca** ni la mostraba (cero coincidencias de `autorizados` en `web/app.js`).

**Lo que hay ahora:** en la ficha de cada niño, la línea *"Puede retirarlo: Ana Rojas (abuela), Juan Pérez (papá)"*; el campo en el formulario, con ayuda que dice qué se espera (nombre y parentesco); y **botones de editar y borrar**, que el módulo no tenía.

### El bloqueo que hubo que quitar antes
`ninos.js` **solo sabía crear**: ni un `PATCH` ni un `DELETE` en todo el módulo. Una lista de autorizados que no se puede corregir sirve de poco, porque **es justo el dato que cambia** (la abuela se muda, los padres se separan). Ahora se puede corregir la ficha y sacar de la lista a quien ya no viene.

- **Borrar se lleva el historial de asistencia del niño**, en transacción y con las asistencias primero (`asistencia_nino.nino_id` referencia `nino(id)`; al revés salta `FOREIGN KEY constraint failed`). Se decidió así porque ese historial **ya no lo muestra ninguna pantalla** desde que se retiró la asistencia: conservarlo sería guardar datos de un menor que nadie puede consultar.
- **Editar y borrar se auditan.** Antes **nada de este módulo dejaba rastro** — lo único auditado era la asistencia, y se fue con ella.
- El `UPDATE` del `PATCH` se construye desde una **lista blanca de columnas**, nunca desde las claves del body.

> ⚠️ **Esto dice quién PUEDE retirar al niño, no quién se lo llevó.** Esa mitad (`asistencia_nino.retiro_por`) se fue con la asistencia de niños el 30 jul. Si el papá pregunta el domingo *"¿con quién se fue?"*, la app sigue sin poder responder. Si en uso real hace falta, la conversación es **reabrir lo de la asistencia**, no añadir un campo.
> ⚠️ ~~**Siguen sin poder editarse ni borrarse las clases ni las lecciones.** Solo niños.~~ **(Resuelto el 5-ago:** las clases y las lecciones ya se corrigen y se borran, con los mismos patrones que estrenó esta fase para los niños. Con una diferencia deliberada: una clase **solo se borra vacía** — con niños dentro responde 409 con el conteo. Ver la sección "5 de agosto · noche (2)"**)**

### 📜 Se corrigió el texto legal, y hacía falta por dos motivos
La **Política de Privacidad** no declaraba la categoría de datos que esta fase empieza a recoger (**las personas autorizadas para retirar al niño**, que son datos de **terceros** que no usan la app), y además seguía declarando *"Asistencia — Registro de asistencia a las actividades infantiles"*, **que es falso desde el 30 jul**. Lo mismo en la autorización que firman los padres. Corregidos los cuatro archivos (`legal/*.md` y `web/legal/*.html`): se añadió la categoría nueva diciendo expresamente que se recogen **solo nombre y parentesco**, se quitó la asistencia y se dejó una nota de que los registros anteriores se conservan hasta que se borre la ficha.
> ⏳ **Sigue pendiente el abogado** con los placeholders `[…]` de siempre (razón social, RUT, domicilio); esto no lo sustituye. Cuando los limpie, que revise también estas dos secciones.

### ✅ De paso se cerró una brecha legal que nadie había notado
La Política promete que los datos de un menor *"se eliminan o anonimizan a solicitud del padre, madre o apoderado"*. **Hasta esta fase la app no podía cumplirlo**: no había ninguna forma de borrar a un niño. Ahora sí.

### 🔴 El plan traía un XSS, y lo cazó quien lo implementaba
El código de ejemplo del plan pasaba el nombre del niño **sin escapar** a `modalConfirm`, que mete su mensaje crudo en `innerHTML`. Un niño inscrito con `<script>` en el nombre lo habría ejecutado al pulsar Borrar. Se corrigió, y después se auditaron **las 29 llamadas a `modalConfirm` de toda la app: todas las que pasan datos de usuario ya escapaban** — una lleva incluso un comentario avisando de esta misma trampa. La convención del repo estaba bien; **el plan fue la excepción**. Lección: el código de ejemplo de un plan no está revisado, y se revisa igual que el resto.

---

Documento para **retomar el desarrollo más tarde**. Resume qué está hecho, cómo arrancar todo y qué quedó pendiente.

---

## 🔎 BLOQUEANTES DE LA AUDITORÍA DEL 20 DE JULIO — estado al 28 de julio

Aquella auditoría (4 agentes: seguridad, fiabilidad, funcional/UX, legal+interfaz) listó 5 bloqueantes. **Ya están desplegados los arreglos de código**; lo que queda depende de configuración o de terceros:

1. **`superadmin/1234` público** → ✅ CERRADO Y DESPLEGADO. `SEED_ON_EMPTY=0` en `render.yaml`, la clave del super-admin viene de `SUPERADMIN_PASSWORD`, y el super-admin es cuenta de sistema (`iglesia_id=NULL`).
2. **XSS almacenado** → ✅ CERRADO Y DESPLEGADO. `escHtml()`/`safeUrl()` en ~40 campos.
3. **Pérdida de datos en persistencia** → 🟡 **RESUELTO EN CÓDIGO, FALTA CONFIRMAR EN RENDER.** No hizo falta disco de pago: `docker-entrypoint.sh` restaura la BD desde **Cloudflare R2** al arrancar y la replica en continuo con **Litestream** (`litestream.yml`). Se activa solo si están definidas `R2_ENDPOINT`, `R2_BUCKET`, `LITESTREAM_ACCESS_KEY_ID` y `LITESTREAM_SECRET_ACCESS_KEY`; si faltan, el arranque avisa por log y los datos vuelven a ser efímeros. **Acción del dueño:** confirmar que esas 4 variables están puestas en Render.
4. **Recuperación de contraseña muerta** (SMTP sin configurar) → ❌ **SIGUE PENDIENTE.** El código de recuperación existe (`cuenta.js`, maneja correctamente el caso de dos personas con el mismo correo), pero sin `SMTP_USER`/`SMTP_PASS` no sale ningún correo.
5. **Legal** → 🟡 **PARCIALMENTE CERRADO Y DESPLEGADO.** El consentimiento general y el ejercicio ARCO autoservicio funcionan en producción. Falta que un abogado limpie los placeholders `[…]` de `web/legal/*.html` y que el dueño defina `LEGAL_CONTACT_EMAIL` — en ese orden (ver detalle abajo).

Los hallazgos **B1–B7** de aquella auditoría (obispo con permisos de admin, fugas entre iglesias, `PATCH` destructivos, borrado cruzado de notificaciones, validación de `presentes`) están **todos cerrados**: verificados uno por uno contra el código el 27 de julio.

### 👉 ACCIONES DEL DUEÑO EN RENDER (las que siguen abiertas)
- **`SUPERADMIN_PASSWORD`** — si no está definida, la clave vieja del super-admin sigue vigente.
- **`R2_*` y `LITESTREAM_*`** (4 variables) — sin ellas **no hay persistencia**: la BD se pierde en cada reinicio.
- **`SMTP_USER` / `SMTP_PASS`** — sin ellas nadie puede recuperar su contraseña por correo.
- **`LEGAL_CONTACT_EMAIL`** — solo *después* de que el abogado limpie los placeholders del texto legal.
- **`VAPID_*`** (3 variables) — sin ellas el push queda desactivado (las notificaciones siguen en la campana).

### 🟡 Bloqueante legal #5 — parcialmente cerrado (✅ desplegado; falta el trabajo del abogado)
- ✅ **IMPLEMENTADO:** consentimiento general (checkbox al registrarse + puerta para cuentas existentes vía `/me`) y ejercicio de derechos **ARCO autoservicio** (ver/editar/eliminar mis datos desde la cuenta).
- ✅ **IMPLEMENTADO:** correo de contacto legal (ARCO) configurable por variable de entorno `LEGAL_CONTACT_EMAIL` — endpoint público `GET /api/legal/contacto`, inyectado en las 5 páginas de `web/legal/` (se muestra solo si la variable está definida).
- ❌ **PENDIENTE del dueño:**
  1. Completar con un **abogado** todos los placeholders `[…]` restantes de `web/legal/*.html` (razón social, RUT, domicilio, ciudad, fecha, y el `[CORREO DE CONTACTO — PENDIENTE]` del texto estático) antes de considerar esos documentos vigentes/vinculantes.
  2. **Recién DESPUÉS** de limpiar esos placeholders, definir `LEGAL_CONTACT_EMAIL` en Render (y en `backend/.env` local) con el correo real de contacto ARCO. ⚠️ **Orden importante:** si defines `LEGAL_CONTACT_EMAIL` con el texto legal aún sin limpiar, la misma sección mostrará a la vez el placeholder `[CORREO…]` y el correo real inyectado — queda contradictorio de cara al usuario. Mientras el correo no esté definido, la línea dinámica simplemente no aparece (no rompe nada).

### 👉 ACCIÓN DEL DUEÑO EN RENDER (imprescindible tras desplegar)
- Definir **`SUPERADMIN_PASSWORD`** (contraseña fuerte) en Render → Environment. Al primer arranque, rota automáticamente la vieja `1234` del super-admin de producción. Sin esta variable, la `1234` actual sigue vigente.

---

## 🚀 EN PRODUCCIÓN (verificado el 28 jul 2026)
- **URL pública:** https://iglesia-app-r9ay.onrender.com
- **Deploy vivo:** commit `a15c397`. Verificado el 28 jul desde fuera: `/api/health` → 200; `/api/organizacion` → 401 (el router existe y exige sesión); el `styles.css` servido trae `--primary-tx` y `.cal-puntos`; el `app.js` servido trae `toLocaleString('es-CL')`.
- **Repositorio GitHub:** https://github.com/77pablo/iglesia-app  (rama `main`; se sube con **GitHub Desktop**)
- **Host:** **Render** (Docker, **Blueprint** desde `render.yaml`, plan **Free**), servicio `iglesia-app` (ID `srv-d9f23vrbc2fs738v1hu0`). Cada `push` a `main` en GitHub → **redeploy automático**.
- **Variables en `render.yaml`:** `NODE_ENV=production`, `JWT_SECRET` (autogenerado), **`SEED_ON_EMPTY=0`** (nunca sembrar demo en producción), `DB_PATH=/data/iglesia.db`, `UPLOADS_DIR=/data/uploads`, más los huecos de `SUPERADMIN_PASSWORD`, `R2_*`/`LITESTREAM_*` y `VAPID_*` que el dueño define en el panel.
- ⚠️ **Persistencia:** `/data` es efímero en el plan free. La BD sobrevive **solo si Litestream está configurado** (ver bloqueante #3 arriba). El servicio se **duerme** tras ~15 min de inactividad (primera visita ~30-50 s).
- Archivos de deploy en `app/`: `Dockerfile`, `.dockerignore`, `.gitignore`, `render.yaml` (bloque `disk:` retirado para free; instrucciones para re-activarlo), `DEPLOY.md`.
- *(Railway anterior descontinuado: se acabó el crédito.)*

### ⏳ Pendientes para uso real (no demo)
1. **Confirmar Litestream en Render** (4 variables `R2_*`/`LITESTREAM_*`): es lo único que separa la BD de ser efímera. Sin eso, cada reinicio borra todo. **El bucket `iglesia-app-db` ya existe y lleva tiempo en uso**, así que lo pendiente es *confirmar*, no crear (ver punto 1 de "por dónde retomar").
   Desde el 28 jul el panel del super-admin muestra el estado real del respaldo (tarjeta 💾 Respaldo) y avisa una vez al día si deja de funcionar, así que este fallo ya no es silencioso. **Ojo:** el indicador dice la verdad sobre lo que hay; no sustituye a poner las variables.
2. **SMTP** (`SMTP_USER`/`SMTP_PASS`): sin ellas la recuperación de contraseña no envía nada.
3. **Push real (VAPID):** añadir `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` en Render → Environment (ver Fase 5).
4. **Reconocimiento facial** (Python, carpeta `facial/`) NO está en el contenedor → desplegar aparte si se quiere usar `/inscribir.html` y `/kiosko.html`.
5. Considerar **OAuth de Google Drive** (hoy es vinculación por enlace de carpeta).

### ✅ Integrado a `main` (20 jul 2026)
- **Seguridad** (`feat/seguridad`): `helmet` (CSP con `connect-src 'self'`), `express-rate-limit`, validación `zod` en login/admin/tesorería/cuenta, validación de env al arrancar + `.env.example`, logging `[seguridad]`. Detalle en `INFORME-SEGURIDAD.md`. Pendiente: `zod` en el resto de routers. *(Los límites se cuentan **por persona** desde el 28 jul — ver Fase 9.)*
- **Chat interno** (`feat/mensajeria-chat`): ver **Fase 6** abajo.

---

## 🆕 FASE 11 (28 jul 2026): Indicador de persistencia — el respaldo deja de fallar en silencio — DESPLEGADO

Hasta hoy, que la BD se estuviera respaldando o no vivía en **una línea del log de arranque del contenedor**, que nadie lee. El fallo más caro del proyecto era también el más silencioso: si faltaba una variable o una clave estaba mal copiada, todo se veía normal —la gente se registraba, subía comprobantes, escribía en el chat— hasta que un reinicio se lo llevaba. Spec en `docs/superpowers/specs/2026-07-28-indicador-persistencia-design.md`, plan en `docs/superpowers/plans/2026-07-28-indicador-persistencia.md`.

**Cómo leer la tarjeta 💾 Respaldo** (primera cosa del panel del super-admin). Son **cuatro** estados, no dos, y la diferencia importa:

| Color | Qué significa | Qué hacer |
|---|---|---|
| ✅ **Verde** | Está respaldando, con la fecha del último respaldo | Nada |
| ⛔ **Rojo** | **No** está respaldando. Un reinicio borra los datos | Revisar las variables `R2_*`/`LITESTREAM_*` en Render |
| ⚠️ **Ámbar** | No se pudo comprobar (se colgó el comando, formato inesperado) | Mirar otra vez más tarde; **no** es una alarma |
| — **Gris** | Esta instancia no replica (normal en tu máquina) | Nada |

- **Se comprueba el respaldo REAL, no las variables.** A Litestream **se le pregunta** (`litestream generations` da el retraso verdadero), porque es un proceso vivo con estado: eso detecta la clave mal copiada y el bucket mal escrito. Al bucle de `rclone` de los uploads **no se le puede preguntar** —es un `while` de shell que, si muere, muere en silencio— así que deja un **sello** en disco tras cada sincronización correcta, y el sello envejeciendo es lo único que lo delata.
- **La salud de la BD se mide por el *retraso*, no por la fecha del último respaldo:** si nadie escribe en tres horas esa fecha envejece aunque todo esté bien, y medirlo así daría una alarma falsa cada noche.
- **En producción, sin variables = rojo.** Fuera de producción es gris. Sin esa distinción el indicador se callaba justo en el escenario que lo justificaba, que además es el estado real de Render hoy.
- **Aviso activo** al super-admin cuando pasa a rojo, **una vez al día** (tabla `aviso_sistema`; no sirve `recordatorio_enviado` porque su `iglesia_id` es `NOT NULL` y el super-admin no tiene iglesia). La dedupe es por día porque el registro de "ya avisé" vive en la misma BD cuya pérdida intenta prevenir.
- **Nunca grita por nada:** hay periodo de gracia de 3 min tras arrancar (al despertar del plan free el disco viene vacío), "no pude comprobarlo" nunca avisa, y un formato de salida inesperado degrada a ámbar en vez de a alarma.
- Backend nuevo `persistencia.js`, endpoint `GET /api/superadmin/persistencia`, vigilancia colgada de `/api/me` (no hay cron en el plan free: cualquier tráfico sirve de disparo), una línea en `docker-entrypoint.sh` para el sello. **43 tests nuevos.**

## 🆕 FASE 8 (28 jul 2026): Organización de eventos — DESPLEGADO

Apartado para organizar un evento: **qué llevar** (con cantidad y visto bueno) y **cuánto se gastó** (lista de gastos que se suma sola). Funciona pegado a un evento del calendario o como lista suelta.

- Backend nuevo `organizacion.js` (`/api/organizacion`, 11 rutas); tablas `evento_org`, `evento_org_cosa`, `evento_org_gasto` con índice único parcial (una hoja por evento, pero varias listas sueltas).
- **Ver:** líderes y pastor (`esLiderOAdmin`). **Editar:** solo quien creó la lista o el pastor. Todo acotado por `iglesia_id`: una hoja de otra iglesia devuelve 404, ni siquiera confirma que exista.
- `total_gastado` **nunca se guarda**: se recalcula al leer, así no queda descuadrado.
- La hoja de un evento **se crea sola** la primera vez que se abre. Si el `INSERT` choca con el índice único (otra iglesia, o dos procesos a la vez), se relee acotado a la iglesia en vez de reventar con 500.
- Borrar un evento borra su hoja con cosas y gastos, en la misma transacción.
- Frontend: apartado **🗒️ Organización** en el menú (solo líderes) y botón dentro de cada evento del calendario.
- **12 tests** del módulo. Spec y plan en `docs/superpowers/`.

## 🆕 FASE 10 (28 jul 2026): Organización v2 — la hoja sale del teléfono del líder — DESPLEGADO

v1 dejaba la hoja como cuaderno privado del líder: el feligrés recibía 403 en todo el módulo, así que la coordinación seguía ocurriendo en WhatsApp. v2 lo cierra. Diseño en `docs/superpowers/specs/2026-07-28-organizacion-v2-design.md`, plan en `docs/superpowers/plans/2026-07-28-organizacion-v2-responsable.md`.

- **Responsable por cosa** (`evento_org_cosa.responsable_id`, `asignada_en`): cualquier persona **activa de la iglesia** (decisión del dueño: media hoja es suelta y no cuelga de ningún grupo, y quien trae la torta a veces no está en el grupo). Si la cuenta se desactiva, el dato **no se borra**: la hoja avisa "cuenta inactiva — reasignar".
- **Aviso al asignar**, notificación + push, y **solo cuando el responsable cambia de verdad**: reenviar el mismo o editar el nombre de la cosa no vuelve a notificar (el líder edita la lista muchas veces mientras la arma).
- **La rendija**: `GET /mis-cosas` y `PATCH /mis-cosas/:id` registradas **entre `authMiddleware` y el gate de líderes**. El feligrés ve y marca SU línea sin que se le abra la hoja — nunca gastos, totales ni cosas de otros. Aparece como "📦 Mi parte" dentro de **Mi Servicio**, no como módulo aparte.
- **Recordatorio el día antes** a quien trae algo (`recordatorios.js`, clave `org_cosa:<id>:dia-1`, con dedupe).
- **Quién puso el dinero** (`evento_org_gasto.pagado_por`) + resumen "Quién puso qué". Los gastos anteriores a esta función no tienen pagador: suman al total pero no al resumen, y la hoja muestra la diferencia como "Sin registrar quién puso" para que las cifras cuadren.
- **Imprimir** (`@media print`, sin gastos: la hoja se pega en la puerta) y **copiar para WhatsApp** (texto plano, sin gastos: se pega en un grupo con feligreses).
- **Rendición** (29 jul): segundo imprimible de la misma hoja, para el tesorero — gastos, total, "Quién puso qué" y línea de firma; sin las cosas a llevar ni la hora de llegada. Una clase `modo-rendicion` en el `<body>` decide cuál de los dos papeles sale; las reglas viven en el `@media print` que ya existía y el contenido ya estaba pintado. Sin backend. El botón no aparece si no hay gastos. Se verifica con `scripts/verif-imprimibles.py`, porque ninguna prueba de Node ve una regla de impresión.
- **Duplicar lista**, que reemplaza al sistema de plantillas: copia las cosas en limpio (sin marcar, sin responsables), nunca los gastos, y nace **suelta**. Basta con poder VER la hoja, así un líder parte de la lista de otro sin tocarla.
- **Fuera de alcance a propósito:** presupuesto estimado por línea (el spec lo deja quinto y condicionado: si los líderes no presupuestan de verdad, nadie lo usará), integración con Tesorería (choca con los permisos de `tesoreria.js`, y esa plata no es de la iglesia).

## 🆕 FASE 9 (28 jul 2026): Auditoría UX medible + límite de peticiones por persona — DESPLEGADO

**`scripts/auditoria-ux.py`** — la lista de deuda de UX ya no se vence, porque se vuelve a generar. Recorre **20 vistas** × 3 anchos (390/768/1280) × 2 temas y **mide**: área táctil, nombre accesible de los botones de ícono, contraste y desborde horizontal. Cómo correrlo y qué arrojó: `docs/AUDITORIA-UX-2026-07-27.md` (primera corrida, 11 vistas) y **`docs/AUDITORIA-UX-2026-07-28.md`** (recorrido ampliado, el vigente).

> **Ampliado el 28 jul:** entraron las 7 vistas que faltaban (Administración, Panel del Pastor, Reportes, Música, Niños, Cuidado pastoral, Mi Servicio) más los sub-estados de caso de cuidado y clase abierta. Como ninguna persona las ve todas, **cada vista declara con qué usuario se audita** y el script entra una vez por usuario (`pastor`, `abel`, `joaquin`, `marta`) fusionando los hallazgos; si una vista no está en el menú de su usuario, se registra como omitida en vez de reventar. Arrojó **contraste 9 → 0 · área táctil bajo el mínimo AA 18 → 0 · desborde horizontal 2 → 0**: enlaces sueltos con el azul por defecto del navegador (1.79:1 en oscuro) ahora con `--primary-tx`, checkbox de Escuela Dominical 23×23 → 24×24, título del himnario en Música, y la barra de botones de la hoja de Organización, que desbordaba a 390px.

Resultado: **nombres accesibles 36 → 0 · área táctil bajo el mínimo AA 54 → 0 · contraste bajo AA 75 → 0**. Lo arreglado:
- **Contraste en tema oscuro.** `aplicarAjustes()` fijaba los colores del acento iguales en ambos temas; el número del día del calendario quedaba en 1.78:1, ilegible. Se separó el acento **como texto** (`--primary-tx`, aclarado con `color-mix` solo en oscuro) del acento **como fondo**. 23 estilos que usaban `var(--red)`/`var(--green)` para texto pasaron a `--red-tx`/`--green-tx`.
- **Moneda unificada en CLP.** Convivían `es-MX` en Tesorería (`$1,250,000`) y `es-CL` en Organización. Ahora hay un solo `money()`.
- **Calendario en móvil.** La grilla tenía ancho mínimo de 480px con scroll lateral: a 390px se veía de LUN a VIE y **el domingo quedaba fuera**. Ahora entran las 7 columnas y cada evento es un punto del color de su grupo; el toque abre el detalle del día. En escritorio no cambia nada.

**Límite de peticiones por persona** (`seguridad.js`). Contaba **por IP**: toda la congregación en el wifi del templo compartía una sola cuota de 100 peticiones cada 15 min y se bloqueaban entre sí. Ahora, con sesión iniciada, la cuota es **por persona**; el tráfico anónimo se sigue contando por IP, y el **login sigue por IP** a propósito (es la protección contra fuerza bruta). El token **se verifica**, no solo se lee: si bastara con leerlo, cualquiera inventaría `persona_id` para saltarse el límite.

## 🆕 FASE 6 (20 jul 2026): Mensajería interna (chat) — PROBADO
- Chat **1:1**, **por grupo** (auto-provisionado) y **a medida**; tiempo real por **SSE** (`sse.js` hub + `GET /api/mensajes/stream?token=`), adjuntos (reusa `/api/upload`), **leído/no-leídos** (por `ultimo_leido_mensaje_id`), **"escribiendo…"** y **moderación del pastor** (soft-delete en grupo/custom, nunca 1:1; borra también el adjunto y poda a quien sale del grupo).
- Backend nuevo `mensajes.js` (`/api/mensajes`) + `sse.js`; tablas `conversacion`, `conversacion_miembro`, `mensaje`. Permisos en `auth.js` (`puedeIniciarChatCon`, `verificarToken`). Los mensajes **no** llenan la campana: push (offline) + badge de no-leídos.
- Push: `push.js` incluye `url` (`/#mensajes/<id>`); `web/sw.js` navega la pestaña a la conversación al tocar la notificación.
- Frontend: vista **💬 Mensajes** con `EventSource`. Seed: conversación demo `abel`↔`maria`.
- **Pruebas:** `npm test` en `backend/` — 21 (chat) + 6 (seguridad) en verde. Plan/spec en `app/docs/superpowers/`.

> ✅ Transpositor en el cancionero, fechas día-mes-año, comprobante en tesorería y push real: **hechos** (Fase 5).

### 🎨 Rediseño visual (aplicado)
Sidebar verde azulado oscuro (`#113438`), fondo crema (`#f4f3f0`), hero degradado verde→dorado, tarjetas gris cálido radius 16, números negro sólido, **iconos de línea** + logo de cruz, render de auditorio en Anuncios. Acento por defecto "Pino". Hay **Ajustes** (tema claro/oscuro/auto, color de acento, tamaño de texto).

---

## 🆕 FASE 7 (20 jul 2026): Directorio de miembros + cumpleaños — DESPLEGADO

*(Estaba marcado "EN CONSTRUCCIÓN" hasta el 28 jul; en realidad ya estaba terminado: `directorio.js` con 4 rutas, `directorio.test.js` en verde y `/api/directorio` respondiendo 401 en producción.)*

Módulo **Directorio** para que la congregación se conozca y se contacte entre sí, cuidando la privacidad de cada persona.

- **Perfiles del directorio:** cada miembro tiene una ficha con **foto**, nombre, grupo(s) a los que pertenece y datos de contacto (teléfono, correo). La foto reutiliza el mecanismo de subida existente (`/api/upload`).
- **Contacto oculto por defecto, sin excepciones:** el teléfono y el correo de cada persona aparecen **ocultos** en el directorio hasta que **la propia persona** decide mostrarlos. No hay atajo para pastor ni líderes: **cada quien activa su propia visibilidad**, igual que cualquier feligrés — coherente con el principio ya aplicado en otros módulos ("el pastor ve, pero no administra lo ajeno").
- **Cumpleaños del mes:** el directorio muestra quiénes cumplen años en el mes actual (ordenados por día), tomando el campo `persona.cumple` que ya existe en la base de datos.
- **Aviso automático de cumpleaños:** el día del cumpleaños de alguien, se notifica a **toda la iglesia** (reutiliza el mecanismo de segmentación `{tipo:'todos'}` de `notificaciones.js`, Fase 4), para que la congregación lo salude.
- **Columnas nuevas en `persona`** (pensadas como `ALTER TABLE` idempotente en `db.js`, igual que en fases anteriores): `foto_url` (ruta de la foto de perfil), `mostrar_telefono` y `mostrar_email` (booleanos, `0` por defecto = ocultos).
- **Endpoints previstos:** `GET /api/directorio` (listado con los campos de contacto según la visibilidad que cada persona haya activado, más el bloque de cumpleaños del mes), y una vía para que cada persona actualice su propia foto y sus preferencias `mostrar_telefono`/`mostrar_email` (en `cuenta.js`, junto a "cambiar contraseña").
- **Nota de diseño:** por tratarse de datos de contacto personal, conviene revisar este módulo junto con la Política de Privacidad y los Consentimientos (ver `docs/LEGAL.md`) — en particular, si la foto de perfil y la fecha de cumpleaños requieren su propio consentimiento específico o quedan cubiertas por el consentimiento general de tratamiento de datos.

---

## 🆕 FASE 4 (26 jun 2026): 4 funcionalidades nuevas — IMPLEMENTADAS Y PROBADAS

Todo respeta el aislamiento multi-iglesia (`iglesia_id`) y los permisos por grupo.
**Nota:** la BD usa `node:sqlite` (`DatabaseSync`), no `better-sqlite3`. Las tablas nuevas se crean con `CREATE TABLE IF NOT EXISTS` y las columnas añadidas a `anuncio` con un `ALTER TABLE` guardado (idempotente) en `db.js`.

### 1) 🔔 Notificaciones segmentadas (`notificaciones.js`, `anuncios.js`)
Un aviso/anuncio puede dirigirse a un **segmento**: `{tipo:'todos'}` | `{tipo:'grupo', grupo_id}` | `{tipo:'rol', rol}`. El backend expande el segmento a las personas correctas vía `pertenencia` e inserta una notificación a cada una.
- Helpers exportados en `notificaciones.js`: `personasDeSegmento()`, `notificarSegmento()`, `etiquetaSegmento()`.
- `anuncios.js`: `POST /api/anuncios` ahora acepta `segmento` (retrocompatible: sin `segmento` = toda la iglesia). Se guarda el segmento usado en las columnas nuevas `anuncio.segmento/grupo_id/rol`. `notificarIglesia()` sigue existiendo (usa internamente el segmento "todos").
- Endpoints nuevos: `GET /api/notificaciones/segmentos` (grupos + roles para los selectores) y `POST /api/notificaciones/segmentada` (enviar aviso sin crear anuncio; solo líder/pastor).
- Frontend: selector "Dirigir a (segmento)" en el formulario de Anuncios (`web/app.js`).
- **PROBADO:** anuncio a grupo Jóvenes → 3 avisados (miembros del grupo); raquel (no es de Jóvenes) NO lo recibe. Aviso por rol `tesorero` → solo raquel. Feligrés sin permiso → 403.

### 2) 📖 Modo offline (PWA) + Biblia/Devocional (`devocional.js`, `web/sw.js`, `web/manifest.json`)
- PWA básica: `web/manifest.json` + `web/icon.svg` + `web/sw.js` (cachea el *shell*: index/app.js/styles.css/manifest/icon; navegaciones network-first con fallback al shell; **no** cachea `/api` ni `/uploads`). Registrado en `index.html`.
- Módulo "Biblia / Devocional" en el NAV (visible para todos). Permite **leer** y **descargar** un devocional para leerlo **offline** (se guarda en `localStorage`, clave `devo_offline`).
- **Versión de caché AUTOMÁTICA (26 jun):** `/sw.js` se sirve dinámicamente desde `server.js` y su `CACHE` se calcula con la fecha de modificación más reciente del shell (`app.js`/`styles.css`/`index.html`…), con `Cache-Control: no-cache`. ⚠️ **Ya NO hay que subir la versión a mano** al cambiar el frontend; cambia sola.
- Backend `devocional.js`: CRUD por iglesia. `GET/POST/PATCH/DELETE /api/devocional`. Crear/editar/borrar solo líder/pastor (o autor).
- **PROBADO:** CRUD de devocional OK; feligrés no puede crear (403); archivos PWA servidos (manifest 200, sw.js 200, icon.svg 200).

### 3) 📝 Toma de notas inteligente (`sermones.js`)
- Tablas `sermon` (bosquejo: título, predicador, fecha, texto_base, bosquejo, `puntos` en JSON, `evento_id` opcional) y `nota_personal` (privada por persona).
- Endpoints: `GET /api/sermones`, `GET /api/sermones/:id` (bosquejo + MIS notas), `POST/PATCH/DELETE /api/sermones/:id` (publicar/editar bosquejo: líder/pastor o autor), `POST /api/sermones/:id/notas` (capturar punto u escribir nota propia), `PATCH/DELETE /api/sermones/notas/:notaId`, y `GET /api/sermones/notas/mias` (todas mis notas para exportar).
- Frontend: vista "Notas del sermón" — ver bosquejo, botón **📌 Capturar** por cada punto, escribir nota/comentario propio, y **⬇️ Exportar mis notas** (descarga `.txt`).
- **PROBADO:** pastor crea bosquejo; feligrés no puede (403); maría captura un punto + escribe nota propia y ve SUS 2 notas; **abel NO ve las notas de maría** (aislamiento por persona ✅); export devuelve solo las del usuario.

### 4) ⏰ Recordatorios automáticos (`recordatorios.js`)
- Genera notificaciones de recordatorio para **asignaciones** ("tu servicio es mañana / en 3 días", ventanas = 1 y 3 días) y **eventos** de tus grupos ("mañana tienes X", 1 día antes).
- **Sin duplicar:** tabla de control `recordatorio_enviado (clave, persona_id UNIQUE)`; se inserta con `INSERT OR IGNORE` antes de crear la notificación.
- Se dispara automáticamente al cargar `GET /api/me`, y manualmente con `POST /api/recordatorios/generar`. Aparecen en la campana existente (tipo `recordatorio`).
- **PROBADO:** con un evento de prueba para mañana + asignación → generó 4 recordatorios; segunda corrida = 0 (dedupe ✅); maría recibió su recordatorio de servicio y el del evento. (Evento de prueba y rastros eliminados tras la prueba.)

**Archivos tocados (Fase 4):** `backend/src/db.js`, `server.js`, `notificaciones.js`, `anuncios.js`, `seed.js` (nuevos: `sermones.js`, `devocional.js`, `recordatorios.js`); `web/app.js`, `web/index.html` (nuevos: `web/manifest.json`, `web/sw.js`, `web/icon.svg`).

### Pendiente / stretch de Fase 4
- **Push real (Web Push/VAPID/service worker push):** NO implementado. Se priorizó la segmentación (como pedía la tarea). El `sw.js` cachea el shell pero no escucha eventos `push`. Para hacerlo: generar llaves VAPID (`npx web-push generate-vapid-keys`), guardar la suscripción del navegador en `dispositivo_push`, y enviar con la librería `web-push` desde `notificarSegmento`.
- Offline bíblico: por ahora se guarda **devocional/notas** en `localStorage`; no hay una fuente bíblica integrada (no existe en el proyecto). La estructura (`devocional` + descarga local) ya queda lista para llenar.
- Editar nota en la UI: el backend soporta `PATCH` de nota, pero la vista solo permite crear/borrar (no editar inline).
- Cron real para recordatorios: hoy se disparan al consultar (`/me`) o con el endpoint; no hay un scheduler en segundo plano.

---

## 🆕 FASE 4.5 (26 jun 2026): Equipo/ensayo de música + material compartido — PROBADO

### 🎸 Equipo y ensayo por evento (`musica.js`, tablas `equipo_musica` y `ensayo`)
- El **líder de música** arma el equipo por evento (persona + instrumento), agenda el **ensayo** (fecha/hora/lugar) y puede **avisar al equipo**. El pastor/otros **solo observan** (`puedeEditar:false`).
- Endpoints: `GET /api/musica/plan/:eventoId` (equipo + ensayo + instrumentos sugeridos), `POST /api/musica/plan/:eventoId/equipo` (agrega + notifica a la persona), `DELETE /api/musica/plan/equipo/:id`, `POST /api/musica/plan/:eventoId/ensayo` (upsert), `POST /api/musica/plan/:eventoId/avisar` (notifica a todo el equipo con datos del ensayo).
- Al asignar a alguien se le crea una notificación "🎵 Te toca tocar"; "Avisar" manda un recordatorio con el ensayo.
- `eventos.js`: el borrado de evento ahora limpia `equipo_musica` y `ensayo` (FK ON).
- Frontend: en **Música**, bajo el Orden del servicio, tarjeta "🎸 Equipo y ensayo" ligada al evento seleccionado.
- **PROBADO:** Joaquín asigna Abel(Guitarra)+María(Voz), agenda ensayo, avisa (2 notificados con info del ensayo); pastor → 403 al editar, ve en solo lectura.

### 📎 Material / partituras compartidas (`musica.js`, tabla `material_musica`)
- **Cualquier integrante del ministerio de música (rol `musico` o `lider_musica`)** sube archivos (PDF, Word, foto…) reusando `/api/upload`; **todo el ministerio los ve/descarga**. Helper `esDelMinisterioMusica()` en `auth.js`.
- Endpoints: `GET /api/musica/material` (ver, toda la iglesia; devuelve `creado_por`), `POST /api/musica/material` (cualquier músico), `DELETE /api/musica/material/:id` (**su autor o el líder**).
- Frontend: tarjeta "📎 Material / Partituras" en Música, con botón "+ Material" (cualquier músico) y borrar visible para el autor o el líder.
- **Himnario siempre disponible:** `web/assets/himnario-nuevo.pdf` (empaquetado, servido estático) + registro en `material_musica` (también en `seed.js`, `creado_por=null`). El material en `/assets/` es **permanente: no se puede borrar** (DELETE → 403; en la UI sale con chip "📌 Fijo" y sin botón de borrar).
- **PROBADO:** músico (Lucas) sube OK, feligresa → 403, himnario servido (HTTP 200, application/pdf) y visible para todos.

### 📅 Estado de aprobación visible en el calendario (26 jun)
- El backend ya creaba los eventos de líder como `pendiente` (solo pastor → `aprobado`). Ahora el **calendario muestra el estado**: ⏳ *Pendiente de aprobación* / 🔴 *Rechazada* / ✅ *Aprobado*.
- Al crear, el aviso aclara: *"📨 Enviado · pendiente de aprobación del pastor"* (líder) o *"✅ Evento creado y aprobado"* (pastor).
- **PROBADO:** Joaquín (líder) → evento `pendiente`; pastor → `aprobado`.

---

## 🆕 FASE 4.6 (26 jun 2026): Calendario funcional + Himnario con transpositor

### 📅 Calendario en vista de mes (`web/app.js`, CSS en `styles.css`)
- Cuadrícula mensual (LUN→DOM) con eventos en su día (hora + título), **color por grupo** (`eventos.js` ahora envía `grupo_color`), leyenda de grupos, hoy resaltado.
- Navegación **‹ ›** entre meses + botón **Hoy**.
- **Toda la congregación ve el calendario**: el feligrés ahora ve TODOS los eventos aprobados de su iglesia (antes solo los de sus grupos).
- **Tocar un día** lo selecciona y muestra su detalle abajo. **Solo líderes/pastor** ven el botón **"📩 Pedir esta fecha"** (o "Crear evento" el pastor).
- **Pedir fecha**: abre el formulario (nombre, grupo, fecha como listas **día/mes/año**, hora inicio/fin, lugar) prellenado con el día tocado; al enviar, va al pastor como **pendiente** (nota "se enviará al pastor"). 

### 🎵 Himnario con buscador + transpositor (estilo cifraclub)
- Los 450 himnos del PDF se extrajeron a `web/assets/himnario.json` (bundled; precacheado por el SW → **online y offline**).
- En **Música → Material**, tocar **"Himnario Nuevo (respaldo)"** abre un **modal**: buscador de alabanzas + lista + visor con acordes resaltados y botones **− / + tono** (transposición en notación DO–SI e inglés) y "Original". El PDF sigue descargable.
- Transpositor client-side en `app.js` (detecta líneas de acordes; no toca la letra). El himnario es **material permanente** (no se puede borrar) y el servidor lo **auto-repara** en cada arranque (`db.js`).

### ✍️ Cancionero
- Buscador funcional + caché offline. `POST/PATCH /api/musica/canciones` aceptan `letra` (acordes) para futuras canciones propias.

---

## 🆕 FASE 4.7 (26 jun 2026): Módulo "Mi Grupo" (centro del líder de cuerpo)

Genérico para cualquier líder de cuerpo (rol `admin`); para **Abel** muestra **Jóvenes**. Backend `grupo.js` (`/api/grupo`), tablas `recurso_grupo` y `aviso_grupo`. Menú: **🧑‍🤝‍🧑 Mi Grupo** (visible para cualquiera que pertenezca a un grupo).
- **Recursos**: el líder sube **links** (YouTube, Drive…) y **archivos** (reusa `/api/upload`); todo el grupo los ve.
- **Avisos y recordatorios**: el líder publica en el board (tipo aviso/recordatorio, con fecha opcional) → **notifica a todos los miembros**.
- **Avisar directo**: a **un miembro** o **a todos** (mensaje rápido → notificación).
- **Miembros**: el líder **agrega** (de los que aún no están) y **quita** (solo quita el rol `miembro`, nunca a un líder); al agregar, avisa a la persona.
- **Permisos**: ver = miembros del grupo (y el pastor observa); editar/gestionar = **solo el líder** del grupo. Verificado: Abel gestiona; María (miembro) → 403; los 3 miembros reciben los avisos.

---

## 🆕 FASE 4.8 (26 jun 2026): Predica, calendario, Grupo de Alabanza, Mi Servicio

- **Calendario**: un evento **aprobado solo lo edita/elimina el pastor** (`eventos.js puedeGestionar`); pendiente/rechazado lo gestiona el encargado o el creador. Reflejado en la UI.
- **Música → "Grupo de Alabanza"**: renombrado el módulo en el menú.
- **Predica** (`predica.js`, tablas `predica`, `predica_recurso`, `rol_temporal`): fusión de Biblia/Devocional + Notas del sermón. **Todos ven** el historial de prédicas; **pastor y predicador editan**. Cada prédica tiene nombre, fecha, predicador, notas y **recursos (links, archivos, libros)**. Nuevo rol **Predicador** con **vigencia (desde–hasta)** que el **pastor asigna** a un feligrés (helper `esPredicador` = pastor o rol vigente hoy). Se quitaron Biblia/Devocional y Notas del sermón del menú.
- **Mi Servicio = bandeja unificada**: muestra **Servicios** (aceptar/no puedo), **Me toca tocar** (equipo de alabanza, `GET /api/musica/mis-asignaciones`, "Ver detalles" → Grupo de Alabanza) y **Tareas de grupo** (`tarea_grupo`; el líder asigna tareas a un miembro en "Mi Grupo", "Ver detalles" → Mi Grupo, botón "Hecho").
- **Probado**: pastor asigna predicador→ maria edita; feligrés→403; líder no edita evento aprobado (403) y el pastor sí; Mi Servicio de María agrega servicio + música + tarea. ✅

---

## 🆕 FASE 4.9 (26 jun 2026): Panel del Obispo (multi-iglesia)

- El **obispo / super-admin** ve **TODAS las iglesias** (excepción al aislamiento por iglesia). Backend `obispo.js` (`/api/obispo`), helper `esObispo` (rol_global obispo/super-admin).
- `GET /api/obispo/resumen`: tarjetas de cada iglesia (pastor, miembros, grupos, eventos, asistencia promedio, saldo). `GET /api/obispo/iglesia/:id`: detalle **solo lectura** (stats, grupos, líderes, eventos, tesorería).
- Frontend: menú **👑 Panel del Obispo** (visible solo para obispo/super-admin) → lista de iglesias → detalle.
- **Seed**: usuario **`obispo`** (en MONTESION, contraseña 1234) + 2ª iglesia **Getsemaní** (`GETSEMANI`) con pastor, líderes, evento, asistencia y tesorería de demo.
- **Probado**: el obispo ve las 2 iglesias y el detalle de cada una; un feligrés → 403.

---

## 🆕 FASE 5 (27 jun 2026): Transpositor en cancionero · Fechas día-mes-año · Comprobante · Push real

### 🎸 Transpositor de tono dentro del cancionero (Grupo de Alabanza)
- La columna `cancion.letra` y el backend (`POST/PATCH /api/musica/canciones` con `letra`) ya existían; se **cableó el frontend**.
- En **Grupo de Alabanza → Cancionero**: el form "+ Canción" ahora tiene un campo **Acordes/letra**; las canciones con acordes muestran chip **🎸 acordes** y al tocarlas abren un **visor con − / + tono y "Original"** (reusa `_renderAcordes`/`_transAcorde` del Himnario). El líder de música edita los acordes **inline** (✏️).
- En el **Orden del servicio**, tocar una canción abre el visor **ya transpuesto al "tono del día"** (`setlist_item.tono_dia`); el endpoint `GET /api/musica/setlist/:ev` ahora devuelve `cancion_id` y `letra`. Helper `_semitonosEntre(base,destino)`.
- Seed: "Sublime Gracia" trae acordes de ejemplo (tono RE). **PROBADO** (API + lógica de transposición: RE+2→MI, G+2→A, base RE→día MI = +2).

### 📅 Fechas en orden día-mes-año en TODOS los módulos
- Se reemplazaron todos los `<input type="date">` nativos (cuyo orden depende del idioma del navegador) por un **selector reutilizable día / mes / año**: helper `fechaSelectHTML(prefijo, valor, opts)` + `fechaSelectValor(prefijo)` en `web/app.js`.
- Aplicado en: eventos/pedir fecha, ensayo de música, tesorería, material de Escuela Dominical, asistencia, avisos de grupo, prédica y vigencia de predicador (desde/hasta). `opts.opcional` permite "en blanco"; si no, por defecto **hoy**.

### 📎 Comprobante en Tesorería — (ya estaba implementado)
- `formMov`/`guardarMov` suben el archivo con `/api/upload` y mandan `comprobante_url`; el backend lo guarda (`movimiento.comprobante_url`, columna por `ALTER TABLE` en `db.js`) y la lista muestra **📎 comprobante**.

### 🔔 Push real (Web Push / VAPID)  — `push.js`, tabla `push_sub`, `sw.js`
- Nuevo módulo `backend/src/push.js` con `enviarPush(personaIds,{titulo,texto,url})` (usa la librería **`web-push`**). Tabla `push_sub (persona_id, endpoint UNIQUE, p256dh, auth)`. Las suscripciones caducadas (404/410) se borran solas; **nunca rompe** el flujo de notificaciones.
- Rutas (`/api/push`): `GET /clave-publica`, `POST /suscribir`, `POST /baja`, `POST /probar`.
- **Conectado en TODOS los puntos** que generan notificación: `notificarSegmento` (anuncios/avisos), asignaciones, música (te toca tocar + recordatorio), recordatorios automáticos, "Mi Grupo", prédica (eres predicador), eventos (solicitud/aprobada/rechazada).
- `web/sw.js`: escucha el evento **`push`** y muestra la notificación (con la app cerrada) + **`notificationclick`** enfoca/abre la app.
- Frontend: en **Ajustes → 🔔 Notificaciones**, botón **Activar** (pide permiso, suscribe vía `pushManager`, guarda la sub), **Probar** y **Desactivar**.
- **Degrada con elegancia:** si NO hay claves VAPID, el push queda **desactivado** y las notificaciones siguen en la campana. **PROBADO** vía API: clave-publica/suscribir/probar OK; un envío con suscripción inválida falla en el log **sin tumbar el servidor** y la notificación in-app igual se crea.
- **Config de claves:** se cargan de variables de entorno (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`). Hay un **cargador `.env` mínimo** (`backend/src/env.js`, sin dependencias) que lee `backend/.env` en local (gitignored; hay `.env.example`). **En Railway hay que añadir esas 3 variables en el panel.** Generar par: `node -e "console.log(require('web-push').generateVAPIDKeys())"`. ⚠️ El push real necesita **HTTPS** (Railway lo tiene; en local funciona en `localhost`).

---

## ▶️ Cómo arrancar todo (2 servicios)

**1. Backend Node (web + API):**
```
cd C:\Users\pdani\Documents\App-Iglesia\app\backend
node src/server.js
```
→ Abre la app en **http://localhost:3000**

**2. Servicio facial Python (solo para reconocimiento facial):**
```
& "C:\Users\pdani\AppData\Local\Programs\Python\Python312\python.exe" "C:\Users\pdani\Documents\App-Iglesia\app\facial\service.py"
```
→ Corre en el puerto 5001.

**Recargar datos de prueba** (si hace falta resetear): `node src/seed.js` (en la carpeta backend).

---

## 👤 Usuarios de prueba (iglesia: `MONTESION`, contraseña: `1234`)
- `pastor` — Pastor (ve TODO, pero solo observa lo de cada grupo)
- `abel` — Líder de Jóvenes
- `joaquin` — Líder de Música + miembro de Jóvenes
- `lucas` — Músico del ministerio de Música (puede compartir material/notas)
- `maria` — Feligresa
- `raquel` — Tesorera
- `marta` — Maestra de Escuela Dominical

---

## ✅ Lo que está CONSTRUIDO y funcionando

### Núcleo + módulos (todos con su backend + web)
- 🔐 Login en 3 pasos + multi-iglesia + roles/jerarquía
- 📅 Calendario + eventos (crear, **editar, eliminar**) + aprobación del pastor
- 📢 Anuncios (crear, **editar, eliminar**) + 🔔 notificaciones (con paginación)
- 🤝 Servicio / Mi Servicio (asignar, aceptar/no puedo con motivo)
- ✅ Asistencia: **dos listas (Asistieron / No asistieron)** + conteo + grupo de cada persona
- 📊 Panel del pastor (estadísticas, tendencia, ausentes)
- 🎵 Música (cancionero con **eliminar** + orden del servicio)
- ❤️ Cuidado pastoral (casos, historial)
- 💰 Tesorería (ingresos/gastos, campañas, transparencia)
- 👶 Niños / Escuela Dominical (clases, material con **subida de archivos**, niños, asistencia)
- 🗒️ Organización de eventos (cosas a llevar + gastos con total) — Fase 8
- 💬 Mensajería interna con SSE — Fase 6 · 👤 Directorio + cumpleaños — Fase 7
- 📷 **Reconocimiento facial** (Python InsightFace + Node + páginas `/inscribir.html` y `/kiosko.html`) — PROBADO: inscribir + reconocer con confianza 1.0

### Calidad
- Diseño profesional (sidebar, dashboard, toasts, modales, iconos SVG)
- **307 tests** en verde (`cd backend && node --test`), incluidos los de aislamiento multi-iglesia, permisos por rol, límite de peticiones, validación de subidas y estado del respaldo.
- Accesibilidad medida, no supuesta: contraste AA y área táctil verificados con `scripts/auditoria-ux.py` (ver Fase 9).
- 8 bugs del QA corregidos (validaciones, aislamiento entre iglesias, JWT, multer, rate-limit, CORS, manejo de errores global)

---

## ✅ VERIFICADO (26 jun 2026)

**Regla de permisos: "el pastor ve todo pero NO edita lo de cada grupo; solo el encargado (líder) edita".** — **PROBADO Y FUNCIONANDO.**

Cambios aplicados y verificados vía API:
- `auth.js`: helper `esEncargadoGrupo()` (líder del grupo, sin atajo de pastor).
- `asistencia.js`: la hoja devuelve `puedeEditar`; guardar asistencia solo lo permite el **encargado** del grupo.
- `eventos.js`: editar/eliminar evento solo por el **encargado** del grupo o quien lo creó (no el pastor).
- `web/app.js`: hoja de asistencia en **solo lectura** si no eres el encargado; botones editar/borrar de eventos solo para encargado/creador.

Resultado de la prueba (evento de Jóvenes):
1. Abel (líder Jóvenes): `puedeEditar:true`, guarda OK, edita evento OK. ✅
2. Pastor: `puedeEditar:false` (solo ve), guardar → 403, editar → 403. ✅
3. María (feligresa): `puedeEditar:false`, guardar → 403. ✅

### Coherencia total: "pastor solo observa" extendido a más módulos — **PROBADO (26 jun)**
- `auth.js`: helpers estrictos `esLiderMusicaEstricto`, `esLiderEdEstricto`, `esTesoreroEstricto` (sin atajo de pastor).
- `musica.js`: agregar/borrar canción y editar setlist → solo el **líder de música** (pastor 403).
- `ninos.js`: crear clases/niños/material y tomar asistencia → solo el **encargado de Escuela Dominical** (pastor ve, no edita).
- `tesoreria.js`: registrar movimientos/campañas → solo el **tesorero**; el pastor LEE resumen/transparencia.
- `cuidado.js`: se mantiene **solo-pastor** a propósito (es su dominio, no un grupo).
- `web/app.js`: botones de edición ocultos para el pastor en esos módulos + avisos "👁️ Solo lectura".
- Prueba: pastor → 403 en música/niños/tesorería; encargados → OK; pastor LEE resumen → OK. ✅

### Exportar asistencia (CSV) + filtrar por grupo — **PROBADO (26 jun)**
- `panel.js`: `GET /api/panel?grupo_id=` filtra miembros/reuniones/ausentes por grupo; `GET /api/panel/export.csv?grupo_id=` descarga CSV (con BOM para Excel: Fecha, Evento, Grupo, Persona, Asistió).
- `web/app.js` (panel): selector de grupo + botón "📥 Exportar CSV".
- Prueba: panel filtrado por Jóvenes (6→3 miembros, ausentes calculados); CSV con cabeceras y filas Sí/No correctas. ✅

---

## 🗂️ Estructura del código
```
app/
├── backend/        Node.js + Express + SQLite (API + sirve la web)
│   ├── src/        server.js, auth.js, db.js, seed.js, y un archivo por módulo
│   ├── uploads/    archivos subidos (material, etc.)
│   └── iglesia.db  base de datos SQLite
├── web/            frontend (index.html, app.js, styles.css) + inscribir/kiosko (facial)
└── facial/         service.py (servicio Python de reconocimiento facial)
```

## 📄 Documentos de diseño (en la carpeta padre `App-Iglesia/`)
- `Concepto-App-Iglesia.md` — especificación completa
- `Informe-Completo.md`, `Mapa-Construccion.md`, `Plan-Detallado-Fases.md`, `Guia-Construccion-Detallada.md`

---

## 💡 Ideas / mejoras pendientes (del backlog)
- ✅ ~~Extender "pastor solo observa" a más módulos (coherencia total)~~ — hecho (26 jun)
- ✅ ~~Exportar asistencia / reportes~~ — hecho como CSV (26 jun)
- ✅ ~~Filtrar asistencia por grupo~~ — hecho (26 jun)
- ✅ ~~Subir comprobante en Tesorería~~ — ya estaba hecho (Fase 5)
- ✅ ~~Notificaciones push segmentadas · Modo offline Biblia/Notas · Notas del sermón · Recordatorios automáticos~~ — hechos (Fase 4)

### 👉 POR DÓNDE RETOMAR (estado de `main` al 31 jul 2026 — compruébalo con los comandos de abajo antes de creerlo, incluida esta cabecera)

> ⬆️ **Queda trabajo sin subir, y es tarea de Pablo.** `feat/menu-agrupado` ya está **fusionada a `main` y la rama borrada**, así que hoy no queda nada sin fusionar; lo que queda es **empujar `main` a GitHub**. Cuántos commits son, míralo tú — no te fíes de ningún número escrito aquí:
> ```
> git log origin/main..main --oneline
> ```
> Antes de esta fusión sí estaba todo subido (`main` y `origin/main` en `e586926`); el push que falta es el de la fusión del menú y su arreglo posterior.
> **Y falta comprobar el despliegue**, que es otra cosa: `curl` al `/app.js` de producción buscando `filaMensajePortal` dice si el redespliegue de Render llegó de verdad. Fusionado y subido **no** es lo mismo que desplegado.
>
> Y la lección de fondo, que es la razón de conservar lo de abajo: esta frase ha estado equivocada **en los dos sentidos** más de una vez — llegó a decir "14 commits SIN SUBIR" cuando no quedaba ninguno, y también lo contrario. **No te creas ninguna versión de ella, tampoco esta, sin comprobarlo** con `git log origin/main..main --oneline`.

> ⛔ **DESFASADO (todo el bloque siguiente) — se conserva como registro de lo que pasó el 31 jul por la tarde, no como estado actual. El estado real está justo arriba.**
>
> ~~**⚠️ Hay trabajo sin subir: DOS cosas.** Las dos quedaron **fusionadas a `main` el 31 jul** y **ninguna empujada a GitHub**:~~
>
> 1. ~~**La bandeja del portal público** (merge `fef2742`). Mientras no se suba, **el pastor sigue sin poder leer los mensajes de las visitas**.~~
> 2. ~~**La fuente del gasto y el historial de correcciones** (merge `b0ff2da`). Suite **509**.~~
>
> ~~El push lo hace Pablo con GitHub Desktop, y es lo que dispara el redespliegue en Render. **Un solo push las sube las dos**, que además es lo correcto: la fuente del gasto **exige** que backend y frontend viajen juntos (ver el punto 8 de sus pendientes).~~ *(Lo del punto 8 sigue siendo verdad para cualquier despliegue futuro; lo que caducó es el "sin subir".)*

**Lo hecho el 31 jul:** la Fase 13 (quién puede retirar a cada niño) fusionada y verificada, la corrección del texto legal, y **cuatro documentos de diseño nuevos**.

#### Listo para ejecutar, sin nada que decidir
Dos planes escritos, autorrevisados y con las decisiones del dueño ya incorporadas. Se ejecutan con `superpowers:subagent-driven-development`.

1. ✅ ~~**Corregir el nombre de una persona**~~ — **HECHO, fusionado a `main` (merge `e586926`) y subido a GitHub.** Comprobado el 31 jul: `origin/main` apunta a ese mismo commit. ~~HECHO, pero SOLO en la rama local `feat/corregir-nombre`: sin fusionar a `main` y sin subir.~~ *(desfasado, ver la frase anterior; la rama `feat/corregir-nombre` ya no existe.)* Spec `docs/superpowers/specs/2026-07-31-corregir-nombre-design.md`, plan `docs/superpowers/plans/2026-07-31-corregir-nombre.md`. Suite en **526 tests** (partió en 509; medido con `cd backend && npm test`).
   Se construyó por **dos caminos**: `PATCH /api/directorio/perfil` acepta `nombre` (autoservicio, la propia persona desde "Mi perfil") y `PATCH /api/admin/usuarios/:id` acepta `nombre` (asistido, el pastor desde Administración → Usuarios, para quien no puede corregirlo solo). Los dos sincronizan `aprobacion_log.actor_nombre` y lo auditan; un `PATCH` de admin que solo trae `nombre` deja **su propio** apunte de auditoría, no el genérico.
   > 📜 **Cierra la promesa legal falsa que este mismo punto señalaba:** el documento ARCO afirmaba que la rectificación "ya existe" por la pantalla de perfil, y para el nombre era mentira — ese formulario nunca aceptó ese campo. Cerrado con nota al pie en `docs/superpowers/specs/2026-07-23-consentimiento-legal-arco-design.md` (línea "Rectificación").
   > 🔴 **Lo que cerró la revisión final de la rama (antes de fusionar), y es la misma lección de siempre:** "Mi perfil" prellenaba el nombre con `ME.persona.nombre` —una **caché del arranque de la app que no se refresca nunca**— y mandaba el campo en cada guardado. Con eso, el pastor corregía "juan perez" → "Juan Pérez" desde Administración y la persona, con la app abierta desde antes, **revertía la corrección al cambiar su teléfono**: sin error, sin aviso, y con un apunte de auditoría diciendo que lo había cambiado ella. Además se auditaba **cuando el campo venía, no cuando cambiaba**, así que cada guardado de perfil (una foto, una casilla de privacidad) escribía un `Juan Pérez → Juan Pérez`. Arreglado por los dos lados: el formulario se prellena con lo que **acaba de responder** `GET /directorio/perfil`, y los dos endpoints comparan contra el nombre viejo antes de auditar y sincronizar. **Es el quinto sitio de este proyecto donde una pantalla reenvía un campo que nadie tocó** (los otros cuatro, en la fuente del gasto — ver el punto 2): la regla vale para toda pantalla que mande un formulario entero.
   > ⚠️ **Queda una sexta puerta, pequeña y aceptada a propósito:** el cuadro del pastor en Administración se prellena desde `window._admin`, otra caché de cliente. Si alguien se corrige el nombre desde su teléfono mientras el pastor tiene esa pantalla abierta, el cuadro enseña el viejo y "Guardar" sin tocar nada revierte la corrección, anotándola como del pastor. Se deja así: esa lista se recarga al entrar a Administración y tras cada corrección, así que la ventana es corta; y ahí el nombre es **el asunto** del cuadro, en negrita delante del pastor, no un daño colateral de guardar otra cosa.
   > ⚠️ **Y ojo con leer "tres pruebas nuevas" como "los dos arreglos quedaron cubiertos":** la mitad de frontend **no tiene candado automático**. Este proyecto no tiene banco de pruebas de navegador; se comprobó a mano con dos sesiones reales.
   > ✅ **El nombre del pie de la barra lateral ya se repinta** (`pintarUsuarioLateral()`, `web/app.js`), tanto al corregirse uno mismo desde "Mi perfil" como cuando el pastor se corrige a sí mismo desde Administración. Antes solo se pintaba al iniciar sesión, así que se veía el toast verde y abajo a la izquierda seguía el nombre viejo — parecía que no se había guardado.
   > ⚠️ **Lo que sigue pendiente:**
   > 1. **(atendido el 7-ago, cabo 2 — ver la sección "7 de agosto · noche":** la app **sigue sin reescribir** esos textos, y eso ya no es un pendiente sino una **decisión de producto escrita** ("avisar, nunca reescribir": son textos libres y un reemplazo de subcadenas haría estropicios). Lo que sí cambió: al corregir el nombre, la app **busca el nombre viejo y avisa dónde sigue escrito** — conteos a quien se corrige a sí mismo, detalle al pastor. Sigue habiendo que corregirlo a mano.**)** ~~Corregir un nombre **no actualiza una prédica ya guardada.** `predica.predicador` y `sermon.predicador` son texto libre (pueden nombrar a un invitado sin cuenta), así que no son copias que sincronizar — pero eso se ve en el **portal público** y va a parecer un fallo.~~
   > 2. **(atendido el 7-ago, cabo 2, igual que el punto 1:** la ficha sigue diciendo "juan perez" hasta que alguien la edite, pero ahora **la app lo dice** en cuanto se corrige el nombre.**)** ~~Y lo mismo, **peor**, con `nino.autorizados` (`db.js:297`): la lista de quién puede retirar a un niño también es texto libre (300 caracteres, y **tiene** que serlo, porque la abuela que va a buscarlo no tiene cuenta). Corriges tu nombre y **la ficha del niño sigue autorizando a "juan perez"** — y esa lista es la que se mira **en la puerta de la sala**. Se arregla editando la ficha.~~
   > 3. **El pastor puede ponerle nombre a una cuenta ya anonimizada.** `GET /admin/datos` lista también a las personas que `cuenta.js` dejó como `'Usuario eliminado'`, y el botón "✏️ Corregir nombre" sale en esas filas: guardar reescribiría `persona.nombre` **y** `aprobacion_log.actor_nombre`, deshaciendo parte del borrado ARCO. Hay que teclear el nombre a mano, así que no es una fuga automática, pero **es la única ruta de la app que puede des-anonimizar**.
   > 4. `directorio.js:117` hace `.get(...).nombre` sin comprobar que la fila exista; su gemelo `GET /perfil` sí devuelve 404. Con el token de una persona borrada de verdad daría un **500 en vez de un 404**.

2. ✅ ~~**Fuente del gasto (Organización).**~~ — **HECHO, fusionado a `main` (merge `b0ff2da`) y subido a GitHub.** Comprobado el 31 jul. ~~HECHO, pero SOLO en la rama local `feat/fuente-del-gasto`: sin fusionar a `main` y sin subir.~~ *(desfasado, ver la frase anterior.)* No repitas de memoria si ya se fusionó, pero **el comando que había aquí ya no sirve**: mandaba `git log main..feat/fuente-del-gasto --oneline`, y esa rama **ya no existe**, así que el comando falla y quien lo lea no sabe si eso significa "fusionada" o "me equivoqué al escribirlo". Se comprueba por el commit de merge, que sí existe siempre: `git merge-base --is-ancestor b0ff2da main && echo FUSIONADA || echo "SIN FUSIONAR"`, y `git log origin/main..main --oneline` (vacío = nada por subir) para lo ya sabido de `main`. Spec `docs/superpowers/specs/2026-07-31-fuente-del-gasto-design.md`, plan `docs/superpowers/plans/2026-07-31-fuente-del-gasto.md`. Suite en **503 tests** (partió en 471; medido con `cd backend && npm test`, el número del plan y el de esta misma sección habían quedado atrás más de una vez — no te fíes de ningún 495 que veas por ahí).
   Se construyó: la columna `evento_org_gasto.fuente` (`NULL` para todo lo histórico); el `POST` acepta `fuente`: `'caja'` · `'devuelve'` · `'aporte'`; el resumen de la hoja partido en tres bloques (lo que pagó la caja, lo por devolver, los aportes donados); `PATCH` para corregir un gasto, auditado, y el rastro dice también **si cambió quién puso el dinero**; `auditoria` gana `ref_tabla`/`ref_id` y la referencia apunta **a la hoja, no al gasto** (para que borrar un gasto no deje su corrección huérfana); en pantalla, casilla de origen, fuente por línea y ✏️ para corregir; y el historial de correcciones, visible **en la hoja y en la rendición impresa**.
   **Cuatro veces** se cerró el mismo fallo de fondo —corregir un gasto movía a quién se le debe dinero— y las cuatro por una puerta distinta: el backend que reasignaba, el selector que no ofrecía "sin registrar", el `.value` releído del DOM, y por último **el formulario que reenviaba el origen aunque nadie lo hubiera tocado**. Esa cuarta, la de la revisión final, era la que más iba a doler: en producción **todos** los gastos guardados tienen `fuente = NULL`, así que el primer ✏️ sobre cualquiera de ellos les inventaba un `'devuelve'` y estampaba en el historial un `se devuelve a María -> se devuelve a María`, o sea, la línea que existe para avisar de que cambió quién puso el dinero afirmando un cambio que nadie hizo. Regla que queda: **el `PATCH` es parcial por diseño y la pantalla tiene que respetarlo** — una corrección manda `fuente`/`pagado_por` **solo** si la persona tocó alguno de los dos selectores (`Org._origenTocado`); un alta los manda siempre.
   > **Sigue sin resolver**, a propósito o por quedar fuera de alcance:
   > 1. ~~**Los gastos de la hoja de Organización siguen sin aparecer en Tesorería**: sigue siendo el Camino C, no decidido.~~ **(Cerrado el 7-ago: calculados desde las hojas, sin copias — ver la sección del 7 de agosto. Y el Camino B murió antes de nacer: "la iglesia no devuelve dinero, dar es voluntario" — decisión del dueño.)**
   > 2. **No se registra si ya se devolvió el dinero** (Camino B). El bloque "Por devolver" dice cuánto se debe hoy, para siempre.
   > 3. **Borrar un gasto sigue sin dejar rastro**, a propósito: en este módulo ningún ítem lo deja al crearse o borrarse, y auditar solo el borrado del gasto sería un parche asimétrico. Consecuencia asumida: quien quiera esquivar el historial puede borrar y volver a crear.
   > 4. **(cerrado el 6-ago por la TANDA F, NO por los cabos de agosto** — ver la sección "6 de agosto (4)". Comprobado contra el repo al cerrar los cabos, no heredado de ninguna lista: el endpoint es `GET /api/admin/auditoria` (`backend/src/admin.js:121`) y la pantalla es la sección plegable "📜 Registro de actividad" al final de Administración (`web/app.js:4026`). Las cuatro acciones que este punto echaba de menos **no** están en la lista `RUTINARIAS` (`admin.js:118`), así que salen por defecto, sin marcar ninguna casilla. El pendiente llevaba **un día entero** en pie estando hecho.**)** ~~**No hay pantalla de auditoría general.** Lo que se ve es el historial de correcciones **de una hoja**; `crear_org`, `editar_org`, `borrar_org` y `duplicar_org` siguen sin mostrarse en ningún sitio.~~
   > 5. **(cerrado el 7-ago, cabo 1** — ver la sección "7 de agosto · noche". El alta exige persona **activa**; la corrección solo si la atribución **cambia**, para que un gasto histórico de alguien dado de baja se pueda seguir corrigiendo.**)** ~~**No se comprueba que la persona esté activa** al anotar o corregir un gasto (sí se comprueba en las cosas a llevar, `organizacion.js:282-284`). Bug preexistente, fuera de alcance.~~
   > 6. ✅ ~~Corregir un gasto y auditarlo no van en una transacción.~~ **Arreglado en la revisión final:** el `UPDATE` y el `auditar()` van ya en un `BEGIN`/`COMMIT`/`ROLLBACK`, así que una corrección de dinero no puede quedar aplicada sin rastro.
   >    ⚠️ **La razón por la que se había dejado así era falsa** y llegó a estar escrita aquí: *"es la convención del resto del repo, nada de este módulo usa transacciones"*. **La convención es la contraria** — este mismo archivo las usa dos veces (`organizacion.js`, al borrar la hoja y al duplicarla), y también `asistencia.js`, `cuenta.js`, `cuidado.js`, `eventos.js`, `musica.js`, `ninos.js` y `eliminarIglesia.js`. Si vuelves a leer "la convención es no usar transacciones" en algún sitio, es mentira: compruébalo con un `grep -rn "BEGIN" backend/src`.
   > 7. **(resuelto el 5-ago:** ver la sección de esa fecha — `quitarAusenteDuplicada()` quita la inyectada **siempre** que llegue su gemela real, esté seleccionada o no, conservando la elección**)** ~~**Rótulo falso mientras el directorio aún no cargó — arreglado a medias, a propósito.** Al llegar `/directorio`, si la opción inyectada es la **seleccionada**, se reconcilia: se quita el rótulo *"(cuenta inactiva)"* sobre alguien activo y el nombre deja de salir dos veces. Pero si mientras tanto la persona **cambió el selector a mano**, la inyectada sigue en la lista —sin seleccionar, con el rótulo falso y el nombre duplicado—, porque reconciliar ahí le borraría su elección. Elegirla daría el id correcto, así que **no mueve dinero**; es un rótulo mentiroso en una pantalla de plata. Se cierra quitando la inyectada cuando aparezca su gemela real, conservando `sel.value`.~~
   > 8. **Al desplegar, backend y frontend van JUNTOS.** `armarHoja` ya no devuelve `aportes` (ahora son `total_caja` / `por_devolver` / `aportes_donados`). Un `app.js` viejo contra el backend nuevo pinta **el resumen vacío, sin ningún error**: ni en pantalla ni en la consola. No sirve subir solo uno de los dos.
   > 9. **`NULL` y `'devuelve'` se leen igual en el rastro.** `descOrigenGasto(null, X)` y `descOrigenGasto('devuelve', X)` devuelven las dos *"se devuelve a X"* (y el resumen mete a las dos en "Por devolver"). Consecuencia: si alguien abre el ✏️ de un gasto histórico y **toca a propósito** el selector de origen dejándolo en "Se devuelve", el historial anota `se devuelve a X -> se devuelve a X`. Ahí el cambio **sí es real** (pasa de "no se sabe" a una afirmación), pero se ve idéntico. Ya no ocurre sin que nadie toque nada — eso era el fallo, y está cerrado.
   >    ⚠️ **Y ojo con la razón que se dio para aplazarlo, que también era falsa:** se escribió que arreglarlo "cambia cómo se lee el rastro de los gastos ya auditados". **No.** `descOrigenGasto` se llama **solo al escribir** (un único uso en todo el repo) y su salida queda congelada como texto dentro de `auditoria.detalle`; cambiar la función no toca ni una fila guardada, solo los apuntes futuros. Es mucho más barato de lo que decía esa nota. Es la **segunda** razón inventada de este mismo bloque (la otra, la de las transacciones): **compruébalas antes de creerlas**.
   > 10. **(cerrado el 7-ago, cabo 3** — ver la sección "7 de agosto · noche". Comparar-y-guardar: el ✏️ manda la instantánea `visto` de lo que estaba viendo, y si la fila ya cambió el servidor responde **409** sin aplicar nada. No es un `If-Match` generalizado: es solo esta pantalla, que es la que ya mordió. **`visto` es opcional**, así que un `app.js` viejo sigue funcionando.**)** ~~**No hay control de concurrencia en el `PATCH` del gasto**, y la pantalla de una hoja es de vida larga (se abre y se queda abierta durante todo el almuerzo). Dos personas editando la misma hoja pueden pisarse: no hay `If-Match`, ni versión, ni aviso de "esto cambió mientras mirabas". La revisión final quitó el caso peor —una corrección de ortografía ya no **resucita** una deuda que otro acababa de borrar, porque el origen solo viaja si alguien lo tocó—, pero el punto general sigue en pie: el último que guarda el concepto o el monto, gana.~~

#### Decidido, pero sin spec todavía
3. ✅ ~~**Mensajes del portal público.**~~ — **HECHO el 31 jul** en la rama `feat/bandeja-y-historial-correcciones`; si ya está fusionada a `main` y desplegada es dato de `main` y caduca con cada fusión — no lo repitas de memoria, compruébalo con `git log origin/main..main --oneline` y contra el `app.js` que sirve Render (busca `filaMensajePortal`). Spec `docs/superpowers/specs/2026-07-31-bandeja-portal-publico-design.md`, plan `docs/superpowers/plans/2026-07-31-bandeja-portal-publico.md`. Suite en **471 tests** (partió en 456).
   Se construyó: la columna `estado` en `contacto_publico` con el valor `previo` para lo que ya estaba guardado antes de que existiera la bandeja (migración de una sola vez, `migrarEstadoContactoPublico()`); la bandeja **solo para el pastor** (el obispo no la ve) con marcar-atendido; la notificación 📬 ahora se puede pulsar y lleva a la bandeja; Notificaciones gana **"Ver más"** (el backend ya paginaba, la pantalla no lo usaba); se quitaron las dos frases del portal que prometían "te contactaremos pronto" sin poder cumplirlo; y la sección **4.9** de la Política de Privacidad sobre datos de visitantes del portal, **en borrador para el abogado**.
   > **Sigue sin resolver**, a propósito o por quedar fuera de alcance:
   > 1. **No se puede responder desde la app**: el formulario sigue sin pedir correo ni teléfono (decisión del dueño). La única vía es que la persona lo escriba dentro del mensaje.
   > 2. **La sección de mensajes anteriores puede no abrirse nunca.** Están contados y accesibles, pero nada obliga a mirarlos y no generan aviso.
   > 3. ~~**No se puede borrar un mensaje** ni marcar atendido en bloque.~~ **(Cerrado el 6-ago, tanda E — ver la sección "6 de agosto (2)".)**
   > 4. **(cerrado en OTRA tanda, no en los cabos de agosto** — el plan de los cabos ya lo daba por hecho en su preámbulo, y se comprobó contra el repo al cerrarlos: `verCaso()` vive hoy en `web/app.js:2392` y su historial de contactos pinta la fecha con `escHtml(fechaDeUTC(x.fecha))` (`web/app.js:2403`). La línea `app.js:2102` que citaba este punto ya no existe: los números de línea de este documento envejecen, **busca por contenido**.**)** ~~**La fecha de Cuidado pastoral (`verCaso()` en `app.js:2102`) sigue con el fallo de UTC** — se ve el día siguiente para lo escrito después de las 20:00. El ayudante `fechaDeUTC` ya existe y lo arregla en una línea; se dejó fuera a propósito para no ensuciar este diff.~~
   > 5. **La Política de Privacidad 4.9 está en borrador** y necesita al abogado.

#### Acciones del dueño en Render (siguen abiertas, no son código)
`SMTP_USER`/`SMTP_PASS` — sin ellas **nadie puede recuperar su contraseña** · `SUPERADMIN_PASSWORD` · comprobar en los logs que la zona horaria dice `America/Santiago` y no `UTC` · `LEGAL_CONTACT_EMAIL` solo **después** de que el abogado limpie los placeholders `[…]`.

---

### 👉 POR DÓNDE RETOMAR (al 30 jul 2026 · tarde — 420 tests, superado por lo del 31 jul)

**Lo primero: subir.** Lo de esta tarde está en `main` local y **sin subir**. Comprueba de verdad con `git log origin/main..main --oneline` antes de creerte esta línea o la de abajo: **las dos secciones anteriores de este documento afirmaron cosas sobre el push que ya no eran ciertas al leerlas.**

**Decisiones que tomó el dueño esta tarde y que aún NO están en código:**
1. **Fuente del gasto → camino A.** Una casilla más en cada gasto con tres respuestas: *la pagó la caja de la iglesia · se le devuelve a quien la puso · es un aporte que no se devuelve*. Puramente aditivo, no toca Tesorería, no toca los gastos ya guardados. Descartados por ahora B/C/D (ver `docs` del análisis). **Condición que puso el dueño:** debe incluir **poder corregir un gasto**, porque hoy un gasto solo se puede crear y borrar.
2. **Las correcciones llevan rastro.** Vale tanto para los gastos como para Tesorería: se puede arreglar un monto mal tecleado, pero queda escrito quién lo cambió y cuándo. Esto **cierra** la pregunta de diseño que estaba abierta (`UPDATE` a secas queda descartado).
3. El dueño respondió que **la caja de la iglesia casi nunca adelanta** (0-2 de cada 10 eventos): por eso A y no D.

**Trabajo abierto, priorizado:**

1. **La casilla de la fuente del gasto + corregir un gasto con rastro** (decisiones 1 y 2 de arriba). Ya no necesita brainstorming: está decidido, necesita spec y plan.
2. **Dos funciones a medio construir que solo necesitan la pantalla** — son lo más barato del proyecto:
   - ✅ ~~**"No puedo servir ese día"** (`fecha_no_disp`)~~ — **HECHO** el 30 jul (rama `feat/no-puedo-servir`). Ver la sección propia más abajo.
   - ✅ ~~**Retiro seguro de niños**~~ — **HECHO** el 30-31 jul (rama `feat/retiro-seguro-ninos`). Ver la sección propia más abajo.
3. **Corregir el nombre de una persona** — el documento viejo lo pintaba caro ("queda así para siempre en el directorio, las asistencias y los impresos", que suena a datos duplicados). **Es falso:** el nombre vive solo en `persona.nombre` y todo lo demás llega por `JOIN`. Es añadir una columna a un esquema zod que ya existe.
4. **Escuela Dominical: ya se pueden editar y borrar NIÑOS** (hecho el 31 jul, ver la fase de abajo). ~~**Siguen sin poder editarse ni borrarse las CLASES ni las LECCIONES**: una clase mal escrita o una lección subida por error se quedan para siempre.~~ **(Resuelto el 5-ago:** clase mal escrita se corrige, lección subida por error se borra. Una clase **solo se borra vacía**; y el documento de una lección no se cambia por PATCH —se borra la lección y se sube de nuevo—, a propósito. Ver "5 de agosto · noche (2)"**)**
5. **El formulario público de visitas no pide ningún dato de contacto** mientras la página promete "te contactaremos pronto", y **no hay ninguna pantalla que liste `contacto_publico`**. Hay mensajes de visitas guardados que nadie ha mirado nunca. *(Matiz: la notificación sí lleva el texto completo, así que no se pierden del todo.)*
6. **Peticiones de oración** — matiz importante frente a la nota vieja: *sí* se puede pedir oración hoy, por chat directo con el pastor. Lo que no existe es la petición como objeto (estado, lista, anonimato). Es la única propuesta que sirve a **toda** la congregación. Dato sensible: hay que pasar por el consentimiento versionado que ya existe.
7. **Editar el himnario desde la app** · **eventos que se repiten** · **ficha de membresía** (fecha de bautismo = dato sensible).

**Huecos verificados que nadie había anotado:**
- **(resuelto el 5-ago:** el hueco se cerró en dos tiempos — el 31 jul empezaron a auditarse **editar y borrar** un niño, y el 5-ago los tres huecos que quedaban, todos de **creación**: `crear_clase`, `inscribir_nino` y `crear_leccion`. Escribir sin dejar rastro era justo la mitad que faltaba**)** ~~**Nada del módulo de niños se audita** salvo lo que ya se quitó (ver arriba).~~
- **Borrar un gasto de Organización no deja auditoría**, a diferencia del resto del módulo.
- **(resuelto el 5-ago:** los dos piden ahora un puerto libre al SO, `backend/test/puerto-libre.js`; ver la sección de esa fecha — el hueco tardó seis días en morder y cuando lo hizo pareció un fallo del código, no del arnés**)** ~~**`upload-validacion.test.js` fija el puerto 3941 a mano** → dos suites a la vez se pisan, y el síntoma ("el servidor de pruebas no respondió a tiempo") no dice nada de la causa.~~
- **(resuelto el 5-ago, con un matiz que importa:** se fue la tabla `recurso` (vacía por construcción) y se fue `POST /api/dispositivo`, el endpoint de escritura del push viejo — pero **`dispositivo_push` la tabla SIGUE**, a propósito: pudo recibir filas reales y el borrado ARCO la limpia. "Tabla sin usar" era verdad solo para una de las dos**)** ~~Tablas sin usar: **`recurso`** (cero referencias) y **`dispositivo_push`** (legacy, pero **su endpoint de escritura sigue vivo y expuesto** en `server.js`).~~

---

### 👉 POR DÓNDE RETOMAR (al 30 jul 2026 · mañana — 409 tests; los 11 commits de aquí YA se subieron)

**Lo primero: subir.** `main` va **11 commits por delante** de GitHub (`git log origin/main..main`). Hasta que Pablo los suba con GitHub Desktop, **nada de esto está en producción** — incluida la zona horaria, que es la que arregla cinco fallos de fecha de golpe. *(El documento anterior decía "nada pendiente de subir" y ya entonces había uno.)*

**Lo que se hizo el 30 jul, en once commits:** la tanda de seguridad · el himnario regenerado · cinco fallos silenciosos · los mensajes de error en castellano con salida al login · los cargos por su nombre y Tesorería vacía · las salidas, el "Reintentar" y las confirmaciones de borrado · el doble toque · "Quitar" en Mi Grupo · el service worker.

**Acciones del dueño, por orden:**
1. **Subir los 11 commits** con GitHub Desktop → redeploy automático.
2. **Comprobar en los logs de Render** la línea nueva `[startup] zona horaria: America/Santiago`. Si dijera `UTC`, la variable no llegó.
3. **Render → Logs**, buscar `restaurando`: si sale una vez por despliegue, no hay bucle de reinicios. Después, la tarjeta **💾 Respaldo** del panel del super-admin.
4. **`SMTP_USER` / `SMTP_PASS`** (contraseña de aplicación de Gmail) y **`SUPERADMIN_PASSWORD`**.
5. Decidir si se reemplaza el **PDF descargable del himnario** por el nuevo (los trazos a lápiz quedarían visibles).

**Trabajo abierto, priorizado. LO PRIMERO al retomar:**

1. **Mensajes de validación en jerga — empezado y CORTADO A MEDIAS.** Un agente estaba en ello cuando se cerró la sesión; **no llegó a escribir nada** (`git status` limpio, verificado). Hay que rehacerlo desde cero. El problema: `seguridad.js` responde `'Datos invalidos: revisa ' + campos` con **las claves de zod**, así que la gente lee *"Datos invalidos: revisa hora_inicio"*, *"revisa persona_id"*, *"revisa grupo_id"*. Falta la tilde en "inválidos" y, sobre todo, **se descartan los mensajes que zod ya trae escritos en castellano** (`'falta el titulo'`, `'hora invalida (usa HH:MM)'`). Caso grave y concreto: `registro.js` usa `z.literal(true, { errorMap: … })` y el proyecto usa **zod 4**, donde el parámetro se llama `error` y `errorMap` **se ignora en silencio** → quien no marca la casilla de consentimiento lee *"Datos invalidos: revisa acepto"* en la puerta legal del registro. *(El agente alcanzó a confirmar que **solo hay un `errorMap` en todo el proyecto**.)* Ojo al arreglarlo: el log `[seguridad] entrada rechazada: …` **debe seguir** diciendo el nombre técnico — cambia lo que ve el usuario, no lo que ve el programador.

2. **Pulido de UX que queda** (de los 15 medidos, cerrados 8): recorridos incompletos —el "← Volver" de la hoja de Organización te deja en la lista y no en el calendario de donde entraste, y tiene otra forma que los cinco "‹" del resto— · dos `prompt()` del navegador (crear una lista en Organización y **eliminar mi cuenta**, que es la acción más grave que existe y se confirma con una ventanita gris) · datos que se ven y no se pueden corregir en ningún sitio (**el nombre de una persona**: quien se registró como "juan perez" queda así para siempre en el directorio, las asistencias y los impresos; **Escuela Dominical no tiene editar ni borrar nada**; **los movimientos de Tesorería no se editan ni se anulan**, y un monto mal tecleado descuadra el saldo para siempre) · tres formas distintas de crear algo y "Predica" sin tilde en el menú y el título.

3. **Fuente del gasto (Organización ↔ Tesorería):** diseño **a medias**. El dueño ya decidió que el modelo es **mixto de verdad**: conviven adelanto del pastor, reembolso a la persona y aporte que no se devuelve. Falta elegir cómo modelarlo (el informe del agente propone 4 caminos; el de "reciclar `pagado_por IS NULL` = la iglesia" está **descartado**: choca con los gastos históricos, que ya significan "no se sabe quién puso"). Retomar con el skill de *brainstorming*.

4. **Editar el himnario desde la app:** el dueño lo pidió explícitamente (junto con "que el transpositor siga funcionando" y "que el archivo siga siendo legible", que ya se cumplen). Hoy `himnario.json` es un archivo fijo del programa: nadie puede corregir un acorde sin tocar el código. Necesita spec propio.

5. **6 propuestas de módulos nuevos** levantadas por el agente de producto, ordenadas por valor ÷ esfuerzo, **sin presentar todavía al dueño**: peticiones de oración (el hueco más evidente: **nadie puede pedir oración**, `cuidado.js` solo deja abrir casos al pastor) · corregir/anular movimientos de Tesorería · eventos que se repiten · seguimiento de visitas (**los mensajes del portal público ya se están perdiendo**: solo llega un campanazo y no hay ninguna pantalla que liste `contacto_publico`) · retiro seguro de niños (`nino.autorizados` y `asistencia_nino.retiro_por` **ya existen en la BD** como texto libre que nadie llena) · ficha de membresía.

**Tablas creadas que no usa nadie** (hallazgo del inventario, no estaba documentado): `recurso` (salas reservables, cero referencias) · `fecha_no_disp` (cuándo alguien NO puede servir: `asignaciones.js` la **lee** para avisar al líder, pero **nada la escribe jamás** — es media función esperando su otra mitad, y la pantalla que falta es media tarde) · `dispositivo_push` (resto legacy, lo sustituyó `push_sub`).

---

### 👉 POR DÓNDE RETOMAR (al 29 jul 2026 · noche — 325 tests, superado por lo del 30 jul)

**Lo único abierto, y es de mirar, no de programar:** entrar al panel de Render → servicio `iglesia-app` → pestaña **Logs** o **Events**, y buscar la línea `[litestream] restaurando /data/iglesia.db desde R2`. Sale **una vez por arranque**.

- Si se repetía **cada uno o dos minutos** → el bucle de reinicios era real y ya está cortado (ver la sección de `/api/health` más arriba).
- Si solo aparece en los despliegues → era otra cosa, y hay que seguir investigando **con la tarjeta ya arreglada**, que desde este despliegue se refresca sola y, tras 4 minutos atascada en "acaba de arrancar", lo dice en rojo y manda a los registros.

Y después, mirar la tarjeta 💾 Respaldo del panel del super-admin, que ahora sí puede dar un veredicto: **verde** (cerrado el último bloqueante del proyecto) o **rojo** (y entonces cotejar las 4 variables `R2_*`/`LITESTREAM_*`). Recordar que las variables **sí están puestas**: si faltaran, la tarjeta diría "faltan las variables", no "acaba de arrancar".

Después de eso: `SMTP_USER`/`SMTP_PASS` y `SUPERADMIN_PASSWORD`.

**Lo hecho el 29 jul** (4 commits, todos en `main` y desplegados): la **rendición imprimible** para el tesorero (Fase 10) · el **indicador de respaldo estaba ciego** porque Litestream mezcla su log con la tabla en stdout · **`/api/health` estaba limitada** y eso reinicia el servicio en bucle · la **tarjeta se quedaba congelada** en "acaba de arrancar".

---

### 👉 POR DÓNDE RETOMAR (al 28 jul 2026 · noche, todo desplegado y **307 tests en verde**)

1. **Persistencia: probablemente YA ESTÁ, solo falta confirmarlo.** El bucket **`iglesia-app-db`** existe en Cloudflare R2 desde hace tiempo, se ha trabajado siempre con él, y el 29 jul tenía **285 objetos / 1.51 MB** con ~6.470 operaciones de escritura en el periodo — eso es una réplica de Litestream viva, no un bucket dormido. **No hay que crear bucket ni token.** Lo único pendiente es mirar la tarjeta 💾 Respaldo en el panel del super-admin: si está verde con fecha reciente, este punto está cerrado. *(Las versiones anteriores de este documento decían que las variables "nunca se confirmaron", y eso mandó a crear de cero algo que ya existía. La duda era sobre la confirmación, no sobre la existencia.)*
   Después: `SMTP_USER`/`SMTP_PASS` (sin ellas nadie recupera su contraseña por correo) y `SUPERADMIN_PASSWORD`.
2. ✅ ~~**Test intermitente sin resolver**~~ — **acoplamiento roto el 28 jul, pero el fallo original nunca se reprodujo** (0 de 15 corridas aisladas antes de tocar nada, y 20 réplicas instrumentadas en paralelo con trazas idénticas). Se encontraron dos fragilidades reales: (a) el comentario del test decía "ya se hicieron 2 peticiones de login" cuando son **3** —el limitador corre antes que zod, así que el test del body inválido también cuenta—, dejando una holgura de exactamente una petición; y (b) `BASE` usaba `localhost`, que resuelve a `::1` **y** a `127.0.0.1`, y con `autoSelectFamily` cada conexión compite entre ambas familias: **dos cubos distintos del mismo limitador** (medido: `127.0.0.1` → 401 con `remaining=4` mientras `[::1]` → 429 con `remaining=0`). Ahora el test lee `RateLimit-Limit` del servidor y pide en bucle hasta el 429, y usa la IP literal. ⚠️ **Si vuelve a fallar, la causa es una tercera que no se vio.**
3. ✅ ~~**`POST /api/upload` no valida tipo MIME ni tamaño**~~ — **cerrado el 28 jul**, y de paso: la afirmación de esta línea era falsa a medias (la lista blanca de extensiones y el tope de 10 MB ya existían). Lo que faltaba de verdad era mirar el **contenido**: ahora son tres capas (extensión → MIME declarado coherente → *magic bytes* de PDF/PNG/JPEG/GIF, borrando el temporal si no cuadra). Y los campos-URL quedaron partidos en dos clases —archivo subido aquí (`/uploads/` obligatorio) vs. enlace externo a propósito (solo `http`/`https`)—, porque restringirlos todos por igual habría roto compartir un vídeo de YouTube. 24 tests nuevos.
4. ✅ ~~**El auditor de UX cubre 11 vistas**, no todas~~ — **cerrado el 28 jul**. Ahora recorre 20 vistas con cuatro usuarios distintos (ninguna persona las ve todas) y registra como omitida la vista que no esté en el menú, en vez de reventar. Encontró y cerró 9 casos de contraste, 18 de área táctil bajo el mínimo AA y 2 de desborde horizontal. Ver `docs/AUDITORIA-UX-2026-07-28.md`.

### Abierto de verdad (28 jul 2026)
- **Botones por debajo de lo recomendado:** menú lateral a 42px de alto y `small-btn` a 36px. Cumplen el mínimo exigible (24px), quedan cortos frente a los 44px recomendados. Subirlos mueve el ritmo visual de toda la app → decisión de diseño, no deuda.
- **Organización v2** — ⚠️ **esta línea estaba mal y mandó a rehacer trabajo hecho** (29 jul). Listaba cinco pendientes; **tres y medio ya estaban construidos y desplegados**, y lo decían las líneas 100-105 de este mismo documento:
  - ✅ **responsable por línea** (`db.js:580`, `organizacion.js:271-312`) · ✅ **quién puso el dinero** (`db.js:584`) · ✅ **plantillas** — resueltas a propósito como *duplicar hoja* (`organizacion.js:209-238`) · ✅ **notificaciones "trae tu parte"**, por partida doble: al asignar (`organizacion.js:301-310`) y el día antes (`recordatorios.js:107-124`).
  - ✅ **Export a PDF** — el camino ya existía: `window.print()` (`web/app.js:3585`) + `@media print` (`web/styles.css:639-661`), que oculta los gastos, agranda las casillas y deja raya de firma en lo no asignado. Eso ya produce un PDF en Chrome, Android y iOS. **Se decidió NO añadir librería de PDF**: jsPDF pesa ~350 KB, hay que vendorearlo porque la CSP de `helmet` no permite CDN (`server.js:82`), rompe acentos y ñ con sus fuentes por defecto, y obliga a mantener un **segundo renderizador de la hoja**. Puppeteer no cabe: Chromium pide 250-400 MB de los 512 MB del plan free. Quedan tres detalles cosméticos (ver abajo).
  - ❌ **Presupuesto estimado por línea** — sigue sin existir (`evento_org_cosa` no tiene columna de costo, `db.js:122-129`). La línea vieja lo fundía con "quién puso el dinero", que son cosas distintas. Fuera de alcance a propósito (ver línea 106).
  - ❌ **Integración con Tesorería** — lo único genuinamente abierto. Cero referencias cruzadas entre `organizacion.js` y `tesoreria.js`.

### 🧾 Organización ↔ Tesorería — lo decidido y lo que falta (29 jul 2026)
- **Decisión del dueño (29 jul): el modelo es MIXTO** — a veces paga la caja de la iglesia (el pastor entrega dinero al líder), a veces lo ponen las personas de su bolsillo. Esto invalida la nota de la línea 106 ("esa plata no es de la iglesia"): **a veces sí lo es**.
- **Consecuencia: el primer paso NO es enlazar tablas.** Hoy el modelo no puede expresar la decisión tomada: `evento_org_gasto.pagado_por` siempre apunta a una persona (`db.js:584`), y no hay forma de decir "esto lo pagó la iglesia". Poder marcar la fuente del gasto es el cambio previo a cualquier otra cosa.
- **Los aportes no son una tabla:** son un `GROUP BY pagado_por` sobre los gastos (`organizacion.js:87-91`) — cuánto adelantó cada persona, para saber a quién devolverle cuánto. Registrarlos como ingreso inflaría el recaudado de la página pública de transparencia (`tesoreria.js:110`).
- **Choque de permisos, medido** (`auth.js:264-272`, `tesoreria.js:15-24`): el **tesorero recibe 403 en TODO `/api/organizacion`** (`'tesorero'` no está en `esLiderOAdmin`) y el **obispo también**; el **pastor edita en Organización pero no puede escribir en Tesorería**; el líder que organiza no puede ni leer Tesorería. Son conjuntos casi disjuntos: cualquier botón "enviar a Tesorería" sería un bypass de `soloTesorero`.
- **Choque de datos:** `evento_org_gasto` no tiene categoría, ni fecha del hecho (solo `creado_en` en **UTC**, mientras `movimiento.fecha` usa `localtime` → un gasto de las 21:00 caería en el mes equivocado a fin de mes), ni comprobante, ni estado. Y ~~`movimiento` **no se puede editar ni borrar por la API**~~ **(desfasado el 5-ago: `PATCH /api/tesoreria/movimientos/:id` corrige monto, descripción y categoría, con apunte de auditoría en la misma transacción; borrar sigue sin existir)**, mientras `DELETE /gastos/:gastoId` borra sin dejar rastro (`organizacion.js:346-353`: sin transacción y sin `auditar()`).
- ✅ ~~**Antes de escribir en `movimiento`, probar el papel**~~ — hecho el 29 jul (ver Fase 10, *Rendición*). Queda por saber si en uso real basta con el papel o hace falta la integración; esa respuesta la da la iglesia usándolo, no otro spec.
- ✅ ~~`zod` en el resto de los routers~~ — **cerrado el 28 jul**. Se creía pendiente por una línea vieja de este documento; al inventariar los 37 routers, 24 ya validaban y el único hueco real era **mensajería** (4 rutas: se colaban `[3]` como id, `{a:1}` guardado como `"[object Object]"` y difundido por SSE + push, y listas de participantes sin tope). Cubierto con 15 tests.
- ✅ ~~**`POST /api/upload` sigue sin validar**~~ y ✅ ~~**`adjunto_url` acepta hosts externos**~~ — ambos **cerrados el 28 jul** (ver punto 3 de "por dónde retomar").
- ✅ ~~**Guardar acordes de una canción da 400**~~ — **cerrado el 28 jul**. `guardarLetraCancion` reenvía la canción entera desde su copia en memoria, y `enlace`/`autor` viajaban como `null`; `z.string().optional()` acepta ausente o cadena, pero no nulo. El arreglo fue en el esquema y no en el frontend, porque el handler ya estaba escrito para esto (`autor ?? c.autor` = "si no viene, deja lo que había"): quien contradecía esa intención era el esquema. Revisados los otros 7 handlers con el mismo `??`: el bug era único — todos los demás `PATCH` arman su body desde los campos del formulario, que siempre dan cadena.
- ✅ ~~**Enlaces sin esquema se rechazan**~~ — **cerrado**. `normalizarEnlace()` en `web/app.js` le pone el `https://` al enviar, que es como la gente copia un enlace desde el navegador del teléfono. Se aplica en los tres sitios que mandan una URL de verdad (carpeta de Drive del grupo, recurso de grupo tipo *link*, recurso de prédica tipo *link*) y **no** en el tipo *libro*, que es texto libre. Dos cosas que no hace a propósito: si el texto **ya trae esquema** —incluido `javascript:`— lo deja tal cual para que lo rechace el backend (anteponerle `https://` lo convertiría en una URL válida y absurda, y taparía el intento); y si no parece un enlace (sin punto, o con espacios) tampoco lo toca, para que el usuario vea el error claro en vez de guardar `https://hola`. El candado del backend no se tocó. *(De paso: el formulario de canciones no tiene campo de enlace, así que ahí nunca hubo fricción.)*

### 🆕 Salió el 28 jul por la noche (Fase 11) — abierto

- ✅ ~~**La página pública oculta los eventos de HOY a partir de las 20:00**~~ — **cerrado el 28 jul por la noche**. `publico.js` filtraba con `fecha >= hoy` calculando `hoy` en **UTC**, y Chile va cuatro horas por detrás: los eventos de hoy desaparecían del portal justo en la franja en que alguien mira el sitio para saber si esa noche hay culto. Ahora hay un `fechaLocal()` exportado y probado con la zona horaria fijada (`publico-fecha.test.js`), así que el test demuestra el fallo en cualquier máquina y no solo a las 20:00 de Chile. **Lo interesante:** el test viejo construía sus fechas con el mismo criterio equivocado, así que la suite pasaba con el bug dentro; al arreglar el código se destapó y hubo que arreglar los dos. Un test que comparte el error del código no protege de nada.
- ✅ ~~**Menores del indicador, diferidos a propósito**~~ — **los cinco cerrados el 29 jul** (317 tests en verde). Lo destacable: la clave del aviso diario usaba UTC, o sea **la tercera aparición del mismo desfase** (antes: la página pública y el recordatorio del día antes). `fechaLocal()` salió de `publico.js` a `backend/src/fechas.js` para que `persistencia.js` no tuviera que importar del router público solo para saber qué día es; `publico.js` la re-exporta, así que ningún import cambió. Los otros cuatro: single-flight en `estadoPersistencia()` (con la caché fría, `/api/me` y el panel lanzaban `litestream generations` a la vez, porque la caché guarda el *resultado* y aún no había resultado); "hace 4 h" con la fecha exacta en el `title`; `retraso_seg` pintado —también en verde, donde explica por qué un "último" viejo puede ser sano—; y el aviso creado por `GET /superadmin/persistencia` antes de responder, para que la campana no quede en 0 en la carga que descubre el fallo (es un GET con efecto, idempotente por la clave diaria).
  - **Residual anotado, no cerrado:** si `_limpiarCache()` se llama con un vuelo realmente en curso, ese vuelo escribirá su resultado en la caché recién limpiada. Ningún test lo provoca (todos esperan antes de limpiar); cerrarlo pedía un contador de generación que no valía el refactor.
- ✅ ~~**Los tres detalles cosméticos del imprimible**~~ — **cerrados el 29 jul**, 40 líneas y cero dependencias. El botón ahora dice "🖨️ Imprimir / PDF" con un `title` que explica dónde elegir el destino; `Org.imprimir()` fija `document.title` al nombre de la hoja antes de `print()` y lo restaura en `afterprint` (antes todo PDF guardado se llamaba `Iglesia App.pdf`, porque `<title>` es una cadena fija de `index.html` que `app.js` nunca tocaba); y una cabecera `.solo-print` pone la iglesia y la fecha en el papel que se pega en la puerta.
  - **La trampa que casi se lleva esto por delante, y que ningún test veía:** `.solo-print{display:block}` vive dentro de `@media print` (línea ~650) y `.solo-print{display:none}` **más abajo** en el mismo archivo (~683). Misma especificidad → gana la última, y la cabecera no habría salido nunca. `.org-firma` se libra sólo porque su selector de impresión lleva dos clases (`.org-quien .org-firma`). Resuelto con `!important`, igual que `.no-print`. Verificado en el navegador con `page.emulate_media(media='print')`, que es la única forma de verlo.
  - Restaurar el título va en `afterprint` y **no** justo después de `print()`: en escritorio `print()` bloquea hasta cerrar el diálogo, pero en móvil vuelve enseguida y el título se restauraría antes de que el navegador lo leyera. Hay un temporizador de 60 s como red de seguridad por si el navegador no dispara el evento.
- ✅ ~~**Falta la verificación que ningún test puede hacer**~~ — **hecha el 29 jul en Render, y encontró el fallo**: la tarjeta salió **ámbar** con "respuesta inesperada de Litestream". La hipótesis anotada aquí (columnas renombradas) era **falsa**: la cabecera de v0.3.13 es exactamente `name generation lag start end`, como asumía el código. La causa real es que **`litestream generations` no imprime solo la tabla**. litestream v0.3.13 manda su log a **stdout** salvo que se le pida lo contrario (`cmd/litestream/main.go`: `logOutput := os.Stdout`), y la tabla la escribe con un `tabwriter` que solo se vuelca al terminar (`defer w.Flush()`) → **cualquier línea de log sale ANTES de la cabecera**, y `interpretarGeneraciones` daba por hecho que la cabecera era `lineas[0]`.
  - **Lo grave no era el ámbar.** Cuando listar generaciones falla de verdad (clave mal copiada, bucket mal escrito), `generations.go` escribe `level=ERROR` en ese mismo stdout y **continúa**, así que la tabla sale vacía: un respaldo genuinamente roto se leía como "no se pudo comprobar" (ámbar, **sin aviso**) en lugar de rojo con notificación. El fallo silencioso que este módulo existe para delatar, dentro del propio módulo.
  - **Arreglado en tres sitios, un solo origen** (29 jul): `litestream.yml` gana `logging: stderr: true` (separa los canales en el origen); `interpretarGeneraciones` **busca** la cabecera en vez de suponerla en la línea 0, y trata `level=ERROR` como **mal** (motivo nuevo `salida_con_error`) en vez de ámbar; y `parsearDuracion` aprende `µs`/`ns`, que es lo que emite Go (`truncateDuration`) cuando el retraso baja de 1 ms — o sea que **el estado más sano posible se leía como formato raro**. De paso, un retraso negativo (réplica por delante del mtime local) ya no se lee como retraso alto: eso habría dado una alarma roja falsa.
  - **Test nuevo que faltaba:** el conjunto de motivos es cerrado y compartido con el frontend, pero nada comprobaba que cada motivo tuviera etiqueta en `PERS_MOTIVO`. Un motivo sin etiqueta no revienta: deja un renglón a medias en la tarjeta, que es como no tener indicador. Ahora se comprueba leyendo `web/app.js` (verificado por mutación: al quitar la etiqueta, el test falla).
  - ✅ **Confirmado tras desplegar:** el parser dejó de atragantarse (la línea pasó de "respuesta inesperada" a "sin generaciones todavía", que es la lectura correcta de un Litestream recién arrancado). Pero la tarjeta se quedó clavada en **"el servicio acaba de arrancar"** en tres lecturas seguidas, lo que abrió el hallazgo de abajo.

### 🔴 `/api/health` estaba dentro del limitador de peticiones — bucle de reinicios (29 jul)

**Confirmado con un test que falla antes y pasa después** (`seguridad.test.js`): `/api/health` pasaba por `limiterGeneral` (100 por ventana de 15 min) y respondía **429** al superarlo. Y esa ruta es el `healthCheckPath` de `render.yaml`, o sea la que Render consulta **cada pocos segundos** para decidir si el servicio está sano.

El ciclo se alimenta a sí mismo: se pasa de 100 → 429 → Render declara el servicio enfermo y lo **reinicia** → el contador vive en memoria, así que el reinicio lo pone a cero → vuelve a empezar. Mientras, la app contesta 200 a todo lo demás, así que no se nota por ningún otro sitio. Y en el plan free, donde `/data` es efímero, **cada reinicio se lleva lo que Litestream no haya replicado todavía**. Es también la explicación natural del "acaba de arrancar" perpetuo: si el proceso reinicia cada uno o dos minutos, cada lectura cae de verdad dentro del periodo de gracia de 3 minutos.

**Arreglo:** `SIN_LIMITE_GENERAL = ['/api/mensajes', '/api/health']` en `server.js`. El test comprueba las dos cosas —que 120 comprobaciones seguidas no reciben ni un 429, y que la ruta **no lleva cabeceras `ratelimit-*`**— porque si solo comprobara el 429, subir el tope a 1000 lo dejaría en verde con la bomba armada para más adelante.

**✅ Desplegado y verificado en vivo (29 jul):** `GET https://iglesia-app-r9ay.onrender.com/api/health` responde 200 **sin cabeceras `ratelimit-*`** — prueba directa, desde fuera, de que la ruta ya no pasa por el limitador. El mecanismo del bucle queda cortado.

**⚠️ Lo que NO está confirmado:** que en producción estuviera reiniciándose de verdad. Se intentó medir desde fuera leyendo `ratelimit-remaining` como si fuera un cronómetro de tiempo de vida, y **esa medición no vale**: `claveLimitador` cuenta por IP cuando no hay sesión, así que si la IP de salida del que mide varía, cada petición cae en un contador distinto y el "diente de sierra" no prueba nada. Lo confirma o lo descarta la pestaña **Events/Logs de Render** (una línea `[litestream] restaurando …` repitiéndose cada pocos minutos = un arranque cada vez). **Pendiente de que el dueño lo mire.**
- **Rama `chore/limpieza-profunda` (23 jul):** completamente fusionada en `main`, cero commits propios. Es un resto, se puede borrar.
