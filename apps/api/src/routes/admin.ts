import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { ROLES, rutValido, normalizarRut } from '@naspeclinic/shared';
import type { DB } from '../db';
import { empresas, sedes, usuarios, dotaciones } from '../db/schema';
import { requiereRol } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';

const id = (v: string | string[]) => z.coerce.number().int().positive().parse(v);

const empresaSchema = z.object({
  nombre: z.string().min(2),
  rut: z.string().refine(rutValido, 'RUT inválido').transform(normalizarRut),
  emailGerente: z.string().email().nullish(),
  activa: z.boolean().optional(),
});

const usuarioBase = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  nombre: z.string().min(2),
  rol: z.enum(ROLES),
  empresaId: z.number().int().positive().nullish(),
  password: z.string().min(10, 'Mínimo 10 caracteres'),
  activo: z.boolean().optional(),
});
const usuarioSchema = usuarioBase.refine((u) => u.rol !== 'gerente' || u.empresaId, { message: 'El gerente debe tener empresa', path: ['empresaId'] });

const publico = {
  id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol,
  empresaId: usuarios.empresaId, activo: usuarios.activo,
};

/** Empresas, sedes, usuarios y dotaciones. */
export function adminRouter(db: DB) {
  const r = Router();

  // Sedes: lectura para cualquier usuario interno (filtros de agenda)
  r.get('/sedes', requiereRol('admin', 'operador'), async (_req, res) => {
    res.json(await db.select().from(sedes).orderBy(asc(sedes.id)));
  });

  // Empresas: lista visible para admin y operador (selectores); escritura solo admin
  r.get('/empresas', requiereRol('admin', 'operador'), async (_req, res) => {
    res.json(await db.select().from(empresas).orderBy(asc(empresas.nombre)));
  });
  r.post('/empresas', requiereRol('admin'), async (req, res) => {
    const [e] = await db.insert(empresas).values(empresaSchema.parse(req.body)).returning();
    await auditar(db, req, 'crear', 'empresa', e.id);
    res.status(201).json(e);
  });
  r.patch('/empresas/:id', requiereRol('admin'), async (req, res) => {
    const [e] = await db.update(empresas).set(empresaSchema.partial().parse(req.body)).where(eq(empresas.id, id(req.params.id))).returning();
    if (!e) throw new HttpError(404, 'Empresa no encontrada');
    await auditar(db, req, 'editar', 'empresa', e.id);
    res.json(e);
  });

  // Dotación declarada por período (base del % de cobertura)
  r.put('/empresas/:id/dotacion/:periodo', requiereRol('admin'), async (req, res) => {
    const periodo = z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.periodo);
    const { trabajadores } = z.object({ trabajadores: z.number().int().min(0) }).parse(req.body);
    const empresaId = id(req.params.id);
    const [d] = await db.insert(dotaciones).values({ empresaId, periodo, trabajadores })
      .onConflictDoUpdate({ target: [dotaciones.empresaId, dotaciones.periodo], set: { trabajadores } }).returning();
    res.json(d);
  });

  // Usuarios: solo admin
  r.get('/usuarios', requiereRol('admin'), async (_req, res) => {
    res.json(await db.select(publico).from(usuarios).orderBy(asc(usuarios.nombre)));
  });
  r.post('/usuarios', requiereRol('admin'), async (req, res) => {
    const { password, ...datos } = usuarioSchema.parse(req.body);
    const [u] = await db.insert(usuarios).values({ ...datos, passwordHash: await bcrypt.hash(password, 12) }).returning(publico);
    await auditar(db, req, 'crear', 'usuario', u.id);
    res.status(201).json(u);
  });
  r.patch('/usuarios/:id', requiereRol('admin'), async (req, res) => {
    const { password, ...datos } = usuarioBase.partial().parse(req.body);
    const cambios = { ...datos, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) };
    const [u] = await db.update(usuarios).set(cambios).where(eq(usuarios.id, id(req.params.id))).returning(publico);
    if (!u) throw new HttpError(404, 'Usuario no encontrado');
    await auditar(db, req, 'editar', 'usuario', u.id);
    res.json(u);
  });

  return r;
}
