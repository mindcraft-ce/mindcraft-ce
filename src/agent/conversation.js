import settings from '../../settings.js';
import { readFileSync } from 'fs';
import { containsCommand } from './commands/index.js';
import { sendBotChatToServer } from './agent_proxy.js';

let agent;
let agent_names = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);
let agents_in_game = [];

class Conversation {
    constructor(name) {
        this.name = name;
        this.active = false;
        this.ignore_until_start = false;
        this.blocked = false;
        this.in_queue = [];
        this.inMessageTimer = null;
    }

    reset() {
        this.active = false;
        this.ignore_until_start = false;
        this.in_queue = [];
        this.inMessageTimer = null;
    }

    end() {
        this.active = false;
        this.ignore_until_start = true;
        this.inMessageTimer = null;
        const full_message = _compileInMessages(this);
        if (full_message.message.trim().length > 0)
            agent.history.add(this.name, full_message.message);
        // add the full queued messages to history, but don't respond

        if (agent.last_sender === this.name)
            agent.last_sender = null;
    }

    queue(message) {
        this.in_queue.push(message);
    }
}

const WAIT_TIME_START = 30000;
class ConversationManager {
    constructor() {
        this.convos = {};
        this.activeConversation = null;
        this.awaiting_response = false;
        this.connection_timeout = null;
        this.wait_time_limit = WAIT_TIME_START;
        this.nearbyBots = new Map(); // Stores bot name -> { name, connected }
        this.pendingConnections = new Set(); // Stores names of bots an invitation has been sent to
    }

    initAgent(a) {
        agent = a;
    }

    _getConvo(name) {
        if (!this.convos[name])
            this.convos[name] = new Conversation(name);
        return this.convos[name];
    }

    _startMonitor() {
        clearInterval(this.connection_monitor);
        let wait_time = 0;
        let last_time = Date.now();
        this.connection_monitor = setInterval(() => {
            if (!this.activeConversation) {
                this._stopMonitor();
                return; // will clean itself up
            }

            let delta = Date.now() - last_time;
            last_time = Date.now();
            let convo_partner = this.activeConversation.name;

            if (this.awaiting_response && agent.isIdle()) {
                wait_time += delta;
                if (wait_time > this.wait_time_limit) {
                    agent.handleMessage('system', `${convo_partner} hasn't responded in ${this.wait_time_limit/1000} seconds, respond with a message to them or your own action.`);
                    wait_time = 0;
                    this.wait_time_limit*=2;
                }
            }
            else if (!this.awaiting_response){
                this.wait_time_limit = WAIT_TIME_START;
                wait_time = 0;
            }

            if (!this.otherAgentInGame(convo_partner) && !this.connection_timeout) {
                this.connection_timeout = setTimeout(() => {
                    if (this.otherAgentInGame(convo_partner)){
                        this._clearMonitorTimeouts();
                        return;
                    }
                    if (!agent.self_prompter.isPaused()) {
                        this.endConversation(convo_partner);
                        agent.handleMessage('system', `${convo_partner} disconnected, conversation has ended.`);
                    }
                    else {
                        this.endConversation(convo_partner);
                    }
                }, 10000);
            }
        }, 1000);
    }

    _stopMonitor() {
        clearInterval(this.connection_monitor);
        this.connection_monitor = null;
        this._clearMonitorTimeouts();
    }

    _clearMonitorTimeouts() {
        this.awaiting_response = false;
        clearTimeout(this.connection_timeout);
        this.connection_timeout = null;
    }

    async startConversation(send_to, message) {
        const convo = this._getConvo(send_to);
        convo.reset();
        
        if (agent.self_prompter.isActive()) {
            await agent.self_prompter.pause();
        }
        if (convo.active)
            return;
        convo.active = true;
        this.activeConversation = convo;
        this._startMonitor();
        this.sendToBot(send_to, message, true, false);
    }

