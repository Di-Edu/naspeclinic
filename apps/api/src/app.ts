import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { DB } from './db';
import { config } from './config';
import { requiereAuth } from './middleware/auth';
import { manejadorErrores } from './lib/errores';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { clinicoRouter } from './routes/clinico';
import { reportesRouter } from './routes/reportes';

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

  app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: true, legacyHeaders: false }), authRouter(db));
  app.use('/api', requiereAuth);
  app.use('/api', adminRouter(db));
  app.use('/api', clinicoRouter(db));
  app.use('/api', reportesRouter(db));

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Ruta no encontrada' }); });
  app.use(manejadorErrores);
  return app;
}
