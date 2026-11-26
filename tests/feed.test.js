import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { Feed } from '../src/agent/topography/feed.js';
import { SeenReporter } from '../src/agent/topography/seen.js';
import settings from '../src/agent/settings.js';

// Topography is off by default; these tests exercise it switched on.
settings.cartography_enabled = true;

function makeBot({ column = null } = {}) {
    const bot = new EventEmitter();
    bot.username = 'Topo';
    bot.game = { dimension: 'minecraft:overworld' };
    bot.registry = {
        blocksByStateId: {
            1: { name: 'stone' },
            2: { name: 'grass_block' },
            3: { name: 'air' },
        },
        biomes: { 1: { name: 'plains' } },
    };
    bot.world = {
        getColumn: () => column,
        getColumns: () => [{ chunkX: 0, chunkZ: 0 }],
    };
    return bot;
}

function makeColumn() {
    const sections = Array.from({ length: 24 }, () => ({
        data: { value: 3 }, // single-value air
    }));
    // y = 4 (firstY = -4, index 8): an indirect palette with 1-bit data (all stone)
    sections[8] = {
        data: {
            palette: [1, 2],
            data: { bitsPerValue: 1, data: new Uint32Array(128) },
        },
    };
    const biomes = Array.from({ length: 24 }, () => ({ data: { value: 1 } }));
    return { minY: -64, worldHeight: 384, sections, biomes };
}

function makeFeed({ profile = {}, column = null, fetchImpl = null, clock = { now: 0 } } = {}) {
    const calls = [];
    const doFetch = fetchImpl ?? (async (url, init) => {
        calls.push({ url, init });
        return { ok: true };
    });
    const agent = { name: 'Topo', prompter: { profile } };
    const seen = new SeenReporter(agent, { intervalMs: 600000, resyncMs: 0, fetchImpl: doFetch });
    const feed = new Feed(agent, { fetchImpl: doFetch, now: () => clock.now, seen });
    const bot = makeBot({ column });
    agent.bot = bot;
    feed.attach(bot);
    feed.stop(); // tests drive the queue explicitly
    return { feed, bot, agent, calls, clock, doFetch };
}

const settle = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
async function drain(feed) {
    for (let i = 0; i < 60; i++) {
        await settle();
        if (feed.queue.size === 0 && feed.inflight === 0) {
            await settle();
            if (feed.queue.size === 0 && feed.inflight === 0) return;
        }
    }
}

test('a loaded chunk is forwarded with name palettes, packed data and biomes', async () => {
    const { feed, bot, calls } = makeFeed({ column: makeColumn() });
    bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    await drain(feed, calls);
    const rawCalls = calls.filter(c => String(c.url).endsWith('/chunk_raw'));
    assert.ok(rawCalls.length >= 1);
    const body = JSON.parse(rawCalls[0].init.body.toString('utf8'));
    assert.equal(body.format, 1);
    assert.equal(body.dimension, 'minecraft:overworld');
    assert.equal(body.agent, 'Topo');
    const chunk = body.chunks[0];
    assert.deepEqual({ cx: chunk.cx, cz: chunk.cz, min_y: chunk.min_y, height: chunk.height },
        { cx: 0, cz: 0, min_y: -64, height: 384 });
    // air sections are omitted; the one real section keeps its y and names
    assert.equal(chunk.sections.length, 1);
    assert.equal(chunk.sections[0].y, 4);
    assert.deepEqual(chunk.sections[0].palette, ['minecraft:stone', 'minecraft:grass_block']);
    assert.equal(chunk.sections[0].enc, 'packed');
    assert.equal(chunk.sections[0].bits, 1);
    assert.ok(chunk.sections[0].data.length > 0);
    assert.equal(chunk.biomes[0].palette[0], 'minecraft:plains');
});

test('a direct container becomes a local palette plus u16 indices', () => {
    const column = makeColumn();
    const values = new Array(4096).fill(1);
    for (let i = 0; i < 10; i++) values[i] = 2;
    column.sections[8] = {
        data: {
            data: { bitsPerValue: 15, data: new Uint32Array(4096) },
            get: (i) => values[i],
        },
    };
    const { feed } = makeFeed({ column });
    const chunk = feed.serialize(0, 0);
    const section = chunk.sections[0];
    assert.equal(section.enc, 'u16');
    assert.deepEqual(section.palette, ['minecraft:grass_block', 'minecraft:stone']);
    const raw = Buffer.from(section.data, 'base64');
    assert.equal(raw.length, 8192);
    assert.equal(raw.readUInt16LE(0), 0);   // grass_block
    assert.equal(raw.readUInt16LE(20), 1);  // stone
});

