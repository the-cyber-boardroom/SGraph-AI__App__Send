# SGit-AI CLI — Debrief for _Send API Team
## Init / Push / Clone Strategy (current as of 2026-03-28)

This document describes how the SGit-AI CLI interacts with the _Send Transfer
API during the three core lifecycle operations: **init**, **push**, and **clone**.
It covers the optimisations added for parallel processing, tree-walking, and
large-file handling, and explains the constraints those optimisations are
designed to work around.

---

## 0. Background: vault structure and key derivation

Every vault is identified by a `vault_key` of the form `<passphrase>:<vault_id>`.
All cryptographic material — encryption key, vault ID, ref file IDs, branch
index file ID — is derived deterministically from this single secret using
HKDF-SHA256.  No random per-session state is needed to locate any structural
file in the vault.

On disk (and on the server under `bare/`) the layout is:

```
bare/
  indexes/   idx-pid-muw-<hash>       — branch index (one per vault)
  refs/      ref-pid-{muw,snw}-<hash> — branch HEAD pointers
  keys/      key-rnd-imm-<hex>        — EC P-256 public keys
  data/      obj-cas-imm-<hash>       — commits, trees, blobs (content-addressed)
```

All content (including metadata such as file names and sizes) is AES-256-GCM
encrypted with the vault's read key before it is stored or transmitted.

---

## 1. Init

`sgit init` (or `sgit clone` followed by local setup) creates the vault
skeleton **locally only**.  No API calls are made during init.

What happens:

1. Derive all keys from `vault_key`.
2. Create `.sg_vault/bare/{indexes,refs,keys,data,…}` on disk.
3. Generate two branches: `named` ("current") and `clone` ("local"), each with
   an EC P-256 key pair.
4. Create an empty root commit (empty tree, no blobs).
5. Write the branch index, refs, and public keys to local disk.

**No server interaction.**  The server only learns about the vault on the
first `push` that contains real content.

### Why init does not push

A freshly-initialised vault has an empty commit (empty tree, no blobs).
Pushing an empty tree to the server would waste a round-trip and would not
provide the server with anything useful.  The CLI gates any server interaction
on the commit tree being non-empty — checked by decrypting the commit and
inspecting its root tree's entry count before making any API call.

---

## 2. Push

### 2.1 Overview

`sgit push` synchronises the local clone branch with the named branch on the
server.  The high-level decision tree is:

```
push called
  └─ clone_commit_id == named_commit_id?
       ├─ YES → commit tree empty? → "Nothing to push" (no API calls)
       │         commit tree non-empty AND server has no files?
       │           → re-sync: upload bare structure then return 'resynced'
       │         otherwise → "Nothing to push"
       └─ NO  → is first push? (server has no files for this vault)
                  └─ YES → upload bare structure first
                delta push: build operations, execute via batch API
```

### 2.2 First push — bare structure upload (`_upload_bare_to_server`)

When the server has never seen this vault, the entire `.sg_vault/bare/`
directory must be uploaded before the delta push can set the named branch ref.

**File classification:**

| File size (encrypted) | Route |
|---|---|
| > 4 MB (`LARGE_BLOB_THRESHOLD`) | S3 presigned multipart |
| ≤ 4 MB | batch endpoint, chunked at 4 MB base64 budget |

**Large-file path (presigned multipart):**

```
POST /api/vault/presigned/initiate/{vault_id}   → upload_id + part_urls
PUT  {part_url}  (S3 direct)  × N parts          — parallel, ThreadPoolExecutor
POST /api/vault/presigned/complete/{vault_id}    → finalise
```
Parts are uploaded in parallel (all parts concurrently).  If any part fails,
`/presigned/cancel` is called as best-effort cleanup.

**Small-file path (batch):**

