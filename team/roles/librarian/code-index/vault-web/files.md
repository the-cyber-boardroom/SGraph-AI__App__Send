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

<!-- SECTIONS 11+ (app-shell/kernel, components, pages, i18n) appended from companion catalogues -->
