import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mindcraft from './mindcraft.js';
import { readFileSync } from 'fs';
import {
    isAuthorizedControlRequest,
    resolveControlToken,
    resolveMindServerBindHost,
} from './security.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mindserver is:
// - central hub for communication between all agent processes
// - api to control from other languages and remote users
// - host for webapp

const CONTROL_ROOM = 'mindcraft:control';
const AGENT_ROOM = 'mindcraft:agents';

let io;
let server;
const agent_connections = {};
const agent_listeners = [];

const settings_spec = JSON.parse(readFileSync(path.join(__dirname, 'public/settings_spec.json'), 'utf8'));

class AgentConnection {
    constructor(settings, viewer_port, process_token) {
        this.socket = null;
        this.settings = settings;
        this.in_game = false;
        this.full_state = null;
        this.viewer_port = viewer_port;
        this.process_token = process_token;
    }
    setSettings(settings) {
        this.settings = settings;
    }
}

export function registerAgent(settings, viewer_port, process_token) {
    const agentConnection = new AgentConnection(settings, viewer_port, process_token);
    agent_connections[settings.profile.name] = agentConnection;
}

export function logoutAgent(agentName) {
    if (agent_connections[agentName]) {
        agent_connections[agentName].in_game = false;
        agentsStatusUpdate();
    }
}

function isAgentSocketAuthorized(socket, agentName) {
    const connection = agent_connections[agentName];
    if (!connection?.process_token) return false;
    return isAuthorizedControlRequest(socket.handshake.auth?.agentToken, connection.process_token);
}

