# vault/proposed — Index

**Domain:** `vault/` | **Last updated:** 2026-05-25
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — Sections 16–17, 19, 29

---

## Active Proposals (Sub-files exist)

| File | Topic | Priority |
|------|-------|----------|
| [structure-key-split.md](structure-key-split.md) | Activate `structure_key` for structural objects — four-team change, design decided | **HIGH — active** |

---

## Queued Proposals (Sub-files needed — see DAILY_RUN.md B-001)

### Vault Architecture Overhaul (v0.16.3 — 03/17)

Self-describing file IDs (`{type}-{derivation}-{mutability}-{hex_id}`), sub-tree model
(one tree per directory, on-demand loading), batch read API, encrypted-only metadata
(drop plaintext `path`/`name`/`size`/`message`), compare-and-swap for multi-writer files,
four-layer security model (Modes A–D — Mode A exists; B/C/D conceptual), 6 additional
storage backend mappings.

*Source: monolith Section 16 lines 1177–1191. → Extract to `vault-architecture.md`*

### SG Vault Hub (v0.13.32 — 03/14)

GitHub-equivalent for encrypted vaults. Change packs (zero-knowledge contributions).
Optional public view publishing (client-controlled). sgit.ai platform (Git interop, hosting).

*Source: monolith Section 16 lines 1202–1209. → Extract to `vault-hub.md`*

### Vault Browser UI (v0.16.26 — 03/18)

Auto-commit mode, auto-sync (opt-in background push/pull), commit history visualisation,
in-browser file editing (text, markdown, JSON, code), conflict resolution UI (side-by-side diff),
6 new Web Components (`sg-vault-status`, `sg-vault-editor`, `sg-vault-viewer`, `sg-vault-history`,
`sg-vault-branches`, `sg-vault-conflicts`). Vault-Browse unification (03/29 Architect brief).

*Source: monolith Section 16 lines 1269–1279, Section 17 lines 1644–1656. → Extract to `vault-browser-ui.md`*

### PKI Modes 2–4 (v0.13.32 — 03/14)

PKI Mode 2 (device provenance — mandatory branch signing), Mode 3 (author-identified — user
keys), Mode 4 (countersigned — third-party attestation). Key rotation for user keys. Hardware
key support (YubiKey, TPM).

*Source: monolith Section 16 lines 1192–1201. → Extract to `pki-modes.md`*

### Vault Migration / Multi-Remote (03/29 — dev brief)

Pull from multiple remotes, vault migration tooling, multi-remote configuration.

*Source: monolith Section 17 lines 1700–1710. → Extract to `multi-remote.md`*

### Browser Virtual File System (04/03 — arch brief, doc 221)

VFS bridge and BrowseDataSource interface. Vault as universal data layer. VFS exposed to
browser tools as a uniform file system abstraction.

*Source: monolith Section 20 lines 1847–1900. → Merge into `vault-browser-ui.md`*

### SGit Browser Web Components (04/03 — dev brief, doc 220)

Vault-aware Web Components for browser: `sg-vault-picker`, vault browse components.
Read-only consumers using `structure_key` once split is implemented.

*Source: monolith Section 20 lines 1866–1888. → Merge into `vault-browser-ui.md`*

### sgit-ai Simple Token — Future Items (03/27)

Additional simple token features: passphrase protection for token, token expiry on CLI.

*Source: monolith Section 17 lines 1629–1643.*

### Vault Collaboration Additions (04/15 — dev-brief, doc 278)

Collaborative vault features: presence indicators, merge request workflow, comment threads.

*Source: monolith Section 27 lines 2553–2569.*

### Server-Side Zip Folder Versioning (04/08 — arch brief, doc 241)

`GET /api/vault/zip/{vault_id}` endpoint for read-only vault snapshot pull. Related to OQ-2
from structure-key-split. Currently requires write_key; proposed to accept read_key or structure_key.

*Source: monolith Section 23 lines 2172–2190.*

---

