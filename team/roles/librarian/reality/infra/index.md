# Infrastructure — Reality Index

**Domain:** infra/ | **Last updated:** 2026-06-01 | **Maintained by:** Librarian (daily run)

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

- **`sgraph_ai_app_send__docker/` package** — code-verified: commits `bbaaddb`, `ea06040`, `cecfed4`
- `Dockerfile` — Python 3.12-slim + bash; runs `scripts/build-vault-static.sh /app/static_vault` at build time; uvicorn port 8080; supports MEMORY/DISK/S3 storage modes
- **Default UI — vault app.** Container serves the vault UI (`sgraph_ai_app_send__ui__vault`) at the root, not the send UI. The send UI is not mounted in the container.
- **Build pipeline** — `scripts/build-vault-static.sh` flattens the IFD vault v0.2.3 tree, merges user-UI `_common/` layers (send-browse, sg-site-header, etc.), patches CDN URLs to local `/_common/`, and writes to `OUT_DIR` (default `.local-server-vault`). Called by Dockerfile (`/app/static_vault`) and by `scripts/vault__run-locally.sh`.
- **Static URL structure** — `GET /` → vault index.html; `GET /en-gb/` → vault landing page; `GET /en-gb/vault/` → vault shell (clean URL); `GET /_common/*` → shared assets; `GET /en-gb/browse/` → browse page
- **Explicit sub-path mounts** — static files mounted at `/_common`, `/en-gb`, `/i18n` (not a catch-all `/`). API routes (`/api/*`, `/info/*`, `/auth/*`) take precedence.
- `Fast_API__SGraph__Send__Container` — extends User FastAPI app with conditional global auth middleware (`x-sgraph-access-token` header/cookie, `/auth/set-cookie-form` excluded)
- `create_app()` factory function
- **`SEND__VAULT_STATIC_DIR`** env var — overrides static dir path (default `/app/static_vault`). Used to point tests at a tmpdir.
- **Native TLS** — `Fast_API__TLS__Launcher` (`sgraph_ai_app_send__docker/Fast_API__TLS__Launcher.py`) reads the `FAST_API__TLS__*` env contract (`ENABLED` / `CERT_FILE` / `KEY_FILE` / `PORT`). TLS off (default) → plain HTTP on `:8080`. TLS on → binds `:443` with the mounted cert/key. TLS on but files missing → fails loud (non-zero exit), never silent HTTP fallback. Container entrypoint is `sgraph_ai_app_send__docker/serve.py` (`python -m sgraph_ai_app_send__docker.serve`), replacing the previous direct `uvicorn` CMD. No cert generation in-container — a sidecar owns acquisition. Vendored from the `SGraph-AI__Service__Playwright` reference launcher; destined for `OSBot__Fast_API`.
- **31 container tests** — 13 in `test_Container__App.py` + 7 in `test_Container__App__Auth.py` + 9 in `test_Fast_API__TLS__Launcher.py` (env→config, truthy/falsy switch, custom paths/port, uvicorn kwargs for on/off, fail-loud on missing cert/key). Code-verified: this commit.

### Docker Hub Publish CI Job

- `.github/workflows/ci-pipeline.yml` — `publish-to-dockerhub` + `publish-to-dockerhub-manifest` jobs
- Multi-arch build (`linux/amd64`, `linux/arm64`) via matrix strategy: each leg builds ONE platform, pushes by digest (no tag), uploads digest as artifact. `publish-to-dockerhub-manifest` (depends on both legs) downloads both digests and assembles a multi-arch manifest via `docker buildx imagetools create`. Both legs run in parallel (commit `c21cb5c`, 15 May 2026).
- Triggered by `should_publish_dockerhub: true` input on the calling workflow:
  - `ci-pipeline__dev.yml` — pushes `diniscruz/sg-send-vault:{version}` only
  - `ci-pipeline__main.yml` — pushes `diniscruz/sg-send-vault:{version}` + `:latest`
- Smoke test: `/info/health` + `/` both return 200 against the just-pushed image
- Secrets required: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

### EC2 / ECR removed

The `sg-send-ec2` CLI (`provision_ec2.py`) and the ECR CI push job were removed in v0.27.45 (this commit). EC2 integration is now handled by the separate **SG/Compute** project. Container deployments pull from Docker Hub.

### Static Website Deployment

