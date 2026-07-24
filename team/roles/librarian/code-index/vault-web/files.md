# Vault Web — File Catalogue

**Part of:** [Vault Web Code Index](index.md) | **Version:** v0.33.44 | **Last updated:** 2026-07-24
**Maintained by:** Librarian

Per-file catalogue of the active Vault Web tree. All paths relative to
`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/` unless stated otherwise.

**Verified facts (2026-07-24):**
- **No inline TODO/FIXME/HACK comments exist anywhere in the tree.** Open work is tracked in
  docs, not code comments — see [todos.md](todos.md). Long design-rationale block comments are
  the house style (e.g. batch-rollback note in `sg-vault.js _withBatch`).
- **No `sg-inbox*.js` files exist** — the inbox concept was renamed to "append"
  (`_common/js/lib/sg-append/`). The wire prefix `sg-inbox-enum:` and body field `inbox` are
  deliberately preserved as server contracts.
- `composite-data-source.js` lives in `_common/js/adapters/`.

---

## 1. `_common/js/lib/sg-vault/` — core encrypted vault engine

Global: **`SGVault`** (class in `sg-vault.js`; four companion `sg-vault--*.js` files extend
`SGVault.prototype` via IIFE and MUST load after it; `--history.js` also needs `--sync.js`).
Helper classes: `SGVaultCommit`, `SGVaultCrypto`, `SGVaultObjectStore`, `SGVaultRefManager`,
plus global object `SGVaultOwnerSecrets`.

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `sg-vault.js` | 530 | `class SGVault` | Core vault: lifecycle, key mgmt, in-memory tree, commit machinery, two-ref model (named `ref-pid-muw-*` + clone `ref-pid-snw-*`). Vault key format `{passphrase}:{vault_id}`. Reconcile-on-open (clean-behind clone loads named head). | Static `create`/`open`/`openReadOnly`; getters `vaultId`/`name`/`writable`/`writeKeyHex`/`aheadOf`; `getVaultKey`, `readKeyRawBytes`, `setName`, `getStats`; internals `_findNode`, `_withBatch`, `_commit`, `_buildTreeEntries`, `_loadTreeFromCommit`, `_loadSubTree` |
| `sg-vault--sync.js` | 436 | extends prototype | Sync + merge: push/pull (fast-forward only), ahead/behind counts, three-way file-level merge with `_conflict` copies. | `getAheadCount`, `getBehindCount`, `push`, `pull`, `merge`; internals `_isAncestor`, `_findCommonAncestor`, `_mergeFileMaps`, `_commitMerge` |
| `sg-vault--file-ops.js` | 157 | extends prototype | File CRUD; every op batched into one `POST /batch`. | `addFile`, `addFiles`, `updateFile`, `getFile`, `removeFile`, `renameFile`, `moveFile` |
| `sg-vault--folder-ops.js` | 125 | extends prototype | Folder CRUD + lazy sub-tree loading. | `createFolder`, `listFolder`, `removeFolder`, `renameFolder`, `moveFolder`, `loadSubTreeOnDemand`, `needsLoading` |
| `sg-vault--branches.js` | 57 | extends prototype | Branch listing/switching from `branch_index_v1`. | `getBranches`, `getCurrentBranchName`, `switchBranch` |
| `sg-vault--history.js` | 89 | extends prototype | Read-only historical access; powers iframe `window.sg.history.*`. | `logCommits`, `listTreeAt`, `readFileAt`, `readBlob` |
| `sg-vault-commit.js` | 175 | `class SGVaultCommit` | Commit (`commit_v2`, encrypted message) + tree (`tree_v1`, all metadata encrypted) object management. | `createCommit`, `loadCommit`, `createTree`, `loadTree`, `computeContentHash` |
| `sg-vault-crypto.js` | 219 | `class SGVaultCrypto` | Deterministic key derivation (PBKDF2 600k iters); self-describing 4-segment IDs; **pinned to sg-send-cli/sgit v0.5.x compatibility**. | `parseVaultKey`, `deriveKeys`, `deriveKeysFromSimpleToken`, `deriveBranchRefFileId`, `deriveRoTokenTransferId` |
| `sg-vault-object-store.js` | 290 | `class SGVaultObjectStore` | Content-addressed encrypted blob store (`obj-cas-imm-*`); two-tier imm cache (module-level 64 MB in-memory LRU `SG_MEM_CACHE` — works in null-origin sandboxes — + Cache API); write-batching. | `store`, `load`, `loadLarge`, `batchLoad`, `delete`, `computeObjectId`; batch `beginBatch`/`flushBatch`/`discardBatch`/`_stage`/`batching` |
| `sg-vault-owner-secrets.js` | 69 | `globalThis.SGVaultOwnerSecrets` | Owner-tier secret seal: AES-GCM key via HKDF over parent write_key hex (RO sessions cannot derive). | `deriveKey`, `seal`, `open` |
| `sg-vault-ref-manager.js` | 110 | `class SGVaultRefManager` | Encrypted ref pointers; named ref, clone ref, branch index; CLI-interop single-branch index writer (wire format pinned — see `writeBranchIndex` comment). | `writeRef`, `readRef`, `readBranchIndex`, `writeBranchIndex` |

