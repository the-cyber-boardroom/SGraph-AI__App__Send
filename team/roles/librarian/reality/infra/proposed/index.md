# Infrastructure — Proposed Items Index

**Domain:** infra/proposed/ | **Last updated:** 2026-08-11 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

---

## Topic Files (Split Out)

Large proposed sections are in dedicated topic files to keep this index navigable:

| Topic File | Contents |
|-----------|----------|
| [`vault-hosting.md`](vault-hosting.md) | Vault Hosting Architecture, Fargate + Container Hosts, Instance Sizing, Serverless for Agents, Multi-Cloud Deploy, On-Demand Vault Provisioning, DNS Registry for Labs, MyFeeds |
| [`firecracker.md`](firecracker.md) | Firecracker substrate: microVMs, snapshots, Playwright fleet, Podman runtime |
| [`relay-and-storage.md`](relay-and-storage.md) | SG/Relay routing service, S3 Native CLI, IAM graph visualisation, S3-compatible vault container |

---

## Ephemeral Infrastructure

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Ephemeral EC2 Deploy Service | Infrastructure control plane with Router Lambda and SSH provisioning | Section 16 |
| Ephemeral vault infrastructure | Per-session vault infrastructure with automatic teardown | Section 31 |
| VNC streaming desktop | Browser-accessible VNC for desktop app testing and demos | Sections 31, 23 |
| Ephemeral observability (Elastic + Kibana) | Per-session log aggregation and visualisation stack | Section 31 |
| Infra UI: split Creation / Live Instances panels | Two distinct UI sections — provisioning vs. operational controls | 04/29 brief |
| AMI management UI (list, bake, delete, set default) | AMI catalogue per instance type — "simulated AWS Marketplace" | 04/29 brief |
| SG/Send vault server as instance type | Ephemeral storage primitive — completes compute + browser + storage triangle | 04/29 brief |
| Docker container management inside instances | List/start/stop containers, view logs, expose ports from instance FastAPI | 04/29 brief |
| Remote shell via API-based FastAPI endpoint (Option A) | `POST /shell/execute` and `POST /shell/stream` — no SSH or SSM required for MVP | 04/29 brief |
| Prometheus metrics endpoints on instances (`GET /metrics`) | CPU, memory, disk, uptime, containers — standard Prometheus exposition format | 04/29 brief |
| Stacks — multi-instance JSON-defined bundles | One-click launch of bundled environments (e.g. Elastic + Playwright + Vault) | 04/29 brief |
| Firefox browser plugin (`plugins/firefox/`) | Interactive Firefox + MITM proxy — stateful browsing vs. Playwright's programmatic model | 04/29 brief |

*Source for rows 5–12: `briefs/04/29/v0.22.19__dev-brief__ephemeral-infra-next-phase.md` and `briefs/04/29/v0.22.19__dev-brief__firefox-browser-plugin.md` (docs 334–335)*

---

## CI/CD Improvements

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| 5-layer CI pipeline unification | Unified pipeline with caching across Lambda, Docker, QA, Website layers | Section 17 |
| IFD v2 manifest system | `manifest.json` + `manifest.lock`; per-component versioning; SGLoader; localStorage toggle | Sections 16, 17 |
| Vault-driven CI | Agent-managed CI triggered by vault commits (no direct GitHub pushes) | Section 31 |
| Website repo extraction | Extract `sgraph_ai__website/` to dedicated `SGraph-AI__Website` repo (Phase 3 blocked on human creating GitHub repo) | Section 9 note |

---

## Local Development

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Docker-based local LLM chat (`sg_send_deploy__local_llm/`) | Separate package with FastAPI proxy to host Ollama | Section 16 |
| 3 local LLM UI Web Components | `chat-panel`, `session-list`, `model-picker` for local chat UI | Section 16 |
| sg-layout integration (bundled offline) | Bundle sg-layout for offline local chat use | Section 16 |

---

## AWS / Cloud

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| cdn.sgraph.ai | Shared CDN for stable JS/CSS/font artifacts (zero-dependency requirement) | v0.7.6 |
| Three AMIs for AWS Marketplace | EC2/AMI deployment for Marketplace listing | Section 30 |
| CloudFront/S3/CloudWatch/X-Ray logging | Phase 1 visibility strategy — zero code, config only | Section 16 |
| GuardDuty, WAF, Security Hub | Evaluation and configuration for production security | Section 16 |
| AWS Managed Grafana + Prometheus | Infrastructure monitoring stack (~$78/month estimate) | Sections 16, 17 |
| Custom Prometheus endpoints on Lambda | Export Lambda metrics to Prometheus scrape format | Section 16 |
| S3 lifecycle cleanup for expired files | Automated cleanup of files past retention period | Section 16 |

