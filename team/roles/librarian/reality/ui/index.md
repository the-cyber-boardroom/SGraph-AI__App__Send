# ui — Reality Index

**Domain:** `ui/` | **Last updated:** 2026-05-27 | **Maintained by:** Librarian (daily run)

As of v0.4.0 (May 2026), the sender and receiver UIs are split into separate packages
(`sgraph_ai_app_send__ui__share/` and `sgraph_ai_app_send__ui__open/`). The v0.3.x user
UI package remains in the repo for rollback. All browser UIs use IFD versioning (no
framework, Shadow DOM Web Components, surgical overlays).

> **DEPLOY INCIDENT (2026-05-25):** `dev.send.sgraph.ai` was serving 404 site-wide. The
> three user-facing pipelines (`deploy-ui-{user,share,open}.yml`) all publish to the same
> `--site sgraph-send` `latest/` prefix and each ran a full `--clean-latest` (whole-prefix
> `rm`), so each deploy deleted the other two trees' files. **FIX (branch
> `claude/tender-tesla-AxZJX`):** (1) scoped per-tree clean instead of whole-prefix `rm`;
> (2) v0.4.0's `_common/`/`i18n/`/`test-files/` relocated under `en-gb/` so v0.4.0 serves
> `latest/en-gb/_common/` and the v0.3.x user tree keeps `latest/_common/` — disjoint, so
> v0.3.x and v0.4.0 now coexist with no collision (deploy order irrelevant). The "Public
> URL" lines below describe the routing that is restored once the redeploy runbook runs.
> Root cause + full fix:
> `team/roles/architect/reviews/05/25/v0.27.61__architect-review__user-ui-v0.4.0-deploy-collision.md`.

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

**Secret option REMOVED (2026-05-25):** the v0.3.x upload wizard now serves File mode only.
The "🔒 Secret" toggle is hidden (the secret-share flow was incomplete — `/en-gb/s/` 404s)
via `v0.3.2/_common/js/components/send-upload/upload-step-select-file-only.js`, loaded last
in `v0.3.2/en-gb/index.html`. Secret returns as a v0.4.x launch feature (the `__share`/`__open`
secret code is untouched).

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

**SG/App hosting page — `/en-gb/app/`** (commits 22 May 2026 — `v0.2.3/en-gb/app/index.html`):
New dedicated route for running vault-hosted apps. Distinct from `/en-gb/vault/` (browser) and `/en-gb/` (landing). Mounts three custom elements: `<app-shell>`, `<app-hud>`, `<app-debug-pane>`.

- **Global debug event buffer** (`window._appDebug`): captures vault events, VFS bridge calls, and network calls (capped at 300 items each); initialised before any component loads.
- **Fetch proxy**: wraps `window.fetch` to record outbound calls (method, URL masked for vault keys, status, timing) into `window._appDebug.networkCalls`.

**`<app-shell>` Web Component** (`app-shell.js`, 1 154 lines — 22 May 2026):
Lightweight vault app host. Lifecycle: parse hash → open vault → read `app.json` → optional auth intercept → pre-fetch resources → mount iframe + VFS bridge. No `vault-loader` scripts loaded on this page; credential parsing is inline. VFS bridge surface is identical to `send-browse`, so SG/App code runs unchanged.
- If no hash: shows entry form (vault key + optional server endpoint field; default endpoint `dev.send.sgraph.ai`).
- `_page.json` support: renders via inline PageLayoutRenderer (PLR) — PLR dependencies are inlined so the page is self-contained; vault routes with a hash open to `/app` rather than `/vault/`.
- Vault key persisted to `localStorage` for cross-page reload recovery.
- Exposes `getDebugState()` for `<app-debug-pane>` (appJson, writable, entry, iframeStatus, resourcesLoaded, timing).

**`<app-hud>` Web Component** (`app-hud.js`, 201 lines — 22 May 2026):
Fixed 48 px status bar rendered outside `<sg-layout>`. Shows: SG/App brand, vault badge, app title (centre), read-only badge, copy-link button, vault-back link, debug toggle. Handles `sg.ui.message()` notifications dispatched from the app iframe (toast queue with auto-dismiss). Receives vault/app info via `setInfo()` called by the page script on `app-shell:ready`.

