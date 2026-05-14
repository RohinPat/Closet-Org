import { Platform } from 'react-native';

export const colors = {
  bg: '#F4F1EC',
  bgGradient: ['#F7F4EF', '#E9E4F5', '#DCEAF3'] as const,
  surface: 'rgba(255, 255, 255, 0.68)',
  surfaceSolid: '#FFFFFF',
  hairline: 'rgba(60, 60, 67, 0.12)',
  divider: 'rgba(60, 60, 67, 0.08)',

  text: '#0A0A0F',
  textSecondary: 'rgba(60, 60, 67, 0.72)',
  textMuted: 'rgba(60, 60, 67, 0.5)',
  placeholder: 'rgba(60, 60, 67, 0.36)',

  accent: '#5B6CFF',
  accentSoft: 'rgba(91, 108, 255, 0.14)',
  accentGradient: ['#7B8BFF', '#5B6CFF'] as const,

  danger: '#FF453A',
  dangerSoft: 'rgba(255, 69, 58, 0.12)',
  success: '#30D158',
};

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
      shadowColor: '#0A0A0F',
      shadowOpacity: 0.08,
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
      shadowColor: '#0A0A0F',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -2 },
    },
    default: { elevation: 12 },
  })!,
};

export const blur = {
  tint: 'light' as const,
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
