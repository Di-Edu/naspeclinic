import { createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { tokensRecuperacion, usuarios } from '../db/schema';
import { config } from '../config';
import { enviarCorreo } from './correo';

const VIGENCIA_MIN = 30;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const hashPassword = (p: string) => bcrypt.hash(p, 12);

/**
 * Guarda una nueva contraseña. Sube la versión para cerrar las sesiones abiertas y
 * desbloquea la cuenta. `debeCambiar` = true cuando la asigna un admin.
 */
export async function guardarPassword(db: DB, usuarioId: number, password: string, debeCambiar: boolean) {
  const [u] = await db.update(usuarios).set({
    passwordHash: await hashPassword(password),
    debeCambiarPassword: debeCambiar,
    versionPassword: sql`${usuarios.versionPassword} + 1`,
    intentosFallidos: 0,
    bloqueadoHasta: null,
  }).where(eq(usuarios.id, usuarioId)).returning({ id: usuarios.id, versionPassword: usuarios.versionPassword });
  // Los enlaces de recuperación pendientes dejan de servir
  await db.update(tokensRecuperacion).set({ usadoEn: new Date() })
    .where(and(eq(tokensRecuperacion.usuarioId, usuarioId), isNull(tokensRecuperacion.usadoEn)));
  return u;
}

/** Contraseña temporal legible (sin caracteres confundibles), con letras y números. */
export function passwordTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  const todos = letras + nums;
  const c = [letras[randomInt(letras.length)], nums[randomInt(nums.length)]];
  while (c.length < 12) c.push(todos[randomInt(todos.length)]);
  for (let i = c.length - 1; i > 0; i--) { const j = randomInt(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return c.join('');
}

/** Crea un enlace de un solo uso y lo envía por correo al usuario. */
export async function enviarEnlaceRecuperacion(db: DB, u: { id: number; email: string; nombre: string }) {
  await db.update(tokensRecuperacion).set({ usadoEn: new Date() })
    .where(and(eq(tokensRecuperacion.usuarioId, u.id), isNull(tokensRecuperacion.usadoEn)));
  const token = randomBytes(32).toString('base64url');
  await db.insert(tokensRecuperacion).values({
    usuarioId: u.id, tokenHash: hashToken(token), expira: new Date(Date.now() + VIGENCIA_MIN * 60_000),
  });
  const enlace = `${config.appUrl}/restablecer?token=${token}`;
  await enviarCorreo({
    para: u.email,
    asunto: 'Restablecer su contraseña de Naspeclinic',
    texto: `Hola ${u.nombre}:\n\nRecibimos una solicitud para restablecer su contraseña. Use este enlace (válido por ${VIGENCIA_MIN} minutos y por una sola vez):\n\n${enlace}\n\nSi usted no lo solicitó, ignore este correo; su contraseña no cambiará.\n\nNaspeclinic`,
  });
}

/** Devuelve el id de usuario si el token es válido, vigente y no usado; lo marca como usado. */
export async function consumirToken(db: DB, token: string): Promise<number | null> {
  const [t] = await db.update(tokensRecuperacion).set({ usadoEn: new Date() })
    .where(and(eq(tokensRecuperacion.tokenHash, hashToken(token)), isNull(tokensRecuperacion.usadoEn), gt(tokensRecuperacion.expira, new Date())))
    .returning({ usuarioId: tokensRecuperacion.usuarioId });
  return t?.usuarioId ?? null;
}
