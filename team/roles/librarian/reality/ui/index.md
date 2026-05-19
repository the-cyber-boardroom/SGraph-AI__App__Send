# ui — Reality Index

**Domain:** `ui/` | **Last updated:** 2026-05-19 | **Maintained by:** Librarian (daily run)

As of v0.4.0 (May 2026), the sender and receiver UIs are split into separate packages
(`sgraph_ai_app_send__ui__share/` and `sgraph_ai_app_send__ui__open/`). The v0.3.x user
UI package remains in the repo for rollback. All browser UIs use IFD versioning (no
framework, Shadow DOM Web Components, surgical overlays).

---

## EXISTS (Code-Verified)

### User Share UI — v0.4.0 (sender)

**Package:** `sgraph_ai_app_send__ui__share/v0/v0.4/v0.4.0/`
**Public URL:** `send.sgraph.ai/en-gb/share/` | **CI workflow:** `deploy-ui-share.yml`
**Phase A (scaffold):** 2026-05-12 | **Phase B (inlining complete):** 2026-05-14
**Predecessor:** `sgraph_ai_app_send__ui__user/` (v0.3.x — retained for rollback, not yet deleted)

IFD major release. All v0.3.x overlays inlined into a clean, self-contained tree with no
prototype-patch files. Only `en-gb/` locale ships (multi-locale deferred to a future release).

**UX defaults (ephemeral-by-default):**
- File mode: `max_views=20`, `expires=7d`, kill link visible on Done screen
- Secret mode: `max_views=2`, `expires=24h`, kill link visible on Done screen

**5-step wizard (file + secret flows unified):**
Upload → Options → Confirm → Encrypt & Upload → Done

**Key inlining changes from v0.3.x:**
- `_common/js/api-client.js`: `createTransfer(fileSize, contentType, secretConfig)` (optional 3rd arg); `downloadBase64` and `deleteTransfer` promoted to native methods
- `upload-step-select.js`: Secret tab native (pill toggles, textarea, Views/Expires pills, "Review →")
- `upload-step-options/`: relocated to its own directory
- `send-upload.js`: single orchestrator, native 5-step state machine; `_isSecretMode`, `_secretConfig`, `_deleteAuth` native fields
- `upload-engine.js`: `_pendingSecretConfig` contract; secret-mode URL builder
- `upload-step-done/`: unified component renders both file + secret Done screens (kill link, ephemerality notice)
- `upload-folder.js` + `upload-thumbnails.js`: `__gallery__{8-char hash}` naming inlined (no v0.3.1 folder overlay)

**Components (in `_common/js/components/`):**
`send-upload`, `send-header`, `send-footer`, `send-locale`, `send-access-gate`,
`send-transparency`, `send-test-files`, `send-step-indicator`, `send-welcome`, `sg-vault-picker`

**Checksum drift guard:** `scripts/check_common_checksums.py` — 15 `_common/` files must
stay byte-identical between the share and open trees.

**Architect plan:** `team/roles/architect/reviews/05/10/v0.27.29__plan__v0.4.0-major-release.md`

#### Pages (Share tree)

| Page | URL Path | What It Does |
|------|----------|-------------|
| Share wizard | `en-gb/share/index.html` | 5-step upload wizard (file + secret modes, ephemeral-by-default) |

---

### User Open UI — v0.4.0 (receiver)

**Package:** `sgraph_ai_app_send__ui__open/v0/v0.4/v0.4.0/`
**Public URL base:** `send.sgraph.ai/en-gb/open/` | **CI workflow:** `deploy-ui-open.yml`
**Phase A (scaffold):** 2026-05-12 | **Phase B (inlining complete):** 2026-05-14

Self-contained receiver tree with the same inlining discipline as the share tree. Own
`_common/` copy (extraction to tools.sgraph.ai is the next architectural milestone).

#### Pages (Open tree)

