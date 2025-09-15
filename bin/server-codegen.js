const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 8284;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active browser sessions
const browserSessions = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints
app.post('/api/start-session', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting browser session for: ${url}`);
        
        // Set DISPLAY environment variable for VNC
        process.env.DISPLAY = ':99';
        
        // Create a temporary script file for recording
        const scriptPath = path.join(__dirname, 'recordings', `${sessionId}.js`);
        
        // Launch Playwright codegen - the official recorder
        const codegenProcess = spawn('npx', [
            'playwright',
            'codegen',
            '--target', 'javascript',
            '-o', scriptPath,
            url
        ], {
            env: { ...process.env, DISPLAY: ':99' }
        });
        
        // Store session
        browserSessions.set(sessionId, {
            codegenProcess,
            scriptPath,
            url,
            recordedSteps: [],
            isRecording: true
        });
        
        // Monitor codegen output
        codegenProcess.stdout.on('data', (data) => {
            console.log(`Codegen: ${data}`);
            
            // Parse and emit steps in real-time if possible
            const stepMatch = data.toString().match(/page\.(click|fill|type|goto)\(['"]([^'"]+)['"]/);
            if (stepMatch) {
                const step = {
                    type: stepMatch[1],
                    selector: stepMatch[2],
                    timestamp: Date.now()
                };
                
                browserSessions.get(sessionId).recordedSteps.push(step);
                
                io.emit('step-recorded', {
                    sessionId,
                    step
                });
            }
        });
        
        codegenProcess.stderr.on('data', (data) => {
            console.error(`Codegen error: ${data}`);
        });
        
        codegenProcess.on('close', async (code) => {
            console.log(`Codegen process exited with code ${code}`);
            
            // Read the generated script
            try {
                const script = await fs.readFile(scriptPath, 'utf8');
                const session = browserSessions.get(sessionId);
                if (session) {
                    session.generatedScript = script;
                    session.isRecording = false;
                }
            } catch (error) {
                console.error('Error reading generated script:', error);
            }
        });
        
        res.json({ 
            success: true, 
            sessionId,
            message: 'Playwright Recorder started. Interact with the browser to record actions.'
        });
        
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Alternative: Use programmatic recording with context tracing
app.post('/api/start-session-trace', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting traced browser session for: ${url}`);
        
        // Set DISPLAY environment variable for VNC
        process.env.DISPLAY = ':99';
        
        const browser = await chromium.launch({ 
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--start-maximized'
            ]
        });
        
        const context = await browser.newContext({
            viewport: { width: 1200, height: 800 },
            // Enable video recording
            recordVideo: {
                dir: path.join(__dirname, 'videos'),
                size: { width: 1200, height: 800 }
            }
        });
        
        // Start tracing - this captures ALL browser interactions
        await context.tracing.start({
            screenshots: true,
            snapshots: true,
            sources: true,
            title: `Recording ${sessionId}`
        });
        
        const page = await context.newPage();
        
        // Monitor all requests and responses
        page.on('request', request => {
            if (browserSessions.get(sessionId)?.isRecording) {
                console.log(`📝 Request: ${request.method()} ${request.url()}`);
            }
        });
        
        // Monitor console logs
        page.on('console', msg => {
            if (browserSessions.get(sessionId)?.isRecording) {
                console.log(`Browser console: ${msg.text()}`);
            }
        });
        
        // Store session
        browserSessions.set(sessionId, {
            browser,
            context,
            page,
            isRecording: false,
            recordedSteps: [],
            tracePath: null
        });
        
        // Navigate to URL
        await page.goto(url);
        
        res.json({ 
            success: true, 
            sessionId,
            message: 'Browser session with tracing started successfully'
        });
        
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/api/start-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        session.isRecording = true;
        session.recordedSteps = [];
        
        if (session.page) {
            // Visual indicator
            await session.page.evaluate(() => {
                document.body.style.border = '3px solid #10b981';
            });
        }
        
        console.log(`📹 Recording started for session: ${sessionId}`);
        
        res.json({ 
            success: true, 
            message: 'Recording started successfully' 
        });
        
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/api/stop-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        session.isRecording = false;
        
        // If using codegen, terminate the process
        if (session.codegenProcess) {
            session.codegenProcess.kill();
            
            // Read the generated script
            const script = await fs.readFile(session.scriptPath, 'utf8');
            
            // Parse the script to extract steps
            const steps = parsePlaywrightScript(script);
            session.recordedSteps = steps;
            
            console.log(`⏹️ Codegen stopped. Generated script saved to ${session.scriptPath}`);
            
            res.json({ 
                success: true, 
                steps: steps,
                script: script,
                message: `Recording stopped. ${steps.length} steps recorded.`
            });
        }
        // If using tracing
        else if (session.context) {
            // Remove visual indicator
            await session.page.evaluate(() => {
                document.body.style.border = 'none';
            });
            
            // Stop tracing and save
            const tracePath = path.join(__dirname, 'traces', `trace-${sessionId}.zip`);
            await session.context.tracing.stop({ path: tracePath });
            session.tracePath = tracePath;
            
            console.log(`📁 Trace saved to: ${tracePath}`);
            console.log(`   View with: npx playwright show-trace ${tracePath}`);
            
            res.json({ 
                success: true, 
                tracePath: tracePath,
                message: `Recording stopped. Trace saved.`
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

function parsePlaywrightScript(script) {
    const steps = [];
    const lines = script.split('\n');
    
    for (const line of lines) {
        // Parse clicks
        let match = line.match(/page\.click\(['"]([^'"]+)['"]\)/);
        if (match) {
            steps.push({ type: 'click', selector: match[1] });
            continue;
        }
        
        // Parse fills
        match = line.match(/page\.fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (match) {
            steps.push({ type: 'fill', selector: match[1], value: match[2] });
            continue;
        }
        
        // Parse navigation
        match = line.match(/page\.goto\(['"]([^'"]+)['"]\)/);
        if (match) {
            steps.push({ type: 'navigate', url: match[1] });
            continue;
        }
        
        // Parse type
        match = line.match(/page\.type\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (match) {
            steps.push({ type: 'type', selector: match[1], text: match[2] });
            continue;
        }
    }
    
    return steps;
}

app.post('/api/play-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        // If we have a generated script, execute it
        if (session.generatedScript) {
            console.log(`▶️ Executing generated Playwright script`);
            
            // Create a new page for playback
            const browser = await chromium.launch({ 
                headless: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const context = await browser.newContext();
            const page = await context.newPage();
            
            // Execute the script steps
            const steps = parsePlaywrightScript(session.generatedScript);
            
            for (const step of steps) {
                switch (step.type) {
                    case 'click':
                        await page.click(step.selector);
                        console.log(`✓ Clicked: ${step.selector}`);
                        break;
                    case 'fill':
                        await page.fill(step.selector, step.value);
                        console.log(`✓ Filled: ${step.selector}`);
                        break;
                    case 'type':
                        await page.type(step.selector, step.text);
                        console.log(`✓ Typed: ${step.text}`);
                        break;
                    case 'navigate':
                        await page.goto(step.url);
                        console.log(`✓ Navigated to: ${step.url}`);
                        break;
                }
                await page.waitForTimeout(1000);
            }
            
            // Keep browser open for viewing
            // await browser.close();
            
            res.json({ 
                success: true, 
                message: 'Playback completed successfully' 
            });
        } else {
            res.status(400).json({ 
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

app.post('/api/close-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        if (session.codegenProcess) {
            session.codegenProcess.kill();
        }
        if (session.context) {
            await session.context.close();
        }
        if (session.browser) {
            await session.browser.close();
        }
        
        browserSessions.delete(sessionId);
        
        console.log(`🔒 Session closed: ${sessionId}`);
        
        res.json({ 
            success: true, 
            message: 'Session closed successfully' 
        });
        
    } catch (error) {
        console.error('Error closing session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// View trace endpoint
app.get('/api/view-trace/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const session = browserSessions.get(sessionId);
    
    if (!session || !session.tracePath) {
        return res.status(404).json({ success: false, error: 'Trace not found' });
    }
    
    // Launch trace viewer
    const viewerProcess = spawn('npx', ['playwright', 'show-trace', session.tracePath]);
    
    viewerProcess.on('error', (error) => {
        console.error('Error launching trace viewer:', error);
        res.status(500).json({ success: false, error: error.message });
    });
    
    res.json({ 
        success: true, 
        message: 'Trace viewer launched. Check your browser.' 
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
            if (session.context) {
                await session.context.close();
            }
            if (session.browser) {
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
    const dirs = ['recordings', 'traces', 'videos', 'screenshots'];
    for (const dir of dirs) {
        try {
            await fs.mkdir(path.join(__dirname, dir), { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }
}

// Start server
ensureDirectories().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Visual Test Automation Platform running at http://localhost:${PORT}`);
        console.log(`📍 Using Playwright's official recording methods:`);
        console.log(`   - Codegen: Playwright's built-in recorder`);
        console.log(`   - Tracing: Captures all browser interactions`);
        console.log(`✅ Most reliable method for VNC recording!`);
    });
});

module.exports = { app, server, io };