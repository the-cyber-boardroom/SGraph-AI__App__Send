# Vault Delete Tombstone — Server Behaviour Reference

For the SGit vault move implementation. Describes what the SG/Send server does
when a vault is deleted, and what SGit should expect when implementing move.

---

## What Happens on Delete

`DELETE /api/vault/destroy/{vault_id}` (requires `x-sgraph-vault-write-key`):

1. Validates write key against the vault manifest.
2. Deletes **all objects** under the vault prefix in S3 — including manifest.json,
   all `bare/data/*` objects, all `bare/refs/*` refs.
3. Writes a **tombstone** file at the vault prefix:

```
s3://{bucket}/sg-send__data/sg-send-api__v1.0/shared/vault/{id[:2]}/{vault_id}/deleted.json
```

```json
{
  "vault_id":   "dap47prw",
  "status":     "deleted",
  "deleted_at": 1748300000000
}
```

The tombstone contains **no key material** — no write_key_hash, no encrypted data.

---

## What the Tombstone Does

Once `deleted.json` exists for a vault_id, **no write operation to that vault_id
will succeed — with any key, ever.**

This includes:
- `PUT /api/vault/write/{vault_id}/...`
- `POST /api/vault/batch/{vault_id}` (write, write-if-match, delete ops)
- Any future push from SGit using the same vault_id

All write attempts return:

```
HTTP 403
{"detail": "Write key mismatch"}
```

The tombstone is permanent. There is no server-side endpoint to remove it or
re-enable the vault_id.

---

## What `list_files` Returns

`GET /api/vault/list/{vault_id}` returns an empty list (no payload files exist).
The `deleted.json` tombstone is **not** included in the listing — it is an
internal server file, invisible to clients.

---

## What Reads Return After Delete

All objects are gone. Any `GET /api/vault/read/{vault_id}/...` or batch read
returns 404 / `status: not_found` for all file_ids. Reads are not blocked by
the tombstone (they just find nothing).

---

## Implications for SGit Vault Move

A vault move from the SGit client's perspective is:

```
1. Push all objects to the new vault_id (fresh vault, new write key or same key)
2. Verify the new vault is complete and readable
3. DELETE /api/vault/destroy/{old_vault_id}  ← old vault_id is now tombstoned permanently
```

**After step 3:**
- Any SGit repo still configured with the old vault_id and old write key will get
  **403 on the next push** — even if they have the correct old write key.
- The old vault_id can never be reused or re-pushed to.
- The new vault_id is the only valid target.

**SGit should update its local config (vault_id + write key) to the new vault before
deleting the old one.** Deleting first and then updating config risks leaving the client
pointing at a tombstoned vault with no way to recover without admin intervention.

---

## Safe Move Sequence

```
sgit                              SG/Send server
  │                                    │
  │  1. Push to new_vault_id ─────────▶│  (new vault created on first write)
  │  ◀── 200 ok ───────────────────────│
  │                                    │
  │  2. Verify new vault readable      │
  │     (sgit clone new_vault_id) ────▶│
  │  ◀── objects present ──────────────│
  │                                    │
  │  3. Update local config            │
  │     vault_id  = new_vault_id       │
  │     write_key = new_write_key      │
  │                                    │
  │  4. DELETE old_vault_id ──────────▶│  (tombstone written)
  │  ◀── 200 {status: deleted} ────────│
  │                                    │
  │  old_vault_id permanently blocked  │
  │  new_vault_id is the live vault    │
```

**Do not reverse steps 3 and 4.** If delete happens before config update and
something goes wrong, the client is left with an invalid vault_id pointing at
a tombstone.

---

## Error Responses SGit Will See

| Situation | HTTP | Body |
|-----------|------|------|
| Write to tombstoned vault (any key) | 403 | `{"detail": "Write key mismatch"}` |
| Second delete of same vault | 403 | `{"detail": "Write key mismatch"}` |
| Read from tombstoned vault | 200 | `{"status": "not_found"}` (object gone, not blocked) |
| List files of tombstoned vault | 200 | `{"files": []}` (empty, tombstone not listed) |

Note: the 403 body says "Write key mismatch" — this is the generic auth failure
message. SGit may want to check for 403 specifically and surface a cleaner error
to the user ("vault has been deleted and cannot be reused").
