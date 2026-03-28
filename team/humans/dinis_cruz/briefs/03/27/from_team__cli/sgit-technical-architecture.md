# sgit Technical Architecture

This document describes how sgit works internally: the object model, encryption scheme, branch model, sync protocol, and key derivation flows.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  User's Machine                                                      │
│                                                                      │
│  ┌──────────────────────────┐    ┌──────────────────────────────┐  │
│  │   Working Directory       │    │   .sg_vault/                  │  │
│  │                           │    │                               │  │
│  │   notes.md                │    │   bare/                       │  │
│  │   report.pdf              │◄──►│     objects/   (encrypted)    │  │
│  │   data.csv                │    │     refs/      (encrypted)    │  │
│  │                           │    │     keys/      (named branch) │  │
│  └──────────────────────────┘    │                               │  │
│                                   │   local/                      │  │
│                                   │     clone_key  (NEVER shared) │  │
│                                   │     config.json               │  │
│                                   │     stash/                    │  │
│                                   └──────────────────────────────┘  │
│                                              │                       │
│                                         sgit push                    │
│                                              │                       │
└──────────────────────────────────────────────┼───────────────────────┘
                                               ▼
                               ┌───────────────────────────┐
                               │  SG/Send API Server        │
                               │                            │
                               │  vault/{vault_id}/         │
                               │    objects/  (blobs)       │
                               │    refs/     (pointers)    │
                               │                            │
                               │  Server sees ONLY          │
                               │  encrypted bytes.          │
                               └───────────────────────────┘
```

---

## Object Model

sgit uses a content-addressable object store, similar to git. Every piece of data is stored as an encrypted blob identified by the SHA-256 hash of its decrypted content.

### Object Types

```
┌─────────────────────────────────────────────────────────────┐
│  Object Graph                                                │
│                                                             │
│  Ref (named branch pointer)                                  │
│   └── Commit                                                │
│        ├── parent_commit_id  (previous commit)              │
│        ├── tree_id           (root tree object)             │
│        └── message                                          │
│                                                             │
│  Tree                                                       │
│   ├── file: notes.md  → blob_id                            │
│   ├── file: report.pdf → blob_id                           │
│   └── file: data/row.csv → blob_id                         │
│                                                             │
│  Blob                                                       │
│   └── raw file bytes                                        │
└─────────────────────────────────────────────────────────────┘
```

On disk, each object is stored as:

```
.sg_vault/bare/objects/{first2chars}/{remaining62chars}
```

For example, object `abc123...` → `bare/objects/ab/c123...`

Every object is encrypted before writing. The object's address (the key in the store) is the SHA-256 of the **plaintext content**, so deduplication works across branches.

---

## Encryption

### AES-256-GCM

All objects are encrypted with AES-256-GCM:

```
┌──────────────────────────────────────────────────────────────┐
│  Encrypted Object Format                                      │
│                                                              │
│  [ 12-byte nonce ][ ciphertext ][ 16-byte GCM tag ]          │
│                                                              │
│  - Nonce: random per encryption                              │
│  - Key: 32 bytes, derived from vault key via HKDF or PBKDF2  │
│  - GCM tag: authenticates both nonce and ciphertext          │
└──────────────────────────────────────────────────────────────┘
```

The encryption is byte-for-byte compatible with the Web Crypto API (`AES-GCM` with 256-bit key, 12-byte IV, 128-bit tag) — so browser-based tools can decrypt sgit objects given the same key.

### Key Hierarchy

```
Vault Key  (passphrase:vault_id)
     │
     ├── HKDF-SHA256(info="vault-read-key")
     │         → 32-byte READ KEY
     │         → Used to encrypt/decrypt vault objects
     │
     ├── HKDF-SHA256(info="vault-write-key")
     │         → 32-byte WRITE KEY
     │         → Used for commit signing / integrity
     │
     └── HKDF-SHA256(info="vault-structure-key")
               → 32-byte STRUCTURE KEY
               → Used to encrypt ref names and tree structure
```

HKDF is used for deterministic key derivation from the master vault key. PBKDF2-SHA256 (600,000 iterations) is used when deriving keys from user-provided passphrases.

### Branch Key Isolation

Each named branch has its own asymmetric key pair:

```
Named Branch
  private key  → .sg_vault/bare/keys/{branch_id}.priv  (encrypted with vault read key)
  public key   → pushed to server as branch metadata

Clone Branch
  private key  → .sg_vault/local/{branch_id}.priv     (NEVER pushed)
  public key   → embedded in named branch objects
```

When you push, objects encrypted with the clone branch key are re-encrypted for the named branch key. The server only ever sees named-branch-encrypted content.

---

## Branch Model

```
Server                              Local
──────────────────                  ──────────────────────────────────

