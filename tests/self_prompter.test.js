import test from 'node:test';
import assert from 'node:assert/strict';
import { SelfPrompter } from '../src/agent/self_prompter.js';

function makePrompter(overrides = {}) {
    const agent = {
        actions: { stop: async () => {} },
        isIdle: () => true,
        handleMessage: async () => true,
        openChat: () => {},
        ...overrides,
    };
    return new SelfPrompter(agent);
}

test('stopLoop waits for the owned loop promise and clears lifecycle state', async () => {
    let release;
    const prompter = makePrompter({
        handleMessage: () => new Promise(resolve => { release = () => resolve(true); }),
    });
    prompter.cooldown = 0;
    prompter.start('test goal');

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prompter.loop_active, true);
    assert.ok(prompter.loopPromise);

    const stopping = prompter.stopLoop();
    release();
    await stopping;

    assert.equal(prompter.loop_active, false);
    assert.equal(prompter.loopPromise, null);
    assert.equal(prompter.interrupt, false);
});

test('stop changes state immediately and waits for loop shutdown', async () => {
    let release;
    const prompter = makePrompter({
        handleMessage: () => new Promise(resolve => { release = () => resolve(true); }),
    });
    prompter.cooldown = 0;
    prompter.start('test goal');
    await new Promise(resolve => setImmediate(resolve));

    const stopping = prompter.stop(false);
    assert.equal(prompter.isStopped(), true);
    release();
    await stopping;

    assert.equal(prompter.loop_active, false);
    assert.equal(prompter.interrupt, false);
});

test('loop failures are contained and transition self-prompting to stopped', async () => {
    const prompter = makePrompter({
        handleMessage: async () => { throw new Error('boom'); },
    });

    await prompter.startLoop();

    assert.equal(prompter.isStopped(), true);
    assert.equal(prompter.loop_active, false);
    assert.equal(prompter.loopPromise, null);
});
