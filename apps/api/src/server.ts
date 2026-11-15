import { crearDb } from './db';
import { crearApp } from './app';
import { config } from './config';

const db = await crearDb();
const servidor = crearApp(db).listen(config.port, () => {
  console.log(`API Naspeclinic en http://localhost:${config.port}/api (${config.databaseUrl ? 'PostgreSQL' : 'PGlite local'})`);
});

// Tiempos máximos: una conexión lenta o maliciosa no puede quedarse ocupando el servidor
servidor.headersTimeout = 15_000; // para recibir las cabeceras
servidor.requestTimeout = 60_000; // para recibir la petición completa (incluye subir archivos)
servidor.keepAliveTimeout = 5_000;
servidor.maxRequestsPerSocket = 1_000;
