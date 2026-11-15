import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { and, asc, desc, eq, gte, ilike, lte, type SQL } from 'drizzle-orm';
import { TIPOS_EXAMEN, ESTADOS_EXAMEN, RESULTADOS, NIVELES_HALLAZGO, ESTADOS_CITA, rutValido, normalizarRut } from '@naspeclinic/shared';
import type { DB } from '../db';
import { pacientes, examenes, archivos, citas, empresas, sedes } from '../db/schema';
import { requiereRol } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';
import { cifrar, descifrar, cifrarOpcional, descifrarOpcional, hashRut } from '../lib/cifrado';
import { almacenamiento } from '../lib/almacenamiento';
import { config } from '../config';

const id = (v: string | string[]) => z.coerce.number().int().positive().parse(v);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD');
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

const pacienteSchema = z.object({
  rut: z.string().refine(rutValido, 'RUT inválido'),
  nombre: z.string().min(2),
  email: z.string().email().nullish(),
  telefono: z.string().nullish(),
  cargo: z.string().nullish(),
  empresaId: z.number().int().positive(),
});

const examenSchema = z.object({
  pacienteId: z.number().int().positive(),
  sedeId: z.number().int().positive().nullish(),
  tipo: z.enum(TIPOS_EXAMEN),
  fecha,
  estado: z.enum(ESTADOS_EXAMEN).optional(),
  resultado: z.enum(RESULTADOS).nullish(),
  nivelHallazgo: z.enum(NIVELES_HALLAZGO).optional(),
  observaciones: z.string().nullish(),
});

const citaSchema = z.object({
  pacienteId: z.number().int().positive(),
  sedeId: z.number().int().positive(),
  tipoExamen: z.enum(TIPOS_EXAMEN),
  fechaHora: z.coerce.date(),
  estado: z.enum(ESTADOS_CITA).optional(),
  notas: z.string().nullish(),
});

type FilaPaciente = typeof pacientes.$inferSelect;
const verPaciente = ({ rutCifrado, rutHash: _h, ...p }: FilaPaciente) => ({ ...p, rut: descifrar(rutCifrado) });

type FilaExamen = typeof examenes.$inferSelect;
const verExamen = ({ observacionesCifradas, ...e }: FilaExamen) => ({ ...e, observaciones: descifrarOpcional(observacionesCifradas) });

