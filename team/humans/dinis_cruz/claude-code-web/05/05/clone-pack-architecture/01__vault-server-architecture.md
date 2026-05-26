# Vault Server Architecture — How It Actually Works

This is a code-verified description of the server-side vault implementation.
All paths, classes, and behaviours are from reading the source directly.

---

## 1. The Storage Layer

### 1.1 Abstraction: Storage_FS

All storage goes through a pluggable `Storage_FS` interface:

```
Storage_FS  (abstract interface)
    ├── Storage_FS__Memory      ← unit tests, local dev
    ├── Storage_FS__Local_Disk  ← Docker / server mode
    └── Storage_FS__S3          ← Lambda production
```

Methods on `Storage_FS`:
- `file__bytes(path)` → reads entire file into memory as bytes
- `file__save(path, data)` → writes bytes
- `file__exists(path)` → bool
- `file__delete(path)`
- `file__json(path)` → parsed JSON
- `folder__files__all(prefix)` → list of all keys under prefix

**Critical limitation:** there is no streaming read. `file__bytes()` loads the
whole object into memory. For large packs this is a problem (see open questions).

### 1.2 S3 Key Structure

All keys follow this pattern:

```
sg-send__data/sg-send-api__v1.0/{DEPLOYMENT_ID}/
│
├── transfers/
│   └── {id[:2]}/{transfer_id}/
│       ├── meta.json
│       └── payload
│
├── vault/
│   └── {vault_id[:2]}/{vault_id}/
│       ├── manifest.json                ← auth record (write_key_hash, created_at)
│       ├── {file_id}/payload            ← encrypted object bytes
│       └── ...
│
└── cache/
    └── vault-zips/{vault_id}/{hash}.zip ← existing zip cache (different feature)
```

`DEPLOYMENT_ID` defaults to `'shared'` but can be overridden via `SEND__DEPLOYMENT_ID`
env var. Dev, main, and prod all use `'shared'` (same data namespace).

### 1.3 Vault File Paths (examples)

For vault_id `dap47prw`:

```
sg-send__data/sg-send-api__v1.0/shared/vault/da/dap47prw/
├── manifest.json
├── bare/
│   ├── refs/
│   │   └── ref-current/payload         ← HEAD ref (points to latest commit-id)
│   └── data/
│       ├── obj-commit-abc123/payload   ← encrypted commit object
│       ├── obj-tree-def456/payload     ← encrypted tree object
│       └── obj-blob-ghi789/payload     ← encrypted blob object
└── (packs/ would go here — NEW, doesn't exist yet)
```

The `bare/data/` and `bare/refs/` structure is a **client convention** (SGit-AI CLI).
The server treats file_ids as opaque strings — it stores whatever path the client sends.

---

## 2. The Vault Object Model

### 2.1 Object IDs

Object IDs are opaque strings defined by the client. From tests:
- Commit objects: `bare/data/obj-commit-{id}`
- Tree objects:   `bare/data/obj-tree-{id}`
- Blob objects:   `bare/data/obj-blob-{id}`
- Refs:           `bare/refs/ref-{name}` (e.g. `bare/refs/ref-current`)

The brief says SGit-AI uses HMAC-derived IDs (not SHA-256 of content) so listing
object-ids in a pack index doesn't expose plaintext — security property preserved.

Typical ID length: 24 chars. Max the brief allows in pack index: 64 chars. Fine.

### 2.2 Vault Git-Like Object Graph

```
bare/refs/ref-current  →  "obj-commit-abc123"   (the HEAD pointer)
        │
        ▼
bare/data/obj-commit-abc123   (encrypted commit — contains tree_id + parent_commit_id)
        │
        ├──tree──▶  bare/data/obj-tree-def456   (encrypted root tree — lists subtrees + blobs)
        │                   │
        │                   ├──▶  bare/data/obj-tree-ghi789   (subtree)
        │                   │           │
        │                   │           └──▶  bare/data/obj-blob-xyz   (encrypted blob)
        │                   │
        │                   └──▶  bare/data/obj-blob-abc   (encrypted blob)
        │
        └──parent──▶  bare/data/obj-commit-prev123  (previous commit)
                              │
                              └──▶ ... (commit history)
```

**The server stores ciphertext only.** It never decrypts. The object graph structure
(commit → tree → blob relationships) is encoded inside the encrypted objects and is
only visible to holders of the vault's read key.

### 2.3 Auth Model

```
Write operations    → require x-sgraph-vault-write-key header
                       server hashes it: SHA-256(write_key_hex)
                       compares to manifest.write_key_hash

Read operations     → NO auth required
                       data is encrypted — reading ciphertext reveals nothing
                       (zero-knowledge design)

Batch read-only     → NO auth (auto-detected if all ops are 'read')
Batch with writes   → requires write key
```

### 2.4 Manifest

Created on first write to a vault. Stored at:
`sg-send__data/.../vault/{id[:2]}/{vault_id}/manifest.json`

