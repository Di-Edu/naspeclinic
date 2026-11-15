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

| Recurso / acción                     | Admin Naspeclinic | Operador | Gerente empresa |
|--------------------------------------|:-----------------:|:--------:|:---------------:|
| Empresas, sedes, usuarios            | CRUD              | —        | —               |
| Pacientes                            | CRUD              | CRUD     | —               |
| Exámenes y archivos                  | CRUD              | CRUD     | —               |
| Citas                                | CRUD              | CRUD     | —               |
| Dashboard KPI                        | todas             | —        | solo su empresa |
| Reporte gerencial / PDF              | todas             | —        | solo su empresa |
| Auditoría                            | lectura           | —        | —               |

- El rol y la `empresaId` van dentro del JWT. Para el gerente, la API **ignora** cualquier
  `empresaId` que venga en la URL y fuerza la suya (no depende del frontend).
- El gerente no ve datos clínicos individuales: solo agregados (KPIs, conteos, tendencias).

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

## 4. Definición de KPIs (por empresa y período)

| KPI                  | Fórmula                                                                      |
|----------------------|------------------------------------------------------------------------------|
| Dotación examinada   | pacientes distintos con examen `completado` en el período                    |
| % cobertura          | dotación examinada / trabajadores declarados en `dotaciones` del período     |
| % ausentismo         | citas `ausente` / citas agendadas (no canceladas) del período                |
| Hallazgos clínicos   | exámenes con nivel `moderado` o `critico`                                     |
| Atenciones por especialidad | exámenes agrupados por tipo                                            |
| ROI estimado         | (hallazgos críticos × costo evitado por incidente + moderados × costo evitado) ÷ costo del programa; parámetros configurables por empresa |

> Ausentismo y ROI se validan con Naspeclinic en la primera semana (ver preguntas abiertas).

## 5. Seguridad y Ley 19.628 (y Ley 21.719)

Los datos de salud son **datos sensibles**. Medidas:

1. **HTTPS obligatorio** (Vercel y Railway lo entregan; la API rechaza HTTP en producción).
2. **Cifrado en reposo a nivel de campo** con AES-256-GCM: RUT y observaciones clínicas.
   El RUT además se guarda como HMAC-SHA256 (`rut_hash`) para poder buscarlo sin descifrarlo.
   Las llaves viven en variables de entorno, nunca en el repositorio.
3. **Archivos clínicos** en bucket S3 privado; se descargan solo con URL firmada de 5 minutos,
   emitida tras validar permisos.
4. **Contraseñas** con bcrypt; JWT de corta duración (8 h) y bloqueo tras intentos fallidos.
5. **Mínimo privilegio:** el gerente solo ve agregados de su empresa.
6. **Auditoría:** se registra quién ve, crea, modifica o descarga datos clínicos.
7. Cabeceras de seguridad (helmet), CORS restringido a los dominios oficiales, rate limiting.
8. Respaldos diarios de la base (Railway) y política de retención acordada con el cliente.

La Ley 21.719 (nueva ley de protección de datos personales) entra en vigencia en diciembre de
2026; el diseño ya cumple sus principios de seguridad, minimización y trazabilidad.

## 6. Endpoints principales

```
POST   /api/auth/login                  GET /api/auth/me
GET    /api/empresas         (admin)    POST/PATCH/DELETE ...
GET    /api/usuarios         (admin)    POST/PATCH ...
GET    /api/pacientes?q=&empresaId=     POST/PATCH  GET /api/pacientes/:id/historial
GET    /api/examenes?empresaId=&tipo=&estado=&desde=&hasta=
POST   /api/examenes                    PATCH /api/examenes/:id
POST   /api/examenes/:id/archivos (multipart, PDF/JPG/PNG, máx. 10 MB)
GET    /api/archivos/:id/descarga       → URL firmada
GET    /api/citas?sedeId=&desde=&hasta=&estado=   POST / PATCH
GET    /api/dashboard?empresaId=&desde=&hasta=
GET    /api/reportes/:empresaId?periodo=YYYY-MM          (JSON)
GET    /api/reportes/:empresaId/pdf?periodo=YYYY-MM      (PDF con logo)
POST   /api/reportes/:empresaId/enviar  → email al gerente con el PDF adjunto
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
