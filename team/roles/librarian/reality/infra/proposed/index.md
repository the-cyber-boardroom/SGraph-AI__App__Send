# Infrastructure — Proposed Items Index

**Domain:** infra/proposed/ | **Last updated:** 2026-05-24 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

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

*Source for rows 19–26: `briefs/04/29/v0.22.19__dev-brief__ephemeral-infra-next-phase.md` and `briefs/04/29/v0.22.19__dev-brief__firefox-browser-plugin.md` (docs 334–335)*

## CI/CD Improvements

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| 5-layer CI pipeline unification | Unified pipeline with caching across Lambda, Docker, QA, Website layers | Section 17 |
| IFD v2 manifest system | `manifest.json` + `manifest.lock`; per-component versioning; SGLoader; localStorage toggle | Sections 16, 17 |
| Vault-driven CI | Agent-managed CI triggered by vault commits (no direct GitHub pushes) | Section 31 |
| Website repo extraction | Extract `sgraph_ai__website/` to dedicated `SGraph-AI__Website` repo (Phase 3 blocked on human creating GitHub repo) | Section 9 note |

## Local Development

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Docker-based local LLM chat (`sg_send_deploy__local_llm/`) | Separate package with FastAPI proxy to host Ollama | Section 16 |
| 3 local LLM UI Web Components | `chat-panel`, `session-list`, `model-picker` for local chat UI | Section 16 |
| sg-layout integration (bundled offline) | Bundle sg-layout for offline local chat use | Section 16 |

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

## EC2 Image Build CLI (05/11 brief — doc 358)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| `sg-image` CLI — 6-phase pipeline | capture → package → load → test → strip → measure; S3-first (5× faster than AMI) | doc 358 |
| GPU-aware image build workflow | Separate runtime from model weights; CUDA + NCCL aware | doc 358 |

## Publishing / Subdomain Infrastructure (05/11–05/12 briefs — docs 366, 375, 376)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| `sgit publish --slug <name>` CLI command | One-command publish to `*.sgraph.app` slug | doc 376 |
| `sgit publish-static` CLI command | Offline static HTML bundle from vault; host anywhere | doc 375 |
| `sgraph.app` wildcard subdomain registration | Slug-to-share-token lookup; no new persistence layer | doc 376 |
| Slug uniqueness enforcement + management | Per-user slug registry | doc 376 |
| Serverless static vault projection | Fully offline; browser-side decryption; any host target | doc 375 |

---

---

## Vault Hosting Architecture (05/14 briefs — docs 384, 385, 389)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Vault collections as named primitive | Bounded set of related vaults; packaged as zip for portability across substrates | doc 384 |
| Vault-as-zip format | Encrypted object store bundled as zip; safe to transmit across EC2, containers, local FS | doc 384 |
| Container vault hosts | Short-lifecycle Docker containers running vault apps; co-located with vault data for agentic workflows | doc 384 |
| Vault Synchronizer `deploy container` command | CLI command to deploy a vault app in a container with vault collection mounted | doc 384 |
| Vault hosting: dedicated EC2 density mode | One vault per EC2 instance; highest isolation; for regulated/isolation-sensitive workloads | doc 385 |
| Vault hosting: multi-container density mode | Multiple containers per EC2 + nginx/Traefik routing layer; moderate multi-tenancy | doc 385 |
| Vault hosting: multi-vault-per-app density mode | Multiple vaults sharing one app process; lowest cost; for batch workloads | doc 385 |
| Routing layer on EC2 for multi-container mode | Hostname → container routing table; nginx/Traefik-style dispatch | doc 385 |
| Vault Synchronizer `--density` flag | Selects density mode at deploy time (dedicated / multi-container / multi-vault) | doc 385 |
| EC2 warm pools for boot optimisation | Pre-provisioned pool of 3-5 instances; target 10-20s boot (from 2-4 min cold) | doc 389 |
| AMI baking with preinstalled vault app | Baked AMI eliminates app install from boot path; primary boot-time reduction lever | doc 389 |
| Vault Synchronizer `deploy ephemeral` command | CLI command to launch a vault on a pre-provisioned warm pool instance | doc 389 |
| Boot instrumentation and metrics | Phase-by-phase timing capture (API call → running → SSH → vault-app-ready) | doc 389 |

