# EC2 + ECR Deployment Guide — Patterns From the Playwright Service

**Date:** 2026-04-20
**Repo:** `the-cyber-boardroom/SGraph-AI__Service__Playwright`
**Branch:** `claude/start-explorer-session-OgbPq`

This document captures every pattern used to build the `sg-ec2` CLI and the EC2/ECR
deployment stack for the Playwright service. It is written for an agent implementing
a parallel deployment for the SG/Send container.

---

## Read-Only Clone

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__Service__Playwright.git /tmp/playwright-ref
cd /tmp/playwright-ref
git checkout claude/start-explorer-session-OgbPq
```

All paths below are relative to that root.

---

## 1. The Single File That Contains Everything

`scripts/provision_ec2.py`

This is a self-contained Typer CLI. It handles:
- Preflight (AWS credentials, ECR registry host, API key generation)
- IAM instance profile + ECR policy setup
- Security group creation
- AL2023 AMI lookup
- EC2 instance launch with user_data
- Tag-based metadata storage
- SSM-based shell, exec, logs, port-forward
- Wait/health polling

The CLI is registered as a console script in `pyproject.toml`:

```toml
[tool.poetry.scripts]
sg-ec2 = "scripts.provision_ec2:app"
```

After `pip install -e .` the user runs `sg-ec2 <command>`.

---

## 2. Constants — Names and Ports (lines 49–85)

```python
# scripts/provision_ec2.py  lines 49–85

EC2__INSTANCE_TYPE           = 't3.large'           # x86_64, 2 vCPU / 8 GB
EC2__PLAYWRIGHT_PORT         = 8000                 # public-facing API port
EC2__SIDECAR_ADMIN_PORT      = 8001

IAM__ROLE_NAME               = 'playwright-ec2'     # Never use 'sg-*' prefix — AWS reserves it
IAM__ECR_READONLY_POLICY_ARN = 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly'
IAM__SSM_CORE_POLICY_ARN     = 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
IAM__POLICY_ARNS             = (IAM__ECR_READONLY_POLICY_ARN, IAM__SSM_CORE_POLICY_ARN)

SG__NAME                     = 'playwright-ec2'

# EC2 tags — the metadata store
TAG__SERVICE_KEY   = 'sg:service'       # immutable filter key — never rename in console
TAG__SERVICE_VALUE = 'playwright-ec2'
TAG__DEPLOY_NAME_KEY  = 'sg:deploy-name'
TAG__CREATOR_KEY      = 'sg:creator'
TAG__API_KEY_NAME_KEY = 'sg:api-key-name'
TAG__API_KEY_VALUE_KEY = 'sg:api-key-value'
```

**For sg-send, change:**
- `EC2__INSTANCE_TYPE` → `'t3.large'` (keep x86_64 — Lambda is x86_64, match it)
- `EC2__PLAYWRIGHT_PORT` → `8080` (sg-send uvicorn port)
- `IAM__ROLE_NAME` / `SG__NAME` / `TAG__SERVICE_VALUE` → `'sg-send-ec2'`
- Drop `EC2__SIDECAR_ADMIN_PORT` (single container, no sidecar)

---

## 3. ECR Registry Helpers (lines 188–197)

```python
# scripts/provision_ec2.py  lines 188–197

def ecr_registry_host() -> str:
    return f'{aws_account_id()}.dkr.ecr.{aws_region()}.amazonaws.com'

def default_playwright_image_uri() -> str:
    return f'{ecr_registry_host()}/sgraph_ai_service_playwright:latest'
```

The ECR registry is always `{account}.dkr.ecr.{region}.amazonaws.com`. The image name
matches the ECR repository name. For sg-send:

```python
def default_sg_send_image_uri() -> str:
    return f'{ecr_registry_host()}/sg-send:latest'
```

---

## 4. User-Data Bootstrap Script (lines 142–175)

This is the most critical piece. It runs as root on the EC2 instance at first boot.

```bash
# scripts/provision_ec2.py  USER_DATA_TEMPLATE  lines 142–175

