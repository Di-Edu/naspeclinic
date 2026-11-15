import { formatearRut } from '@naspeclinic/shared';

export { formatearRut };

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('es-CL')}%`);
export const num = (v: number) => v.toLocaleString('es-CL');
export const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

/** "2026-10" → "oct 2026" */
export const mesCorto = (m: string) => { const [a, mm] = m.split('-'); return `${MESES_CORTOS[Number(mm) - 1]} ${a.slice(2)}`; };
export const mesLargo = (m: string) => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1]} ${a}`; };

/** "2026-11-03" → "03-11-2026" */
export const fecha = (f: string) => f.slice(0, 10).split('-').reverse().join('-');
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "sábado, 14 de noviembre" → "Sábado, 14 de noviembre" */
export const diaLargo = (d: Date) => {
  const s = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Fecha local en formato AAAA-MM-DD */
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export const ESTADO_EXAMEN_LABEL = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado' } as const;
export const RESULTADO_LABEL = { apto: 'Apto', apto_con_restricciones: 'Apto con restricciones', no_apto: 'No apto' } as const;
export const NIVEL_LABEL = { ninguno: 'Sin hallazgos', moderado: 'Moderado', critico: 'Crítico' } as const;
export const ESTADO_CITA_LABEL = { pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada', ausente: 'No asistió' } as const;
export const ROL_LABEL = { admin: 'Admin Naspeclinic', operador: 'Operador', gerente: 'Gerente empresa' } as const;
