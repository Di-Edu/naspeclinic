CREATE TABLE "sesiones_revocadas" (
	"jti" text PRIMARY KEY NOT NULL,
	"expira" timestamp with time zone NOT NULL
);