**`<app-debug-pane>` Web Component** (`app-debug-pane.js`, 149 lines — 22 May 2026):
Collapsible right-edge debug panel with 4 tabs: Vault Trace, Bridge Log, App State, Network. Collapses to a narrow edge strip when host width < 40 px (ResizeObserver). Tabs are lazy-loaded sub-components.

**`<app-debug-vault-trace>` Web Component** (`app-debug-vault-trace.js`, 79 lines):
Renders vault lifecycle events from `window._appDebug.vaultEvents`.

**`<app-debug-bridge-log>` Web Component** (`app-debug-bridge-log.js`, 75 lines):
Renders VFS bridge message log from `window._appDebug.bridgeCalls`.

**`<app-debug-app-state>` Web Component** (`app-debug-app-state.js`, 123 lines):
Reads current debug state via `app-shell.getDebugState()` — shows appJson, entry point, writable flag, iframe status, resource load list, and timing.

**`<app-debug-network>` Web Component** (`app-debug-network.js`, 63 lines):
Renders outbound fetch calls from `window._appDebug.networkCalls` (method, URL, status, timing).

**Routing changes** (`vault-loader-routing.js` — 22 May 2026):
- `/#key` at root: saves key to `localStorage` → redirects to `/en-gb/app#key` (was: `/en-gb/vault/`). App-shell checks for `app.json`; if absent, falls back to `/en-gb/vault/`.
- `vault-header.js` change: "Open App" action opens in same tab (was: new tab).
- `v0.2.3/index.html`: `present:true` activation restored for `_page.json` app.json entries.
- Route tests updated (`test__routing_decisions.js`): `runRoot` assertions cover `/en-gb/app#token` redirect path.

**`app.json` resource injection into vault HTML preview** (commit `09288b20`, 25 May 2026 — `v0.2.3/index.html`):
When `_applyAppJson` encounters a `resources` block in `app.json` (with `css` and/or `js` arrays) and `autoOpen` is active, the vault file browser now:
- Pre-fetches each listed CSS/JS file from the vault
- Patches `dataSource.getFileBytes` for the entry file to prepend `<style data-sg-app>` and `<script data-sg-app>` blocks inline, using the same injection convention as `<app-shell>._mountApp()`
- Falls back gracefully if any resource file is missing
- Logs: `[app.json] resources injected into vault preview: css=N js=N`

**Significance:** App HTMLs in SG/App vaults carry no `<link>`/`<script>` tags — resources are delivered entirely via `app.json`. Before this fix, the vault browser's BRW-020 inlining had nothing to process and the preview rendered as a blank placeholder div. After this fix, vault HTML previews are at rendering parity with `/en-gb/app`.

**E2E test alignment** (commits `e2f05030`, 25 May 2026 — `test__routing.spec.js`, `test__regression__root_hash_inbox_saves.spec.js`):
Updated test assertions from `/en-gb/vault` to `/en-gb/app` routing targets, confirming the `/#key` → `/en-gb/app#token` redirect (shipped 22 May, commits `bfcb8ad7`/`4cf41ba2`/`d3daa2ac`) is now fully mirrored in E2E test expectations.

**`scripts/vault__run-locally.sh`** — helper script to run the vault UI locally.

