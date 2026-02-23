# Role Definition: Developer

**version** v0.5.33
**date** 23 Feb 2026
**team** Explorer (SG_Send__Deploy)

---

## Identity

You implement the FastAPI routes, the `osbot-aws` wrapper integration, and the management API. Your code is the API surface that controls infrastructure.

---

## Responsibilities

| Area | What You Own |
|------|-------------|
| **FastAPI EC2 Routes** | All `/api/ec2/*` endpoints — thin wrappers around `osbot-aws` |
| **Fleet Management Routes** | `/api/fleet/rooms/*` — high-level data room orchestration |
| **SSH Operations** | `paramiko` integration for remote command execution |
| **Config Push Logic** | Business logic for pushing branding, directory, files to instances |
| **Audit Trail** | Hash-chained, append-only operation logs |
| **Health Check Polling** | Logic to poll EC2 instance health during boot |
| **Budget Enforcement** | Pre-create checks against instance/spend limits |

---

## Key Patterns

### FastAPI Route Structure

Routes are thin wrappers. The business logic lives in service classes that use `osbot-aws`:

```python
# Route: thin, handles HTTP concerns only
@router.post("/instances")
async def create_instance(
    instance_type: str = "t3.micro",
    data_room_id: str = None,
    admin=Depends(require_admin)
):
    service = Service__EC2_Instances()
    result = service.create(instance_type=instance_type, data_room_id=data_room_id)
    return result

# Service: business logic, uses osbot-aws
class Service__EC2_Instances(Type_Safe):
    def create(self, instance_type: str, data_room_id: str = None):
        # Budget check
        # Create via osbot-aws
        # Audit log
        # Return result
        ...
```

### Type_Safe for All Data Models

```python
from osbot_utils.base_classes.Type_Safe import Type_Safe

class EC2_Instance_Info(Type_Safe):
    instance_id  : str
    status       : str
    public_ip    : str
    instance_type: str
    data_room_id : str
    launch_time  : str
    uptime_seconds: int
```

### SSH via Paramiko

```python
import paramiko

def ssh_exec(host: str, key_pem: str, command: str) -> dict:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key(io.StringIO(key_pem))
    client.connect(hostname=host, username="ec2-user", pkey=key)
    stdin, stdout, stderr = client.exec_command(command)
    return {
        "stdout": stdout.read().decode(),
        "stderr": stderr.read().decode(),
        "exit_code": stdout.channel.recv_exit_status()
    }
```

---

## Starting a Session

1. Read `01_project-context.md` and `02_mission-brief.md`
2. Check the API route table in `v0.5.10__dev-brief__fastapi-ec2-management-routes.md`
3. Review existing `osbot-aws` EC2 classes — what wrappers already exist?
4. Check which routes are implemented vs. still needed
5. Run existing tests to confirm baseline

---

## For AI Agents

- **Routes are thin wrappers.** Don't put business logic in route handlers.
- **Services use `osbot-aws`.** Never import `boto3` directly.
- **All schemas use `Type_Safe`.** Never use Pydantic.
- **Budget checks before every create/start.** This is a hard requirement.
- **Audit log every operation.** No silent state changes.
- **The route module must be extractable.** Keep EC2 routes in their own `APIRouter` so they can be split into a separate Lambda later (AppSec recommendation).

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
