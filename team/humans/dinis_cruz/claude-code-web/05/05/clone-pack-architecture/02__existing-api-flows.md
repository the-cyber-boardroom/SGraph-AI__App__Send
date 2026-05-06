# Existing API Flows — Sequence Diagrams

All current flows with ASCII art. These are code-verified.

---

## Flow 1: SGit Push (writing a vault)

The client (SGit-AI CLI) pushes a vault by writing objects individually,
then atomically updating the HEAD ref via CAS.

```
SGit CLI                    Lambda (SG/Send)                    S3
   │                               │                             │
   │  ── create vault ─────────────▶                             │
   │  PUT /api/vault/write/{id}/bare/refs/ref-init               │
   │  Headers: x-sgraph-vault-write-key: <hex>                   │
   │  Body: <encrypted bytes>      │                             │
   │                               │── SHA256(write_key) ──▶ compare manifest
   │                               │   manifest not found  ──▶ create manifest
   │                               │── S3.file__save() ─────────▶
   │  ◀─── 200 {status: completed} │                             │
   │                               │                             │
   │  ── upload objects ───────────▶ (one PUT per object)        │
   │  PUT /api/vault/write/{id}/bare/data/obj-tree-abc           │
   │  PUT /api/vault/write/{id}/bare/data/obj-blob-def           │
   │  PUT /api/vault/write/{id}/bare/data/obj-commit-xyz         │
   │  ... (N objects, N HTTP requests)                           │
   │                               │                             │
   │  ── OR use batch write ───────▶                             │
   │  POST /api/vault/batch/{id}                                 │
   │  Body: [{op:write, file_id:..., data:<b64>}, ...]           │
   │  (max 100 ops per batch)      │                             │
   │                               │── N × S3.file__save() ─────▶
   │  ◀─── 200 {results: [...]}    │                             │
   │                               │                             │
   │  ── update HEAD (CAS) ────────▶                             │
   │  POST /api/vault/batch/{id}                                 │
   │  Body: [{                     │                             │
   │    op: "write-if-match",      │                             │
   │    file_id: "bare/refs/ref-current",                        │
   │    match: null,               │  ← null = expect not found  │
   │    data: "<b64 of commit-id>" │                             │
   │  }]                           │                             │
   │                               │── S3.file__exists() ────────▶
   │                               │◀─ false ────────────────────│
   │                               │   current == expected (null)│
   │                               │── S3.file__save() ─────────▶
   │  ◀─── 200 {status: "ok"}      │                             │
   │                               │                             │
   │  DONE — vault committed       │                             │
```

**Note:** There is NO explicit "push complete" endpoint. The CAS
`write-if-match` on the ref IS the commit. Pre-warming must hook here.

---

## Flow 2: SGit Clone — Current (SLOW PATH)

This is the flow Brief 08b is replacing. 202 seconds for large vaults.

```
SGit CLI                    Lambda (SG/Send)                    S3
   │                               │                             │
   │  ── 1. Read HEAD ref ─────────▶                             │
   │  GET /api/vault/read/{id}/bare/refs/ref-current             │
   │                               │── S3.file__bytes() ─────────▶
   │                               │◀─ encrypted commit-id bytes─│
   │  ◀── 200 encrypted commit-id  │                             │
   │                               │                             │
   │  [client decrypts → gets commit object-id]                  │
   │                               │                             │
   │  ── 2. BFS Wave 1 ────────────▶                             │
   │  POST /api/vault/batch/{id}   │                             │
   │  [{op:read, file_id: bare/data/obj-commit-abc},             │
   │   {op:read, file_id: bare/data/obj-tree-root}]              │
   │                               │── S3.file__bytes() ─────────▶ (per object)
   │                               │◀─ bytes ────────────────────│
   │  ◀── 200 [{data:<b64>}, ...]  │                             │
   │                               │                             │
   │  [client decrypts → discovers child tree object-ids]        │
   │                               │                             │
   │  ── 3. BFS Wave 2 ────────────▶                             │
   │  POST /api/vault/batch/{id}   │                             │
   │  [{op:read, file_id: bare/data/obj-tree-child1},            │
   │   {op:read, file_id: bare/data/obj-tree-child2},            │
   │   ...up to 100 ops per batch] │                             │
   │                               │── ~600 × S3.file__bytes() ──▶
   │  ◀── 200 [{data:<b64>}, ...]  │                             │
   │                               │                             │
   │  ── 4. BFS Wave 3 ────────────▶  (more trees discovered)    │
   │  ...                          │                             │
   │                               │                             │
   │  ── 5. BFS Wave N (blobs) ────▶                             │
   │  ...                          │                             │
   │                               │                             │
   │  DONE                         │                             │
   │                               │                             │
   │  Total: 3-4 HTTP requests     │                             │
   │  Each: ~600 S3 GETs (serial inside batch handler)           │
   │  Total time: ~202 seconds     │                             │
```

