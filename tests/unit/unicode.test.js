import assert from 'assert';
import {
    encodeText,
    decodeText,
    calculateSimilarity,
    encodeJsonPayload,
    decodePayload,
    JSON_PAYLOAD_PREFIX
} from '../../src/utils/unicode.js';

// Helper for logging test sections
function describe(description, fn) {
    console.log(`\n--- ${description} ---`);
    fn();
}

// Helper for individual tests
function it(description, fn) {
    try {
        fn();
        console.log(`  ✓ ${description}`);
    } catch (error) {
        console.error(`  ✗ ${description}`);
        console.error(error);
    }
}

describe('Legacy Unicode Encoding/Decoding (encodeText, decodeText)', () => {
    const testCases = [
        { name: "Empty string", input: "" },
        { name: "Simple short string", input: "hello" },
        { name: "String with spaces", input: "hello world" },
        { name: "String with numbers", input: "12345" },
        { name: "String with symbols", input: "!@#$%^&*()" },
    ];

    testCases.forEach(tc => {
        it(`should correctly encode and decode: ${tc.name} ("${tc.input}")`, () => {
            const encoded = encodeText(tc.input);
            const decoded = decodeText(encoded);
            assert.strictEqual(decoded, tc.input, `Failed for input: ${tc.input}`);
        });
    });

    it('decodeText should return empty string for non-zero-width char strings', () => {
        const decoded = decodeText("completely normal text");
        assert.strictEqual(decoded, "", "Should be empty for non-encoded string");
    });

    it('decodeText should return empty string for random unicode chars not part of encoding', () => {
        const decoded = decodeText("\u0041\u0042\u0043"); // "ABC"
        assert.strictEqual(decoded, "", "Should be empty for other unicode chars");
    });

    it('decodeText should handle incomplete byte at the end gracefully', () => {
        const encodedHello = encodeText("hello");
        const incompleteEncoded = encodedHello.substring(0, encodedHello.length - 3);
        const decoded = decodeText(incompleteEncoded);
        assert.strictEqual(decoded, "hell", "Should decode up to the last complete byte");
    });
});

describe('JSON Payload Encoding (encodeJsonPayload)', () => {
    const testObject = {
        message: "Hello there!",
        count: 42,
        active: true,
        data: { nested: "value" }
    };

    it('should produce a non-empty string', () => {
        const encoded = encodeJsonPayload(testObject);
        assert.strictEqual(typeof encoded, 'string');
        assert.ok(encoded.length > 0, "Encoded string should not be empty");
    });

    it('decodePayload on its output should return type "json"', () => {
        const encoded = encodeJsonPayload(testObject);
        const decodedResult = decodePayload(encoded);
        assert.strictEqual(decodedResult.type, 'json', "Decoded type should be 'json'");
    });

    it('re-parsed JSON from decodePayload should match original object', () => {
        const encoded = encodeJsonPayload(testObject);
        const decodedResult = decodePayload(encoded);
        assert.strictEqual(decodedResult.type, 'json');
        const parsedJson = JSON.parse(decodedResult.payload);
        assert.deepStrictEqual(parsedJson, testObject, "Re-parsed JSON should match original");
    });

    it('should handle empty object payload', () => {
        const emptyObj = {};
        const encoded = encodeJsonPayload(emptyObj);
        const decodedResult = decodePayload(encoded);
        assert.strictEqual(decodedResult.type, 'json');
        const parsedJson = JSON.parse(decodedResult.payload);
        assert.deepStrictEqual(parsedJson, emptyObj, "Re-parsed JSON should match empty object");
    });
});

describe('Payload Decoding (decodePayload)', () => {
    it('should correctly decode a JSON payload', () => {
        const originalObject = { message: "test payload" };
        const encoded = encodeJsonPayload(originalObject);
        const result = decodePayload(encoded);
        assert.strictEqual(result.type, 'json');
        assert.strictEqual(result.payload, JSON.stringify(originalObject));
    });

    it('should correctly decode a PING message (MINDCRAFT_COMMS_PING)', () => {
        const pingMessage = "MINDCRAFT_COMMS_PING";
        const encodedPing = encodeText(pingMessage);
        const result = decodePayload(encodedPing);
        assert.strictEqual(result.type, 'ping');
        assert.strictEqual(result.payload, pingMessage);
    });

    it('should decode an empty encoded string (from encodeText("")) as type "unknown"', () => {
        const encodedEmpty = encodeText(""); // decodeText("") will return ""
        const result = decodePayload(encodedEmpty);
        assert.strictEqual(result.type, 'unknown', "Type should be 'unknown' for empty string from encodeText('')");
        assert.strictEqual(result.payload, "", "Payload should be an empty string");
    });

    it('should return type "unknown" for a non-encoded string with no zero-width chars', () => {
        const nonEncodedString = "this is normal text";
        const result = decodePayload(nonEncodedString); // decodeText will return ""
        assert.strictEqual(result.type, 'unknown', "Type should be 'unknown' for non-encoded string");
        assert.strictEqual(result.payload, "", "Payload should be empty string as decodeText returns empty");
    });

    it('should return type "json" for a string with JSON prefix but invalid JSON content', () => {
        const invalidJsonString = JSON_PAYLOAD_PREFIX + "{not_json_data";
        const encodedInvalidJson = encodeText(invalidJsonString);
        const result = decodePayload(encodedInvalidJson);
        assert.strictEqual(result.type, 'json');
        assert.strictEqual(result.payload, "{not_json_data");
    });

    it('should return type "ping" for a plain Unicode-encoded string without prefix', () => {
        const otherMessage = "some other message";
        const encodedOtherMessage = encodeText(otherMessage);
        const result = decodePayload(encodedOtherMessage);
        assert.strictEqual(result.type, 'ping');
        assert.strictEqual(result.payload, otherMessage);
    });

    it('should return type "unknown" for a completely empty string input', () => {
        const result = decodePayload(""); // "" directly, not encodeText("")
        assert.strictEqual(result.type, 'unknown');
        assert.strictEqual(result.payload, "");
    });
});


describe('Jaro-Winkler Similarity Calculation', () => {
    // Existing Jaro-Winkler tests are kept as is.
    it('should return 1.0 for identical strings', () => {
        assert.strictEqual(calculateSimilarity("test", "test"), 1.0);
        assert.strictEqual(calculateSimilarity("", ""), 1.0);
    });

    it('should return 0.0 for completely different strings (or very low)', () => {
        assert.strictEqual(calculateSimilarity("abc", "xyz"), 0.0);
    });

    it('should return high similarity for very similar strings', () => {
        assert.ok(calculateSimilarity("martha", "marhta") > 0.95);
        assert.ok(calculateSimilarity("apple", "apply") > 0.9);
    });

    it('should handle strings of different lengths', () => {
        assert.ok(calculateSimilarity("test", "testing") > 0.8);
    });

    it('should handle empty string as one or both inputs', () => {
        assert.strictEqual(calculateSimilarity("test", ""), 0.0);
        assert.strictEqual(calculateSimilarity("", "test"), 0.0);
    });
});

console.log("\nUnicode utility tests completed. Check for any '✗' indicating failures.");
