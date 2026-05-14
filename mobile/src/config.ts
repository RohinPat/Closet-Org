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
