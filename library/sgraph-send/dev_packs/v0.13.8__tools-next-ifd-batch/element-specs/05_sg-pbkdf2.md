# Element Spec: sg-pbkdf2.js (Key Derivation)

**Layer:** Core
**IFD path:** `core/pbkdf2/v1/v1.0/v1.0.0/sg-pbkdf2.js`
**Effort:** Low
**Batch:** 1 (Foundation)
**Dependencies:** None (pure Web Crypto API)

---

## What

A core module that derives AES-256 encryption keys from human-friendly passphrases using PBKDF2. This is the bridge between "apple-mango-56" (what humans type) and a 256-bit AES key (what the crypto module needs).

## Why

The friendly key system (`word-word-number`) requires a key derivation function to convert passphrases into cryptographic keys. PBKDF2 is the standard choice — it's built into Web Crypto API, widely understood, and the iteration count provides tuneable security.

## Files to Create

```
core/pbkdf2/v1/v1.0/v1.0.0/
  sg-pbkdf2.js
  manifest.json
```

## API

```javascript
/**
 * Derive an AES-256-GCM key from a passphrase using PBKDF2.
 *
 * @param {string} passphrase - The passphrase (e.g. "apple-mango-56")
 * @param {object} [options]
 * @param {number} [options.iterations=600000] - PBKDF2 iteration count
 * @param {Uint8Array} [options.salt] - Salt bytes (default: well-known fixed salt)
 * @returns {Promise<{key: CryptoKey, derivationTimeMs: number}>}
 */
export async function deriveKey(passphrase, options = {})

/**
 * Derive an AES-256-GCM key from words + suffix.
 * Normalises to lowercase, joins with "-", calls deriveKey().
 *
 * @param {string[]} words - Words (e.g. ["Apple", "Mango"])
 * @param {string} suffix - Numeric suffix (e.g. "56")
 * @param {object} [options] - Same options as deriveKey()
 * @returns {Promise<{key: CryptoKey, passphrase: string, derivationTimeMs: number}>}
 */
export async function deriveKeyFromWords(words, suffix, options = {})

/**
 * Calculate entropy bits for a passphrase.
 *
 * @param {string} passphrase - The passphrase to evaluate
 * @param {number} [wordListSize=2000] - Size of the word list
 * @returns {{ bits: number, combinations: number, rating: string }}
 *   rating is one of: "weak", "fair", "good", "strong"
 */
export function calculateEntropy(passphrase, wordListSize = 2000)
```

## Implementation Notes

### deriveKey()

```javascript
export async function deriveKey(passphrase, options = {}) {
    const iterations = options.iterations || 600000
    const salt       = options.salt || new TextEncoder().encode('sgraph-send-v1')
    const start      = performance.now()

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    )

    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,   // extractable — needed for geek mode hex display
        ['encrypt', 'decrypt']
    )

    return { key, derivationTimeMs: performance.now() - start }
}
```

### Fixed Salt

The salt is fixed (`sgraph-send-v1`) for friendly keys. This is intentional — friendly keys are not passwords. The salt prevents rainbow table attacks on PBKDF2 output, but since friendly keys are shared out-of-band (not stored as hashes), per-user salts don't add security value. The fixed salt means the same passphrase always produces the same key, which is required for the system to work (sender and receiver both derive the same key from the same words).

### calculateEntropy()

Entropy calculation logic:

- Split passphrase on `-` or whitespace
- For each segment:
  - If it matches a word list entry: `log2(wordListSize)` bits
  - If it's numeric: `log2(10^length)` bits
  - If it's alphanumeric: `log2(62^length)` bits
  - If it's alphabetic: `log2(26^length)` bits
- Sum the bits
- Rating thresholds: <20 = "weak", 20-30 = "fair", 30-40 = "good", >40 = "strong"

### Performance

At 600,000 iterations, PBKDF2 takes ~100-300ms on modern devices. On older mobile devices it could exceed 500ms. The `derivationTimeMs` return value lets the UI display this to users in geek mode.

## Acceptance Criteria

- [ ] `deriveKey("apple-mango-56")` produces a valid AES-256-GCM CryptoKey
- [ ] Same passphrase always produces the same key (deterministic)
- [ ] `deriveKeyFromWords(["Apple", "MANGO"], "56")` normalises and produces same key as `deriveKey("apple-mango-56")`
- [ ] `calculateEntropy("apple-mango-56", 2000)` returns correct bits and "good" rating
- [ ] Derivation time is <500ms on desktop browsers
- [ ] `derivationTimeMs` accurately measures the derivation
- [ ] manifest.json created
- [ ] JSDoc on all exports
