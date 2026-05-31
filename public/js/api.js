// ============================================
// TaskFlow Pro – API Client & Utilities
// ============================================

const API_BASE = '/api';

// Get stored token
function getToken() {
    return localStorage.getItem('taskflow_token');
}

// Set token
function setToken(token) {
    localStorage.setItem('taskflow_token', token);
}

// Clear token
function clearToken() {
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_user');
}

// Get current user from localStorage
function getCurrentUser() {
    const data = localStorage.getItem('taskflow_user');
    return data ? JSON.parse(data) : null;
}

// Save user to localStorage
function setCurrentUser(user) {
    localStorage.setItem('taskflow_user', JSON.stringify(user));
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                clearToken();
                window.location.href = '/index.html';
                return;
            }
            throw new Error(data.error || 'Something went wrong');
        }

        return data;
    } catch (err) {
        if (err.message === 'Failed to fetch') {
            throw new Error('Unable to connect to server. Please try again.');
        }
        throw err;
    }
}

// Shorthand API methods
const api = {
    get: (endpoint) => apiRequest(endpoint),
    post: (endpoint, body) => apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    }),
    put: (endpoint, body) => apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    }),
    delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' })
};

// ── Toast Notification System ──
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// ── Modal Helpers ──
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('show')) {
        e.target.classList.remove('show');
        document.body.style.overflow = '';
    }
});

// ── Date Formatting ──
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatFullDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function isOverdue(dateString) {
    if (!dateString) return false;
    return new Date(dateString) < new Date(new Date().toDateString());
}

// ── User Avatar Helper ──
function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function createAvatar(name, color, size = 34) {
    return `<div class="user-avatar" style="background: ${color}; width: ${size}px; height: ${size}px; font-size: ${size * 0.38}px;">${getInitials(name)}</div>`;
}

// ── WebSocket Manager ──
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.listeners = new Map();
    }

    connect() {
        const token = getToken();
        if (!token) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.emit(data.type, data);
                } catch (err) {
                    console.error('WS parse error:', err);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.tryReconnect();
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
            };

            // Keep alive
            this.pingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 25000);
        } catch (err) {
            console.error('WebSocket connection failed:', err);
        }
    }

    tryReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

        setTimeout(() => {
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            this.connect();
        }, delay);
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    joinProject(projectId) {
        this.send({ type: 'join_project', projectId });
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }

    disconnect() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.ws) this.ws.close();
    }
}

// Global WebSocket instance
const wsManager = new WebSocketManager();

// ── Auth Check ──
function requireAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/index.html';
        return false;
    }
    return true;
}

// ── Sidebar Setup (shared across dashboard & board) ──
async function setupSidebar() {
    const user = getCurrentUser();
    if (!user) return;

    // Set user info
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');

    if (avatarEl) {
        avatarEl.style.background = user.avatar_color;
        avatarEl.textContent = getInitials(user.full_name);
    }
    if (nameEl) nameEl.textContent = user.full_name;
    if (emailEl) emailEl.textContent = user.email;

    // User dropdown toggle
    const menuBtn = document.getElementById('user-menu-btn');
    const dropdown = document.getElementById('user-dropdown');
    if (menuBtn && dropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('show');
        });
    }

    // Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await api.post('/auth/logout');
            } catch (e) { /* ignore */ }
            clearToken();
            wsManager.disconnect();
            window.location.href = '/index.html';
        });
    }

    // Mobile sidebar
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (mobileBtn && sidebar) {
        mobileBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            if (backdrop) backdrop.classList.toggle('show');
        });

        if (backdrop) {
            backdrop.addEventListener('click', () => {
                sidebar.classList.remove('open');
                backdrop.classList.remove('show');
            });
        }
    }

    // Load projects for sidebar
    try {
        const data = await api.get('/projects');
        const container = document.getElementById('sidebar-projects');
        if (container && data.projects) {
            container.innerHTML = data.projects.map(p => `
                <a href="/board.html?id=${p.id}" class="project-list-item" data-project-id="${p.id}">
                    <span class="project-dot" style="background: ${p.color};"></span>
                    <span>${p.icon} ${p.name}</span>
                </a>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load sidebar projects:', err);
    }

    // Notifications
    setupNotifications();
}

// ── Notifications Setup ──
async function setupNotifications() {
    const notifBtn = document.getElementById('btn-notifications');
    const navNotif = document.getElementById('nav-notifications');
    const panel = document.getElementById('notifications-panel');
    const closeBtn = document.getElementById('btn-close-notifications');
    const markAllBtn = document.getElementById('btn-mark-all-read');

    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            panel.classList.toggle('open');
            loadNotifications();
        });
    }

    if (navNotif) {
        navNotif.addEventListener('click', (e) => {
            e.preventDefault();
            panel.classList.toggle('open');
            loadNotifications();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.remove('open');
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            try {
                await api.put('/notifications/read-all');
                loadNotifications();
                updateNotifBadge(0);
                showToast('All notifications marked as read', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    // Initial badge update
    try {
        const data = await api.get('/notifications');
        updateNotifBadge(data.unread_count);
    } catch (err) {
        // ignore
    }

    // WebSocket notification updates
    wsManager.on('notification_count', (data) => {
        updateNotifBadge(data.count);
    });
}

function updateNotifBadge(count) {
    const headerBadge = document.getElementById('header-notif-badge');
    const sidebarBadge = document.getElementById('sidebar-notif-badge');

    if (headerBadge) {
        if (count > 0) {
            headerBadge.classList.remove('hidden');
        } else {
            headerBadge.classList.add('hidden');
        }
    }

    if (sidebarBadge) {
        sidebarBadge.textContent = count;
        if (count > 0) {
            sidebarBadge.classList.remove('hidden');
        } else {
            sidebarBadge.classList.add('hidden');
        }
    }
}

async function loadNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    try {
        const data = await api.get('/notifications');
        updateNotifBadge(data.unread_count);

        if (data.notifications.length === 0) {
            list.innerHTML = `
                <div class="notif-empty">
                    <div class="empty-icon">🔔</div>
                    <p>No notifications yet</p>
                </div>
            `;
            return;
        }

        list.innerHTML = data.notifications.map(n => `
            <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link}" onclick="handleNotifClick(this)">
                <div class="notif-title">${n.title}</div>
                <div class="notif-message">${n.message}</div>
                <div class="notif-time">${formatDate(n.created_at)}</div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = `<div class="notif-empty"><p>Failed to load</p></div>`;
    }
}

async function handleNotifClick(el) {
    const id = el.dataset.id;
    const link = el.dataset.link;

    try {
        await api.put(`/notifications/${id}/read`);
        el.classList.remove('unread');
    } catch (e) { /* ignore */ }

    if (link) {
        window.location.href = link;
    }
}
