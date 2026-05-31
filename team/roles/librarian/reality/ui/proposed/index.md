# ui/proposed — Index

**Domain:** `ui/` | **Last updated:** 2026-05-31
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

---

## External Data Connectors (05/29 briefs — docs 513–518)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-269 | External Data Connector Framework — new link-type category on existing vault link infrastructure; two viability tests (browser CORS + OAuth); custom viewers (not framing, which most services block); CRUD primitives abstraction (create/read/edit/delete — tree view is backend-agnostic); two integration levels: connector's own viewer OR tree-abstraction (vault asks iframe for structure and renders in vault tree); adoption by augmentation | docs 513, 515, 517 |
| P-270 | Google Drive Connector — first connector; `drive.file` scope + Google Picker API (least-privilege: app sees only the folder user selects); custom Drive viewer (not a frame of Drive — Drive blocks framing); folder ID + config stored in vault (data stays in Drive); data broker iframe (P-271) holds OAuth; sharing: Drive-side share + vault-side reference per user | doc 514 |
| P-271 | Data Broker Iframe — architectural fix for OAuth in null-origin iframes (null-origin frames cannot receive OAuth redirects); broker is a separate iframe with one responsibility: hold tokens + make all API calls; UI app renders and asks, never touches credentials; top-level kernel (has an origin) receives OAuth redirect and relays it PKI-encrypted to broker's public key; supports running as web worker (more isolation) or off-machine proxy (for CORS-blocking providers like Notion) | doc 516 |
| P-272 | GitHub + OneDrive Connectors (tier-1 easy wins after Drive) — GitHub: CORS any origin, OAuth, hierarchical (orgs/repos/folders/files), developer audience; OneDrive/Microsoft Graph: CORS-friendly (use `@microsoft.graph.downloadUrl` not `/content` redirect), OAuth, hierarchical, enterprise audience; both use data broker (P-271) | doc 515 |
| P-273 | Reverse PoC: Company-Being-Reviewed Vault — demo from the company's perspective (complement to VC demo P-268); workflow: presenting (Vault App views), controlling exposure (what each party sees), tracking (who viewed what), organising (structure), currency (version control across multiple VC shares); built on solid single-vault capabilities; VIV framed as coming enhancement; single-source-of-truth-across-vaults idea parked | doc 518 |

---

## Evidence-Driven Assessment Series (05/29 briefs — docs 519–524)

All items below are PROPOSED — does not exist yet. All depend on Vault Chat (P-263) and the Visualisation Cornerstone (P-275).

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-274 | GDPR Assessment Vault — self-contained vault holding the assessment + user data; graph-based GDPR (framework as structured navigable knowledge); propose-and-confirm discovery workflow (system makes claims backed by evidence; user confirms or rebuts; minimise user input — confirm, don't answer from scratch); extracts facts/decisions/hypotheses/next-questions; vault chat (P-263) as LLM engine; OpenRouter in iframe (provided key with credits OR own key); cost-per-assessment measurement; reusable as template for other assessments (ISO 27000, security) | doc 519 |
| P-275 | Evidence-Driven Feedback Loop / Visualisation Cornerstone — Akinator + Whodunit as the proving ground (discover prompts/workflows before real assessments); three visualisation primitives: (1) semantic knowledge graph (LLM extracts elements, pure graph engine renders — NOT LLM drawing), (2) visualisation-of-visualisations (multi-graph, multi-altitude, Miro/whodunit board feel), (3) pure infographics (image models — evaluate by capability and cost); per-round budget control (discovery/analysis/visualisation budgets; closed-loop cost danger is real); version-controlled rounds (each round = vault commit; replayable; branchable); strategic compression (curated context per round) | doc 520 |
| P-276 | Evidence-Driven CV + Hiring Signals Workflow — research-first (deep-research agents discover, user confirms — not asking person to write their own CV); confirm-correct-weight loop (confirm, weight per role, relate connections); every claim anchored to stored/dated evidence in vault (HTML, screenshots — vault as own evidence archive); consistency enforces honesty (evidence graphs make exaggeration visible — inflated claims have no supporting evidence); versioned importable publishable vault app (vault-of-vaults; mini apps inside person's vault); feedback harvesting via read-only/read-write sub-vaults (reviewers see only child vault); personalised packs (one-pager to 50MB evidence pack); hiring signals: thinking/values/whole person, non-linear paths, trespasser syndrome (under-labelled transferable skills), buried nuggets, T/M technical depth | docs 521–522 |
| P-277 | Vault App Store / Hub — catalogue to share/distribute/discover vault apps (distributes P-274/P-276/P-278 and others); describe each vault (purpose, workflow); security-analyse + agent-map before import (trust layer: show what the app requests before user imports an executable vault); billing (sell vaults to developer's benefit; optionally bundle OpenRouter credits so buyer gets app + allowance to run it); multi-language/culture; zip-based distribution (a vault is a zip; clean import/version/local-load flow building on vault.create + VIV) | doc 523 |
| P-278 | Consulting Assessments — three information sources (user/consultant/research); confirmation-not-open-ended questions (assert company's posture with evidence; user confirms or rebuts; evidence-backed harshness is valid); customised graph-based standards (GDPR, ISO 27000 as graphs; leverage existing graph versions; SHARE WITH SG/Sentinel compliance-as-living-graph — cross-product capture); company-type scoping + Companies House lookup (name/number → public info → present-then-confirm); rounds/passes concept (user chooses how many; per-round: evidence→next-questions→user-provides→analyse→save; non-linear, branchable, replayable; budget = number of rounds); three delivery models: (1) self-service (private or ephemeral vault), (2) send-to-consultant, (3) consultant-driven; thesis: augment the human expert, not replace them | doc 524 |
