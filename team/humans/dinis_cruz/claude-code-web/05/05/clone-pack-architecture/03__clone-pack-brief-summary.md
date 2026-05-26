# Clone Pack — Brief 08b Distilled

Source: `team/humans/dinis_cruz/briefs/05/05/brief__08b__sg-send-backend-spec.md`
This is a condensed version for architectural discussion. Read the original for full detail.

---

## The Problem

| Metric | Current (batch_read) | Target (clone pack) |
|--------|---------------------|---------------------|
| HTTP requests per clone | 3–4 BFS waves | **1** |
| Server S3 GETs per clone | ~2,375 (serial) | ~2,375 (parallel, at build time) |
| Time to clone (42 commits, 2375 trees, 165 blobs) | **202 seconds** | **~2-5s (cached head), ~30s (full, first build)** |
| Expected speedup | — | **40–100×** |

---

## Components to Build

### A. PackBuilder
Given `(vault_id, commit_id, flavour)`:
1. List all objects for the vault (using existing `list_files`)
2. Filter by flavour (head = HEAD trees only, full = entire history)
3. Stream-build binary pack to a temp file
4. Move to pack cache

### B. PackCache
- Stores packs at: `{vault_storage}/{vault_id}/packs/{commit_id}__{flavour}.pack`
- Tracks metadata in `pack-index.json`
- LRU eviction: 100 packs OR 5 GB per vault (whichever first)
- Never evicts: latest 3 packs per commit

### C. Two New Endpoints
1. `GET /vaults/{vault_id}/packs/{commit_id}/{flavour}` — download pack
2. `POST /vaults/{vault_id}/objects/missing` — backfill missing objects

### D. Pre-warming Hook
- Trigger: successful push (CAS write-if-match on HEAD ref)
- Action: async build of `head` and `full` packs for new HEAD commit
- Must NOT block the push response

---

## Wire Format (Binary Pack)

```
┌─────────────────────────────────────────────────────────────────┐
│                         HEADER (76 bytes)                       │
├────────────┬──────────────────────────────────────────────────┬─┤
│  Offset    │  Field          │  Size  │  Notes                 │ │
│  0–3       │  magic          │  4     │  "SGPK" (ASCII)        │ │
│  4         │  format_version │  1     │  1 = this spec         │ │
│  5         │  flavour        │  1     │  1=full 2=head 3=bare-full 4=bare-head 5=range
│  6–7       │  reserved       │  2     │  zeros                 │ │
│  8–19      │  vault_id       │  12    │  ASCII, NUL-padded     │ │
│  20–51     │  commit_id      │  32    │  ASCII, NUL-padded     │ │
│  52–59     │  created_at_ms  │  8     │  uint64, unix epoch ms │ │
│  60–67     │  index_offset   │  8     │  uint64, byte offset   │ │
│  68–71     │  index_length   │  4     │  uint32, byte count    │ │
│  72–75     │  reserved2      │  4     │  zeros                 │ │
└────────────┴──────────────────────────────────────────────────┴─┘
│                                                                 │
│                    BODY (variable)                              │
│         Concatenated encrypted ciphertext objects               │
│         No separators, no alignment padding                     │
│         Body starts at byte 76                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    INDEX (variable)                             │
│         Sequence of entries (sorted by obj_id ASC):            │
│                                                                 │
│   Per entry:                                                    │
│   ┌─────────┬────────────────────────────────────────────┐     │
│   │ 1 byte  │ id_length (max 64)                         │     │
│   │ N bytes │ obj_id (ASCII)                             │     │
│   │ 8 bytes │ offset (uint64, position in Body)          │     │
│   │ 4 bytes │ length (uint32, ciphertext size in bytes)  │     │
│   │ 1 byte  │ obj_type (1=commit 2=tree 3=blob 4=ref     │     │
│   │         │           5=index 6=key)                   │     │
│   │ 3 bytes │ reserved (zeros)                           │     │
│   └─────────┴────────────────────────────────────────────┘     │
│                                                                 │
│   Index location: header.index_offset (bytes from file start)  │
│   Index size:     header.index_length                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    FOOTER (32 bytes)                            │
│         SHA-256 of the Body section only                       │
│         (NOT header, NOT index)                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why Index after Body:** Builder streams objects to disk in order,
then writes the index once all offsets are known. Client seeks to
`index_offset` to read the index, then seeks into Body for each object.

---

## Flavours

| Flavour | What it contains | Use case |
|---------|-----------------|----------|
| `full` | All commits + all trees + all blobs (entire history) | Full clone |
| `head` | HEAD commit + HEAD trees + blobs reachable from HEAD | Shallow clone |
| `bare-full` | All commits + trees (no blobs) | Index-only / fast scan |
| `bare-head` | HEAD commit + HEAD trees (no blobs) | Fast metadata |
| `range` | Commits between two hashes | Incremental sync — **defer to v2** |

---

## New Endpoints (from brief — paths need discussion)

### GET `/vaults/{vault_id}/packs/{commit_id}/{flavour}`

| Response | When |
|----------|------|
| 200 binary | Pack exists (cached or just built) |
| 202 `{"status":"building","retry_after":N}` | Building async, try again |
| 404 `{"error":"commit_not_found"}` | Vault exists, commit unknown |
| 404 `{"error":"flavour_not_supported"}` | `range` or unrecognised flavour |

**Note:** Brief uses `/vaults/...` but existing API uses `/api/vault/...`.
This is an open question — see file 04.

### POST `/vaults/{vault_id}/objects/missing`

Backfill: given a list of object_ids, return their ciphertext as base64.
For objects genuinely missing, return `null`.

```json
Request:  { "object_ids": ["obj-abc", "obj-def"] }
Response: { "obj-abc": "<base64>", "obj-def": null }
```

---

## Pack Builder Algorithm (from brief)

```
build(vault_id, commit_id, flavour):

