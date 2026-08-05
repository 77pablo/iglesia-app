# El push muere con la sesión — Diseño

**Fecha:** 4 de agosto de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado (4 ago 2026); listo para escribir el plan. Ver "Decidido por el dueño" al final.

## De qué se trata

Es el último hallazgo abierto de la auditoría del 3 de agosto: **el push cruzado
en dispositivo compartido** (`backend/src/push.js:70-72`). La suscripción push
pertenece al **navegador del dispositivo**, no a la cuenta, y hoy pasan dos
cosas en un dispositivo compartido (el PC de la iglesia, una tablet familiar):

1. **Cerrar sesión no corta el canal.** `salir()` (`web/app.js:301`) solo borra
   el token y recarga. Si Ana activó las notificaciones y cierra sesión, sus
   push —que pueden ser de cuidado pastoral o del chat— **siguen llegando a ese
   dispositivo**, a la vista de quien lo use después.
2. **El canal salta de persona en silencio.** Cuando Beto entra en ese mismo
   dispositivo, `pushAutoResuscribir()` (`web/app.js:4139`) corre solo —el
   permiso de notificaciones es del navegador, no de la cuenta— y el
   `ON CONFLICT(endpoint) DO UPDATE SET persona_id=excluded.persona_id`
   (`push.js:70-72`) reasigna el canal a Beto sin que nadie decida nada.

La ventana del daño es el punto 1: entre que Ana cierra sesión y otra persona
inicia la suya, todo lo de Ana se pinta en un dispositivo que ya no es suyo.

## La decisión: el push se corta al cerrar sesión

De los tres comportamientos posibles (cortar al salir · dejarlo como hoy y
documentarlo · avisar sin cortar), el dueño eligió **cortar al salir**. En un
dispositivo personal no se nota: `pushAutoResuscribir()` ya re-suscribe en
silencio al volver a entrar. En uno compartido, nadie ve lo de otro.

Y de los tres enfoques de construcción (corte en el cliente · corte en cliente
más un endpoint de baja sin sesión · sesiones con estado en el servidor), el
dueño eligió **corte en el cliente, servidor intacto**: el endpoint extra
compraría una limpieza que la poda por 404/410 ya hace gratis (`push.js:47`), y
las sesiones con estado exigirían una tabla que este proyecto (JWT sin estado)
no tiene.

## Comportamiento

- **Cerrar sesión corta el push del dispositivo.** En los tres llamadores de
  `salir()` —el botón del menú (`index.html:113`), la puerta de consentimiento
  (`app.js:407`) y el post-eliminar-cuenta (`app.js:4348`)— sin distinguirlos:
  baja en el servidor (`POST /push/baja`) + `unsubscribe()` en el navegador, y
  **recién después** se borra el token y se recarga.
- **Sesión caducada (401, `_sesionCaducada()`):** solo `unsubscribe()` local —
  el token ya no sirve para llamar a `/push/baja`. La fila huérfana del
  servidor la poda el mecanismo existente: al siguiente envío el push service
  responde 404/410 y `enviarPush` borra la fila (`push.js:47`).
- **Volver a entrar:** `pushAutoResuscribir()` no cambia. Consecuencia asumida
  (y que ya pasaba antes de este diseño): en un dispositivo cuyo navegador ya
  dio permiso, **cualquiera que inicie sesión queda suscrito en silencio** —
  pero ahora solo mientras su sesión viva, que es lo esperable.
- **El `ON CONFLICT` reasignador se queda.** Con el corte al salir, su único
  papel restante es la mitigación buena: si alguien abandona el dispositivo
  **sin** cerrar sesión, el login del siguiente le quita el canal en vez de
  dejárselo.

## Cambios concretos (solo `web/app.js`)

1. **Nuevo helper `pushCortarDispositivo({avisarServidor})`:** hace
   `getSubscription()`; si hay suscripción, llama a `/push/baja` con el
   endpoint (solo si `avisarServidor`, y con el fallo tragado: en el camino de
   eliminar-cuenta el token ya no autentica y esa llamada da 401) y luego
   `sub.unsubscribe()`. Si `pushSoportado()` es falso, retorna en seco. El
   helper **no** lleva timeout propio: eso lo decide cada llamador.
