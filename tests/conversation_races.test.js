import test from 'node:test';
import assert from 'node:assert/strict';
import manager from '../src/agent/conversation.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function setup(t, overrides = {}) {
    const responses = [];
    manager.convos = {};
    manager.activeConversation = null;
    manager._stopMonitor();
    const agent = {
        name: 'TestBot', last_sender: null,
        isIdle: () => false,
        actions: { currentActionLabel: 'action:dig' },
        self_prompter: { isActive: () => false, isPaused: () => false },
        prompter: { promptShouldRespondToBot: () => Promise.resolve(true) },
        history: { add: () => Promise.resolve() },
        handleMessage: (sender, message) => {
            responses.push({ sender, message });
            return Promise.resolve();
        },
        ...overrides,
    };
    manager.initAgent(agent);
    t.after(() => {
        for (const convo of Object.values(manager.convos)) convo.clearTimer();
        manager._stopMonitor();
    });
    return { agent, responses };
}

test('ending a conversation invalidates an outstanding model decision', async t => {
    const decision = deferred();
    const { responses } = setup(t, {
        prompter: { promptShouldRespondToBot: () => decision.promise },
    });
    const pending = manager.receiveFromBot('OtherBot', { message: 'hello', start: true });
    manager.endConversation('OtherBot');
    decision.resolve(true);
    await pending;
    assert.equal(manager._getConvo('OtherBot').inMessageTimer, null);
    assert.equal(manager.inConversation('OtherBot'), false);
    assert.deepEqual(responses, []);
});

test('restarting a conversation prevents the old decision from scheduling', async t => {
    const decision = deferred();
    const { agent, responses } = setup(t, {
        prompter: { promptShouldRespondToBot: () => decision.promise },
    });
    const pending = manager.receiveFromBot('OtherBot', { message: 'old', start: true });
    agent.isIdle = () => true;
    await manager.receiveFromBot('OtherBot', { message: 'new', start: true });
    const timer = manager._getConvo('OtherBot').inMessageTimer;
    decision.resolve(true);
    await pending;
    assert.equal(manager._getConvo('OtherBot').inMessageTimer, timer);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.deepEqual(responses, [{ sender: 'OtherBot', message: '(FROM OTHER BOT)new' }]);
});

test('a newer message supersedes a slower response decision', async t => {
    const decision = deferred();
    let requests = 0;
    setup(t, { prompter: { promptShouldRespondToBot: () => ++requests === 1 ? decision.promise : Promise.resolve(false) } });
    const pending = manager.receiveFromBot('OtherBot', { message: 'first', start: true });
    await manager.receiveFromBot('OtherBot', { message: 'second' });
    decision.resolve(true);
    await pending;
    const convo = manager._getConvo('OtherBot');
    assert.equal(convo.inMessageTimer, null);
    assert.deepEqual(convo.in_queue.map(pack => pack.message), ['first', 'second']);
});

test('ending during a self-prompter pause cannot schedule an inbound response', async t => {
    const pause = deferred();
    setup(t, {
        isIdle: () => true,
        self_prompter: { isActive: () => true, isPaused: () => false, pause: () => pause.promise },
    });
    const pending = manager.receiveFromBot('OtherBot', { message: 'hello', start: true });
    manager.endConversation('OtherBot');
    pause.resolve();
    await pending;
    assert.equal(manager._getConvo('OtherBot').inMessageTimer, null);
    assert.equal(manager.inConversation('OtherBot'), false);
});

test('ending during an outbound start pause cannot restart the conversation', async t => {
    const pause = deferred();
    setup(t, {
        self_prompter: { isActive: () => true, isPaused: () => false, pause: () => pause.promise },
    });
    const pending = manager.startConversation('OtherBot', 'hello');
    manager.endConversation('OtherBot');
    pause.resolve();
    await pending;
    assert.equal(manager.inConversation('OtherBot'), false);
    assert.equal(manager.activeConversation, null);
});
