'use strict';

/**
 * Web session handling: short-lived access token + rotating refresh token.
 *
 * - Every request opts in with `X-Closet-Refresh: 1` and sends the latest
 *   access token from localStorage (other tabs may have refreshed it).
 * - On a 401, refresh once (shared by concurrent requests in this tab) and
 *   retry. A 409 means another tab just rotated the token; if that tab has
 *   already stored a new access token we use it.
 * - If the server rejects the refresh token, clear storage and send the user
 *   to the login page.
 */
const ClosetSession = (function () {
    const ACCESS_KEY = 'access_token';
    const REFRESH_KEY = 'refresh_token';
    const USER_KEY = 'user';
    const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

    let apiBase = '/api';
    let onExpired = () => {
        window.location.href = '/frontend/login.html';
    };
    let inFlight = null;

    function configure(opts) {
        if (opts && opts.apiBase) apiBase = opts.apiBase;
        if (opts && opts.onExpired) onExpired = opts.onExpired;
    }

    function getAccessToken() {
        return localStorage.getItem(ACCESS_KEY);
    }

    function storeSession(data) {
        if (data && data.access_token) localStorage.setItem(ACCESS_KEY, data.access_token);
        if (data && data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    }

    function clearSession() {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function withAuthHeaders(init) {
        const headers = Object.assign({}, (init && init.headers) || {});
        headers['X-Closet-Refresh'] = '1';
        const token = getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        else delete headers.Authorization;
        return Object.assign({}, init || {}, { headers });
    }

    /** @returns {Promise<'ok'|'rejected'|'unavailable'>} */
    function refresh() {
        if (inFlight) return inFlight;
        inFlight = (async () => {
            const refreshToken = localStorage.getItem(REFRESH_KEY);
            if (!refreshToken) return 'rejected';
            const accessBefore = getAccessToken();
            try {
                const res = await fetch(`${apiBase}/auth/refresh`, {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
                if (res.status === 409) {
                    // Another tab rotated it a moment ago.
                    return getAccessToken() !== accessBefore ? 'ok' : 'unavailable';
                }
                if (res.status === 401) return 'rejected';
                if (!res.ok) return 'unavailable';
                storeSession(await res.json());
                return 'ok';
            } catch {
                return 'unavailable';
            }
        })().finally(() => {
            inFlight = null;
        });
        return inFlight;
    }

    function pathOf(url) {
        const s = String(url);
        const i = s.indexOf(apiBase);
        return (i >= 0 ? s.slice(i + apiBase.length) : s).split('?')[0];
    }

    /** fetch() with the current access token and one refresh-and-retry on 401. */
    async function authedFetch(url, init) {
        const hadToken = Boolean(getAccessToken());
        let res = await fetch(url, withAuthHeaders(init));
        if (res.status !== 401 || !hadToken || NO_REFRESH.includes(pathOf(url))) return res;
        const result = await refresh();
        if (result === 'ok') {
            res = await fetch(url, withAuthHeaders(init));
        } else if (result === 'rejected') {
            clearSession();
            onExpired();
        }
        return res;
    }

    /** Revoke this browser's refresh token on the server, then clear storage. */
    async function logout() {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        clearSession();
        if (!refreshToken) return;
        try {
            await fetch(`${apiBase}/auth/logout`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
        } catch {
            // Offline: the refresh token still expires on its own.
        }
    }

    return {
        configure,
        getAccessToken,
        storeSession,
        clearSession,
        refresh,
        authedFetch,
        logout,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClosetSession;
}
if (typeof window !== 'undefined') {
    window.ClosetSession = ClosetSession;
}
