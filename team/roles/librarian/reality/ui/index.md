# ui — Reality Index

**Domain:** `ui/` | **Last updated:** 2026-05-11 | **Maintained by:** Librarian (daily run)

The browser UIs served by the User Lambda. Each uses IFD versioning (no framework,
Shadow DOM Web Components, surgical overlays). The latest user UI is v0.3.2. The vault
browser UI (`sgraph_ai_app_send__ui__vault`) is a distinct UI product at **v0.2.3**
(JS API layer — `window.__tool` via SgToolApi; branch `claude/review-vault-ui-Hh145`).

---

## EXISTS (Code-Verified)

### User UI (latest: v0.3.2 IFD overlay, base: v0.3.0)

**v0.3.0** — IFD major version, full architectural rewrite. Code at
`sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.0/`. Completed 22 March 2026.

**v0.3.1** — IFD overlay on v0.3.0. Code at `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.1/`.
3 overlay files: `en-gb/index.html`, `en-gb/browse/index.html`,
`_common/js/components/send-download/send-browse-v031.js`.

**v0.3.1 fixes (04/27–04/28):**
- Text selection visibility fix (commit `b82b4a4`): `::selection` changed from
  `rgba(78,205,196,0.25) + color:inherit` to solid `#1a73e8` + white text
- Dark mode `_page.json` background fix (commit `231fcc9`): `page-layout-renderer.js` was
  unconditionally setting `container.style.background = '#ffffff'`; now removes inline
  background in dark mode so CSS class wins

**v0.3.2** — IFD overlay on v0.3.0 + v0.3.1. Code at `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.2/`.
First committed 2026-05-07 (commits `e3d010c`, `0404827`). Contains 8 surgical overlay scripts +
a new page (`en-gb/s/index.html`). Version stamp: `send-browse v0.3.2-vfs-4`.

**v0.3.2 Feature 1 — Share a Secret** (commit `e3d010c`, 07 May):
- New page: `en-gb/s/{transferId}#{keyHex}` — ephemeral encrypted text viewer
- `send-secret-view.js/.css` — `<send-secret-view>` Web Component; handles view flow and kill-confirm flow
- Secret is fetched via download-base64 endpoint, decrypted AES-256-GCM client-side, displayed inline
- Kill flow: DELETE `/api/transfers/delete/{id}` on confirm
- Ephemerality notice shown after view (D1 or D2 delivery modes)

**v0.3.2 Feature 2 — Options Step / 5-step wizard** (commit `0404827`, 07 May):
- Delivery + Share steps consolidated into a single Options step (6-step → 5-step wizard)
- `upload-step-options.js/.css` — `<upload-step-options>` Web Component
- `send-upload-options.js` — patches `SendUpload` for 5-step flow
- `upload-constants-patch.js` — patches `TOTAL_STEPS` constant (6 → 5)

**v0.3.2 Secret Tab UX** (commit `3144b38`, 08 May):
- Pill toggles for Secret/File mode in UploadStepSelect
- Secret mode Send button disabled until text is entered
- `upload-step-select-secret.js` — patches `UploadStepSelect`
- `send-upload-secret.js` — patches `SendUpload` (secret fast-path)
- `upload-engine-secret.js` — patches `UploadEngine` (secret params)
- `upload-step-done-secret.js` — registers `<upload-step-done-secret>` element

**v0.3.2 sg-vault-picker** (commit range, 07–08 May):
- `sg-vault-picker.js/.css` — `<sg-vault-picker>` Web Component (vault selection; enter key, browse recent, create new)
- Previously PROPOSED; now EXISTS at `v0.3.2/_common/js/components/sg-vault-picker/`

**v0.3.2 VFS asset inlining in send-browse** (commit `85d3d16`, 09 May):
- `send-browse--v0.3.2.js`: `_inlineHtmlAssets()` + `_replaceAsync()` helpers
- Before creating a blob-URL iframe for HTML vault files, all relative `<script src>` and
  `<link rel="stylesheet" href>` tags are asynchronously resolved to their vault file contents
  and inlined. This is required because browser-native resource loading bypasses `window.fetch()`,
  so the VFS bridge cannot intercept these tags at runtime.
