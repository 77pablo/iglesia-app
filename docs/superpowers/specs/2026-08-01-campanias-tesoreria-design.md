# Campañas de tesorería: que se puedan usar, y que cuadren con los libros

**Fecha:** 1 de agosto de 2026
**Estado:** diseño aprobado por el dueño, pendiente de plan de implementación

---

## El problema

El tesorero abre la sección **🎯 Campañas**, lee el texto que le explica para qué
sirve —*"Una campaña sirve para juntar para algo concreto —el techo, un viaje
misionero— y ver cuánto falta"*— y **no hay ningún botón**. Ni para crear una, ni
para registrar un aporte.

El backend sí las soporta: `POST /tesoreria/campanias` y
`PATCH /tesoreria/campanias/:id/aportar` existen, están validadas y protegidas
con `soloTesorero`. Lo único que se llama desde `web/app.js` es la lectura
(`web/app.js:2418`). La interfaz anuncia una función que no existe.

## Y un problema de fondo que hay que resolver antes

La tabla es `campania(id, iglesia_id, nombre, meta, recaudado)` y la ruta de
aportar hace literalmente `recaudado = recaudado + monto`. **No crea ningún
movimiento.**

Si esto se conectara tal cual, el tesorero registraría $50.000 para el techo y
esa plata subiría en la barra de la campaña **sin aparecer en Movimientos ni en
Transparencia**. Dos contabilidades que no cuadran entre sí, en la pantalla del
dinero. Es la clase de cosa que hace desconfiar de toda la app.

## Decisiones del dueño

1. **Un aporte es plata que entra a la iglesia y va en los libros.** Se registra
   como un ingreso normal, marcado con su campaña. Se descartó dejarlo como
   marcador aparte (deja dos números que pueden no cuadrar) y se descartó
   preguntárselo al tesorero cada vez (le traslada una decisión contable que la
   app debería tener resuelta, y basta un error para descuadrar los libros).

2. **Un aporte se puede borrar**, y al borrarlo desaparece también su ingreso.
   Sin esto, un `$500.000` tecleado en lugar de `$50.000` se quedaría para
   siempre — y ahora además dentro de los libros. Se acotó **a los aportes de
   campaña**: hacer borrable cualquier movimiento es más coherente pero es otro
   trabajo, y toca una pantalla que hoy funciona.

3. **Una campaña se cierra, no se borra.** Deja de aceptar aportes y baja a una
   sección de cerradas. Borrarla entera dejaría los ingresos en los libros —es
   plata que existe— pero huérfanos de su etiqueta, y se perdería el historial de
   para qué se juntó.

## El modelo de datos

Dos columnas nuevas, las dos aditivas con `agregarColumna()` de
`backend/src/db.js:567`:

- **`movimiento.campania_id INTEGER`** — a qué campaña pertenece este ingreso.
  `NULL` en todos los movimientos normales.
- **`campania.cerrada_en TEXT`** — cuándo se cerró. `NULL` = activa.

### `campania.recaudado` deja de usarse

El total de una campaña **se calcula** sumando los ingresos que la referencian:

```sql
SELECT COALESCE(SUM(monto), 0) FROM movimiento
 WHERE campania_id = ? AND iglesia_id = ? AND tipo = 'ingreso'
```

Esto es lo que hace **imposible** que la barra y los libros discrepen: no hay dos
números que mantener sincronizados, hay uno derivado del otro.

La columna `recaudado` se queda en la tabla pero **el código de la app deja de
leerla y de escribirla**. La única excepción es la migración de abajo, que la lee
**una vez** para no perder un saldo anterior si lo hubiera. Quitar la columna no
aporta nada y `ALTER TABLE ... DROP COLUMN` es un riesgo que este cambio no
necesita. Tiene que quedar un comentario en el esquema diciendo que está muerta,
o alguien la leerá dentro de un año creyendo que dice la verdad.

### El relleno de lo que ya existiera

Como la función nunca se pudo usar desde la interfaz, es casi seguro que **no hay
ninguna campaña en producción**. Pero eso **no está comprobado** —no hay acceso a
esa base de datos— así que la migración no puede darlo por hecho.

Para cada campaña con `recaudado > 0`, la migración crea un ingreso por ese
importe con su `campania_id`, para que esa plata no desaparezca de la barra al
pasar al cálculo derivado. Ese movimiento es `tipo = 'ingreso'`, con
`creado_por = NULL` —no lo registró ninguna persona— y con la descripción exacta
**«Saldo anterior de la campaña»**, para que nadie lo confunda con un aporte que
alguien anotó.

⚠️ Su `fecha` será la del día de la migración, no la del dinero real, porque esa
fecha no se guardó en ninguna parte. No se puede hacer mejor con los datos que
hay, pero **la descripción tiene que dejarlo claro**: un movimiento fechado hoy
por dinero de hace meses confundiría a cualquiera que revise las cuentas.

