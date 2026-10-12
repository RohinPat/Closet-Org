/**
 * Crash reporting (Sentry) and product analytics (PostHog).
 *
 * Both are opt-in by build-time env and are complete no-ops without them, so
 * dev builds, tests and forks never send anything:
 *   EXPO_PUBLIC_SENTRY_DSN     — Sentry project DSN
 *   EXPO_PUBLIC_POSTHOG_KEY    — PostHog project API key
 *   EXPO_PUBLIC_POSTHOG_HOST   — optional, defaults to https://us.i.posthog.com
 *
 * Privacy: events carry the numeric user id only — never usernames, emails,
 * photos, free text or passwords. Keep it that way (see /privacy).
 */
import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || '';
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() || '';
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

let posthog: PostHog | null = null;
let initialized = false;

/** Product events worth tracking during the beta. Add here, not ad hoc. */
export type TelemetryEvent =
  | 'signed_up'
  | 'item_uploaded'
  | 'outfit_recommended'
  | 'item_worn'
  | 'outfit_planned'
  | 'stylist_message_sent'
  | 'fit_posted'
  | 'account_deleted';

type Props = Record<string, string | number | boolean | null>;

/**
 * Maps a successful API call to a product event. Done centrally in `apiFetch`
 * so every screen that hits these endpoints is counted the same way.
 */
export function eventForApiCall(
  method: string,
  path: string,
  body?: BodyInit | null
): TelemetryEvent | null {
  const m = method.toUpperCase();
  const p = path.split('?')[0];
  if (m === 'GET' && p === '/outfits/recommend') return 'outfit_recommended';
  if (m === 'POST') {
    switch (p) {
      case '/auth/register':
        return 'signed_up';
      case '/upload-clothing':
        return 'item_uploaded';
      case '/planned-outfits':
        return 'outfit_planned';
      case '/ai-stylist':
        return 'stylist_message_sent';
      case '/fits':
        return 'fit_posted';
      case '/auth/delete-account':
        return 'account_deleted';
    }
  }
  if ((m === 'PUT' || m === 'POST') && /^\/item\/\d+\/status$/.test(p) && typeof body === 'string') {
    try {
      if (JSON.parse(body)?.worn === true) return 'item_worn';
    } catch {
      return null;
    }
  }
  return null;
}

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  }

  if (POSTHOG_KEY) {
    posthog = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      personProfiles: 'identified_only',
      captureAppLifecycleEvents: true,
    });
  }
}

export function identifyUser(userId: number): void {
  const id = String(userId);
  if (SENTRY_DSN) Sentry.setUser({ id });
  posthog?.identify(id);
}

export function resetUser(): void {
  if (SENTRY_DSN) Sentry.setUser(null);
  posthog?.reset();
}

export function track(event: TelemetryEvent, props?: Props): void {
  try {
    posthog?.capture(event, props);
  } catch {
    // Analytics must never break the app.
  }
}

export function trackScreen(name: string): void {
  try {
    void posthog?.screen(name);
  } catch {
    // Analytics must never break the app.
  }
}

/** Wraps the root component so Sentry can catch render errors (no-op without a DSN). */
export function wrapRoot<P extends Record<string, unknown>>(
  Root: React.ComponentType<P>
): React.ComponentType<P> {
  return SENTRY_DSN ? Sentry.wrap(Root) : Root;
}
