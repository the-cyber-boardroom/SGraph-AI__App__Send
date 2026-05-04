# Brief 08b — SG/Send Backend: Clone Pack Endpoints

**Owner:** SG/Send API dev team (`sgraph-ai-app-send` repo)
**Sister brief:** `brief__08__server-clone-packs.md` (CLI-side client implementation; runs in parallel)
**Status:** Ready to execute. Self-contained — no need to read the CLI repo's brief-pack.
**Estimated effort:** ~2–3 working days
**Touches:** new endpoints + pack builder + cache layer in the FastAPI service. **No vault-format change.**

---

## 1. Why this brief exists

A real-world SGit-AI vault (4-agent collaborative website, 42 commits,
2,375 distinct tree objects, 165 blobs) currently takes **~202 seconds
to clone**, of which **184 s (91 %) is tree-walking**. The CLI team's
diagnosis confirms the root cause is one HTTP request per BFS wave (3–4
waves × ~600 objects each, with the server doing one S3 GET per object
inside each batch).

**The fix:** the server pre-assembles a single binary "**clone pack**"
containing all encrypted objects a client needs to clone to a given
state. **One HTTP request per clone, regardless of vault size.**
Expected speedup: **40–100×** on the case-study vault.

Pack contents are **encrypted ciphertext only** — the server never sees
plaintext. Zero-knowledge guarantee preserved.

---

## 2. Scope

You will:

1. Implement a **`PackBuilder`** that, given `(vault_id, commit_id, flavour)`,
   walks the commit graph (using existing per-object storage as the source
   of truth), assembles a binary pack per the wire format below, and writes
   it to a cache directory.
2. Implement a **`PackCache`** managing pack files on disk under
   `<vault storage>/packs/`, with an LRU eviction policy.
3. Implement two new HTTP endpoints (see §4).
4. Implement an **async pre-warming hook** triggered on successful push:
   pre-builds the `full` and `head` packs for the new HEAD commit.
5. Test: pack-builder, pack-cache, endpoint correctness, pre-warming.

You will NOT:

- Change the on-disk vault format (existing per-object storage stays
  authoritative).
- Change the existing `batch_read` endpoint (old clients keep using it).
- Touch any client-side code (the CLI team handles that in parallel).

---

## 3. Wire format

A clone pack is a single binary file. Layout (big-endian, no padding
unless noted):

### 3.1 Header (76 bytes, fixed)

| Offset | Length | Field | Description |
|---:|---:|---|---|
| 0 | 4 | `magic` | ASCII bytes `SGPK` |
| 4 | 1 | `format_version` | `1` for this spec |
| 5 | 1 | `flavour` | enum: `1`=`full`, `2`=`head`, `3`=`bare-full`, `4`=`bare-head`, `5`=`range` |
| 6 | 2 | `reserved` | zeros |
| 8 | 12 | `vault_id` | 12-char ASCII vault id, NUL-padded if shorter |
| 20 | 32 | `commit_id` | the HEAD commit id (object-id form), ASCII, NUL-padded |
| 52 | 8 | `created_at_ms` | unix epoch in milliseconds (uint64) |
| 60 | 8 | `index_offset` | byte offset of the Index section within the file (uint64) |
| 68 | 4 | `index_length` | byte length of the Index section (uint32) |
| 72 | 4 | `reserved2` | zeros |

### 3.2 Body (variable)

Concatenated **encrypted ciphertext** objects, no separators or alignment
padding. The Index section's `offset` + `length` per entry drive parsing.
Body starts immediately after the 76-byte header.

### 3.3 Index (variable)

A sequence of variable-length entries (driven by the `id_length` field):

| Length | Field | Description |
|---:|---|---|
| 1 | `id_length` | length of `obj_id` in bytes (uint8; max 64) |
| `id_length` | `obj_id` | the object id as ASCII bytes |
| 8 | `offset` | byte offset within Body where the object begins (uint64) |
| 4 | `length` | byte length of the object's ciphertext (uint32) |
| 1 | `obj_type` | enum: `1`=`commit`, `2`=`tree`, `3`=`blob`, `4`=`ref`, `5`=`index`, `6`=`key` |
| 3 | `reserved` | zeros |

Entries are sorted by `obj_id` ASCII ascending.

