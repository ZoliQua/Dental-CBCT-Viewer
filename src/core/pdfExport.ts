/**
 * PDF export: captures the panoramic and cross-section views (image canvas +
 * the implant / measurement overlays drawn on top, via html2canvas) into an A4
 * report with patient info, planned implants and measurements — all in the
 * current UI language.
 */

import { jsPDF } from 'jspdf';
import type { DicomStudyInfo, ImplantData, MeasurementLayer, AnatomyMarker } from '@/types/dicom';
import { getImplantSystem } from '@/types/dicom';
import { implantWorldAxis } from '@/core/implantGeometry';
import { evaluateImplant, type ImplantSeg } from '@/core/safety';
import type { ReportFields } from '@/context/ViewerContext';

/** Render an inline <svg> overlay to an Image at the given on-screen size. */
function svgToImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const str = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(str)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Composite a viewport's image canvas with its SVG overlays (implants,
 * sleeves, measurements) into one undistorted canvas at the image's own
 * aspect ratio. The overlays are drawn over the canvas content rect only
 * (the letterboxed area), so nothing is stretched — unlike html2canvas,
 * which ignores the canvas object-fit and squashes the image.
 */
async function captureView(view: HTMLElement): Promise<HTMLCanvasElement | null> {
  const bare = view.querySelector('canvas') as HTMLCanvasElement | null;
  if (!bare || !bare.width || !bare.height) return null;

  const W = bare.width;
  const H = bare.height;
  const CW = view.clientWidth;
  const CH = view.clientHeight;
  if (!CW || !CH) return null;

  // Content rect: where the image actually sits inside the container (object-fit: contain)
  const scale = Math.min(CW / W, CH / H);
  const rw = W * scale;
  const rh = H * scale;
  const left = (CW - rw) / 2;
  const top = (CH - rh) / 2;

  const SS = 2; // supersample so vector overlays stay crisp
  const out = document.createElement('canvas');
  out.width = W * SS;
  out.height = H * SS;
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(bare, 0, 0, out.width, out.height);

  // Map the on-screen content rect of each SVG overlay onto the full output
  for (const svg of Array.from(view.querySelectorAll('svg')) as SVGSVGElement[]) {
    const img = await svgToImage(svg, CW, CH);
    if (img) ctx.drawImage(img, left, top, rw, rh, 0, 0, out.width, out.height);
  }

  return out;
}

