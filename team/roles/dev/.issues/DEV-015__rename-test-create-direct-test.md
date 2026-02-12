# DEV-015 | Rename test file, create direct Routes test

**Status:** open
**Type:** task
**Priority:** medium
**Parent:** DEV-000
**Severity:** medium
**Effort:** M
**Files:** `tests/unit/lambda__user/fast_api/routes/test_Routes__Transfers.py`

## Description

Per Dinis:
1. Rename `test_Routes__Transfers.py` to `test_Routes__Transfers__client.py`
   (it tests via FastAPI test client)
2. Create new `test_Routes__Transfers.py` that tests Routes__Transfers methods
   directly (no HTTP client)
3. Create test helper class that sets up transfers in various states for reuse

## Current

- `test_Routes__Transfers.py` - tests via HTTP client

## Target

- `test_Routes__Transfers__client.py` - HTTP client tests (renamed)
- `test_Routes__Transfers.py` - direct method tests (new)
- Test helper: reusable setup for transfers in pending/uploaded/completed states
