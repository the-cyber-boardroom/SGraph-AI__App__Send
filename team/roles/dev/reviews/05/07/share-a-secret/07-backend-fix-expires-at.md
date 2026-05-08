# Backend Fix — `expires_at` Type: `str` → `int` (Timestamp_Now)

**Date:** 07 May 2026  
**Urgency:** Required before Share-a-Secret UI can ship  
**Scope:** 2 files changed, ~15 lines total. No schema migration — all existing transfers have `expires_at = ''` / `0` (no expiry), so the change is safe.  
**Tests:** 3 existing tests must be updated + 1 new test to add.

---

## Background

The frontend (v0.3.2) sends `expires_at` as an **integer — milliseconds since Unix epoch** (`Date.now() + hours * 3_600_000`). This matches the project-wide `Timestamp_Now` type used in analytics, vault, and event schemas throughout the codebase.

`Schema__Transfer__Create` and `Schema__Transfer__Info` currently declare `expires_at: str` (ISO-8601 string). `Transfer__Service._is_expired()` parses it with `datetime.fromisoformat()`. Both must be updated to use integer milliseconds.

**No existing production data is affected.** Every transfer created before this fix has `expires_at = ''` (no expiry set). The new `_is_expired()` treats `0` and `''` identically — falsy → not expired.

---

## Changes Required

### 1. `sgraph_ai_app_send/lambda__user/schemas/Schema__Transfer.py`

**Add import** (top of file, alongside existing imports):

```python
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now
```

**`Schema__Transfer__Create` — line 22:** change `expires_at: str` → `Timestamp_Now`

```python
# Before:
expires_at        : str                                                      # ISO-8601 UTC expiry timestamp, empty = no expiry

# After:
expires_at        : Timestamp_Now                                            # Expiry as ms since epoch (0 = no expiry). Timestamp_Now convention.
```

**`Schema__Transfer__Info` — line 44:** same change

```python
# Before:
expires_at          : str                                                    # ISO-8601 UTC expiry, empty = none

# After:
expires_at          : Timestamp_Now                                          # Expiry as ms since epoch (0 = no expiry)
```

---

### 2. `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

**`create_transfer()` signature — line 61:** change default from `''` to `0`

```python
# Before:
expires_at       = ''    ,                          # ISO-8601 UTC, empty = no expiry

# After:
expires_at       = 0     ,                          # ms since epoch, 0 = no expiry
```

**`get_transfer_info()` — line 136:** change default from `''` to `0`

```python
# Before:
expires_at          = meta.get('expires_at', '')       ,

# After:
expires_at          = meta.get('expires_at', 0)        ,
```

**`_is_expired()` — lines 194–199:** replace ISO-8601 string parsing with integer comparison

```python
# Before:
@staticmethod
def _is_expired(meta):                                                       # Check if transfer has passed its expiry timestamp
    exp = meta.get('expires_at', '')
    if not exp:
        return False
    return datetime.now(timezone.utc) > datetime.fromisoformat(exp)

# After:
@staticmethod
def _is_expired(meta):                                                       # Check if transfer has passed its expiry (ms since epoch)
    exp = meta.get('expires_at', 0)
    if not exp:
        return False
    import time
    return (time.time() * 1000) > exp
```

> The `datetime` import at the top of `Transfer__Service.py` remains — it is still used for `created_at` and event timestamps throughout the file. Only the expiry comparison changes.

---

## Tests to Update

**File:** `tests/unit/lambda__user/service/test_Transfer__Service.py`

Three existing tests use ISO-8601 strings. Replace with integer millisecond timestamps.

```python
# Before (all three tests use this pattern):
from datetime import datetime, timezone, timedelta
future = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
past   = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

# After:
import time
future = int(time.time() * 1000) + (24 * 3_600_000)   # now + 24h in ms
past   = int(time.time() * 1000) - (3_600_000)         # now - 1h in ms
```

**Tests to update** (lines ~171–200):
- `test__create__with_expires_at` — change `future` from ISO string to int ms
- `test__download__not_yet_expired` — same
- `test__download__expired_transfer_returns_410` — change `past` from ISO string to int ms

**Assert updates:**  
`test__create__with_expires_at` asserts `meta['expires_at'] == future`. This still works — the value stored is whatever was passed in. Assert type too:

```python
assert meta['expires_at'] == future
assert isinstance(meta['expires_at'], int)   # new: confirm it's stored as int
```

**New test to add** — confirm `0` means "no expiry":

```python
def test__create__with_no_expiry(self):
    result = self.service.create_transfer(file_size_bytes=4, content_type_hint='', sender_ip='')
    meta   = self.service.load_meta(result['transfer_id'])
    assert meta['expires_at'] == 0
    assert self.service._is_expired(meta) is False

def test__is_expired__zero_means_no_expiry(self):
    assert Transfer__Service._is_expired({'expires_at': 0})   is False
    assert Transfer__Service._is_expired({'expires_at': ''})  is False   # legacy safe
    assert Transfer__Service._is_expired({})                  is False
```

---

## Backward Compatibility

All existing transfers in storage have `expires_at` stored as `''` (empty string from the old default). The new `_is_expired()` uses `if not exp: return False` — both `0` and `''` are falsy, so existing transfers are unaffected.

No data migration needed.

---

## Routes / API Impact

The `expires_at` field flows from the API body → schema → service → meta storage → info response. The schema type change (`str` → `Timestamp_Now`) handles validation automatically. The API response (`GET /api/transfers/info/{id}`) will now return `expires_at` as an integer instead of a string — this is what the v0.3.2 frontend expects (`new Date(expiresAt).toLocaleString()` works with both int ms and ISO string, but int is correct).

No route handler changes needed.

---

## Summary — Files and Lines

| File | Lines changed | Nature |
|------|--------------|--------|
| `sgraph_ai_app_send/lambda__user/schemas/Schema__Transfer.py` | 3 (import + 2 field declarations) | Type change |
| `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py` | 7 (`_is_expired`, two defaults) | Logic change |
| `tests/unit/lambda__user/service/test_Transfer__Service.py` | ~15 (3 updated + 2 new tests) | Test update |
