import { useCallback, useLayoutEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tcgplayer-theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

function readStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return readStoredTheme() ?? getSystemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/**
 * Keeps a user-selected color theme on the document root. The first visit
 * follows the OS setting; only an explicit toggle is persisted.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setExplicitTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // A blocked storage area should not prevent a local theme change.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light';

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // A blocked storage area should not prevent a local theme change.
      }

      return nextTheme;
    });
  }, []);

  return { setTheme: setExplicitTheme, theme, toggleTheme };
}
