import { sql, type SQL } from 'drizzle-orm';
import { TIPO_EXAMEN_LABEL, type TipoExamen } from '@naspeclinic/shared';
import type { DB } from '../db';

export interface FiltroKpi {
  empresaId: number | null; // null = todas las empresas (solo admin)
  desde: string; // AAAA-MM-DD
  hasta: string; // AAAA-MM-DD
}

/** Parámetros del ROI estimado. Se confirman con Naspeclinic y pueden ajustarse por empresa. */
export const PARAMETROS_ROI = {
  costoEvitadoCritico: 3_000_000, // CLP por hallazgo crítico detectado a tiempo
  costoEvitadoModerado: 500_000, // CLP por hallazgo moderado
  costoPorExamen: 85_000, // CLP promedio por examen realizado
};

const TZ = 'America/Santiago';

async function filas<T>(db: DB, q: SQL): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows: T[] };
  return r.rows;
}

const n = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function calcularKpis(db: DB, f: FiltroKpi) {
  const empEx = f.empresaId ? sql`and e.empresa_id = ${f.empresaId}` : sql``;
  const empCi = f.empresaId ? sql`and c.empresa_id = ${f.empresaId}` : sql``;
  const empDo = f.empresaId ? sql`and d.empresa_id = ${f.empresaId}` : sql``;
  const rangoEx = sql`e.fecha between ${f.desde} and ${f.hasta}`;
  const rangoCi = sql`(c.fecha_hora at time zone ${TZ})::date between ${f.desde} and ${f.hasta}`;
  const periodoHasta = f.hasta.slice(0, 7);

  const [ex] = await filas<Record<string, unknown>>(db, sql`
    select
      count(*) as atenciones,
      count(*) filter (where e.estado = 'completado') as completados,
      count(distinct e.paciente_id) filter (where e.estado = 'completado') as examinados,
      count(*) filter (where e.nivel_hallazgo = 'moderado') as moderados,
      count(*) filter (where e.nivel_hallazgo = 'critico') as criticos
    from examenes e where ${rangoEx} ${empEx}`);

  // Dotación: último valor declarado por cada empresa hasta el período consultado
  const [dot] = await filas<{ total: unknown }>(db, sql`
    select coalesce(sum(t.trabajadores), 0) as total from (
      select distinct on (d.empresa_id) d.trabajadores
      from dotaciones d where d.periodo <= ${periodoHasta} ${empDo}
      order by d.empresa_id, d.periodo desc
    ) t`);

  const [ci] = await filas<Record<string, unknown>>(db, sql`
    select
      count(*) filter (where c.estado <> 'cancelada') as agendadas,
      count(*) filter (where c.estado = 'ausente') as ausentes
    from citas c where ${rangoCi} ${empCi}`);

  const porEspecialidad = await filas<{ tipo: TipoExamen; total: unknown; hallazgos: unknown }>(db, sql`
    select e.tipo, count(*) as total, count(*) filter (where e.nivel_hallazgo <> 'ninguno') as hallazgos
    from examenes e where ${rangoEx} ${empEx} group by e.tipo order by total desc`);

  const tendenciaEx = await filas<{ mes: string; atenciones: unknown; hallazgos: unknown }>(db, sql`
    select to_char(e.fecha, 'YYYY-MM') as mes, count(*) as atenciones,
      count(*) filter (where e.nivel_hallazgo <> 'ninguno') as hallazgos
    from examenes e where ${rangoEx} ${empEx} group by 1 order by 1`);

  const tendenciaCi = await filas<{ mes: string; agendadas: unknown; ausentes: unknown }>(db, sql`
    select to_char(c.fecha_hora at time zone ${TZ}, 'YYYY-MM') as mes,
      count(*) filter (where c.estado <> 'cancelada') as agendadas,
      count(*) filter (where c.estado = 'ausente') as ausentes
    from citas c where ${rangoCi} ${empCi} group by 1 order by 1`);

  const alertas = await filas<{ tipo: TipoExamen; nivel: 'moderado' | 'critico'; total: unknown }>(db, sql`
    select e.tipo, e.nivel_hallazgo as nivel, count(*) as total
    from examenes e where ${rangoEx} ${empEx} and e.nivel_hallazgo <> 'ninguno'
    group by 1, 2 order by (e.nivel_hallazgo = 'critico') desc, total desc`);

  const examinados = n(ex.examinados);
  const trabajadores = n(dot.total);
  const criticos = n(ex.criticos);
  const moderados = n(ex.moderados);
  const agendadas = n(ci.agendadas);
  const ausentes = n(ci.ausentes);
  const completados = n(ex.completados);

  const meses = [...new Set([...tendenciaEx.map((t) => t.mes), ...tendenciaCi.map((t) => t.mes)])].sort();
  const tendenciaMensual = meses.map((mes) => {
    const e = tendenciaEx.find((t) => t.mes === mes);
    const c = tendenciaCi.find((t) => t.mes === mes);
    return {
      mes,
      atenciones: n(e?.atenciones),
      hallazgos: n(e?.hallazgos),
      ausentismo: pct(n(c?.ausentes), n(c?.agendadas)),
    };
  });

  const costo = completados * PARAMETROS_ROI.costoPorExamen;
  const beneficio = criticos * PARAMETROS_ROI.costoEvitadoCritico + moderados * PARAMETROS_ROI.costoEvitadoModerado;

  const kpis = {
    dotacionExaminada: examinados,
    dotacionTotal: trabajadores,
    cobertura: pct(examinados, trabajadores),
    ausentismo: pct(ausentes, agendadas),
    atenciones: n(ex.atenciones),
    hallazgos: { moderados, criticos, total: moderados + criticos },
    roi: {
      costoPrograma: costo,
      costoEvitadoEstimado: beneficio,
      porcentaje: costo > 0 ? Math.round(((beneficio - costo) / costo) * 1000) / 10 : null,
      parametros: PARAMETROS_ROI,
    },
  };

  return {
    filtro: f,
    kpis,
    porEspecialidad: porEspecialidad.map((p) => ({
      tipo: p.tipo, etiqueta: TIPO_EXAMEN_LABEL[p.tipo], total: n(p.total), hallazgos: n(p.hallazgos),
    })),
    tendenciaMensual,
    alertas: alertas.map((a) => ({ tipo: a.tipo, etiqueta: TIPO_EXAMEN_LABEL[a.tipo], nivel: a.nivel, total: n(a.total) })),
    recomendaciones: recomendar(kpis, porEspecialidad.map((p) => ({ tipo: p.tipo, hallazgos: n(p.hallazgos), total: n(p.total) }))),
  };
}

