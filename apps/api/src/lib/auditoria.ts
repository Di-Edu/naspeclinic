import type { Request } from 'express';
import type { DB } from '../db';
import { auditoria } from '../db/schema';

/** Registra accesos y cambios sobre datos personales/clínicos (Ley 19.628 / 21.719). */
export async function auditar(db: DB, req: Request, accion: string, entidad: string, entidadId?: number | null) {
  await db.insert(auditoria).values({
    usuarioId: req.usuario?.id ?? null,
    accion,
    entidad,
    entidadId: entidadId ?? null,
    ip: req.ip ?? null,
  });
}