2. **`salir()` pasa a async:** envuelve la llamada al helper en un
   `Promise.race` con timeout de ~2 s —salir **nunca** se queda colgado
   esperando la red— y dentro de un `try/finally` cuyo `finally` hace
   `localStorage.removeItem('token'); location.reload();`, garantizando el
   logout pase lo que pase. Los `onclick="salir()"` existentes no cambian (una
   función async se invoca igual desde un onclick).
3. **`_sesionCaducada()`:** dispara `pushCortarDispositivo({avisarServidor:false})`
   **sin** `await` (fire-and-forget), y **antes** del early-return del arranque
   (`app.js:110`), para que también corte cuando se llega con un token viejo
   guardado.
4. **`desactivarPush()` se reescribe sobre el mismo helper** (con
   `avisarServidor:true`, sin `Promise.race` — ahí no hay recarga esperando —
   y conservando su toast y su `vistaAjustes()`), para no tener dos copias de
   la baja.

## Errores y casos borde

- **Sin red al salir:** `/baja` falla o vence el timeout → se sigue igual. El
  `unsubscribe()` del navegador no necesita al servidor; y si también fallara,
  la fila del servidor muere por 404/410 en el siguiente envío. Nada bloquea
  el logout.
- **Navegador sin soporte push** (sin serviceWorker/PushManager):
  `pushSoportado()` corta en seco y `salir()` queda como hoy.
- **Eliminar cuenta:** el servidor ya limpia `push_sub` en la transacción de
  `cuenta.js`; el `salir()` nuevo añade el `unsubscribe()` del navegador que
  faltaba, así el dispositivo tampoco queda con una suscripción muerta.
- **Varios 401 a la vez:** `_sesionCaducada()` ya se desduplica con
  `_avisandoSesion`; el corte fire-and-forget es idempotente (sin suscripción,
  `getSubscription()` da null y no hace nada).

## Testing

- **Backend intacto → sin tests nuevos de rutas.** `/push/baja` ya existe y ya
  borra solo la fila propia.
- **Candados de frontend** al estilo de los del menú: tests que leen
  `web/app.js` y asertan que (a) `salir()` pasa por `pushCortarDispositivo`
  y borra el token en un `finally`; (b) `_sesionCaducada()` llama al helper
  antes de su early-return; (c) `desactivarPush()` usa el helper (una sola
  copia de la baja). ⚠️ Con `\r?` antes de cada `\n` en los regex — lección
  CRLF de `ESTADO.md` (git materializa `web/app.js` con finales de línea de
  Windows).
- **Verificación manual con dos sesiones reales** (como en corregir-nombre,
  porque no hay banco de pruebas de navegador): activar push como A en un
  navegador, cerrar sesión, entrar como B en el mismo navegador, y comprobar
  con `/push/probar` que a ese dispositivo ya no llega nada dirigido a A.

## Riesgo residual, aceptado y anotado

**Quien abandona un dispositivo compartido sin cerrar sesión sigue filtrando
push hasta que otra persona entre.** Cortarlo desde el servidor exigiría
sesiones con estado (enfoque C, descartado), y ni eso lo cerraría del todo: el
permiso de notificaciones vive en el navegador. Si en uso real duele, la
conversación es reabrir el enfoque C, no parchar este.

## Decidido por el dueño

- El push **se corta al cerrar sesión** (no se documenta como riesgo ni se
  avisa sin cortar).
- Enfoque **A: corte en el cliente, servidor intacto** (sin endpoint de baja
  sin sesión, sin sesiones con estado).
- `pushAutoResuscribir()` queda como está: quien entra con permiso ya dado
  queda suscrito en silencio mientras dure su sesión.
- El riesgo residual del dispositivo abandonado sin cerrar sesión se acepta.
