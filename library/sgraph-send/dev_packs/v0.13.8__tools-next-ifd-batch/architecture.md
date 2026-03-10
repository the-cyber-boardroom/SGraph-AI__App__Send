# Architecture: IFD Paths, Manifests, and API Contracts

**Version:** v0.13.8
**Date:** 10 March 2026

---

## IFD Path Convention

Every new element follows the established three-level IFD versioning:

```
{layer}/{name}/v{major}/v{major}.{minor}/v{major}.{minor}.{patch}/
```

### Core Modules (Batch 1)

```
core/
  crypto/v1/v1.0/v1.0.0/
    sg-crypto.js          ← Production copy from Send
    manifest.json

  pbkdf2/v1/v1.0/v1.0.0/
    sg-pbkdf2.js           ← Key derivation (PBKDF2)
    manifest.json

  wordlist/v1/v1.0/v1.0.0/
    sg-wordlist.js          ← Friendly key word lists
    wordlists/
      en-gb.json            ← ~2000 common English words
    manifest.json
```

### Components (Batches 1 + 2)

```
components/
  upload-dropzone/v1/v1.0/v1.0.0/
    sg-upload-dropzone.js
    sg-upload-dropzone.html
    sg-upload-dropzone.css
    manifest.json

  key-generator/v1/v1.0/v1.0.0/
    sg-key-generator.js
    sg-key-generator.html
    sg-key-generator.css
    manifest.json

  key-input/v1/v1.0/v1.0.0/
    sg-key-input.js
    sg-key-input.html
    sg-key-input.css
    manifest.json
```

### Tools (Batches 1 + 2)

```
tools/v0/v0.1/v0.1.2/en-gb/
  file-hasher/index.html
  file-encryptor/index.html
  key-generator/index.html
```

**Note:** Tools version bumps from v0.1.1 → v0.1.2 to reflect the new tools added.

---

## manifest.json Template

Every element gets a `manifest.json`:

```json
{
  "name": "sg-{name}",
  "version": "1.0.0",
  "layer": "core | component | tool",
  "description": "One-line description",
  "exports": ["functionName1", "functionName2"],
  "dependencies": [],
  "author": "SGraph Tools Team",
  "license": "CC-BY-4.0"
}
```

### Specific Manifests

**core/crypto/v1/v1.0/v1.0.0/manifest.json:**
```json
{
  "name": "sg-crypto",
  "version": "1.0.0",
  "layer": "core",
  "description": "AES-256-GCM encryption via Web Crypto API — production copy from Send",
  "exports": ["generateKey", "exportKey", "importKey", "encryptFile", "decryptFile"],
  "dependencies": [],
  "source": "sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js"
}
```

**core/pbkdf2/v1/v1.0/v1.0.0/manifest.json:**
```json
{
  "name": "sg-pbkdf2",
  "version": "1.0.0",
  "layer": "core",
  "description": "PBKDF2 key derivation for friendly passphrase-based keys",
  "exports": ["deriveKey", "deriveKeyFromWords"],
  "dependencies": []
}
```

**core/wordlist/v1/v1.0/v1.0.0/manifest.json:**
```json
{
  "name": "sg-wordlist",
  "version": "1.0.0",
  "layer": "core",
  "description": "Word lists for friendly key generation — multilingual",
  "exports": ["getWordList", "getRandomWords", "SUPPORTED_LOCALES"],
  "dependencies": []
}
```

**components/upload-dropzone/v1/v1.0/v1.0.0/manifest.json:**
```json
{
  "name": "sg-upload-dropzone",
  "version": "1.0.0",
  "layer": "component",
  "description": "Drag-and-drop file upload zone with visual feedback",
  "exports": ["SgUploadDropzone"],
  "dependencies": ["sg-component"],
  "tagName": "sg-upload-dropzone",
  "attributes": ["accept", "multiple", "max-size"],
  "events": ["files-selected", "file-dropped"]
}
```

