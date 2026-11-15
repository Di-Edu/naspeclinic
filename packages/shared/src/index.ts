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

export const ESTADOS_EXAMEN = ['pendiente', 'en_proceso', 'completado'] as const;
export type EstadoExamen = (typeof ESTADOS_EXAMEN)[number];

export const RESULTADOS = ['apto', 'apto_con_restricciones', 'no_apto'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export const NIVELES_HALLAZGO = ['ninguno', 'moderado', 'critico'] as const;
export type NivelHallazgo = (typeof NIVELES_HALLAZGO)[number];

export const ESTADOS_CITA = ['pendiente', 'confirmada', 'cancelada', 'ausente'] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

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
