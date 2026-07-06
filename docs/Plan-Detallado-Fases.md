# 📐 PLAN DETALLADO POR FASES — App de Iglesia
*25 de junio de 2026 · Guía paso a paso para construir*

Leyenda de cada tarea: **Datos** (tablas) · **Pantallas** · **Endpoints** (API) · **Lógica** · **✅ Listo cuando**.

---

# 🟦 FASE 0 — DECISIONES PREVIAS

Objetivo: tener luz verde y todo claro antes de escribir código.

### 0.1 Definir el objetivo
- Opción A: **una sola iglesia** (más simple, recomendado para empezar).
- Opción B: **plataforma multi-iglesia** (más potente, más complejo).
- Decisión: empezar como A pero con la base lista para B (el `iglesia_id` ya queda en el diseño).

### 0.2 Elegir plataforma
- Android, iPhone, web o varias. Recomendado: **Flutter** (las tres con un solo código).

### 0.3 Definir quién construye y presupuesto
- Tú / un programador / un equipo / herramienta no-code.
- Estimar costo de desarrollo + servidor mensual + dominio.

### 0.4 Definir soporte (quién mantiene)
- Persona técnica para servidor, backups, actualizaciones y, más tarde, el facial.

### 0.5 Nombre de la app
- Elegir y reservar (dominio + nombre en tiendas).

### 0.6 Validar con personas reales
- Mostrar los mockups al pastor + 4 miembros (incluido un mayor).
- Anotar qué entienden, qué no, qué pedirían.

**✅ Fase 0 lista cuando:** sabes objetivo, plataforma, quién construye, quién mantiene, nombre, y validaste la idea.

---

# 🧱 FASE 1A — FUNDACIÓN TÉCNICA

Objetivo: el cimiento que sostiene TODOS los módulos. No se ve, pero sin esto no hay nada.

### 1A.1 Proyecto base
- Crear backend (Django + PostgreSQL) y app (Flutter).
- Conectar app ↔ backend con API REST (JSON) sobre HTTPS.
- **✅ Listo cuando:** la app hace un "ping" al backend y responde.

### 1A.2 Modelo de datos núcleo
- **Datos:** crear tablas `Iglesia, Persona, Grupo, Pertenencia, Evento, Anuncio, Asignacion, Asistencia, FechaNoDisp, Recurso, DispositivoPush, Notificacion, Auditoria`.
- **✅ Listo cuando:** las tablas existen y se relacionan (cada una con su `iglesia_id`).

### 1A.3 Login en 3 pasos + multi-iglesia
- **Pantallas:** Paso 1 Iglesia (nombre/código) → Paso 2 Usuario → Paso 3 Contraseña.
- **Endpoints:** `POST /login`, `POST /recuperar`, `POST /logout`.
- **Lógica:** contraseña con hash; devuelve token (JWT) con `persona_id` + `iglesia_id`; toda consulta filtra por esa iglesia.
- **✅ Listo cuando:** una persona entra con los 3 pasos y recibe su token.

### 1A.4 Roles, jerarquía y permisos
- **Lógica:** al entrar, cargar las **pertenencias** → calcular qué módulos ve.
- Jerarquía: super-admin → obispo (todas las iglesias) → pastor (la suya) → líderes/feligreses.
- Middleware que valida permiso antes de cada acción y oculta módulos en la app.
- **✅ Listo cuando:** dos usuarios con roles distintos ven menús distintos.

### 1A.5 Notificaciones push
- **Datos:** `DispositivoPush`.
- **Endpoints:** `POST /dispositivo` (registra token FCM).
- **Lógica:** función central `enviarNotificacion(persona, tipo, titulo, texto)` que respeta preferencias y "no molestar".
- **✅ Listo cuando:** el backend manda un push de prueba y llega al teléfono.

### 1A.6 Auditoría + backups + hosting
- **Datos:** `Auditoria` (actor, acción, módulo, iglesia, fecha).
- Configurar servidor (VPS), HTTPS, y **backups automáticos cifrados** del Postgres.
- **✅ Listo cuando:** una acción sensible queda registrada y hay un backup corriendo.

---

# 🏠 FASE 1B — MVP (la casa pequeña, ya usable)

