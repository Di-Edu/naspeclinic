# Web (React + Vite)

Interfaz de Naspeclinic. Consume la API de `apps/api` (en desarrollo, Vite redirige `/api` a `localhost:4000`).

```bash
npm run dev:api   # en una terminal
npm run dev:web   # en otra: http://localhost:5173
```

Para probar la versión de producción con las cabeceras de seguridad (CSP):

```bash
npm run build:web
npx vite preview apps/web   # http://localhost:4173
```

## Pantallas por rol

| Pantalla | Admin | Operador | Gerente |
|---|:-:|:-:|:-:|
| **Dashboard**: KPIs, % de trabajadores habilitados, tendencias, alertas y recomendaciones | ✔ | | ✔ (su empresa) |
| **Aptitud y vencimientos**: estado de cada trabajador por protocolo, exportación a Excel | ✔ | ✔ | ✔ (sin datos médicos) |
| **Agenda**: día/semana, filtro por sede, cambio de estado de citas | ✔ | ✔ | |
| **Pacientes**: búsqueda por nombre o RUT, ficha con evaluaciones, exámenes, seguimientos y citas | ✔ | ✔ | |
| **Evaluaciones** (desde la ficha): crear la batería, registrar resultados, cerrar con aptitud | ✔ | ✔ | |
| **Exámenes**: lista con filtros y exámenes sueltos con archivos | ✔ | ✔ | |
| **Seguimientos**: abiertos, atrasados y cerrados; reprogramar y cerrar | ✔ | ✔ | |
| **Reporte gerencial**: indicadores del mes, PDF y envío al gerente | ✔ | | ✔ (sin envío) |
| **Configuración**: protocolos (baterías y vigencias) y protocolos exigidos por cargo | ✔ | | |
| **Usuarios**: crear, activar/desactivar, restablecer contraseñas | ✔ | | |

Además, para todos: "¿Olvidó su contraseña?", cambio de contraseña desde el menú y cambio
obligatorio cuando la contraseña la asignó un admin.

## Configuración

- `VITE_API_URL`: URL de la API en producción (por defecto `/api`).
- `VITE_DEMO=0`: oculta los botones de acceso rápido de la demo.
- `vercel.json`: cabeceras de seguridad (CSP, HSTS, etc.) y redirección de rutas al `index.html`.
  Al conocer el dominio de la API, restringir `connect-src` de la CSP a ese dominio
  (también en `seguridad.json`, que usa la vista previa local).

El diseño visual se ajustará a la paleta, tipografía y componentes del prototipo de Naspeclinic.
