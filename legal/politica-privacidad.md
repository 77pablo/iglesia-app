# Política de Privacidad — App de Gestión de Iglesia

> **BORRADOR — no es asesoría legal.** Este documento es una plantilla extensa redactada a partir
> de cómo funciona la aplicación, con fines de referencia y de punto de partida. **No sustituye la
> asesoría de un abogado.** Antes de publicarlo o de usarlo para uso real, **debe ser revisado por
> un profesional del derecho**, especialmente en lo referente al tratamiento de **datos
> biométricos (reconocimiento facial)**, **datos de menores de edad** y **datos sensibles**
> (participación y convicciones religiosas, cuidado pastoral). En Chile aplican la **Ley N° 19.628
> sobre Protección de la Vida Privada** y la **Ley N° 21.719**, que establece un nuevo marco de
> protección de datos personales y crea la **Agencia de Protección de Datos Personales**, cuya
> entrada en vigencia gradual debe ser verificada al momento de publicar este documento.
>
> **Antes de publicar este documento, se debe completar** cada campo marcado entre corchetes
> `[…]`, y se debe confirmar que la descripción de tratamientos coincide exactamente con el
> funcionamiento real de la aplicación en producción.

*Última actualización: [FECHA]*
*Versión: 1.0*

---

## Índice

1. Identidad y datos de contacto del responsable del tratamiento
2. Alcance de esta política y a quién aplica
3. Definiciones
4. Qué datos personales tratamos
5. Cómo obtenemos tus datos
6. Finalidades del tratamiento
7. Base de licitud del tratamiento
8. Tratamiento de datos sensibles
9. Datos de niños, niñas y adolescentes
10. Datos biométricos — reconocimiento facial
11. Plazos de conservación de los datos
12. Destinatarios y encargados del tratamiento
13. Transferencias internacionales de datos
14. Decisiones automatizadas y elaboración de perfiles
15. Medidas de seguridad
16. Tus derechos como titular de los datos
17. Cookies y almacenamiento local
18. Menores de edad como usuarios de la cuenta (distinto de Escuela Dominical)
19. Cambios a esta política
20. Contacto

---

## 1. Identidad y datos de contacto del responsable del tratamiento

El **responsable del tratamiento** de los datos personales recogidos a través de esta aplicación
(en adelante, "la Aplicación" o "el Sistema") es:

| Campo | Detalle |
|---|---|
| Responsable | [NOMBRE DEL RESPONSABLE / iglesia] |
| RUT | [RUT DEL RESPONSABLE] |
| Domicilio | [DIRECCIÓN, Temuco, Chile] |
| Ciudad | [CIUDAD, ej. Temuco] |
| País | Chile |
| Correo de contacto para asuntos de datos personales | [CORREO DE CONTACTO — PENDIENTE] |
| Jurisdicción aplicable | República de Chile |

Cuando en este documento se use la expresión "nosotros", "la iglesia" o "el responsable", se
entenderá que se refiere a la entidad identificada en esta sección.

Si la Aplicación es utilizada por **más de una iglesia** (modelo multi-iglesia), **cada iglesia
que administra su propia comunidad dentro del Sistema es responsable del tratamiento de los datos
personales de sus propios pastores, líderes, miembros, asistentes y niños**, en su calidad de
responsable independiente respecto de esos datos. Quien opera la infraestructura técnica de la
Aplicación (desarrollo, hosting, mantención) puede actuar, según el caso, como **encargado del
tratamiento** por cuenta de cada iglesia, conforme se detalla en la sección 12.

---

## 2. Alcance de esta política y a quién aplica

Esta Política de Privacidad (en adelante, "la Política") se aplica a toda persona que:

- Se registre o tenga una cuenta de usuario en la Aplicación (pastores, líderes, miembros,
  voluntarios, encargados de tesorería, encargados de Escuela Dominical, administradores).
- Sea registrada por un tercero autorizado dentro del Sistema, aunque no tenga cuenta propia (por
  ejemplo, un niño o niña inscrito por su padre, madre o apoderado en Escuela Dominical, o una
  persona registrada en una lista de asistencia por parte de un líder de grupo).
- Interactúe con la Aplicación a través de su versión web o de su versión instalada como
  aplicación web progresiva (PWA) en un teléfono, tablet o computador.

Esta Política **no aplica** a sitios web, aplicaciones o servicios de terceros a los que se pueda
acceder mediante enlaces dentro de la Aplicación, ni al tratamiento de datos que la iglesia
respectiva realice **fuera** de la Aplicación (por ejemplo, en cuadernos físicos, planillas
externas o sistemas distintos a este).

### Aislamiento entre iglesias (arquitectura multi-iglesia)

