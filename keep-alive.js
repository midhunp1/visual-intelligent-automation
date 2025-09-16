const https = require('https');

// Render service URL
const SERVICE_URL = 'https://via-platform.onrender.com/api/health';

// Function to ping the service
function pingService() {
    https.get(SERVICE_URL, (res) => {
        console.log(`[${new Date().toISOString()}] Ping status: ${res.statusCode}`);
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log(`Response: ${data}`);
        });
    }).on('error', (err) => {
        console.error(`[${new Date().toISOString()}] Ping failed:`, err.message);
    });
}

// Ping every 30 seconds
console.log('🏃 Keep-alive service started');
console.log(`📍 Pinging ${SERVICE_URL} every 30 seconds`);

// Initial ping
pingService();

// Set interval for 30 seconds
setInterval(pingService, 30000);

// Keep process running
process.on('SIGINT', () => {
    console.log('\n👋 Keep-alive service stopped');
    process.exit(0);
});