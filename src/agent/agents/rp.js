import { rpAgentResponseFormat } from './responseFormat.js';
import { createLogger } from '../../utils/logger.js';
import settings from '../settings.js';
import { chatText, parseObject } from './structured.js';

const log = createLogger('RPAgent');

const MAX_MEMORY_PER_PLAYER = 20;

export class RPAgent {
    constructor(agent) {
        this.agent = agent;
        this.playerMemories = Object.create(null);
        this.playerNotes = Object.create(null);
    }

    async transform(message, source) {
        if (this.agent.prompter.profile?.use_rp_agent === false) return message;
        const memory = this._getPlayerMemory(source);
        memory.push({role:'user',content:`Rewrite this message briefly in character for ${source}, preserving all facts. Do not suppress it or add claims: ${message}`});
        try {
            const notes=this.playerNotes[source];
            const [text] = await this.agent.prompter.handleRequest('rp', [
                ...(notes?[{role:'user',content:`Player notes (tone only; do not add facts to the requested message): ${notes}`}]:[]),...memory,
            ]);
            memory.push({role:'assistant',content:text});
            const parsed=parseObject(text);
            if(typeof parsed?.internal_notes==='string') this._updateNotes(source,parsed.internal_notes);
            if(typeof parsed?.relationship_updates==='string') this._updateNotes(source,parsed.relationship_updates);
            return chatText(text) || message;
        } catch (error) {
            console.warn('RP voice unavailable:', error.message);
            return message;
        } finally { this._trimMemory(source); }
    }

    async respond(source, message, brainContext) {
        const memory = this._getPlayerMemory(source);

        let userContent = `${source}: ${message}`;
        if (brainContext?.thoughts)
            userContent += `\n\n[Brain's analysis]: ${brainContext.thoughts}`;
        memory.push({ role: 'user', content: userContent });

        const notes = this.playerNotes[source];
        const notesContext = notes ? `\n\n[Your notes about ${source}]: ${notes}` : '';

        const messagesForLLM = [...memory];
        if (notesContext && messagesForLLM.length > 0) {
            messagesForLLM[0] = {
                ...messagesForLLM[0],
                content: notesContext + '\n\n' + messagesForLLM[0].content
            };
        }

        let response;
        try {
            [response] = await this.agent.prompter.handleRequest(
                'rp', messagesForLLM, [], rpAgentResponseFormat
            );
        } catch (error) {
            log.error('LLM request failed:', error);
            return null;
        }

        if (!response) return null;

        let parsed;
        try {
            parsed = parseObject(response);
            if (!parsed) throw new Error('No structured reply');
        } catch (e) {
            log.warn('Failed to parse response as JSON:', response);
            memory.push({ role: 'assistant', content: response });
            this._trimMemory(source);
            return response;
        }

        memory.push({ role: 'assistant', content: response });
        this._trimMemory(source);

        if (parsed.internal_notes)
            this._updateNotes(source, parsed.internal_notes);
        if (parsed.relationship_updates)
            this._updateNotes(source, parsed.relationship_updates);

        log.info(`Response to ${source}: ${parsed.chat_response}`);
        if (parsed.internal_notes)
            log.debug(`Notes about ${source}: ${parsed.internal_notes}`);

        return parsed.chat_response || null;
    }

    _getPlayerMemory(source) {
        if (!this.playerMemories[source])
            this.playerMemories[source] = [];
        return this.playerMemories[source];
    }

    _trimMemory(source) {
        const max = settings.max_messages || MAX_MEMORY_PER_PLAYER;
        const memory = this.playerMemories[source];
        if (memory && memory.length > max)
            this.playerMemories[source] = memory.slice(-max);
    }

    _updateNotes(source, newNotes) {
        const existing = this.playerNotes[source] || '';
        const combined = existing ? `${existing}\n${newNotes}` : newNotes;
        this.playerNotes[source] = combined.length > 500
            ? '...' + combined.slice(-497)
            : combined;
    }
}
