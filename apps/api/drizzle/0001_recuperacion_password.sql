CREATE TABLE "tokens_recuperacion" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_recuperacion_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "debe_cambiar_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "version_password" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens_recuperacion" ADD CONSTRAINT "tokens_recuperacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;