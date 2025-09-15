class TestRunsManager {
    constructor() {
        this.scripts = [];
        this.suites = [];
        this.selectedScripts = new Set();
        
        this.init();
    }

    init() {
        this.loadTestRuns();
        this.setupEventListeners();
        this.updateUI();
    }

    setupEventListeners() {
        const createSuiteBtn = document.getElementById('create-suite-btn');
        if (createSuiteBtn) {
            createSuiteBtn.addEventListener('click', () => this.openSuiteModal());
        }

        // Close modal when clicking outside
        const modal = document.getElementById('suite-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeSuiteModal();
                }
            });
        }

        // Enter key in suite name input
        const suiteNameInput = document.getElementById('suite-name-input');
        if (suiteNameInput) {
            suiteNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createSuite();
                }
            });
        }
    }

    async loadTestRuns() {
        try {
            const response = await fetch('/api/test-runs/data');
            const result = await response.json();
            
            if (result.success) {
                this.scripts = result.data.scripts || [];
                this.suites = result.data.suites || [];
                this.updateUI();
            }
        } catch (error) {
            console.error('Error loading test runs:', error);
            // Initialize with empty data if API fails
            this.scripts = [];
            this.suites = [];
            this.updateUI();
        }
    }

    updateUI() {
        this.updateScriptsList();
        this.updateSuitesList();
        this.updateCounts();
        this.updateCreateSuiteButtonOnly();  // Use the new function that preserves visibility
    }

    updateScriptsList() {
        const scriptsList = document.getElementById('scripts-list');
        const emptyState = document.getElementById('empty-scripts');
        
        if (!scriptsList || !emptyState) return;

        if (this.scripts.length === 0) {
            scriptsList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            scriptsList.style.display = 'flex';
            emptyState.style.display = 'none';
            
            scriptsList.innerHTML = this.scripts.map(script => `
                <div class="script-item ${this.selectedScripts.has(script.id) ? 'selected' : ''}" data-script-id="${script.id}">
                    <div class="script-info">
                        <input type="checkbox" 
                               class="script-checkbox" 
                               data-script-id="${script.id}"
                               ${this.selectedScripts.has(script.id) ? 'checked' : ''}
                               onchange="testRunsManager.toggleScriptSelection('${script.id}', event)">
                        <span class="script-name">${script.name}</span>
                    </div>
                    <div class="script-actions">
                        <button class="btn-small btn-run" onclick="testRunsManager.runScript('${script.id}')">
                            Run
                        </button>
                        <button class="btn-small" onclick="testRunsManager.removeScript('${script.id}')">
                            Remove
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    updateSuitesList() {
        const suitesList = document.getElementById('suites-list');
        const emptyState = document.getElementById('empty-suites');
        
        if (!suitesList || !emptyState) return;

        if (this.suites.length === 0) {
            suitesList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            suitesList.style.display = 'flex';
            emptyState.style.display = 'none';
            
            suitesList.innerHTML = this.suites.map(suite => `
                <div class="suite-item" data-suite-id="${suite.id}">
                    <div class="suite-header">
                        <span class="suite-name">${suite.name}</span>
                        <div class="script-actions">
                            <button class="btn-small btn-run" onclick="testRunsManager.runSuite('${suite.id}')">
                                Run Suite
                            </button>
                            <button class="btn-small" onclick="testRunsManager.deleteSuite('${suite.id}')">
                                Delete
                            </button>
                        </div>
                    </div>
                    <div class="suite-scripts">
                        ${suite.scripts.map(scriptId => {
                            const script = this.scripts.find(s => s.id === scriptId);
                            return script ? `<div class="suite-script-item">• ${script.name}</div>` : '';
                        }).join('')}
                    </div>
                </div>
            `).join('');
        }
    }

    updateCounts() {
        const scriptCount = document.getElementById('script-count');
        const suiteCount = document.getElementById('suite-count');
        
        if (scriptCount) {
            scriptCount.textContent = `${this.scripts.length} script${this.scripts.length !== 1 ? 's' : ''}`;
        }
        
        if (suiteCount) {
            suiteCount.textContent = `${this.suites.length} suite${this.suites.length !== 1 ? 's' : ''}`;
        }
    }

    // Removed old updateCreateSuiteButton - using updateCreateSuiteButtonOnly instead

    toggleScriptSelection(scriptId, event) {
        console.log(`Toggle selection for script: ${scriptId}`);
        
        // Don't prevent default - let the checkbox work naturally
        
        const scriptItem = document.querySelector(`.script-item[data-script-id="${scriptId}"]`);
        const checkbox = document.querySelector(`.script-checkbox[data-script-id="${scriptId}"]`);
        
        if (this.selectedScripts.has(scriptId)) {
            this.selectedScripts.delete(scriptId);
            if (scriptItem) scriptItem.classList.remove('selected');
        } else {
            this.selectedScripts.add(scriptId);
            if (scriptItem) scriptItem.classList.add('selected');
        }
        
        // Just update the button text
        const createBtn = document.getElementById('create-suite-btn');
        if (createBtn) {
            const selectedCount = this.selectedScripts.size;
            // Never disable
            createBtn.disabled = false;
            
            // Update just the text content
            const buttonText = selectedCount > 0 
                ? `Create Suite from ${selectedCount} Selected`
                : 'Create Suite from Selected';
            
            // Update button text while preserving the SVG
            const textNodes = Array.from(createBtn.childNodes);
            const lastTextNode = textNodes[textNodes.length - 1];
            if (lastTextNode && lastTextNode.nodeType === Node.TEXT_NODE) {
                lastTextNode.textContent = buttonText;
            } else {
                createBtn.innerHTML = `
                    <svg width="16" height="16" fill="currentColor">
                        <path d="M12 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9v2H7v-2H5V9h2V7h2v2h2v2z"/>
                    </svg>
                    ${buttonText}
                `;
            }
        }
    }
    
    updateCreateSuiteButtonOnly() {
        const createBtn = document.getElementById('create-suite-btn');
        
        if (createBtn) {
            const selectedCount = this.selectedScripts.size;
            // Never disable the button
            createBtn.disabled = false;
            
            // Update button text
            const buttonText = selectedCount > 0 
                ? `Create Suite from ${selectedCount} Selected`
                : 'Create Suite from Selected';
            
            createBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor">
                    <path d="M12 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9v2H7v-2H5V9h2V7h2v2h2v2z"/>
                </svg>
                ${buttonText}
            `;
            
            console.log(`Button updated: ${selectedCount} selected`);
        }
    }

    openSuiteModal() {
        if (this.selectedScripts.size === 0) {
            alert('Please select at least one script to create a suite');
            return;
        }
        
        const modal = document.getElementById('suite-modal');
        const selectedCount = document.getElementById('selected-count');
        const suiteNameInput = document.getElementById('suite-name-input');
        
        if (modal) modal.classList.add('active');
        if (selectedCount) selectedCount.textContent = this.selectedScripts.size;
        if (suiteNameInput) {
            suiteNameInput.value = '';
            suiteNameInput.focus();
        }
    }

    closeSuiteModal() {
        const modal = document.getElementById('suite-modal');
        if (modal) modal.classList.remove('active');
    }

    async createSuite() {
        const suiteNameInput = document.getElementById('suite-name-input');
        const suiteName = suiteNameInput ? suiteNameInput.value.trim() : '';
        
        if (!suiteName) {
            alert('Please enter a suite name');
            return;
        }
        
        const selectedScriptIds = Array.from(this.selectedScripts);
        
        try {
            const response = await fetch('/api/test-runs/suites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: `suite-${Date.now()}`,
                    name: suiteName,
                    scripts: selectedScriptIds,
                    createdAt: new Date().toISOString()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Add the new suite to local state
                this.suites.push({
                    id: result.suiteId || `suite-${Date.now()}`,
                    name: suiteName,
                    scripts: selectedScriptIds
                });
                
                // Clear selections
                this.selectedScripts.clear();
                
                // Update UI
                this.updateUI();
                this.closeSuiteModal();
                
                console.log('Suite created successfully');
            } else {
                alert('Failed to create suite: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error creating suite:', error);
            alert('Failed to create suite');
        }
    }

    async runScript(scriptId) {
        const script = this.scripts.find(s => s.id === scriptId);
        if (!script) return;
        
        console.log(`Running script: ${script.name}`);
        
        try {
            const response = await fetch(`/api/test-runs/scripts/${scriptId}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scriptName: script.templateName || script.name
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Script "${script.name}" is now running`);
            } else {
                alert('Failed to run script: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error running script:', error);
            alert('Failed to run script');
        }
    }

    async runSuite(suiteId) {
        const suite = this.suites.find(s => s.id === suiteId);
        if (!suite) return;
        
        console.log(`Running suite: ${suite.name}`);
        
        try {
            const response = await fetch(`/api/test-runs/suites/${suiteId}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    suiteId: suiteId,
                    suiteName: suite.name,
                    scripts: suite.scripts
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Suite "${suite.name}" is now running (${suite.scripts.length} scripts)`);
            } else {
                alert('Failed to run suite: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error running suite:', error);
            alert('Failed to run suite');
        }
    }

    async removeScript(scriptId) {
        if (!confirm('Are you sure you want to remove this script from test runs?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/test-runs/scripts/${scriptId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Remove from local state
                this.scripts = this.scripts.filter(s => s.id !== scriptId);
                this.selectedScripts.delete(scriptId);
                
                // Update UI
                this.updateUI();
                
                console.log('Script removed successfully');
            } else {
                alert('Failed to remove script: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error removing script:', error);
            alert('Failed to remove script');
        }
    }

    async deleteSuite(suiteId) {
        if (!confirm('Are you sure you want to delete this suite?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/test-runs/suites/${suiteId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Remove from local state
                this.suites = this.suites.filter(s => s.id !== suiteId);
                
                // Update UI
                this.updateUI();
                
                console.log('Suite deleted successfully');
            } else {
                alert('Failed to delete suite: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting suite:', error);
            alert('Failed to delete suite');
        }
    }

    // Method to add a script (called from templates page)
    async addScript(templateName, templateDisplayName) {
        const scriptId = `script-${Date.now()}`;
        const script = {
            id: scriptId,
            name: templateDisplayName || templateName,
            templateName: templateName,
            addedAt: new Date().toISOString()
        };
        
        try {
            const response = await fetch('/api/test-runs/scripts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(script)
            });
            
            const result = await response.json();
            
            if (result.success) {
                return true;
            } else {
                console.error('Failed to add script:', result.error);
                return false;
            }
        } catch (error) {
            console.error('Error adding script:', error);
            return false;
        }
    }
}

// Initialize the manager
const testRunsManager = new TestRunsManager();

// Global functions for onclick handlers
function closeSuiteModal() {
    testRunsManager.closeSuiteModal();
}

function createSuite() {
    testRunsManager.createSuite();
}