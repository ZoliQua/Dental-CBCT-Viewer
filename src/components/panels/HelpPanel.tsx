/**
 * Help panel (slides in from the right): detailed description of every part
 * of the application.
 */

import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { SidePanel } from './SidePanel';

const SECTIONS = [
  ['help.loadTitle', 'help.loadBody'],
  ['help.panelsTitle', 'help.panelsBody'],
  ['help.toolsTitle', 'help.toolsBody'],
  ['help.layoutsTitle', 'help.layoutsBody'],
  ['help.panoramicTitle', 'help.panoramicBody'],
  ['help.crossTitle', 'help.crossBody'],
  ['help.implantTitle', 'help.implantBody'],
  ['help.layersTitle', 'help.layersBody'],
  ['help.view3dTitle', 'help.view3dBody'],
  ['help.exportTitle', 'help.exportBody'],
  ['help.shortcutsTitle', 'help.shortcutsBody'],
] as const;

export function HelpPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  return (
    <SidePanel
      open={state.activePanel === 'help'}
      title={t('help.title')}
      onClose={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: null })}
      closeTitle={t('layers.close')}
    >
      <div className="space-y-4">
        {SECTIONS.map(([titleKey, bodyKey]) => (
          <section key={titleKey}>
            <h3 className="text-xs font-bold text-dental-600 dark:text-dental-400 mb-1 select-none">
              {t(titleKey)}
            </h3>
            <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
              {t(bodyKey)}
            </p>
          </section>
        ))}
      </div>
    </SidePanel>
  );
}
