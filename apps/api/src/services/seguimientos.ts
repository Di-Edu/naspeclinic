import { and, eq } from 'drizzle-orm';
import { examenEnTexto, type NivelHallazgo, type TipoExamen } from '@naspeclinic/shared';
import type { DB } from '../db';
import { seguimientos } from '../db/schema';
import { cifrar } from '../lib/cifrado';
import { hoyChile } from './aptitud';

export const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Plazos por defecto para resolver un hallazgo (la clínica puede reprogramarlos). */
export const PLAZO_DIAS = { critico: 15, moderado: 90 } as const;

/**
 * Abre un seguimiento cuando un examen queda con hallazgo, si no hay uno abierto para ese examen.
 * Crítico → derivación a especialista; moderado → recontrol.
 */
export async function abrirPorHallazgo(
  db: DB,
  ex: { id: number; pacienteId: number; empresaId: number; evaluacionId: number | null; tipo: TipoExamen; nivelHallazgo: NivelHallazgo },
  usuarioId: number | null,
) {
  if (ex.nivelHallazgo === 'ninguno') return null;
  const [abierto] = await db.select({ id: seguimientos.id }).from(seguimientos)
    .where(and(eq(seguimientos.examenId, ex.id), eq(seguimientos.estado, 'abierto')));
  if (abierto) return null;
  const critico = ex.nivelHallazgo === 'critico';
  const [s] = await db.insert(seguimientos).values({
    pacienteId: ex.pacienteId, empresaId: ex.empresaId, examenId: ex.id, evaluacionId: ex.evaluacionId,
    tipo: critico ? 'derivacion' : 'recontrol',
    motivoCifrado: cifrar(`Hallazgo ${critico ? 'crítico' : 'moderado'} en ${examenEnTexto(ex.tipo)}`),
    fechaCompromiso: sumarDias(hoyChile(), critico ? PLAZO_DIAS.critico : PLAZO_DIAS.moderado),
    creadoPor: usuarioId,
  }).returning();
  return s;
}