## 2. `_common/js/lib/sg-send/` — SG/Send transport + crypto

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `sg-send.js` | 266 | `class SGSend` | HTTP client for send.sgraph.ai: transfer API (create→upload→complete) + vault-pointer API (read/write/delete/batch/presigned). `staticMode` runs the same app read-only against a static host (GH Pages/S3). Auth: `x-sgraph-access-token`. | Transfers `upload`/`download`/`info`/`deleteTransfer`/`encryptAndUpload`/`downloadAndDecrypt`; vault `vaultWrite`/`vaultRead`/`vaultReadLarge`/`vaultDelete`/`vaultBatch`; crypto delegates |
| `sg-send-crypto.js` | 151 | `class SGSendCrypto` | AES-256-GCM + PBKDF2 (600k) via Web Crypto. Wire format `[12-byte IV][ct+tag]`; base64url key export. | `generateKey`, `exportKey`, `importKey`, `deriveKey`, `encrypt`, `decrypt`, `bytesToBase64url`, `base64urlToBytes`, `requireSecureContext` |

## 3. `_common/js/lib/sg-append/` — vault append/inbox transport

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `sg-append.js` | 209 | `globalThis.SGAppend` | Transport client for the six `/api/vault/append/*` endpoints; Node-testable. | Static `deriveEnumKey`/`deriveEnumKeyHash`; verbs `configure`, `write`, `list`, `fetch`, `markProcessed`, `purge` |
| `sg-append-checker.js` | 147 | `globalThis.SGAppendChecker` | Check-on-events detector (no timers); diffs `list` against per-anchor seen-set; emits `append.new-messages` / `append.error` on the vault event bus. | `check(trigger)`, `reset` |

## 4. `_common/js/lib/links/` — sub-vault link convention

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `vault-links.js` | 187 | `window.VaultLinks` (+ CJS export) | `*.link.json` convention reader — turns keyless link files into sub-vault mounts / external-resource embeds; owner records in `.vault/owner/ro-links.json`. Pure logic, no DOM. | `isLinkFile`, `mountPathFor`, `parseLinkFile`, `isVaultLink`, `isResourceLink`, `detectResourceType`, `getStoredChildKey`/`setStoredChildKey`, `loadRoLinks`, `resolveRef`, `effectiveLink`, `saveRoRecord` |

## 5. `_common/js/lib/sg-public-preview/` — public vault previews

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `public-preview-crypto.js` | 115 | `PublicPreviewCrypto` (+ CJS) | Deterministic derivation public-id → transfer-id + RO/write AES keys; salt `sgraph-public-preview-v1`. | `deriveTransferId`, `deriveReadKeyRO`, `deriveWriteKey`, `derivePublicPreviewKeys`, `encrypt`/`decrypt`, `randomDeleteAuth` |
| `public-preview-meta.js` | 36 | `PublicPreviewMeta` | Client-side OG/twitter meta injection into `document.head`. | `inject(preview, url)` |
| `public-preview-read.js` | 57 | `PublicPreviewRead` | Public read path: derive → tokenless GET → decrypt → validate; statuses `ok`/`not-found`/`expired`/`exhausted`/`invalid`/`error`. | `fetchPreview(apiBase, publicId)` |
| `public-preview-schema.js` | 82 | `PublicPreviewSchema` | Preview JSON schema (`sgraph-public-preview/v1`) + validation; banned-key scan (write_key/read_key/passphrase/…). | `emptyPreview`, `validatePublicId`, `randomPublicId`, `validatePreview` |
| `public-preview-write.js` | 169 | `PublicPreviewWrite` | Owner write path: publish/update/unpublish/delete; bookkeeping in `.vault/owner/public-previews/`. | `publishPreview`, `updatePreview`, `unpublishPreview`, `deletePreview`, `readBookkeeping`, `listBookkeeping` |

