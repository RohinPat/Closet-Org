// Authentication JavaScript

const API_URL = window.location.origin;

// Utility functions
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    const errorDiv = document.getElementById('error-message');
    errorDiv.classList.add('hidden');
}

function setLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    
    if (isLoading) {
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        button.disabled = true;
    } else {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        button.disabled = false;
    }
}

// Login form handler
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        
        const button = document.getElementById('login-btn');
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            setLoading(button, true);
            
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || 'Login failed');
            }
            
            // Store token and user info
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Redirect to main app
            window.location.href = '/app';
            
        } catch (error) {
            showError(error.message);
            setLoading(button, false);
        }
    });
}

// Register form handler
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        
        const button = document.getElementById('register-btn');
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm_password').value;
        const fullName = document.getElementById('full_name').value;
        
        // Validation
        if (password.length < 6) {
            showError('Password must be at least 6 characters long');
            return;
        }
        
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        try {
            setLoading(button, true);
            
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    full_name: fullName || null
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || 'Registration failed');
            }
            
            // Store token and user info
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Redirect to main app
            window.location.href = '/app';
            
        } catch (error) {
            showError(error.message);
            setLoading(button, false);
        }
    });
}

const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const button = document.getElementById('forgot-btn');
        const email = document.getElementById('forgot-email').value.trim();
        if (!email) {
            showError('Email is required');
            return;
        }
        try {
            setLoading(button, true);
            const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Request failed');
            }
            let msg = data.message || 'Done.';
            if (data.dev_reset_token) {
                msg += '\n\nRedirecting to reset page with your dev token…';
            }
            alert(msg);
            if (data.dev_reset_token) {
                window.location.href =
                    '/frontend/reset-password.html?token=' +
                    encodeURIComponent(data.dev_reset_token);
            }
        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(button, false);
        }
    });
}

const resetForm = document.getElementById('reset-form');
if (resetForm) {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get('token');
    const tokenInput = document.getElementById('reset-token');
    if (preset && tokenInput) {
        tokenInput.value = preset;
    }
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const button = document.getElementById('reset-btn');
        const token = document.getElementById('reset-token').value.trim();
        const password = document.getElementById('reset-password').value;
        const confirmPassword = document.getElementById('reset-confirm').value;
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        try {
            setLoading(button, true);
            const response = await fetch(`${API_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, new_password: password }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Reset failed');
            }
            alert(data.message || 'Password updated.');
            window.location.href = '/frontend/login.html';
        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(button, false);
        }
    });
}

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    
    // If on login/register page and already have token, redirect to app
    if (token && (window.location.pathname.includes('login') || window.location.pathname.includes('register') || window.location.pathname.includes('forgot-password') || window.location.pathname.includes('reset-password'))) {
        // Verify token is still valid
        fetch(`${API_URL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (response.ok) {
                window.location.href = '/app';
            } else {
                // Token invalid, clear storage
                localStorage.removeItem('access_token');
                localStorage.removeItem('user');
            }
        })
        .catch(() => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
        });
    }
});

