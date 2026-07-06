# 🗺️ MAPA DE CONSTRUCCIÓN — App Organizadora de Iglesia
*25 de junio de 2026*

> Filosofía: **empezar pequeño y sólido, crecer por fases.** El facial, niños y tesorería van al final. Nada se construye sin su base.

---

## 🟦 FASE 0 — Decisiones previas (antes de programar)

| # | Decisión | Nota |
|---|----------|------|
| 1 | **Objetivo** | ¿Tu iglesia primero o plataforma multi-iglesia? Recomendado: tu iglesia, generalizar después |
| 2 | **Plataforma** | Android / iPhone / web (o varias) |
| 3 | **Quién la construye** | Programador / equipo / herramienta + **presupuesto** |
| 4 | **Quién la mantiene (soporte/N2)** | Servidor, backups, facial — rol técnico continuo |
| 5 | **Nombre** de la app | Identidad |
| 6 | **Validar** | Mostrar los mockups al pastor + 4 miembros (incluido alguien mayor) |

→ Sin esto, no se arranca.

---

## 🧱 FASE 1A — Fundación técnica (la base invisible)

*Sostiene TODOS los módulos. Se hace primero.*

| Pieza | Qué incluye |
|-------|-------------|
| 🗄️ Backend + base de datos | Servidor + modelo de datos (8 piezas base) |
| 🔑 Login + roles + jerarquía | 3 pasos, multi-iglesia (`iglesia_id`), permisos, obispo/super-admin |
| 🔔 Notificaciones push | Tokens FCM/APNs (base de todos los avisos) |
| ☁️ Hosting + backups | Auto-hospedado, respaldo cifrado |
| 📋 Auditoría | Registro de accesos sensibles (incluido el obispo) |

---

## 🏠 FASE 1B — MVP (la casa pequeña, ya usable)

*Lo mínimo que resuelve ~70% del dolor. Lanzar y que se use.*

```
   📅 Calendario      📢 Anuncios       🤝 Servicio +
    + Eventos          + push            Mi Servicio
        \                 |                 /
              ✅ Asistencia SIMPLE (lista/QR)   ← NO facial aún
                          |
                   🚀 LANZAR Y USAR
```

---

## 📈 FASE 2 — Valor (crecer con feedback real)

```
   Solicitar→Aprobar fechas  →  Panel del pastor + ausentes
            |                            |
        🎵 Músicos            ⭐ Mejoras (fechas no disponibles,
            |                    búsqueda, plantillas, presupuesto…)
            ▼
       ❤️ Cuidado Pastoral (solo pastor)
```

---

## 🔬 FASE 3 — Avanzado (lo delicado, al final)

```
   📷 Asistencia FACIAL (piloto con 1 grupo)
            |
   👶 Niños / Escuela Dominical (check-in seguro)
            |
   💰 Tesorería (contabilidad + transparencia; ofrenda presencial)
```

---

## 🔗 Mapa de dependencias (qué necesita qué)

```
Fundación técnica (login, BD, push, hosting, auditoría)
   └──> habilita TODO lo demás
          ├─ Calendario ──> Solicitar/Aprobar fechas ──> reservas/choques
          ├─ Servicio ───> Mi Servicio ───> Fechas no disponibles
          ├─ Asistencia simple ──> Asistencia FACIAL ──> Panel ausentes ──> Cuidado Pastoral
          └─ Grupos/roles ──> Visibilidad de módulos (todos) ──> Obispo (todas las iglesias)
```

> 🔑 Regla de oro: **nada del facial, niños o tesorería se construye hasta que la base + MVP estén sólidos y en uso.**

---

## 📊 Resumen del orden

| Paso | Qué se hace | Resultado |
|------|-------------|-----------|
| **0** | Objetivo, plataforma, constructor, soporte, nombre + validar | Luz verde |
| **1A** | Fundación técnica (login, BD, push, hosting, auditoría) | Cimiento |
| **1B** | MVP: calendario, anuncios, servicio, asistencia simple | **App usable** 🚀 |
| **2** | Aprobación de fechas, panel, músicos, cuidado, mejoras | App valiosa |
| **3** | Facial, niños, tesorería | App completa |

---

## 🎯 Claves del mapa
1. **No empieces por el facial** — es Fase 3, no Fase 1.
2. **La fundación técnica va primero** — sin login/BD/push no hay nada.
3. **Lanza el MVP rápido** y que se use antes de seguir.
4. **Cada fase se apoya en la anterior** — no saltes.
5. **Valida con personas reales** antes de construir mucho.