- VFS bridge (`window.fetch()` override) preserved for dynamic runtime fetch() calls
- `_loadHtmlIntoIframe()` extracted (commit `c448bc9`) — used by both view and edit preview

#### Pages

| Page | URL Path | What It Does |
|------|----------|-------------|
| Upload | `v0/v0.3/v0.3.0/index.html` | 6-step wizard (Select→Delivery→Share→Confirm→Encrypt & Upload→Done), drag-drop, multi-file paste, smart skip, AES-256-GCM, direct + multipart (up to 1GB) |
| Download | `v0/v0.3/v0.3.0/en-gb/download/index.html` | Decrypt with key from URL hash or manual input; gallery view, browse view, PDF + present mode, markdown, SgPrint, save/download |
| Browse | `v0/v0.3/v0.3.0/en-gb/browse/index.html` | Direct browse-mode URL alias |
| Gallery | `v0/v0.3/v0.3.0/en-gb/gallery/index.html` | Direct gallery-mode URL alias |
| View (short) | `v0/v0.3/v0.3.0/en-gb/v/index.html` | Short-form URL alias |
| View (full) | `v0/v0.3/v0.3.0/en-gb/view/index.html` | Full-name URL alias |
| Welcome | `v0/v0.3/v0.3.0/en-gb/welcome/index.html` | Token activation from URL hash, Stripe redirect target |
| Room Join | `v0/v0.1/v0.1.8/join.html` | Enter data room via invite code (v0.2.x base, not yet migrated) |
| Room View | `v0/v0.1/v0.1.8/room.html` | Room file browser, upload/download, invite generation (v0.2.x base) |
| Vault | `v0/v0.1/v0.1.7/vault.html` | Personal encrypted vault with RSA-4096 (v0.2.x base, not yet migrated) |
| SSH KeyGen | `/tools/ssh-keygen/` | Browser-based SSH key generation |

#### Web Components (v0.3.0 — unified SendComponent base class)

- `send-upload` — state machine orchestrator, 6-step wizard, delegates to 6 sub-components + 6 modules
- `send-download` — decrypt, auto-decrypt from URL hash, gallery/browse/lightbox
- `send-browse` — sg-layout file explorer (folder tree, tabbed multi-pane, drag-to-resize)
- `send-gallery` — grid of type-aware thumbnails (image, PDF first page, markdown); 3 density modes
- `send-viewer` — file content viewer (PDF, markdown, code, image, JSON, text)
- `send-welcome` — token activation, SGMETA parsing, token verification
- `send-access-gate` — token validation gate
- `send-transparency` — shows what server stored vs. never saw; decryption timing
- `send-test-files` — 5 built-in test file types

**Encryption:** AES-256-GCM via Web Crypto API (transfers + rooms); RSA-4096 + AES hybrid (vault);
SGMETA envelope for filenames. Key never sent to server.

**Localisation:** 17 locales. All locale pages include Welcome translations (v0.12.3).

---

---

### Vault Browser UI (latest: v0.2.2)

**Package:** `sgraph_ai_app_send__ui__vault/` — distinct UI product from the user UI.
**v0.2.1** — landing page (EXISTS since ~04/15): `en-gb/index.html` + `browse/index.html`.
"Open a vault." hero, auto-detect input (vault key or share token), recent vaults localStorage.

**v0.2.2** — overlay on v0.2.1. Code at `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.2/`.
3 files: `index.html`, `sg-app-banner.js`, `vault-browse-edit.js`. First committed 2026-05-08.

#### sg-app-banner (v0.2.2, commit `891f645`, 08 May)

**`<sg-app-banner>`** Web Component — fixed-position banner activated in App Mode.

| Property | Detail |
|----------|--------|
| Default state | Hidden (`display:none`). Must call `activate()` to show. |
| Activation | `activate(liftEl?)` — hides vault chrome (Layer 1 CSS), lifts content frame (Layer 2 fixed positioning) |
| Layer 1 CSS | Hides `vault-header`, `vault-nav`, `vault-status-bar`, `.sb-header`, `.sb-file__actions`, `.sb-file__markdown` max-width |
| Layer 2 (frame lift) | Applies `position:fixed` to the provided element (or `.sb-file__html-frame` for HTML auto-activate). No DOM move — avoids iframe reload. |
| Shadow CSS | `sgl-tab-bar`, `sgl-resize-handle`, `plr-source-bar` hidden via injected shadow DOM CSS |
| Deactivate | `Open Vault` button calls `_deactivate()` — restores all saved styles, removes CSS, removes banner |
| App Mode label | Non-clickable badge in top-right of banner |
| `present:true` in app.json | Auto-activates App Mode when `app.json` entry has `present: true` |

