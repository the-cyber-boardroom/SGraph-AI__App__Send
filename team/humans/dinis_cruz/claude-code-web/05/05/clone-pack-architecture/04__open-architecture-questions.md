# Open Architecture Questions

These are the decisions that must be made before implementation starts.
Each has a clear recommendation and the trade-off stated.

---

## Q1: Route Path — `/api/vault/packs/...` vs `/vaults/.../packs/...`

**The gap:** Brief 08b specifies:
```
GET  /vaults/{vault_id}/packs/{commit_id}/{flavour}
POST /vaults/{vault_id}/objects/missing
```

Existing API uses:
```
GET  /api/vault/read/{vault_id}/{file_id:path}
POST /api/vault/batch/{vault_id}
```

**Option A — Follow brief exactly** (`/vaults/...`)
```
Pros: Matches brief spec, easier for CLI team to cross-reference
Cons: Inconsistent with all existing routes — cognitive split in the API
      Requires the router to handle two top-level path conventions
      May need CORS / auth rule duplication
```

**Option B — Adapt to existing convention** (`/api/vault/packs/...`)
```
GET  /api/vault/packs/{vault_id}/{commit_id}/{flavour}
POST /api/vault/objects/missing/{vault_id}

Pros: Consistent with all 9 existing vault routes
      Same auth model, same CORS, same router registration
      No new path conventions to maintain
Cons: Diverges from brief spec — CLI team must be told
```

**Recommendation:** Option B. The CLI team needs to be told either way;
the brief is a spec, not a contract. Consistency within the codebase wins.

---

## Q2: Pack Auth — Authenticated or Unauthenticated?

**The gap:** Brief proposes `x-sgraph-vault-read-key` auth header on pack endpoints.
This header does not exist in the codebase. All current read operations are unauthenticated.

**Current auth model:**
```
Reads:  no auth (ciphertext only — zero-knowledge)
Writes: x-sgraph-vault-write-key header required
```

**Option A — No auth on pack endpoints (match existing reads)**
```
GET /api/vault/packs/{vault_id}/{commit}/head
(no auth header — consistent with /api/vault/read/... and /api/vault/batch/ read-only)

Pros: Consistent with zero-knowledge model
      Simpler — no new auth concept
      CLI doesn't need to manage a read-key
Cons: Anyone who knows a vault_id + commit_id can download the full pack
      (But: same is true today for batch_read — they can read all objects)
      No change to security boundary
```

**Option B — Introduce read-key auth**
```
Requires inventing and issuing a "read key" per vault
Server must store/check it (new field in manifest)
CLI must hold and send it

Pros: Reduces exposure for large packs (faster to exfiltrate than per-object)
Cons: Breaks zero-knowledge consistency
      Significant new complexity (key issuance, storage, rotation)
      All existing read endpoints would become inconsistent by comparison
```

**Recommendation:** Option A. The security boundary doesn't change — anyone with
vault_id and commit_id can already read all objects via batch_read. Packs are
just a more efficient delivery mechanism for the same ciphertext.

---

## Q3: Where Do Packs Live in Storage?

**The gap:** Brief says `<vault storage>/<vault_id>/packs/`. What does this mean in S3?

**Option A — Inside vault object store (same Storage_FS)**
```
S3 key: sg-send__data/.../vault/da/{vault_id}/packs/{commit}__{flavour}.pack

Pros: Consistent — packs live alongside the objects they index
      Uses existing Storage_FS abstraction (list, read, write, delete)
      Vault delete automatically cleans up packs
Cons: Storage_FS.file__bytes() loads entire file into memory
      A 200MB full pack can't go through file__bytes() — needs streaming bypass
      Pack files have different lifecycle than object files (eviction policy)
```

**Option B — Separate pack store (new storage location)**
```
S3 key: sg-send__data/.../cache/vault-packs/{vault_id}/{commit}__{flavour}.pack
(analogous to existing cache/vault-zips/)

Pros: Clean separation of authoritative data vs derived cache
      Easier to implement lifecycle policies (S3 lifecycle rules)
      Can wipe entire cache without touching vault objects
Cons: Pack-index.json and object listing are in different prefixes
      Vault delete doesn't auto-clean (needs explicit cleanup)
```

**Recommendation:** Option A for path (packs inside vault prefix), but the
streaming limitation MUST be solved regardless. See Q4.

---

## Q4: Streaming Large Packs — The Memory Problem

**Current limitation:** `Storage_FS__S3.file__bytes()` does:
```python
def file__bytes(self, path):
    return self.s3.file_bytes(bucket=self.s3_bucket, key=key)
    # loads entire file into memory as bytes
```

A 200MB full pack cannot go through this path (Lambda memory limit, response buffering).

**Two streaming needs:**
1. **Building:** reading many small S3 objects to assemble the pack
2. **Serving:** streaming the completed pack file to the client

### 4a: Building (reading objects into pack)

Each individual object is small (encrypted blob, typically < 1MB). Building
can use `file__bytes()` per object — this is fine. The issue is doing it
serially vs in parallel.

