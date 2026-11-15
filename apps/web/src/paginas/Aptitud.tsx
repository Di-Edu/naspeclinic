import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ESTADOS_VIGENCIA, ESTADO_VIGENCIA_LABEL, DIAS_POR_VENCER, type EstadoVigencia } from '@naspeclinic/shared';
import { api, qs } from '../api';
import { useSesion } from '../sesion';
import type { FilaAptitud, Protocolo, ResumenAptitud } from '../tipos';
import { Encabezado, Paginacion, mensajeError, useApi, useEmpresas, type Pagina } from '../util';
import { RESULTADO_LABEL, fecha, formatearRut, num } from '../formato';
import { FormEvaluacion } from './Evaluaciones';

const CLASE_ESTADO: Record<EstadoVigencia, string> = {
  vigente: 'bueno', por_vencer: 'moderado', vencido: 'critico', no_apto: 'critico', sin_evaluacion: '',
};
const ICONO_ESTADO: Record<EstadoVigencia, string> = { vigente: '●', por_vencer: '◆', vencido: '▲', no_apto: '✕', sin_evaluacion: '○' };

export function ChipVigencia({ estado, dias }: { estado: EstadoVigencia; dias?: number | null }) {
  const extra = estado === 'por_vencer' && dias !== null && dias !== undefined ? ` · ${dias} d`
    : estado === 'vencido' && dias !== null && dias !== undefined ? ` · hace ${-dias} d` : '';
  return <span className={`chip ${CLASE_ESTADO[estado]}`}><span aria-hidden>{ICONO_ESTADO[estado]}</span>{ESTADO_VIGENCIA_LABEL[estado]}{extra}</span>;
}

type Respuesta = Pagina<FilaAptitud> & { resumen: ResumenAptitud };

