import { useState, type FormEvent } from 'react';
import {
  TIPOS_EVALUACION, TIPO_EVALUACION_LABEL, TIPO_EXAMEN_LABEL, ESTADOS_EXAMEN, RESULTADOS, NIVELES_HALLAZGO, type Resultado,
} from '@naspeclinic/shared';
import { api } from '../api';
import type { EvaluacionDetalle, ExamenDeEvaluacion, Protocolo } from '../tipos';
import { ChipNivel, Modal, mensajeError, useApi, useSedes } from '../util';
import { ESTADO_EXAMEN_LABEL, NIVEL_LABEL, RESULTADO_LABEL, fecha as fmtFecha, isoLocal } from '../formato';

/** Crea una evaluación: genera la batería de exámenes del protocolo. */
export function FormEvaluacion({ pacienteId, protocoloId, protocolosSugeridos, titulo = 'Nueva evaluación', onCerrar, onGuardado }: {
  pacienteId: number; protocoloId?: number; protocolosSugeridos?: number[]; titulo?: string; onCerrar(): void; onGuardado(id: number): void;
}) {
  const protocolos = (useApi<Protocolo[]>('/protocolos').datos ?? []).filter((p) => p.activo);
  const sedes = useSedes();
  const [f, setF] = useState({ protocoloId: protocoloId ? String(protocoloId) : '', tipo: 'periodica', fecha: isoLocal(new Date()), sedeId: '' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const elegido = protocolos.find((p) => String(p.id) === f.protocoloId);
  const ordenados = [...protocolos].sort((a, b) => Number(protocolosSugeridos?.includes(b.id)) - Number(protocolosSugeridos?.includes(a.id)));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const ev = await api.post<{ id: number }>('/evaluaciones', {
        pacienteId, protocoloId: Number(f.protocoloId), tipo: f.tipo, fecha: f.fecha, sedeId: f.sedeId ? Number(f.sedeId) : null,
      });
      onGuardado(ev.id);
    } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <label className="campo">Protocolo
          <select required value={f.protocoloId} onChange={set('protocoloId')}>
            <option value="">Seleccione…</option>
            {ordenados.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}{protocolosSugeridos?.includes(p.id) ? ' (exigido por su cargo)' : ''}</option>
            ))}
          </select>
        </label>
        {elegido && (
          <div className="aviso" style={{ background: 'var(--marca-suave)' }}>
            Batería: <b>{elegido.examenes.map((t) => TIPO_EXAMEN_LABEL[t]).join(', ')}</b>. Vigencia: {elegido.vigenciaMeses} meses.
          </div>
        )}
        <div className="fila">
          <label className="campo">Tipo
            <select value={f.tipo} onChange={set('tipo')}>{TIPOS_EVALUACION.map((t) => <option key={t} value={t}>{TIPO_EVALUACION_LABEL[t]}</option>)}</select>
          </label>
          <label className="campo">Fecha<input type="date" required value={f.fecha} onChange={set('fecha')} /></label>
        </div>
        <label className="campo">Sede
          <select value={f.sedeId} onChange={set('sedeId')}>
            <option value="">—</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={enviando}>{enviando ? 'Creando…' : 'Crear evaluación'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Registrar el resultado de un examen de la batería. */
function FormResultado({ examen, onCerrar, onGuardado }: { examen: ExamenDeEvaluacion; onCerrar(): void; onGuardado(): void }) {
  const [f, setF] = useState({
    estado: examen.estado === 'pendiente' ? 'completado' : examen.estado,
    resultado: examen.resultado ?? 'apto', nivelHallazgo: examen.nivelHallazgo, observaciones: examen.observaciones ?? '',
  });
  const [archivos, setArchivos] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.patch(`/examenes/${examen.id}`, {
        estado: f.estado, resultado: f.estado === 'completado' ? f.resultado : null,
        nivelHallazgo: f.estado === 'completado' ? f.nivelHallazgo : 'ninguno', observaciones: f.observaciones || null,
      });
      if (archivos?.length) {
        const fd = new FormData();
        for (const a of Array.from(archivos)) fd.append('archivos', a);
        await api.post(`/examenes/${examen.id}/archivos`, fd);
      }
      onGuardado();
    } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo={`Resultado: ${TIPO_EXAMEN_LABEL[examen.tipo]}`} onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <label className="campo">Estado
          <select value={f.estado} onChange={set('estado')}>{ESTADOS_EXAMEN.map((t) => <option key={t} value={t}>{ESTADO_EXAMEN_LABEL[t]}</option>)}</select>
        </label>
        {f.estado === 'completado' && (
          <div className="fila">
            <label className="campo">Resultado
              <select value={f.resultado} onChange={set('resultado')}>{RESULTADOS.map((t) => <option key={t} value={t}>{RESULTADO_LABEL[t]}</option>)}</select>
            </label>
            <label className="campo">Hallazgo
              <select value={f.nivelHallazgo} onChange={set('nivelHallazgo')}>{NIVELES_HALLAZGO.map((t) => <option key={t} value={t}>{NIVEL_LABEL[t]}</option>)}</select>
            </label>
          </div>
        )}
        {f.estado === 'completado' && f.nivelHallazgo !== 'ninguno' && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--serio-texto)' }}>
            Se abrirá un seguimiento automáticamente ({f.nivelHallazgo === 'critico' ? 'derivación en 15 días' : 'recontrol en 90 días'}).
          </p>
        )}
        <label className="campo">Observaciones clínicas (cifradas)<textarea rows={3} value={f.observaciones} onChange={set('observaciones')} /></label>
        <label className="campo">Adjuntar archivos (PDF, JPG o PNG)
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setArchivos(e.target.files)} />
        </label>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar resultado'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Cerrar la evaluación con la aptitud final y su vigencia. */
