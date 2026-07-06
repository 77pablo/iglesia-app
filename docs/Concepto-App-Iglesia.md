# App Organizadora para la Iglesia
### Documento de concepto

> **Versión:** 1.0
> **Fecha:** 25 de junio de 2026
> **Estado:** Concepto en desarrollo

---

## 1. La idea en una frase (propuesta de valor)

> **"Una app que centraliza la vida de la iglesia: cada miembro ve su calendario, sus responsabilidades y sus anuncios según los grupos a los que pertenece."**

Esta frase es la guía de todo el proyecto. Todo lo que no sirva a esta frase, se descarta o se deja para después.

**Enfoque clave descubierto:** la app es, sobre todo, **una herramienta para los ORGANIZADORES** (líderes, pastor, músicos, tesorería). Los feligreses *reciben* la información; el corazón de la app es ayudar a quienes **coordinan**.

---

## 2. Problemas que resuelve

| # | Problema | Cómo lo resuelve la app |
|---|----------|--------------------------|
| 1 | **Comunicación dispersa** (WhatsApp, papeles, avisos verbales) | Un solo lugar: Anuncios + Eventos |
| 2 | **Desorden en el calendario** (eventos que se cruzan) | Calendario único en 3 niveles |
| 3 | **Coordinar a los grupos** (músicos, jóvenes, etc.) | Eventos por grupo + asignación de roles |
| 4 | **Asistencia y participación** | Confirmación de asistencia + recordatorios automáticos |

---

## 3. Concepto central: Grupos + Roles + Permisos

Esta es la columna vertebral. No mezclar estos tres conceptos:

| Concepto | Qué es | Ejemplo |
|----------|--------|---------|
| **Grupo** | A qué comunidad perteneces | Jóvenes, Músicos, Mujeres, Varones |
| **Rol** | Qué eres dentro de ese grupo | Miembro, Líder, Tesorero |
| **Permiso** | Qué puedes hacer | Ver, Publicar, Editar calendario, Ver finanzas |

**Regla clave:** una persona puede estar en **varios grupos** con **roles distintos**.
*Ejemplo:* María es *líder* en Jóvenes, *miembro* en Mujeres y *música* en alabanza. La app le muestra todo combinado.

### Regla de oro: los permisos son POR GRUPO, no globales

Una persona NO tiene "un rol". Tiene una **pertenencia** por cada grupo (Persona + Grupo + Rol). Sus permisos son la **suma de sus roles, pero cada uno encerrado en su grupo**.

*Ejemplo de Joaquín:*

| Grupo | Rol de Joaquín | Qué PUEDE hacer ahí |
|-------|----------------|---------------------|
| 🎵 Música | Líder | Solicitar fechas, armar setlist, asignar músicos, registrar asistencia, enviar avisos |
| 🟦 Jóvenes | Miembro (feligrés) | Solo ver, confirmar asistencia, recibir avisos |

- ✅ Joaquín solicita una fecha para **Música** → puede (es líder ahí).
- ❌ Joaquín intenta solicitar fecha para **Jóvenes** → no puede; el botón ni le aparece (allá es miembro).
- Ser líder en un grupo **NO** da poder en otro. Los permisos nunca se mezclan entre grupos.
- Detalle: como Joaquín es líder en al menos un grupo, gana accesos generales como "ver calendario completo".

### Diseño de pantalla: "Mis grupos / Inicio"

La app muestra una experiencia combinada; las herramientas cambian según el rol en cada grupo.

```
┌─────────────────────────────────┐
│  Hola, Joaquín 👋               │
├─────────────────────────────────┤
│  MIS GRUPOS                     │
│  🎵 Música        [ Líder ]  ›  │
│     ↳ herramientas de líder     │
│  🟦 Jóvenes      [ Miembro ] ›  │
│     ↳ solo ver y confirmar      │
├─────────────────────────────────┤
│  📅 MI SEMANA (todo junto)      │
│   • Vie 7PM – Ensayo (Música)🎵 │
│     [tú diriges]                │
│   • Sáb 4PM – Reunión Jóvenes🟦 │
│     [¿asistirás? Sí/No]         │
└─────────────────────────────────┘
```

- Cada grupo muestra una **etiqueta de rol** (Líder / Miembro): siempre sabe con qué "sombrero" entra.
- Abrir 🎵 Música → botones de líder. Abrir 🟦 Jóvenes → solo ver y confirmar.
- "Mi semana" mezcla todo, pero cada ítem dice su contexto ("tú diriges" vs "¿asistirás?").

### Roles principales

- **Super-admin (dueño de la plataforma / tú)** — crea las iglesias, asigna obispos y pastores, y administra el sistema completo.
- **Obispo (super-usuario eclesiástico)** — **ve y accede a TODO de TODAS las iglesias** bajo su supervisión. Está por encima de los pastores; es un rol de supervisión (puede entrar a cualquier iglesia y ver todos sus módulos).
- **Administrador / Pastor (de su iglesia)** — control total dentro de su iglesia: crea grupos, **asigna los roles** (líderes, tesorero, maestros…), calendario anual, anuncios generales.
- **Admin de cuerpo (líder)** — gestiona su grupo: solicita fechas, envía avisos, registra asistencia y asigna turnos. **Un grupo puede tener VARIOS admins** (decidido 25/06/2026), nombrados por el pastor; todos comparten los mismos permisos sobre ese grupo. El pastor los nombra o quita desde la pantalla del grupo.
- **Músico / Director de alabanza** — repertorio, ensayos, asignación de instrumentos.
- **Tesorer@** — registro de ofrendas/diezmos, reportes (acceso muy restringido).
- **Feligrés** — solo ve anuncios/calendario y confirma asistencia.

### Visibilidad de módulos por rol

Cada persona ve **solo los módulos que su(s) rol(es) le permiten** — no todos ven lo mismo. La app muestra/oculta según las pertenencias.

**Jerarquía de acceso:** 👑 Super-admin (plataforma) → ⛪ Obispo (TODAS las iglesias) → ⛪ Pastor (su iglesia) → 👥 Líderes/Tesorero/Músicos/Feligreses.
**Quién asigna los roles:** el **super-admin** asigna obispos y pastores; el **pastor** asigna los roles dentro de su iglesia.

> 🔝 **Obispo / Super-usuario:** no aparece en la matriz porque su acceso es **total y transversal** — ve y entra a **todo, en todas las iglesias**. Tiene un **Panel del Obispo** que lista todas las iglesias (con su asistencia y totales) y permite entrar a cualquiera para ver sus módulos completos.
>
> 🔍 **Auditoría del obispo (decidido 25/06/2026):** como ve todo (incluidas **tesorería** y **cuidado pastoral**), cada acceso suyo a datos sensibles queda **registrado en la auditoría** (quién, qué iglesia, qué módulo, cuándo) — por transparencia y para la confianza de los pastores.

| Módulo | Feligrés | Músico | Líder de cuerpo | Líder ED | Tesorero | Pastor |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|
| Inicio "Mi semana" | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mi Servicio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anuncios | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendario (sus grupos) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendario **completo** | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Solicitar fecha | ❌ | ❌ | ✅ | ✅ | ❌ | ✅* |
| Aprobar fechas | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Asistencia (registrar/reportes) | ❌ | ❌ | ✅ su grupo | ✅ ED | ❌ | ✅ todo |
| Panel del pastor + ausentes | ❌ | ❌ | 🔸 su grupo | ❌ | ❌ | ✅ |
| Módulo de Músicos | ❌ | ✅ | 🔸 si es de música | ❌ | ❌ | ✅ |
| Gestionar Servicio (asignar) | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Cuidado Pastoral | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ || Niños / Escuela Dominical | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Tesorería | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Admin (crear grupos, roles) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

✅ = ve/usa · 🔸 = parcial (solo lo suyo) · ❌ = no lo ve. *El pastor agrega fechas directo.

Como una persona puede tener **varios roles**, ve la **suma** de los módulos de todos sus roles (ej. Joaquín: Música + feligrés, pero NO Tesorería ni Niños).

### Decisión de diseño
**Solo líderes y admin crean eventos/anuncios.** Los feligreses solo ven y confirman.
Razón: empezar ordenado y abrir después si hace falta.

---

## 4. El calendario en 3 niveles

- **Anual** — lo define el pastor/admin: campañas, conferencias, retiros, fechas grandes.
- **Mensual** — cada líder organiza lo de su grupo dentro del marco anual.
- **Semanal** — lo más cercano: ensayos, reuniones, servicios. Aquí van los **recordatorios automáticos**.

> Lo grande baja desde arriba; lo pequeño lo llena cada grupo. Así el calendario no es un caos.

---

## 5. El "Evento" como pieza central

Cuando un líder crea un evento, en un solo paso resuelve los 4 problemas:

- Elige **fecha y hora** → entra al calendario *(resuelve desorden)*
- Elige **a qué grupo(s)** va → solo esos miembros lo ven *(resuelve coordinación)*
- Escribe **detalles/lugar** → todos enterados *(resuelve comunicación)*
- Activa **"pedir confirmación"** → sabes cuántos van *(resuelve asistencia)*

**Dos canales de comunicación separados y claros:**
- **Anuncios** → información que solo se lee.
- **Eventos** → información con fecha + acción (confirmar, ver lugar).

**Archivos adjuntos — Rúbrica de la reunión:**
El pastor puede **subir un archivo** (PDF/imagen) con el orden o programa de la reunión (la "rúbrica"). Queda adjunto al evento y quien tenga permiso lo ve/descarga.
```
┌─────────────────────────────────┐
│  📄 RÚBRICA DE LA REUNIÓN       │
│  Reunión · Dom 28 Jun           │
│  [ 📎 Subir archivo ]           │
│   orden-servicio.pdf ✅         │
│  ¿Quién lo ve? ◉ Todos ◯ Líderes│
│  [ Guardar ]                    │
└─────────────────────────────────┘
```
- **Quién la ve (decidido 25/06/2026):** solo quienes tienen un servicio en esa reunión → el **líder de música** y los feligreses asignados a **predicar**, **ofrenda** y **devocional** (a cada uno se le avisa en la app). El pastor la sube y administra.
- Útil para que cada quien sepa el orden del servicio y su parte.

