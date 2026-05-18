// API Base URL
const API_BASE = window.location.origin + '/api';

// State
let currentTab = 'closet';
let activeCarePane = 'laundry';
let selectedFile = null;
let currentUser = null;
let authToken = null;

// ---- XSS defence ------------------------------------------------------------
// Every place we drop string data into innerHTML must wrap it in escapeHtml.
// We've also got a separate `safeUrl` for src= / href= so a stored
// `javascript:` URL can't surface from a malicious item record. The CSP
// already blocks inline-script execution, but escaping keeps even visual
// injection (broken layouts via injected <style>) off the table.

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

function safeUrl(value) {
    // Allow only http(s), relative paths, and our own /uploads/. Anything
    // else (javascript:, data:, vbscript:) collapses to an empty string.
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (s === '') return '';
    if (/^https?:\/\//i.test(s)) return escapeHtml(s);
    if (s.startsWith('/uploads/')) return escapeHtml(s);
    if (s.startsWith('uploads/')) {
        return escapeHtml('/' + s.replace(/^\/+/, ''));
    }
    // DB stores absolute paths (e.g. /opt/closet-org/uploads/item_abc.webp).
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
        if (currentUser.social_enabled !== false) {
            showTab('feed');
        }
    } catch (error) {
        console.error('Auth error:', error);
        const onApp = window.location.pathname === '/app' || window.location.pathname.endsWith('/app');
        if (!onApp || !authToken) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/frontend/login.html';
            return;
        }
        showFatalAppError(
            error.message || 'Could not start the app. Try a hard refresh or sign in again.'
        );
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
    // Set user info in header
    updateUserDisplay();
    
    // Initialize components
    initNavigation();
    initUpload();
    initThemeToggle();
    initUserMenu();
    initProfile();

    initClosetFilterUi();
    initCareSubnav();
    initItemModal();

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
        loadOutfitsPlannedPreview: () =>
            window.ClosetFeatures?.loadOutfitsPlannedPreview?.(),
    };

    if (window.ClosetFeatures) {
        window.ClosetFeatures.init();
        window.ClosetFeatures.loadProfileHub();
        window.ClosetFeatures.loadOutfitsPlannedPreview();
    }

    if (window.ClosetUpgrade) {
        window.ClosetUpgrade.init();
    }

    loadCloset().catch((err) => console.error('loadCloset failed:', err));

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

    const feedBtn = document.getElementById('nav-feed');
    const socialOn = currentUser.social_enabled !== false;
    if (feedBtn) feedBtn.classList.toggle('hidden', !socialOn);
    if (window.ClosetFeatures?.applySocialNav) {
        window.ClosetFeatures.applySocialNav();
    }
}

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    const savedTheme = currentUser.theme_preference || 'light';
    
    // Apply saved theme
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    themeToggle.addEventListener('click', async () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        updateThemeIcon(newTheme);
        
        // Save theme preference
        try {
            await fetch(`${API_BASE}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ theme_preference: newTheme })
            });
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
    } else if (tabName === 'care') {
        showCarePane(activeCarePane || 'laundry');
    } else if (tabName === 'profile') {
        loadProfileData();
    } else if (tabName === 'outfits') {
        window.ClosetFeatures?.loadOutfitsPlannedPreview?.();
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
    const status = document.getElementById('status-filter');
    const rotation = document.getElementById('rotation-filter');
    if (!category || !status || !rotation) return;
    setChipGroupActive('category', category.value);
    setChipGroupActive('status', status.value);
    setChipGroupActive('rotation', rotation.value);
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
    if (sortEl) sortEl.addEventListener('change', loadCloset);

    document.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const group = chip.dataset.chipGroup;
            const value = chip.dataset.value;
            const map = {
                category: 'category-filter',
                status: 'status-filter',
                rotation: 'rotation-filter',
            };
            const selectId = map[group];
            if (!selectId) return;
            document.getElementById(selectId).value = value;
            setChipGroupActive(group, value);
            loadCloset();
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
}

function handleFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select an image file');
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
                alert(
                    'Upload failed: server returned invalid JSON (HTTP ' +
                        response.status +
                        ').'
                );
                return;
            }
        } else if (!response.ok) {
            const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 120);
            alert(
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
            showClassificationResult(data);
            loadCloset(); // Refresh closet
        } else {
            alert('Upload failed: ' + formatApiError(data.detail));
        }
    } catch (error) {
        alert('Upload failed: ' + error.message);
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
    
    document.getElementById('upload-preview').classList.add('hidden');
    resultDiv.classList.remove('hidden');
}

function resetUpload() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('upload-preview').classList.add('hidden');
    document.getElementById('classification-result').classList.add('hidden');
}

// Load closet items
async function loadCloset() {
    const grid = document.getElementById('closet-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading">Loading your closet...</div>';

    const category = document.getElementById('category-filter')?.value || '';
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

        if (rotation === 'favorites') {
            items = items.filter((item) => item.is_favorite);
        } else if (rotation) {
            items = items.filter((item) => (item.rotation_category || 'new') === rotation);
        }

        items = sortItems(items, sortBy);

        if (items.length === 0) {
            grid.innerHTML =
                '<div class="empty-state"><p>Your closet is empty.</p><p class="hint-text">Add items from the Add tab, or clear filters above.</p></div>';
            return;
        }

        grid.innerHTML = items.map((item) => createClothingCard(item)).join('');

        grid.querySelectorAll('.clothing-card').forEach((card) => {
            card.addEventListener('click', () => {
                showItemModal(Number(card.dataset.itemId));
            });
        });
    } catch (error) {
        console.error('Error loading closet:', error);
        const msg = error instanceof Error ? error.message : 'Failed to load closet';
        grid.innerHTML = `<div class="empty-state"><p>${escapeHtml(msg)}</p><button type="button" class="btn btn-secondary btn-sm" id="closet-retry-btn">Retry</button></div>`;
        document.getElementById('closet-retry-btn')?.addEventListener('click', () => loadCloset());
    }
}

function sortItems(items, sortBy) {
    const sorted = [...items];
    
    switch(sortBy) {
        case 'last-worn':
            return sorted.sort((a, b) => {
                if (!a.last_worn) return -1;
                if (!b.last_worn) return 1;
                return new Date(a.last_worn) - new Date(b.last_worn);
            });
        
        case 'most-worn':
            return sorted.sort((a, b) => (b.times_worn || 0) - (a.times_worn || 0));
        
        case 'least-worn':
            return sorted.sort((a, b) => (a.times_worn || 0) - (b.times_worn || 0));
        
        case 'best-cpw':
            return sorted.sort((a, b) => {
                const cpwA = a.cost_per_wear || 999999;
                const cpwB = b.cost_per_wear || 999999;
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
            return sorted.sort((a, b) => {
                return new Date(b.date_added) - new Date(a.date_added);
            });
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

// Item Modal
// Item Modal
async function showItemModal(itemId) {
    if (window.ClosetItemDetail) {
        await window.ClosetItemDetail.open(itemId);
        return;
    }
    alert('Item detail module failed to load.');
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
}

function closeModal() {
    document.getElementById('item-modal').classList.remove('active');
    document.getElementById('item-modal').classList.add('hidden');
}

// Item actions
async function markAsWorn(itemId) {
    // Could add occasion/rating prompt here
    const occasion = prompt('What occasion? (optional)');
    
    try {
        await fetch(`${API_BASE}/item/${itemId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                worn: true,
                occasion: occasion || null
            })
        });
        closeModal();
        loadCloset();
        showToast('✓ Marked as worn!');
    } catch (error) {
        alert('Failed to update item');
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
        alert('Failed to update item');
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
        alert('Failed to update item');
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
        alert('Failed to toggle favorite');
    }
}