## 6. `_common/js/vault-loader/` — credential detection, open/create, routing, storage

Composed into `globalThis.VaultLoader` by `vault-loader.js`.
Load order: events → storage → format → recent → routing → vault-loader.

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `vault-loader.js` | 204 | `globalThis.VaultLoader` | Main entry: composes the five sub-modules; dispatches open by credential format (1–5) incl. RO-token path. **Format 4 (RO cred) open is stubbed — throws, directs users to ro-tokens; Format 5 (ro-token) is the working RO path.** | `detectFormat`, `open`, `create`, `openReadOnly`, `openROToken`, `lock`; namespaces `storage`, `recent`, `routing`, `events` |
| `vault-loader-events.js` | 20 | `VaultLoaderEvents` | Event-name constants (`VAULT_OPENED`, `VAULT_CREATED`, `VAULT_LOCKED`, `VAULT_RECENT_CHANGED`, …). | constants only |
| `vault-loader-format.js` | 95 | `VaultLoaderFormat` | Detects 5 credential formats (simple token / passphrase:hex-id / passphrase:alnum-id / RO cred / ro-token). Pure regex. | `detectFormat(input)` |
| `vault-loader-recent.js` | 138 | `VaultLoaderRecent` | Recent-vaults list in `sg-vault-recent` (cap 200); one-time migration from two legacy lists. | `list`, `add`, `remove`, `clear`, `migrate` |
| `vault-loader-routing.js` | 120 | `VaultLoaderRouting` | Head-script routing across `/`, `/en-gb/`, `/en-gb/app`, `/en-gb/vault`, peek; hash→localStorage token handling + deep-links. | `runRoot`, `runLanding`, `runVault`, `runPeek`, `consumeDeepLink` |
| `vault-loader-storage.js` | 157 | `VaultLoaderStorage` | Single source of truth for storage keys; per-tab vault key (sessionStorage-first), shared access token; null-origin-sandbox-safe (`available()` feature-detect). Default endpoint `https://dev.send.sgraph.ai`. | `available`, `getCurrentKey`/`setCurrentKey`/`clearCurrentKey`, `getAccessKey`/`setAccessKey`/`clearAccessKey`, `getEndpoint`/`setEndpoint`, creating-flag helpers |

## 7. `_common/js/services/` — shared singletons (on `window.sgraphVault`)

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `config-manager.js` | 21 | `window.sgraphVault.config` | Global config (version, appName `SG/Vault`, appTitle). | props |
| `event-bus.js` | 65 | `window.sgraphVault.events` | Central pub/sub; all component comms route through it; 200-entry history. | `on`, `off`, `emit`, `getHistory`, `clearHistory` |
| `messages-service.js` | 71 | `window.sgraphVault.messages` | Toast/message service; emits `message-added` for messages-panel. | `success`, `error`, `warning`, `info`, `getMessages`, `clear` |

## 8. `_common/js/base/` — component base layer

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `vault-component.js` | 159 | `class VaultComponent extends HTMLElement` | Shadow-DOM base component: async resource loading, tracked listeners, error display. Subclasses call `customElements.define`. | `connectedCallback`/`onReady`/`bindElements`/`setupEventListeners`, `loadResources`, `emit`, `addTrackedListener`, `$`/`$$`, `t`/`escapeHtml`/`formatBytes`, `showError`, `whenReady` |
| `vault-component-paths.js` | 26 | `class VaultComponentPaths` | Maps component tag names → JS/HTML/CSS file paths. | static `resolve(tagName)`, `init(path)` |
| `vault-helpers.js` | 52 | `VaultHelpers` | Formatting/util helpers. | `escapeHtml`, `formatNumber`, `formatBytes`, `formatTimestamp`, `copyToClipboard` |

