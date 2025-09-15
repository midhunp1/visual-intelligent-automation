const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { chromium } = require('playwright');
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
        
        // Launch browser with visible UI
        const browser = await chromium.launch({ 
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--start-maximized'
            ]
        });
        
        const context = await browser.newContext({
            viewport: { width: 1200, height: 800 },
            recordVideo: {
                dir: path.join(__dirname, 'recordings'),
                size: { width: 1200, height: 800 }
            }
        });
        
        const page = await context.newPage();
        
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
            message: 'Browser session started successfully'
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
        
        const { context, page } = session;
        
        // Use Playwright's tracing to record all actions
        const tracePath = path.join(__dirname, 'traces', `trace-${sessionId}-${Date.now()}.zip`);
        await context.tracing.start({ 
            screenshots: true, 
            snapshots: true,
            sources: true
        });
        
        session.tracePath = tracePath;
        
        // Visual indicator
        await page.evaluate(() => {
            document.body.style.border = '3px solid #10b981';
        });
        
        // Listen to console logs to track actions
        page.on('console', msg => {
            if (session.isRecording) {
                console.log('Browser console:', msg.text());
            }
        });
        
        // Track page events for real-time tile generation
        const trackAction = (type, data) => {
            if (!session.isRecording) return;
            
            const step = {
                type,
                ...data,
                timestamp: Date.now()
            };
            
            session.recordedSteps.push(step);
            
            // Emit to client for real-time tile display
            io.emit('step-recorded', {
                sessionId,
                step
            });
            
            console.log(`📝 Recorded ${type}:`, data);
        };
        
        // Monitor page interactions using CDP (Chrome DevTools Protocol)
        const client = await context.newCDPSession(page);
        
        // Enable runtime events
        await client.send('Runtime.enable');
        await client.send('DOM.enable');
        await client.send('Page.enable');
        
        // Track mouse clicks
        await client.send('Input.setInterceptDrags', { enabled: false });
        
        client.on('DOM.documentUpdated', async () => {
            console.log('DOM updated');
        });
        
        // Alternative: Use page event listeners
        await page.exposeFunction('recordClick', async (selector, text) => {
            trackAction('click', { selector, text });
        });
        
        await page.exposeFunction('recordInput', async (selector, value) => {
            trackAction('input', { selector, value });
        });
        
        // Inject recording script
        await page.evaluate(() => {
            let lastInputValues = new Map();
            
            // Override addEventListener to capture all events
            const originalAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function(type, listener, options) {
                const wrappedListener = function(event) {
                    // Log the event for recording
                    if (type === 'click' && window.recordClick) {
                        const target = event.target;
                        const selector = getSelector(target);
                        window.recordClick(selector, target.textContent?.trim() || '');
                    }
                    
                    // Call original listener
                    return listener.call(this, event);
                };
                
                return originalAddEventListener.call(this, type, wrappedListener, options);
            };
            
            // Track all clicks
            document.addEventListener('click', (e) => {
                const target = e.target;
                const selector = getSelector(target);
                if (window.recordClick) {
                    window.recordClick(selector, target.textContent?.trim() || '');
                }
            }, true);
            
            // Track all inputs
            document.addEventListener('input', (e) => {
                const target = e.target;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                    const selector = getSelector(target);
                    const currentValue = target.value;
                    const lastValue = lastInputValues.get(selector);
                    
                    if (currentValue !== lastValue && window.recordInput) {
                        lastInputValues.set(selector, currentValue);
                        window.recordInput(selector, currentValue);
                    }
                }
            }, true);
            
            function getSelector(element) {
                if (!element) return '';
                
                if (element.id) {
                    return '#' + element.id;
                }
                
                if (element.className && typeof element.className === 'string') {
                    const classes = element.className.trim().split(/\s+/);
                    if (classes.length > 0) {
                        return '.' + classes.join('.');
                    }
                }
                
                // Build path
                const path = [];
                let current = element;
                
                while (current && current.tagName !== 'HTML') {
                    let selector = current.tagName.toLowerCase();
                    
                    if (current.parentElement) {
                        const siblings = Array.from(current.parentElement.children)
                            .filter(child => child.tagName === current.tagName);
                        
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            selector += ':nth-of-type(' + index + ')';
                        }
                    }
                    
                    path.unshift(selector);
                    current = current.parentElement;
                }
                
                return path.join(' > ');
            }
        });
        
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
        const { page, context } = session;
        
        // Remove visual indicator
        await page.evaluate(() => {
            document.body.style.border = 'none';
        });
        
        // Stop tracing and save
        if (session.tracePath) {
            await context.tracing.stop({ path: session.tracePath });
            console.log(`📁 Trace saved to: ${session.tracePath}`);
        }
        
        // Generate Playwright script from recorded steps
        const script = generatePlaywrightScript(session.recordedSteps);
        session.generatedScript = script;
        
        console.log(`⏹️ Recording stopped. Recorded ${session.recordedSteps.length} steps`);
        
        res.json({ 
            success: true, 
            steps: session.recordedSteps,
            script: script,
            message: `Recording stopped. ${session.recordedSteps.length} steps recorded.`
        });
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

