import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { usuarios, empresas } from '../db/schema';
import { firmarToken, requiereAuth } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

export function authRouter(db: DB) {
  const r = Router();

  r.post('/login', async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email.toLowerCase()));
    if (!u || !u.activo) throw new HttpError(401, 'Credenciales inválidas');
    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      throw new HttpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos');
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
    const sesion = { id: u.id, rol: u.rol, empresaId: u.empresaId, nombre: u.nombre };
    req.usuario = sesion;
    await auditar(db, req, 'login', 'usuario', u.id);
    res.json({ token: firmarToken(sesion), usuario: await perfil(sesion.id) });
  });

  r.get('/me', requiereAuth, async (req, res) => {
    res.json(await perfil(req.usuario!.id));
  });

  async function perfil(id: number) {
    const [p] = await db.select({
      id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol,
      empresaId: usuarios.empresaId, empresa: empresas.nombre,
    }).from(usuarios).leftJoin(empresas, eq(usuarios.empresaId, empresas.id)).where(eq(usuarios.id, id));
    return p;
  }

  return r;
}