| Page | URL Path | What It Does |
|------|----------|-------------|
| Open (default) | `en-gb/open/index.html` | Default receiver landing |
| Secret view | `en-gb/open/s/index.html` | Ephemeral encrypted text viewer (fetch + AES-GCM decrypt + kill flow) |
| View (short) | `en-gb/open/v/index.html` | Short-form URL alias |
| Download | `en-gb/open/download/index.html` | File decryption + download |
| Gallery | `en-gb/open/gallery/index.html` | Grid of type-aware thumbnails |
| View (full) | `en-gb/open/view/index.html` | Full-name URL alias |
| Browse | `en-gb/open/browse/index.html` | sg-layout file explorer (folder tree, multi-pane) |

---

### User UI Legacy — v0.3.x

**Package:** `sgraph_ai_app_send__ui__user/` — IFD overlay chain on v0.3.0 base.
**Status:** LEGACY. Replaced by v0.4.0 share/open trees. Retained for rollback; deletion
scheduled in the follow-up commit after v0.4.0 stabilises.

**v0.3.0** — IFD major base. `v0/v0.3/v0.3.0/`. Completed 22 March 2026. 6-step wizard,
drag-drop, multi-file paste, AES-256-GCM, direct + multipart (up to 1GB), 17 locales.

**v0.3.1** — IFD overlay on v0.3.0. 3 overlay files: `en-gb/index.html`, `en-gb/browse/index.html`,
`_common/js/components/send-download/send-browse-v031.js`. Fixes: text selection visibility,
dark mode background.

**v0.3.2** — IFD overlay on v0.3.0 + v0.3.1. 8 surgical overlay scripts + new secret page.
- Share a Secret: `<send-secret-view>` Web Component; ephemeral text viewer; kill flow
- Options Step: `<upload-step-options>` consolidates Delivery + Share into one step (6→5 steps)
- Secret Tab UX: pill toggles, textarea, Views/Expires pills; `<upload-step-done-secret>`
- `<sg-vault-picker>`: vault selection Web Component (NOW EXISTS; was PROPOSED)
- VFS inlining: `_inlineHtmlAssets()` + `_replaceAsync()` in `send-browse--v0.3.2.js`

#### Pages (v0.3.x tree)

| Page | URL Path | What It Does |
|------|----------|-------------|
| Upload | `v0/v0.3/v0.3.0/index.html` | 6-step wizard (Select→Delivery→Share→Confirm→Encrypt & Upload→Done) |
| Download | `v0/v0.3/v0.3.0/en-gb/download/index.html` | Decrypt, gallery, browse, PDF/present, markdown |
| Browse | `v0/v0.3/v0.3.0/en-gb/browse/index.html` | Direct browse-mode alias |
| Gallery | `v0/v0.3/v0.3.0/en-gb/gallery/index.html` | Direct gallery-mode alias |
| View (short) | `v0/v0.3/v0.3.0/en-gb/v/index.html` | Short-form URL alias |
| View (full) | `v0/v0.3/v0.3.0/en-gb/view/index.html` | Full-name URL alias |
| Secret view | `v0/v0.3/v0.3.2/en-gb/s/index.html` | Ephemeral secret viewer (v0.3.2 overlay) |
| Welcome | `v0/v0.3/v0.3.0/en-gb/welcome/index.html` | Token activation from URL hash |
| Room Join | `v0/v0.1/v0.1.8/join.html` | Enter data room via invite code (v0.2.x base, not yet migrated) |
| Room View | `v0/v0.1/v0.1.8/room.html` | Room file browser, upload/download, invite generation |
| Vault | `v0/v0.1/v0.1.7/vault.html` | Personal encrypted vault with RSA-4096 (v0.2.x base) |
| SSH KeyGen | `/tools/ssh-keygen/` | Browser-based SSH key generation |

---

### Vault Browser UI (latest: v0.2.3)

**Package:** `sgraph_ai_app_send__ui__vault/` — distinct UI product.

**v0.2.1** — landing page: `en-gb/index.html` + `browse/index.html`. "Open a vault." hero,
auto-detect input (vault key or share token), recent vaults localStorage.

**v0.2.2** — overlay on v0.2.1. Code at `v0/v0.2/v0.2.2/`. First committed 2026-05-08.
Files: `index.html`, `sg-app-banner.js`, `vault-browse-edit.js`.

