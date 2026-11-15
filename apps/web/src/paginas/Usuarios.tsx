import { useState, type FormEvent } from 'react';
import { ROLES, type Rol } from '@naspeclinic/shared';
import { api } from '../api';
import type { Usuario } from '../tipos';
import { Encabezado, Modal, mensajeError, useApi, useEmpresas } from '../util';
import { ROL_LABEL } from '../formato';

export function Usuarios() {
  const { datos, error, recargar } = useApi<Usuario[]>('/usuarios');
  const empresas = useEmpresas();
  const [nuevo, setNuevo] = useState(false);
  const empresa = (id: number | null) => empresas.find((e) => e.id === id)?.nombre ?? '—';

  async function alternar(u: Usuario) {
    await api.patch(`/usuarios/${u.id}`, { activo: !u.activo });
    recargar();
  }

  return (
    <>
      <Encabezado titulo="Usuarios y roles" sub="Admin: acceso total · Operador: exámenes y agenda · Gerente: dashboard y reporte de su empresa">
        <button className="btn primario" onClick={() => setNuevo(true)}>+ Nuevo usuario</button>
      </Encabezado>
      {error && <div className="aviso error">{error}</div>}
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
                  <td>{u.activo ? <span className="chip bueno">Activo</span> : <span className="chip">Inactivo</span>}</td>
                  <td className="num"><button className="btn chico" onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
        <label className="campo">Contraseña inicial (mínimo 10 caracteres)
          <input type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} />
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
