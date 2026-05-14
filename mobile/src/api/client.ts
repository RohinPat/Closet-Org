import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiUrl } from '../config';
import { formatApiError } from './errors';
import type { ClothingItem, ClosetStats, OutfitRecommendation, User } from './types';

const TOKEN_KEY = 'closet_org_access_token';
const isWeb = Platform.OS === 'web';

export async function getStoredToken(): Promise<string | null> {
  try {
    if (isWeb) {
      return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (isWeb) {
    if (typeof window === 'undefined') return;
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  const t = token ?? (await getStoredToken());
  if (t) {
    headers.Authorization = `Bearer ${t}`;
  }

  const res = await fetch(apiUrl(path), { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && body !== null && 'detail' in body
        ? (body as { detail: unknown }).detail
        : body;
    throw new Error(formatApiError(detail));
  }

  return body as T;
}

export async function login(username: string, password: string) {
  return apiFetch<{
    access_token: string;
    user: User;
  }>(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    null
  );
}

export async function register(payload: {
  username: string;
  email: string;
  password: string;
  full_name?: string | null;
}) {
  return apiFetch<{
    access_token: string;
    user: User;
  }>(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    null
  );
}

export async function fetchMe(token?: string | null) {
  return apiFetch<User>('/auth/me', {}, token);
}

export async function fetchCloset(params?: {
  category?: string;
  status?: string;
}) {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.status) q.set('status', params.status);
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch<{ items: ClothingItem[] }>(`/closet${suffix}`);
}

export async function fetchItem(itemId: number) {
  return apiFetch<ClothingItem>(`/item/${itemId}`);
}

export async function uploadClothing(
  uri: string,
  filename: string,
  mimeType: string
) {
  const token = await getStoredToken();
  const form = new FormData();
  if (isWeb) {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, filename);
  } else {
    form.append('file', {
      uri,
      name: filename,
      type: mimeType,
    } as unknown as Blob);
  }

  return apiFetch<{
    success: boolean;
    item_id: number;
    classification: Record<string, unknown>;
    image_url: string;
  }>(
    '/upload-clothing',
    {
      method: 'POST',
      body: form,
    },
    token
  );
}

export async function toggleFavorite(itemId: number) {
  return apiFetch<{ success: boolean }>(`/item/${itemId}/favorite`, {
    method: 'PUT',
  });
}

export async function deleteItem(itemId: number) {
  return apiFetch<{ success: boolean }>(`/item/${itemId}`, {
    method: 'DELETE',
  });
}

export async function updateItemStatus(
  itemId: number,
  body: {
    worn?: boolean;
    washed?: boolean;
    wear_again?: boolean;
  }
) {
  return apiFetch<{ success: boolean }>(`/item/${itemId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchOutfitRecommendations(params?: {
  occasion?: string;
  season?: string;
}) {
  const q = new URLSearchParams();
  if (params?.occasion) q.set('occasion', params.occasion);
  if (params?.season) q.set('season', params.season);
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch<{ outfits: OutfitRecommendation[] }>(
    `/outfits/recommend${suffix}`
  );
}

export async function fetchStats() {
  return apiFetch<ClosetStats>('/stats');
}