function FormCierre({ ev, onCerrar, onGuardado }: { ev: EvaluacionDetalle; onCerrar(): void; onGuardado(): void }) {
  const [f, setF] = useState({
    aptitud: (ev.aptitudSugerida ?? 'apto') as Resultado, restricciones: '', vigenteHasta: ev.vigenciaSugerida, fechaReevaluacion: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.post(`/evaluaciones/${ev.id}/cerrar`, {
        aptitud: f.aptitud, restricciones: f.restricciones || null,
        vigenteHasta: f.aptitud === 'no_apto' ? null : f.vigenteHasta, fechaReevaluacion: f.fechaReevaluacion || null,
      });
      onGuardado();
    } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo={`Cerrar evaluación: ${ev.protocolo}`} onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        <label className="campo">Aptitud laboral
          <select value={f.aptitud} onChange={set('aptitud')}>{RESULTADOS.map((t) => <option key={t} value={t}>{RESULTADO_LABEL[t]}</option>)}</select>
          {ev.aptitudSugerida && <span style={{ color: 'var(--texto-3)' }}>Sugerida según los exámenes: {RESULTADO_LABEL[ev.aptitudSugerida]}</span>}
        </label>
        {f.aptitud !== 'apto' && (
          <label className="campo">{f.aptitud === 'no_apto' ? 'Indicaciones (opcional)' : 'Restricciones laborales'}
            <textarea rows={2} required={f.aptitud === 'apto_con_restricciones'} value={f.restricciones} onChange={set('restricciones')}
              placeholder="Ej.: evitar trabajo en altura física" />
            <span style={{ color: 'var(--texto-3)' }}>La empresa verá este texto: no incluya diagnósticos.</span>
          </label>
        )}
        {f.aptitud === 'no_apto' ? (
          <label className="campo">Fecha de reevaluación
            <input type="date" value={f.fechaReevaluacion} onChange={set('fechaReevaluacion')} />
            <span style={{ color: 'var(--texto-3)' }}>Se abre un seguimiento de "no apto temporal" (por defecto, en 30 días).</span>
          </label>
        ) : (
          <label className="campo">Vigente hasta
            <input type="date" required value={f.vigenteHasta} onChange={set('vigenteHasta')} />
            <span style={{ color: 'var(--texto-3)' }}>Según el protocolo: {ev.vigenciaMeses} meses desde el {fmtFecha(ev.fecha)}.</span>
          </label>
        )}
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={enviando}>{enviando ? 'Cerrando…' : 'Cerrar evaluación'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Tarjeta de una evaluación con su batería, para el historial del paciente. */
export function TarjetaEvaluacion({ evaluacionId, onCambio }: { evaluacionId: number; onCambio(): void }) {
  const { datos: ev, recargar } = useApi<EvaluacionDetalle>(`/evaluaciones/${evaluacionId}`);
  const [editar, setEditar] = useState<ExamenDeEvaluacion | null>(null);
  const [cerrar, setCerrar] = useState(false);
  if (!ev) return <div className="cargando" style={{ padding: 8 }}>Cargando evaluación…</div>;
  const listo = () => { setEditar(null); setCerrar(false); recargar(); onCambio(); };
  const abierta = ev.estado === 'en_curso';

  return (
    <article style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong>{ev.protocolo}</strong>
          <div style={{ color: 'var(--texto-3)', fontSize: '0.85rem' }}>{TIPO_EVALUACION_LABEL[ev.tipo]} · {fmtFecha(ev.fecha)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {abierta ? (
            <>
              <span className="chip info">En curso · {ev.pendientes} pendiente{ev.pendientes === 1 ? '' : 's'}</span>
              <button className="btn chico primario" disabled={ev.pendientes > 0} title={ev.pendientes ? 'Complete todos los exámenes primero' : ''} onClick={() => setCerrar(true)}>
                Cerrar con aptitud
              </button>
            </>
          ) : (
            <>
              <span className={`chip ${ev.aptitud === 'apto' ? 'bueno' : ev.aptitud === 'no_apto' ? 'critico' : 'moderado'}`}>{ev.aptitud ? RESULTADO_LABEL[ev.aptitud] : ''}</span>
              <span className="chip">{ev.vigenteHasta ? `Vigente hasta ${fmtFecha(ev.vigenteHasta)}` : 'Sin vigencia'}</span>
            </>
          )}
        </div>
      </div>
      {ev.restricciones && <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}><b>Restricciones:</b> {ev.restricciones}</p>}
      <div className="tabla-wrap" style={{ marginTop: 8 }}>
        <table>
          <tbody>
            {ev.examenes.map((x) => (
              <tr key={x.id}>
                <td style={{ width: '32%' }}>{TIPO_EXAMEN_LABEL[x.tipo]}</td>
                <td>{ESTADO_EXAMEN_LABEL[x.estado]}</td>
                <td>{x.resultado ? RESULTADO_LABEL[x.resultado] : '—'}</td>
                <td>{x.estado === 'completado' && <ChipNivel nivel={x.nivelHallazgo} />}</td>
                <td className="num">{abierta && <button className="btn chico" onClick={() => setEditar(x)}>{x.estado === 'completado' ? 'Editar' : 'Registrar resultado'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editar && <FormResultado examen={editar} onCerrar={() => setEditar(null)} onGuardado={listo} />}
      {cerrar && <FormCierre ev={ev} onCerrar={() => setCerrar(false)} onGuardado={listo} />}
    </article>
  );
}
