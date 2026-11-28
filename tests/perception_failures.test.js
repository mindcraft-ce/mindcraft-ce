import test from 'node:test';
import assert from 'node:assert/strict';
import settings, { setSettings } from '../src/agent/settings.js';
import { fetchPerception, pushPosition, clearPerceptionCache, resetPushState } from '../src/agent/topography/service.js';

test('a failed perception request is not retried on the next prompt', async () => {
    const originalFetch = globalThis.fetch;
    const saved = { ...settings };
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('service down'); };
    settings.cartography_enabled = true;
    settings.cartography_service_url = 'http://127.0.0.1:9';
    clearPerceptionCache();
    const agent = {
        name: 'tester',
        prompter: { profile: { cartography_enabled: true } },
        bot: {
            entity: { position: { x: 1234, y: 64, z: 5678 } },
            game: { dimension: 'minecraft:overworld' }
        }
    };
    try {
        assert.equal(await fetchPerception(agent, { enabled: true, timeoutMs: 50 }), '');
        assert.equal(await fetchPerception(agent, { enabled: true, timeoutMs: 50 }), '');
        assert.equal(calls, 1, 'the failure should be cached briefly instead of retried per prompt');
    } finally {
        globalThis.fetch = originalFetch;
        setSettings(saved);
        clearPerceptionCache();
    }
});

test('pushPosition bounds its fire-and-forget request with a timeout', async () => {
    const originalFetch = globalThis.fetch;
    const saved = { ...settings };
    let options;
    globalThis.fetch = async (url, init) => { options = init; return { status: 204 }; };
    settings.cartography_enabled = true;
    resetPushState();
    try {
        pushPosition({
            bot: {
                entity: { position: { x: 4321, y: 64, z: 8765 } },
                game: { dimension: 'minecraft:overworld' }
            }
        }, { enabled: true });
        assert.ok(options?.signal instanceof AbortSignal);
    } finally {
        globalThis.fetch = originalFetch;
        setSettings(saved);
        resetPushState();
    }
});