La Aplicación está diseñada bajo un modelo en que **cada iglesia constituye un espacio de datos
separado y aislado** de las demás iglesias que puedan usar el mismo Sistema. En términos
prácticos:

- Los datos de miembros, grupos, eventos, asistencia, tesorería, mensajes, casos de cuidado
  pastoral y registros de Escuela Dominical de una iglesia **no son visibles ni accesibles** para
  el personal, administradores o miembros de otra iglesia distinta dentro del mismo Sistema.
- El acceso a los datos de una iglesia está restringido a las cuentas de usuario que pertenecen a
  esa misma iglesia, y dentro de ella, conforme al rol asignado a cada persona (ver sección 15).
- Cada iglesia es responsable de administrar correctamente los roles y permisos de sus propios
  usuarios, así como de obtener las autorizaciones que correspondan de sus miembros y de los
  padres, madres o apoderados de los niños que participen en sus actividades.

---

## 3. Definiciones

Para efectos de esta Política, y en concordancia con la legislación chilena de protección de datos
personales, se entenderá por:

| Término | Definición |
|---|---|
| **Dato personal** | Cualquier información vinculada o referida a una persona natural identificada o identificable, como el nombre, teléfono, correo electrónico o fecha de nacimiento. |
| **Dato sensible** | Datos personales que se refieren a características físicas o morales de las personas, o a hechos o circunstancias de su vida privada o intimidad, tales como los hábitos personales, el origen social, las ideologías y opiniones políticas, las **creencias o convicciones religiosas**, los estados de salud físicos o psíquicos y la vida sexual. |
| **Dato biométrico** | Dato personal obtenido a partir de un tratamiento técnico específico, relativo a las características físicas de una persona natural, que permite o confirma su identificación única, como una **representación matemática de rasgos faciales** obtenida mediante reconocimiento facial. |
| **Titular de los datos** | La persona natural a la que se refieren los datos personales tratados (por ejemplo, un miembro de la iglesia, un niño de Escuela Dominical o un visitante registrado). |
| **Responsable del tratamiento** | La persona o entidad que decide sobre las finalidades y los medios del tratamiento de datos personales; en este caso, cada iglesia respecto de los datos de su propia comunidad. |
| **Encargado del tratamiento** | La persona o entidad que trata datos personales por cuenta y bajo instrucciones del responsable, como el proveedor de hosting o quien administra técnicamente la Aplicación. |
| **Tratamiento de datos** | Cualquier operación o conjunto de operaciones realizadas sobre datos personales, tales como la recolección, el almacenamiento, el registro, la organización, la conservación, la modificación, la comunicación, la cesión y la eliminación. |
| **Titular del consentimiento en caso de menores** | El padre, madre o apoderado legal de un niño, niña o adolescente, quien autoriza el tratamiento de los datos de este cuando la ley lo requiere. |
| **Anonimización** | Proceso mediante el cual un dato personal deja de permitir la identificación de una persona, de forma irreversible. |

---

## 4. Qué datos personales tratamos

A continuación se detallan, por categoría funcional, los datos personales que la Aplicación puede
tratar. No todas las iglesias ni todos los usuarios activan necesariamente todos los módulos
descritos (por ejemplo, el reconocimiento facial es opcional y algunas iglesias pueden no usar el
módulo de tesorería).

### 4.1 Datos de cuenta e identificación

| Dato | Detalle |
|---|---|
| Nombre de usuario | Identificador de acceso al Sistema |
| Nombre completo | Nombre y apellidos de la persona |
| Contraseña | Almacenada **cifrada mediante bcrypt**; nunca se guarda ni se muestra en texto plano |
| Teléfono | Número de contacto |
| Correo electrónico | Dirección de correo para comunicaciones y recuperación de cuenta |
| Fecha de cumpleaños | Utilizada para recordatorios y celebraciones dentro de la comunidad |
| Rol dentro de la iglesia | Por ejemplo: administrador, pastor, líder de grupo, tesorero, miembro |

### 4.2 Datos de participación y vida congregacional

| Dato | Detalle |
|---|---|
| Grupos | Grupos, ministerios o células a los que pertenece la persona |
| Eventos y calendario | Inscripción y participación en actividades y eventos de la iglesia |
| **Asistencia** | Registro de asistencia a cultos, reuniones y actividades (**ver sección 8, dato sensible**) |
| Servicios y tareas | Asignación de responsabilidades, turnos o servicios dentro de la iglesia |
| Anuncios | Publicaciones internas dirigidas a la congregación o a grupos específicos |

### 4.3 Comunicaciones internas

