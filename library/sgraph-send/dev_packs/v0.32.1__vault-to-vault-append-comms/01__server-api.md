# 01 — Server API: endpoints, schemas, storage, gates

**version** v0.32.1 · **date** 3 June 2026 · **from** Architect · **type** Implementation briefing (server / User Lambda)

This is **net-new server work on the User Lambda** (`send.sgraph.ai`), living alongside the existing `/vault/*` pointer endpoints (`Routes__Vault__Pointer.py`). All schemas are `Type_Safe` (never Pydantic). All storage goes through `Storage_FS` (never direct S3/boto3). The server stores **opaque ciphertext only** and never decrypts or inspects payloads.

---

## 1. Storage layout

```
transfers/vault/{vault_id}/
  vault_pointer.json                       # the lone unencrypted manifest (cold path)
  inbox/{append_token}/                     # folder name = H(recipient public key) = the token
    {epoch_ms}_{rand_hex}.enc               #   server-assigned name; opaque ciphertext
  processed/{append_token}/                 # reversible "mark as processed" target
    {epoch_ms}_{rand_hex}.enc               #   same file, moved here on mark-processed
```

- **Folder = token = `H(pubkey)`.** Routing, gating, and "which keypair decrypts this" collapse into one non-secret value. A vault may hold several inbox folders (one per correspondent keypair).
- **Filename `{epoch_ms}_{rand_hex}.enc`** is assigned by the server and returned to nobody.
  - `epoch_ms` = **fixed-width 13-digit zero-padded** Unix epoch milliseconds. Fixed width is mandatory: it makes **lexicographic sort == chronological sort**, which is how the drainer paginates by cursor. A variable-width timestamp breaks ordering across a digit boundary.
  - `rand_hex` = **≥ 96 bits** of `crypto`-grade randomness (do **not** reuse the 8-hex `Obj_Id` default — see `04` for why entropy lives here).
- **Two folders, not a delete flag.** `mark-processed` *moves* `inbox/.../X` → `processed/.../X` (reversible, audit trail). Only `purge` unlinks. Mirrors the existing `/vault/destroy` tombstone (`deleted.json`) / `purge:true` precedent.

## 2. Manifest delta (`vault_pointer.json`)

```jsonc
{
  "write_key_hash": "…",            // EXISTS — owner symmetric write gate
  "append_anchors": [ "H(token_1)", "H(token_2)" ],   // NEW — validation hashes ONLY
  "enum_key_hash":  "H(enum_key)"   // NEW — gates listing / fetch / mark-processed
}
```

- Store **hashes only** — never the token, never the public key, never `enum_key`. Same discipline as the existing `write_key_hash`: a server compromise then leaks nothing usable.
- **Removing the public key from the manifest** is deliberate: a passer-by who `GET`s the manifest cannot derive the token. To write, you must have been *provisioned* with the pubkey.
- `append_anchors` is a **list** so token cardinality (D-1) is a config choice, not a schema change. Adding/removing a correspondent = adding/removing one list entry. Time-windowed receipt = an anchor that is present/absent (or carries `expires_at`).
- Manifest changes are **cold-path** (owner-only, rare: keypair/anchor changes). Appends never touch it — they land in the CAS inbox. So **no concurrent-write protection on the manifest is required**; last-write-wins is fine.

## 3. Endpoints

### 3.1 `POST /vault/append/{vault_id}/{append_token}`  — write-blind, token-gated

The only capability the sender has. Gate: `H(presented_token) ∈ append_anchors` **AND** inbox under capacity. Server content-addresses the body into `inbox/{append_token}/{epoch_ms}_{rand}.enc` and returns **only** acceptance.

```python
class Schema__Append_Request(Type_Safe):
    payload : bytes          # opaque ciphertext; server never inspects or decrypts

class Schema__Append_Response(Type_Safe):
    ok : bool                # acceptance only — NO file id, NO inbox state
```

- Returns no id and no count → preserves append-blindness at the ciphertext layer.
- The body `ok:false` must **not** say *why*. Differentiate by status code only (below) so the appender cannot probe inbox state.

### 3.2 `POST /vault/inbox/{vault_id}`  — list (+ optional content), enum-gated

Header: `x-sgraph-enum-key`. Gate: `H(presented) == enum_key_hash`. `POST` (not `GET`) because it takes options and is gate-checked, not cacheable. `include_content` collapses the list-vs-fetch fork into one call.

```python
class Schema__Inbox_Request(Type_Safe):
    include_content : bool        # false → metadata only; true → ciphertext inline (D-2 ceiling)
    inbox           : Safe_Str    # optional — scope to one append_token folder (default: all)
    after_file_id   : Safe_Str    # optional — cursor; return only entries lexically after this
    limit           : int         # optional — page size (server enforces default + max)

class Schema__Inbox_Entry(Type_Safe):
    inbox     : Safe_Str          # which append_token folder
    file_id   : Safe_Str          # {epoch_ms}_{rand_hex}.enc
    size      : int
    received  : Timestamp_Now     # derived from epoch_ms prefix
    content   : bytes             # present only when include_content == true

class Schema__Inbox_Listing(Type_Safe):
    entries   : list              # Schema__Inbox_Entry[], sorted by file_id (== chronological)
    truncated : bool              # true if more entries exist past `limit`
```