**components/key-generator/v1/v1.0/v1.0.0/manifest.json:**
```json
{
  "name": "sg-key-generator",
  "version": "1.0.0",
  "layer": "component",
  "description": "Friendly encryption key creator with entropy visualisation",
  "exports": ["SgKeyGenerator"],
  "dependencies": ["sg-component", "sg-crypto", "sg-pbkdf2", "sg-wordlist"],
  "tagName": "sg-key-generator",
  "attributes": ["locale", "min-entropy", "show-geek-mode"],
  "events": ["key-generated", "key-changed"]
}
```

**components/key-input/v1/v1.0/v1.0.0/manifest.json:**
```json
{
  "name": "sg-key-input",
  "version": "1.0.0",
  "layer": "component",
  "description": "Mobile-optimised input for friendly decryption keys",
  "exports": ["SgKeyInput"],
  "dependencies": ["sg-component", "sg-pbkdf2", "sg-wordlist"],
  "tagName": "sg-key-input",
  "attributes": ["locale", "placeholder"],
  "events": ["key-submitted", "key-changed"]
}
```

---

## Component API Contracts

### `<sg-upload-dropzone>`

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `accept` | string | `*` | Comma-separated MIME types or extensions |
| `multiple` | boolean | `false` | Allow multiple files |
| `max-size` | number | `0` | Max file size in bytes (0 = no limit) |
| `disabled` | boolean | `false` | Disable the dropzone |

| Event | Detail | When |
|-------|--------|------|
| `files-selected` | `{ files: File[] }` | User selects files via click or drop |
| `file-dropped` | `{ file: File }` | Individual file dropped (fires per file if multiple) |

| Slot | Description |
|------|-------------|
| (default) | Custom content inside the dropzone (replaces default "Drop file here" text) |

**Visual states:** idle, drag-over (highlighted border), file-loaded (shows filename + size).

### `<sg-key-generator>`

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `locale` | string | `en-gb` | Language for word list |
| `min-entropy` | number | `30` | Minimum bits of entropy for "good" indicator |
| `show-geek-mode` | boolean | `false` | Start with geek mode expanded |
| `word-count` | number | `2` | Number of words in generated key |
| `suffix-length` | number | `2` | Length of numeric suffix |

| Event | Detail | When |
|-------|--------|------|
| `key-generated` | `{ key: string, entropy: number, derivedKey: CryptoKey }` | New key generated (random or user-modified) |
| `key-changed` | `{ key: string, entropy: number }` | Any change to key text (typing, word selection) |

| Slot | Description |
|------|-------------|
| `actions` | Custom action buttons below the key display |

**Sections:** Word selection (dropdowns + free text), key preview, entropy bar, geek mode (expandable).

### `<sg-key-input>`

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `locale` | string | `en-gb` | Language for auto-complete word list |
| `placeholder` | string | `apple-mango-56` | Placeholder text |
| `auto-submit` | boolean | `false` | Submit automatically when valid key detected |

| Event | Detail | When |
|-------|--------|------|
| `key-submitted` | `{ key: string, derivedKey: CryptoKey }` | User submits key (Enter or button) |
| `key-changed` | `{ key: string, isValid: boolean }` | Input text changes |

**Input features:**
- Auto-complete from word list (suggest as you type)
- Whitespace/dash tolerance: "apple mango 56", "apple-mango-56", "applemango56" all normalise to `apple-mango-56`
- Paste detection: if user pastes a full URL (`https://send.sgraph.ai/r/abc#apple-mango-56`), extract the key portion automatically
- Token sanitisation: trim whitespace, strip invisible characters, strip smart quotes

---

## Core Module API Contracts

### sg-crypto.js

Exact copy of Send production. Exports match whatever the current production file exports. Do NOT change the API — copy it.

**Expected exports** (verify against production file):
```javascript
export function generateKey()           // Returns CryptoKey
export function exportKey(key)          // Returns base64 string
export function importKey(base64)       // Returns CryptoKey
export function encryptFile(data, key)  // Returns { encrypted, iv }
export function decryptFile(data, key, iv) // Returns decrypted ArrayBuffer
```

### sg-pbkdf2.js

