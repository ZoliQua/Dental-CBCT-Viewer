/**
 * The "Views" centerpiece: alternating screenshot + description rows. Images are
 * our own captures of the running app with the sample volume (public/shots/).
 */
import { useI18n } from '@/i18n/I18nContext';

const VIEWS = [
  { img: '/shots/view-3d.jpg', tk: 'landing.view3dt', dk: 'landing.view3dd' },
  { img: '/shots/view-panoramic.jpg', tk: 'landing.viewPanot', dk: 'landing.viewPanod' },
  { img: '/shots/view-2d.jpg', tk: 'landing.view2dt', dk: 'landing.view2dd' },
];

export function ViewsShowcase() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      {VIEWS.map((v, i) => (
        <div key={v.img} className="grid md:grid-cols-2 gap-5 items-center">
          <div
            className={`rounded-2xl overflow-hidden border border-gray-200/70 dark:border-gray-700/60 shadow-lg bg-black ${
              i % 2 ? 'md:order-2' : ''
            }`}
          >
            <img src={v.img} alt={t(v.tk)} loading="lazy" className="w-full h-auto object-cover" />
          </div>
          <div className={i % 2 ? 'md:order-1' : ''}>
            <h4 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-1">{t(v.tk)}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{t(v.dk)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