⚠️ **Ese relleno va DENTRO de la guarda de existencia de la columna**, igual que
`migrarAnonimizadaEn` y `migrarEstadoContactoPublico`. Fuera de la guarda correría
en cada arranque y duplicaría los ingresos en cada reinicio.

La función se exporta, como las otras dos, para que una prueba pueda llamarla dos
veces y demostrar que la segunda no hace nada.

## Las rutas

Todas con `iglesia_id` **en la misma consulta** y **404** —no 403— a una campaña
de otra iglesia. Las de escritura mantienen `soloTesorero` y `limiterSensible`,
como las que ya existen.

| Ruta | Qué hace |
|---|---|
| `GET /tesoreria/campanias` | Devuelve cada campaña con su total **calculado**, su `cerrada_en` y sus aportes (fecha, importe, id del movimiento) |
| `POST /tesoreria/campanias` | Crea. `nombre` pasa a llevar `.max(100)`: hoy no tiene tope |
| `PATCH /tesoreria/campanias/:id/aportar` | **Crea un ingreso** con `campania_id`, en una transacción. Rechaza si la campaña está cerrada |
| `DELETE /tesoreria/campanias/:id/aportes/:movimientoId` | Borra el movimiento, en una transacción. Solo si pertenece a esa campaña y a esa iglesia |
| `PATCH /tesoreria/campanias/:id/cerrar` | Marca `cerrada_en` |

**Aportar a una campaña cerrada se rechaza en el servidor**, no solo escondiendo
el botón: la ruta se puede llamar directamente.

Se auditan con `auditar()` (`backend/src/auth.js:191`) las cuatro escrituras:
crear, aportar, borrar un aporte y cerrar. Borrar dinero sin dejar rastro de
quién lo hizo no es aceptable en la pantalla de la tesorería.

## La pantalla

En la tarjeta 🎯 Campañas de `web/app.js` (hoy alrededor de `:2433`):

- **`+ Campaña`**, solo para el tesorero (`esTesoreroUI()`, que ya se usa en esa
  misma pantalla para los botones de ingreso y gasto).
- Cada campaña activa: nombre, total y meta, barra, **`+ Aporte`**, la lista de
  sus aportes con fecha e importe y un botón de borrar en cada uno, y
  **`Cerrar campaña`**.
- **Las cerradas**, en una sección aparte debajo, con su fecha de cierre y sin
  botones de acción.
- Quien no es tesorero lo ve todo **sin botones**, igual que hoy ve los
  movimientos en solo lectura.

### Dos detalles que salen de leer el código actual

**Una campaña sin meta.** `meta` es opcional (`campaniaSchema`), y el código de
hoy pintaría `$50.000 / $0` con una barra al 0%, que se lee como un error. Sin
meta se muestra solo lo juntado, sin barra ni porcentaje.

**El nombre de la campaña en la lista de Movimientos.** Un ingreso de campaña
tiene que mostrar de qué campaña es. Ese nombre se obtiene con un **join**, no
copiándolo a la columna `categoria`. Copiarlo crearía otra vez dos verdades que
mantener sincronizadas, que es justo el problema que este trabajo viene a
resolver.

## Errores y casos límite

- **Aportar y borrar son transacciones.** Si falla una parte no puede quedar el
  movimiento sin la campaña ni al revés.
- **Aportar a una campaña cerrada** → error claro, en el servidor.
- **Borrar un aporte que no es de esa campaña, o de otra iglesia** → 404.
- **Borrar un movimiento normal por esta ruta** → 404: la ruta solo alcanza
  movimientos con `campania_id` puesto. Un fallo aquí sería un agujero para
  borrar la contabilidad entera.
- **Campaña sin ningún aporte** → total 0, sin lista.

## Cómo se verifica

- **Por HTTP**, que es donde vive la lógica: crear, aportar, comprobar que **el
  ingreso aparece en `GET /movimientos` y en Transparencia**, borrarlo y
  comprobar que desaparece de los dos sitios y de la campaña.
- **Que el total de la campaña sale de los movimientos**: insertar un ingreso a
  mano con `campania_id` y ver que la campaña lo cuenta, sin haber pasado por
  `aportar`.
- **Aislamiento entre iglesias**: aportar, borrar y cerrar una campaña de otra
  iglesia → 404.
- **La migración, dos veces**: la segunda no cambia nada.
- **Que el `escHtml` del nombre sigue en su sitio.** Hay un barrido automático
  (`backend/test/xss-interpolaciones-atributo.test.js`) que exige que cualquier
  interpolación nueva en un atributo esté escapada o justificada.

## Lo que esto NO resuelve

- **Ningún movimiento normal se puede corregir ni borrar.** Es un problema real y
  más amplio de toda la tesorería, y se queda igual: el borrado que se añade aquí
  llega solo a los aportes de campaña. Decisión consciente del dueño para no
  tocar una pantalla que hoy funciona.
- **Una campaña cerrada no se puede reabrir.** Si hace falta, se crea otra.
- **`campania.recaudado` se queda muerta en la tabla.** Documentada, no borrada.
- **No hay informe por campaña** más allá de la lista de sus aportes.
