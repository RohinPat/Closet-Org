import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const session = require('./session.js');

function respond(status, body) {
    return { status, ok: status >= 200 && status < 300, json: async () => body };
}

let expired;
beforeEach(() => {
    localStorage.clear();
    expired = vi.fn();
    session.configure({ apiBase: '/api', onExpired: expired });
});

describe('authedFetch', () => {
    it('sends the stored token and the refresh opt-in header', async () => {
        localStorage.setItem('access_token', 'a1');
        global.fetch = vi.fn(async () => respond(200, {}));
        await session.authedFetch('/api/closet', { headers: { Authorization: 'Bearer stale' } });
        const headers = fetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe('Bearer a1');
        expect(headers['X-Closet-Refresh']).toBe('1');
    });

    it('refreshes once on 401, stores the new pair and retries', async () => {
        localStorage.setItem('access_token', 'old');
        localStorage.setItem('refresh_token', 'r1');
        global.fetch = vi.fn(async (url, init) => {
            if (url === '/api/auth/refresh') return respond(200, { access_token: 'new', refresh_token: 'r2' });
            return init.headers.Authorization === 'Bearer new' ? respond(200, { ok: 1 }) : respond(401, {});
        });
        const res = await session.authedFetch('/api/auth/me');
        expect(res.status).toBe(200);
        expect(localStorage.getItem('access_token')).toBe('new');
        expect(localStorage.getItem('refresh_token')).toBe('r2');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('shares one refresh between concurrent 401s', async () => {
        localStorage.setItem('access_token', 'old');
        localStorage.setItem('refresh_token', 'r1');
        let refreshes = 0;
        global.fetch = vi.fn(async (url, init) => {
            if (url === '/api/auth/refresh') {
                refreshes += 1;
                return respond(200, { access_token: 'new', refresh_token: 'r2' });
            }
            return init.headers.Authorization === 'Bearer new' ? respond(200, {}) : respond(401, {});
        });
        await Promise.all([session.authedFetch('/api/a'), session.authedFetch('/api/b')]);
        expect(refreshes).toBe(1);
    });

    it('clears storage and calls onExpired when the refresh token is rejected', async () => {
        localStorage.setItem('access_token', 'old');
        localStorage.setItem('refresh_token', 'revoked');
        localStorage.setItem('user', '{}');
        global.fetch = vi.fn(async () => respond(401, {}));
        const res = await session.authedFetch('/api/closet');
        expect(res.status).toBe(401);
        expect(expired).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('access_token')).toBeNull();
        expect(localStorage.getItem('refresh_token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('treats a 409 as success when another tab already stored a new token', async () => {
        localStorage.setItem('access_token', 'old');
        localStorage.setItem('refresh_token', 'r1');
        global.fetch = vi.fn(async (url, init) => {
            if (url === '/api/auth/refresh') {
                localStorage.setItem('access_token', 'from-other-tab');
                return respond(409, {});
            }
            return init.headers.Authorization === 'Bearer from-other-tab' ? respond(200, {}) : respond(401, {});
        });
        const res = await session.authedFetch('/api/closet');
        expect(res.status).toBe(200);
        expect(expired).not.toHaveBeenCalled();
    });

    it('keeps the session on a network error during refresh', async () => {
        localStorage.setItem('access_token', 'old');
        localStorage.setItem('refresh_token', 'r1');
        global.fetch = vi.fn(async (url) => {
            if (url === '/api/auth/refresh') throw new TypeError('offline');
            return respond(401, {});
        });
        await session.authedFetch('/api/closet');
        expect(expired).not.toHaveBeenCalled();
        expect(localStorage.getItem('refresh_token')).toBe('r1');
    });

    it('does not refresh for auth endpoints or anonymous requests', async () => {
        localStorage.setItem('refresh_token', 'r1');
        global.fetch = vi.fn(async () => respond(401, {}));
        await session.authedFetch('/api/closet');
        localStorage.setItem('access_token', 'a');
        await session.authedFetch('/api/auth/login');
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

describe('logout', () => {
    it('revokes the refresh token on the server and clears storage', async () => {
        localStorage.setItem('access_token', 'a');
        localStorage.setItem('refresh_token', 'r1');
        global.fetch = vi.fn(async () => respond(200, {}));
        await session.logout();
        expect(fetch.mock.calls[0][0]).toBe('/api/auth/logout');
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ refresh_token: 'r1' });
        expect(localStorage.getItem('access_token')).toBeNull();
    });

    it('still clears storage when offline or without a refresh token', async () => {
        localStorage.setItem('access_token', 'a');
        global.fetch = vi.fn(async () => {
            throw new TypeError('offline');
        });
        await session.logout();
        expect(fetch).not.toHaveBeenCalled();
        localStorage.setItem('refresh_token', 'r1');
        await session.logout();
        expect(localStorage.getItem('refresh_token')).toBeNull();
    });
});

describe('storeSession', () => {
    it('keeps the existing refresh token when a response has none', () => {
        localStorage.setItem('refresh_token', 'r1');
        session.storeSession({ access_token: 'a2' });
        expect(localStorage.getItem('access_token')).toBe('a2');
        expect(localStorage.getItem('refresh_token')).toBe('r1');
    });
});
