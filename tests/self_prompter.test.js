import test from 'node:test';
import assert from 'node:assert/strict';
import { SelfPrompter } from '../src/agent/self_prompter.js';

function makePrompter(overrides = {}) {
    const agent = {
        actions: { stop: () => Promise.resolve() },
        isIdle: () => true,
        handleMessage: () => Promise.resolve(true),
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

test('a start request racing shutdown restarts with the latest prompt', async () => {
    let firstRelease;
    let secondRelease;
    let calls = 0;
    const prompter = makePrompter({
        handleMessage: () => new Promise(resolve => {
            calls++;
            if (calls === 1)
                firstRelease = () => resolve(true);
            else
                secondRelease = () => resolve(true);
        }),
    });
    prompter.cooldown = 0;
    prompter.start('first goal');
    await new Promise(resolve => setImmediate(resolve));

    const stopping = prompter.stopLoop();
    prompter.start('replacement goal');
    firstRelease();
    await stopping;

    for (let i = 0; i < 5 && !secondRelease; i++)
        await new Promise(resolve => setImmediate(resolve));

    assert.equal(prompter.isActive(), true);
    assert.equal(prompter.prompt, 'replacement goal');
    assert.equal(prompter.loop_active, true);
    assert.equal(calls, 2);

    const finalStop = prompter.stop(false);
    secondRelease();
    await finalStop;
    assert.equal(prompter.isStopped(), true);
    assert.equal(prompter.loop_active, false);
});

test('loop failures are contained and transition self-prompting to stopped', async () => {
    const prompter = makePrompter({
        handleMessage: () => Promise.reject(new Error('boom')),
    });

    await prompter.startLoop();

    assert.equal(prompter.isStopped(), true);
    assert.equal(prompter.loop_active, false);
    assert.equal(prompter.loopPromise, null);
});
