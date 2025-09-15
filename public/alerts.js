class AlertManager {
    constructor() {
        this.settings = {
            enabled: true,
            email: {
                enabled: true,
                smtp: {
                    server: 'smtp.zoho.com',
                    port: 587,
                    secure: false
                },
                sender: '',
                password: '',
                recipients: []
            },
            preferences: {
                alertOnTestFailures: true,
                alertOnSuiteFailures: true,
                includeErrorDetails: true,
                includeSuggestions: true,
                batchAlerts: false,
                dailySummary: false
            },
            channels: {
                email: true,
                slack: false,
                teams: false,
                webhook: false
            }
        };

        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateUI();
        await this.loadAlertHistory();
    }

    setupEventListeners() {
        // Main toggle
        document.getElementById('email-toggle').addEventListener('click', (e) => {
            this.toggleSwitch(e.currentTarget);
            this.settings.email.enabled = e.currentTarget.classList.contains('active');
            this.updateAlertStatus();
        });

        // Preference toggles
        const preferenceToggles = {
            'alert-test-failures': 'alertOnTestFailures',
            'alert-suite-failures': 'alertOnSuiteFailures',
            'include-error-details': 'includeErrorDetails',
            'include-suggestions': 'includeSuggestions',
            'batch-alerts': 'batchAlerts',
            'daily-summary': 'dailySummary'
        };

        Object.entries(preferenceToggles).forEach(([id, setting]) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', (e) => {
                    this.toggleSwitch(e.currentTarget);
                    this.settings.preferences[setting] = e.currentTarget.classList.contains('active');
                });
            }
        });

        // Channel cards
        document.querySelectorAll('.channel-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const channel = e.currentTarget.dataset.channel;
                if (channel === 'email') {
                    e.currentTarget.classList.toggle('active');
                    this.settings.channels[channel] = e.currentTarget.classList.contains('active');
                } else {
                    this.showToast('This channel is coming soon!', 'error');
                }
            });
        });

        // Input fields
        document.getElementById('smtp-server').addEventListener('change', (e) => {
            this.settings.email.smtp.server = e.target.value;
        });

        document.getElementById('smtp-port').addEventListener('change', (e) => {
            this.settings.email.smtp.port = parseInt(e.target.value);
        });

        document.getElementById('sender-email').addEventListener('change', (e) => {
            this.settings.email.sender = e.target.value;
        });

        document.getElementById('app-password').addEventListener('change', (e) => {
            this.settings.email.password = e.target.value;
        });

        // Enter key in recipient input
        document.getElementById('new-recipient-email').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addRecipient();
            }
        });
    }

    toggleSwitch(element) {
        element.classList.toggle('active');
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/alerts/settings');
            const result = await response.json();
            
            if (result.success && result.settings) {
                // Deep merge settings to preserve nested structures
                this.settings = this.deepMerge(this.settings, result.settings);
            }
        } catch (error) {
            console.log('No saved settings found, using defaults');
        }
    }
    
    deepMerge(target, source) {
        const output = { ...target };
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
        
        function isObject(item) {
            return item && typeof item === 'object' && !Array.isArray(item);
        }
    }

    updateUI() {
        // Update main status
        this.updateAlertStatus();

        // Update email config
        document.getElementById('smtp-server').value = this.settings.email.smtp.server;
        document.getElementById('smtp-port').value = this.settings.email.smtp.port;
        document.getElementById('sender-email').value = this.settings.email.sender || '';
        
        // Set password value (it will show as dots due to input type="password")
        if (this.settings.email.password) {
            document.getElementById('app-password').value = this.settings.email.password;
        }

        // Update toggles
        this.updateToggle('email-toggle', this.settings.email.enabled);
        this.updateToggle('alert-test-failures', this.settings.preferences.alertOnTestFailures);
        this.updateToggle('alert-suite-failures', this.settings.preferences.alertOnSuiteFailures);
        this.updateToggle('include-error-details', this.settings.preferences.includeErrorDetails);
        this.updateToggle('include-suggestions', this.settings.preferences.includeSuggestions);
        this.updateToggle('batch-alerts', this.settings.preferences.batchAlerts);
        this.updateToggle('daily-summary', this.settings.preferences.dailySummary);

        // Update channels
        Object.entries(this.settings.channels).forEach(([channel, enabled]) => {
            const card = document.querySelector(`[data-channel="${channel}"]`);
            if (card) {
                if (enabled) {
                    card.classList.add('active');
                } else {
                    card.classList.remove('active');
                }
            }
        });

        // Update recipients
        this.updateRecipientsList();
    }

    updateToggle(id, isActive) {
        const toggle = document.getElementById(id);
        if (toggle) {
            if (isActive) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        }
    }

    updateAlertStatus() {
        const statusElement = document.getElementById('alert-status');
        const isEnabled = this.settings.enabled && this.settings.email.enabled;
        
        if (isEnabled) {
            statusElement.className = 'alert-status enabled';
            statusElement.innerHTML = `
                <div class="alert-status-dot"></div>
                <span>Alerts Enabled</span>
            `;
        } else {
            statusElement.className = 'alert-status disabled';
            statusElement.innerHTML = `
                <div class="alert-status-dot"></div>
                <span>Alerts Disabled</span>
            `;
        }
    }

    updateRecipientsList() {
        const list = document.getElementById('recipients-list');
        const count = document.getElementById('recipient-count');
        
        if (this.settings.email.recipients.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #6B7280;">
                    <p style="font-size: 14px;">No recipients added yet</p>
                    <p style="font-size: 12px; margin-top: 4px;">Add email addresses to receive alerts</p>
                </div>
            `;
        } else {
            list.innerHTML = this.settings.email.recipients.map((recipient, index) => {
                const initials = recipient.email.substring(0, 2).toUpperCase();
                const role = recipient.role || 'Team Member';
                
                return `
                    <div class="recipient-item">
                        <div class="recipient-info">
                            <div class="recipient-avatar">${initials}</div>
                            <div class="recipient-details">
                                <span class="recipient-name">${recipient.name || recipient.email}</span>
                                <span class="recipient-email">${recipient.email}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="recipient-role">${role}</span>
                            <button class="btn-remove" onclick="alertManager.removeRecipient(${index})">Remove</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        count.textContent = `${this.settings.email.recipients.length} recipient${this.settings.email.recipients.length !== 1 ? 's' : ''}`;
    }

    addRecipient() {
        const input = document.getElementById('new-recipient-email');
        const email = input.value.trim();
        
        if (!email) {
            this.showToast('Please enter an email address', 'error');
            return;
        }
        
        if (!this.validateEmail(email)) {
            this.showToast('Please enter a valid email address', 'error');
            return;
        }
        
        if (this.settings.email.recipients.some(r => r.email === email)) {
            this.showToast('This email is already in the list', 'error');
            return;
        }
        
        // Determine role based on email domain or pattern
        let role = 'Team Member';
        if (email.includes('qa') || email.includes('test')) {
            role = 'QA Engineer';
        } else if (email.includes('dev')) {
            role = 'Developer';
        } else if (email.includes('manager') || email.includes('lead')) {
            role = 'Manager';
        }
        
        this.settings.email.recipients.push({
            email: email,
            name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            role: role,
            addedAt: new Date().toISOString()
        });
        
        input.value = '';
        this.updateRecipientsList();
        this.showToast('Recipient added successfully', 'success');
    }

    removeRecipient(index) {
        const recipient = this.settings.email.recipients[index];
        if (confirm(`Remove ${recipient.email} from recipients?`)) {
            this.settings.email.recipients.splice(index, 1);
            this.updateRecipientsList();
            this.showToast('Recipient removed', 'success');
        }
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    async testConnection() {
        const statusDiv = document.getElementById('connection-status');
        const testBtn = document.querySelector('.btn-test');
        
        // Get current form values
        const sender = document.getElementById('sender-email').value;
        const password = document.getElementById('app-password').value;
        const server = document.getElementById('smtp-server').value;
        const port = parseInt(document.getElementById('smtp-port').value);
        
        // Validate inputs
        if (!sender) {
            this.showToast('Please enter sender email', 'error');
            return;
        }
        
        if (!password) {
            this.showToast('Please enter app password', 'error');
            return;
        }
        
        // Show testing status
        statusDiv.innerHTML = '<span style="color: #3B82F6;">🔄 Testing connection...</span>';
        testBtn.disabled = true;
        
        try {
            const response = await fetch('/api/alerts/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    smtp: {
                        server: server,
                        port: port,
                        secure: port === 465
                    },
                    sender: sender,
                    password: password
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                statusDiv.innerHTML = '<span style="color: #10B981;">✅ Connection successful!</span>';
                this.showToast('Email connection test successful!', 'success');
                
                // Optionally send test email
                if (this.settings.email.recipients.length > 0) {
                    const sendTest = confirm('Connection successful! Would you like to send a test email to all recipients?');
                    if (sendTest) {
                        await this.sendTestEmail();
                    }
                }
            } else {
                statusDiv.innerHTML = `<span style="color: #EF4444;">❌ Connection failed: ${result.error}</span>`;
                this.showToast('Connection test failed', 'error');
            }
        } catch (error) {
            statusDiv.innerHTML = '<span style="color: #EF4444;">❌ Connection test failed</span>';
            this.showToast('Failed to test connection', 'error');
        } finally {
            testBtn.disabled = false;
        }
    }

    async sendTestEmail() {
        try {
            const response = await fetch('/api/alerts/test-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.settings)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast(`Test email sent to ${this.settings.email.recipients.length} recipient(s)`, 'success');
            } else {
                this.showToast('Failed to send test email', 'error');
            }
        } catch (error) {
            this.showToast('Failed to send test email', 'error');
        }
    }

    async saveSettings() {
        // Gather current form values before saving
        this.settings.email.smtp.server = document.getElementById('smtp-server').value;
        this.settings.email.smtp.port = parseInt(document.getElementById('smtp-port').value);
        this.settings.email.smtp.secure = this.settings.email.smtp.port === 465;
        this.settings.email.sender = document.getElementById('sender-email').value;
        this.settings.email.password = document.getElementById('app-password').value;
        
        // Update toggle states
        this.settings.email.enabled = document.getElementById('email-toggle').classList.contains('active');
        this.settings.preferences.alertOnTestFailures = document.getElementById('alert-test-failures').classList.contains('active');
        this.settings.preferences.alertOnSuiteFailures = document.getElementById('alert-suite-failures').classList.contains('active');
        this.settings.preferences.includeErrorDetails = document.getElementById('include-error-details').classList.contains('active');
        this.settings.preferences.includeSuggestions = document.getElementById('include-suggestions').classList.contains('active');
        this.settings.preferences.batchAlerts = document.getElementById('batch-alerts').classList.contains('active');
        this.settings.preferences.dailySummary = document.getElementById('daily-summary').classList.contains('active');
        
        // Validate before saving
        if (this.settings.email.enabled) {
            if (!this.settings.email.sender) {
                this.showToast('Please configure sender email', 'error');
                return;
            }
            
            if (!this.settings.email.password) {
                this.showToast('Please configure app password', 'error');
                return;
            }
            
            if (this.settings.email.recipients.length === 0) {
                const proceed = confirm('No recipients added. Alerts will not be sent. Continue anyway?');
                if (!proceed) return;
            }
        }
        
        try {
            const response = await fetch('/api/alerts/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.settings)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast('Alert settings saved successfully!', 'success');
                
                // Update status
                this.updateAlertStatus();
                
                // Reload history in case settings changed
                await this.loadAlertHistory();
            } else {
                this.showToast('Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('Failed to save settings', 'error');
        }
    }

    toggleAdvanced() {
        const advancedConfig = document.getElementById('advanced-config');
        const arrow = document.getElementById('advanced-arrow');
        
        if (advancedConfig.style.display === 'none') {
            advancedConfig.style.display = 'block';
            arrow.style.transform = 'rotate(180deg)';
        } else {
            advancedConfig.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Method to be called from other pages when tests fail
    async sendAlert(testData) {
        if (!this.settings.enabled || !this.settings.email.enabled) {
            console.log('Alerts are disabled');
            return;
        }
        
        try {
            const response = await fetch('/api/alerts/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    settings: this.settings,
                    testData: testData
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('Alert sent successfully');
                // Add to history
                this.addToHistory(testData, 'success');
            } else {
                console.error('Failed to send alert:', result.error);
                this.addToHistory(testData, 'failed');
            }
        } catch (error) {
            console.error('Error sending alert:', error);
        }
    }

    addToHistory(testData, status) {
        // This would be saved to backend in production
        const history = JSON.parse(localStorage.getItem('alertHistory') || '[]');
        history.unshift({
            timestamp: new Date().toISOString(),
            status: status,
            testName: testData.name,
            recipients: this.settings.email.recipients.length
        });
        
        // Keep only last 50 items
        if (history.length > 50) {
            history.length = 50;
        }
        
        localStorage.setItem('alertHistory', JSON.stringify(history));
    }

    async loadAlertHistory() {
        try {
            const response = await fetch('/api/alerts/history');
            const result = await response.json();
            
            if (result.success && result.history) {
                this.displayAlertHistory(result.history);
            }
        } catch (error) {
            console.error('Error loading alert history:', error);
        }
    }

    displayAlertHistory(history) {
        const historyList = document.getElementById('alert-history-list');
        
        if (!history || history.length === 0) {
            historyList.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #6B7280;">
                    <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px; opacity: 0.3;">
                        <path d="M9 12h6m-6 4h6m2-8l3 3m0 0l3-3m-3 3v10m5-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <p style="font-size: 14px; font-weight: 500;">No alerts sent yet</p>
                    <p style="font-size: 12px; margin-top: 4px;">Alerts will appear here when tests fail</p>
                </div>
            `;
            return;
        }

        // Display history items
        historyList.innerHTML = history.map(item => {
            const date = new Date(item.timestamp);
            const timeAgo = this.getTimeAgo(date);
            const statusIcon = item.emailSent ? '✅' : '❌';
            const statusColor = item.emailSent ? '#10B981' : '#EF4444';
            
            return `
                <div style="padding: 12px; border-bottom: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: ${statusColor}; font-size: 16px;">${statusIcon}</span>
                            <span style="font-weight: 500; font-size: 14px;">${item.testName}</span>
                            <span style="background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-size: 11px; text-transform: uppercase;">
                                ${item.testType}
                            </span>
                        </div>
                        <div style="margin-top: 4px; font-size: 12px; color: #6B7280;">
                            <span>${timeAgo}</span>
                            ${item.recipients ? `• ${item.recipients} recipient${item.recipients !== 1 ? 's' : ''}` : ''}
                            ${item.error ? `• <span style="color: #EF4444;">Error: ${item.error}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) > 1 ? 's' : ''} ago`;
        return `${Math.floor(seconds / 86400)} day${Math.floor(seconds / 86400) > 1 ? 's' : ''} ago`;
    }
}

// Initialize the alert manager
const alertManager = new AlertManager();