#### vault-browse-edit (v0.2.2)

Patches `SendBrowse.prototype._renderFileContent` (loaded after `send-browse--v0.3.2.js`).

| Feature | Detail | Commit |
|---------|--------|--------|
| **App Mode button (all types)** | "App Mode" button added to file action bar on ALL file types (PDF, markdown, images, video, page layouts, HTML) on ALL vaults (read-only and writable). Lifts `.sb-file__content`. | `124a81b`, `cdcff8b` (08 May) |
| **HTML auto-re-lift** | When App Mode is active and user navigates to an HTML file inside the iframe, banner re-lifts on the new content element | `vault-browse-edit.js` |
| **HTML split-view editor** | HTML files: raw source textarea (left) + sandboxed live-preview iframe (right). Preview updates 600ms after typing stops. Edit button in action bar; Save/Cancel. | `85d3d16` (09 May) |
| **Text/code/markdown edit** | Edit/Save/Cancel for non-HTML text files (writable vaults only) | pre-v0.2.2 |
| **Upload Files button** | Opens file picker for multi-file upload to vault (writable vaults) | pre-v0.2.2 |
| **New File button (BRW-024)** | Creates new empty file in vault; name prompt; writable vaults | `e56da6a` (08 May) |
| **Refresh button** | Re-fetches current file from vault and re-renders; all file types, writable vaults | pre-v0.2.2 |

**VFS pipeline for edit preview** (commit `2a079ee`, 08 May): identical `_inlineHtmlAssets` VFS
pipeline used for both the view iframe and the edit split-view live preview.

#### v0.2.3 — JS API layer (branch `claude/review-vault-ui-Hh145`, 2026-05-11)

**Status:** Code-complete on feature branch. Pending vault-loader refactoring before merge to dev.

IFD overlay on v0.2.2. Files at `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`. Adopts the
`sg-tool-api` pattern (already live on infographic-gen, voice-memo, video-creator) — wraps
existing `VaultShell` + `VaultDataSource` internals in a registered `SgToolApi` instance so
documentation agents and QA can drive the vault programmatically.

| Capability | Status |
|-----------|--------|
| `window.__tool` set after `tool:ready` | **EXISTS** — `vault-tool-api.js` |
| `window.__tool_registry.find('vault')` | **EXISTS** — slug `'vault'` |
| `window.__tool.getState()` | **EXISTS** — sync, returns `{ vaultId, title, decrypted, syncState, activeView, openTabs }` |
| `window.__tool.waitForReady()` | **EXISTS** — async, 30s timeout |
| `window.__tool.navigateTo({ tab })` | **EXISTS** — async, iframe-aware render detection |
| `window.__tool.getSkills()` | **EXISTS** — returns SKILL file paths |
| `_common/manifest.json` | **EXISTS** — feeds `<sg-tool-api-manifest>` |
| SKILL-human.md / SKILL-browser.md / SKILL-api.md | **EXISTS** at `_common/skills/` |
| sg-tool-api dev panel in Debug sidebar | **EXISTS** — "Tool API" tab in `_toggleDebug` patch |
| `vault-loader` routing architecture | **DOES NOT EXIST in v0.2.3** — will be merged in post-refactor version |
| Phase 2 file ops (`getTree`, `readFile`, etc.) | **PROPOSED** |
| Phase 3 mutations + push/pull | **PROPOSED** |

**Key files:**
- `_common/js/components/vault-tool-api/vault-tool-api.js` — ES module wrapper (phase 1, 4 methods)
- `_common/js/components/vault-tool-api/vault-events.js` — frozen `VAULT_EVENTS` constants
- `_common/skills/SKILL-human.md` — human guide
- `_common/skills/SKILL-browser.md` — Playwright/browser-console guide with full examples
- `_common/skills/SKILL-api.md` — machine-readable method + event spec
- `_common/manifest.json` — tool manifest for `<sg-tool-api-manifest>` component

