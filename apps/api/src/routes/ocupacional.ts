import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, lt, type SQL } from 'drizzle-orm';
import {
  TIPOS_EXAMEN, TIPO_EXAMEN_LABEL, TIPOS_EVALUACION, APTITUDES, ESTADOS_VIGENCIA, ESTADO_VIGENCIA_LABEL,
  TIPOS_SEGUIMIENTO, ESTADOS_SEGUIMIENTO, RESULTADO_LABEL, type Aptitud,
} from '@naspeclinic/shared';
import type { DB } from '../db';
import {
  protocolos, protocoloExamenes, cargos, cargoProtocolos, evaluaciones, examenes, pacientes, empresas, seguimientos,
} from '../db/schema';
import { requiereRol, empresaPermitida } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';
import { cifrar, descifrarOpcional } from '../lib/cifrado';
import { hoyChile, listarAptitud, resumirAptitud, sumarMeses } from '../services/aptitud';
import { sumarDias } from '../services/seguimientos';
import { enviarCorreo } from '../services/correo';

const id = (v: string | string[]) => z.coerce.number().int().positive().parse(v);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD');
const paginacion = (q: unknown) => {
  const p = z.object({ pagina: z.coerce.number().int().min(1).default(1), porPagina: z.coerce.number().int().min(1).max(200).default(50) }).parse(q);
  return { ...p, desde: (p.pagina - 1) * p.porPagina };
};
const GRAVEDAD: Record<Aptitud, number> = { apto: 0, apto_con_restricciones: 1, no_apto: 2 };

