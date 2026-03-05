# tools.sgraph.ai — Architecture

**Version:** v0.11.12
**For:** Implementor (LLM coding session)

---

## 1. Repo Structure

```
sgraph_ai__tools/
  core/                              <- CORE LIBRARIES (pure JS, no UI)
    crypto/
      v1.0.0/
        sg-crypto.js                   AES-256-GCM via Web Crypto API
      latest/ -> v1.0.0
    api-client/
      v1.0.0/
        sg-api-client.js               REST client for SGraph APIs
      latest/ -> v1.0.0
    i18n/
      v1.0.0/
        sg-i18n.js                     Internationalisation helpers
      latest/ -> v1.0.0
    file-detect/
      v1.0.0/
        sg-file-detect.js              MIME type detection by magic bytes
      latest/ -> v1.0.0
    markdown-parser/
      v1.0.0/
        sg-markdown.js                 Lightweight markdown to HTML
      latest/ -> v1.0.0
    llm-client/
      v1.0.0/
        sg-llm.js                      LLM API client (streaming + non-streaming)
      latest/ -> v1.0.0
    video/
      v1.0.0/
        sg-video.js                    FFmpeg WASM wrapper (split, extract audio)
      latest/ -> v1.0.0
    ssh/
      v1.0.0/
        sg-ssh.js                      SSH key pair generation
      latest/ -> v1.0.0

  components/                        <- COMPONENTS (UI elements, JS + CSS)
    upload-dropzone/
      v1.0.0/
        upload-dropzone.js
        upload-dropzone.css
      latest/ -> v1.0.0
    file-preview/
      v1.0.0/
        file-preview.js
        file-preview.css
      latest/ -> v1.0.0
    header/
      v1.0.0/
        sg-header.js
        sg-header.css
      latest/ -> v1.0.0
    footer/
      v1.0.0/
        sg-footer.js
        sg-footer.css
      latest/ -> v1.0.0
    tree-view/
      v1.0.0/
        tree-view.js
        tree-view.css
      latest/ -> v1.0.0
    api-logger/
      v1.0.0/
        api-logger.js
        api-logger.css
      latest/ -> v1.0.0

  tools/                             <- TOOLS (standalone pages)
    index.html                         Landing page / tool directory
    tools-common.css                   Shared styling for all tools
    video-splitter/
      index.html
      video-splitter.css
      video-splitter.js
    ssh-keygen/
      index.html
    llm-client/
      index.html
    file-hasher/
      index.html

  briefs/
    BRIEF_PACK.md                    Session bootstrap document (10 sections)

  .github/
    workflows/
      deploy-module.yml              Per-module CI/CD pipeline

  README.md
```

---

## 2. Versioning Model

### Folder-Based Versioning

Each module is independently versioned via folders on disk (and S3). No package manager. No `package.json` for individual modules.

```
core/crypto/
  v1.0.0/sg-crypto.js      <- First release
  v1.1.0/sg-crypto.js      <- Bug fix
  v1.2.0/sg-crypto.js      <- New feature (backward compatible)
  v2.0.0/sg-crypto.js      <- Breaking change
  latest/sg-crypto.js       <- Copy of latest stable (currently v1.2.0)
```

### Version Semantics

- **Major:** Breaking API change (renamed exports, changed signatures)
- **Minor:** New exports, backward-compatible additions
- **Patch:** Bug fixes, no API change

### Consumer Pin Strategy

| Consumer | URL Pattern | Cache Behaviour |
|----------|------------|----------------|
| Production (send.sgraph.ai) | `/core/crypto/v1.2.0/sg-crypto.js` | Immutable (1 year) |
| Tools on tools.sgraph.ai | `/core/crypto/latest/sg-crypto.js` | 5 minutes |
| Development / staging | `/core/crypto/latest/sg-crypto.js` | 5 minutes |
| Third-party imports | `/core/crypto/v1.2.0/sg-crypto.js` | Immutable (1 year) |

---

## 3. Module API Contracts

### sg-crypto.js (extracted from send's crypto.js)

The existing `SendCrypto` object (107 lines) needs to be converted from an object literal to an ES module with named exports:

