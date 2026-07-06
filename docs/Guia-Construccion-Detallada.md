# 🛠️ GUÍA DE CONSTRUCCIÓN DETALLADA — App de Iglesia
*25 de junio de 2026 · Para empezar a construir*

---

## 0. 🧰 Tecnología recomendada (stack)

| Capa | Recomendación | Por qué |
|------|---------------|---------|
| **App (móvil + web)** | **Flutter** | Un solo código para Android, iPhone y web |
| **Backend + lógica** | **Django (Python)** | Trae auth, ORM, panel admin y permisos; mismo lenguaje del facial |
| **Base de datos** | **PostgreSQL** | Relacional, ideal para roles, multi-iglesia y contabilidad |
| **Notificaciones push** | **Firebase Cloud Messaging (FCM)** | Gratis, Android + iPhone + web |
| **Archivos** (rúbricas, material, comprobantes) | **Storage S3-compatible** | Subir/descargar PDF e imágenes |
| **Hosting** | **VPS** (Hetzner/DigitalOcean) + backups automáticos | Control + auto-hospedado |
| **Facial (Fase 3)** | Servicio **Python + InsightFace/ONNX** | Aparte del backend principal |

> Alternativa para MVP más rápido: **Supabase** (Postgres + auth + storage + push gestionados). Bueno si quieres avanzar veloz; luego agregas el servicio facial en Python.

---

## 1. 🗄️ Modelo de datos (las tablas)

### Núcleo (Fase 1)
```
Iglesia        { id, nombre, codigo_unico, creada_en }
Persona        { id, iglesia_id, usuario, nombre, password_hash, telefono, email,
                 cumple, activo }
Grupo          { id, iglesia_id, nombre, tipo, color }
Pertenencia    { id, persona_id, grupo_id, rol }   // rol: admin | miembro | musico | tesorero...
Evento         { id, iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin,
                 lugar, estado, creado_por }        // estado: pendiente|aprobado|rechazado
Anuncio        { id, iglesia_id, titulo, texto, urgente, creado_por, fecha }
Asignacion     { id, evento_id, persona_id, tipo, estado }
                 // tipo: predicar|ofrenda|devocional|aseo|musica
                 // estado: pendiente|aceptado|rechazado|cumplido
Asistencia     { id, evento_id, persona_id, metodo, fecha }  // metodo: lista|qr|facial
FechaNoDisp    { id, persona_id, desde, hasta, motivo, repetir }
Recurso        { id, iglesia_id, nombre }            // salón, cañón...
DispositivoPush{ id, persona_id, token, plataforma }
Notificacion   { id, persona_id, tipo, titulo, texto, leida, fecha }
Auditoria      { id, iglesia_id, actor_id, accion, modulo, fecha }
```

### Fases 2–3 (se agregan después)
```
Cancionero, OrdenServicio, Ensayo          (Músicos)
CasoCuidado, ContactoCuidado               (Cuidado pastoral)
ClaseED, Nino, AutorizadoRecoger, Leccion  (Niños)
MovimientoTesoreria, Campania              (Tesorería)
BiometriaPersona, NoIdentificado, NinoAsistido  (Facial)
```

> 🔑 **Multi-iglesia:** casi todo lleva `iglesia_id`. Cada consulta filtra por la iglesia del usuario. El **obispo** puede consultar varias; cada acceso suyo se escribe en `Auditoria`.

---

## 2. 🧱 FASE 1A — Fundación técnica (primero esto)

**1. Proyecto base**
- Crear proyecto Django + Postgres; crear proyecto Flutter.
- Conectar app ↔ backend por API REST (JSON).

**2. Login en 3 pasos + multi-iglesia**
- Endpoints: `POST /login` (iglesia + usuario + contraseña) → devuelve token.
- Contraseñas con hash (Django ya lo hace). Token de sesión (JWT).
- Toda consulta filtra por `iglesia_id` del token.

**3. Roles y permisos**
- Al loguear, cargar las **pertenencias** de la persona → qué módulos ve.
- Middleware que valida permiso antes de cada acción.
- Jerarquía: super-admin → obispo (todas) → pastor (su iglesia) → líderes/feligreses.

**4. Notificaciones push**
- La app registra su **token FCM** → `POST /dispositivo`.
- Función central `enviarNotificacion(persona, tipo, texto)` que respeta preferencias.

**5. Auditoría + backups**
- Cada acción sensible escribe en `Auditoria`.
- Backups automáticos diarios del Postgres (cifrados).

