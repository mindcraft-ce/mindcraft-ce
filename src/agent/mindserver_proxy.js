import { io } from 'socket.io-client';
import { setSettings } from './settings.js';
import rootSettings from '../../settings.js';

class MindServerProxy {
    constructor() {
        if (MindServerProxy.instance) return MindServerProxy.instance;
        this.socket = null;
        this.connected = false;
        this.agents = [];
        this.convoManager = null;
        this.getFullState = null;
        MindServerProxy.instance = this;
    }

    async connect(name, port) {
        if (this.connected) return;

        const agentToken = process.env.MINDCRAFT_AGENT_TOKEN;
        if (!agentToken) throw new Error('Missing MINDCRAFT_AGENT_TOKEN for MindServer agent authentication.');

        this.name = name;
        this.socket = io(`http://localhost:${port}`, {
            auth: { agentToken },
        });

        await new Promise((resolve, reject) => {
            this.socket.once('connect', resolve);
            this.socket.once('connect_error', reject);
        });

        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Settings request timed out after 5 seconds')), 5000);
            this.socket.emit('get-settings', name, (settingsResponse) => {
                clearTimeout(timeout);
                if (settingsResponse.error) {
                    reject(new Error(settingsResponse.error));
                    return;
                }
                resolve(settingsResponse);
            });
        });

        setSettings(response.settings);
        Object.assign(rootSettings, response.settings);

        const [{ default: convoManager }, { getFullState }] = await Promise.all([
            import('./conversation.js'),
            import('./library/full_state.js'),
        ]);
        this.convoManager = convoManager;
        this.getFullState = getFullState;

        this._registerSocketHandlers();
        this.connected = true;
        console.log(name, 'connected to MindServer');
        this.socket.emit('connect-agent-process', name);
    }

    _registerSocketHandlers() {
        this.socket.on('disconnect', () => {
            console.log('Disconnected from MindServer');
            this.connected = false;
            if (this.agent) this.agent.cleanKill('Disconnected from MindServer. Killing agent process.');
        });
        this.socket.on('agent-auth-error', ({ error } = {}) => {
            console.error(error || 'MindServer rejected agent authentication.');
        });
        this.socket.on('chat-message', (agentName, json) => this.convoManager.receiveFromBot(agentName, json));
        this.socket.on('agents-status', (agents) => {
            this.agents = agents;
            this.convoManager.updateAgents(agents);
            if (this.agent?.task) this.agent.task.updateAvailableAgents(agents);
        });
        this.socket.on('restart-agent', () => this.agent?.cleanKill());
        this.socket.on('send-message', (data) => {
            try {
                this.agent?.respondFunc(data.from, data.message);
            } catch (error) {
                console.error('Error: ', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }
        });
        this.socket.on('get-full-state', (callback) => {
            try {
                if (!this.agent || !this.getFullState) {
                    callback(null);
                    return;
                }
                callback(this.getFullState(this.agent));
            } catch (error) {
                console.error('Error getting full state:', error);
                callback(null);
            }
        });
    }

    setAgent(agent) { this.agent = agent; }
    getAgents() { return this.agents; }
    getNumOtherAgents() { return this.agents.length - 1; }
    login() { this.socket.emit('login-agent', this.agent.name); }
    shutdown() { this.socket.emit('shutdown'); }
    getSocket() { return this.socket; }
}

export const serverProxy = new MindServerProxy();

export function sendBotChatToServer(agentName, json) {
    serverProxy.getSocket().emit('chat-message', agentName, json);
}

export function sendOutputToServer(agentName, message) {
    serverProxy.getSocket().emit('bot-output', agentName, message);
}