**`<sg-app-banner>`** Web Component (v0.2.2, commit `891f645`):
- `activate(liftEl?)`: hides vault chrome (Layer 1 CSS), lifts content frame (Layer 2 fixed positioning)
- `present:true` in app.json: auto-activates App Mode on file open
- Deactivate: `Open Vault` button restores all saved styles

**vault-browse-edit.js** (v0.2.2):

| Feature | Detail |
|---------|--------|
| App Mode button (all types) | Added to file action bar on ALL file types + ALL vaults |
| HTML auto-re-lift | Re-lifts on navigation to HTML file inside iframe |
| HTML split-view editor | Raw source textarea + sandboxed live-preview iframe (600ms debounce) |
| Text/code/markdown edit | Edit/Save/Cancel for non-HTML text (writable vaults) |
| Upload Files button | Multi-file upload to vault (writable) |
| New File button (BRW-024) | Creates new empty file; name prompt; writable vaults |
| Refresh button | Re-fetches current file from vault |

**v0.2.2 iframe bug fixes (commit range, 09 May):**
- data-URI inlining in `send-browse--v0.3.2.js` (eliminates `</script>`/`</style>` HTML parser bugs)
- Edit-mode preview reuses the main `.sb-file__html-frame` iframe (single iframe across view + edit)
- iframe gets `background:#fff; color-scheme:light`
- Duplicate App Mode button removed; `_ext0` hoisting fixed

**v0.2.3** — consolidation + extension on v0.2.2. Code at `v0/v0.2/v0.2.3/`. First committed
2026-05-12. All v0.2.2 overlays inlined.

**Token Test Harness** (05/12): `/en-gb/vault/token/` developer page.
Custom elements: `<vt-vault-loader>`, `<vt-vault-frame>`, `<vt-token-manager>`,
`<vt-crypto-lab>`, `<vt-storage-inspector>`, `<vt-api-log>`.
Modules: `vault-credentials.js` (credential parse/resolve/store/get);
`vault-hkdf.js` (HKDF-SHA256 key derivation, AES-256-GCM owner encrypt/decrypt).

**App Mode loading overlay** (commit `20c7a52c`, 15 May — `sg-app-banner.js`):
- `activate()` shows "Loading app…" in the status bar
- Clears immediately on `window.parent.postMessage({ type: 'sg-app-ready' }, '*')` (also accepts `{ type: 'ui-ready' }`)
- 8s timeout: shows red error "App did not signal ready — it may have an error"; body-hide `display:none` detected and reported in detail text
- iframe onerror capture (same-origin only): forwards as `{ type: 'sg-app-error', message }`, stored as timeout detail

**Re-activate App Mode after auth** (commit `20c7a52c`, 15 May — `v0.2.3/index.html`):
- After vault-auth banner's key accepted via `_onAuthSubmit`, if `app.json` had `present:true` and user has not explicitly exited App Mode, `_applyAppJson` is re-run automatically
- Fixes the "blank form stays open" case when a protected App Mode vault requires auth

**Vault card UX improvements** (commit `ac68a3e6`, 15 May — `v0.2.3/en-gb/index.html`):
- 'Remove from saved vaults' button on auto-open error page: removes token from `VaultLoaderRecent`, navigates to `/en-gb/` (entry no longer shown in recent-vaults grid)
- ↗ 'Open in new window' button on vault card: opens `window.location.origin + '/#' + key` in new tab; appears on card hover alongside existing × delete button; explicit affordance (no Ctrl/Cmd-click needed)

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

**LLM providers:** OpenRouter (`https://openrouter.ai/api/v1`, SSE streaming) and Ollama
(`http://localhost:11434`, NDJSON streaming). No LLM traffic touches the SG/Send server.

---

## PROPOSED

Full list: [proposed/index.md](proposed/index.md)

- **Upload UX redesign** — 3-step flow (upload→distribution→credentials), 3 sharing modes, 10GB limit
- **Gallery editor** — per-image comments, multi-language, layout customisation, rich preview
- **v0.3.0 deferred issues** (47 items) — post-release bug backlog from the v0.3.0 launch
- **Vault upload beta** in main SG/Send UI — integrate vault-push into upload wizard
- **Room + Vault pages** migrated to v0.4.0 IFD architecture (currently on v0.3.x legacy)
