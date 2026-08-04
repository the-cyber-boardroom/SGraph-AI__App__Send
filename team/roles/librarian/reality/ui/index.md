# ui — Reality Index

**Domain:** `ui/` | **Last updated:** 2026-07-31 | **Maintained by:** Librarian (daily run)

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

**`sg-print.js` (shared print-to-PDF utility — `v0.3.1/_common/js/sg-print.js`)**

Standalone print utility; zero dependencies. Used by the SG/Vault file-viewer Print button and
`app-shell._onPrint` (both consume the v0.3.1 `_common/` copy). Exposes `SgPrint.printHtml(html, filename)` and `SgPrint.printMarkdown(md, filename)`. Opens a clean print window with a toolbar (Print / Close) on screen, and a branded A4 document on print/PDF.

- **v0.3.1 base**: screen preview padding 0.8cm 1.2cm; dark inline background stripping; `.page-break` CSS support.
- **v1.0.3 (2026-06-13, commit `c32bfed6`)** — WYSIWYG margin parity fix: single constant `PAGE_MARGIN = '1.5cm'` used as both `@page { margin }` (print) and `.sg-print-page { padding }` (screen preview), so the on-screen preview faithfully matches the printed PDF. Prior to this, the preview used `0.8cm 1.2cm` padding while the actual PDF used `1cm 1.25cm @page` margin — they disagreed, and `1cm` read as cramped. Print media still resets the page element's own padding/margin to 0 so `@page` is the sole margin source (no doubling). **Browser-unverified** — no Save-as-PDF CI pass; fix is code-correct.
- **Open follow-up (not done):** If output still looks scaled/shifted, the likely cause is wide ASCII `<pre>` diagrams overflowing the page width and triggering Chrome's shrink-to-fit. Separate fix needed (wrap/clip/scale wide `pre` in print media).

**v0.3.2** — IFD overlay on v0.3.0 + v0.3.1. 8 surgical overlay scripts + new secret page.
- Share a Secret: `<send-secret-view>` Web Component; ephemeral text viewer; kill flow
- Options Step: `<upload-step-options>` consolidates Delivery + Share into one step (6→5 steps)
- Secret Tab UX: pill toggles, textarea, Views/Expires pills; `<upload-step-done-secret>`
- `<sg-vault-picker>`: vault selection Web Component (NOW EXISTS; was PROPOSED)
- VFS inlining: `_inlineHtmlAssets()` + `_replaceAsync()` in `send-browse--v0.3.2.js`

**v0.3.3** — IFD overlay on v0.3.0 + v0.3.1 + v0.3.2. File: `v0.3.3/_common/js/components/send-download/send-browse--v0.3.2.js` (12 Jun 2026, commit `0c34e1c9`).
- **Copy contents button** — `⎘ Copy` action added to send-browse's file viewer toolbar, next to Save / Locate. Shown for textual file types only (code, text, markdown, csv, HTML source). Uses `navigator.clipboard` with `textarea + execCommand` fallback for insecure contexts; flashes "✓ Copied" for 1.6 s. Binary types (images, video, PDF, archives) deliberately excluded. Picked up by vault-browse-edit everywhere it renders a file.
- **Open item:** `_write` encoder in this file still uses chunk=8192 (same base64 padding bug fixed in `app-shell.js` at v0.33.21). Only affects editor writes from the preview pane > 8 KB. Flagged in commit `0c34e1c9`; tracked for a follow-up small commit.

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