Objetivo: lo mínimo que resuelve ~70% del dolor. Al terminar → **lanzar**.

## Módulo A — Calendario + Eventos
- **Datos:** `Evento` (titulo, fecha, hora_inicio, hora_fin, lugar, grupo_id, estado, creado_por).
- **Pantallas:**
  - Ver calendario (feligrés ve sus grupos; líder ve completo).
  - Crear evento (líder).
  - Detalle del evento (confirmar asistencia, ver lugar).
- **Endpoints:** `GET /eventos`, `POST /eventos`, `GET /eventos/:id`, `PATCH /eventos/:id`.
- **Lógica:** líder crea evento de su grupo; al elegir fecha+lugar, revisar **choque por franja + recurso** y avisar.
- **✅ Listo cuando:** un líder crea un evento y su grupo lo ve en el calendario.

## Módulo B — Anuncios + Notificaciones
- **Datos:** `Anuncio` (titulo, texto, urgente), `Notificacion`.
- **Pantallas:** lista de anuncios; crear anuncio (líder/pastor); centro de notificaciones; configuración de avisos.
- **Endpoints:** `GET /anuncios`, `POST /anuncios`, `GET /notificaciones`, `PATCH /notificaciones/leer`.
- **Lógica:** al publicar → `enviarNotificacion` a los miembros del grupo; los **urgentes** van a todos al instante.
- **✅ Listo cuando:** el pastor publica un anuncio y a la gente le llega el push.

## Módulo C — Servicio + Mi Servicio
- **Datos:** `Asignacion` (evento_id, persona_id, tipo, estado), `FechaNoDisp`.
- **Pantallas:**
  - Asignar servicios de la reunión (pastor): predicar, ofrenda, devocional.
  - Apuntarse al aseo (feligrés, voluntario) + aprobar (pastor).
  - "Mi Servicio" (lista + estados + historial).
  - Aceptar / No puedo (con motivo).
- **Endpoints:** `POST /asignaciones`, `PATCH /asignaciones/:id`, `GET /mi-servicio`, `POST /aseo/apuntarse`.
- **Lógica:** al asignar → notifica + aparece en calendario; al asignar revisa **FechaNoDisp** y avisa si no está disponible.
- **✅ Listo cuando:** el pastor asigna "predicar" y a la persona le llega y aparece en Mi Servicio.

## Módulo D — Asistencia simple (lista / QR)
- **Datos:** `Asistencia` (evento_id, persona_id, metodo).
- **Pantallas:** elegir método; lista (marcar presente/ausente); conteo rápido; QR de auto check-in; resumen.
- **Endpoints:** `POST /asistencia`, `GET /asistencia/:evento`.
- **Lógica:** guardar asistencia; mostrar total + comparación con la reunión anterior. (SIN facial todavía.)
- **⚠️ Nota:** la asistencia simple es un **puente temporal** para poder lanzar rápido. El **reconocimiento facial (Fase 3) es el método final y definitivo**. Además, la lista/QR queda como **respaldo** para salas sin cámara.
- **✅ Listo cuando:** un líder registra asistencia y ve el total y la comparación.

🚀 **Con A+B+C+D la app ya es usable. LANZAR y que la usen.**

---

# 📈 FASE 2 — VALOR

Objetivo: que la app sea valiosa en el día a día. Construir según el feedback del MVP.

## 2.1 Solicitar → Aprobar fechas
- **Datos:** `Evento.estado` (pendiente/aprobado/rechazado), reserva temporal.
- **Pantallas:** solicitar fecha (líder); bandeja del pastor (aprobar/rechazar con motivo).
- **Lógica:** fecha pendiente reserva la franja; el pastor agrega directo; notificaciones a ambos.
- **✅ Listo cuando:** un líder pide una fecha y el pastor la aprueba desde su bandeja.

## 2.2 Panel del pastor + ausentes
- **Datos:** (de `Asistencia`).
- **Pantallas:** dashboard (asistencia, promedio, tendencia, grupos activos); lista de "se están alejando".
- **Lógica:** calcular quién faltó 3+ reuniones seguidas (umbral configurable).
- **✅ Listo cuando:** el pastor ve sus estadísticas y la lista de ausentes.

