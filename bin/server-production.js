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

// Start browser session with comprehensive recording setup
app.post('/api/start-session', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting production browser session for: ${url}`);
        
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
            viewport: { width: 1200, height: 800 },
            // Enable video recording for debugging
            recordVideo: {
                dir: path.join(__dirname, 'videos'),
                size: { width: 1200, height: 800 }
            }
        });
        
        const page = await context.newPage();
        
        // Store session with enhanced state management
        browserSessions.set(sessionId, {
            browser,
            context,
            page,
            isRecording: false,
            recordedSteps: [],
            automatedSteps: [],  // Steps captured via automation
            manualSteps: [],     // Steps captured manually for VNC
            mergedSteps: [],     // Combined steps in order
            tracePath: null,
            scriptGenerated: false
        });
        
        // Set up automation-level recording by intercepting Playwright methods
        setupAutomationRecording(sessionId, page);
        
        await page.goto(url);
        
        res.json({ 
            success: true, 
            sessionId,
            message: 'Browser session started. Ready for recording.'
        });
        
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Setup automation-level recording by intercepting Playwright methods
function setupAutomationRecording(sessionId, page) {
    const session = browserSessions.get(sessionId);
    
    // Store original methods
    const originalMethods = {
        click: page.click.bind(page),
        fill: page.fill.bind(page),
        type: page.type.bind(page),
        selectOption: page.selectOption.bind(page),
        check: page.check.bind(page),
        uncheck: page.uncheck.bind(page),
        press: page.press.bind(page),
        goto: page.goto.bind(page)
    };
    
    // Intercept click
    page.click = async function(selector, options) {
        const result = await originalMethods.click(selector, options);
        
        if (session.isRecording) {
            const step = {
                type: 'click',
                selector,
                timestamp: Date.now(),
                source: 'automation'
            };
            
            session.automatedSteps.push(step);
            session.mergedSteps.push(step);
            
            io.emit('step-recorded', {
                sessionId,
                step,
                totalSteps: session.mergedSteps.length
            });
            
            console.log(`🤖 Auto-recorded click: ${selector}`);
        }
        
        return result;
    };
    
    // Intercept fill
    page.fill = async function(selector, value, options) {
        const result = await originalMethods.fill(selector, value, options);
        
        if (session.isRecording) {
            const step = {
                type: 'fill',
                selector,
                value,
                timestamp: Date.now(),
                source: 'automation'
            };
            
            session.automatedSteps.push(step);
            session.mergedSteps.push(step);
            
            io.emit('step-recorded', {
                sessionId,
                step,
                totalSteps: session.mergedSteps.length
            });
            
            console.log(`🤖 Auto-recorded fill: ${selector} = "${value}"`);
        }
        
        return result;
    };
    
    // Intercept type
    page.type = async function(selector, text, options) {
        const result = await originalMethods.type(selector, text, options);
        
        if (session.isRecording) {
            const step = {
                type: 'type',
                selector,
                text,
                timestamp: Date.now(),
                source: 'automation'
            };
            
            session.automatedSteps.push(step);
            session.mergedSteps.push(step);
            
            io.emit('step-recorded', {
                sessionId,
                step,
                totalSteps: session.mergedSteps.length
            });
            
            console.log(`🤖 Auto-recorded type: ${selector} = "${text}"`);
        }
        
        return result;
    };
    
    // Store original methods for restoration
    session.originalMethods = originalMethods;
}

// Start recording with both tracing and automation interception
app.post('/api/start-recording', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        // Reset recording state
        session.isRecording = true;
        session.recordedSteps = [];
        session.automatedSteps = [];
        session.manualSteps = [];
        session.mergedSteps = [];
        
        const { context, page } = session;
        
        // Start Playwright tracing for comprehensive capture
        await context.tracing.start({ 
            screenshots: true, 
            snapshots: true,
            sources: false,
            title: `Recording ${sessionId}`
        });
        
        // Visual indicator
        await page.evaluate(() => {
            // Create recording indicator
            const indicator = document.createElement('div');
            indicator.id = 'recording-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #ef4444;
                color: white;
                padding: 8px 16px;
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                font-weight: 600;
                z-index: 999999;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                animation: pulse 2s infinite;
            `;
            indicator.innerHTML = `
                <span style="display: inline-block; width: 8px; height: 8px; background: white; border-radius: 50%; animation: blink 1s infinite;"></span>
                Recording...
            `;
            
            // Add animation styles
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.8; }
                }
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(indicator);
        });
        
        console.log(`📹 Recording started for session: ${sessionId}`);
        console.log(`✅ Dual recording mode active:`);
        console.log(`   - Automation-level: Captures programmatic actions`);
        console.log(`   - Manual mode: Use /api/record-action for VNC clicks`);
        
        res.json({ 
            success: true, 
            message: 'Recording started. Both automation and manual recording are active.',
            recordingModes: {
                automation: true,
                manual: true,
                tracing: true
            }
        });
        
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Manual action recording for VNC interactions
app.post('/api/record-action', async (req, res) => {
    const { sessionId, type, selector, value, text, url, coordinates } = req.body;
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
            coordinates,
            timestamp: Date.now(),
            source: 'manual'
        };
        
        // Store in both manual and merged steps
        session.manualSteps.push(action);
        session.mergedSteps.push(action);
        
        // Emit for real-time tile display
        io.emit('step-recorded', {
            sessionId,
            step: action,
            totalSteps: session.mergedSteps.length
        });
        
        console.log(`📝 Manually recorded ${type}: ${selector || url || `(${coordinates?.x},${coordinates?.y})`}`);
        
        // Optionally execute the action in the browser
        const { page } = session;
        try {
            switch (type) {
                case 'click':
                    if (selector) {
                        await page.click(selector);
                    } else if (coordinates) {
                        await page.mouse.click(coordinates.x, coordinates.y);
                    }
                    break;
                case 'fill':
                    if (selector && value) {
                        await page.fill(selector, value);
                    }
                    break;
                case 'type':
                    if (selector && text) {
                        await page.type(selector, text);
                    }
                    break;
                case 'navigate':
                    if (url) {
                        await page.goto(url);
                    }
                    break;
                case 'select':
                    if (selector && value) {
                        await page.selectOption(selector, value);
                    }
                    break;
            }
        } catch (actionError) {
            console.warn(`Could not execute action in browser: ${actionError.message}`);
        }
        
        res.json({ 
            success: true,
            totalSteps: session.mergedSteps.length
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current recording status and steps
app.get('/api/recording-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
        success: true,
        isRecording: session.isRecording,
        steps: {
            automated: session.automatedSteps.length,
            manual: session.manualSteps.length,
            total: session.mergedSteps.length
        },
        mergedSteps: session.mergedSteps
    });
});

