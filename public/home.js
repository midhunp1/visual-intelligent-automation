// Home page functionality
class HomeManager {
    constructor() {
        this.init();
    }

    async init() {
        // Load user data and personalize welcome message
        await this.loadUserData();
        
        // Set up time-based sky background
        this.setupSkyBackground();
        
        // Initialize weather widget
        this.initWeatherWidget();
        
        // Load dashboard data
        this.loadStats();
        this.loadRecentRuns();
        this.loadUpcomingSchedules();
        
        // Refresh data every 30 seconds
        setInterval(() => {
            this.loadStats();
            this.loadRecentRuns();
            this.loadUpcomingSchedules();
        }, 30000);
        
        // Update sky every minute
        setInterval(() => {
            this.setupSkyBackground();
        }, 60000);
        
        // Update time every second
        setInterval(() => {
            this.updateTime();
        }, 1000);
    }

    setupSkyBackground() {
        const skyBackground = document.getElementById('skyBackground');
        const sun = document.getElementById('sun');
        const moon = document.getElementById('moon');
        const stars = document.getElementById('stars');
        const cloud1 = document.getElementById('cloud1');
        const cloud2 = document.getElementById('cloud2');
        const cloud3 = document.getElementById('cloud3');
        const cloud4 = document.getElementById('cloud4');
        
        if (!skyBackground) return;
        
        const hour = new Date().getHours();
        
        // Remove all time classes
        skyBackground.classList.remove('morning', 'afternoon', 'evening', 'night');
        
        // Hide all elements initially
        if (sun) sun.style.display = 'none';
        if (moon) moon.style.display = 'none';
        if (stars) stars.style.display = 'none';
        if (cloud1) cloud1.style.display = 'none';
        if (cloud2) cloud2.style.display = 'none';
        if (cloud3) cloud3.style.display = 'none';
        if (cloud4) cloud4.style.display = 'none';
        
        if (hour >= 5 && hour < 12) {
            // Morning (5 AM - 12 PM)
            skyBackground.classList.add('morning');
            if (sun) sun.style.display = 'block';
            if (cloud1) cloud1.style.display = 'block';
            if (cloud2) cloud2.style.display = 'block';
            if (cloud3) cloud3.style.display = 'block';
            if (cloud4) cloud4.style.display = 'block';
        } else if (hour >= 12 && hour < 17) {
            // Afternoon (12 PM - 5 PM)
            skyBackground.classList.add('afternoon');
            if (sun) sun.style.display = 'block';
            if (cloud1) cloud1.style.display = 'block';
            if (cloud2) cloud2.style.display = 'block';
            if (cloud3) cloud3.style.display = 'block';
            if (cloud4) cloud4.style.display = 'block';
        } else if (hour >= 17 && hour < 20) {
            // Evening (5 PM - 8 PM)
            skyBackground.classList.add('evening');
            if (sun) {
                sun.style.display = 'block';
                sun.style.top = '80px'; // Lower sun for sunset
                sun.style.opacity = '0.8';
            }
            // Show fewer clouds in evening
            if (cloud1) cloud1.style.display = 'block';
            if (cloud2) cloud2.style.display = 'block';
        } else {
            // Night (8 PM - 5 AM)
            skyBackground.classList.add('night');
            if (moon) moon.style.display = 'block';
            if (stars) stars.style.display = 'block';
        }
    }

