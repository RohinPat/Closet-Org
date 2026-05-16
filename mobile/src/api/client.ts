import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiUrl } from '../config';
import { formatApiError } from './errors';
import type {
  BulkItemPayload,
  AppSettings,
  AppSettingsPatch,
  ClothingItem,
  ClosetLocation,
  ClosetInsights,
  ClosetStats,
  FitCheckPairing,
  FitComment,
  FitPost,
  Friend,
  FriendRequest,
  ItemDetailsPatch,
  OutfitRecommendation,
  PromoteBulkResult,
  PublicProfile,
  PublicUser,
  User,
  VisualSearchMatch,
  ForecastDay,
  WeatherContext,
  WeatherLocation,
  WishlistCreate,
  WishlistPatch,
} from './types';

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
  q?: string;
  packed?: boolean;
  closetLocationId?: number | null;
}) {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.status) q.set('status', params.status);
  if (params?.q?.trim()) q.set('q', params.q.trim());
  if (params?.packed != null) q.set('packed', String(params.packed));
  if (params?.closetLocationId != null)
    q.set('closet_location_id', String(params.closetLocationId));
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch<{ items: ClothingItem[] }>(`/closet${suffix}`);
}

export async function fetchSettings() {
  return apiFetch<AppSettings>('/settings');
}

