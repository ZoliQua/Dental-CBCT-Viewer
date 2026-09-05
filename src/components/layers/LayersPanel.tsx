/**
 * Layers list content (implants, anatomy, scans, measurements) with 4 actions
 * per row: show/hide · edit (popup) · delete · rename. Rendered inside the
 * unified LeftPanel; the edit popup itself lives in LeftPanel.
 */

import { useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { setAnnotationVisible, removeAnnotationByUid } from '@/core/annotationLayer';
import { removeScanPolyData, scanTriangleSoupWorld } from '@/core/scanMesh';
import { suggestImplantFromMesh } from '@/core/toothSetup';
import { SCAN_TYPES, SCAN_DEFAULTS, type ScanType, type ImplantData } from '@/types/dicom';

// ── Tiny inline icons ──────────────────────────────────────────

function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" />}
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export function StackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconButton({
  title, onClick, disabled = false, danger = false, children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        w-6 h-6 flex items-center justify-center rounded transition-colors
        ${disabled
          ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
          : danger
            ? 'text-gray-500 hover:text-white hover:bg-red-700 dark:text-gray-400'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-600'}
      `}
    >
      {children}
    </button>
  );
}

// ── Generic layer row ──────────────────────────────────────────

interface LayerRowProps {
  name: string;
  visible: boolean;
  active?: boolean;
  onToggleVisible: () => void;
  onEdit?: () => void;       // undefined → disabled
  onDelete?: () => void;     // undefined → disabled
  onRename?: (name: string) => void;
  onSelect?: () => void;
}

function LayerRow({ name, visible, active = false, onToggleVisible, onEdit, onDelete, onRename, onSelect }: LayerRowProps) {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  const commitRename = () => {
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename?.(trimmed);
  };

  return (
    <div
      className={`
        flex items-center gap-1 px-2 py-1.5 rounded border
        ${active
          ? 'border-dental-500 bg-gray-200/80 dark:bg-gray-700/60'
          : 'border-transparent hover:bg-gray-200/50 dark:hover:bg-gray-700/40'}
      `}
      onClick={onSelect}
    >
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setDraft(name); setRenaming(false); }
          }}
          className="flex-1 min-w-0 bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-200 text-xs rounded px-1 py-0.5 border border-dental-500 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`flex-1 min-w-0 truncate text-xs select-none ${visible ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 line-through'}`}>
          {name}
        </span>
      )}

      <IconButton title={visible ? t('layers.hide') : t('layers.show')} onClick={onToggleVisible}>
        <EyeIcon off={!visible} />
      </IconButton>
      <IconButton title={t('layers.edit')} onClick={onEdit} disabled={!onEdit}>
        <SlidersIcon />
      </IconButton>
      <IconButton title={t('layers.delete')} onClick={onDelete} disabled={!onDelete} danger>
        <TrashIcon />
      </IconButton>
      <IconButton
        title={t('layers.rename')}
        onClick={onRename ? () => { setDraft(name); setRenaming(true); } : undefined}
        disabled={!onRename}
      >
        <PencilIcon />
      </IconButton>
    </div>
  );
}

// ── Layers list content (rendered inside LeftPanel) ────────────

export function LayersContent() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  // Prosthetically-driven planning: derive a suggested implant from a
  // tooth-setup (wax-up) mesh — its long axis is the ideal screw axis.
  const planFromCrown = (sc: { id: string; transform: number[] }) => {
    const cps = state.archCurveControlPoints;
    if (!cps) { window.alert(t('crown.needArch')); return; }
    const soup = scanTriangleSoupWorld(sc.id, sc.transform);
    const s = soup && suggestImplantFromMesh(cps, soup);
    if (!s) { window.alert(t('crown.failed')); return; }
    const implant: ImplantData = {
      id: `imp_${Date.now()}`,
      name: t('implant.defaultName', { n: state.implants.length + 1 }),
      visible: true,
      position: s.position,
      diameter: 4.0,
      length: 10.0,
      angleBLDeg: s.angleBLDeg,
      angleMDDeg: s.angleMDDeg,
      systemId: state.defaultSystemId,
    };
    dispatch({ type: 'ADD_IMPLANT', payload: implant });
    dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: implant.id });
  };

  return (
    <div className="space-y-1">
          {/* Implant layers */}
          {state.implants.length > 0 && (
            <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1 pt-1 select-none">
              {t('layers.implants')}
            </div>
          )}
          {state.implants.map(imp => (
            <LayerRow
              key={imp.id}
              name={imp.name}
              visible={imp.visible}
              active={state.activeImplantId === imp.id}
              onSelect={() => dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id })}
              onToggleVisible={() => dispatch({ type: 'UPDATE_IMPLANT', payload: { ...imp, visible: !imp.visible } })}
              onEdit={() => {
                dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id });
                dispatch({ type: 'SET_EDITING_IMPLANT', payload: imp.id });
              }}
              onDelete={() => dispatch({ type: 'REMOVE_IMPLANT', payload: imp.id })}
              onRename={(name) => dispatch({ type: 'UPDATE_IMPLANT', payload: { ...imp, name } })}
            />
          ))}
          {state.implants.length === 0 && (
            <div className="text-xs text-gray-500 px-1 py-2 select-none">
              {t('layers.none')}
            </div>
          )}

          {/* Anatomy markers (nerve / sinus) */}
          {state.anatomy.length > 0 && (
            <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1 pt-2 select-none">
              {t('layers.anatomy')}
            </div>
          )}
          {state.anatomy.map(m => (
            <LayerRow
              key={m.id}
              name={`${m.name} · ${m.points.length}p`}
              visible={m.visible}
              active={state.activeAnatomyId === m.id}
              onSelect={() => dispatch({ type: 'SET_ACTIVE_ANATOMY', payload: m.id })}
              onToggleVisible={() => dispatch({ type: 'UPDATE_ANATOMY', payload: { ...m, visible: !m.visible } })}
              onDelete={() => dispatch({ type: 'REMOVE_ANATOMY', payload: m.id })}
              onRename={(name) => dispatch({ type: 'UPDATE_ANATOMY', payload: { ...m, name } })}
            />
          ))}

          {/* Imported scan meshes */}
          {state.scans.length > 0 && (
            <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1 pt-2 select-none">
              {t('layers.scans')}
            </div>
          )}
          {state.scans.map(sc => (
            <div key={sc.id} className="rounded border border-transparent px-1 pb-1">
              <LayerRow
                name={sc.name}
                visible={sc.visible}
                onToggleVisible={() => dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, visible: !sc.visible } })}
                onDelete={() => { removeScanPolyData(sc.id); dispatch({ type: 'REMOVE_SCAN', payload: sc.id }); }}
                onRename={(name) => dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, name } })}
              />
              <div className="flex items-center gap-2 px-2 pt-0.5">
                <select
                  value={sc.type}
                  onChange={(e) => {
                    const type = e.target.value as ScanType;
                    dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, type, color: SCAN_DEFAULTS[type].color } });
                  }}
                  className="flex-1 min-w-0 bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-[11px] rounded px-1 py-0.5 border"
                >
                  {SCAN_TYPES.map(ty => (
                    <option key={ty} value={ty}>{t(`scan.${ty}`)}</option>
                  ))}
                </select>
                <input
                  type="color"
                  value={sc.color}
                  onChange={(e) => dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, color: e.target.value } })}
                  className="h-5 w-6 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer"
                  title={t('safety.color')}
                />
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={sc.opacity}
                  onChange={(e) => dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, opacity: Number(e.target.value) } })}
                  className="w-14 h-1 accent-dental-400"
                  title={`${Math.round(sc.opacity * 100)}%`}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-1 ml-2">
                <button
                  onClick={() => {
                    dispatch({ type: 'SET_LAYOUT_MODE', payload: '2x2' });
                    dispatch({ type: 'START_REGISTRATION', payload: sc.id });
                  }}
                  className="px-2 py-0.5 text-[11px] rounded bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {t('reg.start')}
                </button>
                {sc.type === 'toothSetup' && (
                  <button
                    onClick={() => planFromCrown(sc)}
                    title={t('crown.planHint')}
                    className="px-2 py-0.5 text-[11px] rounded bg-dental-600 text-white hover:bg-dental-700 transition-colors"
                  >
                    {t('crown.plan')}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Measurement layers — one row per measurement */}
          {state.measurements.length > 0 && (
            <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1 pt-2 select-none">
              {t('layers.measurements')}
            </div>
          )}
          {state.measurements.map(m => (
            <div key={m.id}>
              <LayerRow
                name={m.value ? `${m.name} · ${m.value}` : m.name}
                visible={m.visible}
                onToggleVisible={() => {
                  const next = !m.visible;
                  if (m.kind === 'annotation') setAnnotationVisible(m.id, next);
                  dispatch({ type: 'UPDATE_MEASUREMENT', payload: { ...m, visible: next } });
                }}
                onDelete={() => {
                  if (m.kind === 'annotation') removeAnnotationByUid(m.id);
                  dispatch({ type: 'REMOVE_MEASUREMENT', payload: m.id });
                }}
                onRename={(name) => dispatch({ type: 'UPDATE_MEASUREMENT', payload: { ...m, name } })}
              />
              {m.visible && m.profile && m.profile.length > 1 && <Sparkline data={m.profile} />}
            </div>
          ))}
    </div>
  );
}

/** Tiny HU-profile chart for a line measurement (values along the line). */
function Sparkline({ data }: { data: number[] }) {
  const w = 180, h = 28;
  let min = Infinity, max = -Infinity;
  for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ');
  return (
    <div className="px-2 pb-1 -mt-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
        <polyline
          points={pts}
          fill="none"
          stroke="rgb(96,165,250)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="text-[9px] text-gray-500 leading-none">
        HU {Math.round(min)}–{Math.round(max)}
      </div>
    </div>
  );
}
