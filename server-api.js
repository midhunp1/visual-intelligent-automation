// Lightweight API-only server for Render deployment
// This doesn't include Playwright, email, or file operations

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8288;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory storage for API-only mode
const scripts = new Map();
const suites = new Map();
const templates = new Map();
const schedules = [];

// Mock user for authentication
const users = {
    admin: {
        id: '1',
        username: 'admin',
        name: 'Admin User',
        email: 'admin@via-platform.com',
        teamName: 'VIA Team',
        role: 'admin'
    }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        mode: 'api-only',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'VIA Platform API (Render)'
    });
});

// Authentication routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    // Simple mock authentication
    if (username && password) {
        res.json({ 
            success: true, 
            user: users.admin,
            token: 'mock-token-' + Date.now()
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Invalid credentials' 
        });
    }
});

app.get('/api/auth/verify', (req, res) => {
    res.json({ success: true, user: users.admin });
});

app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true });
});

app.get('/api/auth/profile', (req, res) => {
    res.json({ success: true, user: users.admin });
});

app.put('/api/auth/profile', (req, res) => {
    const { name, email, teamName } = req.body;
    
    if (name) users.admin.name = name;
    if (email) users.admin.email = email;
    if (teamName) users.admin.teamName = teamName;
    
    res.json({ success: true, user: users.admin });
});

// Scripts API
app.get('/api/scripts', (req, res) => {
    const scriptsList = Array.from(scripts.values());
    res.json(scriptsList);
});

app.post('/api/scripts', (req, res) => {
    const script = {
        id: 'script-' + Date.now(),
        ...req.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    scripts.set(script.id, script);
    res.json(script);
});

app.put('/api/scripts/:id', (req, res) => {
    const { id } = req.params;
    const script = scripts.get(id);
    if (script) {
        const updated = {
            ...script,
            ...req.body,
            id,
            updatedAt: new Date().toISOString()
        };
        scripts.set(id, updated);
        res.json(updated);
    } else {
        res.status(404).json({ error: 'Script not found' });
    }
});

app.delete('/api/scripts/:id', (req, res) => {
    const { id } = req.params;
    if (scripts.delete(id)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Script not found' });
    }
});

// Suites API
app.get('/api/suites', (req, res) => {
    const suitesList = Array.from(suites.values());
    res.json(suitesList);
});

app.post('/api/suites', (req, res) => {
    const suite = {
        id: 'suite-' + Date.now(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    suites.set(suite.id, suite);
    res.json(suite);
});

app.put('/api/suites/:id', (req, res) => {
    const { id } = req.params;
    const suite = suites.get(id);
    if (suite) {
        const updated = {
            ...suite,
            ...req.body,
            id
        };
        suites.set(id, updated);
        res.json(updated);
    } else {
        res.status(404).json({ error: 'Suite not found' });
    }
});

app.delete('/api/suites/:id', (req, res) => {
    const { id } = req.params;
    if (suites.delete(id)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Suite not found' });
    }
});

// Templates API
app.get('/api/templates', (req, res) => {
    const templatesList = Array.from(templates.values());
    res.json(templatesList);
});

app.post('/api/templates', (req, res) => {
    const template = {
        id: 'template-' + Date.now(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    templates.set(template.id, template);
    res.json(template);
});

// Schedules API
app.get('/api/schedules', (req, res) => {
    res.json(schedules);
});

app.post('/api/schedules', (req, res) => {
    const schedule = {
        id: 'schedule-' + Date.now(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    schedules.push(schedule);
    res.json(schedule);
});

app.delete('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    const index = schedules.findIndex(s => s.id === id);
    if (index !== -1) {
        schedules.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Schedule not found' });
    }
});

// Test execution endpoints (returns mock data in API-only mode)
app.post('/api/test-runs/execute', (req, res) => {
    res.json({
        success: false,
        message: 'Test execution not available in API-only mode. Please run tests locally.',
        mode: 'api-only'
    });
});

app.post('/api/codegen/start', (req, res) => {
    res.json({
        success: false,
        message: 'Recording not available in API-only mode. Please use local instance.',
        mode: 'api-only'
    });
});

// Alert settings (mock storage)
let alertSettings = {
    enabled: false,
    recipients: [],
    conditions: {
        onFailure: true,
        onSuccess: false,
        onPartialSuccess: true
    },
    email: {
        smtp: {
            server: '',
            port: 587,
            secure: false
        },
        sender: '',
        password: ''
    }
};

app.get('/api/alerts/settings', (req, res) => {
    res.json(alertSettings);
});

app.post('/api/alerts/settings', (req, res) => {
    alertSettings = { ...alertSettings, ...req.body };
    res.json({ success: true, settings: alertSettings });
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    // Send mock status updates
    socket.emit('status', { 
        message: 'Connected to API-only server',
        mode: 'api-only'
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 VIA Platform API Server (API-only mode) running at http://localhost:${PORT}`);
    console.log(`📝 This is a lightweight API server without Playwright or test execution capabilities`);
    console.log(`🔧 For full functionality, run the local Docker container`);
});