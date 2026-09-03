/**
 * "Save PDF" modal: choose which header fields and report sections to include,
 * which of the current layout's views to embed (and the on-image info burned
 * onto them), and the page orientation / views-grid columns. Builds the report
 * via exportPlanPdf. The Hungarian-capable Roboto font is embedded by the export.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { exportPlanPdf } from '@/core/viewerExports';
import type { PdfConfig } from '@/core/pdfExport';
import type { OverlayContent } from '@/core/viewCapture';

interface ViewInfo { key: string; title: string; }

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-dental-500 w-3.5 h-3.5" />
      {label}
    </label>
  );
}

export function PdfExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useViewer();
  const { t, lang } = useI18n();
  const { theme } = useTheme();

  const views: ViewInfo[] = useMemo(() => {
    if (!open) return [];
    return (Array.from(document.querySelectorAll('[data-vp]')) as HTMLElement[]).map((el) => ({
      key: el.getAttribute('data-vp') || '',
      title: el.getAttribute('data-vp-title') || el.getAttribute('data-vp') || '',
    }));
  }, [open]);

  const [header, setHeader] = useState({ patientName: true, studyDate: true, birth: true, age: true, quote: true, status: true, clinic: true });
  const [sections, setSections] = useState({ views: true, implants: true, measurements: true, safety: true, boneQuality: true, disclaimer: true });
  const [landscape, setLandscape] = useState(false);
  const [viewsCols, setViewsCols] = useState(2);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [content, setContent] = useState<OverlayContent>({
    name: false, birth: false, date: false, clinic: false, series: false, modality: false,
    viewTitle: true, orientation: true, slice: true,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected(Object.fromEntries(views.map((v) => [v.key, true])));
  }, [open, views]);

  if (!open) return null;

  const setH = (p: Partial<typeof header>) => setHeader((h) => ({ ...h, ...p }));
  const setS = (p: Partial<typeof sections>) => setSections((s) => ({ ...s, ...p }));
  const setC = (p: Partial<OverlayContent>) => setContent((c) => ({ ...c, ...p }));

  const doExport = async () => {
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const config: Partial<PdfConfig> = {
        ...header,
        ...sections,
        landscape,
        viewsCols,
        selectedViews: sections.views ? Object.entries(selected).filter(([, v]) => v).map(([k]) => k) : [],
        overlays: content,
      };
      await exportPlanPdf(state, t, lang, config);
      onClose();
    } catch (e) {
      console.error('[pdf export] failed', e);
    } finally {
      setBusy(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
      {children}
    </div>
  );
  const seg = 'px-3 py-1 text-xs rounded-md border transition-colors';
  const segOn = 'border-dental-500 bg-dental-600 text-white';
  const segOff = 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';

  return createPortal(
    <div className={`dcv-root ${theme === 'dark' ? 'dark' : ''} fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4`} onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{t('pdfexport.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        <Section title={t('pdfexport.fields')}>
          <div className="grid grid-cols-2 gap-1.5">
            <Check label={t('report.patientName')} checked={header.patientName} onChange={(v) => setH({ patientName: v })} />
            <Check label={t('settings.studyDate')} checked={header.studyDate} onChange={(v) => setH({ studyDate: v })} />
            <Check label={t('report.birthDate')} checked={header.birth} onChange={(v) => setH({ birth: v })} />
            <Check label={t('report.patientAge')} checked={header.age} onChange={(v) => setH({ age: v })} />
            <Check label={t('report.quoteNumber')} checked={header.quote} onChange={(v) => setH({ quote: v })} />
            <Check label={t('report.status')} checked={header.status} onChange={(v) => setH({ status: v })} />
            <Check label={t('settings.clinic')} checked={header.clinic} onChange={(v) => setH({ clinic: v })} />
          </div>
        </Section>

        <Section title={t('pdfexport.sections')}>
          <div className="grid grid-cols-2 gap-1.5">
            <Check label={t('pdf.viewsTitle')} checked={sections.views} onChange={(v) => setS({ views: v })} />
            <Check label={t('pdf.implantsTitle')} checked={sections.implants} onChange={(v) => setS({ implants: v })} />
            <Check label={t('pdf.measurementsTitle')} checked={sections.measurements} onChange={(v) => setS({ measurements: v })} />
            <Check label={t('pdf.safetyTitle')} checked={sections.safety} onChange={(v) => setS({ safety: v })} />
            <Check label={t('bone.title')} checked={sections.boneQuality} onChange={(v) => setS({ boneQuality: v })} />
            <Check label={t('pdfexport.disclaimer')} checked={sections.disclaimer} onChange={(v) => setS({ disclaimer: v })} />
          </div>
        </Section>

        {sections.views && views.length > 0 && (
          <>
            <Section title={t('imgexport.views')}>
              <div className="grid grid-cols-2 gap-1.5">
                {views.map((v) => (
                  <Check key={v.key} label={v.title} checked={!!selected[v.key]} onChange={(on) => setSelected((s) => ({ ...s, [v.key]: on }))} />
                ))}
              </div>
            </Section>

            <Section title={t('imgexport.content')}>
              <div className="grid grid-cols-2 gap-1.5">
                <Check label={t('report.patientName')} checked={content.name} onChange={(v) => setC({ name: v })} />
                <Check label={t('report.birthDate')} checked={content.birth} onChange={(v) => setC({ birth: v })} />
                <Check label={t('settings.studyDate')} checked={content.date} onChange={(v) => setC({ date: v })} />
                <Check label={t('settings.clinic')} checked={content.clinic} onChange={(v) => setC({ clinic: v })} />
                <Check label={t('imgexport.cSeries')} checked={content.series} onChange={(v) => setC({ series: v })} />
                <Check label={t('imgexport.cModality')} checked={content.modality} onChange={(v) => setC({ modality: v })} />
                <Check label={t('imgexport.cViewTitle')} checked={content.viewTitle} onChange={(v) => setC({ viewTitle: v })} />
                <Check label={t('imgexport.cOrientation')} checked={content.orientation} onChange={(v) => setC({ orientation: v })} />
                <Check label={t('imgexport.cSlice')} checked={content.slice} onChange={(v) => setC({ slice: v })} />
              </div>
            </Section>
          </>
        )}

        <Section title={t('pdfexport.page')}>
          <div className="flex items-center gap-2 flex-wrap">
            <button className={`${seg} ${!landscape ? segOn : segOff}`} onClick={() => setLandscape(false)}>{t('pdfexport.portrait')}</button>
            <button className={`${seg} ${landscape ? segOn : segOff}`} onClick={() => setLandscape(true)}>{t('pdfexport.landscape')}</button>
            {sections.views && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[11px] text-slate-500">{t('imgexport.columns')}</span>
                <input type="number" min={1} max={3} value={viewsCols} onChange={(e) => setViewsCols(Math.max(1, Math.min(3, Number(e.target.value))))} className="w-12 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 px-2 py-1" />
              </div>
            )}
          </div>
        </Section>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">{t('common.cancel')}</button>
          <button onClick={doExport} disabled={busy} className="px-4 py-2 text-xs font-semibold rounded-lg bg-dental-600 text-white hover:bg-dental-700 disabled:opacity-50">
            {busy ? '…' : t('pdfexport.export')}
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('.dcv-root') ?? document.body,
  );
}
