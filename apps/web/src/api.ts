// Cliente HTTP de la API. El token JWT se guarda en sessionStorage (se borra al cerrar el navegador).

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const CLAVE = 'naspeclinic.token';

export const token = {
  leer(): string | null {
    try { return sessionStorage.getItem(CLAVE); } catch { return null; }
  },
  guardar(t: string | null) {
    try { t ? sessionStorage.setItem(CLAVE, t) : sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, mensaje: string, public detalles?: { campo: string; mensaje: string }[]) {
    super(mensaje);
  }
}

let alExpirar: () => void = () => {};
export const onSesionExpirada = (fn: () => void) => { alExpirar = fn; };

async function llamar(ruta: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const t = token.leer();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${ruta}`, { ...init, headers });
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    if (res.status === 401 && t) alExpirar();
    throw new ApiError(res.status, cuerpo.error ?? `Error ${res.status}`, cuerpo.detalles);
  }
  return res;
}

export const api = {
  get: async <T,>(ruta: string) => (await llamar(ruta)).json() as Promise<T>,
  post: async <T,>(ruta: string, body?: unknown) =>
    (await llamar(ruta, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) })).json() as Promise<T>,
  patch: async <T,>(ruta: string, body: unknown) =>
    (await llamar(ruta, { method: 'PATCH', body: JSON.stringify(body) })).json() as Promise<T>,
  /** Descarga un archivo protegido (PDF, imagen) y lo abre/guarda en el navegador. */
  async descargar(ruta: string, nombre: string) {
    const blob = await (await llamar(ruta)).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

export function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
