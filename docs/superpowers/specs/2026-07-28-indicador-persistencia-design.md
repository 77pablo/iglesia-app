# Indicador de persistencia — Diseño

**Fecha:** 28 de julio de 2026
**Autor:** Pablo (con Claude Code)
**Estado:** aprobado en conversación; listo para plan de implementación
**Antecedente:** bloqueante #3 de la auditoría del 20 de julio (`ESTADO.md`), cerrado en código con Litestream + rclone pero **sin confirmar en Render**

## De qué se trata

Hoy, si la base de datos está siendo respaldada o no, es un dato que existe en un
solo sitio: una línea del log de arranque del contenedor. La app no lo sabe, no
lo muestra, y nadie lee los logs de Render a diario.

Eso convierte el fallo más caro del proyecto en el más silencioso. Si mañana
falta una de las cuatro variables, o una clave está mal copiada, todo se ve
perfectamente normal —la gente se registra, sube comprobantes, escribe en el
chat— hasta que un reinicio se lo lleva todo. No hay ningún momento en el que
alguien pueda enterarse a tiempo.

Este documento diseña el indicador que rompe ese silencio.

## El diagnóstico

`docker-entrypoint.sh` decide en el arranque del contenedor entre dos mundos:

```sh
if [ -n "$R2_BUCKET" ] && [ -n "$LITESTREAM_ACCESS_KEY_ID" ] && [ -n "$R2_ENDPOINT" ]; then
  ...
  exec litestream replicate -config /etc/litestream.yml -exec "node src/server.js"
else
  echo "[litestream] no configurado (faltan R2_*/LITESTREAM_*); arranque normal SIN persistencia externa"
  exec node src/server.js
fi
```

Dos respaldos distintos cuelgan de esa rama:

1. **La base de datos**, replicada en continuo por Litestream a Cloudflare R2.
2. **La carpeta de archivos subidos**, sincronizada cada 30 segundos por un bucle
   de `rclone` lanzado en segundo plano por el propio script.

Y hay un tercer estado que el script no distingue: que las variables estén
puestas **no significa que el respaldo esté ocurriendo**. Con una clave mal
copiada o un bucket mal escrito, Litestream arranca, falla al replicar, lo
escribe en su propio log y la app sigue como si nada.

Por eso el indicador **no puede limitarse a mirar las variables de entorno**. Un
indicador que diga "todo bien" porque las cuatro variables existen daría falsa
tranquilidad exactamente en el caso en que más importa saberlo, y sería peor que
no tener indicador: hoy al menos no hay nada que induzca a confiar.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Cómo enterarse | Tarjeta permanente **y** aviso activo | Un panel al que hay que entrar repite el fallo del log que nadie mira |
| Qué se comprueba | El respaldo **real** contra R2 | Mirar solo las variables miente justo cuando importa |
| Alcance | Base de datos **y** archivos subidos | Un comprobante de tesorería que desaparece también es pérdida de datos |

## Arquitectura

Cada subsistema se comprueba **como corresponde a su naturaleza**, y la asimetría
es deliberada:

| | Cómo se averigua | Cuándo dice "mal" |
|---|---|---|
| **Base de datos** | `litestream generations` contra `/etc/litestream.yml`, con tope de 3 s | El retraso pasa de **15 minutos**, el comando falla, o no hay ninguna generación |
| **Archivos subidos** | Un sello en disco que el bucle de `rclone` reescribe tras **cada** sincronización correcta | El sello tiene más de **5 minutos** (el bucle sincroniza cada 30 s) |

**Los números, y por qué esos.** El retraso de Litestream en marcha normal se mide
en segundos; 15 minutos es holgado a propósito, para que una R2 lenta o un pico de
escrituras no disparen una alarma que luego se aprende a ignorar. El sello de
uploads admite 5 minutos porque el bucle corre cada 30 s: diez ciclos perdidos
seguidos ya no son mala suerte. El resultado se **cachea 5 minutos**, así que
abrir el panel repetidamente no llama a R2 repetidamente.

**Periodo de gracia tras el arranque.** En el plan free el contenedor se detiene
al dormirse y el disco es efímero, así que al despertar **no hay sello** hasta que
el bucle complete su primera sincronización. Una comprobación en ese hueco vería
"nunca se ha respaldado" y avisaría por nada. Por eso, durante los primeros **3
minutos** de vida del proceso, la ausencia de sello es *desconocido* (ámbar), no
*mal*. Pasado ese margen, seguir sin sello sí es un fallo real.

A Litestream **se le pregunta** porque es un proceso vivo con estado, y su
respuesta refleja lo que de verdad llegó a R2: detecta la clave mala, el bucket
mal escrito y el bucket que dejó de responder.

Al bucle de uploads **no se le puede preguntar**: es un `while` de shell en
segundo plano, y si muere, muere en silencio — ni siquiera queda la línea del
arranque, porque el arranque sí fue correcto. Un sello que envejece es lo único
que lo delata. La alternativa (`rclone lsjson` sobre el bucket) no responde a la
pregunta que importa: dice qué hay guardado, no si el bucle sigue vivo; podría
llevar horas muerto y el listado se vería idéntico.

### Componentes

1. **`backend/src/persistencia.js`** (nuevo) — expone `estadoPersistencia()`, que
   devuelve los dos bloques con su estado, su marca de tiempo y su motivo. La
   **interpretación** se separa de la **obtención** y se expone como funciones
   puras (`interpretarGeneraciones(texto)`, `interpretarSello(fecha, ahora)`),
   que es lo que hace el módulo probable sin R2 ni contenedor.
