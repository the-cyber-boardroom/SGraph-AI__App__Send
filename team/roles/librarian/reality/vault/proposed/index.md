# vault/proposed — Index

**Domain:** `vault/` | **Last updated:** 2026-04-28
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
