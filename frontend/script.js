// API Base URL
const API_BASE = window.location.origin + '/api';

const _utils = window.ClosetWebUtils;
if (!_utils) {
    throw new Error('ClosetWebUtils failed to load. Hard-refresh the page (Ctrl+Shift+R).');
}

const {
    CLOSET_DENSITY_KEY,
    CLOSET_LAYOUT_KEY,
    DENSITY_LABELS,
    escapeHtml,
    formatApiError,
    safeUrl,
    closetItemImageUrl,
    readClosetDensity: readClosetDensityFromStorage,
    readClosetLayout: readClosetLayoutFromStorage,
    nextClosetDensity,
    toggleClosetLayoutValue,
    buildClosetGridClassName,
} = _utils;

function readClosetDensity() {
    return readClosetDensityFromStorage(localStorage);
}

function readClosetLayout() {
    return readClosetLayoutFromStorage(localStorage);
}

function applyClosetViewClasses() {
    const grid = document.getElementById('closet-grid');
    if (!grid) return;
    const density = readClosetDensity();
    const layout = readClosetLayout();
    grid.className = buildClosetGridClassName(density, layout);
    const densityBtn = document.getElementById('closet-density-btn');
    if (densityBtn) {
        const label = DENSITY_LABELS[density] || 'Density';
        densityBtn.title = `Density: ${label}`;
        densityBtn.setAttribute('aria-label', `Density: ${label}`);
    }
    const layoutBtn = document.getElementById('closet-layout-btn');
    if (layoutBtn) {
        const label = layout === 'rails' ? 'Category rails' : 'Grid';
        layoutBtn.title = `Layout: ${label}`;
        layoutBtn.setAttribute('aria-label', `Layout: ${label}`);
    }
}

function isClosetFilterActive() {
    const category = document.getElementById('category-filter')?.value || '';
    const status = document.getElementById('status-filter')?.value || '';
    const rotation = document.getElementById('rotation-filter')?.value || '';
    const q = document.getElementById('closet-search')?.value?.trim() || '';
    const loc = document.getElementById('closet-location-filter')?.value || '';
    return (
        closetFilterKeys.size > 0 ||
        !!closetColorFilter ||
        !!category ||
        !!status ||
        !!rotation ||
        !!q ||
        !!loc ||
        closetVisualSearchMode
    );
}

function updateClosetStudioMeta(visibleCount, totalCount) {
    const meta = document.getElementById('closet-studio-meta');
    const clearBtn = document.getElementById('closet-studio-clear');
    const refineBtn = document.getElementById('closet-filter-open');
    const filtered = isClosetFilterActive();
    const total = typeof totalCount === 'number' ? totalCount : visibleCount;
    const noun = total === 1 ? 'piece' : 'pieces';

    if (meta) {
        let line = `${visibleCount} ${noun}`;
        if (filtered && visibleCount !== total) {
            line = `${visibleCount} of ${total} ${total === 1 ? 'piece' : 'pieces'}`;
        }
        const sortEl = document.getElementById('sort-by');
        const sortKey = sortEl?.value || 'recent';
        const sortLabels = {
            recent: 'Recently added',
            most_worn: 'Most worn',
            neglected: 'Neglected',
            cpw: 'Best CPW',
            last_worn: 'Last worn',
            least_worn: 'Least worn',
            freshness: 'Freshness',
        };
        line += ` · ${sortLabels[sortKey] || 'Sorted'}`;
        if (filtered) line += ' · filtered';
        meta.textContent = line;
    }
    if (clearBtn) clearBtn.classList.toggle('hidden', !filtered);
    if (refineBtn) refineBtn.classList.toggle('is-active', filtered);
}

function openClosetFilterDrawer() {
    const drawer = document.getElementById('closet-filter-drawer');
    const openBtn = document.getElementById('closet-filter-open');
    if (!drawer) return;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    openBtn?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('closet-filter-drawer-open');
}

function closeClosetFilterDrawer() {
    const drawer = document.getElementById('closet-filter-drawer');
    const openBtn = document.getElementById('closet-filter-open');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    openBtn?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('closet-filter-drawer-open');
}

function initClosetFilterDrawer() {
    document.getElementById('closet-filter-open')?.addEventListener('click', openClosetFilterDrawer);
    document.getElementById('closet-filter-close')?.addEventListener('click', closeClosetFilterDrawer);
    document.getElementById('closet-filter-backdrop')?.addEventListener('click', closeClosetFilterDrawer);
    document.getElementById('closet-filter-apply')?.addEventListener('click', () => {
        closeClosetFilterDrawer();
        loadCloset();
    });
    document.getElementById('closet-studio-clear')?.addEventListener('click', clearAllClosetFilters);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('closet-filter-drawer')?.classList.contains('is-open')) {
            closeClosetFilterDrawer();
        }
    });
}

function cycleClosetDensity() {
    const next = nextClosetDensity(readClosetDensity());
    localStorage.setItem(CLOSET_DENSITY_KEY, next);
    applyClosetViewClasses();
    loadCloset();
}

function toggleClosetLayout() {
    const next = toggleClosetLayoutValue(readClosetLayout());
    localStorage.setItem(CLOSET_LAYOUT_KEY, next);
    applyClosetViewClasses();
    loadCloset();
}


// State
const CLOSET_SORT_KEY = 'closet_web_sort';
let currentTab = 'closet';
let activeCarePane = 'laundry';
let closetFilterKeys = new Set();
let closetColorFilter = '';
let closetSelectedItemId = null;
let closetKeyboardFocusId = null;
let closetVisualSearchMode = false;
let lastUploadedItemId = null;
let selectedFile = null;
let currentUser = null;
let authToken = null;

function isDesktopCloset() {
    return window.matchMedia('(min-width: 1024px)').matches;
}

function syncFilterToggleUi() {
    document.querySelectorAll('[data-filter-key]').forEach((chip) => {
        const key = chip.dataset.filterKey;
        chip.classList.toggle('active', closetFilterKeys.has(key));
    });
}

function syncStatusSelectFromFilterKeys() {
    const statusEl = document.getElementById('status-filter');
    if (!statusEl) return;
    const hasClean = closetFilterKeys.has('clean');
    const hasWash = closetFilterKeys.has('wash');
    if (hasClean && !hasWash) statusEl.value = 'clean';
    else if (hasWash && !hasClean) statusEl.value = 'dirty';
    else statusEl.value = '';
}

function applyClosetClientFilters(items) {
    return items.filter((item) => {
        if (closetFilterKeys.has('clean') && !item.washed) return false;
        if (closetFilterKeys.has('wash') && item.washed) return false;
        if (closetFilterKeys.has('favorites') && !item.is_favorite) return false;
        if (closetFilterKeys.has('lent') && !item.lent_to) return false;
        if (closetFilterKeys.has('packed') && !item.packed_for_trip) return false;
        return true;
    });
}

function closetHasActiveFilters() {
    const category = document.getElementById('category-filter')?.value || '';
    const rotation = document.getElementById('rotation-filter')?.value || '';
    const q = document.getElementById('closet-search')?.value.trim() || '';
    const loc = document.getElementById('closet-location-filter')?.value || '';
    return (
        closetFilterKeys.size > 0 ||
        !!closetColorFilter ||
        !!category ||
        !!rotation ||
        !!q ||
        !!loc
    );
}

function clearAllClosetFilters() {
    closetFilterKeys.clear();
    closetColorFilter = '';
    closetVisualSearchMode = false;
    const category = document.getElementById('category-filter');
    const status = document.getElementById('status-filter');
    const rotation = document.getElementById('rotation-filter');
    const search = document.getElementById('closet-search');
    const loc = document.getElementById('closet-location-filter');
    if (category) category.value = '';
    if (status) status.value = '';
    if (rotation) rotation.value = '';
    if (search) search.value = '';
    if (loc) loc.value = '';
    syncChipsFromSelects();
    syncFilterToggleUi();
    document.querySelectorAll('.color-chip').forEach((c) => {
        c.classList.toggle('active', !c.dataset.color);
    });
    setVisualSearchMode(false);
    updateClosetLocationBadge();
    loadCloset();
}

function updateClosetLocationBadge() {
    const badge = document.getElementById('closet-location-badge');
    const locSel = document.getElementById('closet-location-filter');
    if (!badge || !locSel) return;
    if (!locSel.value) {
        badge.classList.add('hidden');
        badge.textContent = '';
        locSel.classList.remove('filter-select--active');
        return;
    }
    const label = locSel.options[locSel.selectedIndex]?.text || 'Location';
    badge.textContent = `Showing: ${label}`;
    badge.classList.remove('hidden');
    locSel.classList.add('filter-select--active');
}

function closeClosetDetailPane() {
    closetSelectedItemId = null;
    document.getElementById('closet-detail-pane')?.classList.add('hidden');
    document.getElementById('closet-tab')?.classList.remove('closet-has-detail');
    document.querySelectorAll('.clothing-card.is-selected, .rail-card.is-selected').forEach((el) => {
        el.classList.remove('is-selected');
    });
}

