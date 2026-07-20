# Consentimientos — App de Iglesia

> **BORRADOR — no es asesoría legal.** Estos son textos base para recabar consentimiento dentro de
> la aplicación. Revísalos con un abogado antes de usarlos en producción, **especialmente los de
> datos biométricos (reconocimiento facial) y de menores de edad**, que en Chile reciben protección
> reforzada. Jurisdicción de referencia: **Chile** (Ley N° 19.628 sobre Protección de la Vida
> Privada y Ley N° 21.719 que crea la Agencia de Protección de Datos Personales y actualiza el marco
> de protección de datos). **Completa** todos los campos entre corchetes `[...]` antes de publicar
> estos textos, y actualiza la fecha de versión cada vez que los modifiques.

---

## 0) Principios generales del consentimiento en esta app

Todo consentimiento que se pida dentro de la aplicación debe cumplir con estas características:

- **Libre**: la persona lo otorga sin presión ni condicionamiento. Ninguna funcionalidad esencial de
  la app (por ejemplo, poder registrarse o asistir a actividades) puede depender de aceptar un
  consentimiento **opcional** como el facial o la difusión de fotos.
- **Informado**: antes de marcar la casilla, la persona ve un texto claro que explica **qué** dato se
  trata, **para qué**, **quién** es responsable y **cómo** puede ejercer sus derechos.
- **Específico**: cada finalidad tiene **su propia casilla**. No se agrupan finalidades distintas
  (por ejemplo, "tratamiento general" y "reconocimiento facial") bajo un solo "Acepto".
- **Inequívoco**: se expresa mediante una acción afirmativa clara (marcar una casilla, firmar). Las
  casillas **nunca vienen premarcadas**.
- **Revocable**: puede retirarse en cualquier momento, con una facilidad razonablemente equivalente a
  la de otorgarlo (ver sección 6).
- **Trazable**: la app debe **guardar registro** de qué se aceptó, cuándo, quién lo aceptó (titular o
  apoderado/a) y a qué **versión** de este documento corresponde. Ver la nota de implementación al
  final.

Estos principios aplican a los seis consentimientos siguientes.

---

## 1) Consentimiento para TRATAMIENTO GENERAL DE DATOS PERSONALES

Se presenta al crear la cuenta o el perfil de un miembro/usuario de la iglesia. Es la base de
tratamiento para los datos de contacto y de participación que la app necesita para funcionar.

**Encabezado sugerido en pantalla:**
> Autorización para el tratamiento de mis datos personales

**Texto:**
Declaro que he leído la **Política de Privacidad** de **[NOMBRE DEL RESPONSABLE / iglesia]** y que
autorizo, de forma **libre, informada y expresa**, el tratamiento de mis datos personales (tales
como nombre, correo electrónico, teléfono, dirección, fecha de nacimiento y datos de participación
en actividades) para las siguientes finalidades:

- Administrar mi registro como miembro, asistente o colaborador de la iglesia.
- Gestionar mi asistencia y participación en actividades, grupos y ministerios.
- Contactarme por los medios que indique (correo, teléfono, notificaciones de la app) para fines
  administrativos y pastorales.
- Elaborar estadísticas internas de participación, sin fines comerciales.

Entiendo que:
- El responsable del tratamiento es **[NOMBRE DEL RESPONSABLE / iglesia]**.
- Mis datos **no se venden ni se ceden a terceros** con fines comerciales.
- Puedo ejercer mis derechos de **acceso, rectificación, cancelación y oposición** (derechos ARCO)
  sobre mis datos escribiendo a **[CORREO DE CONTACTO — PENDIENTE]**.
- El detalle completo del tratamiento está en la **Política de Privacidad**, disponible en la app.
- Este consentimiento es **necesario** para usar la aplicación; los consentimientos de las secciones
  2, 4 y 5 son **independientes y opcionales**.

☐ **Acepto** el tratamiento de mis datos personales para las finalidades descritas arriba.

*Nombre: __________  ·  RUT: __________  ·  Fecha: __________  ·  Firma / aceptación en app: __________*

