/**
 * Small linked cards for the author's other dental software — shown in the
 * landing "About" box and the Settings "About & Credits" tab.
 */

interface Project {
  name: string;
  url: string;
  desc: string;
}

const PROJECTS: Project[] = [
  {
    name: 'React Advanced Odontogram',
    url: 'https://github.com/ZoliQua/React-Odontogram-Modul',
    desc: 'Interactive odontogram & periodontal charting for React — FHIR R4, ICDAS, 11 languages.',
  },
  {
    name: 'Dental CAD Designer',
    url: 'https://github.com/ZoliQua/Dental-CAD-Designer',
    desc: 'Design crowns, inlays/onlays & bridges from intraoral scans — React + Three.js.',
  },
];

export function OtherProjects() {
  return (
    <div className="grid sm:grid-cols-2 gap-2.5">
      {PROJECTS.map((p) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="group block rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 hover:border-dental-400 dark:hover:border-dental-500 hover:bg-white dark:hover:bg-gray-800 transition-colors p-3"
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold text-dental-600 dark:text-dental-400">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="truncate">{p.name}</span>
            <span className="ml-auto text-gray-400 group-hover:text-dental-500 transition-colors">↗</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-snug">{p.desc}</p>
        </a>
      ))}
    </div>
  );
}
