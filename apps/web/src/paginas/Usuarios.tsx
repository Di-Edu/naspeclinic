import { useState, type FormEvent } from 'react';
import { ROLES, problemaPassword, type Rol } from '@naspeclinic/shared';
import { api } from '../api';
import type { Usuario } from '../tipos';
import { Encabezado, Modal, mensajeError, useApi, useEmpresas } from '../util';
import { ROL_LABEL } from '../formato';

export function Usuarios() {
  const { datos, error, recargar } = useApi<Usuario[]>('/usuarios');
  const empresas = useEmpresas();
  const [nuevo, setNuevo] = useState(false);
  const [restablecer, setRestablecer] = useState<Usuario | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const empresa = (id: number | null) => empresas.find((e) => e.id === id)?.nombre ?? '—';

  async function alternar(u: Usuario) {
    setAviso(null);
    try { await api.patch(`/usuarios/${u.id}`, { activo: !u.activo }); recargar(); }
    catch (e) { setAviso(mensajeError(e)); }
  }

  return (
    <>
      <Encabezado titulo="Usuarios y roles" sub="Admin: acceso total · Operador: exámenes y agenda · Gerente: dashboard y reporte de su empresa">
        <button className="btn primario" onClick={() => setNuevo(true)}>+ Nuevo usuario</button>
      </Encabezado>
      {error && <div className="aviso error">{error}</div>}
      {aviso && <div className="aviso error" style={{ marginBottom: 12 }}>{aviso}</div>}
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Empresa</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {datos?.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{ROL_LABEL[u.rol]}</td>
                  <td>{empresa(u.empresaId)}</td>
                  <td>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {u.activo ? <span className="chip bueno">Activo</span> : <span className="chip">Inactivo</span>}
                      {u.activo && u.debeCambiarPassword && <span className="chip moderado" title="Entró con una contraseña asignada y debe cambiarla">Debe cambiar contraseña</span>}
                    </span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {u.activo && <button className="btn chico" onClick={() => setRestablecer(u)}>Restablecer contraseña</button>}{' '}
                    <button className="btn chico" onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {restablecer && <ModalRestablecer usuario={restablecer} onCerrar={() => { setRestablecer(null); recargar(); }} />}
      {nuevo && <FormUsuario onCerrar={() => setNuevo(false)} onGuardado={() => { setNuevo(false); recargar(); }} />}
    </>
  );
}

function FormUsuario({ onCerrar, onGuardado }: { onCerrar(): void; onGuardado(): void }) {
  const empresas = useEmpresas();
  const [f, setF] = useState({ nombre: '', email: '', rol: 'operador' as Rol, empresaId: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/usuarios', { ...f, empresaId: f.rol === 'gerente' ? Number(f.empresaId) : null });
      onGuardado();
    } catch (err) { setError(mensajeError(err)); }
  }

  return (
    <Modal titulo="Nuevo usuario" onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <label className="campo">Nombre<input required value={f.nombre} onChange={set('nombre')} /></label>
        <label className="campo">Correo<input type="email" required value={f.email} onChange={set('email')} /></label>
        <div className="fila">
          <label className="campo">Rol
            <select value={f.rol} onChange={set('rol')}>{ROLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}</select>
          </label>
          {f.rol === 'gerente' && (
            <label className="campo">Empresa
              <select required value={f.empresaId} onChange={set('empresaId')}>
                <option value="">Seleccione…</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="campo">Contraseña inicial
          <input type="password" required autoComplete="new-password" value={f.password} onChange={set('password')} />
          <span style={{ color: f.password && problemaPassword(f.password) ? 'var(--critico-texto)' : 'var(--texto-3)' }}>
            {(f.password && problemaPassword(f.password)) || 'Mínimo 10 caracteres, con letras y números. El usuario deberá cambiarla al entrar.'}
          </span>
        </label>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario">Crear usuario</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRestablecer({ usuario, onCerrar }: { usuario: Usuario; onCerrar(): void }) {
  const [resultado, setResultado] = useState<{ modo: 'enlace'; enviadoA: string } | { modo: 'temporal'; passwordTemporal: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function ejecutar(modo: 'enlace' | 'temporal') {
    setEnviando(true); setError(null);
    try { setResultado(await api.post(`/usuarios/${usuario.id}/restablecer`, { modo })); }
    catch (e) { setError(mensajeError(e)); }
    setEnviando(false);
  }
  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { /* sin portapapeles */ }
  }

  return (
    <Modal titulo={`Restablecer contraseña de ${usuario.nombre}`} onCerrar={onCerrar}>
      <div className="form">
        {!resultado && (
          <>
            <p style={{ margin: 0, color: 'var(--texto-2)' }}>Cualquiera de las dos opciones cierra las sesiones abiertas de este usuario.</p>
            <div className="tarjeta" style={{ padding: 14 }}>
              <strong>Enviar enlace por correo</strong>
              <p style={{ margin: '4px 0 10px', color: 'var(--texto-2)', fontSize: '0.9rem' }}>
                Le llega a <b>{usuario.email}</b> un enlace de un solo uso, válido por 30 minutos, para crear su contraseña.
              </p>
              <button className="btn primario" disabled={enviando} onClick={() => ejecutar('enlace')}>Enviar enlace</button>
            </div>
            <div className="tarjeta" style={{ padding: 14 }}>
              <strong>Generar contraseña temporal</strong>
              <p style={{ margin: '4px 0 10px', color: 'var(--texto-2)', fontSize: '0.9rem' }}>
                Para cuando el usuario no tiene acceso a su correo. Usted se la comunica y deberá cambiarla al entrar.
              </p>
              <button className="btn" disabled={enviando} onClick={() => ejecutar('temporal')}>Generar contraseña temporal</button>
            </div>
          </>
        )}
        {resultado?.modo === 'enlace' && <div className="aviso ok" role="status">Enlace enviado a {resultado.enviadoA}.</div>}
        {resultado?.modo === 'temporal' && (
          <>
            <div className="aviso ok" role="status">Contraseña temporal generada. Comuníquela por un canal seguro; no se volverá a mostrar.</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ fontSize: '1.2rem', padding: '8px 12px', background: 'var(--superficie-2)', border: '1px solid var(--borde)', borderRadius: 8, flex: 1, letterSpacing: '0.05em' }}>
                {resultado.passwordTemporal}
              </code>
              <button className="btn" onClick={() => copiar(resultado.passwordTemporal)}>{copiado ? 'Copiada ✓' : 'Copiar'}</button>
            </div>
          </>
        )}
        {error && <div className="aviso error" role="alert">{error}</div>}
        <div className="acciones"><button className="btn" onClick={onCerrar}>{resultado ? 'Cerrar' : 'Cancelar'}</button></div>
      </div>
    </Modal>
  );
}