    startConversationFromOtherBot(name) {
        const convo = this._getConvo(name);
        convo.active = true;
        this.activeConversation = convo;
        this._startMonitor();
    }

    sendToBot(send_to, message, start=false, open_chat=true) {
        if (!this.isOtherAgent(send_to)) { // Check if 'send_to' is a connected bot
            console.warn(`[${agent.name}] Tried to send BOT_CHAT_MESSAGE to non-connected bot ${send_to}. Current nearbyBots:`, this.nearbyBots);
            return;
        }
        const convo = this._getConvo(send_to);
        
        if (settings.chat_bot_messages && open_chat)
            agent.openChat(`(To ${send_to}) ${message}`);
        
        if (convo.ignore_until_start && !start) // If ignoring until start, only allow start messages
            return;
        convo.active = true;
        
        const end = message.includes('!endConversation');
        const json = {
            type: "BOT_CHAT_MESSAGE", // Added type
            message: message,
            start,
            end,
        };

        this.awaiting_response = true;
        // Assuming sendBotChatToServer handles the actual whisper mechanism for JSON payloads to other bots
        sendBotChatToServer(send_to, json);
        console.log(`[${agent.name}] Sent BOT_CHAT_MESSAGE to ${send_to}:`, json);
    }

    async receiveFromBot(sender, received) {
        // This function is called by the agent_proxy when a structured message (already parsed JSON) is received.
        // Or by respondFunc if a whisper is identified as a BOT_CHAT_MESSAGE
        if (!received || typeof received !== 'object') {
            console.warn(`[${agent.name}] receiveFromBot called with invalid 'received' payload from ${sender}:`, received);
            return;
        }

        if (received.type !== "BOT_CHAT_MESSAGE") {
            console.warn(`[${agent.name}] receiveFromBot called with non-BOT_CHAT_MESSAGE type from ${sender}:`, received.type);
            return;
        }

        const convo = this._getConvo(sender);

        if (convo.ignore_until_start && !received.start)
            return;

        // check if any convo is active besides the sender
        if (this.inConversation() && !this.inConversation(sender)) {
            // Send a BOT_CHAT_MESSAGE of type end conversation
            this.sendToBot(sender, `I'm talking to someone else, try again later. !endConversation("${sender}")`, false, false);
            this.endConversation(sender);
            return;
        }

        console.log(`[${agent.name}] Received BOT_CHAT_MESSAGE from ${sender}:`, received);

        if (received.start) {
            convo.reset();
            this.startConversationFromOtherBot(sender);
        }

        this._clearMonitorTimeouts();
        convo.queue(received); // Queue the full 'received' object which includes type, message, start, end
        
        // responding to conversation takes priority over self prompting
        if (agent.self_prompter.isActive()){
            await agent.self_prompter.pause();
        }
    
        // Pass the 'message' field of 'received' to _scheduleProcessInMessage if it expects just the text
        _scheduleProcessInMessage(sender, received, convo);
    }

    responseScheduledFor(sender) {
        // Before checking timer, ensure 'sender' is a connected bot.
        if (!this.isOtherAgent(sender) || !this.inConversation(sender))
            return false;
        const convo = this._getConvo(sender);
        return !!convo.inMessageTimer;
    }

    isOtherAgent(name) {
        // Checks if the agent is known and marked as connected.
        return this.nearbyBots.has(name) && this.nearbyBots.get(name).connected;
    }

    otherAgentInGame(name) {
        // This function might need adjustment if agent_names or agents_in_game is not reliably updated
        // For now, it retains its original logic but isOtherAgent is the primary check for "connected" status.
        return agents_in_game.some((n) => n === name);
    }
    
