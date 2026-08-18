import { readFileSync, mkdirSync, existsSync } from 'fs';
import { appendFile } from 'fs/promises';
import settings from './settings.js';
import { atomicWriteJson } from '../utils/atomic_file.js';

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;
        this.full_history_write = Promise.resolve();
        this.mutation_write = Promise.resolve();
        this.save_write = Promise.resolve();

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });
        this.turns = [];
        this.memory = '';
        this.max_messages = settings.max_messages;
        this.summary_chunk_size = 5;
    }

    getHistory() {
        return structuredClone(this.turns);
    }

    _queueMutation(operation) {
        const pending = this.mutation_write.then(operation);
        // Keep the internal queue usable after an operation fails. The original
        // promise is still returned so awaited callers receive the failure.
        this.mutation_write = pending.catch(error => {
            console.error(`History mutation failed for ${this.name}:`, error);
        });
        return pending;
    }

    async summarizeMemories(turns) {
        console.log('Storing memories...');
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        if (this.memory.length > 500) {
            this.memory = this.memory.slice(0, 500);
            this.memory += '...(Memory truncated to 500 chars. Compress it more next time)';
        }

        console.log('Memory updated to: ', this.memory);
    }

    async appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.jsonl`;
        }

        const lines = to_store.map(turn => JSON.stringify(turn)).join('\n');
        if (lines.length === 0)
            return;

        const writeOperation = this.full_history_write.then(() =>
            appendFile(this.full_history_fp, lines + '\n', 'utf8')
        );
        this.full_history_write = writeOperation.catch(error => {
            console.error(`Error appending ${this.name}'s full history file: ${error.message}`);
        });
        return writeOperation;
    }

    // Shutdown messages participate in the mutation queue but never trigger
    // summarization/provider work.
    addShutdownMessage(content) {
        return this._queueMutation(() => {
            this.turns.push({ role: 'system', content });
        });
    }

    add(name, content) {
        return this._queueMutation(() => this._add(name, content));
    }

    async _add(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        if (this.turns.length >= this.max_messages) {
            const chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift());

            await this.summarizeMemories(chunk);
            await this.appendFullHistory(chunk);
        }
    }

    _snapshot() {
        const selfPrompter = this.agent.self_prompter;
        return structuredClone({
            memory: this.memory,
            turns: this.turns,
            self_prompting_state: selfPrompter?.state ?? 0,
            self_prompt: !selfPrompter || selfPrompter.isStopped() ? null : selfPrompter.prompt,
            taskStart: this.agent.task?.taskStartTime ?? null,
            last_sender: this.agent.last_sender
        });
    }

    save() {
        // Capture the mutation barrier that existed when save() was requested.
        // Every persisted snapshot waits for that barrier and for the previous
        // snapshot, preventing an older asynchronous write from landing last.
        const mutationBarrier = this.mutation_write;
        const writeOperation = this.save_write.then(async () => {
            await mutationBarrier;
            await this.full_history_write;
            const data = this._snapshot();
            await atomicWriteJson(this.memory_fp, data, 2);
            console.log('Saved memory to:', this.memory_fp);
        });

        this.save_write = writeOperation.catch(error => {
            console.error('Failed to save history:', error);
        });
        return writeOperation;
    }

    async flush() {
        await this.mutation_write;
        await this.full_history_write;
        await this.save_write;
    }

    load() {
        try {
            if (!existsSync(this.memory_fp)) {
                console.log('No memory file found.');
                return null;
            }
            const data = JSON.parse(readFileSync(this.memory_fp, 'utf8'));
            this.memory = data.memory || '';
            this.turns = data.turns || [];
            console.log('Loaded memory:', this.memory);
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            throw error;
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}