| Dato | Detalle |
|---|---|
| Mensajes de chat interno | Contenido de los mensajes enviados entre usuarios de la Aplicación |
| Archivos adjuntos | Documentos, imágenes u otros archivos compartidos en el chat o en anuncios |
| Suscripción a notificaciones push | Identificador técnico entregado por el navegador para poder enviar notificaciones al dispositivo |

### 4.4 Datos de tesorería (uso interno administrativo)

| Dato | Detalle |
|---|---|
| Ingresos y gastos | Registros de movimientos financieros de la iglesia |
| Campañas | Información sobre campañas de recaudación internas |
| Comprobantes | Documentos de respaldo de los movimientos registrados |

> Este módulo es de uso administrativo interno de cada iglesia. Cuando los registros de tesorería
> permitan identificar aportes asociados a una persona natural determinada, dicho dato se trata
> como un dato personal sujeto a esta Política, con acceso restringido según rol.

### 4.5 Datos de niños, niñas y Escuela Dominical

| Dato | Detalle |
|---|---|
| Nombre del niño o niña | Identificación dentro del programa de Escuela Dominical |
| Asistencia | Registro de asistencia a las actividades infantiles |
| **Alergias y datos de salud relevantes** | Información necesaria para el cuidado y seguridad del niño o niña durante las actividades |
| Datos del padre, madre o apoderado | Nombre y contacto de quien autoriza e inscribe al niño o niña |

Estos datos constituyen **datos de menores de edad**, tratados conforme a la sección 9 de esta
Política.

### 4.6 Datos de cuidado pastoral

| Dato | Detalle |
|---|---|
| Casos de cuidado pastoral | Registro de situaciones personales o familiares abordadas por el equipo pastoral |
| Historial de seguimiento | Notas y antecedentes de acompañamiento a lo largo del tiempo |

Este conjunto de datos es de **carácter especialmente sensible** (ver sección 8) y su acceso está
limitado a las personas expresamente autorizadas dentro de la iglesia (típicamente, el pastor o
equipo pastoral designado).

### 4.7 Datos biométricos

| Dato | Detalle |
|---|---|
| Representación matemática del rostro | Datos generados por el sistema de reconocimiento facial a partir de una captura de imagen, con el único fin de registrar asistencia. **No corresponde a una fotografía reutilizable o legible por una persona.** |

Este tratamiento es **opcional** y está sujeto a consentimiento explícito. Ver sección 10.

### 4.8 Datos técnicos y de uso de la Aplicación

| Dato | Detalle |
|---|---|
| Token de sesión (JWT) | Almacenado en el navegador (localStorage) para mantener la sesión iniciada |
| Preferencias de la interfaz | Por ejemplo, el tema visual (claro/oscuro) seleccionado |
| Caché local de la aplicación (PWA) | Datos almacenados en el dispositivo para permitir el uso de la Aplicación sin conexión a internet |
| Dirección IP | Puede quedar registrada en logs técnicos del servidor y de proveedores de infraestructura, con fines de seguridad y funcionamiento |

**No** recogemos datos con fines de publicidad, no realizamos perfilamiento comercial, y **no
vendemos, arrendamos ni comercializamos** los datos personales de los usuarios ni de los niños
registrados en la Aplicación.

---

## 5. Cómo obtenemos tus datos

Los datos personales tratados en la Aplicación se obtienen principalmente de dos formas:

### 5.1 Datos proporcionados directamente por el titular o su representante

- Datos ingresados al crear una cuenta o completar el perfil de usuario.
- Datos ingresados por un padre, madre o apoderado al inscribir a un niño o niña en Escuela
  Dominical, incluyendo información de salud relevante como alergias.
- Mensajes, archivos y contenidos enviados a través del chat interno o de los módulos de
  anuncios.
- Información entregada al registrar movimientos de tesorería, comprobantes o campañas.
- Consentimiento y datos biométricos entregados voluntariamente para activar el reconocimiento
  facial.

### 5.2 Datos generados por el uso de la Aplicación

- Registros de asistencia generados al marcar presencia en un evento, culto o actividad, ya sea de
  forma manual, mediante un líder que pasa lista, o mediante reconocimiento facial.
- Registros técnicos asociados al uso del Sistema, como la suscripción a notificaciones push, el
  token de sesión y la caché local para el funcionamiento offline de la PWA.
- Notas y antecedentes generados por el equipo pastoral en el marco del seguimiento y cuidado de
  las personas.
- Historial de servicios y tareas asignadas dentro de la organización de la iglesia.

En ningún caso obtenemos datos personales desde fuentes públicas externas o desde terceros ajenos
a la propia iglesia, salvo que ello sea informado expresamente.

---

## 6. Finalidades del tratamiento

Los datos personales descritos en la sección 4 se tratan exclusivamente para las siguientes
finalidades:

