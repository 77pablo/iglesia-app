# 📋 INFORME — App Organizadora de Iglesia
*Sesión del 25 de junio de 2026*

---

## 1. Resumen ejecutivo

Hoy el proyecto pasó de **una idea general** a una **especificación completa, revisada y coherente**. Se definió cómo funciona la app, se diseñaron sus pantallas, se resolvió el sistema de asistencia facial de punta a punta y se corrigieron todos los errores de diseño detectados. Lo único que falta para construirla es decidir **plataforma y desarrollador**.

---

## 2. Qué es la app

Una **plataforma multi-iglesia** que centraliza la vida de cada congregación: calendario, eventos, anuncios, responsabilidades y asistencia. Cada persona ve lo que le corresponde según sus grupos. Es el centro de mando de los organizadores (pastor, líderes, músicos), con **datos aislados por iglesia**.

**Problemas que resuelve:** comunicación dispersa · desorden de calendario · coordinar grupos · asistencia y participación.

---

## 3. Cómo funciona (lo esencial)

| Bloque | Definición |
|--------|------------|
| **Usuarios** | 5 roles; permisos **por grupo, no globales** (una persona puede ser líder en un grupo y miembro en otro) |
| **Acceso** | Login en 3 pasos: Iglesia → Usuario → Contraseña |
| **Multi-iglesia** | Datos aislados por `iglesia_id`; nada se cruza entre iglesias |
| **Calendario** | Líder solicita → pastor aprueba; reserva por franja + recurso |
| **Asistencia** | Reconocimiento facial (único método, dos cámaras), marca "asistió [nombre]" |
| **Reportes** | El pastor consulta por fecha: total + quién asistió y quién faltó |
| **Seguridad** | Contraseñas con hash, 2FA para pastor/tesorería, auditoría |
| **Datos** | Retención media; backup auto-hospedado cifrado; nunca se guardan fotos |

---

## 4. Asistencia facial (lo más trabajado)

- **Único método**, solo con cámaras (buen internet y luz estables).
- **Dos cámaras en cadena** (puerta → salón) con de-duplicación.
- Reconoce y marca **"asistió [nombre]"** → el pastor lo ve por nombre.
- **No reconocidos:** adulto → "no identificado" + alerta a soporte · menor → "niño asistido" (conteo anónimo). **Cero carga humana en la iglesia.**
- **Offline:** frame cifrado → backend; los rostros viven solo en el servidor.
- **Tecnología:** InsightFace/ArcFace (`buffalo_l`) en backend.
- **Privacidad:** se guarda el código (no la foto), cifrado, con consentimiento.

---

## 5. Decisiones tomadas hoy

Facial único · dos cámaras · "asistió [nombre]" · no reconocidos a soporte · niños "niño asistido" · cero carga humana · consentimiento informado · offline backend-only · reserva por franja+recurso · login 3 pasos · multi-iglesia aislada · retención media · backup auto-hospedado · inscripción y costos a cargo del responsable.

---

## 6. Errores detectados y corregidos

E1 (alcance facial) · E2 (consentimiento) · E3/N1 (offline) · E5 (carga humana) · E6 (reserva calendario) · E7 (RSVP vs real) · N3 (niños) · M11 (seguridad de cuentas). **Todos resueltos.**

---

## 7. Estado y pendientes

**✅ Cerrado:** todo el diseño conceptual y técnico.

**⏳ Pendiente (bloquea el arranque):**
- **N7** — Nombre · Plataforma (Android/iPhone/web) · Quién la construye.
- **N2** — Definir el rol de soporte/técnico.

---

## 8. Veredicto

El concepto está **terminado y limpio**. No quedan errores de diseño; lo que falta son **decisiones de ejecución** (plataforma, desarrollador, soporte). El cuello de botella ya no es *qué* construir, sino *cómo y con quién*.

---

*Documentos del proyecto:*
- `Concepto-App-Iglesia.md` — detalle técnico completo (13 secciones)
- `Informe-Completo.md` — resumen ejecutivo
- `Informe-Sesion-2026-06-25.md` — este informe de la sesión
