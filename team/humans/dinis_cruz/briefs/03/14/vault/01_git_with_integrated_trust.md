# SG Vault: Git with Integrated Trust

**version** v0.13.30
**date** 14 Mar 2026
**audience** Team, stakeholders, and anyone who asks "what are you building?"

---

## The One-Liner

SG Vault is **Git with integrated trust** — a version control system that
preserves the familiar Git workflow while adding end-to-end encryption,
cryptographic identity, and verifiable provenance at the architecture level.

You clone, commit, push, pull, merge. But every commit is signed. Every
file is encrypted. And the server never sees your content.

---

## Why This Exists

Traditional Git provides **integrity** — the commit graph can't be silently
tampered with because every object is content-addressed by its hash.

But Git doesn't provide **identity** or **confidentiality**:

- `author: alice@example.com` is metadata anyone can forge
- GitHub verifies identity via account systems, not cryptography
- The hosting platform reads your repository contents in full
- You trust the platform to correctly represent who changed what

SG Vault replaces platform trust with **cryptographic trust**.

Every commit is signed by the branch key that created it. Every file is
encrypted before it leaves the client. The server stores only opaque
encrypted blobs. Even if the server is compromised, the integrity and
authorship of every change remains verifiable.

---

## What Stays the Same as Git

If you've used Git, you already know how SG Vault works:

**Commit graph.** Commits form a Directed Acyclic Graph (DAG). Each commit
references a root tree, parent commits, metadata, a message, and a timestamp.

**Tree structure.** One tree object per directory level — exactly the Git
model. Trees reference blobs (files) and other trees (subdirectories). A
commit captures a complete snapshot.

**Branching and merging.** Branches diverge, merge back together, and
maintain independent histories.

**Clone, push, pull.** Standard collaboration: clone a vault, make changes
locally, push them to the remote, pull others' changes.

**Content-addressed storage.** Objects are identified by the hash of their
encrypted content. Within a commit chain, unchanged files are referenced
by the same object ID — the same encrypted blob, stored once, pointed to
by multiple trees. This is pointer reuse, not deduplication: the blob was
encrypted once, and its ciphertext hash is reused wherever that exact
encrypted object appears. Unlike Git, SG Vault deliberately does not
deduplicate across independent encryptions — because AES-GCM uses a fresh
nonce each time, identical plaintext encrypted twice produces different
ciphertext and therefore different object IDs. This is a conscious
trade-off: a small amount of extra storage in exchange for not leaking
content equality to the server.

For roughly 90% of what developers do with Git — create a repo, commit,
push, clone, pull, merge — the workflow is the same.

---

## What's Different

### End-to-End Encryption

All content is encrypted on the client before anything touches the network.
The server stores only encrypted blobs with opaque filenames. It cannot read
file contents, filenames, branch names, or commit metadata.

The server sees:

```
bare/branches/branch-named-a3f8c2    (opaque blob)
bare/data/obj-c9a4f1                 (opaque blob)
bare/keys/key-9b3e7f                 (opaque blob)
bare/refs/ref-7b2e1d                 (opaque blob)
```

It knows folder counts and file sizes. It knows nothing else.

### PKI-Based Identity

Every branch has an EC P-256 key pair. Every commit is signed by the branch
key that created it. This isn't optional — there are no unsigned commits.

This produces a verifiable chain: `commit → branch key → device/session`.
You don't just know *what* changed — you have cryptographic proof of *who*
changed it, at the key level.

### Branch = Cryptographic Identity

Every `clone()` auto-generates a new key pair. The clone branch *is* your
identity. All your commits are signed by your branch key. This works equally
well for humans, CI systems, automated agents, and AI tools.

### Non-Destructive Conflict Handling

Git writes merge markers directly into your files:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> branch
```

SG Vault never modifies the original file. Instead, it creates a `.conflict`
file alongside it:

```
README.md              ← untouched
README.conflict.md     ← the other version
```

The original content is always preserved.

### Zero-Knowledge Server

Git hosting platforms can read everything in your repository. SG Vault
servers cannot. The server is intentionally "dumb" — it supports
`read`, `write`, `delete`, and `list`. No repository logic required. This
means vaults can be stored on S3, local folders, zip archives, or any
object store backend.

---

## The Trust Model, Compared

| Property | Git | Git + GitHub | SG Vault |
|----------|-----|-------------|----------|
| Content integrity | ✓ (SHA hashes) | ✓ | ✓ (SHA hashes) |
| Content confidentiality | ✗ | ✗ | ✓ (AES-GCM) |
| Author identity | ✗ (forgeable) | Platform trust | ✓ (PKI signatures) |
| Commit signing | Optional (GPG) | Optional | **Mandatory** |
| Server reads content | N/A | Yes | **No** |
| Provenance verification | ✗ | Account-based | **Cryptographic** |
| Works if server compromised | N/A | No | **Yes** |

---

## Implementation Simplicity

The architecture is currently implemented in Python, but nothing in the
design depends on Python. The entire system is built from a few primitives:
`blob`, `tree`, `commit`, `ref`, `branch`, `key`. These are the same
fundamental building blocks Git uses.

The only component that adds meaningful complexity is PKI signing — key
generation, commit signatures, and signature verification. Everything else
is straightforward data structures and encrypted storage.

This means:

- The design is language-agnostic (Go, Rust, Java, Node.js, anything)
- Reference implementations are easy to build
- The protocol is easy to audit
- The system is easy to reason about

---

## Summary

SG Vault is not a replacement for Git. It's what Git would look like if
it had been designed with encryption and identity from day one:

- **Same workflow:** clone, commit, push, pull, merge
- **Same data model:** blobs, trees, commits, refs, branches
- **Added:** end-to-end encryption, mandatory commit signing, cryptographic
  provenance, zero-knowledge server, non-destructive conflict handling
- **Result:** a versioning system where trust is in the math, not the platform

> Git provides integrity. SG Vault provides integrity + identity + provenance.

---

*SGraph Send — v0.13.30 — 14 March 2026*