function highlightClosetCard(itemId) {
    closetKeyboardFocusId = itemId || null;
    document.querySelectorAll('.clothing-card, .rail-card').forEach((card) => {
        const id = Number(card.dataset.itemId);
        const selected = id === itemId;
        card.classList.toggle('is-selected', selected);
        card.classList.toggle('is-keyboard-focus', selected && itemId != null);
    });
}

function getClosetGridCards() {
    const grid = document.getElementById('closet-grid');
    if (!grid) return [];
    return [...grid.querySelectorAll('.clothing-card, .rail-card')];
}

function moveClosetGridFocus(delta) {
    const cards = getClosetGridCards();
    if (!cards.length) return;
    let idx = cards.findIndex((c) => c.classList.contains('is-keyboard-focus'));
    if (idx < 0 && closetKeyboardFocusId) {
        idx = cards.findIndex((c) => Number(c.dataset.itemId) === closetKeyboardFocusId);
    }
    if (idx < 0) idx = 0;
    else idx = Math.max(0, Math.min(cards.length - 1, idx + delta));
    const itemId = Number(cards[idx].dataset.itemId);
    highlightClosetCard(itemId);
    cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setOutfitsContainerEmpty(container, opts) {
    container.classList.remove('outfits-container--has-results');
    container.innerHTML = ClosetWebUtils.emptyStateMarkup(opts);
    ClosetWebUtils.bindEmptyStateCtas(container, (tab) => showTab(tab));
}

function seedOutfitsEmptyIfNeeded() {
    const container = document.getElementById('outfits-container');
    if (!container || container.dataset.seeded || container.querySelector('.outfit-card')) return;
    setOutfitsContainerEmpty(container, {
        variant: 'outfits',
        title: 'Ready when you are',
        message: 'Generate outfits from your clean closet, or ask the AI stylist.',
    });
    container.dataset.seeded = '1';
}

function renderClosetEmptyState() {
    const filtered = closetHasActiveFilters();
    if (filtered) {
        return `<div class="empty-state empty-state--closet">
            <p>No items match your filters.</p>
            <p class="hint-text">Try clearing filters or broadening your search.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="closet-empty-clear">Clear filters</button>
        </div>`;
    }
    return `<div class="empty-state empty-state--closet">
        <svg class="empty-state-illustration" viewBox="0 0 120 100" width="120" height="100" aria-hidden="true">
            <rect x="20" y="25" width="80" height="55" rx="8" fill="var(--color-accent-soft)" stroke="var(--primary-color)" stroke-width="2"/>
            <path d="M35 45h50M35 58h35" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="88" cy="38" r="10" fill="var(--card-bg)" stroke="var(--primary-color)" stroke-width="2"/>
        </svg>
        <p>Your closet is empty</p>
        <p class="hint-text">Add your first piece to start building outfits.</p>
        <button type="button" class="btn btn-primary btn-sm" id="closet-empty-add">Add clothing</button>
    </div>`;
}

function setVisualSearchMode(on, label) {
    closetVisualSearchMode = on;
    const strip = document.getElementById('visual-search-strip');
    const labelEl = document.getElementById('visual-search-strip-label');
    if (!strip) return;
    strip.classList.toggle('hidden', !on);
    if (labelEl && label) labelEl.textContent = label;
}

function initClosetShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (currentTab !== 'closet') return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) {
            if (e.key !== 'Escape') return;
        }
        if (e.key === '/' && tag !== 'INPUT') {
            e.preventDefault();
            document.getElementById('closet-search')?.focus();
            return;
        }
        if (e.key === 'Escape') {
            if (closetVisualSearchMode) {
                clearAllClosetFilters();
                return;
            }
            if (closetSelectedItemId) {
                closeClosetDetailPane();
                closeModal();
            }
            return;
        }
        if (e.key === 'Enter' && closetKeyboardFocusId) {
            e.preventDefault();
            showItemModal(closetKeyboardFocusId);
            return;
        }
        const arrowMap = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
        if (arrowMap[e.key] != null) {
            e.preventDefault();
            moveClosetGridFocus(arrowMap[e.key]);
        }
    });
    document.getElementById('visual-search-clear')?.addEventListener('click', () => {
        clearAllClosetFilters();
    });
    document.getElementById('closet-clear-filters')?.addEventListener('click', clearAllClosetFilters);
}

// ---- XSS defence ------------------------------------------------------------
// escapeHtml / safeUrl live in /frontend/lib/web-utils.js (shared with Vitest).

async function apiFetch(path, options = {}) {
    const headers = {
        Accept: 'application/json',
        ...(options.headers || {}),
    };
    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const text = await res.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    if (!res.ok) {
        const detail =
            body && typeof body === 'object' && body !== null && 'detail' in body
                ? body.detail
                : body;
        throw new Error(formatApiError(detail));
    }
    return body;
}

async function refreshCurrentUser() {
    currentUser = await apiFetch('/auth/me');
    localStorage.setItem('user', JSON.stringify(currentUser));
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication().catch((err) => {
        console.error('checkAuthentication failed:', err);
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/frontend/login.html';
    });
});

// Authentication Check
async function checkAuthentication() {
    authToken = localStorage.getItem('access_token');
    
    if (!authToken) {
        window.location.href = '/frontend/login.html';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Authentication failed');
        }
        
        currentUser = await response.json();
        initializeApp();
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/frontend/login.html';
    }
}

function showFatalAppError(message) {
    let banner = document.getElementById('app-fatal-error');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'app-fatal-error';
        banner.className = 'error-message';
        banner.style.margin = '1rem';
        document.querySelector('.main .container')?.prepend(banner);
    }
    if (banner) {
        banner.textContent = message;
        banner.classList.remove('hidden');
    }
}

