# Architecture Simplicity

**version** v0.13.30
**date** 14 Mar 2026
**audience** Developers evaluating the system, potential contributors

---

## A Small Set of Primitives

The entire SG Vault architecture is built from six primitives:

| Primitive | What it is | Git equivalent |
|-----------|-----------|---------------|
| **blob** | Encrypted file content | git blob |
| **tree** | Encrypted directory listing (one per folder) | git tree |
| **commit** | Signed snapshot with parents, message, timestamp | git commit |
| **ref** | Mutable pointer to a commit (encrypted) | git ref |
| **branch** | Encrypted metadata + key pair identity | git branch (but with PKI) |
| **key** | Public or private key (encrypted in vault) | no equivalent |

These live in a flat, folder-grouped storage layout:

```
bare/
├── branches/    branch metadata files
├── refs/        mutable commit pointers
├── data/        content-addressed objects (blobs, trees, commits)
├── keys/        cryptographic keys
├── indexes/     eventually-consistent lookup indexes
└── pending/     change packs (inbound contributions)
```

The server needs no knowledge of what any of this means. It stores files
and serves them back. That's it.

---

## Server Simplicity

The server only needs four operations:

```
read(file_id)    → bytes
write(file_id, bytes)
delete(file_id)
list(prefix)     → [file_id, ...]
```

No repository logic. No merge engine. No auth against individual files
(beyond a simple vault-scoped write token). No understanding of branches,
commits, trees, or content.

This means a vault can be stored on:

- **SG/Send** — the primary hosted backend
- **S3** — any S3-compatible object store
- **Local folder** — a directory on disk
- **Zip file** — `sg-send-cli export` zips `bare/`, a recipient unzips
  it, creates their own `local/`, and has a working vault

The backend abstraction is four functions. Adding a new backend is
trivial.

---

## Where the Complexity Actually Lives

The architecture has exactly one area of meaningful complexity: **PKI
signing**. This includes key generation (EC P-256), commit signature
creation, and signature verification.

Everything else follows straightforward patterns:

- **Storage:** encrypted blob in, encrypted blob out. Content-addressed
  by hash.
- **Trees:** JSON list of entries, each with an encrypted filename and
  a pointer to a blob or sub-tree.
- **Commits:** JSON with `tree_id`, `parents`, `timestamp`, `message`,
  `branch_id`, and `signature`. One tree per directory level, same as Git.
- **Refs:** a single encrypted value — the commit object ID.
- **Merging:** three-way merge at the sub-tree level. Compare tree IDs
  at each directory level; skip entire sub-trees that haven't changed.
- **Conflict handling:** create a `.conflict` file. No merge markers,
  no file corruption.

---

## Language-Agnostic Design

The system is currently implemented in Python. Nothing in the design
depends on Python.

The core requirements are:

- AES-GCM encryption/decryption
- EC P-256 key generation and signing
- SHA-256 hashing
- JSON serialisation
- HTTP client (for remote backends)

Every modern language has mature libraries for all of these. A reference
implementation in Go, Rust, Java, Node.js, or C++ would be straightforward.

The object model is JSON. The storage model is flat files with opaque names.
The API is four functions. There are no exotic dependencies, no custom binary
formats, and no protocol buffers.

---

## What This Means in Practice

- **Implementations are easy to audit.** Small primitive count, simple
  storage model, JSON objects.
- **Reference clients are easy to build.** A minimal CLI needs: encrypt,
  decrypt, sign, verify, hash, and four storage operations.
- **The protocol is easy to understand.** You can read a commit object and
  know what it means without external documentation.
- **Interoperability is natural.** Any implementation that follows the
  object schemas and storage layout can read and write the same vault.

The goal: strong cryptographic guarantees with a system that fits in
your head.

---

*SGraph Send — v0.13.30 — 14 March 2026*
