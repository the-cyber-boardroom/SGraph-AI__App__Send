# tools.sgraph.ai — Dev Pack

**Version:** v0.11.12
**Date:** 2026-03-05
**Pack type:** Workstream (full pack)
**Target audience:** LLM coding session (Claude Code)
**Objective:** Set up the `sgraph_ai__tools` repo, deploy tools.sgraph.ai, build first tools, and extract shared modules from the SG/Send codebase

---

## What You Are Building

A **canonical component library and standalone tool platform** for the entire SGraph ecosystem. This involves:

1. **Repo setup** (`sgraph_ai__tools`) — three-tier folder structure: `core/`, `components/`, `tools/`
2. **Core module extraction** — extract `crypto.js`, `api-client.js`, `i18n.js`, `file-type-detect.js`, `markdown-parser.js` from the existing send.sgraph.ai codebase into `core/`
3. **Component extraction** — extract reusable UI components (upload-dropzone, file-preview, header, footer) into `components/`
4. **First tools** — build the Video Splitter (FFmpeg WASM), migrate the SSH Key Generator, build the LLM Client tool
5. **Landing page** — tools.sgraph.ai index page listing all available tools
6. **CI/CD** — GitHub Actions per module, S3 + CloudFront deployment
7. **CDN imports** — verify that external projects (send.sgraph.ai) can import modules via `<script type="module">` from tools.sgraph.ai URLs

Everything is **vanilla JS, no frameworks, no build step**. Every file is deployable as-is. Client-side only.

---

## Key Constraints

| Constraint | Detail |
|-----------|--------|
| **Vanilla JS only** | No React, Vue, or frameworks. Pure HTML + CSS + ES modules. |
| **ES modules** | All JS uses `import`/`export`. No CommonJS, no require(). |
| **No build step** | Every file deployable as-is. No webpack, no bundler, no transpiler. |
| **No default exports** | Named exports only — easier to document, easier to tree-shake. |
| **No localStorage** | Browser storage not available in all contexts (e.g., Claude.ai artifacts). Use in-memory state. Exception: tools that explicitly need persistence. |
| **JSDoc comments** | Every exported function documented with parameter types and return type. |
| **File naming** | Lowercase, hyphens: `sg-video.js`, `upload-dropzone.js`, `tools-common.css`. |
| **Folder-based versioning** | Each module versioned via folders: `core/crypto/v1.0.0/crypto.js`, `core/crypto/latest/crypto.js`. |
| **Independent IFD** | Each module has its own CI/CD trigger. Changes to crypto don't rebuild api-client. |
| **Web Components optional** | Components MAY use Custom Elements but it's not required. |
| **Client-side only** | Zero server calls from tools. Everything runs in the browser. |
| **Privacy by default** | No tracking cookies. No analytics cookies. No data leaves the browser. |

---

## Where This Fits in the Architecture

```
BEFORE (current — duplicated, divergent):

send.sgraph.ai          vault.sgraph.ai         workspace
  _common/js/              _common/js/             components/
    crypto.js                crypto.js  (copy!)       llm-chat/
    api-client.js            api-client.js (copy!)    vault-panel/
    send-upload/             vault-upload/ (similar!)  ...
    ...                      ...

AFTER (proposed — single source of truth):

tools.sgraph.ai  (THE canonical source)
  core/
    crypto/            <- One crypto.js, used by everyone
    api-client/        <- One API client, used by everyone
    i18n/              <- One i18n system, used by everyone
    llm-client/        <- One LLM client, used by everyone
  components/
    upload-dropzone/   <- One upload component, styled per-project via CSS
    file-preview/      <- One file preview, used by send and vault
    header/            <- One header, themed per-project
  tools/
    video-splitter/    <- Standalone tool (imports from core/ and components/)
    ssh-keygen/        <- Standalone tool
    llm-client/        <- Standalone tool

send.sgraph.ai         vault.sgraph.ai         workspace         chrome ext
  imports from           imports from             imports from      imports from
  tools.sgraph.ai       tools.sgraph.ai          tools.sgraph.ai   tools.sgraph.ai
  + send-specific UI    + vault-specific UI      + workspace UI    + ext-specific UI
```

---

## The Three Tiers

### Core Libraries (`core/`)