## Fargate and Container Experiments (05/17 briefs — docs 399, 403)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Fargate CLI commands | create-cluster, run-task, list-tasks, stop-task, logs — CLI-native ECS/Fargate operations | doc 399 |
| Fargate vault hosting benchmark | 7-metric measurement: cold start, clone time, vault op sequences, cost/operation, cost/session, concurrency | doc 399 |
| SG/Compute container hosts primitive | EC2+Docker node-pool: submit tasks, placement logic, multi-region parallel execution, 15-min idle teardown | doc 403 |
| Container host CLI (host + container sub-commands) | create/list/describe/stop/metrics for hosts; run/list/logs/stop for containers | doc 403 |

## Instance Sizing Decision Table (05/17 brief — doc 401)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| EC2 instance sizing measurement programme | Startup matrix (t3/t4g, m7i/m8g, c7i/c8g), workload benchmarks, break-even analysis, burstable credit dynamics | doc 401 |
| Instance sizing decision table | Output: recommended default instance per workload class (short/cold, short/warm, medium, long, warm-pool, multi-host) | doc 401 |

## S3 Native CLI (05/17 brief — doc 402)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| S3 native CLI commands | ls, view, edit, cat, tail, head, cp, mv, rm, stat, presign, search, bucket-create, bucket-list, bucket-stat, bucket-config | doc 402 |
| S3 vim edit integration | Download S3 object → open `$EDITOR` → re-upload with ETag conflict detection | doc 402 |
| S3 rsync-style sync primitive | Compare source/destination, transfer changed, checksums, --delete, --dry-run, --reverse | doc 402 |
| Vault-aware S3 wrappers | vault-open, vault-sync, vault-diff, vault-ls — thin wrappers over S3 CLI with vault semantics | doc 402 |

## IAM Graph Visualisation and Lockdown (05/17 brief — doc 400)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| IAM graph visualisation | Discovery pass → graph data structure (role, policy, resource, action tuples) → vault-stored; cleanup and expansion commands | doc 400 |
| CloudTrail evidence layer for IAM | Per-role: observed actions vs granted permissions over N days; drives evidence-based permission tightening | doc 400 |

---

## Firecracker Substrate (05/15 briefs — docs 408, 411, 412)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Firecracker PoC on C8i-flex.large with nested virtualisation | Sub-$5 experiment: boot microVM, take snapshot, restore; measure startup and restore times | doc 412 |
| Firecracker microVM substrate option in container hosts primitive | Firecracker as an optional backend alongside Docker/Podman in the container hosts placement model | doc 412 |
| Vault-attached compute via Firecracker snapshots | Vault open → snapshot restore (sub-second); vault closes → snapshot discards; lifecycle-aligned | doc 412 |
| AI agent code execution sandbox on Firecracker | Per-execution hardware isolation for untrusted LLM-generated code; isolation not speed is the value | doc 412 |
| Snapshot-fast Playwright fleet on Firecracker | Pre-initialised Playwright state snapshot; sub-second restore; far faster than cold container start | doc 412 |
| Fourth vault-hosting density mode: multi-microVM per EC2 | Hardware-level isolation, mid-cost; between multi-container and dedicated EC2 on isolation axis | doc 411 |
| Podman as default container runtime for container hosts | Rootless-by-default; no daemon; 15-20% lower memory at scale vs Docker; pending benchmark confirmation | doc 411 |
| Firecracker-containerd integration for OCI compatibility | Run any OCI image as a Firecracker microVM via standard containerd tooling | doc 412 |
| Real benchmark on c8i-flex.large: Docker vs Podman vs Firecracker | Cold-start, memory, CPU for vault app workload; one-day exercise, sub-$5 cost | doc 411 |

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 16–32)*

---

