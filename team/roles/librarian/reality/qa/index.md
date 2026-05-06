# QA — Reality Index

**Domain:** qa/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

This domain covers the test suite, QA infrastructure (browser automation, Playwright), and test strategy. SGraph Send uses an all-real-implementations philosophy: no mocks, no patches. The full stack starts in-memory in ~100ms.

---

## EXISTS (Code-Verified)

### Test Suite: ~602 Tests, All Passing

**Strategy:** No mocks, no patches. In-memory Memory-FS stack. ~100ms startup.

| Area | Test Count | Coverage |
|------|-----------|----------|
| Transfer routes | 24 | Full CRUD + MCP base64 + token leak prevention |
| Transfer service | 12 | Full lifecycle + IP hashing |
| Token routes | 13 | Create, lookup, use, revoke, update-limit, reactivate, list |
| Token service | 17 | Full lifecycle + exhaust + reactivate + update-limit |
| Presigned routes | 9 | Capabilities, initiate, complete, cancel, URLs |
| Presigned service | 15 | Memory mode, S3 key logic, transfer validation |
| Vault Presigned routes | 8 | Initiate/complete/cancel/read-url — memory mode + auth (added v0.19.5) |
| Vault Presigned service | 10 | Memory mode, S3 key logic, key alignment (added v0.19.5) |
| Data Room service | 20 | Create, get, list, archive, members, permissions |
| Data Room routes | 15 | Full CRUD + members + invites + audit |
| Invite service | 9 | Create, validate, accept (with usage limits), expire |
| Vault service | 10 | Create, folders, files, index, list-all |
| Vault Pointer routes | 22 | Write, read, read-base64, delete, lifecycle, isolation, security |
| Vault cache client | 19 | All CRUD for vault entities |
| Vault ACL | 13 | Grant, revoke, check, owner/editor/viewer hierarchy |
| Vault multi-user | 20 | Cross-user sharing scenarios |
| Vault ACL routes | 9 | Share, unshare, permissions |
| Audit service | 12 | Log, hash chain, query with filters |
| Users service | 5 | Create, lookup, fingerprint lookup, list |
| Keys service | 5 | Publish, lookup, unpublish, list, log |
| Room session | 3 | Create, validate, revoke |
| Cache client | 9 | Analytics, tokens, health |
| Metrics | 38 | Schemas, collectors, pipeline, CloudWatch stub |
| MCP setup | 12 | Mount, stateless, operation IDs, tools list |
| Analytics pulse | 4 | Counts, unique visitors, empty window |
| Static pages | 10 | Admin + user page loads, crypto availability |
| Lambda handlers | 4 | Admin + user handler init |
| FastAPI apps | 6 | Config, routes, auth |
| URL sanitisation | 3 | Token leak regression tests |
| Schemas | 6 | Transfer schema defaults |
| Admin client | 10 | Token CRUD via inter-Lambda client |
| Config | 6 | Storage mode detection |
| Version | 3 | Version file reading |
| Container App | 9 | Health, status, root redirect, static UI, transfers, vault, auth cookie form, disk storage |
| Container App Auth | 7 | Auth enforcement, header token, cookie token, form exclusion |

**Additional tests (not in unit suite):**
- 8 deployment tests (Lambda create/update/invoke per stage)
- 15 integration smoke tests (auth, health, CORS)
- 4 QA performance tests (mostly disabled)

### Browser Automation (Playwright)

- **Persistent CDP browser** — 18x faster setup vs fresh browser, Shadow DOM support (commit `v0.2.17`, 03/23)
- **CI pipeline green** — 121+ tests in GitHub Actions (commit `v0.2.18`, 03/23)
- **Upload wizard E2E test** — through Shadow DOM (commit `v0.2.18`)
- **Event-driven tests** — replaced `wait_for_timeout()` polling (commit `v0.2.30`, 03/25)
- **5 schema page objects** — Upload, Download, Browse, Gallery, Viewer (commit `v0.2.30`)
- **QA site live at** `qa.send.sgraph.ai` (03/25)
- **Gallery parity** — auto view mode, markdown preview, SgPrint tested (commit `v0.17.1`, 03/26)
- **14 `data-qa-mask` attributes** — for screenshot determinism (commit `v0.17.1`)
- **Language selector test** — 17 locales (03/23)
- **`qa-setup.html` debug page** EXISTS

### Test Infrastructure Markers (UI)

- `data-ready` attribute on all 7 HTML pages (CR-001) — code-verified, commit `v0.16.54`, 03/23
- `data-testid` attributes on interactive components (CR-002, CR-003) — code-verified, 03/23

### Playwright Verified Working

- **Playwright headless Chromium** confirmed working in Claude.ai web sessions
- Full SG/Send QA suite: 25 tests in ~44 seconds
- Screenshot capture works: 18 PNGs verified
- `dev.tools.sgraph.ai` accessible via Playwright with proxy config
- `openrouter.ai` NOT in egress allowlist (pending)

---

## PROPOSED (Not Yet Implemented)

- QA Playwright 3-mode abstraction + hourly traffic generation (doc 302, Section 30)
- Playwright screenshot simple API (doc 311, Section 30)
- QA workflow offline session processing (doc 247, Section 23)
- Evidence packs + risk acceptance workflow (doc 316, Section 31)
- `sg-qa` CLI with session management (v0.17.3 dev brief, Section 17)
- FastAPI QA service (Layer 1/2 API) (Section 17)
- Serverless Playwright Lambda (hot-swap code deployment) (Section 17)
- Unified QA API (smoke + full modes, deployment gate) (Section 17)
- Screenshot determinism Phases 3–4 (Section 17)
- Type_Safe state machines for upload/download workflows (Layer 2, Section 17)
- QA refactoring: Type_Safe adoption (0/30 files → 100%), 5-phase plan (Section 17)
- QA refactoring: code deduplication (4x screenshot, 3x capture) (Section 17)
- QA refactoring: 50 folders → 8 groups by user journey (Section 17)
- Browser automation v0.17.2 QA infrastructure (mentioned as PROPOSED in some sections) (Section 17)
- Agentic QA performance framework (Section 17)

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
