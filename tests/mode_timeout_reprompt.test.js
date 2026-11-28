// SPDX-License-Identifier: CC0-1.0
// When a mode interrupts an action and the mode's own action then times out, the model must still be
// re-prompted. Otherwise the bot stands still with nobody told (seen live: unstuck's moveAway timing out).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { ActionManager } from '../src/agent/action_manager.js';
import { guardBotActions } from '../src/agent/action_context.js';
import { ProgressTracker } from '../src/agent/progress.js';
import { initModes } from '../src/agent/modes.js';
import rootSettings from '../settings.js';
import { setSettings } from '../src/agent/settings.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

// moveAway reads block ids from mcdata.js, which loads its game data when a bot logs in. A bot pointed at
// a closed port never connects; telling it that it logged in loads the data all the same.
async function loadGameData() {
    setSettings({ ...rootSettings, host: '127.0.0.1', port: 1, auth: 'offline' });
    const mc = await import('../src/utils/mcdata.js');
    const bot = mc.initBot('GameData');
    bot.on('error', () => {});
    bot.emit('login');
    bot.end();
}

function setup(t) {
    let clock = 0;
    const bot = new EventEmitter();
    Object.assign(bot, {
        username: 'Bot', health: 20, food: 20, output: '', interrupt_code: false,
        registry: minecraftData('1.21.6'), entity: { position: new Vec3(0, 64, 0) },
        game: { dimension: 'minecraft:overworld', gameMode: 'survival' }, entities: {}, players: {},
        inventory: { items: () => [] }, world: { getColumn: () => null }, blockAt: () => null,
        clearControlStates() {}, setControlState() {}, chat() {},
    });
    // The path search never finishes, so unstuck's moveAway runs until the mode's own timeout.
    bot.pathfinder = {
        setMovements() {}, setGoal() {}, stop() {}, goto: () => new Promise(() => {}), isMoving: () => true,
        *getPathFromTo() { for (;;) yield { result: { status: 'partial', path: [] } }; },
    };
    guardBotActions(bot);
    const messages = [];
    const agent = {
        name: 'Bot', bot, shut_up: true, blocked_actions: [], task: {}, last_sender: null,
        prompter: { profile: {}, getInitModes: () => null },
        self_prompter: { isActive: () => false, stopLoop() {}, handleUserPromptedCmd() {} },
        clearBotLogs() { bot.output = ''; bot.interrupt_code = false; },
        requestInterrupt() { bot.interrupt_code = true; },
        isIdle() { return !agent.actions.executing; },
        handleMessage: (source, message) => { messages.push(message); },
    };
    agent.actions = new ActionManager(agent);
    agent.actions.progress = new ProgressTracker(() => clock);
    initModes(agent);
    bot.modes.loadJson(Object.fromEntries(Object.keys(bot.modes.getJson()).map(name => [name, name === 'unstuck'])));
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});
    return { agent, bot, messages, advance: ms => { clock += ms; } };
}

test('a mode action that times out still re-prompts about the action it interrupted', async t => {
    await loadGameData();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const s = setup(t);
    // An action that makes no progress.
    s.agent.actions.runAction('action:goToCoordinates', () => new Promise(() => {}));
    await tick();
    await s.bot.modes.update();          // unstuck sees the bot's cell once
    s.advance(25000);
    const fired = s.bot.modes.update();  // unstuck fires and starts its own action
    for (let i = 0; i < 10; i++) { t.mock.timers.tick(1); await tick(); }  // let the old action stop
    assert.equal(s.agent.actions.currentActionLabel, 'mode:unstuck');
    t.mock.timers.tick(0.25 * 60000 + 1); // the mode action's own timeout
    for (let i = 0; i < 10; i++) await tick();
    await fired;
    assert.equal(s.messages.length, 1);
    assert.match(s.messages[0], /'action:goToCoordinates' was interrupted by unstuck/);
});
