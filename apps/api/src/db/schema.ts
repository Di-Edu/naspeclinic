import {
  pgTable, pgEnum, serial, integer, text, boolean, timestamp, date, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import {
  ROLES, TIPOS_EXAMEN, ESTADOS_EXAMEN, RESULTADOS, NIVELES_HALLAZGO, ESTADOS_CITA,
  TIPOS_EVALUACION, ESTADOS_EVALUACION, TIPOS_SEGUIMIENTO, ESTADOS_SEGUIMIENTO,
} from '@naspeclinic/shared';

export const rolEnum = pgEnum('rol', ROLES);
export const tipoExamenEnum = pgEnum('tipo_examen', TIPOS_EXAMEN);
export const estadoExamenEnum = pgEnum('estado_examen', ESTADOS_EXAMEN);
export const resultadoEnum = pgEnum('resultado', RESULTADOS);
export const nivelHallazgoEnum = pgEnum('nivel_hallazgo', NIVELES_HALLAZGO);
export const estadoCitaEnum = pgEnum('estado_cita', ESTADOS_CITA);
export const tipoEvaluacionEnum = pgEnum('tipo_evaluacion', TIPOS_EVALUACION);
export const estadoEvaluacionEnum = pgEnum('estado_evaluacion', ESTADOS_EVALUACION);
export const tipoSeguimientoEnum = pgEnum('tipo_seguimiento', TIPOS_SEGUIMIENTO);
export const estadoSeguimientoEnum = pgEnum('estado_seguimiento', ESTADOS_SEGUIMIENTO);

const creado = () => timestamp('creado_en', { withTimezone: true }).defaultNow().notNull();

export const empresas = pgTable('empresas', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  rut: text('rut').notNull().unique(),
  emailGerente: text('email_gerente'),
  activa: boolean('activa').default(true).notNull(),
  creadoEn: creado(),
});

export const sedes = pgTable('sedes', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull().unique(),
});

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nombre: text('nombre').notNull(),
  rol: rolEnum('rol').notNull(),
  empresaId: integer('empresa_id').references(() => empresas.id),
  activo: boolean('activo').default(true).notNull(),
  intentosFallidos: integer('intentos_fallidos').default(0).notNull(),
  bloqueadoHasta: timestamp('bloqueado_hasta', { withTimezone: true }),
  /** true cuando la contraseña la asignó un admin: se exige cambiarla al entrar */
  debeCambiarPassword: boolean('debe_cambiar_password').default(false).notNull(),
  /** Sube con cada cambio de contraseña; invalida las sesiones (JWT) anteriores */
  versionPassword: integer('version_password').default(1).notNull(),
  creadoEn: creado(),
});

/** Enlaces de un solo uso para restablecer la contraseña (se guarda solo el hash). */
export const tokensRecuperacion = pgTable('tokens_recuperacion', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expira: timestamp('expira', { withTimezone: true }).notNull(),
  usadoEn: timestamp('usado_en', { withTimezone: true }),
  creadoEn: creado(),
});

export const pacientes = pgTable('pacientes', {
  id: serial('id').primaryKey(),
  /** HMAC del RUT normalizado: permite buscar por RUT sin guardarlo en claro */
  rutHash: text('rut_hash').notNull(),
  rutCifrado: text('rut_cifrado').notNull(),
  nombre: text('nombre').notNull(),
  email: text('email'),
  telefono: text('telefono'),
  cargo: text('cargo'),
  /** Cargo dentro de la empresa: define qué protocolos (baterías) le corresponden */
  cargoId: integer('cargo_id').references(() => cargos.id),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  creadoEn: creado(),
}, (t) => [uniqueIndex('pacientes_rut_hash_idx').on(t.rutHash), index('pacientes_empresa_idx').on(t.empresaId)]);

export const examenes = pgTable('examenes', {
  id: serial('id').primaryKey(),
  pacienteId: integer('paciente_id').notNull().references(() => pacientes.id),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  /** Evaluación (batería) a la que pertenece; null = examen suelto */
  evaluacionId: integer('evaluacion_id').references(() => evaluaciones.id, { onDelete: 'cascade' }),
  sedeId: integer('sede_id').references(() => sedes.id),
  tipo: tipoExamenEnum('tipo').notNull(),
  fecha: date('fecha').notNull(),
  estado: estadoExamenEnum('estado').default('pendiente').notNull(),
  resultado: resultadoEnum('resultado'),
  nivelHallazgo: nivelHallazgoEnum('nivel_hallazgo').default('ninguno').notNull(),
  /** Observaciones clínicas cifradas con AES-256-GCM */
  observacionesCifradas: text('observaciones_cifradas'),
  creadoPor: integer('creado_por').references(() => usuarios.id),
  creadoEn: creado(),
}, (t) => [index('examenes_empresa_fecha_idx').on(t.empresaId, t.fecha), index('examenes_paciente_idx').on(t.pacienteId)]);

export const archivos = pgTable('archivos', {
  id: serial('id').primaryKey(),
  examenId: integer('examen_id').notNull().references(() => examenes.id, { onDelete: 'cascade' }),
  clave: text('clave').notNull(),
  nombre: text('nombre').notNull(),
  mime: text('mime').notNull(),
  tamano: integer('tamano').notNull(),
  creadoEn: creado(),
});

