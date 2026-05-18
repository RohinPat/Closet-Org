// Authentication JavaScript

const API_URL = window.location.origin;
const { formatAuthError, errorMessageFromCaught } = window.ClosetWebUtils;
let sessionCheckAbort = null;

// Utility functions
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (!errorDiv) return;
    const text = formatAuthError(message) || 'Something went wrong. Please try again.';
    errorDiv.textContent = text;
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

// Password visibility toggle (login)
const passwordToggle = document.getElementById('password-toggle');
if (passwordToggle) {
    passwordToggle.addEventListener('click', () => {
        const input = document.getElementById('password');
        const showIcon = passwordToggle.querySelector('.icon-show');
        const hideIcon = passwordToggle.querySelector('.icon-hide');
        if (!input) return;
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        passwordToggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
        passwordToggle.setAttribute('aria-pressed', visible ? 'false' : 'true');
        showIcon?.classList.toggle('hidden', !visible);
        hideIcon?.classList.toggle('hidden', visible);
    });
}

// Login form handler
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        
        const button = document.getElementById('login-btn');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        
        if (!username) {
            showError('Enter your username or email');
            return;
        }
        
        try {
            setLoading(button, true);
            sessionCheckAbort?.abort();
            
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password }),
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(formatAuthError(data.detail) || 'Login failed');
            }
            if (!data.access_token) {
                throw new Error('Login succeeded but no token was returned');
            }
            
            // Store token and user info
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Redirect to main app (replace so back button does not return to login)
            window.location.replace('/app');
            
        } catch (error) {
            showError(errorMessageFromCaught(error));
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
        const fullName = document.getElementById('full_name').value.trim();
        const usernameTrim = username.trim();
        
        // Validation (match backend rules)
        if (usernameTrim.length < 3) {
            showError('Username must be at least 3 characters');
            return;
        }
        if (!/^[a-zA-Z0-9_.\-]+$/.test(usernameTrim)) {
            showError('Username can only use letters, numbers, and _ . -');
            return;
        }
        if (password.length < 10) {
            showError('Password must be at least 10 characters');
            return;
        }
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        try {
            setLoading(button, true);
            sessionCheckAbort?.abort();
            
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: usernameTrim,
                    email: email.trim(),
                    password,
                    full_name: fullName || null,
                }),
            });
            
            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error(response.ok ? 'Invalid server response' : 'Registration failed');
            }
            
            if (!response.ok) {
                throw new Error(formatAuthError(data.detail) || 'Registration failed');
            }
            if (!data.access_token) {
                throw new Error('Registration succeeded but no token was returned');
            }
            
            // Store token and user info
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            window.location.replace('/app');
            
        } catch (error) {
            showError(errorMessageFromCaught(error));
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
                throw new Error(formatAuthError(data.detail) || 'Request failed');
            }
            let msg = data.message || 'Done.';
            if (data.dev_reset_token) {
                msg += '\n\nRedirecting to reset page with your dev token…';
            }
            ClosetWebUtils.showToast(msg, 'success');
            if (data.dev_reset_token) {
                window.location.href =
                    '/frontend/reset-password.html?token=' +
                    encodeURIComponent(data.dev_reset_token);
            }
        } catch (error) {
            showError(errorMessageFromCaught(error));
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
                throw new Error(formatAuthError(data.detail) || 'Reset failed');
            }
            ClosetWebUtils.showToast(data.message || 'Password updated.', 'success');
            window.location.href = '/frontend/login.html';
        } catch (error) {
            showError(errorMessageFromCaught(error));
        } finally {
            setLoading(button, false);
        }
    });
}

// Check if already logged in (must not clear a newer token from a concurrent login)
window.addEventListener('DOMContentLoaded', () => {
    const tokenAtStart = localStorage.getItem('access_token');
    const onAuthPage =
        window.location.pathname.includes('login') ||
        window.location.pathname.includes('register') ||
        window.location.pathname.includes('forgot-password') ||
        window.location.pathname.includes('reset-password');

    if (!tokenAtStart || !onAuthPage) return;

    sessionCheckAbort?.abort();
    sessionCheckAbort = new AbortController();
    const { signal } = sessionCheckAbort;

    fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${tokenAtStart}` },
        signal,
    })
        .then((response) => {
            const tokenNow = localStorage.getItem('access_token');
            if (tokenNow !== tokenAtStart) return;
            if (response.ok) {
                window.location.replace('/app');
                return;
            }
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
        })
        .catch((err) => {
            if (err && err.name === 'AbortError') return;
            const tokenNow = localStorage.getItem('access_token');
            if (tokenNow !== tokenAtStart) return;
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
        });
});

