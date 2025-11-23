// API Base URL
const API_BASE = window.location.origin + '/api';

// State
let currentTab = 'closet';
let selectedFile = null;
let currentUser = null;
let authToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
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
    
    // Load initial data
    loadCloset();
    loadStats();
    
    // Event listeners for filters
    document.getElementById('category-filter').addEventListener('change', loadCloset);
    document.getElementById('status-filter').addEventListener('change', loadCloset);
    document.getElementById('rotation-filter').addEventListener('change', loadCloset);
    document.getElementById('sort-by').addEventListener('change', loadCloset);
    document.getElementById('generate-outfits-btn').addEventListener('click', generateOutfits);
    document.getElementById('refresh-laundry-btn').addEventListener('click', loadLaundry);
    document.getElementById('refresh-insights-btn').addEventListener('click', loadInsights);
    document.getElementById('neglect-days-filter').addEventListener('change', loadInsights);
}

// Update User Display
function updateUserDisplay() {
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');
    const profileInitials = document.getElementById('profile-initials');
    
    userName.textContent = currentUser.full_name || currentUser.username;
    
    const initials = (currentUser.full_name || currentUser.username)
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    
    userInitials.textContent = initials;
    profileInitials.textContent = initials;
}

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
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
    const themeIcon = document.getElementById('theme-icon');
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// User Menu
function initUserMenu() {
    const userProfileBtn = document.getElementById('user-profile-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');
    
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
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-full-name').value = currentUser.full_name || '';
    document.getElementById('profile-bio').value = currentUser.bio || '';
    
    if (currentUser.created_at) {
        document.getElementById('profile-created').textContent = 
            new Date(currentUser.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
    }
    
    if (currentUser.last_login) {
        document.getElementById('profile-last-login').textContent = 
            new Date(currentUser.last_login).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
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

function showTab(tabName) {
    currentTab = tabName;
    const tabs = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load data for specific tabs
    if (tabName === 'closet') {
        loadCloset();
    } else if (tabName === 'stats') {
        loadStats();
    } else if (tabName === 'profile') {
        loadProfileData();
    } else if (tabName === 'laundry') {
        loadLaundry();
    } else if (tabName === 'insights') {
        loadInsights();
    }
}

// Upload functionality
function initUpload() {
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImage = document.getElementById('preview-image');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const addAnotherBtn = document.getElementById('add-another-btn');
    
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
    formData.append('file', selectedFile);
    
    try {
        const response = await fetch(`${API_BASE}/upload-clothing`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showClassificationResult(data);
            loadCloset(); // Refresh closet
        } else {
            alert('Upload failed: ' + (data.detail || 'Unknown error'));
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
    
    detailsDiv.innerHTML = `
        <div class="result-row">
            <span class="result-label">Category:</span>
            <span class="result-value">${data.classification.category}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Subcategory:</span>
            <span class="result-value">${data.classification.subcategory}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Style:</span>
            <span class="result-value">${data.classification.style}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Season:</span>
            <span class="result-value">${data.classification.season}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Colors:</span>
            <span class="result-value">${data.classification.colors.join(', ')}</span>
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
    grid.innerHTML = '<div class="loading">Loading your closet...</div>';
    
    const category = document.getElementById('category-filter').value;
    const status = document.getElementById('status-filter').value;
    const rotation = document.getElementById('rotation-filter').value;
    const sortBy = document.getElementById('sort-by').value;
    
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    
    try {
        const response = await fetch(`${API_BASE}/closet?${params}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const data = await response.json();
        
        let items = data.items;
        
        // Client-side rotation filter
        if (rotation === 'favorites') {
            items = items.filter(item => item.is_favorite);
        } else if (rotation) {
            items = items.filter(item => (item.rotation_category || 'new') === rotation);
        }
        
        // Client-side sorting
        items = sortItems(items, sortBy);
        
        if (items.length === 0) {
            grid.innerHTML = '<div class="empty-state">No items found. Try different filters!</div>';
            return;
        }
        
        grid.innerHTML = items.map(item => createClothingCard(item)).join('');
        
        // Add click listeners
        document.querySelectorAll('.clothing-card').forEach(card => {
            card.addEventListener('click', () => {
                showItemModal(parseInt(card.dataset.itemId));
            });
        });
    } catch (error) {
        console.error('Error loading closet:', error);
        grid.innerHTML = '<div class="empty-state">Failed to load items</div>';
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
    const colorSwatches = item.colors.map(color => 
        `<div class="color-swatch" style="background-color: ${color}"></div>`
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
    
    return `
        <div class="clothing-card" data-item-id="${item.id}">
            <div class="card-image-container">
                <img src="${item.image_path}" alt="${item.subcategory}" class="clothing-card-image">
                ${favoriteIcon}
                ${rotationBadge}
            </div>
            <div class="clothing-card-content">
                <h3 class="clothing-card-title">${item.subcategory}</h3>
                ${item.brand ? `<p class="item-brand">${item.brand}</p>` : ''}
                <div class="clothing-card-meta">
                    <span class="badge badge-category">${item.category}</span>
                    <span class="badge badge-season">${item.season}</span>
                    <span class="badge badge-style">${item.style}</span>
                </div>
                <div class="color-swatches">${colorSwatches}</div>
                
                <div class="freshness-bar">
                    <div class="freshness-fill ${freshnessClass}" style="width: ${freshnessPercent}%"></div>
                    <span class="freshness-label">Freshness: ${freshnessPercent}%</span>
                </div>
                
                <div class="clothing-card-status">
                    <span class="status-badge ${statusClass}">
                        ${statusBadge}
                    </span>
                    <span class="status-badge">
                        Worn ${item.times_worn}x
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
async function showItemModal(itemId) {
    try {
        const response = await fetch(`${API_BASE}/item/${itemId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const item = await response.json();
        
        const modal = document.getElementById('item-modal');
        const modalBody = document.getElementById('modal-body');
        
        const colorSwatches = item.colors.map(color => 
            `<div class="color-swatch" style="background-color: ${color}"></div>`
        ).join('');
        
        // Calculate metrics
        const wearCount = item.wear_again_count || 0;
        const maxWear = item.max_wear_before_wash || 1;
        const freshness = Math.round((item.freshness_score || 1.0) * 100);
        const condition = Math.round((item.condition_score || 1.0) * 100);
        const cpw = item.cost_per_wear ? `$${item.cost_per_wear}` : 'N/A';
        const daysSince = item.days_since_worn !== null ? `${item.days_since_worn} days ago` : 'Never worn';
        const daysOwned = item.days_owned !== null ? `${item.days_owned} days` : 'N/A';
        
        // Purchase info
        const purchaseInfo = item.purchase_price 
            ? `
            <div class="modal-section">
                <h3>💰 Value Tracking</h3>
                <div class="metric-grid">
                    <div class="metric">
                        <span class="metric-label">Purchase Price</span>
                        <span class="metric-value">$${item.purchase_price}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Cost Per Wear</span>
                        <span class="metric-value ${item.times_worn > 10 ? 'value-good' : 'value-improving'}">${cpw}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Times Worn</span>
                        <span class="metric-value">${item.times_worn}x</span>
                    </div>
                    ${item.purchase_date ? `
                    <div class="metric">
                        <span class="metric-label">Owned For</span>
                        <span class="metric-value">${daysOwned}</span>
                    </div>
                    ` : ''}
                </div>
                ${item.purchase_location ? `<p class="meta-info">📍 ${item.purchase_location}</p>` : ''}
            </div>
            ` : '';
        
        // Multi-wear status
        const wearAgainSection = maxWear > 1 ? `
            <div class="modal-section wear-again-section">
                <h3>🔄 Multi-Wear Tracking</h3>
                <div class="wear-progress">
                    <div class="wear-progress-bar">
                        <div class="wear-progress-fill" style="width: ${(wearCount / maxWear) * 100}%"></div>
                    </div>
                    <p class="wear-status">Worn ${wearCount}/${maxWear} times since last wash</p>
                </div>
                ${wearCount > 0 ? `
                    <p class="wear-hint">💡 You can wear this ${maxWear - wearCount} more time(s) before washing</p>
                ` : ''}
            </div>
        ` : '';
        
        modalBody.innerHTML = `
            <img src="${item.image_path}" alt="${item.subcategory}" class="modal-image">
            
            <div class="modal-header-section">
                <h2>${item.subcategory}</h2>
                <button class="btn-favorite ${item.is_favorite ? 'active' : ''}" onclick="toggleFavorite(${itemId})">
                    ${item.is_favorite ? '⭐ Favorite' : '☆ Add to Favorites'}
                </button>
            </div>
            
            ${item.brand ? `<p class="item-brand-modal">${item.brand}</p>` : ''}
            
            <div class="clothing-card-meta">
                <span class="badge badge-category">${item.category}</span>
                <span class="badge badge-season">${item.season}</span>
                <span class="badge badge-style">${item.style}</span>
                ${item.size ? `<span class="badge badge-size">Size: ${item.size}</span>` : ''}
            </div>
            
            <div class="color-swatches">${colorSwatches}</div>
            
            <div class="modal-section">
                <h3>📊 Current Status</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-icon">${item.washed && wearCount === 0 ? '✓' : wearCount > 0 ? '🔄' : '⚠'}</span>
                        <span class="status-text">
                            ${item.washed && wearCount === 0 ? 'Clean & Ready' : 
                              wearCount > 0 ? `Worn ${wearCount}x, can wear again` : 
                              'Needs Washing'}
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-icon">📅</span>
                        <span class="status-text">Last worn: ${daysSince}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-icon">📍</span>
                        <span class="status-text">${item.physical_location || 'Closet'}</span>
                    </div>
                </div>
            </div>
            
            ${wearAgainSection}
            
            <div class="modal-section">
                <h3>💚 Freshness & Condition</h3>
                <div class="score-bars">
                    <div class="score-bar-container">
                        <label>Freshness Score</label>
                        <div class="score-bar">
                            <div class="score-fill ${freshness >= 80 ? 'fresh-high' : freshness >= 60 ? 'fresh-medium' : 'fresh-low'}" 
                                 style="width: ${freshness}%"></div>
                        </div>
                        <span class="score-value">${freshness}%</span>
                    </div>
                    <div class="score-bar-container">
                        <label>Condition Score</label>
                        <div class="score-bar">
                            <div class="score-fill ${condition >= 80 ? 'fresh-high' : condition >= 60 ? 'fresh-medium' : 'fresh-low'}" 
                                 style="width: ${condition}%"></div>
                        </div>
                        <span class="score-value">${condition}%</span>
                    </div>
                </div>
                ${freshness < 60 ? '<p class="score-hint">😴 You might be getting tired of this item. Consider giving it a 2-week break!</p>' : ''}
            </div>
            
            ${purchaseInfo}
            
            ${item.notes ? `
            <div class="modal-section">
                <h3>📝 Notes</h3>
                <p class="item-notes">${item.notes}</p>
            </div>
            ` : ''}
            
            <div class="modal-actions">
                ${wearCount > 0 ? `
                    <button class="btn btn-success" onclick="handleWearAgainDecision(${itemId}, true)">
                        👍 Can Wear Again
                    </button>
                    <button class="btn btn-secondary" onclick="handleWearAgainDecision(${itemId}, false)">
                        🧺 Send to Laundry
                    </button>
                ` : item.washed ? `
                    <button class="btn btn-success" onclick="markAsWorn(${itemId})">
                        👕 Mark as Worn Today
                    </button>
                ` : ''}
                
                ${!item.washed || wearCount >= maxWear ? `
                    <button class="btn btn-primary" onclick="markAsWashed(${itemId})">
                        ✨ Mark as Washed
                    </button>
                ` : ''}
                
                ${item.physical_location !== 'laundry' && (!item.washed || wearCount > 0) ? `
                    <button class="btn btn-secondary" onclick="addToLaundry(${itemId})">
                        🧺 Add to Laundry Queue
                    </button>
                ` : ''}
                
                <button class="btn btn-danger" onclick="deleteItem(${itemId})">
                    🗑️ Delete Item
                </button>
            </div>
        `;
        
        modal.classList.remove('hidden');
        modal.classList.add('active');
        
    } catch (error) {
        console.error('Error loading item:', error);
        alert('Failed to load item details');
    }
}

// Modal close
document.querySelector('.modal-close').addEventListener('click', () => {
    closeModal();
});

document.getElementById('item-modal').addEventListener('click', (e) => {
    if (e.target.id === 'item-modal') {
        closeModal();
    }
});

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
async function generateOutfits() {
    const container = document.getElementById('outfits-container');
    container.innerHTML = '<div class="loading">Generating outfits...</div>';
    
    const occasion = document.getElementById('occasion-filter').value;
    const season = document.getElementById('season-filter').value;
    
    const params = new URLSearchParams();
    if (occasion) params.append('occasion', occasion);
    if (season) params.append('season', season);
    
    try {
        const response = await fetch(`${API_BASE}/outfits/recommend?${params}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const data = await response.json();
        
        if (data.outfits.length === 0) {
            container.innerHTML = '<div class="empty-state">No outfit combinations found. Try adding more items or changing filters!</div>';
            return;
        }
        
        container.innerHTML = data.outfits.map((outfit, index) => createOutfitCard(outfit, index)).join('');
    } catch (error) {
        container.innerHTML = '<div class="empty-state">Failed to generate outfits</div>';
    }
}

function createOutfitCard(outfit, index) {
    const items = outfit.items.map(item => `
        <div class="outfit-item">
            <img src="${item.image_path}" alt="${item.subcategory}">
            <div class="outfit-item-info">
                <div class="outfit-item-category">${item.subcategory}</div>
            </div>
        </div>
    `).join('');
    
    return `
        <div class="outfit-card">
            <div class="outfit-header">
                <h3>Outfit ${index + 1}</h3>
                <span class="outfit-score">Score: ${outfit.score}/100</span>
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
                    ${Object.entries(stats.by_category).map(([cat, count]) => 
                        `<li><span>${cat}</span><span>${count}</span></li>`
                    ).join('')}
                </ul>
            </div>
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
    
    return `
        <div class="laundry-card">
            <img src="${item.image_path}" alt="${item.subcategory}">
            <div class="laundry-card-content">
                <h4>${item.subcategory}</h4>
                <p class="laundry-meta">
                    ${item.priority === 'urgent' ? '⚡ Urgent' : ''}
                    ${daysInQueue > 0 ? `• ${daysInQueue}d in queue` : ''}
                </p>
                <div class="laundry-actions">
                    ${item.status === 'queued' ? `
                        <button class="btn-small btn-primary" onclick="updateLaundryStatus(${item.id}, 'washing')">
                            Start Washing
                        </button>
                    ` : ''}
                    ${item.status === 'washing' ? `
                        <button class="btn-small btn-primary" onclick="updateLaundryStatus(${item.id}, 'drying')">
                            Move to Drying
                        </button>
                    ` : ''}
                    ${item.status === 'drying' ? `
                        <button class="btn-small btn-success" onclick="updateLaundryStatus(${item.id}, 'ready')">
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
                    ⚠️ Found <strong>${data.items.length} items</strong> that haven't been worn in ${days}+ days.
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
    const cpw = item.cost_per_wear ? `$${item.cost_per_wear}` : item.purchase_price ? `$${item.purchase_price}` : 'N/A';
    
    return `
        <div class="insight-card" onclick="showItemModal(${item.id})">
            <img src="${item.image_path}" alt="${item.subcategory}">
            <div class="insight-overlay">
                <div class="insight-badge">
                    ${item.times_worn === 0 ? '🆕 Never Worn' : `😴 ${daysSince}d ago`}
                </div>
            </div>
            <div class="insight-content">
                <h4>${item.subcategory}</h4>
                <div class="insight-stats">
                    <span>Worn: ${item.times_worn}x</span>
                    <span>CPW: ${cpw}</span>
                </div>
                <div class="insight-actions">
                    <button class="btn-small btn-primary" onclick="event.stopPropagation(); planOutfitWith(${item.id})">
                        📋 Plan Outfit
                    </button>
                    <button class="btn-small btn-secondary" onclick="event.stopPropagation(); considerDonating(${item.id})">
                        💝 Donate?
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function planOutfitWith(itemId) {
    showToast('💡 Outfit planning coming soon!');
    // TODO: Implement outfit planning feature
}

async function considerDonating(itemId) {
    if (confirm('Mark this item for donation? You can still change your mind later.')) {
        // TODO: Implement donation marking feature
        showToast('📦 Item marked for donation');
    }
}