1. **Gestión de cuentas de usuario**: permitir el inicio de sesión, la identificación de la
   persona dentro del Sistema y la asignación de permisos según su rol.
2. **Organización de la vida congregacional**: administrar grupos, ministerios, eventos, servicios
   y tareas dentro de la iglesia.
3. **Registro y seguimiento de asistencia**: llevar el control de la participación de las personas
   en cultos, reuniones y actividades, con fines pastorales, organizativos y estadísticos internos
   de la propia iglesia.
4. **Comunicación interna**: permitir el envío de anuncios, mensajes de chat y notificaciones push
   entre los miembros y líderes de la iglesia.
5. **Administración financiera interna**: registrar ingresos, gastos, campañas y comprobantes para
   la transparencia y correcta administración de los recursos de la iglesia.
6. **Cuidado y seguridad de los niños**: gestionar la inscripción, asistencia y necesidades
   especiales (como alergias) de los niños que participan en Escuela Dominical, con el fin de
   resguardar su bienestar durante las actividades.
7. **Acompañamiento y cuidado pastoral**: permitir al equipo pastoral autorizado dar seguimiento a
   situaciones personales o familiares que requieran apoyo, dentro de un marco de confidencialidad
   reforzada.
8. **Registro de asistencia mediante reconocimiento facial** (solo si el usuario lo activa
   voluntariamente): agilizar el registro de presencia en actividades, como alternativa optativa al
   registro manual.
9. **Seguridad y buen funcionamiento del Sistema**: prevenir accesos no autorizados, detectar usos
   indebidos, mantener registros técnicos (logs) y asegurar la disponibilidad de la Aplicación.
10. **Cumplimiento de obligaciones legales**: atender requerimientos de autoridades competentes
    cuando exista una obligación legal que así lo exija.

La Aplicación **no utiliza los datos personales para fines de publicidad, marketing dirigido a
terceros, venta de datos, ni para la elaboración de perfiles con efectos jurídicos o de similar
trascendencia** sobre los titulares.

---

## 7. Base de licitud del tratamiento

Cada finalidad descrita en la sección 6 se sustenta en una o más de las siguientes bases de
licitud, conforme a la legislación chilena de protección de datos personales:

| Base de licitud | Aplicación en este Sistema |
|---|---|
| **Consentimiento del titular** | Requerido especialmente para el tratamiento de datos sensibles y biométricos (reconocimiento facial), para la inscripción de niños en Escuela Dominical (consentimiento del padre, madre o apoderado) y, en general, al aceptar esta Política al usar la Aplicación. Puede ser **revocado en cualquier momento**, sin efecto retroactivo. |
| **Relación con la iglesia (ejecución de una relación asociativa/comunitaria)** | Sustenta el tratamiento de datos de cuenta, participación en grupos, eventos, servicios y tareas, necesarios para que la persona pueda participar activamente en la vida de la congregación. |
| **Interés legítimo del responsable** | Sustenta el uso de datos técnicos para el correcto funcionamiento, seguridad y mejora de la Aplicación, así como la organización general de la asistencia y comunicación interna, siempre que no prevalezcan los derechos y libertades del titular. |
| **Cumplimiento de una obligación legal** | Sustenta el tratamiento y conservación de datos cuando exista un mandato legal expreso, por ejemplo en materia tributaria respecto de la tesorería de la iglesia. |

Cuando el tratamiento se funde en el consentimiento del titular, este debe ser **libre, informado,
específico e inequívoco**. En el caso de datos sensibles, biométricos y de menores de edad, se
requiere un estándar reforzado de consentimiento **explícito**, conforme se detalla en las
secciones 8, 9 y 10.

---

## 8. Tratamiento de datos sensibles

De acuerdo con la legislación chilena, se consideran **datos sensibles** aquellos referidos, entre
otros, a las **creencias o convicciones religiosas** y a los **estados de salud** de una persona.
En el contexto de esta Aplicación, constituyen datos sensibles, especialmente:

- **La asistencia y la sola pertenencia de una persona a la iglesia**, ya que este dato, por su
  propia naturaleza, **revela la convicción o práctica religiosa** de la persona.
- **Los datos de salud** de los niños registrados en Escuela Dominical, tales como las alergias.
- **Los registros de cuidado pastoral**, en la medida en que puedan dar cuenta de aspectos de la
  vida privada, la salud física o psíquica, o situaciones familiares o personales sensibles de un
  titular.

### Tratamiento especial que aplicamos a estos datos

1. **Minimización**: solo se registran los datos sensibles estrictamente necesarios para la
   finalidad pastoral, organizativa o de cuidado que corresponda.
