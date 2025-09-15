class AnalyticsManager {
    constructor() {
        this.history = [];
        this.timeRange = '24h';
        this.charts = {};
        
        this.init();
    }

    init() {
        this.loadAnalytics();
        // Auto-refresh every 30 seconds
        setInterval(() => this.loadAnalytics(true), 30000);
    }

    async loadAnalytics(silent = false) {
        try {
            // Fetch all history for analytics
            const response = await fetch('/api/test-runs/history?limit=1000&offset=0');
            const result = await response.json();
            
            if (result.success) {
                this.history = result.data.history;
                this.updateMetrics();
                this.updateCharts();
                this.updatePerformanceTable();
                
                if (!silent) {
                    console.log('✅ Analytics data loaded');
                }
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showEmptyState();
        }
    }

    setTimeRange(range) {
        this.timeRange = range;
        
        // Update button states
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        this.updateMetrics();
        this.updateCharts();
    }

    getFilteredHistory() {
        const now = new Date();
        const filtered = this.history.filter(item => {
            if (this.timeRange === 'all') return true;
            
            const itemDate = new Date(item.startTime);
            const diffHours = (now - itemDate) / (1000 * 60 * 60);
            
            switch (this.timeRange) {
                case '24h':
                    return diffHours <= 24;
                case '7d':
                    return diffHours <= 168;
                case '30d':
                    return diffHours <= 720;
                default:
                    return true;
            }
        });
        
        return filtered;
    }

    updateMetrics() {
        const filtered = this.getFilteredHistory();
        
        if (filtered.length === 0) {
            document.getElementById('total-executions').textContent = '0';
            document.getElementById('success-rate').textContent = '0%';
            document.getElementById('avg-duration').textContent = '0s';
            document.getElementById('failed-tests').textContent = '0';
            this.showEmptyState();
            return;
        }
        
        this.hideEmptyState();
        
        // Total executions
        document.getElementById('total-executions').textContent = filtered.length;
        
        // Success rate
        const successful = filtered.filter(item => item.status === 'success').length;
        const successRate = Math.round((successful / filtered.length) * 100);
        document.getElementById('success-rate').textContent = `${successRate}%`;
        
        // Average duration
        const durations = filtered.filter(item => item.duration).map(item => item.duration);
        const avgDuration = durations.length > 0 
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
            : 0;
        document.getElementById('avg-duration').textContent = `${avgDuration}s`;
        
        // Failed tests
        const failed = filtered.filter(item => item.status === 'failed' || item.status === 'error').length;
        document.getElementById('failed-tests').textContent = failed;
        
        // Calculate changes (mock data for now)
        this.updateChanges(successRate, avgDuration);
    }

    updateChanges(currentSuccessRate, currentAvgDuration) {
        // Mock change indicators (in production, compare with previous period)
        document.getElementById('executions-change').textContent = '+12% from last period';
        document.getElementById('executions-change').className = 'metric-change positive';
        
        document.getElementById('success-change').textContent = currentSuccessRate > 90 ? '↑ Good' : '↓ Needs improvement';
        document.getElementById('success-change').className = currentSuccessRate > 90 ? 'metric-change positive' : 'metric-change negative';
        
        document.getElementById('duration-change').textContent = `Target: <${currentAvgDuration + 5}s`;
        document.getElementById('duration-change').className = 'metric-change';
        
        document.getElementById('failed-change').textContent = 'Track failures';
        document.getElementById('failed-change').className = 'metric-change';
    }

    updateCharts() {
        const filtered = this.getFilteredHistory();
        
        if (filtered.length === 0) return;
        
        // Execution Trend Chart
        this.createExecutionTrendChart(filtered);
        
        // Success/Failure Distribution
        this.createSuccessFailureChart(filtered);
        
        // Duration Distribution
        this.createDurationChart(filtered);
        
        // Test Type Distribution
        this.createTypeChart(filtered);
    }

    createExecutionTrendChart(data) {
        const ctx = document.getElementById('executionTrendChart').getContext('2d');
        
        // Group by hour/day based on time range
        const groupedData = this.groupByTime(data);
        
        // Sort the keys chronologically for proper chart display
        const sortedKeys = Object.keys(groupedData).sort();
        const sortedValues = sortedKeys.map(key => groupedData[key]);
        
        console.log('Chart data - labels:', sortedKeys);
        console.log('Chart data - values:', sortedValues);
        
        if (this.charts.executionTrend) {
            this.charts.executionTrend.destroy();
        }
        
        this.charts.executionTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedKeys,
                datasets: [{
                    label: 'Executions',
                    data: sortedValues,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#3B82F6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    spanGaps: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                elements: {
                    line: {
                        tension: 0.4
                    },
                    point: {
                        radius: 5,
                        hoverRadius: 7
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    createSuccessFailureChart(data) {
        const ctx = document.getElementById('successFailureChart').getContext('2d');
        
        const successful = data.filter(item => item.status === 'success').length;
        const failed = data.filter(item => item.status === 'failed' || item.status === 'error').length;
        const running = data.filter(item => item.status === 'running').length;
        
        if (this.charts.successFailure) {
            this.charts.successFailure.destroy();
        }
        
        this.charts.successFailure = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Success', 'Failed', 'Running'],
                datasets: [{
                    data: [successful, failed, running],
                    backgroundColor: [
                        '#10B981',
                        '#EF4444',
                        '#3B82F6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createDurationChart(data) {
        const ctx = document.getElementById('durationChart').getContext('2d');
        
        const durations = data.filter(item => item.duration).map(item => item.duration / 1000);
        
        // Create buckets: 0-10s, 10-30s, 30-60s, 60s+
        const buckets = {
            '0-10s': 0,
            '10-30s': 0,
            '30-60s': 0,
            '60s+': 0
        };
        
        durations.forEach(duration => {
            if (duration <= 10) buckets['0-10s']++;
            else if (duration <= 30) buckets['10-30s']++;
            else if (duration <= 60) buckets['30-60s']++;
            else buckets['60s+']++;
        });
        
        if (this.charts.duration) {
            this.charts.duration.destroy();
        }
        
        this.charts.duration = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(buckets),
                datasets: [{
                    label: 'Number of Executions',
                    data: Object.values(buckets),
                    backgroundColor: '#8B5CF6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    createTypeChart(data) {
        const ctx = document.getElementById('typeChart').getContext('2d');
        
        const scripts = data.filter(item => item.type === 'script').length;
        const suites = data.filter(item => item.type === 'suite').length;
        
        if (this.charts.type) {
            this.charts.type.destroy();
        }
        
        this.charts.type = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Scripts', 'Suites'],
                datasets: [{
                    data: [scripts, suites],
                    backgroundColor: [
                        '#3B82F6',
                        '#8B5CF6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }


    updatePerformanceTable() {
        const filtered = this.getFilteredHistory();
        const tbody = document.getElementById('performance-tbody');
        
        if (!tbody) return;
        
        // Group by test name
        const testStats = {};
        
        filtered.forEach(item => {
            if (!testStats[item.name]) {
                testStats[item.name] = {
                    name: item.name,
                    type: item.type,
                    runs: 0,
                    successful: 0,
                    totalDuration: 0
                };
            }
            
            testStats[item.name].runs++;
            if (item.status === 'success') {
                testStats[item.name].successful++;
            }
            if (item.duration) {
                testStats[item.name].totalDuration += item.duration;
            }
        });
        
        // Convert to array and sort by runs
        const sortedStats = Object.values(testStats)
            .sort((a, b) => b.runs - a.runs)
            .slice(0, 10); // Top 10
        
        tbody.innerHTML = sortedStats.map(stat => {
            const successRate = Math.round((stat.successful / stat.runs) * 100);
            const avgDuration = stat.totalDuration > 0 
                ? Math.round(stat.totalDuration / stat.runs / 1000) 
                : 0;
            
            return `
                <tr>
                    <td>${stat.name}</td>
                    <td><span class="history-type ${stat.type === 'suite' ? 'type-suite' : 'type-script'}">${stat.type}</span></td>
                    <td>${stat.runs}</td>
                    <td>
                        <span style="color: ${successRate >= 90 ? '#10B981' : successRate >= 70 ? '#F59E0B' : '#EF4444'}">
                            ${successRate}%
                        </span>
                    </td>
                    <td>${avgDuration}s</td>
                </tr>
            `;
        }).join('');
    }

    showEmptyState() {
        const emptyState = document.getElementById('empty-analytics');
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        
        // Hide charts
        document.querySelector('.charts-container').style.display = 'none';
    }

    hideEmptyState() {
        const emptyState = document.getElementById('empty-analytics');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        // Show charts
        document.querySelector('.charts-container').style.display = 'grid';
    }

    groupByTime(data) {
        console.log('groupByTime called with data:', data);
        console.log('timeRange:', this.timeRange);
        
        const groups = {};
        const now = new Date();
        
        data.forEach(execution => {
            const date = new Date(execution.startTime);
            let key;
            
            switch (this.timeRange) {
                case '24h':
                    // Group by hour
                    key = date.toISOString().substring(0, 13) + ':00';
                    break;
                case '7d':
                    // Group by day
                    key = date.toISOString().substring(0, 10);
                    break;
                case '30d':
                    // Group by day
                    key = date.toISOString().substring(0, 10);
                    break;
                default:
                    // Group by day for 'all'
                    key = date.toISOString().substring(0, 10);
                    break;
            }
            
            if (!groups[key]) {
                groups[key] = 0;
            }
            groups[key]++;
        });
        
        console.log('groups before fillMissingTimeSlots:', groups);
        
        // Fill in missing time periods with 0
        this.fillMissingTimeSlots(groups);
        
        console.log('groups after fillMissingTimeSlots:', groups);
        
        return groups;
    }
    
    fillMissingTimeSlots(groups) {
        const now = new Date();
        let start, interval, format;
        
        switch (this.timeRange) {
            case '24h':
                start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                interval = 60 * 60 * 1000; // 1 hour
                format = (date) => date.toISOString().substring(0, 13) + ':00';
                break;
            case '7d':
                start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                interval = 24 * 60 * 60 * 1000; // 1 day
                format = (date) => date.toISOString().substring(0, 10);
                break;
            case '30d':
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                interval = 24 * 60 * 60 * 1000; // 1 day
                format = (date) => date.toISOString().substring(0, 10);
                break;
            default:
                // For 'all', don't fill missing slots
                return;
        }
        
        for (let time = start.getTime(); time <= now.getTime(); time += interval) {
            const key = format(new Date(time));
            if (!groups[key]) {
                groups[key] = 0;
            }
        }
    }
}

// Initialize the analytics manager
const analyticsManager = new AnalyticsManager();