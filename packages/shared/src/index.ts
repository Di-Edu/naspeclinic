// Constantes y utilidades compartidas entre API, web y app móvil.

export const ROLES = ['admin', 'operador', 'gerente'] as const;
export type Rol = (typeof ROLES)[number];

export const TIPOS_EXAMEN = ['broncopulmonar', 'cardiologia', 'odontologia', 'vitamina_c', 'geneticos'] as const;
export type TipoExamen = (typeof TIPOS_EXAMEN)[number];

export const TIPO_EXAMEN_LABEL: Record<TipoExamen, string> = {
  broncopulmonar: 'Broncopulmonar',
  cardiologia: 'Cardiología',
  odontologia: 'Odontología',
  vitamina_c: 'Suero vitamina C',
  geneticos: 'Marcadores genéticos',
};

/** Nombre del examen dentro de una frase: "Suero vitamina C" → "suero vitamina C". */
export const examenEnTexto = (t: TipoExamen) => TIPO_EXAMEN_LABEL[t].charAt(0).toLowerCase() + TIPO_EXAMEN_LABEL[t].slice(1);

export const ESTADOS_EXAMEN = ['pendiente', 'en_proceso', 'completado'] as const;
export type EstadoExamen = (typeof ESTADOS_EXAMEN)[number];

export const RESULTADOS = ['apto', 'apto_con_restricciones', 'no_apto'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export const NIVELES_HALLAZGO = ['ninguno', 'moderado', 'critico'] as const;
export type NivelHallazgo = (typeof NIVELES_HALLAZGO)[number];

export const ESTADOS_CITA = ['pendiente', 'confirmada', 'cancelada', 'ausente'] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

export const TIPOS_EVALUACION = ['preocupacional', 'periodica', 'egreso'] as const;
export type TipoEvaluacion = (typeof TIPOS_EVALUACION)[number];
export const TIPO_EVALUACION_LABEL: Record<TipoEvaluacion, string> = {
  preocupacional: 'Preocupacional', periodica: 'Periódica', egreso: 'Egreso',
};

export const ESTADOS_EVALUACION = ['en_curso', 'cerrada'] as const;
export type EstadoEvaluacion = (typeof ESTADOS_EVALUACION)[number];

/** Aptitud laboral: es lo único (junto con las restricciones) que ve la empresa. */
export const APTITUDES = RESULTADOS;
export const RESULTADO_LABEL: Record<Resultado, string> = {
  apto: 'Apto', apto_con_restricciones: 'Apto con restricciones', no_apto: 'No apto',
};
export type Aptitud = Resultado;

/** Estado de vigencia de un trabajador para un protocolo. */
export const ESTADOS_VIGENCIA = ['vigente', 'por_vencer', 'vencido', 'no_apto', 'sin_evaluacion'] as const;
export type EstadoVigencia = (typeof ESTADOS_VIGENCIA)[number];
export const ESTADO_VIGENCIA_LABEL: Record<EstadoVigencia, string> = {
  vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido', no_apto: 'No apto', sin_evaluacion: 'Sin evaluación',
};
/** Días antes del vencimiento en que se considera "por vencer". */
export const DIAS_POR_VENCER = 30;

export const TIPOS_SEGUIMIENTO = ['derivacion', 'recontrol', 'no_apto_temporal'] as const;
export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number];
export const TIPO_SEGUIMIENTO_LABEL: Record<TipoSeguimiento, string> = {
  derivacion: 'Derivación a especialista', recontrol: 'Recontrol', no_apto_temporal: 'No apto temporal',
};
export const ESTADOS_SEGUIMIENTO = ['abierto', 'cerrado'] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

/** Política de contraseñas: devuelve el problema o null si es válida. */
export function problemaPassword(p: string): string | null {
  if (p.length < 10) return 'Debe tener al menos 10 caracteres';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) || !/\d/.test(p)) return 'Debe incluir letras y números';
  return null;
}

/** Deja el RUT como "12345678-K" (sin puntos, DV en mayúscula). */
export function normalizarRut(rut: string): string {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** Valida el dígito verificador (módulo 11). */
export function rutValido(rut: string): boolean {
  const n = normalizarRut(rut);
  const m = /^(\d{7,8})-([\dK])$/.exec(n);
  if (!m) return false;
  let suma = 0;
  let factor = 2;
  for (let i = m[1].length - 1; i >= 0; i--) {
    suma += Number(m[1][i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === m[2];
}

/** "12345678-5" → "12.345.678-5" */
export function formatearRut(rut: string): string {
  const [cuerpo, dv] = normalizarRut(rut).split('-');
  if (!dv) return rut;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}
