# Quién puede retirar a cada niño — Diseño

**Fecha:** 30 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado; listo para plan de implementación

## De qué se trata

Termina la Escuela Dominical. Un adulto que la maestra no conoce dice *"vengo por
la Sofi"*. **La maestra no tiene dónde mirar quién puede retirar a Sofía.**

La mitad de atrás de esa función ya está construida y nadie lo sabía:

- La columna **`nino.autorizados`** existe (`backend/src/db.js:297`).
- El servidor **ya la acepta y la guarda** al inscribir un niño
  (`backend/src/ninos.js:59,62,64-65`).
- El frontend **no la menciona ni una vez** — verificado: `0` coincidencias de
  `autorizados` en `web/app.js`.

Es un cajón con la etiqueta puesta y vacío. Este documento diseña la mitad de
adelante.

### Lo que cambió hoy y reduce el alcance

Esta misma jornada se **retiró la asistencia de niños** (decisión del dueño: la
iglesia no pasa lista). Con ella se fue `asistencia_nino.retiro_por`, o sea
**quién se llevó al niño ese domingo**.

Consecuencia honesta: lo que queda es **una lista que la maestra consulta en la
puerta**, no un registro de retiros. Si el papá pregunta el domingo siguiente
*"¿con quién se fue?"*, la app sigue sin poder responder. Sigue valiendo la pena
—hoy no hay ni dónde mirar quién está autorizado— pero es la mitad de lo que la
propuesta original prometía, y conviene no venderlo como más.

### El respaldo legal ya existe, y es lo que empuja

La autorización que **los padres ya firman** dice literalmente
(`legal/consentimientos.md:133`):

> *Nombre y datos de contacto de los padres/apoderados y de personas autorizadas
> para retirarlo.*

Es decir: **la iglesia ya se comprometió por escrito a recoger ese dato y no lo
está recogiendo.** Esto no es una función bonita; es cerrar la distancia entre lo
que el documento promete y lo que el sistema hace.

## El bloqueo que había que quitar antes

`ninos.js` **solo tiene rutas de crear**. Verificado: sus seis rutas son dos
`GET` de lectura y cuatro `POST`. No hay ni un `PATCH` ni un `DELETE` en todo el
módulo — ni para niños, ni para clases, ni para lecciones.

Una lista de autorizados que no se puede corregir sirve de poco, porque **es justo
el dato que cambia**: la abuela se muda, los padres se separan, alguien se
equivoca al teclear. Por eso el alcance incluye poder editar y borrar un niño.

## Decisiones tomadas (30 jul 2026)

| Decisión | Elegido | Descartado |
|---|---|---|
| Alcance del módulo | **Campo nuevo + editar y borrar niño** | solo el campo; editar todo el módulo (clases y lecciones también) |
| Formato del dato | **Texto libre en una línea** | lista de filas nombre+parentesco; lo mismo más teléfono |
| Borrar un niño con historial | **Borra también su historial**, en transacción | bloquear el borrado; marcarlo inactivo |

Sobre el **formato**: se queda como texto libre porque la columna ya lo es (no hay
que tocar la base de datos), se llena rápido en el móvil y se lee de un vistazo en
la puerta. Se acepta el costo: nadie garantiza que se escriba igual siempre.

Sobre el **teléfono**: descartado a propósito. La autorización firmada lo cubriría,
pero es guardar el contacto de terceros que nunca firmaron nada. Nombre y
parentesco bastan para el propósito.

## Qué ve la gente

### En la ficha de cada niño de la clase

Una línea más, junto a las alergias y la familia:

> 🤝 **Puede retirarlo:** Ana Rojas (abuela), Juan Pérez (papá)

Si está vacío, no se pinta nada (no ensuciar la tarjeta con huecos).

### Al inscribir o corregir

El formulario de niño gana un campo **"Quién puede retirarlo"**, con una ayuda
corta que diga qué se espera: *nombre y parentesco*. Junto a cada niño de la
lista, dos botones nuevos:

- **Editar** — abre el mismo panel del alta, ya relleno, y guarda los cambios
  (nombre, edad, familia, alergias, autorizados). Es el patrón que ya usan otros
  módulos: el panel de crear se reutiliza para editar.
- **Borrar** — **doble confirmación**, avisando de que se va también su historial
  de asistencia y que no se puede deshacer.

### Quién puede

Sin cambios de permisos, se respeta lo que el módulo ya hace
(`ninos.js:13-25`): ver el módulo, la encargada de Escuela Dominical, el pastor y
el obispo; **editar, solo la encargada** (`soloEncargado` / `esLiderEdEstricto`).
El pastor observa.

### Fuera de alcance, a propósito

No se registra quién retiró al niño (se fue con la asistencia) · no se editan ni
borran clases ni lecciones · no se guarda teléfono ni RUT de los autorizados · no
se avisa a nadie cuando cambia la lista.

