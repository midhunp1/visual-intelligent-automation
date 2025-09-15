class ScheduledHistoryManager {
    constructor() {
        this.history = [];
        this.filteredHistory = [];
        this.schedules = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.filters = {
            status: 'all',
            schedule: 'all',
            time: 'all',
            trigger: 'all'
        };
        
        this.init();
    }
    
    async init() {
        await this.loadSchedules();
        await this.loadHistory();
        this.updateStatistics();
        this.setupEventListeners();
        
        // Auto-refresh every 30 seconds
        setInterval(() => this.loadHistory(true), 30000);
    }
    
    setupEventListeners() {
        // Add click handlers for table rows to show details
        document.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-execution-id]');
            if (row) {
                const executionId = row.dataset.executionId;
                this.showExecutionDetails(executionId);
            }
        });
    }
    
    async loadSchedules() {
        try {
            const response = await fetch('/api/schedules');
            const result = await response.json();
            
            if (result.success) {
                this.schedules = result.data || [];
                this.populateScheduleFilter();
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    }
    
    populateScheduleFilter() {
        const filter = document.getElementById('schedule-filter');
        if (!filter) return;
        
        const options = this.schedules.map(schedule => 
            `<option value="${schedule.id}">${schedule.name}</option>`
        ).join('');
        
        filter.innerHTML = '<option value="all">All Schedules</option>' + options;
    }
    
    async loadHistory(silent = false) {
        try {
            const response = await fetch('/api/scheduled-history');
            const result = await response.json();
            
            if (result.success) {
                this.history = result.data || [];
                this.applyFilters();
                
                if (!silent) {
                    console.log('Scheduled history loaded successfully');
                }
            }
        } catch (error) {
            console.error('Error loading scheduled history:', error);
        }
    }
    
    setFilter(type, value) {
        this.filters[type] = value;
        this.currentPage = 1;
        
        // Update button states
        if (type === 'status' || type === 'trigger') {
            const buttons = document.querySelectorAll(`.filter-btn`);
            buttons.forEach(btn => {
                const btnText = btn.textContent.toLowerCase();
                const btnParent = btn.closest('.filter-group');
                const filterLabel = btnParent?.querySelector('.filter-label')?.textContent.toLowerCase();
                
                if (filterLabel && filterLabel.includes(type)) {
                    if (btnText === value || (value === 'all' && btnText === 'all')) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            });
        }
        
        this.applyFilters();
    }
    
    applyFilters() {
        this.filteredHistory = this.history.filter(item => {
            // Status filter
            if (this.filters.status !== 'all' && item.status !== this.filters.status) {
                return false;
            }
            
            // Schedule filter
            if (this.filters.schedule !== 'all' && item.scheduleId !== this.filters.schedule) {
                return false;
            }
            
            // Time filter
            if (this.filters.time !== 'all') {
                const itemDate = new Date(item.executedAt);
                const now = new Date();
                
                switch (this.filters.time) {
                    case 'today':
                        if (itemDate.toDateString() !== now.toDateString()) return false;
                        break;
                    case 'week':
                        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                        if (itemDate < weekAgo) return false;
                        break;
                    case 'month':
                        const monthAgo = new Date(now);
                        monthAgo.setMonth(monthAgo.getMonth() - 1);
                        if (itemDate < monthAgo) return false;
                        break;
                }
            }
            
            // Trigger filter
            if (this.filters.trigger !== 'all' && item.trigger !== this.filters.trigger) {
                return false;
            }
            
            return true;
        });
        
        this.renderHistory();
        this.renderPagination();
        this.updateStatistics();
    }
    
    renderHistory() {
        const tbody = document.getElementById('history-tbody');
        const emptyState = document.getElementById('empty-history');
        const table = document.getElementById('scheduled-history-table');
        
        if (!tbody) return;
        
        if (this.filteredHistory.length === 0) {
            table.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }
        
        table.style.display = 'table';
        emptyState.style.display = 'none';
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageItems = this.filteredHistory.slice(startIndex, endIndex);
        
        tbody.innerHTML = pageItems.map(item => this.renderHistoryRow(item)).join('');
    }
    
    renderHistoryRow(item) {
        const executedAt = new Date(item.executedAt);
        const formattedDate = executedAt.toLocaleDateString();
        const formattedTime = executedAt.toLocaleTimeString();
        const timeAgo = this.getTimeAgo(executedAt);
        
        return `
            <tr data-execution-id="${item.id}">
                <td>
                    <div class="schedule-name">${item.scheduleName || 'Manual Run'}</div>
                    <div class="suite-name">${item.suiteName}</div>
                </td>
                <td>
                    <div class="execution-time">
                        <span class="time-primary">${formattedDate} ${formattedTime}</span>
                        <span class="time-secondary">${timeAgo}</span>
                    </div>
                </td>
                <td>
                    <span class="status-badge status-${item.status}">
                        ${item.status}
                    </span>
                </td>
                <td>
                    <span class="duration-cell">${item.durationFormatted || '-'}</span>
                </td>
                <td>
                    <span class="trigger-badge trigger-${item.trigger}">
                        ${item.trigger}
                    </span>
                </td>
                <td>
                    ${item.failureDetails ? 
                        `<span style="color: #EF4444; font-size: 12px;">Failed at: ${item.failedAt || 'Unknown'}</span>` :
                        `<span style="color: #10B981; font-size: 12px;">Completed</span>`
                    }
                </td>
            </tr>
        `;
    }
    
    getTimeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
        return date.toLocaleDateString();
    }
    
    renderPagination() {
        const container = document.getElementById('pagination');
        if (!container) return;
        
        const totalPages = Math.ceil(this.filteredHistory.length / this.itemsPerPage);
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        
        // Previous button
        html += `
            <button class="page-btn" onclick="scheduledHistoryManager.goToPage(${this.currentPage - 1})" 
                    ${this.currentPage === 1 ? 'disabled' : ''}>
                ←
            </button>
        `;
        
        // Page numbers
        const maxVisible = 5;
        let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start < maxVisible - 1) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        if (start > 1) {
            html += `<button class="page-btn" onclick="scheduledHistoryManager.goToPage(1)">1</button>`;
            if (start > 2) html += `<span style="color: #9CA3AF;">...</span>`;
        }
        
        for (let i = start; i <= end; i++) {
            html += `
                <button class="page-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="scheduledHistoryManager.goToPage(${i})">
                    ${i}
                </button>
            `;
        }
        
        if (end < totalPages) {
            if (end < totalPages - 1) html += `<span style="color: #9CA3AF;">...</span>`;
            html += `<button class="page-btn" onclick="scheduledHistoryManager.goToPage(${totalPages})">${totalPages}</button>`;
        }
        
        // Next button
        html += `
            <button class="page-btn" onclick="scheduledHistoryManager.goToPage(${this.currentPage + 1})" 
                    ${this.currentPage === totalPages ? 'disabled' : ''}>
                →
            </button>
        `;
        
        // Page info
        html += `
            <span class="page-info">
                ${(this.currentPage - 1) * this.itemsPerPage + 1}-${Math.min(this.currentPage * this.itemsPerPage, this.filteredHistory.length)} 
                of ${this.filteredHistory.length}
            </span>
        `;
        
        container.innerHTML = html;
    }
    
    goToPage(page) {
        const totalPages = Math.ceil(this.filteredHistory.length / this.itemsPerPage);
        if (page < 1 || page > totalPages) return;
        
        this.currentPage = page;
        this.renderHistory();
        this.renderPagination();
        
        // Scroll to top of table
        document.querySelector('.history-table-container').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    updateStatistics() {
        const totalRuns = this.history.length;
        const successfulRuns = this.history.filter(h => h.status === 'success').length;
        const failedRuns = this.history.filter(h => h.status === 'failed').length;
        const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
        
        // Calculate average duration
        const durations = this.history
            .filter(h => h.duration)
            .map(h => h.duration);
        const avgDuration = durations.length > 0 
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
            : 0;
        
        // Update DOM
        const totalRunsEl = document.getElementById('total-runs');
        const successRateEl = document.getElementById('success-rate');
        const failedRunsEl = document.getElementById('failed-runs');
        const avgDurationEl = document.getElementById('avg-duration');
        
        if (totalRunsEl) totalRunsEl.textContent = totalRuns;
        if (successRateEl) successRateEl.textContent = `${successRate}%`;
        if (failedRunsEl) failedRunsEl.textContent = failedRuns;
        if (avgDurationEl) avgDurationEl.textContent = `${avgDuration}s`;
        
        // Update trends
        const successTrend = document.getElementById('success-trend');
        const failedTrend = document.getElementById('failed-trend');
        
        if (successTrend) {
            if (successRate >= 80) {
                successTrend.textContent = '↑ Excellent performance';
                successTrend.className = 'stat-change positive';
            } else if (successRate >= 60) {
                successTrend.textContent = '→ Moderate performance';
                successTrend.className = 'stat-change';
            } else {
                successTrend.textContent = '↓ Needs improvement';
                successTrend.className = 'stat-change negative';
            }
        }
        
        if (failedTrend) {
            if (failedRuns === 0) {
                failedTrend.textContent = 'All tests passing';
                failedTrend.className = 'stat-change positive';
            } else if (failedRuns <= 5) {
                failedTrend.textContent = 'Minor issues';
                failedTrend.className = 'stat-change';
            } else {
                failedTrend.textContent = 'Needs attention';
                failedTrend.className = 'stat-change negative';
            }
        }
    }
    
    showExecutionDetails(executionId) {
        const execution = this.history.find(h => h.id === executionId);
        if (!execution) return;
        
        // You can reuse the modal from history.js or create a new one
        // For now, let's log to console
        console.log('Execution details:', execution);
        
        // In a real implementation, you would show a modal with full details
        // Similar to what we did in history.js
    }
}

// Initialize
const scheduledHistoryManager = new ScheduledHistoryManager();