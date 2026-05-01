# QA — Proposed Items Index

**Domain:** qa/proposed/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## Playwright Infrastructure

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| QA Playwright 3-mode abstraction | Three operating modes for Playwright QA: local, CI, serverless | Section 30, doc 302 |
| Hourly traffic generation | Automated synthetic traffic on live endpoints every hour | Section 30, doc 302 |
| Playwright screenshot simple API | One-call API for taking screenshots with no orchestration overhead | Section 30, doc 311 |
| Serverless Playwright Lambda | Hot-swap code deployment for Lambda-hosted Playwright | Section 17 |
| Unified QA API | Smoke + full modes with deployment gate integration | Section 17 |

## QA Service Layer

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| FastAPI QA service (Layer 1/2) | FastAPI service exposing QA as an API (layers 1 and 2) | Section 17 |
| `sg-qa` CLI with session management | CLI tool for running, managing, and reviewing QA sessions | Section 17 |
| QA workflow offline session processing | Process and review QA session results offline | Section 23, doc 247 |

## Screenshot Determinism

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Screenshot determinism Phase 3 | Extend `data-qa-mask` coverage to all non-deterministic UI elements | Section 17 |
| Screenshot determinism Phase 4 | Visual regression baseline creation and comparison pipeline | Section 17 |

## Code Quality / Refactoring

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Type_Safe adoption (0/30 files → 100%) | 5-phase plan to migrate all QA code to Type_Safe from raw dicts | Section 17 |
| Type_Safe state machines for workflows | Upload and download workflow state machines using Type_Safe | Section 17 |
| Code deduplication | Remove 4x screenshot duplication, 3x capture duplication | Section 17 |
| 50 folders → 8 groups by user journey | Restructure QA folder layout by user journey rather than feature | Section 17 |

## Evidence and Compliance

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Evidence packs | Structured evidence collection for each QA run (screenshots + logs + metadata) | Section 31, doc 316 |
| Risk acceptance workflow | Formal process for acknowledging and accepting QA-identified risks | Section 31, doc 316 |
| Agentic QA performance framework | Agent-driven performance testing with automated analysis and reporting | Section 17 |

## CI Pipeline

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| 5-layer CI pipeline unification with caching | Unified pipeline: Lambda + Docker + QA + Website + Deploy layers | Section 17 |
| Dev-to-QA bidirectional patch workflow | Formal patch exchange between Dev and QA teams via vault | Section 17 |

---

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 17, 23, 30, 31)*