// Initialize App
function initializeApp() {
    // Expose API before any code that calls window.ClosetApp (e.g. applySocialNav in updateUserDisplay).
    window.ClosetApp = {
        API_BASE,
        authToken,
        get currentUser() {
            return currentUser;
        },
        escapeHtml,
        safeUrl,
        closetItemImageUrl,
        formatApiError,
        apiFetch,
        showTab,
        showCarePane,
        activeCarePane,
        loadCloset,
        generateOutfits,
        showToast,
        updateUserDisplay,
        refreshCurrentUser,
        applyThemePreference,
        loadOutfitsPlannedPreview: () =>
            window.ClosetFeatures?.loadOutfitsPlannedPreview?.(),
        isDesktopCloset,
        closeClosetDetailPane,
        setVisualSearchMode,
        clearAllClosetFilters,
        showConfirmDialog,
        openAppModal,
        closeAppModal,
        closeModal,
        getSelectedUploadFile: () => selectedFile,
        navigateToWishlistPrefill: (prefill) => {
            window.ClosetFeatures?.applyWishlistPrefill?.(prefill);
            showTab('wishlist');
        },
    };

    try {
        updateUserDisplay();
        initNavigation();
        initUpload();
        initThemeToggle();
        initUserMenu();
        initProfile();
        initClosetFilterUi();
        initClosetShortcuts();
        initCareSubnav();
        initItemModal();
        initAppDialogs();
    } catch (err) {
        console.error('initializeApp setup failed:', err);
        showFatalAppError(
            err instanceof Error ? err.message : 'Could not start the app. Try a hard refresh.'
        );
    }

    try {
        if (window.ClosetFeatures) {
            window.ClosetFeatures.init();
            window.ClosetFeatures.loadProfileHub();
            window.ClosetFeatures.loadOutfitsPlannedPreview();
            window.ClosetFeatures.loadOnboardingBanner?.();
        }
        if (window.ClosetUpgrade) {
            window.ClosetUpgrade.init();
        }
        if (window.ClosetUpload) {
            window.ClosetUpload.init();
        }
    } catch (err) {
        console.error('Feature modules init failed:', err);
    }

    applyClosetViewClasses();

    const deep = ClosetWebUtils.parseAppDeepLink(window.location.search);
    let startTab = deep.tab;
    if (!startTab) {
        startTab = currentUser?.social_enabled !== false ? 'feed' : 'closet';
    }
    const startOptions = {};
    if (deep.pinIds.length) {
        startOptions.pinItemId = deep.pinIds.length === 1 ? deep.pinIds[0] : deep.pinIds;
    }
    if (deep.wishlist && (deep.wishlist.openAdd || deep.wishlist.name)) {
        startOptions.wishlistPrefill = deep.wishlist;
    }
    showTab(startTab, startOptions);

    // Defer welcome popup until shell layout has painted.
    setTimeout(() => window.ClosetOnboarding?.maybeShow?.(), 120);

    loadCloset().catch((err) => {
        console.error('loadCloset failed:', err);
        const grid = document.getElementById('closet-grid');
        if (grid) {
            grid.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p><button type="button" class="btn btn-secondary btn-sm" id="closet-retry-btn">Retry</button></div>`;
            document.getElementById('closet-retry-btn')?.addEventListener('click', () => loadCloset());
        }
    });

    seedOutfitsEmptyIfNeeded();
    document.getElementById('generate-outfits-btn')?.addEventListener('click', () => generateOutfits());
    const reshuffleBtn = document.getElementById('reshuffle-outfits-btn');
    if (reshuffleBtn) {
        reshuffleBtn.addEventListener('click', () => generateOutfits({ forceSeed: true }));
    }
    document.getElementById('refresh-laundry-btn')?.addEventListener('click', loadLaundry);
    document.getElementById('refresh-insights-btn')?.addEventListener('click', loadInsights);
    document.getElementById('neglect-days-filter')?.addEventListener('change', loadInsights);

    const searchInput = document.getElementById('closet-search');
    if (searchInput) {
        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadCloset, 300);
        });
    }

}

// Update User Display
function updateUserDisplay() {
    if (!currentUser) return;
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');
    const profileInitials = document.getElementById('profile-initials');

    const display = currentUser.full_name || currentUser.username || 'User';
    if (userName) userName.textContent = display;

    const initials = display
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);

    if (userInitials) userInitials.textContent = initials;
    if (profileInitials) profileInitials.textContent = initials;

    const feedBtn = document.querySelector('.header .nav-btn--feed');
    const socialOn = currentUser.social_enabled !== false;
    if (feedBtn) feedBtn.classList.toggle('hidden', !socialOn);
    document.querySelectorAll('.mobile-tab-bar .nav-btn--feed').forEach((btn) => {
        btn.classList.toggle('hidden', !socialOn);
    });
    if (window.ClosetFeatures?.applySocialNav) {
        window.ClosetFeatures.applySocialNav();
    }
}

function resolveThemePreference(pref) {
    if (pref === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (window.ClosetWebUtils?.resolveThemePreference) {
        return window.ClosetWebUtils.resolveThemePreference(pref);
    }
    return pref === 'dark' ? 'dark' : 'light';
}

function applyThemePreference(pref) {
    const resolved = resolveThemePreference(pref || 'light');
    document.documentElement.setAttribute('data-theme', resolved);
    updateThemeIcon(resolved);
}

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    const savedTheme = currentUser.theme_preference || 'light';
    applyThemePreference(savedTheme);

    if (savedTheme === 'system') {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            applyThemePreference('system');
        });
    }

    themeToggle.addEventListener('click', async () => {
        const currentResolved = document.documentElement.getAttribute('data-theme');
        const newTheme = currentResolved === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        updateThemeIcon(newTheme);

        try {
            await fetch(`${API_BASE}/settings`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ theme_preference: newTheme })
            });
            currentUser.theme_preference = newTheme;
        } catch (error) {
            console.error('Failed to save theme preference:', error);
        }
    });
}

function updateThemeIcon(theme) {
    const isDark = theme === 'dark';
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    const moon = document.querySelector('.theme-icon-moon');
    const sun = document.querySelector('.theme-icon-sun');
    if (moon) moon.classList.toggle('hidden', isDark);
    if (sun) sun.classList.toggle('hidden', !isDark);
}

// User Menu
function initUserMenu() {
    const userProfileBtn = document.getElementById('user-profile-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');
    if (!userProfileBtn || !dropdownMenu || !logoutBtn) return;
    
    userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
    });
    
    // Prevent dropdown from closing when clicking inside it
    dropdownMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Logout
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/frontend/login.html';
    });
    
    // Profile menu item
    const profileMenuItem = dropdownMenu.querySelector('[data-tab="profile"]');
    if (!profileMenuItem) return;
    profileMenuItem.addEventListener('click', (e) => {
        e.preventDefault();
        showTab('profile');
        dropdownMenu.classList.add('hidden');
        
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    });
}

// Profile Management
function initProfile() {
    const profileForm = document.getElementById('profile-form');
    if (!profileForm) return;
    
    // Load profile data
    loadProfileData();
    
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('profile-full-name').value;
        const bio = document.getElementById('profile-bio').value;
        
        try {
            const response = await fetch(`${API_BASE}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: fullName,
                    bio: bio
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update profile');
            }
            
            showProfileMessage('Profile updated successfully!', 'success');
            
            // Refresh user data
            const userResponse = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            currentUser = await userResponse.json();
            updateUserDisplay();
            
        } catch (error) {
            showProfileMessage('Failed to update profile', 'error');
        }
    });
}

function loadProfileData() {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };

    setText('profile-username', currentUser.username || '');
    setText('profile-email', currentUser.email || '');
    setValue('profile-full-name', currentUser.full_name || '');
    setValue('profile-bio', currentUser.bio || '');

    if (currentUser.created_at) {
        setText(
            'profile-created',
            new Date(currentUser.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
        );
    } else {
        setText('profile-created', '—');
    }

    if (currentUser.last_login) {
        setText(
            'profile-last-login',
            new Date(currentUser.last_login).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
        );
    } else {
        setText('profile-last-login', '—');
    }
}

