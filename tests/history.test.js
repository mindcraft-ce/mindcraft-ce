import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { History } from '../src/agent/history.js';

function makeAgent() {
    return {
        name: 'TestBot',
        prompter: { promptMemSaving: () => Promise.resolve('') },
        self_prompter: { state: 0, isStopped: () => true, prompt: '' },
        task: { taskStartTime: 0 },
        last_sender: null
    };
}

test('archived history serializes concurrent appends as JSONL', async () => {
    const originalCwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), 'mindcraft-history-'));
    process.chdir(dir);

    try {
        const history = new History(makeAgent());

        await Promise.all([
            history.appendFullHistory([{ role: 'user', content: 'one' }]),
            history.appendFullHistory([{ role: 'assistant', content: 'two' }]),
        ]);

        const lines = readFileSync(history.full_history_fp, 'utf8').trim().split('\n').map(JSON.parse);
        assert.deepEqual(lines, [
            { role: 'user', content: 'one' },
            { role: 'assistant', content: 'two' }
        ]);
    } finally {
        process.chdir(originalCwd);
        rmSync(dir, { recursive: true, force: true });
    }
});

test('save waits for earlier un-awaited mutations and serializes snapshots', async () => {
    const originalCwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), 'mindcraft-history-save-'));
    process.chdir(dir);

    try {
        const history = new History(makeAgent());
        history.max_messages = 100;

        // Deliberately do not await add(): this mirrors legacy call sites. save()
        // must observe the mutation barrier that already exists.
        history.add('Player', 'first');
        const firstSave = history.save();
        history.add('Player', 'second');
        const secondSave = history.save();

        await Promise.all([firstSave, secondSave]);
        await history.flush();

        const persisted = JSON.parse(readFileSync(history.memory_fp, 'utf8'));
        assert.deepEqual(persisted.turns, [
            { role: 'user', content: 'Player: first' },
            { role: 'user', content: 'Player: second' },
        ]);
    } finally {
        process.chdir(originalCwd);
        rmSync(dir, { recursive: true, force: true });
    }
});