---

## 2) Consentimiento para RECONOCIMIENTO FACIAL (dato biométrico)

El dato biométrico recibe protección especial en la legislación chilena. Este consentimiento debe
pedirse **por separado** del consentimiento general y **nunca** puede ser condición para usar la app.

**Encabezado sugerido en pantalla:**
> Activar reconocimiento facial para el registro de asistencia (opcional)

**Texto:**
Autorizo de forma **libre, expresa y voluntaria** a **[NOMBRE DEL RESPONSABLE / iglesia]** a capturar
y tratar una **representación matemática de mi rostro** (dato biométrico, conocido técnicamente como
"plantilla" o "template" facial) con la **única finalidad** de registrar automáticamente mi
asistencia a las actividades de la iglesia.

Entiendo y acepto que:
- Esta función es **completamente opcional**. Si no la activo, puedo registrar mi asistencia de
  forma **manual** (por ejemplo, con mi nombre, un código o un escaneo de lista) sin ninguna
  desventaja ni restricción de acceso a la app o a las actividades.
- Lo que se guarda es una **representación matemática** derivada de mi rostro, **no una fotografía**
  que pueda reutilizarse o compartirse como imagen.
- Este dato se usa **exclusivamente** para comparar y confirmar mi identidad al momento de marcar
  asistencia; **no** se usa para otros fines (por ejemplo, vigilancia, evaluación o perfiles).
- Mi dato biométrico se almacena de forma cifrada y con medidas de seguridad reforzadas, según se
  describe en la Política de Privacidad.
- Puedo **retirar este consentimiento** y solicitar la **eliminación** de mi registro facial en
  cualquier momento, sin necesidad de justificar el motivo, escribiendo a
  **[CORREO DE CONTACTO — PENDIENTE]** o desde la configuración de mi cuenta en la app.
- Si retiro este consentimiento, mi plantilla facial se elimina y la app pasa automáticamente al
  registro manual de asistencia.
- Si soy menor de edad, este consentimiento debe ser otorgado por mi padre/madre/apoderado/a (ver
  sección 3).

☐ **Acepto** que se capture y trate mi rostro (dato biométrico) para el control de asistencia.

*Nombre: __________  ·  RUT: __________  ·  Fecha: __________  ·  Firma / aceptación en app: __________*

*(Si la persona es menor de edad, este consentimiento se otorga como sub-casilla dentro de la
sección 3, con la firma del padre/madre/apoderado/a).*

---

## 3) Autorización de PADRE, MADRE O APODERADO/A (datos de niños, niñas y adolescentes)

Aplica a los datos de menores que participan en actividades como la Escuela Dominical, grupos
infantiles o de adolescentes. Debe ser aceptado por el padre, madre o apoderado/a legal, no por el
menor.

**Encabezado sugerido en pantalla:**
> Autorización para el registro de mi hijo/a o pupilo/a

**Texto:**
Yo, **[nombre completo del padre/madre/apoderado/a]**, RUT **[RUT del apoderado/a]**, en mi calidad
de padre, madre o apoderado/a legal de **[nombre completo del niño/a o adolescente]**, RUT o fecha de
nacimiento **[dato del menor]**, autorizo a **[NOMBRE DEL RESPONSABLE / iglesia]** a tratar los datos
personales de mi hijo/a o pupilo/a que sean necesarios para su participación y cuidado en las
actividades infantiles y juveniles (por ejemplo, Escuela Dominical, grupos de niños o de
adolescentes), que pueden incluir:

- Nombre completo y fecha de nacimiento.
- Registro de asistencia a las actividades.
- Datos de salud relevantes para su cuidado (por ejemplo, **alergias**, condiciones médicas o
  indicaciones especiales).
- Nombre y datos de contacto de los padres/apoderados y de personas autorizadas para retirarlo.

Entiendo y acepto que:
- Estos datos se usan **exclusivamente** para el cuidado, la seguridad y la organización de las
  actividades en las que participa mi hijo/a o pupilo/a.