function showProfileMessage(message, type) {
    const messageDiv = document.getElementById('profile-message');
    messageDiv.textContent = message;
    messageDiv.className = `profile-message ${type}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 3000);
}

// Navigation
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show corresponding tab
            const tab = btn.dataset.tab;
            showTab(tab);
        });
    });
}

function showTab(tabName, options = {}) {
    currentTab = tabName;
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach((tab) => tab.classList.remove('active'));
    const tabEl = document.getElementById(`${tabName}-tab`);
    if (tabEl) {
        tabEl.classList.add('active');
    }

    const mainTabs = ['feed', 'closet', 'upload', 'outfits', 'profile'];
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        const isMain = mainTabs.includes(btn.dataset.tab);
        if (!isMain) return;
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    if (tabName === 'closet') {
        loadCloset();
        window.ClosetFeatures?.loadOnboardingBanner?.();
    } else if (tabName === 'care') {
        showCarePane(activeCarePane || 'laundry');
    } else if (tabName === 'profile') {
        loadProfileData();
    } else if (tabName === 'outfits') {
        window.ClosetFeatures?.loadOutfitsPlannedPreview?.();
        window.ClosetUpgrade?.populateAiStylistPins?.();
    } else if (tabName === 'feed') {
        window.ClosetFeatures?.loadFeed?.(false);
    }

    window.ClosetFeatures?.onTabShown?.(tabName, options);
}

function showCarePane(paneName) {
    activeCarePane = paneName;
    document.querySelectorAll('.care-pane').forEach(p => p.classList.remove('active'));
    const pane = document.getElementById(`care-pane-${paneName}`);
    if (pane) pane.classList.add('active');

    document.querySelectorAll('.care-subnav-btn').forEach(b => {
        const on = b.dataset.carePane === paneName;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (paneName === 'laundry') {
        loadLaundry();
    } else if (paneName === 'insights') {
        loadInsights();
    } else if (paneName === 'stats') {
        loadStats();
    }
}

function initCareSubnav() {
    document.querySelectorAll('.care-subnav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showCarePane(btn.dataset.carePane);
        });
    });
}

function setChipGroupActive(group, value) {
    document.querySelectorAll(`[data-chip-group="${group}"]`).forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.value === value);
    });
}

function syncChipsFromSelects() {
    const category = document.getElementById('category-filter');
    const rotation = document.getElementById('rotation-filter');
    if (!category || !rotation) return;
    setChipGroupActive('category', category.value);
    setChipGroupActive('rotation', rotation.value);
    syncFilterToggleUi();
}

function initClosetFilterSections() {
    const sections = ClosetWebUtils.readClosetFilterSections(localStorage);
    document.querySelectorAll('[data-filter-section]').forEach((section) => {
        const id = section.dataset.filterSection;
        const expanded = sections[id] !== false;
        const toggle = section.querySelector('.filter-section-toggle');
        const body = section.querySelector('.filter-section-body');
        if (body) body.classList.toggle('hidden', !expanded);
        if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggle?.addEventListener('click', () => {
            const nextExpanded = body?.classList.contains('hidden');
            if (body) body.classList.toggle('hidden', !nextExpanded);
            toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
            const next = { ...ClosetWebUtils.readClosetFilterSections(localStorage), [id]: nextExpanded };
            ClosetWebUtils.writeClosetFilterSections(localStorage, next);
        });
    });
}

function syncClosetLocationFilters(fromEl, toEl) {
    if (!fromEl || !toEl || fromEl === toEl) return;
    toEl.innerHTML = fromEl.innerHTML;
    toEl.value = fromEl.value;
}

function initClosetFilterUi() {
    const onSelectFiltersChange = () => {
        syncChipsFromSelects();
        loadCloset();
    };

    ['category-filter', 'status-filter', 'rotation-filter'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', onSelectFiltersChange);
    });

    const sortEl = document.getElementById('sort-by');
    if (sortEl) {
        const savedRaw = localStorage.getItem(CLOSET_SORT_KEY);
        const savedSort = ClosetWebUtils.normalizeClosetSortKey(savedRaw);
        if (savedSort && sortEl.querySelector(`option[value="${savedSort}"]`)) {
            sortEl.value = savedSort;
            if (savedRaw !== savedSort) localStorage.setItem(CLOSET_SORT_KEY, savedSort);
        }
        sortEl.addEventListener('change', () => {
            localStorage.setItem(CLOSET_SORT_KEY, sortEl.value);
            loadCloset();
        });
    }

    initClosetFilterSections();
    initClosetFilterDrawer();

    const locRail = document.getElementById('closet-location-filter-rail');
    const locToolbar = document.getElementById('closet-location-filter');
    if (locRail && locToolbar) {
        const syncLoc = (source, target) => {
            if (target.options.length !== source.options.length) {
                target.innerHTML = source.innerHTML;
            }
            target.value = source.value;
        };
        locToolbar.addEventListener('change', () => {
            syncLoc(locToolbar, locRail);
            updateClosetLocationBadge();
            loadCloset();
        });
        locRail.addEventListener('change', () => {
            syncLoc(locRail, locToolbar);
            updateClosetLocationBadge();
            loadCloset();
        });
    }

    document.querySelectorAll('[data-filter-key]').forEach((chip) => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.filterKey;
            if (closetFilterKeys.has(key)) closetFilterKeys.delete(key);
            else closetFilterKeys.add(key);
            syncFilterToggleUi();
            syncStatusSelectFromFilterKeys();
            loadCloset();
        });
    });

    document.querySelectorAll('.filter-chip[data-chip-group]').forEach((chip) => {
        chip.addEventListener('click', () => {
            const group = chip.dataset.chipGroup;
            const value = chip.dataset.value;
            const map = {
                category: 'category-filter',
                rotation: 'rotation-filter',
            };
            const selectId = map[group];
            if (!selectId) return;
            document.getElementById(selectId).value = value;
            setChipGroupActive(group, value);
            loadCloset();
        });
    });

    document.getElementById('closet-location-filter')?.addEventListener('change', () => {
        updateClosetLocationBadge();
        loadCloset();
    });

    document.querySelectorAll('input[name="outfit-source"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.source-chip').forEach((label) => {
                const input = label.querySelector('input[name="outfit-source"]');
                label.classList.toggle('active', input && input.checked);
            });
        });
    });

    const moreBtn = document.getElementById('closet-filter-more');
    const panel = document.getElementById('closet-filter-panel');
    if (moreBtn && panel) {
        moreBtn.addEventListener('click', () => {
            const opening = panel.classList.contains('hidden');
            panel.classList.toggle('hidden', !opening ? false : true);
            moreBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
        });
    }

    syncChipsFromSelects();

    document.getElementById('closet-density-btn')?.addEventListener('click', cycleClosetDensity);
    document.getElementById('closet-layout-btn')?.addEventListener('click', toggleClosetLayout);

    document.querySelectorAll('.color-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const color = chip.dataset.color || '';
            document.querySelectorAll('.color-chip').forEach((c) => {
                c.classList.toggle('active', c === chip);
            });
            closetColorFilter = color;
            loadCloset();
        });
    });
}

// Upload functionality
function initUpload() {
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    const chooseImageBtn = document.getElementById('choose-image-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const addAnotherBtn = document.getElementById('add-another-btn');
    if (!fileInput || !uploadArea || !uploadBtn || !cancelBtn || !addAnotherBtn) {
        return;
    }

    const openFilePicker = () => fileInput.click();

    if (chooseImageBtn && fileInput) {
        chooseImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openFilePicker();
        });
    }

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', (e) => {
            if (e.target.closest('#choose-image-btn')) return;
            openFilePicker();
        });
    }
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-color)';
        handleFileSelect(e.dataTransfer.files[0]);
    });
    
    // Upload button
    uploadBtn.addEventListener('click', uploadClothing);
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        resetUpload();
    });
    
    // Add another button
    addAnotherBtn.addEventListener('click', () => {
        resetUpload();
        showTab('upload');
    });

    document.getElementById('view-closet-btn')?.addEventListener('click', () => {
        showTab('closet');
        if (lastUploadedItemId) {
            showItemModal(lastUploadedItemId);
        }
    });
}

function handleFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) {
        showToast('Please select an image file');
        return;
    }
    
    selectedFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-image').src = e.target.result;
        document.getElementById('upload-area').classList.add('hidden');
        document.getElementById('upload-preview').classList.remove('hidden');
        document.getElementById('classification-result').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

async function uploadClothing() {
    if (!selectedFile) return;
    
    const uploadBtn = document.getElementById('upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Classifying...';
    
    const formData = new FormData();
    formData.append('files', selectedFile);
    
    try {
        const response = await fetch(`${API_BASE}/upload-clothing`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const bodyText = await response.text();
        const contentType = response.headers.get('content-type') || '';
        let data = {};
        if (contentType.includes('application/json') && bodyText) {
            try {
                data = JSON.parse(bodyText);
            } catch {
                showToast(
                    'Upload failed: server returned invalid JSON (HTTP ' +
                        response.status +
                        ').'
                );
                return;
            }
        } else if (!response.ok) {
            const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 120);
            showToast(
                'Upload failed: HTTP ' +
                    response.status +
                    (snippet ? ' — ' + snippet : '') +
                    (response.status === 504 || response.status === 502
                        ? ' (server timed out — first upload can take several minutes; retry after fixing nginx timeouts)'
                        : '')
            );
            return;
        }

        if (response.ok) {
            lastUploadedItemId = data.item_id != null ? Number(data.item_id) : null;
            showClassificationResult(data);
            loadCloset();
            showToast('Item added to your closet');
        } else {
            showToast('Upload failed: ' + formatApiError(data.detail));
        }
    } catch (error) {
        showToast('Upload failed: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload & Classify';
    }
}

function showClassificationResult(data) {
    const resultDiv = document.getElementById('classification-result');
    const detailsDiv = resultDiv.querySelector('.result-details');
    
    const c = data.classification || {};
    let dupHtml = '';
    if (data.duplicate_hint) {
        const hint = data.duplicate_hint;
        const msg =
            hint.message ||
            (hint.item_id
                ? `Similar to item #${hint.item_id}${hint.score != null ? ` (${Math.round(hint.score * 100)}%)` : ''}`
                : 'Similar item detected');
        dupHtml = `<div class="result-row warn-text"><span class="result-label">Duplicate check:</span><span class="result-value">${escapeHtml(msg)}</span></div>`;
    }
    detailsDiv.innerHTML = `
        ${dupHtml}
        <div class="result-row">
            <span class="result-label">Category:</span>
            <span class="result-value">${escapeHtml(c.category)}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Subcategory:</span>
            <span class="result-value">${escapeHtml(c.subcategory)}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Style:</span>
            <span class="result-value">${escapeHtml(c.style)}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Season:</span>
            <span class="result-value">${escapeHtml(c.season)}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Colors:</span>
            <span class="result-value">${escapeHtml((c.colors || []).join(', '))}</span>
        </div>
    `;
    window.ClosetUpload?.showBulkSuggestion?.(c);

    document.getElementById('upload-preview').classList.add('hidden');
    resultDiv.classList.remove('hidden');
}

function resetUpload() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('upload-preview').classList.add('hidden');
    document.getElementById('classification-result').classList.add('hidden');
    document.getElementById('bulk-suggest-banner')?.classList.add('hidden');
    document.getElementById('upload-photo-wishlist-panel')?.classList.add('hidden');
    ['photo-wish-name', 'photo-wish-price', 'photo-wish-url', 'photo-wish-notes'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const intentEl = document.getElementById('photo-wish-intent');
    if (intentEl) intentEl.value = 'want';
}

// Load closet items
async function loadCloset() {
    const grid = document.getElementById('closet-grid');
    if (!grid) return;

    if (!closetVisualSearchMode) {
        grid.innerHTML = '<div class="loading">Loading your closet...</div>';
    }

    const category = document.getElementById('category-filter')?.value || '';
    syncStatusSelectFromFilterKeys();
    const status = document.getElementById('status-filter')?.value || '';
    const rotation = document.getElementById('rotation-filter')?.value || '';
    const sortBy = document.getElementById('sort-by')?.value || 'recent';

    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    const searchEl = document.getElementById('closet-search');
    const q = searchEl ? searchEl.value.trim() : '';
    if (q) params.append('q', q);
    const locSel = document.getElementById('closet-location-filter');
    if (locSel && locSel.value) params.append('closet_location_id', locSel.value);

    const query = params.toString();
    const path = query ? `/closet?${query}` : '/closet';

    try {
        if (!authToken) {
            throw new Error('Not signed in');
        }

        const data = await apiFetch(path);
        let items = Array.isArray(data.items) ? data.items : [];
        const totalBeforeClient = items.length;

        items = applyClosetClientFilters(items);

        if (rotation) {
            items = items.filter((item) => (item.rotation_category || 'new') === rotation);
        }

        if (closetColorFilter) {
            items = items.filter((item) =>
                (item.colors || []).some((c) => c === closetColorFilter)
            );
        }

        items = sortItems(items, sortBy);
        updateClosetLocationBadge();
        updateClosetStudioMeta(items.length, totalBeforeClient);

        applyClosetViewClasses();
        const layout = readClosetLayout();

        if (items.length === 0) {
            grid.classList.add('is-empty-stage');
            grid.innerHTML = renderClosetEmptyState();
            document.getElementById('closet-empty-add')?.addEventListener('click', () => showTab('upload'));
            document.getElementById('closet-empty-clear')?.addEventListener('click', clearAllClosetFilters);
            if (closetSelectedItemId) closeClosetDetailPane();
            return;
        }

        grid.classList.remove('is-empty-stage');
        if (layout === 'rails') {
            grid.innerHTML = renderClosetRails(items);
        } else {
            grid.innerHTML = items.map((item) => createClothingCard(item)).join('');
        }

        if (closetSelectedItemId) {
            highlightClosetCard(closetSelectedItemId);
        }

        bindClosetCardInteractions(grid);
    } catch (error) {
        console.error('Error loading closet:', error);
        const msg = error instanceof Error ? error.message : 'Failed to load closet';
        grid.innerHTML = `<div class="empty-state"><p>${escapeHtml(msg)}</p><button type="button" class="btn btn-secondary btn-sm" id="closet-retry-btn">Retry</button></div>`;
        document.getElementById('closet-retry-btn')?.addEventListener('click', () => loadCloset());
    }
}

