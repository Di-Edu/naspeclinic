import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { DB } from './db';
import { config } from './config';
import { crearRequiereAuth } from './middleware/auth';
import { manejadorErrores } from './lib/errores';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { clinicoRouter } from './routes/clinico';
import { reportesRouter } from './routes/reportes';

/**
 * Límites del login. En una faena muchos trabajadores salen a internet por la misma IP,
 * así que el límite fuerte va por correo (solo cuenta intentos fallidos) y el límite por IP
 * es amplio, solo para frenar ataques masivos. Además, la cuenta se bloquea 15 min tras
 * 5 contraseñas incorrectas (routes/auth.ts).
 */
function limitesLogin() {
  const ventana = 15 * 60_000;
  const comun = { windowMs: ventana, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Espere unos minutos e intente de nuevo.' } } as const;
  const porIp = rateLimit({ ...comun, limit: 600 });
  const porCorreo = rateLimit({
    ...comun,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return email ? `correo:${email}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
    skip: (req) => req.method !== 'POST' || !req.path.startsWith('/login'),
  });
  // "Olvidé mi contraseña": máx. 5 correos por cuenta cada 15 min (evita usarlo para spam)
  const olvide = rateLimit({
    ...comun,
    limit: 5,
    keyGenerator: (req) => `olvide:${typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ipKeyGenerator(req.ip ?? '')}`,
    skip: (req) => req.method !== 'POST' || !req.path.startsWith('/olvide'),
  });
  // Intentos de usar enlaces de recuperación (adivinar tokens): por IP
  const restablecer = rateLimit({ ...comun, limit: 30, skip: (req) => req.method !== 'POST' || !req.path.startsWith('/restablecer') });
  return [porIp, porCorreo, olvide, restablecer];
}

export function crearApp(db: DB) {
  const app = express();
  app.set('trust proxy', 1); // Railway / Vercel están detrás de proxy
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  // HTTPS obligatorio en producción
  if (config.isProd) {
    app.use((req, res, next) => (req.secure ? next() : res.status(403).json({ error: 'Se requiere HTTPS' })));
  }

  app.get('/api/salud', (_req, res) => { res.json({ ok: true }); });

  const requiereAuth = crearRequiereAuth(db);
  app.use('/api/auth', ...limitesLogin(), authRouter(db, requiereAuth));
  app.use('/api', requiereAuth);
  app.use('/api', adminRouter(db));
  app.use('/api', clinicoRouter(db));
  app.use('/api', reportesRouter(db));

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Ruta no encontrada' }); });
  app.use(manejadorErrores);
  return app;
}
