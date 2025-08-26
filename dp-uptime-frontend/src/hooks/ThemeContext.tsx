// src/hooks/ThemeContext.tsx
'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // initialise from localStorage or fallback to prefers-color-scheme or default to true
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const fromStorage = localStorage.getItem('theme');
      if (fromStorage) return fromStorage === 'dark';
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return true;
      }
    } catch (e) {}
    return true; // your default
  });

  // update <html> class whenever theme changes
  useEffect(() => {
    try {
      const el = typeof document !== 'undefined' ? document.documentElement : null;
      if (!el) return;
      if (isDark) {
        el.classList.add('dark');
        el.classList.remove('light');
      } else {
        el.classList.remove('dark');
        el.classList.add('light');
      }
      try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      } catch {}
    } catch (e) {
      // ignore
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((s) => !s);

  return <ThemeContext.Provider value={{ isDark, toggleTheme }}>{children}</ThemeContext.Provider>;
};