1. Resolve object set by flavour:
   - head:      list_files(prefix='bare/data/') filtered to HEAD's tree + blobs
   - full:      all objects in bare/data/ (entire history)
   - bare-*:    same but drop blobs
   - range:     return 404 (not implemented)

2. Sort object set by object_id ASCII ascending

3. Stream-build to temp file under packs/.tmp/:
   a. Reserve 76 bytes (write zeros — fix up at end)
   b. For each object (in sorted order):
      - Read ciphertext from S3 (existing object store)
      - Append to file
      - Record (obj_id, offset, length, obj_type)
   c. Write Index entries (sorted by obj_id)
   d. SHA-256 the body bytes → write Footer
   e. Seek to byte 0, write real Header (now index_offset is known)

4. Atomic rename: .tmp/{name} → packs/{commit_id}__{flavour}.pack

5. Update pack-index.json

6. Run LRU eviction if budget exceeded
```

**Idempotency requirement:** same `(vault_id, commit_id, flavour)` must produce
byte-identical output. Object sort order (by id) makes this deterministic.

---

## Cache Layout (proposed by brief)

```
{vault storage}/{vault_id}/
├── (existing)  bare/
│               ├── refs/ref-current/payload
│               └── data/obj-*/payload
└── (NEW)       packs/
                ├── pack-index.json
                ├── .tmp/                  ← build temp files
                └── {commit_id}__{flavour}.pack
```

In S3 key terms (for vault `dap47prw`):
```
sg-send__data/sg-send-api__v1.0/shared/vault/da/dap47prw/packs/
├── pack-index.json
├── .tmp/abc123__head.pack.tmp
└── abc123__head.pack
```

---

## Acceptance Criteria (from brief)

- [ ] `PackBuilder` produces byte-identical packs on repeat builds
- [ ] `GET .../packs/{commit}/{flavour}` works for `full` and `head`; 202 while building; 404 for unknown commit
- [ ] `POST .../objects/missing` works with mixed known/unknown ids
- [ ] Pre-warming hook fires on push; first clone after push hits cache
- [ ] Cache eviction: LRU, latest-3 protected
- [ ] Unit test coverage ≥ 85%
- [ ] Existing `batch_read` unchanged; old clients still work

---

## Performance Targets (case-study vault: 42 commits, 2375 trees, 165 blobs)

| Metric | Target |
|--------|--------|
| Build `head` pack | ≤ 5 seconds |
| Build `full` pack | ≤ 30 seconds |
| Serve cached pack (TTFB) | ≤ 200 ms |
| Pack size (`head`) | ≤ 10 MB |
| Pack size (`full`) | ≤ 200 MB |
