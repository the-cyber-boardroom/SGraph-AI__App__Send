# sg-vault Architecture Specification: Branch Model, Unified Storage, and Collaboration

**version** v0.13.30  
**date** 13 Mar 2026  
**role** Architect  
**status** Specification - ready for team review and implementation  
**validated by** Simulation document v6 (14 gaps found and resolved, 5 scenarios traced)  
**supersedes** `v0.13.30__arch-exploration__branch-model.md` (draft), `v0.13.30__arch-exploration__vault-filesystem.md` (draft)  

---

## 1. Overview

This document specifies the branch model, unified storage layout, and collaboration
workflows for sg-vault - the encrypted vault system underlying SG/Send and the
`sg-send-cli` tool.

Every design decision in this document has been validated by executing the
architecture as a simulation (see companion document `v0.13.30__arch-simulation-v6`)
before writing any production code. The simulation traced 5 scenarios across ~20
steps, predicting every file, key, object, and API call. Fourteen architectural
gaps were found and resolved through that process.

### Design Principles

1. **Zero knowledge.** The server stores only opaque encrypted blobs. No filenames,
   no branch names, no relationships, no content visible to the server.
2. **Cryptographic identity.** Every branch has a key pair. Every commit is signed.
   Provenance is in the graph, not in policy.
3. **Remote is authority.** The remote named branch always takes precedence. You
   must accept remote commits before you can push.
4. **Conflicts on clone branch only.** The named branch never has conflicts.
   Your clone branch absorbs conflicts; you resolve there.
5. **Bare vault is the portable unit.** `bare/` is the vault. It syncs to the
   server, packs into a zip, and survives deletion of either side.
6. **uint timestamps everywhere.** All timestamps use `Timestamp_Now` from
   `osbot-utils` (uint milliseconds since epoch). Never ISO datetime strings.

---

## 2. The Three-Layer Model

Every vault has three layers. Work flows upward through them.

```
  REMOTE (SG/Send, S3, folder, zip - any backend)
  ┌──────────────────────────────────────────┐
  │  "current" named branch                  │  authoritative
  │  other users push here                   │
  └──────────────────┬───────────────────────┘
                     │
   ── ── ── ── ── ── │ ── ── network boundary ── ── ── ──
                     │
  LOCAL              │
  ┌──────────────────▼───────────────────────┐
  │  "current" named branch (local copy)     │  fast-forwards to match remote
  │  receives merges FROM clone branch       │  NEVER has conflicts
  └──────────────────┬───────────────────────┘
                     │
  ┌──────────────────┴───────────────────────┐
  │  your clone work branch                  │  commits go here
  │  absorbs current via merge               │  conflicts appear HERE
  └──────────────────────────────────────────┘
```

**Merge directions (always):**

```
  remote  ──fast-forward──►  local current     (accept authority)
  local current  ──merge──►  clone branch      (conflicts HERE, signed clone key)
  clone branch   ──merge──►  local current     (always clean, signed current key)
  local current  ──push──►   remote
```

---

## 3. Storage Layout

### 3.1 The Two Folders

```
  .sg_vault/
  ├── bare/           ← THE vault. Portable. Syncs. Is the zip.
  └── local/          ← YOUR device config. Never syncs.
```

**`bare/`** is the complete, self-contained vault. It is identical on the server,
on local disk, and packed as a zip. Delete the server → `bare/` is a complete
backup. Delete `bare/` → the server is a complete backup. They are equals.

**`local/`** is purely device-specific: your clone private key, vault key, token,
remote config, tracking state. It never leaves the device and is never synced.

A **bare clone** (`sg-send-cli clone --bare`) produces only `bare/` with no
`local/vault_key`, no `local/branch_key.pem`, and no plaintext working copy.

### 3.2 Inside bare/ - Folder-Grouped, Opaque Filenames

