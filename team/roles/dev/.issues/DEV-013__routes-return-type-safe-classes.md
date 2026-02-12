# DEV-013 | Routes return Type_Safe classes, service creates return objects

**Status:** open
**Type:** task
**Priority:** high
**Parent:** DEV-000
**Severity:** high
**Effort:** M
**Files:** `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Transfers.py`, `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

Route methods currently return raw `dict` and create new objects in the route layer.
The service should return Type_Safe schema objects, and routes should pass them through.

## Current Pattern

```python
# Route creates objects:
return dict(status='uploaded', transfer_id=transfer_id, size=len(body))

# Service returns dicts:
return dict(transfer_id=transfer_id, upload_url=upload_url)
```

## Target Pattern

```python
# Service returns Type_Safe:
return Schema__Transfer__Initiated(transfer_id=transfer_id, upload_url=upload_url)

# Route passes through:
return self.transfer_service.create_transfer(...)
```

## Note on Pydantic Bug

FastAPI uses Pydantic for response serialization. Type_Safe classes may need
a `.json()` call or custom response handling to work with FastAPI. This needs
investigation and may require a workaround.
