import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const utils = require('./web-utils.js');

describe('escapeHtml', () => {
    it('escapes HTML metacharacters', () => {
        expect(utils.escapeHtml('<script>"\'`/&</script>')).toBe(
            '&lt;script&gt;&quot;&#39;&#96;&#x2F;&amp;&lt;&#x2F;script&gt;'
        );
    });

    it('returns empty string for nullish values', () => {
        expect(utils.escapeHtml(null)).toBe('');
        expect(utils.escapeHtml(undefined)).toBe('');
    });
});

describe('formatApiError', () => {
    it('formats strings and pydantic-style arrays', () => {
        expect(utils.formatApiError('oops')).toBe('oops');
        expect(utils.formatApiError([{ msg: 'bad field' }, 'plain'])).toBe('bad field; plain');
    });

    it('falls back for unknown shapes', () => {
        expect(utils.formatApiError({ msg: 'one' })).toBe('one');
        expect(utils.formatApiError(42)).toBe('42');
    });
});

describe('formatAuthError', () => {
    it('joins validation entries with field paths', () => {
        const detail = [{ loc: ['body', 'password'], msg: 'too short' }];
        expect(utils.formatAuthError(detail)).toBe('password: too short');
    });

    it('returns empty string for nullish detail', () => {
        expect(utils.formatAuthError(null)).toBe('');
    });

    it('handles string entries and object message/detail fields', () => {
        expect(utils.formatAuthError(['plain'])).toBe('plain');
        expect(utils.formatAuthError({ message: 'bad login' })).toBe('bad login');
        expect(utils.formatAuthError({ detail: 'expired' })).toBe('expired');
        expect(utils.formatAuthError({ msg: 'nope' })).toBe('nope');
    });
});

describe('errorMessageFromCaught', () => {
    it('prefers Error.message', () => {
        expect(utils.errorMessageFromCaught(new Error('network'))).toBe('network');
    });

    it('falls back to generic copy', () => {
        expect(utils.errorMessageFromCaught({})).toBe('Something went wrong. Please try again.');
    });
});

describe('safeUrl', () => {
    it('allows https and upload paths (HTML-escaped for attributes)', () => {
        expect(utils.safeUrl('https://cdn.example/x.png')).toContain('https:');
        expect(utils.safeUrl('https://cdn.example/x.png')).toContain('cdn.example');
        expect(utils.safeUrl('/uploads/item_1.webp')).toContain('uploads');
        expect(utils.safeUrl('uploads/item_2.jpg')).toContain('item_2.jpg');
    });

    it('rejects javascript and unknown paths', () => {
        expect(utils.safeUrl('javascript:alert(1)')).toBe('');
        expect(utils.safeUrl('not-a-safe-path')).toBe('');
        expect(utils.safeUrl('')).toBe('');
        expect(utils.safeUrl(null)).toBe('');
    });

    it('accepts bare item filenames and relative paths', () => {
        expect(utils.safeUrl('item_abc123.webp')).toContain('item_abc123.webp');
        expect(utils.safeUrl('./assets/x.png')).toContain('assets');
    });
});

describe('closetItemImageUrl', () => {
    it('prefers thumbnail_path', () => {
        expect(utils.closetItemImageUrl({ thumbnail_path: '/uploads/item_a.webp' })).toContain(
            'item_a.webp'
        );
    });

    it('falls back to image_path and empty item', () => {
        expect(utils.closetItemImageUrl({ image_path: '/uploads/item_b.png' })).toContain('item_b');
        expect(utils.closetItemImageUrl(null)).toBe('');
    });
});

describe('closet density and layout', () => {
    it('cycles density and toggles layout', () => {
        const storage = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
        expect(utils.readClosetDensity(storage)).toBe('comfy');
        storage.setItem(utils.CLOSET_DENSITY_KEY, 'dense');
        expect(utils.readClosetDensity(storage)).toBe('dense');
        storage.setItem(utils.CLOSET_LAYOUT_KEY, 'rails');
        expect(utils.readClosetLayout(storage)).toBe('rails');
        expect(utils.nextClosetDensity('dense')).toBe('list');
        expect(utils.nextClosetDensity('invalid')).toBe('compact');
        expect(utils.toggleClosetLayoutValue('grid')).toBe('rails');
        expect(utils.toggleClosetLayoutValue('rails')).toBe('grid');
        expect(utils.buildClosetGridClassName('compact', 'rails')).toContain('closet-grid--compact');
        expect(utils.buildClosetGridClassName('bogus', 'grid')).toContain('closet-grid--comfy');
    });
});