function generatePlaywrightScript(steps) {
    let script = `const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
`;
    
    for (const step of steps) {
        switch (step.type) {
            case 'click':
                script += `    await page.click('${step.selector}');\n`;
                script += `    console.log('Clicked: ${step.text || step.selector}');\n`;
                break;
            case 'input':
                script += `    await page.fill('${step.selector}', '${step.value}');\n`;
                script += `    console.log('Typed: "${step.value}" in ${step.selector}');\n`;
                break;
            case 'navigate':
                script += `    await page.goto('${step.url}');\n`;
                script += `    console.log('Navigated to: ${step.url}');\n`;
                break;
        }
        script += `    await page.waitForTimeout(1000);\n\n`;
    }
    
    script += `    
    // await browser.close();
})();`;
    
    return script;
}

app.post('/api/play-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        const { page, recordedSteps } = session;
        
        if (!recordedSteps || recordedSteps.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No recorded steps to play' 
            });
        }
        
        console.log(`▶️ Playing ${recordedSteps.length} recorded steps`);
        
        // Execute steps
        for (let i = 0; i < recordedSteps.length; i++) {
            const step = recordedSteps[i];
            
            try {
                // Emit step being played for UI update
                io.emit('step-playing', {
                    sessionId,
                    stepIndex: i,
                    step
                });
                
                // Highlight element
                if (step.selector && step.type !== 'navigate') {
                    await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            element.style.outline = '3px solid #f59e0b';
                            element.style.outlineOffset = '2px';
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, step.selector);
                }
                
                await page.waitForTimeout(300);
                
                // Execute action
                switch (step.type) {
                    case 'click':
                        await page.click(step.selector);
                        console.log(`✓ Clicked: ${step.selector}`);
                        break;
                    case 'input':
                        await page.fill(step.selector, '');
                        await page.type(step.selector, step.value, { delay: 50 });
                        console.log(`✓ Typed: "${step.value}" in ${step.selector}`);
                        break;
                    case 'navigate':
                        await page.goto(step.url);
                        console.log(`✓ Navigated to: ${step.url}`);
                        break;
                }
                
                // Remove highlight
                if (step.selector && step.type !== 'navigate') {
                    await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            element.style.outline = '';
                            element.style.outlineOffset = '';
                        }
                    }, step.selector);
                }
                
                await page.waitForTimeout(800);
                
            } catch (stepError) {
                console.error(`Error executing step ${i + 1}:`, stepError);
                // Continue with next step
            }
        }
        
        console.log('✅ Playback completed successfully');
        
        res.json({ 
            success: true, 
            message: 'Playback completed successfully' 
        });
        
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
        await session.context.close();
        await session.browser.close();
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
            await session.context.close();
            await session.browser.close();
            console.log(`Closed session: ${sessionId}`);
        } catch (error) {
            console.error(`Error closing session ${sessionId}:`, error);
        }
    }
    
    process.exit(0);
});

// Create necessary directories
async function ensureDirectories() {
    const dirs = ['recordings', 'traces', 'screenshots'];
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
        console.log(`📍 Ready to record and automate web interactions!`);
    });
});

module.exports = { app, server, io };