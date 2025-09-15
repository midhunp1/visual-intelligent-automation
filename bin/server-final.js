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

// Simple in-memory action tracking (since DOM events don't work with VNC)
// This is a pragmatic workaround for the VNC recording issue
const manualActions = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start browser session
app.post('/api/start-session', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting browser session for: ${url}`);
        
        // Set DISPLAY for VNC
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
            viewport: { width: 1200, height: 800 }
        });
        
        const page = await context.newPage();
        
        // Store session
        browserSessions.set(sessionId, {
            browser,
            context,
            page,
            isRecording: false,
            recordedSteps: []
        });
        
        // Initialize manual actions for this session
        manualActions.set(sessionId, []);
        
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

// Start recording with tracing
app.post('/api/start-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        session.isRecording = true;
        session.recordedSteps = [];
        manualActions.set(sessionId, []);
        
        const { context, page } = session;
        
        // Start Playwright tracing - captures everything
        await context.tracing.start({ 
            screenshots: true, 
            snapshots: true,
            sources: false
        });
        
        // Visual indicator
        await page.evaluate(() => {
            document.body.style.border = '3px solid #10b981';
        });
        
        console.log(`📹 Recording started for session: ${sessionId}`);
        console.log(`⚠️ Note: For VNC interactions, use manual action recording`);
        
        res.json({ 
            success: true, 
            message: 'Recording started. Use manual recording for VNC interactions.' 
        });
        
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Manual action recording endpoint (for VNC interactions)
app.post('/api/record-action', async (req, res) => {
    const { sessionId, type, selector, value, text, url } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session || !session.isRecording) {
        return res.status(400).json({ success: false, error: 'Not recording' });
    }
    
    try {
        const action = {
            type,
            selector,
            value,
            text,
            url,
            timestamp: Date.now()
        };
        
        // Store action
        session.recordedSteps.push(action);
        manualActions.get(sessionId).push(action);
        
        // Emit for real-time tile display
        io.emit('step-recorded', {
            sessionId,
            step: action
        });
        
        console.log(`📝 Recorded ${type}: ${selector || url || value}`);
        
        // Actually perform the action in the browser
        const { page } = session;
        switch (type) {
            case 'click':
                if (selector) await page.click(selector).catch(() => {});
                break;
            case 'fill':
                if (selector && value) await page.fill(selector, value).catch(() => {});
                break;
            case 'type':
                if (selector && text) await page.type(selector, text).catch(() => {});
                break;
            case 'navigate':
                if (url) await page.goto(url).catch(() => {});
                break;
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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
        const { page, context } = session;
        
        // Remove visual indicator
        await page.evaluate(() => {
            document.body.style.border = 'none';
        });
        
        // Stop tracing
        const tracePath = path.join(__dirname, 'traces', `trace-${sessionId}-${Date.now()}.zip`);
        await context.tracing.stop({ path: tracePath });
        
        // Use manual actions if available, otherwise use recorded steps
        const steps = manualActions.get(sessionId) || session.recordedSteps;
        
        // Generate Playwright script
        const script = generatePlaywrightScript(steps);
        
        console.log(`⏹️ Recording stopped. ${steps.length} steps recorded`);
        console.log(`📁 Trace saved to: ${tracePath}`);
        
        res.json({ 
            success: true, 
            steps: steps,
            script: script,
            tracePath: tracePath,
            message: `Recording stopped. ${steps.length} steps recorded.`
        });
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Generate Playwright script from steps
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
                break;
            case 'fill':
                script += `    await page.fill('${step.selector}', '${step.value}');\n`;
                break;
            case 'type':
                script += `    await page.type('${step.selector}', '${step.text}');\n`;
                break;
            case 'navigate':
                script += `    await page.goto('${step.url}');\n`;
                break;
            case 'select':
                script += `    await page.selectOption('${step.selector}', '${step.value}');\n`;
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
        const { page, recordedSteps } = session;
        const steps = manualActions.get(sessionId) || recordedSteps;
        
        if (!steps || steps.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No recorded steps to play' 
            });
        }
        
        console.log(`▶️ Playing ${steps.length} recorded steps`);
        
        // Execute steps
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            // Emit step being played
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
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, step.selector).catch(() => {});
            }
            
            await page.waitForTimeout(500);
            
            // Execute action
            try {
                switch (step.type) {
                    case 'click':
                        await page.click(step.selector);
                        console.log(`✓ Clicked: ${step.selector}`);
                        break;
                    case 'fill':
                        await page.fill(step.selector, step.value);
                        console.log(`✓ Filled: ${step.selector} with "${step.value}"`);
                        break;
                    case 'type':
                        await page.type(step.selector, step.text, { delay: 50 });
                        console.log(`✓ Typed: "${step.text}" in ${step.selector}`);
                        break;
                    case 'navigate':
                        await page.goto(step.url);
                        console.log(`✓ Navigated to: ${step.url}`);
                        break;
                    case 'select':
                        await page.selectOption(step.selector, step.value);
                        console.log(`✓ Selected: ${step.value} in ${step.selector}`);
                        break;
                }
            } catch (stepError) {
                console.error(`Error executing step ${i + 1}:`, stepError);
            }
            
            // Remove highlight
            if (step.selector && step.type !== 'navigate') {
                await page.evaluate((sel) => {
                    const element = document.querySelector(sel);
                    if (element) {
                        element.style.outline = '';
                    }
                }, step.selector).catch(() => {});
            }
            
            await page.waitForTimeout(500);
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

// Close session
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
        manualActions.delete(sessionId);
        
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
        console.log(`📍 Simple and focused solution:`);
        console.log(`   - Tracing for recording browser state`);
        console.log(`   - Manual action recording for VNC interactions`);
        console.log(`   - Real-time tile display via Socket.IO`);
        console.log(`   - Playwright script generation and playback`);
    });
});

module.exports = { app, server, io };