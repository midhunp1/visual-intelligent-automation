class LoginManager {
    constructor() {
        this.form = document.getElementById('login-form');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.loginButton = document.getElementById('login-button');
        this.buttonText = document.getElementById('button-text');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.errorMessage = document.getElementById('error-message');
        
        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleLogin(e));
        
        // Clear errors when user starts typing
        this.usernameInput.addEventListener('input', () => this.clearError());
        this.passwordInput.addEventListener('input', () => this.clearError());
        
        // Check if already logged in
        this.checkExistingAuth();
    }

    async checkExistingAuth() {
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                const response = await fetch('/api/auth/verify', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    // Already logged in, redirect to intended page or home
                    this.redirectAfterLogin();
                    return;
                }
            } catch (error) {
                console.log('Auth verification failed:', error);
            }
            
            // Invalid token, remove it
            localStorage.removeItem('authToken');
        }
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value;
        
        if (!username || !password) {
            this.showError('Please enter both username and password');
            return;
        }

        this.setLoading(true);
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                this.showSuccess('Login successful! Redirecting...');
                
                // Redirect after short delay
                setTimeout(() => {
                    this.redirectAfterLogin();
                }, 1000);
                
            } else {
                // Login failed
                this.showError(data.message || 'Login failed. Please try again.');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Connection error. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    redirectAfterLogin() {
        // Check if there's a redirect URL in the query params
        const urlParams = new URLSearchParams(window.location.search);
        const redirectUrl = urlParams.get('redirect');
        
        if (redirectUrl) {
            // Redirect to intended page
            window.location.href = decodeURIComponent(redirectUrl);
        } else {
            // Default redirect to home
            window.location.href = 'home.html';
        }
    }

    setLoading(loading) {
        if (loading) {
            this.loginButton.disabled = true;
            this.buttonText.textContent = 'Signing in...';
            this.loadingSpinner.style.display = 'block';
        } else {
            this.loginButton.disabled = false;
            this.buttonText.textContent = 'Sign In';
            this.loadingSpinner.style.display = 'none';
        }
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.usernameInput.classList.add('error');
        this.passwordInput.classList.add('error');
    }

    showSuccess(message) {
        // Find success message element
        const successElement = document.getElementById('success-message');
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
            this.errorMessage.style.display = 'none';
        } else {
            // Fallback to using error message element
            this.errorMessage.textContent = message;
            this.errorMessage.style.display = 'block';
            this.errorMessage.style.background = '#F0FDF4';
            this.errorMessage.style.color = '#15803D';
            this.errorMessage.style.borderColor = '#BBF7D0';
        }
    }

    clearError() {
        this.errorMessage.style.display = 'none';
        this.usernameInput.classList.remove('error');
        this.passwordInput.classList.remove('error');
        this.errorMessage.style.background = '#FEF2F2';
        this.errorMessage.style.color = '#DC2626';
        this.errorMessage.style.borderColor = '#FEE2E2';
    }
}

// Initialize login manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});