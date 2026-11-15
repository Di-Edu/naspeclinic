import { useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { Rol } from '@naspeclinic/shared';
import { useSesion } from './sesion';
import { ROL_LABEL } from './formato';
import { Login } from './paginas/Login';
import { Dashboard } from './paginas/Dashboard';
import { Pacientes } from './paginas/Pacientes';
import { Historial } from './paginas/Historial';
import { Examenes } from './paginas/Examenes';
import { Agenda } from './paginas/Agenda';
import { Reportes } from './paginas/Reportes';
import { Usuarios } from './paginas/Usuarios';
import { Aptitud } from './paginas/Aptitud';
import { Seguimientos } from './paginas/Seguimientos';
import { Configuracion } from './paginas/Configuracion';
import { CambioObligatorio, ModalCambiarPassword, Restablecer } from './paginas/Cuenta';

const NAV: { a: string; texto: string; roles: Rol[]; icono: ReactNode }[] = [
  { a: '/dashboard', texto: 'Dashboard', roles: ['admin', 'gerente'], icono: <path d="M3 13h7V3H3zm0 8h7v-6H3zm11 0h7V11h-7zm0-18v6h7V3z" /> },
  { a: '/aptitud', texto: 'Aptitud y vencimientos', roles: ['admin', 'operador', 'gerente'], icono: <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z" /> },
  { a: '/agenda', texto: 'Agenda', roles: ['admin', 'operador'], icono: <path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5z" /> },
  { a: '/pacientes', texto: 'Pacientes', roles: ['admin', 'operador'], icono: <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z" /> },
  { a: '/examenes', texto: 'Exámenes', roles: ['admin', 'operador'], icono: <path d="M6 2h9l5 5v15H6zm8 1.5V8h4.5M9 12h8v2H9zm0 4h8v2H9z" /> },
  { a: '/seguimientos', texto: 'Seguimientos', roles: ['admin', 'operador'], icono: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l4 2.4-1 1.7-5-3V7z" /> },
  { a: '/reportes', texto: 'Reporte gerencial', roles: ['admin', 'gerente'], icono: <path d="M4 20h16v2H4zM6 10h3v8H6zm5-4h3v12h-3zm5 7h3v5h-3z" /> },
  { a: '/configuracion', texto: 'Configuración', roles: ['admin'], icono: <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 1.7 1L11 21h4l.4-2.6a7 7 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" /> },
  { a: '/usuarios', texto: 'Usuarios', roles: ['admin'], icono: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-7 1.7-7 4v3h14v-3c0-2.3-3.7-4-7-4zm8 0c-.5 0-1 0-1.5.1 1.5 1 2.5 2.3 2.5 3.9v3h5v-3c0-2.2-3-4-6-4z" /> },
];

export const Logo = ({ tam = 30 }: { tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="8" fill="#ffffff" fillOpacity="0.16" />
    <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff" />
  </svg>
);

export function App() {
  const { usuario, cargando, salir } = useSesion();
  const [menu, setMenu] = useState(false);
  const [cambiarPass, setCambiarPass] = useState(false);
  const loc = useLocation();

  if (loc.pathname === '/restablecer') return <Restablecer />;
  if (cargando) return <div className="cargando" style={{ padding: 32 }}>Cargando…</div>;
  if (!usuario) return <Login />;
  if (usuario.debeCambiarPassword) return <CambioObligatorio />;

  const nav = NAV.filter((n) => n.roles.includes(usuario.rol));
  const inicio = nav[0].a;
  const puede = (...roles: Rol[]) => roles.includes(usuario.rol);

  return (
    <div className="app">
      <div className="barra-movil">
        <button onClick={() => setMenu(true)} aria-label="Abrir menú">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" /></svg>
        </button>
        <strong>Naspeclinic</strong>
      </div>
      <aside className={`lateral ${menu ? 'abierta' : ''}`} onClick={() => setMenu(false)}>
        <div className="logo">
          <Logo />
          <div>Naspeclinic<small>Salud ocupacional minera</small></div>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink key={n.a} to={n.a} className={({ isActive }) => (isActive || loc.pathname.startsWith(n.a) ? 'active' : '')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>{n.icono}</svg>
              {n.texto}
            </NavLink>
          ))}
        </nav>
        <div className="pie">
          <div className="nombre">{usuario.nombre}</div>
          <div className="rol">{ROL_LABEL[usuario.rol]}{usuario.empresa ? ` · ${usuario.empresa}` : ''}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={(e) => { e.stopPropagation(); setMenu(false); setCambiarPass(true); }}>Cambiar contraseña</button>
            <button onClick={salir}>Cerrar sesión</button>
          </div>
        </div>
      </aside>
      <main className="principal">
        <Routes>
          {puede('admin', 'gerente') && <Route path="/dashboard" element={<Dashboard />} />}
          {puede('admin', 'gerente') && <Route path="/reportes" element={<Reportes />} />}
          {puede('admin', 'operador') && <Route path="/agenda" element={<Agenda />} />}
          {puede('admin', 'operador') && <Route path="/pacientes" element={<Pacientes />} />}
          {puede('admin', 'operador') && <Route path="/pacientes/:id" element={<Historial />} />}
          {puede('admin', 'operador') && <Route path="/examenes" element={<Examenes />} />}
          {puede('admin') && <Route path="/usuarios" element={<Usuarios />} />}
          <Route path="/aptitud" element={<Aptitud />} />
          {puede('admin', 'operador') && <Route path="/seguimientos" element={<Seguimientos />} />}
          {puede('admin') && <Route path="/configuracion" element={<Configuracion />} />}
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Routes>
      </main>
      {cambiarPass && <ModalCambiarPassword onCerrar={() => setCambiarPass(false)} />}
    </div>
  );
}
