# Technical Bootstrap Guide: SG_Send__Deploy

**version** v0.5.33
**date** 23 Feb 2026

---

## Prerequisites

- Python 3.12
- `uv` or `pip` for package management
- AWS credentials configured (for `osbot-aws`)
- Git + GitHub access
- Access to `SGraph-AI/App__Send` repo (for reference)

---

## Phase 0: Repo Structure

### Directory Layout

```
SG_Send__Deploy/
├── .claude/
│   ├── CLAUDE.md                    # Project-wide guidance (adapted from App__Send)
│   ├── explorer/
│   │   └── CLAUDE.md                # Explorer team session rules
│   ├── settings.json                # Hook configuration
│   └── hooks/
│       └── session-start.sh         # Bootstrap script (venv, deps, PYTHONPATH)
│
├── .github/
│   └── workflows/
│       └── ci.yml                   # Test pipeline
│
├── sg_send_deploy/                  # Application code
│   ├── __init__.py
│   ├── version                      # Version file (start at "0.1.0")
│   │
│   ├── ec2/                         # EC2 management
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── Routes__EC2_Instances.py    # Instance lifecycle CRUD
│   │   │   ├── Routes__EC2_SSH.py          # SSH exec operations
│   │   │   ├── Routes__EC2_AMIs.py         # AMI management
│   │   │   └── Routes__EC2_KeyPairs.py     # Key pair management
│   │   ├── actions/
│   │   │   ├── __init__.py
│   │   │   ├── Service__EC2_Instances.py   # Business logic for instances
│   │   │   ├── Service__EC2_SSH.py         # SSH via paramiko
│   │   │   └── Service__EC2_Budget.py      # Budget enforcement
│   │   └── schemas/
│   │       ├── __init__.py
│   │       ├── EC2_Instance_Info.py        # Type_Safe instance model
│   │       ├── EC2_Budget_Config.py        # Budget limits model
│   │       └── EC2_Audit_Entry.py          # Audit log entry model
│   │
│   ├── fleet/                       # Fleet / data room management
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   └── Routes__Fleet_Rooms.py      # Data room CRUD + start/stop
│   │   ├── actions/
│   │   │   ├── __init__.py
│   │   │   ├── Service__Fleet_Rooms.py     # Data room orchestration
│   │   │   ├── Service__Config_Push.py     # Push config to instances
│   │   │   └── Service__Boot_Sequence.py   # State machine for boot
│   │   └── schemas/
│   │       ├── __init__.py
│   │       ├── Data_Room_Info.py           # Type_Safe room model
│   │       └── Boot_State.py              # State machine states
│   │
│   ├── lambda__deploy/              # The management Lambda
│   │   ├── __init__.py
│   │   ├── Deploy__Fast_API.py      # FastAPI app (extends Serverless__Fast_API)
│   │   └── handler.py               # Lambda handler (Mangum)
│   │
│   ├── ami/                         # AMI builder scripts
│   │   ├── __init__.py
│   │   ├── build_ami.py             # Script to create base AMI
│   │   └── user_data.sh             # EC2 user-data script for boot config
│   │
│   └── utils/                       # Shared utilities
│       ├── __init__.py
│       ├── Audit_Trail.py           # Hash-chained audit log
│       └── Auth__Admin.py           # Admin authentication dependency
│
├── tests/
│   ├── unit/                        # Fast, in-memory tests
│   │   ├── ec2/
│   │   │   ├── test__Service__EC2_Budget.py
│   │   │   └── test__Routes__EC2_Instances.py
│   │   ├── fleet/
│   │   │   └── test__Service__Boot_Sequence.py
│   │   └── utils/
│   │       └── test__Audit_Trail.py
│   │
│   └── integration/                 # Tests that hit real AWS
│       ├── test__EC2_Create_Terminate.py
│       ├── test__AMI_Boot.py
│       └── test__Config_Push.py
│
├── requirements.txt                 # Production dependencies
├── requirements-test.txt            # Test dependencies
├── pyproject.toml                   # Project metadata
└── README.md                        # Project overview
```

