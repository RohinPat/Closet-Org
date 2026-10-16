import type { ClothingItem, WeatherContext } from '../api/types';

const WARM_LAYERS = new Set(['Jacket', 'Coat', 'Sweater']);
const RAIN_READY = new Set(['Jacket', 'Coat', 'Boots', 'Sneakers']);
const DAY_MS = 86_400_000;

export function greetingFor(now: Date, firstName?: string | null): string {
  const h = now.getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = (firstName ?? '').trim().split(/\s+/)[0];
  return name ? `${part}, ${name}` : part;
}

export function dateLabel(now: Date): string {
  return now
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
}

function parseServerTime(value: string): Date | null {
  // SQLite CURRENT_TIMESTAMP is UTC without a zone: "2026-10-01 08:12:00".
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const d = parseServerTime(value);
  return d ? Math.floor((now.getTime() - d.getTime()) / DAY_MS) : null;
}

function label(item: Pick<ClothingItem, 'category' | 'subcategory'>): string {
  return (item.category || item.subcategory || 'piece').toLowerCase();
}

/**
 * Short, human reasons for why an outfit fits today (at most three).
 * Mirrors what the recommender rewards: freshness, weather fit, favorites.
 */
export function outfitReasons(
  items: ClothingItem[],
  weather: WeatherContext | null | undefined,
  now: Date = new Date()
): string[] {
  const reasons: string[] = [];

  const neverWorn = items.find((i) => !i.last_worn);
  if (neverWorn) {
    reasons.push(`First wear for your ${label(neverWorn)}`);
  } else {
    const rested = items
      .map((i) => ({ i, d: daysSince(i.last_worn, now) }))
      .filter((x): x is { i: ClothingItem; d: number } => x.d !== null && x.d >= 14)
      .sort((a, b) => b.d - a.d)[0];
    if (rested) {
      const weeks = Math.floor(rested.d / 7);
      reasons.push(`${weeks} weeks since your ${label(rested.i)}`);
    }
  }

  const cats = new Set(items.map((i) => i.category));
  if (weather) {
    if (weather.cold && [...cats].some((c) => WARM_LAYERS.has(c))) reasons.push('Warm layer for the cold');
    if ((weather.rainy || weather.snowy) && [...cats].some((c) => RAIN_READY.has(c))) {
      reasons.push(weather.snowy ? 'Ready for snow' : 'Rain-ready');
    }
    if (weather.hot && !(cats.has('Coat') || cats.has('Sweater'))) reasons.push('Light enough for the heat');
  }

  if (items.some((i) => i.is_favorite)) reasons.push('Includes a favorite');
  return reasons.slice(0, 3);
}

/** Show tops/dresses first, then bottoms, shoes, accessories. */
export function orderForDisplay<T extends { subcategory?: string | null }>(items: T[]): T[] {
  const rank: Record<string, number> = { Dress: 0, Top: 1, Bottom: 2, Footwear: 3, Accessory: 4 };
  return [...items].sort((a, b) => (rank[a.subcategory ?? ''] ?? 5) - (rank[b.subcategory ?? ''] ?? 5));
}
