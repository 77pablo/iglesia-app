# 🔍 Auditoría consolidada — 20 de julio de 2026

Resumen de las **3 auditorías** realizadas sobre la app en producción (rama `main`): **backend**, **frontend/UX** y **E2E vía API**. Cada informe completo (con código, escenarios de fallo y líneas exactas) queda en `.superpowers/audit/` (`backend.md`, `frontend-ux.md`, `e2e.md`); este documento resume qué se encontró, qué se está arreglando y qué queda como seguimiento.

## Estado general

**E2E: 20/20 módulos OK — 119/119 comprobaciones en verde, cero 500, cero crashes.** La app funciona de punta a punta (happy-path + permisos denegados) en los 20 módulos probados: login, calendario, anuncios/notificaciones, servicio, asistencia, panel del pastor, música, tesorería, niños, cuidado pastoral, sermones, prédica, devocional, mi grupo, obispo, cuenta, admin, chat, y el aislamiento multi-iglesia. El aislamiento por `iglesia_id` y los permisos por rol funcionan correctamente en todos los flujos probados.

Los hallazgos de backend y frontend son **puntuales** (bugs concretos en líneas concretas), no fallas de arquitectura: el diseño de permisos, aislamiento y manejo de errores es sólido; lo que falla son casos específicos no cubiertos.

## Tabla de hallazgos por severidad

| # | Severidad | Área | Hallazgo | Archivo:línea |
|---|---|---|---|---|
| B1 | 🔴 Crítico | Backend | El Obispo obtiene permisos de **escritura** de Admin (puede crearse a sí mismo como pastor) | `admin.js:17-20` |
| F1 | 🔴 Crítico | Frontend | Credenciales reales (`pastor`/`1234`) visibles en el login público sin iniciar sesión | `web/index.html:83` |
| F2 | 🟠 Alto | Frontend | Escape de HTML inconsistente → XSS almacenado en ~15 sitios (notificaciones, autor de canción, alergias de niños, notas de prédica, cuidado pastoral, nombres) | `web/app.js` (múltiples líneas, ver informe) |
| B2 | 🟡 Importante | Backend | Detalle de evento pendiente/rechazado visible para cualquier feligrés (no repite el filtro del listado) | `eventos.js:148-156` |
| B3 | 🟡 Importante | Backend | `PATCH` parcial de evento borra hora/lugar/descripción si no se envían (usa `\|\| null` en vez de conservar el valor) | `eventos.js:203-213` |
| B4 | 🟡 Importante | Backend | `PATCH` parcial de anuncio borra el texto y desmarca "urgente" | `anuncios.js:77-85` |
| B5 | 🟡 Importante | Backend | Recuperar contraseña por email puede resetear la cuenta equivocada si dos personas comparten correo (`email` no es `UNIQUE`) | `cuenta.js:52-96` |
| B6 | 🟡 Importante | Backend | Borrado de notificación "Solicitud de fecha" no filtra por iglesia/persona: puede borrar el aviso de un pastor de **otra** iglesia | `eventos.js:173-176` |
| F3–F10 | 🟡 Medio | Frontend | Borrados sin confirmación (equipo de música, setlist), borrados sin toast de éxito, errores de red silenciados como "vacío", toasts largos que desaparecen antes de leerse, ícono PWA solo SVG (no se ve en iPhone), montos de tesorería sin validar signo, moneda fija `es-MX` sin indicar cuál | `web/app.js`, `manifest.json` (ver informe) |
| B7 | 🟢 Menor (a confirmar) | Backend | `persona_id`/`nino_id` de "presentes" en asistencia no se valida contra el grupo/clase/iglesia | `asistencia.js:63-79`, `ninos.js:96-104` |
| F11–F14 | 🟢 Bajo | Frontend | Objetivos táctiles pequeños en botones de borrar, texto del calendario ilegible en móvil (9px), contraseña visible en texto plano al crear usuario, falta `aria-label` en botón cerrar del modal del Obispo | `web/app.js`, `styles.css` (ver informe) |

## Qué se está arreglando

