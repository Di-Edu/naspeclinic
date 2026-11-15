import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function requerida(nombre: string, valorDev: string): string {
  const v = process.env[nombre];
  if (v) return v;
  if (isProd) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valorDev;
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  /** Si no hay DATABASE_URL se usa PGlite (Postgres embebido) en apps/api/.data */
  databaseUrl: process.env.DATABASE_URL,
  pgliteDir: process.env.PGLITE_DIR ?? './.data/pglite',
  jwtSecret: requerida('JWT_SECRET', 'dev-jwt-secret-no-usar-en-produccion'),
  jwtExpira: '8h' as const,
  /** 32 bytes en hex (64 caracteres). Genérela con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" */
  llaveCifrado: requerida('ENCRYPTION_KEY', '0'.repeat(64)),
  llaveHmac: requerida('HMAC_KEY', 'dev-hmac-no-usar-en-produccion'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  uploadsDir: process.env.UPLOADS_DIR ?? './uploads',
  maxArchivoMB: 10,
};
