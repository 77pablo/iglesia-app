# 📱 INFORME CONSOLIDADO — App Organizadora de Iglesia
*Resumen ejecutivo · actualizado 25 de junio de 2026 (v6)*

---

## 1. ¿Qué es?

Una **plataforma multi-iglesia** que centraliza la vida de cada congregación: calendario, eventos, anuncios, servicio y asistencia. Cada persona ve **solo los módulos que su rol le permite**. Es el **"centro de mando" de los organizadores** (pastor, líderes, músicos), con **datos aislados por iglesia**.

**Frase guía:** *"Toda tu iglesia, organizada en un solo lugar."*
**Estilo visual:** Moderno y limpio (azul/turquesa, minimalista).

---

## 2. ¿Para qué sirve? (4 problemas)

| # | Problema | Solución |
|---|----------|----------|
| 1 | Comunicación dispersa | Anuncios + eventos en un solo lugar |
| 2 | Desorden de calendario | Calendario único con aprobación |
| 3 | Coordinar grupos | Eventos, servicios y asignaciones por grupo |
| 4 | Asistencia y participación | Registro facial + reportes + seguimiento |

---

## 3. Roles, acceso y permisos

**Jerarquía y asignación de roles:**
- 👑 **Super-admin (dueño de la plataforma):** crea iglesias, asigna obispos y pastores, mantiene el sistema.
- ⛪ **Obispo (super-usuario):** ve y accede a **TODO de TODAS las iglesias** (supervisión); su acceso a datos sensibles queda en **auditoría**.
- ⛪ **Pastor:** administra su iglesia y asigna sus roles.
- 👥 Líderes / Tesorero / Músicos / Feligreses.

**Roles:** Pastor/Admin · Líder de cuerpo (**varios admins por grupo**) · Líder de música · Líder de Escuela Dominical · Tesorero · Músico · Feligrés.

**Reglas clave:**
- Permisos **por grupo, no globales**; una persona puede tener varios roles y ve la **suma** de sus módulos.
- **Login en 3 pasos:** Iglesia → Usuario → Contraseña.
- **Multi-iglesia:** datos aislados por `iglesia_id` (nada se cruza, ni los rostros).
- **Seguridad:** hash, 2FA para pastor/tesorería, recuperación, auditoría.

**Visibilidad de módulos por rol (resumen):**
| Módulo | Feligrés | Músico | Líder cuerpo | Líder ED | Tesorero | Pastor |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|
| Inicio / Mi Servicio / Anuncios | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendario completo | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Asistencia (registrar/reportes) | ❌ | ❌ | 🔸 | 🔸 | ❌ | ✅ |
| Músicos | ❌ | ✅ | 🔸 | ❌ | ❌ | ✅ |
| Gestionar Servicio | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Cuidado Pastoral | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Niños / Escuela Dominical | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Tesorería | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 4. Módulos (inventario completo · todos diseñados)

| # | Módulo | Qué hace |
|---|--------|----------|
| 1 | **Acceso + multi-iglesia** | Login 3 pasos, datos aislados por iglesia |
| 2 | **Grupos, roles y permisos** | Pertenencias múltiples, varios admins por grupo |
| 3 | **Calendario + aprobación** | Solicitar → aprobar; reserva por franja + recurso |
| 4 | **Anuncios + notificaciones** | Avisos, recordatorios, urgentes |
| 5 | **Asistencia facial + reportes** | Reconoce y marca "asistió [nombre]"; quién vino/faltó |
| 6 | **Panel del pastor + ausentes** | Estadísticas + alerta de quién se aleja |
| 7 | **Músicos** | Cancionero, orden del servicio, ensayos (asigna el líder de música) |
| 8 | **Servicio** | Aseo (voluntario), ofrenda/predicar/devocional (asignados), agradecer |
| 9 | **Mi Servicio** | Cada feligrés ve lo que le toca servir + historial |
| 10 | **Rúbrica de la reunión** | El pastor sube el orden; lo ven quienes sirven ese día |
| 11 | **Cuidado Pastoral** | Casos de cuidado, seguimiento — **solo el pastor** |
| 12 | **Niños / Escuela Dominical** | Material, organización, asistencia, check-in seguro |
| 13 | **Tesorería** | Contabilidad + transparencia (ofrenda **presencial**; la app no recibe pagos) |

