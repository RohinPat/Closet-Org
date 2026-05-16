import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { NativeModules, Platform } from 'react-native';

/** Backend HTTP port when URL is inferred (`host` only). */
function resolvedApiPort(): number {
  const envRaw = process.env.EXPO_PUBLIC_API_PORT?.trim();
  if (envRaw && /^\d+$/.test(envRaw)) {
    const n = parseInt(envRaw, 10);
    if (n > 0 && n < 65536) return n;
  }
  const extraRaw = (
    Constants.expoConfig?.extra as { closetApiPort?: string } | undefined
  )?.closetApiPort?.trim();
  if (extraRaw && /^\d+$/.test(extraRaw)) {
    const n = parseInt(extraRaw, 10);
    if (n > 0 && n < 65536) return n;
  }
  return 8000;
}

const DEFAULT_API_PORT = resolvedApiPort();

/**
 * Base URL of your FastAPI server (no trailing slash, no `/api` suffix).
 * `apiUrl()` prepends `/api` to every path; if you include `/api` here, requests
 * become `/api/api/...` and the server returns 404 "Not Found".
 *
 * In **development**, if `EXPO_PUBLIC_API_URL` is unset, the app infers your PC
 * from the Metro bundle URL / Expo host metadata (skipping tunnel relay domains).
 * You can also set `expo.extra.closetApiOrigin` in app.json (same rules as env).
 * If the inferred hostname is correct but the backend listens on a non‑8000 port,
 * set `EXPO_PUBLIC_API_PORT` or `expo.extra.closetApiPort` in app.json (e.g. `"8001"`).
 */
function normalizeApiOrigin(raw: string): string {
  let o = raw.trim().replace(/\/+$/, '');
  if (/\/api$/i.test(o)) {
    o = o.replace(/\/api$/i, '').replace(/\/+$/, '');
  }
  return o;
}

/** Metro tunnel / relay hosts are not where FastAPI runs — never use them as API host. */
function tunnelLikeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h.includes('exp.direct') ||
    h.includes('ngrok') ||
    h.includes('.exp.host') ||
    h.endsWith('.expo.dev')
  );
}

/** Prefer hostname from the JS bundle URL (often LAN IP); skips tunnel relays. */
function apiHostFromBundle(): string | null {
  try {
    const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
    if (!scriptURL || typeof scriptURL !== 'string') return null;
    const m = scriptURL.match(/^[^:]+:\/\/([^/:?#]+)/);
    const host = m?.[1]?.trim();
    if (!host || tunnelLikeHost(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function inferDevApiOrigin(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return normalizeApiOrigin(
        `http://${window.location.hostname}:${DEFAULT_API_PORT}`
      );
    }
    return normalizeApiOrigin(`http://localhost:${DEFAULT_API_PORT}`);
  }

  // Android emulator shares the host loopback at 10.0.2.2. Metro often reports
  // the PC's LAN IP in the bundle URL; using that for the API from the
  // emulator fails with "Network request failed", so prefer 10.0.2.2 first.
  if (Platform.OS === 'android' && !Device.isDevice) {
    return normalizeApiOrigin(`http://10.0.2.2:${DEFAULT_API_PORT}`);
  }

  const bundleHost = apiHostFromBundle();
  if (bundleHost) {
    return normalizeApiOrigin(`http://${bundleHost}:${DEFAULT_API_PORT}`);
  }

  const debuggerHost = Constants.expoGoConfig?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0]?.trim();
    if (host && !tunnelLikeHost(host)) {
      return normalizeApiOrigin(`http://${host}:${DEFAULT_API_PORT}`);
    }
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0]?.trim();
    if (host && !tunnelLikeHost(host)) {
      return normalizeApiOrigin(`http://${host}:${DEFAULT_API_PORT}`);
    }
  }

  return normalizeApiOrigin(`http://localhost:${DEFAULT_API_PORT}`);
}

const envRaw = process.env.EXPO_PUBLIC_API_URL?.trim();

const extraRaw =
  (
    Constants.expoConfig?.extra as { closetApiOrigin?: string } | undefined
  )?.closetApiOrigin?.trim() ?? '';

export const API_ORIGIN =
  envRaw && envRaw.length > 0
    ? normalizeApiOrigin(envRaw)
    : extraRaw.length > 0
      ? normalizeApiOrigin(extraRaw)
      : __DEV__
        ? inferDevApiOrigin()
        : normalizeApiOrigin(`http://localhost:${DEFAULT_API_PORT}`);

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
