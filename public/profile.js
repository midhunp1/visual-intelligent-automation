class ProfileManager {
    constructor() {
        this.form = document.getElementById('profile-form');
        this.usernameInput = document.getElementById('username');
        this.nameInput = document.getElementById('name');
        this.emailInput = document.getElementById('email');
        this.teamNameInput = document.getElementById('teamName');
        this.saveButton = document.getElementById('save-button');
        this.successMessage = document.getElementById('success-message');
        this.errorMessage = document.getElementById('error-message');
        this.avatar = document.getElementById('avatar');
        this.userDisplayName = document.getElementById('user-display-name');
        this.userUsername = document.getElementById('user-username');
        
        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSave(e));
        this.loadProfile();
    }

    async loadProfile() {
        try {
            const response = await fetch('/api/auth/profile');
            const data = await response.json();

            if (data.success) {
                const user = data.user;
                
                // Update form fields
                this.usernameInput.value = user.username || '';
                this.nameInput.value = user.name || '';
                this.emailInput.value = user.email || '';
                this.teamNameInput.value = user.teamName || '';
                
                // Update display
                this.userDisplayName.textContent = user.name || user.username;
                this.userUsername.textContent = `@${user.username}`;
                
                // Update avatar
                const initials = this.getInitials(user.name || user.username);
                this.avatar.textContent = initials;
                
            } else {
                this.showError('Failed to load profile');
            }
        } catch (error) {
            console.error('Load profile error:', error);
            this.showError('Failed to load profile');
        }
    }

    async handleSave(event) {
        event.preventDefault();
        
        const formData = {
            name: this.nameInput.value.trim(),
            email: this.emailInput.value.trim(),
            teamName: this.teamNameInput.value.trim()
        };

        this.setLoading(true);
        
        try {
            const response = await fetch('/api/auth/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                // Update localStorage user data
                const userData = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = {
                    ...userData,
                    ...data.user
                };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                
                // Update display
                this.userDisplayName.textContent = data.user.name || data.user.username;
                const initials = this.getInitials(data.user.name || data.user.username);
                this.avatar.textContent = initials;
                
                this.showSuccess('Profile updated successfully!');
                
            } else {
                this.showError(data.message || 'Failed to update profile');
            }
            
        } catch (error) {
            console.error('Save profile error:', error);
            this.showError('Failed to update profile');
        } finally {
            this.setLoading(false);
        }
    }

    getInitials(name) {
        if (!name) return 'U';
        
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        } else {
            return name.substring(0, 2).toUpperCase();
        }
    }

    setLoading(loading) {
        if (loading) {
            this.saveButton.disabled = true;
            this.saveButton.textContent = 'Saving...';
        } else {
            this.saveButton.disabled = false;
            this.saveButton.textContent = 'Save Changes';
        }
    }

    showSuccess(message) {
        this.successMessage.textContent = message;
        this.successMessage.style.display = 'block';
        this.errorMessage.style.display = 'none';
        
        // Hide after 3 seconds
        setTimeout(() => {
            this.successMessage.style.display = 'none';
        }, 3000);
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.successMessage.style.display = 'none';
    }

    clearMessages() {
        this.errorMessage.style.display = 'none';
        this.successMessage.style.display = 'none';
    }
}

// Initialize profile manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProfileManager();
});