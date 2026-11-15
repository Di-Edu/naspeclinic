import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

// Gráficos SVG livianos (sin librerías). Una sola serie por gráfico, un solo eje,
// marcas delgadas con extremos redondeados, grilla tenue y tooltip al pasar el mouse.
// El SVG se dibuja al ancho real del contenedor para que el texto no se escale.

function useAncho(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function escalaBonita(max: number, pasos = 4) {
  if (max <= 0) return { tope: pasos, ticks: Array.from({ length: pasos + 1 }, (_, i) => i) };
  const bruto = max / pasos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto)!;
  const tope = Math.ceil(max / paso) * paso;
  return { tope, ticks: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

/** Barra con esquinas superiores redondeadas (4px) y base recta sobre el eje. */
function barraV(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
function barraH(x: number, y: number, w: number, h: number, r = 4) {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

interface Tip { x: number; y: number; contenido: ReactNode }
function Tooltip({ tip, W }: { tip: Tip | null; W: number }) {
  if (!tip) return null;
  return <div className="tooltip" style={{ left: `${(tip.x / W) * 100}%`, top: tip.y }}>{tip.contenido}</div>;
}

export interface PuntoSerie { etiqueta: string; valor: number | null; detalle?: ReactNode }

export function BarrasVerticales({ datos, alto = 220, formato = String, nombre }: {
  datos: PuntoSerie[]; alto?: number; formato?: (v: number) => string; nombre: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [ref, W] = useAncho();
  const m = { t: 12, r: 8, b: 26, l: 36 };
  const { tope, ticks } = escalaBonita(Math.max(0, ...datos.map((d) => d.valor ?? 0)));
  const iw = W - m.l - m.r, ih = alto - m.t - m.b;
  const banda = iw / Math.max(datos.length, 1);
  const bw = Math.min(44, banda * 0.6);
  const y = (v: number) => m.t + ih - (v / tope) * ih;

  return (
    <div className="grafico" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={nombre}>
        {ticks.map((t) => (
          <g key={t}>
            {t > 0 && <line className="grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />}
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{formato(t)}</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const cx = m.l + banda * i + banda / 2;
          const v = d.valor ?? 0;
          const activo = tip && Math.abs(tip.x - cx) < 1;
          return (
            <g key={d.etiqueta}>
              <path d={barraV(cx - bw / 2, y(v), bw, ih + m.t - y(v))} fill="var(--serie-1)" opacity={tip && !activo ? 0.55 : 1} />
              <text x={cx} y={alto - 8} textAnchor="middle">{d.etiqueta}</text>
              <rect x={cx - banda / 2} y={m.t} width={banda} height={ih} fill="transparent"
                onMouseEnter={() => setTip({ x: cx, y: y(v), contenido: <><b>{d.etiqueta}</b>{formato(v)} {nombre.toLowerCase()}{d.detalle}</> })} />
            </g>
          );
        })}
        <line className="base" x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} />
      </svg>
      <Tooltip tip={tip} W={W} />
    </div>
  );
}

export function LineaTemporal({ datos, alto = 220, formato = String, nombre }: {
  datos: PuntoSerie[]; alto?: number; formato?: (v: number) => string; nombre: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [ref, W] = useAncho();
  const m = { t: 12, r: 16, b: 26, l: 40 };
  const { tope, ticks } = escalaBonita(Math.max(1, ...datos.map((d) => d.valor ?? 0)));
  const iw = W - m.l - m.r, ih = alto - m.t - m.b;
  const x = (i: number) => m.l + (datos.length <= 1 ? iw / 2 : (iw * i) / (datos.length - 1));
  const y = (v: number) => m.t + ih - (v / tope) * ih;
  const pts = datos.map((d, i) => (d.valor === null ? null : [x(i), y(d.valor)] as const));
  const camino = pts.reduce((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]}` : acc), '');
  const iTip = tip ? datos.findIndex((_, i) => Math.abs(x(i) - tip.x) < 1) : -1;

  return (
    <div className="grafico" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={nombre}>
        {ticks.map((t) => (
          <g key={t}>
            {t > 0 && <line className="grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />}
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{formato(t)}</text>
          </g>
        ))}
        <line className="base" x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} />
        {iTip >= 0 && <line x1={x(iTip)} x2={x(iTip)} y1={m.t} y2={m.t + ih} stroke="var(--eje)" strokeDasharray="3 3" />}
        <path d={camino} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => p && (
          <circle key={i} cx={p[0]} cy={p[1]} r={iTip === i ? 5.5 : 4} fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth={2} />
        ))}
        {datos.map((d, i) => {
          const banda = iw / Math.max(datos.length - 1, 1);
          return (
            <g key={d.etiqueta}>
              <text x={x(i)} y={alto - 8} textAnchor="middle">{d.etiqueta}</text>
              <rect x={x(i) - banda / 2} y={m.t} width={banda} height={ih} fill="transparent"
                onMouseEnter={() => setTip({ x: x(i), y: d.valor === null ? m.t + ih : y(d.valor), contenido: <><b>{d.etiqueta}</b>{d.valor === null ? 'Sin citas' : `${formato(d.valor)} ${nombre.toLowerCase()}`}</> })} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} W={W} />
    </div>
  );
}

export function BarrasHorizontales({ datos, nombre }: {
  datos: { etiqueta: string; valor: number; detalle?: string }[]; nombre: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [ref, W] = useAncho();
  const fila = 34, alto = Math.max(fila * datos.length + 8, 60);
  const m = { l: 150, r: 110 };
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const iw = W - m.l - m.r;
  return (
    <div className="grafico" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={nombre}>
        {datos.map((d, i) => {
          const y0 = 4 + i * fila;
          const w = (d.valor / max) * iw;
          return (
            <g key={d.etiqueta}>
              <text x={m.l - 10} y={y0 + fila / 2 + 4} textAnchor="end" style={{ fill: 'var(--texto-2)', fontSize: 12 }}>{d.etiqueta}</text>
              <path d={barraH(m.l, y0 + 7, w, fila - 14)} fill="var(--serie-1)" />
              <text x={m.l + w + 8} y={y0 + fila / 2 + 4} style={{ fill: 'var(--texto)', fontSize: 12 }}>
                {d.valor}{d.detalle ? <tspan style={{ fill: 'var(--texto-3)' }}> · {d.detalle}</tspan> : null}
              </text>
              <rect x={0} y={y0} width={W} height={fila} fill="transparent"
                onMouseEnter={() => setTip({ x: m.l + w / 2, y: y0 + 6, contenido: <><b>{d.etiqueta}</b>{d.valor} {nombre.toLowerCase()}{d.detalle ? ` · ${d.detalle}` : ''}</> })} />
            </g>
          );
        })}
        <line className="base" x1={m.l} x2={m.l} y1={0} y2={alto} />
      </svg>
      <Tooltip tip={tip} W={W} />
    </div>
  );
}
