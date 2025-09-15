// Shared authentication utilities
class AuthManager {
    constructor() {
        // Don't check auth on login page
        if (!window.location.pathname.includes('login.html')) {
            this.checkAuth();
        }
    }

    async checkAuth() {
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            this.redirectToLogin();
            return false;
        }

        // For simple POC, just check if token exists
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Always add user display
        this.updateUserDisplay(user);
        
        return true;
    }

    updateUserDisplay(user) {
        // Add user profile button to navbar if it exists
        const navRight = document.querySelector('.nav-right');
        if (navRight && !document.getElementById('user-profile-btn')) {
            // Create profile button with visible text
            const profileBtn = document.createElement('button');
            profileBtn.id = 'user-profile-btn';
            profileBtn.className = 'btn-primary';
            profileBtn.style.cssText = 'margin-left: 12px; padding: 8px 16px; font-size: 14px; display: flex; align-items: center; gap: 8px;';
            profileBtn.innerHTML = `
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <span>${user.name || user.username || 'Profile'}</span>
            `;
            profileBtn.title = 'Click to open profile menu';
            profileBtn.onclick = () => this.showProfileMenu();
            navRight.appendChild(profileBtn);
        }
    }

    showProfileMenu() {
        // Remove existing menu if present
        const existingMenu = document.getElementById('profile-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        const menu = document.createElement('div');
        menu.id = 'profile-menu';
        menu.style.cssText = `
            position: absolute;
            top: 60px;
            right: 20px;
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            min-width: 200px;
            z-index: 1000;
            animation: fadeIn 0.2s ease;
        `;

        menu.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid #F3F4F6;">
                <div style="font-weight: 600; color: #111827; font-size: 14px;">${user.name || user.username}</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 2px;">${user.email || ''}</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 2px;">${user.teamName || ''}</div>
            </div>
            <div style="padding: 8px 0;">
                <button onclick="authManager.goToProfile()" style="
                    width: 100%;
                    padding: 8px 16px;
                    background: none;
                    border: none;
                    text-align: left;
                    cursor: pointer;
                    font-size: 14px;
                    color: #374151;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='none'">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Profile Settings
                </button>
                <button onclick="authManager.logout()" style="
                    width: 100%;
                    padding: 8px 16px;
                    background: none;
                    border: none;
                    text-align: left;
                    cursor: pointer;
                    font-size: 14px;
                    color: #EF4444;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='none'">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16,17 21,12 16,7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                </button>
            </div>
        `;

        document.body.appendChild(menu);

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && !document.getElementById('user-profile-btn').contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    }

    goToProfile() {
        window.location.href = 'profile.html';
    }

    async logout() {
        const token = localStorage.getItem('authToken');
        
        try {
            // Inform server about logout
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.log('Logout request failed:', error);
        }
        
        this.clearAuth();
        this.redirectToLogin();
    }

    clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    }

    redirectToLogin() {
        const currentPage = window.location.pathname + window.location.search;
        window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
    }

    getAuthHeaders() {
        const token = localStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async fetchWithAuth(url, options = {}) {
        const headers = {
            ...options.headers,
            ...this.getAuthHeaders()
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            // Unauthorized, redirect to login
            this.clearAuth();
            this.redirectToLogin();
            throw new Error('Unauthorized');
        }

        return response;
    }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);

// Initialize auth manager when DOM is loaded
let authManager;
document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();
});