Los hallazgos **Críticos** e **Importantes** de backend (B1–B6) y el crítico de frontend (F1) son los de mayor prioridad por su impacto directo en seguridad (escalada de privilegios del Obispo, credenciales expuestas, fuga de datos entre iglesias, pérdida silenciosa de datos al editar). El plan es:

- **B1 (Obispo con permisos de Admin):** separar `esObispo()` de un nuevo `esSuperAdmin()` en `auth.js`, y usar este último como gate de escritura en `admin.js`.
- **F1 (credenciales en login):** quitar el hint de `pastor`/`1234` del HTML de producción (o condicionarlo a un flag de entorno de desarrollo).
- **F2 (XSS por falta de `escHtml`):** aplicar el helper `escHtml()` ya existente en los ~15 puntos identificados donde falta.
- **B2–B4 (fugas y `PATCH` destructivo):** aplicar el filtro de estado en el detalle de evento, y cambiar `\|\| null` por `?? valorAnterior` en los `PATCH` parciales de evento y anuncio.
- **B5 y B6 (email compartido / borrado cruzado de notificación):** quedan documentados para una siguiente iteración de backend — requieren decidir si `email` pasa a ser único por iglesia y si se ata la notificación de "Solicitud de fecha" a un `evento_id` en vez de matchear por texto.

*(El detalle de "qué se está arreglando" refleja el plan de trabajo del equipo de backend/frontend en sus respectivos worktrees; este documento es de seguimiento, no registra aquí el resultado final — ver `ESTADO.md` para el estado de integración a `main` una vez cerrado.)*

## Rendimiento y observaciones de diseño (no son bugs)

La auditoría E2E dejó 3 notas de **diseño a validar con el dueño del producto**, no defectos:

1. **Tesorería "transparencia" cerrada a feligreses:** `GET /api/tesoreria/transparencia` exige rol tesorero/pastor/obispo — si la intención es que cualquier miembro la vea, es una restricción más estricta de lo previsto.
2. **Rate limiting por IP compartida:** varias personas de un mismo hogar/congregación detrás de NAT podrían chocar contra el límite de login (5/15min) — es una decisión de seguridad documentada, no un defecto.
3. **Cross-iglesia por ID devuelve 404, no 403:** semánticamente distinto pero sin fuga real de datos.

## Qué queda como seguimiento

- **B7 (validación de aislamiento en `presentes`):** marcado como *a confirmar* — requiere decidir si se filtra silenciosamente o se rechaza con error; baja probabilidad de explotación pero ausencia real de validación.
- **F3–F14 (mejoras de frontend/UX de severidad media y baja):** confirmaciones y toasts de éxito consistentes en todo borrado, manejo visible de errores de red ("no se pudo cargar · reintentar"), íconos PNG para PWA en iPhone, validación de montos en tesorería, moneda configurable, objetivos táctiles más grandes, tamaño de letra del calendario en móvil, mostrar/ocultar contraseña al crear usuario, `aria-label` en botones de cerrar.
- **Las 3 notas de diseño** de la sección anterior (transparencia de tesorería, rate limiting por IP, semántica 404 vs 403) quedan para decisión de producto, no de código.
- Los **módulos revisados sin hallazgos** (la mayoría del backend: `asignaciones.js`, `panel.js`, `musica.js`, `cuidado.js`, `tesoreria.js`, `facial.js`, `sermones.js`, `devocional.js`, `recordatorios.js`, `grupo.js`, `predica.js`, `obispo.js`, `push.js`, `notificaciones.js`, `mensajes.js`, `sse.js`, `server.js`, `db.js`, `seguridad.js`, `mailer.js`, `env.js`) no requieren seguimiento inmediato.

## Fuentes

- `.superpowers/audit/backend.md` — auditoría de código backend (1 Critical · 5 Important · 1 Minor).
- `.superpowers/audit/frontend-ux.md` — auditoría de `web/app.js`, `index.html`, `styles.css`, `sw.js`, `manifest.json` (bugs + 13 mejoras de usabilidad priorizadas).
- `.superpowers/audit/e2e.md` — auditoría E2E vía API contra un servidor local con BD de prueba, sembrada con `seed.js` (iglesias MONTESION + GETSEMANI).
