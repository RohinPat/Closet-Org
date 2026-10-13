/**
 * apiFetch: on 401, refresh once (single-flight), retry, or sign out cleanly.
 */
const store: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
}));

jest.mock('../config', () => ({ apiUrl: (p: string) => `https://api.test/api${p}` }));

import * as api from '../api/client';

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown };

function mockFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    const text = body === undefined ? '' : JSON.stringify(body);
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => text,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const auth = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

it('refreshes once on 401, stores the new pair, and retries', async () => {
  store.closet_org_access_token = 'old-access';
  store.closet_org_refresh_token = 'refresh-1';
  const calls = mockFetch((url, init) => {
    if (url.endsWith('/auth/refresh')) {
      return { status: 200, body: { access_token: 'new-access', refresh_token: 'refresh-2' } };
    }
    return auth(init) === 'Bearer new-access'
      ? { status: 200, body: { id: 1, username: 'u' } }
      : { status: 401, body: { detail: 'Token has expired' } };
  });

  const me = await api.fetchMe();

  expect(me).toEqual({ id: 1, username: 'u' });
  expect(store.closet_org_access_token).toBe('new-access');
  expect(store.closet_org_refresh_token).toBe('refresh-2');
  expect(calls.map((c) => c.url.replace('https://api.test/api', ''))).toEqual([
    '/auth/me',
    '/auth/refresh',
    '/auth/me',
  ]);
  expect((calls[0].init.headers as Record<string, string>)['X-Closet-Refresh']).toBe('1');
});

it('shares one refresh between concurrent 401s', async () => {
  store.closet_org_access_token = 'old-access';
  store.closet_org_refresh_token = 'refresh-1';
  let refreshes = 0;
  mockFetch((url, init) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes += 1;
      return { status: 200, body: { access_token: 'new-access', refresh_token: 'refresh-2' } };
    }
    return auth(init) === 'Bearer new-access' ? { status: 200, body: {} } : { status: 401, body: {} };
  });

  await Promise.all([api.fetchMe(), api.fetchMe(), api.fetchMe()]);
  expect(refreshes).toBe(1);
});

it('signs out when the server rejects the refresh token', async () => {
  store.closet_org_access_token = 'old-access';
  store.closet_org_refresh_token = 'revoked';
  mockFetch(() => ({ status: 401, body: { detail: 'Session expired, please sign in again' } }));
  const expired = jest.fn();
  const unsubscribe = api.onSessionExpired(expired);

  await expect(api.fetchMe()).rejects.toThrow();
  expect(expired).toHaveBeenCalledTimes(1);
  expect(store.closet_org_access_token).toBeUndefined();
  expect(store.closet_org_refresh_token).toBeUndefined();
  unsubscribe();
});

it('keeps the session when the refresh fails because of the network', async () => {
  store.closet_org_access_token = 'old-access';
  store.closet_org_refresh_token = 'refresh-1';
  global.fetch = jest.fn(async (url: string) => {
    if (url.endsWith('/auth/refresh')) throw new TypeError('Network request failed');
    return { status: 401, ok: false, text: async () => '{"detail":"Token has expired"}' } as Response;
  }) as unknown as typeof fetch;
  const expired = jest.fn();
  const unsubscribe = api.onSessionExpired(expired);

  await expect(api.fetchMe()).rejects.toThrow();
  expect(expired).not.toHaveBeenCalled();
  expect(store.closet_org_refresh_token).toBe('refresh-1');
  unsubscribe();
});

it('never tries to refresh a failed login', async () => {
  const calls = mockFetch(() => ({ status: 401, body: { detail: 'Invalid username or password' } }));
  store.closet_org_refresh_token = 'refresh-1';
  await expect(api.login('u', 'wrong')).rejects.toThrow();
  expect(calls).toHaveLength(1);
});
