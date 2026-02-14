# DEV-008 | Move hash_ip to separate class

**Status:** open
**Type:** task
**Priority:** low
**Parent:** DEV-000
**Severity:** low
**Effort:** S
**Files:** `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py`

## Description

The `hash_ip` method in Transfer__Service should be extracted to a dedicated utility class.
Consider using or extending `Cache__Hash__Generator` from osbot-utils
(`osbot_utils/helpers/cache/Cache__Hash__Generator.py`).

## Current Code

```python
def hash_ip(self, ip_address):
    if ip_address is None:
        ip_address = ''
    return hashlib.sha256(ip_address.encode()).hexdigest()
```

## Target

A separate utility class like `IP__Hasher` or reuse of Cache__Hash__Generator.