Named Branch (main)                 Clone Branch (clone of main)
  ┌───────────┐                       ┌───────────┐
  │ commit C3 │ ◄── push ──────────── │ commit C3 │◄── your work
  │ commit C2 │                       │ commit C2 │
  │ commit C1 │                       │ commit C1 │
  └───────────┘                       └───────────┘
  encrypted with                      encrypted with
  named branch key                    clone branch key
  (shared)                            (local only)
```

**Why two keys?**

The clone branch key never leaves your machine. If someone intercepts your push, they only see objects encrypted with the named branch key. The private key for the named branch lives in `.sg_vault/bare/keys/` and is itself encrypted with the vault read key — so even a stolen vault directory is only as exposed as the vault key.

**Switching branches:**

```
sgit switch feature-x
      │
      ├── Look for existing clone branch pointing to feature-x
      │     with private key available locally
      │
      ├── If found: reuse it (no new key generated)
      │
      └── If not found: create new clone branch
                         generate new clone key pair
                         check out named branch HEAD
```

---

## Commit Flow

```
sgit commit "message"
      │
      ▼
1. Scan working directory
      │
      ▼
2. Hash each file: SHA-256(content) → blob_id
      │
      ▼
3. Compare with HEAD tree
   → new/modified files: write new blob objects
   → deleted files: omit from new tree
      │
      ▼
4. Write tree object (maps path → blob_id)
      │
      ▼
5. Write commit object
   { parent: HEAD, tree: tree_id, message: ..., timestamp: ... }
      │
      ▼
6. Update clone branch ref → new commit_id
      │
      ▼
All written to .sg_vault/bare/objects/ (encrypted with clone branch key)
```

---

## Push Flow

```
sgit push
      │
      ▼
1. Compute set of new objects (local commits not on server)
      │
      ▼
2. For each new object:
   a. Decrypt with clone branch key
   b. Re-encrypt with named branch key
   c. Upload to server: PUT /vault/{vault_id}/objects/{obj_id}
      │
      ▼
3. Upload branch ref update: PUT /vault/{vault_id}/refs/{branch_id}
      │
      ▼
4. Server stores opaque encrypted blobs.
   Server cannot read content or filenames.
```

---

## Pull Flow

```
sgit pull
      │
      ▼
1. Fetch named branch ref from server
      │
      ▼
2. Walk commit chain from server ref back to common ancestor
      │
      ▼
3. Download missing objects
      │
      ▼
4. Decrypt with named branch key, re-encrypt with clone branch key
      │
      ▼
5. Fast-forward clone branch ref
      │
      ▼
6. Check out HEAD tree to working directory
```

---

## Simple Token Derivation

Simple Tokens (`word-word-NNNN`) derive both the transfer identifier and the encryption key entirely on the client. The server never sees the token.

```
Token: "river-cloud-3847"
          │
          ├── SHA-256(token)[:12]  →  transfer_id  (24 hex chars)
          │                            used to address the upload
          │
          └── PBKDF2-HMAC-SHA256(
                  password  = token.encode('utf-8'),
                  salt      = b'sgraph-send-v1',
                  iterations= 600_000,
                  length    = 32
              )  →  aes_key  (32 bytes)
                   used to AES-256-GCM encrypt the payload
```

This is fully browser-interoperable: the Web Crypto API can derive the same key given the same token, enabling web-side decryption without any server-side knowledge.

---

## Multi-Level Archive (publish / export)

```
sgit publish / sgit export
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  Outer ZIP  (encrypted with Simple Token AES key)        │
│                                                         │
│  ├── manifest.json                                      │
│  │     { vault_id, created_at, files, inner_key_type,  │
│  │       inner_key_id, description, provenance }        │
│  │                                                      │
│  ├── inner.zip.enc                                      │
│  │     ← Inner ZIP encrypted with random AES key        │
│  │       Inner ZIP contains actual vault files          │
│  │                                                      │
│  └── decryption-key.bin                                 │
│        ← random AES key, encrypted with vault read key  │
│          (inner_key_type = "vault_key")                  │
│          or plaintext if inner_key_type = "none"         │
└─────────────────────────────────────────────────────────┘
```

**Decryption flow for recipient:**

1. Recipient has the Simple Token → derives outer AES key
2. Decrypt outer ZIP
3. Read `manifest.json` to find `inner_key_type`
4. If `inner_key_type = "vault_key"`: decrypt `decryption-key.bin` with vault read key
5. Use decrypted random key to decrypt `inner.zip.enc`
6. Extract files from inner ZIP

---

## File System Layout

```
vault-directory/
├── file1.txt                    ← user files (untouched by sgit)
├── file2.md
│
└── .sg_vault/
    ├── bare/
    │   ├── objects/
    │   │   ├── ab/
    │   │   │   └── cdef1234...  ← encrypted blob/tree/commit
    │   │   └── ...
    │   ├── refs/
    │   │   ├── branch-named-deadbeef  ← encrypted ref (head commit id)
    │   │   └── branch-clone-12345678
    │   └── keys/
    │       └── branch-named-deadbeef.priv  ← named branch private key
    │                                          (encrypted with vault read key)
    │
    └── local/
        ├── config.json           ← vault ID, remote URL, current branch
        ├── branch-clone-12345678.priv  ← clone branch private key (NEVER pushed)
        └── stash/
            └── stash-1711540000.zip  ← stashed working copy
