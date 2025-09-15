const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');
const unzipper = require('unzipper');

/**
 * Analyzes a Playwright trace file and extracts user actions
 */
class TraceAnalyzer {
    constructor() {
        this.actions = [];
    }

    /**
     * Extract and parse a trace.zip file
     */
    async analyzeTrace(tracePath) {
        console.log(`📊 Analyzing trace: ${tracePath}`);
        
        try {
            // Extract the trace.zip file
            const extractDir = tracePath.replace('.zip', '_extracted');
            await this.extractZip(tracePath, extractDir);
            
            // Read the trace file (usually trace.trace)
            const traceFile = path.join(extractDir, 'trace.trace');
            const traceContent = await fs.readFile(traceFile, 'utf8');
            
            // Parse trace events
            const events = traceContent.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (e) {
                        return null;
                    }
                })
                .filter(event => event !== null);
            
            // Extract user actions from events
            this.actions = this.extractActions(events);
            
            // Clean up extracted files
            await this.cleanup(extractDir);
            
            return this.actions;
            
        } catch (error) {
            console.error('Error analyzing trace:', error);
            throw error;
        }
    }

    /**
     * Extract actions from trace events
     */
    extractActions(events) {
        const actions = [];
        
        for (const event of events) {
            // Look for action events
            if (event.type === 'action') {
                const action = this.parseAction(event);
                if (action) {
                    actions.push(action);
                }
            }
            
            // Look for navigation events
            if (event.type === 'navigation' || event.method === 'Page.navigate') {
                actions.push({
                    type: 'navigate',
                    url: event.url || event.params?.url,
                    timestamp: event.timestamp
                });
            }
            
            // Look for input events
            if (event.method === 'Input.dispatchMouseEvent' && event.params?.type === 'mousePressed') {
                const selector = this.findSelectorForPosition(events, event.params.x, event.params.y);
                if (selector) {
                    actions.push({
                        type: 'click',
                        selector: selector,
                        x: event.params.x,
                        y: event.params.y,
                        timestamp: event.timestamp
                    });
                }
            }
            
            // Look for keyboard events
            if (event.method === 'Input.dispatchKeyEvent' || event.method === 'Input.insertText') {
                const lastAction = actions[actions.length - 1];
                if (lastAction && lastAction.type === 'click') {
                    // This is likely typing after clicking an input
                    actions.push({
                        type: 'type',
                        selector: lastAction.selector,
                        text: event.params?.text || event.params?.key || '',
                        timestamp: event.timestamp
                    });
                }
            }
        }
        
        return this.consolidateActions(actions);
    }

    /**
     * Parse specific action types
     */
    parseAction(event) {
        const { action, params } = event;
        
        switch (action) {
            case 'click':
                return {
                    type: 'click',
                    selector: params.selector,
                    button: params.button || 'left',
                    timestamp: event.timestamp
                };
                
            case 'fill':
                return {
                    type: 'fill',
                    selector: params.selector,
                    value: params.value,
                    timestamp: event.timestamp
                };
                
            case 'type':
                return {
                    type: 'type',
                    selector: params.selector,
                    text: params.text,
                    timestamp: event.timestamp
                };
                
            case 'press':
                return {
                    type: 'press',
                    selector: params.selector,
                    key: params.key,
                    timestamp: event.timestamp
                };
                
            case 'selectOption':
                return {
                    type: 'selectOption',
                    selector: params.selector,
                    value: params.value,
                    timestamp: event.timestamp
                };
                
            case 'check':
            case 'uncheck':
                return {
                    type: action,
                    selector: params.selector,
                    timestamp: event.timestamp
                };
                
            default:
                return null;
        }
    }

    /**
     * Find selector for a position (heuristic)
     */
    findSelectorForPosition(events, x, y) {
        // Look for nearby DOM snapshot events
        for (const event of events) {
            if (event.type === 'snapshot' && event.snapshot) {
                // Parse DOM and find element at position
                // This is simplified - real implementation would parse the DOM tree
                return this.findElementAtPosition(event.snapshot, x, y);
            }
        }
        return `[position="${x},${y}"]`; // Fallback
    }

    /**
     * Find element at specific position in DOM snapshot
     */
    findElementAtPosition(snapshot, x, y) {
        // This would require parsing the DOM snapshot
        // For now, return a placeholder
        return 'button'; // Simplified
    }

    /**
     * Consolidate similar actions (e.g., multiple keystrokes into one type action)
     */
    consolidateActions(actions) {
        const consolidated = [];
        let currentTyping = null;
        
        for (const action of actions) {
            if (action.type === 'type' && currentTyping && 
                currentTyping.selector === action.selector &&
                action.timestamp - currentTyping.timestamp < 1000) {
                // Combine typing actions
                currentTyping.text += action.text;
                currentTyping.timestamp = action.timestamp;
            } else {
                if (currentTyping) {
                    consolidated.push(currentTyping);
                    currentTyping = null;
                }
                
                if (action.type === 'type') {
                    currentTyping = { ...action };
                } else {
                    consolidated.push(action);
                }
            }
        }
        
        if (currentTyping) {
            consolidated.push(currentTyping);
        }
        
        return consolidated;
    }

    /**
     * Generate Playwright script from actions
     */
    generateScript(actions) {
        let script = `const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
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
                case 'selectOption':
                    script += `    await page.selectOption('${action.selector}', '${action.value}');\n`;
                    break;
                case 'check':
                    script += `    await page.check('${action.selector}');\n`;
                    break;
                case 'uncheck':
                    script += `    await page.uncheck('${action.selector}');\n`;
                    break;
                case 'press':
                    script += `    await page.press('${action.selector}', '${action.key}');\n`;
                    break;
            }
            script += `    await page.waitForTimeout(1000);\n\n`;
        }
        
        script += `    
    // await browser.close();
})();`;
        
        return script;
    }

    /**
     * Extract zip file
     */
    async extractZip(zipPath, outputDir) {
        await fs.mkdir(outputDir, { recursive: true });
        
        return new Promise((resolve, reject) => {
            fs.createReadStream(zipPath)
                .pipe(unzipper.Extract({ path: outputDir }))
                .on('close', resolve)
                .on('error', reject);
        });
    }

    /**
     * Clean up extracted files
     */
    async cleanup(dir) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Could not clean up:', dir);
        }
    }
}

/**
 * Alternative: Use Playwright's trace viewer API (if available)
 */
async function analyzeTraceWithViewer(tracePath) {
    // Launch trace viewer programmatically
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
        const viewer = spawn('npx', [
            'playwright',
            'show-trace',
            '--json',  // If this option exists
            tracePath
        ]);
        
        let output = '';
        
        viewer.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        viewer.stderr.on('data', (data) => {
            console.error(`Trace viewer error: ${data}`);
        });
        
        viewer.on('close', (code) => {
            if (code === 0) {
                try {
                    const actions = JSON.parse(output);
                    resolve(actions);
                } catch (e) {
                    resolve(output);
                }
            } else {
                reject(new Error(`Trace viewer exited with code ${code}`));
            }
        });
    });
}

/**
 * Real-time action capture using CDP
 */
class RealtimeRecorder {
    constructor(page) {
        this.page = page;
        this.actions = [];
        this.isRecording = false;
    }

    async startRecording() {
        this.isRecording = true;
        this.actions = [];
        
        const client = await this.page.context().newCDPSession(this.page);
        
        // Enable necessary domains
        await client.send('Runtime.enable');
        await client.send('DOM.enable');
        await client.send('Input.enable');
        await client.send('Page.enable');
        
        // Listen for input events
        client.on('Input.dispatchMouseEvent', (params) => {
            if (!this.isRecording) return;
            
            if (params.type === 'mousePressed') {
                this.actions.push({
                    type: 'click',
                    x: params.x,
                    y: params.y,
                    timestamp: Date.now()
                });
            }
        });
        
        client.on('Input.dispatchKeyEvent', (params) => {
            if (!this.isRecording) return;
            
            if (params.type === 'keyDown') {
                this.actions.push({
                    type: 'keypress',
                    key: params.key,
                    timestamp: Date.now()
                });
            }
        });
        
        // Store client for later use
        this.cdpClient = client;
    }

    stopRecording() {
        this.isRecording = false;
        return this.actions;
    }
}

module.exports = {
    TraceAnalyzer,
    RealtimeRecorder,
    analyzeTraceWithViewer
};