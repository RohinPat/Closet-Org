import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiUrl } from '../config';
import { formatApiError } from './errors';
import type {
  ClothingItem,
  ClosetStats,
  FitComment,
  FitPost,
  Friend,
  FriendRequest,
  ItemDetailsPatch,
  OutfitRecommendation,
  PublicProfile,
  PublicUser,
  User,
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
  bio?: string | null;
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