// Stop recording and generate script
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
            const indicator = document.getElementById('recording-indicator');
            if (indicator) {
                indicator.remove();
            }
        });
        
        // Stop tracing
        const tracePath = path.join(__dirname, 'traces', `trace-${sessionId}-${Date.now()}.zip`);
        await context.tracing.stop({ path: tracePath });
        session.tracePath = tracePath;
        
        // Generate comprehensive Playwright script
        const script = generateEnhancedPlaywrightScript(session.mergedSteps);
        session.generatedScript = script;
        session.scriptGenerated = true;
        
        // Save script to file
        const scriptPath = path.join(__dirname, 'recordings', `test-${sessionId}.js`);
        await fs.mkdir(path.dirname(scriptPath), { recursive: true });
        await fs.writeFile(scriptPath, script);
        
        console.log(`⏹️ Recording stopped. ${session.mergedSteps.length} steps recorded`);
        console.log(`   - Automated: ${session.automatedSteps.length} steps`);
        console.log(`   - Manual: ${session.manualSteps.length} steps`);
        console.log(`📁 Script saved to: ${scriptPath}`);
        console.log(`📁 Trace saved to: ${tracePath}`);
        
        res.json({ 
            success: true, 
            steps: session.mergedSteps,
            script: script,
            scriptPath: scriptPath,
            tracePath: tracePath,
            stats: {
                total: session.mergedSteps.length,
                automated: session.automatedSteps.length,
                manual: session.manualSteps.length
            },
            message: `Recording stopped. ${session.mergedSteps.length} steps recorded.`
        });
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Generate enhanced Playwright script with error handling and comments
function generateEnhancedPlaywrightScript(steps) {
    let script = `const { chromium } = require('playwright');

/**
 * Automated test generated from visual recording
 * Total steps: ${steps.length}
 * Generated at: ${new Date().toISOString()}
 */

(async () => {
    const browser = await chromium.launch({ 
        headless: false,
        args: ['--start-maximized']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1200, height: 800 }
    });
    
    const page = await context.newPage();
    
    try {
`;
    
    // Group steps by source for comments
    let lastSource = null;
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Add source comment if changed
        if (step.source !== lastSource) {
            script += `\n        // Steps from ${step.source} recording\n`;
            lastSource = step.source;
        }
        
        script += `        // Step ${i + 1}: ${step.type}`;
        if (step.selector) script += ` on ${step.selector}`;
        script += '\n';
        
        switch (step.type) {
            case 'click':
                if (step.selector) {
                    script += `        await page.click('${step.selector}');\n`;
                } else if (step.coordinates) {
                    script += `        await page.mouse.click(${step.coordinates.x}, ${step.coordinates.y});\n`;
                }
                break;
            case 'fill':
                script += `        await page.fill('${step.selector}', '${step.value}');\n`;
                break;
            case 'type':
                script += `        await page.type('${step.selector}', '${step.text}', { delay: 50 });\n`;
                break;
            case 'navigate':
                script += `        await page.goto('${step.url}');\n`;
                break;
            case 'select':
                script += `        await page.selectOption('${step.selector}', '${step.value}');\n`;
                break;
            case 'check':
                script += `        await page.check('${step.selector}');\n`;
                break;
            case 'uncheck':
                script += `        await page.uncheck('${step.selector}');\n`;
                break;
            case 'press':
                script += `        await page.press('${step.selector}', '${step.key}');\n`;
                break;
        }
        
        script += `        await page.waitForTimeout(1000);\n\n`;
    }
    
    script += `        console.log('✅ Test completed successfully');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
        
    } finally {
        // Uncomment to close browser after test
        // await browser.close();
    }
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
        const { page, mergedSteps } = session;
        
        if (!mergedSteps || mergedSteps.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No recorded steps to play' 
            });
        }
        
        console.log(`▶️ Playing ${mergedSteps.length} recorded steps`);
        
        // Disable recording during playback
        const wasRecording = session.isRecording;
        session.isRecording = false;
        
        // Execute steps with visual feedback
        for (let i = 0; i < mergedSteps.length; i++) {
            const step = mergedSteps[i];
            
            // Emit step being played
            io.emit('step-playing', {
                sessionId,
                stepIndex: i,
                step,
                progress: ((i + 1) / mergedSteps.length) * 100
            });
            
            // Visual highlight for element-based actions
            if (step.selector && step.type !== 'navigate') {
                await page.evaluate((sel) => {
                    const element = document.querySelector(sel);
                    if (element) {
                        element.style.outline = '3px solid #f59e0b';
                        element.style.outlineOffset = '2px';
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, step.selector).catch(() => {});
            }
            
            await page.waitForTimeout(500);
            
            // Execute action
            try {
                switch (step.type) {
                    case 'click':
                        if (step.selector) {
                            await page.click(step.selector);
                        } else if (step.coordinates) {
                            await page.mouse.click(step.coordinates.x, step.coordinates.y);
                        }
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Clicked: ${step.selector || `(${step.coordinates?.x},${step.coordinates?.y})`}`);
                        break;
                    case 'fill':
                        await page.fill(step.selector, step.value);
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Filled: ${step.selector} with "${step.value}"`);
                        break;
                    case 'type':
                        await page.type(step.selector, step.text, { delay: 50 });
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Typed: "${step.text}" in ${step.selector}`);
                        break;
                    case 'navigate':
                        await page.goto(step.url);
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Navigated to: ${step.url}`);
                        break;
                    case 'select':
                        await page.selectOption(step.selector, step.value);
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Selected: ${step.value} in ${step.selector}`);
                        break;
                    case 'check':
                        await page.check(step.selector);
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Checked: ${step.selector}`);
                        break;
                    case 'uncheck':
                        await page.uncheck(step.selector);
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Unchecked: ${step.selector}`);
                        break;
                    case 'press':
                        await page.press(step.selector, step.key);
                        console.log(`✓ [${i+1}/${mergedSteps.length}] Pressed: ${step.key} in ${step.selector}`);
                        break;
                }
            } catch (stepError) {
                console.error(`❌ Error executing step ${i + 1}:`, stepError);
                io.emit('step-error', {
                    sessionId,
                    stepIndex: i,
                    step,
                    error: stepError.message
                });
            }
            
            // Remove highlight
            if (step.selector && step.type !== 'navigate') {
                await page.evaluate((sel) => {
                    const element = document.querySelector(sel);
                    if (element) {
                        element.style.outline = '';
                        element.style.outlineOffset = '';
                    }
                }, step.selector).catch(() => {});
            }
            
            await page.waitForTimeout(500);
        }
        
        // Restore recording state
        session.isRecording = wasRecording;
        
        console.log('✅ Playback completed successfully');
        
        io.emit('playback-complete', {
            sessionId,
            totalSteps: mergedSteps.length
        });
        
        res.json({ 
            success: true, 
            message: `Playback completed successfully. ${mergedSteps.length} steps executed.` 
        });
        
    } catch (error) {
        console.error('Error during playback:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Export recorded test
app.get('/api/export-test/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const session = browserSessions.get(sessionId);
    
    if (!session || !session.scriptGenerated) {
        return res.status(404).json({ success: false, error: 'No test script available' });
    }
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Disposition', `attachment; filename="test-${sessionId}.js"`);
    res.send(session.generatedScript);
});

// Close session
app.post('/api/close-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        // Restore original methods if modified
        if (session.originalMethods && session.page) {
            const page = session.page;
            Object.keys(session.originalMethods).forEach(method => {
                page[method] = session.originalMethods[method];
            });
        }
        
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
    
    // Handle real-time manual action recording from UI
    socket.on('record-manual-action', async (data) => {
        const { sessionId, action } = data;
        const session = browserSessions.get(sessionId);
        
        if (session && session.isRecording) {
            const step = {
                ...action,
                timestamp: Date.now(),
                source: 'manual-ui'
            };
            
            session.manualSteps.push(step);
            session.mergedSteps.push(step);
            
            io.emit('step-recorded', {
                sessionId,
                step,
                totalSteps: session.mergedSteps.length
            });
            
            console.log(`🖱️ UI-recorded ${action.type}`);
        }
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
    const dirs = ['recordings', 'traces', 'screenshots', 'videos'];
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
        console.log(`🚀 Visual Test Automation Platform (Production) running at http://localhost:${PORT}`);
        console.log(`📍 Features:`);
        console.log(`   ✅ Automation-level recording (captures programmatic actions)`);
        console.log(`   ✅ Manual recording API for VNC interactions`);
        console.log(`   ✅ Real-time step visualization via WebSocket`);
        console.log(`   ✅ Playwright script generation and export`);
        console.log(`   ✅ Test playback with visual feedback`);
        console.log(`   ✅ Comprehensive tracing for debugging`);
    });
});

module.exports = { app, server, io };