function renderClosetRails(items) {
    const order = ['Top', 'Bottom', 'Dress', 'Footwear', 'Accessory', 'Other'];
    const buckets = new Map();
    items.forEach((item) => {
        const key = item.category || 'Other';
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(item);
    });
    const keys = [...buckets.keys()].sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        const ar = ai === -1 ? order.length : ai;
        const br = bi === -1 ? order.length : bi;
        if (ar !== br) return ar - br;
        return a.localeCompare(b);
    });
    return keys
        .map((key) => {
            const sectionItems = buckets.get(key) || [];
            const cards = sectionItems
                .map((item) => {
                    const id = Number(item.id);
                    const thumb = closetItemImageUrl(item);
                    const bulk =
                        item.is_bulk && item.quantity
                            ? `<span class="rail-bulk">×${Number(item.quantity)}</span>`
                            : '';
                    return `<button type="button" class="rail-card" data-item-id="${id}">
                        ${thumb ? `<img src="${thumb}" alt="">` : ''}
                        <span class="rail-card-title">${escapeHtml(item.subcategory)}</span>
                        ${bulk}
                        ${cardQuickActionsMarkup(item)}
                    </button>`;
                })
                .join('');
            return `<section class="closet-rail-section"><h3 class="closet-rail-heading">${escapeHtml(key)}</h3><div class="closet-rail-track">${cards}</div></section>`;
        })
        .join('');
}

function sortItems(items, sortBy) {
    const sorted = [...items];
    const key = ClosetWebUtils.normalizeClosetSortKey(sortBy);

    switch (key) {
        case 'last_worn':
            return sorted.sort((a, b) => {
                if (!a.last_worn) return -1;
                if (!b.last_worn) return 1;
                return new Date(a.last_worn) - new Date(b.last_worn);
            });

        case 'most_worn':
            return sorted.sort((a, b) => (b.times_worn || 0) - (a.times_worn || 0));

        case 'least_worn':
            return sorted.sort((a, b) => (a.times_worn || 0) - (b.times_worn || 0));

        case 'neglected':
            return sorted.sort((a, b) => {
                const aa = a.last_worn ?? '';
                const bb = b.last_worn ?? '';
                if (aa === '' && bb === '') return 0;
                if (aa === '') return -1;
                if (bb === '') return 1;
                return aa.localeCompare(bb);
            });

        case 'cpw':
            return sorted.sort((a, b) => {
                const cpwA = a.cost_per_wear ?? null;
                const cpwB = b.cost_per_wear ?? null;
                if (cpwA === null && cpwB === null) return 0;
                if (cpwA === null) return 1;
                if (cpwB === null) return -1;
                return cpwA - cpwB;
            });

        case 'freshness':
            return sorted.sort((a, b) => {
                const fA = a.freshness_score || 1.0;
                const fB = b.freshness_score || 1.0;
                return fB - fA;
            });

        case 'recent':
        default:
            return sorted.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
    }
}

function createClothingCard(item) {
    const colorSwatches = (item.colors || []).map(color =>
        `<div class="color-swatch" style="background-color: ${escapeHtml(color)}"></div>`
    ).join('');
    
    // Status badge with multi-wear tracking
    let statusBadge, statusClass;
    const wearCount = item.wear_again_count || 0;
    const maxWear = item.max_wear_before_wash || 1;
    
    if (item.physical_location === 'laundry') {
        statusBadge = '🧺 In Laundry';
        statusClass = 'status-laundry';
    } else if (wearCount === 0 && item.washed) {
        statusBadge = '✓ Ready';
        statusClass = 'status-clean';
    } else if (wearCount > 0 && wearCount < maxWear) {
        statusBadge = `🔄 Wear ${wearCount}/${maxWear}`;
        statusClass = 'status-wear-again';
    } else if (wearCount >= maxWear || !item.washed) {
        statusBadge = '⚠ Needs Wash';
        statusClass = 'status-dirty';
    } else {
        statusBadge = '✓ Clean';
        statusClass = 'status-clean';
    }
    
    // Rotation indicator
    const rotationCategory = item.rotation_category || 'new';
    let rotationBadge = '';
    if (rotationCategory === 'high') {
        rotationBadge = '<span class="rotation-badge rotation-high">⭐ High Use</span>';
    } else if (rotationCategory === 'neglected') {
        rotationBadge = '<span class="rotation-badge rotation-neglected">😴 Neglected</span>';
    }
    if (item.packed_for_trip) {
        rotationBadge += '<span class="rotation-badge">🧳 Packed</span>';
    }
    if (item.lent_to) {
        rotationBadge += '<span class="rotation-badge rotation-neglected">On loan</span>';
    }
    
    // Cost per wear
    const cpwBadge = item.cost_per_wear 
        ? `<span class="cpw-badge">💰 $${item.cost_per_wear}/wear</span>`
        : '';
    
    // Days since worn
    const daysSince = item.days_since_worn !== null && item.days_since_worn !== undefined
        ? `<span class="days-badge">📅 ${item.days_since_worn}d ago</span>`
        : '';
    
    // Freshness score
    const freshness = item.freshness_score || 1.0;
    const freshnessPercent = Math.round(freshness * 100);
    const freshnessClass = freshnessPercent >= 80 ? 'fresh-high' : 
                          freshnessPercent >= 60 ? 'fresh-medium' : 'fresh-low';
    
    // Favorite star
    const favoriteIcon = item.is_favorite 
        ? '<span class="favorite-star favorite-active" title="Favorite">⭐</span>'
        : '<span class="favorite-star" title="Add to favorites">☆</span>';
    
    const itemId = Number(item.id) || 0;
    return `
        <div class="clothing-card" data-item-id="${itemId}">
            <div class="card-image-container">
                <img src="${closetItemImageUrl(item)}" alt="${escapeHtml(item.subcategory)}" class="clothing-card-image">
                ${favoriteIcon}
                ${rotationBadge}
                ${cardQuickActionsMarkup(item)}
            </div>
            <div class="clothing-card-content">
                <h3 class="clothing-card-title">${escapeHtml(item.subcategory)}</h3>
                ${item.brand ? `<p class="item-brand">${escapeHtml(item.brand)}</p>` : ''}
                <div class="clothing-card-meta">
                    <span class="badge badge-category">${escapeHtml(item.category)}</span>
                    <span class="badge badge-season">${escapeHtml(item.season)}</span>
                    <span class="badge badge-style">${escapeHtml(item.style)}</span>
                </div>
                <div class="color-swatches">${colorSwatches}</div>

                <div class="freshness-track-wrap">
                <div class="freshness-bar" role="progressbar" aria-valuenow="${freshnessPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="Freshness ${freshnessPercent} percent">
                    <div class="freshness-fill ${escapeHtml(freshnessClass)}" style="width: ${freshnessPercent}%"></div>
                </div>
                <span class="freshness-label-outside">Freshness: ${freshnessPercent}%</span>
                </div>

                <div class="clothing-card-status">
                    <span class="status-badge ${escapeHtml(statusClass)}">
                        ${escapeHtml(statusBadge)}
                    </span>
                    <span class="status-badge">
                        Worn ${Number(item.times_worn) || 0}x
                    </span>
                </div>

                <div class="card-metrics">
                    ${cpwBadge}
                    ${daysSince}
                </div>
            </div>
        </div>
    `;
}

// Shared in-app dialogs (replace confirm())
let _confirmResolver = null;

function openAppModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function closeAppModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    modal.classList.add('hidden');
}

function finishConfirmDialog(result) {
    closeAppModal('app-confirm-modal');
    if (_confirmResolver) {
        _confirmResolver(result);
        _confirmResolver = null;
    }
}

function showConfirmDialog({
    title = 'Confirm',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
} = {}) {
    const modal = document.getElementById('app-confirm-modal');
    if (!modal) return Promise.resolve(window.confirm(message || title));
    const titleEl = document.getElementById('app-confirm-title');
    const msgEl = document.getElementById('app-confirm-message');
    const okBtn = document.getElementById('app-confirm-ok');
    const cancelBtn = document.getElementById('app-confirm-cancel');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    }
    if (cancelBtn) cancelBtn.textContent = cancelText;
    return new Promise((resolve) => {
        _confirmResolver = resolve;
        openAppModal('app-confirm-modal');
    });
}