| Workflow | What It Does |
|----------|-------------|
| `deploy-website.yml` | Validates HTML, checks internal links, syncs to S3 with TTLs (HTML 300s, CSS/JS 86400s, images 604800s), invalidates CloudFront, runs smoke test |
| `deploy-ui-user.yml` | IFD overlay deployment: deploys v0.3.0 base then v0.3.1 overlay to S3; generates i18n locale pages + build-info at CI time; `rebuild_latest` checkbox |

- **Triggers:** push to `main` on `sgraph_ai__website/**` paths, or manual `workflow_dispatch`
- **Target:** S3 bucket (`WEBSITE_S3_BUCKET` secret) + CloudFront distribution (`WEBSITE_CF_DIST` secret)
- **Region:** eu-west-2

### SnapStart S3 Client Fix (08 May 2026)

**`Storage_FS__S3`** — boto3 client now created lazily to prevent SnapStart stale-connection timeouts.
Code: `sgraph_ai_app_send/lambda__user/storage/Storage_FS__S3.py` (commit `b61a181`).

| Before | After |
|--------|-------|
| `setup()` called `bucket_exists()` at Lambda init, creating and caching a boto3 S3 client | `setup()` returns `self` immediately — no boto3 client at snapshot time |
| boto3 client serialised into SnapStart snapshot including urllib3 connection pool | `_s3()` method creates `S3()` lazily on first actual request after restore |
| After SnapStart restore, pooled TCP connections dead → requests hang until Lambda timeout | Fresh boto3 client created on demand; stale-connection timeout eliminated |
| Presigned services also affected | Presigned services receive fresh `S3()` instances (lazily initialised via `@cache_on_self`) |

`_ensure_bucket()` extracted from `setup()` for explicit use in dev/deploy contexts.

### CI Configuration Notes

- **Admin Lambda deploy skipped on `main` and `prod`** — Admin Lambda is not active on main/prod targets. CI steps for admin lambda deploy are bypassed on both (commits `c792383`, `a06a112`, 01 May 2026). Admin Lambda still deploys to `dev`.

### Vault UI Test Pipeline — Reusable Workflow (added 01 June 2026)

**`.github/workflows/_test-ui-vault.yml`** (commit `101d5a35`): Reusable workflow defining the vault UI test pipeline in one place so it cannot drift across callers.

| Job | Runner | Timeout | Command | Notes |
|-----|--------|---------|---------|-------|
| `unit` | ubuntu-latest | 5 min | `npm run test:vault-unit` | Pure JS + jsdom, ~5s |
| `integration` | ubuntu-latest | 5 min | `npm run test:vault-integration` | Node + jsdom + in-memory SGVault stub, ~10s |
| `e2e` | ubuntu-latest | 2 min | `npm run test:vault-e2e` | Playwright Chromium, ~60s |
| `browser-integration` | ubuntu-latest | 5 min | `poetry run pytest tests/integration/vault_ui/browser/` | Python + Playwright + sgit-ai, ~15s |

`package.json` new script: `"test:vault-browser-integration": ".venv/bin/python3 -m pytest tests/integration/vault_ui/browser/ -v"`

**Note:** This workflow is defined as a reusable caller (`on: workflow_call`). Verify that `deploy-ui-vault.yml` invokes it as a pre-deploy gate (OQ-browser-int-tests-ci-1).

### CI Python Scripts

| Script | What It Does |
|--------|-------------|
| `scripts/deploy_static_site.py` | Validates HTML, syncs to S3 (`websites/{site}/releases/{version}/`), copies to `latest/`, invalidates CloudFront |
| `scripts/generate_i18n_pages.py` | Reads en-GB HTML + locale JSON, produces pre-rendered locale folder trees |
| `scripts/store_ci_artifacts.py` | Stores build artifacts to S3 under `ci/{date}/{version}/` |

### Deployment Targets

| Target | Pattern | Status |
|--------|---------|--------|
| AWS Lambda (User + Admin) | Lambda | EXISTS |
| Docker container (Docker Hub) | Container | EXISTS — `diniscruz/sg-send-vault` (multi-arch) |
| Docker container (local build) | Container | EXISTS |
| GCP (container) | Container | PROPOSED — image is portable, no GCP wiring in this repo |
| ECS / Fargate | Container | PROPOSED — image is published, no task definition in this repo |
| EC2 provisioning | Server | MOVED to SG/Compute project |
| CLI | CLI | EXISTS (sgit-ai PyPI) |
| Memory/Disk (local dev) | Container | EXISTS |