## 9. `_common/js/adapters/` — data-source adapters (SGVault → send-browse)

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `vault-data-source.js` | 274 | `window.VaultDataSource` | Bridges SGVault into the BrowseDataSource 3-method contract; lazy sub-tree loading; write ops; special `.vault-settings.json` handling; App-Mode HUD notify. | Required contract `getTree`/`getFileBytes`/`getFileList`; extras `loadAllSubTrees`, `loadFolder`, `saveFile`, `renameFile`, `deleteFile`, folder ops, `writable`, `onTreeChanged` |
| `composite-data-source.js` | 259 | `window.CompositeDataSource` (+ CJS) | Wraps root VaultDataSource; same 3-method contract while splicing `*.link.json` sub-vaults (read-only) + external resources inline. Writes delegate to root. **Slated for retirement under P-279 kernel unification.** | `scan`, `getTree`, `getFileList`, `getFileBytes`, `loadFolder`, pass-through write ops; internals `_openMount`, `_spliceNode`, `_prefixTree` |

## 10. `_common/lib/markdown/` — standalone markdown

Both files define file-scoped classic-script globals (no `window.` assignment, no CJS export).
`markdown-parser.js` must load before `markdown-renderer.js`.

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `markdown-parser.js` | 602 | `MarkdownParser` | Dependency-free, security-hardened markdown → safe HTML (no HTML pass-through, all text escaped). Front-matter + page-break support. | `parse(markdown, options)` (static-style — NOT `new`), `extractFrontMatter(text)` |
| `markdown-renderer.js` | 161 | `MarkdownRenderer` | Thin DOM layer over MarkdownParser; rendered↔source toggle; blob-url resolution; link-click intercept. | `mount(container, bytes, options)` → handle `getSource`/`refresh`/`toggleSource`/`unmount` |

## 11. `_common/js/components/app-shell/` — SG/App host, kernel, ViV (32 files)

All IIFE modules; web components register via `customElements.define`, logic modules attach to
`globalThis`/`window`. **Naming corrections vs older docs (code-verified 2026-07-24):** the
bridge namespace is **`sg.append.*`** (there is NO `sg.inbox.*`), there is **no `sg.shell.*`**
(print is the `__sgPrintReq`/`__sgPrintReply` RPC), and `sg.git.*` is deprecated in favour of
`sg.sync.*`.

### 11.1 `app-shell.js` — the host (3,511 lines, custom element `<app-shell>`)

The vault-app host for `/en-gb/app`. Opens a vault from a key (localStorage / entry form /
embed postMessage / public-preview / ro-token), reads `app.json`, mounts the app in a
null-origin sandboxed iframe, and brokers every vault operation through a postMessage `sg.*`
bridge. Also owns auto-sync, child-vault lifecycle, the ViV kernel parent, nav history, print,
and consent gating.

**Lifecycle:** `connectedCallback` → `_init()` branches (embed mode → `_initEmbed`; deep-link
hash saved to `sessionStorage['sg-vault-deep-link']`; public preview → `_initPublicPreview`;
saved key → `_initWithKey`; else `_showEntryForm`) → `_initWithKey` (open, reconcile to
published head, wrong-vault guard, resolve access token, build `VaultDataSource`,
`loadAllSubTrees`) → read `app.json` (prefers `.vault/app.json`), parse permissions, compute
`_appId`, dispatch `app-shell:ready`, optional auth intercept → `_continue` routes via
`AppNavHelpers.decideMountStrategy` (+ per-folder app.json via `_resolveFolderAppJson`) into
`redirect` | `file` (`_mountVaultFile`) | `app` (`_mountAppFlow` → `_fetchResources` →
`_mountApp` → `AppFrameBootstrap.build` srcdoc → null-origin iframe → `_setupVfsBridgeHandlers`).

**The `sg.*` bridge surface injected into app iframes** (`_buildVfsBridgeScript`):

| Namespace | Verbs |
|-----------|-------|
| `sg.vfs` | `write`, `read`, `readText`, `list` |
| `sg.fs` | `move`, `delete`, `mkdir` |
| `sg.vault` | `embed`, `create`, `getKey`, `setAccessToken`, `openApp`, `list`, `unlink`, `delete`, `mount`, `unmount`, `mounts`, `notify` |
| `sg.append` | `configure`, `write`, `list`, `fetch`, `markProcessed`, `purge` |
| `sg.on` / `sg.off` | kernel→app events (gated by `app.json host_events`; `"*"` wildcard on subscribe) |
| `sg.loadCss` / `sg.loadJs` | resource loading |
| `sg.history` | `log`, `list`, `read`, `readText`, `readBlob` |
| `sg.app` | data (not RPC): `context`, `selfPath`, `writable`, `vaultName`, `vaultId`, `fileCount`, `totalSize` |
| `sg.sync` | `status`, `check`, `push`, `pull`, `refresh` (`sg.git.*` = deprecated alias) |
| `sg.auth` | `hasKey`, `setKey`, `check`, `clear` |
| `sg.ui` | `message`, `dismiss`, `requestPermission` |
| `sg.state` | `get`, `set`, `remove`, `clear`, `keys` (device-local, 64 KiB cap, namespaced per vault+entry) |
| `window.sgVault` | legacy shim: `writeFile`, `readFile`, `listFiles`, `writable`, `selfPath` |

