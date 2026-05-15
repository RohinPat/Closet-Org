import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Density = 'list' | 'comfy' | 'compact' | 'dense';
export const DENSITY_VALUES: Density[] = [
  'list',
  'comfy',
  'compact',
  'dense',
];

export type SortKey = 'recent' | 'most_worn' | 'neglected' | 'cpw';
export const SORT_VALUES: SortKey[] = ['recent', 'most_worn', 'neglected', 'cpw'];

export type ClosetLayout = 'grid' | 'rails';
export const LAYOUT_VALUES: ClosetLayout[] = ['grid', 'rails'];

const DENSITY_KEY = 'closet_density_v1';
const SORT_KEY = 'closet_sort_v1';
const LAYOUT_KEY = 'closet_layout_v1';

function readStored<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = SecureStore.getItem(key);
    if (allowed.includes(v as T)) return v as T;
  } catch {
    // sync read can fail on some platforms — silent fall-through
  }
  return fallback;
}

function usePersistedEnum<T extends string>(
  key: string,
  allowed: T[],
  fallback: T
): [T, (next: T) => Promise<void>] {
  const [value, setValue] = useState<T>(() => readStored(key, allowed, fallback));

  useEffect(() => {
    setValue(readStored(key, allowed, fallback));
  }, [key, fallback]);

  const update = useCallback(
    async (next: T) => {
      setValue(next);
      try {
        await SecureStore.setItemAsync(key, next);
      } catch {
        // best-effort persistence
      }
    },
    [key]
  );

  return [value, update];
}

export function useDensityPref(): [Density, (next: Density) => Promise<void>] {
  return usePersistedEnum<Density>(DENSITY_KEY, DENSITY_VALUES, 'comfy');
}

export function useSortPref(): [SortKey, (next: SortKey) => Promise<void>] {
  return usePersistedEnum<SortKey>(SORT_KEY, SORT_VALUES, 'recent');
}

export function useLayoutPref(): [
  ClosetLayout,
  (next: ClosetLayout) => Promise<void>
] {
  return usePersistedEnum<ClosetLayout>(LAYOUT_KEY, LAYOUT_VALUES, 'grid');
}

export function sortLabel(sort: SortKey): string {
  switch (sort) {
    case 'recent':
      return 'Recent';
    case 'most_worn':
      return 'Most worn';
    case 'neglected':
      return 'Neglected';
    case 'cpw':
      return 'Best CPW';
  }
}

export function cycleSort(current: SortKey): SortKey {
  const idx = SORT_VALUES.indexOf(current);
  return SORT_VALUES[(idx + 1) % SORT_VALUES.length];
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