**Vault header redesign + access-key fix** (26 May 2026 — `vault-header.js`, `vault-shell.js`, `vault-browse-edit.js`, `app-shell.js`):
- `vault-header.js` rebuilt: the four separate sync buttons (Check / Push / Pull / Refresh) collapse into a **single status pill** whose colour/label reflects state — `● Synced` (green), `↑N to push` / `↓N to pull` (amber/blue), `⇅ Diverged` (amber), `🔒 Read-only` (amber), `👁 Read-only` (blue, RO-token). Clicking the pill opens a dropdown with the explicit Push/Pull/Check/Refresh actions and a "last checked" line. The public setter API (`setAheadCount`/`setBehindCount`/`setDiverged`/`setPushBusy`/`setPullBusy`/`setCheckBusy`/`setRefreshAvailable`/`setReadOnly`/`setROMode`/`showLockButton`/`setVaultName`/`setAppJson`/`showLoading`/`hideLoading`) and emitted events are unchanged — `vault-shell` needs no rewiring.
- **Access-key entry is now validated.** The read-only pill's dropdown carries an access-key input that calls `GET /api/transfers/check-token/{key}` and only emits `vault-settings-access-key` on a valid, non-exhausted token (previously the header set the key silently with no validation). Same logic as `vault-settings._validateAccess`.
- **Single Upload.** The top-header Upload button was removed; upload lives only in the Files action bar (`Upload Files`, injected by `vault-browse-edit`). The dead `vault-header-upload` shell listener was removed (`_onUploadRequest` is still reached via `vault-upload-request`). Debug / raw-vault / version moved into an overflow (`⋯`) menu; "Return to vaults" stays a visible nav button (`.vh-lock-btn`, relabelled by `index.html`).
- **Toolbar de-dup.** `vault-browse-edit.js` no longer adds its own "View Source" button when send-browse already rendered a native source toggle (`.sb-file__view-source`, present for html/csv/markdown).
- **`check_token` 404 fix.** `app-shell.js` had three calls to `/api/transfers/check_token/` (underscore) — the registered route is `check-token` (hyphen). All corrected; the access-key/auth-bridge validation paths now resolve instead of 404ing.
- **Second-row (send-browse action bar) removed.** `vault-shell.js` now hides the whole `.sb-header` row (`.vs-view-files .sb-header { display:none }`) — it duplicated the vault name and carried Copy Link / email (covered on Settings) and the non-vault Gallery-view link. The `New File / New Folder / Upload` actions moved from `.sb-header__right` to the **left tree panel** — `vault-browse-edit.js` wraps `SendBrowse.prototype._populateTree` to inject 📄/📁/⮋ icon buttons into `.sb-tree__controls` (writable vaults only, re-injected on tree refresh). The `✓ Decrypted` badge that was on that row is no longer shown; file size still appears in the bottom `vault-status-bar`.

**Sub-vaults Phase 0–3** (25–26 May 2026 — code-complete on `dev`, **browser-unverified**):

All sub-vaults work lives in `v0/v0.2/v0.2.3/` and user v0.3.3 (`sgraph_ai_app_send__ui__user/`).

| Component | File | What It Does | Tests |
|-----------|------|-------------|-------|
| `VaultLinks` (Phase 0–1) | `_common/js/lib/links/vault-links.js` (NEW) | `*.link.json` convention reader; `loadRoLinks`/`resolveRef`/`effectiveLink`/`saveRoRecord` for `.vault/owner/ro-links.json` owner records (read_key tier) | 45/45 |
| `CompositeDataSource` (Phase 0–1) | `_common/js/adapters/composite-data-source.js` (NEW) | Wraps root `VaultDataSource`; scan → `_subvault`/`_lazy` mount nodes; `loadFolder` opens child read-only via `SGVault.openReadOnly`; prefixed splice; routed reads | 36/36 |
| `<sg-embed-frame>` (Phase 2) | `_common/js/components/sg-embed-frame/sg-embed-frame.js` (NEW) | Controlled external resource embed: `<img>`/`<video>` media elements for media; provider iframe for YouTube/Vimeo; **sandboxed no-`allow-same-origin` iframe for link/app** (no bridge/listener — default-deny); click-to-load privacy; sticky transparency banner | syntax-clean |
| `<sg-link-card>` (Phase 2) | `_common/js/components/sg-link-card/sg-link-card.js` (NEW) | Sub-vault link card: shows public-info-before-key via `PublicPreviewRead.fetchPreview`; key+save-choice prompt (`.vault` ro/rw · local · ask-each-time); "Open here" (inline) / "Open in new window" (`/#key`) | syntax-clean |
| `sg-vault--history.js` | `_common/js/lib/sg-vault/sg-vault--history.js` (NEW) | Vault history module | logic-verified |
| send-browse lazy-on-expand | `sgraph_ai_app_send__ui__user/…/send-browse--v0.3.2.js` (v0.3.3) | Generic `_lazy`/`_subvault` node support; `_resource` leaf render + `_openResourceTab`; backward-compatible (share/open trees unaffected) | existing |
| vault-shell wiring | `vault-shell.js` | Wraps root in `CompositeDataSource` + scan; `<sg-link-card>` as keyProvider | syntax-clean |
| vault-browse-edit Add UI (Phase 3) | `vault-browse-edit.js` | "🔗 Add link" button (writable vaults); linked-vault flow: key validated → portable ro-record written (`saveRoRecord` → commit+push); external-resource flow: URL auto-typed | syntax-clean |
| Per-tab vault identity (P-174) | `vault-loader-storage.js` | Vault key in `sessionStorage`-first (per-tab); access token stays shared; enables "open in new window" as independent session | 8/8 storage-pertab |