---

## Code Quality

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Type_Safe remediation of sg_send_deploy | 17 modules, 5-phase plan to fix 65+ violations | Section 16 |
| Shared `EC2__Types.py` module | Named Id subclasses and Enums as prerequisite for Type_Safe adoption | Section 16 |
| Fix `__init__` bypasses in EC2 schemas | P0 correctness fix for EC2 Instance + Security Group schemas | Section 16 |

---

## SG/Compute Package Manager (05/11 briefs — docs 357, 358, 370)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| SG/Compute package manager — full architecture | 10-principle graph-driven package manager with fractal composition (4 levels: Global → Consulting → Engagement → App) | doc 357 |
| SKILL.md + USAGE.md sidecar pattern | Agent-readable package metadata alongside code; versioned with package | doc 357 |
| Package manager: fractal 4-level nesting | Managers nesting inside managers; each level can override/extend parent | doc 357 |
| Package manager commercial model | 3 tiers (free generic / maintainer-supported / enterprise); 8 revenue streams | doc 370 |
| Sidecar signing + marketplace for packages | Cryptographic signing of sidecars; discovery, licensing, marketplace | doc 370 |

---

## EC2 Image Build CLI (05/11 brief — doc 358)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| `sg-image` CLI — 6-phase pipeline | capture → package → load → test → strip → measure; S3-first (5× faster than AMI) | doc 358 |
| GPU-aware image build workflow | Separate runtime from model weights; CUDA + NCCL aware | doc 358 |

---

## Publishing / Subdomain Infrastructure (05/11–05/12 briefs — docs 366, 375, 376)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| `sgit publish --slug <name>` CLI command | One-command publish to `*.sgraph.app` slug | doc 376 |
| `sgit publish-static` CLI command | Offline static HTML bundle from vault; host anywhere | doc 375 |
| `sgraph.app` wildcard subdomain registration | Slug-to-share-token lookup; no new persistence layer | doc 376 |
| Slug uniqueness enforcement + management | Per-user slug registry | doc 376 |
| Serverless static vault projection | Fully offline; browser-side decryption; any host target | doc 375 |

---

## Vault App CI Pipeline (05/16 briefs — doc 419)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-138 | Three-class CI pipeline | Smoke tests (every commit) / per-vault runs (commit + nightly) / browser-automation (release candidates + nightly) | doc 419 |
| P-139 | Vault test registry as manager vault | Registered vaults + per-vault test configuration; version-controlled | doc 419 |
| P-140 | Ephemeral compute triggered from CI | CI calls sg-compute fargate or container commands to spin up isolated test environments | doc 419 |
| P-141 | CI failure reports with reproduction commands | Link to failing vault commit + vault app commit + full logs + local reproduction command | doc 419 |

---

## SG/Vault AWS Marketplace Standalone (06/21 briefs — v0.33.31)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-398 | SG/Vault AWS Marketplace standalone deployment | Separate admin FastAPI and website for deployment management; setup mode on boot (boots unconfigured, no user data required at launch — marketplace policy); storage-mode property (memory / disk EBS / S3) with least-privilege IAM role per mode attached to EC2 instance (no credentials in AMI); two-layer authorization model (FastAPI access control + usage API keys, both user-configurable); send-to-someone workflow = open FastAPI access + key required to invoke; AMI + CloudFormation one-click deploy; marketplace-branded vault page; pricing: free / BYOL / metered; open items before launch: TLS without Caddy (sidecar proxy recommended), admin auth bootstrap (first-boot random token), EBS volume lifecycle (DeletionPolicy: Snapshot) | 06/21 aws-marketplace-deployment/dev-brief

---

## Multi-Target Deployment Plan — Phases A–D (08/11 architect spec + technical brief — v0.33.54)

