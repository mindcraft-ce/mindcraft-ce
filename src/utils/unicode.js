/**
 * Encodes a string using Unicode zero-width characters.
 * Converts the input text to its binary representation,
 * and then uses U+200B for '0' and U+200C for '1'.
 *
 * @param {string} text The text to encode.
 * @returns {string} The encoded string.
 */
function _originalEncodeText(text) { // Renamed
  let binaryText = '';
  for (let i = 0; i < text.length; i++) {
    binaryText += text[i].charCodeAt(0).toString(2).padStart(8, '0');
  }

  let encodedText = '';
  for (let i = 0; i < binaryText.length; i++) {
    if (binaryText[i] === '0') {
      encodedText += '\u200B'; // Zero-width space
    } else {
      encodedText += '\u200C'; // Zero-width non-joiner
    }
  }
  return encodedText;
}

/**
 * Decodes a string encoded with Unicode zero-width characters.
 * Converts the zero-width characters (U+200B for '0', U+200C for '1')
 * back to a binary string, then to the original text.
 *
 * @param {string} encodedText The encoded string.
 * @returns {string} The decoded string.
 */
function _originalDecodeText(encodedText) { // Renamed
  let binaryText = '';
  for (let i = 0; i < encodedText.length; i++) {
    if (encodedText[i] === '\u200B') {
      binaryText += '0';
    } else if (encodedText[i] === '\u200C') {
      binaryText += '1';
    }
  }

  let decodedText = '';
  for (let i = 0; i < binaryText.length; i += 8) {
    const byte = binaryText.substring(i, i + 8);
    if (byte.length === 8) {
      decodedText += String.fromCharCode(parseInt(byte, 2));
    }
  }
  return decodedText;
}

/**
 * Calculates the Jaro-Winkler similarity between two strings.
 * @param {string} s1 The first string.
 * @param {string} s2 The second string.
 * @returns {number} The Jaro-Winkler similarity (0 to 1).
 */
function calculateSimilarity(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const m = Math.max(s1.length, s2.length);
  const range = Math.floor(m / 2) - 1;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const low = Math.max(0, i - range);
    const high = Math.min(i + range + 1, s2.length);
    for (let j = low; j < high; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
  }
  t /= 2;

  const jaro = (matches / s1.length + matches / s2.length + (matches - t) / matches) / 3;

  // Winkler modification
  let l = 0; // length of common prefix
  const p = 0.1; // scaling factor
  while (s1[l] === s2[l] && l < Math.min(s1.length, s2.length, 4)) {
    l++;
  }

  return jaro + l * p * (1 - jaro);
}

const UNICODE_OBFUSCATION_KEY = "MINDCRAFT-123";

/**
 * XORs two strings. Loops keyString if it's shorter than input.
 * @param {string} input The input string.
 * @param {string} keyString The key string.
 * @returns {string} The XORed string.
 */
function xorStrings(input, keyString) {
  if (!keyString) return input; // No key, return original
  let output = '';
  for (let i = 0; i < input.length; i++) {
    output += String.fromCharCode(input.charCodeAt(i) ^ keyString.charCodeAt(i % keyString.length));
  }
  return output;
}

// New encodeText that includes XOR obfuscation
function encodeText(text) {
  const obfuscatedText = xorStrings(text, UNICODE_OBFUSCATION_KEY);
  return _originalEncodeText(obfuscatedText);
}

// New decodeText that includes XOR deobfuscation
function decodeText(encodedText) {
  const potentiallyObfuscatedText = _originalDecodeText(encodedText);
  return xorStrings(potentiallyObfuscatedText, UNICODE_OBFUSCATION_KEY);
}

const JSON_PAYLOAD_PREFIX = "JSON_PAYLOAD::";

/**
 * Encodes a JSON payload object into a Unicode zero-width character string.
 * The object is stringified, prefixed, and then encoded.
 * @param {object} payloadObject The JSON object to encode.
 * @returns {string} The Unicode-encoded string.
 */
function encodeJsonPayload(payloadObject) {
  const stringifiedPayload = JSON.stringify(payloadObject);
  const prefixedPayload = JSON_PAYLOAD_PREFIX + stringifiedPayload;
  // Obfuscation is handled by encodeText now
  return encodeText(prefixedPayload);
}

/**
 * Decodes a Unicode zero-width character string that might contain a prefixed JSON payload.
 * If the prefix is found, it extracts and returns the JSON string.
 * Otherwise, it returns the decoded string as is (e.g., for PING messages).
 *
 * @param {string} encodedText The Unicode-encoded string.
 * @returns {{ type: 'json', payload: string } | { type: 'ping', payload: string } | { type: 'unknown', payload: string }}
 */
function decodePayload(encodedText) {
  // Deobfuscation is handled by decodeText now
  const decodedString = decodeText(encodedText);
  if (decodedString.startsWith(JSON_PAYLOAD_PREFIX)) {
    return {
      type: 'json',
      payload: decodedString.substring(JSON_PAYLOAD_PREFIX.length)
    };
  } else if (decodedString.length > 0) {
    return {
      type: 'ping',
      payload: decodedString
    };
  }
  return {
      type: 'unknown',
      payload: decodedString
  };
}

export { encodeText, decodeText, calculateSimilarity, encodeJsonPayload, decodePayload, JSON_PAYLOAD_PREFIX, UNICODE_OBFUSCATION_KEY };
