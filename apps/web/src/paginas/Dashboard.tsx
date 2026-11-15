import { useState } from 'react';
import { qs } from '../api';
import { useSesion } from '../sesion';
import type { Kpis } from '../tipos';
import { Encabezado, useApi, useEmpresas } from '../util';
import { clp, isoLocal, mesCorto, mesLargo, num, pct } from '../formato';
import { BarrasHorizontales, BarrasVerticales, LineaTemporal } from '../componentes/Graficos';

const RANGOS = [
  { meses: 3, texto: '3 meses' },
  { meses: 6, texto: '6 meses' },
  { meses: 12, texto: '12 meses' },
];

export function Dashboard() {
  const { usuario } = useSesion();
  const esAdmin = usuario!.rol === 'admin';
  const empresas = useEmpresas(esAdmin);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [meses, setMeses] = useState(6);

  const hoy = new Date();
  const desde = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1));
  const { datos, error } = useApi<Kpis>(`/dashboard${qs({ empresaId: esAdmin ? empresaId : undefined, desde, hasta: isoLocal(hoy) })}`);

  const nombreEmpresa = esAdmin ? (empresas.find((e) => String(e.id) === empresaId)?.nombre ?? 'Todas las empresas') : usuario!.empresa;
  const k = datos?.kpis;

  return (
    <>
      <Encabezado titulo="Dashboard" sub={`${nombreEmpresa} · desde ${mesLargo(desde.slice(0, 7))}, actualizado en tiempo real`}>
        {esAdmin && (
          <label className="campo">
            <span className="sr">Empresa</span>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              <option value="">Todas las empresas</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
        <div className="segmentado" role="group" aria-label="Período">
          {RANGOS.map((r) => (
            <button key={r.meses} className={meses === r.meses ? 'activo' : ''} onClick={() => setMeses(r.meses)}>{r.texto}</button>
          ))}
        </div>
      </Encabezado>

      {error && <div className="aviso error">{error}</div>}
      {!datos && !error && <div className="cargando">Cargando indicadores…</div>}

      {datos && k && (
        <div className="grilla">
          <div className="grilla g-kpi">
            <Kpi etq="Dotación examinada" valor={num(k.dotacionExaminada)} detalle={k.dotacionTotal ? `de ${num(k.dotacionTotal)} trabajadores` : 'sin dotación declarada'} />
            <Kpi etq="Cobertura" valor={pct(k.cobertura)} detalle="meta: 80% o más" estado={k.cobertura !== null && k.cobertura < 80 ? 'mal' : 'bien'} />
            <Kpi etq="Ausentismo a citas" valor={pct(k.ausentismo)} detalle="citas sin asistencia" estado={k.ausentismo !== null && k.ausentismo > 10 ? 'mal' : 'bien'} />
            <Kpi etq="Hallazgos clínicos" valor={num(k.hallazgos.total)} detalle={`${k.hallazgos.criticos} críticos · ${k.hallazgos.moderados} moderados`} />
            <Kpi etq="Atenciones" valor={num(k.atenciones)} detalle="exámenes en el período" />
            <Kpi etq="ROI estimado" valor={pct(k.roi.porcentaje)} detalle={`${clp(k.roi.costoEvitadoEstimado)} en costos evitados`} />
          </div>

          <div className="grilla g-2">
            <section className="tarjeta">
              <h2>Atenciones por mes</h2>
              <p className="sub">Exámenes realizados cada mes</p>
              <BarrasVerticales nombre="Atenciones" datos={datos.tendenciaMensual.map((t) => ({
                etiqueta: mesCorto(t.mes), valor: t.atenciones, detalle: <div>{t.hallazgos} con hallazgos</div>,
              }))} />
            </section>
            <section className="tarjeta">
              <h2>Ausentismo mensual</h2>
              <p className="sub">% de citas agendadas a las que el trabajador no asistió</p>
              <LineaTemporal nombre="Ausentismo" formato={(v) => `${v}%`}
                datos={datos.tendenciaMensual.map((t) => ({ etiqueta: mesCorto(t.mes), valor: t.ausentismo }))} />
            </section>
          </div>

          <div className="grilla g-2">
            <section className="tarjeta">
              <h2>Atenciones por especialidad</h2>
              <p className="sub">Total del período y cuántas tuvieron hallazgos</p>
              {datos.porEspecialidad.length ? (
                <BarrasHorizontales nombre="Atenciones" datos={datos.porEspecialidad.map((e) => ({
                  etiqueta: e.etiqueta, valor: e.total, detalle: `${e.hallazgos} hallazgos`,
                }))} />
              ) : <p className="vacio">Sin atenciones en el período</p>}
            </section>
            <section className="tarjeta">
              <h2>Alertas clínicas</h2>
              <p className="sub">Hallazgos que requieren seguimiento</p>
              {datos.alertas.length ? (
                <ul className="lista-alertas">
                  {datos.alertas.map((a) => (
                    <li key={`${a.tipo}-${a.nivel}`}>
                      <span>{a.etiqueta}</span>
                      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span className={`chip ${a.nivel}`}><span aria-hidden>{a.nivel === 'critico' ? '▲' : '●'}</span>{a.nivel === 'critico' ? 'Crítico' : 'Moderado'}</span>
                        <strong style={{ minWidth: 28, textAlign: 'right' }}>{a.total}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="vacio">Sin alertas en el período</p>}
            </section>
          </div>

          <section className="tarjeta">
            <h2>Recomendaciones</h2>
            <p className="sub">Generadas a partir de los indicadores del período</p>
            <ul className="recomendaciones">{datos.recomendaciones.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>

          <details className="tarjeta">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver datos mensuales en tabla</summary>
            <div className="tabla-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Mes</th><th className="num">Atenciones</th><th className="num">Con hallazgos</th><th className="num">Ausentismo</th></tr></thead>
                <tbody>
                  {datos.tendenciaMensual.map((t) => (
                    <tr key={t.mes}><td>{mesLargo(t.mes)}</td><td className="num">{t.atenciones}</td><td className="num">{t.hallazgos}</td><td className="num">{pct(t.ausentismo)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </>
  );
}

function Kpi({ etq, valor, detalle, estado }: { etq: string; valor: string; detalle: string; estado?: 'bien' | 'mal' }) {
  return (
    <div className="tarjeta kpi">
      <div className="etq">{etq}</div>
      <div className="valor">{valor}</div>
      <div className="detalle">
        {estado === 'mal' && <span style={{ color: 'var(--serio-texto)', fontWeight: 600 }}>▲ Fuera de meta · </span>}
        {detalle}
      </div>
    </div>
  );
}