---

## 6. Sistema de permisos, calendario y asistencia

Tres sistemas conectados que dan el "músculo" operativo a la app. Decisiones tomadas el 25/06/2026.

### 6.1 Permisos del calendario (VER ≠ EDITAR ≠ APROBAR)

La regla de oro: ver el calendario no es lo mismo que poder editarlo. Tres acciones separadas:

| Acción | Quién puede | Alcance |
|--------|-------------|---------|
| 👁️ **VER calendario completo** | Líderes + pastor *(NO feligreses)* | Toda la iglesia |
| ✍️ **SOLICITAR una fecha** | Cada líder | Solo para su propio grupo |
| ✅ **APROBAR una fecha** | Solo el pastor / admin | Toda la iglesia |

- **Feligreses:** solo ven los eventos aprobados de SUS grupos. El calendario completo es herramienta de organizadores.
- **Vista completa para líderes:** al mirar un día ocupado ven `27/09 — 🔴 OCUPADO · "Reunión Dorcas" (Katty)`. Ven que está tomado y por quién, sin necesidad de los detalles internos del otro grupo.
- **Por qué:** un líder (ej: Abel, Jóvenes) puede ver TODO el calendario para no chocar con otros, pero solo agrega fechas de su grupo, y nada es oficial hasta que el pastor aprueba.

### 6.2 Flujo de aprobación de fechas

```
  Líder solicita         Pastor revisa           Resultado
 ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
 │ 🟡 PENDIENTE │ ───► │  Bandeja del │ ───► │ 🟢 APROBADA  │
 │ (solicitada) │      │    pastor    │      │  (oficial)   │
 └──────────────┘      └──────────────┘      └──────────────┘
                              │
                              └──────────────► │ 🔴 RECHAZADA │
                                               │ (con motivo) │
```

| Estado | Significa | Quién lo ve |
|--------|-----------|-------------|
| 🟡 Pendiente | El líder la pidió, falta el pastor | Líderes + pastor (como tentativa) |
| 🟢 Aprobada | El pastor confirmó: es oficial | Todos |
| 🔴 Rechazada | El pastor dijo no, con motivo | Solo el líder solicitante |

**Reglas decididas:**
- **Reserva temporal (por franja, no por día):** una fecha 🟡 pendiente reserva esa **franja horaria + recurso/espacio**, no el día entero. Otro líder SÍ puede usar el mismo día en otro horario o lugar; solo se bloquea si se solapan hora y espacio. Evita choques mientras el pastor decide.
- **El pastor agrega directo:** sus fechas quedan 🟢 oficiales al instante (no pasa por aprobación).
- **Detección de choques (por franja + recurso):** la app solo avisa si se **solapan horario y espacio**: `⚠️ El salón está ocupado a esa hora por "Reunión Dorcas". ¿Otro horario o lugar?`. Mismo día en distinta hora o lugar está permitido.
- **Bandeja del pastor:** pantalla "Solicitudes pendientes" para aprobar/rechazar con un toque; recibe notificación al haber algo por revisar.

### 6.3 Sistema de asistencia

**No confundir CONFIRMAR con REGISTRAR (aclaración 25/06/2026):**
- **"Confirmaré" (RSVP · intención):** ANTES del evento la persona dice si planea ir → el líder estima cuántos vendrán.
- **"Asistió" (registro real):** EL DÍA del evento se registra quién realmente fue (facial con cámaras).
- Son distintas: alguien puede confirmar y no ir, o ir sin confirmar. La app las maneja por separado.

Dos niveles del registro real (no confundir):

| Nivel | Qué responde | Ejemplo |
|-------|--------------|---------|
| **Por evento** | ¿Cuántos fueron a esta reunión? | "La última vez: 23 jóvenes" |
| **Por persona** | ¿Quién asiste y quién falta seguido? | "Juan no viene hace 3 reuniones" |

**Métodos de registro (decididos: disponibles los tres, el líder elige):**
1. **Lista** — el líder marca presente/ausente a cada miembro → da datos por persona.
2. **Conteo rápido** — solo el número total (ej: 23) → rápido cuando hay prisa.
3. **Auto check-in del miembro** — cada persona marca que llegó (botón o QR) → menos trabajo para el líder.

**Reportes que obtiene el líder:**
- 📊 Última reunión (número) · 📈 Promedio del mes · 📉 Tendencia (sube/baja)
- ⚠️ Inasistencia: quiénes faltan seguido → alimenta el seguimiento pastoral.