---

## 5. Asistencia por reconocimiento facial (lo más trabajado)

- **Único método**, solo con **cámaras** (buen internet y luz estables).
- **Dos cámaras en cadena** (puerta → salón) con de-duplicación.
- Reconoce y marca **"asistió [nombre]"** → el pastor lo ve por nombre.
- **No reconocidos:** adulto → "no identificado" + alerta a soporte · menor → "niño asistido". **Cero carga humana.**
- **Offline:** frame cifrado → backend; los rostros viven solo en el servidor.
- **Reporte bajo demanda:** total + quién asistió/faltó + filtro por grupo.
- **Tecnología:** InsightFace/ArcFace (`buffalo_l`) en backend. **Privacidad:** código no foto, cifrado, consentimiento; sin inscribir menores.

---

## 6. Dos modelos de servicio

| Modelo | Cómo | Ejemplos |
|--------|------|----------|
| **Voluntario** | El feligrés se apunta → el pastor aprueba | Aseo |
| **Asignado** | El pastor/líder elige personas concretas | Música (líder de música), Ofrenda, Predicar, Devocional (pastor) |

Todo lo asignado **avisa en la app**, aparece en el **calendario** y en **"Mi Servicio"**, con **Aceptar / No puedo (con motivo)**.

---

## 7. Mejoras y funciones adicionales (aprobadas)

**A módulos existentes:** fechas no disponibles · presupuesto vs real · tendencia por persona · plantillas de servicio · alertas en niños.
**Transversales:** búsqueda global · **notificaciones push (diseñadas a detalle)** · modo offline general · sincronizar calendario · accesibilidad · multi-idioma.
**Participación:** devocional + planes de lectura · cumpleaños · encuestas · perfil familiar.

*(Las peticiones de oración se descartaron: es algo personal que se habla directamente con el pastor.)*

**Diseñadas a detalle:** Notificaciones push (disparadores, centro, configuración, técnico) y Fechas no disponibles (bloqueos, aviso al asignar).

---

## 8. Seguridad y datos

- **Retención (media):** se guarda mientras exista la cuenta; se borra a petición o al cerrarla.
- **Backup:** auto-hospedado, programado y cifrado.
- **Privacidad:** frames nunca se guardan; biometría cifrada; cuidado pastoral y tesorería confidenciales.

---

## 9. Plan por fases

| Fase | Contenido |
|------|-----------|
| **V1 — Base** | Login + multi-iglesia · grupos/roles · calendario + aprobación · anuncios · notificaciones push |
| **V2 — Valor** | Asistencia · panel del pastor · servicio · Mi Servicio · músicos · cuidado pastoral · mejoras adicionales |
| **V3 — Avanzado** | Reconocimiento facial · niños · tesorería (contabilidad + transparencia) |

---

## 10. Estado del proyecto

**✅ Cerrado:** 13 módulos + mejoras adicionales diseñados; errores de diseño corregidos; decisiones de datos/seguridad/UI/visibilidad.
**✅ A cargo del responsable:** inscripción de rostros y estimación de costos.
**⏳ Pendiente (bloquea el arranque):**
- **N7** — Plataforma (Android/iPhone/web) · Quién la construye · Nombre.
- **N2** — Rol de soporte/técnico.

---

## 11. Veredicto

El proyecto es una **especificación completa, revisada y coherente**, con 13 módulos y un set de mejoras adicionales diseñados a detalle, más la visibilidad por rol definida. No quedan errores de diseño: lo que falta son **decisiones de ejecución** (plataforma, desarrollador, soporte). El cuello de botella ya no es *qué* construir, sino *cómo y con quién*.

---

*Documento técnico detallado: `Concepto-App-Iglesia.md` (18 secciones).*