interface PdfExportOptions {
  t: (key: string, params?: Record<string, string | number>) => string;
  study: DicomStudyInfo | null;
  implants: ImplantData[];
  measurements: MeasurementLayer[];
  report?: ReportFields;
  anatomy?: AnatomyMarker[];
  archCurve?: [number, number][] | null;
  thresholds?: { nerve: number; sinus: number; neighbor: number };
  /** implant id → bone quality label (e.g. "D2 · 712 HU") */
  boneQuality?: Record<string, string>;
  lang: string;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const APP_VERSION = '0.1.0';
const APP_URL = 'github.com/ZoliQua/React-Dental-CBCT-Viewer';

export async function exportViewPdf({ t, study, implants, measurements, report, anatomy, archCurve, thresholds, boneQuality, lang }: PdfExportOptions): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const pageBreak = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Header
  doc.setFontSize(16);
  doc.text(t('app.title'), MARGIN, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(t('pdf.description'), MARGIN, y);
  y += 8;
  doc.setTextColor(0);

  // Meta
  doc.setFontSize(10);
  doc.text(`${t('pdf.date')}: ${new Date().toLocaleDateString(lang)}`, MARGIN, y);
  y += 5;
  // Editable report header fields take precedence over the DICOM tags
  const patientName = report?.patientName?.trim() || study?.patientName || '-';
  doc.text(`${t('pdf.patient')}: ${patientName}${study?.patientId ? ` (${study.patientId})` : ''}`, MARGIN, y);
  y += 5;
  if (report?.patientBirthDate?.trim()) {
    doc.text(`${t('report.birthDate')}: ${report.patientBirthDate.trim()}`, MARGIN, y);
    y += 5;
  }
  if (report?.patientAge?.trim()) {
    doc.text(`${t('pdf.age')}: ${report.patientAge.trim()}`, MARGIN, y);
    y += 5;
  }
  if (report?.quoteNumber?.trim()) {
    doc.text(`${t('pdf.quote')}: ${report.quoteNumber.trim()}`, MARGIN, y);
    y += 5;
  }
  if (report?.statusDescription?.trim()) {
    const lines = doc.splitTextToSize(`${t('pdf.status')}: ${report.statusDescription.trim()}`, PAGE_W - 2 * MARGIN);
    doc.text(lines, MARGIN, y);
    y += 5 * lines.length;
  }
  if (study?.institution) {
    doc.text(study.institution, MARGIN, y);
    y += 5;
  }
  y += 3;

  // Capture every viewport currently on screen (layout-agnostic) into a grid,
  // so the 3D view exports all four panes, the panoramic view its four, etc.
  const viewEls = Array.from(document.querySelectorAll('[data-vp]')) as HTMLElement[];
  const shots: { title: string; canvas: HTMLCanvasElement }[] = [];
  for (const v of viewEls) {
    let shot: HTMLCanvasElement | null = null;
    try { shot = await captureView(v); } catch { shot = null; }
    if (shot && shot.width && shot.height) {
      shots.push({ title: v.getAttribute('data-vp-title') || v.getAttribute('data-vp') || '', canvas: shot });
    }
  }
  if (shots.length > 0) {
    pageBreak(8);
    doc.setFontSize(12);
    doc.text(t('pdf.viewsTitle'), MARGIN, y);
    y += 5;
    const cols = shots.length === 1 ? 1 : 2;
    const gap = 4;
    const cellW = (PAGE_W - 2 * MARGIN - (cols - 1) * gap) / cols;
    let col = 0;
    let rowH = 0;
    let rowTop = y;
    for (const s of shots) {
      const cellH = (cellW * s.canvas.height) / s.canvas.width;
      if (col === 0) { pageBreak(cellH + 8); rowTop = y; }
      const x = MARGIN + col * (cellW + gap);
      doc.setFontSize(9);
      doc.text(s.title, x, rowTop);
      doc.addImage(s.canvas.toDataURL('image/png'), 'PNG', x, rowTop + 2, cellW, cellH);
      rowH = Math.max(rowH, cellH);
      col++;
      if (col >= cols) { col = 0; y = rowTop + rowH + 8; rowH = 0; }
    }
    if (col !== 0) { y = rowTop + rowH + 8; }
  }

  // Implants
  if (implants.length > 0) {
    pageBreak(12);
    doc.setFontSize(12);
    doc.text(t('pdf.implantsTitle'), MARGIN, y);
    y += 5.5;
    doc.setFontSize(9);
    for (const imp of implants) {
      pageBreak(5);
      const sys = getImplantSystem(imp.systemId);
      doc.text(
        `• ${imp.name} — ${sys.brand} ${sys.line}, Ø${imp.diameter} × ${imp.length} mm, B-L ${imp.angleBLDeg}°, M-D ${imp.angleMDDeg}°`,
        MARGIN + 2, y,
      );
      y += 4.5;
      const bq = boneQuality?.[imp.id];
      if (bq) {
        pageBreak(5);
        doc.setTextColor(110);
        doc.text(`   ${t('bone.title')}: ${bq}`, MARGIN + 2, y);
        doc.setTextColor(0);
        y += 4.5;
      }
      if (imp.guided?.enabled) {
        pageBreak(5);
        doc.setTextColor(110);
        doc.text(
          `   ${t('pdf.guidedLine', {
            sleeve: sys.sleeveDiameter,
            offset: imp.guided.sleeveOffset,
            drill: imp.guided.drillLength,
          })}`,
          MARGIN + 2, y,
        );
        doc.setTextColor(0);
        y += 4.5;
      }
    }
    y += 3;
  }

  // Measurements
  if (measurements.length > 0) {
    pageBreak(12);
    doc.setFontSize(12);
    doc.text(t('pdf.measurementsTitle'), MARGIN, y);
    y += 5.5;
    doc.setFontSize(9);
    for (const m of measurements) {
      pageBreak(5);
      doc.text(`• ${m.name}${m.value ? ` — ${m.value}` : ''}`, MARGIN + 2, y);
      y += 4.5;
    }
    y += 3;
  }

  // Safety summary (clearance of each implant to anatomy + neighbours)
  const vis = (anatomy ?? []).filter((a) => a.visible && a.points.length > 0);
  if (archCurve && implants.length > 0 && (vis.length > 0 || implants.length > 1)) {
    const thr = thresholds ?? { nerve: 2, sinus: 1, neighbor: 3 };
    const segs: ImplantSeg[] = implants.flatMap((i) => {
      const wa = implantWorldAxis(archCurve, i);
      return wa ? [{ id: i.id, entry: wa.entry, apex: wa.apex, radius: i.diameter / 2 }] : [];
    });
    pageBreak(12);
    doc.setFontSize(12);
    doc.text(t('pdf.safetyTitle'), MARGIN, y);
    y += 5.5;
    doc.setFontSize(9);
    for (const imp of implants) {
      const self = segs.find((s) => s.id === imp.id);
      if (!self) continue;
      const ev = evaluateImplant(self, segs, vis, thr);
      const parts = ev.anatomy.map((r) => {
        const name = vis.find((a) => a.id === r.id)?.name ?? '';
        return `${name} ${r.mm.toFixed(1)} mm ${r.ok ? 'OK' : '!'}`;
      });
      if (ev.neighborMm !== null) {
        parts.push(`${t('safety.neighbor')} ${ev.neighborMm.toFixed(1)} mm ${ev.neighborOk ? 'OK' : '!'}`);
      }
      pageBreak(5);
      const line = doc.splitTextToSize(`• ${imp.name}: ${parts.join(' · ')}`, PAGE_W - 2 * MARGIN - 2);
      doc.text(line, MARGIN + 2, y);
      y += 4.5 * line.length;
    }
  }

  // Disclaimer block (research-use-only) at the end of the content
  pageBreak(20);
  y += 2;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 4;
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  const discLines = doc.splitTextToSize(t('disclaimer.text'), PAGE_W - 2 * MARGIN);
  doc.text(discLines, MARGIN, y);
  doc.setTextColor(0);

  // Footer on every page: app name, version and contact URL
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(`${t('app.title')} v${APP_VERSION} · ${APP_URL}`, MARGIN, PAGE_H - 6);
    doc.text(`${i} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    doc.setTextColor(0);
  }

  doc.save(`dental_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
