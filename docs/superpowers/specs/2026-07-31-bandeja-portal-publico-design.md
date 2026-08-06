# La bandeja de mensajes del portal público — Diseño

**Fecha:** 31 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado por el dueño; listo para plan de implementación

## De qué se trata

El portal público de cada iglesia (`/publico.html?ig=CODIGO`) tiene un formulario
"Planifica tu visita" donde cualquiera, sin cuenta, escribe su nombre y un
mensaje (`web/publico.html:104-118`). Ese mensaje se guarda en la tabla
`contacto_publico` (`backend/src/publico.js:120`) y se le manda una notificación
a cada pastor activo de esa iglesia (`publico.js:124-129`).

**El problema: nadie lee esa tabla.** No hay ni un solo `SELECT` sobre
`contacto_publico` en todo el proyecto fuera de los tests — solo el `INSERT`.
No existe ninguna pantalla que muestre esos mensajes. Están guardados y son
invisibles.

Lo que hace que esto **ya esté fallando con gente real** y no sea un problema
teórico son tres cosas juntas:

1. La única forma de enterarse es la notificación, que sí lleva el texto
   completo (`publico.js:128`).
2. Pero esa notificación **no se puede pulsar**: `_destinoNotif()`
   (`web/app.js:1252-1254`) no tiene ninguna entrada para el tipo
   `contacto_publico`, así que devuelve `''` y `abrirNotif()` no navega a
   ningún sitio.
3. Y la pantalla de notificaciones **no tiene "ver más"**: el backend sí pagina
   de 50 en 50 y devuelve `hayMas` (`notificaciones.js:79-92`), pero
   `verNotificaciones()` (`app.js:1226-1251`) nunca lo mira. Pasadas 50
   notificaciones, el mensaje de esa visita desaparece de la vista **para
   siempre**.

Es decir: el mensaje llega, se guarda, se avisa — y aun así se pierde.

Detalle que confirma que la pantalla estaba prevista y nunca se construyó: el
índice `idx_contactopublico_iglesia` existe desde el principio, con el
comentario *"el pastor revisa los mensajes de su iglesia"* (`db.js:647-648`).
El índice se creó para una consulta que nunca se escribió.

## Decisiones tomadas (31 jul 2026)

| Decisión | Elegido | Descartado |
|---|---|---|
| Quién ve la bandeja | **Solo el pastor.** Es coherente con lo que ya pasa: el obispo tampoco ve Cuidado Pastoral, porque `cuidado_pastoral` no está en sus módulos (`auth.js:122-123` vs `126-129`) | Que la vea el obispo (aunque `cuidado.js:13` lo permitiría en el backend); que la vean los líderes |
| Forma de la bandeja | **Con estado**, igual que Cuidado Pastoral: cada mensaje nace `nuevo` y el pastor lo marca `atendido`; los nuevos salen arriba | Lista sin estado (el pastor no sabría cuáles ya respondió); convertir el mensaje en caso de Cuidado Pastoral (`caso_cuidado` exige `persona_id` y un visitante **no es** una persona de la iglesia — habría que crearla primero: es otro proyecto) |
| Qué pasa con los mensajes acumulados de antes | **Estado propio `previo`**, en una sección aparte y plegada. La bandeja abre limpia; el historial está a un clic y no se pierde nada | Dejarlos como `nuevo` (la primera apertura es un muro de meses); marcarlos `atendido` (**es mentira**: la app afirmaría que el pastor los atendió cuando nadie los ha visto, y enterraría en silencio a quien sí espera respuesta) |
| El formulario público | **No se toca.** Sigue pidiendo solo nombre y mensaje | Añadir teléfono o correo opcional |
| La promesa "te contactaremos pronto" | **Se cambia la frase**, en los dos sitios donde aparece | Dejarla (seguiría prometiendo algo imposible); cumplirla pidiendo datos de contacto (contradice la decisión de no tocar el formulario) |
| El "ver más" de Notificaciones | **Entra en este trabajo** | Dejarlo para después — es el mismo agujero que estamos tapando, y afecta a *todas* las notificaciones |
| La Política de Privacidad | **Entra en este trabajo**, en borrador para el abogado | Dejarlo para el abogado sin borrador |
| Cómo llega el pastor a la bandeja | Entrada de menú siempre visible **+** la notificación pulsable | Un widget más en el Panel del pastor — añade alcance en `panel.js` sin resolver nada que esos dos caminos no resuelvan ya |
| Borrar un mensaje | **Fuera de alcance.** No se puede borrar | Añadir borrado — nadie lo pidió, y borrar el mensaje de un visitante no tiene vuelta atrás |

