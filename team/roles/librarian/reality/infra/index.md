# Infrastructure — Reality Index

**Domain:** infra/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

This domain covers deployment infrastructure: storage backends, Lambda functions, CI/CD pipelines, container deployments, and the 7 deployment targets. It does not cover the application API (see `../api/`) or security properties (see `../security/`).

---

## EXISTS (Code-Verified)

### Storage Backends

| Backend | Mode | Notes |
|---------|------|-------|
| Memory-FS | In-memory | Dev/test; ~100ms startup |
| Disk | File system | Local/container |
| S3 | AWS S3 | Production; auto-bucket creation |

- **Auto-detection** via `SEND__STORAGE_MODE` env var or AWS credential presence
- **`Enum__Storage__Mode`** — MEMORY / DISK / S3 backends. Code-verified: `sgraph_ai_app_send/lambda__user/storage/Enum__Storage__Mode.py` (commit `bbaaddb`)

### AWS Lambda Deployment

- **2 Lambda functions** — User Lambda (public) + Admin Lambda (auth-protected)
- **Lambda URL** — direct HTTPS endpoints, no API Gateway
- **3 stages each** — dev, qa, prod (6 Lambda functions total)
- **CI/CD pipeline** — GitHub Actions:
  - Push to `dev` → tests + deploy to dev
  - Push to `main` → tests + deploy to qa + PyPI publish

### Docker Container Deployment

- **`sgraph_ai_app_send__docker/` package** — code-verified: commits `bbaaddb`, `ea06040`
- `Dockerfile` — Python 3.12-slim, uvicorn port 8080, supports MEMORY/DISK/S3 storage modes
- `Fast_API__SGraph__Send__Container` — extends User FastAPI app with conditional global auth middleware (`x-sgraph-access-token` header, `/auth/set-cookie-form` excluded)
- `create_app()` factory function
- **16 container tests** — 9 in `test_Container__App.py` (health, status, root, static UI, transfers, vault read/write, auth cookie form, disk storage) + 7 in `test_Container__App__Auth.py` (auth enforcement, header token, cookie token, form exclusion). Code-verified: commit `bbaaddb`

### sg-send-ec2 CLI

- `sgraph_ai_app_send__docker/provision_ec2.py` — Typer CLI for EC2/ECR provisioning
- Commands: `create`, `wait`, `health`, `connect`, `exec`, `forward`, `list`, `info`, `delete`
- IAM instance profile, security groups, SSM-based shell, tag-based metadata store
- Code-verified: commit `bbaaddb`

### Docker ECR CI Job

- `.github/workflows/ci-pipeline.yml` gains Docker ECR build+push job
- Auto-create ECR repo, parameterised by ECR repo name
- Code-verified: commits `9e1ea2a`, `3438122`, `945d622`

### Static Website Deployment

| Workflow | What It Does |
|----------|-------------|
| `deploy-website.yml` | Validates HTML, checks internal links, syncs to S3 with TTLs (HTML 300s, CSS/JS 86400s, images 604800s), invalidates CloudFront, runs smoke test |
| `deploy-ui-user.yml` | IFD overlay deployment: deploys v0.3.0 base then v0.3.1 overlay to S3; generates i18n locale pages + build-info at CI time; `rebuild_latest` checkbox |

- **Triggers:** push to `main` on `sgraph_ai__website/**` paths, or manual `workflow_dispatch`
- **Target:** S3 bucket (`WEBSITE_S3_BUCKET` secret) + CloudFront distribution (`WEBSITE_CF_DIST` secret)
- **Region:** eu-west-2

### CI Configuration Notes

- **Admin Lambda deploy skipped on `main` and `prod`** — Admin Lambda is not active on main/prod targets. CI steps for admin lambda deploy are bypassed on both (commits `c792383`, `a06a112`, 01 May 2026). Admin Lambda still deploys to `dev`.

### CI Python Scripts

| Script | What It Does |
|--------|-------------|
| `scripts/deploy_static_site.py` | Validates HTML, syncs to S3 (`websites/{site}/releases/{version}/`), copies to `latest/`, invalidates CloudFront |
| `scripts/generate_i18n_pages.py` | Reads en-GB HTML + locale JSON, produces pre-rendered locale folder trees |
| `scripts/store_ci_artifacts.py` | Stores build artifacts to S3 under `ci/{date}/{version}/` |

### Deployment Targets (7 Total)

| Target | Pattern | Status |
|--------|---------|--------|
| AWS Lambda (User + Admin) | Lambda | EXISTS |
| Docker container (local/EC2) | Container | EXISTS |
| ECR + ECS Fargate | Container | EXISTS (ECR CI job) |
| GCP (container) | Container | INFRASTRUCTURE READY |
| EC2/AMI | Server | EXISTS (sg-send-ec2 CLI) |
| CLI | CLI | EXISTS (sgit-ai PyPI) |
| Memory/Disk (local dev) | CLI | EXISTS |

### Deployment Tests

- **8 deployment tests** — Lambda create/update/invoke per stage
- **15 integration smoke tests** — auth, health, CORS

---

## PROPOSED (Not Yet Implemented)

- Deploy Infrastructure — Ephemeral EC2 Deploy Service (control plane, Router Lambda) (Section 16)
- Docker-based local LLM chat (`sg_send_deploy__local_llm/`) with FastAPI Ollama proxy (Section 16)
- 3 local LLM chat UI Web Components (`chat-panel`, `session-list`, `model-picker`) (Section 16)
- Type_Safe remediation of sg_send_deploy (17 modules, 5-phase plan) (Section 16)
- Serverless Playwright Lambda (hot-swap code deployment) (Section 17)
- IFD v2 manifest system (manifest.json + manifest.lock, per-component versioning, SGLoader) (Section 17)
- Ephemeral vault infrastructure and VNC streaming desktop (Section 31)
- Ephemeral observability stack (Elastic + Kibana) (Section 31)
- CloudFront/S3/CloudWatch/X-Ray logging strategy (Phase 1) (Section 16)
- GuardDuty, WAF, Security Hub evaluation (Section 16)
- Website repo extraction to separate `SGraph-AI__Website` repo (dev pack created 04/24, blocked on human creating GitHub repo) (Section 9 note)
- cdn.sgraph.ai shared CDN for stable JS/CSS/font artifacts (v0.7.6)
- Three AMIs for AWS Marketplace (Section 30)
- 5-layer CI pipeline unification with caching (Section 17)

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
