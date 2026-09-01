/**
 * Small line-icon set for the marketing landing cards. Keyed by name so the
 * data-driven FeatureGrid can pick one per item without importing SVGs inline.
 */
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  code: <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3m8-6l3 3-3 3M13 5l-2 14" />,
  shield: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  printer: <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V4h12v5M6 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-1M8 14h8v6H8z" />,
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 13h6M9 17h6" />,
  tooth: <path strokeLinecap="round" strokeLinejoin="round" d="M7 3c2 0 2.5 1.5 5 1.5S15 3 17 3s4 2 4 6c0 3-1 4-1.5 7s-1 5-2.5 5-1.5-4-3-4-1.5 4-3 4-2-2-2.5-5S3 12 3 9c0-4 2-6 4-6z" />,
  cube: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 3v18M4 7.5l8 4.5 8-4.5" />,
  grid: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  wave: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c3 0 3-5 6-5s3 10 6 10 3-5 6-5" />,
  ruler: <path strokeLinecap="round" strokeLinejoin="round" d="M4 14l6-10 10 6-6 10zM8 8l1.5 1M11 6.5l1.5 1M6 11.5l1.5 1" />,
  layers: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />,
  bone: <path strokeLinecap="round" strokeLinejoin="round" d="M7 17a2.2 2.2 0 11-2-2 2.2 2.2 0 11 2-2l8-8a2.2 2.2 0 112-2 2.2 2.2 0 112 2 2.2 2.2 0 11-2 2l-8 8z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  contrast: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none" />
    </>
  ),
  opacity: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 6 6 10a6 6 0 11-12 0c0-4 6-10 6-10z" />,
  plane: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7-4 11 4-7 4zM3 8v8l7 4M17 12v8l-7 -4" />,
  crop: <path strokeLinecap="round" strokeLinejoin="round" d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2" />,
  check: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4 10-10" />,
};

export function LandingIcon({ name, className = 'w-6 h-6' }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      {PATHS[name] ?? PATHS.check}
    </svg>
  );
}
