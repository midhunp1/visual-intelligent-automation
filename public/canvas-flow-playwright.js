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
        
        // Playwright automation properties
        this.sessionId = null;
        this.isRecording = false;
        this.recordedSteps = [];
        this.currentTileY = 100;
        this.currentUrl = null; // Track current URL for current-state recording
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupPlaywrightAutomation();
        this.setupSocketConnection();
        this.animate();
    }
    
    setupSocketConnection() {
        // Initialize Socket.IO connection for real-time updates
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            // Listen for real-time step updates from Playwright Codegen
            this.socket.on('step-recorded', (stepData) => {
                console.log('Real-time step received:', stepData);
                this.addRealtimeStep(stepData);
            });
            
            this.socket.on('recording-started', () => {
                console.log('Real-time recording started');
                this.isRecording = true;
                this.updateRecordingStatus('Recording in progress (real-time sync active)...');
            });
            
            this.socket.on('recording-stopped', () => {
                console.log('Real-time recording stopped');
                this.isRecording = false;
                this.updateRecordingStatus('Recording stopped (real-time)');
            });
        }
    }
    
    addRealtimeStep(stepData) {
        // Only add steps if we're in recording mode
        if (!this.isRecording) return;
        
        // Convert the step data to tile format
        let tileData = {};
        let tileType = stepData.type || 'click';
        
        switch(stepData.type) {
            case 'navigate':
                tileData = {
                    name: 'Navigate to URL',
                    url: stepData.url || stepData.value
                };
                tileType = 'navigate';
                break;
            case 'click':
                tileData = {
                    name: `Click ${stepData.value || 'Element'}`,
                    selector: stepData.selector,
                    waitFor: true
                };
                break;
            case 'fill':
            case 'type':
                tileData = {
                    name: `Enter "${stepData.value || ''}"`,
                    selector: stepData.selector,
                    value: stepData.value,
                    clear: true
                };
                tileType = 'input';
                break;
            case 'press':
                tileData = {
                    name: `Press ${stepData.value}`,
                    selector: stepData.selector || '',
                    key: stepData.value
                };
                tileType = 'click';
                break;
            default:
                tileData = {
                    name: stepData.action || 'Action',
                    selector: stepData.selector || '',
                    value: stepData.value || ''
                };
        }
        
        // Add tile to canvas
        this.addTile(tileType, 100, this.currentTileY, tileData);
        
        // Connect to previous tile if exists
        if (this.tiles.length > 1) {
            const prevTile = this.tiles[this.tiles.length - 2];
            const newTile = this.tiles[this.tiles.length - 1];
            this.connections.push({
                from: prevTile.id,
                to: newTile.id
            });
        }
        
        // Update position for next tile
        this.currentTileY += 150;
        
        // Add to recorded steps array
        this.recordedSteps.push(stepData);
        
        // Update status
        this.updateRecordingStatus(`Recording... (${this.recordedSteps.length} steps captured in real-time)`);
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
        document.getElementById('zoom-in')?.addEventListener('click', () => this.changeZoom(0.1));
        document.getElementById('zoom-out')?.addEventListener('click', () => this.changeZoom(-0.1));
        document.getElementById('zoom-fit')?.addEventListener('click', () => this.fitToScreen());
        
        // Grid toggle
        document.getElementById('grid-toggle')?.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            document.getElementById('grid-toggle').classList.toggle('active');
        });
        
        // Auto arrange
        document.getElementById('auto-arrange')?.addEventListener('click', () => this.autoArrange());
        
        // Open VNC Viewer
        document.getElementById('open-vnc')?.addEventListener('click', () => {
            // Use configuration to determine VNC URL
            if (window.VIAConfig && window.VIAConfig.shouldOpenVNCInBrowser()) {
                // For live site, open Cloudflare tunnel URL in browser
                const tunnelUrl = window.VIAConfig.getVNCUrl();
                window.open(tunnelUrl, '_blank');
            } else {
                // For local, open local noVNC
                window.open('http://localhost:6086/vnc.html', '_blank');
            }
        });
        
        // Canvas click for deselect, delete buttons, and tile selection
        this.tilesContainer.addEventListener('click', (e) => {
            // Check if delete button was clicked
            const deleteBtn = e.target.closest('.tile-delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const tileId = deleteBtn.getAttribute('data-tile-id');
                this.deleteTile(tileId);
                return;
            }
            
            // Check if clicking on a tile
            const tileElement = e.target.closest('.flow-tile');
            if (tileElement) {
                console.log('Tile clicked:', tileElement);
                const tileId = parseInt(tileElement.id.replace('tile-', ''));
                const tile = this.tiles.find(t => t.id === tileId);
                console.log('Found tile:', tile);
                if (tile) {
                    this.selectTile(tile);
                    this.showProperties(tile);
                }
                return;
            }
            
            // Check if clicking on empty canvas area
            if (e.target === this.tilesContainer) {
                this.selectTile(null);
                this.hideProperties();
            }
        });
    }

    setupPlaywrightAutomation() {
        // Website loading
        const loadBtn = document.getElementById('load-website');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                console.log('Load website button clicked');
                this.loadWebsite();
            });
        }

        // Recording controls
        const startBtn = document.getElementById('start-recording');
        const stopBtn = document.getElementById('stop-recording');
        const playBtn = document.getElementById('play-test');
        const stopPlayBtn = document.getElementById('stop-playback');

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

        if (stopPlayBtn) {
            stopPlayBtn.addEventListener('click', () => {
                console.log('Stop playback clicked');
                this.stopPlayback();
            });
        }

    }

    async loadWebsite() {
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
        
        try {
            // Close existing session if any
            if (this.sessionId) {
                await this.closeSession();
            }

            // Generate new session ID
            this.sessionId = 'session_' + Date.now();
            this.currentUrl = fullUrl; // Store the current URL
            
            // Clear existing tiles
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

            this.updateRecordingStatus('Starting browser session...');

            // Start browser session via API
            const response = await fetch('/api/start-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: fullUrl,
                    sessionId: this.sessionId
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.updateRecordingStatus('Browser ready - Click Start Recording');
                this.updateControlButtons('loaded');
                console.log('Browser session started successfully');
            } else {
                throw new Error(result.error || 'Failed to start browser session');
            }

        } catch (error) {
            console.error('Error loading website:', error);
            this.updateRecordingStatus('Error: ' + error.message);
            alert('Error loading website: ' + error.message);
        }
    }

    async startRecording() {
        if (!this.sessionId) {
            alert('Please load a website first');
            return;
        }

        try {
            this.updateRecordingStatus('Starting recording...');
            this.updateControlButtons('recording');

            const requestBody = {
                sessionId: this.sessionId
            };

            const response = await fetch('/api/start-recording', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            
            if (result.success) {
                this.isRecording = true;
                
                // Emit recording started event for real-time sync
                if (this.socket) {
                    this.socket.emit('recording-started', { sessionId: this.sessionId });
                }
                
                this.updateRecordingStatus('Recording... Interact with the browser');
                console.log('Recording started successfully');
            } else {
                throw new Error(result.error || 'Failed to start recording');
            }

        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateRecordingStatus('Error: ' + error.message);
            this.updateControlButtons('loaded');
        }
    }

    async stopRecording() {
        if (!this.sessionId) return;

        try {
            this.isRecording = false;
            this.updateRecordingStatus('Stopping recording...');

            const response = await fetch('/api/stop-recording', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.recordedSteps = result.steps || [];
                this.updateRecordingStatus(`Recording stopped - ${this.recordedSteps.length} steps captured`);
                this.updateControlButtons('loaded');
                
                // Generate tiles for recorded steps
                this.generateTilesFromSteps(result.steps);
                
                console.log('Recording stopped, steps:', result.steps);
            } else {
                throw new Error(result.error || 'Failed to stop recording');
            }

        } catch (error) {
            console.error('Error stopping recording:', error);
            this.updateRecordingStatus('Error: ' + error.message);
            this.updateControlButtons('loaded');
        }
    }

    async playTest() {
        if (!this.sessionId) {
            alert('Please load a website first');
            return;
        }

        if (this.recordedSteps.length === 0) {
            alert('No recorded steps to play');
            return;
        }

        try {
            this.updateRecordingStatus('Playing test...');
            this.updateControlButtons('playing');

            const response = await fetch('/api/play-recording', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });

            const result = await response.json();
            
            if (result.success) {
                if (result.stoppedAt !== undefined) {
                    this.updateRecordingStatus(`Playback stopped at step ${result.stoppedAt + 1}`);
                } else {
                    this.updateRecordingStatus('Test completed successfully');
                }
                this.updateControlButtons('loaded');
                console.log('Playback completed successfully');
            } else {
                throw new Error(result.error || 'Playback failed');
            }

        } catch (error) {
            console.error('Error during playback:', error);
            this.updateRecordingStatus('Playback error: ' + error.message);
            this.updateControlButtons('loaded');
        }
    }

    async stopPlayback() {
        if (!this.sessionId) return;

        try {
            this.updateRecordingStatus('Stopping playback...');

            const response = await fetch('/api/stop-playback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.updateRecordingStatus('Playback stopped');
                this.updateControlButtons('loaded');
                console.log('Playback stopped successfully');
            } else {
                console.warn('Could not stop playback:', result.error);
            }

        } catch (error) {
            console.error('Error stopping playback:', error);
            this.updateControlButtons('loaded');
        }
    }

    async closeSession() {
        if (!this.sessionId) return;

        try {
            const response = await fetch('/api/close-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });

            if (response.ok) {
                console.log('Session closed successfully');
            }
        } catch (error) {
            console.warn('Error closing session:', error);
        }
    }

    generateTilesFromSteps(steps) {
        steps.forEach(step => {
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
        });
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
        const stopPlayBtn = document.getElementById('stop-playback');

        // Reset all buttons
        [startBtn, stopBtn, playBtn, stopPlayBtn].forEach(btn => {
            if (btn) btn.disabled = true;
        });

        // Hide/show stop playback button
        if (stopPlayBtn) {
            stopPlayBtn.style.display = state === 'playing' ? 'inline-flex' : 'none';
        }
        if (playBtn) {
            playBtn.style.display = state === 'playing' ? 'none' : 'inline-flex';
        }

        switch(state) {
            case 'loaded':
                if (startBtn) startBtn.disabled = false;
                if (playBtn) playBtn.disabled = this.recordedSteps.length === 0;
                break;
            case 'recording':
                if (stopBtn) stopBtn.disabled = false;
                break;
            case 'playing':
                // Show stop playback button during playback
                if (stopPlayBtn) stopPlayBtn.disabled = false;
                break;
        }
    }

    // Include minimal tile management - keeping original methods
    setupDragAndDrop() {
        // Simplified drag and drop for tiles
        const stepItems = document.querySelectorAll('.step-item');
        
        stepItems.forEach(item => {
            item.setAttribute('draggable', 'true');
            
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('stepType', item.dataset.type);
                item.style.opacity = '0.5';
            });
            
            item.addEventListener('dragend', (e) => {
                item.style.opacity = '1';
            });
        });
        
        this.tilesContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        this.tilesContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            const stepType = e.dataTransfer.getData('stepType');
            if (stepType) {
                const rect = this.tilesContainer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                this.addTile(stepType, x, y);
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
        return tile;
    }
    
    getDefaultName(type) {
        const names = {
            navigate: 'Navigate to URL',
            click: 'Click Element', 
            input: 'Enter Text'
        };
        return names[type] || 'Step';
    }
    
    getDefaultData(type) {
        const defaults = {
            navigate: { url: '' },
            click: { selector: '', waitFor: true },
            input: { selector: '', value: '', clear: true }
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
            <div class="tile-header">
                <div class="tile-icon ${tile.type}">
                    ${this.getIcon(tile.type)}
                </div>
                <div class="tile-title">
                    <div class="tile-name">${tile.data.name}</div>
                    <div class="tile-type">${tile.type}</div>
                </div>
                <button class="tile-delete-btn" data-tile-id="${tile.id}" title="Delete step">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </div>
            <div class="tile-content">
                ${this.getTileContent(tile)}
            </div>
        `;
        
        this.tilesContainer.appendChild(element);
    }
    
    getIcon(type) {
        const icons = {
            navigate: '<svg width="20" height="20" fill="currentColor"><path d="M10 2L3 9h4v9h6V9h4z"/></svg>',
            click: '<svg width="20" height="20" fill="currentColor"><circle cx="10" cy="10" r="3"/></svg>',
            input: '<svg width="20" height="20" fill="currentColor"><rect x="2" y="6" width="16" height="8" rx="1"/></svg>'
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
            default:
                return '';
        }
    }
    
    selectTile(tile) {
        this.selectedTile = tile;
    }
    
    deleteTile(tileId) {
        if (!tileId) return;
        
        // Convert tileId to number if it's a string
        const id = parseInt(tileId);
        
        // Find the tile in the tiles array
        const tileIndex = this.tiles.findIndex(tile => tile.id === id);
        if (tileIndex === -1) return;
        
        const tile = this.tiles[tileIndex];
        
        // Show confirmation dialog
        if (!confirm(`Delete step "${tile.data.name}"?`)) {
            return;
        }
        
        // Remove tile from DOM
        const tileElement = document.getElementById(`tile-${tile.id}`);
        if (tileElement) {
            tileElement.remove();
        }
        
        // Remove tile from tiles array
        this.tiles.splice(tileIndex, 1);
        
        // Remove any connections involving this tile
        this.connections = this.connections.filter(
            conn => conn.from !== tile.id && conn.to !== tile.id
        );
        
        // If this was the selected tile, deselect it
        if (this.selectedTile && this.selectedTile.id === tile.id) {
            this.selectedTile = null;
            this.hideProperties();
        }
        
        // Redraw connections
        this.drawConnections();
        
        console.log(`Deleted tile: ${tile.data.name}`);
    }
    
    hideProperties() {
        this.propertiesPanel.innerHTML = '<p class="empty-state">Select a step to view properties</p>';
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
                
                const controlX = (fromX + toX) / 2;
                this.ctx.bezierCurveTo(
                    controlX, fromY,
                    controlX, toY,
                    toX, toY
                );
                
                this.ctx.stroke();
            }
        });
    }
    
    changeZoom(delta) {
        this.zoom = Math.max(0.5, Math.min(2, this.zoom + delta));
        document.querySelector('.zoom-level').textContent = Math.round(this.zoom * 100) + '%';
    }
    
    fitToScreen() {
        // Simple implementation
        this.zoom = 1;
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
    
    animate() {
        this.drawConnections();
        requestAnimationFrame(() => this.animate());
    }
    
    showProperties(tile) {
        console.log('showProperties called for tile:', tile);
        alert(`Showing properties for ${tile.type} tile`);
        const propertiesPanel = document.getElementById('properties-panel');
        if (!propertiesPanel || !tile) {
            console.log('Properties panel or tile not found:', {propertiesPanel, tile});
            return;
        }
        
        // Clear current properties
        propertiesPanel.innerHTML = '';
        
        // Create properties form based on tile type
        const form = document.createElement('div');
        form.className = 'properties-form';
        form.style.background = '#f9fafb';
        form.style.padding = '16px';
        form.style.border = '2px solid #3B82F6';
        form.style.borderRadius = '6px';
        
        // Title
        const title = document.createElement('h4');
        title.textContent = `${tile.type.charAt(0).toUpperCase() + tile.type.slice(1)} Properties`;
        title.style.marginBottom = '16px';
        title.style.color = '#374151';
        form.appendChild(title);
        
        // Step Name
        const nameGroup = this.createFormGroup('Name', 'text', tile.data.name || '', (value) => {
            tile.data.name = value;
            this.updateTileDisplay(tile);
        });
        form.appendChild(nameGroup);
        
        // Type-specific properties
        switch(tile.type) {
            case 'navigate':
                const urlGroup = this.createFormGroup('URL', 'url', tile.data.url || '', (value) => {
                    tile.data.url = value;
                });
                form.appendChild(urlGroup);
                break;
                
            case 'click':
                const selectorGroup = this.createFormGroup('CSS Selector', 'text', tile.data.selector || '', (value) => {
                    tile.data.selector = value;
                });
                form.appendChild(selectorGroup);
                
                const waitGroup = this.createCheckboxGroup('Wait for element', tile.data.waitFor || false, (value) => {
                    tile.data.waitFor = value;
                });
                form.appendChild(waitGroup);
                break;
                
            case 'input':
                const inputSelectorGroup = this.createFormGroup('CSS Selector', 'text', tile.data.selector || '', (value) => {
                    tile.data.selector = value;
                });
                form.appendChild(inputSelectorGroup);
                
                const valueGroup = this.createFormGroup('Text Value', 'text', tile.data.value || '', (value) => {
                    tile.data.value = value;
                });
                form.appendChild(valueGroup);
                
                const clearGroup = this.createCheckboxGroup('Clear field first', tile.data.clear !== false, (value) => {
                    tile.data.clear = value;
                });
                form.appendChild(clearGroup);
                break;
                
            case 'validate':
                const validateSelectorGroup = this.createFormGroup('CSS Selector', 'text', tile.data.selector || '', (value) => {
                    tile.data.selector = value;
                });
                form.appendChild(validateSelectorGroup);
                
                const expectedGroup = this.createFormGroup('Expected Value', 'text', tile.data.expected || '', (value) => {
                    tile.data.expected = value;
                });
                form.appendChild(expectedGroup);
                break;
                
            case 'wait':
                const durationGroup = this.createFormGroup('Duration (seconds)', 'number', tile.data.duration || '1', (value) => {
                    tile.data.duration = parseInt(value) || 1;
                });
                form.appendChild(durationGroup);
                break;
                
            case 'condition':
                const conditionSelectorGroup = this.createFormGroup('CSS Selector', 'text', tile.data.selector || '', (value) => {
                    tile.data.selector = value;
                });
                form.appendChild(conditionSelectorGroup);
                
                const conditionGroup = this.createFormGroup('Condition', 'text', tile.data.condition || '', (value) => {
                    tile.data.condition = value;
                });
                form.appendChild(conditionGroup);
                break;
        }
        
        propertiesPanel.appendChild(form);
    }
    
    hideProperties() {
        const propertiesPanel = document.getElementById('properties-panel');
        if (propertiesPanel) {
            propertiesPanel.innerHTML = '<p class="empty-state">Select a step to view properties</p>';
        }
    }
    
    createFormGroup(label, type, value, onchange) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.marginBottom = '16px';
        
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '4px';
        labelEl.style.fontSize = '12px';
        labelEl.style.fontWeight = '600';
        labelEl.style.color = '#6B7280';
        labelEl.style.textTransform = 'uppercase';
        
        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.border = '1px solid #D1D5DB';
        input.style.borderRadius = '4px';
        input.style.fontSize = '14px';
        
        input.addEventListener('input', () => onchange(input.value));
        
        group.appendChild(labelEl);
        group.appendChild(input);
        
        return group;
    }
    
    createCheckboxGroup(label, checked, onchange) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.marginBottom = '16px';
        group.style.display = 'flex';
        group.style.alignItems = 'center';
        group.style.gap = '8px';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.style.fontSize = '14px';
        labelEl.style.color = '#374151';
        labelEl.style.cursor = 'pointer';
        
        input.addEventListener('change', () => onchange(input.checked));
        labelEl.addEventListener('click', () => {
            input.checked = !input.checked;
            onchange(input.checked);
        });
        
        group.appendChild(input);
        group.appendChild(labelEl);
        
        return group;
    }
    
    updateTileDisplay(tile) {
        const element = document.getElementById(`tile-${tile.id}`);
        if (element) {
            const nameEl = element.querySelector('.tile-name');
            if (nameEl) {
                nameEl.textContent = tile.data.name;
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new FlowCanvas();
});