## 2.3 Músicos
- **Datos:** `Cancionero, OrdenServicio, Ensayo`.
- **Pantallas:** cancionero; orden del servicio (setlist con tonos + transposición); asignación; ensayos.
- **Lógica:** el **líder de música** asigna; transposición de acordes; modo pantalla.
- **✅ Listo cuando:** el director arma un servicio y los músicos lo ven con sus tonos.

## 2.4 Mejoras
- **Fechas no disponibles** (bloqueos + aviso al asignar).
- **Búsqueda global**, **plantillas de servicio**, **presupuesto vs real** (prep. tesorería), **cumpleaños**, **encuestas**, **perfil familiar**, **modo offline general**, **accesibilidad**.
- **✅ Listo cuando:** cada mejora funciona en su módulo.

## 2.5 Cuidado Pastoral (solo el pastor)
- **Datos:** `CasoCuidado, ContactoCuidado`.
- **Pantallas:** panel de cuidado; detalle de la persona (historial); registrar contacto; nuevo caso.
- **Lógica:** se alimenta de la alerta de ausentes; estados (abierto→seguimiento→atendido); confidencial + auditoría.
- **✅ Listo cuando:** el pastor abre un caso, registra una visita y lo cierra.

---

# 🔬 FASE 3 — AVANZADO (lo delicado, al final)

## 3.1 Asistencia facial
- **Datos:** `BiometriaPersona, NoIdentificado, NinoAsistido`, `Asistencia.metodo='facial'`.
- **Infra:** servicio **Python + InsightFace (`buffalo_l`) + ONNX**; 2 cámaras (puerta + salón).
- **Pasos:** 1) motor (foto→código) · 2) inscripción · 3) matching · 4) kiosko · 5) calibrar umbral · 6) piloto.
- **Lógica:** matching en backend; reconoce → "asistió [nombre]"; no reconocidos → soporte / "niño asistido"; offline con frame cifrado; rostros solo en backend.
- **✅ Listo cuando:** un piloto con un grupo reconoce a la gente y el pastor ve el reporte por fecha.

## 3.2 Niños / Escuela Dominical
- **Datos:** `ClaseED, Nino, AutorizadoRecoger, Leccion`.
- **Pantallas:** inicio del maestro; material/currículo; organizar maestros; asistencia + salida segura; perfil del niño.
- **Lógica:** asistencia manual; check-in/out con código de retiro; datos de menores protegidos.
- **✅ Listo cuando:** el maestro ve su material, toma asistencia y registra el retiro seguro.

## 3.3 Tesorería (contabilidad + transparencia)
- **Datos:** `MovimientoTesoreria, Campania`.
- **Pantallas:** panel; registrar ingreso/gasto (con comprobante); campañas; reportes; transparencia pública.
- **Lógica:** ofrenda **presencial** (el tesorero registra; la app NO cobra); reportes PDF; 2FA + auditoría; diezmos confidenciales.
- **✅ Listo cuando:** el tesorero registra ingresos/gastos y genera un reporte de transparencia.

---

# ✅ CHECKLIST GENERAL

```
FASE 0  [ ] objetivo  [ ] plataforma  [ ] constructor  [ ] soporte  [ ] nombre  [ ] validar
FASE 1A [ ] proyecto base  [ ] datos núcleo  [ ] login 3 pasos  [ ] roles/jerarquía
        [ ] push  [ ] auditoría+backups
FASE 1B [ ] A Calendario  [ ] B Anuncios  [ ] C Servicio/Mi Servicio  [ ] D Asistencia simple
        [ ] 🚀 LANZAR MVP
FASE 2  [ ] aprobar fechas  [ ] panel+ausentes  [ ] músicos  [ ] mejoras  [ ] cuidado pastoral
FASE 3  [ ] facial (piloto)  [ ] niños  [ ] tesorería
```

# 🎯 Reglas para no fracasar
1. **Fundación (1A) antes** que cualquier módulo.
2. **MVP pequeño** y lánzalo; no esperes a tenerlo todo.
3. **Facial al final**, como piloto.
4. Cada módulo: **datos → pantallas → endpoints → lógica → "listo cuando"**.
5. Prueba con **usuarios reales** desde el MVP.
