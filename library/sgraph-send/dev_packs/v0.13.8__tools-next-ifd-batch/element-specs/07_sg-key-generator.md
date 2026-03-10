# Element Spec: `<sg-key-generator>` (Friendly Key Creator)

**Layer:** Component
**IFD path:** `components/key-generator/v1/v1.0/v1.0.0/`
**Effort:** Medium
**Batch:** 2 (Key Management)
**Tag name:** `sg-key-generator`
**Dependencies:** sg-crypto.js, sg-pbkdf2.js, sg-wordlist.js (all from Batch 1)

---

## What

A visual, interactive Web Component for creating and understanding encryption keys. Users can pick words from a list or type their own, see the entropy (how secure the key is), and optionally view the derived AES key in "geek mode."

## Why

This is simultaneously:
1. **A product feature** — used in the Send upload flow for friendly keys
2. **A marketing tool** — standalone at tools.sgraph.ai/key-generator/
3. **An educational tool** — teaches users about encryption key strength
4. **A building block** — paired with `<sg-key-input>` for the complete key workflow

## Files to Create

```
components/key-generator/v1/v1.0/v1.0.0/
  sg-key-generator.js
  sg-key-generator.html
  sg-key-generator.css
  manifest.json
```

## UI Layout

```
┌─────────────────────────────────────────────┐
│  Create Your Key                            │
│                                             │
│  Word 1: [apple    ▼]  (or type your own)   │
│  Word 2: [mango    ▼]  (or type your own)   │
│  Suffix: [56       ] (auto-generated)        │
│                                             │
│  Your key: apple-mango-56                   │
│                                             │
│  Security: ████████░░  ~4.2 billion combos  │
│                                             │
│  [Geek Mode ▼]                              │
│  Derived AES key: a7f2b9c4d8e1...           │
│  KDF: PBKDF2 (600,000 iterations)           │
│  Time to derive: 142ms                      │
│                                             │
│  [Copy Key]  [Regenerate]  [Use This Key]   │
└─────────────────────────────────────────────┘
```

## API Contract

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `locale` | string | `en-gb` | Language for word list |
| `word-count` | number | `2` | Number of words |
| `suffix-length` | number | `2` | Number of digits in suffix |
| `min-entropy` | number | `30` | Minimum bits for "good" rating |
| `show-geek-mode` | boolean | `false` | Start with geek mode expanded |
| `allow-custom-words` | boolean | `true` | Allow free-text word entry |

| Event | Detail | When |
|-------|--------|------|
| `key-generated` | `{ key: string, entropy: { bits, combinations, rating }, derivedKey: CryptoKey, derivationTimeMs: number }` | New key generated (initial or regenerate) |
| `key-changed` | `{ key: string, entropy: { bits, combinations, rating } }` | Any change (word selection, typing, suffix change) |
| `key-copied` | `{ key: string }` | User clicks Copy Key |
| `key-used` | `{ key: string, derivedKey: CryptoKey }` | User clicks Use This Key |

| Slot | Description |
|------|-------------|
| `actions` | Additional action buttons |

## Sections

### 1. Word Selection

Each word slot has:
- A dropdown populated from the word list (`sg-wordlist.js`)
- A text input for free typing (if `allow-custom-words` is true)
- A "shuffle" icon button to pick a new random word for just that slot

The suffix is auto-generated (random digits) but editable.

### 2. Key Preview

Shows the assembled key: `word1-word2-suffix`

Updates in real-time as the user changes words or suffix.

### 3. Entropy Bar

Visual bar showing key strength:

```
Weak    Fair    Good    Strong
░░░░░░  ░░░░░░  ████░░  ░░░░░░
```

Below the bar: "~X combinations" in human-readable format:
- 1,000 → "~1 thousand combinations"
- 4,000,000 → "~4 million combinations"
- 4,000,000,000 → "~4 billion combinations"

Colour coding: red (weak), orange (fair), green (good), blue (strong).