### Dependencies (`requirements.txt`)

```
osbot-utils
osbot-aws
osbot-fast-api
osbot-fast-api-serverless
paramiko
```

### Test Dependencies (`requirements-test.txt`)

```
-r requirements.txt
pytest
pytest-asyncio
httpx
```

---

## Phase 1: EC2 Management Routes

### Step 1.1: Verify osbot-aws EC2 Wrappers

Before writing any routes, confirm what `osbot-aws` provides:

```python
from osbot_aws.aws.ec2.EC2          import EC2
from osbot_aws.aws.ec2.EC2_Instance import EC2_Instance

# Check available methods
ec2 = EC2()
print(dir(ec2))

# Test basic operations
instance = ec2.create_instance(instance_type='t3.micro', image_id='ami-xxxxx')
```

**If methods are missing**, file an issue and write thin wrappers in the service layer.

### Step 1.2: Implement Service__EC2_Instances

```python
from osbot_utils.base_classes.Type_Safe import Type_Safe

class Service__EC2_Instances(Type_Safe):
    max_instances  : int   = 5
    daily_budget   : float = 10.0

    def create(self, instance_type: str = "t3.micro", data_room_id: str = None) -> dict:
        # Budget check
        running = self.list_running()
        if len(running) >= self.max_instances:
            raise Exception(f"Instance limit reached ({self.max_instances})")

        # Create via osbot-aws
        # ...

        # Audit log
        # ...

        return {"instance_id": "...", "status": "running", "public_ip": "..."}

    def list_running(self) -> list:
        ...

    def terminate(self, instance_id: str) -> dict:
        ...
```

### Step 1.3: Implement FastAPI Routes

```python
from fastapi import APIRouter

router = APIRouter(prefix="/api/ec2", tags=["ec2"])

@router.post("/instances")
async def create_instance(instance_type: str = "t3.micro", data_room_id: str = None):
    service = Service__EC2_Instances()
    return service.create(instance_type=instance_type, data_room_id=data_room_id)

@router.get("/instances")
async def list_instances():
    service = Service__EC2_Instances()
    return service.list_running()

@router.delete("/instances/{instance_id}")
async def terminate_instance(instance_id: str):
    service = Service__EC2_Instances()
    return service.terminate(instance_id=instance_id)
```

### Step 1.4: Test

```bash
# Start the FastAPI server locally
python -m uvicorn sg_send_deploy.lambda__deploy.Deploy__Fast_API:app --port 8080

# Test via curl
curl -X POST http://localhost:8080/api/ec2/instances?instance_type=t3.micro
curl http://localhost:8080/api/ec2/instances
```

---

## Phase 2: AMI + SG/Send Server

### Step 2.1: Identify Base AMI

```python
from osbot_aws.aws.ec2.EC2_AMI import EC2_AMI

ami = EC2_AMI()
# Find Amazon Linux 2023 arm64
results = ami.find(name="al2023-ami-*", architecture="arm64")
```

### Step 2.2: Create AMI Build Script

The AMI needs:
1. Python 3.12
2. SG/Send application code
3. All dependencies pre-installed
4. systemd service to start FastAPI on boot
5. Self-signed TLS certificate

```bash
#!/bin/bash
# ami/user_data.sh — runs on first boot of base instance

# Install Python 3.12
dnf install -y python3.12 python3.12-pip

# Create app directory
mkdir -p /opt/sgraph-send
cd /opt/sgraph-send

# Clone/copy application code
# (from S3 artifact or git)

# Install dependencies
python3.12 -m pip install -r requirements.txt

# Create systemd service
cat > /etc/systemd/system/sgraph-send.service << 'EOF'
[Unit]
Description=SGraph Send FastAPI Server
After=network.target

[Service]
Type=simple
User=sgraph
WorkingDirectory=/opt/sgraph-send
ExecStart=/usr/bin/python3.12 -m uvicorn sgraph_ai_app_send.lambda__user.Fast_API__User:app --host 0.0.0.0 --port 443 --ssl-keyfile /etc/ssl/sgraph/key.pem --ssl-certfile /etc/ssl/sgraph/cert.pem
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable sgraph-send
```