Bridge also injects: `window.onerror`/`unhandledrejection` → `sg-app-error`; blank-app
self-check; nav intercept (relative `.html` → `__sgVfsNavReq`; external links →
`__sgOpenExternal` confirm unless `externalLinks` grant); `__sgVfsScrollToHash`; print RPC;
and an `HTMLImageElement.prototype.src` patch resolving vault-relative images to blob URLs.

**Parent-side wire messages** (`_setupVfsBridgeHandlers`): `__sgVfsNavReq`, `__sgOpenExternal`,
`__sgVfsWriteReq` (base64, 3 MB EFBIG guard, floor + grants + mount relay), `__sgVfsListReq`,
`__sgVfsReadReq`, `__sgCmdType` dispatch (`history`/`append`/`fs`/`ui`/`vault`/`git`/`state`/`auth`),
`__sgUiMsg`, `sg-app-error`.

**Private method clusters:** init/open (`_init*`, `_continue`, `_showEntryForm`, `_showAuthPrompt`);
auto-sync (`_scheduleAutoPush`, `_autoPushNow`, `_checkBehind`, `_syncViewToPublishedHead`,
`_surfaceUnpushed`, `_remountCurrent`); append/host-events (`_initAppendChecker`, `_pushHostEvent`);
credentials (`_resolveROToken`, `_readEmbeddedAccessToken`, `_resolveEmbedToken`); consent
(`_can`, `_consent`, `_hudConsent`, `_resetConsents`); owner secrets + child vaults
(`_ownerSecret*`, `_createChildVault`, `_seedVaultTree`, `_listChildVaults`, `_deleteChildVault`);
ViV kernel parent (`_ensureKernelParent`, `_spawnChildChannel`, `_mountChildVault`, `_handleVfsViv`);
mount/render (`_mountApp`, `_mountPageLayout`, `_mountVaultFile`, `_appSandbox`,
`_buildVfsBridgeScript`); navigation (`_navigateToPath`, `_navBack/Forward/Reload/Home`,
`_renderBrokenLinkOverlay`, `_promptExternalOpen`); debug (`getDebugState`, `_emitBridgeCall`).

**Deferred-feature markers in code** (the only TODO-equivalents in the whole tree):
`accessToken:'new'` → ENOTIMPL (~L1095); `_openAppVault` embed target deferred (~L1372);
`vault.delete` server teardown pending `SGVault.destroy()` (~L1396, L3209); 3 MB EFBIG
single-write cap pending presigned-PUT (~L2862); `READ_DEFAULT = true` interim posture, Phase 6
flips to false (`app-permissions.js` ~L25).

### 11.2 HUD, pure helpers, permission model

