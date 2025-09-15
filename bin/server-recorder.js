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
        
        // Launch browser with debugging enabled
        const browser = await chromium.launch({ 
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
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
            recordedSteps: [],
            recorder: null
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
        
        const { page } = session;
        
        // Visual indicator
        await page.evaluate(() => {
            document.body.style.border = '3px solid #10b981';
        });
        
        // Use Playwright's built-in action recording
        // We'll intercept all page methods that represent user actions
        const originalClick = page.click.bind(page);
        const originalFill = page.fill.bind(page);
        const originalType = page.type.bind(page);
        const originalSelectOption = page.selectOption.bind(page);
        const originalCheck = page.check.bind(page);
        const originalUncheck = page.uncheck.bind(page);
        const originalPress = page.press.bind(page);
        
        // Override click method
        page.click = async function(selector, options) {
            if (session.isRecording) {
                const element = await page.$(selector);
                const text = element ? await element.textContent() : '';
                
                const step = {
                    type: 'click',
                    selector,
                    text: text?.trim().substring(0, 50) || '',
                    timestamp: Date.now()
                };
                
                session.recordedSteps.push(step);
                
                // Emit for real-time display
                io.emit('step-recorded', {
                    sessionId,
                    step
                });
                
                console.log(`📝 Recorded click: ${selector}`);
            }
            
            return originalClick(selector, options);
        };
        
        // Override fill method
        page.fill = async function(selector, value, options) {
            if (session.isRecording) {
                const step = {
                    type: 'fill',
                    selector,
                    value,
                    timestamp: Date.now()
                };
                
                session.recordedSteps.push(step);
                
                io.emit('step-recorded', {
                    sessionId,
                    step
                });
                
                console.log(`📝 Recorded fill: ${selector} = "${value}"`);
            }
            
            return originalFill(selector, value, options);
        };
        
        // Override type method
        page.type = async function(selector, text, options) {
            if (session.isRecording) {
                const step = {
                    type: 'type',
                    selector,
                    text,
                    timestamp: Date.now()
                };
                
                session.recordedSteps.push(step);
                
                io.emit('step-recorded', {
                    sessionId,
                    step
                });
                
                console.log(`📝 Recorded type: ${selector} = "${text}"`);
            }
            
            return originalType(selector, text, options);
        };
        
        // Store original methods for restoration
        session.originalMethods = {
            click: originalClick,
            fill: originalFill,
            type: originalType,
            selectOption: originalSelectOption,
            check: originalCheck,
            uncheck: originalUncheck,
            press: originalPress
        };
        
        console.log(`📹 Recording started for session: ${sessionId}`);
        console.log('⚠️ NOTE: Recording will capture actions performed via Playwright API');
        console.log('   For manual VNC interactions, use the manual recording mode');
        
        res.json({ 
            success: true, 
            message: 'Recording started. Actions performed via API will be captured.' 
        });
        
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Manual recording endpoint for VNC interactions
app.post('/api/record-manual-action', async (req, res) => {
    const { sessionId, action } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session || !session.isRecording) {
        return res.status(400).json({ success: false, error: 'Not recording' });
    }
    
    try {
        session.recordedSteps.push({
            ...action,
            timestamp: Date.now()
        });
        
        // Emit for real-time display
        io.emit('step-recorded', {
            sessionId,
            step: action
        });
        
        console.log(`📝 Manually recorded ${action.type}: ${action.selector || action.text}`);
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        const { page } = session;
        
        // Remove visual indicator
        await page.evaluate(() => {
            document.body.style.border = 'none';
        });
        
        // Restore original methods
        if (session.originalMethods) {
            page.click = session.originalMethods.click;
            page.fill = session.originalMethods.fill;
            page.type = session.originalMethods.type;
            page.selectOption = session.originalMethods.selectOption;
            page.check = session.originalMethods.check;
            page.uncheck = session.originalMethods.uncheck;
            page.press = session.originalMethods.press;
        }
        
        // Generate Playwright script
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
                if (step.text) {
                    script += `    // Clicked: ${step.text}\n`;
                }
                break;
            case 'fill':
                script += `    await page.fill('${step.selector}', '${step.value}');\n`;
                break;
            case 'type':
                script += `    await page.type('${step.selector}', '${step.text}');\n`;
                break;
            case 'selectOption':
                script += `    await page.selectOption('${step.selector}', '${step.value}');\n`;
                break;
            case 'check':
                script += `    await page.check('${step.selector}');\n`;
                break;
            case 'uncheck':
                script += `    await page.uncheck('${step.selector}');\n`;
                break;
            case 'press':
                script += `    await page.press('${step.selector}', '${step.key}');\n`;
                break;
            case 'navigate':
                script += `    await page.goto('${step.url}');\n`;
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
        
        // Disable recording during playback
        const wasRecording = session.isRecording;
        session.isRecording = false;
        
        // Execute steps
        for (let i = 0; i < recordedSteps.length; i++) {
            const step = recordedSteps[i];
            
            try {
                // Emit step being played
                io.emit('step-playing', {
                    sessionId,
                    stepIndex: i,
                    step
                });
                
                // Highlight element
                if (step.selector) {
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
                    case 'selectOption':
                        await page.selectOption(step.selector, step.value);
                        console.log(`✓ Selected: ${step.value} in ${step.selector}`);
                        break;
                    case 'check':
                        await page.check(step.selector);
                        console.log(`✓ Checked: ${step.selector}`);
                        break;
                    case 'uncheck':
                        await page.uncheck(step.selector);
                        console.log(`✓ Unchecked: ${step.selector}`);
                        break;
                    case 'press':
                        await page.press(step.selector, step.key);
                        console.log(`✓ Pressed: ${step.key} in ${step.selector}`);
                        break;
                    case 'navigate':
                        await page.goto(step.url);
                        console.log(`✓ Navigated to: ${step.url}`);
                        break;
                }
                
                // Remove highlight
                if (step.selector) {
                    await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            element.style.outline = '';
                        }
                    }, step.selector).catch(() => {});
                }
                
                await page.waitForTimeout(500);
                
            } catch (stepError) {
                console.error(`Error executing step ${i + 1}:`, stepError);
            }
        }
        
        // Restore recording state
        session.isRecording = wasRecording;
        
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

// Test endpoint to demonstrate recording
app.post('/api/test-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        const { page } = session;
        
        console.log('🧪 Running test actions to demonstrate recording...');
        
        // These actions will be recorded if recording is active
        await page.click('button');
        await page.fill('input[type="text"]', 'Test text');
        
        res.json({ 
            success: true, 
            message: 'Test actions executed. Check recorded steps.' 
        });
        
    } catch (error) {
        console.error('Error in test:', error);
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

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Visual Test Automation Platform running at http://localhost:${PORT}`);
    console.log(`📍 Recording works at automation level - intercepts Playwright API calls`);
    console.log(`⚠️ Note: Manual VNC clicks won't be auto-recorded. Use manual recording mode.`);
});

module.exports = { app, server, io };