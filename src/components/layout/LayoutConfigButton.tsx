/**
 * Layout configuration for the 1+3 view: pick the arrangement (big-left vs
 * big-top) and assign a view to each of the four panels. Shown as an icon in
 * the top bar center, opening a small popup.
 */

import { useEffect, useRef, useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { VIEW_KEYS, type ViewKey } from '@/types/dicom';

function GridIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="10" height="18" rx="1" strokeWidth={1.6} />
      <rect x="15" y="3" width="6" height="5.5" rx="1" strokeWidth={1.6} />
      <rect x="15" y="9.25" width="6" height="5.5" rx="1" strokeWidth={1.6} />
      <rect x="15" y="15.5" width="6" height="5.5" rx="1" strokeWidth={1.6} />
    </svg>
  );
}

const VIEW_LABEL: Record<ViewKey, string> = {
  AXIAL: 'view.axial',
  SAGITTAL: 'view.sagittal',
  CORONAL: 'view.coronal',
  '3D': 'view.3d',
};

export function LayoutConfigButton() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const { big, small, arrangement } = state.panel;

  const setSmall = (i: number, key: ViewKey) => {
    const next = [...small] as [ViewKey, ViewKey, ViewKey];
    next[i] = key;
    dispatch({ type: 'SET_PANEL', payload: { small: next } });
  };

  const SelectRow = ({ label, value, onChange }: { label: string; value: ViewKey; onChange: (k: ViewKey) => void }) => (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ViewKey)}
        className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 px-1.5 py-1"
      >
        {VIEW_KEYS.map((k) => (
          <option key={k} value={k}>{t(VIEW_LABEL[k])}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('layout.configure')}
        className={`h-7 px-1.5 flex items-center rounded transition-colors ${
          open
            ? 'bg-dental-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        }`}
      >
        <GridIcon />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-9 z-50 w-56 bg-white border border-gray-300 rounded-lg shadow-xl p-3 space-y-3 dark:bg-gray-800 dark:border-gray-600">
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t('layout.arrangement')}</span>
            <div className="flex gap-1">
              {(['left', 'top'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => dispatch({ type: 'SET_PANEL', payload: { arrangement: a } })}
                  className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                    arrangement === a
                      ? 'bg-dental-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {t(a === 'left' ? 'layout.arrangeLeft' : 'layout.arrangeTop')}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <SelectRow label={t('layout.big')} value={big} onChange={(k) => dispatch({ type: 'SET_PANEL', payload: { big: k } })} />
            <SelectRow label={`${t('layout.small')} 1`} value={small[0]} onChange={(k) => setSmall(0, k)} />
            <SelectRow label={`${t('layout.small')} 2`} value={small[1]} onChange={(k) => setSmall(1, k)} />
            <SelectRow label={`${t('layout.small')} 3`} value={small[2]} onChange={(k) => setSmall(2, k)} />
          </div>
        </div>
      )}
    </div>
  );
}
