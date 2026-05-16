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

export type ClosetFilterBarSectionId =
  | 'closets'
  | 'status'
  | 'categories'
  | 'colors'
  | 'locations';

const CLOSET_FILTER_BAR_SECTIONS_KEY = 'closet_filter_bar_sections_v1';

const ALL_CLOSET_FILTER_BAR_SECTION_IDS: ClosetFilterBarSectionId[] = [
  'closets',
  'status',
  'categories',
  'colors',
  'locations',
];

const DEFAULT_CLOSET_FILTER_BAR_SECTIONS: Record<
  ClosetFilterBarSectionId,
  boolean
> = {
  closets: true,
  status: true,
  categories: true,
  colors: true,
  locations: true,
};

function readClosetFilterBarSectionsSync(): Record<
  ClosetFilterBarSectionId,
  boolean
> {
  const out = { ...DEFAULT_CLOSET_FILTER_BAR_SECTIONS };
  try {
    const raw = SecureStore.getItem(CLOSET_FILTER_BAR_SECTIONS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const id of ALL_CLOSET_FILTER_BAR_SECTION_IDS) {
      if (typeof parsed[id] === 'boolean') out[id] = parsed[id];
    }
  } catch {
    // keep defaults
  }
  return out;
}

async function writeClosetFilterBarSections(
  next: Record<ClosetFilterBarSectionId, boolean>
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      CLOSET_FILTER_BAR_SECTIONS_KEY,
      JSON.stringify(next)
    );
  } catch {
    // best-effort
  }
}

export function useClosetFilterBarSections(): [
  Record<ClosetFilterBarSectionId, boolean>,
  (id: ClosetFilterBarSectionId) => void,
] {
  const [expanded, setExpanded] = useState(readClosetFilterBarSectionsSync);

  const toggleSection = useCallback((id: ClosetFilterBarSectionId) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      void writeClosetFilterBarSections(next);
      return next;
    });
  }, []);

  return [expanded, toggleSection];
}

export type OutfitsAssistantPanelMode = 'full' | 'widget';

export type OutfitsAssistantPanelsState = {
  weather: OutfitsAssistantPanelMode;
  stylist: OutfitsAssistantPanelMode;
};

const OUTFITS_ASSISTANT_PANELS_KEY = 'outfits_assistant_panels_v1';

const DEFAULT_OUTFITS_ASSISTANT_PANELS: OutfitsAssistantPanelsState = {
  weather: 'full',
  stylist: 'full',
};

function readOutfitsAssistantPanelsSync(): OutfitsAssistantPanelsState {
  const out = { ...DEFAULT_OUTFITS_ASSISTANT_PANELS };
  try {
    const raw = SecureStore.getItem(OUTFITS_ASSISTANT_PANELS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.weather === 'full' || parsed.weather === 'widget') {
      out.weather = parsed.weather;
    }
    if (parsed.stylist === 'full' || parsed.stylist === 'widget') {
      out.stylist = parsed.stylist;
    }
  } catch {
    // keep defaults
  }
  return out;
}

async function writeOutfitsAssistantPanels(
  next: OutfitsAssistantPanelsState
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      OUTFITS_ASSISTANT_PANELS_KEY,
      JSON.stringify(next)
    );
  } catch {
    // best-effort
  }
}

export function useOutfitsAssistantPanels(): [
  OutfitsAssistantPanelsState,
  (patch: Partial<OutfitsAssistantPanelsState>) => void,
] {
  const [state, setState] = useState(readOutfitsAssistantPanelsSync);

  const update = useCallback(
    (patch: Partial<OutfitsAssistantPanelsState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        void writeOutfitsAssistantPanels(next);
        return next;
      });
    },
    []
  );

  return [state, update];
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

/** User-facing explanation for Personal Settings (not the compact header label). */
export function densityDescription(density: Density): string {
  switch (density) {
    case 'list':
      return 'One column with large thumbnails — easiest on the eyes.';
    case 'comfy':
      return 'Two columns — default balance of size and how many you see.';
    case 'compact':
      return 'Three columns — more items visible while browsing.';
    case 'dense':
      return 'Four columns — smallest tiles; fits the most on one screen.';
  }
}

export function layoutLabel(layout: ClosetLayout): string {
  return layout === 'grid' ? 'Grid' : 'Rails';
}

export function layoutDescription(layout: ClosetLayout): string {
  return layout === 'grid'
    ? 'A uniform grid of cards — good for scanning many pieces.'
    : 'Horizontal shelves by category — like racks in a shop.';
}

export function sortDescription(sort: SortKey): string {
  switch (sort) {
    case 'recent':
      return 'Newest items first (by date added).';
    case 'most_worn':
      return 'Pieces you wear most often rise to the top.';
    case 'neglected':
      return 'Highlights items you have not worn in a while.';
    case 'cpw':
      return 'Sorts by cost-per-wear — great value first.';
  }
}

export function cycleDensity(current: Density): Density {
  const idx = DENSITY_VALUES.indexOf(current);
  return DENSITY_VALUES[(idx + 1) % DENSITY_VALUES.length];
}

const ONBOARDING_CAROUSEL_KEY = 'onboarding_carousel_v1';
const ONBOARDING_CHECKLIST_DISMISSED_KEY = 'onboarding_checklist_dismissed_v1';
const ONBOARDING_ITEM_DETAIL_VISITED_KEY = 'onboarding_item_detail_visited_v1';

export type OnboardingCarouselStatus = 'pending' | 'completed' | 'skipped';

export function readOnboardingCarouselStatusSync(): OnboardingCarouselStatus {
  try {
    const v = SecureStore.getItem(ONBOARDING_CAROUSEL_KEY);
    if (v === 'completed' || v === 'skipped') return v;
  } catch {
    // fall through
  }
  return 'pending';
}

export async function setOnboardingCarouselStatus(
  status: 'completed' | 'skipped'
): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_CAROUSEL_KEY, status);
  } catch {
    // best-effort
  }
}

export function readOnboardingChecklistDismissedSync(): boolean {
  try {
    return SecureStore.getItem(ONBOARDING_CHECKLIST_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingChecklistDismissed(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_CHECKLIST_DISMISSED_KEY, '1');
  } catch {
    // best-effort
  }
}

export function readOnboardingItemDetailVisitedSync(): boolean {
  try {
    return SecureStore.getItem(ONBOARDING_ITEM_DETAIL_VISITED_KEY) === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingItemDetailVisited(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_ITEM_DETAIL_VISITED_KEY, '1');
  } catch {
    // best-effort
  }
}