async function addToLaundry(itemId) {
    const priority = confirm('Is this urgent?') ? 'urgent' : 'normal';
    
    try {
        await fetch(`${API_BASE}/laundry/add/${itemId}?priority=${priority}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        closeModal();
        loadCloset();
        showToast('🧺 Added to laundry queue!');
    } catch (error) {
        if (error.message.includes('already in')) {
            alert('Item is already in laundry queue');
        } else {
            alert('Failed to add to laundry');
        }
    }
}

// Toast notification helper
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
        await fetch(`${API_BASE}/item/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        closeModal();
        loadCloset();
    } catch (error) {
        alert('Failed to delete item');
    }
}

// Generate outfits
async function generateOutfits(opts = {}) {
    const container = document.getElementById('outfits-container');
    container.innerHTML = '<div class="loading">Generating outfits...</div>';
    
    const occasion = document.getElementById('occasion-filter').value;
    const season = document.getElementById('season-filter').value;
    const vibeEl = document.getElementById('vibe-filter');
    const vibe = vibeEl ? vibeEl.value : '';
    const includePacked = document.getElementById('include-packed-toggle')?.checked;
    const weatherBanner = document.getElementById('outfit-weather-banner');

    const params = new URLSearchParams();
    if (occasion) params.append('occasion', occasion);
    if (season) params.append('season', season);
    if (vibe) params.append('vibe', vibe);
    if (includePacked) params.append('include_packed', 'true');
    if (opts.forceSeed) params.append('seed', String(Date.now()));

    const weatherOn = window.ClosetFeatures?.isWeatherSyncEnabled?.();
    if (weatherOn && window.ClosetFeatures?.getWeatherCoords) {
        try {
            const { lat, lon } = await window.ClosetFeatures.getWeatherCoords();
            params.append('lat', String(lat));
            params.append('lon', String(lon));
        } catch (e) {
            if (weatherBanner) {
                weatherBanner.classList.remove('hidden');
                weatherBanner.textContent = e.message || 'Weather unavailable';
            }
        }
    }

    try {
        const data = await apiFetch(`/outfits/recommend?${params}`);

        if (weatherBanner) {
            if (data.weather) {
                const w = data.weather;
                weatherBanner.classList.remove('hidden');
                weatherBanner.textContent = [
                    w.location_name,
                    w.summary || w.condition,
                    w.temperature_c != null ? `${Math.round(w.temperature_c)}°C` : '',
                ]
                    .filter(Boolean)
                    .join(' · ');
            } else {
                weatherBanner.classList.add('hidden');
                weatherBanner.textContent = '';
            }
        }

        if (!data.outfits.length) {
            container.innerHTML = '<div class="empty-state">No outfit combinations found. Try adding more items or changing filters!</div>';
            return;
        }
        
        container.innerHTML = data.outfits.map((outfit, index) => createOutfitCard(outfit, index)).join('');
    } catch (error) {
        container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

function createOutfitCard(outfit, index) {
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
        </div>
    `;
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
                insightsHtml = `<div class="stat-card stat-card--wide"><h3>Wardrobe gaps</h3><ul class="stat-list">${gaps
                    .map((g) => `<li><span>${escapeHtml(g.label || g.id)}</span><span>${escapeHtml(g.detail || '')}</span></li>`)
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
            <div class="stat-card">
                <h3>By Category</h3>
                <ul class="stat-list">
                    ${Object.entries(stats.by_category || {}).map(([cat, count]) =>
                        `<li><span>${escapeHtml(cat)}</span><span>${Number(count) || 0}</span></li>`
                    ).join('')}
                </ul>
            </div>
            ${cpwHtml}
            ${insightsHtml}
        `;
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
        alert('Failed to update laundry status');
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
    if (confirm('Mark this item for donation? You can still change your mind later.')) {
        // TODO: Implement donation marking feature
        showToast('📦 Item marked for donation');
    }
}