**Browser-unverified gaps**: lazy expand → child opens silently; `<sg-embed-frame>` sandbox enforcement; Add-link cross-device portability; security (embedded page cannot read vault). Verification guides: `library/guides/vault-html/SUB-VAULTS-AND-LINKS.md`, `library/guides/vault-html/PLAYWRIGHT-VAULT-APP-ACCESS.md`.

**App-iframe Capabilities (Phases 1–4B)** (27 May 2026 — code-complete on `dev`, **browser-unverified**):

The app-iframe permission model gives hosted apps a grant-based, user-consented file system interface while protecting `/.vault/**` unconditionally. All changes are in `v0/v0.2/v0.2.3/`.

| Component | File | What It Does | Tests |
|-----------|------|-------------|-------|
| `AppPermissions` module (Phase 1) | `_common/js/components/app-shell/app-permissions.js` (NEW) | DOM-free, bridge-free pure permission logic: `normalizePath` (collapses `.`/`..`/`//`), `hasVaultSegment`, `isFloor`, `parsePermissions`, `can`, `appId` (SHA-256 of `app.json`) | 39/39 |
| Security floor (Phase 1) | `app-shell.js` | `.vault/**` reads/writes/list/nav non-grantable (bridge-level, path-normalised); `vfs.list` filters `.vault` entries; direct `list('.vault…')` → `ENOENT` | phase 1 unit |
| Grant-aware verbs (Phase 2) | `app-shell.js` | Read/write/list grant-gated via `_can(verb, path)`; new FS verbs: `move`/`delete`/`mkdir` via `__sgCmdType:'fs'` (grant+token-gated) | AppPermissions unit |
| HUD privileges chip (Phase 3) | `app-hud.js` | `🔓 write · move · …` chip showing `app.json` grants; hidden for default-reads-only apps | DOM-only |
| Consent surface + `requestPermission` (Phase 4A) | `app-hud.js`, `app-shell.js` | HUD consent bar (Allow/Deny); `sg.ui.requestPermission(verb, path)` from iframe; one-per-(vault,appId,verb) localStorage cache; `vault.delete` always re-confirms; chip-click reset | syntax-clean |
| `vault.create` + `vault.unlink` (Phase 4B) | `app-shell.js` | Iframe creates child vault (high-entropy key; `*.link.json` + `saveRoRecord`; read-through child); unlinks one. `vault.delete` **deferred** (write-key owner-secret-tier needed) | syntax-clean |
| `en-gb/app/index.html` | index.html | `app-permissions.js` loaded before `app-shell.js`; `hud.setPrivileges()` called on `app-shell:ready` | — |

Spec: `team/roles/architect/reviews/05/27/v0.27.79__architect-spec__app-iframe-capabilities-and-permissions.md`
Plan: `team/roles/dev/reviews/05/27/v0.27.79__dev-plan__app-iframe-capabilities-implementation.md`
Migration guide: `library/guides/vault-html/MIGRATING-TO-THE-PERMISSION-MODEL.md`

**App-mode improvements** (27 May 2026 — merged to `dev`):

| Fix | File | What It Fixes |
|-----|------|--------------|
| File hash in URL (`#path`) | `app-shell.js` | Reload re-opens the file; link is copy-shareable |
| Open-as-app honours requested file | `app-shell.js`, `vault-header.js`, `vault-browse-edit.js` | Fixed: the default app was always opened; now the requested file wins |
| Fix `MarkdownParser.parse` | `app-shell.js` | `new MarkdownParser()` was wrong; changed to `MarkdownParser.parse()` |

**Public vault previews** (25–26 May 2026 — code-complete on `dev`, **browser-unverified**; backend 6/6 + OG 6/6 + JS KAT 9/9):

| Component | Status |
|-----------|--------|
| `sg-public-preview-card.js` (preview card) | Implemented |
| `sg-public-preview-editor.js` (settings tab) | Implemented |
| OG-render service + route (User Lambda) | Implemented |
| `/en-gb/preview/<id>` tester page | Implemented |
| RO-token deterministic resolution (`test__ro_token_resolution.js`) | Implemented; 75 assertions |
| `/en-gb/app/<public-id>` app-shell Mode A/B wiring | **Pending** |
| CloudFront path-segment routing | **DevOps dependency — not yet in production** |

Dev pack: `library/sgraph-send/dev_packs/v0.27.62__public-vault-previews/`

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