test('an unload drops the queued chunk and reports it to the seen ledger', async () => {
    const { feed, bot } = makeFeed({ column: makeColumn() });
    bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    assert.equal(feed.queue.size, 1);
    bot.emit('chunkColumnUnload', { x: 0, z: 0 });
    assert.equal(feed.queue.size, 0);
    assert.equal(feed.seen.pending.get('minecraft:overworld')?.get('0,0')?.op, 'unload');
});

test('block changes are debounced (2 s quiet, 10 s max) and re-forwarded at most every 5 s', () => {
    const clock = { now: 0 };
    const { feed } = makeFeed({ column: makeColumn(), clock });
    feed._pump = () => {};
    clock.now = 1000;
    feed.bot.emit('blockUpdate', { stateId: 1 }, { stateId: 2, position: { x: 3, y: 65, z: 4 } });
    clock.now = 2000;
    feed._tick();
    assert.equal(feed.queue.size, 0, 'still inside the quiet period');
    clock.now = 3500;
    feed._tick();
    assert.equal(feed.queue.size, 1, '2 s after the last change');
    feed.queue.clear();
    // a chunk forwarded now is not forwarded again for 5 s
    feed.lastSent.set('minecraft:overworld|0,0', 3500);
    feed._enqueue(0, 0, 'minecraft:overworld');
    assert.equal(feed.queue.size, 0);
    clock.now = 8600;
    feed._enqueue(0, 0, 'minecraft:overworld');
    assert.equal(feed.queue.size, 1);
    // the 10 s maximum age flushes a chunk that keeps changing
    feed.queue.clear();
    clock.now = 20000;
    feed._markDirty(1, 1, 'minecraft:overworld');
    for (let t = 21000; t <= 30000; t += 1000) { clock.now = t; feed._markDirty(1, 1, 'minecraft:overworld'); feed._tick(); }
    assert.equal(feed.queue.size, 1);
});

test('queue cap drops the oldest entry and sets resync', () => {
    const { feed } = makeFeed({ column: makeColumn() });
    feed._pump = () => {};
    for (let i = 0; i < 5000; i++) feed._enqueue(i, 0, 'minecraft:overworld');
    assert.equal(feed.queue.size, 4096);
    assert.equal(feed.resync, true);
});

test('the attach-time rescan coerces string chunk coordinates', () => {
    const { feed, bot } = makeFeed({ column: makeColumn() });
    feed._pump = () => {};
    bot.world.getColumns = () => [{ chunkX: '5', chunkZ: '-3' }, { chunkX: 'x', chunkZ: 1 }];
    feed._resync();
    assert.deepEqual([...feed.queue.keys()], ['minecraft:overworld|5,-3']);
});

test('a failed batch is retried once, then dropped with a resync; no throw', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: false }; };
    const { feed, bot } = makeFeed({ column: makeColumn(), fetchImpl });
    bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    await drain(feed, [1, 2, 3]);
    assert.ok(calls >= 2, 'retried');
    assert.equal(feed.queue.size, 0, 'dropped after the second failure');
    assert.equal(feed.resync, true);
    assert.equal(feed.inflight, 0);
});

test('a token is sent as Authorization: Bearer', async () => {
    const saved = settings.cartography_token;
    settings.cartography_token = 's3cret';
    try {
        const { feed, bot, calls } = makeFeed({ column: makeColumn() });
        bot.emit('chunkColumnLoad', { x: 0, z: 0 });
        await drain(feed, calls);
        const rawCall = calls.find(c => String(c.url).endsWith('/chunk_raw'));
        assert.equal(rawCall.init.headers.Authorization, 'Bearer s3cret');
    } finally {
        settings.cartography_token = saved;
    }
});

