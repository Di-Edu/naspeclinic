import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ESTADOS_CITA, TIPOS_EXAMEN, TIPO_EXAMEN_LABEL, type EstadoCita } from '@naspeclinic/shared';
import { api, qs } from '../api';
import type { Cita, Paciente } from '../tipos';
import { Encabezado, Modal, mensajeError, useApi, useSedes } from '../util';
import { ESTADO_CITA_LABEL, diaLargo, hora, isoLocal } from '../formato';
import { SelectorPaciente } from '../componentes/SelectorPaciente';

const COLOR_ESTADO: Record<EstadoCita, string> = { pendiente: 'info', confirmada: 'bueno', cancelada: '', ausente: 'moderado' };

function inicioSemana(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // lunes
  return x;
}

export function Agenda() {
  const sedes = useSedes();
  const [vista, setVista] = useState<'dia' | 'semana'>('dia');
  const [dia, setDia] = useState(() => new Date());
  const [sedeId, setSedeId] = useState('');
  const [estado, setEstado] = useState('');
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const ini = vista === 'dia' ? new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()) : inicioSemana(dia);
  const fin = new Date(ini); fin.setDate(fin.getDate() + (vista === 'dia' ? 1 : 7)); fin.setMilliseconds(-1);
  const { datos, error, recargar } = useApi<Cita[]>(`/citas${qs({ sedeId, estado, desde: ini.toISOString(), hasta: fin.toISOString() })}`);

  const mover = (n: number) => { const d = new Date(dia); d.setDate(d.getDate() + n * (vista === 'dia' ? 1 : 7)); setDia(d); };

  const porDia = new Map<string, Cita[]>();
  for (const c of datos ?? []) {
    const k = isoLocal(new Date(c.fechaHora));
    porDia.set(k, [...(porDia.get(k) ?? []), c]);
  }
  const dias = vista === 'dia' ? [ini] : Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });

  async function cambiarEstado(c: Cita, nuevo: EstadoCita) {
    try {
      await api.patch(`/citas/${c.id}`, { estado: nuevo });
      setAviso(`Cita de ${c.paciente} marcada como "${ESTADO_CITA_LABEL[nuevo]}"`);
      recargar();
    } catch (e) { setAviso(mensajeError(e)); }
  }

  const titulo = vista === 'dia'
    ? diaLargo(ini)
    : `Semana del ${ini.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`;

  return (
    <>
      <Encabezado titulo="Agenda de citas" sub={titulo}>
        <button className="btn primario" onClick={() => setNueva(true)}>+ Nueva cita</button>
      </Encabezado>
      <div className="filtros">
        <div className="segmentado" role="group" aria-label="Vista">
          <button className={vista === 'dia' ? 'activo' : ''} onClick={() => setVista('dia')}>Día</button>
          <button className={vista === 'semana' ? 'activo' : ''} onClick={() => setVista('semana')}>Semana</button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={() => mover(-1)} aria-label="Anterior">‹</button>
          <button className="btn" onClick={() => setDia(new Date())}>Hoy</button>
          <button className="btn" onClick={() => mover(1)} aria-label="Siguiente">›</button>
        </div>
        <label className="campo">Sede
          <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            <option value="">Todas</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS_CITA.map((s) => <option key={s} value={s}>{ESTADO_CITA_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      {aviso && <div className="aviso ok" style={{ marginBottom: 12 }} role="status">{aviso}</div>}
      {error && <div className="aviso error">{error}</div>}
      {!datos && !error && <div className="cargando">Cargando agenda…</div>}
      {datos && dias.map((d) => {
        const citas = porDia.get(isoLocal(d)) ?? [];
        if (vista === 'semana' && !citas.length) return null;
        return (
          <section key={d.toISOString()} className="agenda-dia">
            {vista === 'semana' && <h3>{diaLargo(d)} · {citas.length} {citas.length === 1 ? 'cita' : 'citas'}</h3>}
            {!citas.length && <div className="tarjeta vacio">No hay citas para este día</div>}
            {citas.map((c) => (
              <div key={c.id} className="cita" style={c.estado === 'cancelada' ? { opacity: 0.6 } : undefined}>
                <div className="hora">{hora(c.fechaHora)}</div>
                <div>
                  <div className="quien"><Link to={`/pacientes/${c.pacienteId}`}>{c.paciente}</Link></div>
                  <div className="meta">{TIPO_EXAMEN_LABEL[c.tipoExamen]} · {c.empresa} · Sede {c.sede}{c.telefono ? ` · ${c.telefono}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`chip ${COLOR_ESTADO[c.estado]}`}>{ESTADO_CITA_LABEL[c.estado]}</span>
                  <select aria-label={`Cambiar estado de la cita de ${c.paciente}`} value={c.estado} onChange={(e) => cambiarEstado(c, e.target.value as EstadoCita)}>
                    {ESTADOS_CITA.map((s) => <option key={s} value={s}>{ESTADO_CITA_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </section>
        );
      })}
      {datos && vista === 'semana' && !datos.length && <div className="tarjeta vacio">No hay citas esta semana</div>}
      {nueva && <FormCita fechaInicial={dia} onCerrar={() => setNueva(false)} onGuardado={() => { setNueva(false); recargar(); setAviso('Cita creada'); }} />}
    </>
  );
}

export function FormCita({ paciente, fechaInicial, onCerrar, onGuardado }: {
  paciente?: Paciente; fechaInicial?: Date; onCerrar(): void; onGuardado(): void;
}) {
  const sedes = useSedes();
  const [p, setP] = useState<Paciente | null>(paciente ?? null);
  const [f, setF] = useState({
    fecha: isoLocal(fechaInicial ?? new Date()), hora: '09:00', sedeId: '', tipoExamen: 'broncopulmonar', estado: 'pendiente', notas: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p) return setError('Seleccione un paciente');
    setEnviando(true); setError(null);
    try {
      await api.post('/citas', {
        pacienteId: p.id, sedeId: Number(f.sedeId), tipoExamen: f.tipoExamen, estado: f.estado,
        fechaHora: new Date(`${f.fecha}T${f.hora}`).toISOString(), notas: f.notas || null,
      });
      onGuardado();
    } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo="Nueva cita" onCerrar={onCerrar}>
      <form className="form" onSubmit={guardar}>
        {paciente ? null : <SelectorPaciente valor={p} onCambio={setP} />}
        <div className="fila">
          <label className="campo">Fecha<input type="date" required value={f.fecha} onChange={set('fecha')} /></label>
          <label className="campo">Hora<input type="time" required step={900} value={f.hora} onChange={set('hora')} /></label>
        </div>
        <div className="fila">
          <label className="campo">Sede
            <select required value={f.sedeId} onChange={set('sedeId')}>
              <option value="">Seleccione…</option>
              {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="campo">Examen
            <select value={f.tipoExamen} onChange={set('tipoExamen')}>
              {TIPOS_EXAMEN.map((t) => <option key={t} value={t}>{TIPO_EXAMEN_LABEL[t]}</option>)}
            </select>
          </label>
        </div>
        <label className="campo">Estado
          <select value={f.estado} onChange={set('estado')}>
            {ESTADOS_CITA.filter((s) => s !== 'ausente').map((s) => <option key={s} value={s}>{ESTADO_CITA_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="campo">Notas<textarea rows={2} value={f.notas} onChange={set('notas')} /></label>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--texto-3)' }}>El paciente recibirá la confirmación por correo cuando se active el envío de notificaciones.</p>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Agendar'}</button>
        </div>
      </form>
    </Modal>
  );
}
