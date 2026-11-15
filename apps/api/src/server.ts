import { crearDb } from './db';
import { crearApp } from './app';
import { config } from './config';

const db = await crearDb();
crearApp(db).listen(config.port, () => {
  console.log(`API Naspeclinic en http://localhost:${config.port}/api (${config.databaseUrl ? 'PostgreSQL' : 'PGlite local'})`);
});