function initAppDialogs() {
    document.getElementById('app-confirm-cancel')?.addEventListener('click', () => finishConfirmDialog(false));
    document.getElementById('app-confirm-ok')?.addEventListener('click', () => finishConfirmDialog(true));
    document.getElementById('app-confirm-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'app-confirm-modal') finishConfirmDialog(false);
    });

    let wornItemId = null;
    document.querySelectorAll('.item-worn-close').forEach((el) => {
        el.addEventListener('click', () => {
            wornItemId = null;
            closeAppModal('item-worn-modal');
        });
    });
    document.getElementById('item-worn-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!wornItemId) return;
        const occasion = document.getElementById('item-worn-occasion-input')?.value.trim() || null;
        try {
            await apiFetch(`/item/${wornItemId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worn: true, occasion }),
            });
            closeAppModal('item-worn-modal');
            closeModal();
            loadCloset();
            showToast('✓ Marked as worn!');
        } catch {
            showToast('Failed to update item');
        } finally {
            wornItemId = null;
        }
    });
    window._openMarkWornModal = (itemId) => {
        wornItemId = itemId;
        const input = document.getElementById('item-worn-occasion-input');
        if (input) input.value = '';
        openAppModal('item-worn-modal');
    };

    let laundryItemId = null;
    document.querySelectorAll('.laundry-add-close').forEach((el) => {
        el.addEventListener('click', () => {
            laundryItemId = null;
            closeAppModal('laundry-add-modal');
        });
    });
    document.getElementById('laundry-add-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!laundryItemId) return;
        const urgent = document.getElementById('laundry-add-urgent')?.checked;
        const priority = urgent ? 'urgent' : 'normal';
        try {
            await apiFetch(`/laundry/add/${laundryItemId}?priority=${priority}`, { method: 'POST' });
            closeAppModal('laundry-add-modal');
            closeModal();
            loadCloset();
            showToast('🧺 Added to laundry queue!');
        } catch (error) {
            if (String(error.message || '').includes('already in')) {
                showToast('Item is already in laundry queue');
            } else {
                showToast('Failed to add to laundry');
            }
        } finally {
            laundryItemId = null;
        }
    });
    window._openLaundryAddModal = (itemId) => {
        laundryItemId = itemId;
        const urgent = document.getElementById('laundry-add-urgent');
        if (urgent) urgent.checked = false;
        openAppModal('laundry-add-modal');
    };
}

function cardQuickActionsMarkup(item) {
    const itemId = Number(item.id) || 0;
    const favActive = item.is_favorite ? ' active' : '';
    const favIcon = item.is_favorite ? '⭐' : '☆';
    return `<div class="card-quick-actions">
        <button type="button" class="card-quick-btn" data-quick="clean" data-item-id="${itemId}" title="Mark clean" aria-label="Mark clean">💧</button>
        <button type="button" class="card-quick-btn${favActive}" data-quick="favorite" data-item-id="${itemId}" title="Favorite" aria-label="Favorite">${favIcon}</button>
        <button type="button" class="card-quick-btn card-quick-danger" data-quick="delete" data-item-id="${itemId}" title="Delete" aria-label="Delete">🗑</button>
    </div>`;
}

async function quickMarkClean(itemId) {
    try {
        await apiFetch(`/item/${itemId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ washed: true }),
        });
        await apiFetch(`/item/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ laundry_state: 'clean' }),
        });
        showToast('✨ Marked as clean!');
        loadCloset();
        if (closetSelectedItemId === itemId) {
            window.ClosetItemDetail?.refresh?.();
        }
    } catch (error) {
        showToast(error.message || 'Failed to update item');
    }
}

async function quickFavorite(itemId) {
    try {
        await apiFetch(`/item/${itemId}/favorite`, { method: 'PUT' });
        showToast('⭐ Favorite updated!');
        loadCloset();
        if (closetSelectedItemId === itemId) {
            window.ClosetItemDetail?.refresh?.();
        }
    } catch (error) {
        showToast(error.message || 'Failed to toggle favorite');
    }
}

async function handleCardQuickAction(action, itemId) {
    if (!itemId) return;
    if (action === 'clean') {
        await quickMarkClean(itemId);
        return;
    }
    if (action === 'favorite') {
        await quickFavorite(itemId);
        return;
    }
    if (action === 'delete') {
        await deleteItem(itemId, { fromCard: true });
    }
}

function bindClosetCardInteractions(root) {
    if (!root) return;
    root.querySelectorAll('.clothing-card, .rail-card').forEach((card) => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.card-quick-actions') || e.target.closest('[data-quick]')) return;
            showItemModal(Number(card.dataset.itemId));
        });
    });
    root.querySelectorAll('[data-quick]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCardQuickAction(btn.dataset.quick, Number(btn.dataset.itemId));
        });
    });
}

// Item Modal
async function showItemModal(itemId) {
    localStorage.setItem('closet_web_item_detail_visited', '1');
    if (!window.ClosetItemDetail) {
        showToast('Item detail module failed to load.');
        return;
    }
    closetSelectedItemId = itemId;
    highlightClosetCard(itemId);
    const usePane = isDesktopCloset();
    if (usePane) {
        document.getElementById('closet-detail-pane')?.classList.remove('hidden');
        document.getElementById('closet-tab')?.classList.add('closet-has-detail');
    } else {
        closeClosetDetailPane();
    }
    await window.ClosetItemDetail.open(itemId, usePane ? { mount: 'pane' } : {});
    window.ClosetFeatures?.loadOnboardingBanner?.();
}

// Modal close (defer until DOM is ready; script runs at end of body but guard anyway)
function initItemModal() {
    document.querySelector('#item-modal .modal-close')?.addEventListener('click', () => {
        closeModal();
    });
    document.getElementById('item-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'item-modal') {
            closeModal();
        }
    });
    document.querySelector('.closet-detail-close')?.addEventListener('click', () => {
        closeClosetDetailPane();
        closeModal();
    });
}

function closeModal() {
    document.getElementById('item-modal').classList.remove('active');
    document.getElementById('item-modal').classList.add('hidden');
    closeClosetDetailPane();
}

// Item actions
async function markAsWorn(itemId) {
    if (typeof window._openMarkWornModal === 'function') {
        window._openMarkWornModal(itemId);
        return;
    }
    try {
        await apiFetch(`/item/${itemId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ worn: true }),
        });
        closeModal();
        loadCloset();
        showToast('✓ Marked as worn!');
    } catch {
        showToast('Failed to update item');
    }
}

async function markAsWashed(itemId) {
    try {
        await fetch(`${API_BASE}/item/${itemId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ washed: true })
        });
        closeModal();
        loadCloset();
        showToast('✨ Marked as clean!');
    } catch (error) {
        showToast('Failed to update item');
    }
}

async function handleWearAgainDecision(itemId, canWearAgain) {
    try {
        await fetch(`${API_BASE}/item/${itemId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ wear_again: canWearAgain })
        });
        closeModal();
        loadCloset();
        
        if (canWearAgain) {
            showToast('👍 Item ready to wear again!');
        } else {
            showToast('🧺 Added to laundry queue');
        }
    } catch (error) {
        showToast('Failed to update item');
    }
}

async function toggleFavorite(itemId) {
    try {
        await fetch(`${API_BASE}/item/${itemId}/favorite`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        // Reload modal to show updated state
        closeModal();
        setTimeout(() => showItemModal(itemId), 100);
        loadCloset();
        showToast('⭐ Favorite updated!');
    } catch (error) {
        showToast('Failed to toggle favorite');
    }
}

async function addToLaundry(itemId) {
    if (typeof window._openLaundryAddModal === 'function') {
        window._openLaundryAddModal(itemId);
        return;
    }
    try {
        await apiFetch(`/laundry/add/${itemId}?priority=normal`, { method: 'POST' });
        closeModal();
        loadCloset();
        showToast('🧺 Added to laundry queue!');
    } catch (error) {
        if (String(error.message || '').includes('already in')) {
            showToast('Item is already in laundry queue');
        } else {
            showToast('Failed to add to laundry');
        }
    }
}

// Toast notification helper (delegates to ClosetWebUtils)
function showToast(message, type) {
    ClosetWebUtils.showToast(message, type);
}

async function deleteItem(itemId, options = {}) {
    const ok = await showConfirmDialog({
        title: 'Delete item',
        message: 'Remove this from your closet? This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
    });
    if (!ok) return;

    try {
        await apiFetch(`/item/${itemId}`, { method: 'DELETE' });
        if (!options.fromCard) {
            closeModal();
        } else if (closetSelectedItemId === itemId) {
            closeClosetDetailPane();
            closeModal();
        }
        loadCloset();
        showToast('Item deleted');
    } catch (error) {
        showToast(error.message || 'Failed to delete item');
    }
}

function roundTempC(c) {
    if (c == null || Number.isNaN(Number(c))) return '—';
    return `${Math.round(Number(c))}°C`;
}

function formatWeatherHeadline(w) {
    if (!w) return '';
    const temp = roundTempC(w.apparent_temperature_c ?? w.temperature_c);
    const place = w.location_name ? `${w.location_name} · ` : '';
    const summary = w.summary || w.condition || '';
    return `${place}${temp} · ${summary}`.replace(/\s·\s$/, '').trim();
}

function formatWeatherDetail(w) {
    if (!w) return 'Turn on weather sync to bias outfits toward today.';
    const pieces = [
        `${roundTempC(w.min_temp_c)}–${roundTempC(w.max_temp_c)}`,
        `${w.precipitation_probability ?? 0}% rain`,
        `${Math.round(w.wind_speed_kmh ?? 0)} km/h wind`,
        w.derived_season,
    ].filter(Boolean);
    return pieces.join(' · ');
}

function renderWeatherBanner(banner, weather, weatherOn) {
    if (!banner) return;
    if (!weatherOn) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }
    if (!weather) {
        banner.classList.remove('hidden');
        banner.innerHTML = '<span class="weather-banner-headline">Weather not synced</span><span class="weather-banner-detail">Turn on sync to bias outfits toward today.</span>';
        return;
    }
    banner.classList.remove('hidden');
    const headline = formatWeatherHeadline(weather);
    const detail = formatWeatherDetail(weather);
    banner.innerHTML = `<span class="weather-banner-headline">${escapeHtml(headline)}</span><span class="weather-banner-detail">${escapeHtml(detail)}</span>`;
}