## Qué ve el pastor

Una entrada nueva en el menú, **📬 Mensajes del portal**, junto a Cuidado
pastoral. Dentro, la lista:

```
📬 Mensajes del portal

┌────────────────────────────────────┐
│ María González            🆕 Nuevo │
│ Quiero visitarlos el domingo…      │
│ 28 jul          [Marcar atendido]  │
├────────────────────────────────────┤
│ Juan Pérez             ✅ Atendido │
│ Necesito hablar con alguien…       │
│ 12 jul                             │
└────────────────────────────────────┘

              [ Ver más ]

▸ 📥 Mensajes anteriores a esta bandeja (14)
```

Los nuevos arriba; dentro de cada grupo, los más recientes primero. El botón
"Ver más" solo aparece si quedan más.

**La última línea es lo que evita que la primera apertura sea un muro.** Los
mensajes que ya estaban guardados cuando se construyó la bandeja viven en su
propia sección, **plegada**, con su número a la vista. El día que se despliegue
esto, el pastor abre la bandeja y ve lo de arriba vacío o casi — no meses de
deuda de golpe — pero sabe exactamente cuántos hay esperando y los abre cuando
quiera.

Al desplegarla, cada uno de esos mensajes se ve igual que los demás y **se
puede marcar atendido uno por uno**, con el mismo botón. No hay marcado masivo:
ver "Fuera de alcance".

Y la notificación 📬 que ya llega hoy pasa a **poder pulsarse**: lleva a esta
pantalla.

## Cómo se modela

**Una columna aditiva:** `contacto_publico.estado TEXT NOT NULL DEFAULT 'nuevo'`,
por el mismo `agregarColumna()` que ya usa el resto de `db.js`
(`db.js:567-569`). **Tres valores:**

| Valor | Significa | Quién lo pone |
|---|---|---|
| `'nuevo'` | Llegó y nadie lo ha atendido | El `DEFAULT` de la columna, en cada mensaje que entra |
| `'atendido'` | El pastor lo marcó | El `PATCH` |
| `'previo'` | Ya estaba guardado **antes de que existiera esta bandeja**; nadie lo vio nunca, porque no había dónde | Una única vez, al crear la columna |

El tercer valor existe para no tener que elegir entre dos mentiras. `'nuevo'`
sería cierto pero convertiría la primera apertura en meses de deuda de golpe;
`'atendido'` sería cómodo y **falso** — la app afirmaría que el pastor los
atendió. `'previo'` dice lo que realmente pasó: llegaron, se guardaron, y la
app no tenía dónde enseñarlos. La culpa era del programa, no del pastor, y así
queda escrito en la base de datos.

Un mensaje `'previo'` **sí puede pasar a `'atendido'`** por el camino normal:
son el mismo `PATCH` y el mismo botón. Lo que no puede es volver a `'nuevo'`.

### La migración, y la forma exacta de romperla

```js
// El UPDATE va DENTRO de la guarda, y solo se ejecuta la vez que se crea la
// columna: marca lo que ya estaba guardado como anterior a la bandeja.
if (!columnaExiste('contacto_publico', 'estado')) {
  agregarColumna('contacto_publico', 'estado', "TEXT NOT NULL DEFAULT 'nuevo'");
  db.exec("UPDATE contacto_publico SET estado = 'previo'");
}
```

> 🔴 **Si ese `UPDATE` queda fuera del `if`, corre en cada arranque del
> servidor y manda a `'previo'` todos los mensajes nuevos y todos los ya
> atendidos.** La bandeja seguiría abriendo, sin errores y sin avisar nada: solo
> dejaría de mostrar mensajes nuevos para siempre, y el pastor volvería a
> perderse las visitas — exactamente el fallo que este trabajo viene a arreglar,
> pero ahora silencioso y con una pantalla que parece funcionar.
>
> Esto **no** puede quedar solo en la revisión de código: hay una prueba que lo
> fija (arrancar dos veces contra la misma base de datos y comprobar que un
> mensaje `'nuevo'` sigue siendo `'nuevo'`). Nótese que `agregarColumna()` por
> sí solo ya es idempotente (`db.js:567-569`); el que no lo es, y por eso
> necesita la guarda explícita, es el `UPDATE`.

