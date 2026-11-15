import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import type { ResultadoKpis } from './kpis';

const AZUL = '#0B4F6C';
const GRIS = '#5B6770';
const ROJO = '#C0392B';
const NARANJO = '#E67E22';

const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const p = (v: number | null) => (v === null ? 's/d' : `${v.toLocaleString('es-CL')}%`);

/** Genera el reporte gerencial en PDF y lo devuelve como Buffer. */
export function generarReportePdf(empresa: string, periodoTexto: string, r: ResultadoKpis): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Reporte ${empresa} ${periodoTexto}`, Author: 'Naspeclinic' } });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const ancho = doc.page.width - 100;

    // Encabezado
    doc.rect(0, 0, doc.page.width, 90).fill(AZUL);
    const logo = process.env.LOGO_PATH;
    if (logo && existsSync(logo)) doc.image(logo, 50, 20, { height: 50 });
    else doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Naspeclinic', 50, 28);
    doc.fillColor('white').font('Helvetica').fontSize(9).text('Salud Ocupacional para la Industria Minera', 50, 58);
    doc.font('Helvetica-Bold').fontSize(12).text('Reporte Ejecutivo', 50, 28, { width: ancho, align: 'right' });
    doc.font('Helvetica').fontSize(10).text(periodoTexto, 50, 46, { width: ancho, align: 'right' });

    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(16).text(empresa, 50, 110);
    doc.moveDown(0.8);

    // Tarjetas de KPI
    const k = r.kpis;
    const tarjetas: [string, string][] = [
      ['Dotación examinada', `${k.dotacionExaminada} / ${k.dotacionTotal || 's/d'}`],
      ['Cobertura', p(k.cobertura)],
      ['Ausentismo', p(k.ausentismo)],
      ['Hallazgos', `${k.hallazgos.total} (${k.hallazgos.criticos} críticos)`],
      ['ROI estimado', p(k.roi.porcentaje)],
      ['Habilitados hoy', r.aptitud.trabajadores ? `${p(r.aptitud.porcentajeHabilitados)} (${r.aptitud.habilitados} de ${r.aptitud.trabajadores})` : 's/d'],
    ];
    const w = (ancho - 20) / 3;
    let y = doc.y;
    tarjetas.forEach(([t, v], i) => {
      const x = 50 + (i % 3) * (w + 10);
      const yy = y + Math.floor(i / 3) * 62;
      doc.roundedRect(x, yy, w, 52, 6).fillAndStroke('#F2F6F8', '#D5DEE3');
      doc.fillColor(GRIS).font('Helvetica').fontSize(8).text(t.toUpperCase(), x + 10, yy + 9, { width: w - 20 });
      doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(14).text(v, x + 10, yy + 24, { width: w - 20 });
    });
    y += 135;

    // Tendencia mensual (barras)
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(12).text('Atenciones y hallazgos por mes', 50, y);
    y += 30;
    const t = r.tendenciaMensual;
    if (t.length) {
      const alto = 95;
      const max = Math.max(...t.map((m) => m.atenciones), 1);
      const bw = Math.min(40, (ancho - 20) / t.length - 10);
      t.forEach((m, i) => {
        const x = 60 + i * (bw + 10);
        const ha = (m.atenciones / max) * alto;
        const hh = (m.hallazgos / max) * alto;
        doc.rect(x, y + alto - ha, bw, ha).fill('#8FB8CC');
        doc.rect(x, y + alto - hh, bw, hh).fill(NARANJO);
        doc.fillColor(GRIS).font('Helvetica').fontSize(7).text(m.mes, x - 5, y + alto + 4, { width: bw + 10, align: 'center' });
        doc.text(String(m.atenciones), x, y + alto - ha - 10, { width: bw, align: 'center' });
      });
      doc.moveTo(55, y + alto).lineTo(50 + ancho, y + alto).strokeColor('#D5DEE3').stroke();
      const ly = y + alto + 20;
      doc.rect(55, ly, 8, 8).fill('#8FB8CC');
      doc.fillColor(GRIS).fontSize(8).text('Atenciones', 67, ly);
      doc.rect(125, ly, 8, 8).fill(NARANJO);
      doc.fillColor(GRIS).text('Hallazgos', 137, ly);
      y += alto + 42;
    } else {
      doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Sin atenciones en el período.', 50, y);
      y += 25;
    }

    // Distribución por especialidad
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(12).text('Atenciones por especialidad', 50, y);
    y += 18;
    for (const e of r.porEspecialidad) {
      doc.fillColor('black').font('Helvetica').fontSize(10).text(e.etiqueta, 60, y, { width: 200 });
      doc.text(`${e.total} atenciones`, 260, y, { width: 120 });
      doc.fillColor(e.hallazgos ? NARANJO : GRIS).text(`${e.hallazgos} con hallazgos`, 380, y);
      y += 16;
    }
    y += 10;

    // Alertas: críticas a la izquierda, moderadas a la derecha
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(12).text('Alertas clínicas', 50, y);
    y += 18;
    if (!r.alertas.length) {
      doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Sin alertas en el período.', 60, y);
      y += 16;
    } else {
      const columnas = [
        { nivel: 'critico', titulo: 'CRÍTICAS', color: ROJO, x: 60 },
        { nivel: 'moderado', titulo: 'MODERADAS', color: NARANJO, x: 60 + ancho / 2 },
      ] as const;
      let maxY = y;
      for (const c of columnas) {
        let yy = y;
        doc.fillColor(c.color).font('Helvetica-Bold').fontSize(9).text(c.titulo, c.x, yy);
        yy += 14;
        const items = r.alertas.filter((a) => a.nivel === c.nivel);
        if (!items.length) { doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Sin casos', c.x, yy); yy += 15; }
        for (const a of items) {
          doc.fillColor('black').font('Helvetica').fontSize(10).text(`${a.etiqueta}: ${a.total} caso(s)`, c.x, yy);
          yy += 15;
        }
        maxY = Math.max(maxY, yy);
      }
      y = maxY;
    }

    // Recomendaciones
    if (y > doc.page.height - 130) { doc.addPage(); y = 50; }
    y += 10;
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(12).text('Recomendaciones del período', 50, y);
    doc.moveDown(0.4);
    doc.fillColor('black').font('Helvetica').fontSize(10);
    for (const rec of r.recomendaciones) doc.text(`•  ${rec}`, 60, doc.y, { width: ancho - 10 }).moveDown(0.3);

    doc.moveDown(1).fillColor(GRIS).fontSize(7).text(
      `ROI estimado con parámetros referenciales: costo evitado ${clp(k.roi.parametros.costoEvitadoCritico)} por hallazgo crítico y ` +
      `${clp(k.roi.parametros.costoEvitadoModerado)} por moderado, costo de ${clp(k.roi.parametros.costoPorExamen)} por examen. ` +
      'Documento confidencial con datos agregados; no contiene información clínica individual (Ley 19.628).',
      50, doc.y, { width: ancho },
    );
    doc.end();
  });
}
