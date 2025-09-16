// API Configuration
// This file determines which endpoints to use for different operations

const Config = {
    // Detect if running locally or on live site
    isLocal: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    
    // API endpoints
    getApiUrl: function() {
        // If running locally, use local server
        if (this.isLocal) {
            return 'http://localhost:8288';
        }
        // If live, use Render API
        return 'https://via-platform-api.onrender.com';
    },
    
    // Execution endpoint (always local for now)
    getExecutionUrl: function() {
        // Test execution always happens locally
        return 'http://localhost:8288';
    },
    
    // Check if execution is available
    canExecuteTests: function() {
        // Can only execute tests if local Docker is running
        return this.isLocal || this.hasLocalExecutor();
    },
    
    // Check if local executor is available
    hasLocalExecutor: async function() {
        try {
            const response = await fetch('http://localhost:8288/api/health', {
                mode: 'no-cors'
            });
            return true;
        } catch (error) {
            return false;
        }
    },
    
    // Get appropriate endpoint for different operations
    getEndpoint: function(operation) {
        const apiOperations = [
            'scripts', 'suites', 'templates', 'schedules', 
            'auth', 'alerts', 'settings'
        ];
        
        const executionOperations = [
            'execute', 'codegen', 'record', 'vnc'
        ];
        
        // Check operation type
        const isExecution = executionOperations.some(op => operation.includes(op));
        
        if (isExecution) {
            return this.getExecutionUrl();
        } else {
            return this.getApiUrl();
        }
    },
    
    // VNC Configuration
    getVNCUrl: function() {
        // If running locally, use local VNC
        if (this.isLocal) {
            return 'vnc://localhost:5901';
        }
        // If live, use Cloudflare tunnel URL (this is your tunnel for port 6086)
        // The tunnel is exposing the noVNC web interface
        return 'https://luggage-detected-remarks-warriors.trycloudflare.com';
    },
    
    // Check if should open VNC in browser
    shouldOpenVNCInBrowser: function() {
        // On live site, always open in browser (using noVNC web client)
        return !this.isLocal;
    }
};

// Make it globally available
window.VIAConfig = Config;