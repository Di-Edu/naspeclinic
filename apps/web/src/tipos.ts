import type { Rol, TipoExamen, EstadoExamen, Resultado, NivelHallazgo, EstadoCita } from '@naspeclinic/shared';

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  empresaId: number | null;
  empresa: string | null;
  activo?: boolean;
  debeCambiarPassword: boolean;
}

export interface Empresa { id: number; nombre: string; rut: string; emailGerente: string | null; activa: boolean }
export interface Sede { id: number; nombre: string }

export interface Paciente {
  id: number; rut: string; nombre: string; email: string | null; telefono: string | null; cargo: string | null; cargoId: number | null; empresaId: number;
}

export interface ExamenFila {
  id: number; tipo: TipoExamen; fecha: string; estado: EstadoExamen; resultado: Resultado | null; nivelHallazgo: NivelHallazgo;
  pacienteId: number; paciente: string; empresaId: number; empresa: string;
}

export interface Archivo { id: number; nombre: string; mime: string; tamano: number }

export interface ExamenDetalle {
  id: number; tipo: TipoExamen; fecha: string; estado: EstadoExamen; resultado: Resultado | null; nivelHallazgo: NivelHallazgo;
  observaciones: string | null; archivos: Archivo[];
}

export interface Cita {
  id: number; fechaHora: string; estado: EstadoCita; tipoExamen: TipoExamen; notas: string | null;
  pacienteId: number; paciente: string; telefono: string | null; empresaId: number; empresa: string; sedeId: number; sede: string;
}

export interface Kpis {
  filtro: { empresaId: number | null; desde: string; hasta: string };
  kpis: {
    dotacionExaminada: number; dotacionTotal: number; cobertura: number | null; ausentismo: number | null; atenciones: number;
    hallazgos: { moderados: number; criticos: number; total: number };
    roi: { costoPrograma: number; costoEvitadoEstimado: number; porcentaje: number | null };
  };
  porEspecialidad: { tipo: TipoExamen; etiqueta: string; total: number; hallazgos: number }[];
  tendenciaMensual: { mes: string; atenciones: number; hallazgos: number; ausentismo: number | null }[];
  alertas: { tipo: TipoExamen; etiqueta: string; nivel: 'moderado' | 'critico'; total: number }[];
  recomendaciones: string[];
  aptitud: ResumenAptitud;
}

export interface ResumenAptitud {
  porEstado: Record<import('@naspeclinic/shared').EstadoVigencia, number>;
  trabajadores: number;
  habilitados: number;
  porcentajeHabilitados: number | null;
}

export interface FilaAptitud {
  pacienteId: number; trabajador: string; rut: string; empresaId: number; empresa: string; cargo: string;
  protocoloId: number; protocolo: string; evaluacionId: number | null; fechaEvaluacion: string | null;
  aptitud: Resultado | null; restricciones: string | null; vigenteHasta: string | null; diasRestantes: number | null;
  estado: import('@naspeclinic/shared').EstadoVigencia; enCurso: boolean;
}

export interface Protocolo { id: number; nombre: string; descripcion: string | null; vigenciaMeses: number; activo: boolean; examenes: TipoExamen[] }
export interface Cargo { id: number; empresaId: number; nombre: string; protocoloIds: number[] }

export interface ExamenDeEvaluacion {
  id: number; tipo: TipoExamen; fecha: string; estado: EstadoExamen; resultado: Resultado | null; nivelHallazgo: NivelHallazgo; observaciones: string | null;
  pacienteId: number; evaluacionId: number | null;
}

export interface Evaluacion {
  id: number; pacienteId: number; empresaId: number; protocoloId: number; protocolo: string; sedeId: number | null;
  tipo: import('@naspeclinic/shared').TipoEvaluacion; fecha: string; estado: 'en_curso' | 'cerrada';
  aptitud: Resultado | null; restricciones: string | null; vigenteHasta: string | null;
}

export interface EvaluacionDetalle extends Evaluacion {
  vigenciaMeses: number; vigenciaSugerida: string; aptitudSugerida: Resultado | null; pendientes: number; examenes: ExamenDeEvaluacion[];
}

export interface Seguimiento {
  id: number; pacienteId: number; paciente?: string; empresaId: number; empresa?: string;
  tipo: import('@naspeclinic/shared').TipoSeguimiento; examenId: number | null; evaluacionId: number | null; examen?: string | null;
  motivo: string | null; cierre: string | null; fechaCompromiso: string | null; estado: 'abierto' | 'cerrado';
  cerradoEn: string | null; vencido?: boolean;
}
