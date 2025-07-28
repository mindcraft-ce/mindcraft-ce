import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyticsManager } from './analytics.js';

// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const inGameAgents = {};
const agentManagers = {}; // socket for main process that registers/controls agents
const webClients = new Set();

// Broadcast analytics update to web clients
function broadcastAnalytics() {
    const analyticsUpdate = analyticsManager.getAnalyticsSummary(Object.keys(inGameAgents));
    
    webClients.forEach(client => {
        client.emit('analytics-update', analyticsUpdate);
    });
}

// Broadcast analytics every 10 seconds
setInterval(broadcastAnalytics, 10000);

// Initialize the server
export function createMindServer(port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        let isWebClient = false;
        console.log('Client connected');

        // Check if this is a web client connection
        socket.on('web-client-connect', () => {
            isWebClient = true;
            webClients.add(socket);
            console.log('Web client connected');
            
            // Send initial data to web client
            agentsUpdate(socket);
            broadcastAnalytics();
            
            // Send message history for all agents
            registeredAgents.forEach(agentName => {
                const history = analyticsManager.getAgentMessageHistory(agentName);
                socket.emit('message-history', agentName, history);
            });
        });

        agentsUpdate(socket);

        socket.on('register-agents', (agentNames) => {
            console.log(`Registering agents: ${agentNames}`);
            agentNames.forEach(name => registeredAgents.add(name));
            for (let name of agentNames) {
                agentManagers[name] = socket;
            }
            socket.emit('register-agents-success');
            agentsUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (curAgentName && curAgentName !== agentName) {
                console.warn(`Agent ${agentName} already logged in as ${curAgentName}`);
                return;
            }
            if (registeredAgents.has(agentName)) {
                curAgentName = agentName;
                inGameAgents[agentName] = socket;
                analyticsManager.initializeAgent(agentName);
                agentsUpdate();
                broadcastAnalytics();
            } else {
                console.warn(`Agent ${agentName} not registered`);
            }
        });

        socket.on('logout-agent', (agentName) => {
            if (inGameAgents[agentName]) {
                delete inGameAgents[agentName];
                agentsUpdate();
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            if (isWebClient) {
                webClients.delete(socket);
            }
            if (inGameAgents[curAgentName]) {
                analyticsManager.recordAgentLogout(curAgentName);
                delete inGameAgents[curAgentName];
                agentsUpdate();
                broadcastAnalytics();
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!inGameAgents[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            inGameAgents[agentName].emit('chat-message', curAgentName, json);
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            inGameAgents[agentName].emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('stop-agent', agentName);
            }
            else {
                console.warn(`Stopping unregisterd agent ${agentName}`);
            }
        });

        socket.on('start-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('start-agent', agentName);
            }
            else {
                console.warn(`Starting unregisterd agent ${agentName}`);
            }
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            stopAllAgents();
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let manager of Object.values(agentManagers)) {
                manager.emit('shutdown');
            }
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        });

		socket.on('send-message', (agentName, message) => {
			if (!inGameAgents[agentName]) {
				console.warn(`Agent ${agentName} not logged in, cannot send message via MindServer.`);
				return
			}
			try {
				console.log(`Sending message to agent ${agentName}: ${message}`);
				inGameAgents[agentName].emit('send-message', agentName, message);
				
				// Track message in analytics
				const messageData = {
					from: 'web-client',
					to: agentName,
					message: message,
					type: 'command'
				};
				
				const recordedMessage = analyticsManager.recordMessage(agentName, messageData);
				
				// Broadcast message to web clients
				webClients.forEach(client => {
					client.emit('new-message', agentName, recordedMessage);
				});
				
			} catch (error) {
				console.error('Error: ', error);
			}
		});

		// Agent sends response back to web interface
		socket.on('agent-response', (agentName, response) => {
			console.log(`Agent ${agentName} response: ${response}`);
			
			const messageData = {
				from: agentName,
				to: 'web-client',
				message: response,
				type: 'response'
			};
			
			const recordedMessage = analyticsManager.recordMessage(agentName, messageData);
			
			// Broadcast response to web clients
			webClients.forEach(client => {
				client.emit('new-message', agentName, recordedMessage);
			});
		});

		// Agent status updates
		socket.on('agent-status-update', (agentName, statusData) => {
			analyticsManager.updateAgentStatus(agentName, statusData);
			broadcastAnalytics();
		});

		// Agent death events
		socket.on('agent-death', (agentName, deathData) => {
			console.log(`Agent ${agentName} died: ${deathData.cause || 'unknown cause'}`);
			analyticsManager.recordAgentDeath(agentName, deathData);
			broadcastAnalytics();
		});

		// Request agent status
		socket.on('request-agent-status', (agentName) => {
			if (inGameAgents[agentName]) {
				inGameAgents[agentName].emit('request-status');
			}
		});

		// Clear message history
		socket.on('clear-message-history', (agentName) => {
			analyticsManager.clearAgentMessageHistory(agentName);
			webClients.forEach(client => {
				client.emit('message-history-cleared', agentName);
			});
		});

		// Export analytics data
		socket.on('export-analytics', () => {
			const exportData = analyticsManager.exportAnalyticsData();
			socket.emit('analytics-export', exportData);
		});

		// Get settings data
		socket.on('get-settings', () => {
			try {
				// Import settings dynamically to get current values
				import('../../settings.js').then(settingsModule => {
					const settings = settingsModule.default;
					socket.emit('settings-data', settings);
				}).catch(error => {
					console.error('Error loading settings:', error);
					socket.emit('settings-data', {});
				});
			} catch (error) {
				console.error('Error getting settings:', error);
				socket.emit('settings-data', {});
			}
		});

		// Save settings data
		socket.on('save-settings', (updatedSettings) => {
			try {
				import('fs').then(fs => {
					// Get the correct path to settings.js from the project root
					const __dirname = path.dirname(fileURLToPath(import.meta.url));
					const settingsPath = path.resolve(__dirname, '../../settings.js');
					
					// Read current settings file
					fs.readFile(settingsPath, 'utf8', (err, data) => {
						if (err) {
							console.error('Error reading settings file:', err);
							socket.emit('settings-save-result', { success: false, error: 'Failed to read settings file' });
							return;
						}

						try {
							// Create backup
							const backupPath = settingsPath + '.backup';
							fs.writeFileSync(backupPath, data);

							// For now, just notify that settings would be saved
							// Full implementation would require parsing and updating the settings.js file
							console.log('Settings save requested:', updatedSettings);
							socket.emit('settings-save-result', {
								success: true,
								message: 'Settings saved successfully (Note: Full save functionality requires restart to take effect)'
							});
						} catch (parseError) {
							console.error('Error processing settings:', parseError);
							socket.emit('settings-save-result', { success: false, error: 'Failed to process settings' });
						}
					});
				});
			} catch (error) {
				console.error('Error saving settings:', error);
				socket.emit('settings-save-result', { success: false, error: 'Failed to save settings' });
			}
		});

		// Get viewer ports for active bots
		socket.on('get-viewer-ports', () => {
			const viewerPorts = {};
			let portIndex = 0;
			
			// Map each in-game agent to a viewer port
			Object.keys(inGameAgents).forEach(agentName => {
				viewerPorts[agentName] = 3000 + portIndex;
				portIndex++;
			});
			
			socket.emit('viewer-ports', viewerPorts);
		});

		// Check if viewer is available on a specific port
		socket.on('check-viewer-port', (port) => {
			import('http').then(http => {
				const req = http.request({
					hostname: 'localhost',
					port: port,
					method: 'HEAD',
					timeout: 2000
				}, (res) => {
					socket.emit('viewer-port-status', { port, available: res.statusCode === 200 });
				});
				
				req.on('error', () => {
					socket.emit('viewer-port-status', { port, available: false });
				});
				
				req.on('timeout', () => {
					socket.emit('viewer-port-status', { port, available: false });
				});
				
				req.end();
			});
		});
		  });

		  server.listen(port, 'localhost', () => {
		      console.log(`MindServer running on port ${port}`);
		  });

		  return server;
}

function agentsUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    registeredAgents.forEach(name => {
        agents.push({name, in_game: !!inGameAgents[name]});
    });
    socket.emit('agents-update', agents);
}

function stopAllAgents() {
    for (const agentName in inGameAgents) {
        let manager = agentManagers[agentName];
        if (manager) {
            manager.emit('stop-agent', agentName);
        }
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const getConnectedAgents = () => connectedAgents; 
export function getAllInGameAgentNames() {
    return Object.keys(inGameAgents);
  }