2. **Consentimiento**: el tratamiento de datos sensibles requiere el consentimiento del titular
   (o de su padre, madre o apoderado, si es menor de edad), el cual puede revocarse en cualquier
   momento.
3. **Restricción de acceso**: el acceso a los registros de cuidado pastoral y a los datos de salud
   de los niños está limitado, dentro del Sistema, a los roles expresamente autorizados por cada
   iglesia (por ejemplo, el pastor o el equipo de Escuela Dominical), y no es visible para el resto
   de los usuarios de la Aplicación.
4. **No divulgación**: la iglesia se compromete a no divulgar estos datos a terceros ajenos a la
   propia congregación, salvo obligación legal o autorización expresa del titular.
5. **Aislamiento entre iglesias**: como se explica en la sección 2, estos datos nunca son
   accesibles por personas de otra iglesia distinta a la que pertenece el titular.

---

## 9. Datos de niños, niñas y adolescentes

La Aplicación permite registrar información de niños y niñas que participan en actividades como
la Escuela Dominical. Dado que los menores de edad no pueden prestar consentimiento válido por sí
mismos conforme a la ley, se aplican las siguientes reglas:

1. **Autorización previa**: los datos de un niño o niña solo se registran en el Sistema con la
   **autorización previa del padre, madre o apoderado legal**, quien actúa como representante del
   menor para efectos de esta Política.
2. **Finalidad limitada**: los datos de los niños se usan exclusivamente para su cuidado,
   seguridad y organización dentro de las actividades infantiles de la iglesia (por ejemplo,
   registrar asistencia o conocer alergias para prevenir riesgos durante la actividad).
3. **Datos de salud**: información como las alergias se trata con especial cuidado, por constituir
   un dato sensible relativo a la salud del menor, y se usa únicamente para su protección durante
   las actividades (por ejemplo, informar al encargado de la sala sobre alimentos a evitar).
4. **Derechos del apoderado**: el padre, madre o apoderado puede, en cualquier momento, solicitar
   **acceder, rectificar o eliminar** los datos de su hijo o hija registrados en la Aplicación,
   dirigiéndose al responsable conforme a la sección 16.
5. **No divulgación a terceros**: los datos de los niños no se comparten con terceros ajenos a la
   iglesia, ni se usan para fines distintos del cuidado y la organización de las actividades para
   las que fueron recogidos.
6. **Sin reconocimiento facial de menores sin autorización expresa**: si una iglesia decide usar
   el módulo de reconocimiento facial también para niños, ello requerirá el consentimiento
   explícito adicional del padre, madre o apoderado, conforme a la sección 10.

---

## 10. Datos biométricos — reconocimiento facial

La Aplicación ofrece, de manera **opcional**, un módulo de registro de asistencia mediante
**reconocimiento facial**. Este módulo trata un tipo especial de dato personal —el **dato
biométrico**— por lo que se sujeta a las siguientes condiciones:

### 10.1 Carácter voluntario

El uso del reconocimiento facial es **completamente opcional**. Ninguna persona está obligada a
activarlo para poder participar en la iglesia o usar el resto de las funciones de la Aplicación.
Quien no desee usarlo puede continuar registrando su asistencia de forma **manual**, sin ninguna
consecuencia ni limitación de acceso a los demás servicios del Sistema.

### 10.2 Consentimiento explícito

Antes de activar el reconocimiento facial, el Sistema debe solicitar el **consentimiento explícito
e informado** del titular (o de su padre, madre o apoderado, si se trata de un menor de edad),
explicando de forma clara qué dato se captura, para qué se usa y cómo puede eliminarse.

### 10.3 Qué se almacena exactamente

Al activar esta función, la Aplicación **no almacena una fotografía legible o reutilizable del
rostro**. En su lugar, se genera y almacena una **representación matemática de rasgos faciales**
(un conjunto de datos numéricos derivados de la imagen), que permite comparar y reconocer al
titular en futuros registros de asistencia, pero que **no puede utilizarse para reconstruir una
imagen del rostro** ni para identificar a la persona fuera del propio Sistema.

### 10.4 Finalidad exclusiva

Este dato biométrico se usa **exclusivamente** para el registro automático de asistencia dentro de
la Aplicación. No se utiliza con fines de vigilancia, control de horarios laborales ajenos a la
iglesia, seguridad perimetral, ni se comparte con terceros para fines distintos a los aquí
descritos.

### 10.5 Eliminación del registro facial

El titular puede solicitar, en cualquier momento, la **eliminación de su registro facial**,
dejando de ser reconocido automáticamente por el Sistema desde ese momento, sin afectar el resto
de sus datos ni su participación en la iglesia. Esta solicitud puede canalizarse a través de los
medios de contacto indicados en la sección 16.