```
Serial (current Storage_FS model):          Parallel (direct boto3):
  for obj_id in object_set:                  with ThreadPoolExecutor() as pool:
    bytes = storage_fs.file__bytes(obj)        futures = [pool.submit(s3.get_object, ...)
    pack_file.write(bytes)                              for obj in object_set]
                                               for f in futures:
  2375 × ~50ms = ~2 minutes ← too slow          pack_file.write(f.result())

Serial won't meet the ≤30s target for full pack.    ← Must use parallel S3 GETs
```

**Decision needed:** Does the PackBuilder bypass Storage_FS and use boto3 S3 directly
for parallel object reads? This would be the only place in the codebase that does this.

### 4b: Serving (streaming pack to client)

**Option A — Store pack in S3, serve via presigned URL redirect**
```python
# PackEndpoint handler:
pack_s3_key = f'.../packs/{commit}__{flavour}.pack'
presigned   = s3.generate_presigned_url('get_object', Params={...}, ExpiresIn=300)
return RedirectResponse(presigned)

Pros: Zero memory in Lambda for serving
      S3 handles the bytes directly to client
      TTFB can be < 200ms (just redirect)
Cons: Client sees an AWS S3 URL (not a clean API URL)
      Presigned URLs are time-limited (must be generated per request)
      If client doesn't follow redirects, breaks
```

**Option B — Stream from S3 through Lambda via StreamingResponse**
```python
# PackEndpoint handler:
def stream_pack():
    response = s3.get_object(Bucket=bucket, Key=key)
    for chunk in response['Body'].iter_chunks(chunk_size=8192):
        yield chunk

return StreamingResponse(stream_pack(), media_type='application/octet-stream')

Pros: Clean API URL, no S3 exposure
      Works with Lambda Function URLs (BUFFERED mode)
Cons: Lambda BUFFERED mode buffers entire response before sending
      RESPONSE_STREAM mode would be needed for true streaming (not currently configured)
      200MB pack buffered in Lambda = likely timeout/OOM
```

**Option C — Build pack in /tmp, upload to S3, serve via presigned redirect**
```
Build in /tmp → upload to S3 → return presigned redirect (one-time, short TTL)

Pros: Clean build process, no S3-in-flight complexity
      /tmp is up to 10GB in Lambda
Cons: Same presigned URL issues as Option A
      /tmp is ephemeral (pack must also be in S3 for cache persistence)
```

**Recommendation:** This is the biggest unresolved question. **Must decide before implementation.**

Possible answer: `RESPONSE_STREAM` invoke mode for the alias, but this requires
changing the Lambda Function URL config from `BUFFERED` to `RESPONSE_STREAM`.

---

## Q5: Pre-warming Hook — Lambda Async Task Problem

**The issue:** In Lambda, `asyncio.create_task()` creates a coroutine that runs
in the event loop. BUT: when the Lambda handler returns its response, Lambda may
freeze the process immediately. Tasks that haven't completed are frozen and may
never run (or may run on the next invocation if the container is reused).

```
Timeline with asyncio.create_task():

t=0   Request arrives
t=0.1 batch handler validates CAS write
t=0.2 asyncio.create_task(prewarm_pack(...))   ← task scheduled
t=0.3 handler returns 200 response to client
t=0.3 Lambda FREEZES process
         ↑ prewarm task never ran ← BUG

(If container is reused for next request)
t=5.0 Next request arrives, Lambda thaws process
t=5.0 Event loop resumes — prewarm task NOW runs
      But it's for the previous push's HEAD, running during a different request
      This works but is unpredictable and racy
```

**Options:**

**Option A — Accept the best-effort behaviour**
```
Pre-warming runs opportunistically when container is warm.
If container is frozen before task completes:
  → Next clone for that commit triggers on-demand build (202 + retry)
  → Client retries, builds the pack, serves it

Pros: Simplest, no infrastructure changes
      "First clone after push" may need one retry — acceptable?
Cons: Pre-warming guarantee is lost. "Pre-warming" is really "maybe-warming"
```

**Option B — Use Lambda Extensions or SQS for true async**
```
On CAS commit: publish message to SQS queue
Separate Lambda consumer: reads queue, builds pack

Pros: True async, guaranteed execution
Cons: Significant infrastructure addition (SQS queue, second Lambda)
      More moving parts, more cost
```

**Option C — Synchronous pre-warming (block the push response)**
```
Build the head pack synchronously before returning the push response.
Full pack deferred to background.

Pros: Guaranteed pre-warming for head pack (most important one)
Cons: Push response takes 5+ seconds instead of instant
      Very bad UX for the person pushing
```

**Option D — On-demand only, no pre-warming**
```
Remove pre-warming entirely. First clone after push:
  → GET /api/vault/packs/{id}/{commit}/head
  → 202 {"status":"building","retry_after":5}
  → Client retries in 5 seconds
  → 200 pack (built on demand)

Pros: Simplest, no pre-warming complexity
      First clone takes one extra round-trip (~5-30s)
      All subsequent clones are instant
Cons: First user after each push waits for build
```