## Publishing Layer (05/11–05/12 briefs — docs 366, 375, 376)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Published readonly vault URLs (`*.sgraph.app/en-gb/#<share-token>`) | Public-facing vault with no read key required in URL | doc 366 |
| Auto-publish on commit (opt-in, free tier) | Vault publish triggered automatically on sgit push | doc 366 |
| SEO layer for published vaults (metadata only) | Server-side sitemap, robots.txt, meta tags — content stays encrypted | doc 366 |
| Analytics for published vaults | View counts, referrer data per published vault | doc 366 |
| Custom domain support for published vaults (paid tier) | Bring-your-own-domain with DNS delegation | doc 366 |

## GitHub-as-Vault-Projection (05/11 brief — doc 359)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Two-layer VCS pattern | Git (developer surface) + SGit (consumer distribution) — separate concerns | doc 359 |
| GitHub Action for bidirectional vault sync (Phase 3) | Auto-sync: vault changes propagate back to Git | doc 359 |
| CLAUDE.md injection for customer AI dev context | Inject project-aware CLAUDE.md into customer Git repo from vault template | doc 359 |

## Manager Vaults and Credential Manager (05/14 briefs — docs 386, 387)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Manager vault pattern | Vaults whose purpose is to manage other vaults; same architecture as content vaults, different operational scope | doc 386 |
| Credential manager vault | First manager vault instantiation; distributes scoped API credentials via Simple Tokens | doc 387 |
| Simple Token format `tok_<random>` | API credential proxy token; distinct from vault key-derivation word-word-NNNN tokens | doc 387 |
| Token lifecycle operations | issue, revoke, rotate, adjust scope, quota enforcement — all tracked in vault audit trail | doc 387 |
| Token resolution service: proxy mode | API calls routed through credential manager; actual keys never exposed to callers | doc 387 |
| Token resolution service: direct mode | Token resolved to actual key at request time; simpler but exposes keys to callers | doc 387 |
| Cross-vault API surface for manager vault operations | Manager vault exposes API for other vaults to request credentials and report usage | doc 386 |

## Customer Workflow Primitives (05/11 briefs — docs 364, 360)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Template vault clone API (`POST /vault/clone`) | Server-side clone of template vault to new customer instance | doc 364 |
| One-time share token (no PKI Phase 1) | Disposable read access token; expires after single use | doc 364 |
| Bring-your-own-key commercial pattern | Customer controls encryption key; no data custody by SGraph | doc 360 |

---

## Vault Demo Capabilities (05/16 briefs — docs 417)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-128 | Read-only vault opening — polished | Visual read-only badge/banner, mobile responsive, polished load, "make this your own" CTA | doc 417 |
| P-129 | Session-scoped client-side changes | In-memory state shim over JS API; overrides reads; writes land in-session; discarded on refresh/tab-close | doc 417 |
| P-130 | Cross-vault navigation defaults | New tab for cross-vault links; same tab for in-vault anchors; share tokens carried in cross-vault links | doc 417 |
| P-131 | "Make this your own" CTA on read-only views | Conversion path from read-only visitor to account holder | doc 417 |
| P-132 | Session change reset capability | Clear session-scoped changes without reloading the page | doc 417 |

## Vault Testing Framework (05/16 briefs — doc 418)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-133 | Four-layer vault testing model | Unit / integration / QA / browser-automation, all via the vault JS API surface | doc 418 |
| P-134 | Vitest-based test runner for unit/integration layers | Vitest wrapping with vault-aware context helpers | doc 418 |
| P-135 | Playwright-based test runner for browser-automation layer | Playwright driving real browsers against deployed vault URLs | doc 418 |
| P-136 | Unified test definition format with `layer` option | Single test file format routes tests to correct execution environment | doc 418 |
| P-137 | Per-vault test fixture support | Committed test data in vault; reproducible across runs; lives in vault for portability | doc 418 |

## Sub-Vaults & External Resources via Convention Files (05/24–05/25 briefs — vaults-within-vaults, sub-vaults-workflow, conventions-and-external-resources)