2. **`docker-entrypoint.sh`** — una línea nueva: escribir la fecha en el sello
   tras cada `rclone sync` correcto.
3. **`GET /api/superadmin/persistencia`** — en `superadmin.js`, junto a las rutas
   de iglesias; solo `rol_global='super_admin'`, con el resultado cacheado 5
   minutos para no llamar a R2 en cada visita.
4. **Tarjeta en el panel del super-admin** — las dos filas y el "último respaldo:
   hace X".
5. **Vigilancia y aviso** — al detectar el paso de bien a mal, se crea la
   notificación.

### Tres estados, no dos

Además de "bien" y "mal" hace falta **"no aplica"**: en la máquina de desarrollo
no existe el binario de Litestream ni la carpeta `/data`, y ahí lo correcto es
decir "esta instancia no replica" en gris, no pintar una alarma roja en cada
arranque local. Un indicador que grita en desarrollo se ignora en producción.

Y para el aviso hace falta separar todavía otro caso: **"no pude comprobarlo"**
(el comando se colgó, el binario no responde) no es lo mismo que "sé que está
mal". Meterlos en el mismo saco genera el ruido que mata cualquier alarma: un
corte de red de tres segundos no es una pérdida de datos. Solo *sé que está mal*
dispara el aviso; *no pude saberlo* se pinta en ámbar y no avisa.

## Manejo de errores

- **Nunca tumba nada.** Mismo principio que ya sigue `push.js`: si la
  comprobación revienta, el endpoint responde igual, con el estado en
  "desconocido". Un fallo del indicador no puede convertirse en un fallo de la
  app.
- **El motivo que se muestra va saneado.** La salida de error de Litestream
  puede incluir el endpoint de R2 y trozos de credenciales. El frontend recibe un
  motivo corto y clasificado, **nunca el `stderr` crudo**. Sería absurdo cerrar
  la subida de archivos y abrir una fuga de secretos en el mismo día.
- **El comando es fijo**, no se construye con nada que venga del usuario.
- **Tope de tiempo** en la llamada a Litestream, para que una R2 que no responde
  no deje la petición colgada.

## El aviso

El aviso se crea como notificación cuando el estado **pasa** de bien a mal.

Dos obstáculos, con su solución:

**El super-admin no tiene campana.** Solo se le asigna el módulo `inicio`
(`auth.js`) y aterriza directo en su panel, mientras que la campana se rellena
desde la carga del dashboard. Hay que cablearla: sin eso, el aviso se escribiría
en una bandeja que nadie abre, que es el problema que este trabajo intenta
resolver.

**El aviso vive en la base de datos cuya pérdida intenta prevenir.** Si la BD es
efímera, el registro de "ya te avisé" se borra en cada reinicio, y en el plan
free los reinicios son frecuentes. Se resuelve con deduplicación **por día**,
reutilizando el mecanismo de `recordatorio_enviado` que ya usan los
recordatorios: en el peor caso, un aviso al día en vez de uno por reinicio. No
hay forma de hacerlo mejor sin almacenamiento externo, que es justo lo que falta
cuando el indicador está en rojo.

**Canal:** hoy no hay `SMTP_*` ni `VAPID_*` configuradas, así que el único canal
que funciona de verdad es el aviso dentro de la app. El diseño no cierra la
puerta a añadir correo cuando SMTP exista, pero no se construye ahora: sería
código que no se puede probar ni usar.

## Pruebas

La clave es que la **interpretación** sea pura y esté separada de la
**obtención**. Los tests le pasan salidas reales de Litestream guardadas como
texto fijo: sin contenedor, sin red, sin bucket.

**Interpretación:** retraso pequeño, retraso enorme, salida vacía (nunca
replicó), binario ausente, comando colgado, sello fresco, sello viejo, sello
inexistente, modo "no aplica", y **sello inexistente dentro del periodo de
gracia** (que debe dar *desconocido*, no *mal*).

**Comportamiento:** el endpoint da 403 a quien no es super-admin; el motivo
devuelto **no** contiene las credenciales; el aviso se crea **una** vez —dos
comprobaciones seguidas en mal estado no generan dos notificaciones, y caer,
recuperarse y volver a caer el mismo día tampoco.

**Lo que NO queda cubierto:** la línea nueva de `docker-entrypoint.sh` es shell
dentro del contenedor, y `node --test` no la alcanza. Se verifica al desplegar,
comprobando que la tarjeta pase a verde con una fecha real. Queda dicho aquí para
que nadie lo dé por probado.

## Fuera de alcance, a propósito

- **Correo de aviso**: sin `SMTP_*` no se puede probar ni usar (ver arriba).
- **Métricas Prometheus de Litestream** (`-addr`): cubrirían la BD pero no los
  uploads, y obligan a exponer un puerto interno. La pregunta directa a
  `litestream generations` da la misma respuesta sin eso.
- **Avisar a los pastores**: la pérdida de datos les afecta, pero no pueden
  hacer nada al respecto — solo el dueño toca las variables de Render. Avisarles
  sería alarma sin acción posible.
- **Respaldo manual bajo demanda** desde el panel: es otra funcionalidad, no un
  indicador.

## Criterio de éxito

Que el día en que la persistencia deje de funcionar, alguien se entere **ese
día** y no cuando ya perdió los datos.