- `after_file_id` is the **incremental check-in**: the drainer stores the last id it processed and re-polls only the tail. Cheap as inboxes grow toward the cap.
- `include_content:true` must enforce the **D-2 summed-ciphertext ceiling**; over the limit → `413` and `truncated:true`, caller pages or uses fetch-by-id.

### 3.3 `POST /vault/inbox/fetch/{vault_id}`  — batch fetch by id, enum-gated

Header: `x-sgraph-enum-key`. The "give me this specific set of files" case.

```python
class Schema__Inbox_Fetch_Request(Type_Safe):
    inbox    : Safe_Str          # which folder
    file_ids : list              # explicit set of {epoch_ms}_{rand_hex}.enc

class Schema__Inbox_Fetch_Response(Type_Safe):
    files    : list              # [{ file_id, size, content }]; missing ids reported, not fatal
    missing  : list              # ids not found (idempotency — already moved/purged)
```

### 3.4 `POST /vault/inbox/mark-processed/{vault_id}`  — move pending→processed, enum-gated

Header: `x-sgraph-enum-key`. **Reversible.** This is the drainer's "delete the read ones" — it moves files to `processed/`, it does **not** unlink. Gated by `enum_key` precisely so a relay can clean up after itself without holding the owner's `write_key`.

```python
class Schema__Inbox_MarkProcessed_Request(Type_Safe):
    inbox    : Safe_Str
    file_ids : list

class Schema__Inbox_MarkProcessed_Response(Type_Safe):
    moved    : list              # ids moved inbox→processed
    missing  : list              # ids already moved/absent (idempotent, not an error)
```

### 3.5 `POST /vault/inbox/purge/{vault_id}`  — irreversible unlink, **write_key-gated**

Header: `x-sgraph-send-access-token` + `write_key` (the existing double-gate). **Owner only.** The single irreversible, destructive op on the inbox/processed namespace — deliberately the *highest* tier. Operates on either folder.

```python
class Schema__Inbox_Purge_Request(Type_Safe):
    folder   : Safe_Str          # "inbox" | "processed"
    inbox    : Safe_Str
    file_ids : list              # explicit ids; empty + folder == "processed" → purge all processed

class Schema__Inbox_Purge_Response(Type_Safe):
    purged   : list
    missing  : list              # idempotent
```

## 4. Status codes (so bodies stay clean)

| Code | When |
|---|---|
| `200` | success (incl. idempotent no-ops — report via `missing`/`moved`, not an error) |
| `202` | append accepted (`ok:true`) — optional alternative to `200` |
| `403` | gate failure — bad append token, bad/absent `enum_key`, or missing write gate on purge. **Do not** distinguish bad-token from cap-full in the body. |
| `413` | append payload over per-message cap, **or** `include_content` response over the D-2 summed ceiling |
| `507` | inbox at capacity (append rejected) — distinct from `403` so honest clients back off, but the *append body* still only carries `ok:false` |

## 5. Capacity cap (NET-NEW — read-side 3.75 MB limit does not cover this)

- **Per-inbox cap** on `append`: max file count **and** max total bytes per `inbox/{token}/` folder. Over cap → `507`, `ok:false`. This is the availability mitigation; confidentiality is unaffected by flooding (encrypt-on-write), but a rogue valid-token holder can otherwise fill storage. The forthcoming **agent budget** is the second, finer limiter.
- **Per-message size cap** on `append` payloads → `413`.
- Make both configurable per vault (env-driven default, manifest override later).

## 6. Idempotency & partial failure (mandatory)

- `fetch`, `mark-processed`, `purge` are **batch + idempotent.** An id already moved/absent is reported in `missing`, never fails the batch. This stops drain loops wedging on a re-delivered or already-processed id.
- Reprocessing tolerance: the recipient may legitimately see the same id twice (relay re-delivery). De-dup belongs in the **in-payload sequence number** (`02`), not the server.

## 7. Log hygiene

- `append_token` appears in the **URL path** → it lands in CloudFront/Lambda access logs. It is `H(pubkey)` and non-secret, so this is low-risk and consistent with the existing operational- metadata posture. If you want clean logs, move it to a header (`x-sgraph-append-token`) like `enum_key`. Project-lead call; not a blocker.
- `enum_key` is **header-only** — never put it in a path or query string.
- Never log payload bytes, payload length beyond coarse buckets, or derived ids at info level.

## 8. What stays public / what is now gated

- Blob/tree/commit reads (`/vault/read*`) stay **public** — ciphertext is useless without keys, and random filenames make inbox files unguessable.
- **Inbox enumeration is the one deliberate departure from "reads are public":** `list`, `fetch`, and `mark-processed` are `enum_key`-gated, because the inbox is the one namespace where *counts and timing* are themselves sensitive (traffic analysis). `purge` is `write_key`-gated. This is intentional and narrow — do not gate the rest of the pointer API.
