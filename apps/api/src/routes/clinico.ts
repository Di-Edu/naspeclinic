import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { and, asc, count, desc, eq, gte, ilike, lte, type SQL } from 'drizzle-orm';
import { TIPOS_EXAMEN, ESTADOS_EXAMEN, RESULTADOS, NIVELES_HALLAZGO, ESTADOS_CITA, rutValido, normalizarRut } from '@naspeclinic/shared';
import type { DB } from '../db';
import { pacientes, examenes, archivos, citas, empresas, sedes, cargos, evaluaciones, protocolos, seguimientos } from '../db/schema';
import { abrirPorHallazgo } from '../services/seguimientos';
import { requiereRol } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';
import { cifrar, descifrar, cifrarOpcional, descifrarOpcional, hashRut } from '../lib/cifrado';
import { almacenamiento } from '../lib/almacenamiento';
import { config } from '../config';

const id = (v: string | string[]) => z.coerce.number().int().positive().parse(v);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD');
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

/** ?pagina=1&porPagina=50 (máximo 200 por página) */
function paginacion(query: unknown) {
  const { pagina, porPagina } = z.object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(200).default(50),
  }).parse(query);
  return { pagina, porPagina, desde: (pagina - 1) * porPagina };
}

const pacienteSchema = z.object({
  rut: z.string().refine(rutValido, 'RUT inválido'),
  nombre: z.string().min(2),
  email: z.string().email().nullish(),
  telefono: z.string().nullish(),
  cargo: z.string().nullish(),
  cargoId: z.number().int().positive().nullish(),
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

  /** Si viene cargoId, valida que sea de la empresa y copia su nombre al campo de texto. */
  async function conCargo<T extends { cargoId?: number | null; empresaId?: number; cargo?: string | null }>(d: T, empresaActual?: number) {
    if (!d.cargoId) return d;
    const [c] = await db.select().from(cargos).where(eq(cargos.id, d.cargoId));
    const empresaId = d.empresaId ?? empresaActual;
    if (!c || c.empresaId !== empresaId) throw new HttpError(400, 'El cargo no pertenece a la empresa del trabajador');
    return { ...d, cargo: c.nombre };
  }

  async function pacienteExiste(pacienteId: number) {
    const [p] = await db.select().from(pacientes).where(eq(pacientes.id, pacienteId));
    if (!p) throw new HttpError(404, 'Paciente no encontrado');
    return p;
  }

  // ---------- Pacientes ----------
  r.get('/pacientes', async (req, res) => {
    const q = z.object({ q: z.string().optional(), empresaId: z.coerce.number().optional() }).parse(req.query);
    const pag = paginacion(req.query);
    const filtros: SQL[] = [];
    if (q.empresaId) filtros.push(eq(pacientes.empresaId, q.empresaId));
    if (q.q) {
      // Si parece RUT se busca exacto por índice ciego; si no, por nombre
      filtros.push(rutValido(q.q) ? eq(pacientes.rutHash, hashRut(q.q)) : ilike(pacientes.nombre, `%${q.q}%`));
    }
    const donde = and(...filtros);
    const [filas, [{ total }]] = await Promise.all([
      db.select().from(pacientes).where(donde).orderBy(asc(pacientes.nombre), asc(pacientes.id)).limit(pag.porPagina).offset(pag.desde),
      db.select({ total: count() }).from(pacientes).where(donde),
    ]);
    res.json({ items: filas.map(verPaciente), total, pagina: pag.pagina, porPagina: pag.porPagina });
  });

  r.post('/pacientes', async (req, res) => {
    const { rut, ...datos } = pacienteSchema.parse(req.body);
    const [p] = await db.insert(pacientes).values({ ...(await conCargo(datos)), rutHash: hashRut(rut), rutCifrado: cifrar(normalizarRut(rut)) }).returning();
    await auditar(db, req, 'crear', 'paciente', p.id);
    res.status(201).json(verPaciente(p));
  });

  r.patch('/pacientes/:id', async (req, res) => {
    const { rut, ...datos } = pacienteSchema.partial().parse(req.body);
    const actual = await pacienteExiste(id(req.params.id));
    if (datos.empresaId && datos.empresaId !== actual.empresaId && datos.cargoId === undefined) datos.cargoId = null;
    const cambios = { ...(await conCargo(datos, actual.empresaId)), ...(rut ? { rutHash: hashRut(rut), rutCifrado: cifrar(normalizarRut(rut)) } : {}) };
    const [p] = await db.update(pacientes).set(cambios).where(eq(pacientes.id, actual.id)).returning();
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
    const evs = await db.select({ ev: evaluaciones, protocolo: protocolos.nombre }).from(evaluaciones)
      .innerJoin(protocolos, eq(evaluaciones.protocoloId, protocolos.id))
      .where(eq(evaluaciones.pacienteId, p.id)).orderBy(desc(evaluaciones.fecha), desc(evaluaciones.id));
    const segs = await db.select().from(seguimientos).where(eq(seguimientos.pacienteId, p.id)).orderBy(desc(seguimientos.id));
    await auditar(db, req, 'ver_historial', 'paciente', p.id);
    res.json({
      paciente: verPaciente(p),
      evaluaciones: evs.map(({ ev, protocolo }) => ({ ...ev, protocolo })),
      examenes: exs.map((e) => ({ ...verExamen(e), archivos: arch.filter((a) => a.examenId === e.id) })),
      seguimientos: segs.map(({ motivoCifrado, cierreCifrado, ...x }) => ({ ...x, motivo: descifrarOpcional(motivoCifrado), cierre: descifrarOpcional(cierreCifrado) })),
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
    const pag = paginacion(req.query);
    const donde = and(...f);
    const consulta = db.select({
      id: examenes.id, evaluacionId: examenes.evaluacionId, tipo: examenes.tipo, fecha: examenes.fecha, estado: examenes.estado,
      resultado: examenes.resultado, nivelHallazgo: examenes.nivelHallazgo,
      pacienteId: pacientes.id, paciente: pacientes.nombre, empresaId: empresas.id, empresa: empresas.nombre,
    }).from(examenes)
      .innerJoin(pacientes, eq(examenes.pacienteId, pacientes.id))
      .innerJoin(empresas, eq(examenes.empresaId, empresas.id))
      .where(donde).orderBy(desc(examenes.fecha), desc(examenes.id)).limit(pag.porPagina).offset(pag.desde);
    const [filas, [{ total }]] = await Promise.all([consulta, db.select({ total: count() }).from(examenes).where(donde)]);
    res.json({ items: filas, total, pagina: pag.pagina, porPagina: pag.porPagina });
  });

  r.post('/examenes', async (req, res) => {
    const { observaciones, ...datos } = examenSchema.parse(req.body);
    const p = await pacienteExiste(datos.pacienteId);
    const [e] = await db.insert(examenes).values({
      ...datos, empresaId: p.empresaId, observacionesCifradas: cifrarOpcional(observaciones), creadoPor: req.usuario!.id,
    }).returning();
    await abrirPorHallazgo(db, e, req.usuario!.id);
    await auditar(db, req, 'crear', 'examen', e.id);
    res.status(201).json(verExamen(e));
  });

  r.patch('/examenes/:id', async (req, res) => {
    const { observaciones, pacienteId: _p, ...datos } = examenSchema.partial().parse(req.body);
    const cambios = { ...datos, ...(observaciones !== undefined ? { observacionesCifradas: cifrarOpcional(observaciones) } : {}) };
    const exId = id(req.params.id);
    const [previo] = await db.select({ evaluacionId: examenes.evaluacionId, estadoEv: evaluaciones.estado })
      .from(examenes).leftJoin(evaluaciones, eq(examenes.evaluacionId, evaluaciones.id)).where(eq(examenes.id, exId));
    if (!previo) throw new HttpError(404, 'Examen no encontrado');
    if (previo.estadoEv === 'cerrada') throw new HttpError(400, 'La evaluación de este examen ya está cerrada y no se puede modificar');
    const [e] = await db.update(examenes).set(cambios).where(eq(examenes.id, exId)).returning();
    await abrirPorHallazgo(db, e, req.usuario!.id);
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
