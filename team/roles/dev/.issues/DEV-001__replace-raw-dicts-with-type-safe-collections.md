# DEV-001 | Replace raw dicts with Type_Safe collections / Memory-FS

**Status:** open
**Type:** task
**Priority:** high
**Parent:** DEV-000
**Severity:** high
**Effort:** L
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

`Transfer__Service.transfers` and `Transfer__Service.payloads` are raw `dict` types.
They should use Type_Safe collections (Type_Safe__Dict subclasses) and ultimately
be backed by Memory-FS (`Storage_FS`) for pluggable storage backends.

## Current Code

```python
transfers : dict   # In-memory store: {transfer_id: meta_dict}
payloads  : dict   # In-memory store: {transfer_id: bytes}
```

## Target

```python
transfers : Dict__Transfers     # Type_Safe__Dict with Transfer_Id keys
payloads  : Dict__Payloads      # Type_Safe__Dict with Transfer_Id keys, bytes values
```

Eventually backed by Memory-FS:
```python
storage_transfers : Memory_FS__Latest   # Transfer metadata
storage_payloads  : Memory_FS__Latest   # Encrypted payload bytes
```

## Dependencies

- DEV-002 (Transfer_Id type needed for keys)
- DEV-005 (Transfer metadata schema needed for values)
