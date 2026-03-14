# SG Vault vs Git: What's the Same, What's Different

**version** v0.13.30
**date** 14 Mar 2026
**audience** Developers familiar with Git

---

## Overview

SG Vault is designed to feel familiar to anyone who uses Git. The workflow,
the data model, and the mental model are intentionally aligned. This document
walks through the specifics — what maps 1:1 to Git, and where SG Vault
diverges.

---

## What Maps Directly to Git

### The Commit Graph

Like Git, SG Vault uses a Directed Acyclic Graph of commits. Each commit
references a root tree, parent commits (one for normal, two for merge),
a timestamp, a message, and a branch ID. The history is traversable from
any commit back to the root.

### Tree-Per-Folder Structure

One tree object per directory level — the exact Git model. Trees reference
blobs (files) and other trees (subdirectories). A commit's `tree_id` points
to the root tree, which recursively captures the complete snapshot.

This means:

- Changing one file only produces new objects on the path from root to that
  file. Everything else is unchanged and shared within the same commit chain.
- Merging can skip entire subdirectories by comparing tree IDs — if the
  tree ID matches, the entire folder is identical.

### Content-Addressed Storage (with a Privacy Trade-Off)

Objects are stored as `obj-{hash}` in `bare/data/`, but the hash is of
the **encrypted** content, not the plaintext. Since AES-GCM uses a fresh
nonce each encryption, the same plaintext encrypted twice produces different
ciphertext — and therefore different object IDs.

This is a deliberate divergence from Git. In Git, identical content anywhere
in the repo produces the same hash and is stored once (full deduplication).
In SG Vault, that would leak content equality to the server — an attacker
could see "these two objects in different folders contain the same file"
without decrypting anything.

SG Vault sacrifices cross-repo deduplication for zero-knowledge privacy.
The same file in two different folders will be stored as two separate
encrypted objects with different hashes.

For **client-side** change detection, tree entries include a `content_hash`
field (`SHA256(plaintext)[:12]`) — but this is encrypted inside the tree
entry, invisible to the server. The client uses it to detect same-size
edits reliably without re-downloading blobs.

### Branching and Merging

SG Vault supports branches, merging, diverging histories, and standard
push/pull workflows. Merges produce merge commits with two parents.

### The Standard Workflow

```
init   → commit → push
clone  → edit   → commit → push
pull   → merge  → resolve → push
```

A developer working with SG Vault would find the workflow very familiar.

---

## Where SG Vault Diverges

### 1. Everything is Encrypted

All objects (blobs, trees, commits, refs, branch metadata, keys) are
encrypted with the vault's `read_key` using AES-GCM before storage. File
names are encrypted inside tree entries. Even the branch index is encrypted.

The server sees opaque blobs grouped by type folder. It cannot tell which
objects are blobs vs trees vs commits.

**Git equivalent:** There is none. Git stores everything in plaintext.
GitHub can read your entire repository.

### 2. Commit Signing is Mandatory

Every commit is signed by the branch key that created it. The signature
covers: `tree_id`, `parents`, `timestamp`, `message`, and `branch_id`.
Tampering with any field invalidates the signature.

**Git equivalent:** `git commit -S` with GPG. But in Git this is optional
and rarely used. In SG Vault it's mandatory — unsigned commits cannot exist.

### 3. Branch-Per-Clone Identity

Every `clone()` auto-generates an EC P-256 key pair. This branch IS the
clone's cryptographic identity. All commits from that clone are signed by
its key. The private key never leaves the device.

**Git equivalent:** No direct equivalent. Git branches are just movable
pointers; they don't have cryptographic identities.

### 4. The Three-Layer Model

SG Vault uses a three-layer collaboration model that differs from Git's
remote/local model:

```
REMOTE
  "current" named branch         ← authoritative, other users push here

LOCAL
  "current" named branch (copy)  ← fast-forwards to match remote, never conflicts
  your clone work branch          ← your commits go here, conflicts appear HERE
```

Merge directions are strict:

- Remote → local current: **fast-forward only**
- Local current → clone branch: **merge** (conflicts HERE)
- Clone branch → local current: **merge** (always clean)
- Local current → remote: **push**

The named branch never has conflicts. Your clone branch absorbs all
conflicts. This keeps the integration branch permanently clean.

**Git equivalent:** Similar to a protected `main` with feature branches,
but enforced at the architecture level, not by policy.

### 5. No Staging Area

SG Vault has no `git add`. Commit always snapshots the entire working
directory. There is no equivalent of partial staging.

**Git equivalent:** `git add -A && git commit` — always.

### 6. Non-Destructive Conflict Handling

SG Vault never writes merge markers into your files. Instead:

```
README.md              ← your version, untouched
README.conflict.md     ← their version
```

You resolve by editing `README.md` as needed, then deleting the `.conflict`
file.

**Git equivalent:** No direct equivalent. Git inline-marks the conflicted
file, which modifies it. SG Vault preserves the original.

### 7. Zero-Knowledge File Paths

File paths in Git are plaintext in tree objects. In SG Vault, filenames
are encrypted inside tree entries (`name_enc` field). The server cannot
see file names, folder structures, or any content relationships.

Even the IDs are opaque: `branch-named-a3f8c2`, `ref-7b2e1d`, `obj-c9a4f1`.
The server knows there are N branches, M refs, and P data objects. It
cannot determine what any of them contain or how they relate.

### 8. Portable Vault as Unit

The `bare/` folder IS the vault. It's identical on the server, on local
disk, and packed as a zip. Delete the server → `bare/` is a complete backup.
Delete `bare/` → the server is a complete backup. They are equals.

The server only needs four operations: `read`, `write`, `delete`, `list`.
This means vaults can be hosted on SG/Send, S3, a local folder, or a zip
file.

**Git equivalent:** A `git clone --bare` gives you the repo without a
working copy. Same concept — the vault without the checkout.

### 9. uint Timestamps

All timestamps are unsigned integers (milliseconds since epoch) — never
ISO datetime strings. This is compact, sortable, timezone-free, and reveals
no human-readable temporal information on the server.

---

## Quick Reference Table

| Concept | Git | SG Vault |
|---------|-----|----------|
| Object store | `.git/objects/` | `bare/data/obj-{hash}` |
| Object hash input | plaintext content | encrypted ciphertext |
| Cross-repo dedup | yes (same content = same hash) | no (by design — prevents leaking content equality) |
| Refs | `.git/refs/heads/main` | `bare/refs/ref-{opaque_id}` |
| Branch metadata | pointer in `.git/refs/` | encrypted file in `bare/branches/` |
| Tree granularity | one per folder | one per folder (same) |
| Commit parents | `parent` field(s) | `parents: []` list |
| Commit signing | optional GPG | mandatory EC P-256 |
| Content encryption | none | AES-GCM (all objects) |
| Filename visibility | plaintext in trees | encrypted in tree entries |
| Staging area | `git add` | none (full-snapshot commits) |
| Conflict handling | inline markers | `.conflict` files |
| Server intelligence | full repo access | dumb blob store |
| Remote backends | Git protocol, HTTP | S3, SG/Send, folder, zip |

---

*SGraph Send — v0.13.30 — 14 March 2026*
