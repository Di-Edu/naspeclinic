CREATE TYPE "public"."estado_cita" AS ENUM('pendiente', 'confirmada', 'cancelada', 'ausente');--> statement-breakpoint
CREATE TYPE "public"."estado_examen" AS ENUM('pendiente', 'en_proceso', 'completado');--> statement-breakpoint
CREATE TYPE "public"."nivel_hallazgo" AS ENUM('ninguno', 'moderado', 'critico');--> statement-breakpoint
CREATE TYPE "public"."resultado" AS ENUM('apto', 'apto_con_restricciones', 'no_apto');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'operador', 'gerente');--> statement-breakpoint
CREATE TYPE "public"."tipo_examen" AS ENUM('broncopulmonar', 'cardiologia', 'odontologia', 'vitamina_c', 'geneticos');--> statement-breakpoint
CREATE TABLE "archivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"examen_id" integer NOT NULL,
	"clave" text NOT NULL,
	"nombre" text NOT NULL,
	"mime" text NOT NULL,
	"tamano" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" integer,
	"ip" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" serial PRIMARY KEY NOT NULL,
	"paciente_id" integer NOT NULL,
	"empresa_id" integer NOT NULL,
	"sede_id" integer NOT NULL,
	"tipo_examen" "tipo_examen" NOT NULL,
	"fecha_hora" timestamp with time zone NOT NULL,
	"estado" "estado_cita" DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dotaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"periodo" text NOT NULL,
	"trabajadores" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rut" text NOT NULL,
	"email_gerente" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_rut_unique" UNIQUE("rut")
);
--> statement-breakpoint
CREATE TABLE "examenes" (
	"id" serial PRIMARY KEY NOT NULL,
	"paciente_id" integer NOT NULL,
	"empresa_id" integer NOT NULL,
	"sede_id" integer,
	"tipo" "tipo_examen" NOT NULL,
	"fecha" date NOT NULL,
	"estado" "estado_examen" DEFAULT 'pendiente' NOT NULL,
	"resultado" "resultado",
	"nivel_hallazgo" "nivel_hallazgo" DEFAULT 'ninguno' NOT NULL,
	"observaciones_cifradas" text,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pacientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"rut_hash" text NOT NULL,
	"rut_cifrado" text NOT NULL,
	"nombre" text NOT NULL,
	"email" text,
	"telefono" text,
	"cargo" text,
	"empresa_id" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sedes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "sedes_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol" NOT NULL,
	"empresa_id" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_examen_id_examenes_id_fk" FOREIGN KEY ("examen_id") REFERENCES "public"."examenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotaciones" ADD CONSTRAINT "dotaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examenes" ADD CONSTRAINT "examenes_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examenes" ADD CONSTRAINT "examenes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examenes" ADD CONSTRAINT "examenes_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examenes" ADD CONSTRAINT "examenes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citas_sede_fecha_idx" ON "citas" USING btree ("sede_id","fecha_hora");--> statement-breakpoint
CREATE INDEX "citas_empresa_fecha_idx" ON "citas" USING btree ("empresa_id","fecha_hora");--> statement-breakpoint
CREATE UNIQUE INDEX "dotaciones_empresa_periodo_idx" ON "dotaciones" USING btree ("empresa_id","periodo");--> statement-breakpoint
CREATE INDEX "examenes_empresa_fecha_idx" ON "examenes" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "examenes_paciente_idx" ON "examenes" USING btree ("paciente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pacientes_rut_hash_idx" ON "pacientes" USING btree ("rut_hash");--> statement-breakpoint
CREATE INDEX "pacientes_empresa_idx" ON "pacientes" USING btree ("empresa_id");