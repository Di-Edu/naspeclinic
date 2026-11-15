import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TIPO_EXAMEN_LABEL } from '@naspeclinic/shared';
import { api } from '../api';
import type { Cargo, Cita, Evaluacion, ExamenDetalle, Paciente, Seguimiento } from '../tipos';
import { TIPO_SEGUIMIENTO_LABEL } from '@naspeclinic/shared';
import { FormEvaluacion, TarjetaEvaluacion } from './Evaluaciones';
import { ChipSeguimiento, FormAccion, FormSeguimiento } from './Seguimientos';
import { ChipNivel, Encabezado, useApi, useEmpresas } from '../util';
import { ESTADO_CITA_LABEL, ESTADO_EXAMEN_LABEL, RESULTADO_LABEL, fecha, formatearRut, hora, tamano } from '../formato';
import { FormPaciente } from './Pacientes';
import { FormExamen } from './Examenes';
import { FormCita } from './Agenda';

interface Historial { paciente: Paciente; evaluaciones: Evaluacion[]; seguimientos: Seguimiento[]; examenes: (ExamenDetalle & { evaluacionId: number | null })[]; citas: Omit<Cita, 'paciente' | 'empresa' | 'sede' | 'telefono'>[] }

export function Historial() {
  const { id } = useParams();
  const { datos, error, recargar } = useApi<Historial>(`/pacientes/${id}/historial`);
  const empresas = useEmpresas();
  const [modal, setModal] = useState<'editar' | 'examen' | 'cita' | 'evaluacion' | 'seguimiento' | null>(null);
  const [accionSeg, setAccionSeg] = useState<{ tipo: 'cerrar' | 'reprogramar'; s: Seguimiento } | null>(null);

  if (error) return <div className="aviso error">{error}</div>;
  if (!datos) return <div className="cargando">Cargando historial…</div>;
  const p = datos.paciente;
  const empresa = empresas.find((e) => e.id === p.empresaId)?.nombre;
  const sueltos = datos.examenes.filter((e) => !e.evaluacionId);
  const hoy = new Date().toISOString().slice(0, 10);
  const cerrar = () => setModal(null);
  const listo = () => { setModal(null); recargar(); };

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to="/pacientes">← Pacientes</Link></p>
      <Encabezado titulo={p.nombre} sub={<>{formatearRut(p.rut)} · {empresa} {p.cargo ? `· ${p.cargo}` : ''}</>}>
        <button className="btn" onClick={() => setModal('editar')}>Editar datos</button>
        <button className="btn" onClick={() => setModal('cita')}>Agendar cita</button>
        <button className="btn" onClick={() => setModal('examen')}>+ Examen suelto</button>
        <button className="btn primario" onClick={() => setModal('evaluacion')}>+ Nueva evaluación</button>
      </Encabezado>

      <div className="grilla">
        <section className="tarjeta">
          <h2>Evaluaciones ocupacionales</h2>
          <p className="sub">Cada evaluación es una batería de exámenes que termina en una aptitud con vigencia</p>
          {!datos.evaluaciones.length && <p className="vacio">Sin evaluaciones. Cree una con "Nueva evaluación".</p>}
          <div className="grilla" style={{ gap: 10 }}>
            {datos.evaluaciones.map((ev) => <TarjetaEvaluacion key={ev.id} evaluacionId={ev.id} onCambio={recargar} />)}
          </div>
        </section>

        <section className="tarjeta">
          <h2>Seguimientos</h2>
          <p className="sub">Derivaciones, recontroles y no aptos temporales</p>
          {!datos.seguimientos.length && <p className="vacio">Sin seguimientos</p>}
          {datos.seguimientos.length > 0 && (
            <div className="tabla-wrap">
              <table>
                <thead><tr><th>Tipo</th><th>Motivo</th><th>Fecha compromiso</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {datos.seguimientos.map((s) => {
                    const conVencido = { ...s, vencido: s.estado === 'abierto' && !!s.fechaCompromiso && s.fechaCompromiso < hoy };
                    return (
                      <tr key={s.id}>
                        <td>{TIPO_SEGUIMIENTO_LABEL[s.tipo]}</td>
                        <td>{s.motivo}{s.cierre && <div style={{ fontSize: '0.8rem', color: 'var(--texto-3)' }}>Cierre: {s.cierre}</div>}</td>
                        <td>{s.fechaCompromiso ? fecha(s.fechaCompromiso) : '—'}</td>
                        <td><ChipSeguimiento s={conVencido} /></td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {s.estado === 'abierto' && <button className="btn chico" onClick={() => setAccionSeg({ tipo: 'cerrar', s })}>Cerrar</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn chico" style={{ marginTop: 10 }} onClick={() => setModal('seguimiento')}>+ Nuevo seguimiento</button>
        </section>

        <section className="tarjeta">
          <h2>Exámenes sueltos</h2>
          <p className="sub">{sueltos.length} registros fuera de una evaluación · observaciones clínicas cifradas</p>
          {!sueltos.length && <p className="vacio">Sin exámenes sueltos</p>}
          <div className="grilla" style={{ gap: 10 }}>
            {sueltos.map((e) => (
              <article key={e.id} style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{TIPO_EXAMEN_LABEL[e.tipo]}</strong>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="chip">{ESTADO_EXAMEN_LABEL[e.estado]}</span>
                    {e.resultado && <span className="chip info">{RESULTADO_LABEL[e.resultado]}</span>}
                    <ChipNivel nivel={e.nivelHallazgo} />
                  </span>
                </div>
                <div style={{ color: 'var(--texto-3)', fontSize: '0.85rem' }}>{fecha(e.fecha)}</div>
                {e.observaciones && <p style={{ margin: '8px 0 0' }}>{e.observaciones}</p>}
                {e.archivos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {e.archivos.map((a) => (
                      <button key={a.id} className="btn chico" onClick={() => api.descargar(`/archivos/${a.id}/descarga`, a.nombre)}>
                        📎 {a.nombre} <span style={{ color: 'var(--texto-3)' }}>{tamano(a.tamano)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="tarjeta">
          <h2>Citas</h2>
          <p className="sub">{datos.citas.length} citas</p>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Hora</th><th>Examen</th><th>Estado</th></tr></thead>
              <tbody>
                {datos.citas.map((c) => (
                  <tr key={c.id}>
                    <td>{fecha(new Date(c.fechaHora).toLocaleDateString('sv'))}</td>
                    <td>{hora(c.fechaHora)}</td>
                    <td>{TIPO_EXAMEN_LABEL[c.tipoExamen]}</td>
                    <td>{ESTADO_CITA_LABEL[c.estado]}</td>
                  </tr>
                ))}
                {!datos.citas.length && <tr><td colSpan={4} className="vacio">Sin citas</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modal === 'editar' && <FormPaciente inicial={p} onCerrar={cerrar} onGuardado={listo} />}
      {modal === 'examen' && <FormExamen paciente={p} onCerrar={cerrar} onGuardado={listo} />}
      {modal === 'cita' && <FormCita paciente={p} onCerrar={cerrar} onGuardado={listo} />}
      {modal === 'evaluacion' && <EvaluacionNueva paciente={p} onCerrar={cerrar} onGuardado={listo} />}
      {modal === 'seguimiento' && <FormSeguimiento paciente={p} onCerrar={cerrar} onGuardado={listo} />}
      {accionSeg && <FormAccion {...accionSeg} onCerrar={() => setAccionSeg(null)} onGuardado={() => { setAccionSeg(null); recargar(); }} />}
    </>
  );
}

/** Sugiere primero los protocolos que exige el cargo del trabajador. */
function EvaluacionNueva({ paciente, onCerrar, onGuardado }: { paciente: Paciente; onCerrar(): void; onGuardado(): void }) {
  const cargos = useApi<Cargo[]>(`/cargos?empresaId=${paciente.empresaId}`).datos;
  const sugeridos = cargos?.find((c) => c.id === paciente.cargoId)?.protocoloIds ?? [];
  if (!cargos) return null;
  return <FormEvaluacion pacienteId={paciente.id} protocolosSugeridos={sugeridos} onCerrar={onCerrar} onGuardado={onGuardado} />;
}
