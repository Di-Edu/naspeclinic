CREATE TYPE "public"."estado_evaluacion" AS ENUM('en_curso', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_seguimiento" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."tipo_evaluacion" AS ENUM('preocupacional', 'periodica', 'egreso');--> statement-breakpoint
CREATE TYPE "public"."tipo_seguimiento" AS ENUM('derivacion', 'recontrol', 'no_apto_temporal');--> statement-breakpoint
CREATE TABLE "cargo_protocolos" (
	"cargo_id" integer NOT NULL,
	"protocolo_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"paciente_id" integer NOT NULL,
	"empresa_id" integer NOT NULL,
	"protocolo_id" integer NOT NULL,
	"sede_id" integer,
	"tipo" "tipo_evaluacion" NOT NULL,
	"fecha" date NOT NULL,
	"estado" "estado_evaluacion" DEFAULT 'en_curso' NOT NULL,
	"aptitud" "resultado",
	"restricciones" text,
	"vigente_hasta" date,
	"cerrada_por" integer,
	"cerrada_en" timestamp with time zone,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocolo_examenes" (
	"protocolo_id" integer NOT NULL,
	"tipo" "tipo_examen" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocolos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"vigencia_meses" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "protocolos_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "seguimientos" (
	"id" serial PRIMARY KEY NOT NULL,
	"paciente_id" integer NOT NULL,
	"empresa_id" integer NOT NULL,
	"examen_id" integer,
	"evaluacion_id" integer,
	"tipo" "tipo_seguimiento" NOT NULL,
	"motivo_cifrado" text,
	"fecha_compromiso" date,
	"estado" "estado_seguimiento" DEFAULT 'abierto' NOT NULL,
	"cierre_cifrado" text,
	"creado_por" integer,
	"cerrado_por" integer,
	"cerrado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "examenes" ADD COLUMN "evaluacion_id" integer;--> statement-breakpoint
ALTER TABLE "pacientes" ADD COLUMN "cargo_id" integer;--> statement-breakpoint
ALTER TABLE "cargo_protocolos" ADD CONSTRAINT "cargo_protocolos_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargo_protocolos" ADD CONSTRAINT "cargo_protocolos_protocolo_id_protocolos_id_fk" FOREIGN KEY ("protocolo_id") REFERENCES "public"."protocolos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_protocolo_id_protocolos_id_fk" FOREIGN KEY ("protocolo_id") REFERENCES "public"."protocolos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocolo_examenes" ADD CONSTRAINT "protocolo_examenes_protocolo_id_protocolos_id_fk" FOREIGN KEY ("protocolo_id") REFERENCES "public"."protocolos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_examen_id_examenes_id_fk" FOREIGN KEY ("examen_id") REFERENCES "public"."examenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_evaluacion_id_evaluaciones_id_fk" FOREIGN KEY ("evaluacion_id") REFERENCES "public"."evaluaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cargo_protocolos_pk" ON "cargo_protocolos" USING btree ("cargo_id","protocolo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cargos_empresa_nombre_idx" ON "cargos" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE INDEX "evaluaciones_paciente_protocolo_idx" ON "evaluaciones" USING btree ("paciente_id","protocolo_id","fecha");--> statement-breakpoint
CREATE INDEX "evaluaciones_empresa_idx" ON "evaluaciones" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "protocolo_examenes_pk" ON "protocolo_examenes" USING btree ("protocolo_id","tipo");--> statement-breakpoint
CREATE INDEX "seguimientos_estado_fecha_idx" ON "seguimientos" USING btree ("estado","fecha_compromiso");--> statement-breakpoint
ALTER TABLE "examenes" ADD CONSTRAINT "examenes_evaluacion_id_evaluaciones_id_fk" FOREIGN KEY ("evaluacion_id") REFERENCES "public"."evaluaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;