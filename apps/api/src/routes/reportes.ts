import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { empresas } from '../db/schema';
import { requiereRol, empresaPermitida } from '../middleware/auth';
import { HttpError } from '../lib/errores';
import { auditar } from '../lib/auditoria';
import { calcularKpis } from '../services/kpis';
import { generarReportePdf } from '../services/pdf';
import { enviarCorreo } from '../services/correo';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10" → rango del mes. Por defecto, el mes anterior. */
function rangoPeriodo(periodo?: string) {
  let anio: number, mes: number;
  if (periodo) {
    const m = /^(\d{4})-(\d{2})$/.exec(periodo);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new HttpError(400, 'Período inválido, use AAAA-MM');
    anio = Number(m[1]); mes = Number(m[2]);
  } else {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    anio = d.getFullYear(); mes = d.getMonth() + 1;
  }
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(anio, mes, 0).getDate();
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${ultimo}`, texto: `${MESES[mes - 1]} ${anio}`, periodo: `${anio}-${mm}` };
}

export function reportesRouter(db: DB) {
  const r = Router();
  r.use(['/dashboard', '/reportes'], requiereRol('admin', 'gerente'));

  /** Dashboard KPI. Por defecto: últimos 6 meses. */
  r.get('/dashboard', async (req, res) => {
    const q = z.object({ empresaId: z.coerce.number().optional(), desde: fecha.optional(), hasta: fecha.optional() }).parse(req.query);
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
    const desde = q.desde ?? `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`;
    const hasta = q.hasta ?? hoy.toISOString().slice(0, 10);
    res.json(await calcularKpis(db, { empresaId: empresaPermitida(req, q.empresaId), desde, hasta }));
  });

  async function cargarReporte(empresaIdParam: string | string[], periodo?: string) {
    const empresaId = z.coerce.number().int().positive().parse(empresaIdParam);
    const [empresa] = await db.select().from(empresas).where(eq(empresas.id, empresaId));
    if (!empresa) throw new HttpError(404, 'Empresa no encontrada');
    const rango = rangoPeriodo(periodo);
    const datos = await calcularKpis(db, { empresaId, desde: rango.desde, hasta: rango.hasta });
    return { empresa, rango, datos };
  }

  const periodoQ = (q: unknown) => z.object({ periodo: z.string().optional() }).parse(q).periodo;

  r.get('/reportes/:empresaId', async (req, res) => {
    empresaPermitida(req, Number(req.params.empresaId));
    const { empresa, rango, datos } = await cargarReporte(req.params.empresaId, periodoQ(req.query));
    res.json({ empresa: { id: empresa.id, nombre: empresa.nombre }, periodo: rango.periodo, ...datos });
  });

  r.get('/reportes/:empresaId/pdf', async (req, res) => {
    empresaPermitida(req, Number(req.params.empresaId));
    const { empresa, rango, datos } = await cargarReporte(req.params.empresaId, periodoQ(req.query));
    const pdf = await generarReportePdf(empresa.nombre, rango.texto, datos);
    await auditar(db, req, 'descargar_reporte', 'empresa', empresa.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${rango.periodo}-${empresa.id}.pdf"`);
    res.send(pdf);
  });

  r.post('/reportes/:empresaId/enviar', requiereRol('admin'), async (req, res) => {
    const { empresa, rango, datos } = await cargarReporte(req.params.empresaId, periodoQ(req.query));
    if (!empresa.emailGerente) throw new HttpError(400, 'La empresa no tiene email de gerente');
    const pdf = await generarReportePdf(empresa.nombre, rango.texto, datos);
    const info = await enviarCorreo({
      para: empresa.emailGerente,
      asunto: `Reporte ejecutivo Naspeclinic — ${rango.texto}`,
      texto: `Estimado/a:\n\nAdjuntamos el reporte ejecutivo de salud ocupacional de ${empresa.nombre} correspondiente a ${rango.texto}.\n\nSaludos,\nNaspeclinic`,
      adjuntos: [{ filename: `reporte-${rango.periodo}.pdf`, content: pdf }],
    });
    await auditar(db, req, 'enviar_reporte', 'empresa', empresa.id);
    res.json({ enviado: true, para: empresa.emailGerente, simulado: info.simulado });
  });

  return r;
}
