# DEV-011 | Split Schema__Transfer into one file per schema

**Status:** open
**Type:** task
**Priority:** medium
**Parent:** DEV-000
**Severity:** medium
**Effort:** M
**Files:** `sgraph_ai_app_send/lambda__user/schemas/Schema__Transfer.py`

## Description

All 5 schema classes are in one file. Per project convention, each schema
should be in its own file under the schemas/ directory.

## Target Files

```
schemas/
    Schema__Transfer__Create.py
    Schema__Transfer__Initiated.py
    Schema__Transfer__Complete_Response.py
    Schema__Transfer__Info.py
    Schema__Transfer__Download_Response.py
    Schema__Transfer__Transparency.py       (new - from DEV-007)
    Schema__Transfer__Record.py             (new - from DEV-005)
    Schema__Transfer__Event.py              (new - from DEV-006)
```

## Dependencies

- DEV-010 (replace primitives first, then split)