```javascript
// core/crypto/v1.0.0/sg-crypto.js

const ALGORITHM  = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH  = 12

export function isAvailable() { ... }
export function requireSecureContext() { ... }
export async function generateKey() { ... }
export async function exportKey(key) { ... }
export async function importKey(base64Key) { ... }
export async function encryptFile(key, plaintext) { ... }
export async function decryptFile(key, encrypted) { ... }
export function bufferToBase64Url(buffer) { ... }
export function base64UrlToBuffer(base64url) { ... }
```

**Migration note:** The send repo currently uses `SendCrypto.generateKey()` etc. After extraction, send will do:
```javascript
import { generateKey, exportKey, encryptFile, decryptFile }
  from 'https://tools.sgraph.ai/core/crypto/v1.0.0/sg-crypto.js'
```

### sg-llm.js (extracted from workspace llm-chat.js)

Extract the LLM communication logic (currently embedded in the `LlmChat` web component) into a standalone core module:

```javascript
// core/llm-client/v1.0.0/sg-llm.js

/**
 * Send a prompt to an LLM provider and get a response.
 * @param {Object} options
 * @param {string} options.provider    - 'anthropic' | 'openai' | 'ollama'
 * @param {string} options.model       - model ID
 * @param {string} options.apiKey      - API key
 * @param {string} options.systemPrompt - system prompt
 * @param {string} options.userPrompt  - user message
 * @param {string} [options.baseUrl]   - base URL for API (required for ollama)
 * @returns {Promise<string>} The response text
 */
export async function queryLLM(options) { ... }

/**
 * Stream a response from an LLM provider.
 * @param {Object} options - Same as queryLLM
 * @param {function} onChunk - Called with each text chunk as it arrives
 * @returns {Promise<string>} The complete response text
 */
export async function streamLLM(options, onChunk) { ... }

/**
 * Parse a streamed response, handling provider-specific SSE formats.
 * @param {ReadableStream} stream
 * @param {function} onChunk
 * @returns {Promise<string>}
 */
export async function parseStream(stream, onChunk) { ... }
```

### sg-video.js (new — FFmpeg WASM wrapper)

```javascript
// core/video/v1.0.0/sg-video.js

/**
 * Load FFmpeg WASM (lazy — call this before any video operations).
 * @returns {Promise<FFmpeg>} The loaded FFmpeg instance
 */
export async function loadFFmpeg() { ... }

/**
 * Get video file information (duration, size).
 * @param {File} file - The video file
 * @returns {Promise<{duration: number, size: number, name: string}>}
 */
export async function getVideoInfo(file) { ... }

/**
 * Split a video into segments using -c copy (no re-encoding).
 * @param {File} file - The video file
 * @param {Array<{start: number, end: number}>} segments - Time ranges in seconds
 * @param {function} [onProgress] - Called with (segmentIndex, totalSegments)
 * @returns {Promise<Array<{blob: Blob, start: number, end: number, duration: number, size: number}>>}
 */
export async function splitVideo(file, segments, onProgress) { ... }

/**
 * Extract audio track from a video file.
 * @param {File} file - The video file
 * @returns {Promise<Blob>} The audio as MP3
 */
export async function extractAudio(file) { ... }

/**
 * Parse a time string into seconds.
 * Accepts: "30", "1:30", "01:30", "1:02:30", "90s", "1.5m"
 * @param {string} timeStr
 * @returns {number} Time in seconds
 */
export function parseTime(timeStr) { ... }

/**
 * Calculate fixed-length segments for a given duration.
 * @param {number} totalDuration - Total video duration in seconds
 * @param {number} segmentLength - Desired segment length in seconds
 * @returns {Array<{start: number, end: number}>}
 */
export function calculateSegments(totalDuration, segmentLength) { ... }
```

---

## 4. CDN Import Pattern

### How tools.sgraph.ai Imports Work

From any `*.sgraph.ai` site or external page:

```html
<script type="module">
  // Pinned version (production — cached immutably)
  import { generateKey, encryptFile, decryptFile }
    from 'https://tools.sgraph.ai/core/crypto/v1.0.0/sg-crypto.js'

  // Latest (development — 5-min cache)
  import { splitVideo, parseTime }
    from 'https://tools.sgraph.ai/core/video/latest/sg-video.js'

  // Component
  import { UploadDropzone }
    from 'https://tools.sgraph.ai/components/upload-dropzone/v1.0.0/upload-dropzone.js'
</script>
```

