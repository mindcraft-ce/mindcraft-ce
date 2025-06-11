import assert from 'assert';
import { encodeText, decodeText, calculateSimilarity } from '../../src/utils/unicode.js';

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

describe('Unicode Encoding/Decoding', () => {
    const testCases = [
        { name: "Empty string", input: "" },
        { name: "Simple short string", input: "hello" },
        { name: "String with spaces", input: "hello world" },
        { name: "String with numbers", input: "12345" },
        { name: "String with symbols", input: "!@#$%^&*()" },
        { name: "String with mixed content", input: "Hello 123 !@#" },
        { name: "Longer string", input: "This is a longer test string with various characters to ensure robustness." }
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

    it('decodeText should handle mixed valid and invalid content (partial decoding)', () => {
        const validPart = encodeText("hi");
        const invalidPart = "普通文字"; // "Normal text" in Chinese

        const decodedPrefix = decodeText(validPart + invalidPart);
        assert.strictEqual(decodedPrefix, "hi", "Should decode the valid prefix part when invalid follows");

        const decodedSuffix = decodeText(invalidPart + validPart);
        // Current unicode.js decodeText will skip over non-mapping characters.
        // So if invalidPart contains no zero-width spaces/non-joiners, it will be skipped.
        assert.strictEqual(decodedSuffix, "hi", "Should skip leading invalid part and decode valid suffix");

        const mixedInMiddle = encodeText("h") + invalidPart + encodeText("i");
        assert.strictEqual(decodeText(mixedInMiddle), "hi", "Should skip invalid part in the middle");

    });

    it('decodeText should handle strings with only one type of zero-width char', () => {
        const allZeros = '\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B'; // Represents a null byte (0x00)
        const decodedZeros = decodeText(allZeros);
        assert.strictEqual(decodedZeros, String.fromCharCode(0), "Should decode string of U+200B (zeros)");

        const allOnes = '\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C'; // Represents 0xFF
        const decodedOnes = decodeText(allOnes);
        assert.strictEqual(decodedOnes, String.fromCharCode(255), "Should decode string of U+200C (ones)");
    });

     it('decodeText should handle incomplete byte at the end gracefully', () => {
        const encodedHello = encodeText("hello");
        const incompleteEncoded = encodedHello.substring(0, encodedHello.length - 3); // Remove last 3 zero-width chars
        const decoded = decodeText(incompleteEncoded);
        // "hell" should be decoded, the last partial 'o' should be ignored.
        assert.strictEqual(decoded, "hell", "Should decode up to the last complete byte");
    });
});

describe('Jaro-Winkler Similarity Calculation', () => {
    it('should return 1.0 for identical strings', () => {
        assert.strictEqual(calculateSimilarity("test", "test"), 1.0);
        assert.strictEqual(calculateSimilarity("", ""), 1.0);
        assert.strictEqual(calculateSimilarity("long string test", "long string test"), 1.0);
    });

    it('should return 0.0 for completely different strings (or very low for Jaro-Winkler)', () => {
        assert.ok(calculateSimilarity("apple", "banana") < 0.7, "apple vs banana should be low"); // Jaro-Winkler gives non-zero due to 'a'
        assert.strictEqual(calculateSimilarity("abc", "xyz"), 0.0, "abc vs xyz should be 0.0");
    });

    it('should return high similarity for very similar strings', () => {
        assert.ok(calculateSimilarity("test", "tets") > 0.8, "test vs tets"); // High similarity
        assert.ok(calculateSimilarity("apple", "apply") > 0.85, "apple vs apply"); // apply vs apple, m=2 ('a','p'), t=0. jaro = (2/5+2/5+(2-0)/2)/3 = (0.4+0.4+1)/3 = 1.8/3=0.6. l=1 ('a'). JW = 0.6 + 1*0.1*(1-0.6) = 0.6 + 0.04 = 0.64 -- this seems low, will check my formula understanding.
        // My Jaro-Winkler understanding or example values might be slightly off, the key is "high similarity"
        // For "apple" vs "apply": s1_matches = [t,t,t,f,t], s2_matches = [t,t,t,f,t]. m=4.
        // s1: a p p l e
        // s2: a p p y e
        // matches: a,p,p,e (m=4).
        // transpositions: 'l' vs 'y' is not a transposition as they are different characters. So t=0.
        // Jaro = (4/5 + 4/5 + (4-0)/4) / 3 = (0.8 + 0.8 + 1) / 3 = 2.6 / 3 = 0.8666...
        // Common prefix 'app', l=3.
        // JW = Jaro + l * p * (1 - Jaro) = 0.8666 + 3 * 0.1 * (1 - 0.8666) = 0.8666 + 0.3 * 0.1333 = 0.8666 + 0.03999 = 0.90665
        assert.ok(calculateSimilarity("apple", "apply") > 0.9, "apple vs apply");


        assert.ok(calculateSimilarity("martha", "marhta") > 0.95, "martha vs marhta"); // Transposition: (m=6, t=1) Jaro=(6/6+6/6+(6-1)/6)/3 = (1+1+5/6)/3 = (2+0.833)/3 = 2.833/3 = 0.944. l=3. JW = 0.944 + 3*0.1*(1-0.944) = 0.944 + 0.3*0.056 = 0.944 + 0.0168 = 0.9608
        assert.ok(calculateSimilarity("dwayne", "duane") > 0.8, "dwayne vs duane");
    });

    it('should handle strings of different lengths', () => {
        assert.ok(calculateSimilarity("test", "testing") > 0.8, "test vs testing"); // Jaro: m=4. (4/4 + 4/7 + (4-0)/4)/3 = (1+0.571+1)/3 = 2.571/3 = 0.857. l=4. JW = 0.857 + 4*0.1*(1-0.857) = 0.857 + 0.4*0.143 = 0.857 + 0.0572 = 0.9142
        assert.ok(calculateSimilarity("verylongstring", "short") < 0.6, "verylongstring vs short");
    });

    it('should handle empty string as one or both inputs', () => {
        assert.strictEqual(calculateSimilarity("test", ""), 0.0, "test vs empty");
        assert.strictEqual(calculateSimilarity("", "test"), 0.0, "empty vs test");
        assert.strictEqual(calculateSimilarity("", ""), 1.0, "empty vs empty - already tested but good for completeness here");
    });

    it('should respect the prefix bonus for Jaro-Winkler', () => {
        // Jaro for "abc" vs "abd": m=2 ('a','b'), t=0. (2/3 + 2/3 + (2-0)/2)/3 = (0.666+0.666+1)/3 = 2.333/3 = 0.777...
        // l=2 ('ab'). JW = 0.777 + 2*0.1*(1-0.777) = 0.777 + 0.2*0.222 = 0.777 + 0.0444 = 0.8214...
        const score_abc_abd = calculateSimilarity("abc", "abd");

        // Jaro for "acb" vs "adb": m=2 ('a','b'), t=0. (2/3 + 2/3 + (2-0)/2)/3 = 0.777...
        // l=1 ('a'). JW = 0.777 + 1*0.1*(1-0.777) = 0.777 + 0.1*0.222 = 0.777 + 0.0222 = 0.7992...
        const score_acb_adb = calculateSimilarity("acb", "adb");

        assert.ok(score_abc_abd > score_acb_adb, `Prefix bonus: 'abc'/'abd' (${score_abc_abd}) > 'acb'/'adb' (${score_acb_adb})`);
        assert.ok(calculateSimilarity("johnson", "johsnson") > 0.9, "johnson vs johsnson with prefix");
    });
});

console.log("\nUnicode utility tests completed. Check for any '✗' indicating failures.");