    async loadUserData() {
        try {
            // Get user data from localStorage or fetch from server
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            const userName = userData.name || userData.username || 'User';
            
            // Get greeting based on time of day
            const greeting = this.getTimeBasedGreeting();
            
            // Update welcome message
            const welcomeTitle = document.querySelector('.welcome-title');
            const welcomeSubtitle = document.querySelector('.welcome-subtitle');
            
            if (welcomeTitle) {
                welcomeTitle.textContent = `${greeting}, ${userName}!`;
            }
            
            if (welcomeSubtitle) {
                welcomeSubtitle.textContent = 'Visual Interaction Automation Platform';
            }
            
            // Also fetch fresh data from server
            try {
                const response = await fetch('/api/auth/profile');
                const data = await response.json();
                
                if (data.success && data.user) {
                    // Update localStorage
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // Update display with fresh data
                    const freshUserName = data.user.name || data.user.username || 'User';
                    if (welcomeTitle) {
                        welcomeTitle.textContent = `${greeting}, ${freshUserName}!`;
                    }
                }
            } catch (error) {
                console.log('Could not fetch fresh user data:', error);
            }
            
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    getTimeBasedGreeting() {
        const hour = new Date().getHours();
        
        if (hour < 12) {
            return 'Good morning';
        } else if (hour < 17) {
            return 'Good afternoon';
        } else {
            return 'Good evening';
        }
    }

    async loadStats() {
        try {
            // Fetch templates count
            const templatesResp = await fetch('/api/templates');
            const templatesData = await templatesResp.json();
            const templatesCount = templatesData.success ? templatesData.templates.length : 0;
            
            // Fetch test runs data
            const testRunsResp = await fetch('/api/test-runs/data');
            const testRunsData = await testRunsResp.json();
            const scriptsCount = testRunsData.data && testRunsData.data.scripts ? testRunsData.data.scripts.length : 0;
            const suitesCount = testRunsData.data && testRunsData.data.suites ? testRunsData.data.suites.length : 0;
            
            // Fetch schedules
            const schedulesResp = await fetch('/api/schedules');
            const schedulesData = await schedulesResp.json();
            const activeSchedules = schedulesData.data ? 
                schedulesData.data.filter(s => s.status === 'active').length : 0;
            
            // Update UI
            this.updateStatCard('templates-count', templatesCount);
            this.updateStatCard('scripts-count', scriptsCount);
            this.updateStatCard('suites-count', suitesCount);
            this.updateStatCard('schedules-count', activeSchedules);
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    updateStatCard(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    async loadRecentRuns() {
        try {
            const response = await fetch('/api/test-runs/history');
            const data = await response.json();
            
            const recentRunsContainer = document.getElementById('recent-runs-list');
            if (!recentRunsContainer) return;
            
            if (data.history && data.history.length > 0) {
                // Get last 3 runs
                const recentRuns = data.history.slice(0, 3);
                
                recentRunsContainer.innerHTML = recentRuns.map(run => {
                    const statusClass = run.status === 'success' ? 'status-success' : 
                                      run.status === 'failed' ? 'status-failed' : 'status-running';
                    const statusText = run.status === 'success' ? 'Success' :
                                     run.status === 'failed' ? 'Failed' : 'Running';
                    
                    const timestamp = new Date(run.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    return `
                        <div class="recent-run-item">
                            <div class="run-info">
                                <div class="run-name">${run.name}</div>
                                <div class="run-time">${timestamp}</div>
                            </div>
                            <span class="run-status ${statusClass}">${statusText}</span>
                        </div>
                    `;
                }).join('');
            } else {
                recentRunsContainer.innerHTML = `
                    <div class="empty-message">
                        No test runs yet. Start by creating a test script!
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading recent runs:', error);
        }
    }

    async loadUpcomingSchedules() {
        try {
            const response = await fetch('/api/schedules');
            const data = await response.json();
            
            const upcomingContainer = document.getElementById('upcoming-schedules-list');
            if (!upcomingContainer) return;
            
            if (data.data && data.data.length > 0) {
                // Filter enabled schedules and sort by next run time
                const enabledSchedules = data.data
                    .filter(s => s.status === 'active')
                    .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun))
                    .slice(0, 3); // Get next 3 schedules
                
                if (enabledSchedules.length > 0) {
                    upcomingContainer.innerHTML = enabledSchedules.map(schedule => {
                        const timeUntil = this.getTimeUntilNext(schedule.nextRun);
                        const nextRunTime = new Date(schedule.nextRun).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        
                        return `
                            <div class="schedule-item">
                                <div class="schedule-info">
                                    <div class="schedule-name">${schedule.suiteName}</div>
                                    <div class="schedule-interval">${this.getScheduleDescription(schedule)}</div>
                                </div>
                                <div class="schedule-time">
                                    <div class="time-until">${timeUntil}</div>
                                    <div class="next-run">${nextRunTime}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                } else {
                    upcomingContainer.innerHTML = `
                        <div class="empty-message">
                            No active schedules. Set up automated test runs!
                        </div>
                    `;
                }
            } else {
                upcomingContainer.innerHTML = `
                    <div class="empty-message">
                        No schedules configured yet.
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading upcoming schedules:', error);
        }
    }

    calculateNextRun(schedule) {
        const now = Date.now();
        
        if (schedule.scheduleType === 'interval') {
            const interval = schedule.intervalMinutes * 60 * 1000;
            const lastRun = schedule.lastRun ? new Date(schedule.lastRun).getTime() : now;
            return lastRun + interval;
        } else if (schedule.scheduleType === 'time') {
            const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);
            const next = new Date();
            next.setHours(hours, minutes, 0, 0);
            
            // If time has passed today, move to next occurrence
            if (next.getTime() <= now) {
                if (schedule.frequency === 'daily') {
                    next.setDate(next.getDate() + 1);
                } else if (schedule.frequency === 'weekly') {
                    next.setDate(next.getDate() + 7);
                } else if (schedule.frequency === 'monthly') {
                    next.setMonth(next.getMonth() + 1);
                }
            }
            
            return next.getTime();
        }
        
        return now;
    }

    getTimeUntilNext(nextRunTime) {
        const nextDate = new Date(nextRunTime);
        const diff = nextDate.getTime() - Date.now();
        
        if (diff <= 0) return 'Now';
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `in ${days} day${days > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `in ${hours}h ${minutes}m`;
        } else {
            return `in ${minutes}m`;
        }
    }

    getScheduleDescription(schedule) {
        if (schedule.type === 'interval') {
            const value = schedule.interval.value;
            const unit = schedule.interval.unit;
            
            if (unit === 'minutes') {
                return `Every ${value} minute${value > 1 ? 's' : ''}`;
            } else if (unit === 'hours' || unit === 'hour') {
                return `Every ${value} hour${value > 1 ? 's' : ''}`;
            } else if (unit === 'days' || unit === 'day') {
                return `Every ${value} day${value > 1 ? 's' : ''}`;
            } else {
                return `Every ${value} ${unit}`;
            }
        } else {
            return `${schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} at ${schedule.time}`;
        }
    }

    // Weather Widget Functions
    async initWeatherWidget() {
        // Get user's location and load weather
        await this.loadWeather();
        
        // Update time immediately
        this.updateTime();
        
        // Refresh weather every 10 minutes
        setInterval(() => {
            this.loadWeather();
        }, 600000);
    }

    async loadWeather() {
        try {
            // Get user's location
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            // Use a free weather API (OpenWeatherMap requires API key, so we'll use a basic geolocation service)
            // For demo purposes, we'll get location name and use mock weather data
            const locationResponse = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
            const locationData = await locationResponse.json();
            
            const city = locationData.city || locationData.locality || 'Unknown Location';
            const country = locationData.countryCode || '';
            
            // For temperature, we'll use a simple calculation based on coordinates
            // In a real app, you'd use a weather API like OpenWeatherMap
            const temp = Math.round(20 + Math.sin(latitude * Math.PI / 180) * 10 + Math.random() * 5);
            
            // Update UI
            document.getElementById('weather-location').textContent = `${city}${country ? ', ' + country : ''}`;
            document.getElementById('weather-temp').textContent = `${temp}°C`;
            
        } catch (error) {
            console.log('Weather data unavailable:', error);
            // Fallback to basic location
            document.getElementById('weather-location').textContent = 'Location Unavailable';
            document.getElementById('weather-temp').textContent = '--°';
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 10000,
                maximumAge: 600000 // 10 minutes
            });
        });
    }

    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const timeElement = document.getElementById('weather-time');
        if (timeElement) {
            timeElement.textContent = timeString;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HomeManager();
});