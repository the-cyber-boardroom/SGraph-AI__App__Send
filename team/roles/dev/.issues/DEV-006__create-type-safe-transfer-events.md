# DEV-006 | Create Type_Safe schema for transfer events

**Status:** open
**Type:** task
**Priority:** medium
**Parent:** DEV-000
**Severity:** medium
**Effort:** S
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

Transfer events are raw dicts appended to the `events` list.
They should be Type_Safe classes.

## Current Code

```python
meta['events'].append(dict(action='upload', timestamp=datetime.now(...).isoformat()))
meta['events'].append(dict(action='download', timestamp=..., ip_hash=..., user_agent=...))
```

## Target

```python
class Schema__Transfer__Event(Type_Safe):
    action     : Enum__Transfer__Event_Action
    timestamp  : Timestamp_Now
    ip_hash    : str = None
    user_agent : str = None
```
