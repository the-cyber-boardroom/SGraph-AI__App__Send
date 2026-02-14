# DEV-002 | Create Transfer_Id type (Random_Guid)

**Status:** open
**Type:** task
**Priority:** high
**Parent:** DEV-000
**Severity:** high
**Effort:** S
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

Transfer IDs are currently generated with `secrets.token_hex(6)` (12-char hex).
For security, these should be full UUIDs via `Transfer_Id(Random_Guid)`.

## Current Code

```python
transfer_id = secrets.token_hex(6)  # 12-char random hex string
```

## Target

```python
class Transfer_Id(Random_Guid):
    pass

# Usage:
transfer_id = Transfer_Id()  # Auto-generates full UUID
```

## Impact

- Transfer__Service.py: ID generation
- Schema__Transfer.py: All `transfer_id: str` fields
- Routes__Transfers.py: All `transfer_id: str` parameters
- Tests: assertions on transfer_id length (12 -> UUID format)
