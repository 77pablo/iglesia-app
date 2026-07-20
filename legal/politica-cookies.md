# Política de Cookies y Almacenamiento Local — App de Iglesia

> **BORRADOR — no es asesoría legal.** Este documento es una plantilla redactada a partir de cómo
> funciona realmente la aplicación. Antes de publicarlo para uso real, **revísalo con un abogado**
> en Chile, donde aplican la **Ley N° 19.628** sobre protección de la vida privada y la
> **Ley N° 21.719** (nueva ley de protección de datos personales y su Agencia). Este documento debe
> leerse junto con la [Política de Privacidad](./politica-privacidad.md) de la aplicación.
>
> **Completar antes de publicar** los campos marcados con `[…]`.

*Última actualización: [FECHA]*

**Responsable:** [NOMBRE DEL RESPONSABLE / iglesia]
**Contacto:** [CORREO DE CONTACTO — PENDIENTE]

---

## 1. Qué son las cookies y el almacenamiento local (explicado simple)

Cuando usas una página web o una aplicación desde tu navegador (Chrome, Safari, Firefox, Edge,
etc.), el navegador puede guardar pequeños datos en tu propio dispositivo —tu computador, celular
o tablet— para "recordar" cosas entre una visita y otra. Existen varias formas técnicas de hacer
esto, y todas suelen agruparse bajo el nombre genérico de **"cookies"**, aunque no todas son cookies
en sentido estricto:

- **Cookies** (en sentido estricto): pequeños archivos de texto que el navegador envía de vuelta al
  servidor en cada solicitud. Son la tecnología clásica, usada sobre todo por sitios web
  tradicionales para publicidad y rastreo.
- **`localStorage`** ("almacenamiento local"): un espacio de almacenamiento dentro del propio
  navegador, exclusivo de cada sitio web, que **no se envía automáticamente al servidor**. Solo lo
  lee la propia aplicación cuando la usas. Es la tecnología que usa principalmente esta app.
- **Caché de aplicación (Service Worker / Cache API)**: un mecanismo que permite que la aplicación
  guarde copias de sus propios archivos (pantallas, código, estilos) en tu dispositivo, para que la
  próxima vez cargue más rápido y pueda funcionar aunque tengas poca o nula conexión a internet.
  Esto es lo que permite que la app funcione como **PWA** (aplicación web progresiva), es decir,
  que puedas "instalarla" en tu celular o computador y usarla de forma parecida a una app nativa.

En resumen: **no todo lo que un navegador guarda en tu dispositivo es una "cookie de rastreo"**.
Esta política explica, de forma clara, **qué guarda esta aplicación, para qué y cómo puedes
eliminarlo**.

## 2. Aclaración importante: esta app NO usa cookies de rastreo ni de publicidad

Queremos ser explícitos sobre esto, porque es la duda más común:

- Esta aplicación **no usa cookies de publicidad**.
- Esta aplicación **no usa cookies ni herramientas de rastreo de terceros** (no hay Google
  Analytics, Facebook Pixel, redes publicitarias, ni similares).
- Esta aplicación **no vende ni comparte tu información de navegación con terceros con fines
  comerciales**.
- Todo lo que se guarda en tu navegador tiene un **propósito funcional**: que puedas iniciar
  sesión sin escribir tu contraseña cada vez, que la app recuerde tus preferencias de pantalla, y
  que puedas seguir usando ciertas funciones aunque tengas mala conexión.

## 3. Qué guarda exactamente esta aplicación en tu navegador

La siguiente tabla detalla, de forma completa, todo lo que esta aplicación puede llegar a guardar
en tu dispositivo:

| Nombre / tipo de dato | Tecnología | Finalidad | Duración | ¿Es imprescindible? |
|---|---|---|---|---|
| **Token de sesión (JWT)** | `localStorage` | Mantener tu sesión abierta para que no tengas que volver a escribir tu usuario y contraseña cada vez que entras | Hasta que cierres sesión, borres los datos del sitio, o el token expire por seguridad | **Sí**, imprescindible para poder usar la app estando "conectado" |
| **Preferencias de apariencia** (tema claro/oscuro/automático, color de acento, tamaño de texto) | `localStorage` | Recordar cómo prefieres ver la app, para no tener que configurarla de nuevo cada vez | Hasta que las cambies o borres los datos del sitio | No es imprescindible; mejora la experiencia de uso |
| **Devocionales / notas descargadas para leer sin conexión** | `localStorage` | Permitirte leer contenido (por ejemplo, un devocional) aunque no tengas internet en ese momento, solo si tú decides descargarlo | Hasta que la elimines manualmente o borres los datos del sitio | No es imprescindible; es una función opcional que activas tú |
| **Caché de la aplicación (archivos de la interfaz: HTML, JS, CSS, íconos)** | Service Worker + Cache API | Que la app cargue más rápido en próximas visitas y siga funcionando (al menos parcialmente) con poca o nula conexión, como corresponde a una **PWA** | Se renueva automáticamente cuando se publica una nueva versión de la app; puede borrarse manualmente | No es imprescindible para el funcionamiento básico, pero es necesario para el **modo offline** y la instalación como PWA |
| **Suscripción a notificaciones push** | API del navegador (Push API), asociada a `localStorage`/registro del Service Worker | Poder enviarte avisos (por ejemplo, recordatorios de reuniones) si tú activaste las notificaciones | Hasta que desactives las notificaciones o borres los datos del sitio | No es imprescindible; solo existe si tú activaste las notificaciones |