**Dos rutas nuevas**, en `publico.js` (el módulo del portal, que ya tiene rutas
de pastor autenticadas — `GET /info` y `PATCH /info`, `publico.js:40-69`):

| Endpoint | Qué hace |
|---|---|
| `GET /api/publico/mensajes` | La bandeja de trabajo de **su** iglesia: los `nuevo` y los `atendido`, **sin los `previo`**. Solo pastor. Paginada: `{items, hayMas, offset}`, y además `previos` con **cuántos** hay en la sección plegada (para poder pintar el número sin traérselos) |
| `GET /api/publico/mensajes?previos=1` | Los `previo`, también paginados. Se pide solo cuando el pastor despliega esa sección |
| `PATCH /api/publico/mensajes/:id/atender` | Marca uno como atendido. Solo pastor. Vale igual para un `nuevo` que para un `previo` |

> ⚠️ **Las dos van registradas ANTES de `r.get('/:codigoIglesia')`**
> (`publico.js:80`). Esa ruta paramétrica se traga cualquier cosa: si
> `/mensajes` se registrara después, Express lo interpretaría como el código
> único de una iglesia y devolvería 404 sin llegar nunca a la bandeja. El
> archivo ya resolvió este mismo problema con `/info` y **lo dejó escrito en un
> comentario** (`publico.js:35-39`); esto sigue esa misma regla.

**El orden de la lista** copia el de Cuidado Pastoral (`cuidado.js:26`):
`ORDER BY (estado = 'atendido'), creado_en DESC, id DESC` — el booleano ordena
primero los no atendidos, y el `id DESC` desempata dos mensajes del mismo
segundo. La sección de `previo` se ordena solo por fecha, del más reciente al
más antiguo.

Un `previo` que se marca atendido **sale de la sección plegada y aparece entre
los atendidos** de la lista principal. Es lo correcto: ya no es un mensaje que
la app escondió, es uno que el pastor resolvió.

**La paginación** copia el patrón que ya existe en `notificaciones.js:79-92`:
se piden `LIMIT + 1` filas para saber si quedan más sin un `COUNT` aparte.

## Aislamiento entre iglesias

`GET` filtra por `iglesia_id` del token. El `PATCH` resuelve el mensaje
**acotado por iglesia en la misma consulta** (`WHERE id = ? AND iglesia_id = ?`),
no en una comprobación posterior — es el fallo que ya se coló una vez en
`musica.js` (un borrado que cruzaba congregaciones).

Si el mensaje no es de tu iglesia: **404, no 403**. Un 403 confirmaría que ese
id existe en alguna parte.

## Seguridad: de dónde viene este texto

Esto es lo más importante de este diseño, y conviene decirlo sin rodeos: **el
nombre y el mensaje los escribe un desconocido de internet, sin cuenta, sin
moderación y sin que nadie de la iglesia lo apruebe.** Es el dato menos
confiable de toda la aplicación — más que cualquier cosa que teclee un miembro.

Reglas, entonces:

- **Todo lo que salga de `contacto_publico` a la pantalla va por `escHtml`**:
  el nombre y el mensaje, sin excepción.
- **Nada de eso se pasa a `modalConfirm` sin escapar.** `modalConfirm` mete su
  mensaje crudo en `innerHTML`, y este proyecto ya metió un XSS por ahí
  exactamente así. (Con las decisiones de arriba no debería hacer falta ningún
  `modalConfirm` en esta pantalla — no hay borrado —, pero queda escrito por si
  alguien añade una confirmación al marcar atendido.)
- El endpoint público **no gana ninguna capacidad de lectura**. La bandeja es
  autenticada y de pastor; el aviso de seguridad de la cabecera de `publico.js`
  (`publico.js:5-12`) sigue siendo cierto tal cual está.
- El `POST` público sigue con su `limiterSensible` (10 peticiones por IP cada
  15 minutos, `publico.js:115`), sin cambios.

## Las fechas están en UTC, y se ven mal

`contacto_publico.creado_en` guarda `datetime('now')`, que **en SQLite es UTC
siempre**, sin importar la zona horaria del proceso (que sí está bien puesta en
`America/Santiago` desde el `Dockerfile` y `render.yaml`).

