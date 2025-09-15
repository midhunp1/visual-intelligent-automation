const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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

// Store playback abort controllers
const playbackControllers = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints
app.post('/api/start-session', async (req, res) => {
    const { url, sessionId } = req.body;
    
    try {
        console.log(`🚀 Starting browser session for: ${url}`);
        
        // Launch browser with visible UI
        // Set DISPLAY environment variable
        process.env.DISPLAY = ':99';
        
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
            actionPromises: []
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
        session.actionPromises = [];
        
        const { page, context } = session;
        
        // Start tracing to capture actions
        await context.tracing.start({ 
            screenshots: true, 
            snapshots: true 
        });
        
        // Visual indicator
        await page.evaluate(() => {
            document.body.style.border = '3px solid #10b981';
            
            // Initialize recording arrays
            window.__recordedActions = [];
            window.__isRecording = true;
        });
        
        // Helper function to generate selectors
        async function generateSelector(element) {
            return await page.evaluate((el) => {
                if (!el) return '';
                
                // Try ID first
                if (el.id) {
                    return '#' + CSS.escape(el.id);
                }
                
                // Try unique class combination
                if (el.className && typeof el.className === 'string') {
                    const classes = el.className.trim().split(/\s+/).filter(c => c.length > 0);
                    if (classes.length > 0) {
                        const selector = '.' + classes.map(c => CSS.escape(c)).join('.');
                        try {
                            if (document.querySelectorAll(selector).length === 1) {
                                return selector;
                            }
                        } catch (e) {}
                    }
                }
                
                // Try data attributes
                const dataAttrs = Array.from(el.attributes)
                    .filter(attr => attr.name.startsWith('data-'));
                if (dataAttrs.length > 0) {
                    const selector = el.tagName.toLowerCase() + 
                        dataAttrs.map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('');
                    try {
                        if (document.querySelectorAll(selector).length === 1) {
                            return selector;
                        }
                    } catch (e) {}
                }
                
                // Try text content for buttons/links
                if ((el.tagName === 'BUTTON' || el.tagName === 'A') && el.textContent) {
                    const text = el.textContent.trim();
                    if (text.length > 0 && text.length < 50) {
                        return el.tagName.toLowerCase() + ':contains("' + text + '")';
                    }
                }
                
                // Build CSS path
                const path = [];
                let current = el;
                
                while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'HTML') {
                    let selector = current.tagName.toLowerCase();
                    
                    // Add nth-child if needed
                    if (current.parentElement) {
                        const siblings = Array.from(current.parentElement.children)
                            .filter(child => child.tagName === current.tagName);
                        
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            selector += ':nth-of-type(' + index + ')';
                        }
                    }
                    
                    path.unshift(selector);
                    
                    // Stop if we hit an ID
                    if (current.id) {
                        path.unshift('#' + CSS.escape(current.id));
                        break;
                    }
                    
                    current = current.parentElement;
                }
                
                return path.join(' > ');
            }, element);
        }
        
        // Use enhanced DOM event listeners with better VNC compatibility
        await page.evaluate(() => {
            // Store previous values to detect changes
            window.__inputValues = new Map();
            
            // Enhanced event capturing with capture phase and multiple event types
            const events = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'];
            events.forEach(eventType => {
                document.addEventListener(eventType, (e) => {
                    if (!window.__isRecording) return;
                    
                    const target = e.target;
                    if (!target) return;
                    
                    const selector = getSelector(target);
                    
                    // Only record on mouseup/click to avoid duplicates
                    if (eventType === 'click' || eventType === 'mouseup') {
                        window.__recordedActions.push({
                            type: 'click',
                            selector: selector,
                            text: target.textContent?.trim().substring(0, 50) || '',
                            timestamp: Date.now(),
                            x: e.clientX || 0,
                            y: e.clientY || 0
                        });
                        
                        console.log('Recorded click:', selector, eventType);
                    }
                }, { capture: true, passive: true });
            });
            
            // Enhanced input tracking with multiple events
            const inputEvents = ['input', 'change', 'keyup', 'paste'];
            inputEvents.forEach(eventType => {
                document.addEventListener(eventType, (e) => {
                    if (!window.__isRecording) return;
                    const target = e.target;
                    
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                        const selector = getSelector(target);
                        const currentValue = target.value;
                        const previousValue = window.__inputValues.get(selector) || '';
                        
                        // Only record if value actually changed
                        if (currentValue !== previousValue && currentValue.length > 0) {
                            window.__inputValues.set(selector, currentValue);
                            
                            // Update or add input action
                            const existingIndex = window.__recordedActions.findIndex(
                                a => a.type === 'input' && a.selector === selector
                            );
                            
                            const action = {
                                type: 'input',
                                selector: selector,
                                value: currentValue,
                                timestamp: Date.now()
                            };
                            
                            if (existingIndex >= 0) {
                                window.__recordedActions[existingIndex] = action;
                            } else {
                                window.__recordedActions.push(action);
                            }
                            
                            console.log('Recorded input:', selector, currentValue, eventType);
                        }
                    }
                }, { capture: true, passive: true });
            });
            
            // Track form submits
            document.addEventListener('submit', (e) => {
                if (!window.__isRecording) return;
                
                const form = e.target;
                const selector = getSelector(form);
                
                window.__recordedActions.push({
                    type: 'submit',
                    selector: selector,
                    timestamp: Date.now()
                });
                
                console.log('Recorded submit:', selector);
            }, { capture: true, passive: true });
            
            // Track select changes
            document.addEventListener('change', (e) => {
                if (!window.__isRecording) return;
                const target = e.target;
                
                if (target.tagName === 'SELECT') {
                    const selector = getSelector(target);
                    
                    window.__recordedActions.push({
                        type: 'select',
                        selector: selector,
                        value: target.value,
                        text: target.options[target.selectedIndex]?.text,
                        timestamp: Date.now()
                    });
                    
                    console.log('Recorded select:', selector, target.value);
                }
            }, { capture: true, passive: true });
            
            function getSelector(element) {
                if (!element) return '';
                
                // Try ID first
                if (element.id) {
                    return '#' + CSS.escape(element.id);
                }
                
                // Try unique class combination
                if (element.className && typeof element.className === 'string') {
                    const classes = element.className.trim().split(/\s+/).filter(c => c.length > 0);
                    if (classes.length > 0) {
                        const selector = '.' + classes.map(c => CSS.escape(c)).join('.');
                        try {
                            if (document.querySelectorAll(selector).length === 1) {
                                return selector;
                            }
                        } catch (e) {}
                    }
                }
                
                // Try data attributes
                const dataAttrs = Array.from(element.attributes)
                    .filter(attr => attr.name.startsWith('data-'));
                if (dataAttrs.length > 0) {
                    const selector = element.tagName.toLowerCase() + 
                        dataAttrs.map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('');
                    try {
                        if (document.querySelectorAll(selector).length === 1) {
                            return selector;
                        }
                    } catch (e) {}
                }
                
                // Try text content for buttons/links
                if ((element.tagName === 'BUTTON' || element.tagName === 'A') && element.textContent) {
                    const text = element.textContent.trim();
                    if (text.length > 0 && text.length < 50) {
                        return element.tagName.toLowerCase() + ':contains("' + text + '")';
                    }
                }
                
                // Build CSS path
                const path = [];
                let current = element;
                
                while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'HTML') {
                    let selector = current.tagName.toLowerCase();
                    
                    // Add nth-child if needed
                    if (current.parentElement) {
                        const siblings = Array.from(current.parentElement.children)
                            .filter(child => child.tagName === current.tagName);
                        
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            selector += ':nth-of-type(' + index + ')';
                        }
                    }
                    
                    path.unshift(selector);
                    
                    // Stop if we hit an ID
                    if (current.id) {
                        path.unshift('#' + CSS.escape(current.id));
                        break;
                    }
                    
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
        
        // Get recorded actions from page
        const recordedSteps = await page.evaluate(() => {
            window.__isRecording = false;
            document.body.style.border = 'none';
            return window.__recordedActions || [];
        });
        
        // Stop tracing
        await context.tracing.stop();
        
        session.recordedSteps = recordedSteps;
        
        console.log(`⏹️ Recording stopped. Recorded ${recordedSteps.length} steps`);
        
        res.json({ 
            success: true, 
            steps: recordedSteps,
            message: `Recording stopped. ${recordedSteps.length} steps recorded.`
        });
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

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
        
        // Create abort controller for this playback
        const abortController = new AbortController();
        playbackControllers.set(sessionId, abortController);
        
        console.log(`▶️ Playing ${recordedSteps.length} recorded steps`);
        
        // Execute steps
        for (let i = 0; i < recordedSteps.length; i++) {
            // Check if playback was stopped
            if (abortController.signal.aborted) {
                console.log('⏸️ Playback stopped by user');
                return res.json({ 
                    success: true, 
                    message: 'Playback stopped',
                    stoppedAt: i
                });
            }
            
            const step = recordedSteps[i];
            
            try {
                // Handle :contains selector for buttons/links
                let selector = step.selector;
                if (selector.includes(':contains(')) {
                    const match = selector.match(/^(.*?):contains\("(.*)"\)$/);
                    if (match) {
                        const [, tagSelector, text] = match;
                        selector = tagSelector;
                        // Find element by text
                        const elements = await page.$$(selector);
                        for (const el of elements) {
                            const elText = await el.textContent();
                            if (elText && elText.trim() === text) {
                                selector = el;
                                break;
                            }
                        }
                    }
                }
                
                // Highlight element
                if (typeof selector === 'string') {
                    await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            element.style.outline = '3px solid #f59e0b';
                            element.style.outlineOffset = '2px';
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, selector);
                }
                
                await page.waitForTimeout(300);
                
                // Execute action
                if (step.type === 'click') {
                    if (typeof selector === 'string') {
                        await page.click(selector);
                    } else {
                        await selector.click();
                    }
                    console.log(`✓ Clicked: ${step.selector}`);
                } else if (step.type === 'input') {
                    await page.fill(step.selector, '');
                    await page.type(step.selector, step.value, { delay: 50 });
                    console.log(`✓ Typed: "${step.value}" in ${step.selector}`);
                } else if (step.type === 'select') {
                    await page.selectOption(step.selector, step.value);
                    console.log(`✓ Selected: "${step.value}" in ${step.selector}`);
                } else if (step.type === 'submit') {
                    await page.evaluate((sel) => {
                        const form = document.querySelector(sel);
                        if (form) form.submit();
                    }, step.selector);
                    console.log(`✓ Submitted form: ${step.selector}`);
                }
                
                // Remove highlight
                if (typeof selector === 'string') {
                    await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            element.style.outline = '';
                            element.style.outlineOffset = '';
                        }
                    }, selector);
                }
                
                await page.waitForTimeout(800);
                
            } catch (stepError) {
                console.error(`Error executing step ${i + 1}:`, stepError);
                // Continue with next step
            }
        }
        
        console.log('✅ Playback completed successfully');
        
        // Clean up abort controller
        playbackControllers.delete(sessionId);
        
        res.json({ 
            success: true, 
            message: 'Playback completed successfully' 
        });
        
    } catch (error) {
        console.error('Error during playback:', error);
        // Clean up abort controller on error
        playbackControllers.delete(sessionId);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/api/stop-playback', async (req, res) => {
    const { sessionId } = req.body;
    
    const abortController = playbackControllers.get(sessionId);
    if (abortController) {
        abortController.abort();
        playbackControllers.delete(sessionId);
        
        console.log(`⏹️ Playback stopped for session: ${sessionId}`);
        
        res.json({ 
            success: true, 
            message: 'Playback stopped successfully' 
        });
    } else {
        res.json({ 
            success: false, 
            error: 'No active playback to stop' 
        });
    }
});

// Test endpoint to trigger interactions programmatically
app.post('/api/test-interaction', async (req, res) => {
    const { sessionId } = req.body;
    const session = browserSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        const { page } = session;
        
        // Programmatically trigger some interactions to test recording
        await page.evaluate(() => {
            // Simulate a click on button if it exists
            const button = document.querySelector('button');
            if (button) {
                button.click();
                console.log('Programmatically clicked button');
            }
            
            // Simulate typing in input if it exists  
            const input = document.querySelector('input');
            if (input) {
                input.focus();
                input.value = 'Test text';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('Programmatically typed in input');
            }
        });
        
        console.log('🧪 Test interactions triggered');
        
        res.json({ 
            success: true, 
            message: 'Test interactions triggered successfully' 
        });
        
    } catch (error) {
        console.error('Error triggering test interactions:', error);
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
    console.log(`📍 Ready to record and automate web interactions!`);
});

module.exports = { app, server, io };