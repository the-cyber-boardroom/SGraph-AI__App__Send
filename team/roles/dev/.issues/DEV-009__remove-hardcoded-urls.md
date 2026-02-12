# DEV-009 | Remove hardcoded URLs from service

**Status:** open
**Type:** task
**Priority:** low
**Parent:** DEV-000
**Severity:** low
**Effort:** S
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

Transfer__Service hardcodes URL paths:
- `upload_url = f'/transfers/upload/{transfer_id}'`
- `download_url = f'/d/{transfer_id}'`

The service should not know about URL routing. The caller (Routes) should
derive URLs from the transfer_id.

## Affected Locations

- create_transfer: upload_url construction
- complete_transfer: download_url construction