## Forma técnica

Dos rutas nuevas en `backend/src/ninos.js`, ambas con `soloEncargado`:

| Endpoint | Qué hace |
|---|---|
| `PATCH /api/ninos/ninos/:id` | corrige nombre, edad, familia, alergias, autorizados |
| `DELETE /api/ninos/ninos/:id` | borra el niño **y** sus asistencias históricas |

*(La ruta lleva `ninos/ninos` porque el router se monta en `/api/ninos` y el
recurso ya se llama `/ninos` — mismo prefijo que el `POST` que ya existe. Feo,
pero cambiarlo rompería el alta que ya funciona.)*

**Sin migración:** `autorizados` ya existe en la tabla. No se toca `db.js`.

### Tres cosas que hay que clavar

Son las que ya mordieron antes en este proyecto:

1. **Aislamiento entre iglesias.** `PATCH` y `DELETE` reciben un id crudo de la
   URL. Hay que resolver el niño **acotado por la iglesia de quien pide**
   (`WHERE id = ? AND iglesia_id = ?`), no comprobarlo después. Es exactamente el
   fallo que el 30 de julio se encontró en `musica.js`, donde borrar una canción
   vaciaba el orden del servicio de **otra** congregación porque filtraba una
   línea más tarde. Si el niño no es de tu iglesia: **404**, no 403.
2. **Auditoría.** Hallazgo del 30 de julio: **en este módulo no se audita nada**.
   Lo único que se auditaba era la asistencia, y se fue con ella; crear una clase,
   inscribir un niño o subir una lección nunca dejaron rastro. Borrar la ficha de
   un menor **sí** debe auditarse (`auditar()`, como hacen los demás módulos), y
   editarla también.
3. **La transacción del borrado.** Primero las asistencias, luego el niño, dentro
   de un `BEGIN`/`COMMIT` con `ROLLBACK` en el `catch`. Sin eso, un fallo a medias
   deja asistencias huérfanas apuntando a un niño que ya no existe. El orden
   importa: `asistencia_nino.nino_id` referencia `nino(id)`, así que borrar el
   niño primero revienta con `FOREIGN KEY constraint failed`.

### Validación (zod, vía `validar()`)

- Mismos campos y mismos límites que el `ninoSchema` que ya existe
  (`ninos.js:51-58`); el `PATCH` los acepta todos opcionales.
- `autorizados`: texto opcional, con tope de largo (**máximo 300 caracteres**: son
  dos o tres nombres con su parentesco, no un relato).
- Mensajes en castellano **dentro del esquema**, que es de donde el middleware los
  toma desde el 30 de julio. En zod 4 el parámetro es `error`, **nunca `errorMap`**.

## Privacidad

Los nombres de los autorizados son **datos de terceros que nunca firmaron nada**
—la abuela no es usuaria de la app—, y se refieren al cuidado de un menor. Tres
consecuencias de diseño, todas ya recogidas arriba:

- **Minimización:** nombre y parentesco, nada más. Ni teléfono, ni RUT, ni dirección.
- **El respaldo lo da la autorización firmada por los padres**
  (`legal/consentimientos.md:133`), que menciona expresamente a estas personas.
- **Nadie fuera del módulo lo ve:** el guardia de `ninos.js` ya limita a encargada,
  pastor y obispo, y no hay ninguna exportación de esta pantalla.

Al borrar una iglesia entera, `eliminarIglesia.js` limpia `nino` sola, por su
recorrido dinámico de claves foráneas: no hay hueco que tapar ahí.

## Cómo se prueba

Suite de siempre (`node:test`, `backend/test/`):

- editar un niño cambia lo que debe y **no** toca lo que no se mandó;
- **un encargado de OTRA iglesia recibe 404** al editar y al borrar (la prueba que
  protege el punto 1);
- el pastor recibe **403** al editar (solo observa);
- borrar un niño **con** asistencias históricas se lleva las dos cosas, y no deja
  filas huérfanas en `asistencia_nino`;
- borrar un niño **sin** historial funciona igual;
- editar y borrar quedan **auditados**;
- un `autorizados` larguísimo → 400 en castellano.

Y comprobación en **navegador real** con Playwright: que la línea "Puede retirarlo"
sale en la ficha, que editar viene relleno y guarda, que borrar pide doble
confirmación y quita al niño de la lista, y que no salen errores de consola.

## Riesgo conocido

**Esto no dice quién se llevó al niño**, solo quién puede. Si alguien espera lo
primero —y el nombre "retiro seguro" lo sugiere—, se llevará una decepción. Si en
uso real hace falta el registro de retiros, hay que reabrir la decisión de haber
quitado la asistencia de niños, porque es donde vivía ese dato.