Pure JavaScript modules with zero UI. Crypto, API calls, file detection, LLM access, video processing. No DOM manipulation, no CSS, no HTML templates. Any project can import them.

### Components (`components/`)

Reusable UI elements that combine a core library with a visual representation. Upload dropzone, file preview, tree view, header, footer. Each is JS + CSS. Themeable — consuming projects override CSS.

### Tools (`tools/`)

Standalone single-page apps that compose core + components. Each tool is a thin HTML page that imports and wires. Tools are what users see on tools.sgraph.ai. Also serve as composition examples.

---

## 5 Phases

### Phase 1: Repo Setup and Infrastructure

1. Create `sgraph_ai__tools` repo with three-tier folder structure
2. Set up CI/CD pipeline (GitHub Actions -> S3 -> CloudFront)
3. Configure CloudFront with proper cache headers:
   - Pinned versions (`v1.0.0/`): `Cache-Control: public, max-age=31536000, immutable`
   - Latest (`latest/`): `Cache-Control: public, max-age=300`
4. Set CORS: `Access-Control-Allow-Origin: *.sgraph.ai`
5. Deploy tools.sgraph.ai landing page

### Phase 2: Core Module Extraction

6. Extract `crypto.js` from send repo -> `core/crypto/v1.0.0/`
7. Extract `api-client.js` -> `core/api-client/v1.0.0/`
8. Extract `i18n.js` -> `core/i18n/v1.0.0/`
9. Extract `file-type-detect.js` -> `core/file-detect/v1.0.0/`
10. Extract `markdown-parser.js` -> `core/markdown-parser/v1.0.0/`
11. Extract LLM client logic from workspace `llm-chat.js` -> `core/llm-client/v1.0.0/sg-llm.js`

### Phase 3: First Tools

12. Migrate SSH Key Generator to `tools/ssh-keygen/`
13. Build Video Splitter (`tools/video-splitter/`) — FFmpeg WASM, client-side only
14. Build LLM Client tool (`tools/llm-client/`)
15. Build File Hasher tool (`tools/file-hasher/`)

### Phase 4: Component Extraction

16. Extract upload-dropzone component from send/vault
17. Extract file-preview component
18. Extract header/footer components
19. Wire tools to use extracted components

### Phase 5: Migration

20. Update send.sgraph.ai to import crypto from `tools.sgraph.ai/core/crypto/v1.0.0/crypto.js`
21. Verify send works with remote imports
22. Migrate remaining modules one at a time
23. Delete local copies from send's `_common/js/`

---

## Files to Read First

Before starting, read these files to understand the existing code and patterns:

### Source Code (what you're extracting from)

1. **crypto.js** (send): `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js` — the first module to extract. AES-256-GCM via Web Crypto API. 107 lines. Pattern for all core modules.
2. **api-client.js** (send): `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/api-client.js` — REST client for transfers API. Pattern for API-facing modules.
3. **i18n.js** (send): `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/i18n.js` — internationalisation module.
4. **file-type-detect.js** (send): `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/file-type-detect.js` — MIME type detection by magic bytes.
5. **markdown-parser.js** (send): `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/markdown-parser.js` — lightweight markdown to HTML.
6. **llm-chat.js** (workspace): `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-chat/llm-chat.js` — LLM integration, streaming, model selection. Source for `sg-llm.js` extraction.
7. **workspace-shell.js** (workspace): `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js` — IFD shell pattern, extensible nav.

### Component Patterns (existing UI to extract)

8. **send-upload.js**: `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-upload/send-upload.js` — upload component pattern
9. **send-header.js**: `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-header/send-header.js` — header pattern
10. **send-footer.js**: `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-footer/send-footer.js` — footer pattern

### Briefs (the requirements)

11. **Canonical Component Library** (arch brief): `team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md` — the full architecture: dependency inversion, three tiers, versioning, migration path, CDN serving
12. **Video Splitter** (dev brief): `team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md` — FFmpeg WASM tool spec, UI layout, user flow, performance limits
13. **Briefing Pack Spec** (dev brief): `team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-briefing-pack.md` — the 10-section briefing pack that the repo's `briefs/BRIEF_PACK.md` must contain

### Architecture Reference