```javascript
/**
 * Derive an AES-256 key from a passphrase using PBKDF2.
 * @param {string} passphrase - The passphrase (e.g. "apple-mango-56")
 * @param {object} [options]
 * @param {number} [options.iterations=600000] - PBKDF2 iterations
 * @param {Uint8Array} [options.salt] - Salt (default: fixed well-known salt for friendly keys)
 * @returns {Promise<{key: CryptoKey, derivationTimeMs: number}>}
 */
export async function deriveKey(passphrase, options = {})

/**
 * Derive an AES-256 key from an array of words + suffix.
 * Normalises to lowercase, joins with "-", then calls deriveKey().
 * @param {string[]} words - The words (e.g. ["apple", "mango"])
 * @param {string} suffix - The numeric suffix (e.g. "56")
 * @returns {Promise<{key: CryptoKey, passphrase: string, derivationTimeMs: number}>}
 */
export async function deriveKeyFromWords(words, suffix)

/**
 * Calculate entropy bits for a given key format.
 * @param {string} passphrase - The passphrase to evaluate
 * @param {number} wordListSize - Size of the word list used
 * @returns {{ bits: number, combinations: number, rating: string }}
 */
export function calculateEntropy(passphrase, wordListSize)
```

### sg-wordlist.js

```javascript
/**
 * Load word list for a locale.
 * @param {string} locale - Locale code (e.g. "en-gb")
 * @returns {Promise<string[]>} Array of ~2000 common words
 */
export async function getWordList(locale = 'en-gb')

/**
 * Get N random words from the word list.
 * @param {number} count - Number of words
 * @param {string} locale - Locale code
 * @returns {Promise<string[]>}
 */
export async function getRandomWords(count = 2, locale = 'en-gb')

/** Supported locales for word lists */
export const SUPPORTED_LOCALES = ['en-gb']  // expand as word lists are added
```

---

## Tool Page Template

Every new tool page follows this exact pattern (from tools team briefing section 3):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tool Name — SG/Tools</title>
    <link rel="stylesheet" href="../tools.css">
</head>
<body>
    <!-- 1. Load shared components -->
    <script type="module" src="/components/site-header/v1/v1.0/v1.0.1/sg-site-header.js"></script>
    <script type="module" src="/components/locale-picker/v1/v1.0/v1.0.0/sg-locale-picker.js"></script>

    <!-- 2. Compose header with locale picker -->
    <sg-site-header site="Tools" nav-items='[{"label":"All Tools","href":".."}]'>
        <sg-locale-picker slot="locale" locale="en-gb"
            base-path="/tools/v0/v0.1/v0.1.2/"></sg-locale-picker>
    </sg-site-header>

    <!-- 3. Tool-specific content -->
    <main class="tool-main">
        <!-- Tool content here -->
    </main>

    <!-- 4. Import core module and wire up -->
    <script type="module">
        // import { fn } from '/core/{module}/v1/v1.0/v1.0.0/sg-{module}.js';
        // Tool logic here
    </script>

    <!-- 5. Shared footer -->
    <sg-site-footer brand-desc="Browser-based tools. No data leaves your device."
        columns='[{"title":"SGraph","links":[{"label":"SG/Send","href":"https://send.sgraph.ai"},{"label":"SG/Tools","href":"https://tools.sgraph.ai"}]}]'>
    </sg-site-footer>

    <script type="module" src="/components/site-footer/v1/v1.0/v1.0.0/sg-site-footer.js"></script>
</body>
</html>
```

---

## i18n Keys Pattern

For each new element, add keys to all 5 JSON files in `i18n/`:

```json
{
  "tool_file_hasher_title": "File Hasher",
  "tool_file_hasher_desc": "Calculate SHA-256 hash of any file",
  "tool_file_hasher_drop_prompt": "Drop a file here or click to select",
  "tool_file_hasher_hash_label": "SHA-256 Hash",
  "tool_file_hasher_copy_btn": "Copy Hash"
}
```

Key naming convention: `tool_{tool-name}_{element}` for tools, `component_{name}_{element}` for components.
