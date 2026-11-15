import { Router, type RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq, lt } from 'drizzle-orm';
import { problemaPassword } from '@naspeclinic/shared';
import type { DB } from '../db';
import { usuarios, empresas, sesionesRevocadas } from '../db/schema';
import { firmarToken } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';
import { consumirToken, enviarEnlaceRecuperacion, guardarPassword } from '../services/passwords';

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

const passwordNueva = z.string().superRefine((p, ctx) => {
  const problema = problemaPassword(p);
  if (problema) ctx.addIssue({ code: 'custom', message: problema });
});

export const MENSAJE_OLVIDE = 'Si el correo está registrado, recibirá un enlace para restablecer su contraseña en los próximos minutos.';

export function authRouter(db: DB, requiereAuth: RequestHandler) {
  const r = Router();

  async function perfil(id: number) {
    const [p] = await db.select({
      id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol,
      empresaId: usuarios.empresaId, empresa: empresas.nombre, debeCambiarPassword: usuarios.debeCambiarPassword,
    }).from(usuarios).leftJoin(empresas, eq(usuarios.empresaId, empresas.id)).where(eq(usuarios.id, id));
    return p;
  }

  r.post('/login', async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email.toLowerCase()));
    if (!u || !u.activo) throw new HttpError(401, 'Credenciales inválidas');
    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      throw new HttpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Puede restablecer su contraseña.');
    }
    if (!(await bcrypt.compare(password, u.passwordHash))) {
      const intentos = u.intentosFallidos + 1;
      await db.update(usuarios).set({
        intentosFallidos: intentos >= MAX_INTENTOS ? 0 : intentos,
        bloqueadoHasta: intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MIN * 60_000) : null,
      }).where(eq(usuarios.id, u.id));
      throw new HttpError(401, 'Credenciales inválidas');
    }
    await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, u.id));
    await auditar(db, req, 'login', 'usuario', u.id, u.id);
    res.json({ token: firmarToken(u.id, u.versionPassword), usuario: await perfil(u.id) });
  });

  /** Cerrar sesión: el token deja de servir de inmediato (no solo se borra en el navegador). */
  r.post('/logout', requiereAuth, async (req, res) => {
    const { jti, exp } = req.token!;
    await db.insert(sesionesRevocadas).values({ jti, expira: new Date(exp * 1000) }).onConflictDoNothing();
    await db.delete(sesionesRevocadas).where(lt(sesionesRevocadas.expira, new Date())); // limpieza
    await auditar(db, req, 'logout', 'usuario', req.usuario!.id);
    res.json({ ok: true });
  });

  r.get('/me', requiereAuth, async (req, res) => {
    res.json(await perfil(req.usuario!.id));
  });

  /** Cambio de contraseña del propio usuario (también el cambio obligatorio inicial). */
  r.post('/cambiar-password', requiereAuth, async (req, res) => {
    const { actual, nueva } = z.object({ actual: z.string().min(1), nueva: passwordNueva }).parse(req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.usuario!.id));
    if (!(await bcrypt.compare(actual, u.passwordHash))) throw new HttpError(400, 'La contraseña actual no es correcta');
    if (actual === nueva) throw new HttpError(400, 'La nueva contraseña debe ser distinta de la actual');
    const g = await guardarPassword(db, u.id, nueva, false);
    await auditar(db, req, 'cambiar_password', 'usuario', u.id);
    // Las demás sesiones se cierran; esta recibe un token nuevo
    res.json({ token: firmarToken(u.id, g.versionPassword), usuario: await perfil(u.id) });
  });

  /** "¿Olvidó su contraseña?": responde siempre igual para no revelar qué correos existen. */
  r.post('/olvide', async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email.toLowerCase()));
    if (u?.activo) {
      await enviarEnlaceRecuperacion(db, u);
      await auditar(db, req, 'solicitar_recuperacion', 'usuario', u.id, u.id);
    }
    res.json({ mensaje: MENSAJE_OLVIDE });
  });

  /** Fija una nueva contraseña con el enlace recibido por correo. */
  r.post('/restablecer', async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(20), password: passwordNueva }).parse(req.body);
    const usuarioId = await consumirToken(db, token);
    if (!usuarioId) throw new HttpError(400, 'El enlace no es válido o ya expiró. Solicite uno nuevo.');
    await guardarPassword(db, usuarioId, password, false);
    await auditar(db, req, 'restablecer_password', 'usuario', usuarioId, usuarioId);
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Ya puede iniciar sesión.' });
  });

  return r;
}