**Recommendation:** Option D (on-demand only) for v1. Pre-warming is an optimisation,
not a correctness requirement. Ship working on-demand packs first, add pre-warming
as a follow-up once the async story is clearer.

---

## Q6: Object Graph Walking for `head` and `bare-*` Flavours

**The issue:** `head` flavour needs "only trees reachable from HEAD commit's tree_id".
But the server can't decrypt objects to find tree_id — that's inside the encrypted commit.

**What the server can do:**
- List all files with prefix `bare/data/` → gets all object file_ids
- It does NOT know which objects belong to which commit's tree
- It cannot walk the graph without the read key

**Options:**

**Option A — `head` == all objects (treat head = full for now)**
```
For v1, `head` and `full` both serve all objects in the vault.
Client receives extra objects (previous commits' blobs) but correctness preserved.
Pack is larger but simpler to build.

Pros: Implementable without decryption, no new protocol
Cons: Pack size for `head` may be much larger than spec target (≤10MB)
      For a vault with many large blobs and long history, this could be GBs
```

**Option B — Client tells server which object_ids to include**
```
GET /api/vault/packs/{vault_id}/{commit}/head
Body: {"include": ["bare/data/obj-abc", "bare/data/obj-def", ...]}

Client decrypts locally, discovers needed object_ids, then requests the pack.
Server just assembles the listed objects — no graph walking needed.

Pros: Correct head pack (exactly the right objects)
      Server stays zero-knowledge
Cons: Requires two round-trips (decrypt locally, then request pack)
      Partially defeats the purpose (client needs to do some work first)
      Not in the brief spec
```

**Option C — Client-suggested, server-fetched**
```
Client requests pack with hint of the commit's tree_id (encrypted):
GET /api/vault/packs/{vault_id}/{commit}/head?tree_root={encrypted_tree_id}
Server walks bare/data/ listing, includes everything for now (head ≈ full)
In a future version, client can provide the full object_id list

Same as Option A for v1, but with a forward-compat path parameter
```

**Recommendation:** Option A for v1 — `head` == `full` at the object level.
The distinction matters for efficiency but not correctness. Document this as
a known v1 limitation. The brief says "range" is deferred to v2; the same
pragmatism applies to true head filtering.

---

## Q7: `pack-index.json` Concurrency

**Issue:** Multiple Lambda instances may try to build and cache the same pack simultaneously
(e.g., 10 concurrent clones of a fresh push all trigger on-demand build).

```
Instance A                Instance B               S3
   │                           │                    │
   ├─ check cache: miss ───────┼────────────────────▶
   │                           ├─ check cache: miss─▶ (both miss)
   │                           │                    │
   ├─ start building ──────────┤                    │
   │                           ├─ start building    │
   │                           │                    │
   ├─ upload pack ─────────────┼────────────────────▶
   │                           ├─ upload pack ──────▶ (both upload same key — last wins)
   │                           │                    │
   ├─ update pack-index.json ──┼────────────────────▶ ← RACE CONDITION
   │                           ├─ update pack-index─▶ (one update overwrites other)
```

**Options:**

**Option A — Accept race, rely on idempotency**
```
Both instances build the same pack (idempotent — byte-identical output).
Both upload to the same S3 key (last write wins, both are identical).
pack-index.json update is a small JSON write — race is benign (same content).

Pros: No locking needed
      Pack builds are idempotent by spec — safe
Cons: Wastes compute if 10 instances all build simultaneously
      Small window where pack-index.json is inconsistent
```

**Option B — Optimistic S3 write with check-then-act**
```
Before building: check if pack already exists in S3
If exists: skip build, serve cached
If not: build and upload (accept that another instance may race)

Pros: Reduces duplicate builds
Cons: Small TOCTOU window (check then act) — benign since idempotent
```

**Recommendation:** Option A (accept idempotent race) for v1. The builds are
idempotent, the S3 writes are safe, and the pack-index.json race is benign.
If parallel builds become a performance problem, add S3 conditional writes.

---

## Summary: Recommended Decisions

| Question | Recommendation |
|----------|---------------|
| Q1: Route path | `/api/vault/packs/...` (match existing convention) |
| Q2: Pack auth | No auth (match existing reads — zero-knowledge) |
| Q3: Pack storage | Inside vault prefix (`{vault_id}/packs/`) in S3 |
| Q4a: Build reads | Parallel S3 GETs via direct boto3 (bypass Storage_FS) |
| Q4b: Serving | TBD — biggest unresolved question. Presigned redirect vs StreamingResponse vs invoke mode change |
| Q5: Pre-warming | On-demand only for v1 (202 + retry on first request) |
| Q6: head vs full | head == full for v1 (server can't walk graph without decrypt) |
| Q7: Concurrency | Accept idempotent race — safe by design |

**The single most important architectural decision before any code is written:**
**How does the server serve a 200MB pack file from S3 to the client?**
That decision determines the entire serving architecture.
