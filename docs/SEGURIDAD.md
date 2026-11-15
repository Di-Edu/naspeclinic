# Seguridad

## Lo que implementa la aplicación

**Cuentas y sesiones**
- Contraseñas con bcrypt (costo 12); política: 10+ caracteres con letras y números.
- Bloqueo de 15 min tras 5 contraseñas incorrectas; límites de intentos por correo y por IP.
- Recuperación por enlace de un solo uso (30 min, se guarda solo su hash, no revela qué correos existen).
- Contraseña inicial o temporal asignada por el admin: cambio obligatorio al entrar (lo exige la API).
- Cada petición revalida la sesión contra la base: cambiar la contraseña, desactivar al usuario o
  cerrar sesión invalida el token de inmediato (`sesiones_revocadas`, `version_password`).

**Permisos y datos**
- Roles verificados en el servidor; el gerente queda limitado a su empresa aunque altere la URL.
- La empresa solo ve aptitud, restricciones y vigencia: nunca resultados ni diagnósticos.
- Cifrado AES-256-GCM de RUT, observaciones clínicas y motivos/cierres de seguimientos; búsqueda
  de RUT por índice ciego (HMAC). Las llaves viven en variables de entorno, fuera de la base.
- Validación de todas las entradas (Zod) y SQL parametrizado (sin inyección SQL).
- Archivos: solo PDF/JPG/PNG de hasta 10 MB, **verificando el contenido real** (no solo la
  extensión), guardados con nombre aleatorio y descargables solo con sesión.
- Auditoría de accesos, cambios, descargas, exportaciones y envíos.

**Contra abuso y saturación**
- Límites por usuario: 300 peticiones/min en general, 40/min en operaciones pesadas (dashboard,
  reportes, PDF, exportaciones) y 5/min en envíos de correo.
- Tiempos máximos: cabeceras 15 s, petición 60 s; en PostgreSQL, 15 s por consulta y 30 s por
  transacción inactiva; pool de 20 conexiones.
- Tamaño máximo de petición JSON: 1 MB; paginación con máximo 200 registros.

**Navegador**
- API: cabeceras de seguridad (helmet), CORS solo para los dominios de la web, HTTPS obligatorio
  en producción.
- Web: Content-Security-Policy estricta, X-Frame-Options, HSTS, Referrer y Permissions-Policy
  (`apps/web/vercel.json`). Al conocer el dominio de la API, restringir `connect-src` a ese dominio.

## Checklist antes de producción (infraestructura)

- [ ] **Repositorio privado** antes de cargar cualquier dato real.
- [ ] Secretos de producción (`JWT_SECRET`, `ENCRYPTION_KEY`, `HMAC_KEY`) generados al azar,
      guardados solo en Railway y en un gestor de contraseñas; nunca en el repositorio.
- [ ] **Cloudflare** delante de la web y la API (protección DDoS, firewall, límites por país o comportamiento).
- [ ] Base de datos sin acceso público (solo desde la API) y con un usuario de mínimos privilegios.
- [ ] **Respaldos diarios automáticos, fuera del servidor e inmutables**, con restauración probada
      cada mes. Es la defensa principal contra secuestro de datos (ransomware) o borrado.
- [ ] Llave de cifrado respaldada por separado de la base (sin ella, los datos cifrados se pierden).
- [ ] Archivos en bucket S3 privado, con cifrado del lado del servidor y versionado.
- [ ] SMTP con SPF, DKIM y DMARC configurados para que los correos no se puedan falsificar.
- [ ] Monitoreo y alertas: caídas (uptime), picos de errores 401/429/500 y fallos de inicio de sesión.
- [ ] Alertas de dependencias vulnerables (Dependabot) y actualización mensual.
- [ ] Revisión de seguridad externa (pentest) antes del lanzamiento.
- [ ] **Plan de respuesta a incidentes**: quién decide, cómo se aísla, cómo se restaura y cómo se
      notifica a la autoridad y a los afectados (Ley 21.719, vigente desde diciembre de 2026).

## Pendiente en la aplicación

- Verificación en dos pasos (2FA) para admin y personal clínico.
- Límites compartidos en Redis si la API corre en varias instancias.
- Rotación de llaves de cifrado (el formato `v1.` ya permite convivir con una llave nueva).
- Escaneo antivirus de archivos subidos (por ejemplo, ClamAV).
