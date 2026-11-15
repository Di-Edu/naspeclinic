import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { TIPO_SEGUIMIENTO_LABEL, TIPOS_SEGUIMIENTO } from '@naspeclinic/shared';
import { api, qs } from '../api';
import type { Paciente, Seguimiento } from '../tipos';
import { Encabezado, Modal, Paginacion, mensajeError, useApi, useEmpresas, type Pagina } from '../util';
import { fecha, isoLocal } from '../formato';
import { SelectorPaciente } from '../componentes/SelectorPaciente';

const VISTAS = [
  { id: 'abiertos', texto: 'Abiertos', filtro: { estado: 'abierto' } },
  { id: 'vencidos', texto: 'Atrasados', filtro: { vencidos: '1' } },
  { id: 'cerrados', texto: 'Cerrados', filtro: { estado: 'cerrado' } },
] as const;

export function ChipSeguimiento({ s }: { s: Pick<Seguimiento, 'estado' | 'vencido'> }) {
  if (s.estado === 'cerrado') return <span className="chip bueno">✓ Cerrado</span>;
  if (s.vencido) return <span className="chip critico"><span aria-hidden>▲</span>Atrasado</span>;
  return <span className="chip info">Abierto</span>;
}

export function Seguimientos() {
  const empresas = useEmpresas();
  const [vista, setVista] = useState<(typeof VISTAS)[number]['id']>('abiertos');
  const [empresaId, setEmpresaId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [accion, setAccion] = useState<{ tipo: 'cerrar' | 'reprogramar'; s: Seguimiento } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const filtro = VISTAS.find((v) => v.id === vista)!.filtro;
  const { datos, error, recargar } = useApi<Pagina<Seguimiento>>(`/seguimientos${qs({ ...filtro, empresaId, pagina, porPagina: 50 })}`);
  const resumen = useApi<{ abiertos: number; vencidos: number }>('/seguimientos/resumen');
  const listo = () => { setAccion(null); setNuevo(false); recargar(); resumen.recargar(); };

  return (
    <>
      <Encabezado titulo="Seguimiento de hallazgos" sub="Derivaciones, recontroles y no aptos temporales hasta su cierre">
        <button className="btn primario" onClick={() => setNuevo(true)}>+ Nuevo seguimiento</button>
      </Encabezado>
      <div className="filtros">
        <div className="segmentado" role="group" aria-label="Vista">
          {VISTAS.map((v) => (
            <button key={v.id} className={vista === v.id ? 'activo' : ''} onClick={() => { setVista(v.id); setPagina(1); }}>
              {v.texto}
              {v.id === 'abiertos' && resumen.datos ? ` (${resumen.datos.abiertos})` : ''}
              {v.id === 'vencidos' && resumen.datos ? ` (${resumen.datos.vencidos})` : ''}
            </button>
          ))}
        </div>
        <label className="campo">Empresa
          <select value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setPagina(1); }}>
            <option value="">Todas</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="aviso error">{error}</div>}
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Trabajador</th><th>Tipo</th><th>Motivo</th><th>{vista === 'cerrados' ? 'Resultado' : 'Fecha compromiso'}</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {datos?.items.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/pacientes/${s.pacienteId}`}>{s.paciente}</Link><div style={{ fontSize: '0.8rem', color: 'var(--texto-3)' }}>{s.empresa}</div></td>
                  <td>{TIPO_SEGUIMIENTO_LABEL[s.tipo]}</td>
                  <td>{s.motivo}</td>
                  <td style={{ whiteSpace: vista === 'cerrados' ? undefined : 'nowrap' }}>
                    {vista === 'cerrados' ? s.cierre : s.fechaCompromiso ? fecha(s.fechaCompromiso) : '—'}
                  </td>
                  <td><ChipSeguimiento s={s} /></td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {s.estado === 'abierto' && (
                      <>
                        <button className="btn chico" onClick={() => setAccion({ tipo: 'reprogramar', s })}>Reprogramar</button>{' '}
                        <button className="btn chico primario" onClick={() => setAccion({ tipo: 'cerrar', s })}>Cerrar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {datos && !datos.items.length && <tr><td colSpan={6} className="vacio">{vista === 'vencidos' ? 'No hay seguimientos atrasados 🎉' : 'Sin seguimientos'}</td></tr>}
              {!datos && !error && <tr><td colSpan={6} className="vacio">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginacion datos={datos} onPagina={setPagina} />
      </div>
      {accion && <FormAccion {...accion} onCerrar={() => setAccion(null)} onGuardado={listo} />}
      {nuevo && <FormSeguimiento onCerrar={() => setNuevo(false)} onGuardado={listo} />}
    </>
  );
}

export function FormAccion({ tipo, s, onCerrar, onGuardado }: { tipo: 'cerrar' | 'reprogramar'; s: Seguimiento; onCerrar(): void; onGuardado(): void }) {
  const [texto, setTexto] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState(s.fechaCompromiso ?? isoLocal(new Date()));
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/seguimientos/${s.id}`, tipo === 'cerrar' ? { cerrar: { resultado: texto } } : { fechaCompromiso: nuevaFecha });
      onGuardado();
    } catch (err) { setError(mensajeError(err)); }
  }
  return (
    <Modal titulo={tipo === 'cerrar' ? 'Cerrar seguimiento' : 'Reprogramar seguimiento'} onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <p style={{ margin: 0, color: 'var(--texto-2)' }}>{s.paciente ? `${s.paciente} · ` : ''}{TIPO_SEGUIMIENTO_LABEL[s.tipo]}: {s.motivo}</p>
        {tipo === 'cerrar' ? (
          <label className="campo">Resultado / conclusión
            <textarea rows={3} required minLength={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: evaluado por cardiólogo, sin contraindicación laboral" />
          </label>
        ) : (
          <label className="campo">Nueva fecha compromiso<input type="date" required value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} /></label>
        )}
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario">{tipo === 'cerrar' ? 'Cerrar seguimiento' : 'Guardar fecha'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function FormSeguimiento({ paciente, onCerrar, onGuardado }: { paciente?: Paciente; onCerrar(): void; onGuardado(): void }) {
  const [p, setP] = useState<Paciente | null>(paciente ?? null);
  const [f, setF] = useState({ tipo: 'derivacion', motivo: '', fechaCompromiso: isoLocal(new Date(Date.now() + 15 * 86_400_000)) });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p) return setError('Seleccione un trabajador');
    setError(null);
    try { await api.post('/seguimientos', { ...f, pacienteId: p.id }); onGuardado(); }
    catch (err) { setError(mensajeError(err)); }
  }
  return (
    <Modal titulo="Nuevo seguimiento" onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        {!paciente && <SelectorPaciente valor={p} onCambio={setP} />}
        <div className="fila">
          <label className="campo">Tipo
            <select value={f.tipo} onChange={set('tipo')}>{TIPOS_SEGUIMIENTO.map((t) => <option key={t} value={t}>{TIPO_SEGUIMIENTO_LABEL[t]}</option>)}</select>
          </label>
          <label className="campo">Fecha compromiso<input type="date" required value={f.fechaCompromiso} onChange={set('fechaCompromiso')} /></label>
        </div>
        <label className="campo">Motivo (dato clínico, se guarda cifrado)
          <textarea rows={2} required minLength={3} value={f.motivo} onChange={set('motivo')} placeholder="Ej.: derivar a otorrino por hipoacusia" />
        </label>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario">Crear seguimiento</button>
        </div>
      </form>
    </Modal>
  );
}