The Index section's location is `header.index_offset` and its length
is `header.index_length`.

### 3.4 Footer (32 bytes, fixed)

| Length | Field | Description |
|---:|---|---|
| 32 | `body_sha256` | SHA-256 of the Body section (the whole concatenated ciphertext, NOT the header or index) |

`format_version=1` does **not** include a signature. A future
`format_version=2` may extend the footer; clients reading version 1 don't
need to handle this.

### 3.5 File total layout

```
[Header (76 bytes)] [Body (variable)] [Index (variable)] [Footer (32 bytes)]
```

Note: the Index sits AFTER the Body, not before, so the builder can
stream objects to disk and write the index once it knows all offsets.
Clients seek to the Index using `header.index_offset`.

---

## 4. HTTP API

### 4.1 `GET /vaults/{vault_id}/packs/{commit_id}/{flavour}`

**Purpose:** download a clone pack.

**Path parameters:**
- `vault_id` — 12-char vault id.
- `commit_id` — the HEAD commit's encrypted-object-id.
- `flavour` — one of `full`, `head`, `bare-full`, `bare-head`, `range`.

**Headers:**
- `x-sgraph-vault-read-key: <hex>` — required. Same auth used by the
  existing `batch_read` endpoint.

**Responses:**

| Status | Body | When |
|---:|---|---|
| 200 | binary pack | Pack exists (cached or just-built); `Content-Type: application/octet-stream`; `Content-Length: <bytes>` |
| 202 | `{"status":"building","retry_after":<seconds>}` JSON | Pack is being built async; client should retry after `retry_after` seconds. Also set `Retry-After` HTTP header. |
| 404 | `{"error":"commit_not_found"}` JSON | Vault exists but the commit-id isn't in it |
| 404 | `{"error":"flavour_not_supported"}` JSON | Server doesn't support this flavour (e.g., `range` not implemented yet) |
| 401 / 403 | per existing auth conventions | Auth header missing or invalid |

**Streaming:** the server SHOULD stream the pack body rather than
buffering the whole pack in memory. Packs can be hundreds of MB.

### 4.2 `POST /vaults/{vault_id}/objects/missing`

**Purpose:** safety-net backfill for objects referenced in a pack but
not actually present (rare; e.g. if pack was built before some object
existed and the cache is stale).

**Body (JSON):**
```json
{ "object_ids": ["<obj-id>", "<obj-id>", ...] }
```

**Headers:** same as §4.1.

**Response (200):**
```json
{
  "<obj-id>": "<base64-of-encrypted-blob>",
  "<obj-id>": null,
  ...
}
```

`null` means the object was genuinely not found (the client treats this
as an error); a base64 string means the ciphertext was retrieved.

This endpoint is rarely hit in practice — included for resilience.

### 4.3 (Existing) `GET /vaults/{vault_id}/objects/...` and `POST .../batch_read` — unchanged

Old clients keep using these. Don't deprecate yet.

---

## 5. Pack-builder algorithm

Given `(vault_id, commit_id, flavour)`:

1. **Resolve the object set** based on flavour:
   - `full` — walk the commit graph from `commit_id` back through all
     ancestors; collect every reachable commit + tree + blob object id.
   - `head` — collect the commit itself + only the trees rooted at
     `commit_id`'s `tree_id` (no historical trees) + all blobs reachable
     from those trees.
   - `bare-full` — like `full` but drop blobs (commits + trees only).
   - `bare-head` — like `head` but drop blobs (commits + HEAD trees only).
   - `range` — defer for a future format version; for now, return 404.

2. **Sort the object set** by object-id ASCII ascending.

3. **Stream-build the pack** to a temp file under
   `<vault storage>/packs/.tmp/`:
   - Reserve 76 bytes for the header (write zeros, fix up at end).
   - For each object: read its ciphertext from the existing object store,
     append to file, record `(obj_id, offset, length, obj_type)`.
   - Write the Index entries (sorted) immediately after the body.
   - Compute SHA-256 of the body (bytes between header end and index start).
   - Write the footer.
   - Seek back to offset 0 and write the real header (now we know
     `index_offset` + `index_length`).

4. **Atomically rename** the temp file to `<commit_id>__<flavour>.pack`.

