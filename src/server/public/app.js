// Global variables
let socket;
let selectedAgent = null;
let agents = [];
let messageHistory = {};
let analyticsData = {};
let charts = {};
let startTime = Date.now();

// Chat configuration
const MAX_MESSAGES_PER_AGENT = 100;
const AUTO_SCROLL_THRESHOLD = 100; // pixels from bottom

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    initializeUI();
    startUptime();
});

// Socket.IO initialization and event handlers
function initializeSocket() {
    socket = io();
    
    // Hide loading overlay once connected
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('web-client-connect');
        hideLoading();
        showNotification('Connected to Mindcraft server', 'success');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showNotification('Disconnected from server', 'error');
        showLoading();
    });

    // Agent updates
    socket.on('agents-update', (agentList) => {
        agents = agentList;
        updateAgentsList();
        updateAgentTabs();
        updateHeaderStats();
    });

    // Analytics updates
    socket.on('analytics-update', (data) => {
        analyticsData = data;
        updateAnalytics();
        updateAgentStatusCards();
        updateHeaderStats();
    });

    // Message history
    socket.on('message-history', (agentName, history) => {
        messageHistory[agentName] = history;
        if (selectedAgent === agentName) {
            displayMessages(agentName);
        }
    });

    // New messages
    socket.on('new-message', (agentName, messageData) => {
        if (!messageHistory[agentName]) {
            messageHistory[agentName] = [];
        }
        
        // Add message and limit history
        messageHistory[agentName].push(messageData);
        if (messageHistory[agentName].length > MAX_MESSAGES_PER_AGENT) {
            messageHistory[agentName] = messageHistory[agentName].slice(-MAX_MESSAGES_PER_AGENT);
        }
        
        if (selectedAgent === agentName) {
            addMessageToChat(messageData);
        }
        
        // Show notification for agent responses
        if (messageData.type === 'response') {
            showNotification(`${agentName}: ${messageData.message.substring(0, 50)}...`, 'info');
        }
    });

    // Message history cleared
    socket.on('message-history-cleared', (agentName) => {
        messageHistory[agentName] = [];
        if (selectedAgent === agentName) {
            displayMessages(agentName);
        }
        showNotification(`Message history cleared for ${agentName}`, 'info');
    });

    // Analytics export
    socket.on('analytics-export', (data) => {
        downloadAnalytics(data);
    });

    // Socket event for settings
    socket.on('settings-data', (settings) => {
        currentSettings = settings;
        displaySettings(settings);
    });

    // Socket event for settings save result
    socket.on('settings-save-result', (result) => {
        if (result.success) {
            showNotification(result.message || 'Settings saved successfully', 'success');
        } else {
            showNotification(result.error || 'Failed to save settings', 'error');
        }
    });

    // Socket events for viewer functionality
    socket.on('viewer-ports', (viewerPorts) => {
        window.viewerPorts = viewerPorts;
        updateBotSelector();
    });

    socket.on('viewer-port-status', (data) => {
        if (data.port === currentViewerPort) {
            const statusText = document.getElementById('status-text');
            const statusDot = document.querySelector('#viewer-status .status-dot');
            
            if (data.available) {
                statusText.textContent = `Connected to ${currentBotName}`;
                statusDot.className = 'status-dot online';
            } else {
                statusText.textContent = `Viewer unavailable for ${currentBotName}`;
                statusDot.className = 'status-dot offline';
            }
        }
    });
}

// UI initialization
function initializeUI() {
    // Message input event listeners
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
    
    // Initialize charts
    initializeCharts();
    
    // Load settings on startup
    loadSettings();
    
    // Initialize world view when switching to that tab
    const worldViewTab = document.querySelector('[onclick="switchTab(\'worldview\')"]');
    if (worldViewTab) {
        worldViewTab.addEventListener('click', () => {
            setTimeout(initWorldView, 100);
        });
    }
}

