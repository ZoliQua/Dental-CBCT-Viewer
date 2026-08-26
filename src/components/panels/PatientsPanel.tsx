/**
 * Patients panel (slides in from the right): read-only info about the loaded
 * study on top, then the editable patient fields that appear in the PDF report.
 */

import { useViewer, type ReportFields } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { SidePanel } from './SidePanel';
import { formatDicomDate } from '@/utils/dicomUtils';

const FIELD =
  'w-full bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 text-xs rounded-md px-2 py-1.5 border outline-none focus:border-dental-500';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-medium text-right truncate">{value}</span>
    </div>
  );
}

export function PatientsPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  const study = state.study;
  const series = study?.series.find((s) => s.seriesInstanceUID === state.activeSeriesUID) ?? study?.series[0];
  const setReport = (p: Partial<ReportFields>) => dispatch({ type: 'SET_REPORT', payload: p });

  return (
    <SidePanel
      open={state.activePanel === 'patients'}
      title={t('topbar.patients')}
      onClose={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: null })}
      closeTitle={t('layers.close')}
    >
      <div className="space-y-5">
        {/* Loaded study */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('patients.fileInfo')}
          </div>
          {study ? (
            <div className="space-y-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60 p-2.5">
              <InfoRow label={t('report.patientName')} value={study.patientName || '—'} />
              {study.patientBirthDate && <InfoRow label={t('report.birthDate')} value={formatDicomDate(study.patientBirthDate)} />}
              <InfoRow label={t('settings.studyDate')} value={study.studyDate ? formatDicomDate(study.studyDate) : '—'} />
              {study.institution && <InfoRow label={t('settings.clinic')} value={study.institution} />}
              {series && <InfoRow label={t('viewport.slices')} value={String(series.imageCount ?? series.imageIds?.length ?? '—')} />}
              {series && <InfoRow label="Modality" value={series.modality || '—'} />}
              {series?.seriesDescription && <InfoRow label="Series" value={series.seriesDescription} />}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('patients.noStudy')}</p>
          )}
        </div>

        {/* Editable patient data (appears in the PDF) */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('patients.patientData')}
          </div>
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t('settings.help.patient')}</p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('report.patientName')}</span>
            <input className={FIELD} value={state.report.patientName} onChange={(e) => setReport({ patientName: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('report.birthDate')}</span>
            <input type="date" className={FIELD} value={state.report.patientBirthDate} onChange={(e) => setReport({ patientBirthDate: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('report.quoteNumber')}</span>
            <input className={FIELD} value={state.report.quoteNumber} onChange={(e) => setReport({ quoteNumber: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('report.status')}</span>
            <textarea rows={2} className={`${FIELD} resize-none`} value={state.report.statusDescription} onChange={(e) => setReport({ statusDescription: e.target.value })} />
          </label>
        </div>
      </div>
    </SidePanel>
  );
}
