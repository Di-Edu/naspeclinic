import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Empresa, Sede } from './tipos';

/** Carga datos de la API y los recarga cuando cambia la ruta. */
export function useApi<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!ruta) return;
    let vigente = true;
    setError(null);
    api.get<T>(ruta)
      .then((d) => vigente && setDatos(d))
      .catch((e: Error) => vigente && setError(e.message));
    return () => { vigente = false; };
  }, [ruta, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, error, recargar, cargando: !datos && !error };
}

export const useEmpresas = (activo = true) => useApi<Empresa[]>(activo ? '/empresas' : null).datos ?? [];
export const useSedes = () => useApi<Sede[]>('/sedes').datos ?? [];

export function mensajeError(e: unknown) {
  if (e instanceof ApiError && e.detalles?.length) return e.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ');
  return e instanceof Error ? e.message : 'Error inesperado';
}

export function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar(): void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Encabezado({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

export function ChipNivel({ nivel }: { nivel: 'ninguno' | 'moderado' | 'critico' }) {
  if (nivel === 'ninguno') return <span className="chip bueno"><span className="punto" />Sin hallazgos</span>;
  return (
    <span className={`chip ${nivel}`}>
      <span aria-hidden>{nivel === 'critico' ? '▲' : '●'}</span>
      {nivel === 'critico' ? 'Crítico' : 'Moderado'}
    </span>
  );
}