export async function updateSettings(patch: AppSettingsPatch) {
  return apiFetch<AppSettings>('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function fetchClosetLocations() {
  return apiFetch<{ locations: ClosetLocation[] }>('/closet/locations');
}

export async function createClosetLocation(body: {
  name: string;
  kind?: string;
  is_default?: boolean;
}) {
  return apiFetch<{ success: boolean; location: ClosetLocation }>(
    '/closet/locations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function updateClosetLocation(
  locationId: number,
  patch: { name?: string; kind?: string; is_default?: boolean }
) {
  return apiFetch<{ success: boolean; location: ClosetLocation }>(
    `/closet/locations/${locationId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
}

export async function deleteClosetLocation(locationId: number) {
  return apiFetch<{ success: boolean; locations: ClosetLocation[] }>(
    `/closet/locations/${locationId}`,
    { method: 'DELETE' }
  );
}

export async function bulkUpdatePacked(
  itemIds: number[] | null,
  packedForTrip: boolean
) {
  return apiFetch<{ success: boolean; updated: number }>('/closet/packed', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_ids: itemIds,
      packed_for_trip: packedForTrip,
    }),
  });
}

export async function createBulkItem(body: BulkItemPayload) {
  return apiFetch<{ success: boolean; item_id: number }>('/closet/bulk-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function createBulkItemWithPhoto(
  body: BulkItemPayload,
  photo: UploadPhoto
) {
  const token = await getStoredToken();
  const form = new FormData();
  form.append('name', body.name);
  form.append('subcategory', body.subcategory);
  form.append('quantity', String(body.quantity));
  if (body.clean_count != null) {
    form.append('clean_count', String(body.clean_count));
  }
  if (body.style) form.append('style', body.style);
  if (body.season) form.append('season', body.season);
  if (isWeb) {
    const blob = await (await fetch(photo.uri)).blob();
    form.append('photo', blob, photo.filename);
  } else {
    form.append('photo', {
      uri: photo.uri,
      name: photo.filename,
      type: photo.mimeType,
    } as unknown as Blob);
  }
  return apiFetch<{ success: boolean; item_id: number }>(
    '/closet/bulk-item/upload',
    { method: 'POST', body: form },
    token
  );
}

export async function postVisualSearch(photo: UploadPhoto, limit = 24) {
  const token = await getStoredToken();
  const form = new FormData();
  if (isWeb) {
    const blob = await (await fetch(photo.uri)).blob();
    form.append('files', blob, photo.filename);
  } else {
    form.append('files', {
      uri: photo.uri,
      name: photo.filename,
      type: photo.mimeType,
    } as unknown as Blob);
  }
  return apiFetch<{ matches: VisualSearchMatch[]; hint?: string }>(
    `/closet/visual-search?limit=${encodeURIComponent(String(limit))}`,
    { method: 'POST', body: form },
    token
  );
}

export async function promoteBulkItem(itemId: number, count: number) {
  return apiFetch<PromoteBulkResult>(`/item/${itemId}/promote-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
}

export async function fetchClosetInsights() {
  return apiFetch<ClosetInsights>('/closet/insights');
}

export async function fetchItem(itemId: number) {
  return apiFetch<ClothingItem>(`/item/${itemId}`);
}

export type UploadPhoto = {
  uri: string;
  filename: string;
  mimeType: string;
};

export async function uploadClothing(photos: UploadPhoto[]) {
  if (photos.length === 0) {
    throw new Error('Pick at least one photo');
  }
  const token = await getStoredToken();
  const form = new FormData();
  for (const p of photos) {
    if (isWeb) {
      const blob = await (await fetch(p.uri)).blob();
      form.append('files', blob, p.filename);
    } else {
      form.append('files', {
        uri: p.uri,
        name: p.filename,
        type: p.mimeType,
      } as unknown as Blob);
    }
  }

  return apiFetch<{
    success: boolean;
    item_id: number;
    classification: Record<string, unknown>;
    duplicate_hint?: {
      category: string;
      color: string;
      existing_similar_count: number;
    } | null;
    image_url: string;
    thumbnail_url?: string | null;
    image_urls?: (string | null)[];
    thumbnail_urls?: (string | null)[];
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

export async function updateItemDetails(
  itemId: number,
  patch: ItemDetailsPatch
) {
  return apiFetch<{ success: boolean; item_id: number }>(`/item/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function lendItem(
  itemId: number,
  body: { lent_to: string; lent_until?: string | null }
) {
  return apiFetch<{ success: boolean; item_id: number }>(
    `/item/${itemId}/lend`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function returnItem(itemId: number) {
  return apiFetch<{ success: boolean; item_id: number }>(
    `/item/${itemId}/return`,
    { method: 'PUT' }
  );
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
  /** Stable per day server-side unless overridden; pass e.g. Date.now() to reshuffle. */
  seed?: number;
  /** Comma-ready list of owned item ids to omit. */
  excludeItemIds?: number[];
  /** Item ids that must appear in every outfit (owned closet ids). */
  pinItemIds?: number[];
  /** Vibe preset: clean_prep | streetwear | cozy */
  vibe?: string;
  /** Include packed-away items in the backend candidate pool. */
  includePacked?: boolean;
  /** Restrict suggestions to one structured closet location. */
  closetLocationId?: number | null;
  /** Optional weather-aware scoring context resolved server-side. */
  lat?: number;
  lon?: number;
  weatherDate?: string;
  locationName?: string;
}) {
  const q = new URLSearchParams();
  if (params?.occasion) q.set('occasion', params.occasion);
  if (params?.season) q.set('season', params.season);
  if (params?.seed != null) q.set('seed', String(params.seed));
  if (params?.vibe) q.set('vibe', params.vibe);
  if (params?.includePacked) q.set('include_packed', 'true');
  if (params?.closetLocationId != null)
    q.set('closet_location_id', String(params.closetLocationId));
  if (params?.lat != null) q.set('lat', String(params.lat));
  if (params?.lon != null) q.set('lon', String(params.lon));
  if (params?.weatherDate) q.set('weather_date', params.weatherDate);
  if (params?.locationName) q.set('location_name', params.locationName);
  if (params?.excludeItemIds?.length)
    q.set('exclude_item_ids', params.excludeItemIds.join(','));
  if (params?.pinItemIds?.length)
    q.set('pin_item_ids', params.pinItemIds.join(','));
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch<{ outfits: OutfitRecommendation[]; weather?: WeatherContext | null }>(
    `/outfits/recommend${suffix}`
  );
}

export async function geocodeWeatherLocation(query: string) {
  const q = new URLSearchParams({ q: query });
  return apiFetch<{ results: WeatherLocation[] }>(`/weather/geocode?${q}`);
}

export async function fetchCurrentWeather(params: {
  lat: number;
  lon: number;
  date?: string;
  locationName?: string;
}) {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
  });
  if (params.date) q.set('date', params.date);
  if (params.locationName) q.set('location_name', params.locationName);
  return apiFetch<{ weather: WeatherContext }>(`/weather/current?${q}`);
}

export async function fetchWeatherForecast(params: {
  lat: number;
  lon: number;
  startDate?: string;
  endDate?: string;
  locationName?: string;
}) {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
  });
  if (params.startDate) q.set('start_date', params.startDate);
  if (params.endDate) q.set('end_date', params.endDate);
  if (params.locationName) q.set('location_name', params.locationName);
  return apiFetch<{
    location_name?: string | null;
    latitude: number;
    longitude: number;
    days: ForecastDay[];
    context: WeatherContext;
  }>(`/weather/forecast?${q}`);
}

export async function fetchItemOutfits(
  itemId: number,
  params?: {
    occasion?: string;
    season?: string;
    seed?: number;
    vibe?: string;
  }
) {
  const q = new URLSearchParams();
  if (params?.occasion) q.set('occasion', params.occasion);
  if (params?.season) q.set('season', params.season);
  if (params?.seed != null) q.set('seed', String(params.seed));
  if (params?.vibe) q.set('vibe', params.vibe);
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch<{ outfits: OutfitRecommendation[] }>(
    `/item/${itemId}/outfits${suffix}`
  );
}

export async function postClosetFitCheck(photo: UploadPhoto) {
  const token = await getStoredToken();
  const form = new FormData();
  if (isWeb) {
    const blob = await (await fetch(photo.uri)).blob();
    form.append('files', blob, photo.filename);
  } else {
    form.append('files', {
      uri: photo.uri,
      name: photo.filename,
      type: photo.mimeType,
    } as unknown as Blob);
  }
  return apiFetch<{
    classification: Record<string, unknown>;
    pairings: FitCheckPairing[];
  }>(`/closet/fit-check`, { method: 'POST', body: form }, token);
}

export async function fetchStats() {
  return apiFetch<ClosetStats>('/stats');
}

export async function fetchWishlist() {
  return apiFetch<{ items: ClothingItem[] }>('/wishlist');
}

export async function createWishlistItem(body: WishlistCreate) {
  return apiFetch<{ success: boolean; item_id: number }>('/wishlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateWishlistItem(itemId: number, patch: WishlistPatch) {
  return apiFetch<{ success: boolean; item_id: number }>(
    `/wishlist/${itemId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
}

export async function promoteWishlistItem(itemId: number) {
  return apiFetch<{ success: boolean; item_id: number }>(
    `/item/${itemId}/promote`,
    { method: 'PUT' }
  );
}

// Social: avatar, users, friends, feed, posts, reactions, comments.

export type AvatarUploadAsset = {
  uri: string;
  filename: string;
  mimeType: string;
};

export async function uploadAvatar(asset: AvatarUploadAsset) {
  const token = await getStoredToken();
  const form = new FormData();
  if (isWeb) {
    const blob = await (await fetch(asset.uri)).blob();
    form.append('file', blob, asset.filename);
  } else {
    form.append('file', {
      uri: asset.uri,
      name: asset.filename,
      type: asset.mimeType,
    } as unknown as Blob);
  }
  return apiFetch<{ success: boolean; avatar_url: string }>(
    '/auth/avatar',
    { method: 'POST', body: form },
    token
  );
}

export async function updateProfile(payload: {
  full_name?: string | null;
  email?: string | null;
  bio?: string | null;
  theme_preference?: string | null;
}) {
  return apiFetch<{ success: boolean }>('/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function searchUsers(query: string) {
  const q = new URLSearchParams({ q: query });
  return apiFetch<{ users: PublicUser[] }>(`/users/search?${q}`);
}

export async function fetchPublicProfile(userId: number) {
  return apiFetch<PublicProfile>(`/users/${userId}`);
}

export async function fetchUserPosts(userId: number) {
  return apiFetch<{ posts: FitPost[] }>(`/users/${userId}/posts`);
}

export async function fetchFriends() {
  return apiFetch<{ friends: Friend[] }>('/friends');
}

export async function fetchFriendRequests() {
  return apiFetch<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
    '/friends/requests'
  );
}

export async function sendFriendRequest(userId: number) {
  return apiFetch<{ ok: boolean; status: string; id: number }>(
    '/friends/requests',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }
  );
}

export async function acceptFriendRequest(friendshipId: number) {
  return apiFetch<{ success: boolean }>(
    `/friends/requests/${friendshipId}/accept`,
    { method: 'POST' }
  );
}

export async function rejectFriendRequest(friendshipId: number) {
  return apiFetch<{ success: boolean }>(
    `/friends/requests/${friendshipId}/reject`,
    { method: 'POST' }
  );
}

export async function removeFriend(userId: number) {
  return apiFetch<{ success: boolean }>(`/friends/${userId}`, {
    method: 'DELETE',
  });
}

export async function fetchFeed(before?: string) {
  const q = new URLSearchParams();
  if (before) q.set('before', before);
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch<{ posts: FitPost[] }>(`/feed${suffix}`);
}

export type FitUpload = {
  uri: string;
  filename: string;
  mimeType: string;
  caption?: string | null;
  itemIds?: number[];
};

export async function createFitPost(payload: FitUpload) {
  const token = await getStoredToken();
  const form = new FormData();
  if (isWeb) {
    const blob = await (await fetch(payload.uri)).blob();
    form.append('file', blob, payload.filename);
  } else {
    form.append('file', {
      uri: payload.uri,
      name: payload.filename,
      type: payload.mimeType,
    } as unknown as Blob);
  }
  if (payload.caption) form.append('caption', payload.caption);
  if (payload.itemIds && payload.itemIds.length > 0) {
    form.append('item_ids', payload.itemIds.join(','));
  }
  return apiFetch<{ success: boolean; post: FitPost }>(
    '/fits',
    { method: 'POST', body: form },
    token
  );
}

export async function fetchFitPost(postId: number) {
  return apiFetch<FitPost>(`/fits/${postId}`);
}

export async function deleteFitPost(postId: number) {
  return apiFetch<{ success: boolean }>(`/fits/${postId}`, { method: 'DELETE' });
}

export async function toggleReaction(postId: number, emoji: string) {
  return apiFetch<{ success: boolean; active: boolean }>(
    `/fits/${postId}/react`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    }
  );
}

export async function fetchComments(postId: number) {
  return apiFetch<{ comments: FitComment[] }>(`/fits/${postId}/comments`);
}

export async function postComment(postId: number, body: string) {
  return apiFetch<{ success: boolean; comment_id: number }>(
    `/fits/${postId}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
}

export async function deleteComment(commentId: number) {
  return apiFetch<{ success: boolean }>(`/comments/${commentId}`, {
    method: 'DELETE',
  });
}
