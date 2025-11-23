// API Base URL
const API_BASE = 'http://localhost:8000/api';

// State
let currentTab = 'closet';
let selectedFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initUpload();
    loadCloset();
    loadStats();
    
    // Event listeners for filters
    document.getElementById('category-filter').addEventListener('change', loadCloset);
    document.getElementById('status-filter').addEventListener('change', loadCloset);
    document.getElementById('generate-outfits-btn').addEventListener('click', generateOutfits);
});

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
    }
}

// Upload functionality
function initUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImage = document.getElementById('preview-image');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const addAnotherBtn = document.getElementById('add-another-btn');
    
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
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });
    
    // File input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    // Upload button
    uploadBtn.addEventListener('click', uploadImage);
    
    // Cancel button
    cancelBtn.addEventListener('click', resetUpload);
    
    // Add another button
    addAnotherBtn.addEventListener('click', resetUpload);
}

function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    
    selectedFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-image').src = e.target.result;
        document.getElementById('upload-area').style.display = 'none';
        document.getElementById('upload-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

async function uploadImage() {
    if (!selectedFile) return;
    
    const uploadBtn = document.getElementById('upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
        const response = await fetch(`${API_BASE}/upload-clothing`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showClassificationResult(data);
        } else {
            alert('Upload failed. Please try again.');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed. Please make sure the server is running.');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload & Classify';
    }
}

function showClassificationResult(data) {
    document.getElementById('upload-preview').classList.add('hidden');
    
    const resultDiv = document.getElementById('classification-result');
    const detailsDiv = resultDiv.querySelector('.result-details');
    
    const { classification } = data;
    
    detailsDiv.innerHTML = `
        <div class="result-row">
            <span class="result-label">Category:</span>
            <span class="result-value">${classification.category}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Type:</span>
            <span class="result-value">${classification.subcategory}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Colors:</span>
            <span class="result-value">${classification.colors.join(', ')}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Season:</span>
            <span class="result-value">${classification.season}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Style:</span>
            <span class="result-value">${classification.style}</span>
        </div>
        <div class="result-row">
            <span class="result-label">Confidence:</span>
            <span class="result-value">${classification.confidence}%</span>
        </div>
    `;
    
    resultDiv.classList.remove('hidden');
}

function resetUpload() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('upload-area').style.display = 'block';
    document.getElementById('upload-preview').classList.add('hidden');
    document.getElementById('classification-result').classList.add('hidden');
}

// Closet functionality
async function loadCloset() {
    const closetGrid = document.getElementById('closet-grid');
    closetGrid.innerHTML = '<div class="loading">Loading your closet...</div>';
    
    const category = document.getElementById('category-filter').value;
    const status = document.getElementById('status-filter').value;
    
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    
    try {
        const response = await fetch(`${API_BASE}/closet?${params}`);
        const data = await response.json();
        
        displayClosetItems(data.items);
    } catch (error) {
        console.error('Error loading closet:', error);
        closetGrid.innerHTML = '<div class="empty-state">Failed to load items. Make sure the server is running.</div>';
    }
}

function displayClosetItems(items) {
    const closetGrid = document.getElementById('closet-grid');
    
    if (items.length === 0) {
        closetGrid.innerHTML = '<div class="empty-state">No items found. Upload some clothes to get started!</div>';
        return;
    }
    
    closetGrid.innerHTML = items.map(item => createClothingCard(item)).join('');
    
    // Add click listeners
    document.querySelectorAll('.clothing-card').forEach(card => {
        card.addEventListener('click', () => {
            showItemModal(parseInt(card.dataset.itemId));
        });
    });
}

function createClothingCard(item) {
    const colorSwatches = item.colors.map(color => 
        `<div class="color-swatch" style="background-color: ${color};" title="${color}"></div>`
    ).join('');
    
    const statusClass = item.washed ? 'status-clean' : 'status-dirty';
    const statusText = item.washed ? '✓ Clean' : '⚠ Needs Washing';
    
    return `
        <div class="clothing-card" data-item-id="${item.id}">
            <img src="${item.image_path}" alt="${item.category}" class="clothing-card-image" onerror="this.src='https://via.placeholder.com/280x250?text=No+Image'">
            <div class="clothing-card-content">
                <h3 class="clothing-card-title">${item.category}</h3>
                <div class="clothing-card-meta">
                    <span class="badge badge-category">${item.subcategory}</span>
                    <span class="badge badge-season">${item.season}</span>
                    <span class="badge badge-style">${item.style}</span>
                </div>
                <div class="color-swatches">${colorSwatches}</div>
                <div class="clothing-card-status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${item.times_worn ? `<span class="status-badge">Worn ${item.times_worn}x</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

async function showItemModal(itemId) {
    try {
        const response = await fetch(`${API_BASE}/item/${itemId}`);
        const item = await response.json();
        
        const modal = document.getElementById('item-modal');
        const modalBody = document.getElementById('modal-body');
        
        const colorSwatches = item.colors.map(color => 
            `<div class="color-swatch" style="background-color: ${color};" title="${color}"></div>`
        ).join('');
        
        modalBody.innerHTML = `
            <img src="${item.image_path}" alt="${item.category}" class="modal-image" onerror="this.src='https://via.placeholder.com/600x400?text=No+Image'">
            <h2>${item.category}</h2>
            <div class="clothing-card-meta">
                <span class="badge badge-category">${item.subcategory}</span>
                <span class="badge badge-season">${item.season}</span>
                <span class="badge badge-style">${item.style}</span>
            </div>
            <div style="margin: 1rem 0;">
                <strong>Colors:</strong>
                <div class="color-swatches">${colorSwatches}</div>
            </div>
            <p><strong>Times Worn:</strong> ${item.times_worn}</p>
            <p><strong>Status:</strong> ${item.washed ? 'Clean' : 'Needs Washing'}</p>
            <p><strong>Added:</strong> ${new Date(item.date_added).toLocaleDateString()}</p>
            ${item.last_worn ? `<p><strong>Last Worn:</strong> ${new Date(item.last_worn).toLocaleDateString()}</p>` : ''}
            
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="markAsWorn(${itemId})">
                    ${item.worn ? 'Mark as Unworn' : 'Mark as Worn'}
                </button>
                <button class="btn btn-success" onclick="markAsWashed(${itemId})">
                    ${item.washed ? 'Mark as Dirty' : 'Mark as Washed'}
                </button>
                <button class="btn btn-danger" onclick="deleteItem(${itemId})">Delete Item</button>
            </div>
        `;
        
        modal.classList.add('active');
        
        // Close modal on click outside or close button
        modal.querySelector('.modal-close').onclick = () => modal.classList.remove('active');
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('active');
        };
    } catch (error) {
        console.error('Error loading item:', error);
        alert('Failed to load item details');
    }
}

async function markAsWorn(itemId) {
    try {
        const response = await fetch(`${API_BASE}/item/${itemId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ worn: true })
        });
        
        if (response.ok) {
            document.getElementById('item-modal').classList.remove('active');
            loadCloset();
            loadStats();
        }
    } catch (error) {
        console.error('Error updating item:', error);
        alert('Failed to update item');
    }
}

async function markAsWashed(itemId) {
    try {
        const response = await fetch(`${API_BASE}/item/${itemId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ washed: true })
        });
        
        if (response.ok) {
            document.getElementById('item-modal').classList.remove('active');
            loadCloset();
            loadStats();
        }
    } catch (error) {
        console.error('Error updating item:', error);
        alert('Failed to update item');
    }
}