**Root cause:** Each BFS wave requires decrypting results to discover
the next wave's object IDs. Server can't pre-compute the graph without
the read key. Current architecture is fundamentally sequential.

**But:** The server CAN pre-compute "all objects in this vault" without
decryption — it just lists files. The pack builder does exactly this.

---

## Flow 3: SGit Clone — Proposed (FAST PATH)

What Brief 08b enables. One HTTP request, ~40–100× faster.

```
SGit CLI                    Lambda (SG/Send)              S3              /tmp
   │                               │                       │               │
   │  ── GET pack ─────────────────▶                       │               │
   │  GET /api/vault/packs/{id}/{commit}/head              │               │
   │  (no auth required — ciphertext only)                 │               │
   │                               │                       │               │
   │                         ┌─────┴──────────────────┐    │               │
   │                         │ PackCache.exists()?     │    │               │
   │                         │ cache hit: skip build   │    │               │
   │                         └─────┬──────────────────┘    │               │
   │                               │ cache miss:            │               │
   │                               │── S3.list(packs/) ────▶               │
   │                               │◀─ not found ──────────│               │
   │                               │                        │               │
   │                               │── open temp file ──────────────────────▶
   │                               │── write 76-byte header placeholder ────▶
   │                               │                        │               │
   │                         ┌─────┴──────────────────┐    │               │
   │                         │ resolve object set:     │    │               │
   │                         │ list_files(vault_id,    │    │               │
   │                         │   prefix='bare/data/')  │    │               │
   │                         └─────┬──────────────────┘    │               │
   │                               │── S3.list(bare/data/)─▶               │
   │                               │◀─ [obj-id list] ──────│               │
   │                               │                        │               │
   │                         ┌─────┴──────────────────┐    │               │
   │                         │ for each obj_id:        │    │               │
   │                         │   S3.get(obj) ─────────────▶│               │
   │                         │   write bytes to file ──────────────────────▶
   │                         │   record (id, offset,   │    │               │
   │                         │           length, type) │    │               │
   │                         └─────┬──────────────────┘    │               │
   │                               │── write Index ─────────────────────────▶
   │                               │── compute SHA-256 of body              │
   │                               │── write Footer ────────────────────────▶
   │                               │── write real Header ───────────────────▶
   │                               │── rename .tmp → {commit}__head.pack ───▶
   │                               │── S3.upload(pack) ─────▶               │
   │                               │                        │               │
   │  ◀── 200 StreamingResponse ───│                        │               │
   │   (one binary blob, ~5-200MB) │                        │               │
   │                               │                        │               │
   │  DONE                         │                        │               │
   │                               │                        │               │
   │  Total: 1 HTTP request        │                        │               │
   │  First build: ~5-30 seconds   │                        │               │
   │  Cached: ~200ms TTFB          │                        │               │
```

---

## Flow 4: Read (No Auth)

Simple reads need no authentication.

```
SGit CLI / Browser          Lambda (SG/Send)                    S3
   │                               │                             │
   │  GET /api/vault/read/{id}/{file_id:path}                    │
   │  (no auth header needed)      │                             │
   │                               │── S3.file__bytes(path) ─────▶
   │                               │◀─ bytes ────────────────────│
   │  ◀── 200 <binary bytes>       │                             │
   │                               │                             │
   │  [or 404 if not found]        │                             │
```

---

## Flow 5: CAS Write (Compare-and-Swap for HEAD refs)

The mechanism that makes push atomic. Used to update HEAD refs.

