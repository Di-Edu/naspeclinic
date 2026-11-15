import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { config } from '../config';

export type DB = NodePgDatabase<typeof schema>;

const carpetaMigraciones = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Crea la conexión y aplica las migraciones pendientes.
 * - Con DATABASE_URL: PostgreSQL real (producción, Railway).
 * - Sin DATABASE_URL: PGlite (Postgres embebido) en disco, o en memoria para tests.
 */
export async function crearDb(opts: { memoria?: boolean } = {}): Promise<DB> {
  if (config.databaseUrl && !opts.memoria) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.isProd ? { rejectUnauthorized: false } : undefined,
      max: 20, // conexiones simultáneas a la base
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      // Ninguna consulta puede tardar más de 15 s: evita que una consulta pesada bloquee al resto
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 30_000,
    });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: carpetaMigraciones });
    return db;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (!opts.memoria) mkdirSync(config.pgliteDir, { recursive: true });
  const cliente = new PGlite(opts.memoria ? undefined : config.pgliteDir);
  const db = drizzle(cliente, { schema });
  await migrate(db, { migrationsFolder: carpetaMigraciones });
  return db as unknown as DB;
}
