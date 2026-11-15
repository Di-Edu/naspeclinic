# Naspeclinic — Plataforma de salud ocupacional

Plataforma web y app móvil para una clínica de salud ocupacional de la industria minera:
pacientes, exámenes (broncopulmonar, cardiología, odontología, suero vitamina C, marcadores
genéticos), agenda de citas por sede y reportes ejecutivos para los gerentes de las empresas clientes.

> Todos los datos de este repositorio (empresas, pacientes, RUT, correos) son **ficticios**.

## Estado

| Módulo                                   | Estado |
|------------------------------------------|--------|
| API: login JWT, roles, bloqueo por intentos | ✅ |
| API: pacientes (RUT cifrado + búsqueda por índice ciego) | ✅ |
| API: exámenes, archivos (PDF/JPG/PNG), historial | ✅ |
| API: agenda de citas con filtros por sede/fecha/estado | ✅ |
| API: dashboard KPI (cobertura, ausentismo, hallazgos, ROI, tendencias) | ✅ |
| API: reporte gerencial en PDF y envío por email | ✅ |
| API: auditoría de accesos a datos clínicos | ✅ |
| Web (React, sobre el prototipo del cliente) | ⏳ |
| App móvil (React Native / Expo)          | ⏳ |
| Almacenamiento S3 y notificaciones SMS   | ⏳ |

## Estructura

```
apps/api         API REST — Node 20, Express 5, TypeScript, Drizzle ORM, PostgreSQL
apps/web         Frontend React (pendiente: se integra el prototipo)
apps/mobile      App React Native con Expo (pendiente)
packages/shared  Roles, catálogos y validación de RUT compartidos
docs/            Arquitectura, modelo de datos, seguridad y plan de trabajo
```

Diseño completo en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y plan por semanas en [`docs/PLAN.md`](docs/PLAN.md).

## Cómo correrlo

Requiere Node.js 20 o superior. No hace falta instalar PostgreSQL: en desarrollo la API usa
PGlite (Postgres embebido) y guarda los datos en `apps/api/.data`.

```bash
npm install
npm run seed      # carga datos de ejemplo
npm run dev:api   # API en http://localhost:4000/api
npm test          # tests de la API
```

Usuarios de demo (contraseña `Demo-Naspeclinic-2026`):

| Usuario                | Rol                          |
|------------------------|------------------------------|
| `admin@example.com`    | Admin Naspeclinic            |
| `operador@example.com` | Operador                     |
| `gerente1@example.com` | Gerente de "Minera Cordillera Norte (demo)" |

Ejemplo:

```bash
TOKEN=$(curl -s localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"gerente1@example.com","password":"Demo-Naspeclinic-2026"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:4000/api/dashboard -H "Authorization: Bearer $TOKEN"
curl -s "localhost:4000/api/reportes/1/pdf?periodo=2026-10" -H "Authorization: Bearer $TOKEN" -o reporte.pdf
```

## Producción

Variables de entorno en [`apps/api/.env.example`](apps/api/.env.example). Con `DATABASE_URL`
la API usa PostgreSQL y aplica las migraciones al iniciar. En producción son obligatorias
`JWT_SECRET`, `ENCRYPTION_KEY` y `HMAC_KEY`.