**Conexión:** el nivel "por persona" enlaza con el módulo de **cuidado pastoral** (#2 del catálogo): la app puede avisar "estos miembros llevan rato sin venir".

### 6.4 Cómo se conecta todo (ejemplo: Abel, líder de Jóvenes)

```
Abel (líder Jóvenes)
   ├─ VE el calendario completo ──► sabe que 27/09 lo tomó Katty (Dorcas)
   ├─ SOLICITA fecha para Jóvenes ─► 🟡 pendiente ─► Pastor aprueba ─► 🟢 oficial
   └─ El día del evento ──► registra ASISTENCIA ──► reportes + seguimiento
```

### 6.5 Diseño de pantalla: "Solicitar fecha" (líder)

Versión compacta: calendario + formulario en una sola vista (decidido el 25/06/2026).

```
┌─────────────────────────────────┐
│ ‹ Cancelar   SOLICITAR FECHA  ✓ │
├─────────────────────────────────┤
│  🟦 Grupo: Jóvenes (fijo)       │
├─────────────────────────────────┤
│  ‹  Septiembre 2026  ›          │
│  Lu Ma Mi Ju Vi Sa Do           │
│      1  2  3  4  5  6            │
│   7  8  9 10 11 12 13           │
│  14 15 16 17 18 19 [20]         │
│  21 22 23 24 25 26 ●27          │
│  28 29 30   ●=ocupado [ ]=elegido│
├─────────────────────────────────┤
│  📅 Seleccionado: Dom 20 Sep ✅ │
│  🕐 4:00 – 6:00 PM           ✎  │
│                                 │
│  📝 ┌─────────────────────────┐ │
│     │ Noche de Jóvenes        │ │
│     └─────────────────────────┘ │
│  📍 Salón principal  ✅ libre ⌄ │
│                                 │
│  [✓] Confirmación  [✓] Asist.   │
├─────────────────────────────────┤
│  [   Enviar al pastor  📤   ]   │
└─────────────────────────────────┘
```

**Decisiones de diseño:**
- Calendario + formulario en una vista → menos pasos.
- El día ocupado (●27, Dorcas/Katty) siempre visible → evita el choque sin avisos extra.
- Grupo fijo en "Jóvenes" → el líder solo solicita para su propio grupo.
- Lugar/recurso con chequeo "✅ libre" → evita chocar también por el espacio.
- "Enviar al pastor" → deja claro que pasa por aprobación (queda 🟡 pendiente y el día se reserva temporalmente).

### 6.6 Diseño de pantalla: Bandeja del Pastor (aprobar / rechazar)

**Lista de solicitudes pendientes:**
```
┌─────────────────────────────────┐
│  SOLICITUDES          🔔 3      │
├─────────────────────────────────┤
│  🟡 PENDIENTES (3)              │
│  ┌───────────────────────────┐  │
│  │ 🟦 Noche de Jóvenes       │  │
│  │ Abel · Dom 20 Sep 4PM   › │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 🟪 Taller de Mujeres      │  │
│  │ Katty · Sáb 3 Oct 10AM  › │  │
│  └───────────────────────────┘  │
│  ─────────────────────────────  │
│  ✅ Aprobadas esta semana (5) ⌄ │
└─────────────────────────────────┘
```

**Detalle de la solicitud (decisión con contexto):**
```
┌─────────────────────────────────┐
│ ‹ Volver    REVISAR SOLICITUD   │
├─────────────────────────────────┤
│  🟦 Noche de Jóvenes            │
│  Solicita: Abel (líder Jóvenes) │
│  📅 Domingo 20 Sep              │
│  🕐 4:00 – 6:00 PM              │
│  📍 Salón principal  ✅ libre   │
│  ─────────────────────────────  │
│  🗓️ Contexto del día:           │
│     • Sin otros eventos ✅      │
│     • Semana: 2 eventos ya      │
├─────────────────────────────────┤
│  [ ✅ APROBAR ]  [ 🔴 RECHAZAR ]│
└─────────────────────────────────┘
```

Al **rechazar** se pide motivo (con sugerencias rápidas: "Fecha ocupada", "Mucho evento", "Proponer otra fecha"). Abel recibe notificación al instante en ambos casos.

**Decisiones de diseño:**
- Badge 🔔 con número de pendientes.
- El pastor decide con contexto del día y la semana (evita saturar de eventos).
- Rechazo con motivo + sugerir otra fecha → reencamina al líder, no lo frena.

### 6.7 Diseño de pantalla: Registrar asistencia (3 métodos)

El líder elige el método al terminar la reunión:

**Método 1 — Lista (uno por uno, da datos por persona):**
```
┌─────────────────────────────────┐
│ ‹ Lista de asistencia      ✓    │
│  🔍 Buscar...      Presentes: 18│
│  Ana Pérez            [✓ Sí ]   │
│  Bruno Díaz           [✓ Sí ]   │
│  Carla Soto           [  No ]   │
│  + Agregar invitado (no miembro)│
│  [   Guardar (18 de 25)  💾   ] │
└─────────────────────────────────┘
```

**Método 2 — Conteo rápido (solo el número):**
```
┌─────────────────────────────────┐
│      ¿Cuántos asistieron?       │
│      ➖ [   23   ] ➕            │
│   (la última vez fueron 20)     │
│         [ Guardar 💾 ]          │
└─────────────────────────────────┘
```

**Método 3 — Auto check-in (QR, cada miembro se marca solo):**
```
┌─────────────────────────────────┐
│      Muestra este código:       │
│        [ QR ]                   │
│   Llegando en vivo... 🟢        │
│   ✅ 21 marcados                │
│  [ Cerrar check-in y guardar ]  │
└─────────────────────────────────┘
```

**Resumen tras guardar (cualquier método):**
```
┌─────────────────────────────────┐
│        ✅ GUARDADO              │
│   Asistieron:  23  👥           │
│   Última vez:  20  (+3) 📈      │
│   Promedio mes: 21              │
│  ⚠️ No asisten hace 3 reuniones:│
│     Carla, Elena → [Avisar]     │
└─────────────────────────────────┘
```

**Decisiones de diseño:**
- El líder elige método según el momento (prisa → conteo; detalle → lista; sin trabajo → QR).
- Siempre compara con la última vez ("cuántos fueron la última vez").
- Detecta inasistencia repetida y conecta con cuidado pastoral.

### 6.8 Método 4: Asistencia por reconocimiento facial (avanzado · fase futura)

Registro de asistencia a la reunión: la persona pasa frente a una cámara y la app la marca sola. Va en una fase posterior, nunca en el MVP. **Actualización 25/06/2026: el facial será el ÚNICO método de registro, con dos cámaras en cadena, y el reporte de asistencia le llega al pastor en la app.**

**Alcance — solo con cámaras (decidido 25/06/2026):** el registro es 100% por cámara (facial). La iglesia cuenta con **buen internet y buena iluminación estables**, condiciones ideales para el reconocimiento; por eso no se usan métodos manuales en la reunión general. (Si en el futuro un grupo se reuniera en una sala sin cámara, ahí se usaría un conteo manual simple; por ahora, todo es con cámara.)

**Decisión de arquitectura:** InsightFace / ArcFace (pack `buffalo_l`) corriendo en el **backend** con ONNX Runtime (~50ms por embedding en CPU). Las cámaras solo capturan y envían el frame; el backend hace todo el pipeline. Más fácil de mantener y más preciso.

**Dos cámaras en cadena (segunda oportunidad):**
```
Persona entra
   ├─ 📷 Cámara 1 (puerta)
   │     ├─ ✅ Reconoce → marca asistencia
   │     └─ ❌ No reconoce ↓
   └─ 📷 Cámara 2 (más alejada / salón)
         ├─ ✅ Reconoce → marca asistencia
         └─ ❌ No reconoce →
               ├─ 👶 edad estimada = menor → "niño asistido" (conteo anónimo)
               └─ 🧑 edad estimada = adulto → "no identificado" + 🔔 alerta a soporte
```
- La 2ª cámara da otra distancia/ángulo → sube el % de aciertos sin que la persona haga nada.
- **De-duplicación obligatoria:** una persona = un solo registro por reunión, sin importar qué cámara la captó.
- **Cuando nadie es reconocido (corregido 25/06/2026):** la app NO pone a ninguna persona de la iglesia a registrar a mano — eso contradice su propósito (quitar carga, no añadirla). Si ninguna cámara reconoce a alguien, el sistema lo cuenta como **"no identificado" (anónimo)** y **avisa al backend/soporte** (rol técnico, no de la iglesia), que mejora el sistema: re-inscripción, ajuste de cámara/luz, etc.
- **Consecuencia a aceptar:** un miembro no reconocido puede no aparecer ese día como asistente. Por eso el reporte muestra el número de "no identificados" como **margen de error** del día, y soporte trabaja para reducirlo con el tiempo.
- **Niños — "niño asistido" (decidido 25/06/2026):** los menores NO se inscriben en facial. Cuando la cámara detecta un rostro no inscrito cuya **estimación de edad** (incluida en `buffalo_l`) lo marca como menor, lo cuenta como **"niño asistido"** (conteo anónimo, sin guardar su cara y sin alerta a soporte). Aparece aparte en el reporte (`👶 Niños: N`). Opcional: si el niño está ligado a la cuenta de un padre (perfil familiar), puede contarse con nombre cuando el padre es reconocido. *Ojo: la estimación de edad no es exacta; sirve para conteo, no para precisión por nombre.*

**Pipeline (4 pasos):**
```
1. Detección   → SCRFD/RetinaFace (incluido en buffalo_l) encuentra la cara
2. Alineación  → recorta y endereza por landmarks (clave con ángulos)
3. Embedding   → ArcFace → vector de 512 floats (normalizado L2)
4. Matching    → cosine similarity vs inscritos → umbral
```

**Escala:** con ~1000 personas el matching es trivial (<1ms, brute-force en RAM con NumPy). No se necesita FAISS hasta ~10–50k. El cuello de botella es el embedding (~50ms), no la búsqueda.

**Umbral:** decidir por cosine similarity (~0.4–0.5), pero **calibrarlo con las caras propias** (medir FAR vs FRR). Sesgar a **estricto**: si duda → no marca, lo intenta la 2ª cámara, y si tampoco → queda "sin identificar". Un falso positivo (marcar a otra persona) es peor que un falso negativo.

**Flujo de datos:** en arquitectura backend viaja la imagen cruda → exige **TLS** y procesar el frame **en memoria y descartarlo** (nunca persistir la foto). Alternativa más privada: calcular el embedding en el kiosko (ONNX edge) y enviar solo el vector — más difícil de mantener.

**Modo offline en la puerta (M3 · corregido por N1):** el **matching siempre ocurre en el backend** — los embeddings (rostros) **nunca salen del servidor cifrado**, ni siquiera a la tablet de la puerta. Flujo:
- **Con internet:** cámara → frame → backend reconoce → marca "asistió [nombre]" → el pastor lo ve por nombre.
- **Sin internet (raro, hay buen internet):** el kiosko guarda el **frame cifrado en una cola local temporal**; al volver la red lo envía al backend, que reconoce y marca la asistencia (con un breve retraso) y luego **borra el frame**.

Así se cumple la privacidad (rostros solo en backend) sin perder ningún registro.

**Privacidad (no opcional — biometría = dato sensible):**
- Guardar el **embedding, NO la foto** (borrar el frame tras inscribir).
- Cifrado en reposo de la tabla de embeddings.
- Consentimiento: la congregación está de acuerdo (aviso + anuncio) y cada persona da su **aceptación única al inscribirse** (con fecha); derecho a borrarse.
- **Nada de inscribir menores** en facial; se cuentan de forma anónima como "niño asistido" (por estimación de edad), sin guardar su rostro.
- Versionar el modelo: si cambia ArcFace → re-inscripción.

> ⚖️ **Nota legal:** se decidió que el facial sea el único método y que toda la congregación está de acuerdo. Aun así, en varios países la biometría exige consentimiento explícito e individual; la **aceptación única al inscribirse** cubre ese requisito. Conviene confirmar la ley local antes de lanzar.

**Modelo de datos (piezas nuevas):**
```
BiometriaPersona { persona_id, embedding[512], modelo_version, consentimiento_at, activo }
RegistroAsistencia { evento_id, persona_id, metodo: 'facial', confianza: 0.47, camara: 'puerta'|'salon' }
  → único por (evento_id, persona_id) para evitar doble conteo entre cámaras
NoIdentificado { evento_id, camara, timestamp }  // adulto no reconocido: cuenta anónima + alerta a soporte
NinoAsistido   { evento_id, camara, timestamp }  // menor (por edad estimada): conteo anónimo, sin alerta
```
Inscripción con 3–5 fotos en distintos ángulos/luz por persona.

**Pantallas:**

*Aceptación al inscribirse (facial = único método; toda la congregación de acuerdo):*
```
┌─────────────────────────────────┐
│      📸 ASISTENCIA POR ROSTRO   │
│  Aquí la asistencia se toma con │
│  la cámara (único método).      │
│  La congregación está de acuerdo│
│  ✅ Guardamos un código, NO foto│
│  ✅ Cifrado, solo asistencia    │
│  ✅ Puedes pedir que se borre   │
│  [ ] Entiendo y acepto          │
│  [ Aceptar e inscribirme ]      │
└─────────────────────────────────┘
```

*Inscripción (3–5 fotos):*
```
┌─────────────────────────────────┐
│   Mira al frente... ✅ 1/4      │
│   Gira a la derecha        2/4  │
│   ...a la izquierda        3/4  │
│   Sonríe                   4/4  │
│  Las fotos se borran; queda el  │
│  código.                        │
└─────────────────────────────────┘
```

*Cámara en la entrada:*
```
┌─────────────────────────────────┐
│   ENTRADA · Reunión 28 Jun      │
│   ✅ ¡Hola, Ana! Registrada     │
│      (confianza 0.51)           │
│   Hoy: 72 marcados 🟢           │
└─────────────────────────────────┘
```
Si la confianza no pasa el umbral → no marca; lo reintenta la 2ª cámara.

*Reporte de asistencia para el pastor (bajo demanda — entra cuando quiere y consulta por fecha):*

El pastor NO recibe un aviso en vivo; abre la sección "Asistencia" cuando lo desea (ej. después de la reunión) y consulta por fecha.

Lista por fecha:
```
┌─────────────────────────────────┐
│  ASISTENCIA              📅     │
│  HOY · 28 Jun 2026              │
│  ┌───────────────────────────┐  │
│  │ Reunión general           │  │
│  │ 👥 87 asistentes      ›   │  │
│  └───────────────────────────┘  │
│  REUNIONES ANTERIORES           │
│  • 21 Jun · 80 asistentes  ›    │
│  • 14 Jun · 75 asistentes  ›    │
│  🔍 Buscar otra fecha           │
│  📊 Ver tendencia del mes ›     │
└─────────────────────────────────┘
```

Detalle del día (al tocar una fecha):
```
┌─────────────────────────────────┐
│ ‹ Asistencia     28 Jun 2026    │
│   Reunión general               │
│   Total:  87 personas 👥        │
│   Última vez: 80  (+7) 📈       │
│   Promedio del mes: 81          │
│   📷 Puerta: 72 · 📷 Salón: 15  │
│   👶 Niños: 12                  │
│   ⚠️ No identificados: 3        │
│  [ Ver lista de asistentes › ]  │
│  [ Exportar / compartir 📤 ]    │
└─────────────────────────────────┘
```

Lista de asistentes (quién asistió y quién NO):
```
┌─────────────────────────────────┐
│ ‹ 28 Jun · Lista de asistencia  │
│  Total: 87 de 95 miembros       │
│  🔍 Buscar   Filtrar: Todos ⌄   │
│  ✅ ASISTIERON (87)             │
│   • Ana Pérez         📷 puerta │
│   • Bruno Díaz        📷 salón  │
│   • Carla Soto        📷 salón  │
│  ❌ NO ASISTIERON (8)           │
│   • David Ruiz       → [cuidado]│
│   • Elena Vega       → [cuidado]│
│  [ Exportar / compartir 📤 ]    │
└─────────────────────────────────┘
```
- Dos secciones: ✅ Asistieron / ❌ No asistieron.
- "No asistieron" se calcula solo: miembros inscritos − asistentes.
- En los asistentes se ve por qué cámara se registraron (📷 puerta / 📷 salón).
- Filtro por grupo (solo Jóvenes, solo Dorcas, etc.).
- Los ausentes enlazan con seguimiento pastoral ([cuidado]).
- Nota: la lista de ausentes solo aplica a miembros inscritos. Los "no identificados" se reportan aparte como cuenta anónima (margen de error del día), no como ausentes.

**Checklist de implementación:**
1. Usar `buffalo_l` tal cual (SCRFD + ArcFace).
2. Calibrar umbral con caras propias (estricto).
3. Cosine en RAM (FAISS solo si >10k).
4. Inscripción multi-foto.
5. Frame en memoria + descarte + TLS + cifrado de embeddings + consentimiento.
6. Dos cámaras en cadena + de-duplicación por (evento, persona).
7. Reporte de asistencia bajo demanda (el pastor consulta por fecha cuando quiere).
8. No identificados → cuenta anónima + alerta a backend/soporte (cero carga humana en la iglesia).
9. Modo offline: cola local de **frames cifrados** (borrados tras procesar); el matching y los embeddings viven SOLO en el backend (nunca en el kiosko).

**Ubicación en el plan:** Fase 3 (delicado), nunca MVP. Es el método de registro **solo para las reuniones** (con cámaras); no depende de los métodos 1–3 (esos quedarían únicamente para una sala sin cámara, si la hubiera).

---

### 6.9 Panel del pastor y cuidado de ausentes

Aprovecha los datos de asistencia (facial) para dar al pastor una vista de salud de la iglesia y detectar **automáticamente** a quién hay que cuidar.

**Panel del pastor (dashboard):**
```
┌─────────────────────────────────┐
│  📊 PANEL · Monte Sion          │
│  Asistencia hoy:  87   📈 +7    │
│  Promedio del mes: 81           │
│  Tendencia (últimas 6):         │
│   70 75 80 82 80 87             │
│   ▃  ▄  ▆  ▇  ▆  █              │
│  Grupos más activos:            │
│   🎵 Música 100% · 🟦 Jóvenes 95%│
│  ⚠️ 5 personas se están alejando│
│     → [ Ver lista ]             │
└─────────────────────────────────┘
```

**Alerta de ausentes (cuidado pastoral automático):**
```
┌─────────────────────────────────┐
│ ‹ Se están alejando (5)         │
│  Faltaron 3+ reuniones seguidas:│
│  👤 Juan Pérez · faltó 4        │
│     [ 📞 Contactar ] [ Asignar ]│
│  👤 Elena Vega · faltó 3        │
│     [ 📞 Contactar ] [ Asignar ]│
└─────────────────────────────────┘
```

**Cómo funciona:**
- 🤖 **Automático:** el sistema calcula quién faltó seguido (umbral configurable, ej. 3 reuniones) con los datos del facial. Cero trabajo manual.
- 📞 **Contactar:** abre llamada o WhatsApp directo.
- 👥 **Asignar:** el pastor delega el seguimiento a un líder.
- ❤️ Conecta con el módulo de **cuidado pastoral** (#2 del catálogo): nadie se pierde sin que alguien lo note.
- 🔒 Privado: solo pastor y líderes.
- Ubicación en el plan: V2 (depende de tener la asistencia funcionando).

---

## 7. Módulo de Músicos (desarrollado a detalle)

El módulo más especializado. Funciona como una "mini-app" dentro de la app porque sus necesidades son distintas.

### Ciclo semanal del equipo de alabanza
```
1. El director arma el repertorio del servicio (qué cantos)
2. Define el tono de cada canto (según quién canta)
3. Asigna quién toca qué (guitarra, teclado, voces, batería)
4. Comparte todo con el equipo (letras, tonos, orden)
5. Ensayan
6. Tocan en el servicio
→ vuelve a empezar la siguiente semana
```

### Las 4 piezas del módulo

**1. Cancionero (biblioteca de cantos)** — la base, se reutiliza siempre.
Cada canto guarda: título, autor, letra (con acordes opcionales), tono original y alternativos, categoría, enlace a YouTube/Spotify, PDF opcional.

**2. Orden del Servicio (setlist)** — el director arma el servicio eligiendo cantos del cancionero. Incluye fecha, lista ordenada, tono de ese día y notas.

**3. Asignación de integrantes** — quién toca qué instrumento en cada servicio; avisa si falta cubrir un rol.

**4. Ensayos + recordatorios** — agenda ensayos (solo los ve el equipo), confirmación de asistencia y recordatorio automático.

### Prioridad dentro del módulo
1. Cancionero (sin esto nada funciona)
2. Orden del servicio (mayor valor inmediato)
3. Recordatorios de ensayo (fácil y útil)
4. Asignación de integrantes (potente, puede esperar)

### Detalles que marcan la diferencia
- 🎚️ **Transposición de tono** (acordes se ajustan solos)
- 📴 **Funciona sin internet** el domingo (letras descargadas)
- 🔁 **Historial** ("¿qué cantamos el mes pasado?")
- 🔍 **Búsqueda rápida** por título o tono
- ⊕ **Modo pantalla** que no se apaga mientras tocan

---

## 8. Diseño de pantalla: Orden del Servicio

### Vista 1 — El Músico (lectura)
```
┌─────────────────────────────────┐
│ ‹ Atrás      SERVICIO        ⋮  │
├─────────────────────────────────┤
│  Domingo 28 de Junio · 10:00 AM │
│  Servicio Dominical             │
│                                 │
│  🎤 Tú tocas:  TECLADO          │
├─────────────────────────────────┤
│  1  Cuán Grande es Él           │
│     Tono: G   ·  Apertura    ›  │
│                                 │
│  2  Sublime Gracia              │
│     Tono: D                  ›  │
│                                 │
│  3  Renuévame                   │
│     Tono: A · Repetir coro   ›  │
│                                 │
│  4  Al Que Está Sentado         │
│     Tono: E                  ›  │
├─────────────────────────────────┤
│  👥 Equipo de hoy          ⌄    │
│  🎹 María · 🎸 Juan · 🥁 Pedro  │
├─────────────────────────────────┤
│   [ 🔔 Próximo ensayo: Vie 7PM ]│
└─────────────────────────────────┘
```

### Vista 2 — Detalle de un canto
```
┌─────────────────────────────────┐
│ ‹ Servicio    RENUÉVAME      ⋮  │
├─────────────────────────────────┤
│  Tono:  [ A ]   ‹ – ›  🔁       │
│  ▶ Escuchar (YouTube)           │
├─────────────────────────────────┤
│   A              D              │
│  Renuévame Señor Jesús          │
│       E              A          │
│  ya no quiero ser igual         │
│                                 │
│  [Coro] ...                     │
│                                 │
│         ⊕ Modo pantalla         │
└─────────────────────────────────┘
```

### Vista 3 — El Director (edición)
```
┌─────────────────────────────────┐
│ ‹ Cancelar   ARMAR SERVICIO  ✓ │
├─────────────────────────────────┤
│  📅 Domingo 28 Jun · 10:00 AM ✎ │
├─────────────────────────────────┤
│  CANTOS                         │
│  ⠿ 1  Cuán Grande es Él  [G] ✕ │
│  ⠿ 2  Sublime Gracia     [D] ✕ │
│  ⠿ 3  Renuévame          [A] ✕ │
│        [ + Agregar canto ]      │
├─────────────────────────────────┤
│  ASIGNAR EQUIPO                 │
│  🎹 Teclado    → María      ✎  │
│  🎸 Guitarra   → Juan       ✎  │
│  🎤 Voz        → ⚠ Sin asignar │
├─────────────────────────────────┤
│  🔔 Ensayo: Viernes 7:00 PM  ✎ │
├─────────────────────────────────┤
│  [   Publicar al equipo  📤   ] │
└─────────────────────────────────┘
```

### Reglas de diseño
1. **El músico solo lee; el director edita.** Dos modos claros.
2. **Lo más importante, arriba y grande.**
3. **Cero fricción el domingo** (tono, letra, modo pantalla, offline).

---

## 9. Módulo de Servicio (aseo, ofrenda, agradecimientos)

Los ministerios de servicio funcionan con **dos modelos**:
- **Voluntario (apuntarse + aprobar):** el feligrés elige la fecha y el pastor aprueba. Ej.: **aseo**.
- **Asignado (a dedo):** el pastor/líder elige a personas concretas. Ej.: **música, ofrenda**.

### 9.1 Aseo (voluntario)

Funciona por **voluntariado con aprobación**: los feligreses se apuntan a una fecha de aseo, el pastor aprueba, y eso los pone en el calendario. Varios pueden apuntarse al mismo día → forman el **equipo de aseo** (es como un grupo de aseo abierto).

**Qué hace:**
- Los feligreses **se ofrecen como voluntarios** y **eligen la fecha** de aseo que pueden cubrir.
- El pastor **aprueba** (les da el visto bueno de que pueden hacer el aseo).
- Una vez aprobado, les **aparece en su calendario / "Mi semana"** + notificación.
- **Varios feligreses por fecha** = el equipo de aseo de ese día.
- Recordatorio automático + opcional: lista de tareas (barrer, baños, sillas…).

**Flujo:**
```
Feligrés se apunta a una fecha (se ofrece) 🙋
   → 🟡 pendiente
   → Pastor aprueba ("sí, puedes hacer el aseo") ✅
   → 🟢 queda asignado en el calendario 📅
   → aparece en "Mi semana" del feligrés
   → recordatorio el día antes 🔔
   (varios feligreses pueden apuntarse al mismo día = equipo)
```

**Pantalla — El feligrés se apunta:**
```
┌─────────────────────────────────┐
│  🧹 ASEO DEL TEMPLO             │
│  Apúntate a una fecha:          │
│  ┌───────────────────────────┐  │
│  │ Sáb 4 Jul · 9AM           │  │
│  │ Apuntados: Ana, Bruno (2) │  │
│  │ [ Me apunto ]             │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Sáb 11 Jul · 9AM          │  │
│  │ Apuntados: (0)            │  │
│  │ [ Me apunto ]             │  │
│  └───────────────────────────┘  │
│  [ + Proponer otra fecha ]      │
└─────────────────────────────────┘
```

**Pantalla — El pastor aprueba:**
```
┌─────────────────────────────────┐
│  🧹 ASEO · Por aprobar          │
│  Sáb 4 Jul · 9AM                │
│   🙋 Ana    [ ✓ ] [ ✗ ]        │
│   🙋 Bruno  [ ✓ ] [ ✗ ]        │
│  [ Aprobar a todos 📤 ]         │
└─────────────────────────────────┘
```

**Pantalla — El feligrés aprobado (en "Mi semana"):**
```
┌─────────────────────────────────┐
│  MI SEMANA                      │
│  🧹 Sáb 4 Jul · 9:00 AM         │
│     Aseo del templo ✅ aprobado │
│     Equipo: Ana, Bruno, tú      │
└─────────────────────────────────┘
```

**Cancelar con motivo (si un apuntado ya no puede):**
Si después de apuntarse alguien no puede, lo cancela con un **motivo breve**, para que el pastor lo sepa y otro pueda cubrir.
```
┌─────────────────────────────────┐
│  🧹 Aseo · Sáb 4 Jul            │
│  Ya no puedo. ¿Por qué?         │
│  ◯ Trabajo   ◯ Viaje            │
│  ◯ Salud     ◯ Familia          │
│  ◯ Otro: _______________        │
│  [ Enviar ]                     │
└─────────────────────────────────┘
```
El pastor ve el equipo de cada fecha y su estado:
```
┌─────────────────────────────────┐
│  Aseo · Sáb 4 Jul               │
│  ✅ Ana — apuntada y aprobada   │
│  ❌ Bruno — canceló (Viaje)     │
│  🙋 Carla — apuntada, por aprobar│
└─────────────────────────────────┘
```
- Motivos rápidos (un toque) + "Otro" para escribir. La idea es informar, no justificarse.

**Detalles:**
- 🙋 Es **voluntario**: la gente elige cuándo puede servir (menos carga para el pastor).
- 👥 Varios por fecha = equipo de aseo; funciona como un grupo de aseo abierto.
- ✅ El pastor solo **aprueba**, no elige a dedo.
- 🔔 Usa el mismo calendario y notificaciones que el resto de la app.
- 🔑 Permisos: cualquier feligrés se apunta; el pastor (o un "encargado de aseo") aprueba.
- El modelo "el líder asigna directo + aceptar/No puedo con motivo" sigue disponible para ministerios que se asignan a dedo (ej. música, sonido).
- Ubicación en el plan: V2 (junto al módulo de voluntariado/rotación).

### 9.2 Pasar la ofrenda (asignado por el pastor)

El pastor asigna a feligreses concretos para pasar la ofrenda en una reunión. Es modelo **asignado** (a dedo), no voluntario.
```
┌─────────────────────────────────┐
│  💰 OFRENDA · Dom 28 Jun        │
│  ¿Quién pasa la ofrenda?        │
│   [✓] Pedro Ruiz                │
│   [✓] Luis Mora                 │
│   [ + Agregar ]                 │
│  [ Asignar y avisar 📤 ]        │
└─────────────────────────────────┘
```
- Aparece en "Mi semana" del asignado: "💰 Dom 28 Jun · Pasar la ofrenda".
- El asignado puede **Aceptar / No puedo (con motivo)**.
- Solo el pastor (o líder delegado) asigna.

### 9.3 Música y otros asignados

- La **música NO es voluntaria**: la asigna el **líder del cuerpo de música** (no el pastor), eligiendo músicos concretos por servicio (ver Sección 7, Módulo de Músicos).
- Igual que la ofrenda, sigue el modelo **asignado + aceptar/No puedo con motivo**.

### 9.4 Agradecer a quien sirve

Tras un turno/servicio, se reconoce a quienes sirvieron (aseo, ofrenda, música…), con casi cero esfuerzo.
```
┌─────────────────────────────────┐
│  🙌 GRACIAS POR SERVIR          │
│  Aseo · Sáb 4 Jul               │
│  Sirvieron: Ana, Bruno, Carla   │
│  [ Enviar agradecimiento 💌 ]   │
│  [ ] Publicarlo para todos      │
└─────────────────────────────────┘
```
- Envía un "💌 ¡Gracias por servir!" a quienes participaron.
- Opcional: publicarlo en un muro/anuncio para que todos lo vean.
- Motiva a voluntarios y asignados sin esfuerzo.

### 9.5 Servicios de la reunión y módulo "Mi Servicio"

Para cada reunión, el **pastor asigna** quién hace cada servicio y **a cada uno se le avisa en la app**:
- 🎤 **Predicar** (predicador del día)
- 🙏 **Devocional**
- 💰 **Ofrenda** (ver 9.2)
- 🎵 **Música** → la asigna el **líder del cuerpo de música** (no el pastor)

**Pantalla — El pastor asigna los servicios de la reunión:**
```
┌─────────────────────────────────┐
│  📋 REUNIÓN · Dom 28 Jun        │
│  Asignar servicios:             │
│  🎤 Predicar  → [ Joaquín ]  ✎  │
│  🙏 Devocional→ [ María ]    ✎  │
│  💰 Ofrenda   → [ Pedro, Luis]✎ │
│  🎵 Música    → (la asigna el   │
│      líder de música)           │
│  📄 Rúbrica: orden-servicio.pdf │
│  [ Asignar y avisar 📤 ]        │
└─────────────────────────────────┘
```

**Módulo "Mi Servicio" (lo que ve cada feligrés):**
Todo lo que el pastor le asigne **aparece en su calendario / "Mi semana"** y, además, agrupado en un módulo **"Mi Servicio"**:
```
┌─────────────────────────────────┐
│  🙌 MI SERVICIO                 │
│  Lo que te toca:                │
│  🎤 Dom 28 Jun · Predicar       │
│     📄 Ver rúbrica              │
│     [ Acepto ] [ No puedo ]     │
│  💰 Dom 5 Jul · Ofrenda         │
│  🧹 Sáb 11 Jul · Aseo           │
└─────────────────────────────────┘
```
- Cada asignación **avisa en la app** (notificación) y aparece en el calendario.
- El asignado puede **Aceptar / No puedo (con motivo)**.
- "Mi Servicio" reúne en un solo lugar todo lo que le toca servir (predicar, ofrenda, devocional, aseo, música…).

---

## 10. Módulo de Cuidado Pastoral

Convierte los datos de la app (asistencia, ausentes) en **acción para cuidar a las personas**. Muy **sensible** → privado, **solo el pastor**.

**Qué hace:**
- Cada persona puede tener un **caso de cuidado** con su motivo e historial de contactos.
- Se alimenta de la **alerta de ausentes** (6.9).
- El pastor **registra el seguimiento** (visitas, llamadas, oración) + **recordatorios** para no olvidar.

**Pantalla — Panel de cuidado:**
```
┌─────────────────────────────────┐
│  ❤️ CUIDADO PASTORAL            │
│  Necesitan atención (8)         │
│  🔴 Juan Pérez · ausente 4   ›  │
│  🔴 Flia. Gómez · enfermedad ›  │
│  🟠 Ana López · nueva        ›  │
│  🟡 Luis Mora · en crisis    ›  │
│  Filtros: Ausentes·Enfermos·Nuevos│
│  [ + Nuevo caso de cuidado ]    │
└─────────────────────────────────┘
```

**Pantalla — Detalle de la persona:**
```
┌─────────────────────────────────┐
│ ‹ Juan Pérez                    │
│  📞 Llamar   💬 WhatsApp        │
│  Motivo: Ausente 4 reuniones    │
│  HISTORIAL DE CUIDADO           │
│  📞 20 Jun · Llamada            │
│     "Está enfermo, oramos"      │
│  🏠 14 Jun · Visita             │
│  [ + Registrar contacto ]       │
│  🔔 Recordar seguimiento: 27 Jun│
│  [ ✓ Marcar como atendido ]     │
└─────────────────────────────────┘
```

**Pantalla — Registrar contacto:**
```
┌─────────────────────────────────┐
│  + REGISTRAR CONTACTO           │
│  Tipo: 📞 Llamada · 🏠 Visita · │
│        💬 Mensaje · 🙏 Oración  │
│  Nota: ________________________  │
│  🔔 Programar seguimiento: [📅] │
│  [ Guardar ]                    │
└─────────────────────────────────┘
```

**Pantalla — Nuevo caso:**
```
┌─────────────────────────────────┐
│  + NUEVO CASO                   │
│  Persona: [ 🔍 buscar ]         │
│  Motivo: ◯Enfermo ◯Ausente      │
│          ◯Nuevo ◯Crisis ◯Duelo  │
│  [ Crear caso ]                 │
└─────────────────────────────────┘
```

**Estados del caso:** 🆕 Abierto → 🔄 En seguimiento → ✅ Atendido (cerrado).

**Conexiones:**
- Desde la alerta de ausentes (6.9): un toque crea el caso.- Recordatorios para que el seguimiento no se olvide.

**Privacidad (clave):**
- **Solo el pastor** ve los casos de cuidado (no se delega a líderes).
- Notas confidenciales + auditoría.
- Nunca visible para feligreses ni líderes.

**Ubicación en el plan:** V2 (depende de tener asistencia/ausentes funcionando).

---

## 11. Módulo de Niños / Escuela Dominical

Para los **líderes/maestros de Escuela Dominical**: ver su material y organizar sus clases. Maneja datos de menores → **sensible y seguro**.

**Qué hace:**
- **Clases por edad** (cunas, párvulos, primarios…).
- **Material/currículo** por domingo: lección, manualidad, canto, versículo (ver/descargar).
- **Organizar:** rotación de maestros + calendario de lecciones.
- **Lista de niños** + asistencia (los niños NO usan facial; el maestro registra).
- **Check-in/out seguro:** solo un adulto autorizado recoge al niño (código de retiro).

**Pantalla — Inicio del maestro:**
```
┌─────────────────────────────────┐
│  👶 ESCUELA DOMINICAL           │
│  Este domingo · 28 Jun          │
│  Tu clase: Primarios (6-8 años) │
│  📖 Lección: "David y Goliat"   │
│     [ Ver material ]            │
│  👥 12 niños · [ Tomar asistencia]│
└─────────────────────────────────┘
```

**Pantalla — Material / currículo:**
```
┌─────────────────────────────────┐
│ ‹ MATERIAL · Primarios          │
│  Dom 28 Jun · David y Goliat    │
│   📄 Lección (PDF)         ↓    │
│   🎨 Manualidad            ↓    │
│   🎵 Canto "Yo tengo fe"   ▶    │
│   📖 Versículo: 1 Sam 17:47     │
│  PRÓXIMAS: 5 Jul Daniel · 12 Jul│
└─────────────────────────────────┘
```

**Pantalla — Organizar (rotación de maestros):**
```
┌─────────────────────────────────┐
│ ‹ ORGANIZAR · Primarios         │
│  28 Jun → Ana (tú)              │
│  5 Jul  → Bruno                 │
│  12 Jul → ⚠️ sin asignar        │
│  [ + Asignar maestro ]  🔁      │
└─────────────────────────────────┘
```

**Pantalla — Asistencia + salida segura:**
```
┌─────────────────────────────────┐
│ ‹ Primarios · Asistencia 28 Jun │
│  👧 Sofía Gómez    [✓ presente] │
│     🔒 recoge: mamá (Ana)       │
│  👦 Mateo Ruiz     [✓ presente] │
│  👧 Lucía Mora     [ ausente ]  │
│  [ Guardar ] · 🔒 código retiro │
└─────────────────────────────────┘
```

**Pantalla — Perfil del niño:**
```
┌─────────────────────────────────┐
│ ‹ Sofía Gómez · 7 años          │
│  Clase: Primarios · Flia. Gómez │
│  Autorizados a recoger:         │
│   • Ana (mamá) · Carlos (papá)  │
│  ⚠️ Alergias/notas: ninguna     │
│  Asistencia: 9 de 10            │
└─────────────────────────────────┘
```

**Lo clave:**
- 👶 Material listo por domingo → el maestro solo prepara.
- 🔁 Organización de maestros y lecciones (rotación + calendario).
- 🔐 Check-in/out seguro: solo un adulto autorizado recoge al niño.
- 🛡️ Sensible: solo líderes de ED + pastor; datos de menores protegidos.
- 🧩 La asistencia de aquí alimenta el conteo "niño asistido" del sistema general.
- Quién sube el material: coordinador/pastor; el maestro lo consulta y puede añadir recursos.

**Ubicación en el plan:** V3 (delicado, por la seguridad de menores).

---

## 12. Módulo de Tesorería

El más delicado (dinero + datos sensibles). Para el **tesorero** y el pastor. Prioriza claridad + **seguridad máxima**. Va en **V3**.

**Importante:** la ofrenda/diezmo se da de forma **presencial**; el tesorero la registra. La app **NO recibe pagos** ni hace cobros en línea. El módulo es solo para **llevar la contabilidad y dar transparencia** de lo recaudado.

**Qué hace:**
- Registra **ingresos** (ofrendas, diezmos, donaciones) y **egresos/gastos** (con comprobante).
- Muestra **saldo y balance** del mes.
- **Campañas con meta** y barra de progreso.
- **Reportes** mensuales (exportar PDF).
- **Reporte de transparencia** público (sin datos personales).

**Pantalla — Panel:**
```
┌─────────────────────────────────┐
│  💰 TESORERÍA · Junio           │
│  Saldo actual:  $12,450         │
│  Ingresos: $4,200 ↑ · Egresos: $2,800 ↓│
│  Balance: +$1,400               │
│  [ + Ingreso ]  [ + Gasto ]     │
│  Campañas · Reportes · Diezmos  │
└─────────────────────────────────┘
```

**Pantalla — Registrar ingreso:**
```
┌─────────────────────────────────┐
│  + INGRESO                      │
│  Tipo: ◯Ofrenda ◯Diezmo ◯Donación│
│  Monto: $____ · Fecha: Hoy      │
│  Fuente: Servicio dominical     │
│  (Diezmo) Persona: [ opcional ] │
│  [ Guardar ]                    │
└─────────────────────────────────┘
```

**Pantalla — Registrar gasto (con comprobante):**
```
┌─────────────────────────────────┐
│  + GASTO                        │
│  Categoría: ◯Servicios ◯Aseo ◯Eventos ◯Ayuda│
│  Monto: $____ · Descripción: ___ │
│  📎 Comprobante (foto del recibo)│
│  [ Guardar ]                    │
└─────────────────────────────────┘
```

**Pantalla — Campañas con meta:**
```
┌─────────────────────────────────┐
│  🎯 CAMPAÑAS                    │
│  Techo nuevo  $3,200/$5,000     │
│   ████████░░░░░  64%            │
│  Misiones  $800/$1,000 ████████░ 80%│
│  [ + Nueva campaña ]            │
└─────────────────────────────────┘
```

**Pantalla — Reportes:**
```
┌─────────────────────────────────┐
│ ‹ REPORTES · Junio 2026         │
│  Ingresos: $4,200 (Ofrendas $2,500 · Diezmos $1,700)│
│  Egresos:  $2,800 (Servicios $1,200 · Eventos $900)│
│  Balance:  +$1,400              │
│  [ Exportar PDF ] [ Compartir ] │
└─────────────────────────────────┘
```

**Pantalla — Transparencia (pública, sin datos personales):**
```
┌─────────────────────────────────┐
│  🔓 TRANSPARENCIA · Junio       │
│  Recaudado: $4,200              │
│  Usado en: ⚡Servicios 43% · 🎉Eventos 32% · ❤️Ayuda 25%│
│  Saldo general: $12,450         │
└─────────────────────────────────┘
```

**Seguridad (lo más importante):**
- Acceso ultra restringido: solo **tesorero y pastor**.
- **Diezmos por persona = ultra confidencial** (opcional recibo para el dador).
- **2FA + re-autenticación** para cada movimiento sensible.
- **Auditoría:** queda registrado quién hizo cada ingreso/gasto.
- La transparencia se comparte sin datos personales (solo totales y %).

**Ubicación en el plan:** V3 (al final, cuando la base esté sólida y segura).

---

## 13. Mejoras y funciones adicionales (aprobadas 25/06/2026)

Seleccionadas para sumar tras el núcleo. La mayoría en V2; las de alcance/finanzas en V3.

### 13.A Mejoras a módulos existentes
| Mejora | Qué hace | Cómo |
|--------|----------|------|
| Fechas no disponibles | La persona marca los días que no puede servir | En su perfil; al asignar/aprobar, el sistema la excluye o avisa |
| Presupuesto vs real | Compara lo gastado con lo planeado | Tesorería: presupuesto por categoría → panel gastado/presupuestado |
| Tendencia por persona | Muestra la asistencia individual en el tiempo | Gráfica por persona; detecta enfriamiento antes del umbral |
| Plantillas de servicio/setlist | Reutiliza órdenes y setlists | Guardar como plantilla y cargarla en segundos |
| Alertas en Niños | Avisa ratio maestro/niño y alergias | Si faltan maestros para los niños presentes, o si un niño tiene alergia |

### 13.B Funciones transversales
| Función | Qué hace | Cómo |
|---------|----------|------|
| Búsqueda global | Encuentra personas, eventos, cantos | Buscador único respetando permisos del rol |
| Notificaciones push | Avisa al teléfono con la app cerrada | Push (FCM/APNs) |
| Modo offline general | Ver calendario, letras y Mi Servicio sin red | Cache local + sincroniza al reconectar |
| Sincronizar calendario | Eventos en el calendario del teléfono | Exporta feed iCal del usuario (Google/Apple) |
| Accesibilidad + letra grande | Facilita el uso a mayores/baja visión | Texto escalable, alto contraste, lectores de pantalla |
| Multi-idioma | App en varios idiomas | Textos traducibles, elegibles por usuario |

### 13.C Participación y vida espiritual
| Función | Qué hace | Cómo |
|---------|----------|------|| Devocional + planes de lectura | Hábito diario | Contenido del día + planes 30/90/365 con racha |
| Cumpleaños de la semana | Une a la comunidad | Avisa los cumpleaños próximos |
| Encuestas/votaciones | Decidir rápido | Pregunta + opciones; resultados en vivo |
| Perfil familiar | Vincula a la familia | Papás + hijos en una cuenta; ayuda en niños y asistencia |

### 13.D Notificaciones push (diseño detallado)

**Disparadores (qué notifica y a quién):**
| Evento | A quién | Prioridad |
|--------|---------|-----------|
| Te asignaron un servicio | A esa persona | Alta |
| Solicitud de fecha | Pastor | Alta |
| Fecha aprobada/rechazada | Líder que pidió | Alta |
| Nuevo evento de tu grupo | Miembros del grupo | Media |
| Recordatorio (1 día antes) | Confirmados/asignados | Media |
| Anuncio urgente | Todos | Urgente |
| Aseo aprobado | El voluntario | Media |
| Gracias por servir | Quien sirvió | Baja |
| Ausente (cuidado) | Pastor | Media |
| Cumpleaños | Según config | Baja |

**Notificación en el teléfono (app cerrada):** título + texto corto; al tocarla, deep link abre la pantalla exacta (ej. "Mi Servicio").

**Centro de notificaciones (in-app):**
```
┌─────────────────────────────────┐
│  🔔 NOTIFICACIONES        ⚙️    │
│  HOY                            │
│  🎤 Te toca predicar Dom 28  ›  │
│     hace 2h · [Acepto][No puedo]│
│  ✅ Tu fecha del 20 aprobada ›  │
│  ANTES                          │
│  🔴 Servicio especial domingo › │
│  [ Marcar todo como leído ]     │
└─────────────────────────────────┘
```
Con **acciones rápidas** (Acepto/No puedo) desde la notificación.

**Configuración (no saturar):**
```
┌─────────────────────────────────┐
│  ⚙️ NOTIFICACIONES              │
│  Push en este teléfono   [ ON ] │
│  🙌 Mi servicio [ON] · 📅 Eventos [ON]│
│  📢 Anuncios [ON] · 🎂 Cumpleaños [OFF]│
│  Silenciar grupos: 🟦 🎵 ...    │
│  🌙 No molestar: 10PM – 7AM     │
└─────────────────────────────────┘
```

**Reglas (clave):**
- Solo lo accionable o relevante; **agrupar** en vez de muchos avisos sueltos.
- Respeta "No molestar"; silenciable por categoría y por grupo; las urgentes siempre pasan.

**Cómo funciona técnicamente:**
```
1. El teléfono registra un TOKEN push (FCM Android · APNs iPhone · Web Push)
2. Ocurre un evento → 3. el backend busca destinatarios (rol/pertenencia/iglesia)
4. Revisa sus preferencias (categoría, no molestar) → 5. envía solo a quien corresponde
6. Al tocarla → deep link a la pantalla exacta
```
- Multi-iglesia: solo a usuarios de esa iglesia.
- Respeta permisos: nunca llega un aviso de un módulo que no te toca.
- Ubicación en el plan: V1/V2 (base técnica temprana, los avisos crecen con cada módulo).

### 13.E Fechas no disponibles (diseño detallado)

Cada persona marca cuándo NO puede servir, para que no se le asigne (o se avise) en esos días. Aplica a **todos los turnos** (música, ofrenda, predicar, devocional, aseo).

**Pantalla — El feligrés marca sus fechas:**
```
┌─────────────────────────────────┐
│  🚫 FECHAS NO DISPONIBLES       │
│  ‹ Julio 2026 ›                 │
│  ... 11 [12][13] 14 ...         │
│  Mis bloqueos:                  │
│   • 12-13 Jul · Viaje           │
│   • Todos los martes · Trabajo  │
│  [ + Agregar fecha o rango ]    │
└─────────────────────────────────┘
```

**Pantalla — Agregar fecha o rango:**
```
┌─────────────────────────────────┐
│  + NO DISPONIBLE                │
│  Desde: [ 12 Jul ] Hasta: [13 Jul]│
│  Motivo (opcional): Viaje       │
│  🔁 Repetir: ◯ No  ◉ Cada martes│
│  [ Guardar ]                    │
└─────────────────────────────────┘
```
Admite un día, un rango (vacaciones) o recurrente (cada martes).

**Pantalla — Al asignar, el líder lo ve:**
```
┌─────────────────────────────────┐
│  💰 OFRENDA · Dom 12 Jul        │
│   [ ] Pedro Ruiz                │
│   [ ] Luis Mora  🚫 no disponible (viaje)│
│   [ ] Ana López                 │
│  [ Asignar y avisar 📤 ]        │
└─────────────────────────────────┘
```
Si lo asigna igual → aviso ("Luis no está disponible el 12 Jul. ¿Asignar de todos modos?"). No bloquea, solo avisa.

**Reglas y conexiones:**
- Aplica a todos los turnos asignados; avisa también en el aseo voluntario si se apunta a un día bloqueado.
- No bloquea, solo avisa → el pastor/líder decide.
- Conecta con notificaciones: no se notifica un turno en un día marcado no disponible.
- Privacidad: el motivo es opcional; el líder solo ve "no disponible" (y el motivo si la persona lo escribió).
- Sugerencia inteligente: la app propone primero a quienes sí están disponibles.
- Ubicación en el plan: V2.

---

## 14. Catálogo de ideas y mejoras (48 ideas con su porqué)

Banco completo de funciones e ideas propuestas para la app, organizadas por categoría. Cada una incluye **por qué** vale la pena. No todas van en la versión 1: ver la priorización al final de esta sección.

### A) Módulos nuevos grandes
| # | Idea | Por qué |
|---|------|---------|
| 2 | **Seguimiento pastoral / cuidado** — líderes registran visitas, llamadas, seguimiento (enfermos, familias ausentes). Privado. | Convierte la app en herramienta real de ministerio, no solo de avisos. |
| 3 | **Voluntariado / rotación de servidores** — ujieres, sonido, limpieza, niños, recepción. Calendario de "quién sirve este domingo". | Resuelve el mismo dolor del módulo música, pero para TODOS los ministerios. |
| 4 | **Biblioteca de recursos** — predicaciones, estudios en PDF, audios, enlaces, por tema o serie. | Centraliza el contenido espiritual en un solo lugar. |
| 5 | **Directorio de miembros** — contactos con foto (con consentimiento) y controles de privacidad. | Ayuda a líderes a ubicar a su gente. |

### B) Mejoras a lo que ya existe
| # | Idea | Por qué |
|---|------|---------|
| 6 | **Plantillas de eventos recurrentes** — servicio dominical, ensayo, reunión: se crean como plantilla y se generan solos. | Ahorra muchísimo trabajo a los líderes. |
| 7 | **Eventos con inscripción** — cupos limitados, lista de inscritos, costo (retiros, cenas). | Distinto a un simple "asistiré"; necesario para eventos grandes. |
| 8 | **Recordatorios en cadena** — al publicar → 2 días antes → 2 horas antes. Configurable. | Sube la asistencia real. |
| 9 | **Calendario unificado con filtros** — ver "todo" o filtrar por grupo; detecta choques de horario. | Orden y claridad; evita cruces de eventos. |

### C) Participación y comunidad
| # | Idea | Por qué |
|---|------|---------|
| 10 | **"Mi semana" — inicio personalizado** — lo primero que ve cada quien: sus ensayos, servicios y reuniones resumidos. | **La pantalla más importante de la app:** responde "¿qué me toca?". |
| 11 | **Devocional / versículo del día con racha** — hábito diario suave, sin presionar. | Fomenta abrir la app cada día. |
| 12 | **Reacciones y comentarios en anuncios** — "amén", agradecer, comentar. | Comunicación de ida y vuelta, no un tablón muerto. |
| 13 | **Cumpleaños y aniversarios** — avisos de la semana. | Calidez y comunidad, casi gratis. |

### D) Inteligencia / automatización
| # | Idea | Por qué |
|---|------|---------|
| 14 | **Centro de notificaciones unificado** — bandeja con todos los avisos; silenciar por grupo. | Evita saturación y pérdida de avisos. |
| 15 | **Estados de asistencia inteligentes** — recordatorio suave a quien no confirma; si un músico no está disponible, no aparece al asignar. | Evita errores y trabajo manual. |
| 16 | **Reportes automáticos para el pastor** — resumen mensual: eventos, asistencia, grupos activos. | Ayuda a tomar decisiones. |

### E) Detalles que hacen que la usen de verdad
| # | Idea | Por qué |
|---|------|---------|
| 17 | **Onboarding simple** — eliges tu grupo y la app se configura sola. | Reduce la barrera de entrada. |
| 18 | **Modo personas mayores** — letra grande, pantallas simplificadas. | Muchos usuarios serán mayores. |
| 19 | **Multi-idioma** — si la congregación lo necesita. | Inclusión. |
| 20 | **Compartir hacia afuera** — un evento se comparte por WhatsApp con un toque. | Integrarse con WhatsApp en vez de competir. |
| 21 | **Funciona offline** — calendario y letras sin señal. | En el templo a veces no hay buena señal. |

### F) Comunicación más rica
| # | Idea | Por qué |
|---|------|---------|
| 22 | **Mensajería interna por grupo** — chat simple con historial ordenado. | Conversaciones ordenadas sin salir a WhatsApp. |
| 23 | **Encuestas y votaciones** — "¿qué día el retiro?", resultados visibles. | Decisiones rápidas y participación, bajo esfuerzo. |
| 24 | **Anuncios con prioridad/urgencia** — destacados en rojo, notifican al instante. | Resuelve casos críticos (ej: suspensión de servicio). |
| 25 | **Tablón de testimonios** — compartir testimonios de fe. | Anima y alimenta a la congregación. |

### G) Familia, niños y nuevos
| # | Idea | Por qué |
|---|------|---------|
| 26 | **Módulo de niños / Escuela Dominical** — registro, clases, y check-in/check-out seguro. | Seguridad de menores: solo el responsable autorizado los recoge. |
| 27 | **Recepción de visitantes nuevos** — tarjeta digital de bienvenida + seguimiento. | Convierte visitas en miembros: hace crecer la iglesia. |
| 28 | **Perfil familiar** — padres + hijos en una cuenta. | Los papás gestionan lo de sus hijos. |
| 29 | **Camino del nuevo creyente** — pasos (bautismo, clases, integración) con progreso. | Acompaña la integración de nuevos. |

### H) Ofrendas y finanzas
| # | Idea | Por qué |
|---|------|---------|| 31 | **Campañas con meta visible** — barra de progreso ("Meta techo: $5,000"). | Motiva a participar. |
| 32 | **Reporte de transparencia** — resumen general de uso de fondos (sin datos personales). | Genera confianza. |

### I) Crecimiento espiritual
| # | Idea | Por qué |
|---|------|---------|
| 33 | **Planes de lectura bíblica** — 30/90/365 días con seguimiento. | Hábito espiritual personal. |
| 34 | **Notas de la predicación** — tomar notas en la app; opcional bosquejo del pastor. | Hábito que hace abrir la app cada domingo. |
| 35 | **Letras del servicio para todos** — la congregación ve las letras y canta. | Participación, no solo los músicos. |
| 36 | **Calendario litúrgico / temático** — series de predicación, tiempos especiales. | Da contexto y continuidad. |

### J) Herramientas de administración
| # | Idea | Por qué |
|---|------|---------|
| 37 | **Gestión de recursos/espacios** — reservar salón, cañón, instrumentos. | Evita que dos grupos choquen por el mismo recurso. |
| 38 | **Inventario** — registro de bienes de la iglesia. | Control de equipos y materiales. |
| 39 | **Exportar e imprimir (PDF)** — orden del servicio, calendario. | A muchos aún les gusta el papel. |
| 40 | **Roles temporales / suplencias** — "esta semana Juan cubre como líder". | Flexibilidad sin cambiar permisos permanentes. |

### K) Confianza, seguridad y soporte
| # | Idea | Por qué |
|---|------|---------|
| 41 | **Respaldo en la nube** — nada se pierde si se daña un teléfono. | Seguridad de la información. |
| 42 | **Registro de actividad (auditoría)** — quién cambió qué, sobre todo en finanzas. | Transparencia y control. |
| 43 | **Consentimiento de datos** — aceptar uso de datos al registrarse. | Importante legal y éticamente. |
| 44 | **Modo "solo lo mío"** — silenciar todo menos lo personal. | Para quien se satura con notificaciones. |

### L) Diferenciadores (lo que la haría especial)
| # | Idea | Por qué |
|---|------|---------|
| 45 | **Pantalla de proyección** — proyectar letras/anuncios sincronizados con el servicio. | Reemplaza software de proyección aparte. |
| 46 | **Modo "en vivo" del servicio** — el líder avanza el orden y todos lo siguen. | Útil para sordos o quien llega tarde. |
| 47 | **Accesibilidad real** — lectores de pantalla, alto contraste, subtítulos. | Incluye a personas con discapacidad. |
| 48 | **App liviana** — funciona en teléfonos viejos y con poca memoria. | Clave en muchas congregaciones. |

### Recomendación de prioridad (las "estrellas")
**Mayor impacto / menor esfuerzo — sumar pronto:**
- #10 "Mi semana" (inicio personalizado) — la cara de la app.
- #6 Plantillas recurrentes — ahorra trabajo enorme.
- #3 Voluntariado/rotación — extiende el éxito de música a todos.- #13 Cumpleaños — calidez instantánea, casi gratis.
- #24 Anuncios urgentes — caso crítico, muy fácil.
- #27 Recepción de visitantes — hace crecer la iglesia.
- #37 Reserva de recursos/espacios — evita el choque más común.
- #23 Encuestas — participación rápida, bajo esfuerzo.
- #34 Notas de predicación — hábito dominical.

**Construir al final (delicado o no urgente):**
- Niños con check-in (#26): valioso pero sensible (seguridad de menores).
- Directorio (#5) y reportes (#16): útiles pero no urgentes.
- Todo el módulo de tesorería.

---

## 15. Plan de construcción por versiones

### Versión 1 — Lo esencial (MVP)
1. Usuarios con grupos, roles y **pertenencias múltiples** (permisos por grupo)
2. Calendario: ver eventos de sus grupos + **calendario completo para líderes**
3. **Solicitar fecha** (líder) → **aprobación del pastor** → reserva temporal
4. Anuncios
5. Notificaciones/recordatorios

### Versión 2 — Valor extra
6. **Sistema de asistencia** (lista + conteo + auto check-in) y reportes
7. Confirmar asistencia (RSVP)
8. Pantalla **"Mi semana"** (inicio personalizado)
9. Módulo de músicos (cancionero + orden del servicio)
10. Devocional diario

### Versión 3 — Lo delicado (al final)
11. Módulo de niños / Escuela Dominical (check-in seguro de menores)
12. Módulo de tesorería (necesita máxima seguridad y privacidad)
---

## 16. Cuidados importantes

- **Privacidad de datos** (finanzas y datos personales): definir bien quién ve qué.
- **Simplicidad**: muchos usuarios serán personas mayores; la app debe ser muy fácil.
- **Tesorería al final**: maneja dinero y datos sensibles; construir cuando la base ya funcione.

### 16.1 Seguridad de cuentas y acceso (M11)

Cómo entra cada persona y cómo se protege su cuenta. Es la base técnica que sostiene todos los permisos.

**Acceso (login en 3 pasos · decidido 25/06/2026):**
1. **Iglesia** — nombre o **código único** de la iglesia (buscador con lista + código de respaldo).
2. **Feligrés** — **nombre de usuario único** dentro de esa iglesia (evita choques si hay dos personas con el mismo nombre).
3. **Contraseña**.

- Opción de abrir la app con **PIN o biometría del propio teléfono** (huella/Face ID del celular) para no escribir la clave cada vez.
- Onboarding: al registrarse, elige su(s) grupo(s) → la app le asigna su rol según las pertenencias.

**Multi-iglesia (datos aislados · multi-tenant):**
- Cada iglesia es un **espacio cerrado**: todo lleva un `iglesia_id` y **los datos NUNCA se cruzan** entre iglesias.
- Miembros, grupos, eventos, asistencia, anuncios y **rostros (embeddings)** están separados por iglesia.
- **El facial solo compara dentro de la misma iglesia** → más rápido, más privado y sin confundir personas de otra congregación.
- El pastor solo administra su propia iglesia.
- Detalles a definir en construcción: cómo se elige la iglesia (buscador vs código) y el identificador único del feligrés (usuario / teléfono / lista con foto).

**Contraseñas:**
- Guardadas con **hash** (bcrypt/argon2), nunca en texto plano.
- Mínimo de seguridad razonable (longitud), sin exigencias que confundan a usuarios mayores.

**Recuperación de cuenta:**
- "Olvidé mi contraseña" → código temporal por **correo o SMS**.
- El pastor/admin puede ayudar a reestablecer el acceso de un miembro.

**Sesiones:**
- Token de sesión con expiración; opción de **cerrar sesión** en un dispositivo.

**Protección reforzada (cuentas con más poder):**
- **2FA opcional** (segundo factor) para **pastor/admin y tesorería**.
- Acciones sensibles (finanzas, borrar datos biométricos, cambiar roles) piden **re-autenticación**.

**Datos sensibles:**
- Biometría (embeddings) y finanzas: cifrados y detrás de permisos estrictos.
- **Registro de actividad (auditoría)** de quién cambió qué en lo sensible.

> Regla: la seguridad debe ser **fuerte por dentro pero invisible por fuera** — proteger los datos sin complicarle la vida al feligrés.

### 16.2 Política de datos: retención y respaldo (M8)

- **Retención (B · Media):** los datos se guardan **mientras exista la cuenta**; se borran si la persona lo pide o al **cerrar su cuenta** (al irse de la iglesia se borra también su código facial, para no acumular rostros de quien ya no asiste).
- **Borrado:** botón "Borrar mi rostro" en el perfil + baja de cuenta.
- **Backup (auto-hospedado):** servidor propio con **copias de respaldo programadas y cifradas** a otro disco/nube. Requiere un responsable técnico (ver rol de soporte).
- **Frames:** nunca se guardan (solo el código facial cifrado).

---

## 17. Preguntas abiertas (por definir)

**Resueltas (25/06/2026):**
- [x] Inscripción de ~1000 rostros (M9) → **a cargo del responsable del proyecto**.
- [x] Costos (N6) → **ya estimados por el responsable del proyecto**.

**Pendientes (bloquean el arranque):**
- [ ] **Nombre** de la app (N7).
- [ ] **Plataforma** (Android, iPhone, web, o varias) (N7).
- [ ] **Quién la construye** (programador, herramienta sin código, etc.) (N7).
- [ ] **Rol de soporte/técnico** (N2): quién mantiene servidor, backups y sistema facial.

**Menores (módulo música):**
- [ ] ¿El equipo lee acordes o toca de oído? (define si vale la transposición)
- [ ] ¿Qué cuesta más hoy al equipo de música?

---

## 18. Próximos pasos posibles

- Detallar la pantalla "+ Agregar canto" (búsqueda en el cancionero)
- Diseñar la versión simple sin acordes (solo letra + tono + YouTube)
- Diseñar la pantalla principal del líder/pastor
- Diseñar el módulo de calendario
- Definir opciones técnicas y costos para construir el MVP