test('topography_feed off registers no chunk forwarding; the seen ledger still works', () => {
    const { feed, bot } = makeFeed({ column: makeColumn(), profile: { topography_feed: 'off' } });
    bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    assert.equal(feed.queue.size, 0);
    assert.equal(feed.seen.pending.get('minecraft:overworld')?.get('0,0')?.op, 'load');
    feed.stop();
});

test('an enabled feed owns chunk events and still feeds the seen ledger', () => {
    const { feed, bot } = makeFeed({ column: makeColumn() });
    feed._pump = () => {};
    bot.emit('chunkColumnLoad', { x: 16, z: 32 });
    assert.equal(feed.queue.size, 1);
    assert.equal(feed.seen.pending.get('minecraft:overworld')?.get('1,2')?.op, 'load');
});

test('a gzipped body over 8 KB is decompressible and still valid JSON', async () => {
    const { feed, bot, calls } = makeFeed({ column: makeColumn() });
    // Make the payload large: a 16-bit direct section is ~8 KB of base64 on its own.
    const column = makeColumn();
    column.sections[8] = {
        data: {
            data: { bitsPerValue: 15, data: new Uint32Array(4096) },
            get: (i) => (i % 2 ? 1 : 2),
        },
    };
    feed.bot.world.getColumn = () => column;
    bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    await drain(feed, calls);
    const call = [...calls].reverse().find(c => String(c.url).endsWith('/chunk_raw'));
    let raw = call.init.body;
    if (call.init.headers['Content-Encoding'] === 'gzip') raw = zlib.gunzipSync(raw);
    const body = JSON.parse(raw.toString('utf8'));
    assert.ok(body.chunks[0].sections[0].data.length > 0);
});


// ---- dimensions: a chunk is labelled with the dimension it was loaded in, never another ----

function makeDimensionWorld() {
    // A fake mineflayer world that, like the real one, holds only the current dimension's columns.
    const stone = () => {
        const column = makeColumn();
        column.sections[8] = { data: { value: 1 } }; // all stone
        return column;
    };
    const netherrack = () => {
        const column = makeColumn();
        column.sections[8] = { data: { value: 4 } }; // all netherrack
        return column;
    };
    const worlds = { 'minecraft:overworld': stone, 'minecraft:the_nether': netherrack };
    const state = { loaded: new Map() };
    return {
        state,
        switchTo(bot, dimension) {
            bot.game.dimension = dimension.replace('minecraft:', '');
            state.loaded = new Map();
            state.make = worlds[dimension];
        },
        load(bot, cx, cz) {
            state.loaded.set(`${cx},${cz}`, state.make());
            bot.emit('chunkColumnLoad', { x: cx * 16, z: cz * 16 });
        },
        install(bot) {
            state.make = worlds['minecraft:overworld'];
            bot.world.getColumn = (cx, cz) => state.loaded.get(`${cx},${cz}`) ?? null;
            bot.world.getColumns = () => [...state.loaded.keys()].map(k => {
                const [chunkX, chunkZ] = k.split(',');
                return { chunkX, chunkZ };
            });
        },
    };
}

function rawBodies(calls) {
    return calls.filter(c => String(c.url).endsWith('/chunk_raw')).map(c => {
        let raw = c.init.body;
        if (c.init.headers['Content-Encoding'] === 'gzip') raw = zlib.gunzipSync(raw);
        return JSON.parse(raw.toString('utf8'));
    });
}

function palettesOf(body) {
    return body.chunks.flatMap(chunk => chunk.sections.flatMap(section => section.palette));
}

