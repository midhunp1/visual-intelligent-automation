class FlowCanvas {
    constructor() {
        this.canvas = document.getElementById('flow-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.tilesContainer = document.getElementById('tiles-container');
        this.propertiesPanel = document.getElementById('properties-panel');
        
        this.tiles = [];
        this.connections = [];
        this.selectedTile = null;
        this.connectingFrom = null;
        this.zoom = 1;
        this.gridSize = 20;
        this.showGrid = true;
        
        this.tileIdCounter = 1;
        
        // Test automation properties
        this.testWindow = null;
        this.isRecording = false;
        this.recordedSteps = [];
        this.currentTileY = 100;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupTestAutomation();
        this.animate();
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const wrapper = this.canvas.parentElement;
        this.canvas.width = wrapper.clientWidth;
        this.canvas.height = wrapper.clientHeight;
    }
    
    setupEventListeners() {
        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => this.changeZoom(0.1));
        document.getElementById('zoom-out').addEventListener('click', () => this.changeZoom(-0.1));
        document.getElementById('zoom-fit').addEventListener('click', () => this.fitToScreen());
        
        // Grid toggle
        document.getElementById('grid-toggle').addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            document.getElementById('grid-toggle').classList.toggle('active');
        });
        
        // Auto arrange
        document.getElementById('auto-arrange').addEventListener('click', () => this.autoArrange());
        
        // Canvas click for deselect
        this.tilesContainer.addEventListener('click', (e) => {
            if (e.target === this.tilesContainer) {
                this.selectTile(null);
            }
        });
    }
    
    setupDragAndDrop() {
        // Drag from library - with proper event setup
        const stepItems = document.querySelectorAll('.step-item');
        console.log('Setting up drag and drop for', stepItems.length, 'items');
        
        stepItems.forEach(item => {
            // Make sure draggable attribute is set
            item.setAttribute('draggable', 'true');
            
            item.addEventListener('dragstart', (e) => {
                console.log('Drag started for:', item.dataset.type);
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', item.dataset.type);
                e.dataTransfer.setData('stepType', item.dataset.type);
                
                // Add visual feedback
                item.style.opacity = '0.5';
            });
            
            item.addEventListener('dragend', (e) => {
                // Reset visual feedback
                item.style.opacity = '1';
            });
        });
        
        // Drop on canvas
        this.tilesContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.tilesContainer.classList.add('drag-over');
        });
        
        this.tilesContainer.addEventListener('dragleave', (e) => {
            if (e.target === this.tilesContainer) {
                this.tilesContainer.classList.remove('drag-over');
            }
        });
        
        this.tilesContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            this.tilesContainer.classList.remove('drag-over');
            
            // Try multiple ways to get the step type
            let stepType = e.dataTransfer.getData('stepType') || e.dataTransfer.getData('text/plain');
            console.log('Drop event - stepType:', stepType);
            
            if (stepType) {
                const rect = this.tilesContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.zoom;
                const y = (e.clientY - rect.top) / this.zoom;
                
                console.log('Adding tile at:', x, y);
                this.addTile(stepType, x, y);
            } else {
                console.warn('No stepType found in drop event');
            }
        });
    }
    
    addTile(type, x, y, data = {}) {
        const tile = {
            id: this.tileIdCounter++,
            type: type,
            x: Math.round(x / this.gridSize) * this.gridSize,
            y: Math.round(y / this.gridSize) * this.gridSize,
            width: 200,
            height: 120,
            data: {
                name: data.name || this.getDefaultName(type),
                ...this.getDefaultData(type),
                ...data
            }
        };
        
        this.tiles.push(tile);
        this.createTileElement(tile);
        this.selectTile(tile);
        
        return tile;
    }
    
    getDefaultName(type) {
        const names = {
            navigate: 'Navigate to URL',
            click: 'Click Element',
            input: 'Enter Text',
            validate: 'Validate Element',
            wait: 'Wait',
            condition: 'If Condition'
        };
        return names[type] || 'Step';
    }
    
    getDefaultData(type) {
        const defaults = {
            navigate: { url: '' },
            click: { selector: '', waitFor: true },
            input: { selector: '', value: '', clear: true },
            validate: { selector: '', assertion: 'exists', value: '' },
            wait: { duration: 1000, type: 'time' },
            condition: { expression: '', trueBranch: null, falseBranch: null }
        };
        return defaults[type] || {};
    }
    
    createTileElement(tile) {
        const element = document.createElement('div');
        element.className = 'flow-tile';
        element.id = `tile-${tile.id}`;
        element.style.left = `${tile.x}px`;
        element.style.top = `${tile.y}px`;
        element.style.width = `${tile.width}px`;
        
        element.innerHTML = `
            <div class="connection-point input"></div>
            <div class="connection-point output"></div>
            <div class="tile-header">
                <div class="tile-icon ${tile.type}">
                    ${this.getIcon(tile.type)}
                </div>
                <div class="tile-title">
                    <div class="tile-name">${tile.data.name}</div>
                    <div class="tile-type">${tile.type}</div>
                </div>
            </div>
            <div class="tile-content">
                ${this.getTileContent(tile)}
            </div>
            <div class="tile-actions">
                <div class="tile-action" data-action="edit">Edit</div>
                <div class="tile-action" data-action="duplicate">Duplicate</div>
                <div class="tile-action" data-action="delete">Delete</div>
            </div>
        `;
        
        this.tilesContainer.appendChild(element);
        
        // Make tile draggable
        this.makeTileDraggable(element, tile);
        
        // Setup tile events
        element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectTile(tile);
        });
        
        // Connection points
        const outputPoint = element.querySelector('.connection-point.output');
        const inputPoint = element.querySelector('.connection-point.input');
        
        outputPoint.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startConnection(tile);
        });
        
        inputPoint.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.connectingFrom) {
                this.completeConnection(tile);
            }
        });
        
        // Actions
        element.querySelectorAll('.tile-action').forEach(action => {
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleTileAction(tile, action.dataset.action);
            });
        });
    }
    
    makeTileDraggable(element, tile) {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        const header = element.querySelector('.tile-header');
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = tile.x;
            initialY = tile.y;
            
            element.classList.add('dragging');
            element.style.zIndex = '1000';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            tile.x = Math.round((initialX + dx) / this.gridSize) * this.gridSize;
            tile.y = Math.round((initialY + dy) / this.gridSize) * this.gridSize;
            
            element.style.left = `${tile.x}px`;
            element.style.top = `${tile.y}px`;
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
                element.style.zIndex = '';
            }
        });
    }
    
    getIcon(type) {
        const icons = {
            navigate: '<svg width="20" height="20" fill="currentColor"><path d="M10 2L3 9h4v9h6V9h4z"/></svg>',
            click: '<svg width="20" height="20" fill="currentColor"><circle cx="10" cy="10" r="3"/><path d="M10 5V2m0 18v-3m5 3l-3-3m-4 0l-3 3"/></svg>',
            input: '<svg width="20" height="20" fill="currentColor"><rect x="2" y="6" width="16" height="8" rx="1"/><path d="M5 10h10" stroke="white"/></svg>',
            validate: '<svg width="20" height="20" fill="currentColor"><path d="M5 10l3 3 7-7"/></svg>',
            wait: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>',
            condition: '<svg width="20" height="20" fill="currentColor"><path d="M10 2L4 10l6 8 6-8z"/></svg>'
        };
        return icons[type] || '';
    }
    
    getTileContent(tile) {
        switch(tile.type) {
            case 'navigate':
                return tile.data.url || 'No URL set';
            case 'click':
                return tile.data.selector || 'No selector set';
            case 'input':
                return `"${tile.data.value || ''}" → ${tile.data.selector || 'selector'}`;
            case 'validate':
                return `${tile.data.assertion} ${tile.data.selector || 'element'}`;
            case 'wait':
                return `${tile.data.duration}ms`;
            case 'condition':
                return tile.data.expression || 'No condition set';
            default:
                return '';
        }
    }
    
    selectTile(tile) {
        // Deselect previous
        if (this.selectedTile) {
            const prevElement = document.getElementById(`tile-${this.selectedTile.id}`);
            if (prevElement) prevElement.classList.remove('selected');
        }
        
        this.selectedTile = tile;
        
        if (tile) {
            const element = document.getElementById(`tile-${tile.id}`);
            if (element) element.classList.add('selected');
            this.showProperties(tile);
        } else {
            this.hideProperties();
        }
    }
    
    showProperties(tile) {
        let propertiesHTML = `<h4 style="margin-bottom: 16px; color: var(--gray-900);">${tile.data.name}</h4>`;
        
        switch(tile.type) {
            case 'navigate':
                propertiesHTML += `
                    <div class="property-item">
                        <label class="property-label">URL</label>
                        <input class="property-input" type="text" value="${tile.data.url || ''}" 
                               data-property="url" placeholder="https://example.com">
                    </div>`;
                break;
                
            case 'click':
                propertiesHTML += `
                    <div class="property-item">
                        <label class="property-label">CSS Selector</label>
                        <input class="property-input" type="text" value="${tile.data.selector || ''}" 
                               data-property="selector" placeholder="#button, .class, etc">
                    </div>
                    <div class="property-item">
                        <label class="property-label">
                            <input type="checkbox" ${tile.data.waitFor ? 'checked' : ''} 
                                   data-property="waitFor"> Wait for element
                        </label>
                    </div>`;
                break;
                
            case 'input':
                propertiesHTML += `
                    <div class="property-item">
                        <label class="property-label">CSS Selector</label>
                        <input class="property-input" type="text" value="${tile.data.selector || ''}" 
                               data-property="selector" placeholder="#input, .field, etc">
                    </div>
                    <div class="property-item">
                        <label class="property-label">Value</label>
                        <input class="property-input" type="text" value="${tile.data.value || ''}" 
                               data-property="value" placeholder="Text to enter">
                    </div>
                    <div class="property-item">
                        <label class="property-label">
                            <input type="checkbox" ${tile.data.clear ? 'checked' : ''} 
                                   data-property="clear"> Clear field first
                        </label>
                    </div>`;
                break;
                
            case 'wait':
                propertiesHTML += `
                    <div class="property-item">
                        <label class="property-label">Duration (ms)</label>
                        <input class="property-input" type="number" value="${tile.data.duration || 1000}" 
                               data-property="duration" min="0" step="100">
                    </div>`;
                break;
        }
        
        propertiesHTML += `
            <div class="property-item">
                <label class="property-label">Step Name</label>
                <input class="property-input" type="text" value="${tile.data.name}" 
                       data-property="name">
            </div>`;
        
        this.propertiesPanel.innerHTML = propertiesHTML;
        
        // Bind property changes
        this.propertiesPanel.querySelectorAll('.property-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const property = e.target.dataset.property;
                let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                
                if (e.target.type === 'number') {
                    value = parseInt(value) || 0;
                }
                
                tile.data[property] = value;
                this.updateTileElement(tile);
            });
        });
    }
    
    hideProperties() {
        this.propertiesPanel.innerHTML = '<p class="empty-state">Select a step to view properties</p>';
    }
    
    updateTileElement(tile) {
        const element = document.getElementById(`tile-${tile.id}`);
        if (element) {
            element.querySelector('.tile-name').textContent = tile.data.name;
            element.querySelector('.tile-content').innerHTML = this.getTileContent(tile);
        }
    }
    
    handleTileAction(tile, action) {
        switch(action) {
            case 'edit':
                this.selectTile(tile);
                break;
                
            case 'duplicate':
                const newTile = this.addTile(tile.type, tile.x + 30, tile.y + 30, {...tile.data});
                newTile.data.name = tile.data.name + ' (Copy)';
                this.updateTileElement(newTile);
                break;
                
            case 'delete':
                this.deleteTile(tile);
                break;
        }
    }
    
    deleteTile(tile) {
        // Remove connections
        this.connections = this.connections.filter(conn => 
            conn.from !== tile.id && conn.to !== tile.id
        );
        
        // Remove from tiles array
        const index = this.tiles.findIndex(t => t.id === tile.id);
        if (index > -1) {
            this.tiles.splice(index, 1);
        }
        
        // Remove element
        const element = document.getElementById(`tile-${tile.id}`);
        if (element) {
            element.remove();
        }
        
        // Deselect if it was selected
        if (this.selectedTile === tile) {
            this.selectTile(null);
        }
    }
    
    startConnection(fromTile) {
        this.connectingFrom = fromTile;
        this.tilesContainer.style.cursor = 'crosshair';
    }
    
    completeConnection(toTile) {
        if (this.connectingFrom && this.connectingFrom !== toTile) {
            // Check if connection already exists
            const exists = this.connections.some(conn => 
                conn.from === this.connectingFrom.id && conn.to === toTile.id
            );
            
            if (!exists) {
                this.connections.push({
                    from: this.connectingFrom.id,
                    to: toTile.id
                });
            }
        }
        
        this.connectingFrom = null;
        this.tilesContainer.style.cursor = '';
    }
    
    drawConnections() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.strokeStyle = '#6366F1';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        
        this.connections.forEach(conn => {
            const fromTile = this.tiles.find(t => t.id === conn.from);
            const toTile = this.tiles.find(t => t.id === conn.to);
            
            if (fromTile && toTile) {
                const fromX = fromTile.x + fromTile.width;
                const fromY = fromTile.y + fromTile.height / 2;
                const toX = toTile.x;
                const toY = toTile.y + toTile.height / 2;
                
                this.ctx.beginPath();
                this.ctx.moveTo(fromX, fromY);
                
                // Create curved connection
                const controlX = (fromX + toX) / 2;
                this.ctx.bezierCurveTo(
                    controlX, fromY,
                    controlX, toY,
                    toX, toY
                );
                
                this.ctx.stroke();
                
                // Draw arrow
                const angle = Math.atan2(toY - fromY, toX - fromX);
                this.ctx.save();
                this.ctx.translate(toX, toY);
                this.ctx.rotate(angle);
                this.ctx.beginPath();
                this.ctx.moveTo(-10, -5);
                this.ctx.lineTo(0, 0);
                this.ctx.lineTo(-10, 5);
                this.ctx.stroke();
                this.ctx.restore();
            }
        });
    }
    
    changeZoom(delta) {
        this.zoom = Math.max(0.5, Math.min(2, this.zoom + delta));
        document.querySelector('.zoom-level').textContent = Math.round(this.zoom * 100) + '%';
        this.tilesContainer.style.transform = `scale(${this.zoom})`;
        this.tilesContainer.style.transformOrigin = '0 0';
    }
    
    fitToScreen() {
        if (this.tiles.length === 0) return;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        this.tiles.forEach(tile => {
            minX = Math.min(minX, tile.x);
            minY = Math.min(minY, tile.y);
            maxX = Math.max(maxX, tile.x + tile.width);
            maxY = Math.max(maxY, tile.y + tile.height);
        });
        
        const padding = 50;
        const boundsWidth = maxX - minX + padding * 2;
        const boundsHeight = maxY - minY + padding * 2;
        
        const scaleX = this.canvas.width / boundsWidth;
        const scaleY = this.canvas.height / boundsHeight;
        
        this.zoom = Math.min(scaleX, scaleY, 1);
        this.changeZoom(0);
    }
    
    autoArrange() {
        const spacing = 50;
        const startX = 100;
        const startY = 100;
        
        this.tiles.forEach((tile, index) => {
            tile.x = startX + (index % 4) * (tile.width + spacing);
            tile.y = startY + Math.floor(index / 4) * (tile.height + spacing);
            
            const element = document.getElementById(`tile-${tile.id}`);
            if (element) {
                element.style.left = `${tile.x}px`;
                element.style.top = `${tile.y}px`;
            }
        });
    }
    
    setupTestAutomation() {
        // Website loading
        const loadBtn = document.getElementById('load-website');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                console.log('Load website button clicked');
                this.loadWebsite();
            });
        } else {
            console.error('Load website button not found');
        }

        // Recording controls
        const startBtn = document.getElementById('start-recording');
        const stopBtn = document.getElementById('stop-recording');
        const playBtn = document.getElementById('play-test');

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log('Start recording clicked');
                this.startRecording();
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                console.log('Stop recording clicked');
                this.stopRecording();
            });
        }

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                console.log('Play test clicked');
                this.playTest();
            });
        }

        // Listen for messages from test window
        window.addEventListener('message', (event) => {
            this.handleTestWindowMessage(event);
        });
    }

    loadWebsite() {
        console.log('loadWebsite() called');
        const urlInput = document.getElementById('target-url');
        if (!urlInput) {
            console.error('URL input not found');
            return;
        }
        
        const url = urlInput.value.trim();
        console.log('URL entered:', url);
        
        if (!url) {
            alert('Please enter a URL');
            return;
        }

        // Ensure URL has protocol
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        
        // Clear existing tiles except navigation
        this.tiles = [];
        this.connections = [];
        this.selectedTile = null;
        this.tilesContainer.innerHTML = '';
        this.recordedSteps = [];
        this.currentTileY = 100;

        // Add navigation tile
        this.addTile('navigate', 100, this.currentTileY, {
            name: 'Navigate to URL',
            url: fullUrl
        });
        this.currentTileY += 150;

        // Open test window
        if (this.testWindow) {
            this.testWindow.close();
        }

        this.testWindow = window.open(fullUrl, 'test-window', 
            'width=1200,height=800,scrollbars=yes,resizable=yes');

        if (this.testWindow) {
            // Inject recorder script when window loads
            this.testWindow.addEventListener('load', () => {
                console.log('Test window loaded, injecting script...');
                setTimeout(() => {
                    this.injectRecorderScript();
                }, 1000); // Wait 1 second for page to fully load
            });

            this.updateRecordingStatus('Website loaded - Ready to record');
            this.updateControlButtons('loaded');
        } else {
            alert('Unable to open test window. Please check popup settings.');
        }
    }

    injectRecorderScript() {
        if (!this.testWindow || !this.testWindow.document) {
            console.error('Test window or document not available');
            return;
        }

        try {
            const script = this.testWindow.document.createElement('script');
            script.textContent = this.getRecorderScript();
            this.testWindow.document.head.appendChild(script);
            console.log('Script injected successfully');
            
            // Test if script loaded by checking for our function
            setTimeout(() => {
                if (this.testWindow.sendMessageToParent) {
                    console.log('Script functions available');
                } else {
                    console.error('Script functions not available');
                }
            }, 500);
        } catch (error) {
            console.error('Error injecting script:', error);
        }
    }

    getRecorderScript() {
        // Return the recorder script content (simplified version)
        return `
            (function() {
                let isRecording = false;
                let recordedSteps = [];
                
                window.addEventListener('message', (event) => {
                    console.log('Message received:', event.data, 'from origin:', event.origin);
                    // Allow messages from localhost:8284
                    if (!event.origin.includes('localhost:8284') && !event.origin.includes('127.0.0.1:8284')) {
                        console.log('Message rejected due to origin');
                        return;
                    }
                    
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
                    }
                });

                function sendMessageToParent(action, data = {}) {
                    console.log('Sending message to parent:', action, data);
                    if (window.opener) {
                        const message = {
                            action: action,
                            data: data,
                            source: 'test-recorder'
                        };
                        console.log('Message object:', message);
                        window.opener.postMessage(message, '*');
                    } else {
                        console.error('No window.opener found');
                    }
                }

                function getSelector(element) {
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

                    const path = [];
                    while (element && element.nodeType === Node.ELEMENT_NODE) {
                        let selector = element.nodeName.toLowerCase();
                        if (element.id) {
                            selector = '#' + element.id;
                            path.unshift(selector);
                            break;
                        } else {
                            let sibling = element;
                            let nth = 1;
                            while (sibling.previousElementSibling) {
                                sibling = sibling.previousElementSibling;
                                if (sibling.nodeName === element.nodeName) nth++;
                            }
                            if (nth > 1) selector += ':nth-of-type(' + nth + ')';
                        }
                        path.unshift(selector);
                        element = element.parentElement;
                    }
                    return path.join(' > ');
                }

                function startRecording() {
                    console.log('Starting recording in test window');
                    isRecording = true;
                    recordedSteps = [];
                    document.body.style.border = '3px solid #10b981';
                    
                    document.addEventListener('click', recordClick, true);
                    document.addEventListener('input', recordInput, true);
                    
                    sendMessageToParent('RECORDING_STARTED');
                    console.log('Recording started, event listeners attached');
                }

                function stopRecording() {
                    isRecording = false;
                    document.body.style.border = 'none';
                    
                    document.removeEventListener('click', recordClick, true);
                    document.removeEventListener('input', recordInput, true);
                    
                    sendMessageToParent('RECORDING_STOPPED', { steps: recordedSteps });
                }

                function recordClick(e) {
                    if (!isRecording) {
                        console.log('Click detected but not recording');
                        return;
                    }
                    
                    console.log('Recording click on:', e.target);
                    
                    const step = {
                        type: 'click',
                        selector: getSelector(e.target),
                        text: e.target.textContent?.trim().substring(0, 30) || 'element',
                        tagName: e.target.tagName.toLowerCase()
                    };
                    
                    recordedSteps.push(step);
                    console.log('Recorded step:', step);
                    sendMessageToParent('STEP_RECORDED', { step });
                }

                function recordInput(e) {
                    if (!isRecording) return;
                    
                    const selector = getSelector(e.target);
                    const step = {
                        type: 'input',
                        selector: selector,
                        value: e.target.value,
                        inputType: e.target.type || 'text'
                    };
                    
                    recordedSteps = recordedSteps.filter(s => !(s.type === 'input' && s.selector === selector));
                    recordedSteps.push(step);
                    sendMessageToParent('STEP_RECORDED', { step });
                }

                async function playRecording(steps) {
                    sendMessageToParent('PLAYBACK_STARTED');
                    
                    for (let step of steps) {
                        try {
                            await executeStep(step);
                            await delay(800);
                        } catch (error) {
                            sendMessageToParent('PLAYBACK_ERROR', { error: error.message });
                            break;
                        }
                    }
                    
                    sendMessageToParent('PLAYBACK_COMPLETED');
                }

                async function executeStep(step) {
                    const element = document.querySelector(step.selector);
                    if (!element) throw new Error('Element not found: ' + step.selector);
                    
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(300);
                    
                    const originalStyle = element.style.cssText;
                    element.style.outline = '3px solid #f59e0b';
                    element.style.outlineOffset = '2px';
                    
                    switch(step.type) {
                        case 'click':
                            element.click();
                            break;
                        case 'input':
                            element.focus();
                            element.value = '';
                            for (let char of step.value) {
                                element.value += char;
                                element.dispatchEvent(new Event('input', { bubbles: true }));
                                await delay(50);
                            }
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                    }
                    
                    await delay(200);
                    element.style.cssText = originalStyle;
                }

                function delay(ms) {
                    return new Promise(resolve => setTimeout(resolve, ms));
                }

                // Expose functions globally for debugging
                window.sendMessageToParent = sendMessageToParent;
                window.startRecording = startRecording;
                window.stopRecording = stopRecording;
                window.isRecording = () => isRecording;
                
                sendMessageToParent('RECORDER_READY');
                console.log('Test recorder ready, functions exposed globally');
            })();
        `;
    }

    startRecording() {
        if (!this.testWindow) {
            alert('Please load a website first');
            return;
        }

        this.isRecording = true;
        this.recordedSteps = [];
        
        // Send message to test window
        this.testWindow.postMessage({
            action: 'START_RECORDING'
        }, '*');

        this.updateRecordingStatus('Recording interactions...');
        this.updateControlButtons('recording');
    }

    stopRecording() {
        if (!this.testWindow) return;

        this.isRecording = false;
        
        // Send message to test window
        this.testWindow.postMessage({
            action: 'STOP_RECORDING'
        }, '*');

        this.updateRecordingStatus('Recording stopped');
        this.updateControlButtons('loaded');
    }

    playTest() {
        if (!this.testWindow) {
            alert('Please load a website first');
            return;
        }

        if (this.recordedSteps.length === 0) {
            alert('No recorded steps to play');
            return;
        }

        // Send recorded steps to test window
        this.testWindow.postMessage({
            action: 'PLAY_RECORDING',
            data: { steps: this.recordedSteps }
        }, '*');

        this.updateRecordingStatus('Playing test...');
        this.updateControlButtons('playing');
    }

    handleTestWindowMessage(event) {
        console.log('Main window received message:', event.data);
        
        if (!event.data || event.data.source !== 'test-recorder') {
            console.log('Message ignored - not from test recorder. Source:', event.data?.source);
            console.log('Full event data:', event.data);
            return;
        }

        const { action, data } = event.data;
        console.log('Processing action:', action);

        switch(action) {
            case 'RECORDER_READY':
                console.log('Recorder ready in test window');
                break;

            case 'RECORDING_STARTED':
                console.log('Recording started');
                break;

            case 'STEP_RECORDED':
                this.handleStepRecorded(data.step);
                break;

            case 'RECORDING_STOPPED':
                this.recordedSteps = data.steps;
                console.log('Recording stopped, total steps:', data.steps.length);
                break;

            case 'PLAYBACK_STARTED':
                console.log('Playback started');
                break;

            case 'PLAYBACK_COMPLETED':
                this.updateRecordingStatus('Test completed successfully');
                this.updateControlButtons('loaded');
                break;

            case 'PLAYBACK_ERROR':
                this.updateRecordingStatus('Test failed: ' + data.error);
                this.updateControlButtons('loaded');
                break;
        }
    }

    handleStepRecorded(step) {
        console.log('Step recorded:', step);
        
        // Auto-generate tile for recorded step
        const tileData = this.convertStepToTileData(step);
        this.addTile(step.type, 100, this.currentTileY, tileData);
        
        // Connect to previous tile
        if (this.tiles.length > 1) {
            const prevTile = this.tiles[this.tiles.length - 2];
            const newTile = this.tiles[this.tiles.length - 1];
            this.connections.push({
                from: prevTile.id,
                to: newTile.id
            });
        }
        
        this.currentTileY += 150;
        
        // Update recorded steps array
        this.recordedSteps.push(step);
        
        this.updateRecordingStatus(`Recorded ${this.recordedSteps.length} steps`);
    }

    convertStepToTileData(step) {
        switch(step.type) {
            case 'click':
                return {
                    name: `Click ${step.text}`,
                    selector: step.selector,
                    waitFor: true
                };
            case 'input':
                return {
                    name: `Enter "${step.value}"`,
                    selector: step.selector,
                    value: step.value,
                    clear: true
                };
            default:
                return {
                    name: `${step.type} action`,
                    ...step
                };
        }
    }

    updateRecordingStatus(status) {
        const statusElement = document.getElementById('recording-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    updateControlButtons(state) {
        const startBtn = document.getElementById('start-recording');
        const stopBtn = document.getElementById('stop-recording');
        const playBtn = document.getElementById('play-test');

        // Reset all buttons
        [startBtn, stopBtn, playBtn].forEach(btn => {
            btn.disabled = true;
        });

        switch(state) {
            case 'loaded':
                startBtn.disabled = false;
                playBtn.disabled = this.recordedSteps.length === 0;
                break;
            case 'recording':
                stopBtn.disabled = false;
                break;
            case 'playing':
                // All buttons disabled during playback
                break;
        }
    }

    animate() {
        this.drawConnections();
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new FlowCanvas();
});