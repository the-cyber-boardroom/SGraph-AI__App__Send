# Infrastructure — Proposed Items Index

**Domain:** infra/proposed/ | **Last updated:** 2026-05-02 | **Maintained by:** Librarian (daily run)

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

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 16–32)*
