# DEV-014 | Add @type_safe decorators to all methods

**Status:** open
**Type:** task
**Priority:** high
**Parent:** DEV-000
**Severity:** high
**Effort:** M
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`, `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Transfers.py`

## Description

No public methods in Transfer__Service or Routes__Transfers have @type_safe decorators.
All public methods should use @type_safe with fully typed parameters and return types.

## Affected Methods

### Transfer__Service
- create_transfer(file_size_bytes, content_type_hint, sender_ip)
- upload_payload(transfer_id, payload_bytes)
- complete_transfer(transfer_id)
- get_transfer_info(transfer_id)
- get_download_payload(transfer_id, downloader_ip, user_agent)
- hash_ip(ip_address)

### Routes__Transfers
- create(request)
- upload__transfer_id(transfer_id, request)
- complete__transfer_id(transfer_id)
- info__transfer_id(transfer_id)
- download__transfer_id(transfer_id, request)

## Note

Routes methods interact with FastAPI which has its own parameter injection.
The @type_safe decorator may conflict with FastAPI's dependency injection.
Needs investigation for route methods specifically.

## Dependencies

- DEV-002 (Transfer_Id for typed parameters)
- DEV-010 (Safe_* types for parameters)
