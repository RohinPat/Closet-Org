/**
 * Base URL of your FastAPI server (no trailing slash).
 * Override with EXPO_PUBLIC_API_URL, e.g. http://192.168.1.5:8000 for a physical device.
 */
export const API_ORIGIN =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export const apiUrl = (path: string) =>
  `${API_ORIGIN}/api${path.startsWith('/') ? path : `/${path}`}`;

/** Turn stored image_path (absolute or relative) into a URL the app can load. */
export function itemImageUrl(imagePath: string | undefined | null): string {
  if (!imagePath) return '';
  if (imagePath.startsWith('http')) return imagePath;
  const filename = imagePath.split(/[/\\]/).pop();
  if (!filename) return '';
  return `${API_ORIGIN}/uploads/${encodeURIComponent(filename)}`;
}

/**
 * Resolve the URL for an item's background-removed thumbnail, falling back to
 * the original image when no thumbnail was generated (e.g. rembg unavailable
 * at upload time or pre-existing items not yet backfilled).
 */
export function itemThumbnailUrl(item: {
  image_path?: string | null;
  thumbnail_path?: string | null;
}): string {
  return itemImageUrl(item.thumbnail_path || item.image_path);
}

/**
 * Convert an absolute URL or server-relative path (e.g. "/uploads/foo.jpg")
 * to a fetchable URL. Pass through full URLs untouched.
 */
export function absoluteUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
  return itemImageUrl(path);
}