### How a Tool Composes

```html
<!-- tools/video-splitter/index.html -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/components/header/latest/sg-header.css">
  <link rel="stylesheet" href="/components/footer/latest/sg-footer.css">
  <link rel="stylesheet" href="/tools/tools-common.css">
  <link rel="stylesheet" href="./video-splitter.css">
</head>
<body>
  <script type="module">
    import { SgHeader }  from '/components/header/latest/sg-header.js'
    import { SgFooter }  from '/components/footer/latest/sg-footer.js'
    import { splitVideo, parseTime, calculateSegments, loadFFmpeg }
                         from '/core/video/latest/sg-video.js'

    // Tool-specific logic — wire the UI
  </script>
</body>
</html>
```

---

## 5. CI/CD Per Module

Each module has its own deployment trigger:

```yaml
# .github/workflows/deploy-module.yml
name: Deploy Module
on:
  push:
    paths:
      - 'core/crypto/**'
      - 'core/api-client/**'
      - 'components/upload-dropzone/**'
      # ... one path pattern per module

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Determine which module changed
      - name: Detect changed module
        id: detect
        run: |
          # Parse the changed path to get module tier and name
          CHANGED=$(git diff --name-only HEAD~1 HEAD | head -1)
          # e.g., core/crypto/v1.0.0/sg-crypto.js -> core/crypto

      # Run module-specific tests (if any)
      - name: Test
        run: |
          # Module tests live alongside the module
          # e.g., core/crypto/v1.0.0/tests/

      # Sync to S3
      - name: Deploy to S3
        run: |
          aws s3 sync $MODULE_PATH s3://tools-sgraph-ai/$MODULE_PATH \
            --cache-control "public, max-age=31536000, immutable"

      # Update latest alias
      - name: Update latest
        run: |
          aws s3 sync $MODULE_PATH s3://tools-sgraph-ai/$LATEST_PATH \
            --cache-control "public, max-age=300"

      # Invalidate CloudFront for latest only
      - name: Invalidate CDN
        run: |
          aws cloudfront create-invalidation \
            --distribution-id $CF_DIST_ID \
            --paths "/$LATEST_PATH/*"
```

---

## 6. Landing Page Structure

```html
<!-- tools/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>SGraph Tools — Browser-Based Utilities</title>
  <meta name="description" content="Free browser-based tools. No upload, no server, everything runs in your browser.">
</head>
<body>
  <header>
    <h1>SGraph Tools</h1>
    <p>Free browser-based utilities. Your data never leaves your device.</p>
  </header>

  <main>
    <section class="tool-card">
      <h2>SSH Key Generator</h2>
      <p>Generate Ed25519/RSA SSH key pairs in your browser.</p>
      <a href="/tools/ssh-keygen/">Open Tool</a>
    </section>

    <section class="tool-card">
      <h2>Video Splitter</h2>
      <p>Split MP4 videos into clips using FFmpeg. No upload required.</p>
      <a href="/tools/video-splitter/">Open Tool</a>
    </section>

    <!-- More tools as they're built -->
  </main>

  <footer>
    <p>All processing happens in your browser. No data is sent to any server.</p>
    <p>Need to share files securely? <a href="https://send.sgraph.ai">Try SG/Send</a></p>
  </footer>
</body>
</html>
```

---

## 7. BRIEF_PACK.md Template

The `briefs/BRIEF_PACK.md` file in the tools repo must contain these 10 sections (as specified in the briefing pack brief):

1. **Project Overview** — what tools.sgraph.ai is, three tiers, dependency direction
2. **Architecture Decisions** — table with decision, source brief, date
3. **Team Roles** — Developer, Architect, Librarian, Designer, DevOps, Explorer
4. **Coding Conventions** — vanilla JS, ES modules, no build step, JSDoc, naming
5. **Repo Structure** — full folder structure with annotations
6. **Existing Modules and Tools** — module registry table (what exists, version, exports, status)
7. **Current Briefs** — links to all relevant briefs with summaries
8. **First Task** — specific, scoped task for the current session
9. **Deployment Instructions** — local dev, CI/CD, new module, new tool
10. **Bootstrap Script** — `git clone`, `python3 -m http.server 8080`, `open http://localhost:8080/tools/`

The Librarian updates this file at the end of every session.
