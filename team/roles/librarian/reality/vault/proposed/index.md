# vault/proposed — Index

**Domain:** `vault/` | **Last updated:** 2026-05-21
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
Builds on EXISTING foundations: `.vault/owner/*` double-encryption (`vault-hkdf.js`), `SGVault.openReadOnly` (`sg-vault.js:93`), `VaultLoader.openROToken` (`vault-loader.js:122`), the `app.json`/`_page.json` convention mechanism, and lazy sub-tree loading.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-159 | Vault-pointer convention file | `.vault/owner/pointers.json` (owner-only, double-encrypted), `type`-discriminated array; records child-vault references (id + read_key + ref_file_id, or full vault_key) | sub-vaults-workflow / conventions briefs |
| P-160 | Sub-vault traversal in Vault Web UI | "BEYOND THIS VAULT" tree region; open child vault lazily on access via existing `openReadOnly`/`open`; vault back-stack + persistent boundary bar | sub-vaults-workflow brief (Web UI first) |
| P-161 | External-resource pointers (`type` link/video/app) | Same convention file; embed external URL in a controlled iframe | conventions brief |
| P-162 | Controlled external iframe (`<sg-embed-frame>`) | Cross-origin src, locked-down sandbox, NO VFS bridge, NO postMessage listener; default-deny; sticky transparency banner | conventions brief (controlled iframe) |
| P-163 | Selective access grant for external apps | Explicit owner grant of a scoped read channel (narrow, not the full VFS bridge); amber granted-state banner + Revoke | conventions brief (plugin model) — Phase 4 |
| P-164 | CLI clone-within-clone for sub-vaults | `sgit` resolves `pointers.json` and clones referenced vaults on demand; nested-clone storage tracking | sub-vaults-workflow brief — Phase 4 (deferred) |
| P-165 | Reader-visible pointer tier | Optional `.vault/pointers.json` (read_key only) so RO-token holders of the parent can see non-sensitive pointers | conventions/workflow briefs — additive option |

## Vault Discovery and Public Keys (05/16 briefs — doc 422)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-153 | Discovery endpoint at `/.well-known/vaults` | Returns structured JSON listing of public vaults with metadata | doc 422 |
| P-154 | Vault visibility model | Four levels: public / unlisted / private / count-only | doc 422 |
| P-155 | Ed25519 signing + X25519 encryption key pair per vault | New PKI layer — public key safe to expose; private key never leaves owner | doc 422 |
| P-156 | Public key in vault metadata for discovery and cryptographic addressing | Serialized in discovery endpoint output and vault metadata | doc 422 |
| P-157 | "Send content to a vault" via public-key encryption | One-way anonymous submission: encrypt to vault's X25519 public key; only owner can decrypt | doc 422 |
| P-158 | Self-contained demo server with vault catalogue UI | Portable Docker image or VM with bundled vaults; works offline/air-gapped | doc 422 |