| File | Lines | Global / element | Purpose | Key API |
|------|-------|------------------|---------|---------|
| `app-hud.js` | 1142 | `<app-hud>` | 48 px chrome bar outside sg-layout: vault/app info, privileges chip, file-activity meter, overflow menu, nav row (back/forward/reload/home + editable address bar + recent-pages), consent bar, external-link confirm bar, hidden-mode escape pill. | `setInfo`, `setPrivileges`, `applyHudConfig`, `setNavState`, `requestConsent`, `promptExternalLink`, `showMessage`, `clearMessage`; emits `app-hud:nav`/`:print`/`:reset-consents`, `app-debug:toggle` |
| `app-hud-config.js` | 79 | `AppHudConfig` | Pure resolver for `app.json` `hud.*` (mode full/minimal/hidden/none + `show.*` flags). | `resolve(input)` → `{mode, show}` |
| `app-shell-nav-helpers.js` | 200 | `AppNavHelpers` | DOM-free navigation rules (mirrors bridge-inline copies). | `resolvePath`, `splitHrefFragment`, `shouldInterceptVaultHtmlHref`, `resolveNavigation`, `decideMountStrategy`, `resolveFolderManifest` |
| `app-permissions.js` | 221 | `AppPermissions` | App-iframe permission model: non-grantable `.vault/**` security floor + `app.json` grant lookup. Verbs: `fs.{read,list,write,move,delete,mkdir}`, `vault.{create,createKey,standalone,seedFrom,openApp,embedAccessToken,unlink,mount,notify,delete}`, `append.{configure,write,list,read,markProcessed,purge}`, `externalLinks`. | `normalizePath`, `hasVaultSegment`, `isFloor`, `parsePermissions`, `can`, `appId`, `READ_DEFAULT` |
| `app-host-events.js` | 57 | `AppHostEvents` | Inbound event allowlist for `sg.on`; default-deny, exact-name only. | `parse(appJson)`, `allows(set,name)` |
| `app-frame-bootstrap.js` | 186 | `AppFrameBootstrap` | Pure srcdoc builder unifying the 4 mount kinds (`app`/`html`/`page-layout`/`markdown`). | `build(descriptor)`, `injectHead`, `PATH_HELPERS` |
| `embed-protocol.js` | 122 | `EmbedProtocol` | DOM-free vault-in-iframe handshake helpers (key via postMessage, never URL/storage). | `isEmbedMode`, `getExpectedParentOrigin`, `validateSource`, `parseOpenMessage`, `readyMessage`, `vaultReadyMessage` |
| `sg-embed-helpers.js` | 56 | `SgEmbed` | Pure helpers for `sg.vault.embed()`; injected verbatim into the bridge via `Function.toString()`. Never grants `allow-same-origin`/escape-sandbox. | `sanitizeSandbox`, `buildEmbedSrc` |
| `sg-repl-core.js` | 153 | `SgReplCore` | Pure parse+format for the debug REPL (not a shell). | `parse`, `normPath`, `formatList`, `formatMounts`, `formatLog`, `help` |
| `sg-app-stub.js` | 240 | sets `window.sg` (child side) | Phase-3 secret-less app-side `sg.*` over SecureChannel. **Not loaded by the /app page** — bundled into kernel-shell for ViV child kernels; live app traffic still uses the inline bridge. | full `sg.*` mirror + `sg.broker.log`, `sg.whenReady` |

### 11.3 SecureChannel + kernel + ViV modules

