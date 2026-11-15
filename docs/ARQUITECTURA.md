# Naspeclinic — Diseño técnico

Plataforma web + app móvil para gestionar pacientes, exámenes ocupacionales, agenda de citas
y reportes ejecutivos para empresas mineras clientes.

## 1. Vista general

```
                ┌───────────────────────┐        ┌──────────────────────┐
 Navegador ───► │ apps/web  (React+Vite)│        │ apps/mobile (Expo RN)│ ◄── iOS / Android
                │ Vercel                │        │ App Store / Play     │
                └──────────┬────────────┘        └──────────┬───────────┘
                           │ HTTPS + JWT (Bearer)            │
                           ▼                                 ▼
                ┌─────────────────────────────────────────────────────┐
                │ apps/api  (Node 20 + Express + TypeScript)  Railway  │
                │  auth · roles · pacientes · exámenes · citas ·       │
                │  dashboard · reportes PDF · notificaciones · auditoría│
                └──────┬──────────────────┬─────────────────┬──────────┘
                       ▼                  ▼                 ▼
                PostgreSQL 16       Almacenamiento      Email (SMTP/Resend)
                (Railway)           S3 (privado, URLs   SMS (opcional,
                                    firmadas 5 min)     Twilio / LabsMobile)
```

**Monorepo** (npm workspaces):

| Carpeta            | Contenido                                                        |
|--------------------|------------------------------------------------------------------|
| `apps/api`         | API REST. Express, Drizzle ORM, Zod, JWT, PDFKit                  |
| `apps/web`         | Frontend React (se construye sobre el prototipo del cliente)      |
| `apps/mobile`      | App React Native con Expo (EAS Build para publicar en tiendas)    |
| `packages/shared`  | Tipos, roles, estados y validación de RUT compartidos web/móvil/API |

### Decisiones

- **Node + Express propio (no solo Supabase):** las reglas de negocio (KPIs, ROI, alertas,
  generación de PDF, cifrado de datos clínicos, auditoría) viven en un solo lugar y quedan
  probadas con tests. Supabase sigue siendo una opción solo como Postgres administrado.
- **Drizzle ORM:** SQL tipado y migraciones versionadas. En desarrollo y tests corre sobre
  PGlite (Postgres embebido), así cualquiera levanta el proyecto sin instalar Postgres.
- **Expo:** un solo código para iOS y Android, compilación en la nube (EAS) — no requiere Mac.
- **Una sola API para web y móvil:** la app móvil reutiliza todos los endpoints.

## 2. Roles y permisos

| Recurso / acción                                   | Admin Naspeclinic | Operador      | Gerente empresa        |
|----------------------------------------------------|:-----------------:|:-------------:|:----------------------:|
| Empresas (crear/editar), dotación, usuarios        | sí                | ver empresas  | —                      |
| Restablecer contraseñas de usuarios                | sí                | —             | —                      |
| Protocolos y cargos (configuración clínica)        | sí                | ver           | —                      |
| Pacientes, exámenes, archivos, citas               | sí                | sí            | —                      |
| Evaluaciones (crear, registrar resultados, cerrar) | sí                | sí            | —                      |
| Seguimientos de hallazgos                          | sí                | sí            | —                      |
| Aptitud y vencimientos                             | todas             | todas         | solo su empresa        |
| Avisar vencimientos por correo a la empresa        | sí                | —             | —                      |
| Dashboard KPI y reporte gerencial / PDF            | todas             | —             | solo su empresa        |
| Enviar reporte por correo al gerente               | sí                | —             | —                      |
| Cambiar su propia contraseña / cerrar sesión       | sí                | sí            | sí                     |

- El token solo lleva el id del usuario; rol y empresa se leen de la base en cada petición.
  Para el gerente, la API **ignora** cualquier `empresaId` que venga en la URL y fuerza la suya.
- El gerente nunca ve datos clínicos: solo agregados (KPIs, tendencias) y, por trabajador,
  aptitud, restricciones laborales y vigencia.
- La auditoría se registra en la tabla `auditoria` (aún sin pantalla de consulta).
- En una clínica real, el cierre de evaluaciones debería quedar en un rol **médico** (pendiente).

## 3. Modelo de datos

```
empresas ─┬─< usuarios (gerentes: empresa_id)
          ├─< dotaciones (empresa_id, periodo YYYY-MM, trabajadores)
          └─< pacientes ─┬─< examenes ─< archivos
                         └─< citas >── sedes
auditoria (usuario, acción, entidad, id, ip, fecha)
```