/** Pacientes, exámenes, archivos y citas. Solo personal de Naspeclinic (admin y operador). */
export function clinicoRouter(db: DB) {
  const r = Router();
  r.use(['/pacientes', '/examenes', '/archivos', '/citas'], requiereRol('admin', 'operador'));
  const subida = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxArchivoMB * 1024 * 1024, files: 10 },
    fileFilter: (_req, f, cb) => (MIMES.includes(f.mimetype) ? cb(null, true) : cb(new HttpError(400, 'Solo se aceptan PDF, JPG o PNG'))),
  });

  async function pacienteExiste(pacienteId: number) {
    const [p] = await db.select().from(pacientes).where(eq(pacientes.id, pacienteId));
    if (!p) throw new HttpError(404, 'Paciente no encontrado');
    return p;
  }

  // ---------- Pacientes ----------
  r.get('/pacientes', async (req, res) => {
    const q = z.object({ q: z.string().optional(), empresaId: z.coerce.number().optional() }).parse(req.query);
    const filtros: SQL[] = [];
    if (q.empresaId) filtros.push(eq(pacientes.empresaId, q.empresaId));
    if (q.q) {
      // Si parece RUT se busca exacto por índice ciego; si no, por nombre
      filtros.push(rutValido(q.q) ? eq(pacientes.rutHash, hashRut(q.q)) : ilike(pacientes.nombre, `%${q.q}%`));
    }
    const filas = await db.select().from(pacientes).where(and(...filtros)).orderBy(asc(pacientes.nombre)).limit(200);
    res.json(filas.map(verPaciente));
  });

  r.post('/pacientes', async (req, res) => {
    const { rut, ...datos } = pacienteSchema.parse(req.body);
    const [p] = await db.insert(pacientes).values({ ...datos, rutHash: hashRut(rut), rutCifrado: cifrar(normalizarRut(rut)) }).returning();
    await auditar(db, req, 'crear', 'paciente', p.id);
    res.status(201).json(verPaciente(p));
  });

  r.patch('/pacientes/:id', async (req, res) => {
    const { rut, ...datos } = pacienteSchema.partial().parse(req.body);
    const cambios = { ...datos, ...(rut ? { rutHash: hashRut(rut), rutCifrado: cifrar(normalizarRut(rut)) } : {}) };
    const [p] = await db.update(pacientes).set(cambios).where(eq(pacientes.id, id(req.params.id))).returning();
    if (!p) throw new HttpError(404, 'Paciente no encontrado');
    await auditar(db, req, 'editar', 'paciente', p.id);
    res.json(verPaciente(p));
  });

  /** Historial completo del paciente: datos, exámenes (con archivos) y citas */
  r.get('/pacientes/:id/historial', async (req, res) => {
    const p = await pacienteExiste(id(req.params.id));
    const exs = await db.select().from(examenes).where(eq(examenes.pacienteId, p.id)).orderBy(desc(examenes.fecha));
    const arch = await db.select({ id: archivos.id, examenId: archivos.examenId, nombre: archivos.nombre, mime: archivos.mime, tamano: archivos.tamano })
      .from(archivos).innerJoin(examenes, eq(archivos.examenId, examenes.id)).where(eq(examenes.pacienteId, p.id));
    const cts = await db.select().from(citas).where(eq(citas.pacienteId, p.id)).orderBy(desc(citas.fechaHora));
    await auditar(db, req, 'ver_historial', 'paciente', p.id);
    res.json({
      paciente: verPaciente(p),
      examenes: exs.map((e) => ({ ...verExamen(e), archivos: arch.filter((a) => a.examenId === e.id) })),
      citas: cts,
    });
  });

  // ---------- Exámenes ----------
  r.get('/examenes', async (req, res) => {
    const q = z.object({
      empresaId: z.coerce.number().optional(),
      pacienteId: z.coerce.number().optional(),
      tipo: z.enum(TIPOS_EXAMEN).optional(),
      estado: z.enum(ESTADOS_EXAMEN).optional(),
      desde: fecha.optional(),
      hasta: fecha.optional(),
    }).parse(req.query);
    const f: SQL[] = [];
    if (q.empresaId) f.push(eq(examenes.empresaId, q.empresaId));
    if (q.pacienteId) f.push(eq(examenes.pacienteId, q.pacienteId));
    if (q.tipo) f.push(eq(examenes.tipo, q.tipo));
    if (q.estado) f.push(eq(examenes.estado, q.estado));
    if (q.desde) f.push(gte(examenes.fecha, q.desde));
    if (q.hasta) f.push(lte(examenes.fecha, q.hasta));
    const filas = await db.select({
      id: examenes.id, tipo: examenes.tipo, fecha: examenes.fecha, estado: examenes.estado,
      resultado: examenes.resultado, nivelHallazgo: examenes.nivelHallazgo,
      pacienteId: pacientes.id, paciente: pacientes.nombre, empresaId: empresas.id, empresa: empresas.nombre,
    }).from(examenes)
      .innerJoin(pacientes, eq(examenes.pacienteId, pacientes.id))
      .innerJoin(empresas, eq(examenes.empresaId, empresas.id))
      .where(and(...f)).orderBy(desc(examenes.fecha)).limit(500);
    res.json(filas);
  });

  r.post('/examenes', async (req, res) => {
    const { observaciones, ...datos } = examenSchema.parse(req.body);
    const p = await pacienteExiste(datos.pacienteId);
    const [e] = await db.insert(examenes).values({
      ...datos, empresaId: p.empresaId, observacionesCifradas: cifrarOpcional(observaciones), creadoPor: req.usuario!.id,
    }).returning();
    await auditar(db, req, 'crear', 'examen', e.id);
    res.status(201).json(verExamen(e));
  });

  r.patch('/examenes/:id', async (req, res) => {
    const { observaciones, pacienteId: _p, ...datos } = examenSchema.partial().parse(req.body);
    const cambios = { ...datos, ...(observaciones !== undefined ? { observacionesCifradas: cifrarOpcional(observaciones) } : {}) };
    const [e] = await db.update(examenes).set(cambios).where(eq(examenes.id, id(req.params.id))).returning();
    if (!e) throw new HttpError(404, 'Examen no encontrado');
    await auditar(db, req, 'editar', 'examen', e.id);
    res.json(verExamen(e));
  });

  r.post('/examenes/:id/archivos', subida.array('archivos'), async (req, res) => {
    const examenId = id(req.params.id);
    const [e] = await db.select({ id: examenes.id }).from(examenes).where(eq(examenes.id, examenId));
    if (!e) throw new HttpError(404, 'Examen no encontrado');
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(400, 'Adjunte al menos un archivo en el campo "archivos"');
    const creados = [];
    for (const f of files) {
      const clave = await almacenamiento.guardar(f.buffer, f.originalname);
      const [a] = await db.insert(archivos).values({ examenId, clave, nombre: f.originalname, mime: f.mimetype, tamano: f.size })
        .returning({ id: archivos.id, nombre: archivos.nombre, mime: archivos.mime, tamano: archivos.tamano });
      await auditar(db, req, 'subir_archivo', 'archivo', a.id);
      creados.push(a);
    }
    res.status(201).json(creados);
  });

  r.get('/archivos/:id/descarga', async (req, res) => {
    const [a] = await db.select().from(archivos).where(eq(archivos.id, id(req.params.id)));
    if (!a) throw new HttpError(404, 'Archivo no encontrado');
    await auditar(db, req, 'descargar_archivo', 'archivo', a.id);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.nombre)}"`);
    res.send(await almacenamiento.leer(a.clave));
  });

  // ---------- Citas ----------
  r.get('/citas', async (req, res) => {
    const q = z.object({
      sedeId: z.coerce.number().optional(),
      empresaId: z.coerce.number().optional(),
      estado: z.enum(ESTADOS_CITA).optional(),
      desde: z.coerce.date().optional(),
      hasta: z.coerce.date().optional(),
    }).parse(req.query);
    const f: SQL[] = [];
    if (q.sedeId) f.push(eq(citas.sedeId, q.sedeId));
    if (q.empresaId) f.push(eq(citas.empresaId, q.empresaId));
    if (q.estado) f.push(eq(citas.estado, q.estado));
    if (q.desde) f.push(gte(citas.fechaHora, q.desde));
    if (q.hasta) f.push(lte(citas.fechaHora, q.hasta));
    const filas = await db.select({
      id: citas.id, fechaHora: citas.fechaHora, estado: citas.estado, tipoExamen: citas.tipoExamen, notas: citas.notas,
      pacienteId: pacientes.id, paciente: pacientes.nombre, telefono: pacientes.telefono,
      empresaId: empresas.id, empresa: empresas.nombre, sedeId: sedes.id, sede: sedes.nombre,
    }).from(citas)
      .innerJoin(pacientes, eq(citas.pacienteId, pacientes.id))
      .innerJoin(empresas, eq(citas.empresaId, empresas.id))
      .innerJoin(sedes, eq(citas.sedeId, sedes.id))
      .where(and(...f)).orderBy(asc(citas.fechaHora)).limit(1000);
    res.json(filas);
  });

  r.post('/citas', async (req, res) => {
    const datos = citaSchema.parse(req.body);
    const p = await pacienteExiste(datos.pacienteId);
    const [c] = await db.insert(citas).values({ ...datos, empresaId: p.empresaId }).returning();
    await auditar(db, req, 'crear', 'cita', c.id);
    // Notificación al paciente (email/SMS): se conecta al proveedor en la etapa de agenda
    res.status(201).json(c);
  });

  r.patch('/citas/:id', async (req, res) => {
    const { pacienteId: _p, ...datos } = citaSchema.partial().parse(req.body);
    const [c] = await db.update(citas).set(datos).where(eq(citas.id, id(req.params.id))).returning();
    if (!c) throw new HttpError(404, 'Cita no encontrada');
    await auditar(db, req, 'editar', 'cita', c.id);
    res.json(c);
  });

  return r;
}