export type ResultadoKpis = Awaited<ReturnType<typeof calcularKpis>>;

/** Reglas simples y explicables; se afinan con el equipo médico de Naspeclinic. */
function recomendar(
  k: { cobertura: number | null; ausentismo: number | null; hallazgos: { criticos: number; moderados: number } },
  esp: { tipo: TipoExamen; hallazgos: number; total: number }[],
): string[] {
  const r: string[] = [];
  if (k.hallazgos.criticos > 0) {
    r.push(`${k.hallazgos.criticos === 1 ? 'Hay 1 hallazgo crítico' : `Hay ${k.hallazgos.criticos} hallazgos críticos`}: priorizar evaluación médica y restricción de tareas de riesgo hasta su control.`);
  }
  if (k.cobertura !== null && k.cobertura < 80) {
    r.push(`La cobertura es ${k.cobertura.toLocaleString('es-CL')}%: programar un operativo de exámenes para alcanzar al menos 80% de la dotación.`);
  }
  if (k.ausentismo !== null && k.ausentismo > 10) {
    r.push(`El ausentismo a citas es ${k.ausentismo.toLocaleString('es-CL')}%: confirmar citas con 48 h de anticipación y coordinar turnos con supervisores.`);
  }
  const peor = esp.filter((e) => e.total >= 5).sort((a, b) => b.hallazgos / b.total - a.hallazgos / a.total)[0];
  if (peor && peor.hallazgos / peor.total >= 0.15) {
    r.push(`${TIPO_EXAMEN_LABEL[peor.tipo]} concentra ${Math.round((peor.hallazgos / peor.total) * 100)}% de hallazgos: reforzar prevención y controles en esa área.`);
  }
  if (!r.length) r.push('Indicadores dentro de rangos esperados: mantener la periodicidad de controles.');
  return r;
}