Files are accumulated into chunks such that the total base64-encoded payload
per chunk stays under **4 MB** (safe margin below Lambda's ~6 MB request limit).
Plain-write chunks are sent in parallel (ThreadPoolExecutor).  There are no
ordering requirements for plain writes.

### 2.3 Delta push

After the bare structure is confirmed on the server, the delta push computes
the difference between the named branch tree and the clone branch tree and
builds a batch operations list:

```
[  write  bare/data/<blob_id>   ]  × new blobs  (skipping blobs already on server)
[  write  bare/data/<commit_id> ]  × new commits in the commit chain
[  write  bare/data/<tree_id>   ]  × all tree objects reachable from new commits
[  write-if-match  bare/refs/<named_ref_id>  match=<current_hash>  ]  ← CAS
```

**Large blobs in the delta** are routed through presigned multipart (same as
above) and excluded from the batch operations list.

**Batch chunking and parallelism:**

```
total base64 bytes > 4 MB?
  NO  → single POST /api/vault/batch/{vault_id}
  YES → split into chunks (4 MB base64 budget each)
          plain-write chunks → parallel batch calls
          write-if-match chunk → sequential, always last
```

The `write-if-match` (CAS) operation on the named branch ref is always
executed after all plain writes have succeeded.  This ensures atomicity of
the ref update — if the CAS fails (concurrent push from another clone), the
entire delta is rejected cleanly.

### 2.4 Re-sync after server data loss

If the server loses vault data (e.g. S3 objects deleted) but local state is
still in sync (`clone_commit_id == named_commit_id`), a normal push would
incorrectly report "Nothing to push".

The CLI detects this case:

```
clone_commit_id == named_commit_id
  AND commit tree is non-empty          (vault has real content)
  AND list_files(vault_id, 'bare/') == []  (server is empty)
    → upload bare structure → return status='resynced'
```

This uses one `GET /api/vault/list/{vault_id}` call, which is the **only**
use of the list endpoint during normal push operations.

---

## 3. Clone

### 3.1 Old approach (replaced)

Previously clone called `GET /api/vault/list/{vault_id}?prefix=bare/` and
then downloaded every file sequentially via `GET /api/vault/read/{vault_id}/{file_id}`.
Large blobs (> 5 MB) caused Lambda 502s because the response body exceeded
Lambda's ~6 MB payload limit — a 502 fallback to presigned S3 was required.

This was:
- Slow (sequential, ~29 s for a 24-file vault with one 5 MB blob)
- Fragile (blind download, no knowledge of which files are large before download)

### 3.2 New approach — deterministic BFS walk

The new clone never calls `list_files`.  Instead it derives the branch index
file ID directly from the vault key and walks the tree graph downward, gaining
full knowledge of blob sizes and the `large` flag before any blob is downloaded.

**Phases:**

```
Phase 1 — Branch index (1 batch_read call, ~1 KB)
  POST /api/vault/batch/{vault_id}
    read: bare/indexes/<branch_index_file_id>    ← deterministic from keys
  → decrypt → parse branch index → get named branch metadata

Phase 2 — Refs + public keys (1 batch_read call, < 5 KB)
  POST /api/vault/batch/{vault_id}
    read: bare/refs/<ref_id>    × all branches
    read: bare/keys/<key_id>    × all branches
  → decrypt named ref → named_commit_id

Phase 3 — Commit chain (1 batch_read call per BFS wave)
  POST /api/vault/batch/{vault_id}
    read: bare/data/<commit_id>   × wave
  → parse each commit → collect root tree IDs + parent commit IDs
  repeat until no new parent commits

Phase 4 — Tree objects (1 batch_read call per BFS wave)
  POST /api/vault/batch/{vault_id}
    read: bare/data/<tree_id>    × wave
  → parse each tree → collect sub-tree IDs
  repeat until no new sub-trees

Phase 5 — Flatten HEAD tree (local, no network)
  Vault__Sub_Tree.flatten() decrypts all tree entries
  → produces {path: {blob_id, size, large, content_hash, content_type}}
  → classify blobs: large (> 4 MB encrypted) vs small

Phase 6 — Small blob download (parallel batch_read chunks)
  Chunk blobs by 3 MB response budget
  All chunks dispatched in parallel via ThreadPoolExecutor
  POST /api/vault/batch/{vault_id}  × N chunks  (parallel)

Phase 7 — Large blob download (parallel presigned S3)
  GET /api/vault/presigned/read-url/{vault_id}/{file_id}  × M blobs
  GET {s3_presigned_url}                                  × M blobs  (parallel, max 4 workers)
```

### 3.3 Key properties of the new approach

| Property | Old | New |
|---|---|---|
| Server list call | Yes (`list_files`) | No |
| 502 fallback needed | Yes (blind download) | No (`large` flag known before download) |
| Small file download | Sequential individual reads | Parallel batch_read chunks |
| Large file download | Sequential + 502 fallback | Parallel presigned S3 |
| Round trips (flat vault) | 1 list + N sequential reads | ~5 batch calls + M presigned calls |
| Round trips (nested dirs) | same | +1 batch call per additional tree depth level |

For a typical vault (flat dir, 13 files including one 5 MB blob), the new
approach uses approximately:

```
1  POST batch  → index           (~1 KB recv)
1  POST batch  → refs + keys     (~2 KB recv)
1  POST batch  → commit(s)       (~1 KB recv)
2  POST batch  → root tree + subtree   (~8 KB recv total, subtree has 13 encrypted entries)
4  POST batch  → small blobs     (parallel, ~10 MB recv total)
1  GET  presigned/read-url       (~1 KB recv)
1  GET  S3                       (~5 MB recv)
────
12 total requests, several in parallel
```

---

## 4. Lambda payload constraints

Both the request and response payloads through the API Lambda have a hard limit
of approximately **6 MB**.  The CLI works within this in two ways:

### 4.1 Request chunking (push / batch write)
Batch write operations are split into chunks where the total base64-encoded
data content stays under **4 MB** per request (leaving ~2 MB headroom for JSON
envelope overhead).

### 4.2 Response chunking (clone / batch_read)
Batch read calls for small blobs are chunked using the known plaintext size
of each blob: `estimated_base64 = (plaintext_size × 4/3) + 64`.  Chunks are
accumulated until the estimated response would exceed **3 MB**, then flushed.

### 4.3 Large blob routing (> 4 MB encrypted)
Files whose encrypted size exceeds `LARGE_BLOB_THRESHOLD = 4 MB` never go
through the Lambda API for data transfer.  They are always routed through S3
presigned URLs:
- **Upload**: presigned multipart (initiate → PUT parts → complete)
- **Download**: presigned read URL → direct S3 GET

The `large` flag is stored as encrypted metadata in the tree entry so that the
downloader knows which blobs to route through presigned before downloading.

---

## 5. API endpoints used — summary

| Method | Path | Used by |
|---|---|---|
| `POST` | `/api/vault/batch/{vault_id}` | clone (read), push (write), all batch ops |
| `GET` | `/api/vault/list/{vault_id}` | push re-sync check only |
| `PUT` | `/api/vault/write/{vault_id}/{file_id}` | push fallback (batch unavailable) |
| `DELETE` | `/api/vault/delete/{vault_id}/{file_id}` | push fallback |
| `POST` | `/api/vault/presigned/initiate/{vault_id}` | push large blobs |
| `PUT` | `{s3_presigned_part_url}` | push large blob parts (direct S3) |
| `POST` | `/api/vault/presigned/complete/{vault_id}` | push large blobs |
| `POST` | `/api/vault/presigned/cancel/{vault_id}` | push large blob cleanup on failure |
| `GET` | `/api/vault/presigned/read-url/{vault_id}/{file_id}` | clone large blobs |
| `GET` | `{s3_presigned_read_url}` | clone large blobs (direct S3) |

The **individual read** endpoint (`GET /api/vault/read/{vault_id}/{file_id}`)
is **no longer used** during clone.  It remains available as a library method
but is not called in the primary code paths.

---

## 6. Debug visibility

Running any command with `--debug` prints a live request log to stderr:

```
    [POST  ] 200    45ms   1.2 KB  18.4 KB  vault/batch/vtx3iz2h   ← index
    [POST  ] 200   402ms   284 B    1.1 KB  vault/batch/vtx3iz2h   ← refs+keys
    [POST  ] 200   145ms    81 B     720 B  vault/batch/vtx3iz2h   ← commit
    [POST  ] 200   126ms    81 B     668 B  vault/batch/vtx3iz2h   ← root tree
    [POST  ] 200   222ms   146 B     629 B  vault/batch/vtx3iz2h   ← subtree (2 trees)
    [POST  ] 200   146ms    81 B    6.9 KB  vault/batch/vtx3iz2h   ← subtree entries
    [POST  ] 200   629ms   276 B    1.4 MB  vault/batch/vtx3iz2h   ┐
    [POST  ] 200  8284ms    81 B    3.7 MB  vault/batch/vtx3iz2h   │ small blobs
    [POST  ] 200  9003ms    81 B    3.5 MB  vault/batch/vtx3iz2h   │ (parallel)
    [POST  ] 200  9092ms   406 B    2.1 MB  vault/batch/vtx3iz2h   ┘
    [GET   ] 200   105ms     -      1.6 KB  vault/presigned/read-url/vtx3iz2h/bare/data/...
    [GET   ] 200   344ms     -      5.0 MB  /transfers/vault/...    ← S3 direct
    ──────────────────────────────────────────────────────────────────
    Reqs: 12  |  Errors: 0  |  Elapsed: 19241ms  |  Sent: 1.6 KB  |  Recv: 15.8 MB
```

The `Elapsed` figure reflects actual wall-clock time (not sum of durations),
accounting for the savings from parallel requests.

---

*Document generated 2026-03-28 from branch `claude/new-explorer-team-cHLXU`.*
