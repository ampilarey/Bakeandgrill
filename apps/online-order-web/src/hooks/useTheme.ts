import { useEffect, useState } from 'react';

/**
 * Dark / light theme for the order app. Persists to localStorage `theme`
 * and sets `document.documentElement.dataset.theme` (same contract as the
 * former Layout-local state).
 */
export function useTheme() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : '';
    try {
      localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    } catch {
      /* private mode / quota */
    }
  }, [darkMode]);

  const toggleTheme = () => setDarkMode((d) => !d);

  return { darkMode, setDarkMode, toggleTheme };
}
