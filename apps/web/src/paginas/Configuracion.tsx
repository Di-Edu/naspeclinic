import { useEffect, useState, type FormEvent } from 'react';
import { TIPOS_EXAMEN, TIPO_EXAMEN_LABEL, type TipoExamen } from '@naspeclinic/shared';
import { api, qs } from '../api';
import type { Cargo, Protocolo } from '../tipos';
import { Encabezado, Modal, mensajeError, useApi, useEmpresas } from '../util';

/** Protocolos (baterías) y qué protocolos exige cada cargo de cada empresa. Solo admin. */
export function Configuracion() {
  const { datos: protocolos, recargar: recargarP } = useApi<Protocolo[]>('/protocolos');
  const empresas = useEmpresas();
  const [empresaId, setEmpresaId] = useState<number | null>(null);
  useEffect(() => { if (!empresaId && empresas.length) setEmpresaId(empresas[0].id); }, [empresaId, empresas]);
  const { datos: cargos, recargar: recargarC } = useApi<Cargo[]>(empresaId ? `/cargos${qs({ empresaId })}` : null);
  const [editarP, setEditarP] = useState<Protocolo | 'nuevo' | null>(null);
  const [nuevoCargo, setNuevoCargo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const activos = (protocolos ?? []).filter((p) => p.activo);

  async function alternar(c: Cargo, protocoloId: number) {
    setError(null);
    const ids = c.protocoloIds.includes(protocoloId) ? c.protocoloIds.filter((x) => x !== protocoloId) : [...c.protocoloIds, protocoloId];
    try { await api.patch(`/cargos/${c.id}`, { protocoloIds: ids }); recargarC(); } catch (e) { setError(mensajeError(e)); }
  }
  async function crearCargo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await api.post('/cargos', { empresaId, nombre: nuevoCargo.trim(), protocoloIds: [] }); setNuevoCargo(''); recargarC(); }
    catch (err) { setError(mensajeError(err)); }
  }

  return (
    <>
      <Encabezado titulo="Configuración clínica" sub="Protocolos de vigilancia (baterías de exámenes) y los que exige cada cargo" />
      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="grilla">
        <section className="tarjeta">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div><h2>Protocolos</h2><p className="sub" style={{ margin: 0 }}>Cada protocolo define su batería y cada cuánto se renueva la aptitud</p></div>
            <button className="btn primario" onClick={() => setEditarP('nuevo')}>+ Nuevo protocolo</button>
          </div>
          <div className="tabla-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Protocolo</th><th>Batería de exámenes</th><th className="num">Vigencia</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {protocolos?.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.nombre}</strong>{p.descripcion && <div style={{ fontSize: '0.8rem', color: 'var(--texto-3)' }}>{p.descripcion}</div>}</td>
                    <td>{p.examenes.map((t) => TIPO_EXAMEN_LABEL[t]).join(', ')}</td>
                    <td className="num">{p.vigenciaMeses} meses</td>
                    <td>{p.activo ? <span className="chip bueno">Activo</span> : <span className="chip">Inactivo</span>}</td>
                    <td className="num"><button className="btn chico" onClick={() => setEditarP(p)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="tarjeta">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div><h2>Cargos y protocolos exigidos</h2><p className="sub" style={{ margin: 0 }}>Marque qué protocolos debe tener vigentes cada cargo</p></div>
            <label className="campo">Empresa
              <select value={empresaId ?? ''} onChange={(e) => setEmpresaId(Number(e.target.value))}>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </label>
          </div>
          <div className="tabla-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr><th>Cargo</th>{activos.map((p) => <th key={p.id} style={{ textAlign: 'center', whiteSpace: 'normal', minWidth: 90 }}>{p.nombre}</th>)}</tr>
              </thead>
              <tbody>
                {cargos?.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    {activos.map((p) => (
                      <td key={p.id} style={{ textAlign: 'center' }}>
                        <input type="checkbox" aria-label={`${c.nombre} exige ${p.nombre}`} checked={c.protocoloIds.includes(p.id)} onChange={() => alternar(c, p.id)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {cargos && !cargos.length && <tr><td colSpan={activos.length + 1} className="vacio">Esta empresa aún no tiene cargos</td></tr>}
              </tbody>
            </table>
          </div>
          <form onSubmit={crearCargo} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <label className="campo" style={{ flex: '1 1 220px' }}><span className="sr">Nuevo cargo</span>
              <input placeholder="Nuevo cargo, ej.: Soldador" value={nuevoCargo} onChange={(e) => setNuevoCargo(e.target.value)} />
            </label>
            <button className="btn" disabled={nuevoCargo.trim().length < 2}>+ Agregar cargo</button>
          </form>
        </section>
      </div>
      {editarP && <FormProtocolo inicial={editarP === 'nuevo' ? undefined : editarP} onCerrar={() => setEditarP(null)} onGuardado={() => { setEditarP(null); recargarP(); }} />}
    </>
  );
}

function FormProtocolo({ inicial, onCerrar, onGuardado }: { inicial?: Protocolo; onCerrar(): void; onGuardado(): void }) {
  const [f, setF] = useState({
    nombre: inicial?.nombre ?? '', descripcion: inicial?.descripcion ?? '', vigenciaMeses: String(inicial?.vigenciaMeses ?? 12),
    examenes: inicial?.examenes ?? ([] as TipoExamen[]), activo: inicial?.activo ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const alternar = (t: TipoExamen) => setF({ ...f, examenes: f.examenes.includes(t) ? f.examenes.filter((x) => x !== t) : [...f.examenes, t] });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = { ...f, descripcion: f.descripcion || null, vigenciaMeses: Number(f.vigenciaMeses) };
    try {
      if (inicial) await api.patch(`/protocolos/${inicial.id}`, body); else await api.post('/protocolos', body);
      onGuardado();
    } catch (err) { setError(mensajeError(err)); }
  }
  return (
    <Modal titulo={inicial ? `Editar: ${inicial.nombre}` : 'Nuevo protocolo'} onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <label className="campo">Nombre<input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label className="campo">Descripción<input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></label>
        <label className="campo">Vigencia de la aptitud (meses)
          <input type="number" min={1} max={120} required value={f.vigenciaMeses} onChange={(e) => setF({ ...f, vigenciaMeses: e.target.value })} />
        </label>
        <fieldset className="campo" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 6 }}>Batería de exámenes</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TIPOS_EXAMEN.map((t) => (
              <label key={t} className="chip" style={{ cursor: 'pointer', padding: '5px 10px', color: 'var(--texto)' }}>
                <input type="checkbox" checked={f.examenes.includes(t)} onChange={() => alternar(t)} /> {TIPO_EXAMEN_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
        {inicial && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Protocolo activo
          </label>
        )}
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={!f.examenes.length}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