14. **IFD guide**: `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` — IFD methodology for versioned development
15. **Workspace index.html**: `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/index.html` — example of how components are composed

---

## Human Decisions (already made — follow these)

| Question | Answer |
|----------|--------|
| Framework? | **None.** Vanilla JS, ES modules, no build step. |
| Dependency direction? | **Inverted.** tools.sgraph.ai is the source. send/vault/workspace import FROM tools. |
| Versioning? | **Folder-based.** `v1.0.0/`, `v1.1.0/`, `latest/`. No npm, no package.json for modules. |
| Pin strategy? | **Production pins to version.** Tools use `latest`. Dev uses `latest`. |
| First module to extract? | **crypto.js.** It's the simplest (107 lines), has zero dependencies, and is the core of SG/Send's value prop. |
| Video Splitter approach? | **FFmpeg WASM.** `-c copy` for fast splitting (no re-encoding). Lazy-load the 30MB WASM binary. |
| File size limits? | **Warn at 200MB, hard limit at 500MB** for browser tools. |
| Analytics? | **No tracking cookies.** CloudFront access logs only, or Plausible if needed. |
| Web Components? | **Optional.** Components CAN use Custom Elements but don't have to. |
| Shadow DOM? | **No.** Light DOM only (consistent with IFD pattern). |
| CORS? | **Allow *.sgraph.ai.** Consider `*` for public CDN access. |
| Cache headers? | **Immutable for pinned.** 5-minute for `latest`. |

---

## Module Registry (current state)

| Module | Location (in send repo) | Target (in tools repo) | Status | Key Exports |
|--------|------------------------|----------------------|--------|-------------|
| `crypto.js` | `_common/js/crypto.js` | `core/crypto/v1.0.0/` | To extract | `SendCrypto` object: `generateKey()`, `exportKey()`, `importKey()`, `encryptFile()`, `decryptFile()` |
| `api-client.js` | `_common/js/api-client.js` | `core/api-client/v1.0.0/` | To extract | `ApiClient` object: `createTransfer()`, `uploadFile()`, etc. |
| `i18n.js` | `_common/js/i18n.js` | `core/i18n/v1.0.0/` | To extract | Internationalisation helpers |
| `file-type-detect.js` | `_common/js/file-type-detect.js` | `core/file-detect/v1.0.0/` | To extract | MIME detection by magic bytes |
| `markdown-parser.js` | `_common/js/markdown-parser.js` | `core/markdown-parser/v1.0.0/` | To extract | Markdown to HTML |
| `sg-llm.js` | `workspace/llm-chat/llm-chat.js` | `core/llm-client/v1.0.0/` | To extract (new module) | `queryLLM()`, `streamLLM()`, `parseResponse()` |
| `sg-video.js` | N/A | `core/video/v1.0.0/` | New — build | `splitVideo()`, `extractAudio()`, `getVideoInfo()` |
| `sg-ssh.js` | Existing tool | `core/ssh/v1.0.0/` | To migrate | `generateSSHKeyPair()` |

---

## Tool Inventory (planned)

| Tool | Path | Dependencies | Priority | Status |
|------|------|-------------|----------|--------|
| SSH Key Generator | `tools/ssh-keygen/` | `core/ssh/` | P0 | Migrate existing |
| Video Splitter | `tools/video-splitter/` | `core/video/`, FFmpeg WASM | P0 | Build (this pack) |
| LLM Client | `tools/llm-client/` | `core/llm-client/` | P1 | Build |
| File Hasher | `tools/file-hasher/` | `core/crypto/` | P1 | Build |
| Image Converter | `tools/image-converter/` | Canvas API | P2 | Future |
| PDF Merger/Splitter | `tools/pdf-tools/` | pdf-lib | P2 | Future |
| Password Generator | `tools/password-gen/` | Web Crypto | P2 | Future |
| QR Code Generator | `tools/qr-code/` | QR lib | P2 | Future |
| Text Diff | `tools/text-diff/` | Pure JS | P2 | Future |
| Markdown Preview | `tools/markdown-preview/` | `core/markdown-parser/` | P2 | Future |
| File Encryptor | `tools/file-encryptor/` | `core/crypto/` | P2 | Future |

---

## Video Splitter Specification

### User Flow