test('Overworld -> Nether -> Overworld: nothing from the Nether is ever sent as overworld', async () => {
    const { feed, bot, calls } = makeFeed();
    bot.registry.blocksByStateId[4] = { name: 'netherrack' };
    const world = makeDimensionWorld();
    world.install(bot);
    const pump = feed._pump.bind(feed);

    // 1. Overworld: one chunk forwarded, then more work queued and debounced but not yet sent.
    world.load(bot, 0, 0);
    await drain(feed);
    feed._pump = () => {};
    world.load(bot, 1, 0);
    bot.emit('blockUpdate', { stateId: 1 }, { stateId: 2, position: { x: 40, y: 65, z: 0 } });
    assert.equal(feed.queue.size, 1);
    assert.equal(feed.dirty.size, 1);

    // 2. Portal. The bot is in the Nether before any unload or respawn event reaches the feed,
    // so the queued overworld entry would read the Nether column at the same coordinates.
    world.switchTo(bot, 'minecraft:the_nether');
    world.state.loaded.set('1,0', world.state.make());
    feed._pump = pump;
    feed._pump();
    await drain(feed);
    assert.equal(rawBodies(calls).length, 1, 'the stale overworld entry was dropped, not sent');
    assert.ok(feed.dropped >= 1);

    // Then the respawn event and the Nether chunks arrive; a debounced change and the resync run.
    bot.emit('respawn');
    clearTimeout(feed.resyncTimer);
    assert.equal(feed.dirty.size, 0, 'overworld block changes do not survive the switch');
    world.load(bot, 0, 0);
    world.load(bot, 5, 5);
    bot.emit('blockUpdate', { stateId: 4 }, { stateId: 1, position: { x: 80, y: 40, z: 80 } });
    feed._resync();
    await drain(feed);
    feed.lastSent.clear();
    feed.dirty.forEach(entry => { entry.first = -Infinity; });
    feed._tick();
    await drain(feed);

    // 3. Back to the Overworld.
    world.switchTo(bot, 'minecraft:overworld');
    bot.emit('respawn');
    clearTimeout(feed.resyncTimer);
    world.load(bot, 0, 0);
    world.load(bot, 1, 0);
    await drain(feed);
    feed._resync();
    await drain(feed);

    const bodies = rawBodies(calls);
    const overworld = bodies.filter(b => b.dimension === 'minecraft:overworld');
    const nether = bodies.filter(b => b.dimension === 'minecraft:the_nether');
    assert.ok(nether.length >= 1, 'Nether chunks carry their own dimension');
    assert.ok(overworld.length >= 2, 'the Overworld is forwarded again on return');
    for (const body of bodies) assert.ok(body.dimension, 'every request names a dimension');
    for (const body of overworld) {
        assert.ok(!palettesOf(body).includes('minecraft:netherrack'), 'no Nether blocks labelled overworld');
        assert.ok(!body.chunks.some(chunk => chunk.cx === 5 && chunk.cz === 5), 'no Nether-only chunk labelled overworld');
    }
    for (const body of nether)
        assert.ok(!palettesOf(body).includes('minecraft:stone'), 'no Overworld blocks labelled nether');

    // The seen ledger never files a Nether chunk under the overworld either.
    await feed.seen.flush();
    const seenOverworld = calls.filter(c => String(c.url).endsWith('/seen'))
        .map(c => JSON.parse(c.init.body))
        .filter(b => b.dimension === 'minecraft:overworld');
    assert.ok(seenOverworld.length >= 1);
    for (const body of seenOverworld)
        assert.ok(!body.chunks.some(([cx, cz]) => cx === 5 && cz === 5), 'Nether chunk not reported as overworld');
    feed.stop();
    feed.seen.stop();
});

test('an unload after the dimension already changed is still filed under the dimension it was loaded in', () => {
    const { feed, bot } = makeFeed();
    feed._pump = () => {};
    const world = makeDimensionWorld();
    world.install(bot);
    world.load(bot, 3, 3);
    world.switchTo(bot, 'minecraft:the_nether');
    bot.emit('chunkColumnUnload', { x: 48, z: 48 });
    assert.equal(feed.seen.pending.get('minecraft:overworld')?.get('3,3')?.op, 'unload');
    assert.equal(feed.seen.pending.get('minecraft:the_nether')?.get('3,3'), undefined);
    assert.equal(feed.queue.size, 0);
});

test('chunk events while the dimension is unknown are not forwarded or recorded', () => {
    const { feed, bot } = makeFeed({ column: makeColumn() });
    feed._pump = () => {};
    bot.game.dimension = undefined;
    feed.seen.pending.clear();
    bot.emit('chunkColumnLoad', { x: 0, z: 0 });
    bot.emit('blockUpdate', { stateId: 1 }, { stateId: 2, position: { x: 3, y: 65, z: 4 } });
    assert.equal(feed.queue.size, 0);
    assert.equal(feed.dirty.size, 0);
    assert.equal(feed.seen.pending.size, 0);
});
