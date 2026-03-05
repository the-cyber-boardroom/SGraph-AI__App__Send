# tools.sgraph.ai — Code Context (Source Modules to Extract)

**Version:** v0.11.12
**Purpose:** Actual source code from the existing SG/Send codebase. These are the modules to extract and convert to ES modules for tools.sgraph.ai.

---

## 1. crypto.js — The First Module to Extract

**File:** `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`

This is the highest-priority extraction target. 107 lines, zero dependencies, pure Web Crypto API. Currently an object literal (`SendCrypto`); needs conversion to ES module with named exports.

```javascript
const SendCrypto = {

    ALGORITHM: 'AES-GCM',
    KEY_LENGTH: 256,
    IV_LENGTH: 12,

    isAvailable() {
        return !!(window.crypto && window.crypto.subtle);
    },

    requireSecureContext() {
        if (!this.isAvailable()) {
            throw new Error(
                'Web Crypto API is not available. ' +
                'It requires a secure context (HTTPS or localhost). ' +
                'If running locally, use "localhost" instead of "127.0.0.1".'
            );
        }
    },

    async generateKey() {
        return await window.crypto.subtle.generateKey(
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,
            ['encrypt', 'decrypt']
        );
    },

    async exportKey(key) {
        const raw = await window.crypto.subtle.exportKey('raw', key);
        return this.bufferToBase64Url(raw);
    },

    async importKey(base64Key) {
        const raw = this.base64UrlToBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'raw', raw,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            false,
            ['decrypt']
        );
    },

    async encryptFile(key, plaintext) {
        const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: this.ALGORITHM, iv },
            key,
            plaintext
        );
        const result = new Uint8Array(iv.length + ciphertext.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(ciphertext), iv.length);
        return result.buffer;
    },

    async decryptFile(key, encrypted) {
        const data = new Uint8Array(encrypted);
        const iv = data.slice(0, this.IV_LENGTH);
        const ciphertext = data.slice(this.IV_LENGTH);
        return await window.crypto.subtle.decrypt(
            { name: this.ALGORITHM, iv },
            key,
            ciphertext
        );
    },

    bufferToBase64Url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    },

    base64UrlToBuffer(base64url) {
        let base64 = base64url
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
};
```

### Conversion to ES Module

```javascript
// core/crypto/v1.0.0/sg-crypto.js
// Converted from SendCrypto object literal to ES module with named exports

const ALGORITHM  = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH  = 12

/** Check if Web Crypto API is available */
export function isAvailable() {
    return !!(window.crypto && window.crypto.subtle)
}

/** Throw if not in a secure context */
export function requireSecureContext() {
    if (!isAvailable()) {
        throw new Error('Web Crypto API requires HTTPS or localhost.')
    }
}

/** Generate a new AES-256-GCM key */
export async function generateKey() {
    return await window.crypto.subtle.generateKey(
        { name: ALGORITHM, length: KEY_LENGTH }, true, ['encrypt', 'decrypt']
    )
}

/** Export a CryptoKey to base64url string */
export async function exportKey(key) {
    const raw = await window.crypto.subtle.exportKey('raw', key)
    return bufferToBase64Url(raw)
}

/** Import a base64url string as a CryptoKey (decrypt-only) */
export async function importKey(base64Key) {
    const raw = base64UrlToBuffer(base64Key)
    return await window.crypto.subtle.importKey(
        'raw', raw, { name: ALGORITHM, length: KEY_LENGTH }, false, ['decrypt']
    )
}

/** Encrypt a file (ArrayBuffer). Returns IV + ciphertext. */
export async function encryptFile(key, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: ALGORITHM, iv }, key, plaintext
    )
    const result = new Uint8Array(iv.length + ciphertext.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(ciphertext), iv.length)
    return result.buffer
}

/** Decrypt a file (IV + ciphertext ArrayBuffer). Returns plaintext. */
export async function decryptFile(key, encrypted) {
    const data = new Uint8Array(encrypted)
    const iv = data.slice(0, IV_LENGTH)
    const ciphertext = data.slice(IV_LENGTH)
    return await window.crypto.subtle.decrypt(
        { name: ALGORITHM, iv }, key, ciphertext
    )
}

/** Convert ArrayBuffer to base64url string */
export function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Convert base64url string to ArrayBuffer */
export function base64UrlToBuffer(base64url) {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
}
```