5. **Update `pack-index.json`** in the vault's pack directory:
   ```json
   {
     "<commit_id>": {
       "full":      {"size_bytes": 1234, "built_at_ms": 1709...},
       "head":      {"size_bytes": 567,  "built_at_ms": 1709...},
       "bare-full": null,
       "bare-head": null
     },
     ...
   }
   ```
   This index is for cache management + observability, not served to clients.

6. **Idempotency:** building the same `(vault_id, commit_id, flavour)`
   twice MUST produce byte-identical output. Object ordering (sorted
   by id) makes this deterministic.

---

## 6. Cache policy

### 6.1 On-disk layout

```
<vault storage>/<vault_id>/
├── data/                       existing — individual encrypted objects
│   └── <object-id>
└── packs/                      NEW
    ├── pack-index.json
    ├── .tmp/                   transient build files
    └── <commit-id>__<flavour>.pack
```

### 6.2 Eviction

- LRU on `built_at_ms` from the pack-index.
- Per-vault budget: configurable (default **100 packs OR 5 GB total
  per vault, whichever first**).
- Eviction never deletes the latest 3 packs per (commit, any flavour).
- Eviction is opportunistic — fires on pack-build, not on a timer.

### 6.3 Eviction is safe

Packs can be re-built from individual objects at any time. Eviction
loses no data.

---

## 7. Pre-warming hook

When a push completes successfully (the existing endpoint that finalises
a new HEAD ref), fire a fire-and-forget async task:

1. Build the `full` pack for the new HEAD commit-id.
2. Build the `head` pack for the new HEAD commit-id.
3. Update `pack-index.json`.

The push response should NOT wait for this to complete. The async task
runs in the same process (or a worker queue if the FastAPI service
already has one — match your existing convention).

If a build fails, log it and move on. The next clone for that
(commit, flavour) will trigger an on-demand build.

---

## 8. Performance budgets

Targets for the case-study vault (42 commits, 2,375 trees, 165 blobs):

| Metric | Target |
|---|---|
| Time to build `head` pack | ≤ 5 seconds |
| Time to build `full` pack | ≤ 30 seconds |
| Pack size (`head`) | ≤ 10 MB |
| Pack size (`full`) | ≤ 200 MB |
| Time to serve cached pack | ≤ 200 ms TTFB; throughput limited by network |

Smaller vaults proportionally faster. If your numbers are much worse
on a real vault, the bottleneck is likely the per-object S3 GET inside
the pack-builder — measure and optimise (e.g., parallel S3 GETs
during build).

---

## 9. Backward compatibility

- **Old clients** (pre-v0.12.x SGit-AI CLI) keep using `batch_read` and
  ignore the pack endpoints entirely. **No breaking change for them.**
- **New clients on an old server** detect the missing pack endpoint via
  a 404 from `GET /packs/...` and fall back to per-object download.
  **Graceful degradation built-in on the client side.**
- **Existing vaults** can have packs built on demand from existing
  per-object storage. **No migration of existing vaults required.**
- **Pack format versioning:** the `format_version` byte in the header
  enables future v2 (e.g., for signed packs). Clients reading v1 packs
  ignore footer bytes beyond the SHA-256.

---

## 10. Encryption + zero-knowledge

- **Body is ciphertext only.** The server is bundling encrypted objects
  exactly as they're stored. The server never decrypts anything during
  pack build.
- **Index lists object-ids and offsets** — same metadata the server
  already exposes via per-object endpoints. No new information leak.
- **Pack auth** uses the same `x-sgraph-vault-read-key` header as the
  existing batch_read. Anyone with the read-key can already see all
  objects via batch_read; packs don't change the access boundary.
- **No content-addressable hash leak**: object-ids in SGit-AI are
  HMAC-derived, so listing them in the Index doesn't expose plaintext.

---

## 11. Testing

### 11.1 Unit tests (in your existing pytest setup)

- **Pack builder** — synthetic vault with N commits / M trees / K blobs;
  build pack; deserialise; verify every expected object-id is present
  with correct ciphertext bytes.
- **Wire format round-trip** — build → write → read → assert byte
  equality of objects.
- **Idempotency** — build the same `(vault_id, commit_id, flavour)`
  twice; assert byte-identical pack files.
- **Cache eviction** — fill cache past the budget; verify LRU eviction
  kicks in and the latest-3-per-commit guard holds.
