# SGraph Send — v0.3.5 Release Pack

**Date:** 15 February 2026 | **Version:** v0.3.5 | **Status:** End-to-end MVP live

This folder contains a **self-contained documentation pack** for the v0.3.5 release of SGraph Send. All documents cross-reference each other within this folder — no external documents are required.

---

## Start Here

**If you only read one file, read this:**

- **[Release Overview](v0.3.5__release-overview.md)** — What SGraph Send is, what's live, architecture summary, security model, test coverage, CI/CD, key decisions, what's next.

---

## Documents by Role

### Infrastructure & Architecture

| Document | Role | What You'll Learn |
|----------|------|-------------------|
| [Architect](v0.3.5__architect.md) | Architect | API contracts (13 endpoints), data models, two-Lambda design, storage abstraction, encryption flow, cache service |
| [DevOps](v0.3.5__devops.md) | DevOps | CI/CD pipeline, pytest-driven deployment, Lambda configuration, 11 GitHub secrets, environments (dev/qa/prod), operational gaps |
| [Cartographer](v0.3.5__cartographer.md) | Cartographer | System topology diagrams, upload/download data flows, component maps, security boundaries, Wardley evolution map (21 components) |
| [AppSec](v0.3.5__appsec.md) | AppSec | Zero-knowledge verification, STRIDE threat model, risk register (37 entries), encryption flow, attack scenarios, compliance notes |

### Delivery & Quality

| Document | Role | What You'll Learn |
|----------|------|-------------------|
| [QA](v0.3.5__qa.md) | QA | Test strategy (no mocks), 111+ tests, coverage by area, gap analysis (P0–P2), test matrix, admin UI test plan (46 planned), smoke test spec |
| [Dev](v0.3.5__dev.md) | Dev | Codebase structure (1,628 lines), class hierarchy, naming conventions, implementation patterns, dependencies, known tech debt |
| [Librarian](v0.3.5__librarian.md) | Librarian | Master index chain, decision register summary (D001–D047), document organisation, debrief chain, cross-reference guide |
| [Conductor](v0.3.5__conductor.md) | Conductor | Explorer/Villager sprint plans, task priorities, role activation waves, risk register, success criteria, standing directives |

### Discovery & Communication

| Document | Role | What You'll Learn |
|----------|------|-------------------|
| [Historian](v0.3.5__historian.md) | Historian | Project timeline (6 days), 14 milestones, full decision log (D001–D047), 10 named patterns, project narrative |
| [Designer](v0.3.5__designer.md) | Designer | Current UX state, design agency brief (Cruz & Cruz), landing page strategy, theme system (5 themes), IFD constraints |
| [Journalist](v0.3.5__journalist.md) | Journalist | Content produced, transparency messaging, competitive positioning, Jekyll docs site, LinkedIn strategy |
| [Advocate](v0.3.5__advocate.md) | Advocate | 4 user personas + 1 emerging, trust assessment, product-market fit indicators, 12 recommendations, accessibility status |
| [Sherpa](v0.3.5__sherpa.md) | Sherpa | 3 user journeys, friction log (13 items), guidance strategy, trail observations, friendlies programme |

---

## Reading Paths

### "I want to understand the product" (15 min)
1. [Release Overview](v0.3.5__release-overview.md)
2. [Cartographer](v0.3.5__cartographer.md) — topology + data flows
3. [Advocate](v0.3.5__advocate.md) — who uses it and why

### "I want to understand the architecture" (30 min)
1. [Release Overview](v0.3.5__release-overview.md)
2. [Architect](v0.3.5__architect.md) — API contracts + data model
3. [Dev](v0.3.5__dev.md) — codebase structure
4. [Cartographer](v0.3.5__cartographer.md) — system topology

### "I want to understand the security" (20 min)
1. [AppSec](v0.3.5__appsec.md) — threat model + risk register
2. [Cartographer](v0.3.5__cartographer.md) — security boundary map
3. [Architect](v0.3.5__architect.md) — encryption flow

### "I want to understand operations" (20 min)
1. [DevOps](v0.3.5__devops.md) — CI/CD + deployment
2. [QA](v0.3.5__qa.md) — test coverage + gaps
3. [Conductor](v0.3.5__conductor.md) — sprint priorities

### "I want the full project history" (30 min)
1. [Historian](v0.3.5__historian.md) — timeline, decisions, patterns
2. [Librarian](v0.3.5__librarian.md) — document chain, indexes
3. [Conductor](v0.3.5__conductor.md) — sprint velocity

---

## Design Principles for This Pack

1. **Self-contained** — no external documents required to understand v0.3.5
2. **Minimal duplication** — each concept lives in one document, others cross-reference it
3. **One file per role** — each role's unique contribution, not a repeat of others
4. **Layered depth** — Release Overview for the quick read, role documents for detail
5. **Cross-referenced** — every document links to related documents in this folder
