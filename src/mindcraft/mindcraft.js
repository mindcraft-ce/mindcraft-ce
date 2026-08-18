import { createMindServer, registerAgent, numStateListeners } from './mindserver.js';
import { AgentProcess } from '../process/agent_process.js';
import { getServer } from './mcserver.js';
import { freezeResolvedAgentSettings, validateAgentSettings } from './agent_config.js';
import open from 'open';

let mindserver;
let connected = false;
let agent_processes = {};
let agent_count = 0;
let mindserver_port = 8080;

export async function init(host_public=false, port=8080, auto_open_ui=true) {
    if (connected) {
        console.error('Already initiliazed!');
        return;
    }
    mindserver = createMindServer(host_public, port);
    mindserver_port = port;
    connected = true;
    if (auto_open_ui) {
        setTimeout(() => {
            if (numStateListeners() === 0) {
                open('http://localhost:'+port);
            }
        }, 3000);
    }
}

export async function createAgent(inputSettings) {
    let settings;
    try {
        settings = structuredClone(validateAgentSettings(inputSettings));
    } catch (error) {
        console.error('Invalid agent settings:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }

    if (!settings.profile?.name || typeof settings.profile.name !== 'string') {
        console.error('Agent name is required in profile');
        return {
            success: false,
            error: 'Agent name is required in profile'
        };
    }

    const agent_name = settings.profile.name;
    const agentIndex = agent_count++;
    const viewer_port = 3000 + agentIndex;
    const load_memory = settings.load_memory || false;
    const init_message = settings.init_message || null;

    try {
        try {
            const server = await getServer(settings.host, settings.port, settings.minecraft_version);
            settings.host = server.host;
            settings.port = server.port;
            settings.minecraft_version = server.version;
        } catch (error) {
            console.warn('Error getting server:', error);
            if (settings.minecraft_version === 'auto') {
                settings.minecraft_version = null;
            }
            console.warn('Attempting to connect anyway...');
        }

        const resolvedSettings = freezeResolvedAgentSettings(settings);
        registerAgent(resolvedSettings, viewer_port);

        const agentProcess = new AgentProcess(agent_name, mindserver_port);
        agentProcess.start(load_memory, init_message, agentIndex);
        agent_processes[resolvedSettings.profile.name] = agentProcess;
    } catch (error) {
        console.error(`Error creating agent ${agent_name}:`, error);
        destroyAgent(agent_name);
        return {
            success: false,
            error: error.message
        };
    }
    return {
        success: true,
        error: null
    };
}

export function getAgentProcess(agentName) {
    return agent_processes[agentName];
}

export function startAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].forceRestart();
    }
    else {
        console.error(`Cannot start agent ${agentName}; not found`);
    }
}

export function stopAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].stop();
    }
}

export function destroyAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].stop();
        delete agent_processes[agentName];
    }
}

export function shutdown() {
    console.log('Shutting down');
    for (const agentName in agent_processes) {
        agent_processes[agentName].stop();
    }
    setTimeout(() => {
        process.exit(0);
    }, 2000);
}