---

## 11. Plazos de conservación de los datos

Los datos personales se conservan solo durante el tiempo necesario para cumplir las finalidades
para las que fueron recogidos, conforme a la siguiente tabla orientativa:

| Categoría de datos | Plazo de conservación |
|---|---|
| Datos de cuenta (usuario, nombre, contraseña, contacto) | Mientras la persona mantenga una cuenta activa en la Aplicación. Al solicitar la baja, se eliminan o anonimizan dentro de un plazo razonable, salvo obligación legal de conservación. |
| Asistencia y participación en grupos/eventos | Mientras la persona sea parte de la iglesia o mientras sea necesario para fines organizativos y estadísticos internos; puede conservarse en forma agregada o anonimizada con posterioridad. |
| Mensajes de chat interno y archivos adjuntos | Mientras la cuenta y la conversación permanezcan activas, o hasta que el usuario o la iglesia soliciten su eliminación. |
| Datos de tesorería, campañas y comprobantes | Por el plazo que exija la normativa tributaria y contable aplicable a la iglesia, el que puede ser superior al de otras categorías de datos. |
| Datos de niños y Escuela Dominical (incluida información de alergias) | Mientras el niño o niña participe en las actividades correspondientes; se eliminan o anonimizan a solicitud del padre, madre o apoderado, o cuando dejen de ser necesarios. |
| Registros de cuidado pastoral | Por el tiempo que el equipo pastoral estime necesario para el adecuado acompañamiento, con revisión periódica, y sujeto a solicitud de eliminación por parte del titular. |
| Datos biométricos (reconocimiento facial) | Hasta que el titular solicite su eliminación, desactive la función, o se dé de baja de la iglesia; se eliminan también ante inactividad prolongada de la cuenta. |
| Token de sesión (JWT) y caché local (PWA) | Se almacenan en el propio dispositivo del usuario; expiran automáticamente o se eliminan al cerrar sesión o borrar los datos del navegador. |
| Suscripción a notificaciones push | Mientras el usuario mantenga activada la función en su dispositivo; puede revocarse desde la configuración del navegador o del dispositivo. |
| Registros técnicos (logs, IP) | Por un plazo acotado, con fines de seguridad y diagnóstico técnico, tras el cual se eliminan o anonimizan. |

Cumplido el plazo de conservación correspondiente, o recibida una solicitud válida de supresión,
los datos se **eliminan de forma segura o se anonimizan**, de modo que dejen de estar asociados a
una persona identificable, salvo que exista una obligación legal que exija su conservación por un
plazo mayor.

---

## 12. Destinatarios y encargados del tratamiento

Como regla general, los datos personales tratados en la Aplicación son de **uso interno de cada
iglesia** y no se comparten con terceros ajenos a ella, salvo en los siguientes casos, en los que
determinados proveedores actúan como **encargados del tratamiento** por cuenta del responsable, o
como terceros necesarios para el funcionamiento técnico del Sistema:

| Proveedor / tercero | Rol | Datos involucrados | Finalidad |
|---|---|---|---|
| **Render** (proveedor de hosting) | Encargado del tratamiento | Todos los datos almacenados en la base de datos y en el servidor de la Aplicación | Alojar la infraestructura, la base de datos (SQLite) y el backend de la Aplicación, con conexión cifrada (HTTPS) |
| **Google Fonts** | Tercero / prestador de servicio técnico | Dirección IP del dispositivo al cargar las tipografías de la interfaz | Mostrar correctamente las fuentes tipográficas de la Aplicación |
| **Servicio de notificaciones push del navegador** (Google, Apple o Mozilla, según el dispositivo) | Encargado del tratamiento / intermediario técnico | Identificador de suscripción a notificaciones push | Entregar notificaciones al dispositivo del usuario |

No se comunican datos personales a terceros con fines publicitarios, comerciales o de reventa. En
caso de que en el futuro se incorpore un nuevo proveedor o encargado del tratamiento, esta Política
será actualizada para reflejarlo, conforme a la sección 19.

Los encargados del tratamiento están obligados, mediante los términos de servicio del proveedor
respectivo o mediante acuerdos específicos, a tratar los datos únicamente conforme a las
instrucciones del responsable y a aplicar medidas de seguridad adecuadas.

---

## 13. Transferencias internacionales de datos

Dado que la Aplicación se aloja en la infraestructura del proveedor **Render**, cuyos servidores
**pueden ubicarse fuera del territorio de Chile**, el tratamiento de los datos personales puede
implicar una **transferencia internacional de datos**. Asimismo, servicios como **Google Fonts** y
los **servicios de notificaciones push de Google, Apple o Mozilla** pueden implicar el envío de
determinados datos técnicos (como la dirección IP o el identificador de suscripción) a servidores
ubicados fuera de Chile.