All items below are PROPOSED — does not exist yet. Architecture briefing pack:
`team/roles/architect/reviews/05/25/v0.27.62__briefing-pack__sub-vaults-and-external-resources.md`.
Designer review: `team/roles/designer/reviews/05/25/v0.27.62__designer-review__sub-vaults-and-external-resources-ux.md`.
Builds on EXISTING foundations: `.vault/owner/*` double-encryption (`vault-hkdf.js`), `SGVault.openReadOnly` (`sg-vault.js:93`), `SGVault._loadTreeFromCommit` (`sg-vault.js:312`), `VaultLoader.openROToken` (`vault-loader.js:122`), the `app.json`/`_page.json` convention mechanism, and lazy sub-tree loading.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-159 | Link-file convention (`*.link.json`) | Dumb, movable pointer file **in the regular tree** (no keys). Minimal: `vault_id` + `ref_id` (+ optional per-location overrides of any owner-record field). Canonical metadata lives in the owner record. Same vault may appear in many places sharing one `ref_id`; move = move the file | sub-vaults-workflow / conventions briefs |
| P-160 | `ro-links.json` / `rw-links.json` in `.vault/owner/` | Per-`ref_id` record holding **canonical metadata (`type`/`label`/`pin`/`description`/`url`) + the key**, split by power: `ro-links` = read_key-encrypted (read-only refs, readable by parent read access); `rw-links` = owner-only double-encrypted (full child keys). Effective field = link-file override ?? record | sub-vaults-workflow brief |
| P-161 | Inline sub-vault traversal (read-only in v1) | Sub-vault renders as an **expandable folder**, opens lazily on access, spliced inline; **always read-only in v1 regardless of key**; subtle vault glyph + access chip | sub-vaults-workflow brief (Web UI first) |
| P-174 | Per-tab vault identity (multi-window) | Move current-vault key from shared `localStorage` to per-tab `sessionStorage`; reuse the existing root `/#key` inbox for "open in new window". Enables "open sub-vault in new window" as an independent full session: reload-per-tab correct, close = no-op. (`vault-loader-storage.js:34`) | sub-vaults-workflow brief + lead clarification |
| P-162 | Link card (`<sg-link-card>`) | Miniature open-vault surface: shows **public info before key** via the **shipped** `PublicPreviewRead.fetchPreview(apiBase, public_id)` (P-170) when the link record has a `public_id`; prompts for key, save choice (`.vault` ro/rw · local · ask-each-time), pin, description; "Open here" (inline) vs "Open in new window" (`window.open('/#'+key)`, per-tab P-174). Reference: shipped `sg-public-preview-card` + `/en-gb/app/<public-id>` Mode A | conventions/workflow briefs + public-vault-previews (shipped) |
| P-163 | External-resource link types + per-type renderer (`<sg-embed-frame>`) | `type` = `link`/`video`/`image`/`app`; rendering differs by type — `<img>`/`<video>` media element vs provider iframe vs sandboxed cross-origin iframe (no `allow-same-origin`, no bridge/listener); default-deny; **click-to-load** privacy default (no third-party fetch until user opts in); sticky transparency banner; Add UI auto-detects `type` from URL | conventions brief + lead clarification |
| P-164 | Opt-in app→vault access grant (**v1**, first-class) | Explicit owner grant of a scoped read-only `requestFile` channel to a named folder; amber granted banner + Revoke; default-deny otherwise. Per-file monitoring/granular grants later | conventions brief (plugin model) |
| P-165 | CLI clone-within-clone + write-inside-child | Nested clone resolution in `sgit`; commits/recursive write inside a sub-vault | sub-vaults-workflow brief — Phase 4 (deferred) |

