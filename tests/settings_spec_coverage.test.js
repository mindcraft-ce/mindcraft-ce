import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import settings from '../settings.js';

const specUrl = new URL('../src/mindcraft/public/settings_spec.json', import.meta.url);
const spec = JSON.parse(readFileSync(specUrl, 'utf8'));

test('settings_spec.json covers every key exported by settings.js', () => {
    const missing = Object.keys(settings).filter(key => !(key in spec));
    assert.deepEqual(missing, [], `settings_spec.json omits: ${missing.join(', ')}`);
});

test('every settings.js key has a typed schema entry', () => {
    for (const key of Object.keys(settings)) {
        assert.equal(typeof spec[key], 'object', `${key} needs a schema entry`);
        assert.ok(spec[key]?.type, `${key} needs a declared type`);
    }
});