#!/bin/bash
set -euxo pipefail
exec > >(tee /var/log/sg-playwright-setup.log | logger -t sg-playwright) 2>&1

# docker-compose-plugin is NOT in AL2023 standard repos.
# 'dnf install -y docker docker-compose-plugin' fails and set -e aborts
# the whole script — docker itself never installs. Fix: split the steps.
dnf install -y docker
systemctl enable --now docker

# ssm-user needs docker group membership for 'docker' to work in SSM sessions
usermod -aG docker ssm-user 2>/dev/null || true

# Compose v2 as a Docker CLI plugin (no third-party repo needed)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -sSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ECR login — disable set -x so the token value is NEVER written to logs
# (set -euxo pipefail would otherwise print the expanded token on stderr)
set +x
aws ecr get-login-password --region {region} \
    | docker login --username AWS --password-stdin {registry}
set -x

docker pull {playwright_image_uri}
# (pull sidecar too when running two containers)

# Revoke stored Docker credential immediately after pull.
# The IAM instance profile (AmazonEC2ContainerRegistryReadOnly) provides
# fresh tokens on demand — nothing needs to persist on disk.
# This also keeps AMI snapshots credential-free.
docker logout {registry}
rm -f /root/.docker/config.json

mkdir -p /opt/sg-playwright
cat > /opt/sg-playwright/docker-compose.yml << 'SG_COMPOSE_EOF'
{compose_content}
SG_COMPOSE_EOF

docker compose -f /opt/sg-playwright/docker-compose.yml up -d

echo "=== setup complete at $(date) ==="
```

**Key lessons:**
1. `docker-compose-plugin` is absent from AL2023 standard repos. Installing it via `dnf` in
   the same line as `docker` causes `dnf` to fail and roll back the whole transaction.
   Install `docker` alone, then download the compose binary separately.
2. Add `ssm-user` to the docker group so `docker` works without `sudo` in SSM sessions.
3. Log everything to `/var/log/sg-playwright-setup.log` — check it later with
   `sg-ec2 exec <name> --cmd "cat /var/log/sg-playwright-setup.log"`.
4. **Never let the ECR token persist.** `set -euxo` logs every command with expanded
   variables — `set +x` before the login block prevents the token appearing in logs.
   `docker logout` + `rm -f ~/.docker/config.json` after pulls ensures the token is not
   on disk (in running instances or AMI snapshots). The instance profile re-authenticates
   on demand whenever a fresh pull is needed.

For a **single-container sg-send** deployment, the compose file can be replaced with a
plain `docker run`:

```bash
docker run -d \
  --name sg-send \
  --restart always \
  -p 8080:8080 \
  -e SGRAPH_SEND__ACCESS_TOKEN="${access_token}" \
  {image_uri}
```

---

## 5. IAM Instance Profile (lines 323–341)

```python
# scripts/provision_ec2.py  lines 323–341
# ensure_instance_profile()
```

The instance profile attaches two AWS managed policies:
- `AmazonEC2ContainerRegistryReadOnly` — allows `docker pull` from ECR
- `AmazonSSMManagedInstanceCore` — allows SSM Session Manager (no SSH needed)

The function is idempotent: it checks for an existing role/profile before creating.
There is a propagation delay after creation — the `run_instance` function retries
up to 5 times with back-off when it sees `Invalid IAM Instance Profile` (lines 396–407).

---

## 6. Security Group (lines 343–352)

```python
# scripts/provision_ec2.py  lines 343–352
# ensure_security_group()
```

Opens inbound TCP on the service ports (8000 + 8001 for Playwright). For sg-send,
open port 8080 only. No SSH port — SSM handles all remote access.

---

## 7. Tag-Based Metadata Store (lines 392–407)

Tags are the persistence layer. Every instance gets:

| Tag key            | Value example                    | Purpose                              |
|--------------------|----------------------------------|--------------------------------------|
| `Name`             | `playwright-ec2/bold-curie`      | Human label in EC2 console           |
| `sg:service`       | `playwright-ec2`                 | Immutable filter key for `find_instances` |
| `sg:deploy-name`   | `bold-curie`                     | Human handle for CLI commands        |
| `sg:creator`       | `dinis.cruz@owasp.org`           | Who launched it                      |
| `sg:api-key-name`  | `X-API-Key`                      | Auth header name                     |
| `sg:api-key-value` | `h0f61b8x...`                    | Auth token (readable via IAM only)   |

**Use `sg:service` not `Name` for filtering.** Users can rename instances in the EC2
console, breaking `Name`-based filters. `sg:service` is set once at launch and never
changes. See `find_instances()` at line 425:

```python
filters = [
    {'Name': 'tag:sg:service',       'Values': ['playwright-ec2']},
    {'Name': 'instance-state-name',  'Values': ['pending','running','stopping','stopped']},
]
```

---

## 8. Random Deploy Names (lines 76–83)

Docker-style two-word names (`bold-curie`, `happy-darwin`) make instances human-memorable
without collisions.

```python
# scripts/provision_ec2.py  lines 76–83