Planned in `team/roles/architect/reviews/08/11/v0.33.54__architect-spec__multi-target-deployment.md` and `team/comms/briefs/08/11/v0.33.54__technical-brief__deployment-phases-a-d.md`. Resolves P-398's three open items (ADR-5/6/7).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-399 | Lambda Web Adapter in `sg-send-vault` image | One image runs on Lambda (container fn), Cloud Run, Heroku, Docker/EC2; `$PORT` contract; non-root + HEALTHCHECK + OCI-label hardening; ECR publish | 08/11 technical brief, Phase A |
| P-400 | CloudFormation Lambda target (`deploy/aws/lambda.cfn.yml`) | Container-image Lambda + Function URL, params for memory/timeout/token/DNS (optional CloudFront + Route53; cert must be us-east-1); stack-created S3 buckets by existing naming convention | 08/11 technical brief, Phase B |
| P-401 | CloudFormation EC2 appliance target (`deploy/aws/ec2.cfn.yml`) | Single instance, docker compose (app + caddy auto-TLS sidecar), EBS data volume with DeletionPolicy: Snapshot, first-boot token in SSM, storage-mode param swaps least-privilege IAM policy, params for instance type/DNS/CIDR | 08/11 technical brief, Phase B |
| P-402 | Dedicated deploy-targets CI pipeline | New `deploy-targets.yml` workflow (separate from ci-pipeline family): image build/push (Docker Hub + ECR), cfn-lint, per-target deploy + shared pytest smoke suite, GitHub OIDC (no long-lived AWS keys), EC2 auto-teardown | 08/11 technical brief, Phase C |
| P-403 | GCP Cloud Run + Heroku deployments | Same image; Cloud Run via Workload Identity Federation, Heroku via container registry; both S3 storage mode (Heroku fs is ephemeral); `Storage_FS__GCS` backend registered as follow-on | 08/11 technical brief, Phases D1–D2 |
| P-404 | ~~Netlify static vault UI hosting~~ SUPERSEDED by P-412 | Netlify (and all static hosts) moved to the dedicated static-vault-hosting brief — static hosting is its own deployment kind, not an API target | 08/11 static-vault-hosting brief |
| P-405 | Terraform modules (AWS + non-AWS) | `deploy/terraform/modules/{aws-lambda,aws-ec2,aws-ecs-fargate,gcp-cloud-run,heroku}`; AWS modules mirror the authoritative CFN templates (smoke suite = drift alarm), non-AWS modules ARE the implementation Phase D CI calls; Registry publication is a follow-on | 08/11 technical brief, Phase B2 / ADR-10 |
| P-406 | One-click deploy web pages (`/deploy/*`) | Website section with per-target one-click installs: CFN Launch Stack deep-links (public versioned template bucket, params prefilled), GCP Cloud Run Button, Heroku Button (`app.json`+`heroku.yml`), docker one-liner; no credential collection — buttons deep-link into the provider's own console | 08/11 technical brief, Phase E / ADR-11 |
| P-407 | ECS/Fargate CFN target with full cluster lifecycle | `deploy/aws/ecs-fargate.cfn.yml`: one stack owns cluster + task def + service + ALB + DNS; stack delete removes everything (orphans = pipeline failure); the long-running multi-replica pattern | 08/11 technical brief, Phase B.3b / ADR-13 |
| P-408 | AMI baking pipeline — AMI as master server-side artifact | EC2 Image Builder pipeline (CFN-defined): AL2023 + docker + pre-pulled image + compose + systemd; versioned per-region AMIs + latest SSM parameter; `ec2.cfn.yml` boots from it (user-data fallback kept); same AMI is the Marketplace artifact (P-398) | 08/11 technical brief, Phase B3 / ADR-15 |
| P-409 | Full-cycle validation pipeline (`deploy-full-cycle.yml`) | ONE workflow: deploy ALL targets in sequence → smoke ALL → destroy ALL in reverse → orphan sweep (tag-based) → report; dispatch + nightly; proves create AND destroy end-to-end | 08/11 technical brief, Phase C1 / ADR-16 |
| P-410 | Publish/dogfood pipeline (`deploy-publish.yml`) + CFN/TF productization | Publishes the live API to the several wanted locations, driven exclusively by CFN/Terraform at pinned versions from `deploy/publish-targets.yml`; direction: pytest-as-deployer (osbot dev-era tool) retired after bedding-in → one deployment mode across the board | 08/11 technical brief, Phase C2 / ADR-16 |
| P-411 | Single-key licensing mode + friendly login page + memory mode everywhere | `AccessToken` param = the licensing key on every target, gating ALL routes incl. reads; friendly login page in the image replaces the bare set-cookie-form (caddy just proxies); `StorageMode=memory` first-class on every target (agentic/ephemeral); self-contained image invariant enforced by `--network=none` smoke | 08/11 technical brief, A.4/A.5 + shared param semantics / ADR-8, ADR-12, ADR-14 |
| P-412 | Static vault hosting — read-only projections to any static host | Dedicated brief: publish UI tree + ciphertext mirror + read-only token to GitHub Pages / S3+CF / Netlify / GCS / Cloudflare Pages / Heroku-static; two access models (public projection, locked projection); adopts `sgit publish-static` (doc 375) as the exporter; source-of-truth vault stays on a live server | 08/11 static-vault-hosting brief | |
