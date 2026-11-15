import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TIPO_EXAMEN_LABEL } from '@naspeclinic/shared';
import { api } from '../api';
import type { Cita, ExamenDetalle, Paciente } from '../tipos';
import { ChipNivel, Encabezado, useApi, useEmpresas } from '../util';
import { ESTADO_CITA_LABEL, ESTADO_EXAMEN_LABEL, RESULTADO_LABEL, fecha, formatearRut, hora, tamano } from '../formato';
import { FormPaciente } from './Pacientes';
import { FormExamen } from './Examenes';
import { FormCita } from './Agenda';

interface Historial { paciente: Paciente; examenes: ExamenDetalle[]; citas: Omit<Cita, 'paciente' | 'empresa' | 'sede' | 'telefono'>[] }

export function Historial() {
  const { id } = useParams();
  const { datos, error, recargar } = useApi<Historial>(`/pacientes/${id}/historial`);
  const empresas = useEmpresas();
  const [modal, setModal] = useState<'editar' | 'examen' | 'cita' | null>(null);

  if (error) return <div className="aviso error">{error}</div>;
  if (!datos) return <div className="cargando">Cargando historial…</div>;
  const p = datos.paciente;
  const empresa = empresas.find((e) => e.id === p.empresaId)?.nombre;
  const cerrar = () => setModal(null);
  const listo = () => { setModal(null); recargar(); };

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to="/pacientes">← Pacientes</Link></p>
      <Encabezado titulo={p.nombre} sub={<>{formatearRut(p.rut)} · {empresa} {p.cargo ? `· ${p.cargo}` : ''}</>}>
        <button className="btn" onClick={() => setModal('editar')}>Editar datos</button>
        <button className="btn" onClick={() => setModal('cita')}>Agendar cita</button>
        <button className="btn primario" onClick={() => setModal('examen')}>+ Registrar examen</button>
      </Encabezado>

      <div className="grilla">
        <section className="tarjeta">
          <h2>Exámenes</h2>
          <p className="sub">{datos.examenes.length} registros · observaciones clínicas cifradas</p>
          {!datos.examenes.length && <p className="vacio">Sin exámenes registrados</p>}
          <div className="grilla" style={{ gap: 10 }}>
            {datos.examenes.map((e) => (
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
    </>
  );
}