_ADJECTIVES = ['bold','bright','calm','clever', ...]   # 25 items
_SCIENTISTS = ['bohr','curie','darwin','dirac', ...]   # 25 items

# 625 combinations — sufficient for dev workloads
deploy_name = f'{secrets.choice(_ADJECTIVES)}-{secrets.choice(_SCIENTISTS)}'
```

All CLI commands accept either a deploy-name or instance-id as `target`.

---

## 9. Auto-Select When One Instance Exists (lines 554–575)

```python
# scripts/provision_ec2.py  lines 554–575
# _resolve_target(ec2, target)
```

When `target` is `None` and exactly one instance is running, it auto-selects. This
enables the zero-argument workflow:

```bash
sg-ec2 create
sg-ec2 wait          # auto-selects
sg-ec2 health        # auto-selects
sg-ec2 connect       # auto-selects
sg-ec2 delete        # auto-selects
```

---

## 10. SSM Instead of SSH (lines 595–650, 806–882)

No SSH. All remote access uses AWS SSM Session Manager. The EC2 instance needs no
open port 22 and no key pair.

Three SSM patterns:

**Interactive shell (`sg-ec2 connect`):**
```python
subprocess.run(['aws', 'ssm', 'start-session', '--target', instance_id, ...])
```

**One-shot command (`sg-ec2 exec`)** — uses SSM RunCommand, polls for result:
```python
# scripts/provision_ec2.py  lines 595–650
# _ssm_run(instance_id, commands, timeout)
# DocumentName='AWS-RunShellScript'
```

**Port forward (`sg-ec2 forward`)** — the "killer feature" for accessing the HTTP API
from a laptop without opening any firewall rules:
```python
# scripts/provision_ec2.py  lines 855–882
# DocumentName='AWS-StartPortForwardingSession'
# subprocess.run(['aws', 'ssm', 'start-session', '--document-name',
#                 'AWS-StartPortForwardingSession', '--parameters', ...])
```

Usage: `sg-ec2 forward 8080` → `http://localhost:8080/`

---

## 11. API Key — Random Generation and Tag Storage (lines 200–248)

When `FAST_API__AUTH__API_KEY__VALUE` is not set in the environment, a random key is
generated and stored in the instance tags:

```python
# scripts/provision_ec2.py  lines 200–248  (preflight_check)

import secrets
api_key_value = os.environ.get('FAST_API__AUTH__API_KEY__VALUE') or secrets.token_urlsafe(32)
```

The key is later readable via `sg-ec2 info <name>` or `sg-ec2 list`. Because it is
stored in EC2 tags, only callers with IAM credentials can read it — it is not in any
file on the instance disk.

---

## 12. Wait Command — Accept 401 as Healthy (lines 882–920)

The `/health/status` endpoint returns 401 when the API key header is missing. `sg-ec2 wait`
treats both 200 and 401 as "service is up":

```python
if r.status_code in (200, 401):    # 401 = service responded, auth is working
    typer.echo(f'  ✅  service up  (HTTP {r.status_code})')
```

The wait command also reads the stored api key from instance tags automatically, so a
plain `sg-ec2 wait` (no flags) uses the right credentials.