---

## 2. file-type-detect.js — MIME Type Detection

**File:** `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/file-type-detect.js`

Client-side file type detection by extension and content type. Currently a `FileTypeDetect` object literal.

```javascript
const FileTypeDetect = {

    _extMap: {
        '.md': 'markdown', '.markdown': 'markdown', '.mdown': 'markdown',
        '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
        '.webp': 'image', '.svg': 'image',
        '.pdf': 'pdf',
        '.wav': 'audio', '.mp3': 'audio', '.ogg': 'audio', '.flac': 'audio',
        '.aac': 'audio', '.m4a': 'audio', '.wma': 'audio',
        '.mp4': 'video', '.webm': 'video', '.ogv': 'video', '.mov': 'video',
        '.avi': 'video', '.mkv': 'video',
        '.zip': 'zip',
        '.js': 'code', '.mjs': 'code', '.cjs': 'code', '.ts': 'code',
        '.tsx': 'code', '.jsx': 'code', '.py': 'code', '.json': 'code',
        '.yaml': 'code', '.yml': 'code', '.xml': 'code', '.html': 'code',
        '.htm': 'code', '.css': 'code', '.sh': 'code', '.bash': 'code',
        '.sql': 'code', '.go': 'code', '.rs': 'code', '.java': 'code',
        '.c': 'code', '.h': 'code', '.cpp': 'code', '.hpp': 'code',
        '.cc': 'code', '.rb': 'code', '.php': 'code', '.toml': 'code',
        '.ini': 'code', '.env': 'code', '.dockerfile': 'code',
    },

    _contentTypeMap: {
        'image/': 'image',
        'audio/': 'audio',
        'video/': 'video',
        'application/pdf': 'pdf',
        'application/zip': 'zip',
        'application/x-zip-compressed': 'zip',
        'text/markdown': 'markdown',
        'text/x-markdown': 'markdown',
    },

    // ... detect(filename, contentTypeHint) method
    // ... getAudioMime(filename), getVideoMime(filename) methods
};
```

**Conversion:** Same pattern as crypto — convert to named exports: `detect()`, `getAudioMime()`, `getVideoMime()`, plus export the maps for extensibility.

---

## 3. i18n.js — Internationalisation

**File:** `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/i18n.js`

URL-based locale routing with pre-rendered HTML. 16 locales. All strings baked in — no runtime JSON fetching.

```javascript
const I18n = {

    locale: 'en-gb',

    strings: {
        'en-gb': {
            'app.title':            'SG/Send',
            'app.tagline':          'Your files, your keys, your privacy',
            'app.subtitle':         'Zero-knowledge encrypted file sharing',
            // ... 50+ string keys for upload, download, sharing, etc.
        }
    },

    // ... t(key), detectLocale(), setLocale() methods
};
```

**Conversion note:** The i18n module is tightly coupled to SG/Send's string keys. When extracting to `core/i18n/`, the module should provide the translation framework (`t()`, `detectLocale()`, `setLocale()`) and let each consuming project provide its own string table.

---

## 4. markdown-parser.js — Safe Markdown Rendering

**File:** `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/markdown-parser.js`

Security-first markdown rendering. No arbitrary HTML passthrough. All text content escaped.

```javascript
const MarkdownParser = {

    parse(markdown) {
        if (!markdown) return '';
        const lines = markdown.split('\n');
        const blocks = this._parseBlocks(lines);
        return blocks.map(b => this._renderBlock(b)).join('\n');
    },

    _escape(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // ... _parseBlocks(), _renderBlock(), _parseInline() methods
    // Supports: headings, code blocks, blockquotes, lists, HR, tables,
    //           bold, italic, links, inline code, images
};
```

**Conversion:** Clean extraction — the parser is self-contained with no external dependencies. Export `parse()` and `escape()`.

---

## 5. llm-connection.js — LLM Provider Management

**File:** `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-connection/llm-connection.js`

Provider configuration and model listing. Keys stored in localStorage. Supports OpenRouter and Ollama.