describe('resolveThemePreference', () => {
    it('maps system and explicit prefs', () => {
        expect(utils.resolveThemePreference('system', true)).toBe('dark');
        expect(utils.resolveThemePreference('dark')).toBe('dark');
        expect(utils.resolveThemePreference('light')).toBe('light');
    });
});

describe('emptyStateMarkup', () => {
    it('includes optional CTA', () => {
        const html = utils.emptyStateMarkup({
            variant: 'closet',
            title: 'Empty',
            message: 'Add items',
            ctaTab: 'upload',
            ctaLabel: 'Upload',
        });
        expect(html).toContain('data-empty-cta="upload"');
        expect(html).toContain('Empty');
    });

    it('omits CTA when tab or label missing', () => {
        const html = utils.emptyStateMarkup({ title: 'Empty' });
        expect(html).not.toContain('data-empty-cta');
    });
});

describe('bindEmptyStateCtas', () => {
    it('invokes onTab when CTA clicked', () => {
        const root = document.createElement('div');
        root.innerHTML = utils.emptyStateMarkup({
            ctaTab: 'upload',
            ctaLabel: 'Go',
        });
        const onTab = vi.fn();
        utils.bindEmptyStateCtas(root, onTab);
        root.querySelector('[data-empty-cta]').click();
        expect(onTab).toHaveBeenCalledWith('upload');
    });

    it('no-ops for invalid args', () => {
        expect(() => utils.bindEmptyStateCtas(null, () => {})).not.toThrow();
    });
});

describe('parseAppDeepLink', () => {
    it('parses tab, pins, and wishlist prefill', () => {
        const q = '?tab=wishlist&pin=1,2,x&openAdd=1&wishName=Coat&wishCategory=Jacket';
        const parsed = utils.parseAppDeepLink(q);
        expect(parsed.tab).toBe('wishlist');
        expect(parsed.pinIds).toEqual([1, 2]);
        expect(parsed.wishlist.openAdd).toBe(true);
        expect(parsed.wishlist.name).toBe('Coat');
    });

    it('ignores invalid tabs', () => {
        expect(utils.parseAppDeepLink('?tab=not-real').tab).toBeNull();
    });
});

describe('buildWishlistTabUrl', () => {
    it('builds query string for wishlist tab', () => {
        const url = utils.buildWishlistTabUrl({ openAdd: true, name: 'Boots', price: 99 });
        expect(url).toContain('tab=wishlist');
        expect(url).toContain('wishName=Boots');
        expect(url).toContain('wishPrice=99');
    });
});

describe('closet filter sections', () => {
    it('reads and writes section expansion state', () => {
        const storage = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
        const defaults = utils.readClosetFilterSections(storage);
        expect(defaults.categories).toBe(true);
        utils.writeClosetFilterSections(storage, { ...defaults, colors: false });
        expect(utils.readClosetFilterSections(storage).colors).toBe(false);
    });

    it('keeps defaults on invalid JSON and survives write failures', () => {
        const storage = {
            data: { [utils.CLOSET_FILTER_SECTIONS_KEY]: 'not-json' },
            getItem(k) {
                return this.data[k] ?? null;
            },
            setItem() {
                throw new Error('quota');
            },
        };
        expect(utils.readClosetFilterSections(storage).closets).toBe(true);
        expect(() => utils.writeClosetFilterSections(storage, {})).not.toThrow();
    });
});

describe('gapWishlistSeed', () => {
    it('maps known gap ids and falls back', () => {
        expect(utils.gapWishlistSeed('outer_layer').category).toBe('Jacket');
        expect(utils.gapWishlistSeed('unknown').subcategory).toBe('Wishlist');
    });
});

describe('normalizeClosetSortKey', () => {
    it('maps legacy web keys to mobile keys', () => {
        expect(utils.normalizeClosetSortKey('most-worn')).toBe('most_worn');
        expect(utils.normalizeClosetSortKey('')).toBe('recent');
    });
});

describe('showToast', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('appends a toast to the container', () => {
        vi.useFakeTimers();
        utils.showToast('Saved', 'success');
        const container = document.getElementById('toast-container');
        expect(container).toBeTruthy();
        expect(container.textContent).toContain('Saved');
        utils.showToast('Again', 'not-a-type');
        expect(container.querySelectorAll('.toast').length).toBe(2);
        utils.showToast(null);
        vi.runAllTimers();
        vi.useRealTimers();
    });
});
