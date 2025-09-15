class TemplatesManager {
    constructor() {
        this.templates = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadTemplates();
    }

    setupEventListeners() {
        const refreshBtn = document.getElementById('refresh-templates');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadTemplates();
            });
        }
    }

    async loadTemplates() {
        try {
            const grid = document.getElementById('templates-grid');
            grid.innerHTML = `
                <div class="empty-templates">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 16px;">Loading templates...</p>
                </div>
            `;

            const response = await fetch('/api/templates');
            const result = await response.json();
            
            if (result.success) {
                this.templates = result.templates;
                this.displayTemplates();
            } else {
                console.error('Failed to load templates:', result.error);
                this.showError('Failed to load templates: ' + result.error);
            }
        } catch (error) {
            console.error('Error loading templates:', error);
            this.showError('Error loading templates: ' + error.message);
        }
    }

    displayTemplates() {
        const grid = document.getElementById('templates-grid');
        
        if (this.templates.length === 0) {
            grid.innerHTML = `
                <div class="empty-templates">
                    <div class="empty-templates-icon">📝</div>
                    <h3>No Templates Found</h3>
                    <p>Record some tests in the Visual Editor to create templates</p>
                    <button class="btn-primary" onclick="window.location.href='index.html'" style="margin-top: 20px;">
                        Go to Visual Editor
                    </button>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.templates.map(template => {
            // Use displayName if available, otherwise clean up the filename
            let displayName = template.displayName || template.name;
            // If it's still the filename format, clean it up
            if (displayName.includes('test_') && displayName.endsWith('.js')) {
                displayName = displayName.replace('test_', '').replace('.js', '').replace(/_/g, ' ');
                // Capitalize first letter of each word
                displayName = displayName.split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ');
            }
            // Handle 'undefined' case
            if (displayName === 'undefined' || displayName === 'Undefined') {
                displayName = 'Untitled Test';
            }
            
            return `
            <div class="template-card" data-template="${template.name}">
                <div class="template-card-header">
                    <div style="width: 100%;">
                        <h3 class="template-card-title" data-template="${template.name}" contenteditable="false">${displayName}</h3>
                        <p class="template-card-url">${template.url || 'No URL'}</p>
                    </div>
                </div>
                <div class="template-card-meta">
                    <span>📅 ${new Date(template.created).toLocaleDateString()}</span>
                    <span>⚡ ${template.steps} steps</span>
                    <span>📊 ${template.size}</span>
                </div>
                <div class="template-card-actions">
                    <button class="btn-template run" data-template="${template.name}" data-action="execute">
                        <svg width="14" height="14" fill="currentColor">
                            <path d="M5 3l8 5-8 5V3z"/>
                        </svg>
                        Run
                    </button>
                    <button class="btn-template add-to-test" data-template="${template.name}" data-display-name="${displayName}" data-action="addToTestRuns" style="background: #3B82F6; color: white; border: 1px solid #3B82F6;">
                        <svg width="14" height="14" fill="currentColor">
                            <path d="M12 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9v2H7v-2H5V9h2V7h2v2h2v2z"/>
                        </svg>
                        Add to Test Run
                    </button>
                    <button class="btn-template rename" data-template="${template.name}" data-action="rename" style="background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Rename
                    </button>
                    <button class="btn-template delete" data-template="${template.name}" data-action="delete">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        `}).join('');

        // Add event listeners for template actions
        const actionButtons = grid.querySelectorAll('.btn-template');
        actionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const templateName = e.currentTarget.dataset.template;
                const action = e.currentTarget.dataset.action;
                
                if (action === 'execute') {
                    this.executeTemplate(templateName);
                } else if (action === 'delete') {
                    this.deleteTemplate(templateName);
                } else if (action === 'rename') {
                    this.enableRename(templateName);
                } else if (action === 'addToTestRuns') {
                    const displayName = e.currentTarget.dataset.displayName;
                    this.addToTestRuns(templateName, displayName);
                }
            });
        });

        // Add click-to-edit functionality for titles
        const titles = grid.querySelectorAll('.template-card-title');
        titles.forEach(title => {
            title.addEventListener('dblclick', () => {
                const templateName = title.dataset.template;
                this.enableRename(templateName);
            });
        });
    }

    async executeTemplate(templateName) {
        try {
            const button = document.querySelector(`[data-template="${templateName}"][data-action="execute"]`);
            const originalContent = button.innerHTML;
            
            button.disabled = true;
            button.innerHTML = '<div class="loading-spinner"></div> Running...';

            const response = await fetch('/api/templates/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    templateName: templateName
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Template executed successfully!', 'success');
                console.log('Template executed:', templateName);
            } else {
                throw new Error(result.error || 'Failed to execute template');
            }
        } catch (error) {
            console.error('Error executing template:', error);
            this.showNotification('Error executing template: ' + error.message, 'error');
        } finally {
            // Reset button
            const button = document.querySelector(`[data-template="${templateName}"][data-action="execute"]`);
            if (button) {
                button.disabled = false;
                button.innerHTML = `
                    <svg width="16" height="16" fill="currentColor">
                        <path d="M5 3l8 5-8 5V3z"/>
                    </svg>
                    Run Template
                `;
            }
        }
    }

    enableRename(templateName) {
        const titleElement = document.querySelector(`.template-card-title[data-template="${templateName}"]`);
        if (!titleElement) return;

        const currentText = titleElement.textContent;
        titleElement.contentEditable = true;
        titleElement.classList.add('editing');
        titleElement.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(titleElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // Handle save on Enter or blur
        const saveRename = async () => {
            const newName = titleElement.textContent.trim();
            titleElement.contentEditable = false;
            titleElement.classList.remove('editing');
            
            if (newName && newName !== currentText) {
                await this.renameTemplate(templateName, newName);
            } else {
                titleElement.textContent = currentText;
            }
        };

        // Event handlers
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveRename();
            } else if (e.key === 'Escape') {
                titleElement.textContent = currentText;
                titleElement.contentEditable = false;
                titleElement.classList.remove('editing');
            }
        };

        titleElement.addEventListener('keydown', handleKeydown);
        titleElement.addEventListener('blur', saveRename, { once: true });
    }

    async renameTemplate(oldName, newDisplayName) {
        try {
            const response = await fetch('/api/templates/rename', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    templateName: oldName,
                    newDisplayName: newDisplayName
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Template renamed successfully', 'success');
                // Update the template in our local array
                const template = this.templates.find(t => t.name === oldName);
                if (template) {
                    template.displayName = newDisplayName;
                }
            } else {
                throw new Error(result.error || 'Failed to rename template');
            }
        } catch (error) {
            console.error('Error renaming template:', error);
            this.showNotification('Error renaming template: ' + error.message, 'error');
            this.loadTemplates(); // Reload to restore original state
        }
    }

    async deleteTemplate(templateName) {
        if (!confirm(`Are you sure you want to delete the template "${templateName}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/templates/${encodeURIComponent(templateName)}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Template deleted successfully', 'success');
                this.loadTemplates(); // Reload the templates list
                console.log('Template deleted:', templateName);
            } else {
                throw new Error(result.error || 'Failed to delete template');
            }
        } catch (error) {
            console.error('Error deleting template:', error);
            this.showNotification('Error deleting template: ' + error.message, 'error');
        }
    }

    showError(message) {
        const grid = document.getElementById('templates-grid');
        grid.innerHTML = `
            <div class="empty-templates">
                <div class="empty-templates-icon">⚠️</div>
                <h3>Error Loading Templates</h3>
                <p>${message}</p>
                <button class="btn-primary" onclick="location.reload()" style="margin-top: 20px;">
                    Retry
                </button>
            </div>
        `;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
            color: white;
            border-radius: 8px;
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    async addToTestRuns(templateName, displayName) {
        try {
            const button = document.querySelector(`[data-template="${templateName}"][data-action="addToTestRuns"]`);
            const originalContent = button.innerHTML;
            
            button.disabled = true;
            button.innerHTML = 'Adding...';
            
            const scriptId = `script-${Date.now()}`;
            const script = {
                id: scriptId,
                name: displayName || templateName,
                templateName: templateName,
                addedAt: new Date().toISOString()
            };
            
            const response = await fetch('/api/test-runs/scripts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(script)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification(`✅ "${displayName}" added to Test Runs`);
                
                // Change button to show success
                button.innerHTML = `
                    <svg width="16" height="16" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    Added
                `;
                button.style.background = '#10B981';
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    button.innerHTML = originalContent;
                    button.style.background = '#3B82F6';
                    button.disabled = false;
                }, 2000);
            } else {
                throw new Error(result.error || 'Failed to add to test runs');
            }
        } catch (error) {
            console.error('Error adding to test runs:', error);
            this.showNotification(`❌ Failed to add to Test Runs: ${error.message}`);
            
            // Re-enable button
            const button = document.querySelector(`[data-template="${templateName}"][data-action="addToTestRuns"]`);
            if (button) {
                button.disabled = false;
                button.innerHTML = button.innerHTML.replace('Adding...', 'Add to Test Run');
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TemplatesManager();
});