**Backward compat:** `window.sgraphVault.events` untouched. SgToolApi layer is purely additive.

**Architect review:** Approved — two commits `df21d44` + `13b1719`. Plan doc at
`team/roles/dev/reviews/05/08/v0.2.3__dev__vault-js-api-plan.md`.

---

### Admin UI (latest: v0.1.7)

**Path:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.7/`

| Section | Component | What It Does |
|---------|-----------|-------------|
| System | system-info | Version, uptime, environment config |
| System | storage-browser | Browse backend Memory-FS, inspect transfer objects |
| Data Rooms | data-room-manager | Create/list/archive rooms, manage members, generate invites, audit trail |
| PKI | pki-keys | RSA-4096 key generation |
| PKI | pki-encrypt | Hybrid RSA/AES encryption for text/files |
| PKI | pki-contacts | PKI contact directory |
| Vault | vault-manager | Browse encrypted vaults, folder tree, file list, preview |
| Registry | key-publish / key-lookup / key-registry / key-log | Global key registry operations |
| Tokens | token-manager | Create, revoke, reactivate tokens; edit limits; sort/filter table |
| Monitoring | analytics-dashboard / metrics-dashboard | Transfer stats + system metrics |
| Debug | api-logger / events-viewer / messages-panel | Request logging, EventBus viewer, toast center |

---

### Workspace UI (v0.1.0)

**Path:** `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/`
**First LLM call verified:** 4 March 2026

| Zone | Component | What It Does |
|------|-----------|-------------|
| Shell | workspace-shell | Five-zone CSS Grid layout, navigation, resize, preferences |
| Vault | vault-panel | Encrypted vault browser, file selection, save-to-vault |
| Source | document-viewer (source role) | Multi-format renderer (markdown, code, text, HTML, image, PDF) |
| Transform | document-viewer (transform role) | Displays LLM output, "Save to Vault" button |
| Chat | llm-chat | Prompt input, prompt library, model selector, streaming, Ctrl+Enter |
| Settings | llm-connection | Provider management (OpenRouter, Ollama), API key input, model selector |
| Data | prompt-library | 5 built-in prompts (Improve Clarity, Executive Summary, Extract Actions, Simplify, Convert to Markdown) |

**LLM providers:** OpenRouter (`https://openrouter.ai/api/v1`, SSE streaming, confirmed 4 Mar)
and Ollama (`http://localhost:11434`, NDJSON streaming, confirmed with Gemma3:4b 4 Mar).

**Key property:** No LLM traffic touches the SG/Send server — browser goes directly to provider.
Zero-knowledge maintained throughout.

**Theme:** Aurora (dark, `#1A1A2E` background, `#4ECDC4` teal accent).

---

## PROPOSED

Full list: [proposed/index.md](proposed/index.md)

- **Upload UX redesign** — 3-step flow (upload→distribution→credentials), 3 sharing modes, 10GB limit
- **Gallery editor** — per-image comments, multi-language, layout customisation, rich preview
- **v0.3.0 deferred issues** (47 items) — post-release bug backlog from the v0.3.0 launch
- **Vault upload beta** in main SG/Send UI (doc 281) — integrate vault-push into upload wizard
- **Room + Vault pages** migrated to v0.3.0 IFD architecture
- **`<sg-vault-picker>`** — vault selection Web Component (doc 297)

---

## Recent Activity (not yet folded into the curated EXISTS section)

- **2026-05-09** — Vault UI `v0.2.2` HTML iframe rendering bug fixes: data-URI inlining
  (eliminates `</script>`/`</style>` parser bugs), edit-mode preview now reuses the main
  `.sb-file__html-frame` iframe (single iframe across view + edit), iframe gets
  `background:#fff; color-scheme:light`, duplicate `App Mode` button removed, `_ext0`
  hoisting fixed. Files: `send-browse--v0.3.2.js`, `vault-browse-edit.js`. See
  [`team/comms/changelog/05/09/v0.27.18__changelog__vault-html-iframe-bugs.md`](../../../comms/changelog/05/09/v0.27.18__changelog__vault-html-iframe-bugs.md).
  Librarian: please fold into the curated EXISTS section on next daily run.
