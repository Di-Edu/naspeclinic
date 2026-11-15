import type { Rol, TipoExamen, EstadoExamen, Resultado, NivelHallazgo, EstadoCita } from '@naspeclinic/shared';

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  empresaId: number | null;
  empresa: string | null;
  activo?: boolean;
}

export interface Empresa { id: number; nombre: string; rut: string; emailGerente: string | null; activa: boolean }
export interface Sede { id: number; nombre: string }

export interface Paciente {
  id: number; rut: string; nombre: string; email: string | null; telefono: string | null; cargo: string | null; empresaId: number;
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
}
