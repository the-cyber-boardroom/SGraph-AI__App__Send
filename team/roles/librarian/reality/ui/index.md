# ui — Reality Index

**Domain:** `ui/` | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

The three browser UIs served by the User Lambda. Each uses IFD versioning (no framework,
Shadow DOM Web Components, surgical overlays). The latest user UI is v0.3.1.

---

## EXISTS (Code-Verified)

### User UI (latest: v0.3.1 IFD overlay, base: v0.3.0)

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