/** Protocolos, cargos, evaluaciones (baterías), aptitud/vencimientos y seguimientos. */
export function ocupacionalRouter(db: DB) {
  const r = Router();
  const internos = requiereRol('admin', 'operador');

  // ------------------------------------------------------------------ Protocolos
  async function protocolosConExamenes() {
    const ps = await db.select().from(protocolos).orderBy(asc(protocolos.nombre));
    const ex = await db.select().from(protocoloExamenes);
    return ps.map((p) => ({ ...p, examenes: ex.filter((e) => e.protocoloId === p.id).map((e) => e.tipo) }));
  }
  const protocoloSchema = z.object({
    nombre: z.string().min(2),
    descripcion: z.string().nullish(),
    vigenciaMeses: z.number().int().min(1).max(120),
    examenes: z.array(z.enum(TIPOS_EXAMEN)).min(1, 'Incluya al menos un examen'),
    activo: z.boolean().optional(),
  });

  r.get('/protocolos', internos, async (_req, res) => { res.json(await protocolosConExamenes()); });

  r.post('/protocolos', requiereRol('admin'), async (req, res) => {
    const { examenes: tipos, ...datos } = protocoloSchema.parse(req.body);
    const [p] = await db.insert(protocolos).values(datos).returning();
    await db.insert(protocoloExamenes).values([...new Set(tipos)].map((tipo) => ({ protocoloId: p.id, tipo })));
    await auditar(db, req, 'crear', 'protocolo', p.id);
    res.status(201).json({ ...p, examenes: tipos });
  });

  r.patch('/protocolos/:id', requiereRol('admin'), async (req, res) => {
    const { examenes: tipos, ...datos } = protocoloSchema.partial().parse(req.body);
    const pid = id(req.params.id);
    const [p] = Object.keys(datos).length
      ? await db.update(protocolos).set(datos).where(eq(protocolos.id, pid)).returning()
      : await db.select().from(protocolos).where(eq(protocolos.id, pid));
    if (!p) throw new HttpError(404, 'Protocolo no encontrado');
    if (tipos) {
      await db.delete(protocoloExamenes).where(eq(protocoloExamenes.protocoloId, pid));
      await db.insert(protocoloExamenes).values([...new Set(tipos)].map((tipo) => ({ protocoloId: pid, tipo })));
    }
    await auditar(db, req, 'editar', 'protocolo', pid);
    res.json((await protocolosConExamenes()).find((x) => x.id === pid));
  });

  // ------------------------------------------------------------------ Cargos
  async function cargosDe(empresaId?: number) {
    const cs = await db.select().from(cargos).where(empresaId ? eq(cargos.empresaId, empresaId) : undefined).orderBy(asc(cargos.nombre));
    const cps = cs.length ? await db.select().from(cargoProtocolos).where(inArray(cargoProtocolos.cargoId, cs.map((c) => c.id))) : [];
    return cs.map((c) => ({ ...c, protocoloIds: cps.filter((x) => x.cargoId === c.id).map((x) => x.protocoloId) }));
  }
  const cargoSchema = z.object({ empresaId: z.number().int().positive(), nombre: z.string().min(2), protocoloIds: z.array(z.number().int().positive()) });

  r.get('/cargos', internos, async (req, res) => {
    const { empresaId } = z.object({ empresaId: z.coerce.number().optional() }).parse(req.query);
    res.json(await cargosDe(empresaId));
  });

  r.post('/cargos', requiereRol('admin'), async (req, res) => {
    const { protocoloIds, ...datos } = cargoSchema.parse(req.body);
    const [c] = await db.insert(cargos).values(datos).returning();
    if (protocoloIds.length) await db.insert(cargoProtocolos).values([...new Set(protocoloIds)].map((protocoloId) => ({ cargoId: c.id, protocoloId })));
    await auditar(db, req, 'crear', 'cargo', c.id);
    res.status(201).json({ ...c, protocoloIds });
  });

  r.patch('/cargos/:id', requiereRol('admin'), async (req, res) => {
    const { protocoloIds, nombre } = cargoSchema.omit({ empresaId: true }).partial().parse(req.body);
    const cid = id(req.params.id);
    const [c] = nombre
      ? await db.update(cargos).set({ nombre }).where(eq(cargos.id, cid)).returning()
      : await db.select().from(cargos).where(eq(cargos.id, cid));
    if (!c) throw new HttpError(404, 'Cargo no encontrado');
    if (nombre) await db.update(pacientes).set({ cargo: nombre }).where(eq(pacientes.cargoId, cid));
    if (protocoloIds) {
      await db.delete(cargoProtocolos).where(eq(cargoProtocolos.cargoId, cid));
      if (protocoloIds.length) await db.insert(cargoProtocolos).values([...new Set(protocoloIds)].map((protocoloId) => ({ cargoId: cid, protocoloId })));
    }
    await auditar(db, req, 'editar', 'cargo', cid);
    res.json((await cargosDe(c.empresaId)).find((x) => x.id === cid));
  });

  // ------------------------------------------------------------------ Evaluaciones
  async function detalleEvaluacion(evId: number) {
    const [ev] = await db.select({
      ev: evaluaciones, protocolo: protocolos.nombre, vigenciaMeses: protocolos.vigenciaMeses,
    }).from(evaluaciones).innerJoin(protocolos, eq(evaluaciones.protocoloId, protocolos.id)).where(eq(evaluaciones.id, evId));
    if (!ev) throw new HttpError(404, 'Evaluación no encontrada');
    const exs = await db.select().from(examenes).where(eq(examenes.evaluacionId, evId)).orderBy(asc(examenes.id));
    const resultados = exs.map((e) => e.resultado).filter((x): x is Aptitud => !!x);
    const aptitudSugerida = exs.length && exs.every((e) => e.estado === 'completado')
      ? resultados.reduce<Aptitud>((peor, x) => (GRAVEDAD[x] > GRAVEDAD[peor] ? x : peor), 'apto')
      : null;
    return {
      ...ev.ev, protocolo: ev.protocolo, vigenciaMeses: ev.vigenciaMeses,
      vigenciaSugerida: sumarMeses(ev.ev.fecha, ev.vigenciaMeses),
      aptitudSugerida,
      examenes: exs.map(({ observacionesCifradas, ...e }) => ({ ...e, observaciones: descifrarOpcional(observacionesCifradas) })),
      pendientes: exs.filter((e) => e.estado !== 'completado').length,
    };
  }

  r.post('/evaluaciones', internos, async (req, res) => {
    const datos = z.object({
      pacienteId: z.number().int().positive(), protocoloId: z.number().int().positive(),
      tipo: z.enum(TIPOS_EVALUACION), fecha, sedeId: z.number().int().positive().nullish(),
    }).parse(req.body);
    const [p] = await db.select().from(pacientes).where(eq(pacientes.id, datos.pacienteId));
    if (!p) throw new HttpError(404, 'Paciente no encontrado');
    const [prot] = await db.select().from(protocolos).where(eq(protocolos.id, datos.protocoloId));
    if (!prot?.activo) throw new HttpError(404, 'Protocolo no encontrado');
    const [abierta] = await db.select({ id: evaluaciones.id }).from(evaluaciones)
      .where(and(eq(evaluaciones.pacienteId, p.id), eq(evaluaciones.protocoloId, prot.id), eq(evaluaciones.estado, 'en_curso')));
    if (abierta) throw new HttpError(409, 'Ya hay una evaluación en curso de este protocolo para el trabajador');
    const tipos = (await db.select().from(protocoloExamenes).where(eq(protocoloExamenes.protocoloId, prot.id))).map((x) => x.tipo);
    const [ev] = await db.insert(evaluaciones).values({ ...datos, empresaId: p.empresaId, creadoPor: req.usuario!.id }).returning();
    // La batería: un examen pendiente por cada prestación del protocolo
    await db.insert(examenes).values(tipos.map((tipo) => ({
      pacienteId: p.id, empresaId: p.empresaId, evaluacionId: ev.id, sedeId: datos.sedeId ?? null,
      tipo, fecha: datos.fecha, estado: 'pendiente' as const, creadoPor: req.usuario!.id,
    })));
    await auditar(db, req, 'crear', 'evaluacion', ev.id);
    res.status(201).json(await detalleEvaluacion(ev.id));
  });

  r.get('/evaluaciones/:id', internos, async (req, res) => {
    const ev = await detalleEvaluacion(id(req.params.id));
    await auditar(db, req, 'ver', 'evaluacion', ev.id);
    res.json(ev);
  });

  /** Cierra la evaluación con la aptitud. Requiere todos los exámenes completados. */
  r.post('/evaluaciones/:id/cerrar', internos, async (req, res) => {
    const body = z.object({
      aptitud: z.enum(APTITUDES),
      restricciones: z.string().trim().nullish(),
      vigenteHasta: fecha.nullish(),
      fechaReevaluacion: fecha.nullish(),
    }).parse(req.body);
    const ev = await detalleEvaluacion(id(req.params.id));
    if (ev.estado === 'cerrada') throw new HttpError(400, 'La evaluación ya está cerrada');
    if (ev.pendientes) throw new HttpError(400, `Faltan ${ev.pendientes} examen(es) por completar`);
    if (body.aptitud === 'apto_con_restricciones' && !body.restricciones) throw new HttpError(400, 'Indique las restricciones laborales');
    const vigenteHasta = body.aptitud === 'no_apto' ? null : body.vigenteHasta ?? ev.vigenciaSugerida;
    if (vigenteHasta && vigenteHasta <= ev.fecha) throw new HttpError(400, 'La vigencia debe ser posterior a la fecha de evaluación');
    await db.update(evaluaciones).set({
      estado: 'cerrada', aptitud: body.aptitud, restricciones: body.aptitud === 'apto' ? null : body.restricciones ?? null,
      vigenteHasta, cerradaPor: req.usuario!.id, cerradaEn: new Date(),
    }).where(eq(evaluaciones.id, ev.id));
    if (body.aptitud === 'no_apto') {
      await db.insert(seguimientos).values({
        pacienteId: ev.pacienteId, empresaId: ev.empresaId, evaluacionId: ev.id, tipo: 'no_apto_temporal',
        motivoCifrado: cifrar(`No apto en evaluación ${ev.protocolo}${body.restricciones ? `: ${body.restricciones}` : ''}`),
        fechaCompromiso: body.fechaReevaluacion ?? sumarDias(hoyChile(), 30), creadoPor: req.usuario!.id,
      });
    }
    await auditar(db, req, 'cerrar', 'evaluacion', ev.id);
    res.json(await detalleEvaluacion(ev.id));
  });

  // ------------------------------------------------------------------ Aptitud y vencimientos
  const filtroAptitud = z.object({
    empresaId: z.coerce.number().optional(),
    estado: z.enum(ESTADOS_VIGENCIA).optional(),
    protocoloId: z.coerce.number().optional(),
    q: z.string().trim().optional(),
    formato: z.enum(['json', 'csv']).default('json'),
  });

  r.get('/aptitud', requiereRol('admin', 'operador', 'gerente'), async (req, res) => {
    const q = filtroAptitud.parse(req.query);
    const empresaId = empresaPermitida(req, q.empresaId);
    const todas = await listarAptitud(db, empresaId);
    const texto = q.q?.toLowerCase().replace(/[.\s]/g, '');
    const filas = todas.filter((f) =>
      (!q.estado || f.estado === q.estado)
      && (!q.protocoloId || f.protocoloId === q.protocoloId)
      && (!texto || f.trabajador.toLowerCase().replace(/\s/g, '').includes(texto) || f.rut.toLowerCase().replace(/[.\s]/g, '').includes(texto)));
    await auditar(db, req, q.formato === 'csv' ? 'exportar_aptitud' : 'ver_aptitud', 'empresa', empresaId);

    if (q.formato === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lineas = [
        ['Trabajador', 'RUT', 'Empresa', 'Cargo', 'Protocolo', 'Aptitud', 'Restricciones', 'Fecha evaluación', 'Vigente hasta', 'Días restantes', 'Estado'].map(esc).join(';'),
        ...filas.map((f) => [f.trabajador, f.rut, f.empresa, f.cargo, f.protocolo, f.aptitud ? RESULTADO_LABEL[f.aptitud] : '', f.restricciones,
          f.fechaEvaluacion, f.vigenteHasta, f.diasRestantes, ESTADO_VIGENCIA_LABEL[f.estado]].map(esc).join(';')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aptitud-${hoyChile()}.csv"`);
      return res.send(`\uFEFF${lineas.join('\r\n')}`);
    }

    const pag = paginacion(req.query);
    // Lo urgente primero: vencidos, no aptos, sin evaluación, por vencer, vigentes
    const orden = { vencido: 0, no_apto: 1, sin_evaluacion: 2, por_vencer: 3, vigente: 4 };
    filas.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0) || a.trabajador.localeCompare(b.trabajador));
    res.json({
      items: filas.slice(pag.desde, pag.desde + pag.porPagina),
      total: filas.length, pagina: pag.pagina, porPagina: pag.porPagina,
      resumen: resumirAptitud(todas),
    });
  });

  /** Avisa por correo al gerente qué trabajadores tienen la aptitud vencida o por vencer. */
  r.post('/aptitud/notificar', requiereRol('admin'), async (req, res) => {
    const { empresaId } = z.object({ empresaId: z.number().int().positive() }).parse(req.body);
    const [emp] = await db.select().from(empresas).where(eq(empresas.id, empresaId));
    if (!emp) throw new HttpError(404, 'Empresa no encontrada');
    if (!emp.emailGerente) throw new HttpError(400, 'La empresa no tiene email de gerente');
    const filas = (await listarAptitud(db, empresaId)).filter((f) => f.estado === 'vencido' || f.estado === 'por_vencer');
    if (!filas.length) return res.json({ enviado: false, cantidad: 0, mensaje: 'No hay vencimientos que avisar' });
    filas.sort((a, b) => (a.diasRestantes ?? -9999) - (b.diasRestantes ?? -9999));
    const linea = (f: typeof filas[number]) =>
      `- ${f.trabajador} (${f.cargo}) · ${f.protocolo}: ${f.estado === 'vencido' ? `VENCIDO desde ${f.vigenteHasta}` : `vence el ${f.vigenteHasta} (${f.diasRestantes} días)`}`;
    const info = await enviarCorreo({
      para: emp.emailGerente,
      asunto: `Naspeclinic — ${filas.length} evaluaciones vencidas o por vencer en ${emp.nombre}`,
      texto: `Estimado/a:\n\nLos siguientes trabajadores de ${emp.nombre} requieren renovar su evaluación ocupacional para mantener su aptitud vigente:\n\n${filas.map(linea).join('\n')}\n\nPuede coordinar las horas respondiendo este correo.\n\nNaspeclinic`,
    });
    await auditar(db, req, 'notificar_vencimientos', 'empresa', empresaId);
    res.json({ enviado: true, para: emp.emailGerente, cantidad: filas.length, simulado: info.simulado });
  });

  // ------------------------------------------------------------------ Seguimientos
  r.get('/seguimientos', internos, async (req, res) => {
    const q = z.object({
      estado: z.enum(ESTADOS_SEGUIMIENTO).optional(), vencidos: z.enum(['1']).optional(),
      empresaId: z.coerce.number().optional(), pacienteId: z.coerce.number().optional(),
    }).parse(req.query);
    const pag = paginacion(req.query);
    const f: SQL[] = [];
    if (q.estado) f.push(eq(seguimientos.estado, q.estado));
    if (q.vencidos) f.push(eq(seguimientos.estado, 'abierto'), lt(seguimientos.fechaCompromiso, hoyChile()));
    if (q.empresaId) f.push(eq(seguimientos.empresaId, q.empresaId));
    if (q.pacienteId) f.push(eq(seguimientos.pacienteId, q.pacienteId));
    const donde = and(...f);
    const filas = await db.select({
      s: seguimientos, paciente: pacientes.nombre, empresa: empresas.nombre, examenTipo: examenes.tipo,
    }).from(seguimientos)
      .innerJoin(pacientes, eq(seguimientos.pacienteId, pacientes.id))
      .innerJoin(empresas, eq(seguimientos.empresaId, empresas.id))
      .leftJoin(examenes, eq(seguimientos.examenId, examenes.id))
      .where(donde)
      .orderBy(desc(eq(seguimientos.estado, 'abierto')), asc(seguimientos.fechaCompromiso), desc(seguimientos.id))
      .limit(pag.porPagina).offset(pag.desde);
    const total = (await db.select({ id: seguimientos.id }).from(seguimientos).where(donde)).length;
    const hoy = hoyChile();
    res.json({
      items: filas.map(({ s, ...x }) => ({
        id: s.id, pacienteId: s.pacienteId, paciente: x.paciente, empresaId: s.empresaId, empresa: x.empresa,
        tipo: s.tipo, examenId: s.examenId, evaluacionId: s.evaluacionId, examen: x.examenTipo ? TIPO_EXAMEN_LABEL[x.examenTipo] : null,
        motivo: descifrarOpcional(s.motivoCifrado), cierre: descifrarOpcional(s.cierreCifrado),
        fechaCompromiso: s.fechaCompromiso, estado: s.estado, cerradoEn: s.cerradoEn, creadoEn: s.creadoEn,
        vencido: s.estado === 'abierto' && !!s.fechaCompromiso && s.fechaCompromiso < hoy,
      })),
      total, pagina: pag.pagina, porPagina: pag.porPagina,
    });
  });

  r.post('/seguimientos', internos, async (req, res) => {
    const d = z.object({
      pacienteId: z.number().int().positive(), tipo: z.enum(TIPOS_SEGUIMIENTO), motivo: z.string().min(3),
      fechaCompromiso: fecha, examenId: z.number().int().positive().nullish(),
    }).parse(req.body);
    const [p] = await db.select().from(pacientes).where(eq(pacientes.id, d.pacienteId));
    if (!p) throw new HttpError(404, 'Paciente no encontrado');
    const [s] = await db.insert(seguimientos).values({
      pacienteId: p.id, empresaId: p.empresaId, tipo: d.tipo, motivoCifrado: cifrar(d.motivo),
      fechaCompromiso: d.fechaCompromiso, examenId: d.examenId ?? null, creadoPor: req.usuario!.id,
    }).returning({ id: seguimientos.id });
    await auditar(db, req, 'crear', 'seguimiento', s.id);
    res.status(201).json(s);
  });

  /** Reprogramar la fecha o cerrar el seguimiento con su resultado. */
  r.patch('/seguimientos/:id', internos, async (req, res) => {
    const d = z.object({ fechaCompromiso: fecha.optional(), cerrar: z.object({ resultado: z.string().min(3) }).optional() }).parse(req.body);
    const sid = id(req.params.id);
    const [s] = await db.select().from(seguimientos).where(eq(seguimientos.id, sid));
    if (!s) throw new HttpError(404, 'Seguimiento no encontrado');
    if (s.estado === 'cerrado') throw new HttpError(400, 'El seguimiento ya está cerrado');
    await db.update(seguimientos).set({
      ...(d.fechaCompromiso ? { fechaCompromiso: d.fechaCompromiso } : {}),
      ...(d.cerrar ? { estado: 'cerrado' as const, cierreCifrado: cifrar(d.cerrar.resultado), cerradoPor: req.usuario!.id, cerradoEn: new Date() } : {}),
    }).where(eq(seguimientos.id, sid));
    await auditar(db, req, d.cerrar ? 'cerrar' : 'reprogramar', 'seguimiento', sid);
    res.json({ ok: true });
  });

  // Conteo de seguimientos abiertos/vencidos (para el menú y el dashboard interno)
  r.get('/seguimientos/resumen', internos, async (_req, res) => {
    const abiertos = await db.select({ f: seguimientos.fechaCompromiso }).from(seguimientos).where(eq(seguimientos.estado, 'abierto'));
    const hoy = hoyChile();
    res.json({ abiertos: abiertos.length, vencidos: abiertos.filter((x) => x.f && x.f < hoy).length });
  });

  return r;
}