```json
{
  "vault_id": "dap47prw",
  "write_key_hash": "sha256hex...",
  "created_at": 1714000000000
}
```

Cached in Lambda memory for the lifetime of the container (avoids repeated S3 GETs).

---

## 3. Service Classes

### 3.1 Service__Vault__Pointer

`sgraph_ai_app_send/lambda__user/service/Service__Vault__Pointer.py`

The core service. All vault operations go through this class.

```python
class Service__Vault__Pointer(Type_Safe):
    storage_fs      : Storage_FS  # pluggable backend
    _manifest_cache : dict         # Lambda-lifetime cache: vault_id → manifest

    # Public API:
    def write(vault_id, file_id, write_key_hex, payload_bytes)  → dict | None
    def read(vault_id, file_id)                                  → bytes | None
    def delete(vault_id, file_id, write_key_hex)                 → dict | None
    def write_if_match(vault_id, file_id, match_b64, data_b64,
                       write_key_hex)                            → dict
    def list_files(vault_id, prefix='')                          → dict
    def batch(vault_id, operations, write_key_hex)               → dict | None
    def batch_read(vault_id, operations)                         → dict  # no auth
    def delete_vault(vault_id, write_key_hex)                    → dict | None
```

### 3.2 Routes__Vault__Pointer

`sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Vault__Pointer.py`

FastAPI route handlers. All paths are under `/api/vault/`:

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| PUT    | `/api/vault/write/{vault_id}/{file_id:path}` | write-key | |
| GET    | `/api/vault/read/{vault_id}/{file_id:path}` | none | |
| GET    | `/api/vault/read-base64/{vault_id}/{file_id:path}` | none | returns base64 |
| DELETE | `/api/vault/delete/{vault_id}/{file_id:path}` | write-key | |
| POST   | `/api/vault/batch/{vault_id}` | write-key (or none if read-only) | |
| GET    | `/api/vault/list/{vault_id}` | none | |
| GET    | `/api/vault/health/{vault_id}` | none | checks vault exists |
| GET    | `/api/vault/zip/{vault_id}` | none | existing zip cache |
| DELETE | `/api/vault/destroy/{vault_id}` | write-key | deletes entire vault |

### 3.3 Send__Config (storage mode)

`sgraph_ai_app_send/lambda__user/storage/Send__Config.py`

Determines which `Storage_FS` backend to create. Key env vars:
- `SEND__STORAGE_MODE` — explicit mode: `s3`, `disk`, `memory`
- `SEND__S3_BUCKET` — explicit bucket name (bypasses STS call)
- `SEND__DEPLOYMENT_ID` — namespace within bucket (default: `shared`)

In production Lambda: both `SEND__STORAGE_MODE=s3` and `SEND__S3_BUCKET=...`
are now set explicitly in the Lambda env vars (required for SnapStart —
see session notes).

---

## 4. FastAPI App Wiring

`sgraph_ai_app_send/lambda__user/fast_api/Fast_API__SGraph__App__Send__User.py`

```python
class Fast_API__SGraph__App__Send__User(Serverless__Fast_API):

    def setup(self):
        storage_fs = self.send_config.create_storage_backend()  # one backend, shared

        # All services share the same storage_fs instance:
        self.transfer_service  = Transfer__Service(storage_fs=storage_fs)
        self.vault_service     = Service__Vault__Pointer(storage_fs=storage_fs)
        self.vault_zip_service = Service__Vault__Zip(vault_service=self.vault_service,
                                                     storage_fs=storage_fs)
        # Routes injected with their required services:
        self.add_routes(Routes__Vault__Pointer,
                        vault_service        = self.vault_service,
                        vault_zip_service    = self.vault_zip_service,
                        admin_service_client = self.admin_service_client)
        self.add_routes(Routes__Vault__Presigned, ...)
```

---

## 5. Async Model

Route handlers in `Routes__Vault__Pointer` use `async def` where they need to
`await request.body()` or `await request.json()`. The service layer (`Service__Vault__Pointer`)
is fully **synchronous** — no async/await anywhere in the service.

No background task queue exists (no Celery, no RQ, no arq). Pre-warming would use
`asyncio.create_task()` — already used in the codebase in `utils/MCP__Setup.py`.

Lambda execution model: single-threaded per invocation. `asyncio.create_task()` in a
Lambda context behaves differently than in a long-running server — the task may not
complete before the Lambda returns. This is a critical design question (see file 04).

---

## 6. Existing Zip Cache (analogous feature)

There is already a `Service__Vault__Zip` that builds a zip of all vault objects.
Path: `sg-send__data/.../cache/vault-zips/{vault_id}/{content_hash}.zip`

This is the closest existing analogue to the proposed pack cache:
- Built on demand, cached at a content-addressed path
- Served via `GET /api/vault/zip/{vault_id}`
- Different purpose (human download) but same pattern

Understanding how `Service__Vault__Zip` works may inform the pack cache design.
