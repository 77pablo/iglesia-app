# 📜 Documentos legales — índice

> **Los 5 documentos son BORRADORES, no asesoría legal.** Están redactados como plantillas a partir
> del funcionamiento real de la app, pensadas como punto de partida. **Antes de publicarlos o usarlos
> con feligreses reales, deben revisarse con un abogado**, especialmente en lo relativo a **datos
> biométricos (reconocimiento facial)**, **datos de menores de edad** (Escuela Dominical) y **datos
> sensibles** (participación/creencias religiosas, cuidado pastoral, tesorería).
>
> Jurisdicción de referencia: **Chile** — aplican principalmente la **Ley N° 19.628** sobre
> protección de la vida privada y la **Ley N° 21.719**, que establece el nuevo marco de protección de
> datos personales y crea la Agencia de Protección de Datos Personales (entrada en vigencia gradual,
> a verificar al momento de publicar estos documentos).

Los 5 documentos viven en `legal/` (carpeta gestionada por otro agente/rama; este índice solo los
describe y no los edita).

## Los 5 documentos

| Documento | Archivo | Propósito |
|---|---|---|
| **Aviso Legal** | `legal/aviso-legal.md` | Identifica al responsable de la app, las condiciones de acceso y uso, obligaciones del usuario, propiedad intelectual, límites de responsabilidad (incluida la advertencia de persistencia de datos en el plan free de Render) y ley/jurisdicción aplicable. |
| **Política de Privacidad** | `legal/politica-privacidad.md` | El documento más extenso (20 secciones): qué datos se tratan, de dónde vienen, finalidades, base de licitud, tratamiento de datos sensibles y de menores, datos biométricos (reconocimiento facial), plazos de conservación, encargados/destinatarios, transferencias internacionales, medidas de seguridad, derechos ARCO y cómo ejercerlos. |
| **Términos y Condiciones de Uso** | `legal/terminos-y-condiciones.md` | Regula la relación contractual con cada persona usuaria: cuentas, uso aceptable y conductas prohibidas, contenido del usuario, notificaciones push, disponibilidad/mantenimiento, suspensión de cuentas y derechos irrenunciables del consumidor. |
| **Política de Cookies** | `legal/politica-cookies.md` | Explica en lenguaje simple qué guarda la app en el navegador (token de sesión JWT, preferencias de apariencia, devocionales offline, caché del Service Worker para la PWA, suscripción push) y aclara que **no** usa cookies de rastreo ni de publicidad ni de terceros. |
| **Consentimientos** | `legal/consentimientos.md` | Textos base para pedir consentimiento **específico y separado** por finalidad: tratamiento general de datos, reconocimiento facial (biométrico), datos de menores (Escuela Dominical), y otras finalidades opcionales. Define los principios de consentimiento libre/informado/específico/inequívoco/revocable/trazable que deben cumplir todas las casillas de la app. |

## Placeholders pendientes de completar

Todos los documentos comparten los mismos campos entre corchetes `[…]`, que deben completarse con la
información real **antes de publicar** cualquiera de ellos:

- **`[NOMBRE DEL RESPONSABLE / iglesia]`** — razón social o nombre de la entidad responsable del
  tratamiento (aparece en los 5 documentos).
- **`[RUT DEL RESPONSABLE]`** — RUT de dicha entidad (aviso legal, términos, consentimientos).
- **`[DIRECCIÓN, Temuco, Chile]`** — domicilio del responsable (aviso legal, privacidad, términos).
- **`[CORREO DE CONTACTO — PENDIENTE]`** — correo para ejercer derechos ARCO y consultas legales
  (los 5 documentos).
- **`[FECHA]`** — fecha de "última actualización"/entrada en vigencia de cada documento (los 5
  documentos; se actualiza también cada vez que se modifique el contenido).
- **`[CIUDAD, ej. Temuco]`** — ciudad para efectos de jurisdicción/tribunales competentes (aviso
  legal, términos).

Mientras existan campos sin completar, los documentos **no deben considerarse vigentes ni
vinculantes** (aclarado explícitamente en el encabezado de Términos y Condiciones).

## Nota para quien continúe este trabajo

- Los 5 documentos ya reflejan correctamente el diseño actual de la app: aislamiento **multi-iglesia**
  (cada iglesia como responsable de sus propios datos), roles y permisos, reconocimiento facial
  **opcional**, y la advertencia sobre **persistencia de datos** mientras el hosting esté en el plan
  free de Render (ver `ESTADO.md`).
- Antes de publicar, además de completar los placeholders, conviene verificar que la descripción de
  tratamientos siga coincidiendo con la app en producción — en particular si se agregan nuevas
  funcionalidades con datos personales, como el **Directorio de miembros + cumpleaños** (ver la
  sección correspondiente en `ESTADO.md`): la foto de perfil y la visibilidad de teléfono/correo por
  persona deberían quedar cubiertas explícitamente en la Política de Privacidad y, si corresponde, en
  un nuevo bloque de `legal/consentimientos.md`.
- Ningún documento de `legal/` reemplaza la revisión de un abogado; son un punto de partida para
  acelerar esa revisión, no un sustituto de ella.
