# ui/proposed — Index

**Domain:** `ui/` | **Last updated:** 2026-05-30
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — Sections 16 (lines 1210–1219, 1234–1241), 17 (lines 1541–1551), 29–30 (lines 2720–2830)

---

## Upload UX Redesign (v0.16.10 — 03/16)

| Proposed Feature | Status |
|-----------------|--------|
| Three-step upload flow (upload → distribution → credentials) | PROPOSED — ASCII mockups exist |
| Three sharing modes (simple token, full link, separate key) | PROPOSED |
| Simple token (PBKDF2-derived, client-side, no backend) | PROPOSED |
| 10GB upload limit (remove 5MB JS limit) | PROPOSED |
| Upload progress carousel with trust-building messages | PROPOSED |
| Demo packs with leaked keys on website | PROPOSED |

---

## Gallery Editor + Rich Preview (v0.16.17–v0.16.26)

| Proposed Feature | Status |
|-----------------|--------|
| Gallery editor (per-image comments, multi-language, layout) | PROPOSED |
| Rich preview (sender-side thumbnails, `_preview/` folder) | PROPOSED |
| Gallery download as self-contained HTML | PROPOSED |

---

## v0.3.0 Deferred Issues (47 items — post-launch backlog)

47 issues deferred from the v0.3.0 launch. Listed in monolith Section 17 (lines 1468–1479).
Not enumerated individually here — see archived monolith for full list. Status: BACKLOG.

---

## v0.3.1 IFD Overlay Additions (v0.19.5 — 03/28)

v0.3.1 shipped. These items were in the brief but NOT yet delivered:

| Proposed Feature | Status |
|-----------------|--------|
| Room Join page migrated to v0.3.0 IFD | PROPOSED — still at v0.2.x base |
| Room View page migrated to v0.3.0 IFD | PROPOSED — still at v0.2.x base |
| Vault page migrated to v0.3.0 IFD | PROPOSED — still at v0.2.x base |

---

## Vault Upload Beta in Main SG/Send UI (04/16 — doc 281)

Integrate vault-push mode into the main upload wizard as a beta feature. User can choose
"Send to vault" as a delivery mode. PROPOSED.

---

## `<sg-vault-picker>` Component (04/19 — doc 297)

~~PROPOSED~~ → **EXISTS as of v0.3.2** (committed 07–08 May). See `ui/index.md` v0.3.2 section.
The component shipped in `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.2/_common/js/components/sg-vault-picker/`.

---

## Pure View Mode (04/13 — docs 259 + 261)

Minimal view mode: strips all UI chrome, shows only the file content. For embedding in
iframes or sharing as a "clean view" link. PROPOSED.

---

## Embeddable Components in `_page.json` (04/13 — doc 259)

Allow `_page.json` to reference embeddable components (charts, interactive widgets, video
players) that render inline in the browse/view modes. PROPOSED.

*Full source: `../v0.16.26__what-exists-today.md` Sections 16–17, 29–30 (lines 1210–1551, 2720–2830)*

---

## Vault Demo Capabilities (05/16 brief — doc 417)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-128 | Read-only vault opening polish: visual indicator, mobile-responsive rendering, "make this your own" CTA | doc 417 |
| P-129 | Cross-vault navigation defaults: new tab for cross-vault links, same tab for intra-vault anchors; share-token carry | doc 417 |
| P-130 | Session-scoped client-side state shim over JS API: in-memory map of path overrides; read checks session first; writes to session only (no vault commits); survives in-vault nav; discards on refresh/tab-close | doc 417 |
| P-131 | Session reset capability: clear all session-scoped changes within a tab without reloading | doc 417 |

## Vault Testing Framework (05/16 brief — doc 418)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-132 | Four-layer vault testing framework (unit/integration/QA/browser-automation) using same JS API as production | doc 418 |
| P-133 | Vitest as unit/integration test runner; Playwright for browser-automation layer | doc 418 |
| P-134 | Unified test definition format: single file, `layer` option (`'unit'`/`'integration'`/`'qa'`/`'browser'`) routes to correct environment | doc 418 |
| P-135 | Integration/QA test contexts: fixture vaults in known state; session-scoped mutations for QA; reset between tests | doc 418 |

## Accountant Demo (05/16 brief — doc 421)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-144 | Accountant demo: four-pane UI (Actions / Accountant view / Client view / Narrative); 12-step orchestrated workflow; real EC2 + DNS + vault per session | doc 421 |
| P-145 | Same-vault two-apps pattern: role-aware vault app with `/accountant` and `/client` routes from same vault | doc 421 |
| P-146 | Demo FastAPI orchestration service: sessions, setup, step-N, teardown API; holds credentials; idempotent | doc 421 |
| P-147 | Auto-teardown for demo sessions: idle timeout 15-20 minutes; explicit teardown button; no orphan resources | doc 421 |
| P-148 | Pre-provisioned shared demo environment mode (instant-start alternative for public-facing demos) | doc 421 |

---

## Vault Chat Architecture (05/26 briefs — docs 505–506)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-263 | Vault Chat — LLM chat as a null-origin app iframe over the `window.sg` bridge; sibling to Vault App; context layers inspector (vault/VFS/attachments/history); tool-execution control (auto/ask/controlled); history-as-manipulable-files; end-of-chat zip-to-vault | docs 505–506 |
| P-264 | VFS (Virtual File System) — client-side in-memory FS within the chat iframe; distinct from vault FS; every message/response stored as VFS file; optional VFS-vault sync (writes via `sg.vfs.write`; version-controlled history); self-pruning tool (LLM consolidates to VFS, drops stale live context) | doc 505 |
| P-265 | Commit Queue — timer-windowed batch commits on vault-shell; configurable window (0=off, 10-15s default); staging area showing pending files; debug panel tab; solves many-files explosion from Vault Chat VFS sync (one-write-per-commit → unbearable) | doc 509 |
| P-266 | Sidecar LLMs — parallel LLM instances for memory curation, extraction, history maintenance, prompt-injection security checks, consolidation; enable/disable per type; multi-LLM consensus mode (ask several, consolidate one answer) | doc 506 |

---

## Demo Vaults (05/26 briefs — docs 510–511)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-267 | Security Report vault demo — simulated pen test findings delivered as a vault; audience-specific Vault App views per persona (decision-maker/financial/roadmap/risk/AppSec/DevOps/CEO); evidence graph (findings linked to payloads, screenshots, logs); positive scorecard (industry gap); retest scripts; simulated exports to Splunk/Jira/GitHub/risk registers | doc 510 |
| P-268 | VC Confidential Data vault demo — 6 VC scenarios (inbound data room, investment memo, deal folder, IC/board materials, LP reporting, fund raise); demonstrates read+write loop, audience-specific views, controlled distribution with preview cards; scoped to EXCLUDE ViV for initial demo | doc 511 |