### Deployment Tests

- **8 deployment tests** — Lambda create/update/invoke per stage
- **15 integration smoke tests** — auth, health, CORS

---

### CloudFront Immutable Object Bypass (DEPLOYED 2026-06-03)

- **Guide:** `library/guides/infrastructure/v0.29.1__guide__cloudfront-immutable-object-bypass.md`
- **Proposal:** `team/roles/architect/reviews/06/03/v0.29.1__proposal__cloudfront-immutable-object-bypass.md`
- **CF Function source:** `sgraph_ai_app_send/cloudfront/imm-object-rewrite.js`
- **What:** Requests for immutable vault objects (`obj-cas-imm-*`) bypass Lambda and go directly from CloudFront to S3, with 1-year edge caching
- **Three changes:** CF Function (URI rewrite + validation), S3 transfers bucket origin (OAC), new behavior at Prec 0 matching `/api/vault/read/*/bare/data/obj-cas-imm-*`
- **Security:** Three independent gates (behavior pattern, CF Function regex, S3 bucket policy) + content is encrypted ciphertext
- **Performance:** First request ~50ms (S3 direct), repeat ~1ms (CF edge cache), browser cache ~0ms

### Lambda Dependency Update Workflow

- **Guide:** `library/guides/development/dependencies/v0.29.1__guide__updating-dependencies-lambda-and-docker.md`
- **Architecture brief:** `team/comms/briefs/05/20/v0.27.38__architect-to-dev__lambda-dependency-packaging.md`
- **Two-track model:** Docker uses wildcard deps in `pyproject.toml` (auto-latest on build). Lambda uses hardcoded `==` pins in `user__config.py` / `admin__config.py` with content-addressable S3 cache (`sha256(sorted(pins))[:12]`). Pin bump = cache bust = fresh pip resolution.
- **Verification endpoint:** `GET /api/info/versions` returns installed versions of all tracked dependencies at runtime

### Multi-Target Deployment — Phase A/B/C1 code (added 2026-08-11, BETA until live-account validation)

Implements P-399/P-400/P-401/P-407/P-409 (spec: `architect/reviews/08/11/v0.33.54__architect-spec__multi-target-deployment.md`):

- **Universal container image (Phase A)** — Lambda Web Adapter baked into the Dockerfile
  (`/opt/extensions/lambda-adapter`, inert outside Lambda); `serve.py` honours `$PORT`;
  non-root user (uid 10001, TLS port now 8443); HEALTHCHECK + OCI labels; **friendly SG/Send
  login page** at `/auth/set-cookie-form` (`Routes__Auth__Login.py`, replaces osbot's cookie
  editor; osbot-compatible POST retained). **Validated on a real local build:** health/UI/login,
  `$PORT`, `--network=none`+memory-mode self-contained invariant, single-key gate incl. reads.
- **CloudFormation templates (Phase B)** — `deploy/aws/{lambda,ec2,ecs-fargate,ami-pipeline}.cfn.yml`
  + README. cfn-lint clean. Access token = startup parameter, never stored (no SSM — ADR-6 as
  amended); `StorageMode` incl. `memory` everywhere; EC2 data volume snapshot-on-delete;
  Fargate stack owns its own VPC (total teardown).
- **Full-cycle pipeline (C1)** — `.github/workflows/deploy-full-cycle.yml`: build → invariant
  check → ECR push → deploy lambda/fargate/ec2 → shared smoke suite
  (`tests/deploy/targets/test_smoke__deployed_target.py`, validated against a live local
  container: 8/8) → destroy all → orphan sweep. **OIDC only** (`AWS_DEPLOY_ROLE_ARN` secret;
  skips deploy jobs gracefully when unset — role bootstrap is the remaining setup step).
- **Heroku button contract** — root `app.json` + `heroku.yml` (container stack).

Still PROPOSED from that plan: Terraform modules (P-405), publish/dogfood pipeline (P-410, C2),
GCP/Heroku CI deploys (P-403), deploy web pages (P-406), AMI bake execution + region mapping
(P-408 — the pipeline template exists, no AMI has been baked).

## PROPOSED (Not Yet Implemented)

- ~~CloudFront behavior bypass for `obj-cas-imm-*` immutable objects~~ — **MOVED TO EXISTS** (deployed 2026-06-03)
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
