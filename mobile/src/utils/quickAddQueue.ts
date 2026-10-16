/**
 * State for "Quick add": many photos in, one closet item per photo.
 * Uploads run one at a time (the server serializes model work anyway, and a
 * single worker keeps a slow connection from timing out several at once).
 */

export type QuickAddStatus = 'queued' | 'uploading' | 'done' | 'failed';

export type QuickAddEntry<A = unknown> = {
  key: string;
  asset: A;
  /** Local preview URI shown while uploading. */
  previewUri: string;
  status: QuickAddStatus;
  itemId?: number;
  /** e.g. "Blue Jeans", from the server's classification. */
  label?: string;
  /** Server cutout, once the item exists. */
  thumbUri?: string;
  error?: string;
};

export type QuickAddAction<A = unknown> =
  | { type: 'add'; assets: { asset: A; previewUri: string }[] }
  | { type: 'start'; key: string }
  | { type: 'succeed'; key: string; itemId: number; label: string; thumbUri?: string }
  | { type: 'fail'; key: string; error: string }
  | { type: 'retry'; key: string }
  | { type: 'retryFailed' }
  | { type: 'clear' };

export const QUICK_ADD_LIMIT = 30;

let counter = 0;

export function quickAddReducer<A>(
  entries: QuickAddEntry<A>[],
  action: QuickAddAction<A>
): QuickAddEntry<A>[] {
  switch (action.type) {
    case 'add': {
      const room = Math.max(0, QUICK_ADD_LIMIT - entries.length);
      const added = action.assets.slice(0, room).map(({ asset, previewUri }) => ({
        key: `qa-${Date.now()}-${counter++}`,
        asset,
        previewUri,
        status: 'queued' as const,
      }));
      return [...entries, ...added];
    }
    case 'start':
      return entries.map((e) => (e.key === action.key ? { ...e, status: 'uploading', error: undefined } : e));
    case 'succeed':
      return entries.map((e) =>
        e.key === action.key
          ? { ...e, status: 'done', itemId: action.itemId, label: action.label, thumbUri: action.thumbUri }
          : e
      );
    case 'fail':
      return entries.map((e) => (e.key === action.key ? { ...e, status: 'failed', error: action.error } : e));
    case 'retry':
      return entries.map((e) => (e.key === action.key && e.status === 'failed' ? { ...e, status: 'queued' } : e));
    case 'retryFailed':
      return entries.map((e) => (e.status === 'failed' ? { ...e, status: 'queued' } : e));
    case 'clear':
      return [];
  }
}

/** The next entry to upload, or null if one is running or none are waiting. */
export function nextToUpload<A>(entries: QuickAddEntry<A>[]): QuickAddEntry<A> | null {
  if (entries.some((e) => e.status === 'uploading')) return null;
  return entries.find((e) => e.status === 'queued') ?? null;
}

export function quickAddSummary(entries: QuickAddEntry[]) {
  const count = (s: QuickAddStatus) => entries.filter((e) => e.status === s).length;
  const done = count('done');
  const failed = count('failed');
  const pending = count('queued') + count('uploading');
  return { total: entries.length, done, failed, pending, finished: entries.length > 0 && pending === 0 };
}

/** "Blue Jeans" from a classification; falls back to the category alone. */
export function itemLabel(classification: { category?: string; colors?: string[] } | null | undefined): string {
  const category = classification?.category || 'Item';
  const color = classification?.colors?.[0];
  return color ? `${color} ${category}` : category;
}
