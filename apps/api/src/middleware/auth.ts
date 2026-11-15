import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Rol } from '@naspeclinic/shared';
import { config } from '../config';
import { HttpError } from '../lib/errores';

export interface Sesion {
  id: number;
  rol: Rol;
  empresaId: number | null;
  nombre: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Sesion;
    }
  }
}

export function firmarToken(s: Sesion): string {
  return jwt.sign(s, config.jwtSecret, { expiresIn: config.jwtExpira });
}

export function requiereAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'No autenticado'));
  try {
    const p = jwt.verify(h.slice(7), config.jwtSecret) as Sesion;
    req.usuario = { id: p.id, rol: p.rol, empresaId: p.empresaId, nombre: p.nombre };
    next();
  } catch {
    next(new HttpError(401, 'Sesión expirada o inválida'));
  }
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
