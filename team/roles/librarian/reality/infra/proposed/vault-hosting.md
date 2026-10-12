# Infrastructure — Vault Hosting and Compute Proposed Items

**Domain:** infra/proposed/ | **Last updated:** 2026-07-14 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Source briefs: docs 384, 385, 389 (05/14), 399, 401, 403, 424, 425, 428, 429, 437 (05/16–05/17).

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

---

## Fargate and Container Experiments (05/17 briefs — docs 399, 403)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Fargate CLI commands | create-cluster, run-task, list-tasks, stop-task, logs — CLI-native ECS/Fargate operations | doc 399 |
| Fargate vault hosting benchmark | 7-metric measurement: cold start, clone time, vault op sequences, cost/operation, cost/session, concurrency | doc 399 |
| SG/Compute container hosts primitive | EC2+Docker node-pool: submit tasks, placement logic, multi-region parallel execution, 15-min idle teardown | doc 403 |
| Container host CLI (host + container sub-commands) | create/list/describe/stop/metrics for hosts; run/list/logs/stop for containers | doc 403 |

---

## Instance Sizing Decision Table (05/17 brief — doc 401)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| EC2 instance sizing measurement programme | Startup matrix (t3/t4g, m7i/m8g, c7i/c8g), workload benchmarks, break-even analysis, burstable credit dynamics | doc 401 |
| Instance sizing decision table | Output: recommended default instance per workload class (short/cold, short/warm, medium, long, warm-pool, multi-host) | doc 401 |

---

## Serverless for Agents — SG/Compute Framing (05/16 briefs — doc 424)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-165 | Serverless vault-app hosting | Stable URL backed by ephemeral compute; on-demand lifecycle; pre-auth pay-per-use billing | doc 424 |
| P-166 | Cold-start measurement framework per substrate | Measured cold-start times for EC2 (warm/cold), Fargate, container-on-host, Firecracker | doc 424 |
| P-167 | "Serverless for agents" reference example | Minimal vault-app demonstrating cold-start → warm-state → tear-down lifecycle | doc 424 |
| P-168 | Pre-warmed container pools (reserved capacity) | Keep N containers ready to serve traffic without paying for idle EC2 capacity | doc 424 |
| P-169 | Enclave-serverless integration path | Nitro Enclaves + on-demand lifecycle for high-trust serverless compute | doc 424 |

---

## Multi-Cloud Deployment + Agent Communication (05/16 briefs — doc 425)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-170 | SG/Deploy — separate codebase | Multi-cloud deployment tool separate from SG/Compute; communicates via vault, not code imports | doc 425 |
| P-171 | GCP Cloud Run deployment | sg-deploy gcp cloud-run deploy command; vault Docker image on GCP | doc 425 |
| P-172 | Akamai Cloud (Linode) deployment | sg-deploy akamai linode deploy command; vault Docker image on Linode | doc 425 |
| P-173 | Vault-as-communication-medium for agent handoffs | Agents write requests to shared vaults; no direct calls, no shared DB; full audit trail | doc 425 |
| P-174 | Multi-cloud cost tracking via observability | Per-cloud cost data flowing through unified observability session for comparison | doc 425 |

---

## On-Demand Vault Provisioning (05/16 briefs — doc 428)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-190 | DNS pinning fix — holding-page-detects-readiness Lambda | Lambda checks provisioning state per request; returns HTTP 302 when instance is ready | doc 428 |
| P-191 | Address router as separate primitive | Lambda + state machine handling all *.sgraph.app traffic; decides per-slug action | doc 428 |
| P-192 | Randomised ephemeral address pattern | GUID-based: `ephemeral-7g3kp9-x.sgraph.app`; implies temporality; unguessable | doc 428 |
| P-193 | "Found existing instance, want to join?" UX | Holding-page Lambda detects running instance; offers join vs. create-new choice | doc 428 |
| P-194 | Multi-instance-per-user support | User can have multiple active instances simultaneously, each addressable | doc 428 |

---

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

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-197 | MyFeeds three-primitives publishing architecture | Vault (portable, encrypted), storage substrate (server/S3/ephemeral/zip), management layer (vault-of-vaults holding keys + workflow state); hybrid static + ephemeral recommended; 8-phase delivery | doc 437 |
