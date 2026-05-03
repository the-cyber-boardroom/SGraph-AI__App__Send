# Infrastructure — Proposed Items Index

**Domain:** infra/proposed/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

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

### Ephemeral Infra Next Phase (04/29 brief, doc 334)

All items below are PROPOSED — does not exist yet. Source: `briefs/04/29/v0.22.19__dev-brief__ephemeral-infra-next-phase.md`

| Feature | One-Line Description |
|---------|---------------------|
| Split creation from live instances | Separate UI panels: provisioning (instance type, creation mode, AMI) vs live management (running instances, status, controls) |
| AMI management UI | List, bake, delete, set-default AMIs per instance type; progress indicator for bake operation |
| SG/Send vault server instance type | New plugin `plugins/vault-server/` — launches SG/Send Docker container as an ephemeral EC2 instance; storage primitive for the platform |
| Docker container management inside instances | List, start, stop, restart, view logs, expose ports for Docker containers running inside an EC2 instance (via instance FastAPI with Docker socket access) |
| Remote shell — Option A (API-based) | `POST /shell/execute` + `POST /shell/stream` (WebSocket) on instance FastAPI; terminal UI; no SSH/SSM required; no interactive terminal (limitation documented) |
| Prometheus endpoints on instances | `GET /metrics` on instance FastAPI returning Prometheus text format: CPU, memory, disk, uptime, container count, request count |
| Stacks (multi-instance bundles) | JSON config triggers sequential launch of multiple instances; Phase 1 = launch shortcut only (no VPC coordination); Phase 2 = same-VPC networking |

### Firefox Browser Plugin (04/29 brief, doc 335)

All items below are PROPOSED — does not exist yet. Source: `briefs/04/29/v0.22.19__dev-brief__firefox-browser-plugin.md`

| Feature | One-Line Description |
|---------|---------------------|
| Firefox plugin (`plugins/firefox/`) | Firefox + MITM proxy as a dedicated plugin; interactive browsing vs Playwright's programmatic model |
| Firefox detail panel UI | sg-layout detail view: credentials (username/password), MITM proxy controls (script upload, intercept toggle, proxy UI link), security settings (self-signed certs, SSL intercept), Firefox settings (start page, profile load), instance controls (bake AMI, stop) |
| MITM intercept script management | Upload Python mitmproxy scripts via UI; stored in vault per session; executed on all proxied traffic |
| Browser view inline | Firefox session rendered in iframe (preferred) or VNC/noVNC fallback if X-Frame-Options headers cannot be removed |
| Health checks (five dimensions) | Container running / Firefox alive / MITM proxy connected / network reachability / login page accessible — displayed as green/amber/red in panel |
| Firefox vault storage per session | Credentials, MITM scripts, proxy logs, Firefox profile (if saved), screenshots, instance metadata — all stored in vault per session |
| Firefox AMI bake | Saves configured Firefox profile (MITM scripts, bookmarks, extensions, security settings) in AMI; restores on launch-from-AMI |

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