```javascript
const PROVIDERS = {
    openrouter: {
        name:    'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        hint:    'Get a key at openrouter.ai — access to Claude, GPT, Gemini, Llama, and more.',
        defaultModels: [
            { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
            { id: 'anthropic/claude-haiku-4',  name: 'Claude Haiku 4' },
            { id: 'openai/gpt-4o',             name: 'GPT-4o' },
            { id: 'openai/gpt-4o-mini',        name: 'GPT-4o Mini' },
            { id: 'google/gemini-2.5-flash',    name: 'Gemini 2.5 Flash' },
            { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
        ],
    },
    ollama: {
        name:    'Ollama (Local)',
        baseUrl: 'http://localhost:11434',
        hint:    'Ollama runs locally — nothing leaves your machine.',
        defaultModels: [],
    },
};
```

**Extraction plan:** The provider definitions and connection logic become part of `core/llm-client/sg-llm.js`. The UI component stays in the workspace. The core module provides the pure logic; the workspace component provides the UI.

---

## 6. api-client.js — REST Client for Transfers API

**File:** `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/api-client.js`

Handles all transfer lifecycle operations. Currently an `ApiClient` object literal.

Key methods (first 60 lines shown):

```javascript
const ApiClient = {

    getAccessToken() {
        return localStorage.getItem('sgraph-send-token');
    },

    setAccessToken(token) {
        localStorage.setItem('sgraph-send-token', token);
    },

    _authHeaders() {
        const token = this.getAccessToken();
        return token ? { 'x-sgraph-access-token': token } : {};
    },

    async createTransfer(fileSize, contentType) {
        const res = await fetch('/api/transfers/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._authHeaders()
            },
            body: JSON.stringify({ file_size: fileSize, content_type: contentType }),
        });
        // ... error handling, return JSON
    },

    // Routes:
    //   POST /api/transfers/create
    //   POST /api/transfers/upload/{id}
    //   POST /api/transfers/complete/{id}
    //   GET  /api/transfers/info/{id}
    //   GET  /api/transfers/download/{id}
    //   GET  /api/transfers/check-token/{name}
    //   POST /api/transfers/validate-token/{name}
    //   POST /api/presigned/initiate
    //   POST /api/presigned/complete
    //   POST /api/presigned/abort/{id}/{upload_id}
    //   GET  /api/presigned/download-url/{id}
    //   GET  /api/presigned/capabilities
};
```

**Conversion note:** The API client is specific to SG/Send's transfer API. When extracting, the `core/api-client/` module should provide a generic base (auth headers, error handling, fetch wrapper) and let projects add their own routes. The SG/Send-specific routes stay in the send repo as a thin wrapper over the base client.

---

## 7. Workspace Component Pattern (IFD reference)

**File:** `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js`

The workspace shell demonstrates the IFD component pattern: light DOM, IIFE-wrapped, EventBus integration, extensible navigation.

```javascript
(function() {
    'use strict';

    const NAV_ITEMS = [
        { id: 'transform', label: 'Document Transform', icon: ICONS.transform, default: true },
        { id: 'settings',  label: 'Settings',           icon: ICONS.settings },
    ];

    class WorkspaceShell extends HTMLElement {
        constructor() {
            super();
            this._activeView     = 'transform';
            this._debugOpen      = true;
            this._debugWidth     = 320;
            this._vaultOpen      = true;
            this._activeDebugTab = 'messages';
            this._boundHandlers  = {};
            this._loadPreferences();
        }

        connectedCallback() { this._render(); /* ... event binding */ }
        disconnectedCallback() { /* ... cleanup */ }

        _render() {
            this.innerHTML = `
                <div class="workspace-shell">
                    <nav class="ws-icon-nav">...</nav>
                    <aside class="ws-vault-panel">...</aside>
                    <main class="ws-main">...</main>
                    <aside class="ws-debug-sidebar">...</aside>
                    <footer class="ws-status-bar">...</footer>
                </div>
            `;
            // ... bind events
        }
    }

    customElements.define('workspace-shell', WorkspaceShell);
})();
```

**Pattern notes:**
- IIFE wrapper (not ES module — the workspace predates the tools architecture)
- Light DOM (`this.innerHTML = ...`)
- Custom Elements with `connectedCallback` / `disconnectedCallback`
- Preferences via localStorage
- EventBus for cross-component communication

When building tools.sgraph.ai components, follow this pattern but use ES modules instead of IIFEs:
```javascript
export class SgHeader extends HTMLElement { ... }
customElements.define('sg-header', SgHeader)
```
