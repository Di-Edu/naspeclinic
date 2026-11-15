import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Rol } from '@naspeclinic/shared';
import { config } from '../config';
import { HttpError } from '../lib/errores';
import type { DB } from '../db';
import { usuarios } from '../db/schema';

export interface Sesion {
  id: number;
  rol: Rol;
  empresaId: number | null;
  nombre: string;
  debeCambiarPassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Sesion;
    }
  }
}

interface Carga { id: number; pv: number }

/** El token solo lleva el id y la versión de contraseña; rol y empresa se leen siempre de la BD. */
export function firmarToken(id: number, versionPassword: number): string {
  const carga: Carga = { id, pv: versionPassword };
  return jwt.sign(carga, config.jwtSecret, { expiresIn: config.jwtExpira });
}

/** Rutas que se pueden usar aunque falte cambiar la contraseña inicial. */
const PERMITIDAS_SIN_CAMBIO = ['/api/auth/me', '/api/auth/cambiar-password'];

/**
 * Valida el JWT y vuelve a leer al usuario: si fue desactivado o cambió su contraseña
 * después de emitido el token, la sesión deja de servir de inmediato.
 */
export function crearRequiereAuth(db: DB): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'No autenticado'));
    let carga: Carga;
    try {
      carga = jwt.verify(h.slice(7), config.jwtSecret) as Carga;
    } catch {
      return next(new HttpError(401, 'Sesión expirada o inválida'));
    }
    try {
      const [u] = await db.select().from(usuarios).where(eq(usuarios.id, carga.id));
      if (!u || !u.activo || u.versionPassword !== carga.pv) return next(new HttpError(401, 'Sesión expirada o inválida'));
      req.usuario = { id: u.id, rol: u.rol, empresaId: u.empresaId, nombre: u.nombre, debeCambiarPassword: u.debeCambiarPassword };
      if (u.debeCambiarPassword && !PERMITIDAS_SIN_CAMBIO.includes(req.originalUrl.split('?')[0])) {
        return next(new HttpError(403, 'Debe cambiar su contraseña antes de continuar'));
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requiereRol = (...roles: Rol[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) return next(new HttpError(403, 'Sin permisos'));
  next();
};

/**
 * Empresa sobre la que se consulta. El gerente SIEMPRE queda limitado a su empresa,
 * aunque pida otra en la URL.
 */
export function empresaPermitida(req: Request, solicitada?: number | null): number | null {
  const u = req.usuario!;
  if (u.rol === 'gerente') {
    if (solicitada && solicitada !== u.empresaId) throw new HttpError(403, 'Solo puede ver su empresa');
    return u.empresaId;
  }
  return solicitada ?? null;
}