Frente a ello, se adoptan los siguientes resguardos:

1. **Cifrado en tránsito**: toda comunicación entre el dispositivo del usuario y el servidor de la
   Aplicación se realiza mediante **HTTPS**, protegiendo los datos durante su transmisión.
2. **Selección de proveedores con estándares reconocidos**: se procura contratar proveedores de
   infraestructura y servicios técnicos que cuenten con políticas de seguridad y privacidad
   reconocidas a nivel internacional.
3. **Minimización de datos enviados a terceros**: solo se envían a estos proveedores los datos
   estrictamente necesarios para la prestación del servicio técnico correspondiente (por ejemplo,
   la IP para cargar tipografías, o el identificador de suscripción para notificaciones).
4. **Revisión periódica**: el responsable revisará periódicamente los proveedores utilizados y sus
   condiciones de tratamiento de datos, actualizando esta Política cuando corresponda.

Cuando la legislación chilena aplicable exija mecanismos adicionales para las transferencias
internacionales de datos personales (como cláusulas contractuales específicas u otras garantías),
el responsable procurará implementarlos conforme a dicha normativa.

---

## 14. Decisiones automatizadas y elaboración de perfiles

El responsable declara expresamente que la Aplicación **no realiza decisiones automatizadas que
produzcan efectos jurídicos sobre los titulares, ni elabora perfiles con dicho alcance**. En
particular:

- El módulo de **reconocimiento facial** se utiliza únicamente para **registrar asistencia**, y no
  para tomar decisiones automáticas que afecten derechos, beneficios o el trato hacia la persona.
- No se generan **puntajes, calificaciones o perfiles automatizados** de los miembros con fines
  distintos a la organización interna descrita en esta Política.
- Cualquier decisión relevante que pueda afectar a un titular (por ejemplo, en el ámbito del
  cuidado pastoral) es siempre adoptada por **personas**, y no por un sistema automatizado.

---

## 15. Medidas de seguridad

El responsable, junto con quienes desarrollan y administran técnicamente la Aplicación, aplican
medidas de seguridad razonables y proporcionales a la naturaleza de los datos tratados, entre
ellas:

1. **Cifrado de contraseñas**: las contraseñas de los usuarios se almacenan cifradas mediante el
   algoritmo **bcrypt**, y nunca se guardan ni se muestran en texto plano.
2. **Conexión cifrada (HTTPS)**: todas las comunicaciones entre el dispositivo del usuario y el
   servidor se transmiten mediante el protocolo HTTPS.
3. **Cabeceras de seguridad HTTP**: se configuran cabeceras de seguridad para mitigar ataques
   comunes en aplicaciones web.
4. **Límites de solicitudes (rate limiting)**: se aplican controles para prevenir abusos, ataques
   de fuerza bruta y uso indebido del Sistema.
5. **Validación de datos de entrada**: la información ingresada al Sistema se valida para prevenir
   errores y vulnerabilidades de seguridad.
6. **Aislamiento entre iglesias**: como se detalla en la sección 2, la arquitectura de la
   Aplicación impide que una iglesia acceda a los datos de otra iglesia distinta.
7. **Control de acceso basado en roles**: dentro de cada iglesia, el acceso a determinados datos
   (por ejemplo, tesorería, cuidado pastoral o datos de Escuela Dominical) está restringido según
   el rol asignado a cada usuario, de modo que solo las personas autorizadas puedan verlos o
   modificarlos.
8. **Minimización y confidencialidad de datos sensibles**: los datos sensibles y biométricos se
   tratan con controles de acceso reforzados, conforme a las secciones 8 y 10.

No obstante lo anterior, el responsable hace presente que **ningún sistema de información es
absolutamente infalible**, por lo que, si bien se aplican medidas razonables conforme al estado de
la técnica, no es posible garantizar una seguridad absoluta frente a todo escenario de riesgo. El
responsable se compromete a actuar con la debida diligencia frente a cualquier incidente de
seguridad que pudiera afectar los datos personales tratados en la Aplicación, informando a los
titulares y a la autoridad competente cuando la ley así lo exija.

---

## 16. Tus derechos como titular de los datos

Conforme a la legislación chilena de protección de datos personales, todo titular tiene derecho a:

