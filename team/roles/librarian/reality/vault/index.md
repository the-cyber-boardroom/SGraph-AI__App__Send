# vault — Reality Index

**Domain:** `vault/` | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

The vault/SGit cryptographic storage system. This domain covers the encryption layer, the
object storage model, the browser JS client, PKI, and the sgit CLI as it relates to vault
operations. The vault system spans multiple surfaces (server pointer API, browser client, CLI)
— each surface has its own domain (`send-api/`, `ui/`, `cli/`); this domain covers the
shared cryptographic and storage design.

**⚠️ Active design change:** The structure key encryption split (04/28 Architect Review)
is a four-team change. See `proposed/structure-key-split.md`.

---

## EXISTS (Code-Verified)

### Key Derivation (Correct — Both Paths)

**Standard vault key (`passphrase:vault_id`):**
```
read_key      = PBKDF2(passphrase, salt='sg-vault-v1:{vault_id}',        600k iterations)
write_key     = PBKDF2(passphrase, salt='sg-vault-v1:write:{vault_id}',  600k iterations)
structure_key = HKDF(read_key,     info=b'sg-vault-v1:structure-key')
```

**Simple token (`word-word-NNNN`):**
```
aes_key       = PBKDF2(token,      salt=b'sgraph-send-v1',               600k iterations)
read_key      = HKDF(aes_key,      info=b'vault-read-key')
write_key     = HKDF(aes_key,      info=b'vault-write-key')
structure_key = HKDF(read_key,     info=b'sg-vault-v1:structure-key')
```

One-way properties hold: `structure_key` cannot be reversed to `read_key`; `read_key` cannot
be reversed to the passphrase or token.

### Encryption (Current State — INCOMPLETE)

⚠️ All vault objects are currently encrypted with `read_key`. The `structure_key` is derived
but never used for encryption — the feature is inert. This is the subject of the 04/28
Architect Review (see `proposed/structure-key-split.md`).

| Object | Currently encrypted with | Should use (target) |
|--------|--------------------------|---------------------|
| Refs | `read_key` | `structure_key` |
| Branch index | `read_key` | `structure_key` |
| Commits (core fields) | `read_key` | `structure_key` |
| Commits (`message_enc`) | `read_key` | `read_key` ✓ |
| Trees (outer envelope) | `read_key` | `structure_key` |
| Tree entries (`blob_id`, `tree_id`, `large`) | `read_key` | `structure_key` |
| Tree entries (`name_enc`, `size_enc`, `content_hash_enc`, `content_type_enc`) | `read_key` | `read_key` ✓ |
| Blob content | `read_key` | `read_key` ✓ |
| Public PKI keys | `read_key` | `structure_key` |
| Named branch private key | `read_key` | `write_key` (deferred) |

### Object Storage Model (bare/ structure)

Objects are stored in a content-addressable store (CAS) with opaque IDs:

| Object Type | Path Pattern | Mutability |
|-------------|-------------|------------|
| Blobs (file content) | `bare/data/obj-cas-imm-{hex_id}` | Immutable |
| Trees (directory snapshots) | `bare/data/obj-cas-imm-{hex_id}` | Immutable |
| Commits | `bare/data/obj-cas-imm-{hex_id}` | Immutable |
| Keys (PKI) | `bare/keys/key-rnd-imm-{hex_id}` | Immutable |
| Refs | `bare/refs/` | Mutable |
| Branch index | `bare/indexes/` | Mutable |

### Vault Round-Trip: AI-Native Access (v0.13.22)

| Capability | Status | Evidence |
|------------|--------|---------|
| `GET /vault/read-base64/{vault_id}/{file_id}` | **EXISTS** | Code in `Routes__Vault__Pointer.py`, 3 tests |
| `sgit clone/pull/push/status/init/commit/log/diff/branch` | **EXISTS** | PyPI: `sgit-ai`, GitHub: `SGit-AI/SGit-AI__CLI` |
| Claude as vault peer (read + write via CLI) | **VERIFIED** | Round-trip debrief v0.13.31 |
| SKILL.md self-bootstrapping | **VERIFIED** | New Claude session cloned vault, operated autonomously |
| Vault as async communication channel | **VERIFIED** | Human + Claude exchanged files bidirectionally |

**Known constraint:** Claude.ai bash_tool egress proxy blocks direct HTTP to `send.sgraph.ai`
unless domain is on allowlist. Domain allowlist changes only take effect in a new conversation.

---

## DOES NOT EXIST (Commonly Confused)

| Claimed | Reality |
|---------|---------|
| `structure_key` used for encryption | PROPOSED — derived but never used currently |
| `GET /api/vault/bundle/{vault_id}` (single-call clone) | PROPOSED |
| MCP transport backend for sgit | PROPOSED |
| Merge and conflict resolution | PROPOSED — architecture simulated, no code |
| Nested vaults (vault-inside-vault) | PROPOSED |
| SQLite as local vault storage backend | PROPOSED — future optimisation |

---

## PROPOSED

Key proposals for this domain. Full details: see sub-files in `proposed/`.

- **Structure key encryption split** — activate `structure_key` for structural objects (four-team, 04/28 review) → `proposed/structure-key-split.md`
- **Vault architecture overhaul** — self-describing file IDs, sub-tree model, batch read API → `proposed/vault-architecture.md`
- **SG Vault Hub** — GitHub-equivalent for encrypted vaults, change packs, public view publishing → `proposed/vault-hub.md`
- **Vault browser UI** — auto-commit, auto-sync, history visualisation, in-browser editing → `proposed/vault-browser-ui.md`
- **PKI Modes 2–4** — device provenance, author-identified, countersigned (Mode 1 exists) → `proposed/pki-modes.md`
- **Vault migration / multi-remote** — pull from multiple remotes, migration tooling → `proposed/multi-remote.md`
- **Named branch private key re-keying** — move from `read_key` to `write_key` (deferred, low current impact) → `proposed/structure-key-split.md`

---

## Sub-files

- `proposed/structure-key-split.md` — 04/28 architect review content (the active four-team change)
- `proposed/vault-architecture.md` — self-describing IDs, sub-tree model, storage backends
- `proposed/vault-hub.md` — SG Vault Hub, change packs, public view
- `proposed/vault-browser-ui.md` — auto-commit, auto-sync, history viz, in-browser editing
- `proposed/pki-modes.md` — PKI Modes 2–4, key rotation, YubiKey/TPM
- `proposed/multi-remote.md` — vault migration, multi-remote

*When this index exceeds ~300 lines, create: `crypto.md`, `storage.md`, `browser-js.md`, `pki.md`*