```
SGit CLI                    Lambda (SG/Send)                    S3
   │                               │                             │
   │  POST /api/vault/batch/{id}   │                             │
   │  Headers: x-sgraph-vault-write-key: <hex>                   │
   │  Body: [{                     │                             │
   │    op: "write-if-match",      │                             │
   │    file_id: "bare/refs/ref-current",                        │
   │    match: "<b64 of expected current value>",                │
   │    data: "<b64 of new commit-id>"                           │
   │  }]                           │                             │
   │                               │── SHA256(key) → check manifest
   │                               │── S3.file__bytes(ref-current)─▶
   │                               │◀─ current bytes ────────────│
   │                               │                             │
   │                         IF current == expected:             │
   │                               │── S3.file__save(new value) ─▶
   │  ◀── 200 {status: "ok"}       │                             │
   │                               │                             │
   │                         IF current != expected:             │
   │                               │  (another push won the race)│
   │  ◀── 200 {status: "conflict", │                             │
   │          current: "<b64>"}    │                             │
   │                               │                             │
   │  [client rebases and retries] │                             │
```

---

## Flow 6: Pre-Warming Hook (Proposed)

Where pre-warming should hook in — triggered after a successful CAS on a ref.

```
SGit CLI                    Lambda (SG/Send)                    S3
   │                               │                             │
   │  POST /api/vault/batch/{id}   │                             │
   │  [write-if-match on ref-current]                            │
   │                               │── detect: op=write-if-match │
   │                               │         + file_id ends in ref-current
   │                               │         + status=ok         │
   │                               │                             │
   │  ◀── 200 {status: "ok"} ──────│  (response sent immediately)│
   │                               │                             │
   │                               │  asyncio.create_task(       │
   │                               │    prewarm(vault_id,        │
   │                               │            new_commit_id))  │
   │                               │         │                   │
   │                               │    [background, after response sent]
   │                               │         │                   │
   │                               │    build 'head' pack ───────▶
   │                               │    build 'full' pack ───────▶
   │                               │    update pack-index.json ──▶
   │                               │         │                   │
   │                               │    [done — next clone hits cache]
```

**Lambda caveat:** In Lambda, `asyncio.create_task()` tasks that haven't
completed when the handler returns are NOT guaranteed to run. Lambda may
freeze the process immediately after the response. This is a critical
design question — see file 04.

---

## Flow 7: Presigned Upload (Large Files)

For files too large to send through the Lambda function body.

```
SGit CLI                    Lambda                      S3 (direct)
   │                            │                            │
   │  POST /api/vault/presigned/initiate/{vault_id}          │
   │  Body: {vault_id, file_id, content_type}                │
   │                            │── S3.create_multipart ─────▶
   │  ◀── 200 {upload_id, part_urls: [...]}                  │
   │                            │                            │
   │  ── PUT directly to S3 presigned URL (large chunks) ───▶│
   │  ── PUT part 2 ──────────────────────────────────────── ▶│
   │  ...                                                    │
   │                            │                            │
   │  POST /api/vault/presigned/complete/{vault_id}          │
   │  Body: {upload_id, parts: [{ETag, PartNumber}]}         │
   │                            │── S3.complete_multipart ───▶
   │  ◀── 200 {status: ok}      │                            │
```

---

## Flow 8: List Files

Used by the pack builder to enumerate all objects in a vault.

```
Client                      Lambda                           S3
   │                            │                             │
   │  GET /api/vault/list/{vault_id}?prefix=bare/data/        │
   │                            │                             │
   │                            │── S3.find_files(            │
   │                            │     prefix='.../vault/da/dap47prw/bare/data/')
   │                            │◀─ [list of S3 keys] ────────│
   │                            │                             │
   │                            │  strip vault prefix from each key
   │                            │  filter out manifest.json   │
   │                            │  extract file_id from path  │
   │                            │                             │
   │  ◀── 200 {                 │                             │
   │    vault_id: "dap47prw",   │                             │
   │    files: [                │                             │
   │      "bare/data/obj-commit-abc",                         │
   │      "bare/data/obj-tree-def",                           │
   │      "bare/data/obj-blob-ghi",                           │
   │      ...                   │                             │
   │    ]                       │                             │
   │  }                         │                             │
```

The list endpoint is unauthenticated. The pack builder uses this internally.
