/**
 * Dark/light theme. Dark is the default (medical viewer). The `dark` class is
 * applied to the viewer's own root element (not <html>) so an embedded viewer
 * never flips the host page's theme; Tailwind's class-based dark mode still
 * matches because the root is an ancestor of every viewer element.
 *
 * A host can own the theme instead (the `theme` prop — e.g. a native app
 * following the system appearance): it then wins over the stored choice,
 * follows the prop live, and the in-viewer toggles are hidden (`controlled`).
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'rdcv-theme';

export type Theme = 'dark' | 'light';

interface ThemeValue {
  theme: Theme;
  toggleTheme: () => void;
  /** True when the host passed `theme` — the viewer should not offer its own toggle. */
  controlled: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function initialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ theme: hostTheme, children }: { theme?: Theme; children: ReactNode }) {
  const [stored, setTheme] = useState<Theme>(initialTheme);
  const controlled = hostTheme === 'dark' || hostTheme === 'light';
  const theme = controlled ? hostTheme : stored;

  // Only the viewer's own choice is remembered; a host-driven theme is the
  // host's to persist, and must not overwrite what the web app had stored.
  useEffect(() => {
    if (!controlled) localStorage.setItem(STORAGE_KEY, stored);
  }, [stored, controlled]);

  const toggleTheme = useCallback(() => {
    if (controlled) return;
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  }, [controlled]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, controlled }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