> **Code index (2026-07-24):** a per-file/per-feature/per-test navigation index for this
> package is maintained at `team/roles/librarian/code-index/vault-web/` (entry: `index.md`).
> Agents starting vault-web tasks should read it first. Code-verified corrections recorded
> there: the app bridge namespace is **`sg.append.*`** (no `sg.inbox.*` exists), there is no
> `sg.shell.*` namespace (print is the `__sgPrintReq` RPC), and **Vault Chat Phases 1–4
> SHIPPED mid-June** (commits `adc9d0f`, `60a2f6d`, `ad8e14d`: real `sg-llm-request`
> transport, in-vault chat pane/page at `en-gb/vault/chat/`, injection-floor fencing,
> context-layers inspector, tools/loadout panel, `consolidate_memory` + fractal scope) —
> P-263/P-264 are therefore partially shipped, with P-265/P-266 and the docs-505/506
> remainder still open.

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
- iframe onerror capture (same-origin only): forwards as `{ type: 'sg-app-error', message }`, stored as timeout detail. **Note (ViV Phase 4):** this is the *browser* flow (`/`, `sg-app-banner` + the remotely-served `send-browse--v0.3.2.js` preview frame). It is a parent-side same-origin reach (`_tryInjectIframeErrorListener`, `contentDocument` body inspection) — dead for any null-origin frame, retained only for the remote preview component whose origin status is external to this repo. The `/en-gb/app` (app-shell) flow does NOT use this; see the app-shell error re-spec below.

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
- **ViV Phase 4 — unified app-frame bootstrap (SHIPPED).** All four iframe-context mount paths (`_mountApp`, `_mountVaultFile` HTML, `_mountPageLayout`, `_mountVaultFile` markdown) build their `srcdoc` via a single pure, DOM-free builder `AppFrameBootstrap.build({kind, …})` (`app-frame-bootstrap.js`, `globalThis.AppFrameBootstrap`, loaded before `app-shell.js`). `kind ∈ {app, html, page-layout, markdown}`. The mount methods now only fetch deps/bytes and pass them in; no more copy-paste template assembly across the four callers. Channel is unchanged — still the postMessage `sg.*` bridge (Phase 4 Option A: unify the bootstrap, not the channel; promoting the app frames to `SecureChannel` is the pack's Phase 6). The builder is unit-tested in Node (`test__app_frame_bootstrap.js`, 31 assertions).
- **ViV Phase 4 — app-error surfacing re-spec (SHIPPED).** Under null-origin app frames the parent can no longer inject `contentWindow.onerror`. Instead the injected bridge self-reports: `window.onerror`, `unhandledrejection`, and a post-`DOMContentLoaded` **blank-app self-check** all `postMessage({type:"sg-app-error", message}, "*")` to the parent (null-origin safe). **Blank-app self-check broadened (2026-06-11):** previously only caught `display:none`; now also flags `visibility:hidden`, `opacity:0`, an empty body (no children), and zero-height/no-text content — closing the "app loaded but painted nothing, no console error, no host clue" worst case. A working app (body children + non-zero height by 2.5 s) never trips it. Plus an **empty-entry guard** in `_mountApp`: a 0-byte/whitespace entry file → host-drawn `_showError` instead of a blank iframe. The app-shell parent handler (`_setupVfsBridgeHandlers`) records `_lastIframeError` and surfaces a persistent error toast via `<app-hud>.showMessage(…, 'error', null)`. **Attribution (2026-08-03):** the report now carries `appPath`, the toast reads `App code (<file>): <message>`, and BOTH sides `console.error` a `[vault-app] <file> — thrown by the APP's own JavaScript, not the vault platform` line. An unlabelled `Uncaught SyntaxError: …` sitting on vault chrome reads as a vault fault and sends debugging to the wrong codebase — it did exactly that for a boot loader living inside a vault app. Covered by `test__app_shell_bridge_build.js` (the injected bridge is also parsed, since a typo in that `<script>` string only fails in a browser). Browser-fact locked by probe **P5** in `test__phase3_null_origin_probe.spec.js`. This restores, from inside the boundary, the error surfacing the old same-origin `sg-app-banner` reach used to provide for the app-shell flow.
- **Regression fix — in-vault link navigation under null-origin frames (SHIPPED).** Phase 3 flipped all app frames to render via `iframe.srcdoc` (null-origin sandbox). An iframe's `srcdoc` attribute **overrides** `src`, but the in-app link-nav handler (`_setupVfsBridgeHandlers`, `__sgVfsNavReq`) was left assigning a parent-origin `blob:` `src` — silently ignored once the frame was mounted via `srcdoc`, so clicking an in-vault `.html` link did nothing (the frame kept showing the original page; the browser status bar showed the un-intercepted absolute href, e.g. a `403` against the vault origin if followed). Fix: navigation now rebuilds via `AppFrameBootstrap.build({kind:'html'})` and assigns `iframeEl.srcdoc` (clearing any stale `src`), matching the initial-mount path. **Coverage gap that let this through:** no e2e drives a real app-shell mount + in-vault link click (the existing app-context regression spec stubs the network); an app-shell nav e2e harness (real decrypt → mount → click → assert frame content changes) is the recommended follow-up.
- **ViV Phase 5.1 — cross-kernel audit aggregation core + UI surface (SHIPPED).** `viv-audit-view.js` (`globalThis.VivAuditView`, pure/DOM-free, built on `VivMountsView`) aggregates the mount tables + broker logs of multiple kernels into one operator view: `aggregate(sources)`, `filterLog(log, criteria)`, `groupLog(log, dimension∈{mount,kernel,op,decision,result,cred})`, `facets(log)`, `sourceRows(sources)`. Consent-honest: only `monitor∈{top,opt-in}` sources expose a log; `closed`/`unreachable` children contribute their (parent-visible) mount rows + an explicit placeholder but **no** log entries (matches VivMonitor fail-closed default). Grandchild kernels are unreachable by design (no central collector). Unit-tested in Node (`test__viv_audit_view.js`, 33 assertions). **Surfaced** as the `<app-debug-audit>` "🛡️ Audit" tab in the `/app` debug pane (see above) — chosen over a standalone page because broker logs are in-memory per-document in the app-shell runtime, so only an in-process debug tab can read them.
- **VFS write bridge — base64 chunking fix (11 Jun 2026 — `app-shell.js`).** `sg.vfs.write` silently capped at ~8KB. Root cause: the injected `_write` bridge chunked bytes at 8192 bytes per `btoa()` slice; 8192 mod 3 = 2, so every non-final slice produced a `=`-padded base64 string — `atob()` rejects `=` anywhere except the trailing position, causing "Bad encoding" for any write > 8KB. Fix: chunk size 8192 → **8190** (= 3×2730), so every non-final slice is a clean multiple of 3 bytes and produces padding-free base64. `atob()` now accepts at any size (verified through 128KB). Added `EBADENC` diagnostic on receive (reports raw base64 length + `atob` message) so future encoding failures are immediately identifiable.
- **EFBIG guard for `sg.vfs.write` (11 Jun 2026 — `app-shell.js`, commit `b3987ba3`).** The host now refuses writes above ~3 MB plaintext at the bridge receiver with `EFBIG` error code (exact limit + actual byte size in the error), preventing a silent Lambda 413 mid-batch failure. ~3 MB is the practical ceiling: one `POST /api/vault/batch` carries new blob + tree + commit + ref + index, each base64-encoded; Lambda URL Functions cap at 6 MB; base64 inflates ~1.33×. A presigned-PUT write path to lift this ceiling is **PROPOSED (P-269)** — see `team/comms/briefs/06/11/v0.33.21__brief__vault-presigned-put-large-write.md`. `AUTHORING.md` updated with ceiling note and read/write asymmetry.
- **`sg.app.writable` parity fix (12 Jun 2026 — `app-shell.js`, commit `0c34e1c9`).** `sg.app.writable` was based solely on the crypto tier (`this._writable`: ro-token vs full key); now it is the AND of both tiers: `this._writable && dataSource.writable`. `app-shell:ready` now also sets `isRO = isRO || !dataSource.writable` so the HUD shows the read-only badge when writes will fail for any reason. `getDebugState()` exposes `writableCrypto` + `writableAuth` separately so the debug pane shows both tiers. Fixes: a full-key open with no access token reported `sg.app.writable=true` in `/en-gb/app/` but `=false` in the Vault UI editor preview — apps trusting the flag (e.g. audit-log writes on init) received EREADONLY unexpectedly.

**`<app-hud>` Web Component** (`app-hud.js`, 490 lines — 30 May 2026):
48 px chrome row rendered outside `<sg-layout>`, plus an optional 32 px nav row below it (V1, 30 May 2026). Chrome shows: SG/App brand, vault badge, app title (centre), read-only badge, copy-link button, vault-back link, debug toggle. Handles `sg.ui.message()` notifications dispatched from the app iframe (toast queue with auto-dismiss). Receives vault/app info via `setInfo()` called by the page script on `app-shell:ready`.

- **In-vault nav row V1 (SHIPPED 30 May 2026).** Browser-style toolbar inside the HUD: back / forward / refresh arrows + path display (with `#fragment` highlighted in teal) + copy-path button + ⋯ recent-pages menu (last 15, chronological, no dedup). The HUD never owns history; it dispatches `app-hud:nav` `{action: back|forward|reload|jump|exit, path?}` and renders state pushed back via `app-nav:change` from `<app-shell>`. Type-to-jump address-bar autocomplete is **NOT** in V1 — deferred to a follow-up. **Hash-link bug fix:** the iframe click interceptor in `app-shell._buildVfsBridgeScript` now strips `?`/`#` before its `.html`/`.htm` extension check, so `pages/x.html#section` links are intercepted instead of falling through to a 403. The fragment is forwarded and applied via `__sgVfsScrollToHash` on `DOMContentLoaded` (null-origin safe). Friendly broken-link overlay replaces the prior console-warn dead-end. **Bug fixes shipped (follow-up commits):** path-doubling fixed (`alreadyResolved:true` flag for history-entry navigations); recent-pages close-on-open fixed (one-shot outside-click listener on next event-loop turn); Home button added; editable URL bar display.
- **`app.json` `hud.*` config schema (SHIPPED 30 May 2026; `none` mode + redesign 11 Jun 2026).** `hud.mode ∈ {full, minimal, hidden, none}` (default `full`) + `hud.show.{vaultName,appTitle,openVault,copyLink,print,debug,navBar,navArrows,navPath,navRefresh}` granular flags. `mode:"hidden"` collapses the chrome (iframe takes 100% viewport) but keeps the corner `× Exit app` pill; **`mode:"none"` (NEW)** drops the pill too — no visual clue it's a vault app, URL is the only way back (author-opt-in, e.g. patient forms). `minimal` now keeps **Open Vault** on by default (a stripped HUD still needs a visible way back). **Right-cluster redesign (11 Jun):** Copy Link / Print / Debug collapsed into a `⋯` overflow menu; the privileges chip is now a compact `🔒 N` that expands on click to a risk-tiered popover (destructive verbs — delete files/unlink/delete vaults — flagged amber, sorted last) with a "Reset granted consents" button. **Privileges chip colour semantics (11 Jun 2026):** standing chip is **slate** (informational) by default; lifts to **amber** when destructive grants (`vault.delete`, `vault.unlink`, `move`, `delete`) are held. Active-prompt red (consent bar) and error-red (activity meter `pulse-err`) are unchanged — red is reserved for those live-alert surfaces only. **File-activity meter (NEW, `show.activity`; full-default on, minimal/hidden/none off):** a compact `⇅ R N  W N` chip tallying files read (`vfs.read`/`vfs.list`) vs written (`vfs.write`/`fs.move`/`fs.delete`/`fs.mkdir`) this session, flashing green/red per op, expanding to the last 15 ops (path · size · ms · outcome). Pure consumer of the `app-debug:bridge-call` event the kernel already emits — no kernel/bridge change; transparency surface for the power-user audience. **Sovereignty rail (apps cannot suppress):** (1) the consent prompt always renders — it's now a **full-width consent bar that is a sibling of the chrome row** (`.hud-consent-bar`), so it shows even in `hidden`/`none`; message wraps (never truncates), shows the app's standing grants, focuses **Deny** by default (Esc=deny), risk-tiered colour; (2) a corner `× Exit app` pill persists in `hidden` (NOT `none`); (3) user-side override `localStorage['sg-app-force-show-hud']='1'` forces `mode:"full"`, upgrading **both** `hidden` and `none`. Resolved by `AppHudConfig.resolve(cfg)` (see below). Applied via `hud.applyHudConfig(cfg)` on `app-shell:ready`.
- **`sg.state.*` bridge namespace (SHIPPED 30–31 May 2026).** New namespace exposed to every app frame: `sg.state.get(key)`, `sg.state.set(key, value)`, `sg.state.remove(key)`, `sg.state.clear()`, `sg.state.keys()` (the enumerate method is `keys()`, not `list()`). Backed by kernel `localStorage` (device-local; not part of the vault; persists across vault navigations in the same app). Allows apps to store user preferences (dark mode, layout) without vault commits. Added to `app-shell.js` in Commit B alongside the print bridge-RPC fix.
- **Print bridge-RPC (SHIPPED Commit B, 30 May 2026).** `sg.shell.print` RPC: app iframe posts its rendered HTML via `postMessage`; parent reconstructs a blob URL and invokes `window.print()`. Null-origin safe (does not read `iframe.contentDocument`). The initial Print button (Commit A) read `contentDocument` directly which throws `SecurityError` under Phase 3 null-origin frames; Commit B replaced it with this bridge-RPC path.
- **New `<app-shell>` nav surface**: `_navigateToPath(href, {alreadyResolved, pushHistory})`, `_pushNavHistory`, `_navBack`, `_navForward`, `_navReload`, `_canNavBack`, `_canNavForward`, `_currentNavPath`, `_renderBrokenLinkOverlay(path, reason)`, `_exitApp`, `_emitNavChange`. Nav history seeded with entry path on `_mountApp`; forward stack truncated on new nav.

**`AppHudConfig` module** (`app-hud-config.js` — pilot extraction, 31 May 2026):
Pure resolver for the `app.json` `hud.*` schema. `AppHudConfig.resolve(cfg)` → `{mode, show}` with per-mode defaults then explicit overrides (now includes `none` mode; `minimal` defaults `openVault:true`; `show.activity` full-on/minimal-off). `hidden`/`none` both resolve with FULL show defaults so the force-show override yields a sensible chrome. Extracted from `app-hud.js` to make it testable in Node. `globalThis.AppHudConfig`. **Unit tests:** 36 assertions (`test__app_hud_config.js`).

**`AppNavHelpers` module** (`app-shell-nav-helpers.js` — pilot extraction, 31 May 2026):
Pure nav-logic helpers extracted from `app-shell.js`. `globalThis.AppNavHelpers`. Contains `_navigateToPath` semantics, history management, and path resolution. Extracted to improve testability. **Unit tests:** 47 assertions (`test__app_shell_nav_helpers.js` — extended from 35 to 47 with deep-link matrix DM5–DM11, 01 June 2026).

**Deep-link HTML fix (01 June 2026 — commit `3271fbdf`):**
Fixed `/en-gb/app/#path/page.html` not loading CSS/JS. Root cause: `_continue()` was calling `_mountVaultFile(deepPath)` (bare file view, ignores `app.json` resources) when the deep-link path differed from `app.json`'s `entry`. Fix: HTML deep-links always route through `_mountApp(deepPath)` so `app.json` resources (CSS/JS declared in the `resources` block) are injected. Bonus: body-hidden self-check delay raised from `setTimeout(0)` to `setTimeout(2500)` to suppress false-positive "App body is hidden" banners for reveal-on-ready apps (e.g. Private Health Score).

**Note on `SgReplCore` / `app-debug-repl.js` test file:** Previously referenced in this document (29 assertions), the test file (`test__sg_repl_core.js`) was committed to dev on 30–31 May. 29 assertions now confirmed in repo.

**`<app-debug-pane>` Web Component** (`app-debug-pane.js`, 149 lines — 22 May 2026):
Collapsible right-edge debug panel with 7 tabs: Vault Trace, Bridge Log, Mounts (single-kernel, B4), **Audit** (cross-kernel, Phase 5.1), **REPL** (sg.* console, pack §3.4), App State, Network. Collapses to a narrow edge strip when host width < 40 px (ResizeObserver). Tabs are lazy-loaded sub-components.

**`<app-debug-repl>` Web Component** (`app-debug-repl.js`, pack §3.4 — "UI consumer" Phase 5): a deliberately small operator console over the `sg.*` surface — `vfs.list/read/write/delete` (+ `ls`/`cat`/`rm` aliases), `mounts`, `broker.log`, `help`, `clear`; command history (↑/↓). **Not a shell.** Parsing + output formatting are `globalThis.SgReplCore` (pure, DOM-free, unit-tested — `test__sg_repl_core.js`, 29 assertions); execution calls `window._appDebug.repl`, a thin async glue app-shell installs (in `_setupVfsBridgeHandlers`, refreshed per mount/nav) over the SAME composite data source the running app sees (read-through sub-vaults resolve identically) + the KernelParent for `mounts`/`broker.log`. Writes/deletes honour `dataSource.writable` and the `.vault` floor (`AppPermissions.isFloor`). Pure consumer — no new mechanism.

**`<app-debug-audit>` Web Component** (`app-debug-audit.js`, Phase 5.1): the multi-kernel companion to the Mounts tab. Aggregates across every kernel the page can see — the top kernel (own mounts + broker log) plus each direct child polled via `KernelParent.monitorChild` (B7 monitored-mode). Children default to CLOSED → shown as honest "monitoring closed" placeholders, not empty rows; grandchildren are "unreachable". Renders a per-source roll-up (kernel · monitor state · mount/op counts) + a merged broker log tagged by kernel. Data: `window._appDebug.vivAuditProvider()` (ASYNC — one channel round-trip per child) installed by app-shell on its KernelParent. All shaping is `globalThis.VivAuditView` (pure, DOM-free, unit-tested — `test__viv_audit_view.js`, 33 assertions, covers top/opt-in/closed/unreachable). **Note:** like the Mounts tab, the merged log only fills from ViV kernel mounts (`sg.vault.mount` + `relay`); read-through `*.link.json` sub-vaults are a separate mechanism and contribute nothing here.

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
| Tree mount-expansion status chip (pack §3.3) | `composite-data-source.js`, `vault-subvaults-view.js`, `send-browse--v0.3.2.js` | Expanding a `🔗` sub-vault node already lazy-opens it read-through (`loadFolder` → `_openMount`); now the in-tree chip is **status-aware** — `○ ro` not-opened, `● ro · connected` opened, `🔒 locked`, `⚠ error`. `_mountTreeNode` exposes `_status`; pure `VaultSubvaultsView.chip(status,access)`/`chipText` (unit-tested) shapes the badge; send-browse renders it (inline-coloured, graceful fallback to plain `·ro` when the helper isn't loaded) and re-renders on expand failure so locked/error shows. **Note:** /vault tree-expand is **read-through** (no kernel/broker in /vault) — "connected" means opened read-through, read-only. The pack's kernel-spawn+relay expand is an /app-kernel concept; not retrofitted into /vault (would require kernel infra /vault doesn't have). | `test__vault_subvaults_view.js` chip cases; `test__composite_data_source.js` 41 |
| `sg-vault--history.js` | `_common/js/lib/sg-vault/sg-vault--history.js` (NEW) | Vault history module | logic-verified |
| send-browse lazy-on-expand | `sgraph_ai_app_send__ui__user/…/send-browse--v0.3.2.js` (v0.3.3) | Generic `_lazy`/`_subvault` node support; `_resource` leaf render + `_openResourceTab`; backward-compatible (share/open trees unaffected) | existing |
| vault-shell wiring | `vault-shell.js` | Wraps root in `CompositeDataSource` + scan; `<sg-link-card>` as keyProvider | syntax-clean |
| `/vault` debug pane redesign | `vault-shell.js` | Debug pane moved from a bottom panel to a **right-side, resizable, reload-persistent** pane (mirrors `/app`): `.vs-debug-sidebar` is a flex child of `.vs-body`, drag-resized via a left-edge handle, open/width/active-tab persisted to `sessionStorage` (`vault-debug-open`/`-width`/`-tab`). Tabs: **Sub-vaults** + Msgs/Events/API/Storage. `_onTreeChanged` emits `tree-changed` on the bus so panes can live-refresh. | syntax-clean; e2e suite green |
| `<vault-subvaults-panel>` + `VaultSubvaultsView` | `_common/js/components/vault-subvaults-panel/` (NEW) | The `/vault` analogue of `/app`'s ViV Mounts tab. `/vault` has **no kernel/broker**, so this surfaces the read-through `CompositeDataSource._mounts` (`*.link.json` sub-vaults) — name/path/access/status(open·not-opened·locked·error)/file-count — read from `window.sgraphVault.shell._dataSource`. Pure view-model `globalThis.VaultSubvaultsView` (DOM-free) unit-tested. **Important distinction:** read-through sub-vaults are NOT ViV kernel mounts and generate NO broker-log traffic — the `/app` ViV Mounts tab only fills when an app calls `sg.vault.mount()` + does cross-mount `relay()`. | `test__vault_subvaults_view.js` 18/18 |
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

### Public Vault Previews (PVP) — v0.2.3 (05/25–26)

An optional deliberately-public preview per vault. Code in `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`.
Confirmed shipped: the talk-to-the-vault brief (doc 493, 05/25) reports it "built and working" same-day.

| Feature | Status |
|---------|--------|
| Slug → transfer ID + read-only key derivation | EXISTS |
| Two access modes: `/app/<id>` (ask key) + `/app/<id>#<key>` (auto-load) | EXISTS |
| OG social-share meta-tag cards (title, description, image) | EXISTS |
| LARGE social card (1200×630): crop-to-fill + pad-to-fit options | EXISTS |
| Bot UA routing to OG render endpoint | EXISTS |
| Owner-controlled disclaimer badge + themed footer | EXISTS |
| Copyable full-access link (masked/reveal + Copy→Copied feedback) | EXISTS |
| Embedded Settings tab editor with live preview card | EXISTS |
| Wrong-vault guard + loads existing published preview into editor | EXISTS |
| Delete previews + per-vault management list | EXISTS |
| ro-token key prompt on `/app/<id>` | EXISTS |
| Pre-fill slug from vault name | EXISTS |
| Bookkeeping: `.vault/owner/public-previews/` | EXISTS |
| Timing/expiry controls (X days / X accesses) | **VERIFY** — brief specifies; implementation status unconfirmed |

**Bookkeeping path:** `.vault/owner/public-previews/` (moved from root in `3d2f816` refactor)

---

### Sub-Vaults — v0.2.3, Phases 1–3 (05/25–26)

Convention-based vault-within-vault, Git-submodule style. Code in `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`.

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | ro-links owner records — silent read-only open | EXISTS (`e1e685f`) |
| Portable | ro-links open silently on any device without key re-entry | EXISTS (`8ddc0d6`) |
| Phase 2 | Link card UI + vault-in-vaults user guide | EXISTS (`84b73af`) |
| Phase 2 ext | External resources in controlled iframes | EXISTS (`8ae551a`) |
| Phase 3 | Owner "Add link" UI in folder-tree controls | EXISTS (`32b9edb`) |
| CLI access | Clone-within-clone for sgit CLI | PROPOSED (P-248) |

**Convention file:** `.link.json` — a vault-pointer file recording the referenced child vault.
**Lazy-load:** Sub-vaults pre-initialise on access (like folders), preserving open folders on load.
**App bridge:** Sub-vault reads/lists are accessible via the VFS bridge from apps.

---

### App-Mode Permission System — v0.2.3, Phases 1–4B (05/27)

Per-app capability grants declared in `app.json`; enforced by the VFS bridge. Code in `_common/js/components/app-shell/`.
Spec: `team/roles/architect/reviews/05/27/v0.27.79__architect-spec__app-iframe-capabilities-and-permissions.md`
Plan: `team/roles/dev/reviews/05/27/v0.27.79__dev-plan__app-iframe-capabilities-implementation.md`

| Phase | Feature | Status | Tests |
|-------|---------|--------|-------|
| 1 | `AppPermissions` pure module (DOM-free, bridge-free) + security floor | EXISTS | 39 unit assertions |
| 1 | Security floor: iframe cannot read/write/nav/list `.vault/**` or root `app.json` | EXISTS | 39 unit assertions |
| 2 | `app.json` grants read by bridge + `fs.move/delete/mkdir` bridge verbs | EXISTS | Covered by Phase 1 |
| 3 | HUD privileges chip — shows granted permissions in status bar | EXISTS | Browser |
| 4A | `sg.ui.requestPermission` — runtime consent dialog in HUD | EXISTS | Browser |
| 4B | `vault.create` + `vault.unlink` for apps (read-through child vaults) | EXISTS | Needs browser+backend |
| 5 | `vault.delete` | **DEFERRED** — needs owner-secret credential tier + AppSec |
| 6 | Reads default-deny (flip `READ_DEFAULT` to `false`) | **DEFERRED** — recorded decision |

**`AppPermissions` module:** `normalizePath`, `hasVaultSegment`, `isFloor`, `parsePermissions`, `can`, `appId`. Loaded on `/en-gb/app` before `app-shell.js`. Globally at `globalThis.AppPermissions`.

**In-iframe API (Phase 4B):** `sg.vault.create(path, label)` / `sg.vault.unlink(path)` / `sg.vault.delete(path)` — `vault.delete` returns `ENOTIMPL`.

**Changelog:** `team/comms/changelog/05/27/v0.27.79__changelog__app-perms-phase{1..4b}*.md`

---

### Native LLM chat in the Vault UI — "Ask about this file" (2026-08-02)

Host-native chat panel in `/en-gb/vault/`. Runs at the **real origin**, so it calls the
provider directly through `SGLlm` — no bridge, no sandbox, no postMessage streaming. The
transport is deliberately the same engine the kernel will use to service the PROPOSED
`sg.llm.*` for app frames.

| Component | Status | Evidence |
|-----------|--------|---------|
| `_common/js/lib/sg-llm/sg-llm.js` — `SGLlm` transport: `chat()` (OpenRouter, SSE streaming, abort → partial kept + costed), `models()`, `reconcileCost()`. Pure statics: `sseLines` / `parseSseData` / `estimateCost` / `effectiveCost` / `pricingFromModels` / `buildFileContext` / `redactMessages` | **EXISTS** | `tests/unit/vault_ui/loader/test__sg_llm.js` (40 assertions) |
| Two Workbench production bugs fixed by construction: the **decoder tail is flushed** after the read loop (a final `usage` frame with no trailing newline was being lost → silent `cost:null`), and a **mid-stream `data:{"error":…}` is surfaced** (was ignored → empty reply, no explanation) | **EXISTS** | pinned in `test__sg_llm.js` |
| `_common/js/lib/sg-llm/sg-llm-vault.js` — `SGLlmVault.open(vault)` resolves `.vault/llm/config.json` → a configured `SGLlm`. Unseals the owner tier via `SGVaultOwnerSecrets`; an ro-token session gets `EREADONLY` **cryptographically** (no write key → cannot derive). Returns `{ok, client, policy, model, reason}` — never throws for "unavailable here" | **EXISTS** | `sg-llm-vault.js` |
| `<vault-llm-chat>` — chat panel: streaming transcript (~16fps throttle), Send/Stop, per-session cost + call pills, removable file chips, states for `ENOKEY` / `EREADONLY`. **Not an agent**: no tools, no vault writes, no autonomous loop | **EXISTS** | `vault-llm-chat.js`; `tests/unit/vault_ui/loader/test__vault_llm_chat.js` (56 assertions, jsdom) |
| Context is capped at 24 000 chars and the truncation is stated **inside the text the model sees** (`buildFileContext`) so it cannot silently summarise a partial file; binaries are named but not sent; session spend/call caps from the policy are enforced before each call | **EXISTS** | `sg-llm.js`, `vault-llm-chat.js` `_send` |

#### Multi-file context, sg-layout panels + cost ledger (2026-08-02, second pass)

Five reported items (2 bugs, 3 features). Changelog:
`team/comms/changelog/08/02/v0.33.47__changelog__vault-llm-chat-multi-file-and-cost-ledger.md`

| Component | Status | Evidence |
|-----------|--------|---------|
| **Chat + requests are real `sg-layout` panels** — `vault-shell` mounts them into send-browse's layout (`layout.appendChild(el)` then `addPanel({el,title})`; `addPanel` only assigns `el.slot`, so the element must already be a light-DOM child). Drag/resize/close like any pane; the layout owns visibility, `close()` dispatches `vault-llm-close`. Fallback to the fixed `.vs-llm-sidebar` when no layout exists (Settings view / still upgrading, `_sgLayoutReady()` ~1s timeout). Panels are **parked** in the sidebar across a `_mountBrowse` teardown so transcript + attachments survive a branch switch | **EXISTS** | `vault-shell.js` `_showLlmPanel`/`_parkLlmEl`/`_detachLlmPanels`/`_watchPanelClose` |
| **BUG FIXED — a closed panel could never be reopened.** `_llmEl()` re-queried the DOM, but sg-layout's `_closeTab` **detaches `tab.el` before emitting `panel:closed`** — so at close time the querySelector found nothing, parking silently no-opped, the element was orphaned and the `✨ AI Chat` button was dead for the rest of the session. `_llmEl()` now holds a hard reference (a live in-subtree element still wins, so a shell re-render replaces it) | **EXISTS** | `vault-shell.js` `_llmEl`; `tests/unit/vault_ui/loader/test__vault_shell_llm_panels.js` (28 assertions, jsdom, fake layout reproducing the detach-then-emit order) |
| **BUG FIXED — second file selection.** Context came from a global `vault-file-viewing` event fired in `_renderFileContent`, but `send-browse._openFileTab` **returns early when the tab is already open** (clicks the existing tab), so nothing re-announced and the chat silently kept the first file. Now the action-bar button closes over the bytes decoded for **its own** render — the emitted file cannot drift. `send-browse` is unmodified | **EXISTS** | `vault-browse-edit.js`; `tests/unit/vault_ui/loader/test__vault_browse_edit__add_to_chat.js` (13 assertions) |
| **`➕ Add to chat`** replaces `✨ Ask AI` in the file action bar (additive: attaches + opens the panel). **`✨ AI Chat`** added to `vault-header` (`vault-header-llm`) as a top-level entry point — the chat opens with no file selected | **EXISTS** | `vault-browse-edit.js`, `vault-header.js` |
| **Explicit multi-file context set** — `addContextFile` (dedup by path; re-add **replaces** the text), `removeContextFile` (per-chip `×`), `clearContextFiles`, `contextFiles()`. 20-file cap. A **no-file chat is a first-class state** with its own system prompt. `setContextFile()` is now a hint for the empty state only — it never auto-attaches | **EXISTS** | `vault-llm-chat.js`; `test__vault_llm_chat.js` |
| **Shared context budget** — all attached files split ONE 24 000-char budget (floor 1 500/file), not one budget each, so attaching a second file cannot silently double the prompt and the bill; every slice still labelled `TRUNCATED` | **EXISTS** | `vault-llm-chat.js` `_contextMessages`; budget assertion in `test__vault_llm_chat.js` |
| **`VaultLlmLog`** — pure DOM-free session ledger. Entry created **at send time** (in-flight and failed calls are visible). Carries the upstream **generation id** (the join key to an OpenRouter statement). `totals()` keeps `billedCost` and `estimatedCost` in **separate buckets**; reconciliation MOVES a call between them rather than double-counting; finished-but-unpriced calls are reported. 500-entry ring cap. CSV/JSON export | **EXISTS** | `_common/js/lib/sg-llm/vault-llm-log.js`; `tests/unit/vault_ui/loader/test__vault_llm_log.js` (35 assertions) |
| **`<vault-llm-requests>`** — the "AI Requests" panel: per-call table (seq · time · model · copyable generation id · tokens · cost · latency · files), running totals, CSV/JSON copy, clear. Pure consumer of `VaultLlmLog` (closing it loses nothing). **An estimate is never rendered as a bill** — `~` prefix, dropped once reconciled | **EXISTS** | `vault-llm-requests.js`; `tests/unit/vault_ui/loader/test__vault_llm_requests.js` (29 assertions) |

**Not done (PROPOSED):** real per-file token counts (chars are a proxy — needs the model's
tokeniser); ledger persistence across reloads (deliberately session-only: persisting it would
be vault state and needs an owner-tier decision); cost caps spanning panels.

#### Key-resolution fix + request params (2026-08-02, third pass)

Changelog: `team/comms/changelog/08/02/v0.33.47__changelog__llm-key-lazy-subtree-fix-and-request-params.md`

| Component | Status | Evidence |
|-----------|--------|---------|
| **BUG FIXED — a configured key read as `ENOKEY`.** `loadSubTreeOnDemand` expands exactly ONE level, so expanding `/.vault` left `llm` unloaded and `listFolder('/.vault/llm')` returned `[]` → config read as absent. `SGLlmVault._ensureSubtree(vault, path)` now walks **every** segment. Only reproduced on a **fresh open** (in the session that wrote the config the node was already in memory), which is why it looked intermittent. Same class as the embedded-access-token lazy bug, nested-folder case | **EXISTS** | `sg-llm-vault.js`; `tests/unit/vault_ui/loader/test__sg_llm_vault.js` (17 assertions; verified failing against the pre-fix file) |
| Chat re-resolves availability on `open()` when the session is not `ok` (a key added in Settings no longer needs a page reload); an already-ok session is **not** re-resolved | **EXISTS** | `vault-llm-chat.js` `open()` |
| **Request params bar** (`⚙`): temperature, top-p, max tokens. Blank = the provider's own default (no hard-coded 0.7). **max tokens is clamped to `limits.maxTokensPerCall`** and the clamp is stated — a per-session control is not a route around the vault ceiling | **EXISTS** | `vault-llm-chat.js` `_readParams`/`_renderParams`; `test__vault_llm_chat.js` |
| `SGLlm.chat` gains **`topP`** (`top_p`); `temperature`/`topP`/`maxTokens` verified to reach the wire, and omitted params are **absent** rather than sent as `null` | **EXISTS** | `sg-llm.js`; `test__sg_llm.js` (+7) |
| Ledger **Clear** confirms **inline** (no `window.confirm`) — the test substitutes a throwing `window.confirm`, so a regression to a native dialog fails the suite | **EXISTS** | `vault-llm-requests.js`; `test__vault_llm_requests.js` (+10) |

### Release channels — "pin a version" (2026-08-03)

Changelog: `team/comms/changelog/08/03/v0.33.47__changelog__vault-release-channels.md`
Spec: `team/roles/architect/reviews/08/02/v0.33.47__architect-spec__vault-release-channels.md`

A vault can publish named releases; a viewer pins to one from the HUD or a link. Pushing new work
no longer changes what an existing holder of the link sees. Nothing is copied — SGit objects are
immutable and content-addressed, so a release *is* the same objects.

| Capability | Status | Evidence |
|------------|--------|---------|
| `.vault/releases.json` — `{schema, default, allowLive, releases:[{name,commit,label,notes,created}]}`. Inside the permission floor → apps cannot read or tamper. **Absent file ⇒ no behaviour change and no HUD chrome** | **EXISTS** | `sg-releases.js`; `tests/unit/vault_ui/loader/test__sg_releases.js` (47 assertions) |
| Resolution **url > stored > default > live**. Stored is written only by an **explicit** choice (an unpinned vault reloads to latest); `default` binds other viewers but **not the owner** | **EXISTS** | `SGReleases.resolve`; same test |
| An unknown **URL** pin → live **with a visible warning**; a stale **stored** pin falls through quietly | **EXISTS** | same test |
| Names are **free text and semver-ish**, unique case-insensitively, addressable by name **or slug** (`#key\|@black-hat-demo`, `#key\|@v1-2`) | **EXISTS** | `SGReleases.find`/`slug` |
| `PinnedVaultDataSource` — the vault at ONE commit. `getFileList()`/`getFileBytes()` from `_flattenCommitTree`/`readFileAt`; `warm()` pre-loads so `getFileList()` stays **synchronous**; intermediate folder rows synthesised | **EXISTS** | `pinned-data-source.js`; `test__pinned_data_source.js` (27 assertions) |
| **Pinned is read-only for everyone including the owner** — `writable:false`, mutations reject `EPINNED` (distinct from `EREADONLY`). Committing on an old tree would fork the branch | **EXISTS** | same test |
| Pinned mount pins the WHOLE app — its `app.json`, resources and every `sg.vfs.read` — because resolution happens **before** `_readAppJson()` | **EXISTS** | `app-shell.js` `_applyRelease` (called at line ~427, before `_readAppJson`) |
| **The release map is read at HEAD, always** — only content is pinned. Reading it at the pinned commit would freeze the release list to what that version knew, with no way back | **EXISTS** | `_readReleases` (walks the lazy `.vault` sub-tree first) |
| **Auto-sync suppressed while pinned** — `_checkBehind` no longer fast-forwards/remounts a pinned viewer (which would yank someone onto HEAD mid-demo); surfaces "a newer version has been published" passively instead | **EXISTS** | `app-shell.js` `_checkBehind` early branch |
| URL grammar `#key\|@name`, composing with `app:` deep links in either order; bare `@` ignored | **EXISTS** | `vault-loader-routing.js` `_extractReleasePin`; `test__routing_decisions.js` (+9) |
| HUD picker (Live + releases) + **amber `⏱ <name>` pill** whenever not on the latest version; both render only when releases exist | **EXISTS** | `app-hud.js` `setReleases`; `app-hud:release-change` → `switchRelease` |

**Authoring — Settings → Versions (2026-08-03).** `<vault-releases-editor>` is a third Settings
tab in `/vault`, peer to Public preview: publish a commit under a name (picker fed by
`vault.logCommits({limit:40})`), edit name/label/notes, remove, set/clear the default, toggle
`allowLive`, and copy the pinned share link per release. Writes `.vault/releases.json` then
pushes. Owner-only by construction (the file is inside the permission floor and writing needs a
writable session); a read-only opener still sees the list and the share links. Removal confirms
**inline** (no `window.confirm`). A **rename carries the `default` with it**, and removing a
release **clears a default that referenced it** — otherwise the default silently points at a name
that no longer exists and every new viewer drops to Live. Uniqueness is enforced at write time
because the parser keeps the first duplicate (a second "v1.2" would look like the publish did
nothing). Share links are built from the **name**, not the label, so relabelling never breaks an
existing link. Evidence: `vault-releases-editor.js`;
`tests/unit/vault_ui/loader/test__vault_releases_editor.js` (44 assertions).

**NOT built (PROPOSED):** `/vault` browser parity for *viewing* a pinned version (the picker is
`/en-gb/app/` only — Settings authors releases, the app HUD consumes them); sub-vault children are
**not** pinned (a linked child has its own HEAD). **GC note:** there is no garbage collection
today — when one is built, pinned commits must be roots or a published release could be collected
out from under a live link.

#### `sg.llm.*` app bridge — Phase 1 + kernel accounting (2026-08-02)

Changelog: `team/comms/changelog/08/02/v0.33.47__changelog__sg-llm-bridge-phase-1.md`
How-to brief: `team/comms/briefs/08/02/v0.33.47__brief__sg-llm-capability-how-to-use.md`

Vault apps can call an LLM through the host; **the key never enters the app frame**. Served by
`/en-gb/app/` (`app-shell.js`), reusing `SGLlm`/`SGLlmVault`/`VaultLlmLog` unchanged.

| Capability | Status | Evidence |
|------------|--------|---------|
| `sg.llm.{available,models,usage,chat,cancel}` injected into the app bridge | **EXISTS** | `app-shell.js` `_buildVfsBridgeScript` (`_llmChat`) |
| Host chokepoint, in order: **permission → consent → budget → model policy → call**. `EPERM` / `ECONSENT` / `EBUDGET` / `EMODEL` / `ENOKEY` / `EREADONLY` / `EABORT` / `EPROTO` returned as `err.code` | **EXISTS** | `app-shell.js` `__sgCmdType:'llm'` branch; `tests/unit/vault_ui/loader/test__app_shell_llm_bridge.js` (45 assertions) |
| `available()` is **ungated by design** so an app can degrade before rendering a chat UI; reports `EPERM` honestly instead of lying about the key | **EXISTS** | same test |
| **Budget enforced host-side from the SHARED ledger** — an app's spend and the vault chat panel's spend are one bill; `maxTokens` is **clamped** to policy, never trusted; `models()` is policy-filtered | **EXISTS** | same test (over-budget case counts another surface's spend) |
| Streaming: `{__sgLlmDelta,delta,acc}` × N + terminal reply; coalesced ~50 ms in the host, **tail always flushed**; deltas carry only the increment; terminal reply is authoritative | **EXISTS** | same test (deltas < 1/token, concatenate to the full reply) |
| `cancel(id)` aborts the fetch; settles `EABORT` with partial text; the aborted call is **still recorded and costed** | **EXISTS** | same test |
| HUD notice on first LLM call per app session | **EXISTS** | `_llmNotify` |
| **The API key appears in neither the injected bridge source, any delta frame, nor the reply** | **EXISTS** | pinned by three assertions in the same test |
| Docs: AUTHORING.md "Calling an LLM" + `llm` in the `window.sg` block; `create-vault-apps` SKILL.md capability row | **EXISTS** | `library/guides/vault-html/AUTHORING.md`, `library/skills/create-vault-apps/SKILL.md` |

#### `sg.llm.listen()` — voice input (2026-08-03)

Changelog: `team/comms/changelog/08/03/v0.33.47__changelog__sg-llm-listen-voice-input.md`

| Capability | Status | Evidence |
|------------|--------|---------|
| `sg.llm.listen({maxMs?,model?,prompt?})` → `{text, model, id, durationMs, bytes, format, cost}` — host records, transcribes, returns text. **Audio never enters the app frame** | **EXISTS** | `app-shell.js` `listen` action + `_recordAndTranscribe`/`_transcribe`; `tests/unit/vault_ui/loader/test__app_shell_llm_bridge.js` (63 assertions) |
| **Capture is host-side by necessity and by design** — a null-origin app frame has no `navigator.mediaDevices` (SG/Tools' guide documents the same constraint and assigns capture to the embedder). Host chrome means an app cannot open a mic invisibly | **EXISTS** | `sg-voice.js`, `app-hud.js` `showRecording` |
| Red recording bar — full-width sibling of the chrome row (consent-bar slot), so it renders in **every** `hud.mode` incl. `hidden`/`none`; live timer, Stop & send, Cancel. **Cancel releases the microphone**, not just the bar | **EXISTS** | `app-hud.js` `showRecording`/`setRecordingBusy`/`hideRecording` |
| `sg.llm.listenStop()` / `listenCancel()` / `listening()` (2026-08-03) — an app that renders its own record button can **end the take it started**. The transcript returns through the ORIGINAL `listen()` promise; `listenCancel` rejects it `EABORT` and releases the mic. Same `llm.listen` grant, **no consent prompt** (ending a take is strictly less authority than starting one). `{stopped:false}` when idle, so a defensive stop is safe. The host bar keeps its own Stop/Cancel | **EXISTS** | `app-shell.js` `_listenFinish` + the `listenStop`/`listenCancel`/`listening` actions; `test__app_shell_llm_bridge.js` (79 assertions) |
| One microphone at a time — a second `listen()` while one is in flight is refused `EBUSY` rather than opening a second recorder over the first | **EXISTS** | `_recordAndTranscribe` guard; bridge test |
| `permissions.llm.listen` — **its own grant, never implied by `llm.chat`**; **consent per use** by default (tunable via `permissions.consent["llm.listen"]`) | **EXISTS** | `app-permissions.js`; `test__app_permissions.js` (+4) |
| Reuses SG/Tools `core/sg-audio` (`getBestMimeType`) + `core/sg-audio-decode` (`blobToWav`) by lazy `import()` — **we do not implement recording or audio decoding**. iPad records `m4a` → sent as-is; Chrome records `webm` (not accepted by OpenRouter) → transcoded to WAV | **EXISTS** | `sg-voice.js`; `test__sg_voice.js` (86 assertions) |
| `core/sg-audio` is a **segment** recorder: `startRecording()` **requires** an `onSegment` callback and `stopRecording()` resolves to `undefined` — audio arrives only through the callback. `SGVoice.start/stop` adapts it to one-take capture (collect segments → single `Blob`, long timeslice so a normal take is one segment) | **EXISTS** | `SGVoice.start`/`stop`; `test__sg_voice.js` runtime suites use a stand-in carrying the real module's guard |
| `SGVoice.cancel(session)` — releases the microphone **and** discards the audio; also stops the tracks itself, because `sg-audio.stopRecording()` early-returns for an already-stopped session without touching them | **EXISTS** | `SGVoice.cancel`; both cancel paths (`vault-llm-chat._stopVoice(true)`, `app-shell._recordAndTranscribe`) call it |
| A silent take throws `ENOAUDIO` rather than billing a transcription call on zero bytes | **EXISTS** | `SGVoice.stop`; `test__sg_voice.js` |
| **Auto-picked model tries NAMED models first** — `anthropic/claude-sonnet-5`, then opus-5, sonnet-4, `google/gemini-3.5-flash`, `openai/gpt-5`. Matching only on the vendor prefix against an alphabetically sorted id list picked `anthropic/claude-3-haiku` — the oldest model on the key, and not a vision model, so a vault with no configured default could not read a pasted screenshot. An explicit `models.default` and `models.allow` still win | **EXISTS** | `SGLlmConfig.PREFERRED_MODELS`/`pickModel`; `test__sg_llm_config.js` (53 assertions) |
| Changing the model in the picker clears the stale "Using X — no default set" notice and re-checks image capability | **EXISTS** | `vault-llm-chat.js` model-select handler |
| **Pasted / dropped screenshots in the chat panel** — image chips with thumbnails, sent with the **next message only** (stated in the UI; a file stays attached, an image would otherwise silently re-send and re-bill every turn), shown in the transcript. The paste handler only claims the event when the clipboard holds image FILES, so pasting text still works | **EXISTS** | `vault-llm-chat.js` `addImages`/`removeImage`/`_warnIfModelCannotSee`; `sg-vision.js`; `test__vault_llm_chat.js` (122 assertions), `test__sg_vision.js` (62) |
| **Vision capability is read from the LIVE catalogue** (`architecture.modality` / `input_modalities`, which `SGLlm.models()` already returns verbatim) — not a hard-coded list that goes stale. `text->image` is a GENERATOR and is correctly refused as a reader. When images are present and no catalogue is cached, the host **fetches one** rather than guess from the short fallback | **EXISTS** | `SGVision.supportsImages`/`modalityAllowsImages`; `app-shell.js` `_llmModelMeta` |
| `sg.llm.chat` accepts `image_url` parts from apps — model capability and byte ceiling enforced **host-side**, not left to the app. `sg.llm.imagePart(blob\|bytes\|dataURL)` runs in-frame so authors never reimplement the chunked-base64 bug (8190, not 8192) | **EXISTS** | `app-shell.js` `_llmCountImages`/`_llmMaxImageBytes`; `test__app_shell_llm_bridge.js` (96 assertions) |
| **Ledger bug fixed** — `promptChars` counted `typeof content === 'string'`, so an image-bearing message logged **zero**: the priciest calls read as the cheapest. Images are their own count (`VaultLlmLog.images`), shown in the requests pane, never folded into the char total | **EXISTS** | `SGVision.promptChars`; `vault-llm-log.js`; `vault-llm-requests.js` |
| **Auto-pull no longer applies itself (2026-08-03, after real data loss).** `vault-shell._checkAndAutoSync` merged + `_mountBrowse()`, and `app-shell._checkBehind` fast-forwarded + `_remountCurrent()`, the moment a background check saw a new published head — discarding unsaved editor/app state with no prompt. Detection stays; applying is a click: the existing `Sync now →` banner on `/vault`, a `⟳ New version available` HUD chip on `/app` (`showUpdate`/`hideUpdate` → `applyPendingUpdate`). Auto-pull survives as `localStorage['sg-vault-autopull']`, **default OFF**; auto-PUSH is unchanged and still on (its failure mode only preserves work) | **EXISTS** | `vault-shell.js` `_autoPullEnabled`/`setAutoPull`, `app-shell.js` `applyPendingUpdate`, `app-hud.js` `.hud-update-btn`; `tests/unit/vault_ui/loader/test__no_auto_reload.js` (27 assertions) |
| Recording is styled in the **accent teal**, not red. Both surfaces already spend red on failure (`.vlc-msg--err`, `.hud-msg--error`), so an alarm colour for a working microphone read as something going wrong. Visibility comes from a filled chip, a slow pulse and the words | **EXISTS** | `.vlc-status--rec`/`.vlc-mic--rec`; `.hud-rec-bar`/`.hud-rec-dot`/`.hud-rec-stop` |
| **AI Chat is available on `/en-gb/app/` (SG/App) too**, as host chrome: a `✨ AI` HUD button opens the same `<vault-llm-chat>` + `<vault-llm-requests>` panels in that page's `#app-layout`. Runs at the REAL origin, so it holds the vault key and the microphone directly — **the sandboxed app frame is never involved and needs no `permissions.llm.*`**. Gated by `hud.show.llm` (on in `full`, off in `minimal`) | **EXISTS** | `en-gb/app/index.html` (`#llm-host` parking bay + wiring), `app-hud.js` `.hud-llm-btn` → `app-hud:llm`, `app-hud-config.js` `llm` flag; `tests/unit/vault_ui/loader/test__app_page_llm_panels.js` (46 assertions) |
| **`LlmPanels`** — the mount/park bookkeeping, shared by `/vault` and `/app` rather than copied. Holds a hard element reference (sg-layout detaches before it emits `panel:closed`), parks into a fallback container, `detachAll()` for a destructive `setLayout()`. `vault-shell` delegates to it | **EXISTS** | `_common/js/lib/sg-llm/llm-panels.js`; `test__app_page_llm_panels.js` + `test__vault_shell_llm_panels.js` |
| `app-shell:ready` carries the open `vault` for host chrome at the real origin. The embed forwarder still copies **named fields only** into its cross-origin `postMessage`, so the vault object never leaves the page | **EXISTS** | `app-shell.js`; asserted in `test__app_page_llm_panels.js` |
| **Debug-pane toggle no longer destroys the transcript** — `layout.setLayout(_layoutCfg)` rebuilds the tree and unmounts everything not in the config, including panels added via `addPanel()`. The page parks the AI panels first and re-shows whichever were open | **EXISTS** | `en-gb/app/index.html` `app-debug:toggle`; asserted from source |
| **Transcription uses an audio-capable model, never the vault's chat model.** Default `google/gemini-3.5-flash`; list mirrored from SG/Tools `audio-transcribe/api/audio-models.js` (chat `input_audio` path only). A non-audio `model` is refused with `EMODEL` naming a working one, instead of OpenRouter's model-less `404 No endpoints found that support input audio`. The vault's `models.allow` still applies on top | **EXISTS** | `SGVoice.AUDIO_MODELS`/`DEFAULT_AUDIO_MODEL`/`isAudioModel`; `test__sg_voice.js` |
| Transcription goes through the **same** `SGLlm` client, model allow-list, spend caps and `VaultLlmLog` — voice spend is not a separate untracked bill | **EXISTS** | `_transcribe` |
| **Mic button in the native vault chat panel** (`/vault` → AI Chat composer) — tap to record, tap ■ to stop; transcript lands in the input and is sent. Runs at the REAL origin so it holds the mic directly (no bridge). Recording state stated in words, not just an icon. Cancel releases the device. Empty/whitespace transcript never sends | **EXISTS** | `vault-llm-chat.js` `toggleVoice`/`_stopVoice`/`_renderMic`; `test__vault_llm_chat.js` (93 assertions) |
| Both surfaces share `SGVoice.transcribeWith(session, audio)` — one implementation of model policy, spend caps and the ledger entry (two copies of a budget check is how a cap stops meaning anything) | **EXISTS** | `sg-voice.js`; `app-shell._transcribe` delegates |
| Base64 chunked at **8190** (not 8192 — `8192 % 3 === 2` emits `=` padding mid-string; the same bug shipped once at v0.33.21) | **EXISTS** | `SGVoice.bytesToBase64`; boundary cases in `test__sg_voice.js` |
| **Audio redacted from the provenance log** — `redactMessages` now handles `input_audio` (it only knew `image_url`), keeping `format` for diagnosis | **EXISTS** | `sg-llm.js`; bridge test |

**Limits:** **not verified on a real iPad** (format logic is unit-tested; no device run yet).
Runtime dependency on `dev.tools.sgraph.ai` for the two audio modules (override via
`window.SG_TOOLS_BASE`), so voice does not work in `SGSend.staticMode`. No streaming/partial
transcript — one take, one result.

**Still NOT BUILT (PROPOSED):**
- **CSP egress lockdown (plan §7)** — app frames are not served with a restrictive `connect-src`,
  so an app can still reach a provider directly with its *own* key. The bridge protects the
  **vault's** key; it is not yet a boundary against all egress. This is the gap between a
  convenience and a guarantee.
- **Phase 4 minted credentials** — the vault still stores a real key, so sharing a vault shares
  the ability to spend it.
- **ViV kernel parity** — `/en-gb/app/` only; nested kernels (`kernel-app-handlers.js`) do not
  relay `sg.llm.*`.
- Per-app limit overrides are read (`limitsFor(policy, appId)`) but no UI writes them.
- `permissions.network` is parsed but still unused.

### Vault Settings — AI (OpenRouter) config + read-only share block (2026-08-02)

Admin surface for the PROPOSED `sg.llm.*` capability (plan:
`team/roles/architect/reviews/08/02/v0.33.43__architect-review__sg-llm-kernel-capability-plan.md`).
The **bridge verbs themselves do not exist yet** — this ships only the configuration UI and its
policy module.

| Component | Status | Evidence |
|-----------|--------|---------|
| `_common/js/lib/sg-llm/sg-llm-config.js` — pure policy module: `parse` / `serialize` / `modelAllowed` (`*` and `vendor/*` globs) / `defaultModel` / `limitsFor` (per-app override) / `looksLikeKey` / `redact` / `summarise`. Safe-by-default: junk or absent config → `keyTier:'owner'`, allow-`*`, default limits; the two key tiers are mutually exclusive on parse | **EXISTS** | `tests/unit/vault_ui/loader/test__sg_llm_config.js` (38 assertions) |
| **Vault Settings → "AI models (OpenRouter)"** — key entry (password field, cleared from the DOM after save), *Test* (validates against `GET /models` from the real origin), *Save*, *Clear*; advanced block: key tier, default model, allow-list, per-session cost/call caps | **EXISTS** | `vault-settings.js` `_saveLlm`/`_clearLlm`/`_testLlm`/`_refreshLlm` |
| Config persisted at **`.vault/llm/config.json`** — inside the permission floor, so no app can read it via the bridge under any grant (`AppPermissions.isFloor`). Written through `SGVault.addFile`/`updateFile` from the real origin; `.vault` lazy sub-tree expanded first (`_ensureVaultSubtree`) | **EXISTS** | `vault-settings.js` `_readLlmConfig`/`_writeLlmConfig` |
| **Key tiers** — `owner` (default): key sealed via `SGVaultOwnerSecrets.deriveKey(vault.writeKeyHex)`, so an ro-token session (no write key) can neither use nor extract it; `shared` (opt-in): key stored in clear in the same file, usable *and extractable* by any opener | **EXISTS** | `vault-settings.js` `_saveLlm`; `sg-vault-owner-secrets.js` |
| **Vault Settings → "Read-only access (share these together)"** — vault id, the combined `readkey:vaultid` value (the single form `sgit clone` accepts), and a ready-to-paste `sgit clone "…"` command, each with its own copy button | **EXISTS** | `vault-settings.js` `refresh()` + `.vset-copy-vaultid`/`-rokey`/`-roclone` |
| `sg-vault-owner-secrets.js` + `sg-llm/sg-llm-config.js` added to the script sets of `v0.2.3/index.html` and `en-gb/browse/index.html` | **EXISTS** | both pages |

### App-Mode Click Interceptor Fixes + `sg.vfs.download` (2026-07-31)

Shipped in `app-shell.js` / `app-hud.js` / `app-permissions.js` (bundle regenerated); unit
pins in `tests/unit/vault_ui/loader/test__app_shell_bridge_build.js`. Follows the architect
review `team/roles/architect/reviews/07/30/v0.33.43__review__in-app-nav-click-interceptor-proposals.md`
(proposals 3, 1, 2 adopted; 5a/4/5b remain PROPOSED).

- **Interceptor opt-out (proposal 1).** The injected click interceptor returns early when
  `e.defaultPrevented` is set (window-capture app listeners win) or the anchor carries
  `data-sg-native`. Applies to every branch (vault-nav and external).
- **Bare-`#` anchors claimed (proposal 2).** `<a href="#id">` clicks are now
  `preventDefault`-ed and scrolled in-frame (`getElementById` → `scrollIntoView`); a miss is
  a no-op. Previously the browser default re-navigated the null-origin srcdoc frame to the
  host entry page (vault-key screen). No `stopPropagation` — app listeners still see the event.
- **`location.hash` miss-fallback removed (proposal 3).** The `__sgVfsScrollToHash` listener
  no longer assigns `location.hash` when the target id is missing (that assignment was a
  cross-document re-navigation in srcdoc frames — live bug). A miss is now a no-op.
- **`sg.vfs.download(path, {filename?})`** — host-fulfilled save-to-device. Bytes take the
  same guarded read path as `vfs.read` (floor → mounts → `fs.read` grant); the `<a download>`
  click runs in the host document, so the app sandbox needs no `allow-downloads` token.
  Consent: one-click HUD confirm per file (`app-hud.promptDownload`, reuses the extlink bar
  with download copy; dismiss rejects `'Download not approved'`); `app.json`
  `permissions.downloads: true` (new grant, default-deny, parsed in `app-permissions.js`)
  makes saves frictionless. Blob URL revoked after 60 s. Filename: caller override or
  basename, separator/control-char-sanitised, 200-char cap.
- **`sg.ui.preview(path)`** (same day, follow-on) — host-rendered quick-look overlay
  (`app-shell._openHostPreview`/`_closeHostPreview`). Permission chain is exactly
  `vfs.read`'s (floor → mounts → `fs.read`); **no grant, no confirm** — consent gates
  effects that outlive the page (writes/downloads/popups), not ephemeral display of
  readable content. Renders at the REAL origin, which is what makes PDFs work: verified
  empirically (headless-Chromium screenshot matrix, 2026-07-31) that Chromium blocks its
  PDF viewer inside the sandboxed app frame while identical blob-iframe markup renders
  unsandboxed. Kinds: pdf (blob iframe), image, video, audio, text (`<pre>`), binary
  (notice → use download). Host DOM overlay (app can't draw/dismiss it; user closes via
  ✕/Escape/backdrop), one-at-a-time, blob URL revoked on close. Returns
  `{ok, path, type, bytes}`; errors mirror `vfs.read`. Pins in
  `test__app_shell_bridge_build.js` (24 assertions total incl. jsdom overlay behaviour).

### SGit View — Commit Detail + Diff (2026-06-15)

The `<vault-sgit-view>` History tab (`vault-sgit-view--history.js`, two-track diverged graph)
gains a **"diff" link** on every commit row → a first-class **commit-detail screen**
(`vault-sgit-view--commit.js`) with:
- **Changed-files list** — set-diff of the commit's tree vs its first parent's, flattened to
  `Map<path, content_hash>` and compared by hash. **Zero blob reads** (the hash is already in
  the decrypted tree entry): added / modified / removed, with free byte-size deltas from tree
  entry sizes. Sorted added→modified→removed.
- **Per-file unified diff** — lazy (blobs read + `read_key`-decrypted only on expand), rendered
  as `@@` hunks with +/− gutters. Binary (non-UTF-8) and over-cap (>2000 lines/side) files are
  flagged, not diffed.
- **Copy patch** — assembles a git-style unified diff across all changed files.
- Diff engine is a pure, DOM-free `SgitDiff` (`sgit-diff.js`, LCS → hunks) — **18 unit tests**
  (`test__sgit_diff.js`); commit-view runtime verified via jsdom smoke (tree-flatten → change
  list → lazy diff → collapse, root-commit-all-added). Merge commits diff against `parents[0]`.
  RO-token sessions (no `read_key`) can't decrypt → no diff. Loaded on `index.html` +
  `en-gb/browse/index.html`; not in the kernel bundle.

### Other Vault UI Improvements (05/25–26)

| Feature | Status | Commit |
|---------|--------|--------|
| Vault header status pill (Synced / ↑N / ↓N / Diverged / Read-only states) | EXISTS | `00cb59b` |
| Access-key entry with `GET /api/transfers/check-token/{key}` validation | EXISTS | `00cb59b` |
| File actions (Upload/New File/New Folder) moved to tree panel | EXISTS | `4916fca` |
| Deterministic RO-token ID resolution | EXISTS | `ab3d570` |
| `sg.history.*` API + sub-vault transparency for apps | EXISTS | `e67fc95` |
| Write access token threaded for in-app writes | EXISTS | `0a7dc2c` |
| `HTMLImageElement.prototype.src` patched to serve vault images via bridge | EXISTS | `1b6b621` |
| Vault key per-tab isolation; access token stays shared across tabs | EXISTS | `d22f720` |
| App Mode honours requested file over default app | EXISTS | `a7a8c2e` |
| Opened file persisted in URL (`#path`) — reloads and links work | EXISTS | `fc13d2c` |
| Markdown files render in App Mode (MarkdownParser.parse not new MarkdownParser) | EXISTS | `e669a2a` |

### ViV (Vault-in-Vault) Kernel Architecture — v0.2.3 (2026-05-28/29) + Phase 3–5.1 (2026-05-29)

Phase 1 (SecureChannel) + Phase 2 (spawn + cross-vault write) + Phase 3 sub-step C prep (sg-app-stub) shipped in the first session. 10 bugs fixed (H1, M1–M6, L1, L3, L4). Phase 3 security gate (null-origin) + B4–B10 mandated invariants + KernelParent shipped before the 05/29 librarian session. Phase 4 (AppFrameBootstrap) + Phase 5.1 (VivAuditView) shipped after.

**335+ jsdom-free assertions total across the ViV loader suite (17 test files), all green.**

| Module | Purpose | Status | Tests |
|--------|---------|--------|-------|
| `secure-channel-envelope.js` | Pure WebCrypto P-256 envelope: pack/unpack, ECDSA sign, ECDH-AES-GCM encrypt, ReplayGuard, mixed payload (Uint8Array+JSON) | **EXISTS** | 29 |
| `secure-channel.js` | Port-anchored authenticated channel: create/accept/request/send; K1 one-use bootstrap key; directional rule; cid check | **EXISTS** | 14 |
| `kernel-mounts.js` | `KernelMounts`: longest-prefix mount table with traversal-collapse | **EXISTS** | 13 |
| `kernel-broker.js` | `KernelBroker`: per-kernel sidecar; mediate/finalize (concurrent-safe entryId); policy (auto/ask) | **EXISTS** | 22 |
| `kernel-app-handlers.js` | `registerKernelVfsHandlers`: two-sided capability gate; AppPermissions.isFloor/can; _safePush EUNREACH | **EXISTS** | 24 |
| `kernel-bootstrap.js` | `bootKernelOnPort`: testable bootstrap (handshake → vault.open → register); reads endpoint from secrets | **EXISTS** | 13 |
| `sg-app-stub.js` | Secret-less app-side `window.sg.*` stub; every method is SecureChannel.request to kernel. Phase 3C prep. **Wired into _buildAppSrcdoc via Phase 3 + Phase 4 AppFrameBootstrap.** | **EXISTS** | 13 |
| `kernel-shell-bundle.js` | AUTO-GENERATED: 191 KB self-contained null-origin srcdoc kernel bundle | **EXISTS** | 1 freshness |
| `scripts/build-kernel-shell-bundle.py` | Build script for kernel-shell-bundle.js; --stdout flag for freshness check | **EXISTS** | — |
| `vault.mount` capability in `app-permissions.js` | vault.mount capability key: parse + can() | **EXISTS** | 6 |
| VIV relay branch in `app-shell.js` | `_mountChildVault`, `_handleVfsViv` (read+write+list relay), vault bridge actions | **EXISTS** | 16 relay |
| `kernel-parent.js` | Parent-side peer to kernel-bootstrap; spawn/handshake child kernel; relay operations; monitorChild (B7); endpoint reads from secrets (M5 fix) | **EXISTS** | 44 |
| `viv-mounts-view.js` | Pure view-model for mount table + broker log (B4): mountRows/logRows/summary/outcomeClass/credTag | **EXISTS** | 33 |
| `app-debug-mounts.js` | `<app-debug-mounts>` debug pane Mounts tab component; reads vivProvider(); re-renders on bridge-call events | **EXISTS** | — |
| `viv-credential-tiers.js` | B5/B6 credential tier gate: TIERS enum; requiredTierFor; meets; fail-closed gate() → EUNDERPRIVILEGED; unknown verbs → highest tier; gate in relay() before mediation | **EXISTS** | 28 |
| `viv-monitor.js` | B7 monitor mode: MODES.CLOSED (default) / OPT_IN; registerOnChannel | **EXISTS** | 20 |
| `viv-custody.js` | B10 custody gate: fail-closed; unknown custodians → EUNSAFE_CUSTODY; wired into relay() | **EXISTS** | 33 |
| `app-frame-bootstrap.js` | Phase 4 Option A: pure DOM-free srcdoc builder for all 4 iframe contexts (app/html/page-layout/markdown); `AppFrameBootstrap.build({kind, …})`; all 4 mount methods wired | **EXISTS** | 32 |
| `viv-audit-view.js` | Phase 5.1 cross-kernel audit aggregation: aggregate/filterLog/groupLog/facets/sourceRows; consent-honest (CLOSED→no log; grandchildren unreachable) | **EXISTS** | 37 |
| `app-debug-audit.js` | `<app-debug-audit>` Audit tab in /app debug pane; async vivAuditProvider (KernelParent.monitorChild); coalesced re-fetch | **EXISTS** | — |

**Phase 3 (Security Gate): CLOSED** — commit `f534b27` + `1b5b6b1`. All 4 `app-shell.js` mount sites now `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`); content via `srcdoc` not `blob:`. **SEC-VIV-001 is resolved.** Probe suite: 30 Playwright assertions, 0 failures.

**App-error surfacing re-spec (Phase 4):** Null-origin frames self-report errors via `postMessage({type:"sg-app-error"}, "*")`. Parent shows persistent toast via `<app-hud>.showMessage()`. Browser-verified via probe P5.

**Known deferred bug (L2):** `Envelope._canonicalParse` treats any `{__u8: "<string>"}` as bytes. Edge case; fix deferred to Phase 6 with `{__u8b64}` tag.

**Vault-Embed postMessage Handshake (SHIPPED — 07 June 2026, commit `3b30347` + follow-ups):**

Opt-in embed flow for running a vault inside a foreign iframe without exposing the vault key in URL history, localStorage, or sessionStorage. Activated via `?embed=1` on the vault app URL.

Protocol (3-message handshake):
- iframe → parent: `{ sg: 'vault-embed-ready', v: 1 }` (fired on load)
- parent → iframe: `{ sg: 'vault-open', key, mode?, deepLink? }` (one-shot, listened once)
- iframe → parent: `{ sg: 'vault-ready', vaultName, fileCount, hasApp }` (fired on mount)

**New module `embed-protocol.js`** (pure/DOM-free, ~110 lines, loaded before `app-shell.js`):
- `isEmbedMode` / `getExpectedParentOrigin` / `validateSource` / `parseOpenMessage` / `readyMessage` / `vaultReadyMessage`
- `globalThis.EmbedProtocol`

**`app-shell.js` changes:**
- `_init`: early-out to `_initEmbed` when `?embed=1` (before any localStorage read)
- `_initEmbed`: posts `vault-embed-ready`, listens one-shot for `vault-open`, opens via `_initWithKey` in memory, forwards `app-shell:ready` as `vault-ready` to parent; cleans up on `disconnectedCallback`
- `_initWithKey`: localStorage/sessionStorage persistence skipped when `this._embedMode` is true
- `_embedDeepLink`: deepLink stored on instance memory (not sessionStorage — avoids SecurityError in null-origin iframes, fix `84ba117`)
- `_setCachedAccessKey`: early-return on `this._embedMode` (fix `159ec76`)
- **null-origin `replaceState` guard (2026-06-15):** the "key never stays in address bar" `history.replaceState` in `_initWithKey` was unguarded. When the EMBEDDING parent is itself a null-origin sandbox (vault-in-vault — a vault HTML app embedding another vault), sandbox propagation forces THIS frame to an opaque origin, and `replaceState` to the resolved absolute URL throws "Domains, protocols and ports must match". That threw mid-`_initWithKey`, BEFORE `app-shell:ready` → `vault-ready` was never posted → the parent's handshake timed out (the vault opened but appeared to hang). Now skipped in embed mode + try/catch (matches the hash-cleanup `replaceState` in `_init` and the nav-history one). Real-origin parents were unaffected (the embedded frame got a real origin), which is why it worked in non-nested embeds.

**Security properties (embed mode):**
- Key in memory only — never touches localStorage or sessionStorage
- Reload re-triggers the handshake (forced re-auth, no persistence)
- One-shot listener: removed after first valid `vault-open` message
- `event.source === window.parent` check rejects sibling iframes
- `?parent=<origin>` optional validation; accepts any origin including `null` when not specified

**`sg.vault.embed(mountEl, key, opts?)` — one-call parent helper (2026-06-15):** collapses the whole hand-rolled handshake (the ~70-line copy-paste helper + 6 rules + 4 gotchas an agent had to rediscover) into a single bridge call available to every app. Creates the iframe, omits `&parent` when the embedding app is opaque-origin (the `parent=null` hang), posts `vault-open` to the right target, source-pins inbound, resolves on `vault-ready` → `{vaultName,fileCount,hasApp,iframe}`. **Least-privilege sandbox:** defaults to **`allow-scripts` only**; **refuses `allow-same-origin` and `allow-popups-to-escape-sandbox` even if requested** (narrow opt-ins `forms`/`popups`/`downloads`/`modals` via `opts.sandbox`). The src-build + sandbox-sanitise logic lives in pure `sg-embed-helpers.js` (`SgEmbed`, **17 unit tests** in `test__sg_embed_helpers.js`) and is injected **verbatim** into the bridge via `Function.toString` (`app-shell.js:_embedHelperSrc`) — the shipped code is the tested code. Full glue verified via jsdom round-trip (build iframe → embed-ready → vault-open → vault-ready → resolve). Loaded on `/en-gb/app/`; not in the kernel bundle. The author guide (`AUTHORING.md` → "Embedding another vault") now prescribes this one-liner; the hand-rolled version is the anti-pattern.

**App-frame sandbox hardening — least-privilege external links (2026-06-15):** host app frames (`_mountApp`/`_mountVaultFile`/`_mountPageLayout`, all via new `_appSandbox()`) dropped from `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox` to **`allow-scripts allow-forms`** by default — **no escape-sandbox**. External `<a href>` clicks now post `{__sgOpenExternal:url}` to the host (`_promptExternalOpen`, http/https only — rejects `javascript:`/`data:`), which shows a one-click "Open `<url>` ↗" confirm in `<app-hud>` (`promptExternalLink`, full-width sibling bar — works in all hud modes) and opens it in the **host's** gesture (Option D — no escape-sandbox needed + an external-nav consent moment). An app declaring `permissions.externalLinks: true` (new grant, default-deny) gets `allow-popups allow-popups-to-escape-sandbox` back + frictionless in-frame `window.open` (Option C). `sg.vault.embed` is unaffected (already `allow-scripts` only). Kernel bundle regenerated (app-permissions.js bundled). Tests: `test__app_permissions.js` +4 (43 total) for the grant; jsdom smoke for `_appSandbox`/`_promptExternalOpen`/HUD bar. Doc: `AUTHORING.md` "What the host does for you" + `team/comms/briefs/06/15/vault-in-vault-followups-and-sandbox-hardening.md`.

**Browser-verified:** Full handshake + deep-link routing + storage isolation + sandboxed iframe all tested (see qa/index.md).

**`sg-vault-object-store.js` sandbox safety (fix `d5f6f0a`, 07 June 2026):** `typeof caches` guard moved inside the `try` block in both `_cacheGet` and `_cachePut`. The `window.caches` accessor throws `SecurityError` in sandboxed iframes without `allow-same-origin`, causing vault-open to fail on the first immutable-block read. Moving the guard inside the `try` allows the existing catch to take the documented network-fallback path. `kernel-shell-bundle.js` rebuilt (`8bccfdc`). Regression test added (see qa/index.md).

**Vault UI favicon (fix `cdb0072`, 07 June 2026):**
- `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/favicon.ico` — NEW, 211 bytes, 32×32 PNG-in-ICO, brand palette (dark navy + teal S-curve + red slash)
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` + `<link rel="icon" sizes="32x32" href="/favicon.ico">` added to `index.html`, `en-gb/index.html`, `en-gb/app/index.html`, `en-gb/browse/index.html`, `en-gb/preview/index.html`
- Resolves 403 on `/favicon.ico` in browser devtools console

**Null-origin localStorage crash fix (11 Jun 2026 — `vault-entry.js`, `vault-loader-storage.js`, `index.html`, commit `b3987ba3`):**
A parent vault opening a child via the embed protocol mounts it in a sandboxed iframe (no `allow-same-origin`). `vault-entry.js:41` was reading `sessionStorage` without try/catch — this threw synchronously, crashing `VaultEntry.onReady` before saved-key auto-open ran. Three fixes: (1) `vault-entry.js` wraps the endpoint read; (2) `index.html` creating-splash IIFE wraps `sessionStorage.getItem`; (3) `vault-loader-storage.js` adds `VaultLoaderStorage.available()` — a cached feature-detect so UI code branching on storage (recents, "remember me") can hide cleanly without re-implementing try/catch in every callsite. Test coverage: `test__storage.js` null-origin survival suite — substitutes a throwing `localStorage`/`sessionStorage`, asserts every getter returns null and every setter is silent.

---

## PROPOSED

Full list: [proposed/index.md](proposed/index.md)

- **Upload UX redesign** — 3-step flow (upload→distribution→credentials), 3 sharing modes, 10GB limit
- **Gallery editor** — per-image comments, multi-language, layout customisation, rich preview
- **v0.3.0 deferred issues** (47 items) — post-release bug backlog from the v0.3.0 launch
- **Vault upload beta** in main SG/Send UI — integrate vault-push into upload wizard
- **Room + Vault pages** migrated to v0.4.0 IFD architecture (currently on v0.3.x legacy)
- **P-248: Sub-vaults CLI access** — clone-within-clone for sgit; storage tracking; nested clone resolution. Source: doc 490, 05/25 briefs.
- **P-249: Talk to the vault** — in-vault chat with tool-calling; vault-aware; read-write to self-contained vault; infographic generator + file tools; right-hand pane; user's own OpenRouter key. Arch pack at `library/sgraph-send/dev_packs/vault-chat/`. Source: doc 493, 05/25 briefs.
- **App-Mode Phase 5: vault.delete (P-255)** — deferred pending owner-secret credential tier + AppSec sign-off.
- **App-Mode Phase 6: reads default-deny** — `READ_DEFAULT` flip once apps declare `fs.read` in `app.json`.
- **P-250: sg.vault.mount() assembled API** — user-facing call composing KERNEL_SHELL_HTML → iframe → SecureChannel → secrets → mount registration. Pieces exist; not assembled into single entry point. ~80 lines.
- **P-251: sg.vault.unmount()** — close channel, remove mount, leave broker log. ~15 lines.
- **P-252: HUD `ask` broker policy prompt** — HUD consent UI for cross-vault write authorisation. `app-hud.js` extension needed.
- **P-253: Mounts list / broker log UI on /vault** — Mounts panel showing each BrokerEntry. `KernelBroker.log()` exists; no UI consumer.
- **P-254: Per-request elevation / credential tiers** — three tiers (none, standing-ro, perRequest-rw); needs schema + issuance + child-side consumer.
- **P-256: Monitored-mode child visibility** — parent can read child's broker log (debug only, must show 👁 MONITORED badge).
- **P-257: Phase 0.5 CORS operational verification** — CDN cache invalidation + CloudFront Origin forward + real-browser null-frame round-trip to dev.send.sgraph.ai.
- **P-258: Phase 2 §7 browser end-to-end** — clinician console writes to patient vault; broker logs invocation; patient vault shows bytes. Needs two dev vaults.
- ~~**P-259: Phase 3 null-origin security gate**~~ → **SHIPPED** (commit `f534b27`). SEC-VIV-001 closed. See ViV section above.
- **P-260: Phase 4 Option B — /vault HTML view + edit preview on SecureChannel kernel** — AppFrameBootstrap (Option A) SHIPPED. Remaining: promote /vault HTML view + edit preview from postMessage bridge to SecureChannel kernel (full kernel unification).
- **P-261: Phase 5 remaining consumers** — VivAuditView core + Audit tab in /app SHIPPED (Phase 5.1). Remaining: standalone vault-in-vaults audit page (BLOCKED by design — broker logs in-memory per-document); tree-view-expand-as-mount; CLI/REPL.
- **P-262: Phase 6 hardening** — SecureChannel everywhere; monitoring-mode badge; optional curve upgrade (P-256 → X25519/Ed25519).
- **P-263: Vault Chat full architecture** — LLM chat as iframe sibling to Vault App; context layers inspector; tool-execution control; history-as-files; end-of-chat zip-to-vault. Arch: docs 505–506 (05/26 briefs).
- **P-264: VFS (Virtual File System) as LLM working memory** — client-side in-memory FS distinct from vault FS; every message/response stored as VFS file; optional sync to vault; self-pruning tool (LLM consolidates to VFS, drops detail from live context).
- **P-265: Commit Queue — timer-windowed batch commits** — vault-shell batching mechanism; configurable window (0=off, 10-15s default); staging area; debug tab; solves many-files explosion from Vault Chat VFS sync.
- **P-266: Sidecar LLMs** — parallel LLM instances for memory curation, security checks, consolidation; enable/disable per type; multi-LLM consensus mode.
- **P-267: Security Report vault demo** — simulated pen test findings as a vault; audience-specific Vault App views; evidence graph; positive scorecard; retest scripts. Requires Vault Chat (P-263).
- **P-268: VC Confidential Data vault demo** — 6 VC scenarios (inbound data room, memo, deal folder, IC materials, LP reporting, fund raise); scoped to exclude ViV for initial demo.
- **P-269: Presigned-PUT large-write path for `sg.vfs.write`** — lift the ~3 MB `sg.vfs.write` ceiling (Lambda URL 6 MB hard cap). Server: `POST /api/vault/presigned/write-url/{vaultId}/{filePath}` (mirrors read presigned endpoint; write-key auth; scoped to `bare/data/obj-cas-imm-*` blobs only). Client: `sg-send.js` + `sg-vault-object-store.js` `vaultWriteLarge()`. Memory-FS fallback: `presigned_unavailable` → continue with batch write. sgit CLI unaffected (already direct-PUTs). Scoped brief: `team/comms/briefs/06/11/v0.33.21__brief__vault-presigned-put-large-write.md`. Estimated ~half-day end-to-end.
- ~~**Open item — send-browse v0.3.3 `_write` encoder chunk bug**~~ — **FIXED 2026-08-03.** `send-browse--v0.3.2.js` (user v0.3.3) and `send-browse--v0.3.3.js` (open v0.4.0) both chunked base64 at 8192 in the injected `sg.vfs.write` bridge. `8192 % 3 === 2`, so each separately-encoded slice emitted `=` padding **mid-string** and `atob()` accepts `=` only at the end. The parent-side handler catches the decode failure and replies `Bad encoding`, so the write **failed loudly rather than corrupting** — but the effect was that **no write over 8 KB was possible from the /vault preview pane**, a ceiling that pushes app authors into splitting files into parts. Now 8190 (= 3×2730). Guarded repo-wide by `tests/unit/vault_ui/loader/test__base64_chunk_guard.js`, which fails with file:line if any chunked base64 encoder uses a size not divisible by 3 — this bug had shipped three times in three files. **Deploy note:** these files are served from `dev.send.sgraph.ai`, so the fix ships via the **user/open UI pipelines**, not the vault one.
