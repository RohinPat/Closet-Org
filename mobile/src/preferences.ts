import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Density = 'list' | 'comfy' | 'compact' | 'dense';
export const DENSITY_VALUES: Density[] = [
  'list',
  'comfy',
  'compact',
  'dense',
];

const DENSITY_KEY = 'closet_density_v1';

function readStoredDensity(): Density {
  try {
    const v = SecureStore.getItem(DENSITY_KEY);
    if (DENSITY_VALUES.includes(v as Density)) return v as Density;
  } catch {
    // sync read can fail on some platforms — silent fall-through
  }
  return 'comfy';
}

export function useDensityPref(): [Density, (next: Density) => Promise<void>] {
  const [density, setDensityState] = useState<Density>(() =>
    readStoredDensity()
  );

  useEffect(() => {
    setDensityState(readStoredDensity());
  }, []);

  const setDensity = useCallback(async (next: Density) => {
    setDensityState(next);
    try {
      await SecureStore.setItemAsync(DENSITY_KEY, next);
    } catch {
      // best-effort persistence
    }
  }, []);

  return [density, setDensity];
}

export function densityColumns(density: Density): number {
  switch (density) {
    case 'list':
      return 1;
    case 'comfy':
      return 2;
    case 'compact':
      return 3;
    case 'dense':
      return 4;
  }
}

// Per-card maxWidth so the last row doesn't stretch a lone item full-width.
export function densityMaxWidth(density: Density): string {
  switch (density) {
    case 'list':
      return '100%';
    case 'comfy':
      return '48.5%';
    case 'compact':
      return '32%';
    case 'dense':
      return '23.5%';
  }
}

export function densityLabel(density: Density): string {
  switch (density) {
    case 'list':
      return 'List';
    case 'comfy':
      return 'Comfy';
    case 'compact':
      return 'Compact';
    case 'dense':
      return 'Dense';
  }
}

export function cycleDensity(current: Density): Density {
  const idx = DENSITY_VALUES.indexOf(current);
  return DENSITY_VALUES[(idx + 1) % DENSITY_VALUES.length];
}
