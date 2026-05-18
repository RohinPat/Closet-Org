import Constants from 'expo-constants';

function readLegalUrl(key: 'privacyPolicyUrl' | 'termsOfServiceUrl'): string | null {
  const raw =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[key] ??
    '';
  return typeof raw === 'string' && raw.startsWith('http') ? raw.trim() : null;
}

export function privacyPolicyUrl(): string | null {
  return readLegalUrl('privacyPolicyUrl');
}

export function termsOfServiceUrl(): string | null {
  return readLegalUrl('termsOfServiceUrl');
}
