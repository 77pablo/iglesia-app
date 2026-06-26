# Backend — App Organizadora de Iglesia

Backend en **Node.js + Express + SQLite**. Corresponde a la **Fase 1A (Fundación técnica)** del plan.

## Cómo correrlo

```bash
npm install        # instala dependencias (una vez)
npm run seed       # crea la base de datos + datos de prueba
npm start          # arranca la API en http://localhost:3000
```

## Usuarios de prueba (contraseña = 1234)
- Iglesia: **Monte Sion** (código `MONTESION`)
- `pastor` — ve todos los módulos
- `abel` — líder de Jóvenes
- `joaquin` — líder de Música + miembro de Jóvenes

## Endpoints (Fase 1A)
| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/health` | Comprueba que el backend responde |
| POST | `/api/login` | Login en 3 pasos: `{iglesia, usuario, password}` → token |
| GET | `/api/me` | Perfil + roles + módulos visibles (requiere token) |
| POST | `/api/dispositivo` | Registra token push (requiere token) |

## Estado
- [x] 1A.1 Proyecto base
- [x] 1A.2 Modelo de datos núcleo (13 tablas)
- [x] 1A.3 Login en 3 pasos + multi-iglesia
- [x] 1A.4 Roles, jerarquía y módulos visibles
- [x] 1A.5 Registro de token push (base)
- [x] 1A.6 Auditoría (registro de accesos)
- [x] **Página web** conectada (login + panel de módulos por rol)
- [x] **FASE 1B - Módulo A: Calendario + Eventos** (ver, crear, permisos, choques)
- [x] **FASE 1B - Módulo B: Anuncios + Notificaciones** (publicar, urgentes, campana, permisos)
- [x] **FASE 1B - Módulo C: Servicio + Mi Servicio** (asignar, aceptar/no puedo con motivo, avisos)
- [x] **FASE 1B - Módulo D: Asistencia simple** (lista, total, comparación, permisos)
- [x] **Web rediseñada nivel profesional** (sidebar, dashboard, toasts, modales, iconos SVG)
- [x] **🎉 MVP COMPLETO Y USABLE**
- [x] **FASE 2.1 - Aprobación de fechas** (líder solicita → pastor aprueba/rechaza)
- [x] **FASE 2.2 - Panel del pastor + ausentes** (estadísticas, tendencia, quién se aleja)
- [x] **FASE 2.3 - Músicos** (cancionero + orden del servicio con tonos)
- [x] **FASE 2.5 - Cuidado pastoral** (casos, historial de contactos, solo el pastor)
- [x] **🎉 FASE 2 COMPLETA**
- [x] **FASE 3 - Tesorería** (ingresos/gastos, campañas, transparencia, solo tesorero/pastor)
- [x] **FASE 3 - Niños / Escuela Dominical** (clases, material, niños, asistencia + salida segura)
- [ ] FASE 3 - Reconocimiento facial (requiere Python — pendiente de instalar)

## Usuarios de prueba (contraseña = 1234)
`pastor` · `abel` (líder Jóvenes) · `joaquin` (líder Música) · `maria` (feligresa) · `raquel` (tesorera) · `marta` (maestra ED)

## Usuarios de prueba (contraseña = 1234)
- `pastor` (ve todo) · `abel` (líder Jóvenes) · `joaquin` (líder Música) · `maria` (feligresa)

## Endpoints del Calendario (Módulo A)
| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/eventos` | Lista eventos (según lo que el rol puede ver) |
| GET | `/api/eventos/grupos-gestionables` | Grupos donde el usuario puede crear |
| POST | `/api/eventos` | Crea evento (valida permiso + choque de lugar/hora) |
| GET | `/api/eventos/:id` | Detalle de un evento |

## Tecnología
- Node.js + Express (API REST)
- SQLite (`node:sqlite`, integrado — sin servidor de BD aparte)
- JWT para sesiones, bcrypt para contraseñas
- *(En producción: cambiar a PostgreSQL y poner `JWT_SECRET` en variable de entorno.)*
