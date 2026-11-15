import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onSesionExpirada, token } from './api';
import type { Usuario } from './tipos';

interface Ctx {
  usuario: Usuario | null;
  cargando: boolean;
  entrar(email: string, password: string): Promise<void>;
  /** Cambia la contraseña propia; el servidor cierra las otras sesiones y entrega un token nuevo. */
  cambiarPassword(actual: string, nueva: string): Promise<void>;
  salir(revocar?: boolean): void;
}

const SesionCtx = createContext<Ctx | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(!!token.leer());

  /** Limpia la sesión local. Con `revocar`, además invalida el token en el servidor. */
  const salir = useCallback((revocar = true) => {
    if (revocar && token.leer()) api.post('/auth/logout').catch(() => { /* ya expirada */ });
    token.guardar(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    onSesionExpirada(() => salir(false));
    if (!token.leer()) return;
    api.get<Usuario>('/auth/me').then(setUsuario).catch(() => salir(false)).finally(() => setCargando(false));
  }, [salir]);

  const entrar = async (email: string, password: string) => {
    const r = await api.post<{ token: string; usuario: Usuario }>('/auth/login', { email, password });
    token.guardar(r.token);
    setUsuario(r.usuario);
  };

  const cambiarPassword = async (actual: string, nueva: string) => {
    const r = await api.post<{ token: string; usuario: Usuario }>('/auth/cambiar-password', { actual, nueva });
    token.guardar(r.token);
    setUsuario(r.usuario);
  };

  return <SesionCtx.Provider value={{ usuario, cargando, entrar, cambiarPassword, salir }}>{children}</SesionCtx.Provider>;
}

export function useSesion() {
  const c = useContext(SesionCtx);
  if (!c) throw new Error('useSesion fuera de SesionProvider');
  return c;
}