Folders provide type grouping (acceptable metadata - the server knows "there
are 3 refs"). Filenames within each folder are opaque IDs. All content is
encrypted with the vault `read_key`.

```
  bare/
  ├── branches/
  │   ├── branch-named-{id}                  🔒 encrypted branch metadata
  │   └── branch-clone-{id}                  🔒 encrypted branch metadata
  │
  ├── refs/
  │   └── ref-{id}                           🔒 ENC(read_key, commit_obj_id)
  │                                            (mutable - the only mutable files
  │                                             besides indexes)
  │
  ├── data/
  │   └── obj-{hash}                         🔒 could be blob, tree, or commit
  │                                            (immutable, content-addressed)
  │                                            (client discovers type via schema
  │                                             field after decryption)
  │
  ├── keys/
  │   └── key-{id}                           🔒 public or private key
  │                                            (server can't tell which)
  │
  ├── indexes/
  │   └── idx-{id}                           🔒 eventually-consistent index
  │                                            (accurate after GC or explicit
  │                                             index-update; may be stale
  │                                             between syncs)
  │
  └── pending/
      └── pending-{uint_ts}_{random}         🔒 change pack (signed, self-contained)
```

### 3.3 Inside local/

```
  local/
  ├── branch_key.pem                         🔑 clone branch private key
  │                                            (NEVER LEAVES THIS DEVICE)
  ├── vault_key                               vault passphrase:vault_id
  ├── my_branch_id                            "branch-clone-{id}"
  ├── token                                   API auth token
  ├── remotes.json                            { "origin": { url, vault_id } }
  └── tracking.json                           { ref_id: last_known_commit_id }
```

### 3.4 What the Server Sees

```
  bare/branches/branch-named-a3f8c2          (opaque blob)
  bare/branches/branch-clone-p4n8v2          (opaque blob)
  bare/refs/ref-7b2e1d                       (opaque blob)
  bare/refs/ref-a3f8c2                       (opaque blob)
  bare/data/obj-c9a4f1                       (opaque blob)
  bare/data/obj-d8b3e7                       (opaque blob)
  bare/keys/key-9b3e7f                       (opaque blob)
  bare/indexes/idx-m8n4r1                    (opaque blob)

  Server knows:
    ✓ Folder structure (how many branches, refs, objects, keys)
    ✓ File sizes

  Server does NOT know:
    ✗ Branch names or who owns them
    ✗ Which ref belongs to which branch
    ✗ Which key belongs to which branch
    ✗ Which data objects are blobs vs trees vs commits
    ✗ File names, folder structure, any vault content
    ✗ Any relationships between entities
```

---

## 4. Object Model

### 4.1 Three Object Types

All objects live in `bare/data/` as `obj-{hash}`. The server cannot distinguish
between them. The client discovers the type by decrypting the object and reading
the `schema` field.

**blob** - encrypted file content

```json
  {
    "schema": "blob_v1",
    "content": "<raw file bytes>"
  }
```

**tree** - encrypted list of entries (one tree per directory level)

```json
  {
    "schema": "tree_v1",
    "entries": [
      {
        "name_enc": "<AES-GCM encrypted filename>",
        "blob_id": "obj-{hash}",
        "size_enc": "<AES-GCM encrypted file size>",
        "content_hash": "<SHA256(plaintext)[:12]>"
      },
      {
        "name_enc": "<AES-GCM encrypted folder name>",
        "tree_id": "obj-{hash}"
      }
    ]
  }
```

Entries with `blob_id` are files. Entries with `tree_id` are sub-folders.
The distinction is structural, not declared - there is no "type: folder" field.
This is the git model: a folder exists only as a tree node pointing to other nodes.

File names are encrypted in tree entries. The server sees only opaque IDs and
encrypted names. `size_enc` and `content_hash` are also encrypted.

`content_hash` fixes the size-only change detection bug in the current codebase
(line 359 of `Vault__Sync.py`). Same-size edits are now detected reliably.

One tree object per directory level (the git model). No configurable granularity.

**commit** - encrypted snapshot with provenance

```json
  {
    "schema": "commit_v1",
    "tree_id": "obj-{root_tree_hash}",
    "parents": ["obj-{parent_commit_hash}", "obj-{second_parent_hash}"],
    "timestamp": 1710244800000,
    "message": "add initial files",
    "branch_id": "branch-clone-{id}",
    "signature": "<SIGN(branch_private_key, hash_of_above_fields)>"
  }
```

`parents` is a list: normal commits have 1 parent, merge commits have 2,
the root commit has 0. This replaces the single `parent` field in the current
`Schema__Object_Commit`. Backward compatibility: read old single-parent format
by treating `parent` as `parents: [parent]`.

Every commit is signed by the branch key that created it. This is mandatory -
there are no unsigned commits.

### 4.2 Graph Traversal

To read a file at `configs/EC2.json`:

```
  1. read branch index → find "current" → get head ref ID
  2. read ref → get commit ID
  3. read commit → get root tree ID
  4. read root tree → decrypt entries → find "configs" → get sub-tree ID
  5. read sub-tree → decrypt entries → find "EC2.json" → get blob ID
  6. read blob → decrypt → file content
```

Cost: depth + 2 reads (ref + commit + one per tree level + blob).
For a top-level file: 4 reads. For `a/b/c/file.txt`: 6 reads.

### 4.3 Sub-Tree Benefits

1. **Natural delta push.** Change one file → only the changed blob and the
   tree nodes on the path from root to that blob are new. Everything else is
   unchanged and already on the server. No diff algorithm needed.

2. **Automatic deduplication.** Identical sub-trees across branches share the
   same content-addressed objects. One copy stored, referenced by many commits.

3. **Granular access.** Read one file without loading the full tree. Only
   traverse the path to that file.

4. **Cheap merge.** Compare `tree_id` values at each level. If a sub-tree ID
   is the same in both branches, the entire sub-folder is identical - skip it.

5. **No translation layer.** Eliminates `_flatten_tree()` and `_build_tree_json()`.
   The vault IS the graph.

---

## 5. Branch Model

### 5.1 Branch Per Clone

Every `clone()` generates a new EC P-256 key pair. The branch is the clone's
cryptographic identity.

```
  clone() → generate EC P-256 key pair
          → branch_id = "branch-clone-" + random_id
          → push public key to vault
          → all commits signed by this key
```

| Property | What it gives us |
|----------|-----------------|
| Provenance | Every commit traces to a branch → key pair → device/session |
| Isolation | You can only write to your own branch |
| Push always succeeds | Your branch is yours alone - no remote conflicts |
| Anonymous by default | Branch key proves "same entity" without revealing identity |
| Agent-native | AI agents get the same first-class identity as humans |

### 5.2 Two Kinds of Private Keys

| Key type | Leaves device? | Where stored | Lost = |
|----------|---------------|--------------|--------|
| Clone branch private key | NEVER | `local/branch_key.pem` | Branch permanently locked |
| User's main key pair | Yes (multi-device) | `~/.sg-send/`, keychain, another vault | Re-import from backup |

The clone branch private key is deliberately local-only. It is the provenance
record for this specific clone/device/session. If the same key appeared on two
devices, provenance is broken.

Permanently locking a branch = deleting the private key. No ceremony, no command.
The branch history remains intact and verifiable. This is a normal lifecycle event.

### 5.3 Named Branches

A named branch (e.g. "current") is a special branch type that:

- Has its own PKI identity (key pair)
- Can ONLY receive merges - direct commits are rejected
- Is the authoritative integration point

The named branch private key is stored in the vault, encrypted with the vault
`read_key`. Anyone with the vault key can decrypt it and perform merges. This
is the **open** named branch - the common case.

```
  bare/keys/key-{id} = ENC(read_key, named_branch_private_key)
```

**Locked named branches:** The private key is additionally wrapped with a
specific user's public key. Only that user can decrypt it and merge. Even
someone with the vault key cannot forge a merge.

```
  Open:   ENC(read_key, private_key)                    → anyone with vault key
  Locked: ENC(read_key, ENC(user_pub_key, private_key)) → only that user
```

**Quorum / multi-sig:** Noted as future design space. Not in initial implementation.

### 5.4 The Encrypted Branch Index

Branch discovery uses an encrypted index at `bare/indexes/idx-{id}`:

```json
  {
    "schema": "branch_index_v1",
    "branches": {
      "branch-named-x7k2": {
        "name": "current",
        "type": "named",
        "head_ref_id": "ref-a3f8",
        "public_key_id": "key-9b3e",
        "private_key_id": "key-d4a1",
        "created_at": 1710244800000
      },
      "branch-clone-p4n8": {
        "name": "fp_br1_3c8f",
        "type": "clone",
        "head_ref_id": "ref-7b2e",
        "public_key_id": "key-e5f2",
        "created_at": 1710244800000
      }
    }
  }
```

This index is **eventually consistent**. Guaranteed accurate after GC or
explicit index-update. May be stale between syncs. Clients that need exact
precision read refs directly; clients that want a quick overview use the index.

---

## 6. Workflows

### 6.1 Init (Local Only - No Remote)

```
  $ sg-send-cli init my-vault
```

Entirely local. No network. No remote. Creates:

- Vault key (passphrase + vault_id)
- EC P-256 key pair for "current" named branch
- EC P-256 key pair for this clone's work branch
- Empty root tree object
- Init commit (signed by clone branch key)
- Both refs pointing to init commit
- Named branch private key encrypted with read_key
- Branch index

The remote is added separately via `sg-send-cli remote add`.

Init commit is signed by the **clone key**, not the named branch key. The
named branch's signature chain starts at the first merge into current.

### 6.2 Commit (Local Only)

```
  $ sg-send-cli commit -m "message"
```

Entirely local. Zero API calls.

1. Scan working directory (exclude `.sg_vault/`, dotfiles)
2. Hash each file's plaintext content (`SHA256`)
3. Compare `content_hash` against committed tree entries
4. Encrypt and store changed blobs in `bare/data/`
5. Build new sub-tree objects bottom-up (only changed paths)
6. Build new root tree
7. Create commit object (signed by clone branch key)
8. Update **clone branch ref only** - named branch ref unchanged

No staging area. Commit always snapshots the entire working directory.

### 6.3 Push (The Definitive Workflow)

```
  $ sg-send-cli push origin
```

```
  1. CHECK: working dir clean?
     NO  → "commit your changes first"
     YES → continue

  2. FETCH remote named branch ref
     (read bare/indexes/idx-{branches} or the ref directly)

  3. Is remote ahead of local named branch?
     YES → fast-forward local named branch to remote
           download new objects
           (this is the ONLY place fast-forward is used)
     NO  → already in sync

  4. Is local named branch ahead of clone branch?
     (i.e., remote had new commits the clone hasn't seen)
     NO  → skip to step 5
     YES → MERGE named branch INTO CLONE BRANCH
           three-way merge: LCA, named branch, clone branch
           merge commit signed by CLONE BRANCH key

           CONFLICTS?
             STOP. Clone branch has .conflict files.
             Named branch is UNTOUCHED and CLEAN.
             User options:
               a) resolve, commit, run push again
               b) push --branch-only (share conflict for help)
               c) merge --abort (reset clone branch to pre-merge HEAD)

           NO CONFLICTS → continue

  5. CHECK: any .conflict files in working dir?
     YES → refuse to push
     NO  → continue

  6. MERGE clone branch INTO named branch
     Clone branch now has everything (remote + local + resolution)
     This merge is always clean (conflicts resolved in step 4)
     Merge commit signed by NAMED BRANCH key

  7. PUSH via batch endpoint
     POST /api/vault/batch/{vault_id}
     [delta objects + write-if-match on named branch ref]
     Lambda → direct S3 PUTs (AWS-to-AWS)

     REJECTED (ref moved while merging)?
     → go back to step 2

     ACCEPTED → update local tracking ref, done

  API calls: 1 GET + 1 POST (batch) = 2 round trips (typical)
```

### 6.4 Pull

```
  $ sg-send-cli pull origin
```

```
  1. FETCH remote named branch ref
  2. Remote ahead? → fast-forward local named branch
  3. Named branch ahead of clone? → merge named branch INTO clone branch
     Merge commit signed by clone branch key
     CONFLICTS → .conflict files on clone branch
     NO CONFLICTS → working dir updated
  4. Pull does NOT merge clone into named branch
     Pull does NOT push anything
     Pull only brings remote changes into your working context
```

### 6.5 Merge Into Named Branch

```
  $ sg-send-cli merge current
```

Merges your clone branch into the named branch. Separate from push (can be
done at regular intervals, or triggered explicitly).

1. Decrypt named branch private key from vault
2. Find LCA (last common ancestor)
3. Three-way merge at sub-tree level
4. Create merge commit signed by named branch key
5. Update named branch ref

Without a remote, there is no practical reason to merge - no divergence can
occur. Merging becomes important once remotes are in play and other users
are pushing.

### 6.6 Clone

```
  $ sg-send-cli clone <vault_key> [directory] --remote origin <url> --token <token>
```

1. Derive keys from vault key
2. Generate EC P-256 key pair for new clone branch
3. Fetch remote named branch ref → HEAD commit
4. Download all reachable objects (batch GET or zip)
5. Decrypt branch index → discover branches, refs, keys
6. Register new clone branch on server (batch: branch metadata + ref + public key + updated index)
7. Set up `local/` (branch key, vault key, token, remotes, tracking)
8. Decrypt and extract working copy

Clone checks out the named branch ("current") - the authoritative integration
point. The clone branch starts at the same commit.

---

## 7. Conflict Resolution

### 7.1 Where Conflicts Live

Conflicts ONLY appear on the clone branch. The named branch never has conflicts.
This is enforced by the merge direction: remote changes flow into the named
branch (fast-forward, always clean), then the named branch merges into the clone
branch (may conflict here).

```
  named branch:  always clean. Other users can continue merging.
  clone branch:  may have .conflict files. Only affects this user.
```

### 7.2 Conflict Resolution Options

When push step 4 produces conflicts:

**Option A: Resolve locally**

```
  $ vim README.md                        ← fix the content
  $ rm README.conflict.md                ← remove conflict marker
  $ sg-send-cli commit -m "resolved"     ← commit resolution on clone branch
  $ sg-send-cli push origin              ← push now succeeds
```

**Option B: Push conflicted branch for collaborative resolution**

```
  $ sg-send-cli push origin --branch-only
    pushes clone branch ref + objects to server
    does NOT touch named branch

  [another user]
  $ sg-send-cli fetch origin
  $ sg-send-cli checkout <conflicted_branch>
    resolves, commits, pushes back to that branch

  [you]
  $ sg-send-cli pull origin --branch-only
  $ sg-send-cli push origin              ← now clean
```

**Option C: Cancel the merge**

```
  $ sg-send-cli merge --abort
    resets clone branch ref to pre-merge HEAD
    removes .conflict files, restores working dir
    conflict commit becomes orphaned (GC cleans up)
```

### 7.3 The `.conflict` File Convention

When file `README.md` conflicts:

- `README.md` ← remote/named branch version (remote wins by default)
- `README.conflict.md` ← your version (preserved for inspection)

Push is blocked while any `.conflict` file exists in the working directory.

---

## 8. Three-Way Merge Algorithm

### 8.1 Inputs

```
  base tree:    LCA (last common ancestor) of the two branch HEADs
  ours tree:    one side (named branch or clone branch, depending on direction)
  theirs tree:  the other side
```

### 8.2 Sub-Tree Shortcut

At each tree node, compare `tree_id` values:

```
  base == ours == theirs   → unchanged, skip entirely
  base == ours ≠ theirs    → theirs changed, take theirs
  base ≠ ours == theirs    → ours changed, keep ours
  base == theirs ≠ ours    → ours changed, keep ours
  base ≠ ours ≠ theirs     → both changed, recurse into sub-tree
```

If a sub-tree ID matches, the entire sub-folder is identical - no need to read
individual files. This is the primary performance win of the sub-tree model.

### 8.3 File-Level Merge

When both sides changed the same file (different `blob_id` from the same base):

```
  ┌──────────┬─────────────┬────────────────────────────────┐
  │ Ours     │ Theirs      │ Result                         │
  ├──────────┼─────────────┼────────────────────────────────┤
  │ same     │ same        │ keep (no change)               │
  │ same     │ CHANGED     │ accept theirs                  │
  │ CHANGED  │ same        │ keep ours                      │
  │ ADDED    │ absent      │ keep our add                   │
  │ absent   │ ADDED       │ accept their add               │
  │ DELETED  │ same        │ keep our delete                │
  │ same     │ DELETED     │ accept their delete            │
  │ CHANGED  │ CHANGED     │ CONFLICT                       │
  │ DELETED  │ CHANGED     │ CONFLICT                       │
  │ CHANGED  │ DELETED     │ CONFLICT                       │
  │ ADDED    │ ADDED       │ CONFLICT (unless same blob_id) │
  └──────────┴─────────────┴────────────────────────────────┘
```

Merge always completes. Conflicts produce `.conflict` files and a merge commit.
Push is blocked until conflicts are resolved.

### 8.4 Finding the LCA

Walk both commit parent chains backward until finding a shared commit ID.

Fast path: use `local/tracking.json` (the last-known remote ref value) as the
merge base. This is correct for the normal workflow (fetch → merge) and avoids
walking long commit chains.

Full path: BFS/DFS over commit parent pointers. ~50-100 LOC, needed for complex
branch topologies.

---

## 9. Fast-Forward Rules

Fast-forward is used in exactly ONE place: local named branch accepting remote
named branch. Everywhere else, a merge commit is created.

| Operation | Type | Why |
|-----------|------|-----|
| Local named branch ← remote | **FAST-FORWARD** | Local has no independent commits. Just moving the pointer to match authority. |
| Named branch ← clone branch (push step 6) | **MERGE COMMIT** | Preserves "this was integrated into the named branch" boundary. Signed by named branch key. |
| Clone branch ← named branch (push step 4 / pull) | **MERGE COMMIT** | Preserves "I pulled remote changes at this point." Signed by clone key. Conflicts surface here. |

---

## 10. Key Derivation

```
  Vault key:   abc123def456ghi789jkl012:v8x2m4p1
               └──── passphrase (24) ────┘ └ vault_id ┘

  passphrase + vault_id → HKDF-SHA256 → {
    read_key,            AES-256 key for decryption
    write_key,           HMAC for API authentication
    tree_file_id,        deterministic server ID (legacy, migration)
    settings_file_id     deterministic server ID (legacy, migration)
  }

  The server receives:  vault_id (public) + write_key (for auth)
  The server never sees: passphrase, read_key
  The passphrase is the SINGLE SECRET for the entire vault
```

---

## 11. Change Packs

### 11.1 What and Why

A change pack is a self-contained signed bundle for high-frequency writes
that can't afford the full commit ceremony. One HTTP request. No clone needed.

Normal commit: read HEAD → diff → write blobs → write tree → write commit
→ update ref = 5+ requests.

Change pack: PUT one blob to `bare/pending/` = 1 request.

### 11.2 Schema

```json
  {
    "schema": "change_pack_v1",
    "branch_id": "branch-clone-{id}",
    "created_at": 1710249000000,
    "creator_key": "<submitter_public_key_fingerprint>",
    "signature": "<SIGN(creator_priv, payload_hash)>",
    "payload_hash": "<SHA256(encrypted_payload)>",
    "payload": "<AES-256-GCM encrypted, inline or zip reference>"
  }
```

Size limit: ~256KB encrypted inline. Above this, use a zip reference (blob
stored separately, change pack contains the blob_id).

### 11.3 The Keyless Creator

A change pack can be created by an entity that has **never cloned the vault
and has no read access**. All that's needed:

1. The branch public key (shared out-of-band)
2. The creator's own signing key
3. The change pack schema
4. A scoped write-only token for the `bare/pending/` namespace

The vault becomes a **write-only append target** for external systems.

### 11.4 Auth Model

Scoped write-only token. The vault owner generates a token that permits writes
ONLY to `bare/pending/`. The server stays dumb - it doesn't verify signatures.
The signature is inside the encrypted payload. GC verifies it on drain.

```
  PUT /api/vault/write/{vault_id}/bare/pending/pending-{uint_ts}_{rnd}
  Header: x-sgraph-vault-write-token: <scoped-token>
  Body: encrypted change pack blob
```

### 11.5 GC Drain

GC is triggered on every merge, pull, and push. Responsibilities:

```
  1. COLLECT    list bare/pending/* for this branch
  2. VERIFY     check signature on each change pack (reject invalid)
  3. ORDER      sort by timestamp (best-effort, uint ms since epoch)
  4. INTEGRATE  build real commit(s), link to branch tree
  5. UPDATE REF advance the branch ref
  6. REBUILD    refresh branch index, pending counts, temporal indexes
  7. HEALTH     sign a health check record
  8. PRUNE      delete processed pending objects
```

GC is idempotent. Running it twice produces the same result. Only after
successful ref update + health check are pending objects pruned.

---

## 12. API Endpoints

### 12.1 Existing (Unchanged)

```
  PUT    /api/vault/write/{vault_id}/{file_id}       AUTH (write_key)
  GET    /api/vault/read/{vault_id}/{file_id}        NO AUTH
  GET    /api/vault/read-base64/{vault_id}/{file_id} NO AUTH
  DELETE /api/vault/delete/{vault_id}/{file_id}      AUTH (write_key)
```

### 12.2 New: Batch Endpoint

```
  POST   /api/vault/batch/{vault_id}                 AUTH (write_key)
  Header: x-sgraph-vault-write-key
  Body: {
    "operations": [
      { "op": "write", "file_id": "bare/data/obj-{hash}", "data": "<base64>" },
      { "op": "write", "file_id": "bare/refs/ref-{id}", "data": "<base64>" },
      { "op": "write-if-match", "file_id": "bare/refs/ref-{id}",
        "match": "<old_value_base64>", "data": "<new_value_base64>" },
      { "op": "delete", "file_id": "bare/data/obj-{hash}" }
    ]
  }
```

Lambda receives the batch → makes N direct S3 PUTs (AWS-to-AWS, ~1-5ms each).
One internet round trip instead of N.

`write-if-match`: optimistic locking for mutable refs. Rejects the write if the
current value doesn't match `match`. Used for ref updates during push.

Atomicity: best-effort. Immutable objects (blobs, trees, commits) can be written
in any order - they have unique content-addressed IDs. The only ordering
constraint is that `write-if-match` on the ref must be last. If the ref update
fails, the written objects are harmless orphans that GC can clean up.

### 12.3 New: List Endpoint

```
  GET    /api/vault/list/{vault_id}/{prefix}         NO AUTH
  Returns: list of file_ids matching prefix
```

Needed for enumerating `bare/pending/{branch_id}/` during GC and for branch
discovery. Read-unauthenticated (same as read - the file_ids are opaque, and
content is encrypted).

### 12.4 Scoped Write Token for Change Packs

```
  PUT    /api/vault/write/{vault_id}/bare/pending/...  AUTH (scoped token)
  Header: x-sgraph-vault-write-token: <scoped-token>
```

Scoped token permits writes ONLY to `bare/pending/`. Cannot write to
`bare/refs/`, `bare/data/`, `bare/keys/`, or any other path. Created by the
vault owner via the admin API.

---

## 13. Request Budgets

| Workflow | Requests | Notes |
|----------|----------|-------|
| init | 0 | entirely local |
| commit | 0 | entirely local |
| push (clean, 3 files changed) | 1 GET + 1 POST | fetch ref + batch upload |
| push (remote diverged) | 1 GET + 1 POST | fetch + batch (includes merge objects) |
| pull (fast-forward) | 1 GET + 1 POST | fetch ref + batch download |
| clone (zip cached) | 1 GET + 1 POST | zip download + register branch |
| clone (no cache, 25 files) | ~30 GETs + 1 POST | walk tree + register |
| merge into named branch | 0 | entirely local (if already fetched) |
| change pack submit | 1 PUT | single blob to bare/pending/ |
| status | 0 | local only |
| status --remote | 1 GET | check remote ref |

---

## 14. Migration from Current Architecture

### Phase 1: Read Both Formats, Write New

- During clone: read legacy `tree.json` → build sub-tree objects in `bare/data/`
- During push: write sub-tree objects + also write legacy `tree.json` for backward
  compatibility with server UI
- New `bare/` folder structure created alongside existing `.sg_vault/` layout

### Phase 2: Derive Legacy from New

- Server generates `tree.json` on the fly from root tree object
- `tree.json` becomes derived data, not primary storage
- `_flatten_tree()` replaced by `tree_to_flat()` operating on encrypted objects

### Phase 3: Remove Legacy

- `_flatten_tree()` deleted
- `_build_tree_json()` deleted
- `Vault__Legacy_Guard` scope reduced
- Single `bare/` structure is the only format

Each phase is independently deployable and verifiable. Not a flag day.

---

## 15. Signature and Trust Model

### 15.1 What Gets Signed

Every commit is signed by the branch key that created it. The signature covers:

- `tree_id` (root tree hash - cryptographic commitment to all file contents)
- `parents` (parent commit IDs - chain integrity)
- `timestamp` (uint ms since epoch)
- `message`
- `branch_id`

Tampering with any field changes the commit ID. Tampering with any historical
commit invalidates all descendant commit IDs.

### 15.2 Signature Lineage

```
  init commit:          signed by clone branch key
  file commits:         signed by clone branch key
  merge into clone:     signed by clone branch key
  merge into named:     signed by named branch key

  The named branch's signature chain starts at the first merge.
  All commits on the named branch are signed by the named branch key.
  All commits on a clone branch are signed by that clone's key.
```

### 15.3 Verification

- Signing: mandatory on commit creation (cannot create unsigned commits)
- Verification: optional on pull (client can verify, or trust remote)
- Merge verification: informative (`sg-send-cli log` shows who signed what)
- Key rotation: new key for future commits; past signatures are immutable

---

## 16. Future: Worktrees

The `bare/` + `local/` architecture naturally supports multiple working copies
from a single vault - the equivalent of `git worktree`. **Not in scope for
initial implementation.** Will be built when there is customer demand.

```
  .sg_vault/
  ├── bare/              ← single copy of all objects (shared)
  ├── local/             ← device config
  └── worktrees/         ← checkout metadata (NOT in bare/, NOT synced)
      ├── worktree-{id}.json  → { path, branch_ref, checked_out_at, head }
      └── worktree-{id}.json  → { path, branch_ref, checked_out_at, head }
```

One bare vault, multiple working copies at different paths, each on a different
branch. Same object store, no duplication. `worktrees/` is device-local state.

---

## 17. Resolved Design Questions

All questions from the exploration documents and simulation, settled:

| Question | Decision |
|----------|----------|
| Sub-tree granularity | One tree per folder level (git model) |
| Size in tree entry | Yes, encrypted |
| content_hash in tree entry | Yes - SHA256(plaintext)[:12], encrypted |
| Tree format | JSON (not binary) |
| Path encryption | Yes - names encrypted in tree entries |
| Branch per clone | Yes - EC P-256 key pair auto-generated |
| Clone branch private key scope | Stays on clone device, never in vault |
| Named branch | Merge-only, own key pair, private key in vault |
| Locked branch | Delete private key = permanently locked |
| Named branch private key (common case) | Encrypted with vault read_key (open) |
| Change pack auth | Scoped write-only token, server stays dumb |
| GC timing | On every push/pull/merge, not a daemon |
| Ordering | Not a vault responsibility, application layer |
| Timestamps | Uint milliseconds since epoch (Timestamp_Now) everywhere |
| Eventual consistency | Acceptable for indexes, accurate after GC |
| Fast-forward | ONLY for local named branch ← remote. All else: merge commit |
| Conflict location | Clone branch only, named branch never has conflicts |
| Push ordering | Fetch remote first, then merge, never merge-then-fetch |
| Init commit signing | Clone branch key |
| merge --abort cleanup | Orphaned commits cleaned by GC |
| --branch-only push | Pushes clone branch ref + objects only, never touches named branch |
| Batch API endpoint | Needed - Lambda does direct S3 calls, 1 internet round trip |
| List API endpoint | Needed - for GC pending enumeration and branch discovery |
| Object type visibility | Hidden - all in bare/data/obj-{hash}, schema field inside encrypted content |
| Folder structure | bare/ (the vault) + local/ (device config) |
| Worktrees | Architecture supports it, deferred to customer demand |

---

## Appendix A: Implementation Phases

### Phase A: Foundation (Ref System + Commit + Storage)

1. Create `bare/` folder structure with sub-folders
2. Expand `Vault__Ref_Manager` to support named refs and opaque IDs
3. Add explicit `commit` command to CLI
4. Add `content_hash` to tree entries
5. Update `Schema__Object_Commit`: `parent` → `parents[]`, add `branch_id`, `signature`
6. Encrypt file names in tree entries
7. Create `local/` config structure

### Phase B: Fetch + Merge

1. Implement `fetch()` - download remote state, update local named branch ref
2. Implement three-way merge at sub-tree level
3. Implement conflict detection and `.conflict` file creation
4. Rewrite `pull()` as `fetch() + merge into clone branch`
5. Implement `merge --abort`

### Phase C: Push Guards + Batch

1. Add "clean working directory" check
2. Add "fetch first, then merge" push workflow
3. Implement batch API endpoint on server
4. Implement `write-if-match` optimistic locking
5. Push only uploads delta via batch

### Phase D: Branches

1. Branch metadata files and encrypted index
2. Auto-generate key pair on clone
3. Named branch creation with double-encrypted private key
4. `sg-send-cli branches`, `log --graph`, `inspect`
5. `--branch-only` push

### Phase E: Remotes

1. Backend abstraction: `read(file_id)`, `write(file_id, data)`, `delete(file_id)`, `list(prefix)`
2. Backend implementations: SG/Send, LocalFolder, Zip
3. `sg-send-cli remote add/remove/list`
4. Vault export as zip

### Phase F: Change Packs

1. Change pack schema and creation
2. Scoped write-only token auth
3. GC drain on sync operations
4. List endpoint for pending enumeration
5. Health check records

---

*SGraph Send - Architect - v0.13.30*
*Architecture specification - validated by simulation v6*
*Ready for team review: Architect, Dev, DevOps, AppSec*
