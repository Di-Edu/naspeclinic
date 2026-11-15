import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

/** Envuelve handlers async para que los errores lleguen al manejador central. */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function manejadorErrores(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) });
  }
  const codigo = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (codigo === '23505') return res.status(409).json({ error: 'El registro ya existe' });
  if ((err as { name?: string })?.name === 'MulterError') return res.status(400).json({ error: (err as Error).message });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
}
