import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { normalizarRut } from '@naspeclinic/shared';
import { config } from '../config';

const llave = Buffer.from(config.llaveCifrado, 'hex');
if (llave.length !== 32) throw new Error('ENCRYPTION_KEY debe tener 32 bytes en hex (64 caracteres)');

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<datos> en base64url */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.');
}

export function descifrar(valor: string): string {
  const [version, iv, tag, datos] = valor.split('.');
  if (version !== 'v1') throw new Error('Formato de cifrado desconocido');
  const d = createDecipheriv('aes-256-gcm', llave, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
}

export const cifrarOpcional = (t?: string | null) => (t ? cifrar(t) : null);
export const descifrarOpcional = (t?: string | null) => (t ? descifrar(t) : null);

/** Índice ciego: permite buscar un RUT exacto sin guardarlo en claro. */
export function hashRut(rut: string): string {
  return createHmac('sha256', config.llaveHmac).update(normalizarRut(rut)).digest('hex');
}
