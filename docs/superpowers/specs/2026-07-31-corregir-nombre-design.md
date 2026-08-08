# Corregir el nombre de una persona — Diseño

**Fecha:** 31 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado (31 jul 2026); listo para ejecutar el plan. Ver "Decidido por el dueño" al final.

## De qué se trata

Alguien se registra escribiendo su nombre "juan perez", en minúsculas, o con un
apellido mal tecleado. Hoy **no hay ningún sitio en la app** donde corregirlo:
ni "Mi perfil" en el Directorio (que edita teléfono, correo, foto y cumpleaños,
pero no nombre), ni "Mi cuenta" en Ajustes (que edita correo y
contraseña, pero no nombre), ni el panel de Administración del pastor (que
activa/desactiva cuentas y asigna roles, pero no toca el nombre). Verificado
leyendo los tres módulos completos: `backend/src/directorio.js`,
`backend/src/cuenta.js`, `backend/src/admin.js`.

El nombre mal escrito queda así **para siempre**: en el directorio, en las
listas de asistencia y en los impresos que se pegan en la puerta de la
iglesia.

## Lo que ya estaba anotado, y se confirma aquí

`ESTADO.md:554` ya dejó escrito que un documento aún más viejo pintaba esto
como caro ("queda así para siempre en el directorio, las asistencias y los
impresos", que suena a datos duplicados) y que **es falso**: *"el nombre vive
solo en `persona.nombre` y todo lo demás llega por `JOIN`"*. Se confirma de
nuevo aquí, con los sitios exactos:

- El directorio lo lee con `SELECT * FROM persona WHERE iglesia_id = ? …`
  (`directorio.js:43-46`) — directo de la tabla, sin copia.
- Los reportes de asistencia (los que alimentan lo que se imprime) hacen
  `JOIN persona p … p.nombre AS persona` (`panel.js:89`) — se resuelve en el
  momento de generar el reporte, no antes.
- Cosas que **parecen** copias y no lo son: `organizacion.js:75,80` traen
  `p.nombre AS responsable_nombre` / `AS pagado_por_nombre` — son alias de un
  `JOIN` calculados al vuelo, no columnas guardadas. `mensajes.js:121,123` arma
  un objeto `mensaje.nombre` con una `SELECT` fresca justo antes de mandar el
  push del chat, pero **no lo guarda**: la tabla `mensaje` no tiene columna
  `nombre` (`INSERT INTO mensaje (conversacion_id, persona_id, texto,
  adjunto_url, adjunto_tipo)`, sin nombre). Ninguno de los dos es un problema.

Así que corregir el nombre en sí **es barato**: una columna más en un esquema
zod que ya existe (`perfilSchema` en `directorio.js`), sobre una tabla que ya
lo permite (`persona.nombre TEXT NOT NULL`, sin restricción de formato).

## Las copias denormalizadas — búsqueda completa

Se buscó todo patrón `%_nombre` como columna guardada (no alias de `JOIN`) y
todo `INSERT`/`UPDATE` que meta un nombre de persona dentro de un campo de
texto libre. Resultado:

### 1. `aprobacion_log.actor_nombre` — sí es una copia, y hay que sincronizarla

Cuando el pastor aprueba o rechaza una fecha, `eventos.js:208-213`
(`registrarAprobacion`) guarda el nombre del actor **en el momento**, en una
columna dedicada:

```
actor_nombre  TEXT,   -- db.js:194
```

Esta tabla alimenta el historial que el pastor consulta en
`GET /historial/aprobaciones` (`eventos.js:216-220`), mostrando ese nombre tal
cual quedó guardado. Si la persona corrige su nombre después, el historial
seguiría enseñando el nombre viejo — **es exactamente el tipo de copia que
este spec debe evitar que se pudra**.

El proyecto ya reconoció este mismo hueco una vez: `cuenta.js:189-190`, al
anonimizar una cuenta eliminada, hace
`UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?`. Es el
precedente directo: **si al borrar una cuenta se sincroniza esta copia, al
corregirle el nombre también hay que sincronizarla** — mismo mecanismo, un
valor distinto.

### 2. `notificacion.titulo` / `notificacion.texto` — encontrado, fuera de alcance a propósito

Muchos módulos escriben el nombre de una persona dentro del texto de un aviso
en el momento de crearlo (ejemplos: `directorio.js:126` — *"🎂 Hoy cumple
Juan"* —, `musica.js:207-208` — *"Te toca tocar"* con el nombre del músico en
el título del evento —, `admin.js:172-174` — *"Nuevo rol asignado"*). Son
copias reales, y de hecho `cuenta.js:191-195` ya las limpia (por patrón
`LIKE`) al eliminar una cuenta.

**Se deja fuera de este spec, a propósito:** una notificación es un aviso de
lectura única, no un registro que alguien vuelva a consultar semanas después
como el directorio o un impreso — el problema que trae este spec es justo
"queda así para siempre", y una notificación no se queda así para siempre, se
marca leída y se olvida. Además el nombre casi nunca está solo en una columna
limpia: viene mezclado dentro de una frase (*"🎵 Te toca tocar"*, *"Nuevo rol
asignado"*), así que "corregirlo" significaría reescribir frases completas en
docenas de sitios para un beneficio que dura, como mucho, un par de días.

### 2-bis. `nino.familia` — encontrado, fuera de alcance (decidido el 8 ago 2026)

La ficha del niño tiene **dos** textos libres, y esta spec solo razonó sobre
uno. El que sí entra es `autorizados` (*"Ana (mamá), Carlos (papá)"* —
se mira en la puerta de la sala). El otro es `familia`, y durante un mes
quedó sin decidir: ni entre los sitios que se buscan, ni aquí.

**Queda fuera, y el motivo es lo que de verdad se guarda ahí:** `familia` es
el *apellido* de la familia — `'Gomez'`, `'Ruiz'` en el seed —, y el frontend
lo pinta como `Familia ${x.familia}` (`web/app.js:3148`), con el `placeholder`
"Familia" en su campo. No es un nombre de persona. La búsqueda del aviso es un
`LIKE` del **nombre completo viejo** (*"Rosa Diaz"*), que en un apellido suelto
no cabe: mirar ahí sería una consulta que casi siempre devuelve cero, y las
veces que no, sería por un tocayo.

Fijado con un test que se pone rojo si alguien amplía el `LIKE`
(`corregir-nombre-apariciones.test.js`, *"decidido: el aviso NO mira
nino.familia"*), verificado por mutación. **Si algún día `familia` pasa a
usarse para escribir nombres completos de los padres, esta decisión caduca** —
y el sitio donde mirarlo es el `placeholder` del campo, no esta línea.

### 3. `auditoria.detalle` — encontrado, fuera de alcance por diseño

Todas las llamadas a `auditar()` que mencionan a una persona lo hacen dentro
de una frase libre ya formada: `` `${nombre} (${usuario})` `` en
`admin.js:73`, `` `${p.nombre}` `` en `admin.js:110`, `` `${persona.nombre}
(${inst}) en ${ev.titulo}` `` en `musica.js:210`. **No se toca**, por la misma
razón que ningún otro dato reescribe la auditoría histórica cuando cambia:
editar el título de un evento no reescribe las entradas viejas de
`auditoria.detalle` que lo mencionan por su título anterior, y no debería —
un registro de auditoría documenta lo que era verdad *en ese momento*. Tratar
el nombre de una persona distinto rompería esa regla sin necesidad.

### Conclusión

**Una sola copia denormalizada por sincronizar de verdad:**
`aprobacion_log.actor_nombre`. Es una columna limpia (solo el nombre, nada
más), tiene precedente de sincronización en el propio código, y el costo es
una línea de SQL igual a la que ya existe en `cuenta.js`.

### Un hueco de esta búsqueda, y por qué no cambia la conclusión

*(Añadido el 31 jul 2026, al revisar el plan.)*

La búsqueda se hizo por columnas con patrón `%_nombre`. **Ese patrón no
encuentra las columnas que se llaman por su papel en vez de por su tipo**, y
hay tres así: `predica.predicador` y `sermon.predicador` (`db.js:334` y `431`),
y `nino.autorizados` (`db.js:297`), las tres `TEXT`.

Se comprobaron, y **no son copias de `persona.nombre`**: el formulario las
rellena con un `<input>` de texto libre (`app.js:2631`, con el marcador de
posición *"Quién predicó"*), no con un selector de personas. Pueden nombrar a
un predicador invitado que no tiene cuenta en la app. Sincronizarlas sería
incorrecto — no hay ninguna relación que sincronizar.

⚠️ **Consecuencia asumida, y conviene tenerla escrita porque va a parecer un
fallo:** si alguien escribió "juan perez" en el campo Predicador de una prédica
y después corrige su nombre a "Juan Pérez", **la prédica sigue diciendo "juan
perez"** — incluido en el **portal público**, que muestra ese campo
(`publico.js:96`). No está roto: es texto libre, y se arregla editando esa
prédica. Si algún día se quiere que el predicador sea una *persona* y no un
texto, es un cambio de modelo aparte.

**El tercero, `nino.autorizados`** (`db.js:297`) — la lista de quién puede
retirar a un niño, añadida el mismo día 31 jul. Misma comprobación y mismo
resultado: es un `<input>` de texto libre de **300 caracteres**
(`ninos.js:57`/`74`, `app.js:2501`, con el marcador de posición *"Ej. Ana Rojas
(abuela), Juan Pérez (papá)"*), no un selector de personas — y **tiene que
serlo**, porque la abuela que va a buscar al niño normalmente no tiene cuenta
en la app. No es una copia de `persona.nombre`, así que la conclusión no
cambia: no se sincroniza.

⚠️ **Pero tiene la misma propiedad de "va a parecer un fallo", y aquí duele
más:** corriges tu nombre a "Juan Pérez" y **la ficha del niño sigue
autorizando a "juan perez"** — y esa lista es la que se mira **en la puerta de
la sala**, al entregar a un niño. Se arregla editando la ficha (el módulo ya
tiene editar, desde ese mismo día). Cualquier futuro "autorizados como
personas" es el mismo cambio de modelo que el del predicador.

## Quién puede corregir — lo que la app ya hace en casos parecidos

Se repasaron los tres módulos relevantes:

- **`cuenta.js`** (lo mío, sobre mí): correo y contraseña, cada quien los
  cambia sin permiso especial — solo sesión propia. Contraseña exige la
  actual; correo no exige nada más que estar logueado.
- **`directorio.js`** (lo mío, sobre mí): teléfono, correo, foto, cumpleaños y
  los toggles de privacidad — mismo patrón, autoservicio puro, sin
  intervención de nadie más. `perfilSchema` ni siquiera menciona `nombre`
  hoy: es el hueco exacto que faltaba llenar.
- **`admin.js`** (el pastor, sobre otros): activar/desactivar cuenta, marcar
  pastor, asignar/quitar roles, y — el caso más parecido a este —
  **restablecer la contraseña de otro** (`POST /usuarios/:id/clave`). El
  comentario que justifica esa ruta es exactamente el argumento que aplica
  aquí: *"Sin SMTP configurado, quien olvida su clave queda fuera de la app
  para siempre (…) Aquí el pastor genera una clave temporal"*
  (`admin.js:114-120`). Es el precedente de "alguien no puede resolverlo
  solo, y el pastor lo ayuda", ya construido y ya probado
  (`admin-reset-password.test.js`).

La regla que el proyecto repite en cinco módulos distintos — *"el pastor
observa, el encargado edita"* (`auth.js:266`, `ninos.js:17`, `musica.js:11`,
`tesoreria.js:19`) — **no aplica directamente aquí**: esa regla es sobre
módulos con un encargado designado (Escuela Dominical, Música, Tesorería). El
nombre de una persona no es un módulo con encargado; es un dato de identidad,
como el teléfono o el correo, que hoy son autoservicio puro.

### El hueco real en el derecho ARCO

El diseño de consentimiento legal (`docs/superpowers/specs/2026-07-23-consentimiento-legal-arco-design.md:103`)
afirma:

> **Rectificación** — ya existe (editar perfil en Directorio / cuenta en
> Ajustes): solo se enlaza/menciona.

**Esto es falso para el nombre**, verificado leyendo `perfilSchema`
(`directorio.js`) y los esquemas de `cuenta.js`: ninguno de los dos acepta
`nombre`. La promesa ARCO de "rectificación por autoservicio" está rota en el
único dato que más se nota cuando está mal — el nombre propio. Este spec
cierra ese hueco, y de paso corrige la afirmación en el spec ARCO.

## Decisiones tomadas

| Decisión | Elegido | Descartado |
|---|---|---|
| Quién corrige el **propio** nombre | **Cualquiera, desde "Mi perfil"** (autoservicio) — mismo lugar y mismo patrón que teléfono/correo/foto | Pedírselo al pastor cada vez: cuello de botella para el caso más común (typo propio), y contradice el autoservicio ya establecido para el resto de la identidad |
| Quién corrige el nombre de **otro** | **El pastor (o super-admin)**, desde Admin > Usuarios, solo dentro de su iglesia — mismo mecanismo que "Restablecer contraseña" | Cualquier líder de grupo: sin precedente (los líderes gestionan el módulo, no la identidad de las personas) · el obispo: es solo-lectura en todo el sistema (`auth.js`, `modulosVisibles` excluye `admin` del rol obispo) — no debe ganar una excepción aquí |
| Copias denormalizadas a sincronizar | **Solo `aprobacion_log.actor_nombre`** | `notificacion.titulo/texto` y `auditoria.detalle`: texto libre ya compuesto en frases, no una columna limpia; y no son datos que "queden así para siempre" (ver arriba) |
| Rastro | **Sí, con `auditar()`**, en los dos caminos, con el nombre viejo y el nuevo en el detalle — el nombre no es un dato sensible como una clave, así que no hay problema en dejarlo en el log | Historial visible de "nombres anteriores" en la ficha de la persona: nadie lo pidió, y añade una pantalla nueva para un caso raro |
| Límite de largo | **120 caracteres** (nuevo) | Sin límite: es lo que hace hoy `crearUsuarioSchema` para el alta, pero un nombre absurdamente largo rompe el layout de tarjetas del directorio |
| Vacío permitido | **No** (`min(1)`) — el nombre es obligatorio, igual que en el alta | Permitir vaciarlo como se puede vaciar el teléfono: el nombre no es un dato opcional, es la clave de cómo te ve el resto de la iglesia |

## Qué ve la gente

### "Mi perfil" (Directorio) — corregir el propio nombre

Un campo más, junto a Teléfono y Correo, en la pantalla que ya existe
(`vistaPerfilDirectorio`, `web/app.js:2842-2868`). Sin confirmación especial:
es autoservicio, igual que el resto de esa pantalla.

### Admin > Usuarios — el pastor corrige el nombre de otro

Un botón más junto a "🔑 Restablecer contraseña" en cada fila de usuario
(`renderAdmin`, `web/app.js:3040-3044`), del tipo "✏️ Corregir nombre". Abre
un cuadro de texto (no el `prompt()` del navegador — el proyecto ya evita esa
ventanita gris a propósito) prellenado con el nombre actual, se escribe el
nuevo y se guarda. No hace falta doble confirmación: no es una acción
destructiva, es corregir un dato.

No aparece para las cuentas de sistema (super-admin / obispo), igual que
"Restablecer contraseña" ya no aparece ahí.

## Forma técnica

Dos rutas existentes, ampliadas — **sin rutas nuevas**:

| Endpoint | Qué gana |
|---|---|
| `PATCH /api/directorio/perfil` | acepta `nombre` (opcional) en `perfilSchema`; solo puede cambiar el propio |
| `PATCH /api/admin/usuarios/:id` | acepta `nombre` (opcional) en `editarUsuarioSchema`; solo el pastor/super-admin, solo dentro de su iglesia |

Ambas rutas, al guardar un `nombre` nuevo:

1. `UPDATE persona SET nombre = ? WHERE id = ?`.
2. Sincronizan la copia: `UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?`
   (mismo patrón que `cuenta.js:189-190`, con el nombre nuevo en vez de
   `'Usuario eliminado'`).
3. `auditar(iglesia_id, actor_id, accion, modulo, 'nombre viejo → nombre nuevo')`.

**Sin migración.** `persona.nombre` ya existe y ya es `TEXT NOT NULL` sin
restricción de formato (`db.js:39`).

### Aislamiento entre iglesias

`PATCH /api/admin/usuarios/:id` **ya** resuelve la persona acotada por
iglesia en la misma consulta (`personaDeIglesia(id, ig)`, `admin.js:78-80`,
usado por la ruta desde `admin.js:89`) y **ya** excluye cuentas de sistema
(`admin.js:98-99`). No hay guardia nueva que escribir: basta con añadir
`nombre` al `editarUsuarioSchema` y al cuerpo del handler existente —
heredando ambas protecciones gratis.

`PATCH /api/directorio/perfil` solo puede tocar `req.user.persona_id`
(la propia sesión): no recibe ningún id ajeno por parámetro, así que no hay
superficie de fuga entre iglesias que cerrar ahí.

## Rastro

Los dos caminos llaman a `auditar()`:

- Propio: `auditar(iglesia_id, persona_id, 'corregir_nombre', 'directorio', 'juan perez → Juan Pérez')`.
- Pastor sobre otro: `auditar(iglesia_id, actor_id, 'corregir_nombre_usuario', 'admin', 'juan perez → Juan Pérez')`.

A diferencia de `reset_password_usuario` (que nunca guarda la clave en el
log), aquí **sí** se guarda el valor: un nombre no es secreto, y saber qué
decía antes y qué dice ahora es justo lo que hace útil la auditoría.

## Privacidad y ARCO

El nombre no es un dato que se pueda ocultar (a diferencia de teléfono/correo,
que tienen su propio toggle `mostrar_*`): es la identidad pública dentro de
la iglesia, se ve en el directorio, las asistencias y los impresos por
diseño. Corregirlo no cambia esa visibilidad, solo su exactitud.

Esto **completa** — no añade — la Rectificación que el spec ARCO
(`2026-07-23-consentimiento-legal-arco-design.md`) ya prometía como
"autoservicio". Conviene actualizar ese documento para que dejar de decir que
la rectificación de nombre "ya existe" cuando este spec se implemente.

## Cómo se prueba

Suite de siempre (`node:test`, `backend/test/`):

- una persona corrige su propio nombre y **no** cambia el de nadie más;
- el mismo cambio, hecho por el pastor sobre **otra** persona de su iglesia;
- un pastor de **otra** iglesia recibe **404** al intentarlo sobre alguien
  ajeno (no cambia nada);
- el pastor **no puede** corregir el nombre de super-admin/obispo (403, igual
  que ya pasa con el reseteo de contraseña);
- alguien sin rol de pastor recibe **403** al intentarlo desde Admin;
- nombre vacío → 400 en castellano; nombre de 121+ caracteres → 400 en
  castellano;
- corregir el nombre **sincroniza** `aprobacion_log.actor_nombre` en las filas
  donde esa persona es `actor_id`, y **no** toca las de otras personas;
- corregir el nombre queda **auditado**, con el nombre viejo y el nuevo en el
  detalle.

Y comprobación en **navegador real** con Playwright: el campo nuevo sale en
"Mi perfil" y guarda · el botón "Corregir nombre" sale en Admin > Usuarios
(y no en las cuentas de sistema) · el cuadro de texto viene prellenado con el
nombre actual · sin errores de consola.

## Riesgo conocido

**Las notificaciones ya entregadas seguirán mostrando el nombre viejo.** Un
push que ya llegó al teléfono de alguien no se puede reescribir a distancia;
es coherente con que se decidiera dejar `notificacion` fuera de alcance
arriba, pero conviene decirlo explícito: si alguien pregunta "¿por qué la
notificación de ayer todavía dice mi nombre mal escrito?", la respuesta es
"porque ya se envió, y solo las de aquí en adelante saldrán bien".

**Un desacuerdo entre la persona y el pastor sobre cuál es "el nombre
correcto"** no tiene arbitraje técnico: gana quien lo edite después. No es un
problema que el software deba resolver — si ocurre en la práctica, es una
conversación entre personas, no un bug.

## Decidido por el dueño (31 jul 2026)

Las tres preguntas que este spec dejó abiertas, resueltas:

1. **¿El pastor corrige el nombre de cualquiera de su iglesia, sin más
   condición?** → **Sí, uno mismo y el pastor**, tal como lo propone la tabla de
   decisiones. Mismo alcance que "Restablecer contraseña", que tampoco pregunta
   si la persona "de verdad" no puede sola. Se descarta limitarlo a cuentas
   inactivas: añadiría una comprobación sin precedente en `admin.js` y dejaría
   fuera casos reales (quien entró una vez y no volvió).
2. **¿120 caracteres de tope?** → **Sí, se acepta.** Nadie de la congregación se
   acerca a ese largo, y sin tope un nombre absurdo rompe las tarjetas del
   directorio. Si algún día hiciera falta, subirlo es cambiar un número.
3. **¿Texto de ayuda en el botón del pastor?** → **No.** El botón vive junto a
   "Restablecer contraseña", que tampoco lo explica; añadirlo solo a este
   rompería la coherencia de esa pantalla. Que quede el rastro de `auditar()`
   como red, que es lo que de verdad protege.