## Vault App CI Pipeline (05/16 briefs — doc 419)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-138 | Three-class CI pipeline | Smoke tests (every commit) / per-vault runs (commit + nightly) / browser-automation (release candidates + nightly) | doc 419 |
| P-139 | Vault test registry as manager vault | Registered vaults + per-vault test configuration; version-controlled | doc 419 |
| P-140 | Ephemeral compute triggered from CI | CI calls sg-compute fargate or container commands to spin up isolated test environments | doc 419 |
| P-141 | CI failure reports with reproduction commands | Link to failing vault commit + vault app commit + full logs + local reproduction command | doc 419 |

## Serverless for Agents — SG/Compute Framing (05/16 briefs — doc 424)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-165 | Serverless vault-app hosting | Stable URL backed by ephemeral compute; on-demand lifecycle; pre-auth pay-per-use billing | doc 424 |
| P-166 | Cold-start measurement framework per substrate | Measured cold-start times for EC2 (warm/cold), Fargate, container-on-host, Firecracker | doc 424 |
| P-167 | "Serverless for agents" reference example | Minimal vault-app demonstrating cold-start → warm-state → tear-down lifecycle | doc 424 |
| P-168 | Pre-warmed container pools (reserved capacity) | Keep N containers ready to serve traffic without paying for idle EC2 capacity | doc 424 |
| P-169 | Enclave-serverless integration path | Nitro Enclaves + on-demand lifecycle for high-trust serverless compute | doc 424 |

## Multi-Cloud Deployment + Agent Communication (05/16 briefs — doc 425)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-170 | SG/Deploy — separate codebase | Multi-cloud deployment tool separate from SG/Compute; communicates via vault, not code imports | doc 425 |
| P-171 | GCP Cloud Run deployment | sg-deploy gcp cloud-run deploy command; vault Docker image on GCP | doc 425 |
| P-172 | Akamai Cloud (Linode) deployment | sg-deploy akamai linode deploy command; vault Docker image on Linode | doc 425 |
| P-173 | Vault-as-communication-medium for agent handoffs | Agents write requests to shared vaults; no direct calls, no shared DB; full audit trail | doc 425 |
| P-174 | Multi-cloud cost tracking via observability | Per-cloud cost data flowing through unified observability session for comparison | doc 425 |

## On-Demand Vault Provisioning (05/16 briefs — doc 428)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-190 | DNS pinning fix — holding-page-detects-readiness Lambda | Lambda checks provisioning state per request; returns HTTP 302 when instance is ready | doc 428 |
| P-191 | Address router as separate primitive | Lambda + state machine handling all *.sgraph.app traffic; decides per-slug action | doc 428 |
| P-192 | Randomised ephemeral address pattern | GUID-based: `ephemeral-7g3kp9-x.sgraph.app`; implies temporality; unguessable | doc 428 |
| P-193 | "Found existing instance, want to join?" UX | Holding-page Lambda detects running instance; offers join vs. create-new choice | doc 428 |
| P-194 | Multi-instance-per-user support | User can have multiple active instances simultaneously, each addressable | doc 428 |

## DNS Registry for Labs (05/16 briefs — doc 429)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-195 | Admin interface as vault app | Vault app wrapping the on-demand provisioning CLI; list/create/inspect/wake/sleep/teardown labs | doc 429 |
| P-196 | DNS-as-registry via A records (corrected) | A records for registered lab slugs (not CNAMEs); admin vault is registry of truth; DNS is a projection | doc 429 |
| P-197 | Three lab states with clean transitions | cold (A→Lambda IP) → provisioning (A→Lambda IP) → live (A→instance IP) | doc 429 |
| P-198 | TXT records for vault public key distribution | DKIM pattern: `"sg-pubkey=ed25519:Mxe..."` at registered slug's DNS name | doc 429 |
| P-199 | DNS sync process (admin vault → Route 53) | Background process: on admin vault commit, creates/updates/removes A records in Route 53 | doc 429 |

---

## MyFeeds Website Rebuild — Three Primitives Architecture (05/17 briefs — Day 67, doc 437)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-197 | MyFeeds three-primitives publishing architecture | Vault (portable, encrypted), storage substrate (server/S3/ephemeral/zip), management layer (vault-of-vaults holding keys + workflow state); hybrid static + ephemeral recommended; 8-phase delivery | doc 437 |