**Implementation status (branch `claude/exciting-brown-G2P9Z`, Phase 0 — code-complete, still PROPOSED overall):** built — `_common/js/lib/links/vault-links.js` (the `*.link.json` convention reader; **26/26**); the generic **lazy-on-expand** enhancement to the shared `send-browse--v0.3.2.js` (Approach B; backward-compatible, share/open trees unaffected); `_common/js/adapters/composite-data-source.js` (scan → inline `_subvault`/`_lazy` mount nodes → `loadFolder` opens child **read-only** → prefixed splice → routed reads; **24/24**); and `vault-shell.js` wiring (wrap root in composite + scan + Phase-0 `window.prompt` key) with `index.html` script includes. Plus **Phase 1 (ro-links owner records)**: `vault-links.js` gains `loadRoLinks`/`resolveRef`/`effectiveLink`/`saveRoRecord` (`.vault/owner/ro-links.json`, read_key tier), and the composite opens a child **silently read-only via `SGVault.openReadOnly`** when a record exists (no prompt) — **37/37 + 28/28**. (`rw-links` + the `vault-hkdf` move are deferred to writable children, Phase 4.) Plus **Phase 2 (partial)**: `<sg-link-card>` (self-contained modal — public-info-before-key via shipped `fetchPreview`, key + save choice, "Open here" / "Open in new window"), wired as the composite `keyProvider` in `vault-shell` (replaces `window.prompt`). Plus **per-tab vault identity (P-174, DONE — bug fix):** the vault **key** is now per-tab (`sessionStorage`-first, localStorage last-opened fallback) so a second vault in a new tab no longer clobbers the first on reload; the **access token** stays shared across tabs (intended). Fixed in `vault-loader-storage.js` + bypass points (`app-shell`, `index.html` routing, `browse`, `vault-shell` lock); `test__storage_pertab.js` 8/8. **Not yet built:** external embeds (`<sg-embed-frame>`), owner add-UI. **User guide:** `library/guides/content/v0.27.62__guide__vault-in-vaults.md`. **Browser-unverified throughout** (no browser in build env). **NOT browser-verified** (no browser in the build env) — the splice is logic-verified by unit tests only; the real expand→prompt→render needs a browser/Playwright pass. Plan: `team/roles/dev/reviews/05/25/v0.27.62__implementation-plan__sub-vaults-and-external-resources.md`.

## Public Vault Previews (05/25 brief — public-vault-previews)