export const citas = pgTable('citas', {
  id: serial('id').primaryKey(),
  pacienteId: integer('paciente_id').notNull().references(() => pacientes.id),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  sedeId: integer('sede_id').notNull().references(() => sedes.id),
  tipoExamen: tipoExamenEnum('tipo_examen').notNull(),
  fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull(),
  estado: estadoCitaEnum('estado').default('pendiente').notNull(),
  notas: text('notas'),
  creadoEn: creado(),
}, (t) => [index('citas_sede_fecha_idx').on(t.sedeId, t.fechaHora), index('citas_empresa_fecha_idx').on(t.empresaId, t.fechaHora)]);

/** Trabajadores declarados por la empresa en cada período (base del % de cobertura) */
export const dotaciones = pgTable('dotaciones', {
  id: serial('id').primaryKey(),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  periodo: text('periodo').notNull(), // YYYY-MM
  trabajadores: integer('trabajadores').notNull(),
}, (t) => [uniqueIndex('dotaciones_empresa_periodo_idx').on(t.empresaId, t.periodo)]);

export const auditoria = pgTable('auditoria', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  accion: text('accion').notNull(),
  entidad: text('entidad').notNull(),
  entidadId: integer('entidad_id'),
  ip: text('ip'),
  fecha: timestamp('fecha', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Protocolos, cargos y evaluaciones (baterías de exámenes)
// ---------------------------------------------------------------------------

/** Protocolo de vigilancia: conjunto de exámenes y cada cuánto se repite. */
export const protocolos = pgTable('protocolos', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull().unique(),
  descripcion: text('descripcion'),
  /** Meses de vigencia de la aptitud (configurable por la clínica) */
  vigenciaMeses: integer('vigencia_meses').notNull(),
  activo: boolean('activo').default(true).notNull(),
});

/** Exámenes (prestaciones) que componen cada protocolo. */
export const protocoloExamenes = pgTable('protocolo_examenes', {
  protocoloId: integer('protocolo_id').notNull().references(() => protocolos.id, { onDelete: 'cascade' }),
  tipo: tipoExamenEnum('tipo').notNull(),
}, (t) => [uniqueIndex('protocolo_examenes_pk').on(t.protocoloId, t.tipo)]);

/** Cargos de cada empresa cliente. */
export const cargos = pgTable('cargos', {
  id: serial('id').primaryKey(),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  nombre: text('nombre').notNull(),
}, (t) => [uniqueIndex('cargos_empresa_nombre_idx').on(t.empresaId, t.nombre)]);

/** Protocolos que exige cada cargo (según sus riesgos). */
export const cargoProtocolos = pgTable('cargo_protocolos', {
  cargoId: integer('cargo_id').notNull().references(() => cargos.id, { onDelete: 'cascade' }),
  protocoloId: integer('protocolo_id').notNull().references(() => protocolos.id, { onDelete: 'cascade' }),
}, (t) => [uniqueIndex('cargo_protocolos_pk').on(t.cargoId, t.protocoloId)]);

/** Evaluación ocupacional: una batería de exámenes que termina en una aptitud con vigencia. */
export const evaluaciones = pgTable('evaluaciones', {
  id: serial('id').primaryKey(),
  pacienteId: integer('paciente_id').notNull().references(() => pacientes.id),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  protocoloId: integer('protocolo_id').notNull().references(() => protocolos.id),
  sedeId: integer('sede_id').references(() => sedes.id),
  tipo: tipoEvaluacionEnum('tipo').notNull(),
  fecha: date('fecha').notNull(),
  estado: estadoEvaluacionEnum('estado').default('en_curso').notNull(),
  aptitud: resultadoEnum('aptitud'),
  /** Restricciones laborales (visibles para la empresa). No incluye diagnósticos. */
  restricciones: text('restricciones'),
  vigenteHasta: date('vigente_hasta'),
  cerradaPor: integer('cerrada_por').references(() => usuarios.id),
  cerradaEn: timestamp('cerrada_en', { withTimezone: true }),
  creadoPor: integer('creado_por').references(() => usuarios.id),
  creadoEn: creado(),
}, (t) => [
  index('evaluaciones_paciente_protocolo_idx').on(t.pacienteId, t.protocoloId, t.fecha),
  index('evaluaciones_empresa_idx').on(t.empresaId),
]);

/** Seguimiento de hallazgos: derivaciones, recontroles y no aptos temporales hasta su cierre. */
export const seguimientos = pgTable('seguimientos', {
  id: serial('id').primaryKey(),
  pacienteId: integer('paciente_id').notNull().references(() => pacientes.id),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  examenId: integer('examen_id').references(() => examenes.id, { onDelete: 'set null' }),
  evaluacionId: integer('evaluacion_id').references(() => evaluaciones.id, { onDelete: 'set null' }),
  tipo: tipoSeguimientoEnum('tipo').notNull(),
  /** Motivo y especialidad de derivación (dato clínico: cifrado) */
  motivoCifrado: text('motivo_cifrado'),
  fechaCompromiso: date('fecha_compromiso'),
  estado: estadoSeguimientoEnum('estado').default('abierto').notNull(),
  /** Resultado del cierre (dato clínico: cifrado) */
  cierreCifrado: text('cierre_cifrado'),
  creadoPor: integer('creado_por').references(() => usuarios.id),
  cerradoPor: integer('cerrado_por').references(() => usuarios.id),
  cerradoEn: timestamp('cerrado_en', { withTimezone: true }),
  creadoEn: creado(),
}, (t) => [index('seguimientos_estado_fecha_idx').on(t.estado, t.fechaCompromiso)]);

/** Sesiones cerradas antes de vencer (logout): su token deja de servir. Se limpian al expirar. */
export const sesionesRevocadas = pgTable('sesiones_revocadas', {
  jti: text('jti').primaryKey(),
  expira: timestamp('expira', { withTimezone: true }).notNull(),
});