Uses `calculateEntropy()` from `sg-pbkdf2.js`.

### 4. Geek Mode (Expandable)

Collapsed by default (unless `show-geek-mode` is true). Shows:

- **Derived AES-256 key** (hex): export the CryptoKey and display as hex
- **KDF:** "PBKDF2 (600,000 iterations, SHA-256)"
- **Derivation time:** "142ms" (from `derivationTimeMs`)
- **Salt:** "sgraph-send-v1 (fixed)"
- **Key length:** "256 bits"

This section updates in real-time when the key changes.

### 5. Action Buttons

- **Copy Key** — copies the friendly key string to clipboard
- **Regenerate** — picks new random words + suffix
- **Use This Key** — emits `key-used` event (for parent integration)

## Implementation Notes

### Initialisation Flow

```javascript
async onReady() {
    // 1. Load word list
    this.wordList = await getWordList(this.locale)

    // 2. Generate initial random key
    const words = await getRandomWords(this.wordCount, this.locale)
    const suffix = this.generateSuffix()

    // 3. Derive the CryptoKey
    const { key, derivationTimeMs } = await deriveKeyFromWords(words, suffix)

    // 4. Calculate entropy
    const entropy = calculateEntropy(words.join('-') + '-' + suffix, this.wordList.length)

    // 5. Render and emit
    this.render({ words, suffix, key, derivationTimeMs, entropy })
    this.emit('key-generated', { ... })
}
```

### Suffix Generation

```javascript
generateSuffix() {
    const array = new Uint8Array(this.suffixLength)
    crypto.getRandomValues(array)
    return Array.from(array).map(b => b % 10).join('')
}
```

### User-Chosen Words

When `allow-custom-words` is true, the text input accepts any string. The entropy calculation adjusts:
- If the word is in the word list: `log2(wordListSize)` bits
- If it's a custom word: calculated per-character entropy

**Design decision from the brief:** "User-chosen words are allowed. The key leaking its context is not a threat — the recipient who receives the key will see the file contents anyway."

## i18n Keys

```json
{
  "component_keygen_title": "Create Your Key",
  "component_keygen_word_label": "Word {n}",
  "component_keygen_suffix_label": "Suffix",
  "component_keygen_or_type": "or type your own",
  "component_keygen_auto_generated": "auto-generated",
  "component_keygen_your_key": "Your key",
  "component_keygen_security": "Security",
  "component_keygen_combinations": "~{count} combinations",
  "component_keygen_weak": "Weak",
  "component_keygen_fair": "Fair",
  "component_keygen_good": "Good",
  "component_keygen_strong": "Strong",
  "component_keygen_geek_mode": "Geek Mode",
  "component_keygen_derived_key": "Derived AES key",
  "component_keygen_kdf": "KDF",
  "component_keygen_derive_time": "Time to derive",
  "component_keygen_copy": "Copy Key",
  "component_keygen_copied": "Copied!",
  "component_keygen_regenerate": "Regenerate",
  "component_keygen_use": "Use This Key"
}
```

## Acceptance Criteria

- [ ] Component renders with random words + suffix on load
- [ ] Dropdown shows words from sg-wordlist.js
- [ ] Free-text input accepts custom words (when allow-custom-words is true)
- [ ] Entropy bar updates in real-time as key changes
- [ ] Entropy shows human-readable combination count
- [ ] Geek mode shows derived AES key (hex), KDF details, derivation time
- [ ] Copy Key copies to clipboard
- [ ] Regenerate picks new random words + suffix
- [ ] Use This Key emits event with CryptoKey
- [ ] Extends SgComponent, uses Shadow DOM
- [ ] manifest.json created
- [ ] i18n keys in all 5 locale files
- [ ] Works standalone and composable inside sg-layout

## Source Brief

UX Components brief (`v0.13.5__dev-brief__ux-components-qa-cross-team.md`), Part 1, Component 2: `<sg-key-generator>`.
