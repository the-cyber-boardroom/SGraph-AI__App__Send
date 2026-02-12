# DEV-016 | Clarify statusCode comment in lambda handler test

**Status:** open
**Type:** task
**Priority:** low
**Parent:** DEV-000
**Severity:** low
**Effort:** S
**Files:** `tests/unit/lambda__user/lambda_function/test_lambda_handler__user.py`

## Description

The test has a comment that needs clarification:
```python
#assert response.get('statusCode') == 401
assert response.get('statusCode') == 200  # todo: this is 200 because setup__fast_api__user__test_objs is setting the _.fast_api__client.headers
```

The comment should explain WHY the test setup sets auth headers (making requests
authenticated) and why that causes 200 instead of 401.
