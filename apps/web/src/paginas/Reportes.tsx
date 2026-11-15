import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { useSesion } from '../sesion';
import type { Kpis } from '../tipos';
import { Encabezado, mensajeError, useApi, useEmpresas } from '../util';
import { clp, mesLargo, num, pct } from '../formato';

type Reporte = Kpis & { empresa: { id: number; nombre: string }; periodo: string };

function mesAnterior() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Reportes() {
  const { usuario } = useSesion();
  const esAdmin = usuario!.rol === 'admin';
  const empresas = useEmpresas(esAdmin);
  const [empresaId, setEmpresaId] = useState<number | null>(usuario!.empresaId);
  const [periodo, setPeriodo] = useState(mesAnterior());
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (esAdmin && !empresaId && empresas.length) setEmpresaId(empresas[0].id); }, [esAdmin, empresaId, empresas]);
  const { datos, error } = useApi<Reporte>(empresaId ? `/reportes/${empresaId}${qs({ periodo })}` : null);
  const k = datos?.kpis;

  async function pdf() {
    setOcupado(true); setEstado(null);
    try { await api.descargar(`/reportes/${empresaId}/pdf${qs({ periodo })}`, `reporte-${periodo}.pdf`); }
    catch (e) { setEstado({ tipo: 'error', texto: mensajeError(e) }); }
    setOcupado(false);
  }
  async function enviar() {
    setOcupado(true); setEstado(null);
    try {
      const r = await api.post<{ para: string; simulado: boolean }>(`/reportes/${empresaId}/enviar${qs({ periodo })}`);
      setEstado({ tipo: 'ok', texto: r.simulado ? `Envío simulado a ${r.para} (falta configurar el correo en el servidor)` : `Reporte enviado a ${r.para}` });
    } catch (e) { setEstado({ tipo: 'error', texto: mensajeError(e) }); }
    setOcupado(false);
  }

  return (
    <>
      <Encabezado titulo="Reporte gerencial" sub={datos ? `${datos.empresa.nombre} · ${mesLargo(periodo)}` : 'Reporte ejecutivo mensual por empresa'}>
        <button className="btn" disabled={!datos || ocupado} onClick={pdf}>⬇ Descargar PDF</button>
        {esAdmin && <button className="btn primario" disabled={!datos || ocupado} onClick={enviar}>✉ Enviar al gerente</button>}
      </Encabezado>
      <div className="filtros">
        {esAdmin && (
          <label className="campo">Empresa
            <select value={empresaId ?? ''} onChange={(e) => setEmpresaId(Number(e.target.value))}>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="campo">Período<input type="month" value={periodo} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setPeriodo(e.target.value)} /></label>
      </div>
      {estado && <div className={`aviso ${estado.tipo}`} role="status" style={{ marginBottom: 12 }}>{estado.texto}</div>}
      {error && <div className="aviso error">{error}</div>}
      {!datos && !error && <div className="cargando">Generando reporte…</div>}

      {datos && k && (
        <div className="grilla">
          <section className="tarjeta">
            <h2>Indicadores del período</h2>
            <p className="sub">Resumen ejecutivo para la gerencia</p>
            <div className="tabla-wrap">
              <table>
                <tbody>
                  <tr><td>Dotación examinada</td><td className="num"><strong>{num(k.dotacionExaminada)}</strong> de {num(k.dotacionTotal)}</td></tr>
                  <tr><td>Cobertura</td><td className="num"><strong>{pct(k.cobertura)}</strong></td></tr>
                  <tr><td>Ausentismo a citas</td><td className="num"><strong>{pct(k.ausentismo)}</strong></td></tr>
                  <tr><td>Atenciones</td><td className="num"><strong>{num(k.atenciones)}</strong></td></tr>
                  <tr><td>Hallazgos</td><td className="num"><strong>{k.hallazgos.total}</strong> ({k.hallazgos.criticos} críticos, {k.hallazgos.moderados} moderados)</td></tr>
                  <tr><td>Costo del programa</td><td className="num">{clp(k.roi.costoPrograma)}</td></tr>
                  <tr><td>Costos evitados estimados</td><td className="num">{clp(k.roi.costoEvitadoEstimado)}</td></tr>
                  <tr><td>ROI estimado</td><td className="num"><strong>{pct(k.roi.porcentaje)}</strong></td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <div className="grilla g-2">
            <section className="tarjeta">
              <h2>Alertas clínicas</h2>
              <p className="sub">Por especialidad y nivel</p>
              {datos.alertas.length ? (
                <ul className="lista-alertas">
                  {datos.alertas.map((a) => (
                    <li key={`${a.tipo}-${a.nivel}`}>
                      <span>{a.etiqueta}</span>
                      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span className={`chip ${a.nivel}`}><span aria-hidden>{a.nivel === 'critico' ? '▲' : '●'}</span>{a.nivel === 'critico' ? 'Crítico' : 'Moderado'}</span>
                        <strong>{a.total}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="vacio">Sin alertas en el período</p>}
            </section>
            <section className="tarjeta">
              <h2>Recomendaciones</h2>
              <p className="sub">Acciones sugeridas para el próximo período</p>
              <ul className="recomendaciones">{datos.recomendaciones.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
