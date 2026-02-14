# DEV-005 | Create Type_Safe schema for transfer metadata

**Status:** open
**Type:** task
**Priority:** high
**Parent:** DEV-000
**Severity:** high
**Effort:** M
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

The `meta` dict in `create_transfer` is a raw dict with 8 fields. This should
be a Type_Safe schema class (Schema__Transfer__Record or similar) that auto-initializes
fields like transfer_id (Transfer_Id), created_at (Timestamp_Now), download_count (Safe_UInt).

## Current Code

```python
meta = dict(transfer_id=..., status='pending', file_size_bytes=...,
            content_type_hint=..., created_at=now, sender_ip_hash=...,
            download_count=0, events=[])
```

## Target

```python
class Schema__Transfer__Record(Type_Safe):
    transfer_id     : Transfer_Id
    status          : Enum__Transfer__Status
    file_size_bytes : Safe_UInt__FileSize
    content_type_hint : Safe_Str__Http__Content_Type
    created_at      : Timestamp_Now
    sender_ip_hash  : str
    download_count  : Safe_UInt
    events          : List[Schema__Transfer__Event]
```

## Dependencies

- DEV-002 (Transfer_Id)
- DEV-003 (Enum__Transfer__Status)
- DEV-004 (Timestamp_Now)
- DEV-006 (Schema__Transfer__Event)