| Derecho | Descripción |
|---|---|
| **Acceso** | Solicitar información sobre qué datos personales suyos se tratan, con qué finalidad y a quién se han comunicado. |
| **Rectificación** | Solicitar la corrección de datos personales inexactos, incompletos o desactualizados. |
| **Supresión / cancelación** | Solicitar la eliminación de sus datos personales cuando ya no sean necesarios para la finalidad que justificó su tratamiento, o cuando retire su consentimiento. |
| **Oposición** | Oponerse al tratamiento de sus datos personales en los casos en que la ley lo permita. |
| **Bloqueo** | Solicitar el bloqueo temporal de sus datos cuando corresponda, mientras se resuelve una solicitud de rectificación o de oposición. |
| **Portabilidad** | Solicitar, cuando resulte aplicable, la entrega de sus datos personales en un formato estructurado que permita su traspaso a otro responsable. |
| **Revocar el consentimiento** | Retirar, en cualquier momento, el consentimiento previamente otorgado (por ejemplo, para el uso del reconocimiento facial), sin que ello afecte la licitud del tratamiento realizado con anterioridad a la revocación. |

### Cómo ejercer estos derechos

Para ejercer cualquiera de estos derechos, el titular (o, en el caso de un menor de edad, su
padre, madre o apoderado) debe dirigir su solicitud al correo de contacto indicado en la sección
20, señalando:

1. Su nombre completo y la iglesia a la que pertenece dentro del Sistema.
2. El derecho que desea ejercer.
3. Una breve descripción de su solicitud.
4. Un medio de contacto para responderle.

### Plazos de respuesta

El responsable procurará dar respuesta a las solicitudes de los titulares dentro de los **plazos
que establece la legislación chilena aplicable**, informando al titular sobre el curso dado a su
solicitud. En caso de que la solicitud requiera un plazo mayor por su complejidad, se informará al
titular de dicha circunstancia.

### Derecho a reclamar ante la autoridad

Si un titular considera que sus derechos no han sido debidamente respetados por el responsable,
tiene derecho a presentar un reclamo ante la **Agencia de Protección de Datos Personales** de
Chile, u otra autoridad de control que resulte competente conforme a la Ley N° 21.719, una vez que
dicha institucionalidad se encuentre en funcionamiento, sin perjuicio de las demás acciones que la
ley le franquee.

---

## 17. Cookies y almacenamiento local

La Aplicación utiliza determinadas tecnologías de almacenamiento en el navegador del usuario, tales
como el **token de sesión (JWT)** guardado en `localStorage` para mantener la sesión iniciada, la
**caché local** necesaria para el funcionamiento de la Aplicación como PWA sin conexión a
internet, y el registro de **preferencias de interfaz** (como el tema visual claro u oscuro).

El detalle sobre el uso de cookies y tecnologías de almacenamiento local, sus finalidades y cómo
gestionarlas, se encuentra desarrollado en la **Política de Cookies** de la Aplicación, documento
que debe leerse en conjunto con esta Política de Privacidad.

---

## 18. Menores de edad como usuarios de la cuenta

Además de los niños y niñas registrados en Escuela Dominical (sección 9), es posible que
adolescentes cuenten con su propia cuenta de usuario en la Aplicación (por ejemplo, como líderes
de un grupo juvenil). En tales casos:

- Se recomienda que la creación de la cuenta cuente con el conocimiento y, cuando corresponda, la
  autorización de su padre, madre o apoderado.
- El tratamiento de sus datos se sujeta a las mismas finalidades, medidas de seguridad y derechos
  descritos en esta Política.
- El padre, madre o apoderado de un adolescente titular de una cuenta puede ejercer, en su
  representación, los derechos descritos en la sección 16, cuando ello resulte procedente conforme
  a la legislación aplicable.

---

## 19. Cambios a esta política

El responsable podrá modificar esta Política de Privacidad en el futuro, con el fin de reflejar
cambios en la Aplicación, en los proveedores utilizados, o en la legislación aplicable. Toda
modificación será publicada en este mismo documento, indicando la nueva fecha de "Última
actualización" en el encabezado. Se recomienda a los titulares revisar esta Política
periódicamente. Cuando un cambio sea sustancial —en particular, si afecta el tratamiento de datos
sensibles, biométricos o de menores de edad— el responsable procurará informarlo de forma más
destacada a los usuarios de la Aplicación, y solicitar un nuevo consentimiento cuando la ley así lo
requiera.

---

## 20. Contacto

Para cualquier consulta, solicitud o ejercicio de derechos relacionados con el tratamiento de datos
personales en esta Aplicación, puedes contactarnos a través de:

- **Responsable:** [NOMBRE DEL RESPONSABLE / iglesia]
- **RUT:** [RUT DEL RESPONSABLE]
- **Domicilio:** [DIRECCIÓN, Temuco, Chile]
- **Correo de contacto:** [CORREO DE CONTACTO — PENDIENTE]

*Documento sujeto a revisión legal previa a su publicación. Última actualización: [FECHA].*