```

---

## Transfer API Protocol

sgit communicates with the SG/Send Transfer API over HTTPS. All objects are pre-encrypted before upload.

```
Upload:
  PUT /api/vault/write
      body: { key: "{vault_id}/objects/{obj_id}", value: <base64> }

Download:
  GET /api/vault/read?key={vault_id}/objects/{obj_id}
      → { value: <base64> }

Batch:
  POST /api/vault/batch
       body: [ { op: "write", key: ..., value: ... }, ... ]

List:
  GET /api/vault/list?prefix={vault_id}/objects/
      → [ key1, key2, ... ]
```

For Simple Token transfers:

```
Initiate:
  POST /api/presigned/initiate
       { transfer_id: SHA-256(token)[:12] }

Upload chunk:
  PUT /api/presigned/upload-url → presigned S3 URL
  PUT <presigned-url>  body=encrypted_bytes

Complete:
  POST /api/presigned/complete
       { transfer_id: ... }

Download:
  GET /api/presigned/download-url?transfer_id=...
  GET <presigned-url> → encrypted_bytes
  decrypt with PBKDF2-derived key
```

---

## Type_Safe Framework

All internal data models use `osbot_utils.Type_Safe`, which enforces:

- **No raw primitives** — every field uses a `Safe_*` type (e.g. `Safe_Str__Vault_Id`, `Safe_UInt__Version`)
- **Immutable defaults** — no mutable default arguments
- **Round-trip JSON** — every schema satisfies `obj == cls.from_json(obj.json())`
- **Validation on assignment** — `Safe_Str` subclasses apply regex, max_length, and allow_empty rules at assignment time

```python
class Schema__Vault_Meta(Type_Safe):
    vault_id   : Safe_Str__Vault_Id   = None
    version    : Safe_UInt__Version
    name       : Safe_Str__Vault_Name = None
    created_at : Timestamp_Now        # milliseconds since epoch
```

---

## Security Properties

| Property | How it's achieved |
|---|---|
| Server blindness | All objects encrypted before upload; server stores opaque blobs |
| Key isolation | Clone branch private key never leaves local machine |
| Named branch key protection | Stored encrypted with vault read key |
| Token forward secrecy | Each `sgit share` derives a fresh token; old tokens don't grant new access |
| Content deduplication | Object IDs are SHA-256 of plaintext, so identical files deduplicate across commits |
| Integrity | AES-GCM tag detects any tampering |
| Browser interop | AES-256-GCM + PBKDF2 parameters match Web Crypto API exactly |

---

## Module Map

```
sgit_ai/
├── _version.py
│
├── safe_types/          Safe_* validation types
│   ├── Safe_Str__Vault_Id.py
│   ├── Safe_Str__Branch_Id.py
│   ├── Safe_Str__Simple_Token.py
│   └── ...
│
├── schemas/             Pure data schemas (Type_Safe)
│   ├── Schema__Vault_Meta.py
│   ├── Schema__Vault_Archive_Manifest.py
│   └── ...
│
├── crypto/              Encryption / key derivation
│   └── Vault__Crypto.py       AES-256-GCM, HKDF, PBKDF2
│
├── sync/                Local vault logic
│   ├── Vault__Sync.py         init, commit, push, pull, status
│   ├── Vault__Diff.py         working copy diff
│   ├── Vault__Revert.py       restore past commit
│   ├── Vault__Stash.py        stash / pop
│   ├── Vault__Dump.py         structural JSON dump
│   ├── Vault__Dump_Diff.py    compare two dumps
│   └── Vault__Branch_Switch.py
│
├── transfer/            SG/Send API integration
│   ├── Simple_Token.py        derive transfer_id + aes_key
│   ├── Simple_Token__Wordlist.py
│   ├── Vault__Transfer.py     share flow
│   └── Vault__Archive.py      multi-level zip
│
└── cli/                 CLI entry point
    ├── CLI__Main.py           argument parser, subcommand dispatch
    ├── CLI__Vault.py          init, commit, status, push, pull, ...
    ├── CLI__Share.py          share
    ├── CLI__Publish.py        publish
    ├── CLI__Export.py         export
    ├── CLI__Diff.py           diff
    ├── CLI__Revert.py         revert
    ├── CLI__Stash.py          stash
    ├── CLI__Branch.py         branch / switch
    └── CLI__Dump.py           dump / diff-state
```
