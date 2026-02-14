# DEV-012 | Fix injection vulnerabilities in HTTPException

**Status:** open
**Type:** bug
**Priority:** critical
**Parent:** DEV-000
**Severity:** critical
**Effort:** S
**Files:** `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Transfers.py`

## Description

All route methods reflect `transfer_id` directly in HTTPException detail messages.
Since transfer_id comes from user input (URL path parameter), this is an injection
vulnerability. An attacker could craft a transfer_id containing HTML/JS that gets
reflected in error responses.

## Affected Locations

- upload__transfer_id: `f'Transfer {transfer_id} not found or not in pending state'`
- complete__transfer_id: `f'Transfer {transfer_id} not found or payload not uploaded'`
- info__transfer_id: `f'Transfer {transfer_id} not found'`
- download__transfer_id: `f'Transfer {transfer_id} not found or not available for download'`

## Fix Options

1. Use generic error messages without reflecting user input
2. Sanitize transfer_id before including in messages (if Transfer_Id type is used, validation happens at input)
3. Use Transfer_Id type which auto-sanitizes input

## Recommended Fix

Use generic messages: `'Transfer not found'` instead of `f'Transfer {transfer_id} not found'`
Combined with Transfer_Id type for input validation.