| Tabla        | Campos clave                                                                                      |
|--------------|---------------------------------------------------------------------------------------------------|
| `empresas`   | nombre, rut, email_gerente, activa                                                                |
| `sedes`      | nombre (Santiago, Antofagasta, Sur)                                                               |
| `usuarios`   | email, password_hash (bcrypt), nombre, rol, empresa_id?, activo                                   |
| `pacientes`  | rut_hash (búsqueda), rut_cifrado, nombre, email, teléfono, cargo, empresa_id                      |
| `examenes`   | paciente_id, empresa_id, sede_id, tipo, fecha, estado, resultado, nivel_hallazgo, observaciones_cifradas |
| `archivos`   | examen_id, clave_s3, nombre, mime, tamaño                                                        |
| `citas`      | paciente_id, empresa_id, sede_id, tipo_examen, fecha_hora, estado, notas                          |
| `dotaciones` | empresa_id, periodo, trabajadores                                                                 |
| `auditoria`  | usuario_id, acción, entidad, entidad_id, ip, fecha                                               |

**Catálogos**

- Tipos de examen: `broncopulmonar`, `cardiologia`, `odontologia`, `vitamina_c`, `geneticos`
  (ampliable sin cambiar código).
- Estado de examen: `pendiente`, `en_proceso`, `completado`.
- Resultado: `apto`, `apto_con_restricciones`, `no_apto`.
- Nivel de hallazgo: `ninguno`, `moderado`, `critico` → alimenta las alertas clínicas.
- Estado de cita: `pendiente`, `confirmada`, `cancelada`, `ausente` (no se presentó).

## 3.1 Protocolos, evaluaciones y aptitud

```
protocolos ─< protocolo_examenes         (batería: qué exámenes incluye y vigencia en meses)
cargos (por empresa) ─< cargo_protocolos  (qué protocolos exige cada cargo)
pacientes.cargo_id → cargos
evaluaciones (trabajador × protocolo) ─< examenes   (al crearla se genera la batería pendiente)
seguimientos (derivación / recontrol / no apto temporal) → examen o evaluación
```

- **Evaluación:** preocupacional, periódica o de egreso. Se cierra solo cuando todos sus exámenes
  están completados; la aptitud sugerida es el peor resultado de la batería. Al cerrar se fija
  `vigente_hasta` = fecha + vigencia del protocolo (editable). Cerrada, sus exámenes no se modifican.
- **Vigencia por trabajador y protocolo** (última evaluación cerrada): `vigente`, `por_vencer`
  (≤ 30 días), `vencido`, `no_apto` o `sin_evaluacion`. "Habilitado" = todos los protocolos de
  su cargo vigentes o por vencer.
- **Lo que ve la empresa:** aptitud, restricciones laborales y vigencia. Nunca resultados,
  hallazgos ni observaciones clínicas.
- **Seguimientos automáticos:** un hallazgo crítico abre una derivación (15 días), uno moderado
  un recontrol (90 días) y un "no apto" un no apto temporal con fecha de reevaluación.
  Motivo y resultado del cierre se guardan cifrados.

## 4. Definición de KPIs (por empresa y período)

| KPI                  | Fórmula                                                                      |
|----------------------|------------------------------------------------------------------------------|
| Dotación examinada   | pacientes distintos con examen `completado` en el período                    |
| % cobertura          | dotación examinada / trabajadores declarados en `dotaciones` del período     |
| % ausentismo         | citas `ausente` / citas agendadas (no canceladas) del período                |
| Hallazgos clínicos   | exámenes con nivel `moderado` o `critico`                                     |
| Atenciones por especialidad | exámenes agrupados por tipo                                            |
| ROI estimado         | (hallazgos críticos × costo evitado por incidente + moderados × costo evitado) ÷ costo del programa; parámetros configurables por empresa |
| Trabajadores habilitados | trabajadores con todos sus protocolos vigentes / trabajadores con cargo asignado (foto de hoy) |

> Ausentismo y ROI se validan con Naspeclinic en la primera semana (ver preguntas abiertas).

## 5. Seguridad y Ley 19.628 (y Ley 21.719)

Los datos de salud son **datos sensibles**. Medidas:

1. **HTTPS obligatorio** (Vercel y Railway lo entregan; la API rechaza HTTP en producción).
2. **Cifrado en reposo a nivel de campo** con AES-256-GCM: RUT, observaciones clínicas y
   motivos/cierres de seguimientos. El RUT además se guarda como HMAC-SHA256 (`rut_hash`) para
   buscarlo sin descifrarlo. Las llaves viven en variables de entorno, nunca en el repositorio.
3. **Archivos clínicos:** se descargan solo con sesión y permisos, quedando auditados. Hoy se
   guardan en disco (desarrollo); en producción irán a un bucket S3 privado con URL firmada de
   5 minutos (pendiente).
4. **Contraseñas y sesiones:** bcrypt, sesiones de 8 h revalidadas contra la base en cada
   petición, bloqueo tras intentos fallidos, recuperación por enlace y cierre de sesión que
   revoca el token.
