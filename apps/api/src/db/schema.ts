import {
  pgTable, pgEnum, serial, integer, text, boolean, timestamp, date, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { ROLES, TIPOS_EXAMEN, ESTADOS_EXAMEN, RESULTADOS, NIVELES_HALLAZGO, ESTADOS_CITA } from '@naspeclinic/shared';

export const rolEnum = pgEnum('rol', ROLES);
export const tipoExamenEnum = pgEnum('tipo_examen', TIPOS_EXAMEN);
export const estadoExamenEnum = pgEnum('estado_examen', ESTADOS_EXAMEN);
export const resultadoEnum = pgEnum('resultado', RESULTADOS);
export const nivelHallazgoEnum = pgEnum('nivel_hallazgo', NIVELES_HALLAZGO);
export const estadoCitaEnum = pgEnum('estado_cita', ESTADOS_CITA);

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
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
  creadoEn: creado(),
}, (t) => [uniqueIndex('pacientes_rut_hash_idx').on(t.rutHash), index('pacientes_empresa_idx').on(t.empresaId)]);

export const examenes = pgTable('examenes', {
  id: serial('id').primaryKey(),
  pacienteId: integer('paciente_id').notNull().references(() => pacientes.id),
  empresaId: integer('empresa_id').notNull().references(() => empresas.id),
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
