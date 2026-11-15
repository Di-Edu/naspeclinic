# Plan de ejecución (7 semanas)

## Avance al 15-11-2026 (demo previa a la contratación)

| Área | Estado |
|---|---|
| Base técnica: API, base de datos, roles, cifrado, auditoría, tests (32) | ✅ |
| Seguridad: recuperación de contraseña, cambio obligatorio, límites, CSP, cierre de sesión | ✅ |
| Gestión de exámenes, archivos e historial | ✅ |
| Agenda de citas por sede | ✅ (falta notificación al paciente) |
| Dashboard KPI y reporte gerencial PDF | ✅ (falta logo del cliente) |
| Protocolos por cargo, evaluaciones con aptitud y vigencia, vencimientos, seguimientos | ✅ (fuera del alcance original) |
| Web en React | ✅ demo (se adapta al prototipo del cliente) |
| Producción: Vercel, Railway, S3, correo real, Cloudflare, respaldos | ⏳ |
| Importador masivo desde Excel y optimizaciones para decenas de miles de trabajadores | ⏳ |
| App móvil iOS/Android | ⏳ |
| Manual de uso | ⏳ |

## Plan original

| Semana | Entregable                                                                                      | Hito de pago |
|--------|--------------------------------------------------------------------------------------------------|--------------|
| 0      | Firma, entrega del prototipo y accesos                                                           | 30 % inicio  |
| 1      | Base: monorepo, BD, login JWT, roles, cifrado, auditoría. Prototipo integrado. Ambiente de pruebas publicado | |
| 2      | Gestión de exámenes: carga PDF/imágenes, búsqueda y filtros, historial por paciente             |              |
| 3      | Agenda de citas: vista diaria/semanal, filtros por sede, notificación por email al paciente     |              |
| 4      | Dashboard KPI en tiempo real + Reporte gerencial (KPIs, gráficos, alertas, recomendaciones)     |              |
| 5      | Exportación PDF con logo, envío por email al gerente, gestión de usuarios. QA web y producción  | 40 % web     |
| 6      | App móvil iOS/Android (Expo) con login y vistas por rol                                          |              |
| 7      | Publicación en App Store / Google Play, manual de uso, traspaso de accesos                       | 30 % móvil   |
| +30 d  | Soporte post-entrega: corrección de bugs                                                         |              |

Reunión de avance por Zoom 1–2 veces por semana y reporte escrito cada viernes.

## Definición de terminado por módulo

- Funciona en Chrome, Safari y Firefox, en escritorio y celular.
- Permisos verificados por la API (tests automáticos por rol).
- Datos de ejemplo cargados para la demo.
- Documentado en el manual de uso.