La app hoy muestra este tipo de marcas cortando el texto —
`(x.fecha||'').slice(0,10)` en Cuidado Pastoral (`verCaso()` en `app.js:2102`) — así que **un
mensaje enviado un lunes a las 21:00 hora de Chile se ve fechado el martes.**
Ese fallo ya existe hoy en Cuidado Pastoral; no lo introduce este trabajo.

Se añade un ayudante pequeño en `web/app.js` que convierte una marca UTC
(`'YYYY-MM-DD HH:MM:SS'`) a la fecha del calendario chileno, y la bandeja lo
usa. **No se cambia el valor guardado en la base de datos** — eso volvería
inconsistentes las filas viejas con las nuevas, y esta app ya se llevó cinco
fallos por tocar zonas horarias sin necesidad. Se arregla al mostrar, no al
guardar.

**La fecha de Cuidado Pastoral (`verCaso()` en `app.js:2102`) NO se corrige en este trabajo**,
aunque el ayudante nuevo la arreglaría en una línea. Es un módulo que este
diseño no toca, y meterle un cambio de paso ensucia el diff con el que se va a
revisar la bandeja. Queda anotado en `ESTADO.md` como pendiente conocido, con
el ayudante ya construido y esperándolo.

## Lo que se arregla alrededor

**1. La notificación pulsable.** `_destinoNotif()` (`app.js:1252-1254`) gana la
entrada `contacto_publico: 'mensajes_portal'`. Una línea, y es el camino por el
que el pastor va a llegar de verdad.

**2. El "ver más" de Notificaciones.** `verNotificaciones()` pasa a usar el
`hayMas` que el backend ya manda, con el mismo patrón de acumulador que usa
Tesorería (`_movOffset`, `app.js:2105`). Esto **no es solo para estos
mensajes**: hoy cualquier notificación de más de 50 de antigüedad es
irrecuperable para cualquier persona de cualquier iglesia.

**3. Las dos frases del portal.** El formulario no pide datos de contacto, así
que la página no puede prometer que contactará a nadie:

| Dónde | Antes | Después |
|---|---|---|
| `publico.html:105` | "Cuéntanos que quieres visitarnos o que necesitas y te contactaremos pronto." | "Cuéntanos que quieres visitarnos o que necesitas. Tu mensaje le llega directo al pastor." |
| `publico.html:316` | "¡Gracias! Recibimos tu mensaje y te contactaremos pronto." | "¡Gracias! Tu mensaje ya le llegó al pastor." |

**4. La Política de Privacidad.** Hoy `web/legal/privacidad.html` **no menciona
en ningún sitio** los datos de quien escribe desde el portal público. Y es la
categoría más delicada del documento por una razón concreta: es la única
persona cuyos datos se tratan **sin que tenga cuenta**, así que nunca pasó por
el consentimiento versionado que sí firman los miembros
(`consentimiento.js`) — no hay ninguna fila en `consentimiento` que la ampare.

Se añade una fila a la tabla de categorías de datos, en borrador, describiendo:
qué se recoge (nombre y mensaje libre), de quién (un visitante sin cuenta),
para qué (que el pastor pueda responder), y que se conserva hasta que la
iglesia lo elimine. **Queda marcado como borrador para el abogado**, que ya
tiene pendientes los placeholders `[…]` del mismo documento
(`privacidad.html:93`, `873`).

> Este punto es de cumplimiento, no de programación: si el borrador y lo que
> hace el código se separan, manda lo que hace el código y hay que corregir el
> texto, nunca al revés.

## Dónde vive en el menú

`NAV` (`app.js:8-30`) gana `['mensajes_portal','📬','Mensajes del portal']`
junto a `cuidado_pastoral`, y `navTo()` (`app.js:595+`) su línea
correspondiente.

> **Comprobado, porque la clave se parece peligrosamente a una que ya existe:**
> hay dos sitios que tratan la clave `'mensajes'` (el chat) de forma especial —
> `tieneModulo()` la deja pasar siempre (`app.js:400`) y `buildNav()` le cuelga
> el badge de no leídos (`app.js:590`). Los dos comparan con `===`, no con
> `startsWith` ni `includes`, así que `'mensajes_portal'` **no** hereda ninguna
> de las dos cosas. Si alguna vez se cambian esas comparaciones por algo más
> laxo, esta pantalla se volvería visible para toda la iglesia.