**Importante:** esta app **no guarda las respuestas de la API (tus datos personales, mensajes,
información de tesorería, etc.) en la caché del Service Worker**, ni los archivos que subes. La
caché del Service Worker solo guarda el "esqueleto" técnico de la aplicación (el código de la
interfaz), no tu información. Tus datos personales viajan al servidor mediante conexión cifrada
(HTTPS) y se almacenan según lo descrito en la Política de Privacidad.

## 4. Tecnologías usadas en detalle

### 4.1 `localStorage` (almacenamiento local del navegador)

Es un espacio de almacenamiento propio de cada sitio web dentro del navegador. A diferencia de las
cookies clásicas, **no se envía automáticamente al servidor** en cada solicitud: solo la propia
aplicación, cuando la tienes abierta, puede leer o escribir en ese espacio. En esta app se usa para
guardar el token de sesión, tus preferencias de apariencia y, si tú lo decides, contenido descargado
para leer sin conexión.

### 4.2 Service Worker y Cache API

Un **Service Worker** es un pequeño programa que el navegador ejecuta "de fondo", separado de la
página que estás viendo. Permite que la app intercepte las solicitudes de red y decida si responde
con una copia guardada localmente (más rápido, y funciona sin conexión) o si va a buscar la versión
más reciente al servidor. La **Cache API** es el almacén donde el Service Worker guarda esas copias.
Esta combinación es la que permite que la aplicación funcione como **PWA**: que puedas "instalarla"
en la pantalla de inicio de tu celular o computador y que abra rápido incluso con mala señal.

Esta app **no usa cookies clásicas de sesión** para mantenerte conectado: usa el token guardado en
`localStorage`, tal como se explica en el punto 3.

## 5. Cookies y servicios de terceros

Aunque esta aplicación no usa cookies de publicidad ni rastreo propio, al cargarla se comunican con
tu navegador algunos **servicios externos** necesarios para su funcionamiento técnico:

| Servicio de terceros | Qué hace | Qué implica para ti |
|---|---|---|
| **Google Fonts** | Sirve las tipografías (letras) que usa la interfaz de la app | Al cargar la página, tu navegador solicita esas tipografías a servidores de Google, que puede recibir tu **dirección IP** como parte de esa solicitud técnica (algo normal en cualquier solicitud de internet). Google no recibe tus datos de la iglesia ni tu contraseña por esta vía |
| **Servicio de notificaciones push del navegador** (Google/Firebase Cloud Messaging para Android/Chrome, Apple Push Notification service para iPhone/Safari, Mozilla para Firefox) | Entrega las notificaciones push a tu dispositivo cuando la app las activa | Este servicio es operado por el fabricante de tu navegador o sistema operativo, no por la iglesia ni por esta app. Solo se activa **si tú diste permiso** para recibir notificaciones. Puedes desactivarlo cuando quieras (ver punto 7) |
| **Render** (proveedor de hosting del backend) | Aloja el servidor donde corre la aplicación | No instala cookies de rastreo en tu navegador; es la infraestructura donde vive la app. Ver más detalles en la Política de Privacidad |

Ninguno de estos servicios se usa para mostrarte publicidad ni para perfilarte comercialmente.

## 6. Base legal del uso de estas tecnologías

El uso de `localStorage` y de la caché del Service Worker se basa en que son **estrictamente
necesarios** para el funcionamiento de la aplicación que tú decidiste usar: sin el token de sesión
no podrías mantenerte conectado, y sin la caché de la PWA no habría modo offline. Para funciones
opcionales, como las **notificaciones push**, el uso se basa en tu **consentimiento expreso**, que
otorgas al activar esa función desde tu navegador o dispositivo, y que puedes retirar en cualquier
momento. En ningún caso se usan estas tecnologías con fines de publicidad o perfilamiento comercial
que requieran un consentimiento adicional bajo la normativa chilena.

## 7. Cómo gestionar o eliminar esta información

Tienes control total sobre lo que se guarda en tu propio dispositivo. Puedes hacerlo de varias
formas:

### 7.1 Dentro de la aplicación

- **Cerrar sesión**: elimina el token de sesión guardado (`localStorage`) desde la propia app, sin
  necesidad de tocar la configuración del navegador.
