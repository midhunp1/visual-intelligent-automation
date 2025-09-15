class SchedulingManager {
    constructor() {
        this.schedules = [];
        this.suites = [];
        this.selectedInterval = null;
        this.selectedDays = new Set();
        this.upcomingTimers = [];
        
        this.init();
    }
    
    async init() {
        await this.loadSuites();
        await this.loadSchedules();
        this.setupEventListeners();
        this.startUpcomingCountdown();
        
        // Check schedules every minute
        setInterval(() => this.checkSchedules(), 60000);
    }
    
    setupEventListeners() {
        // Interval form
        const intervalForm = document.getElementById('interval-schedule-form');
        if (intervalForm) {
            intervalForm.addEventListener('submit', (e) => this.handleIntervalSchedule(e));
        }
        
        // Time form
        const timeForm = document.getElementById('time-schedule-form');
        if (timeForm) {
            timeForm.addEventListener('submit', (e) => this.handleTimeSchedule(e));
        }
        
        // Interval buttons
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectInterval(btn));
        });
        
        // Day selector buttons
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleDay(btn));
        });
        
        // Repeat frequency change
        const repeatFreq = document.getElementById('repeat-frequency');
        if (repeatFreq) {
            repeatFreq.addEventListener('change', () => this.handleRepeatChange());
        }
    }
    
    selectInterval(btn) {
        // Remove previous selection
        document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        const interval = btn.dataset.interval;
        const unit = btn.dataset.unit;
        
        const customDiv = document.getElementById('custom-interval');
        if (interval === 'custom') {
            customDiv.style.display = 'flex';
            this.selectedInterval = null;
        } else {
            customDiv.style.display = 'none';
            this.selectedInterval = { value: parseInt(interval), unit: unit };
        }
    }
    
    toggleDay(btn) {
        const day = parseInt(btn.dataset.day);
        if (this.selectedDays.has(day)) {
            this.selectedDays.delete(day);
            btn.classList.remove('selected');
        } else {
            this.selectedDays.add(day);
            btn.classList.add('selected');
        }
    }
    
    handleRepeatChange() {
        const frequency = document.getElementById('repeat-frequency').value;
        const daySelector = document.getElementById('day-selector-group');
        
        if (frequency === 'weekly') {
            daySelector.style.display = 'block';
        } else {
            daySelector.style.display = 'none';
            this.selectedDays.clear();
            document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('selected'));
        }
        
        // Auto-select days for weekdays/weekends
        if (frequency === 'weekdays') {
            this.selectedDays = new Set([1, 2, 3, 4, 5]);
        } else if (frequency === 'weekends') {
            this.selectedDays = new Set([0, 6]);
        }
    }
    
    async loadSuites() {
        try {
            const response = await fetch('/api/test-runs/suites');
            const result = await response.json();
            
            if (result.success) {
                this.suites = result.data || [];
                this.populateSuiteSelectors();
            }
        } catch (error) {
            console.error('Error loading suites:', error);
        }
    }
    
    populateSuiteSelectors() {
        const intervalSelect = document.getElementById('interval-suite-select');
        const timeSelect = document.getElementById('time-suite-select');
        
        const options = this.suites.map(suite => 
            `<option value="${suite.id}">${suite.name}</option>`
        ).join('');
        
        if (intervalSelect) {
            intervalSelect.innerHTML = '<option value="">Choose a suite...</option>' + options;
        }
        if (timeSelect) {
            timeSelect.innerHTML = '<option value="">Choose a suite...</option>' + options;
        }
    }
    
    async handleIntervalSchedule(e) {
        e.preventDefault();
        
        const suiteId = document.getElementById('interval-suite-select').value;
        const name = document.getElementById('interval-schedule-name').value;
        
        if (!suiteId) {
            alert('Please select a suite');
            return;
        }
        
        let interval = this.selectedInterval;
        if (!interval) {
            const customValue = document.getElementById('custom-interval-value').value;
            const customUnit = document.getElementById('custom-interval-unit').value;
            
            if (!customValue) {
                alert('Please select an interval');
                return;
            }
            
            interval = { value: parseInt(customValue), unit: customUnit };
        }
        
        const suite = this.suites.find(s => s.id === suiteId);
        const schedule = {
            id: `schedule-${Date.now()}`,
            type: 'interval',
            suiteId: suiteId,
            suiteName: suite ? suite.name : 'Unknown',
            name: name || `Every ${interval.value} ${interval.unit}`,
            interval: interval,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastRun: null,
            nextRun: this.calculateNextRun('interval', interval),
            runCount: 0
        };
        
        await this.createSchedule(schedule);
        e.target.reset();
        document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('selected'));
        this.selectedInterval = null;
    }
    
    async handleTimeSchedule(e) {
        e.preventDefault();
        
        const suiteId = document.getElementById('time-suite-select').value;
        const time = document.getElementById('schedule-time').value;
        const timezone = document.getElementById('timezone').value;
        const frequency = document.getElementById('repeat-frequency').value;
        const name = document.getElementById('time-schedule-name').value;
        
        if (!suiteId || !time) {
            alert('Please fill in all required fields');
            return;
        }
        
        const suite = this.suites.find(s => s.id === suiteId);
        const schedule = {
            id: `schedule-${Date.now()}`,
            type: 'time',
            suiteId: suiteId,
            suiteName: suite ? suite.name : 'Unknown',
            name: name || `${frequency} at ${time}`,
            time: time,
            timezone: timezone,
            frequency: frequency,
            days: frequency === 'weekly' ? Array.from(this.selectedDays) : [],
            status: 'active',
            createdAt: new Date().toISOString(),
            lastRun: null,
            nextRun: this.calculateNextRun('time', { time, frequency, days: Array.from(this.selectedDays) }),
            runCount: 0
        };
        
        await this.createSchedule(schedule);
        e.target.reset();
        this.selectedDays.clear();
        document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('selected'));
    }
    
    calculateNextRun(type, config) {
        const now = new Date();
        
        if (type === 'interval') {
            const next = new Date(now);
            switch (config.unit) {
                case 'minutes':
                    next.setMinutes(next.getMinutes() + config.value);
                    break;
                case 'hour':
                case 'hours':
                    next.setHours(next.getHours() + config.value);
                    break;
                case 'day':
                case 'days':
                    next.setDate(next.getDate() + config.value);
                    break;
                case 'weeks':
                    next.setDate(next.getDate() + (config.value * 7));
                    break;
                case 'months':
                    next.setMonth(next.getMonth() + config.value);
                    break;
            }
            return next.toISOString();
        } else if (type === 'time') {
            const [hours, minutes] = config.time.split(':').map(Number);
            const next = new Date(now);
            next.setHours(hours, minutes, 0, 0);
            
            // If time has passed today, move to next applicable day
            if (next <= now) {
                next.setDate(next.getDate() + 1);
            }
            
            // Handle weekly schedules
            if (config.frequency === 'weekly' && config.days.length > 0) {
                while (!config.days.includes(next.getDay())) {
                    next.setDate(next.getDate() + 1);
                }
            } else if (config.frequency === 'weekdays') {
                while (next.getDay() === 0 || next.getDay() === 6) {
                    next.setDate(next.getDate() + 1);
                }
            } else if (config.frequency === 'weekends') {
                while (next.getDay() !== 0 && next.getDay() !== 6) {
                    next.setDate(next.getDate() + 1);
                }
            }
            
            return next.toISOString();
        }
        
        return null;
    }
    
    async createSchedule(schedule) {
        try {
            const response = await fetch('/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schedule)
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('Schedule created successfully');
                await this.loadSchedules();
            }
        } catch (error) {
            console.error('Error creating schedule:', error);
            alert('Failed to create schedule');
        }
    }
    
    async loadSchedules() {
        try {
            const response = await fetch('/api/schedules');
            const result = await response.json();
            
            if (result.success) {
                this.schedules = result.data || [];
                this.renderSchedules();
                this.updateUpcoming();
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    }
    
    renderSchedules() {
        const container = document.getElementById('schedules-content');
        const count = document.getElementById('schedule-count');
        
        if (!container) return;
        
        count.textContent = `${this.schedules.length} schedule${this.schedules.length !== 1 ? 's' : ''}`;
        
        if (this.schedules.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                    </svg>
                    <p>No schedules created yet</p>
                    <p style="font-size: 12px;">Create your first schedule above</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <table class="schedules-table">
                <thead>
                    <tr>
                        <th>Schedule Name</th>
                        <th>Suite</th>
                        <th>Type</th>
                        <th>Frequency</th>
                        <th>Next Run</th>
                        <th>Run Count</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.schedules.map(schedule => this.renderScheduleRow(schedule)).join('')}
                </tbody>
            </table>
        `;
    }
    
    renderScheduleRow(schedule) {
        const nextRun = new Date(schedule.nextRun);
        const nextRunFormatted = nextRun.toLocaleString();
        
        let frequency = '';
        if (schedule.type === 'interval') {
            frequency = `Every ${schedule.interval.value} ${schedule.interval.unit}`;
        } else {
            frequency = `${schedule.frequency} at ${schedule.time}`;
        }
        
        return `
            <tr>
                <td><strong>${schedule.name}</strong></td>
                <td>${schedule.suiteName}</td>
                <td>${schedule.type === 'interval' ? 'Interval' : 'Scheduled'}</td>
                <td>${frequency}</td>
                <td>${nextRunFormatted}</td>
                <td>${schedule.runCount}</td>
                <td>
                    <span class="schedule-status status-${schedule.status}">
                        ${schedule.status}
                    </span>
                </td>
                <td>
                    <div class="schedule-actions">
                        ${schedule.status === 'active' ? 
                            `<button class="action-btn" onclick="schedulingManager.pauseSchedule('${schedule.id}')">Pause</button>` :
                            `<button class="action-btn" onclick="schedulingManager.resumeSchedule('${schedule.id}')">Resume</button>`
                        }
                        <button class="action-btn" onclick="schedulingManager.runNow('${schedule.id}')">Run Now</button>
                        <button class="action-btn danger" onclick="schedulingManager.deleteSchedule('${schedule.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }
    
    updateUpcoming() {
        const upcomingList = document.getElementById('upcoming-list');
        if (!upcomingList) return;
        
        // Get next 5 upcoming runs
        const upcoming = this.schedules
            .filter(s => s.status === 'active' && s.nextRun)
            .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun))
            .slice(0, 5);
        
        if (upcoming.length === 0) {
            upcomingList.innerHTML = `
                <div style="text-align: center; opacity: 0.8; padding: 20px;">
                    No upcoming scheduled runs
                </div>
            `;
            return;
        }
        
        upcomingList.innerHTML = upcoming.map(schedule => {
            const nextRun = new Date(schedule.nextRun);
            const timeUntil = this.getTimeUntil(nextRun);
            
            return `
                <div class="upcoming-item">
                    <div class="upcoming-info">
                        <div class="upcoming-suite">${schedule.suiteName}</div>
                        <div class="upcoming-time">${nextRun.toLocaleString()}</div>
                    </div>
                    <div class="upcoming-countdown">${timeUntil}</div>
                </div>
            `;
        }).join('');
    }
    
    getTimeUntil(date) {
        const now = new Date();
        const diff = date - now;
        
        if (diff < 0) return 'Overdue';
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `in ${days}d ${hours % 24}h`;
        if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
        return `in ${minutes}m`;
    }
    
    startUpcomingCountdown() {
        // Update countdown every minute
        setInterval(() => this.updateUpcoming(), 60000);
    }
    
    async checkSchedules() {
        const now = new Date();
        
        for (const schedule of this.schedules) {
            if (schedule.status !== 'active') continue;
            
            const nextRun = new Date(schedule.nextRun);
            if (nextRun <= now) {
                await this.executeSchedule(schedule);
            }
        }
    }
    
    async executeSchedule(schedule) {
        try {
            // Run the suite
            const response = await fetch(`/api/test-runs/suites/${schedule.suiteId}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduledId: schedule.id })
            });
            
            const result = await response.json();
            
            // Update schedule
            schedule.lastRun = new Date().toISOString();
            schedule.runCount++;
            schedule.nextRun = this.calculateNextRun(
                schedule.type,
                schedule.type === 'interval' ? schedule.interval : 
                { time: schedule.time, frequency: schedule.frequency, days: schedule.days }
            );
            
            // Save updated schedule
            await this.updateSchedule(schedule);
            
            console.log(`Executed scheduled suite: ${schedule.suiteName}`);
        } catch (error) {
            console.error('Error executing schedule:', error);
        }
    }
    
    async updateSchedule(schedule) {
        try {
            await fetch(`/api/schedules/${schedule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schedule)
            });
            
            await this.loadSchedules();
        } catch (error) {
            console.error('Error updating schedule:', error);
        }
    }
    
    async pauseSchedule(id) {
        const schedule = this.schedules.find(s => s.id === id);
        if (schedule) {
            schedule.status = 'paused';
            await this.updateSchedule(schedule);
        }
    }
    
    async resumeSchedule(id) {
        const schedule = this.schedules.find(s => s.id === id);
        if (schedule) {
            schedule.status = 'active';
            // Recalculate next run from now
            schedule.nextRun = this.calculateNextRun(
                schedule.type,
                schedule.type === 'interval' ? schedule.interval : 
                { time: schedule.time, frequency: schedule.frequency, days: schedule.days }
            );
            await this.updateSchedule(schedule);
        }
    }
    
    async runNow(id) {
        const schedule = this.schedules.find(s => s.id === id);
        if (schedule) {
            await this.executeSchedule(schedule);
        }
    }
    
    async deleteSchedule(id) {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        
        try {
            await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
            await this.loadSchedules();
        } catch (error) {
            console.error('Error deleting schedule:', error);
        }
    }
}

// Initialize
const schedulingManager = new SchedulingManager();