La visibilidad sale de `tieneModulo()` (`app.js:393-405`), que para las claves
normales termina en `mods.includes(k)`. Así que basta con añadir
`'mensajes_portal'` a la lista de módulos del pastor en `auth.js:127-128`. El
obispo no la recibe (`auth.js:122-123` devuelve una lista cerrada), igual que
hoy no recibe `cuidado_pastoral` — que es justo la decisión tomada.

## Pruebas

Backend:

- el pastor ve **solo** los mensajes de su iglesia
- un líder (no pastor) recibe **403** al pedir la bandeja
- el pastor de otra iglesia recibe **404** al marcar atendido, **y el mensaje
  no cambia de estado** (que no cambie es parte de la prueba, no solo el código
  de error)
- los mensajes guardados antes de esta columna quedan como `'previo'`
- **un mensaje nuevo que entra después de la migración queda `'nuevo'`, no
  `'previo'`** (que el `DEFAULT` de la columna manda sobre el `UPDATE` de una
  sola vez)
- 🔴 **arrancar el servidor dos veces contra la misma base de datos no cambia
  el estado de nada** — la prueba que impide que el `UPDATE` de la migración
  se escape de su guarda
- la bandeja principal **no** trae los `previo`, y sí trae su número
- `?previos=1` trae los `previo` y nada más
- marcar atendido cambia el estado, y el mensaje baja en el orden
- marcar atendido un `previo` lo saca de la sección plegada y baja su número
- la lista avisa `hayMas` cuando quedan más, y el `offset` trae los siguientes
- `/mensajes` **no** se resuelve como código de iglesia (la prueba que fija el
  orden de registro de las rutas)

Frontend:

- un mensaje cuyo nombre contiene `<script>` se pinta escapado
- `_destinoNotif('contacto_publico')` devuelve la clave de la bandeja

## Fuera de alcance, a propósito

- **El formulario público no se toca**: sigue sin pedir correo ni teléfono.
- **No se puede responder desde la app.** No hay a dónde responder — es la
  consecuencia asumida de la decisión anterior, y por eso se cambia la frase de
  la página.
- **No se puede borrar un mensaje**, ni marcar atendido masivamente, ni volver
  a marcar como nuevo uno ya atendido.
  > *(Nota del 6-ago: los dos primeros puntos caducaron — la tanda E añadió
  > borrar un mensaje, auditado, y atender en bloque; ver
  > `2026-08-06-bandeja-borrar-y-bloque-design.md`. Volver a 'nuevo' sigue
  > fuera, a propósito.)*
- **No se convierte un mensaje en caso de Cuidado Pastoral.** `caso_cuidado`
  exige un `persona_id` de la iglesia (`db.js:252-259`) y un visitante no lo
  es. Haría falta crear la persona primero: es un proyecto aparte.
- **No hay widget en el Panel del pastor** (ver tabla de decisiones).
- **No se toca el consentimiento legal.** Quien escribe desde el portal sigue
  sin firmar nada; lo que se hace es **decirlo** en la Política de Privacidad,
  no cambiar el mecanismo.
- **No se cambia cómo se guardan las fechas.** El arreglo de UTC es solo al
  mostrar.
- **No se toca el `limiterSensible`** del formulario público.

## Riesgo conocido

El riesgo original de este diseño era que la primera apertura fuera un muro de
mensajes acumulados de meses. **Lo resuelve el estado `previo`** y su sección
plegada: la bandeja abre limpia y el historial queda a un clic, sin que ningún
mensaje se marque como atendido sin serlo.

Lo que queda, y es honesto decirlo: **esa sección plegada puede no abrirse
nunca.** Los mensajes siguen ahí, contados y accesibles, pero nada obliga a
mirarlos y no generan aviso. Es una mejora clara sobre hoy —hoy son
literalmente invisibles— pero no es lo mismo que responderlos.

Se acepta a propósito: la alternativa era dejarlos como `nuevo` y forzar la
atención, que es justo lo que se descartó. Si al desplegar resulta que ahí
había algo importante, el número a la vista es lo que lo va a delatar.

**Dato que no tengo:** cuántos mensajes hay realmente esperando en producción.
La base de datos de Render no es accesible desde aquí, así que el número de la
maqueta (14) es inventado. Puede ser 2 o puede ser 200 — el diseño funciona
igual en los dos casos, pero conviene mirarlo el día del despliegue.