1. Select MP4 via file input or drag-and-drop
2. See filename, duration, file size, preview player
3. Choose split mode: **fixed length** ("every 30 seconds") or **custom segments** (start/end pairs)
4. Click Split -> FFmpeg WASM loads lazily, processes segments with `-c copy`
5. Results: clip list with segment number, times, size, preview, download button
6. "Download All as ZIP" packages clips (using JSZip)

### Time Input Parsing

Accept: `30` (seconds), `1:30` (mm:ss), `01:30`, `1:02:30` (hh:mm:ss), `90s`, `1.5m`.

### Performance Limits

- FFmpeg WASM binary: ~30MB, lazy-loaded on first Split
- Warn at 200MB file, hard limit at 500MB
- `-c copy` means no re-encoding (fast, seconds not minutes)
- Memory: free virtual FS entries after creating blob URLs

### UI Layout

```
+-------------------------------------------------------+
| tools.sgraph.ai / Video Splitter                       |
+-------------------------------------------------------+
|  [ Drop a video here or click to select ]              |
+-------------------------------------------------------+
|  video-file.mp4  |  Duration: 2:34  |  Size: 145 MB   |
|  [  video preview player  ]                            |
+-------------------------------------------------------+
|  Split Mode:  ( ) Fixed length  ( ) Custom segments    |
|  Segment length: [ 30 ] seconds                        |
|  [ Split Video ]                                       |
+-------------------------------------------------------+
|  Results:                                              |
|  Clip 1 | 0:00-0:30 | 30s | 18MB | [Play] [Download]  |
|  Clip 2 | 0:30-1:15 | 45s | 27MB | [Play] [Download]  |
|  [ Download All as ZIP ]                               |
+-------------------------------------------------------+
|  All processing happens in your browser.               |
|  No data is sent to any server.                        |
|  Need to share these clips securely? Try SG/Send ->    |
+-------------------------------------------------------+
```

---

## Shared Elements Across All Tools

Every tool page must include:

- **Header:** SGraph branding, link to tools directory, link to sgraph.ai
- **Footer:** "All processing happens in your browser. No data is sent to any server." + "Need to share files securely? Try SG/Send ->"
- **Privacy badge:** Visible indicator that the tool is client-side only
- **Consistent styling:** Same colour scheme and typography as SGraph family
- **No tracking:** No analytics cookies. CloudFront access logs only.

---

## First Session Task

**Task:** Set up the repo, deploy the infrastructure, and build the first tools.

**Steps:**
1. Create `sgraph_ai__tools` repo with three-tier folder structure
2. Set up CI/CD pipeline (GitHub Actions -> S3 -> CloudFront)
3. Deploy tools.sgraph.ai landing page
4. Extract `crypto.js` from send repo as the first `core/` module (convert from object-literal to ES module with named exports)
5. Migrate SSH Key Generator to `tools/ssh-keygen/`
6. Build Video Splitter tool (`tools/video-splitter/`)
7. Verify CDN imports work: another page can `import { encrypt } from 'https://tools.sgraph.ai/core/crypto/v1.0.0/crypto.js'`
8. Create `briefs/BRIEF_PACK.md` in the new repo (10 sections as specified in the briefing pack brief)

**Definition of done:**
- tools.sgraph.ai is live with a landing page
- SSH Key Generator works
- Video Splitter works (load video, split, download clips)
- crypto.js is importable via CDN URL by an external page
- BRIEF_PACK.md exists with all 10 sections

---

## How to Read This Pack

| File | Purpose |
|------|---------|
| `BRIEF.md` | This file — start here |
| `architecture.md` | Three-tier structure, versioning model, CDN config, module API contracts |
| `code-context.md` | Actual source code from the existing codebase (modules to extract) |
| `addenda/appsec.md` | Security: client-side only enforcement, CORS, CSP, supply chain (FFmpeg WASM) |
| `addenda/architect.md` | Architecture decisions, dependency inversion rationale, migration strategy |
| `addenda/devops.md` | S3 bucket config, CloudFront distribution, cache headers, CI/CD per module |
| `reference/briefs-index.md` | Index of all source briefs (4 Mar + 5 Mar) with one-line summaries |
| `reference/ifd-summary.md` | IFD methodology summary for vanilla JS modules |
