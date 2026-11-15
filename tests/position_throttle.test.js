// SPDX-License-Identifier: CC0-1.0
// initBot holds back position packets sent less than 50 ms apart, for Paper's rate limits. A client that
// ends its own ticks (1.21.2+) must not have a packet moved out of its tick, or a newer server kicks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { throttlePositionPackets } from '../src/utils/mcdata.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function fakeBot() {
    const sent = [];
    const bot = { _client: { write: (name, data) => sent.push([name, data?.x]) } };
    throttlePositionPackets(bot);
    return { bot, sent };
}

test('position packets closer than 50 ms are held back, and the last one is still sent', async () => {
    const { bot, sent } = fakeBot();
    bot._client.write('position', { x: 1 });
    bot._client.write('position', { x: 2 });
    assert.deepEqual(sent, [['position', 1]], 'the second packet waits');
    await delay(80);
    assert.deepEqual(sent, [['position', 1], ['position', 2]]);
});

test('a client that ends its ticks itself sends each position packet in its own tick', async () => {
    // From 1.21.2 the client closes every tick with tick_end, and a newer server kicks a client that sends
    // two position packets in one tick. A packet held back by a timer would leave its own tick and land in
    // the next one, beside that tick's own position packet.
    const { bot, sent } = fakeBot();
    bot._client.write('position', { x: 1 });
    bot._client.write('tick_end', {});
    bot._client.write('position', { x: 2 });
    bot._client.write('tick_end', {});
    await delay(80);
    assert.deepEqual(sent, [['position', 1], ['tick_end', undefined], ['position', 2], ['tick_end', undefined]]);
});