5. **Mínimo privilegio:** el gerente solo ve agregados y aptitud de su empresa.
6. **Auditoría:** se registra quién ve, crea, modifica, descarga o exporta datos clínicos.
7. **Contra abuso:** límites por usuario y por IP, tiempos máximos, validación del contenido de
   archivos, cabeceras de seguridad y CSP.
8. Respaldos diarios de la base (Railway) y política de retención acordada con el cliente.

El detalle y el checklist de producción están en [`SEGURIDAD.md`](SEGURIDAD.md).

La Ley 21.719 (nueva ley de protección de datos personales) entra en vigencia en diciembre de
2026; el diseño ya cumple sus principios de seguridad, minimización y trazabilidad.

## 6. Endpoints principales

Las listas aceptan `pagina` y `porPagina` (máx. 200) y responden `{ items, total, pagina, porPagina }`.

```
# Sesión y contraseñas
POST  /api/auth/login                     GET  /api/auth/me
POST  /api/auth/logout                    (revoca el token en el servidor)
POST  /api/auth/cambiar-password          { actual, nueva }  → token nuevo
POST  /api/auth/olvide                    { email }          → enlace por correo
POST  /api/auth/restablecer               { token, password }

# Administración
GET   /api/sedes                          GET/POST /api/empresas    PATCH /api/empresas/:id
PUT   /api/empresas/:id/dotacion/:periodo { trabajadores }
GET   /api/usuarios                       POST /api/usuarios        PATCH /api/usuarios/:id
POST  /api/usuarios/:id/restablecer       { modo: "enlace" | "temporal" }

# Configuración clínica
GET   /api/protocolos                     POST /api/protocolos      PATCH /api/protocolos/:id
GET   /api/cargos?empresaId=              POST /api/cargos          PATCH /api/cargos/:id

# Clínico
GET   /api/pacientes?q=&empresaId=        POST /api/pacientes       PATCH /api/pacientes/:id
GET   /api/pacientes/:id/historial        (evaluaciones, exámenes, seguimientos, citas)
GET   /api/examenes?empresaId=&tipo=&estado=&desde=&hasta=
POST  /api/examenes                       PATCH /api/examenes/:id
POST  /api/examenes/:id/archivos          (multipart; PDF/JPG/PNG verificados; máx. 10 MB)
GET   /api/archivos/:id/descarga
GET   /api/citas?sedeId=&empresaId=&estado=&desde=&hasta=    POST /api/citas   PATCH /api/citas/:id

# Evaluaciones, aptitud y seguimientos
POST  /api/evaluaciones                   { pacienteId, protocoloId, tipo, fecha, sedeId }
GET   /api/evaluaciones/:id               (batería, aptitud sugerida, vigencia sugerida)
POST  /api/evaluaciones/:id/cerrar        { aptitud, restricciones, vigenteHasta, fechaReevaluacion }
GET   /api/aptitud?empresaId=&estado=&protocoloId=&q=&formato=json|csv
POST  /api/aptitud/notificar              { empresaId }  → correo al gerente con vencimientos
GET   /api/seguimientos?estado=&vencidos=1&empresaId=&pacienteId=
POST  /api/seguimientos                   PATCH /api/seguimientos/:id   { fechaCompromiso | cerrar }
GET   /api/seguimientos/resumen

# Gerencia
GET   /api/dashboard?empresaId=&desde=&hasta=           (por defecto, últimos 12 meses)
GET   /api/reportes/:empresaId?periodo=AAAA-MM          (JSON)
GET   /api/reportes/:empresaId/pdf?periodo=AAAA-MM      (PDF)
POST  /api/reportes/:empresaId/enviar                   (correo al gerente con el PDF)
```

## 7. App móvil (propuesta de alcance)

- **Gerente:** dashboard KPI, reporte del mes, descarga del PDF, alertas.
- **Operador:** agenda del día por sede, confirmar/cancelar/marcar ausente, ficha del paciente
  y carga de exámenes con la cámara del teléfono.
- Login con el mismo usuario y contraseña de la web; sesión guardada en SecureStore.

## 8. Preguntas abiertas para Naspeclinic

1. ¿Ausentismo se mide como inasistencia a citas o como días perdidos del trabajador
   (dato que entregaría la empresa)?
2. ¿Qué parámetros usan hoy para estimar el ROI (costo por incidente, costo del programa)?
3. ¿La app móvil es para gerentes, operadores o también para pacientes?
4. ¿Las notificaciones SMS son necesarias en esta etapa? (tienen costo por mensaje)
5. ¿Tienen cuentas de Apple Developer y Google Play a nombre de Naspeclinic?