// Initialize the server
export function createMindServer(host_public = false, port = 8080) {
    const controlToken = resolveControlToken(host_public);
    const host = resolveMindServerBindHost(host_public);
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    app.use(express.static(path.join(__dirname, 'public')));

    // Texture proxy: resolve item/block textures using minecraft-assets with version fallback
    app.get('/assets/item/:agent/:name.png', async (req, res) => {
        try {
            const agentName = req.params.agent;
            const rawName = req.params.name;
            const itemName = String(rawName).toLowerCase();
            const conn = agent_connections[agentName];
            const preferred = conn?.settings?.minecraft_version;
            const candidates = [];
            if (preferred && preferred !== 'auto') candidates.push(preferred);
            candidates.push('1.21.11');

            const mod = await import('minecraft-assets');
            const mcAssetsFactory = mod.default || mod;

            for (const ver of candidates) {
                try {
                    const assets = mcAssetsFactory(ver);
                    const item = assets.items[itemName];
                    const block = assets.blocks[itemName];
                    const tex = assets.textureContent?.[itemName]?.texture
                        || (item ? assets.textureContent?.[itemName]?.texture : null)
                        || (block ? assets.textureContent?.[itemName]?.texture : null);
                    if (tex?.startsWith('data:image')) {
                        const base64 = tex.split(',')[1];
                        const img = globalThis.Buffer.from(base64, 'base64');
                        res.setHeader('Content-Type', 'image/png');
                        return res.end(img);
                    }

                    const base = assets.directory;
                    const guessPaths = [
                        path.join(base, 'items', `${itemName}.png`),
                        path.join(base, 'blocks', `${itemName}.png`),
                    ];
                    for (const p of guessPaths) {
                        try {
                            const fsMod = await import('fs');
                            const buf = fsMod.readFileSync(p);
                            res.setHeader('Content-Type', 'image/png');
                            return res.end(buf);
                        } catch { /* ignore */ }
                    }
                } catch { /* ignore */ }
            }
            res.setHeader('Content-Type', 'image/svg+xml');
            res.status(404).send('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="100%" height="100%" fill="#444"/><text x="50%" y="55%" font-size="12" fill="#bbb" text-anchor="middle">?</text></svg>');
        } catch (e) {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.status(500).send('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="100%" height="100%" fill="#444"/><text x="50%" y="55%" font-size="12" fill="#bbb" text-anchor="middle">!</text></svg>');
        }
    });

    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        const controlAuthorized = () => {
            // Child-agent sockets use a separate credential and should not silently
            // inherit control-plane privilege just because the server is loopback-only.
            const hasAgentCredential = typeof socket.handshake.auth?.agentToken === 'string';
            const hasControlCredential = typeof socket.handshake.auth?.controlToken === 'string';
            if (hasAgentCredential && !hasControlCredential) return false;
            if (!controlToken) return !host_public;
            return isAuthorizedControlRequest(socket.handshake.auth?.controlToken, controlToken);
        };

        const rejectControl = (callback) => {
            const error = 'Unauthorized MindServer control request.';
            if (typeof callback === 'function') callback({ success: false, error });
            else socket.emit('control-error', { error });
        };

        const requireControl = (callback) => {
            if (controlAuthorized()) return true;
            rejectControl(callback);
            return false;
        };

        const requireAgent = (agentName, callback) => {
            if (isAgentSocketAuthorized(socket, agentName)) return true;
            const error = `Unauthorized agent process '${agentName}'.`;
            if (typeof callback === 'function') callback({ error });
            else socket.emit('agent-auth-error', { error });
            return false;
        };

        if (controlAuthorized()) {
            socket.join(CONTROL_ROOM);
            agentsStatusUpdate(socket);
        }

        socket.on('create-agent', async (settings, callback) => {
            if (!requireControl(callback)) return;
            console.log('API create agent...');
            for (const key in settings_spec) {
                if (!(key in settings)) {
                    if (settings_spec[key].required) {
                        callback({ success: false, error: `Setting ${key} is required` });
                        return;
                    }
                    settings[key] = settings_spec[key].default;
                }
            }
            for (const key in settings) {
                if (!(key in settings_spec)) delete settings[key];
            }
            if (settings.profile?.name) {
                if (settings.profile.name in agent_connections) {
                    callback({ success: false, error: 'Agent already exists' });
                    return;
                }
                const returned = await mindcraft.createAgent(settings);
                callback({ success: returned.success, error: returned.error });
                const name = settings.profile.name;
                if (!returned.success && agent_connections[name]) {
                    mindcraft.destroyAgent(name);
                    delete agent_connections[name];
                }
                agentsStatusUpdate();
            }
            else {
                console.error('Agent name is required in profile');
                callback({ success: false, error: 'Agent name is required in profile' });
            }
        });

        socket.on('get-settings', (agentName, callback) => {
            if (!controlAuthorized() && !requireAgent(agentName, callback)) return;
            if (agent_connections[agentName]) {
                callback({ settings: agent_connections[agentName].settings });
            } else {
                callback({ error: `Agent '${agentName}' not found.` });
            }
        });

        socket.on('connect-agent-process', (agentName) => {
            if (!requireAgent(agentName)) return;
            agent_connections[agentName].socket = socket;
            curAgentName = agentName;
            socket.join(AGENT_ROOM);
            agentsStatusUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (!requireAgent(agentName)) return;
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agent_connections[agentName].in_game = true;
                curAgentName = agentName;
                socket.join(AGENT_ROOM);
                agentsStatusUpdate();
            }
            else {
                console.warn(`Unregistered agent ${agentName} tried to login`);
            }
        });

        socket.on('disconnect', () => {
            if (agent_connections[curAgentName]?.socket === socket) {
                console.log(`Agent ${curAgentName} disconnected`);
                agent_connections[curAgentName].in_game = false;
                agent_connections[curAgentName].socket = null;
                agentsStatusUpdate();
            }
            if (agent_listeners.includes(socket)) removeListener(socket);
        });

        socket.on('chat-message', (agentName, json) => {
            if (!curAgentName || !requireAgent(curAgentName)) return;
            const target = agent_connections[agentName];
            if (!target?.socket) {
                console.warn(`Agent ${curAgentName} tried to send a message to unavailable agent ${agentName}`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            target.socket.emit('chat-message', curAgentName, json);
        });

        socket.on('set-agent-settings', (agentName, settings) => {
            if (!requireControl()) return;
            const agent = agent_connections[agentName];
            if (agent) {
                agent.setSettings(settings);
                agent.socket?.emit('restart-agent');
            }
        });

        socket.on('restart-agent', (agentName) => {
            if (!requireControl()) return;
            console.log(`Restarting agent: ${agentName}`);
            agent_connections[agentName]?.socket?.emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            if (!requireControl()) return;
            mindcraft.stopAgent(agentName);
        });

        socket.on('start-agent', (agentName) => {
            if (!requireControl()) return;
            mindcraft.startAgent(agentName);
        });

        socket.on('destroy-agent', (agentName) => {
            if (!requireControl()) return;
            if (agent_connections[agentName]) {
                mindcraft.destroyAgent(agentName);
                delete agent_connections[agentName];
            }
            agentsStatusUpdate();
        });

        socket.on('stop-all-agents', () => {
            if (!requireControl()) return;
            console.log('Killing all agents');
            for (const agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
        });

        socket.on('shutdown', () => {
            if (!requireControl()) return;
            console.log('Shutting down');
            for (const agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
            setTimeout(() => {
                console.log('Exiting MindServer');
                globalThis.process.exit(0);
            }, 2000);
        });

        socket.on('send-message', (agentName, data) => {
            if (!requireControl()) return;
            const agent = agent_connections[agentName];
            if (!agent?.socket) {
                console.warn(`Agent ${agentName} not in game, cannot send message via MindServer.`);
                return;
            }
            try {
                agent.socket.emit('send-message', data);
            } catch (error) {
                console.error('Error: ', error);
            }
        });

        socket.on('bot-output', (agentName, message) => {
            if (!requireAgent(agentName)) return;
            io.to(CONTROL_ROOM).emit('bot-output', agentName, message);
        });

        socket.on('listen-to-agents', () => {
            if (!requireControl()) return;
            addListener(socket);
        });
    });

    server.listen(port, host, () => {
        console.log(`MindServer running on port ${port} on host ${host}`);
    });

    return server;
}

function agentsStatusUpdate(socket) {
    if (!io) return;
    const agents = [];
    for (const agentName in agent_connections) {
        const conn = agent_connections[agentName];
        agents.push({
            name: agentName,
            in_game: conn.in_game,
            viewerPort: conn.viewer_port,
            socket_connected: !!conn.socket
        });
    }

    if (socket) {
        socket.emit('agents-status', agents);
        return;
    }
    io.to(CONTROL_ROOM).emit('agents-status', agents);
    io.to(AGENT_ROOM).emit('agents-status', agents);
}

let listenerInterval = null;
function addListener(listener_socket) {
    if (agent_listeners.includes(listener_socket)) return;
    agent_listeners.push(listener_socket);
    if (agent_listeners.length === 1) {
        listenerInterval = setInterval(async () => {
            const states = {};
            for (const agentName in agent_connections) {
                const agent = agent_connections[agentName];
                if (agent.in_game && agent.socket) {
                    try {
                        const state = await new Promise((resolve) => {
                            agent.socket.emit('get-full-state', (s) => resolve(s));
                        });
                        states[agentName] = state;
                    } catch (e) {
                        states[agentName] = { error: String(e) };
                    }
                }
            }
            for (const listener of agent_listeners) {
                listener.emit('state-update', states);
            }
        }, 1000);
    }
}

function removeListener(listener_socket) {
    const index = agent_listeners.indexOf(listener_socket);
    if (index !== -1) agent_listeners.splice(index, 1);
    if (agent_listeners.length === 0) {
        clearInterval(listenerInterval);
        listenerInterval = null;
    }
}

export const getIO = () => io;
export const getServer = () => server;
export const numStateListeners = () => agent_listeners.length;