### Step 2.3: Build the AMI

1. Launch a base instance with the user-data script
2. Wait for setup to complete
3. Create AMI from the running instance
4. Terminate the build instance

```python
# Programmatic AMI creation
service = Service__EC2_Instances()
build_instance = service.create(instance_type="t3.micro", user_data=user_data_script)
# Wait for setup...
ami_id = service.create_ami(instance_id=build_instance["instance_id"], name="sgraph-send-v0.5.33")
service.terminate(build_instance["instance_id"])
```

---

## Phase 3: Config Push

### Step 3.1: Implement SSH Operations

```python
import paramiko
import io

class Service__EC2_SSH(Type_Safe):

    def exec_command(self, host: str, key_pem: str, command: str) -> dict:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        key = paramiko.RSAKey.from_private_key(io.StringIO(key_pem))
        client.connect(hostname=host, username="ec2-user", pkey=key)
        stdin, stdout, stderr = client.exec_command(command)
        result = {
            "stdout"   : stdout.read().decode(),
            "stderr"   : stderr.read().decode(),
            "exit_code": stdout.channel.recv_exit_status()
        }
        client.close()
        return result

    def push_file(self, host: str, key_pem: str, local_path: str, remote_path: str):
        # SCP via paramiko SFTP
        ...
```

### Step 3.2: Implement Config Push

Config push sends branding, directory, and documents to a running instance via its admin API or SSH:

```python
class Service__Config_Push(Type_Safe):

    def push_config(self, instance_ip: str, data_room_config: dict):
        # Push branding (logo, theme, colours)
        # Push directory (personas, public keys)
        # Push encrypted documents (from S3)
        ...
```

---

## Phase 4: DNS + Live Data Room

### Step 4.1: Create Route53 Subdomain

```python
from osbot_aws.aws.route53.Route53 import Route53

route53 = Route53()
# Create A record: investor-x.send.sgraph.ai → EC2 elastic IP
route53.create_record(
    hosted_zone_id="...",
    name="investor-x.send.sgraph.ai",
    type="A",
    value=instance_public_ip,
    ttl=60
)
```

### Step 4.2: Pre-load Investor Documents

1. Upload investor's documents to S3 (encrypted via SG/Send)
2. Push encrypted blobs to EC2 instance on boot
3. Configure directory with investor's persona

---

## Phase 5: Demo Polish

- Full end-to-end walkthrough
- Fix any TLS/DNS issues
- Ensure PKI works on the EC2 instance
- Prepare talking points for the human

---

## Verification Checklist

After Phase 0:
- [ ] Repo created with directory structure
- [ ] Dependencies install cleanly
- [ ] `.claude/CLAUDE.md` exists and is complete
- [ ] `osbot-aws` EC2 classes are accessible

After Phase 1:
- [ ] `POST /api/ec2/instances` creates a real EC2 instance
- [ ] `GET /api/ec2/instances` lists running instances
- [ ] `DELETE /api/ec2/instances/{id}` terminates an instance
- [ ] Budget controls prevent exceeding limits

After Phase 2:
- [ ] AMI exists with SG/Send pre-installed
- [ ] Booting the AMI results in a working FastAPI server on port 443
- [ ] Health check at `https://{ip}/info/health` returns 200

After Phase 3:
- [ ] Can push config (branding, directory) to running instance
- [ ] Instance serves branded data room after config push

After Phase 4:
- [ ] `investor-x.send.sgraph.ai` resolves to the running instance
- [ ] Full demo flow works end-to-end

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