- **Desactivar notificaciones**: puedes desactivar las notificaciones push desde los ajustes de la
  app o desde los permisos del navegador/sistema operativo.
- **Borrar contenido descargado offline**: si descargaste devocionales o notas para leer sin
  conexión, puedes eliminarlos manualmente desde la app cuando ya no los necesites.

### 7.2 Borrar los datos del sitio desde el navegador

Esto elimina **todo** lo guardado por la app en tu dispositivo (sesión, preferencias, caché offline)
y equivale a "empezar de cero" la próxima vez que entres.

| Navegador | Cómo borrar los datos del sitio |
|---|---|
| **Google Chrome** (computador o Android) | Ícono de candado o "i" junto a la dirección web → *Configuración del sitio* (o *Permisos del sitio*) → *Borrar datos*. También: Menú (⋮) → *Configuración* → *Privacidad y seguridad* → *Borrar datos de navegación* → seleccionar *Cookies y otros datos de sitios* y/o *Imágenes y archivos almacenados en caché*, filtrando por el sitio de la app si tu versión lo permite |
| **Safari en iPhone / iPad** | *Ajustes* del iPhone → *Safari* → *Avanzado* → *Datos de sitios web* → buscar el sitio de la app → *Eliminar*. Alternativamente: *Ajustes* → *Safari* → *Borrar historial y datos de sitios web* (esto borra de **todos** los sitios, no solo esta app) |
| **Safari en Mac** | Menú *Safari* → *Ajustes* (o *Preferencias*) → pestaña *Privacidad* → *Gestionar datos de sitios web* → buscar el sitio de la app → *Eliminar* |
| **Mozilla Firefox** | Ícono de candado junto a la dirección → *Borrar cookies y datos del sitio*. También: Menú (☰) → *Configuración* → *Privacidad y seguridad* → *Cookies y datos del sitio* → *Gestionar datos* → buscar el sitio → *Eliminar* |
| **Microsoft Edge** | Ícono de candado junto a la dirección → *Permisos para este sitio* → *Borrar datos*. También: Menú (⋯) → *Configuración* → *Cookies y permisos del sitio* → *Administrar y eliminar cookies y datos del sitio* → buscar el sitio → *Eliminar* |
| **App instalada como PWA** (ícono en pantalla de inicio) | Al ser una PWA, sus datos suelen gestionarse desde los ajustes de la app en el sistema operativo: en Android, *Ajustes → Apps → [nombre de la app] → Almacenamiento → Borrar datos*; en iOS, desinstalar y volver a instalar la PWA suele limpiar sus datos locales |

## 8. Consecuencias de desactivar o borrar estos datos

Es tu decisión borrar esta información cuando quieras, pero es bueno que sepas qué pasará después:

- **Si borras el token de sesión o cierras sesión**: deberás **volver a iniciar sesión** con tu
  usuario y contraseña la próxima vez que uses la app. No perderás ninguna información guardada en
  el servidor (tus datos, mensajes, registros de la iglesia, etc.), solo tendrás que autenticarte
  de nuevo.
- **Si borras las preferencias de apariencia**: la app volverá a mostrarse con la configuración
  predeterminada (por ejemplo, tema automático) hasta que la ajustes de nuevo.
- **Si borras la caché de la aplicación / datos del sitio**: perderás el contenido descargado para
  leer sin conexión y, además, la app **dejará de poder funcionar en modo offline** hasta que
  vuelvas a cargarla con internet disponible, momento en el cual el Service Worker reconstruirá la
  caché automáticamente.
- **Si desactivas las notificaciones push**: dejarás de recibir avisos y recordatorios enviados
  desde la app (por ejemplo, sobre reuniones o eventos), pero podrás seguir usando todas las demás
  funciones con normalidad.
- **Si bloqueas completamente `localStorage` o los Service Workers** en tu navegador (algunos
  navegadores lo permiten desde su configuración de privacidad avanzada), es posible que la
  aplicación **no funcione correctamente** o no pueda mantenerte con la sesión iniciada.

En ningún caso borrar estos datos locales elimina tu cuenta ni tu información dentro de la
aplicación: esa información vive en el servidor y se gestiona conforme a la Política de Privacidad,
no mediante el borrado de datos del navegador.

## 9. Cambios a esta política

Podemos actualizar esta Política de Cookies y Almacenamiento Local cuando cambien las tecnologías
usadas por la aplicación (por ejemplo, si en el futuro se incorporan nuevos servicios de terceros).
Publicaremos la versión vigente con su fecha de actualización al inicio de este documento.

## 10. Contacto

Si tienes dudas sobre esta política, sobre qué se guarda en tu navegador, o quieres solicitar ayuda
para eliminar esta información, escríbenos a: **[CORREO DE CONTACTO — PENDIENTE]**.
