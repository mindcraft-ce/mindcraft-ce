import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import settings from '../src/agent/settings.js';
import { fetchPerception, pushPosition, clearPerceptionCache, resetPushState } from '../src/agent/topography/service.js';
import { Feed } from '../src/agent/topography/feed.js';
import { SeenReporter } from '../src/agent/topography/seen.js';
import { executeCommand } from '../src/agent/commands/index.js';
import { executeTool, getToolDefinitions } from '../src/agent/commands/tool_registry.js';

// A profile's cartography_service_url (and cartography_token) applies to every request that agent
// makes: perception, position, the map commands (text and native tools), the chunk feed and /seen.

const realFetch = globalThis.fetch;
const savedEnv = process.env.CARTOGRAPHY_SERVICE_URL;
const savedSetting = settings.cartography_service_url;
let requests = [];

test.before(() => {
    process.env.CARTOGRAPHY_SERVICE_URL = 'http://env.test:9001';
    settings.cartography_service_url = 'http://settings.test:9000';
    globalThis.fetch = (url, init = {}) => {
        requests.push({ url: String(url), headers: init.headers ?? {} });
        const body = String(url).includes('/recall') ? { cx: 0, cz: 0, surface: {} }
            : String(url).includes('/settlements') ? { settlements: [] }
                : { center: { x: 0, z: 0 }, size_chunks: 16, lod: [], biome: 'minecraft:plains' };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
});
test.after(() => {
    globalThis.fetch = realFetch;
    if (savedEnv === undefined) delete process.env.CARTOGRAPHY_SERVICE_URL;
    else process.env.CARTOGRAPHY_SERVICE_URL = savedEnv;
    if (savedSetting === undefined) delete settings.cartography_service_url;
    else settings.cartography_service_url = savedSetting;
});

function makeAgent(profile) {
    const bot = new EventEmitter();
    bot.game = { dimension: 'overworld' };
    bot.entity = { position: { x: 10, y: 64, z: 20 } };
    bot.registry = { blocksByStateId: { 1: { name: 'stone' } }, biomes: {} };
    const column = { minY: -64, worldHeight: 384, sections: [{ data: { value: 1 } }], biomes: [] };
    bot.world = { getColumn: () => column, getColumns: () => [{ chunkX: 0, chunkZ: 0 }] };
    return { name: 'Topo', bot, blocked_actions: [], prompter: { profile: { cartography_enabled: true, ...profile } } };
}

async function everyRequest(agent) {
    requests = [];
    clearPerceptionCache();
    resetPushState();
    await fetchPerception(agent, { enabled: true });
    pushPosition(agent, { enabled: true });
    await executeCommand(agent, '!recall(1, 2)');
    await executeTool(agent, 'recall', { x: 1, z: 2 });
    const seen = new SeenReporter(agent, { intervalMs: 600000, resyncMs: 0 });
    const feed = new Feed(agent, { seen });
    feed.attach(agent.bot);
    feed.stop();
    agent.bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    await new Promise(resolve => setTimeout(resolve, 30));
    await seen.flush();
    seen.stop();
    const paths = requests.map(r => new URL(r.url).pathname);
    for (const path of ['/perception', '/position', '/recall', '/chunk_raw', '/seen'])
        assert.ok(paths.includes(path), `${path} was requested`);
    return requests;
}

test('a profile service URL is used for every request the agent makes, over env and settings', async () => {
    const agent = makeAgent({ cartography_service_url: 'http://bot-a.test:9100/', cartography_token: 'a-token' });
    const sent = await everyRequest(agent);
    for (const request of sent) {
        assert.ok(request.url.startsWith('http://bot-a.test:9100/'), request.url);
        assert.equal(request.headers.Authorization, 'Bearer a-token');
    }
});

test('a profile with its own URL but no token never sends the global token', async () => {
    const savedToken = settings.cartography_token;
    settings.cartography_token = 'global-token';
    try {
        const sent = await everyRequest(makeAgent({ cartography_service_url: 'http://bot-b.test:9200' }));
        for (const request of sent)
            assert.equal(request.headers.Authorization, undefined, request.url);
        const shared = await everyRequest(makeAgent({}));
        for (const request of shared)
            assert.equal(request.headers.Authorization, 'Bearer global-token', request.url);
    } finally {
        settings.cartography_token = savedToken;
    }
});

test('without a profile URL the agent falls back to the environment variable', async () => {
    const sent = await everyRequest(makeAgent({}));
    for (const request of sent)
        assert.ok(request.url.startsWith('http://env.test:9001/'), request.url);
});

test('map tools are hidden from native tool calling when cartography is off for the agent', async () => {
    const off = makeAgent({ cartography_enabled: false });
    const names = getToolDefinitions(off).map(t => t.function.name);
    assert.ok(!names.includes('recall'));
    assert.ok(getToolDefinitions(makeAgent({})).some(t => t.function.name === 'recall'));
    await assert.rejects(executeTool(off, 'recall', { x: 1, z: 2 }), /not found or disabled/);
    const nether = makeAgent({});
    nether.bot.game.dimension = 'the_nether';
    assert.match(await executeTool(nether, 'recall', { x: 1, z: 2 }), /only available in the overworld/);
});
