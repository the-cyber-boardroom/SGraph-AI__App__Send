# vault/proposed — Architecture & Core

**Domain:** `vault/` | **Last updated:** 2026-06-30 | **Maintained by:** Librarian
**Source:** Archived monolith `v0.16.26__what-exists-today.md` — Sections 16–17

---

## Vault Architecture Overhaul (v0.16.3 — 03/17)

**PROPOSED — does not exist yet.**

Self-describing file IDs (`{type}-{derivation}-{mutability}-{hex_id}`), sub-tree model
(one tree per directory, on-demand loading), batch read API, encrypted-only metadata
(drop plaintext `path`/`name`/`size`/`message`), compare-and-swap for multi-writer files,
four-layer security model (Modes A–D — Mode A exists; B/C/D conceptual), 6 additional
storage backend mappings.

*Source: monolith Section 16 lines 1177–1191.*

---

## PKI Modes 2–4 (v0.13.32 — 03/14)

**PROPOSED — does not exist yet.**

PKI Mode 2 (device provenance — mandatory branch signing), Mode 3 (author-identified — user
keys), Mode 4 (countersigned — third-party attestation). Key rotation for user keys. Hardware
key support (YubiKey, TPM).

*Source: monolith Section 16 lines 1192–1201.*

---

## Vault Migration / Multi-Remote (03/29 — dev brief)

**PROPOSED — does not exist yet.**

Pull from multiple remotes, vault migration tooling, multi-remote configuration.

*Source: monolith Section 17 lines 1700–1710.*

---

## sgit-ai Simple Token — Future Items (03/27)

**PROPOSED — does not exist yet.**

Additional simple token features: passphrase protection for token, token expiry on CLI.

*Source: monolith Section 17 lines 1629–1643.*

---

## Server-Side Zip Folder Versioning (04/08 — arch brief, doc 241)

**PROPOSED — does not exist yet.**

`GET /api/vault/zip/{vault_id}` endpoint for read-only vault snapshot pull. Related to OQ-2
from structure-key-split. Currently requires write_key; proposed to accept read_key or
structure_key.

*Source: monolith Section 23 lines 2172–2190.*

---

## Vault Collaboration Additions (04/15 — dev-brief, doc 278)

**PROPOSED — does not exist yet.**

Collaborative vault features: presence indicators, merge request workflow, comment threads.

*Source: monolith Section 27 lines 2553–2569.*
