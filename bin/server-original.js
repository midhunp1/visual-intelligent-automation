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
        const browser = await chromium.launch({ 
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
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
            recordedSteps: []
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
        
        // Visual indicator that recording is active
        await page.evaluate(() => {
            document.body.style.border = '3px solid #10b981';
        });
        
        // Set up Playwright's native event listeners
        page.on('click', async (event) => {
            if (!session.isRecording) return;
            
            try {
                const selector = await page.evaluate((e) => {
                    const element = document.elementFromPoint(e.x, e.y);
                    if (!element) return null;
                    
                    // Generate selector
                    if (element.id) return '#' + element.id;
                    
                    if (element.className && typeof element.className === 'string') {
                        const classes = element.className.split(' ').filter(c => c.length > 0);
                        if (classes.length > 0) {
                            const selector = '.' + classes.join('.');
                            if (document.querySelectorAll(selector).length === 1) {
                                return selector;
                            }
                        }
                    }
                    
                    // Build path selector
                    const path = [];
                    let current = element;
                    while (current && current.nodeType === Node.ELEMENT_NODE) {
                        let selector = current.nodeName.toLowerCase();
                        if (current.id) {
                            selector = '#' + current.id;
                            path.unshift(selector);
                            break;
                        } else {
                            let sibling = current;
                            let nth = 1;
                            while (sibling.previousElementSibling) {
                                sibling = sibling.previousElementSibling;
                                if (sibling.nodeName === current.nodeName) nth++;
                            }
                            if (nth > 1) selector += ':nth-of-type(' + nth + ')';
                        }
                        path.unshift(selector);
                        current = current.parentElement;
                    }
                    return path.join(' > ');
                }, event);
                
                if (selector) {
                    const text = await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        return el ? el.textContent?.trim().substring(0, 50) || 'element' : 'element';
                    }, selector);
                    
                    const action = {
                        type: 'click',
                        selector: selector,
                        text: text,
                        timestamp: Date.now()
                    };
                    
                    session.recordedSteps.push(action);
                    console.log('Recorded click:', action);
                }
            } catch (err) {
                console.error('Error recording click:', err);
            }
        });
        
        // Listen for input events
        page.on('input', async (event) => {
            if (!session.isRecording) return;
            
            try {
                const inputData = await page.evaluate(() => {
                    const activeElement = document.activeElement;
                    if (!activeElement || (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA')) {
                        return null;
                    }
                    
                    // Generate selector for active element
                    let selector = '';
                    if (activeElement.id) {
                        selector = '#' + activeElement.id;
                    } else if (activeElement.className && typeof activeElement.className === 'string') {
                        const classes = activeElement.className.split(' ').filter(c => c.length > 0);
                        if (classes.length > 0) {
                            selector = '.' + classes.join('.');
                        }
                    }
                    
                    if (!selector) {
                        // Build path selector
                        const path = [];
                        let current = activeElement;
                        while (current && current.nodeType === Node.ELEMENT_NODE) {
                            let sel = current.nodeName.toLowerCase();
                            if (current.id) {
                                sel = '#' + current.id;
                                path.unshift(sel);
                                break;
                            }
                            path.unshift(sel);
                            current = current.parentElement;
                        }
                        selector = path.join(' > ');
                    }
                    
                    return {
                        selector: selector,
                        value: activeElement.value
                    };
                });
                
                if (inputData) {
                    const action = {
                        type: 'input',
                        selector: inputData.selector,
                        value: inputData.value,
                        timestamp: Date.now()
                    };
                    
                    // Replace previous input on same element
                    const existingIndex = session.recordedSteps.findIndex(a => 
                        a.type === 'input' && a.selector === inputData.selector
                    );
                    
                    if (existingIndex >= 0) {
                        session.recordedSteps[existingIndex] = action;
                    } else {
                        session.recordedSteps.push(action);
                    }
                    
                    console.log('Recorded input:', action);
                }
            } catch (err) {
                console.error('Error recording input:', err);
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
        const { page } = session;
        
        // Remove visual indicator
        await page.evaluate(() => {
            document.body.style.border = 'none';
        });
        
        // Remove event listeners
        page.removeAllListeners('click');
        page.removeAllListeners('input');
        
        // Get the recorded steps from session
        const recordedSteps = session.recordedSteps || [];
        
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
        
        console.log(`▶️ Playing ${recordedSteps.length} recorded steps`);
        
        // Execute steps
        for (let i = 0; i < recordedSteps.length; i++) {
            const step = recordedSteps[i];
            
            try {
                // Highlight element
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.style.outline = '3px solid #f59e0b';
                        element.style.outlineOffset = '2px';
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, step.selector);
                
                await page.waitForTimeout(300);
                
                // Execute action
                if (step.type === 'click') {
                    await page.click(step.selector);
                    console.log(`✓ Clicked: ${step.selector}`);
                } else if (step.type === 'input') {
                    await page.fill(step.selector, '');
                    await page.type(step.selector, step.value, { delay: 50 });
                    console.log(`✓ Typed: "${step.value}" in ${step.selector}`);
                }
                
                // Remove highlight
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.style.outline = '';
                        element.style.outlineOffset = '';
                    }
                }, step.selector);
                
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

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Visual Test Automation Platform running at http://localhost:${PORT}`);
    console.log(`📍 Ready to record and automate web interactions!`);
});

module.exports = { app, server, io };