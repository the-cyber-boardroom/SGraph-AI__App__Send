# QA — Reality Index

**Domain:** qa/ | **Last updated:** 2026-07-02 | **Maintained by:** Librarian (daily run)

This domain covers the test suite, QA infrastructure (browser automation, Playwright), and test strategy. SGraph Send uses an all-real-implementations philosophy: no mocks, no patches. The full stack starts in-memory in ~100ms.

---

## EXISTS (Code-Verified)

### Test Suite: ~1994+ Tests, All Passing

**Strategy:** No mocks, no patches. In-memory Memory-FS stack. ~100ms startup.

**Python unit tests: 977 (confirmed via commit `66ce528`, 2026-06-29 — poetry.lock update to osbot-fast-api 0.39.0 + FastAPI 0.138.1).** Up from 957 (2026-06-05). The increase reflects new tests added with the `_IncludedRouter` fix and osbot-utils 3.74.0 additions.

**Total ~2006+** = 977 Python + ~157 vault-UI JS (sub-vaults/public-previews/app-perms/VaultSubvaultsView) + ~364 ViV loader suite (now 352+ with sg-embed-helpers) + ~78 app-shell JS + 37 embed-protocol + ~334 inbox/write-batch/owner-secrets suite + browser integration: 8 tests + 10 app-shell-nav-helpers inbox/folder-app.json tests + 12 static-mode tests.



**ViV Loader Suite (2026-05-29, 335+ jsdom-free assertions, all green):**

Run with: `bash tests/unit/vault_ui/loader/run-all.sh`

**Phase 1–2 core (added in first ViV session):**

| File | Assertions | What It Tests |
|------|-----------|---------------|
| `test__secure_channel_envelope.js` | 29 | Signed+encrypted envelope; T5 tamper; T6 replay; E7/E8 binary (PNG); padding edges; nonce uniqueness |
| `test__secure_channel.js` | 14 | Port-anchored channel; K1 handshake + sniffer confidentiality (C2); directional rule (C3a/b); PNG bytes live (C5/T13); concurrent requests; close→EUNREACH |
| `test__kernel_mounts.js` | 13 | Longest-prefix table; add/remove/resolve; traversal-collapse; mount-root list (N1) |
| `test__kernel_broker.js` | 22 | mediate/finalize; opaque entryId; concurrent-safe (N3); audit log metadata-only; policy auto/ask |
| `test__kernel_relay.js` | 16 | Integration: SecureChannel + KernelMounts + KernelBroker + synthetic data source; T3a/b directional; T4 non-transitive; T7/T8/T9 capability gate; R2/R3 PNG relay (T13/B2); R5 mount-root (N1) |
| `test__app_permissions_vault_mount.js` | 6 | vault.mount capability key: parse + can() |
| `test__kernel_app_handlers.js` | 24 | registerKernelVfsHandlers; two-sided gate (H1 fix); AppPermissions.isFloor/can; _safePush EUNREACH (M1 fix) |
| `test__kernel_bootstrap.js` | 13 | bootKernelOnPort; handshake→vault.open→register; endpoint from secrets (M5 fix) |
| `test__sg_app_stub.js` | 13 | Secret-less stub; sg.ready hydration; PNG round-trip (B2/T13); smoke audit: no vaultKey/token in window.sg |
| `test__bundle_freshness.js` | 1 | kernel-shell-bundle.js is current vs. its sources (L3 fix) |

**Phase 3–5.1: B4–B10, KernelParent, Phase 4, Phase 5.1 (added 2026-05-29):**

| File | Assertions | What It Tests |
|------|-----------|---------------|
| `test__kernel_parent.js` | 44 | KernelParent: spawn/handshake child; relay; monitorChild (B7); endpoint from secrets (M5 parent side) |
| `test__viv_mounts_view.js` | 33 | B4: mountRows/logRows view-model; summary; outcomeClass; credTag |
| `test__viv_credential_tiers.js` | 28 | B5/B6: tier enum; requiredTierFor; meets; fail-closed gate; unknown verbs default to highest |
| `test__viv_monitor.js` | 20 | B7: MODES.CLOSED/OPT_IN; registerOnChannel; consent-gated log exposure |
| `test__viv_custody.js` | 33 | B10: fail-closed custody checker; EUNSAFE_CUSTODY for unknown custodians |
| `test__app_frame_bootstrap.js` | 32 | Phase 4: AppFrameBootstrap.build(); all 4 kinds; byte-identical to inline templates |
| `test__viv_audit_view.js` | 37 | Phase 5.1: aggregate(); filterLog/groupLog/facets/sourceRows; consent-honest (CLOSED→no log rows) |

**sg-embed-helpers (added 2026-06-29, commit `ddff724`):**