- **Endpoint tests** — `GET /packs/...` happy path, 202-while-building,
  404-not-found, 401-no-auth.
- **Backfill endpoint** — `POST /objects/missing` returns ciphertext
  for known + null for unknown.

### 11.2 Integration test (joint with CLI team)

The CLI team will provide a fixture vault and a "spec compliance" test
suite that the SG/Send service can run against. The suite:

1. Pushes a vault to the SG/Send service.
2. Waits for pre-warming to complete (or polls until 200 from
   `/packs/<commit>/head`).
3. Downloads the pack.
4. Decrypts every object using the vault's read-key.
5. Asserts every expected commit / tree / blob is present and
   round-trips through the existing in-memory `Vault__Object_Store`
   format.

Coordinate with the CLI team on the fixture format and expected output.

---

## 12. Acceptance criteria

- [ ] Wire format spec doc reviewed + agreed (this brief is the spec;
      flag if any field needs adjustment).
- [ ] `PackBuilder` produces byte-identical packs on repeat builds.
- [ ] `GET /vaults/{vault_id}/packs/{commit_id}/{flavour}` works for
      `full` and `head` flavours; 202 + Retry-After while building;
      404 for unknown commit.
- [ ] `POST /vaults/{vault_id}/objects/missing` works with mixed
      known/unknown ids.
- [ ] Pre-warming hook fires on push completion; first clone after
      push hits the pack cache.
- [ ] Cache eviction policy implemented; latest-3-per-commit protected.
- [ ] Unit test coverage on new code ≥ 85 %.
- [ ] Integration test with CLI fixture vault passes.
- [ ] Performance budgets met on the case-study vault profile.
- [ ] Existing `batch_read` endpoint unchanged; old clients still work.

---

## 13. Open questions for the SG/Send architect

These should be resolved before implementation starts:

1. **Async runtime:** does the existing FastAPI service have a worker
   queue (Celery / RQ / arq / asyncio.create_task) you'd prefer for
   pre-warming? If not, asyncio.create_task is simplest.
2. **Pack storage location:** is `<vault storage>/<vault_id>/packs/`
   the right home? Or is your storage layer abstracted and packs
   should live behind the same abstraction as `data/`?
3. **Object-id field width** in the Index: 64-byte max via the 1-byte
   `id_length` field — is that comfortable? Most SGit-AI object-ids
   are 24 chars (`obj-cas-imm-<12-hex>`), so 64 is plenty, but worth
   confirming.
4. **Streaming on the response:** are you streaming via FastAPI's
   `StreamingResponse` or some other mechanism? Worth aligning so the
   pack-builder can pipe directly into the response without buffering.
5. **Range pack format** — defer to v2? The `range` flavour is in the
   spec for forward-compat but isn't required for v0.12.x.

Reply with answers (or your preferred design) and the CLI team will
adjust their client-side consumer accordingly.

---

## 14. Coordination

- **CLI team contact:** the v0.12.x sprint at
  `team/villager/v0.12.x__perf-brief-pack/` in the `sgit-ai/sgit-ai__cli`
  repo. Brief 08 (`brief__08__server-clone-packs.md`) covers the
  client-side consumption (download + verify + unpack into local store).
- **Joint integration test:** as soon as your Phase 1 (pack-builder + GET
  endpoint) is up on a staging instance, the CLI team can run their
  consumer against it. Don't wait for full pre-warming — they want to
  verify the wire format ASAP.
- **Backward-compat handshake:** the CLI client probes the pack endpoint
  with a HEAD request; if 404, falls back to `batch_read`. So you can
  ship the new endpoint without coordinating a CLI release.

---

## 15. Out of scope

- Push-pack format (the inverse — uploading a pack to push). The CLI
  team's brief B15 will spec a separate push-pack format later, but it's
  NOT part of this brief.
- Server-side signing of packs (deferred to format_version=2).
- CDN / multi-region pack distribution.
- The CLI client implementation — that's brief B08 in the CLI repo.

---

## 16. When done

Return:

1. Confirmation that all acceptance criteria pass.
2. Performance numbers from the case-study vault (or comparable).
3. Any wire-format adjustments made (the spec evolves with the first
   real implementation — that's expected).
4. Staging endpoint URL where the CLI team can run their integration
   test.
