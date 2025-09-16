const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const AuthManager = require('./auth-manager');
const EmailService = require('./email-service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 8288;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active browser sessions
const browserSessions = new Map();

// Initialize auth manager
const authManager = new AuthManager();

// Initialize email service
const emailService = new EmailService();

// Simple User Authentication System
const users = {
    'admin': {
        username: 'admin',
        password: 'admin123',
        name: 'Administrator', 
        email: 'admin@via-automation.com',
        teamName: 'VIA Team'
    }
};

console.log('🔐 Simple auth initialized: admin/admin123');

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Simple Authentication Routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    
    const user = users[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    console.log(`🔐 User logged in: ${username}`);
    
    res.json({
        success: true,
        token: 'simple-token-' + username,
        user: {
            username: user.username,
            name: user.name,
            email: user.email,
            teamName: user.teamName
        }
    });
});

// Health check endpoint for keep-alive
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'VIA Platform API'
    });
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
    
    console.log('🔐 Profile updated');
    res.json({ success: true, user: users.admin });
});

// Authentication State Management Routes

// List all saved auth states
app.get('/api/auth-states', async (req, res) => {
    const result = await authManager.listAuthStates();
    res.json(result);
});

// Save current auth state from a session
app.post('/api/auth-states/save', async (req, res) => {
    const { sessionId, name = 'default' } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session || !session.context) {
        return res.status(404).json({ 
            success: false, 
            error: 'No active browser session found' 
        });
    }
    
    try {
        const result = await authManager.saveAuthState(session.context, name);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Delete an auth state
app.delete('/api/auth-states/:name', async (req, res) => {
    const { name } = req.params;
    const result = await authManager.deleteAuthState(name);
    res.json(result);
});

// Check if auth state exists
app.get('/api/auth-states/:name/exists', async (req, res) => {
    const { name } = req.params;
    const exists = await authManager.authStateExists(name);
    res.json({ exists });
});

// Start browser session and use Playwright Codegen
app.post('/api/start-session', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting browser session for: ${url}`);
        
        // Store session info - NO browser launch here
        const session = {
            url,
            isRecording: false,
            recordedSteps: [],
            codegenProcess: null,
            scriptPath: path.join(__dirname, 'recordings', `test-${sessionId}.js`)
        };
        
        browserSessions.set(sessionId, session);
        
        res.json({ 
            success: true, 
            sessionId,
            message: 'Session initialized. Click "Start Recording" to open browser with Playwright Inspector.'
        });
        
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Start recording using Playwright Codegen
app.post('/api/start-recording', async (req, res) => {
    const { sessionId, recordingMode = 'new-browser', currentUrl, useAuthState, authStateName = 'default' } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        // Kill any existing codegen process
        if (session.codegenProcess) {
            session.codegenProcess.kill();
        }
        
        session.isRecording = true;
        session.recordedSteps = [];
        
        // Ensure recordings and templates directories exist
        await fs.mkdir(path.join(__dirname, 'recordings'), { recursive: true });
        await fs.mkdir(path.join(__dirname, 'templates'), { recursive: true });
        
        // Determine which URL to use based on recording mode
        const targetUrl = recordingMode === 'current-state' && currentUrl ? currentUrl : session.url;
        
        console.log(`📹 Starting Playwright Codegen (${recordingMode} mode) for: ${targetUrl}`);
        console.log(`📝 Script will be saved to: ${session.scriptPath}`);
        
        // Launch Playwright Codegen - the OFFICIAL recorder
        const codegenArgs = [
            'playwright',
            'codegen',
            '--target', 'javascript',
            '-o', session.scriptPath,
            '--browser-arg=--start-maximized',
            '--browser-arg=--start-fullscreen',
            '--browser-arg=--window-size=1920,1080',
            '--browser-arg=--window-position=0,0',
            '--viewport-size=1920,1080'
        ];
        
        // Add auth state if requested
        if (useAuthState && await authManager.authStateExists(authStateName)) {
            const authPath = path.join(__dirname, 'auth-states', `${authStateName}.json`);
            codegenArgs.push('--load-storage', authPath);
            codegenArgs.push('--save-storage', authPath);
            console.log(`🔐 Using auth state: ${authStateName}`);
        }
        
        // Add URL last
        codegenArgs.push(targetUrl);
        
        // Always run directly since server is now inside Docker container
        console.log(`📦 Running Playwright Codegen...`);
        session.codegenProcess = spawn('npx', codegenArgs, {
            env: { ...process.env, DISPLAY: ':0' }  // Use display :0 for Xvfb
        });
        
        // Monitor codegen output
        session.codegenProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Codegen Output]: ${output}`);
            
            // Parse and emit real-time steps
            const lines = output.split('\n');
            for (const line of lines) {
                let stepData = null;
                
                // Parse different Playwright actions with better detail
                if (line.includes('page.goto')) {
                    const urlMatch = line.match(/page\.goto\(['"](.+?)['"]\)/);
                    if (urlMatch) {
                        stepData = {
                            type: 'navigate',
                            action: 'Navigate',
                            url: urlMatch[1],
                            selector: '',
                            value: urlMatch[1]
                        };
                    }
                } else if (line.includes('page.click')) {
                    const selectorMatch = line.match(/page\.click\(['"](.+?)['"]\)/);
                    if (selectorMatch) {
                        stepData = {
                            type: 'click',
                            action: 'Click',
                            selector: selectorMatch[1],
                            value: ''
                        };
                    }
                } else if (line.includes('page.fill') || line.includes('page.type')) {
                    const fillMatch = line.match(/page\.(fill|type)\(['"](.+?)['"],\s*['"](.+?)['"]\)/);
                    if (fillMatch) {
                        stepData = {
                            type: 'input',
                            action: 'Type',
                            selector: fillMatch[2],
                            value: fillMatch[3]
                        };
                    }
                } else if (line.includes('page.press')) {
                    const pressMatch = line.match(/page\.press\(['"](.+?)['"],\s*['"](.+?)['"]\)/);
                    if (pressMatch) {
                        stepData = {
                            type: 'keypress',
                            action: 'Press Key',
                            selector: pressMatch[1],
                            value: pressMatch[2]
                        };
                    }
                }
                
                if (stepData) {
                    const step = {
                        ...stepData,
                        code: line.trim(),
                        timestamp: Date.now(),
                        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    };
                    
                    session.recordedSteps.push(step);
                    
                    // Emit real-time step to frontend
                    io.emit('step-recorded', {
                        sessionId,
                        step,
                        totalSteps: session.recordedSteps.length
                    });
                    
                    console.log(`📝 Real-time step: ${step.action} on ${step.selector || step.url}`);
                }
            }
        });
        
        session.codegenProcess.stderr.on('data', (data) => {
            console.error(`[Codegen Error]: ${data}`);
        });
        
        session.codegenProcess.on('close', async (code) => {
            console.log(`[Codegen] Process exited with code ${code}`);
            session.isRecording = false;
            
            // Read the generated script
            try {
                const script = await fs.readFile(session.scriptPath, 'utf8');
                session.generatedScript = script;
                
                // Parse steps from script
                const steps = parseScriptToSteps(script);
                session.recordedSteps = steps;
                
                console.log(`✅ Codegen completed. ${steps.length} steps recorded.`);
                
                io.emit('recording-complete', {
                    sessionId,
                    steps: steps,
                    script: script
                });
                
            } catch (error) {
                console.error('Error reading generated script:', error);
            }
        });
        
        res.json({ 
            success: true, 
            message: 'Recording started! Playwright Inspector opened. Interact with the page - all actions will be recorded.'
        });
        
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Alternative: Manual browser with programmatic recording
app.post('/api/start-manual-browser', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting manual browser for: ${url}`);
        
        // Set DISPLAY for VNC
        if (process.env.DISPLAY) {
            console.log(`Using DISPLAY=${process.env.DISPLAY}`);
        }
        
        const browser = await chromium.launch({ 
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
        });
        
        const context = await browser.newContext({
            viewport: { width: 1200, height: 800 }
        });
        
        const page = await context.newPage();
        
        // Enable console logging
        page.on('console', msg => console.log('[Browser Console]:', msg.text()));
        
        // Navigate
        await page.goto(url);
        
        // Inject recording script
        await page.addInitScript(() => {
            window.__recordedActions = [];
            
            // Capture all clicks
            document.addEventListener('click', (e) => {
                const target = e.target;
                const selector = target.tagName.toLowerCase() + 
                    (target.id ? `#${target.id}` : '') +
                    (target.className ? `.${target.className.split(' ')[0]}` : '');
                
                const action = {
                    type: 'click',
                    selector: selector,
                    text: target.textContent?.substring(0, 30),
                    timestamp: Date.now()
                };
                
                window.__recordedActions.push(action);
                console.log('Recorded:', action);
                
                // Send to server
                fetch('/api/record-browser-action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: '${sessionId}', action })
                }).catch(err => console.error('Failed to send action:', err));
            }, true);
            
            // Capture input changes
            document.addEventListener('input', (e) => {
                const target = e.target;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                    const selector = target.tagName.toLowerCase() + 
                        (target.id ? `#${target.id}` : '') +
                        (target.name ? `[name="${target.name}"]` : '');
                    
                    const action = {
                        type: 'fill',
                        selector: selector,
                        value: target.value,
                        timestamp: Date.now()
                    };
                    
                    window.__recordedActions.push(action);
                    console.log('Recorded:', action);
                    
                    fetch('/api/record-browser-action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId: '${sessionId}', action })
                    }).catch(err => console.error('Failed to send action:', err));
                }
            }, true);
        });
        
        // Store session
        browserSessions.set(sessionId, {
            browser,
            context,
            page,
            url,
            isRecording: true,
            recordedSteps: []
        });
        
        res.json({ 
            success: true, 
            sessionId,
            message: 'Browser started with injected recording. Interact to record.'
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Record action from browser
app.post('/api/record-browser-action', async (req, res) => {
    const { sessionId, action } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (session) {
        session.recordedSteps.push(action);
        
        io.emit('step-recorded', {
            sessionId,
            step: action,
            totalSteps: session.recordedSteps.length
        });
        
        console.log(`📝 Browser action recorded: ${action.type} on ${action.selector}`);
    }
    
    res.json({ success: true });
});

// Stop recording
app.post('/api/stop-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        session.isRecording = false;
        
        // If using codegen, gracefully stop it
        if (session.codegenProcess) {
            // Send SIGINT to gracefully stop Playwright Codegen (like pressing Ctrl+C)
            session.codegenProcess.kill('SIGINT');
            
            // Wait for the process to save the file (up to 5 seconds)
            let attempts = 0;
            let script = '';
            let steps = [];
            
            while (attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                
                try {
                    // Check if file exists and read it
                    await fs.access(session.scriptPath);
                    script = await fs.readFile(session.scriptPath, 'utf8');
                    
                    // Parse the script if it has content
                    if (script && script.length > 50) {
                        steps = parseScriptToSteps(script);
                        console.log(`✅ Script saved with ${steps.length} steps`);
                        console.log('Script content:', script.substring(0, 500));
                        break;
                    }
                } catch (error) {
                    console.log(`Attempt ${attempts + 1}: Waiting for script file...`);
                }
                
                attempts++;
            }
            
            console.log(`⏹️ Recording stopped. ${steps.length} steps recorded.`);
            
            // Save script to templates folder with meaningful name
            if (script && script.length > 50) {
                // Handle undefined or empty URL
                let urlPart = 'test';
                if (session.url && session.url !== 'undefined') {
                    urlPart = session.url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
                }
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const templateName = `${urlPart}_${timestamp}.js`;
                const templatePath = path.join(__dirname, 'templates', templateName);
                
                // Generate a default display name
                let displayName = 'Untitled Test';
                if (session.url && session.url !== 'undefined') {
                    try {
                        displayName = new URL(session.url).hostname.replace('www.', '') + ' Test';
                    } catch (error) {
                        displayName = 'Untitled Test';
                    }
                }
                
                try {
                    const templateContent = `// Template: ${session.url || 'No URL'}\n// Generated: ${new Date().toISOString()}\n// Steps: ${steps.length}\n// DisplayName: ${displayName}\n\n${script}`;
                    await fs.writeFile(templatePath, templateContent, 'utf8');
                    console.log(`💾 Template saved: ${templateName}`);
                } catch (error) {
                    console.error('Error saving template:', error);
                }
            }
            
            res.json({ 
                success: true, 
                steps: steps,
                script: script,
                message: `Recording stopped. ${steps.length} steps recorded and saved as template.`
            });
        }
        // If using manual browser
        else if (session.page) {
            // Get recorded actions from page
            const actions = await session.page.evaluate(() => window.__recordedActions || []);
            session.recordedSteps = actions;
            
            // Generate script
            const script = generateScriptFromActions(actions);
            
            res.json({ 
                success: true, 
                steps: actions,
                script: script,
                message: `Recording stopped. ${actions.length} steps recorded.`
            });
        }
        else {
            res.json({ 
                success: true, 
                steps: session.recordedSteps,
                message: `Recording stopped. ${session.recordedSteps.length} steps recorded.`
            });
        }
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Parse Playwright script to extract steps
function parseScriptToSteps(script) {
    const steps = [];
    const lines = script.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Parse different action types
        if (trimmed.startsWith('await page.goto(')) {
            const urlMatch = trimmed.match(/page\.goto\(['"]([^'"]+)['"]\)/);
            if (urlMatch) {
                steps.push({
                    type: 'navigate',
                    url: urlMatch[1],
                    code: trimmed
                });
            }
        }
        else if (trimmed.startsWith('await page.click(')) {
            const selectorMatch = trimmed.match(/page\.click\(['"]([^'"]+)['"]\)/);
            if (selectorMatch) {
                const clickStep = {
                    type: 'click',
                    selector: selectorMatch[1],
                    code: trimmed
                };
                
                steps.push(clickStep);
                
                // Check if this click might cause navigation
                const selector = selectorMatch[1].toLowerCase();
                const isLikelyNavigation = 
                    selector.includes('link') || 
                    selector.includes('button') ||
                    selector.includes('submit') ||
                    selector.includes('menu') ||
                    selector.includes('nav') ||
                    trimmed.includes('text=') ||
                    trimmed.includes('role=button') ||
                    trimmed.includes('role=link');
                
                if (isLikelyNavigation) {
                    // Add a wait for navigation step after potential navigation clicks
                    steps.push({
                        type: 'wait_navigation',
                        code: 'await page.waitForLoadState("networkidle");',
                        description: 'Wait for page navigation to complete'
                    });
                }
            }
        }
        else if (trimmed.startsWith('await page.fill(')) {
            const match = trimmed.match(/page\.fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
            if (match) {
                steps.push({
                    type: 'fill',
                    selector: match[1],
                    value: match[2],
                    code: trimmed
                });
            }
        }
        else if (trimmed.startsWith('await page.type(')) {
            const match = trimmed.match(/page\.type\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
            if (match) {
                steps.push({
                    type: 'type',
                    selector: match[1],
                    text: match[2],
                    code: trimmed
                });
            }
        }
        else if (trimmed.startsWith('await page.locator(')) {
            // Handle locator-based actions
            const match = trimmed.match(/page\.locator\(['"]([^'"]+)['"]\)\.(\w+)\(/);
            if (match) {
                steps.push({
                    type: match[2], // click, fill, etc.
                    selector: match[1],
                    code: trimmed
                });
            }
        }
    }
    
    return steps;
}

// Generate script from recorded actions
function generateScriptFromActions(actions) {
    let script = `const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--start-maximized',
            '--start-fullscreen', 
            '--window-size=1920,1080',
            '--window-position=0,0',
            '--no-sandbox'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
`;
    
    for (const action of actions) {
        switch (action.type) {
            case 'navigate':
                script += `    await page.goto('${action.url}');\n`;
                break;
            case 'click':
                script += `    await page.click('${action.selector}');\n`;
                break;
            case 'fill':
                script += `    await page.fill('${action.selector}', '${action.value}');\n`;
                break;
            case 'type':
                script += `    await page.type('${action.selector}', '${action.text}');\n`;
                break;
        }
        script += `    await page.waitForTimeout(1000);\n\n`;
    }
    
    script += `    // await browser.close();
})();`;
    
    return script;
}

// Play recording
app.post('/api/play-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        // Execute the generated script
        if (session.generatedScript || session.scriptPath) {
            console.log(`▶️ Playing recorded test...`);
            
            // Option 1: Run the script file directly with DISPLAY
            if (session.scriptPath) {
                const playProcess = spawn('node', [session.scriptPath], {
                    env: { ...process.env, DISPLAY: ':0' }
                });
                
                playProcess.stdout.on('data', (data) => {
                    console.log(`[Playback]: ${data}`);
                });
                
                playProcess.stderr.on('data', (data) => {
                    console.error(`[Playback Error]: ${data}`);
                });
                
                playProcess.on('close', (code) => {
                    console.log(`[Playback] Completed with code ${code}`);
                });
                
                res.json({ 
                    success: true, 
                    message: 'Playback started in new browser window' 
                });
            }
            else {
                res.json({ 
                    success: false, 
                    error: 'No script available for playback' 
                });
            }
        }
        else {
            res.json({ 
                success: false, 
                error: 'No recording available to play' 
            });
        }
        
    } catch (error) {
        console.error('Error during playback:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get recording status
app.get('/api/recording-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
        success: true,
        isRecording: session.isRecording,
        stepsCount: session.recordedSteps.length,
        steps: session.recordedSteps
    });
});

// Socket.IO for real-time communication
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    for (const [sessionId, session] of browserSessions) {
        try {
            if (session.codegenProcess) {
                session.codegenProcess.kill();
            }
            if (session.browser) {
                await session.context.close();
                await session.browser.close();
            }
            console.log(`Closed session: ${sessionId}`);
        } catch (error) {
            console.error(`Error closing session ${sessionId}:`, error);
        }
    }
    
    process.exit(0);
});

// Create necessary directories
async function ensureDirectories() {
    const dirs = ['recordings', 'public'];
    for (const dir of dirs) {
        try {
            await fs.mkdir(path.join(__dirname, dir), { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }
}

// Templates API endpoints

// Get all templates
app.get('/api/templates', async (req, res) => {
    try {
        const templatesDir = path.join(__dirname, 'templates');
        const files = await fs.readdir(templatesDir);
        const templates = [];
        
        for (const file of files) {
            if (file.endsWith('.js')) {
                try {
                    const filePath = path.join(templatesDir, file);
                    const stats = await fs.stat(filePath);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    // Extract metadata from comments
                    const urlMatch = content.match(/\/\/ Template: (.+)/);
                    const generatedMatch = content.match(/\/\/ Generated: (.+)/);
                    const stepsMatch = content.match(/\/\/ Steps: (\d+)/);
                    const displayNameMatch = content.match(/\/\/ DisplayName: (.+)/);
                    
                    // Generate display name if not found
                    let displayName = displayNameMatch ? displayNameMatch[1] : null;
                    if (!displayName) {
                        // Try to generate from filename
                        displayName = file.replace('.js', '').replace(/test_|_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/g, '').replace(/_/g, ' ');
                        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                        if (displayName === 'Undefined' || displayName === '') {
                            displayName = 'Untitled Test';
                        }
                    }
                    
                    templates.push({
                        name: file,
                        displayName: displayName,
                        url: urlMatch ? urlMatch[1] : 'Unknown',
                        created: stats.mtime.toISOString(),
                        generated: generatedMatch ? generatedMatch[1] : stats.mtime.toISOString(),
                        steps: stepsMatch ? parseInt(stepsMatch[1]) : 0,
                        size: formatFileSize(stats.size)
                    });
                } catch (error) {
                    console.error(`Error reading template ${file}:`, error);
                }
            }
        }
        
        // Sort by creation date (newest first)
        templates.sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ success: true, templates });
        
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Execute a template
app.post('/api/templates/execute', async (req, res) => {
    const { templateName } = req.body;
    
    try {
        const templatePath = path.join(__dirname, 'templates', templateName);
        
        // Check if template exists
        await fs.access(templatePath);
        
        // Read template content
        const script = await fs.readFile(templatePath, 'utf8');
        
        // Extract URL from template comments
        const urlMatch = script.match(/\/\/ Template: (.+)/);
        const targetUrl = urlMatch ? urlMatch[1] : 'https://example.com';
        
        console.log(`🎬 Executing template: ${templateName}`);
        
        // Set DISPLAY for VNC
        process.env.DISPLAY = ':0';
        
        console.log(`🖥️ Using VNC display: ${process.env.DISPLAY}`);
        
        // Execute the template script directly using Node.js
        // The template is a complete Playwright test script
        const testProcess = spawn('node', [templatePath], {
            env: { ...process.env, DISPLAY: ':0' }
        });
        
        testProcess.stdout.on('data', (data) => {
            console.log(`[Template Output]: ${data}`);
        });
        
        testProcess.stderr.on('data', (data) => {
            console.error(`[Template Error]: ${data}`);
        });
        
        testProcess.on('close', (code) => {
            console.log(`✅ Template execution completed with code ${code}`);
        });
        
        res.json({ 
            success: true, 
            message: `Template ${templateName} execution started`
        });
        
    } catch (error) {
        console.error('Error executing template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rename a template (update displayName)
app.post('/api/templates/rename', async (req, res) => {
    const { templateName, newDisplayName } = req.body;
    
    try {
        const templatePath = path.join(__dirname, 'templates', templateName);
        
        // Check if template exists
        await fs.access(templatePath);
        
        // Read current content
        const content = await fs.readFile(templatePath, 'utf8');
        
        // Update or add DisplayName comment
        let updatedContent;
        const displayNameMatch = content.match(/\/\/ DisplayName: (.+)/);
        
        if (displayNameMatch) {
            // Replace existing DisplayName
            updatedContent = content.replace(/\/\/ DisplayName: (.+)/, `// DisplayName: ${newDisplayName}`);
        } else {
            // Add DisplayName after other metadata comments
            const lines = content.split('\n');
            let insertIndex = 0;
            
            // Find the last metadata comment line
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('// Template:') || 
                    lines[i].startsWith('// Generated:') || 
                    lines[i].startsWith('// Steps:')) {
                    insertIndex = i + 1;
                }
            }
            
            lines.splice(insertIndex, 0, `// DisplayName: ${newDisplayName}`);
            updatedContent = lines.join('\n');
        }
        
        // Write updated content back to file
        await fs.writeFile(templatePath, updatedContent, 'utf8');
        
        console.log(`✏️ Template renamed: ${templateName} -> "${newDisplayName}"`);
        
        res.json({ 
            success: true, 
            message: `Template renamed to "${newDisplayName}"` 
        });
        
    } catch (error) {
        console.error('Error renaming template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a template
app.delete('/api/templates/:templateName', async (req, res) => {
    const { templateName } = req.params;
    
    try {
        const templatePath = path.join(__dirname, 'templates', templateName);
        await fs.unlink(templatePath);
        
        console.log(`🗑️ Template deleted: ${templateName}`);
        
        res.json({ 
            success: true, 
            message: `Template ${templateName} deleted successfully`
        });
        
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test Runs Management Endpoints
// Store test runs data in memory (in production, use a database)
// Data persistence paths
const DATA_DIR = path.join(__dirname, 'data');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');
const SUITES_FILE = path.join(DATA_DIR, 'suites.json'); 
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Load data from files
async function loadData() {
    try {
        await ensureDataDirectory();
        
        // Load scripts
        let scripts = [];
        try {
            const scriptsData = await fs.readFile(SCRIPTS_FILE, 'utf8');
            scripts = JSON.parse(scriptsData);
        } catch (error) {
            // File doesn't exist yet, start with empty array
        }
        
        // Load suites  
        let suites = [];
        try {
            const suitesData = await fs.readFile(SUITES_FILE, 'utf8');
            suites = JSON.parse(suitesData);
        } catch (error) {
            // File doesn't exist yet, start with empty array
        }
        
        // Load execution history
        let executionHistory = [];
        try {
            const historyData = await fs.readFile(HISTORY_FILE, 'utf8');
            executionHistory = JSON.parse(historyData);
        } catch (error) {
            // File doesn't exist yet, start with empty array
        }
        
        return { scripts, suites, executionHistory };
    } catch (error) {
        console.error('Error loading data:', error);
        return { scripts: [], suites: [], executionHistory: [] };
    }
}

// Save data to files
async function saveData(data) {
    try {
        await ensureDataDirectory();
        
        // Save scripts
        await fs.writeFile(SCRIPTS_FILE, JSON.stringify(data.scripts, null, 2));
        
        // Save suites
        await fs.writeFile(SUITES_FILE, JSON.stringify(data.suites, null, 2));
        
        // Save execution history (keep only last 100)
        const limitedHistory = data.executionHistory.slice(0, 100);
        await fs.writeFile(HISTORY_FILE, JSON.stringify(limitedHistory, null, 2));
        
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Initialize data
let testRunsData = {
    scripts: [],
    suites: [],
    executionHistory: []  // Store execution history with metrics
};

// Load data on startup
(async () => {
    try {
        console.log(`📁 Loading persistent data...`);
        const loadedData = await loadData();
        testRunsData.scripts = loadedData.scripts;
        testRunsData.suites = loadedData.suites;
        testRunsData.executionHistory = loadedData.executionHistory;
        
        console.log(`📁 Loaded persistent data:`);
        console.log(`   Scripts: ${testRunsData.scripts.length}`);
        console.log(`   Suites: ${testRunsData.suites.length}`);
        console.log(`   History: ${testRunsData.executionHistory.length}`);
    } catch (error) {
        console.error(`❌ Error loading persistent data:`, error);
        console.log(`📁 Starting with empty data`);
    }
})();

// Helper to format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

// Parse Playwright script to extract steps
function parsePlaywrightSteps(scriptContent) {
    const steps = [];
    const lines = scriptContent.split('\n');
    
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // Match common Playwright actions
        if (trimmed.includes('await page.goto(')) {
            const urlMatch = trimmed.match(/goto\(['"`](.*?)['"`]/);
            steps.push({
                lineNumber: index + 1,
                action: 'navigate',
                target: urlMatch ? urlMatch[1] : 'URL',
                code: trimmed
            });
        } else if (trimmed.includes('await page.click(') || trimmed.includes('.click(')) {
            const selectorMatch = trimmed.match(/(?:click|getByTestId|getByText|getByRole|locator)\(['"`](.*?)['"`]/);
            steps.push({
                lineNumber: index + 1,
                action: 'click',
                target: selectorMatch ? selectorMatch[1] : 'clickable item',
                code: trimmed
            });
        } else if (trimmed.includes('await page.fill(') || trimmed.includes('.fill(')) {
            const selectorMatch = trimmed.match(/fill\(['"`](.*?)['"`].*?['"`](.*?)['"`]/);
            steps.push({
                lineNumber: index + 1,
                action: 'fill',
                target: selectorMatch ? selectorMatch[1] : 'input',
                value: selectorMatch ? selectorMatch[2] : '',
                code: trimmed
            });
        } else if (trimmed.includes('await page.type(') || trimmed.includes('.type(')) {
            steps.push({
                lineNumber: index + 1,
                action: 'type',
                target: 'input',
                code: trimmed
            });
        } else if (trimmed.includes('await page.waitFor')) {
            steps.push({
                lineNumber: index + 1,
                action: 'wait',
                target: 'condition',
                code: trimmed
            });
        } else if (trimmed.includes('.press(')) {
            const keyMatch = trimmed.match(/press\(['"`](.*?)['"`]/);
            steps.push({
                lineNumber: index + 1,
                action: 'press',
                target: keyMatch ? keyMatch[1] : 'key',
                code: trimmed
            });
        } else if (trimmed.includes('.selectOption(')) {
            steps.push({
                lineNumber: index + 1,
                action: 'select',
                target: 'option',
                code: trimmed
            });
        } else if (trimmed.includes('.check(') || trimmed.includes('.uncheck(')) {
            steps.push({
                lineNumber: index + 1,
                action: trimmed.includes('.check(') ? 'check' : 'uncheck',
                target: 'checkbox',
                code: trimmed
            });
        } else if (trimmed.includes('.dblclick(')) {
            steps.push({
                lineNumber: index + 1,
                action: 'double-click',
                target: 'clickable item',
                code: trimmed
            });
        }
    });
    
    return steps;
}

// Parse automation step to extract meaningful element information
function parseAutomationStep(stepLine) {
    if (!stepLine) return null;
    
    try {
        // Extract action type
        let action = 'action';
        if (stepLine.includes('.click(')) {
            action = 'Click on';
        } else if (stepLine.includes('.fill(')) {
            action = 'Type in';
        } else if (stepLine.includes('.check(')) {
            action = 'Check';
        } else if (stepLine.includes('.uncheck(')) {
            action = 'Uncheck';
        } else if (stepLine.includes('.selectOption(')) {
            action = 'Select option in';
        } else if (stepLine.includes('.hover(')) {
            action = 'Hover over';
        } else if (stepLine.includes('.dblclick(')) {
            action = 'Double-click';
        } else if (stepLine.includes('.press(')) {
            const keyMatch = stepLine.match(/press\(['"`](.*?)['"`]/);
            return keyMatch ? `Press "${keyMatch[1]}" key` : 'Press key';
        }
        
        // Extract element description based on selector type
        let elementDescription = '';
        
        // getByTestId patterns
        if (stepLine.includes('getByTestId')) {
            const testIdMatch = stepLine.match(/getByTestId\(['"`]([^'"`]+)['"`]\)/);
            if (testIdMatch) {
                const testId = testIdMatch[1];
                // Convert TestID to human readable
                let readable = testId
                    .replace(/MYT_/, '')
                    .replace(/_/g, ' ')
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/\b(Header|Screen|View|Button|Icon|Component)\b/g, '')
                    .trim()
                    .toLowerCase();
                
                if (readable === 'menu') {
                    elementDescription = 'hamburger menu';
                } else if (readable === 'header menu') {
                    elementDescription = 'menu button';
                } else {
                    elementDescription = readable || 'button';
                }
            }
        }
        // hasText filter patterns
        else if (stepLine.includes('hasText')) {
            let textMatch = stepLine.match(/hasText:\s*\/\^([^$]+)\$\//);  // Match /^Text$/
            if (!textMatch) {
                textMatch = stepLine.match(/hasText:\s*['"`]([^'"`]+)['"`]/);  // Match "Text"
            }
            if (!textMatch) {
                textMatch = stepLine.match(/hasText:\s*\/([^\/]+)\//);      // Match /Text/
            }
            if (textMatch && textMatch[1]) {
                let cleanText = textMatch[1].replace(/[\^\$]/g, '');
                elementDescription = `"${cleanText}"`;
            }
        }
        // getByRole patterns
        else if (stepLine.includes('getByRole')) {
            const roleMatch = stepLine.match(/getByRole\(['"`]([^'"`]+)['"`](?:,\s*\{\s*name:\s*['"`]([^'"`]+)['"`])?/);
            if (roleMatch) {
                const role = roleMatch[1];
                const name = roleMatch[2];
                if (name) {
                    elementDescription = `"${name}" ${role}`;
                } else {
                    elementDescription = role;
                }
            }
        }
        // getByText patterns
        else if (stepLine.includes('getByText')) {
            const textMatch = stepLine.match(/getByText\(['"`]([^'"`]+)['"`]\)/);
            if (textMatch) {
                elementDescription = `"${textMatch[1]}"`;
            }
        }
        // getByPlaceholder patterns
        else if (stepLine.includes('getByPlaceholder')) {
            const placeholderMatch = stepLine.match(/getByPlaceholder\(['"`]([^'"`]+)['"`]\)/);
            if (placeholderMatch) {
                elementDescription = `field with placeholder "${placeholderMatch[1]}"`;
            }
        }
        // CSS selector patterns
        else if (stepLine.includes('locator(')) {
            const selectorMatch = stepLine.match(/locator\(['"`]([^'"`]+)['"`]\)/);
            if (selectorMatch) {
                const selector = selectorMatch[1];
                
                // Analyze CSS selector for semantic meaning
                if (selector.includes('category')) {
                    elementDescription = 'category option';
                } else if (selector.includes('menu')) {
                    elementDescription = 'menu item';
                } else if (selector.includes('button')) {
                    elementDescription = 'button';
                } else if (selector.includes('input')) {
                    elementDescription = 'input field';
                } else if (selector.includes('#')) {
                    // ID selector
                    const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
                    if (idMatch) {
                        elementDescription = idMatch[1].replace(/_/g, ' ');
                    }
                } else if (selector.includes('.')) {
                    // Class selector
                    const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
                    if (classMatch) {
                        elementDescription = classMatch[1].replace(/[-_]/g, ' ');
                    }
                } else {
                    elementDescription = 'page item';
                }
            }
        }
        // Fallback - try to extract any visible text from the line
        else {
            const textMatches = stepLine.match(/['"`]([^'"`]{2,})['"`]/g);
            if (textMatches && textMatches.length > 0) {
                // Get the last quoted string which is often the most meaningful
                const lastMatch = textMatches[textMatches.length - 1];
                const cleanMatch = lastMatch.replace(/['"`]/g, '');
                if (cleanMatch && cleanMatch !== 'click' && cleanMatch !== 'fill') {
                    elementDescription = `"${cleanMatch}"`;
                }
            }
        }
        
        // Construct the final action description
        if (elementDescription) {
            return `${action} ${elementDescription}`;
        } else {
            // More specific fallback based on action type
            if (action === 'Click on') {
                return `${action} button or link`;
            } else if (action === 'Type in') {
                return `${action} input field`;
            } else if (action === 'Select option in') {
                return `${action} dropdown`;
            } else {
                return `${action} interface item`;
            }
        }
        
    } catch (error) {
        console.log('Error parsing automation step:', error);
        return null;
    }
}

// Get all scripts and suites
app.get('/api/test-runs/data', (req, res) => {
    res.json({
        success: true,
        data: {
            scripts: testRunsData.scripts,
            suites: testRunsData.suites
        }
    });
});

// Get all suites only (for scheduling dropdown)
app.get('/api/test-runs/suites', (req, res) => {
    res.json({
        success: true,
        data: testRunsData.suites
    });
});

// Get execution history
app.get('/api/test-runs/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const history = testRunsData.executionHistory.slice(offset, offset + limit);
    
    res.json({
        success: true,
        data: {
            history: history,
            total: testRunsData.executionHistory.length,
            hasMore: offset + limit < testRunsData.executionHistory.length
        }
    });
});

// Serve video files for test runs
// Handle both HEAD and GET requests for video
const handleVideoRequest = async (req, res) => {
    try {
        const { executionId } = req.params;
        
        // Find the test run with this execution ID
        const testRun = testRunsData.executionHistory.find(run => run.id === executionId);
        
        if (!testRun || !testRun.videoPath) {
            return res.status(404).json({
                success: false,
                error: 'Video not found for this test run'
            });
        }
        
        let videoPath = testRun.videoPath;
        
        // Check if video file exists
        const videoExists = await fs.access(videoPath).then(() => true).catch(() => false);
        if (!videoExists) {
            // Try to find video in recordings directory
            const videoDirs = await fs.readdir('/app/recordings/videos').catch(() => []);
            for (const dir of videoDirs) {
                if (dir.includes(executionId)) {
                    const files = await fs.readdir(`/app/recordings/videos/${dir}`);
                    const videoFile = files.find(f => f.endsWith('.webm'));
                    if (videoFile) {
                        videoPath = `/app/recordings/videos/${dir}/${videoFile}`;
                        break;
                    }
                }
            }
            
            // Check if we found a video
            const foundVideo = await fs.access(videoPath).then(() => true).catch(() => false);
            if (!foundVideo) {
                return res.status(404).json({
                    success: false,
                    error: 'Video file not found'
                });
            }
        }
        
        // Get file stats
        const stat = await fs.stat(videoPath);
        const fileSize = stat.size;
        
        // For HEAD requests, just send headers
        if (req.method === 'HEAD') {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/webm',
                'Accept-Ranges': 'bytes'
            });
            return res.end();
        }
        
        const range = req.headers.range;
        
        // Support video streaming with range requests
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const readStream = fsSync.createReadStream(videoPath, { start, end });
            
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/webm',
            };
            
            res.writeHead(206, head);
            readStream.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/webm',
                'Accept-Ranges': 'bytes'
            };
            res.writeHead(200, head);
            fsSync.createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        console.error('Error serving video:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve video'
        });
    }
};

app.get('/api/test-runs/video/:executionId', handleVideoRequest);
app.head('/api/test-runs/video/:executionId', handleVideoRequest);

// Add a script to test runs
app.post('/api/test-runs/scripts', async (req, res) => {
    const script = req.body;
    
    // Check if script already exists
    const exists = testRunsData.scripts.some(s => s.templateName === script.templateName);
    if (exists) {
        return res.json({
            success: false,
            error: 'Script already exists in test runs'
        });
    }
    
    testRunsData.scripts.push(script);
    await saveData(testRunsData);
    res.json({
        success: true,
        message: 'Script added to test runs'
    });
});

// Remove a script from test runs
app.delete('/api/test-runs/scripts/:id', async (req, res) => {
    const scriptId = req.params.id;
    testRunsData.scripts = testRunsData.scripts.filter(s => s.id !== scriptId);
    await saveData(testRunsData);
    res.json({
        success: true,
        message: 'Script removed from test runs'
    });
});

// Create a new suite
app.post('/api/test-runs/suites', async (req, res) => {
    const suite = req.body;
    testRunsData.suites.push(suite);
    await saveData(testRunsData);
    console.log(`📦 Suite created: ${suite.name} with ID: ${suite.id}`);
    console.log(`   Scripts in suite: ${suite.scripts.join(', ')}`);
    console.log(`   Total suites now: ${testRunsData.suites.length}`);
    res.json({
        success: true,
        message: 'Suite created successfully',
        suiteId: suite.id
    });
});

// Delete a suite
app.delete('/api/test-runs/suites/:id', async (req, res) => {
    const suiteId = req.params.id;
    testRunsData.suites = testRunsData.suites.filter(s => s.id !== suiteId);
    await saveData(testRunsData);
    res.json({
        success: true,
        message: 'Suite deleted successfully'
    });
});

// Execute a suite
app.post('/api/test-runs/suites/:id/execute', async (req, res) => {
    const suiteId = req.params.id;
    console.log(`🔍 Looking for suite with ID: ${suiteId}`);
    console.log(`   Available suites: ${testRunsData.suites.map(s => s.id).join(', ')}`);
    
    const suite = testRunsData.suites.find(s => s.id === suiteId);
    
    if (!suite) {
        console.log(`❌ Suite not found: ${suiteId}`);
        return res.status(404).json({
            success: false,
            error: 'Suite not found'
        });
    }
    
    const startTime = Date.now();
    const executionRecord = {
        id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'suite',
        name: suite.name,
        suiteId: suiteId,
        startTime: new Date().toISOString(),
        status: 'running',
        scripts: []
    };
    
    try {
        console.log(`🚀 Executing suite: ${suite.name}`);
        
        // Collect all scripts and parse their steps
        const scriptDetails = [];
        for (const scriptId of suite.scripts) {
            const script = testRunsData.scripts.find(s => s.id === scriptId);
            if (script) {
                console.log(`  📝 Analyzing script: ${script.name}`);
                const templatePath = path.join(__dirname, 'templates', script.templateName);
                const scriptContent = require('fs').readFileSync(templatePath, 'utf8');
                const steps = parsePlaywrightSteps(scriptContent);
                
                scriptDetails.push({
                    id: scriptId,
                    name: script.name,
                    path: templatePath,
                    content: scriptContent,
                    steps: steps,
                    totalSteps: steps.length
                });
                
                // Add to execution record
                executionRecord.scripts.push({
                    name: script.name,
                    totalSteps: steps.length,
                    completedSteps: 0,
                    status: 'pending',
                    steps: []
                });
            }
        }
        
        // Create an enhanced combined Playwright script with step tracking
        let combinedStepsCode = '';
        let globalStepCounter = 0;
        
        for (let scriptIndex = 0; scriptIndex < scriptDetails.length; scriptIndex++) {
            const detail = scriptDetails[scriptIndex];
            const content = detail.content;
            
            // Extract core logic
            const match = content.match(/const page = await context\.newPage\(\);?\s*([\s\S]*?)\s*(?:\/\/ -+\s*)?await context\.close\(\);?/);
            let coreCode = '';
            
            if (match && match[1]) {
                coreCode = match[1].trim();
            } else {
                const asyncMatch = content.match(/\(async \(\) => \{([\s\S]*?)\}\)\(\)/);
                if (asyncMatch && asyncMatch[1]) {
                    coreCode = asyncMatch[1]
                        .replace(/const { chromium } = require\('playwright'\);?/g, '')
                        .replace(/const browser = await chromium\.launch[\s\S]*?}\);?/g, '')
                        .replace(/const context = await browser\.newContext[\s\S]*?}\);?/g, '')
                        .replace(/const page = await context\.newPage\(\);?/g, '')
                        .replace(/\/\/ -+/g, '')
                        .replace(/await context\.close\(\);?/g, '')
                        .replace(/await browser\.close\(\);?/g, '')
                        .trim();
                }
            }
            
            // Wrap each script with step tracking
            combinedStepsCode += `
    // Script ${scriptIndex + 1}: ${detail.name}
    console.log('\\n📋 Starting Script: ${detail.name}');
    const script${scriptIndex}Steps = ${detail.steps.length};
    let script${scriptIndex}Completed = 0;
    
    try {
        ${coreCode.split('\n').map((line, lineIndex) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('await ') && (
                trimmed.includes('page.') || 
                trimmed.includes('getByTestId') || 
                trimmed.includes('getByText') ||
                trimmed.includes('locator')
            )) {
                globalStepCounter++;
                const stepDescription = trimmed.substring(0, 50).replace(/'/g, "\\'").replace(/`/g, "\\`");
                return `
        // Step ${globalStepCounter}
        try {
            console.log(\`  Step ${globalStepCounter}: ${stepDescription}...\`);
            ${line}
            script${scriptIndex}Completed++;
            console.log(\`    ✅ Step ${globalStepCounter} completed\`);
        } catch (stepError) {
            console.error(\`    ❌ Step ${globalStepCounter} failed:\`, stepError.message);
            throw new Error(\`Failed at Step ${globalStepCounter} in "${detail.name}": \` + stepError.message);
        }`;
            }
            return line;
        }).join('\n')}
        
        console.log(\`✅ Script "${detail.name}" completed: \` + script${scriptIndex}Completed + '/' + script${scriptIndex}Steps + ' steps');
    } catch (scriptError) {
        console.error(\`❌ Script "${detail.name}" failed at step \` + (script${scriptIndex}Completed + 1) + '/' + script${scriptIndex}Steps);
        console.error('   Error:', scriptError.message);
        throw scriptError;
    }
    `;
        }
        
        const combinedScript = `
const { chromium } = require('playwright');
const fs = require('fs');

// Set DISPLAY for VNC
process.env.DISPLAY = ':0';
console.log('🖥️ DISPLAY environment variable:', process.env.DISPLAY);

(async () => {
    console.log('🚀 Launching browser with headless: false for VNC display...');
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--start-maximized',
            '--start-fullscreen',
            '--window-size=1920,1080',
            '--window-position=0,0',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });
    console.log('✅ Browser launched successfully');
    const videoDir = '/app/recordings/videos/suite_${suiteId}_' + Date.now();
    await fs.promises.mkdir(videoDir, { recursive: true });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: {
            dir: videoDir,
            size: { width: 1920, height: 1080 }
        }
    });
    const page = await context.newPage();
    
    console.log('🚀 Starting suite execution: ${suite.name}');
    console.log('🎥 Recording video to:', videoDir);
    console.log('📊 Total scripts: ${scriptDetails.length}');
    
    const suiteResults = {
        suite: '${suite.name}',
        totalScripts: ${scriptDetails.length},
        completedScripts: 0,
        failedScript: null,
        failedStep: null,
        error: null,
        videoDir: videoDir
    };
    
    try {
        ${combinedStepsCode}
        
        suiteResults.completedScripts = ${scriptDetails.length};
        console.log('\\n🎉 Suite execution completed successfully!');
    } catch (error) {
        console.error('\\n❌ Suite execution failed:', error.message);
        suiteResults.error = error.message;
        
        // Write error details to file for server to read
        fs.writeFileSync('/tmp/suite-error-${Date.now()}.json', JSON.stringify(suiteResults));
    }
    
    // Save video path before closing
    const video = await page.video();
    if (video) {
        const videoPath = await video.path();
        console.log('📹 Video saved at:', videoPath);
        suiteResults.videoPath = videoPath;
    }
    
    await context.close(); // This saves the video
    await browser.close();
    
    // Write results including video path
    fs.writeFileSync('/tmp/suite-results-${suiteId}.json', JSON.stringify(suiteResults));
})();
        `;
        
        // Write the combined script to a temporary file
        const tempScriptPath = path.join(__dirname, 'temp', `suite_${suiteId}_${Date.now()}.js`);
        await fs.mkdir(path.join(__dirname, 'temp'), { recursive: true });
        await fs.writeFile(tempScriptPath, combinedScript);
        
        // Debug: Keep temp file for inspection
        console.log(`  📝 Generated suite script: ${tempScriptPath}`);
        
        // Execute the combined script
        console.log(`  ▶️ Executing combined suite script...`);
        const testProcess = spawn('node', [tempScriptPath], {
            env: { ...process.env, DISPLAY: ':0' }
        });
        
        // Track execution progress
        let currentScriptIndex = 0;
        let failureDetails = null;
        
        testProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Suite Output] ${output}`);
            
            // Parse step completion messages
            if (output.includes('Step') && output.includes('completed')) {
                const stepMatch = output.match(/Step (\d+) completed/);
                if (stepMatch && executionRecord.scripts[currentScriptIndex]) {
                    executionRecord.scripts[currentScriptIndex].completedSteps++;
                }
            }
            
            // Parse script completion
            if (output.includes('Script') && output.includes('completed:')) {
                if (currentScriptIndex < executionRecord.scripts.length) {
                    executionRecord.scripts[currentScriptIndex].status = 'success';
                    currentScriptIndex++;
                }
            }
            
            // Parse script start
            if (output.includes('Starting Script:')) {
                if (currentScriptIndex < executionRecord.scripts.length) {
                    executionRecord.scripts[currentScriptIndex].status = 'running';
                }
            }
        });
        
        testProcess.stderr.on('data', async (data) => {
            const error = data.toString();
            console.error(`[Suite Error] ${error}`);
            
            // Capture failure details by analyzing the actual automation code
            if (error.includes('Failed at Step')) {
                const failMatch = error.match(/Failed at Step (\d+) in (.*?): (.*)/);
                if (failMatch) {
                    const stepNumber = parseInt(failMatch[1]);
                    const scriptName = failMatch[2];
                    const errorMessage = failMatch[3] || '';
                    let attemptedAction = '';
                    let suggestion = '';
                    
                    // Try to read the actual automation code and extract the failing step
                    try {
                        const fs = require('fs').promises;
                        const path = require('path');
                        
                        // Look for the temp suite file that was executed
                        const tempDir = path.join(__dirname, 'temp');
                        const tempFiles = await fs.readdir(tempDir).catch(() => []);
                        const suiteFile = tempFiles.find(f => f.includes('suite_') && f.endsWith('.js'));
                        
                        if (suiteFile) {
                            const suitePath = path.join(tempDir, suiteFile);
                            const suiteContent = await fs.readFile(suitePath, 'utf8');
                            
                            // Split into lines and find the step
                            const lines = suiteContent.split('\n');
                            let stepLine = '';
                            let foundStep = false;
                            
                            for (let i = 0; i < lines.length; i++) {
                                const line = lines[i].trim();
                                if (line.includes(`Step ${stepNumber}:`)) {
                                    // Found the step comment, next line should be the actual code
                                    if (i + 1 < lines.length) {
                                        stepLine = lines[i + 1].trim();
                                        foundStep = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (foundStep && stepLine) {
                                attemptedAction = parseAutomationStep(stepLine);
                            }
                        }
                    } catch (err) {
                        console.log('Could not read automation code:', err.message);
                    }
                    
                    // Use the result from direct code analysis
                    if (!attemptedAction) {
                        // If we couldn't read the code, provide a minimal description
                        attemptedAction = `Step ${stepNumber} in ${scriptName}`;
                        suggestion = 'Could not analyze the automation code. Check if the test file exists and is readable.';
                    } else {
                        // We got specific details from the code
                        suggestion = 'The automation could not find or interact with this specific item. Check if it exists on the page.';
                    }
                    
                    // Create failure details from direct code analysis
                    failureDetails = {
                        step: stepNumber,
                        script: scriptName,
                        attemptedAction: attemptedAction,
                        errorMessage: errorMessage.substring(0, 200),
                        suggestion: suggestion
                    };
                    
                    if (currentScriptIndex < executionRecord.scripts.length) {
                        executionRecord.scripts[currentScriptIndex].status = 'failed';
                        executionRecord.scripts[currentScriptIndex].failedAt = `Step ${stepNumber}`;
                    }
                }
            } else if (error.includes('Error in')) {
                // Also catch generic errors  
                const errorMatch = error.match(/Error in (.*?): (.*)/);
                if (errorMatch) {
                    const scriptName = errorMatch[1];
                    const fullErrorMessage = errorMatch[2] || '';
                    
                    // Find the script by name
                    const scriptIndex = executionRecord.scripts.findIndex(s => s.name === scriptName);
                    if (scriptIndex !== -1) {
                        executionRecord.scripts[scriptIndex].status = 'failed';
                        
                        if (!failureDetails) {
                            // Simple failure details without complex parsing
                            failureDetails = {
                                script: scriptName,
                                attemptedAction: `Failed step in ${scriptName}`,
                                errorMessage: fullErrorMessage.substring(0, 200),
                                suggestion: 'Check if the page is in the expected state and all elements are visible'
                            };
                        }
                    }
                }
            }
        });
        
        // Wait for script to complete
        const exitCode = await new Promise((resolve) => {
            testProcess.on('close', resolve);
        });
        
        // Clean up temp file
        await fs.unlink(tempScriptPath).catch(() => {});
        
        // Try to read video path from results file
        try {
            const resultsPath = `/tmp/suite-results-${suiteId}.json`;
            const resultsData = await fs.readFile(resultsPath, 'utf8');
            const results = JSON.parse(resultsData);
            if (results.videoPath) {
                executionRecord.videoPath = results.videoPath;
                console.log('📹 Video path captured:', results.videoPath);
            }
            // Clean up results file
            await fs.unlink(resultsPath).catch(() => {});
        } catch (error) {
            console.log('Could not read suite results file:', error.message);
        }
        
        // Calculate execution metrics
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        executionRecord.endTime = new Date().toISOString();
        executionRecord.duration = duration;
        executionRecord.durationFormatted = formatDuration(duration);
        
        // Check if any script in the suite failed
        const hasFailedScript = executionRecord.scripts.some(script => 
            script.status === 'failed' || script.status === 'error'
        );
        
        // Suite is only successful if exit code is 0 AND no scripts failed
        executionRecord.status = (exitCode === 0 && !hasFailedScript) ? 'success' : 'failed';
        executionRecord.exitCode = exitCode;
        
        // Add enhanced failure details if suite failed
        if (failureDetails) {
            executionRecord.failureDetails = failureDetails;
            if (failureDetails.step) {
                executionRecord.failedAt = `${failureDetails.script} - Step ${failureDetails.step}`;
            } else {
                executionRecord.failedAt = failureDetails.script;
            }
        }
        
        // Send email alert if suite failed
        if (executionRecord.status === 'failed') {
            try {
                await emailService.sendFailureAlert(executionRecord);
                console.log('📧 Alert email sent for failed suite');
            } catch (error) {
                console.error('Failed to send alert email:', error.message);
            }
        }
        
        // Store in history (keep last 100 executions)
        testRunsData.executionHistory.unshift(executionRecord);
        if (testRunsData.executionHistory.length > 100) {
            testRunsData.executionHistory = testRunsData.executionHistory.slice(0, 100);
        }
        await saveData(testRunsData);
        
        console.log(`  ✅ Suite "${suite.name}" execution completed in ${formatDuration(duration)}`);
        
        res.json({
            success: true,
            message: `Suite "${suite.name}" executed successfully`,
            metrics: {
                duration: duration,
                durationFormatted: formatDuration(duration),
                status: executionRecord.status,
                executionId: executionRecord.id
            }
        });
        
    } catch (error) {
        console.error('Error executing suite:', error);
        
        // Record failure
        const endTime = Date.now();
        executionRecord.endTime = new Date().toISOString();
        executionRecord.duration = endTime - startTime;
        executionRecord.durationFormatted = formatDuration(executionRecord.duration);
        executionRecord.status = 'error';
        executionRecord.error = error.message;
        
        testRunsData.executionHistory.unshift(executionRecord);
        if (testRunsData.executionHistory.length > 100) {
            testRunsData.executionHistory = testRunsData.executionHistory.slice(0, 100);
        }
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Execute a single script
app.post('/api/test-runs/scripts/:id/execute', async (req, res) => {
    const scriptId = req.params.id;
    const script = testRunsData.scripts.find(s => s.id === scriptId);
    
    if (!script) {
        return res.status(404).json({
            success: false,
            error: 'Script not found'
        });
    }
    
    const startTime = Date.now();
    const executionRecord = {
        id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'script',
        name: script.name,
        scriptId: scriptId,
        startTime: new Date().toISOString(),
        status: 'running'
    };
    
    try {
        console.log(`▶️ Executing script: ${script.name}`);
        const templatePath = path.join(__dirname, 'templates', script.templateName);
        
        // Execute the script
        const testProcess = spawn('node', [templatePath], {
            env: { ...process.env, DISPLAY: ':0' }
        });
        
        testProcess.on('close', async (exitCode) => {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            executionRecord.endTime = new Date().toISOString();
            executionRecord.duration = duration;
            executionRecord.durationFormatted = formatDuration(duration);
            executionRecord.status = exitCode === 0 ? 'success' : 'failed';
            executionRecord.exitCode = exitCode;
            
            // Send email alert if script failed
            if (executionRecord.status === 'failed') {
                try {
                    await emailService.sendFailureAlert(executionRecord);
                    console.log('📧 Alert email sent for failed script');
                } catch (error) {
                    console.error('Failed to send alert email:', error.message);
                }
            }
            
            // Store in history
            testRunsData.executionHistory.unshift(executionRecord);
            if (testRunsData.executionHistory.length > 100) {
                testRunsData.executionHistory = testRunsData.executionHistory.slice(0, 100);
            }
            await saveData(testRunsData);
            
            console.log(`✅ Script "${script.name}" completed in ${formatDuration(duration)} with status: ${executionRecord.status}`);
        });
        
        res.json({
            success: true,
            message: `Script "${script.name}" started executing`,
            executionId: executionRecord.id
        });
        
    } catch (error) {
        console.error('Error executing script:', error);
        
        // Record failure
        const endTime = Date.now();
        executionRecord.endTime = new Date().toISOString();
        executionRecord.duration = endTime - startTime;
        executionRecord.durationFormatted = formatDuration(executionRecord.duration);
        executionRecord.status = 'error';
        executionRecord.error = error.message;
        
        testRunsData.executionHistory.unshift(executionRecord);
        if (testRunsData.executionHistory.length > 100) {
            testRunsData.executionHistory = testRunsData.executionHistory.slice(0, 100);
        }
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============= SCHEDULING API ENDPOINTS =============

// In-memory storage for schedules and scheduled history
const schedulesData = {
    schedules: [],
    scheduledHistory: []
};

// Get all schedules
app.get('/api/schedules', (req, res) => {
    res.json({
        success: true,
        data: schedulesData.schedules
    });
});

// Create a new schedule
app.post('/api/schedules', (req, res) => {
    const schedule = req.body;
    schedulesData.schedules.push(schedule);
    
    console.log(`📅 Schedule created: ${schedule.name}`);
    
    res.json({
        success: true,
        message: 'Schedule created successfully',
        data: schedule
    });
});

// Update a schedule
app.put('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    const updatedSchedule = req.body;
    
    const index = schedulesData.schedules.findIndex(s => s.id === id);
    if (index !== -1) {
        schedulesData.schedules[index] = updatedSchedule;
        res.json({
            success: true,
            message: 'Schedule updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Schedule not found'
        });
    }
});

// Delete a schedule
app.delete('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    
    const index = schedulesData.schedules.findIndex(s => s.id === id);
    if (index !== -1) {
        schedulesData.schedules.splice(index, 1);
        console.log(`🗑️ Schedule deleted: ${id}`);
        res.json({
            success: true,
            message: 'Schedule deleted successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Schedule not found'
        });
    }
});

// Get scheduled execution history
app.get('/api/scheduled-history', (req, res) => {
    // Combine scheduled history with regular history, filtering for scheduled runs
    const scheduledRuns = testRunsData.executionHistory
        .filter(h => h.scheduledId)
        .map(h => ({
            ...h,
            trigger: h.scheduledId ? 'scheduled' : 'manual',
            scheduleName: schedulesData.schedules.find(s => s.id === h.scheduledId)?.name || 'Unknown Schedule',
            executedAt: h.startTime
        }));
    
    res.json({
        success: true,
        data: scheduledRuns
    });
});

// Execute scheduled suite (called by scheduler)
app.post('/api/test-runs/suites/:suiteId/execute-scheduled', async (req, res) => {
    const { suiteId } = req.params;
    const { scheduledId } = req.body;
    
    // Find the suite
    const suite = testRunsData.suites.find(s => s.id === suiteId);
    
    if (!suite) {
        return res.status(404).json({
            success: false,
            error: 'Suite not found'
        });
    }
    
    // Mark this as a scheduled execution
    const executionRecord = {
        id: `exec-${Date.now()}`,
        type: 'suite',
        suiteId: suite.id,
        name: suite.name,
        scheduledId: scheduledId, // Mark as scheduled
        trigger: 'scheduled',
        startTime: new Date().toISOString(),
        status: 'running',
        scripts: suite.scripts.map(s => ({
            id: s.id,
            name: s.name,
            status: 'pending',
            completedSteps: 0,
            totalSteps: 0
        }))
    };
    
    // Execute the suite (reuse existing suite execution logic)
    // For now, we'll just call the existing execute endpoint
    req.body.scheduledId = scheduledId;
    
    // Forward to existing suite execute endpoint
    app._router.handle(
        Object.assign({}, req, { 
            url: `/api/test-runs/suites/${suiteId}/execute`,
            method: 'POST'
        }), 
        res
    );
});

// Scheduler service - runs every minute to check schedules
setInterval(() => {
    const now = new Date();
    
    schedulesData.schedules.forEach(async schedule => {
        if (schedule.status !== 'active') return;
        
        const nextRun = new Date(schedule.nextRun);
        if (nextRun <= now) {
            console.log(`⏰ Executing scheduled suite: ${schedule.suiteName}`);
            
            // Execute the suite
            try {
                const response = await fetch(`http://localhost:${PORT}/api/test-runs/suites/${schedule.suiteId}/execute-scheduled`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scheduledId: schedule.id })
                });
                
                if (response.ok) {
                    // Update schedule with new next run time
                    schedule.lastRun = now.toISOString();
                    schedule.runCount = (schedule.runCount || 0) + 1;
                    
                    // Calculate next run based on schedule type
                    if (schedule.type === 'interval') {
                        const next = new Date(now);
                        const value = schedule.interval.value;
                        const unit = schedule.interval.unit;
                        
                        switch (unit) {
                            case 'minutes':
                                next.setMinutes(next.getMinutes() + value);
                                break;
                            case 'hours':
                            case 'hour':
                                next.setHours(next.getHours() + value);
                                break;
                            case 'days':
                            case 'day':
                                next.setDate(next.getDate() + value);
                                break;
                            case 'weeks':
                                next.setDate(next.getDate() + (value * 7));
                                break;
                            case 'months':
                                next.setMonth(next.getMonth() + value);
                                break;
                        }
                        schedule.nextRun = next.toISOString();
                    } else {
                        // For time-based schedules, calculate next occurrence
                        const [hours, minutes] = schedule.time.split(':').map(Number);
                        const next = new Date(now);
                        next.setHours(hours, minutes, 0, 0);
                        
                        // Move to next day if time has passed
                        if (next <= now) {
                            next.setDate(next.getDate() + 1);
                        }
                        
                        // Handle frequency
                        if (schedule.frequency === 'weekly' && schedule.days && schedule.days.length > 0) {
                            while (!schedule.days.includes(next.getDay())) {
                                next.setDate(next.getDate() + 1);
                            }
                        } else if (schedule.frequency === 'weekdays') {
                            while (next.getDay() === 0 || next.getDay() === 6) {
                                next.setDate(next.getDate() + 1);
                            }
                        } else if (schedule.frequency === 'weekends') {
                            while (next.getDay() !== 0 && next.getDay() !== 6) {
                                next.setDate(next.getDate() + 1);
                            }
                        } else if (schedule.frequency === 'monthly') {
                            next.setMonth(next.getMonth() + 1);
                        }
                        
                        schedule.nextRun = next.toISOString();
                    }
                    
                    console.log(`✅ Scheduled execution completed. Next run: ${schedule.nextRun}`);
                }
            } catch (error) {
                console.error(`❌ Failed to execute scheduled suite: ${error.message}`);
            }
        }
    });
}, 60000); // Check every minute

// ==================== ALERT/EMAIL API ENDPOINTS ====================

// Get alert settings
app.get('/api/alerts/settings', async (req, res) => {
    try {
        const settings = await emailService.loadSettings();
        res.json({ success: true, settings });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Save alert settings
app.post('/api/alerts/settings', async (req, res) => {
    try {
        await emailService.saveSettings(req.body);
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving alert settings:', error);
        res.json({ success: false, error: error.message });
    }
});

// Test SMTP connection
app.post('/api/alerts/test', async (req, res) => {
    try {
        // Create a new transporter directly for testing
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: req.body.smtp.server,
            port: req.body.smtp.port,
            secure: req.body.smtp.secure,
            auth: {
                user: req.body.sender,
                pass: req.body.password
            }
        });
        
        // Verify the connection
        await transporter.verify();
        res.json({ success: true, message: 'Connection successful' });
    } catch (error) {
        console.error('Error testing connection:', error);
        res.json({ success: false, error: error.message });
    }
});

// Send test email
app.post('/api/alerts/test-email', async (req, res) => {
    try {
        emailService.settings = req.body;
        emailService.initializeTransporter();
        const result = await emailService.sendTestEmail();
        res.json(result);
    } catch (error) {
        console.error('Error sending test email:', error);
        res.json({ success: false, error: error.message });
    }
});

// Send alert (called internally when tests fail)
app.post('/api/alerts/send', async (req, res) => {
    try {
        const { testData } = req.body;
        const result = await emailService.sendFailureAlert(testData);
        res.json(result);
    } catch (error) {
        console.error('Error sending alert:', error);
        res.json({ success: false, error: error.message });
    }
});

// Get alert history
app.get('/api/alerts/history', async (req, res) => {
    try {
        const history = await emailService.getAlertHistory();
        res.json({ success: true, history });
    } catch (error) {
        console.error('Error fetching alert history:', error);
        res.json({ success: false, error: error.message, history: [] });
    }
});

// Start server
ensureDirectories().then(async () => {
    // Load email settings on startup
    await emailService.loadSettings();
    server.listen(PORT, () => {
        console.log(`🚀 Visual Test Automation Platform (Working Solution) running at http://localhost:${PORT}`);
        console.log(`📍 This version uses:`);
        console.log(`   ✅ Playwright Codegen - Official recorder that captures ALL interactions`);
        console.log(`   ✅ Works with VNC - Codegen captures mouse clicks in VNC`);
        console.log(`   ✅ Alternative: Browser with injected recording script`);
        console.log(`\n⚡ Quick Start:`);
        console.log(`   1. Load a website`);
        console.log(`   2. Click "Start Recording" - a new browser opens`);
        console.log(`   3. Interact with the browser (clicks, typing, etc.)`);
        console.log(`   4. Close the browser window when done`);
        console.log(`   5. Script is automatically saved with all interactions!`);
    });
});

module.exports = { app, server, io };