export function Aptitud() {
  const { usuario } = useSesion();
  const rol = usuario!.rol;
  const esInterno = rol !== 'gerente';
  const empresas = useEmpresas(esInterno);
  const protocolos = useApi<Protocolo[]>(esInterno ? '/protocolos' : null).datos ?? [];
  const [f, setF] = useState({ empresaId: '', estado: '', protocoloId: '', q: '' });
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nuevaEv, setNuevaEv] = useState<FilaAptitud | null>(null);

  useEffect(() => { const t = setTimeout(() => { setF((x) => ({ ...x, q: q.trim() })); setPagina(1); }, 250); return () => clearTimeout(t); }, [q]);
  const filtros = { ...f, empresaId: esInterno ? f.empresaId : undefined };
  const { datos, error, recargar } = useApi<Respuesta>(`/aptitud${qs({ ...filtros, pagina, porPagina: 50 })}`);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPagina(1); };
  const r = datos?.resumen;

  async function exportar() {
    try { await api.descargar(`/aptitud${qs({ ...filtros, formato: 'csv' })}`, 'aptitud-trabajadores.csv'); }
    catch (e) { setAviso({ ok: false, texto: mensajeError(e) }); }
  }
  async function notificar() {
    setAviso(null);
    try {
      const res = await api.post<{ enviado: boolean; para?: string; cantidad: number; simulado?: boolean; mensaje?: string }>('/aptitud/notificar', { empresaId: Number(f.empresaId) });
      setAviso({ ok: true, texto: res.enviado ? `Aviso de ${res.cantidad} vencimientos ${res.simulado ? 'simulado' : 'enviado'} a ${res.para}` : res.mensaje ?? 'Sin vencimientos' });
    } catch (e) { setAviso({ ok: false, texto: mensajeError(e) }); }
  }

  return (
    <>
      <Encabezado titulo="Aptitud y vencimientos" sub={rol === 'gerente'
        ? `Trabajadores de ${usuario!.empresa}: aptitud laboral y vigencia de cada protocolo. No incluye información médica.`
        : 'Situación de cada trabajador frente a los protocolos que exige su cargo'}>
        <button className="btn" onClick={exportar}>⬇ Exportar Excel (CSV)</button>
        {rol === 'admin' && (
          <button className="btn primario" disabled={!f.empresaId} title={f.empresaId ? '' : 'Elija una empresa'} onClick={notificar}>
            ✉ Avisar vencimientos a la empresa
          </button>
        )}
      </Encabezado>

      {r && (
        <div className="grilla g-kpi" style={{ marginBottom: 16 }}>
          <div className="tarjeta kpi">
            <div className="etq">Habilitados hoy</div>
            <div className="valor">{r.porcentajeHabilitados === null ? '—' : `${r.porcentajeHabilitados.toLocaleString('es-CL')}%`}</div>
            <div className="detalle">{num(r.habilitados)} de {num(r.trabajadores)} trabajadores con todo vigente</div>
          </div>
          {(['vencido', 'por_vencer', 'no_apto', 'sin_evaluacion'] as const).map((e) => (
            <button key={e} className="tarjeta kpi" style={{ textAlign: 'left', cursor: 'pointer', outline: f.estado === e ? '2px solid var(--marca-2)' : undefined }}
              onClick={() => { setF({ ...f, estado: f.estado === e ? '' : e }); setPagina(1); }}>
              <div className="etq">{ESTADO_VIGENCIA_LABEL[e]}</div>
              <div className="valor">{num(r.porEstado[e])}</div>
              <div className="detalle">{e === 'por_vencer' ? `en los próximos ${DIAS_POR_VENCER} días` : e === 'sin_evaluacion' ? 'protocolos nunca evaluados' : 'protocolos'}{f.estado === e ? ' · filtrando' : ''}</div>
            </button>
          ))}
        </div>
      )}

      <div className="filtros">
        <label className="campo ancho">Buscar<input placeholder="Nombre o RUT" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {esInterno && (
          <label className="campo">Empresa
            <select value={f.empresaId} onChange={set('empresaId')}>
              <option value="">Todas</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
        {esInterno && (
          <label className="campo">Protocolo
            <select value={f.protocoloId} onChange={set('protocoloId')}>
              <option value="">Todos</option>
              {protocolos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="campo">Estado
          <select value={f.estado} onChange={set('estado')}>
            <option value="">Todos</option>
            {ESTADOS_VIGENCIA.map((e) => <option key={e} value={e}>{ESTADO_VIGENCIA_LABEL[e]}</option>)}
          </select>
        </label>
      </div>

      {aviso && <div className={`aviso ${aviso.ok ? 'ok' : 'error'}`} role="status" style={{ marginBottom: 12 }}>{aviso.texto}</div>}
      {error && <div className="aviso error">{error}</div>}

      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Trabajador</th><th>Cargo</th><th>Protocolo</th><th>Aptitud</th><th>Vigente hasta</th><th>Estado</th>
                {esInterno && <th />}
              </tr>
            </thead>
            <tbody>
              {datos?.items.map((x) => (
                <tr key={`${x.pacienteId}-${x.protocoloId}`}>
                  <td>
                    {esInterno ? <Link to={`/pacientes/${x.pacienteId}`}>{x.trabajador}</Link> : x.trabajador}
                    <div style={{ fontSize: '0.8rem', color: 'var(--texto-3)' }}>{formatearRut(x.rut)}{esInterno && !f.empresaId ? ` · ${x.empresa}` : ''}</div>
                  </td>
                  <td>{x.cargo}</td>
                  <td>{x.protocolo}</td>
                  <td>
                    {x.aptitud ? RESULTADO_LABEL[x.aptitud] : '—'}
                    {x.restricciones && <div style={{ fontSize: '0.8rem', color: 'var(--texto-2)' }}>{x.restricciones}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{x.vigenteHasta ? fecha(x.vigenteHasta) : '—'}</td>
                  <td>
                    <ChipVigencia estado={x.estado} dias={x.diasRestantes} />
                    {x.enCurso && <div style={{ fontSize: '0.8rem', color: 'var(--texto-3)', marginTop: 3 }}>Evaluación en curso</div>}
                  </td>
                  {esInterno && (
                    <td className="num">
                      {!x.enCurso && x.estado !== 'vigente' && <button className="btn chico" onClick={() => setNuevaEv(x)}>Nueva evaluación</button>}
                    </td>
                  )}
                </tr>
              ))}
              {datos && !datos.items.length && <tr><td colSpan={7} className="vacio">Sin trabajadores con estos filtros</td></tr>}
              {!datos && !error && <tr><td colSpan={7} className="vacio">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginacion datos={datos} onPagina={setPagina} />
      </div>
      {nuevaEv && (
        <FormEvaluacion pacienteId={nuevaEv.pacienteId} protocoloId={nuevaEv.protocoloId} titulo={`Nueva evaluación: ${nuevaEv.trabajador}`}
          onCerrar={() => setNuevaEv(null)} onGuardado={() => { setNuevaEv(null); recargar(); setAviso({ ok: true, texto: 'Evaluación creada con su batería de exámenes pendientes' }); }} />
      )}
    </>
  );
}
