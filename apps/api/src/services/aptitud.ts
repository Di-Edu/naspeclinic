import { sql } from 'drizzle-orm';
import { DIAS_POR_VENCER, type Aptitud, type EstadoVigencia } from '@naspeclinic/shared';
import type { DB } from '../db';
import { descifrar } from '../lib/cifrado';

/** Fecha de hoy en Chile (AAAA-MM-DD). */
export const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

/** "2026-01-31" + 1 mes = "2026-02-28" (se ajusta al último día del mes). */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
}

export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

export interface FilaAptitud {
  pacienteId: number;
  trabajador: string;
  rut: string;
  empresaId: number;
  empresa: string;
  cargo: string;
  protocoloId: number;
  protocolo: string;
  evaluacionId: number | null;
  fechaEvaluacion: string | null;
  aptitud: Aptitud | null;
  restricciones: string | null;
  vigenteHasta: string | null;
  diasRestantes: number | null;
  estado: EstadoVigencia;
  /** Hay una evaluación de este protocolo en curso (exámenes pendientes) */
  enCurso: boolean;
}

/**
 * Situación de cada trabajador frente a cada protocolo que exige su cargo:
 * se toma la última evaluación cerrada. Solo datos laborales (aptitud, restricciones,
 * vigencia): nunca diagnósticos ni resultados de exámenes.
 */
export async function listarAptitud(db: DB, empresaId: number | null): Promise<FilaAptitud[]> {
  const filtro = empresaId ? sql`and p.empresa_id = ${empresaId}` : sql``;
  const r = (await db.execute(sql`
    select p.id as paciente_id, p.nombre as trabajador, p.rut_cifrado, p.empresa_id, em.nombre as empresa,
      c.nombre as cargo, pr.id as protocolo_id, pr.nombre as protocolo,
      ev.id as evaluacion_id, ev.fecha::text as fecha_evaluacion, ev.aptitud, ev.restricciones, ev.vigente_hasta::text as vigente_hasta,
      exists (select 1 from evaluaciones x where x.paciente_id = p.id and x.protocolo_id = pr.id and x.estado = 'en_curso') as en_curso
    from pacientes p
    join empresas em on em.id = p.empresa_id
    join cargos c on c.id = p.cargo_id
    join cargo_protocolos cp on cp.cargo_id = c.id
    join protocolos pr on pr.id = cp.protocolo_id and pr.activo
    left join lateral (
      select e.* from evaluaciones e
      where e.paciente_id = p.id and e.protocolo_id = pr.id and e.estado = 'cerrada'
      order by e.fecha desc, e.id desc limit 1
    ) ev on true
    where true ${filtro}
    order by p.nombre, pr.nombre`)) as unknown as { rows: Record<string, unknown>[] };

  const hoy = hoyChile();
  return r.rows.map((f) => {
    const vigenteHasta = (f.vigente_hasta as string | null) ?? null;
    const aptitud = (f.aptitud as Aptitud | null) ?? null;
    const dias = vigenteHasta ? diasEntre(hoy, vigenteHasta) : null;
    let estado: EstadoVigencia;
    if (!f.evaluacion_id) estado = 'sin_evaluacion';
    else if (aptitud === 'no_apto') estado = 'no_apto';
    else if (dias === null || dias < 0) estado = 'vencido';
    else if (dias <= DIAS_POR_VENCER) estado = 'por_vencer';
    else estado = 'vigente';
    return {
      pacienteId: Number(f.paciente_id),
      trabajador: f.trabajador as string,
      rut: descifrar(f.rut_cifrado as string),
      empresaId: Number(f.empresa_id),
      empresa: f.empresa as string,
      cargo: f.cargo as string,
      protocoloId: Number(f.protocolo_id),
      protocolo: f.protocolo as string,
      evaluacionId: f.evaluacion_id ? Number(f.evaluacion_id) : null,
      fechaEvaluacion: (f.fecha_evaluacion as string | null) ?? null,
      aptitud,
      restricciones: (f.restricciones as string | null) ?? null,
      vigenteHasta,
      diasRestantes: dias,
      estado,
      enCurso: Boolean(f.en_curso),
    };
  });
}

export function resumirAptitud(filas: FilaAptitud[]) {
  const porEstado = { vigente: 0, por_vencer: 0, vencido: 0, no_apto: 0, sin_evaluacion: 0 } as Record<EstadoVigencia, number>;
  for (const f of filas) porEstado[f.estado]++;
  // Trabajador habilitado = todos sus protocolos vigentes o por vencer
  const trabajadores = new Map<number, boolean>();
  for (const f of filas) {
    const ok = f.estado === 'vigente' || f.estado === 'por_vencer';
    trabajadores.set(f.pacienteId, (trabajadores.get(f.pacienteId) ?? true) && ok);
  }
  const habilitados = [...trabajadores.values()].filter(Boolean).length;
  return {
    porEstado,
    trabajadores: trabajadores.size,
    habilitados,
    porcentajeHabilitados: trabajadores.size ? Math.round((habilitados / trabajadores.size) * 1000) / 10 : null,
  };
}
