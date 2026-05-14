import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import {
  getPalette,
  getSystemMode,
  readStoredPref,
  resolveMode,
  saveThemePref,
  type ThemeColors,
  type ThemeMode,
  type ThemePref,
  type ThemeSurface,
} from '../theme';

export type ThemeContextValue = {
  pref: ThemePref;
  mode: ThemeMode;
  colors: ThemeColors;
  surface: ThemeSurface;
  setPref: (pref: ThemePref) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initialPref = readStoredPref();
  const [pref, setPrefState] = useState<ThemePref>(initialPref);
  const [mode, setMode] = useState<ThemeMode>(() => resolveMode(initialPref));

  useEffect(() => {
    if (pref !== 'system') {
      setMode(pref);
      return;
    }
    setMode(getSystemMode());
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setMode(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, [pref]);

  const setPref = useCallback(async (next: ThemePref) => {
    setPrefState(next);
    await saveThemePref(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const palette = getPalette(mode);
    return {
      pref,
      mode,
      colors: palette.colors,
      surface: palette.surface,
      setPref,
    };
  }, [pref, mode, setPref]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function useThemedStyles<T>(
  factory: (theme: ThemeContextValue) => T
): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme.mode, factory]);
}