| File | Assertions | What It Tests |
|------|-----------|---------------|
| `test__sg_embed_helpers.js` | 17 | `SgEmbed.buildIframe()`/`buildEmbedUrl()`; sandbox enforcement (allow-scripts only; refuses allow-same-origin); opaque-origin logic; full embed handshake round-trip in Node |

| **Total ViV loader suite** | **352+** | |

**Static-host mode (added 2026-06-30, commit `74d5444`):**

| File | Assertions | What It Tests |
|------|-----------|---------------|
| `test__sgsend_static_mode.js` | 12 | `SGSend.staticMode` flag inheritance; `vaultBatch` fan-out shape (reads → parallel GETs, identical response); EREADONLY on write ops in static mode; non-static regression guard (verifies live behaviour unchanged when `staticMode=false`) |

Added to `run-all.sh`. Also covers the app-shell regression fix (`97426c2`, 2026-06-30): `_buildVfsBridgeScript` bare-call ReferenceError that broke all `/en-gb/app/` mounts — fixed; existing browser integration suite (8 tests) verifies.

**Note:** Tests T1 and T2 (null-frame `parent.document`/`localStorage` access throws) require a real browser — Phase 3 security gate tests, not runnable in Node. Phase 3 Playwright probe suite: 30 assertions, 0 failures.

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

**App-shell extraction (added 2026-05-31, extended 2026-06-01):**

| File | Assertions | What It Tests |
|------|-----------|---------------|
| `test__app_hud_config.js` | 31 | `AppHudConfig.resolve()` — per-mode defaults, explicit overrides, sovereignty-rail constraints |
| `test__app_shell_nav_helpers.js` | 47 | `AppNavHelpers` deep-link routing (DM1–DM11), path resolution, history management |

**Vault-Embed protocol (added 2026-06-07, commit `3b30347`):**

| File | Assertions | What It Tests |
|------|-----------|---------------|
| `test__embed_protocol.js` | 37 | `EmbedProtocol` module: `isEmbedMode` (legal/illegal query strings), `getExpectedParentOrigin` (empty/null/literal), `validateSource` (source-window/origin/sibling/null-origin — 8 scenarios), `parseOpenMessage` (valid/missing-field/wrong-type/wrong-sg — 13 scenarios), `readyMessage` and `vaultReadyMessage` (version constant + coercion) |

`run-all.sh` suite total after adding embed_protocol: **~113 assertions** (was ~76 before).

**Browser Integration Tests — Python + Playwright (added 2026-05-31, extended 2026-06-07):**

Exercises a real local file server + headless Chromium + sgit-ai. End-to-end coverage of live-vault scenarios not reachable by Node/jsdom tests.

| File | Test functions | What It Tests |
|------|---------------|---------------|
| `tests/integration/vault_ui/browser/test__harness_smoke.py` | 3 | Harness boots, vault server responds, Playwright connects |
| `tests/integration/vault_ui/browser/test__app_mode_deep_link.py` | 1 | Deep-link HTML fix: CSS/JS loads correctly in a real browser |
| `tests/integration/vault_ui/browser/test__sgit_round_trip.py` | 1 | sgit-ai round-trip: create vault, modify, push, verify browser sees update |
| `tests/integration/vault_ui/browser/test__embed_handshake.py` | 4 | Vault-embed handshake (full protocol + storage isolation + deep-link memory path + sandboxed iframe vault-open) |

**Total browser integration: 8 tests, ~16–20s.**

Key assertions in `test__embed_handshake.py`:
- Full handshake: `vault-embed-ready` fired, `vault-ready` payload shape verified
- App frame content rendered (proves key actually opened the vault)
- `sg-vault-key` NOT in localStorage OR sessionStorage of the iframe (security assertion — caught a real leak during initial implementation)
- Deep-link content check: `EMBEDDED_PATIENT` rendered (not default `EMBEDDED_OK`)
- Sandboxed iframe (sandbox=`allow-scripts`, no `allow-same-origin`): `vault-ready` fires; `typeof caches` throws (precondition pinned); verified to FAIL pre-fix

QA brief: `team/comms/qa/briefs/06/01/brief__vault-test-embed-handshake.md` (manual testing checklist for the test-vault-creator agent role)
Caches guard brief: `team/comms/qa/briefs/06/07/brief__embed_caches_object_store_guard.md` (triggered `d5f6f0a` fix)

Base class: `tests/integration/vault_ui/browser/_browser_harness.py` (193 lines) — `self._sgit()`, `self._new_vault_key()`, `self.create_seeded_vault(files)` shared helpers.

Run: `poetry run pytest tests/integration/vault_ui/browser/ -v` (or CI: `npm run test:vault-browser-integration`)

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