    updateAgents(agents) {
        // This function is presumably called by the proxy to update the general list of agents.
        // We might want to reconcile this with nearbyBots or ensure nearbyBots is the source of truth for "connected" status.
        agent_names = agents.map(a => a.name); // List of all potential bot names
        agents_in_game = agents.filter(a => a.in_game).map(a => a.name); // List of bots currently in the game server

        // Prune nearbyBots and pendingConnections if a bot is no longer in agent_names or agents_in_game
        const currentServerBotNames = new Set(agent_names);
        for (const botName of this.nearbyBots.keys()) {
            if (!currentServerBotNames.has(botName)) {
                this.nearbyBots.delete(botName);
                this.pendingConnections.delete(botName);
                if (this.activeConversation && this.activeConversation.name === botName) {
                    this.endConversation(botName);
                }
                console.log(`[${agent.name}] Removed ${botName} from nearbyBots and pendingConnections as it's no longer listed by server.`);
            }
        }
         for (const botName of this.pendingConnections) {
            if (!currentServerBotNames.has(botName)) {
                this.pendingConnections.delete(botName);
                 console.log(`[${agent.name}] Removed ${botName} from pendingConnections as it's no longer listed by server.`);
            }
        }
    }

    getInGameAgents() {
        // This can return the general list of bots in game.
        // For bots this agent is *connected* to, refer to this.nearbyBots.
        return agents_in_game;
    }
    
    inConversation(other_agent=null) {
        if (other_agent)
            return this.convos[other_agent]?.active;
        return Object.values(this.convos).some(c => c.active);
    }
    
    endConversation(sender) {
        if (this.convos[sender]) {
            this.convos[sender].end();
            if (this.activeConversation.name === sender) {
                this._stopMonitor();
                this.activeConversation = null;
                if (agent.self_prompter.isPaused() && !this.inConversation()) {
                    _resumeSelfPrompter();
                }
            }
        }
    }
    
    endAllConversations() {
        for (const sender in this.convos) {
            this.endConversation(sender);
        }
        if (agent.self_prompter.isPaused()) {
            _resumeSelfPrompter();
        }
    }

    forceEndCurrentConversation() {
        if (this.activeConversation) {
            let sender = this.activeConversation.name;
            this.sendToBot(sender, '!endConversation("' + sender + '")', false, false);
            this.endConversation(sender);
        }
    }

    handleBotDetection(detectedBotName) {
        if (!agent || !agent.bot) {
            console.error("Agent or agent.bot is not initialized in ConversationManager.");
            return;
        }
        if (detectedBotName === agent.name || this.nearbyBots.has(detectedBotName) || this.pendingConnections.has(detectedBotName)) {
            return; // Already detected, is self, or pending connection
        }

        console.log(`[${agent.name}] Handling bot detection for: ${detectedBotName}`);
        const payload = {
            type: "INITIATE_CONNECTION",
            senderName: agent.name
        };
        agent.bot.whisper(detectedBotName, JSON.stringify(payload));
        this.pendingConnections.add(detectedBotName);
        console.log(`[${agent.name}] Sent INITIATE_CONNECTION to ${detectedBotName}`);
    }

    handleConnectionPayload(senderName, payload) {
        if (!agent || !agent.bot) {
            console.error("Agent or agent.bot is not initialized in ConversationManager.");
            return;
        }
        console.log(`[${agent.name}] Handling connection payload from ${senderName}:`, payload);

        if (payload.type === "INITIATE_CONNECTION") {
            if (senderName === agent.name) return; // Ignore own initiation messages if somehow received

            console.log(`[${agent.name}] Received INITIATE_CONNECTION from ${payload.senderName}`);
            this.nearbyBots.set(payload.senderName, { name: payload.senderName, connected: false });

            const responsePayload = {
                type: "ACKNOWLEDGE_CONNECTION",
                senderName: agent.name
            };
            agent.bot.whisper(payload.senderName, JSON.stringify(responsePayload));

            this.nearbyBots.set(payload.senderName, { name: payload.senderName, connected: true });
            this.pendingConnections.delete(payload.senderName); // Remove from pending if we were also initiating
            console.log(`[${agent.name}] Sent ACKNOWLEDGE_CONNECTION to ${payload.senderName} and marked as connected.`);

        } else if (payload.type === "ACKNOWLEDGE_CONNECTION") {
            if (senderName === agent.name) return; // Ignore own acknowledgement messages

            console.log(`[${agent.name}] Received ACKNOWLEDGE_CONNECTION from ${payload.senderName}`);
            this.nearbyBots.set(payload.senderName, { name: payload.senderName, connected: true });
            this.pendingConnections.delete(payload.senderName);
            console.log(`[${agent.name}] Marked connection with ${payload.senderName} as established.`);
        }
    }
}

