class HistoryManager {
    constructor() {
        this.history = [];
        this.filteredHistory = [];
        this.currentFilter = 'all';
        this.offset = 0;
        this.limit = 20;
        this.hasMore = false;
        
        this.init();
    }

    init() {
        this.loadHistory();
        // Auto-refresh every 10 seconds
        setInterval(() => this.loadHistory(true), 10000);
    }

    async loadHistory(silent = false) {
        try {
            const response = await fetch(`/api/test-runs/history?limit=${this.limit}&offset=0`);
            const result = await response.json();
            
            if (result.success) {
                this.history = result.data.history;
                this.hasMore = result.data.hasMore;
                this.offset = this.limit;
                
                // Update total count
                const totalElement = document.getElementById('total-executions');
                if (totalElement) {
                    totalElement.textContent = `${result.data.total} execution${result.data.total !== 1 ? 's' : ''}`;
                }
                
                this.applyFilter();
                
                if (!silent) {
                    console.log('✅ History loaded successfully');
                }
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async loadMore() {
        try {
            const response = await fetch(`/api/test-runs/history?limit=${this.limit}&offset=${this.offset}`);
            const result = await response.json();
            
            if (result.success) {
                this.history = [...this.history, ...result.data.history];
                this.hasMore = result.data.hasMore;
                this.offset += this.limit;
                
                this.applyFilter();
            }
        } catch (error) {
            console.error('Error loading more history:', error);
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update filter button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        this.applyFilter();
    }

    applyFilter() {
        this.filteredHistory = this.history.filter(item => {
            switch (this.currentFilter) {
                case 'success':
                    return item.status === 'success';
                case 'failed':
                    return item.status === 'failed' || item.status === 'error';
                case 'script':
                    return item.type === 'script';
                case 'suite':
                    return item.type === 'suite';
                default:
                    return true;
            }
        });
        
        this.renderHistory();
    }

    renderHistory() {
        const historyList = document.getElementById('history-list');
        const emptyState = document.getElementById('empty-history');
        const loadMoreBtn = document.getElementById('load-more');
        
        if (!historyList || !emptyState) return;
        
        if (this.filteredHistory.length === 0) {
            historyList.style.display = 'none';
            emptyState.style.display = 'flex';
            loadMoreBtn.style.display = 'none';
        } else {
            historyList.style.display = 'flex';
            emptyState.style.display = 'none';
            loadMoreBtn.style.display = this.hasMore ? 'block' : 'none';
            
            historyList.innerHTML = this.filteredHistory.map(item => this.renderHistoryItem(item)).join('');
        }
    }

    renderHistoryItem(item) {
        const statusClass = this.getStatusClass(item.status);
        const typeClass = item.type === 'suite' ? 'type-suite' : 'type-script';
        const timeAgo = this.getTimeAgo(item.startTime);
        
        // Build failure details for suites
        let failureInfo = '';
        if (item.type === 'suite' && item.status === 'failed' && item.failedAt) {
            const plainError = item.failureDetails && item.failureDetails.error ? 
                this.translateError(item.failureDetails.error) : 'Test failed to complete';
            failureInfo = `
                <div style="margin-top: 8px; padding: 8px; background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 4px; font-size: 12px; color: #9A3412;">
                    <strong>⚠️ What happened:</strong> ${plainError.substring(0, 150)}${plainError.length > 150 ? '...' : ''}
                    <div style="margin-top: 4px; font-size: 11px; color: #7C2D12;">
                        <strong>Location:</strong> ${item.failedAt}
                    </div>
                </div>
            `;
        }
        
        // Build script progress for suites
        let scriptProgress = '';
        if (item.type === 'suite' && item.scripts && item.scripts.length > 0) {
            scriptProgress = `
                <div style="margin-top: 8px; font-size: 11px; color: #6B7280;">
                    ${item.scripts.map(script => `
                        <div style="margin: 2px 0;">
                            ${script.status === 'success' ? '✅' : 
                              script.status === 'failed' ? '❌' : '⏸️'} 
                            ${script.name}: ${script.completedSteps || 0}/${script.totalSteps || 0} steps
                            ${script.failedAt ? `<span style="color: #EF4444;"> - ${script.failedAt}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        return `
            <div class="history-item" onclick="historyManager.toggleDetails('${item.id}')" style="cursor: pointer;">
                <div class="history-info">
                    <span class="history-type ${typeClass}">${item.type}</span>
                    <div style="flex: 1;">
                        <div class="history-name">${item.name}</div>
                        <div class="history-time">${timeAgo}</div>
                        ${failureInfo}
                        ${scriptProgress}
                    </div>
                </div>
                <div class="history-metrics">
                    ${item.durationFormatted ? `
                        <span class="history-duration">⏱️ ${item.durationFormatted}</span>
                    ` : ''}
                    <span class="history-status ${statusClass}">${item.status}</span>
                </div>
            </div>
        `;
    }
    
    translateError(technicalError) {
        // Common error patterns and their plain language translations
        const errorTranslations = [
            {
                pattern: /Timeout.*exceeded.*waiting for.*getByTestId\(['"]([^'"]+)['"]\)/i,
                message: (match) => `The test couldn't find the "${match[1].replace(/_/g, ' ')}" button or element on the page. The page may have changed or the element is hidden.`
            },
            {
                pattern: /Timeout.*exceeded.*waiting for locator\(['"]([^'"]+)['"]\)/i,
                message: (match) => `The test couldn't find "${match[1]}" on the page within the time limit. The page structure may have changed.`
            },
            {
                pattern: /Target page.*has been closed/i,
                message: () => 'The browser window closed unexpectedly. This might happen if the previous test didn\'t complete properly.'
            },
            {
                pattern: /Failed to connect to the bus/i,
                message: () => 'The browser couldn\'t start properly. This is a system configuration issue.'
            },
            {
                pattern: /Missing X server or \$DISPLAY/i,
                message: () => 'The browser needs a display to run. Make sure the virtual display is configured.'
            },
            {
                pattern: /locator\.click.*Timeout/i,
                message: () => 'The test tried to click something but couldn\'t find it. The page may still be loading or the element is blocked by something else.'
            },
            {
                pattern: /page\.goto.*Timeout/i,
                message: () => 'The website took too long to load. Check if the site is accessible and your internet connection is stable.'
            },
            {
                pattern: /Failed at Step (\d+) in ([^:]+)/i,
                message: (match) => `Test stopped at step ${match[1]} while running "${match[2]}". The action at this step couldn\'t be completed.`
            },
            {
                pattern: /PIN.*screen/i,
                message: () => 'A PIN entry screen is blocking the test from continuing. The app may require authentication that wasn\'t provided.'
            },
            {
                pattern: /promotion.*blocked/i,
                message: () => 'A promotion or popup is blocking access to the page. The test needs to handle these interruptions.'
            },
            {
                pattern: /element.*not.*interactable/i,
                message: () => 'The button or field exists but can\'t be clicked or typed into. It might be disabled or covered by another element.'
            },
            {
                pattern: /navigation.*timeout/i,
                message: () => 'The page is taking too long to navigate. There might be network issues or the site is responding slowly.'
            },
            {
                pattern: /authentication.*required/i,
                message: () => 'Login is required to access this page. Make sure the test includes proper login steps.'
            },
            {
                pattern: /network.*error/i,
                message: () => 'Cannot connect to the website. Check your internet connection and if the website is online.'
            }
        ];
        
        // Try to match error with translations
        for (const translation of errorTranslations) {
            const match = technicalError.match(translation.pattern);
            if (match) {
                return translation.message(match);
            }
        }
        
        // Generic fallback for unrecognized errors
        if (technicalError.includes('Timeout')) {
            return 'The test took too long to complete an action. The page might be loading slowly or an element is missing.';
        }
        
        if (technicalError.includes('Error')) {
            return 'An unexpected problem occurred during the test. The page may have changed or there\'s a technical issue.';
        }
        
        // Return simplified version of original error
        return technicalError.split('\n')[0].substring(0, 200);
    }
    
    toggleDetails(itemId) {
        const item = this.history.find(h => h.id === itemId);
        if (!item) return;
        
        this.showDetailModal(item);
    }
    
    showDetailModal(item) {
        // Remove existing modal if any
        const existingModal = document.getElementById('detail-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal HTML
        const modalHtml = `
            <div id="detail-modal" class="modal-overlay" onclick="if(event.target === this) this.remove()">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${item.name}</h2>
                        <button class="modal-close" onclick="document.getElementById('detail-modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.renderDetailContent(item)}
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    renderDetailContent(item) {
        let content = `
            <div class="detail-section">
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">${item.type}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value ${this.getStatusClass(item.status)}">${item.status}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Started:</span>
                    <span class="detail-value">${new Date(item.startTime).toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Duration:</span>
                    <span class="detail-value">${item.durationFormatted || 'N/A'}</span>
                </div>
            </div>
        `;
        
        // Add failure details if failed
        if (item.status === 'failed' || item.status === 'error') {
            content += `
                <div class="detail-section error-section">
                    <h3>Failure Details</h3>
                    ${item.failedAt ? `
                        <div class="detail-row">
                            <span class="detail-label">Failed At:</span>
                            <span class="detail-value error-text">${item.failedAt}</span>
                        </div>
                    ` : ''}
                    ${item.failureDetails && item.failureDetails.step ? `
                        <div class="detail-row">
                            <span class="detail-label">Failed Step:</span>
                            <span class="detail-value">Step ${item.failureDetails.step}</span>
                        </div>
                    ` : ''}
                    ${item.failureDetails && item.failureDetails.attemptedAction ? `
                        <div class="detail-row">
                            <span class="detail-label">What was attempted:</span>
                            <div class="error-message" style="background: #FFF7ED; border-color: #FED7AA; color: #9A3412; padding: 12px; border-radius: 6px; border: 1px solid;">
                                <strong>${item.failureDetails.attemptedAction}</strong>
                            </div>
                        </div>
                    ` : ''}
                    ${item.failureDetails && item.failureDetails.suggestion ? `
                        <div class="detail-row">
                            <span class="detail-label">Suggestion to fix:</span>
                            <div class="error-message" style="background: #DBEAFE; border-color: #93C5FD; color: #1E40AF; padding: 12px; border-radius: 6px; border: 1px solid;">
                                <strong>💡 ${item.failureDetails.suggestion}</strong>
                            </div>
                        </div>
                    ` : ''}
                    ${item.failureDetails && item.failureDetails.errorMessage ? `
                        <details style="margin-top: 12px;">
                            <summary style="cursor: pointer; color: #6B7280; font-size: 12px;">Show technical error details</summary>
                            <div class="error-message" style="margin-top: 8px; font-size: 11px; background: #F3F4F6; padding: 8px; border-radius: 4px;">
                                <code>${item.failureDetails.errorMessage}</code>
                            </div>
                        </details>
                    ` : ''}
                    ${item.failureDetails && item.failureDetails.error ? `
                        <div class="detail-row">
                            <span class="detail-label">Legacy Error:</span>
                            <div class="error-message" style="margin-top: 8px; font-size: 11px;">${item.failureDetails.error}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Add script details for suites
        if (item.type === 'suite' && item.scripts && item.scripts.length > 0) {
            content += `
                <div class="detail-section">
                    <h3>Script Execution Details</h3>
                    <div class="script-list">
                        ${item.scripts.map((script, index) => `
                            <div class="script-item ${script.status}">
                                <div class="script-header">
                                    <span class="script-number">${index + 1}.</span>
                                    <span class="script-name">${script.name}</span>
                                    <span class="script-status ${this.getStatusClass(script.status)}">${script.status}</span>
                                </div>
                                <div class="script-details">
                                    <div class="step-progress">
                                        <span>Steps: ${script.completedSteps || 0}/${script.totalSteps || 0}</span>
                                        ${script.totalSteps > 0 ? `
                                            <div class="progress-bar">
                                                <div class="progress-fill" style="width: ${(script.completedSteps / script.totalSteps) * 100}%"></div>
                                            </div>
                                        ` : ''}
                                    </div>
                                    ${script.failedAt ? `
                                        <div class="script-error">
                                            <strong>Failed at:</strong> ${script.failedAt}
                                        </div>
                                    ` : ''}
                                    ${script.error ? `
                                        <div class="script-error-detail" style="background: #FFF7ED; border: 1px solid #FED7AA; color: #9A3412;">
                                            <strong>What went wrong:</strong> ${this.translateError(script.error)}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Add raw output if available
        if (item.output || item.error) {
            content += `
                <div class="detail-section">
                    <h3>Execution Output</h3>
                    ${item.output ? `
                        <div class="output-section">
                            <h4>Standard Output</h4>
                            <pre class="output-text">${item.output}</pre>
                        </div>
                    ` : ''}
                    ${item.error ? `
                        <div class="output-section">
                            <h4>Error Output</h4>
                            <pre class="error-text">${item.error}</pre>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        return content;
    }

    getStatusClass(status) {
        switch (status) {
            case 'success':
                return 'status-success';
            case 'failed':
                return 'status-failed';
            case 'error':
                return 'status-error';
            case 'running':
                return 'status-running';
            default:
                return '';
        }
    }

    getTimeAgo(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) {
            return 'Just now';
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(seconds / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        }
    }
}

// Initialize the history manager
const historyManager = new HistoryManager();