// Generate outfits
async function generateOutfits(opts = {}) {
    const container = document.getElementById('outfits-container');
    container.innerHTML = '<div class="loading">Generating outfits...</div>';

    const occasion = document.getElementById('occasion-filter').value;
    const season = document.getElementById('season-filter').value;
    const vibeEl = document.getElementById('vibe-filter');
    const vibe = vibeEl ? vibeEl.value : '';
    const outfitSource =
        document.querySelector('input[name="outfit-source"]:checked')?.value || 'home';
    const weatherBanner = document.getElementById('outfit-weather-banner');

    const params = new URLSearchParams();
    if (occasion) params.append('occasion', occasion);
    if (season) params.append('season', season);
    if (vibe) params.append('vibe', vibe);
    if (opts.forceSeed) params.append('seed', String(Date.now()));

    const locSel = document.getElementById('outfits-location-filter');
    const locId = locSel?.value ? Number(locSel.value) : null;
    if (locId) params.append('closet_location_id', String(locId));

    try {
        const closetData = await apiFetch('/closet');
        let scoped = (closetData.items || []).filter((item) => {
            if (item.lent_to) return false;
            if (item.washed === false) return false;
            if (item.status === 'wishlist') return false;
            if (item.is_bulk && (item.clean_count ?? 0) <= 0) return false;
            return true;
        });
        if (locId) {
            scoped = scoped.filter((item) => item.closet_location_id === locId);
        }
        const packedIds = scoped.filter((item) => item.packed_for_trip).map((item) => item.id);
        const homeIds = scoped.filter((item) => !item.packed_for_trip).map((item) => item.id);
        updateOutfitSourceCounts(homeIds.length, packedIds.length);

        if (outfitSource === 'packed') {
            if (!packedIds.length) {
                setOutfitsContainerEmpty(container, {
                    variant: 'outfits',
                    title: 'Travel bag is empty',
                    message: 'Pack a few clean items first, then Travel bag can suggest outfits.',
                    ctaTab: 'pack',
                    ctaLabel: 'Open pack mode',
                });
                return;
            }
            params.append('include_packed', 'true');
            if (homeIds.length) params.append('exclude_item_ids', homeIds.join(','));
        } else if (packedIds.length) {
            params.append('exclude_item_ids', packedIds.join(','));
        }
    } catch (e) {
        container.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
        return;
    }

    const weatherOn = window.ClosetFeatures?.isWeatherSyncEnabled?.();
    if (weatherOn && window.ClosetFeatures?.getWeatherCoords) {
        try {
            const { lat, lon } = await window.ClosetFeatures.getWeatherCoords();
            params.append('lat', String(lat));
            params.append('lon', String(lon));
        } catch (e) {
            renderWeatherBanner(weatherBanner, null, true);
            const detailEl = weatherBanner?.querySelector('.weather-banner-detail');
            if (detailEl) detailEl.textContent = e.message || 'Weather unavailable';
        }
    }

    try {
        const data = await apiFetch(`/outfits/recommend?${params}`);

        renderWeatherBanner(weatherBanner, data.weather, weatherOn);

        if (!data.outfits.length) {
            setOutfitsContainerEmpty(container, {
                variant: 'outfits',
                title: 'No outfits yet',
                message: 'Try different filters or add more clean items to your closet.',
                ctaTab: 'closet',
                ctaLabel: 'Browse closet',
            });
            return;
        }
        
        container.classList.add('outfits-container--has-results');
        container.innerHTML = data.outfits.map((outfit, index) => createOutfitCard(outfit, index)).join('');
        bindOutfitPlanButtons();
    } catch (error) {
        container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

function createOutfitCard(outfit, index) {
    const itemIds = (outfit.items || []).map((i) => Number(i.id)).filter(Boolean);
    const items = (outfit.items || []).map(item => `
        <div class="outfit-item">
            <img src="${closetItemImageUrl(item)}" alt="${escapeHtml(item.subcategory)}">
            <div class="outfit-item-info">
                <div class="outfit-item-category">${escapeHtml(item.subcategory)}</div>
            </div>
        </div>
    `).join('');

    return `
        <div class="outfit-card">
            <div class="outfit-header">
                <h3>Outfit ${Number(index) + 1}</h3>
                <span class="outfit-score">Score: ${Number(outfit.score) || 0}/100</span>
            </div>
            <div class="outfit-items">
                ${items}
            </div>
            <div class="outfit-card-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-plan-outfit="${escapeHtml(itemIds.join(','))}">Plan this look</button>
            </div>
        </div>
    `;
}

function updateOutfitSourceCounts(homeCount, packedCount) {
    const homeSpan = document.querySelector('input[name="outfit-source"][value="home"]')?.closest('.source-chip')?.querySelector('span');
    const packedSpan = document.querySelector('input[name="outfit-source"][value="packed"]')?.closest('.source-chip')?.querySelector('span');
    if (homeSpan) homeSpan.textContent = `Home closet (${homeCount})`;
    if (packedSpan) packedSpan.textContent = `Travel bag (${packedCount})`;
}

function bindOutfitPlanButtons() {
    document.querySelectorAll('[data-plan-outfit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const ids = btn.dataset.planOutfit.split(',').map(Number).filter(Boolean);
            if (!ids.length) return;
            if (window.ClosetFeatures?.planWithOutfitItems) {
                window.ClosetFeatures.planWithOutfitItems(ids);
            } else {
                showTab('planning');
            }
        });
    });
}

function renderCategoryBars(byCategory) {
    const entries = Object.entries(byCategory || {});
    if (!entries.length) return '<p class="hint-text">No category data yet.</p>';
    const max = Math.max(...entries.map(([, c]) => Number(c) || 0), 1);
    return `<ul class="stat-bars">${entries
        .map(([cat, count]) => {
            const n = Number(count) || 0;
            const pct = Math.round((n / max) * 100);
            return `<li class="stat-bar-row">
                <span class="stat-bar-label">${escapeHtml(cat)}</span>
                <span class="stat-bar-track"><span class="stat-bar-fill" style="width:${pct}%"></span></span>
                <span class="stat-bar-value">${n}</span>
            </li>`;
        })
        .join('')}</ul>`;
}