const convoManager = new ConversationManager();
export default convoManager;

/*
This function controls conversation flow by deciding when the bot responds.
The logic is as follows:
- If neither bot is busy, respond quickly with a small delay.
- If only the other bot is busy, respond with a long delay to allow it to finish short actions (ex check inventory)
- If I'm busy but other bot isn't, let LLM decide whether to respond
- If both bots are busy, don't respond until someone is done, excluding a few actions that allow fast responses
- New messages received during the delay will reset the delay following this logic, and be queued to respond in bulk
*/
const talkOverActions = ['stay', 'followPlayer', 'mode:']; // all mode actions
const fastDelay = 200;
const longDelay = 5000;
async function _scheduleProcessInMessage(sender, received, convo) {
    if (convo.inMessageTimer)
        clearTimeout(convo.inMessageTimer);
    let otherAgentBusy = containsCommand(received.message);

    const scheduleResponse = (delay) => convo.inMessageTimer = setTimeout(() => _processInMessageQueue(sender), delay);

    if (!agent.isIdle() && otherAgentBusy) {
        // both are busy
        let canTalkOver = talkOverActions.some(a => agent.actions.currentActionLabel.includes(a));
        if (canTalkOver)
            scheduleResponse(fastDelay)
        // otherwise don't respond
    }
    else if (otherAgentBusy)
        // other bot is busy but I'm not
        scheduleResponse(longDelay);
    else if (!agent.isIdle()) {
        // I'm busy but other bot isn't
        let canTalkOver = talkOverActions.some(a => agent.actions.currentActionLabel.includes(a));
        if (canTalkOver) {
            scheduleResponse(fastDelay);
        }
        else {
            let shouldRespond = await agent.prompter.promptShouldRespondToBot(received.message);
            console.log(`${agent.name} decided to ${shouldRespond?'respond':'not respond'} to ${sender}`);
            if (shouldRespond)
                scheduleResponse(fastDelay);
        }
    }
    else {
        // neither are busy
        scheduleResponse(fastDelay);
    }
}

function _processInMessageQueue(name) {
    const convo = convoManager._getConvo(name);
    _handleFullInMessage(name, _compileInMessages(convo));
}

function _compileInMessages(convo) {
    let pack = {};
    let full_message = '';
    while (convo.in_queue.length > 0) {
        pack = convo.in_queue.shift();
        full_message += pack.message;
    }
    pack.message = full_message;
    return pack;
}

function _handleFullInMessage(sender, received) {
    console.log(`${agent.name} responding to "${received.message}" from ${sender}`);
    
    const convo = convoManager._getConvo(sender);
    convo.active = true;

    let message = _tagMessage(received.message);
    if (received.end) {
        convoManager.endConversation(sender);
        message = `Conversation with ${sender} ended with message: "${message}"`;
        sender = 'system'; // bot will respond to system instead of the other bot
    }
    else if (received.start)
        agent.shut_up = false;
    convo.inMessageTimer = null;
    agent.handleMessage(sender, message);
}


function _tagMessage(message) {
    return "(FROM OTHER BOT)" + message;
}

async function _resumeSelfPrompter() {
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (agent.self_prompter.isPaused() && !convoManager.inConversation()) {
        agent.self_prompter.start();
    }
}