**Implementation status (branch `claude/gracious-mendel-ynkJj`, pending review/merge):** core derivation+schema+read, the owner write path, the OG-render service+route, the preview card, the meta injector, the `/en-gb/preview` tester page, and the editor are **implemented**; plus a backward-compatible backend `allow_recreate` flag (delete clears meta → in-place update works). **Verified by tests:** JS KAT 9/9 (incl. R3 namespace separation, read-path round-trip), backend 6/6 (public-preview incl. delete-then-recreate) + 6/6 (OG service, cross-language derivation parity with the browser) + 66/66 existing transfer regression. **Pending:** browser/Playwright verification of the components, the `/en-gb/app/<public-id>` app-shell wiring, and the CloudFront path-segment + crawler-UA routing (DevOps). Dev pack (architecture → derivation → UX → mockups → reuse map → phases → security):
`library/sgraph-send/dev_packs/v0.27.62__public-vault-previews/`. This **supplies the "public info before key" capability** that the sub-vaults link card (P-162) depends on.
Builds entirely on EXISTING foundations: the SG/Send transfer flow + **DELETE** (`Routes__Transfers.py:249`, `Transfer__Service.delete_transfer:174`), native expiry (`expires_at`/`max_downloads`/`auto_delete`, `Schema__Transfer.py:20-23`), `SendCrypto.encryptFile` (`crypto.js`), the SGMETA envelope (`upload-constants.js`), the `FriendlyCrypto` derivation pattern (`friendly-crypto.js`), and the `/en-gb/app` route (`…__ui__vault/v0/v0.2/v0.2.3/en-gb/app/index.html`). **No new server-side store** — the only exposure is the public-vault-about-key in the URL/logs.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-166 | Public-vault-about-key + deterministic derivation | A public string in the URL deterministically yields a 12-hex SG/Send transfer-id (`SHA-256('pvp-transfer-v1:'+id)[:12]`) and a **read-only, decrypt-only** AES key (PBKDF2 salt `sgraph-public-preview-v1` — a namespace distinct from Simple Tokens and vault keys). Not a Simple Token | public-vault-previews dev pack |
| P-167 | Public-preview convention JSON (`sgraph-public-preview/v1`) | Deliberately-public title / description / thumbnail (inline ≤~64 KB or derived blob) / disclaimer / support / expiry, stored as an ordinary SG/Send transfer; field-name guard bans `write_key`/`read_key`/`passphrase` | dev pack doc 02 §5 |
| P-168 | Two access modes on `/en-gb/app/<public-id>` | No `#` → render preview + ask for key; `#<vault-key>` → render preview fast, auto-load the vault (key stays in the hash, never sent to the server). Needs a path-segment CDN rewrite (interim `?p=`) | dev pack doc 02 §3, doc 04 |
| P-169 | Delete-then-recreate update via owner-held random `delete_auth` | Update/unpublish = `DELETE` the transfer (with a **random** `delete_auth` stored in the owner vault at `.vault/owner/public-previews/<id>.json`) then recreate at the same id; same share link across edits. `delete_auth` is NEVER derived from the public string (defacement gate) | dev pack doc 03 §3-4, doc 09 R-deface |
| P-170 | Crawler social-share cards via in-repo OG-render | A route on the public User Lambda derives + fetches + decrypts the public preview server-side and injects OG/Twitter meta tags into the served shell (cached by public-id, fails closed). `sg-public-preview-meta` covers JS-capable humans | dev pack doc 02 §6 |
| P-171 | `sg-public-preview-editor` — embedded as a **Settings tab** (vault-shell) | Lightweight tab ("Vault Settings" \| "Public preview"); handed the live vault via `setContext` (no new tab, no localStorage race); auto-loads an existing published preview for editing. Opt-in (default OFF; no-expiry default); custom/random id; fields + thumbnail from upload or a vault file (native no-lib WebP); side-by-side live card; wrong-vault guard on open; share-link copy with key-inclusion warning | dev pack doc 04 §5/§7 |
| P-172 | Transparency: surface the SG/Send file | Transfer-id + read-only key + a `send.sgraph.ai/en-gb/open/view#<tid>/<key>` raw-file link, shown on the **`/en-gb/preview/<id>` tester debug strip** + the OG `/info` JSON (removed from the public card to avoid confusing end-users). Safe — all derivable from the public-id, read-only, never the `delete_auth` | dev pack doc 02 §9, doc 04 §6a |
| P-175 | "Key saved on this device" one-click open | A public-id URL always shows the preview (never auto-opens the generic last-opened vault — it may be the wrong vault). A key stored **per public-id** (`sg-pvp-key:<id>`, written on publish or successful open) is offered as a one-click open; stale keys are dropped | dev pack doc 04 §2.0 |
| P-173 | `/en-gb/preview/<preview-key>` card-tester page | New top-level page rendering the preview exactly as a WhatsApp/LinkedIn unfurl would (in-browser twin of the OG card) + a debug strip; never opens the vault; manual-verification surface for social-card output | dev pack doc 02 §6a, doc 05 §6 |

## Vault Discovery and Public Keys (05/16 briefs — doc 422)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-153 | Discovery endpoint at `/.well-known/vaults` | Returns structured JSON listing of public vaults with metadata | doc 422 |
| P-154 | Vault visibility model | Four levels: public / unlisted / private / count-only | doc 422 |
| P-155 | Ed25519 signing + X25519 encryption key pair per vault | New PKI layer — public key safe to expose; private key never leaves owner | doc 422 |
| P-156 | Public key in vault metadata for discovery and cryptographic addressing | Serialized in discovery endpoint output and vault metadata | doc 422 |
| P-157 | "Send content to a vault" via public-key encryption | One-way anonymous submission: encrypt to vault's X25519 public key; only owner can decrypt | doc 422 |
| P-158 | Self-contained demo server with vault catalogue UI | Portable Docker image or VM with bundled vaults; works offline/air-gapped | doc 422 |
