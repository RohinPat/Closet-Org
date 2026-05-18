'use strict';

/**
 * Shared pure helpers for the vanilla-JS web app (browser + Vitest).
 * Wrapped in an IIFE so top-level const names do not collide with script.js.
 */

const ClosetWebUtils = (function () {
    const CLOSET_DENSITY_KEY = 'closet_web_density';
    const CLOSET_LAYOUT_KEY = 'closet_web_layout';
    const DENSITY_CYCLE = ['list', 'comfy', 'compact', 'dense'];
    const DENSITY_LABELS = { list: 'List', comfy: 'Comfy', compact: 'Compact', dense: 'Dense' };

    const _ESC_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
        '/': '&#x2F;',
    };

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"'`/]/g, (ch) => _ESC_MAP[ch]);
    }

    function formatApiError(detail) {
        if (detail === null || detail === undefined) return 'Unknown error';
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail
                .map((entry) => {
                    if (typeof entry === 'string') return entry;
                    if (entry && typeof entry.msg === 'string') return entry.msg;
                    return JSON.stringify(entry);
                })
                .join('; ');
        }
        if (typeof detail === 'object' && typeof detail.msg === 'string') return detail.msg;
        try {
            return JSON.stringify(detail);
        } catch {
            return String(detail);
        }
    }

    function formatAuthError(detail) {
        if (detail === null || detail === undefined) return '';
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail
                .map((entry) => {
                    if (typeof entry === 'string') return entry;
                    if (!entry || typeof entry !== 'object') return '';
                    const field = Array.isArray(entry.loc)
                        ? entry.loc.filter((part) => part !== 'body').join(' · ')
                        : '';
                    const msg =
                        (typeof entry.msg === 'string' && entry.msg) ||
                        (typeof entry.message === 'string' && entry.message) ||
                        '';
                    if (field && msg) return `${field}: ${msg}`;
                    return msg;
                })
                .filter(Boolean)
                .join(' ');
        }
        if (typeof detail === 'object') {
            if (typeof detail.msg === 'string') return detail.msg;
            if (typeof detail.message === 'string') return detail.message;
            if (typeof detail.detail === 'string') return detail.detail;
        }
        return '';
    }

    function errorMessageFromCaught(error) {
        if (error instanceof Error && error.message) return error.message;
        return formatAuthError(error) || 'Something went wrong. Please try again.';
    }

    function safeUrl(value) {
        if (value === null || value === undefined) return '';
        const s = String(value).trim();
        if (s === '') return '';
        if (/^https?:\/\//i.test(s)) return escapeHtml(s);
        if (s.startsWith('/uploads/')) return escapeHtml(s);
        if (s.startsWith('uploads/')) {
            return escapeHtml('/' + s.replace(/^\/+/, ''));
        }
        const base = s.split(/[/\\]/).pop();
        if (base && /^item_[^/\\]+\.(webp|png|jpe?g|gif)$/i.test(base)) {
            return escapeHtml('/uploads/' + encodeURIComponent(base));
        }
        if (s.startsWith('/') || s.startsWith('./')) {
            return escapeHtml(s);
        }
        return '';
    }

    function closetItemImageUrl(item) {
        if (!item) return '';
        return safeUrl(item.thumbnail_path || item.image_path);
    }

    function readClosetDensity(storage) {
        const v = storage.getItem(CLOSET_DENSITY_KEY);
        return DENSITY_CYCLE.includes(v) ? v : 'comfy';
    }

    function readClosetLayout(storage) {
        const v = storage.getItem(CLOSET_LAYOUT_KEY);
        return v === 'rails' ? 'rails' : 'grid';
    }

    function nextClosetDensity(current) {
        const idx = DENSITY_CYCLE.indexOf(current);
        const safeIdx = idx >= 0 ? idx : DENSITY_CYCLE.indexOf('comfy');
        return DENSITY_CYCLE[(safeIdx + 1) % DENSITY_CYCLE.length];
    }

    function toggleClosetLayoutValue(current) {
        return current === 'rails' ? 'grid' : 'rails';
    }

    function buildClosetGridClassName(density, layout) {
        const d = DENSITY_CYCLE.includes(density) ? density : 'comfy';
        const rails = layout === 'rails' ? ' closet-grid--rails' : '';
        return `closet-grid closet-grid--${d}${rails}`;
    }

    function resolveThemePreference(pref, matchDark = false) {
        if (pref === 'system') {
            return matchDark ? 'dark' : 'light';
        }
        return pref === 'dark' ? 'dark' : 'light';
    }

    const TOAST_TYPES = new Set(['info', 'success', 'warning', 'error']);

    function showToast(message, type = 'info') {
        if (typeof document === 'undefined' || message == null) return;
        const toastType = TOAST_TYPES.has(type) ? type : 'info';
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast--${toastType}`;
        toast.setAttribute('role', 'status');
        toast.textContent = String(message);
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        window.setTimeout(() => {
            toast.classList.remove('show');
            window.setTimeout(() => toast.remove(), 280);
        }, 2800);
    }

    function emptyStateMarkup({ variant, title, message, ctaTab, ctaLabel }) {
        const v = escapeHtml(variant || 'closet');
        const illust = `/frontend/assets/empty-${v}.svg`;
        const cta =
            ctaTab && ctaLabel
                ? `<button type="button" class="btn btn-primary btn-sm" data-empty-cta="${escapeHtml(ctaTab)}">${escapeHtml(ctaLabel)}</button>`
                : '';
        return `<div class="empty-state empty-state--${v}">
            <img class="empty-state-illustration" src="${illust}" alt="" width="140" height="140" loading="lazy">
            <h3>${escapeHtml(title || 'Nothing here yet')}</h3>
            <p>${escapeHtml(message || '')}</p>
            ${cta}
        </div>`;
    }

    function bindEmptyStateCtas(root, onTab) {
        if (!root || typeof onTab !== 'function') return;
        root.querySelectorAll('[data-empty-cta]').forEach((btn) => {
            btn.addEventListener('click', () => onTab(btn.getAttribute('data-empty-cta')));
        });
    }

    const VALID_APP_TABS = new Set([
        'feed',
        'closet',
        'upload',
        'outfits',
        'profile',
        'care',
        'wishlist',
        'pack',
        'planning',
        'trips',
        'friends',
        'settings',
        'create-fit',
    ]);

    const CLOSET_FILTER_SECTIONS_KEY = 'closet_filter_bar_sections_v1';
    const FILTER_SECTION_IDS = ['closets', 'status', 'categories', 'colors', 'locations'];
    const DEFAULT_FILTER_SECTIONS = {
        closets: true,
        status: true,
        categories: true,
        colors: true,
        locations: true,
    };

    function readClosetFilterSections(storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const out = { ...DEFAULT_FILTER_SECTIONS };
        if (!store) return out;
        try {
            const raw = store.getItem(CLOSET_FILTER_SECTIONS_KEY);
            if (!raw) return out;
            const parsed = JSON.parse(raw);
            for (const id of FILTER_SECTION_IDS) {
                if (typeof parsed[id] === 'boolean') out[id] = parsed[id];
            }
        } catch {
            /* keep defaults */
        }
        return out;
    }

    function writeClosetFilterSections(storage, next) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store) return;
        try {
            store.setItem(CLOSET_FILTER_SECTIONS_KEY, JSON.stringify(next));
        } catch {
            /* best-effort */
        }
    }

    /** Map stats/insights capsule gap id → wishlist create seed (mobile StatsScreen). */
    function gapWishlistSeed(gapId) {
        const map = {
            outer_layer: { category: 'Jacket', subcategory: 'Top' },
            neutral_outer: { category: 'Jacket', subcategory: 'Top' },
            dressy_shoes: { category: 'Shoes', subcategory: 'Footwear' },
            bottoms_or_dress: { category: 'Bottom', subcategory: 'Bottom' },
            accessories: { category: 'Accessory', subcategory: 'Accessory' },
            color_variety: { category: 'Other', subcategory: 'Wishlist' },
        };
        return map[gapId] || { category: 'Other', subcategory: 'Wishlist' };
    }

    /** Align stored sort keys with mobile (`most_worn`, `neglected`, `cpw`); web-only extras kept. */
    function normalizeClosetSortKey(key) {
        const legacy = {
            'most-worn': 'most_worn',
            'best-cpw': 'cpw',
            'last-worn': 'last_worn',
            'least-worn': 'least_worn',
        };
        return legacy[key] || key || 'recent';
    }

    function parseAppDeepLink(search = '') {
        const params = new URLSearchParams(search);
        const tab = params.get('tab');
        const pinRaw = params.get('pin');
        const pinIds = pinRaw
            ? pinRaw
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0)
            : [];
        const openAddRaw = params.get('openAdd');
        const wishlist = {
            openAdd: openAddRaw === '1' || openAddRaw === 'true',
            name: params.get('wishName') || params.get('initialName') || '',
            category: params.get('wishCategory') || params.get('initialCategory') || '',
            subcategory: params.get('wishSubcategory') || params.get('initialSubcategory') || '',
            intent: params.get('wishIntent') || params.get('initialIntent') || 'want',
            notes: params.get('wishNotes') || params.get('initialNotes') || '',
            url: params.get('wishUrl') || '',
            price: params.get('wishPrice') || '',
        };
        return {
            tab: tab && VALID_APP_TABS.has(tab) ? tab : null,
            pinIds,
            wishlist,
        };
    }

    function buildWishlistTabUrl(prefill = {}) {
        const params = new URLSearchParams({ tab: 'wishlist' });
        if (prefill.openAdd) params.set('openAdd', '1');
        if (prefill.name) params.set('wishName', prefill.name);
        if (prefill.category) params.set('wishCategory', prefill.category);
        if (prefill.subcategory) params.set('wishSubcategory', prefill.subcategory);
        if (prefill.intent) params.set('wishIntent', prefill.intent);
        if (prefill.notes) params.set('wishNotes', prefill.notes);
        if (prefill.url) params.set('wishUrl', prefill.url);
        if (prefill.price != null && prefill.price !== '') params.set('wishPrice', String(prefill.price));
        return `/app?${params.toString()}`;
    }

    return {
        CLOSET_DENSITY_KEY,
        CLOSET_LAYOUT_KEY,
        DENSITY_CYCLE,
        DENSITY_LABELS,
        escapeHtml,
        formatApiError,
        formatAuthError,
        errorMessageFromCaught,
        safeUrl,
        closetItemImageUrl,
        readClosetDensity,
        readClosetLayout,
        nextClosetDensity,
        toggleClosetLayoutValue,
        buildClosetGridClassName,
        resolveThemePreference,
        showToast,
        emptyStateMarkup,
        bindEmptyStateCtas,
        parseAppDeepLink,
        buildWishlistTabUrl,
        VALID_APP_TABS,
        CLOSET_FILTER_SECTIONS_KEY,
        FILTER_SECTION_IDS,
        readClosetFilterSections,
        writeClosetFilterSections,
        gapWishlistSeed,
        normalizeClosetSortKey,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClosetWebUtils;
}
if (typeof window !== 'undefined') {
    window.ClosetWebUtils = ClosetWebUtils;
}
