// Enhanced Test Recorder that communicates with parent window
(function() {
    'use strict';

    let isRecording = false;
    let recordedSteps = [];
    let parentWindow = null;

    // Initialize communication with parent window
    function initCommunication() {
        parentWindow = window.opener || window.parent;
        
        // Listen for messages from parent
        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            
            const { action, data } = event.data;
            
            switch(action) {
                case 'START_RECORDING':
                    startRecording();
                    break;
                case 'STOP_RECORDING':
                    stopRecording();
                    break;
                case 'PLAY_RECORDING':
                    playRecording(data.steps);
                    break;
                case 'GET_STEPS':
                    sendStepsToParent();
                    break;
            }
        });
        
        // Notify parent that recorder is ready
        sendMessageToParent('RECORDER_READY');
    }

    // Send message to parent window
    function sendMessageToParent(action, data = {}) {
        if (parentWindow) {
            parentWindow.postMessage({
                action: action,
                data: data,
                source: 'test-recorder'
            }, window.location.origin);
        }
    }

    // Get a unique selector for an element
    function getSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }
        
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(' ').filter(c => c.length > 0);
            if (classes.length > 0) {
                const selector = `.${classes.join('.')}`;
                const matches = document.querySelectorAll(selector);
                if (matches.length === 1) {
                    return selector;
                }
            }
        }

        // Build path from root
        const path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();
            if (element.id) {
                selector = `#${element.id}`;
                path.unshift(selector);
                break;
            } else {
                let sibling = element;
                let nth = 1;
                while (sibling.previousElementSibling) {
                    sibling = sibling.previousElementSibling;
                    if (sibling.nodeName === element.nodeName) {
                        nth++;
                    }
                }
                if (nth > 1) {
                    selector += `:nth-of-type(${nth})`;
                }
            }
            path.unshift(selector);
            element = element.parentElement;
        }
        
        return path.join(' > ');
    }

    // Start recording interactions
    function startRecording() {
        if (isRecording) return;
        
        isRecording = true;
        recordedSteps = [];
        
        // Add visual indicator
        document.body.style.border = '3px solid #10b981';
        
        // Attach event listeners
        document.addEventListener('click', recordClick, true);
        document.addEventListener('input', recordInput, true);
        document.addEventListener('keypress', recordKeypress, true);
        
        sendMessageToParent('RECORDING_STARTED');
        console.log('🎬 Recording started');
    }

    // Stop recording
    function stopRecording() {
        if (!isRecording) return;
        
        isRecording = false;
        
        // Remove visual indicator
        document.body.style.border = 'none';
        
        // Remove event listeners
        document.removeEventListener('click', recordClick, true);
        document.removeEventListener('input', recordInput, true);
        document.removeEventListener('keypress', recordKeypress, true);
        
        sendMessageToParent('RECORDING_STOPPED', { steps: recordedSteps });
        console.log('⏹️ Recording stopped, steps:', recordedSteps);
    }

    // Record click events
    function recordClick(e) {
        if (!isRecording) return;
        
        const selector = getSelector(e.target);
        const text = e.target.textContent?.trim().substring(0, 50) || e.target.value || 'element';
        
        const step = {
            type: 'click',
            selector: selector,
            text: text,
            tagName: e.target.tagName.toLowerCase(),
            timestamp: Date.now()
        };
        
        recordedSteps.push(step);
        sendMessageToParent('STEP_RECORDED', { step });
        
        console.log('Recorded click:', step);
    }

    // Record input events
    function recordInput(e) {
        if (!isRecording) return;
        
        const selector = getSelector(e.target);
        
        const step = {
            type: 'input',
            selector: selector,
            value: e.target.value,
            inputType: e.target.type || 'text',
            timestamp: Date.now()
        };
        
        // Remove previous input on same element to avoid duplicates
        recordedSteps = recordedSteps.filter(s => 
            !(s.type === 'input' && s.selector === selector)
        );
        
        recordedSteps.push(step);
        sendMessageToParent('STEP_RECORDED', { step });
        
        console.log('Recorded input:', step);
    }

    // Record keypress events  
    function recordKeypress(e) {
        if (!isRecording) return;
        
        // Ignore keypresses in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        const selector = getSelector(e.target);
        
        const step = {
            type: 'keypress',
            selector: selector,
            key: e.key,
            keyCode: e.keyCode,
            timestamp: Date.now()
        };
        
        recordedSteps.push(step);
        sendMessageToParent('STEP_RECORDED', { step });
        
        console.log('Recorded keypress:', step);
    }

    // Play recorded steps
    async function playRecording(steps) {
        console.log('▶️ Starting playback of', steps.length, 'steps');
        sendMessageToParent('PLAYBACK_STARTED');
        
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            try {
                await executeStep(step, i + 1, steps.length);
                await delay(800); // Delay between steps
            } catch (error) {
                console.error('Error executing step:', error);
                sendMessageToParent('PLAYBACK_ERROR', { error: error.message, step });
                break;
            }
        }
        
        sendMessageToParent('PLAYBACK_COMPLETED');
        console.log('✅ Playback completed');
    }

    // Execute a single step
    async function executeStep(step, stepNumber, totalSteps) {
        sendMessageToParent('STEP_EXECUTING', { step, stepNumber, totalSteps });
        
        const element = document.querySelector(step.selector);
        
        if (!element) {
            throw new Error(`Element not found: ${step.selector}`);
        }
        
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(300);
        
        // Highlight element
        const originalStyle = element.style.cssText;
        element.style.outline = '3px solid #f59e0b';
        element.style.outlineOffset = '2px';
        
        switch(step.type) {
            case 'click':
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(clickEvent);
                console.log(`Clicked: ${step.selector}`);
                break;
                
            case 'input':
                element.focus();
                element.value = '';
                
                // Type character by character for realistic effect
                for (let char of step.value) {
                    element.value += char;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    await delay(50);
                }
                
                element.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`Typed: "${step.value}" in ${step.selector}`);
                break;
                
            case 'keypress':
                const keypressEvent = new KeyboardEvent('keypress', {
                    key: step.key,
                    keyCode: step.keyCode,
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(keypressEvent);
                console.log(`Pressed key: "${step.key}" on ${step.selector}`);
                break;
        }
        
        await delay(200);
        // Remove highlight
        element.style.cssText = originalStyle;
        
        sendMessageToParent('STEP_COMPLETED', { step, stepNumber });
    }

    // Utility function for delays
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Send current steps to parent
    function sendStepsToParent() {
        sendMessageToParent('STEPS_UPDATE', { steps: recordedSteps });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCommunication);
    } else {
        initCommunication();
    }

    console.log('🚀 Enhanced Test Recorder loaded');
})();