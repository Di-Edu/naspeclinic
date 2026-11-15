import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from '../config';

export interface Almacenamiento {
  guardar(datos: Buffer, nombreOriginal: string): Promise<string>;
  leer(clave: string): Promise<Buffer>;
}

/**
 * Almacenamiento en disco para desarrollo. En producción se reemplaza por un bucket
 * S3 privado con la misma interfaz (las claves no exponen el nombre del paciente).
 */
class AlmacenamientoLocal implements Almacenamiento {
  async guardar(datos: Buffer, nombreOriginal: string) {
    const ext = path.extname(nombreOriginal).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const clave = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}${ext}`;
    const destino = path.join(config.uploadsDir, clave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, datos);
    return clave;
  }

  async leer(clave: string) {
    const base = path.resolve(config.uploadsDir);
    const ruta = path.resolve(base, clave);
    if (!ruta.startsWith(base + path.sep)) throw new Error('Clave inválida');
    return readFile(ruta);
  }
}

export const almacenamiento: Almacenamiento = new AlmacenamientoLocal();