| File | Lines | Global | Purpose | Key API |
|------|-------|--------|---------|---------|
| `secure-channel-envelope.js` | 491 | `Envelope` | Pure WebCrypto envelope: pack/unpack, ECDSA P-256 sign, ECDH→AES-GCM encrypt, ReplayGuard, structured-clone wire format. | `pack`, `unpack`, `ReplayGuard`, `generateSignKeypair`, `generateEphemeralBootKey`, `deriveEncKey`, `encryptBytes`/`decryptBytes` |
| `secure-channel.js` | 310 | `class SecureChannel` | Port-anchored authenticated channel over MessagePort; K1 bootstrap; directional (responder can't `request`); cid pinning; replay guard. | static `create`/`accept`; `send`, `request`, `handle`, `on`, `close` |
| `kernel-bootstrap.js` | 132 | `bootKernelOnPort` | Child-kernel boot on a received port: accept channel → one-shot `secrets` handler opens vault → register VFS handlers → broker+monitor → `ready`. Factories injectable for tests. | `bootKernelOnPort(port, opts)` |
| `kernel-broker.js` | 120 | `class KernelBroker` | Per-kernel Edge-2 sidecar mediating ops to mounted children; metadata-only log; default policy `fs.read`→auto, others→ask; fail-closed. | `setPolicy`, `mediate` → `{decision,entryId}`, `finalize`, `log`, `clearLog` |
| `kernel-mounts.js` | 77 | `class KernelMounts` | Mount table + longest-prefix path resolution. | `add`, `remove`, `get`, `list`, `resolve(path)` |
| `kernel-parent.js` | 152 | `class KernelParent` | Parent-side ViV orchestration: mounts + broker + relay with custody (`VivCustody.gate`) and credential-tier (`VivCredentialTiers.gate`) gates; iframe spawn injected. | `mount`, `unmount`, `monitorChild`, `list`, `relay` |
| `kernel-app-handlers.js` | 143 | `registerKernelVfsHandlers` | Kernel-side `vfs.*` handler bodies enforcing both gates (EPROTECTED floor, EPERM grants, EREADONLY, EUNREACH on push failure). | registers `vfs.read/list/write/delete/mkdir` |
| `kernel-shell-bundle.js` | 2 | `KERNEL_SHELL_HTML` | AUTO-GENERATED (do not edit) child-kernel srcdoc bundle. Rebuild: `scripts/build-kernel-shell-bundle.py`; freshness-guarded by `test__bundle_freshness.js`. | one bundle string |
| `viv-custody.js` | 100 | `VivCustody` | B10 fail-closed custody gate (refuses parent-held child creds in same-origin frames). | `MODES`, `classifyAppFrameOrigin`, `check`, `gate` → EUNSAFE_CUSTODY |
| `viv-credential-tiers.js` | 79 | `VivCredentialTiers` | B5/B6 minimum-tier gate on the relay edge; destructive verbs need `perRequest-rw`. | `TIERS`, `requiredTierFor`, `meets`, `gate` → EUNDERPRIVILEGED |
| `viv-monitor.js` | 89 | `VivMonitor` | B7 monitored-mode child visibility; default CLOSED → ECONSENT. | `MODES`, `registerOnChannel`, `requestLog` |
| `viv-mounts-view.js` | 129 | `VivMountsView` | Pure view-model: single-kernel mounts + broker-log panel. | `mountRows`, `logRows`, `summary`, `build` |
| `viv-audit-view.js` | 176 | `VivAuditView` | Pure cross-kernel audit aggregation (consent-honest: CLOSED children contribute no log). | `aggregate`, `filterLog`, `groupLog`, `facets`, `sourceRows` |

### 11.4 Debug pane tabs

| File | Lines | Element | Purpose |
|------|-------|---------|---------|
| `app-debug-pane.js` | 152 | `<app-debug-pane>` | Collapsible right-edge panel hosting all tabs; ResizeObserver auto-collapse |
| `app-debug-repl.js` | 128 | `<app-debug-repl>` | REPL UI over `SgReplCore` + `window._appDebug.repl` |
| `app-debug-audit.js` | 161 | `<app-debug-audit>` | Cross-kernel audit tab (async `vivAuditProvider()`) |
| `app-debug-mounts.js` | 143 | `<app-debug-mounts>` | Single-kernel mounts + broker log |
| `app-debug-app-state.js` | 123 | `<app-debug-app-state>` | Polls `getDebugState()` (1 s): status, app.json, resources, timing |
| `app-debug-bridge-log.js` | 82 | `<app-debug-bridge-log>` | Renders `_appDebug.bridgeCalls` |
| `app-debug-network.js` | 63 | `<app-debug-network>` | Renders `_appDebug.networkCalls` (fetch proxy) |
| `app-debug-vault-trace.js` | 79 | `<app-debug-vault-trace>` | Renders `_appDebug.vaultEvents` |

### 11.5 Page: `en-gb/app/index.html` (213 lines, "SG/App")

Load order: (1) inline debug infra (`window._appDebug` buffers + fetch proxy — must run first);
(2) crypto/lib layer — sg-send, full sg-vault set, sg-append (NO vault-loader on this page;
credential parsing is inline in app-shell); (3) adapters + vault-links + composite-data-source;
(4) public-preview libs + card; (5) external `sg-layout.js` (dev.tools.sgraph.ai) +
`sg-print.js` (dev.send.sgraph.ai); (6) all app-shell components with the pure helpers
(`app-shell-nav-helpers`, `app-hud-config`, `embed-protocol`, `sg-embed-helpers`) loaded
**before** `app-shell.js` last. `kernel-bootstrap.js`, `kernel-app-handlers.js`, `sg-app-stub.js`
are NOT loaded by the page — they live inside `kernel-shell-bundle.js`.

Body: `<app-hud>` + `<sg-layout>` (app-area stack with locked `app-shell` tab + debug-area
stack with `app-debug-pane`; split persisted to sessionStorage). Page script forwards
`app-shell:ready` → `hud.setInfo/setPrivileges/applyHudConfig` (honouring the
`localStorage['sg-app-force-show-hud']` sovereignty override) and handles `app-debug:toggle`.

<!-- SECTIONS 12+ (vault browser components, vault-chat lib, pages) appended from companion catalogue -->
