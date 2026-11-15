import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIPOS_EXAMEN, TIPO_EXAMEN_LABEL, ESTADOS_EXAMEN, RESULTADOS, NIVELES_HALLAZGO } from '@naspeclinic/shared';
import { api, qs } from '../api';
import type { ExamenFila, Paciente } from '../tipos';
import { ChipNivel, Encabezado, Modal, Paginacion, mensajeError, useApi, useEmpresas, useSedes, type Pagina } from '../util';
import { ESTADO_EXAMEN_LABEL, NIVEL_LABEL, RESULTADO_LABEL, fecha, isoLocal } from '../formato';
import { SelectorPaciente } from '../componentes/SelectorPaciente';

export function Examenes() {
  const navegar = useNavigate();
  const empresas = useEmpresas();
  const [f, setF] = useState({ empresaId: '', tipo: '', estado: '', desde: '', hasta: '' });
  const [nuevo, setNuevo] = useState(false);
  const [pagina, setPagina] = useState(1);
  const { datos: resp, error, recargar } = useApi<Pagina<ExamenFila>>(`/examenes${qs({ ...f, pagina, porPagina: 50 })}`);
  const datos = resp?.items;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPagina(1); };

  return (
    <>
      <Encabezado titulo="Exámenes" sub="Carga de resultados, archivos adjuntos y seguimiento">
        <button className="btn primario" onClick={() => setNuevo(true)}>+ Registrar examen</button>
      </Encabezado>
      <div className="filtros">
        <label className="campo">Empresa
          <select value={f.empresaId} onChange={set('empresaId')}>
            <option value="">Todas</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Tipo
          <select value={f.tipo} onChange={set('tipo')}>
            <option value="">Todos</option>
            {TIPOS_EXAMEN.map((t) => <option key={t} value={t}>{TIPO_EXAMEN_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="campo">Estado
          <select value={f.estado} onChange={set('estado')}>
            <option value="">Todos</option>
            {ESTADOS_EXAMEN.map((t) => <option key={t} value={t}>{ESTADO_EXAMEN_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="campo">Desde<input type="date" value={f.desde} onChange={set('desde')} /></label>
        <label className="campo">Hasta<input type="date" value={f.hasta} onChange={set('hasta')} /></label>
      </div>
      {error && <div className="aviso error">{error}</div>}
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Paciente</th><th>Empresa</th><th>Examen</th><th>Estado</th><th>Resultado</th><th>Hallazgo</th></tr></thead>
            <tbody>
              {datos?.map((e) => (
                <tr key={e.id} className="clic" onClick={() => navegar(`/pacientes/${e.pacienteId}`)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fecha(e.fecha)}</td>
                  <td>{e.paciente}</td>
                  <td>{e.empresa}</td>
                  <td>{TIPO_EXAMEN_LABEL[e.tipo]}</td>
                  <td>{ESTADO_EXAMEN_LABEL[e.estado]}</td>
                  <td>{e.resultado ? RESULTADO_LABEL[e.resultado] : '—'}</td>
                  <td><ChipNivel nivel={e.nivelHallazgo} /></td>
                </tr>
              ))}
              {datos && !datos.length && <tr><td colSpan={7} className="vacio">Sin exámenes con estos filtros</td></tr>}
              {!datos && !error && <tr><td colSpan={7} className="vacio">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginacion datos={resp} onPagina={setPagina} />
      </div>
      {nuevo && <FormExamen onCerrar={() => setNuevo(false)} onGuardado={() => { setNuevo(false); recargar(); }} />}
    </>
  );
}

export function FormExamen({ paciente, onCerrar, onGuardado }: { paciente?: Paciente; onCerrar(): void; onGuardado(): void }) {
  const sedes = useSedes();
  const [p, setP] = useState<Paciente | null>(paciente ?? null);
  const [f, setF] = useState({
    tipo: 'broncopulmonar', fecha: isoLocal(new Date()), sedeId: '', estado: 'completado',
    resultado: 'apto', nivelHallazgo: 'ninguno', observaciones: '',
  });
  const [archivos, setArchivos] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p) return setError('Seleccione un paciente');
    setEnviando(true); setError(null);
    try {
      const ex = await api.post<{ id: number }>('/examenes', {
        ...f, pacienteId: p.id, sedeId: f.sedeId ? Number(f.sedeId) : null,
        resultado: f.estado === 'completado' ? f.resultado : null, observaciones: f.observaciones || null,
      });
      if (archivos?.length) {
        const fd = new FormData();
        for (const a of Array.from(archivos)) fd.append('archivos', a);
        await api.post(`/examenes/${ex.id}/archivos`, fd);
      }
      onGuardado();
    } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo="Registrar examen" onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        {paciente ? null : <SelectorPaciente valor={p} onCambio={setP} />}
        <div className="fila">
          <label className="campo">Tipo de examen
            <select value={f.tipo} onChange={set('tipo')}>
              {TIPOS_EXAMEN.map((t) => <option key={t} value={t}>{TIPO_EXAMEN_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="campo">Fecha<input type="date" required value={f.fecha} onChange={set('fecha')} /></label>
        </div>
        <div className="fila">
          <label className="campo">Sede
            <select value={f.sedeId} onChange={set('sedeId')}>
              <option value="">—</option>
              {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="campo">Estado
            <select value={f.estado} onChange={set('estado')}>
              {ESTADOS_EXAMEN.map((t) => <option key={t} value={t}>{ESTADO_EXAMEN_LABEL[t]}</option>)}
            </select>
          </label>
        </div>
        {f.estado === 'completado' && (
          <div className="fila">
            <label className="campo">Resultado
              <select value={f.resultado} onChange={set('resultado')}>
                {RESULTADOS.map((t) => <option key={t} value={t}>{RESULTADO_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="campo">Hallazgo
              <select value={f.nivelHallazgo} onChange={set('nivelHallazgo')}>
                {NIVELES_HALLAZGO.map((t) => <option key={t} value={t}>{NIVEL_LABEL[t]}</option>)}
              </select>
            </label>
          </div>
        )}
        <label className="campo">Observaciones clínicas (se guardan cifradas)
          <textarea rows={3} value={f.observaciones} onChange={set('observaciones')} />
        </label>
        <label className="campo">Archivos (PDF, JPG o PNG, máx. 10 MB c/u)
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setArchivos(e.target.files)} />
        </label>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar examen'}</button>
        </div>
      </form>
    </Modal>
  );
}