✅ **Listo cuando:** una persona puede registrarse, entrar con los 3 pasos, y la app sabe qué puede ver.

---

## 3. 🏠 FASE 1B — MVP (módulo por módulo)

### Módulo A — Calendario + Eventos
- **Datos:** `Evento`.
- **Pantallas:** ver calendario (mis grupos / completo si líder), crear evento, detalle.
- **Endpoints:** `GET /eventos`, `POST /eventos`, `GET /eventos/:id`.
- **Lógica:** líder crea evento de su grupo; detección de choque por franja + recurso.
- ✅ Listo cuando: un líder crea un evento y su grupo lo ve.

### Módulo B — Anuncios + Notificaciones
- **Datos:** `Anuncio`, `Notificacion`.
- **Pantallas:** lista de anuncios, crear anuncio, centro de notificaciones.
- **Endpoints:** `GET /anuncios`, `POST /anuncios`.
- **Lógica:** al publicar → `enviarNotificacion` a los miembros del grupo; urgentes a todos.
- ✅ Listo cuando: el pastor publica y a la gente le llega el push.

### Módulo C — Servicio + Mi Servicio
- **Datos:** `Asignacion`, `FechaNoDisp`.
- **Pantallas:** asignar (pastor), apuntarse al aseo (feligrés), "Mi Servicio", aceptar/no puedo.
- **Endpoints:** `POST /asignaciones`, `PATCH /asignaciones/:id` (aceptar/rechazar), `GET /mi-servicio`.
- **Lógica:** asignado → notifica + aparece en calendario; al asignar revisa `FechaNoDisp`.
- ✅ Listo cuando: el pastor asigna "predicar" y a la persona le llega y aparece en Mi Servicio.

### Módulo D — Asistencia simple (lista / QR)
- **Datos:** `Asistencia`.
- **Pantallas:** tomar asistencia (lista o conteo), QR de auto check-in, resumen.
- **Endpoints:** `POST /asistencia`, `GET /asistencia/:evento`.
- **Lógica:** comparar con la reunión anterior; aún SIN facial.
- **⚠️ Puente temporal:** el **facial (Fase 3) es el método final**; la lista/QR queda como respaldo para salas sin cámara.
- ✅ Listo cuando: un líder registra asistencia y ve el total + comparación.

🚀 **Con A+B+C+D ya tienes una app usable. LANZAR y que se use.**

---

## 4. 📈 FASE 2 — Valor (resumen de qué construir)

| Módulo | Datos clave | Función central |
|--------|-------------|-----------------|
| Solicitar→Aprobar fechas | Evento.estado | Flujo pendiente→aprobado + bandeja del pastor |
| Panel del pastor + ausentes | (de Asistencia) | Estadísticas + detectar quién faltó 3+ |
| Músicos | Cancionero, OrdenServicio, Ensayo | Setlist con tonos + asignación del líder de música |
| Mejoras | FechaNoDisp, plantillas | Fechas no disponibles, búsqueda, presupuesto |
| Cuidado Pastoral | CasoCuidado, ContactoCuidado | Casos + historial (solo pastor) |

---

## 5. 🔬 FASE 3 — Avanzado (resumen)

| Módulo | Lo clave de cómo se hace |
|--------|--------------------------|
| **Facial** | Servicio Python + InsightFace; backend matchea; 2 cámaras; offline con frame cifrado; código no foto |
| **Niños/ED** | Clases, material (archivos), asistencia manual, check-in/out con código de retiro |
| **Tesorería** | Ingresos/gastos (presencial), campañas, reportes, transparencia; 2FA + auditoría |

---

## 6. ✅ Orden de trabajo (checklist)

```
[ ] FASE 0 — objetivo, plataforma, constructor, nombre, validar mockups
[ ] FASE 1A — proyecto base + login 3 pasos + roles + push + auditoría
[ ] FASE 1B — A) Calendario  B) Anuncios  C) Servicio/Mi Servicio  D) Asistencia simple
[ ] 🚀 LANZAR MVP y que se use
[ ] FASE 2 — aprobación de fechas, panel+ausentes, músicos, mejoras, cuidado pastoral
[ ] FASE 3 — facial (piloto), niños, tesorería
```

---

## 7. 🎯 Reglas para no fracasar
1. Construye la **fundación (1A) antes** que cualquier módulo.
2. **MVP pequeño** y lánzalo; no esperes a tenerlo todo.
3. **Facial al final**, como piloto.
4. Cada módulo: define **datos → pantallas → endpoints → lógica → "listo cuando"**.
5. Prueba con **usuarios reales** desde el MVP.