---

## 13. Static Launcher UI (sgraph_ai_service_playwright__api_site/)

A local HTML/JS page for configuring the connection (IP, port, API key) and checking
health. It is **not** inside the container — it runs from the developer's laptop as a
`file://` URL.

`sg-ec2 open <name>` writes a bootstrap HTML snippet to a temp file that pre-populates
`localStorage` with the instance connection details, then redirects to the actual
`index.html` via `file://` URL. No web server needed.

Files:
- `sgraph_ai_service_playwright__api_site/index.html`
- `sgraph_ai_service_playwright__api_site/style.css`
- `sgraph_ai_service_playwright__api_site/storage.js`
- `sgraph_ai_service_playwright__api_site/health.js`
- `sgraph_ai_service_playwright__api_site/cookie.js`
- `sgraph_ai_service_playwright__api_site/app.js`

---

## 14. Tests (tests/unit/scripts/test_provision_ec2.py)

26 unit tests, no real AWS calls. Key patterns:
- `_stub_aws()` helper replaces `aws_account_id`, `aws_region`, `ecr_registry_host` with
  lambdas returning fixed strings.
- Tests render `render_compose_yaml` and `render_user_data` and assert on string content.
- `test_cli_surface` invokes the Typer app with `--help` to verify all commands exist.

Run with: `python -m pytest tests/unit/scripts/test_provision_ec2.py`

---

## 15. Minimal sg-send Adaptation Checklist

| Item | Playwright value | sg-send value |
|------|-----------------|---------------|
| `EC2__INSTANCE_TYPE` | `t3.large` | `t3.large` (keep x86_64) |
| Service port | `8000` | `8080` |
| IAM role name | `playwright-ec2` | `sg-send-ec2` |
| SG name | `playwright-ec2` | `sg-send-ec2` |
| `TAG__SERVICE_VALUE` | `playwright-ec2` | `sg-send-ec2` |
| ECR repo | `sgraph_ai_service_playwright` | `sg-send` |
| Sidecar | yes (agent_mitmproxy) | no |
| Compose vs docker run | compose (2 containers) | plain `docker run` |
| Auth env var | `FAST_API__AUTH__API_KEY__VALUE` | `SGRAPH_SEND__ACCESS_TOKEN` |
| CLI entry point | `sg-ec2` | `sg-send-ec2` (or reuse `sg-ec2`) |
| Log file | `/var/log/sg-playwright-setup.log` | `/var/log/sg-send-setup.log` |
| Compose file path | `/opt/sg-playwright/docker-compose.yml` | `/opt/sg-send/` |

The entire sg-send EC2 provisioner can be built by forking `scripts/provision_ec2.py`
and applying the table above. The SSM, tag, deploy-name, auto-select, and wait/health
patterns are all reusable without modification.

---

## 16. GitHub Actions — ECR Push Pattern

The Playwright service CI **already pushes to ECR** via Job 3 ("Build + Push Docker Image
to ECR") in `.github/workflows/ci-pipeline.yml`. It is triggered by `workflow_dispatch`
(manual) on `dev` or automatically on push to `dev`. The push is pytest-driven via
`tests/docker/test_ECR__Docker__SGraph-AI__Service__Playwright.py`.

For sg-send, which does not have the same pytest-driven deploy infrastructure yet, the
equivalent standard GitHub Actions pattern is:

```yaml
# .github/workflows/docker-build.yml  (to be created)
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            eu-west-2

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ steps.login-ecr.outputs.registry }}/sg-send:latest
            ${{ steps.login-ecr.outputs.registry }}/sg-send:${{ github.ref_name }}
```

Required IAM permissions (add to the existing CI IAM user):
```
ecr:GetAuthorizationToken
ecr:BatchCheckLayerAvailability
ecr:InitiateLayerUpload
ecr:UploadLayerPart
ecr:CompleteLayerUpload
ecr:PutImage
ecr:BatchGetImage
ecr:CreateRepository
ecr:DescribeRepositories
```

The ECR repository itself (`sg-send`) should be created once via the AWS console or
a one-off script before the first CI push.