// Update agents list in sidebar
function updateAgentsList() {
    const agentsList = document.getElementById('agents-list');
    
    if (agents.length === 0) {
        agentsList.innerHTML = '<div class="no-agents">No agents connected</div>';
        return;
    }
    
    agentsList.innerHTML = agents.map(agent => `
        <div class="agent-item ${selectedAgent === agent.name ? 'selected' : ''}" 
             onclick="selectAgent('${agent.name}')">
            <div class="agent-header">
                <span class="agent-name">${agent.name}</span>
                <div class="agent-status">
                    <span class="status-dot ${agent.in_game ? 'online' : 'offline'}"></span>
                    <span>${agent.in_game ? 'Online' : 'Offline'}</span>
                </div>
            </div>
            <div class="agent-controls">
                ${agent.in_game ? `
                    <button class="btn btn-danger" onclick="stopAgent('${agent.name}', event)">
                        <i class="fas fa-stop"></i> Stop
                    </button>
                    <button class="btn btn-success" onclick="restartAgent('${agent.name}', event)">
                        <i class="fas fa-redo"></i> Restart
                    </button>
                ` : `
                    <button class="btn btn-primary" onclick="startAgent('${agent.name}', event)">
                        <i class="fas fa-play"></i> Start
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

// Update agent tabs in chat
function updateAgentTabs() {
    const agentTabs = document.getElementById('agent-tabs');
    
    if (agents.length === 0) {
        agentTabs.innerHTML = '<div class="no-agent-selected">No agents available</div>';
        return;
    }
    
    const onlineAgents = agents.filter(agent => agent.in_game);
    
    if (onlineAgents.length === 0) {
        agentTabs.innerHTML = '<div class="no-agent-selected">No agents online</div>';
        return;
    }
    
    agentTabs.innerHTML = onlineAgents.map(agent => `
        <div class="agent-tab ${selectedAgent === agent.name ? 'active' : ''}" 
             onclick="selectAgent('${agent.name}')">
            <span class="status-dot online"></span>
            ${agent.name}
        </div>
    `).join('');
}

// Select an agent for communication
function selectAgent(agentName) {
    selectedAgent = agentName;
    updateAgentsList();
    updateAgentTabs();
    displayMessages(agentName);
    
    // Show chat input
    const chatInputContainer = document.getElementById('chat-input-container');
    chatInputContainer.style.display = 'block';
    
    // Focus on input
    document.getElementById('message-input').focus();
}

// Display messages for selected agent
function displayMessages(agentName) {
    const chatMessages = document.getElementById('chat-messages');
    const messages = messageHistory[agentName] || [];
    
    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-robot"></i>
                <h3>Chat with ${agentName}</h3>
                <p>Start a conversation by typing a message below</p>
            </div>
        `;
        return;
    }
    
    // Limit messages displayed to prevent performance issues
    const displayMessages = messages.slice(-MAX_MESSAGES_PER_AGENT);
    chatMessages.innerHTML = displayMessages.map(msg => createMessageHTML(msg)).join('');
    
    // Auto-scroll to bottom
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 10);
}

// Create HTML for a message
function createMessageHTML(messageData) {
    const isOutgoing = messageData.from === 'web-client';
    const time = new Date(messageData.timestamp).toLocaleTimeString();
    
    return `
        <div class="message ${isOutgoing ? 'outgoing' : 'incoming'}">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${isOutgoing ? 'You' : messageData.from}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${escapeHtml(messageData.message)}</div>
            </div>
        </div>
    `;
}

// Add new message to chat
function addMessageToChat(messageData) {
    const chatMessages = document.getElementById('chat-messages');
    
    // Check if user is near bottom before adding message
    const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < AUTO_SCROLL_THRESHOLD;
    
    const messageHTML = createMessageHTML(messageData);
    chatMessages.insertAdjacentHTML('beforeend', messageHTML);
    
    // Remove old messages if we exceed the limit
    const messages = chatMessages.querySelectorAll('.message');
    if (messages.length > MAX_MESSAGES_PER_AGENT) {
        const messagesToRemove = messages.length - MAX_MESSAGES_PER_AGENT;
        for (let i = 0; i < messagesToRemove; i++) {
            if (messages[i] && !messages[i].classList.contains('welcome-message')) {
                messages[i].remove();
            }
        }
    }
    
    // Auto-scroll only if user was near bottom
    if (isNearBottom) {
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 10);
    }
}

// Send message to agent
function sendMessage() {
    if (!selectedAgent) {
        showNotification('Please select an agent first', 'warning');
        return;
    }
    
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    socket.emit('send-message', selectedAgent, message);
    messageInput.value = '';
    messageInput.focus();
}

// Insert quick command
function insertCommand(command) {
    const messageInput = document.getElementById('message-input');
    messageInput.value = command;
    messageInput.focus();
}

// Agent control functions
function startAgent(agentName, event) {
    if (event) event.stopPropagation();
    socket.emit('start-agent', agentName);
    showNotification(`Starting agent ${agentName}`, 'info');
}

function stopAgent(agentName, event) {
    if (event) event.stopPropagation();
    socket.emit('stop-agent', agentName);
    showNotification(`Stopping agent ${agentName}`, 'info');
}

function restartAgent(agentName, event) {
    if (event) event.stopPropagation();
    socket.emit('restart-agent', agentName);
    showNotification(`Restarting agent ${agentName}`, 'info');
}

function stopAllAgents() {
    if (confirm('Are you sure you want to stop all agents?')) {
        socket.emit('stop-all-agents');
        showNotification('Stopping all agents', 'warning');
    }
}

function shutdown() {
    if (confirm('Are you sure you want to shutdown the server?')) {
        socket.emit('shutdown');
        showNotification('Shutting down server', 'warning');
    }
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Initialize charts if switching to analytics
    if (tabName === 'analytics') {
        setTimeout(updateCharts, 100);
    }
}

// Analytics functions
function updateAnalytics() {
    if (!analyticsData.agents) return;
    
    updateCombatStats();
    updateCharts();
}

function updateCombatStats() {
    if (!analyticsData.agents) return;
    
    const totalKills = analyticsData.agents.reduce((sum, agent) => sum + (agent.combatStats?.kills || 0), 0);
    const totalDeaths = analyticsData.agents.reduce((sum, agent) => sum + (agent.combatStats?.deaths || 0), 0);
    const totalDamageDealt = analyticsData.agents.reduce((sum, agent) => sum + (agent.combatStats?.damageDealt || 0), 0);
    const totalDamageTaken = analyticsData.agents.reduce((sum, agent) => sum + (agent.combatStats?.damageTaken || 0), 0);
    
    document.getElementById('total-kills').textContent = totalKills;
    document.getElementById('total-deaths').textContent = totalDeaths;
    document.getElementById('total-damage-dealt').textContent = Math.round(totalDamageDealt);
    document.getElementById('total-damage-taken').textContent = Math.round(totalDamageTaken);
}

// Chart initialization and updates
function initializeCharts() {
    const ctx1 = document.getElementById('activity-chart');
    const ctx2 = document.getElementById('message-chart');
    const ctx3 = document.getElementById('time-chart');
    const ctx4 = document.getElementById('death-chart');
    
    if (ctx1) {
        charts.activity = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Active Agents',
                    data: [],
                    borderColor: '#64ffda',
                    backgroundColor: 'rgba(100, 255, 218, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false
                },
                plugins: {
                    legend: { labels: { color: '#e0e6ed' } }
                },
                scales: {
                    x: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    y: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                },
                layout: {
                    padding: 10
                }
            }
        });
    }
    
    if (ctx2) {
        charts.messages = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#64ffda', '#2196f3', '#4caf50', '#ff9800', '#f44336']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false
                },
                plugins: {
                    legend: { labels: { color: '#e0e6ed' } }
                },
                layout: {
                    padding: 10
                }
            }
        });
    }
    
    if (ctx3) {
        charts.time = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Online Time (hours)',
                    data: [],
                    backgroundColor: 'rgba(100, 255, 218, 0.6)',
                    borderColor: '#64ffda',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false
                },
                plugins: {
                    legend: { labels: { color: '#e0e6ed' } }
                },
                scales: {
                    x: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    y: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                },
                layout: {
                    padding: 10
                }
            }
        });
    }
    
    if (ctx4) {
        charts.deaths = new Chart(ctx4, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Deaths Over Time',
                    data: [],
                    borderColor: '#f44336',
                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false
                },
                plugins: {
                    legend: { labels: { color: '#e0e6ed' } }
                },
                scales: {
                    x: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    y: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                },
                layout: {
                    padding: 10
                }
            }
        });
    }
}

function updateCharts() {
    if (!analyticsData.agents || !charts.activity) return;
    
    // Update activity chart
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();
    
    if (charts.activity.data.labels.length > 20) {
        charts.activity.data.labels.shift();
        charts.activity.data.datasets[0].data.shift();
    }
    
    charts.activity.data.labels.push(timeLabel);
    charts.activity.data.datasets[0].data.push(analyticsData.activeAgents);
    charts.activity.update('none');
    
    // Update message chart
    if (charts.messages) {
        const agentNames = analyticsData.agents.map(agent => agent.name);
        const messageCounts = analyticsData.agents.map(agent => agent.messagesReceived + agent.messagesSent);
        
        charts.messages.data.labels = agentNames;
        charts.messages.data.datasets[0].data = messageCounts;
        charts.messages.update('none');
    }
    
    // Update time chart
    if (charts.time) {
        const agentNames = analyticsData.agents.map(agent => agent.name);
        const onlineTimes = analyticsData.agents.map(agent => {
            const totalTime = agent.totalOnlineTime || 0;
            const currentSession = agent.isOnline ? (Date.now() - agent.loginTime) : 0;
            return (totalTime + currentSession) / (1000 * 60 * 60); // Convert to hours
        });
        
        charts.time.data.labels = agentNames;
        charts.time.data.datasets[0].data = onlineTimes;
        charts.time.update('none');
    }
    
    // Update death chart
    if (charts.deaths) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        
        if (charts.deaths.data.labels.length > 20) {
            charts.deaths.data.labels.shift();
            charts.deaths.data.datasets[0].data.shift();
        }
        
        const totalDeaths = analyticsData.agents ?
            analyticsData.agents.reduce((sum, agent) => sum + (agent.combatStats?.deaths || 0), 0) : 0;
        
        charts.deaths.data.labels.push(timeLabel);
        charts.deaths.data.datasets[0].data.push(totalDeaths);
        charts.deaths.update('none');
    }
}

// Agent status cards
function updateAgentStatusCards() {
    const statusContainer = document.getElementById('agent-status-cards');
    
    if (!analyticsData.agents || analyticsData.agents.length === 0) {
        statusContainer.innerHTML = '<div class="no-agents-status">No agents to display status for</div>';
        return;
    }
    
    statusContainer.innerHTML = analyticsData.agents.map(agent => `
        <div class="status-card">
            <div class="status-card-header">
                <div class="status-card-title">
                    <span class="status-dot ${agent.isOnline ? 'online' : 'offline'}"></span>
                    ${agent.name}
                </div>
                <button class="btn btn-info" onclick="requestAgentStatus('${agent.name}')">
                    <i class="fas fa-sync"></i> Refresh
                </button>
            </div>
            
            <div class="health-bar">
                <div class="bar-label">
                    <span>Health</span>
                    <span>${agent.health || 0}/20</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill health-fill" style="width: ${((agent.health || 0) / 20) * 100}%"></div>
                </div>
            </div>
            
            <div class="hunger-bar">
                <div class="bar-label">
                    <span>Hunger</span>
                    <span>${agent.hunger || 0}/20</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill hunger-fill" style="width: ${((agent.hunger || 0) / 20) * 100}%"></div>
                </div>
            </div>
            
            <div class="xp-bar">
                <div class="bar-label">
                    <span>Experience</span>
                    <span>${agent.xp || 0}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill xp-fill" style="width: ${Math.min((agent.xp || 0) / 100, 1) * 100}%"></div>
                </div>
            </div>
            
            <div class="location-info">
                <div class="coord">
                    <div class="coord-label">X</div>
                    <div class="coord-value">${Math.round(agent.location?.x || 0)}</div>
                </div>
                <div class="coord">
                    <div class="coord-label">Y</div>
                    <div class="coord-value">${Math.round(agent.location?.y || 0)}</div>
                </div>
                <div class="coord">
                    <div class="coord-label">Z</div>
                    <div class="coord-value">${Math.round(agent.location?.z || 0)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function requestAgentStatus(agentName) {
    socket.emit('request-agent-status', agentName);
    showNotification(`Requesting status for ${agentName}`, 'info');
}

// Header stats update
function updateHeaderStats() {
    document.getElementById('active-agents').textContent = agents.filter(agent => agent.in_game).length;
    document.getElementById('total-messages').textContent = analyticsData.totalMessages || 0;
}

// Uptime counter
function startUptime() {
    setInterval(() => {
        const uptime = Date.now() - startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
        
        document.getElementById('uptime').textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Export analytics
function exportAnalytics() {
    socket.emit('export-analytics');
}

function downloadAnalytics(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindcraft-analytics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Analytics data exported', 'success');
}

// Utility functions
function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
            if (notification.parentNode) {
                notifications.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clear message history for selected agent
function clearMessageHistory() {
    if (!selectedAgent) {
        showNotification('Please select an agent first', 'warning');
        return;
    }
    
    if (confirm(`Clear message history for ${selectedAgent}?`)) {
        socket.emit('clear-message-history', selectedAgent);
    }
}

// Settings functionality
let currentSettings = {};

function loadSettings() {
    socket.emit('get-settings');
    showNotification('Loading settings...', 'info');
}

function saveSettings() {
    // Collect settings from form
    const updatedSettings = {
        minecraft: {
            host: document.getElementById('minecraft-host').value,
            port: parseInt(document.getElementById('minecraft-port').value),
            version: document.getElementById('minecraft-version').value
        },
        model: {
            provider: document.getElementById('model-provider').value,
            model: document.getElementById('model-name').value
        },
        max_commands: parseInt(document.getElementById('max-commands').value),
        code_timeout: parseInt(document.getElementById('code-timeout').value)
    };

    // Try to parse JSON from textarea
    try {
        const jsonSettings = JSON.parse(document.getElementById('settings-json').value);
        Object.assign(updatedSettings, jsonSettings);
    } catch (e) {
        console.warn('Invalid JSON in settings textarea, using form values only');
    }

    socket.emit('save-settings', updatedSettings);
    showNotification('Saving settings...', 'info');
}


function displaySettings(settings) {
    // Update individual fields with proper mapping from settings.js structure
    document.getElementById('minecraft-host').value = settings.host || 'localhost';
    document.getElementById('minecraft-port').value = settings.port || 25565;
    document.getElementById('minecraft-version').value = settings.minecraft_version || '1.21.4';
    
    // Extract model info from profiles if available
    let modelProvider = 'unknown';
    let modelName = 'unknown';
    
    if (settings.profiles && settings.profiles.length > 0) {
        // Try to extract model info from the first profile
        const profilePath = settings.profiles[0];
        modelProvider = 'Profile-based';
        modelName = profilePath.split('/').pop().replace('.json', '');
    }
    
    document.getElementById('model-provider').value = modelProvider;
    document.getElementById('model-name').value = modelName;
    
    document.getElementById('max-commands').value = settings.max_commands || -1;
    document.getElementById('code-timeout').value = settings.code_timeout_mins || -1;
    
    // Update raw JSON
    document.getElementById('settings-json').value = JSON.stringify(settings, null, 2);
    
    showNotification('Settings loaded successfully', 'success');
}

// World View functionality (placeholder for prismarine-viewer)
// World View functionality
let currentViewerPort = null;
let currentBotName = null;
let viewerCheckInterval = null;

function initWorldView() {
    updateBotSelector();
    startViewerStatusCheck();
    showNotification('World View initialized - select a bot to view their perspective', 'success');
}

function updateBotSelector() {
    console.log('updateBotSelector() called');
    const botSelector = document.getElementById('bot-selector');
    if (!botSelector) {
        console.log('Bot selector element not found');
        return;
    }
    
    // Clear existing options except the first one
    botSelector.innerHTML = '<option value="">Select a bot...</option>';
    
    // Add online agents to selector
    const onlineAgents = agents.filter(agent => agent.in_game);
    console.log('Online agents:', onlineAgents.map(a => a.name));
    console.log('Viewer ports available:', window.viewerPorts);
    
    onlineAgents.forEach((agent, index) => {
        const option = document.createElement('option');
        option.value = agent.name;
        option.textContent = agent.name;
        
        // Use server-provided viewer ports if available, otherwise fallback to index-based
        if (window.viewerPorts && window.viewerPorts[agent.name]) {
            option.dataset.port = window.viewerPorts[agent.name];
            console.log(`Using server port for ${agent.name}:`, window.viewerPorts[agent.name]);
        } else {
            option.dataset.port = 3000 + index;
            console.log(`Using fallback port for ${agent.name}:`, 3000 + index);
        }
        
        botSelector.appendChild(option);
    });
    
    // If no bots are online, show appropriate message
    if (onlineAgents.length === 0) {
        console.log('No bots online');
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No bots online';
        option.disabled = true;
        botSelector.appendChild(option);
    }
    
    // Request viewer ports from server
    if (socket && onlineAgents.length > 0) {
        console.log('Requesting viewer ports from server');
        socket.emit('get-viewer-ports');
    }
}

function switchBotView() {
    console.log('switchBotView() called');
    const botSelector = document.getElementById('bot-selector');
    const selectedBot = botSelector.value;
    console.log('Selected bot:', selectedBot);
    
    if (!selectedBot) {
        console.log('No bot selected, hiding viewer');
        hideViewer();
        return;
    }
    
    const selectedOption = botSelector.options[botSelector.selectedIndex];
    const port = selectedOption.dataset.port;
    console.log('Bot port:', port);
    
    if (!port) {
        console.log('No port found for bot');
        showNotification('Unable to determine viewer port for this bot', 'error');
        return;
    }
    
    console.log('Loading bot viewer for:', selectedBot, 'on port:', port);
    loadBotViewer(selectedBot, port);
}

function loadBotViewer(botName, port) {
    console.log('loadBotViewer() called with:', botName, port);
    currentBotName = botName;
    currentViewerPort = port;
    
    const placeholder = document.getElementById('worldview-placeholder');
    const viewerContainer = document.getElementById('viewer-container');
    const viewerIframe = document.getElementById('viewer-iframe');
    const viewerLoading = document.getElementById('viewer-loading');
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('#viewer-status .status-dot');
    
    console.log('Elements found:', {
        placeholder: !!placeholder,
        viewerContainer: !!viewerContainer,
        viewerIframe: !!viewerIframe,
        viewerLoading: !!viewerLoading,
        statusText: !!statusText,
        statusDot: !!statusDot
    });
    
    // Show loading state
    placeholder.style.display = 'none';
    viewerContainer.style.display = 'block';
    viewerLoading.style.display = 'block';
    
    // Update status
    statusText.textContent = `Connecting to ${botName}...`;
    statusDot.className = 'status-dot offline';
    
    // Set iframe source
    const viewerUrl = `http://localhost:${port}`;
    console.log('Setting iframe src to:', viewerUrl);
    viewerIframe.src = viewerUrl;
    
    // Update bot info overlay
    updateBotInfo(botName);
    
    // Handle iframe load
    viewerIframe.onload = function() {
        viewerLoading.style.display = 'none';
        statusText.textContent = `Connected to ${botName}`;
        statusDot.className = 'status-dot online';
        showNotification(`Connected to ${botName}'s 3D viewer`, 'success');
    };
    
    // Handle iframe error
    viewerIframe.onerror = function() {
        viewerLoading.style.display = 'none';
        statusText.textContent = `Failed to connect to ${botName}`;
        statusDot.className = 'status-dot offline';
        showNotification(`Failed to connect to ${botName}'s viewer. Make sure show_bot_views is enabled.`, 'error');
    };
    
    // Timeout for loading
    setTimeout(() => {
        if (viewerLoading.style.display !== 'none') {
            viewerLoading.style.display = 'none';
            statusText.textContent = `Connection timeout for ${botName}`;
            statusDot.className = 'status-dot offline';
            showNotification(`Connection timeout for ${botName}'s viewer`, 'warning');
        }
    }, 10000);
}

function hideViewer() {
    const placeholder = document.getElementById('worldview-placeholder');
    const viewerContainer = document.getElementById('viewer-container');
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('#viewer-status .status-dot');
    
    placeholder.style.display = 'block';
    viewerContainer.style.display = 'none';
    
    statusText.textContent = 'No viewer selected';
    statusDot.className = 'status-dot offline';
    
    currentBotName = null;
    currentViewerPort = null;
}

function updateBotInfo(botName) {
    const botNameElement = document.getElementById('current-bot-name');
    const botPositionElement = document.getElementById('bot-position');
    const botHealthElement = document.getElementById('bot-health');
    
    if (botNameElement) botNameElement.textContent = botName;
    
    // Try to get bot status from analytics data
    if (analyticsData && analyticsData.agents) {
        const botData = analyticsData.agents.find(agent => agent.name === botName);
        if (botData && botData.status) {
            if (botPositionElement && botData.status.position) {
                const pos = botData.status.position;
                botPositionElement.textContent = `Position: ${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}`;
            }
            if (botHealthElement && botData.status.health !== undefined) {
                botHealthElement.textContent = `Health: ${botData.status.health}/20`;
            }
        }
    }
    
    // Fallback values
    if (botPositionElement && botPositionElement.textContent === 'Position: -') {
        botPositionElement.textContent = 'Position: Loading...';
    }
    if (botHealthElement && botHealthElement.textContent === 'Health: -') {
        botHealthElement.textContent = 'Health: Loading...';
    }
}

function refreshViewer() {
    if (currentBotName && currentViewerPort) {
        showNotification('Refreshing viewer...', 'info');
        loadBotViewer(currentBotName, currentViewerPort);
    } else {
        showNotification('No viewer to refresh', 'warning');
    }
}

function toggleFullscreen() {
    const viewerContainer = document.getElementById('viewer-container');
    
    if (!document.fullscreenElement) {
        viewerContainer.requestFullscreen().then(() => {
            showNotification('Entered fullscreen mode', 'info');
        }).catch(err => {
            showNotification('Failed to enter fullscreen mode', 'error');
        });
    } else {
        document.exitFullscreen().then(() => {
            showNotification('Exited fullscreen mode', 'info');
        });
    }
}

function startViewerStatusCheck() {
    // Check viewer status every 30 seconds
    if (viewerCheckInterval) {
        clearInterval(viewerCheckInterval);
    }
    
    viewerCheckInterval = setInterval(() => {
        if (currentBotName && currentViewerPort) {
            updateBotInfo(currentBotName);
        }
    }, 30000);
}

function stopViewerStatusCheck() {
    if (viewerCheckInterval) {
        clearInterval(viewerCheckInterval);
        viewerCheckInterval = null;
    }
}

// Update the existing updateAgentsList function to also update bot selector
const originalUpdateAgentsList = updateAgentsList;
updateAgentsList = function() {
    originalUpdateAgentsList();
    updateBotSelector();
};

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        sendMessage();
    }
    
    // Escape to clear input
    if (e.key === 'Escape') {
        document.getElementById('message-input').value = '';
    }
});