async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/item/${itemId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            document.getElementById('item-modal').classList.remove('active');
            loadCloset();
            loadStats();
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item');
    }
}

// Outfit recommendations
async function generateOutfits() {
    const outfitsContainer = document.getElementById('outfits-container');
    outfitsContainer.innerHTML = '<div class="loading">Generating outfit recommendations...</div>';
    
    const occasion = document.getElementById('occasion-filter').value;
    const season = document.getElementById('season-filter').value;
    
    const params = new URLSearchParams();
    if (occasion) params.append('occasion', occasion);
    if (season) params.append('season', season);
    
    try {
        const response = await fetch(`${API_BASE}/outfits/recommend?${params}`);
        const data = await response.json();
        
        displayOutfits(data.outfits);
    } catch (error) {
        console.error('Error generating outfits:', error);
        outfitsContainer.innerHTML = '<div class="empty-state">Failed to generate outfits. Make sure the server is running.</div>';
    }
}

function displayOutfits(outfits) {
    const outfitsContainer = document.getElementById('outfits-container');
    
    if (outfits.length === 0) {
        outfitsContainer.innerHTML = '<div class="empty-state">No outfits could be generated. Add more items to your closet!</div>';
        return;
    }
    
    outfitsContainer.innerHTML = outfits.map((outfit, index) => `
        <div class="outfit-card">
            <div class="outfit-header">
                <h3>Outfit ${index + 1}</h3>
                <div class="outfit-score">Match Score: ${Math.round(outfit.score)}</div>
            </div>
            <div class="outfit-items">
                ${outfit.items.map(item => `
                    <div class="outfit-item">
                        <img src="${item.image_path}" alt="${item.category}" onerror="this.src='https://via.placeholder.com/180x150?text=No+Image'">
                        <div class="outfit-item-info">
                            <div class="outfit-item-category">${item.category}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Statistics
async function loadStats() {
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = '<div class="loading">Loading statistics...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();
        
        displayStats(stats);
    } catch (error) {
        console.error('Error loading stats:', error);
        statsContainer.innerHTML = '<div class="empty-state">Failed to load statistics.</div>';
    }
}

function displayStats(stats) {
    const statsContainer = document.getElementById('stats-container');
    
    const categoryList = Object.entries(stats.by_category)
        .map(([cat, count]) => `<li><span>${cat}</span><span>${count}</span></li>`)
        .join('');
    
    const mostWornList = stats.most_worn
        .map(item => `<li><span>${item.category}</span><span>${item.times_worn} times</span></li>`)
        .join('') || '<li>No items worn yet</li>';
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <h3>Total Items</h3>
            <div class="stat-number">${stats.total_items}</div>
        </div>
        
        <div class="stat-card">
            <h3>Clean Items</h3>
            <div class="stat-number">${stats.clean_items}</div>
        </div>
        
        <div class="stat-card">
            <h3>Need Washing</h3>
            <div class="stat-number">${stats.dirty_items}</div>
        </div>
        
        <div class="stat-card">
            <h3>Recently Added</h3>
            <div class="stat-number">${stats.recently_added}</div>
            <p style="color: var(--text-secondary); margin-top: 0.5rem;">Last 7 days</p>
        </div>
        
        <div class="stat-card">
            <h3>Items by Category</h3>
            <ul class="stat-list">
                ${categoryList}
            </ul>
        </div>
        
        <div class="stat-card">
            <h3>Most Worn Items</h3>
            <ul class="stat-list">
                ${mostWornList}
            </ul>
        </div>
    `;
}