- Puedo **acceder, corregir, actualizar o solicitar la eliminación** de estos datos en cualquier
  momento, escribiendo a **[CORREO DE CONTACTO — PENDIENTE]**.
- El tratamiento de estos datos se rige por la **Política de Privacidad** de la aplicación.
- Puedo retirar esta autorización en cualquier momento; esto puede implicar que mi hijo/a o pupilo/a
  deje de estar registrado en el sistema de gestión de actividades infantiles.
- Las sub-casillas opcionales de reconocimiento facial y fotografías (más abajo) son
  **independientes** de esta autorización general y puedo marcarlas o no sin afectar la
  participación de mi hijo/a en las actividades.

☐ **Autorizo** el registro y tratamiento de los datos de mi hijo/a o pupilo/a descritos arriba
   (incluye asistencia y datos de salud relevantes como alergias).

**Autorizaciones adicionales (opcionales):**

☐ *(Opcional)* Autorizo el **reconocimiento facial** de mi hijo/a o pupilo/a para el control de
   asistencia, entendiendo que aplican las mismas condiciones descritas en la sección 2 (dato
   biométrico, retirable en cualquier momento, alternativa manual siempre disponible).

☐ *(Opcional)* Autorizo el **uso de fotografías** de mi hijo/a o pupilo/a para **uso interno** de la
   app (materiales del grupo, avisos a los padres del mismo grupo).

☐ *(Opcional)* Autorizo la **difusión de fotografías** de mi hijo/a o pupilo/a en los **canales
   públicos de la iglesia** (redes sociales, boletines, sitio web) — *marcar solo si se está de
   acuerdo con este uso más amplio*.

Entiendo que puedo marcar la autorización general sin marcar ninguna de las opcionales, y que puedo
retirar cualquiera de ellas por separado en el futuro.

*Nombre del apoderado/a: __________  ·  RUT: __________  ·  Relación con el menor: __________
Fecha: __________  ·  Firma: __________*

---

## 4) Consentimiento para USO DE FOTOGRAFÍAS E IMÁGENES

Aplica a personas adultas. Para menores de edad, el consentimiento equivalente está integrado en la
sección 3.

**Encabezado sugerido en pantalla:**
> Uso de mis fotografías e imágenes

**Texto:**
Autorizo a **[NOMBRE DEL RESPONSABLE / iglesia]** a usar fotografías, videos o imágenes en las que
aparezco, tomadas durante actividades de la iglesia, para los fines que marque a continuación. Cada
finalidad es independiente y puedo aceptar una, ambas o ninguna:

☐ **Uso interno**: dentro de la aplicación y materiales internos de la iglesia (por ejemplo,
   álbumes de grupo, avisos, presentaciones internas), visibles solo para miembros registrados.

☐ **Difusión pública**: en los **canales de la iglesia** abiertos al público (redes sociales,
   sitio web, boletines impresos o digitales, publicidad de actividades).

Entiendo que:
- Puedo aceptar el uso interno sin aceptar la difusión pública, o viceversa.
- Puedo **retirar** esta autorización en cualquier momento, escribiendo a
  **[CORREO DE CONTACTO — PENDIENTE]**. El retiro aplica a **usos futuros**; no siempre es posible
  eliminar materiales ya publicados o distribuidos por terceros antes del retiro (por ejemplo,
  boletines impresos ya entregados o publicaciones ya compartidas por otras personas).
- No marcar ninguna casilla no me impide participar en las actividades de la iglesia ni usar la app.

*Nombre: __________  ·  RUT: __________  ·  Fecha: __________  ·  Firma / aceptación en app: __________*

---

## 5) Consentimiento para COMUNICACIONES (notificaciones push y avisos)

Aplica al envío de notificaciones y avisos a través de la app (notificaciones push, y opcionalmente
correo o WhatsApp si la app los usa).

**Encabezado sugerido en pantalla:**
> Recibir notificaciones y avisos de la iglesia

**Texto:**
Autorizo a **[NOMBRE DEL RESPONSABLE / iglesia]** a enviarme **notificaciones push** y avisos a
través de la aplicación sobre:

- Recordatorios de actividades, cultos o reuniones en las que estoy inscrito/a o participo.
- Avisos generales de la iglesia (cambios de horario, eventos, campañas).
- Comunicaciones administrativas relacionadas con mi participación (por ejemplo, confirmaciones de
  registro).

Entiendo que:
- Puedo **desactivar** estas notificaciones en cualquier momento desde la configuración de la app
  (**Ajustes → Notificaciones**) o escribiendo a **[CORREO DE CONTACTO — PENDIENTE]**, sin que esto
  afecte mi acceso a la app ni mi participación en la iglesia.
- Desactivar las notificaciones no elimina otros datos ni consentimientos ya otorgados; solo detiene
  el envío de avisos.
- Algunas comunicaciones estrictamente necesarias para el funcionamiento del servicio (por ejemplo,
  avisos de seguridad de la cuenta) pueden no depender de este consentimiento, si así se indica en la
  Política de Privacidad.

☐ **Acepto** recibir notificaciones push y avisos de la iglesia a través de la aplicación.

*Nombre: __________  ·  Fecha: __________  ·  Aceptación en app: __________*

---

## 6) Retiro de consentimientos y registro de versiones

Cualquiera de los consentimientos anteriores puede **retirarse en cualquier momento**, con una
facilidad equivalente a la de haberlo otorgado. Para retirar uno o más consentimientos:

1. Desde la app: **Ajustes → Privacidad y consentimientos**, donde cada finalidad aparece por
   separado con su estado actual (aceptado / no aceptado) y un botón para retirarlo.
2. Por correo, escribiendo a **[CORREO DE CONTACTO — PENDIENTE]**, indicando el consentimiento que
   se desea retirar y los datos de identificación del titular (o del apoderado/a, si corresponde).

El retiro de un consentimiento **opcional** (reconocimiento facial, fotografías, notificaciones) no
afecta el acceso a la app ni la participación en las actividades de la iglesia, salvo por la función
específica asociada a ese consentimiento (por ejemplo, al retirar el consentimiento facial, la app
pasa al registro manual de asistencia).

El retiro del consentimiento general de tratamiento de datos (sección 1) puede implicar la
imposibilidad de mantener una cuenta activa en la app, ya que ese tratamiento es necesario para su
funcionamiento básico; en ese caso se informará a la persona qué ocurrirá con sus datos y se
procederá conforme a la Política de Privacidad.

Para cada consentimiento aceptado, la aplicación registra internamente:

- Identidad del titular (o del apoderado/a que consintió en su nombre).
- Fecha y hora de aceptación.
- **Versión** de este documento de consentimientos vigente al momento de aceptar.
- Fecha y hora de retiro, si corresponde.

Este documento fue actualizado por última vez el **[FECHA]**. Ante cambios sustanciales en las
finalidades descritas, se solicitará **nuevamente** el consentimiento correspondiente a los usuarios
ya registrados.

---

> **Nota de implementación en la app:**
> - Cada consentimiento se presenta con **su propia casilla independiente**, nunca premarcada.
> - Ninguna funcionalidad esencial de la app puede quedar bloqueada por no aceptar un consentimiento
>   **opcional** (facial, fotografías, notificaciones).
> - El **reconocimiento facial** (secciones 2 y 3) **no debe poder activarse** en ningún caso sin que
>   la casilla correspondiente haya sido marcada explícitamente por el titular o su apoderado/a.
> - Al aceptar cualquier consentimiento, la app debe guardar: identificador del usuario/apoderado,
>   **fecha y hora**, y la **versión** de este documento vigente en ese momento.
> - La pantalla de **Ajustes → Privacidad y consentimientos** debe listar todos los consentimientos
>   otorgados, con su fecha, y permitir **retirarlos individualmente** con la misma facilidad con que
>   se otorgaron.
> - Si se modifica sustancialmente alguno de estos textos, se debe incrementar la versión y volver a
>   solicitar el consentimiento afectado a los usuarios existentes.
