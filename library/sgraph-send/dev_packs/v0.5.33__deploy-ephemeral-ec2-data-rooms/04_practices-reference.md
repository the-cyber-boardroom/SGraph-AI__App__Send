# Practices Reference: Patterns from SG/Send

**version** v0.5.33
**date** 23 Feb 2026

---

## Purpose

The Deploy repo follows the same conventions as `App__Send`. This document summarises the patterns you must follow and links to the source material.

---

## Stack Rules (Non-Negotiable)

| Rule | What It Means |
|------|--------------|
| **`Type_Safe` only** | All data models extend `Type_Safe` from `osbot-utils`. Never use Pydantic. |
| **`osbot-aws` only** | All AWS calls go through `osbot-aws`. Never import `boto3` directly. |
| **`osbot-fast-api` / `osbot-fast-api-serverless`** | FastAPI apps extend `Serverless__Fast_API`. |
| **No mocks, no patches** | Tests use real implementations with in-memory backends. |
| **Memory-FS for storage** | State is stored via `Storage_FS` abstraction. Pluggable: memory, disk, S3. |

---

## FastAPI Server Pattern

```python
from osbot_fast_api_serverless.utils.Serverless__Fast_API import Serverless__Fast_API

class Deploy__Fast_API(Serverless__Fast_API):

    def setup(self):
        super().setup()
        # Wire services
        self.service_ec2 = Service__EC2_Instances()
        # Mount routers
        self.app().include_router(router_ec2)
        self.app().include_router(router_fleet)
```

**Health check** at `/info/health` — included by default from `Serverless__Fast_API`.

---

## Route Pattern

```python
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/api/ec2", tags=["ec2"])

@router.post("/instances")
async def create_instance(
    instance_type: str = "t3.micro",
    data_room_id: str = None,
    admin=Depends(require_admin)
):
    # Thin wrapper — delegates to service
    service = Service__EC2_Instances()
    return service.create(instance_type=instance_type, data_room_id=data_room_id)
```

---

## Service Pattern

```python
from osbot_utils.base_classes.Type_Safe import Type_Safe

class Service__EC2_Instances(Type_Safe):
    max_instances  : int = 5
    daily_budget   : float = 10.0

    def create(self, instance_type: str, data_room_id: str = None) -> dict:
        # 1. Budget check
        # 2. Create via osbot-aws
        # 3. Audit log
        # 4. Return result
        ...
```

---

## Test Pattern

```python
import pytest
from unittest import TestCase

class Test__Service__EC2_Instances(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.service = Service__EC2_Instances()

    def test_create__budget_check(self):
        # Test with real service, in-memory storage
        ...

    def test_create__success(self):
        # Test against real AWS (or LocalStack for integration)
        ...
```

**No mocks.** For EC2 operations that hit real AWS, either:
- Use LocalStack for integration tests
- Mark as `@pytest.mark.integration` and run against real AWS with budget controls

---

## Git Conventions

| Convention | Value |
|-----------|-------|
| Default branch | `dev` |
| Feature branches | Branch from `dev` |
| Branch naming | `claude/{description}-{session-id}` |
| Push command | `git push -u origin {branch-name}` |

---

## File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Review documents | `{version}__{type}__{description}.md` | `v0.5.33__review__ec2-routes-security.md` |
| Debriefs | `{version}__debrief__{topic}.md` | `v0.5.33__debrief__investor-demo-prep.md` |
| Role reviews | `team/roles/{role}/reviews/YY-MM-DD/` | `team/roles/devops/reviews/02/23/` |

---

## Brief Format (for Documentation)

```markdown
# Title

**version** v0.5.33
**date** DD Mon YYYY
**from** Role
**to** Role(s)
**type** Type description
```

---

## osbot-aws EC2 Classes (Reference)

The following classes exist in `osbot-aws` and should be used:

| Class | Package | Purpose |
|-------|---------|---------|
| `EC2` | `osbot_aws.aws.ec2.EC2` | High-level EC2 operations |
| `EC2_Instance` | `osbot_aws.aws.ec2.EC2_Instance` | Single instance management |
| `EC2_AMI` | `osbot_aws.aws.ec2.EC2_AMI` | AMI creation/management |

**Before writing new wrappers**, check what `osbot-aws` already provides. The human has built extensive wrappers. Use them.

---

## Audit Trail Pattern

```python
class Audit_Entry(Type_Safe):
    timestamp  : str
    action     : str
    admin      : str
    details    : dict
    prev_hash  : str
    entry_hash : str
```

Entries are hash-chained: each entry includes the hash of the previous entry. This creates a tamper-evident log. Store in Memory-FS (S3 backend for persistence).

---

## Key References in App__Send

| What | Where (in App__Send repo) |
|------|--------------------------|
| FastAPI server base | `osbot-fast-api-serverless` package |
| Route patterns | `sgraph_ai_app_send/lambda__admin/routes/` |
| Service patterns | `sgraph_ai_app_send/lambda__admin/actions/` |
| Type_Safe models | `sgraph_ai_app_send/lambda__admin/schemas/` |
| Test patterns | `tests/unit/` |
| Memory-FS usage | `sgraph_ai_app_send/lambda__admin/actions/Service__Storage.py` |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
