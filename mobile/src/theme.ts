/**
 * Theme tokens — consumer mobile shell.
 *
 * Palette:
 * - `accent` / `accentSoft`: solid hit target and selected wash (chips, links).
 * - `accentGradient`: primary CTAs (GlassButton) — three stops, indigo→violet→blue.
 * - `surface.*` overlay tints: glass cards, inputs, thumbnails (not photo content).
 * - Light `bg*` is a warm paper/cream shell; solids stay white so garment tiles stay color-true.
 * - Orbs: ambient only; keep garment photography as the hero.
 */

import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'light' | 'dark';
export type ThemePref = 'system' | 'light' | 'dark';

const THEME_PREF_KEY = 'theme_pref_v1';

export function readStoredPref(): ThemePref {
  try {
    const v = SecureStore.getItem(THEME_PREF_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // sync read can fail on some platforms — silent fall-through
  }
  return 'system';
}

export function loadThemePref(): ThemePref {
  return readStoredPref();
}

export async function saveThemePref(pref: ThemePref): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_PREF_KEY, pref);
  } catch {
    // best-effort persistence; don't crash on storage failure
  }
}

export function getSystemMode(): ThemeMode {
  try {
    return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveMode(pref: ThemePref): ThemeMode {
  if (pref === 'light' || pref === 'dark') return pref;
  return getSystemMode();
}

type GradientTuple = readonly [string, string, string];

type Palette = {
  bg: string;
  bgGradient: GradientTuple;
  surface: string;
  surfaceSolid: string;
  hairline: string;
  divider: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  placeholder: string;

  accent: string;
  accentSoft: string;
  accentGradient: GradientTuple;

  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;

  orbPink: string;
  orbPurple: string;
  orbBlue: string;
  orbPeach: string;
};

type SurfacePalette = {
  blurTint: 'light' | 'dark';
  cardOverlay: string;
  cardBorder: string;
  inputOverlay: string;
  inputBorder: string;
  ghostOverlay: string;
  secondaryOverlay: string;
  secondaryBorder: string;
  tabBarOverlay: string;
  tabBarTopLine: string;
  headerOverlay: string;
  thumbBg: string;
  chipInactive: string;
  chipInactiveBorder: string;
  favBadgeBg: string;
};

const LIGHT_COLORS: Palette = {
  bg: '#FAF8F5',
  /* Warm paper stops; accent + gradient unchanged — brand reads via purple/blue CTAs & orbs */
  bgGradient: ['#FAF8F5', '#F7F5F2', '#F3F1ED'] as const,
  surface: 'rgba(255, 255, 255, 0.62)',
  surfaceSolid: '#FFFFFF',
  hairline: 'rgba(40, 38, 35, 0.12)',
  divider: 'rgba(40, 38, 35, 0.08)',

  text: '#1C1917',
  textSecondary: 'rgba(40, 38, 35, 0.72)',
  textMuted: 'rgba(40, 38, 35, 0.5)',
  placeholder: 'rgba(40, 38, 35, 0.36)',

  accent: '#7C4DFF',
  accentSoft: 'rgba(124, 77, 255, 0.14)',
  accentGradient: ['#A371FF', '#5B6CFF', '#3DA9FF'] as const,

  danger: '#FF453A',
  dangerSoft: 'rgba(255, 69, 58, 0.12)',
  success: '#30D158',
  warning: '#FF9F0A',

  /* Indigo/violet family only — ambient light, same hue story as web primary */
  orbPink: 'rgba(124, 77, 255, 0.12)',
  orbPurple: 'rgba(99, 102, 241, 0.1)',
  orbBlue: 'rgba(79, 70, 229, 0.09)',
  orbPeach: 'rgba(139, 92, 246, 0.08)',
};

const DARK_COLORS: Palette = {
  bg: '#0F172A',
  bgGradient: ['#0F172A', '#0D1424', '#0C1322'] as const,
  surface: 'rgba(255, 255, 255, 0.08)',
  surfaceSolid: '#1A1A24',
  hairline: 'rgba(255, 255, 255, 0.10)',
  divider: 'rgba(255, 255, 255, 0.06)',

  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textMuted: 'rgba(255, 255, 255, 0.5)',
  placeholder: 'rgba(255, 255, 255, 0.36)',

  accent: '#A78BFA',
  accentSoft: 'rgba(167, 139, 250, 0.22)',
  accentGradient: ['#C4B5FD', '#A78BFA', '#7C3AED'] as const,

  danger: '#FF6B5E',
  dangerSoft: 'rgba(255, 107, 94, 0.18)',
  success: '#34D399',
  warning: '#FBBF24',

  orbPink: 'rgba(167, 139, 250, 0.14)',
  orbPurple: 'rgba(99, 102, 241, 0.12)',
  orbBlue: 'rgba(129, 140, 248, 0.1)',
  orbPeach: 'rgba(139, 92, 246, 0.1)',
};

const LIGHT_SURFACE: SurfacePalette = {
  blurTint: 'light',
  cardOverlay: 'rgba(255, 255, 255, 0.42)',
  cardBorder: 'rgba(255, 255, 255, 0.6)',
  inputOverlay: 'rgba(255, 255, 255, 0.55)',
  inputBorder: 'rgba(255, 255, 255, 0.65)',
  ghostOverlay: 'rgba(247, 245, 242, 0.72)',
  secondaryOverlay: 'rgba(255, 255, 255, 0.78)',
  secondaryBorder: 'rgba(28, 25, 23, 0.1)',
  tabBarOverlay: 'rgba(255, 255, 255, 0.6)',
  tabBarTopLine: 'rgba(255, 255, 255, 0.85)',
  headerOverlay: 'rgba(255, 255, 255, 0.6)',
  thumbBg: '#EDE9E4',
  chipInactive: 'rgba(255, 255, 255, 0.55)',
  chipInactiveBorder: 'rgba(255, 255, 255, 0.7)',
  favBadgeBg: 'rgba(255, 255, 255, 0.85)',
};

const DARK_SURFACE: SurfacePalette = {
  blurTint: 'dark',
  cardOverlay: 'rgba(20, 20, 30, 0.35)',
  cardBorder: 'rgba(255, 255, 255, 0.10)',
  inputOverlay: 'rgba(255, 255, 255, 0.06)',
  inputBorder: 'rgba(255, 255, 255, 0.10)',
  ghostOverlay: 'rgba(255, 255, 255, 0.05)',
  secondaryOverlay: 'rgba(20, 20, 30, 0.45)',
  secondaryBorder: 'rgba(255, 255, 255, 0.12)',
  tabBarOverlay: 'rgba(10, 10, 20, 0.55)',
  tabBarTopLine: 'rgba(255, 255, 255, 0.10)',
  headerOverlay: 'rgba(10, 10, 20, 0.5)',
  thumbBg: '#23232E',
  chipInactive: 'rgba(255, 255, 255, 0.08)',
  chipInactiveBorder: 'rgba(255, 255, 255, 0.14)',
  favBadgeBg: 'rgba(20, 20, 30, 0.7)',
};

export type ThemeColors = Palette;
export type ThemeSurface = SurfacePalette;

export function getPalette(mode: ThemeMode): {
  colors: ThemeColors;
  surface: ThemeSurface;
} {
  return mode === 'dark'
    ? { colors: DARK_COLORS, surface: DARK_SURFACE }
    : { colors: LIGHT_COLORS, surface: LIGHT_SURFACE };
}

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: '#1C1917',
      shadowOpacity: 0.07,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    default: { elevation: 4 },
  })!,
  button: Platform.select({
    ios: {
      shadowColor: '#5B6CFF',
      shadowOpacity: 0.22,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    default: { elevation: 6 },
  })!,
  tabBar: Platform.select({
    ios: {
      shadowColor: '#1C1917',
      shadowOpacity: 0.09,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -2 },
    },
    default: { elevation: 12 },
  })!,
};

export const blur = {
  intensity: 60,
  cardIntensity: 40,
};

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.35 },
  title: { fontSize: 26, fontWeight: '700' as const, letterSpacing: 0.2 },
  headline: { fontSize: 19, fontWeight: '700' as const, letterSpacing: 0.1 },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 16, fontWeight: '600' as const },
  callout: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const, letterSpacing: 0.2 },
  micro: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
};
