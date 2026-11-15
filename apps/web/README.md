# Web (React + Vite)

Interfaz de Naspeclinic. Consume la API de `apps/api` (en desarrollo, Vite redirige `/api` a `localhost:4000`).

```bash
npm run dev:api   # en una terminal
npm run dev:web   # en otra: http://localhost:5173
```

Pantallas por rol:

- **Admin:** todo, más usuarios y envío del reporte al gerente.
- **Operador:** agenda (día/semana, filtro por sede, cambio de estado), pacientes con historial, exámenes con archivos.
- **Gerente:** dashboard KPI y reporte gerencial de su empresa (solo lectura, descarga en PDF).

Variables (`.env`): `VITE_API_URL` (URL de la API en producción) y `VITE_DEMO=0` para ocultar los accesos de demo.

El diseño visual se ajustará a la paleta, tipografía y componentes del prototipo de Naspeclinic.