// Load statistics
async function loadStats() {
    const container = document.getElementById('stats-container');
    container.innerHTML = '<div class="loading">Loading statistics...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/stats`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const stats = await response.json();
        let insightsHtml = '';
        try {
            const insights = await apiFetch('/closet/insights');
            const gaps = insights.gaps || [];
            if (gaps.length) {
                insightsHtml = `<div class="stat-card stat-card--wide"><h3>Capsule gaps</h3><ul class="stat-list stat-list--gaps">${gaps
                    .map((g) => {
                        const seed = ClosetWebUtils.gapWishlistSeed(g.id);
                        const title = g.title || g.label || g.id;
                        return `<li class="gap-row">
                            <div class="gap-row-text"><strong>${escapeHtml(title)}</strong><span class="hint-text">${escapeHtml(g.detail || '')}</span></div>
                            <button type="button" class="btn btn-secondary btn-sm" data-gap-wishlist="${escapeHtml(g.id)}" data-gap-title="${escapeHtml(title)}" data-gap-detail="${escapeHtml(g.detail || '')}" data-gap-category="${escapeHtml(seed.category)}" data-gap-subcategory="${escapeHtml(seed.subcategory)}">Add wishlist target</button>
                        </li>`;
                    })
                    .join('')}</ul></div>`;
            }
        } catch {
            /* insights optional */
        }

        const cpwHtml =
            stats.best_cpw && stats.best_cpw.length
                ? `<div class="stat-card stat-card--wide"><h3>Best value (CPW)</h3><ul class="stat-list">${stats.best_cpw
                      .map((row) => {
                          const thumb = closetItemImageUrl(row);
                          return `<li class="cpw-row">${thumb ? `<img class="cpw-thumb" src="${thumb}" alt="">` : ''}<span>${escapeHtml(row.subcategory)}</span><span>$${escapeHtml(row.cost_per_wear ?? '—')} · ${Number(row.times_worn) || 0} wears</span></li>`;
                      })
                      .join('')}</ul></div>`
                : '';

        container.innerHTML = `
            <div class="stat-card">
                <h3>Total Items</h3>
                <div class="stat-number">${stats.total_items}</div>
            </div>
            <div class="stat-card">
                <h3>Clean Items</h3>
                <div class="stat-number">${stats.clean_items}</div>
            </div>
            <div class="stat-card">
                <h3>Needs Washing</h3>
                <div class="stat-number">${stats.dirty_items}</div>
            </div>
            <div class="stat-card">
                <h3>Recently Added (7 days)</h3>
                <div class="stat-number">${stats.recently_added}</div>
            </div>
            <div class="stat-card stat-card--wide">
                <h3>By Category</h3>
                ${renderCategoryBars(stats.by_category)}
            </div>
            ${cpwHtml}
            ${insightsHtml}
        `;
        container.querySelectorAll('[data-gap-wishlist]').forEach((btn) => {
            btn.addEventListener('click', () => {
                window.ClosetApp?.navigateToWishlistPrefill?.({
                    openAdd: true,
                    name: btn.dataset.gapTitle || '',
                    category: btn.dataset.gapCategory || 'Other',
                    subcategory: btn.dataset.gapSubcategory || 'Wishlist',
                    intent: 'want',
                    notes: btn.dataset.gapDetail || '',
                });
            });
        });
    } catch (error) {
        container.innerHTML = '<div class="empty-state">Failed to load statistics</div>';
    }
}

// Load laundry queue
async function loadLaundry() {
    const container = document.getElementById('laundry-container');
    container.innerHTML = '<div class="loading">Loading laundry queue...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/laundry`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const queue = await response.json();
        
        if (queue.total === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>🎉 All caught up!</h3>
                    <p>No items in the laundry queue</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="laundry-summary">
                <div class="summary-card">
                    <div class="summary-icon">🧺</div>
                    <div class="summary-content">
                        <div class="summary-number">${queue.queued.length}</div>
                        <div class="summary-label">In Hamper</div>
                    </div>
                </div>
                <div class="summary-card">
                    <div class="summary-icon">🌀</div>
                    <div class="summary-content">
                        <div class="summary-number">${queue.washing.length}</div>
                        <div class="summary-label">Washing</div>
                    </div>
                </div>
                <div class="summary-card">
                    <div class="summary-icon">☀️</div>
                    <div class="summary-content">
                        <div class="summary-number">${queue.drying.length}</div>
                        <div class="summary-label">Drying</div>
                    </div>
                </div>
            </div>
            
            ${queue.queued.length > 0 ? `
                <div class="laundry-section">
                    <h3>🧺 In Hamper (${queue.queued.length} items)</h3>
                    <div class="laundry-grid">
                        ${queue.queued.map(item => createLaundryCard(item)).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${queue.washing.length > 0 ? `
                <div class="laundry-section">
                    <h3>🌀 Washing (${queue.washing.length} items)</h3>
                    <div class="laundry-grid">
                        ${queue.washing.map(item => createLaundryCard(item)).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${queue.drying.length > 0 ? `
                <div class="laundry-section">
                    <h3>☀️ Drying (${queue.drying.length} items)</h3>
                    <div class="laundry-grid">
                        ${queue.drying.map(item => createLaundryCard(item)).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    } catch (error) {
        console.error('Error loading laundry:', error);
        container.innerHTML = '<div class="empty-state">Failed to load laundry queue</div>';
    }
}

function createLaundryCard(item) {
    const addedDate = new Date(item.added_date);
    const daysInQueue = Math.floor((new Date() - addedDate) / (1000 * 60 * 60 * 24));
    const queueId = Number(item.id) || 0;

    return `
        <div class="laundry-card">
            <img src="${closetItemImageUrl(item)}" alt="${escapeHtml(item.subcategory)}">
            <div class="laundry-card-content">
                <h4>${escapeHtml(item.subcategory)}</h4>
                <p class="laundry-meta">
                    ${item.priority === 'urgent' ? '⚡ Urgent' : ''}
                    ${daysInQueue > 0 ? `• ${daysInQueue}d in queue` : ''}
                </p>
                <div class="laundry-actions">
                    ${item.status === 'queued' ? `
                        <button class="btn-small btn-primary" onclick="updateLaundryStatus(${queueId}, 'washing')">
                            Start Washing
                        </button>
                    ` : ''}
                    ${item.status === 'washing' ? `
                        <button class="btn-small btn-primary" onclick="updateLaundryStatus(${queueId}, 'drying')">
                            Move to Drying
                        </button>
                    ` : ''}
                    ${item.status === 'drying' ? `
                        <button class="btn-small btn-success" onclick="updateLaundryStatus(${queueId}, 'ready')">
                            ✓ Done
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

async function updateLaundryStatus(queueId, status) {
    try {
        await fetch(`${API_BASE}/laundry/${queueId}/status?status=${status}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        loadLaundry();
        
        if (status === 'ready') {
            showToast('✨ Item is clean and back in closet!');
            loadCloset(); // Refresh closet too
        }
    } catch (error) {
        showToast('Failed to update laundry status');
    }
}

// Load insights
async function loadInsights() {
    if (window.ClosetFeatures?.loadFullInsights) {
        return window.ClosetFeatures.loadFullInsights();
    }
    const container = document.getElementById('insights-container');
    const days = document.getElementById('neglect-days-filter').value;
    container.innerHTML = '<div class="loading">Loading insights...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/neglected-items?days=${days}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const data = await response.json();
        
        if (data.items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>🎉 Great rotation!</h3>
                    <p>You're using your wardrobe well. No neglected items found.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="insights-header">
                <p class="insights-intro">
                    ⚠️ Found <strong>${Number(data.items.length) || 0} items</strong> that haven't been worn in ${Number(days) || 0}+ days.
                    Consider styling them in new ways or letting them go!
                </p>
            </div>

            <div class="insights-grid">
                ${data.items.map(item => createInsightCard(item)).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading insights:', error);
        container.innerHTML = '<div class="empty-state">Failed to load insights</div>';
    }
}

function createInsightCard(item) {
    const daysSince = item.days_since_worn || 'Never worn';
    const cpw = item.cost_per_wear ? `$${escapeHtml(item.cost_per_wear)}` : item.purchase_price ? `$${escapeHtml(item.purchase_price)}` : 'N/A';
    const itemId = Number(item.id) || 0;

    return `
        <div class="insight-card" onclick="showItemModal(${itemId})">
            <img src="${closetItemImageUrl(item)}" alt="${escapeHtml(item.subcategory)}">
            <div class="insight-overlay">
                <div class="insight-badge">
                    ${item.times_worn === 0 ? '🆕 Never Worn' : `😴 ${escapeHtml(daysSince)}d ago`}
                </div>
            </div>
            <div class="insight-content">
                <h4>${escapeHtml(item.subcategory)}</h4>
                <div class="insight-stats">
                    <span>Worn: ${Number(item.times_worn) || 0}x</span>
                    <span>CPW: ${cpw}</span>
                </div>
                <div class="insight-actions">
                    <button class="btn-small btn-primary" onclick="event.stopPropagation(); planOutfitWith(${itemId})">
                        📋 Plan Outfit
                    </button>
                    <button class="btn-small btn-secondary" onclick="event.stopPropagation(); considerDonating(${itemId})">
                        💝 Donate?
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function planOutfitWith(itemId) {
    if (window.ClosetFeatures?.planWithItem) {
        window.ClosetFeatures.planWithItem(itemId);
    } else {
        showTab('planning');
    }
}

async function considerDonating(itemId) {
    const ok = await showConfirmDialog({
        title: 'Tag for donation?',
        message: 'You can remove the donate tag when editing the item.',
        confirmText: 'Tag item',
        cancelText: 'Cancel',
    });
    if (!ok) return;
    try {
        const item = await apiFetch(`/item/${itemId}`);
        const tags = [...(item.user_tags || [])];
        if (!tags.includes('donate')) tags.push('donate');
        await apiFetch(`/item/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_tags: tags.slice(0, 20) }),
        });
        showToast('Tagged for donation');
        loadCloset();
        if (window.ClosetItemDetail) {
            await window.ClosetItemDetail.open(itemId);
        }
    } catch (e) {
        showToast(e.message || 'Could not tag item');
    }
}

// Exposed for insight cards and feature modules
window.createInsightCard = createInsightCard;
window.considerDonating = considerDonating;
window.planOutfitWith = planOutfitWith;
window.showItemModal = showItemModal;
