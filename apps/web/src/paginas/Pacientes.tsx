import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { rutValido } from '@naspeclinic/shared';
import { api, qs } from '../api';
import type { Cargo, Paciente } from '../tipos';
import { Encabezado, Modal, Paginacion, mensajeError, useApi, useEmpresas, type Pagina } from '../util';
import { formatearRut } from '../formato';

export function Pacientes() {
  const navegar = useNavigate();
  const empresas = useEmpresas();
  const [q, setQ] = useState('');
  const [qDebounce, setQDebounce] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [pagina, setPagina] = useState(1);

  useEffect(() => { const t = setTimeout(() => setQDebounce(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPagina(1), [qDebounce, empresaId]);
  const { datos: resp, error, recargar } = useApi<Pagina<Paciente>>(`/pacientes${qs({ q: qDebounce, empresaId, pagina, porPagina: 50 })}`);
  const datos = resp?.items;
  const empresa = (id: number) => empresas.find((e) => e.id === id)?.nombre ?? '';

  return (
    <>
      <Encabezado titulo="Pacientes" sub="Busque por nombre o RUT y abra el historial completo">
        <button className="btn primario" onClick={() => setNuevo(true)}>+ Nuevo paciente</button>
      </Encabezado>
      <div className="filtros">
        <label className="campo ancho">
          Buscar
          <input placeholder="Nombre o RUT (12.345.678-9)" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="campo">
          Empresa
          <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Todas</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="aviso error">{error}</div>}
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>RUT</th><th>Empresa</th><th>Cargo</th><th>Teléfono</th></tr></thead>
            <tbody>
              {datos?.map((p) => (
                <tr key={p.id} className="clic" onClick={() => navegar(`/pacientes/${p.id}`)}>
                  <td><a href={`/pacientes/${p.id}`} onClick={(e) => e.preventDefault()}>{p.nombre}</a></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatearRut(p.rut)}</td>
                  <td>{empresa(p.empresaId)}</td>
                  <td>{p.cargo}</td>
                  <td>{p.telefono}</td>
                </tr>
              ))}
              {datos && !datos.length && <tr><td colSpan={5} className="vacio">No se encontraron pacientes</td></tr>}
              {!datos && !error && <tr><td colSpan={5} className="vacio">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginacion datos={resp} onPagina={setPagina} />
      </div>
      {nuevo && <FormPaciente onCerrar={() => setNuevo(false)} onGuardado={(p) => { setNuevo(false); recargar(); navegar(`/pacientes/${p.id}`); }} />}
    </>
  );
}

export function FormPaciente({ onCerrar, onGuardado, inicial }: { onCerrar(): void; onGuardado(p: Paciente): void; inicial?: Paciente }) {
  const empresas = useEmpresas();
  const [f, setF] = useState({
    rut: inicial ? formatearRut(inicial.rut) : '', nombre: inicial?.nombre ?? '', email: inicial?.email ?? '',
    telefono: inicial?.telefono ?? '', cargoId: inicial?.cargoId ? String(inicial.cargoId) : '', empresaId: inicial ? String(inicial.empresaId) : '',
  });
  const cargos = useApi<Cargo[]>(f.empresaId ? `/cargos?empresaId=${f.empresaId}` : null).datos ?? [];
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const rutMalo = f.rut.length > 3 && !rutValido(f.rut);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    const body = { ...f, empresaId: Number(f.empresaId), email: f.email || null, telefono: f.telefono || null, cargoId: f.cargoId ? Number(f.cargoId) : null };
    try {
      onGuardado(inicial ? await api.patch<Paciente>(`/pacientes/${inicial.id}`, body) : await api.post<Paciente>('/pacientes', body));
    } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo={inicial ? 'Editar paciente' : 'Nuevo paciente'} onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <div className="fila">
          <label className="campo">RUT
            <input required value={f.rut} onChange={set('rut')} placeholder="12.345.678-9" aria-invalid={rutMalo} />
            {rutMalo && <span style={{ color: 'var(--critico-texto)' }}>RUT inválido</span>}
          </label>
          <label className="campo">Empresa
            <select required value={f.empresaId} onChange={(e) => setF({ ...f, empresaId: e.target.value, cargoId: '' })}>
              <option value="">Seleccione…</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        </div>
        <label className="campo">Nombre completo<input required minLength={2} value={f.nombre} onChange={set('nombre')} /></label>
        <div className="fila">
          <label className="campo">Correo<input type="email" value={f.email} onChange={set('email')} /></label>
          <label className="campo">Teléfono<input value={f.telefono} onChange={set('telefono')} placeholder="+56 9 …" /></label>
        </div>
        <label className="campo">Cargo
          <select value={f.cargoId} onChange={set('cargoId')} disabled={!f.empresaId}>
            <option value="">{f.empresaId ? 'Sin cargo' : 'Elija primero la empresa'}</option>
            {cargos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <span style={{ color: 'var(--texto-3)' }}>El cargo define qué protocolos debe tener vigentes.</span>
        </label>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={enviando || rutMalo}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
