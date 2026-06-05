# Reality — Changelog

**Format:** `Date | Domain file(s) updated | One-line description`

This is a pointer log, not a content log. For full delta detail, see the master index for
that date in `team/roles/librarian/reviews/MM/DD/`.

---

## 2026-06-05

Code-change-only session: 0 new briefs; 4 commits since the 06/04 session (`57edba8`, `e365c60`, `2539220`, `33dc551`).

- `security/index.md` — Added "Vault Inbox Hardening" section: B-1 S3 silent-empty fix; B-2 path traversal closed via `Safe_Str__Vault__Append_Token` + `Safe_Str__Vault__Inbox__File_Id`; I-1/2/3 perf/DoS mitigations; batch cap 100 file_ids (commit `e365c60`)
- `send-api/index.md` — Vault inbox section updated: hardening note, Safe_Str schemas, revised test count
- `qa/index.md` — Test count updated to 957 Python (confirmed via commit `e365c60`); total ~1556+ with JS suites
- `index.md` — Version v0.32.2 → v0.32.3; last updated 06/04 → 06/05; unit tests ~1358+ → ~1556+

Master index (06/05): `team/roles/librarian/reviews/06/05/v0.32.3__master-index__no-new-briefs-05-june.md`
Processed: 0 new human briefs | New EXISTS items: Safe_Str vault inbox primitives, S3 folder__folders fix | New PROPOSED items: 0

---

## 2026-06-04 *(retroactive — omitted from prior session)*

- `index.md` — Version v0.31.18 → v0.32.2; date 06/03 → 06/04; docs 546 → 567; PROPOSED 416+ → 433+ (P-300–P-316); vault inbox EXISTS (+6 endpoints, +101 tests); unit tests ~1257+ → ~1358+
- `send-api/index.md` — Vault inbox endpoints section added (6 endpoints, 101 tests, commit `9d727b5`)
- `ai-agents/proposed/index.md` — P-300, P-301, P-303, P-304, P-305, P-312, P-315, P-316 added
- `vault/proposed/index.md` — P-302, P-307, P-311, P-313 added
- `identity/proposed/index.md` — P-314 added
- `alchemist/index.md` — P-309, P-310 added
- `website/proposed/index.md` — P-306, P-308 added

Master index (06/04): `team/roles/librarian/reviews/06/04/v0.32.2__master-index__briefs-02-to-03-june.md`
Processed: 21 new human briefs (06/02 × 12, 06/03 × 9) | New EXISTS items: 6 vault inbox endpoints | New PROPOSED items: 17 (P-300–P-316)

---

## 2026-06-03

Second librarian session on the same briefs (first was 06/02, ref `team/roles/librarian/reviews/06/02/`). This session produced more detailed architect/dev reviews and a debrief; the reality document updates were carried forward from the 06/02 session (canonical P-numbers). Index date updated to 06/03.

- `index.md` — Date updated 06/02 → 06/03 (second session); all other stats from 06/02 session retained
- `vault/proposed/index.md` — Added P-281 (vault-per-standard pipeline), P-282 (public preview + embedded RO key), P-284 (vulnerability debriefs as vault artefacts); already carried from 06/02 session

Master index (06/03 session): `team/roles/librarian/reviews/06/03/v0.31.18__master-index__briefs-30-may-to-01-june.md`
Architect review: `team/roles/architect/reviews/06/03/v0.31.18__architect-review__briefs-30-may-to-01-june.md`
Dev review: `team/roles/dev/reviews/06/03/v0.31.18__dev-review__briefs-30-may-to-01-june.md`

## 2026-06-02

- `index.md` — Updated: version v0.31.15 → v0.31.18; date 06/01 → 06/02; PROPOSED 397+ → 416+ (P-281–P-299 canonical); total docs 524 → 546 (22 new human briefs from 05/30, 05/31, 06/01)
- `vault/proposed/index.md` — Added P-281 (vault-per-standard pipeline), P-282 (public preview + embedded RO key), P-284 (vulnerability debriefs); last updated 05/25 → 06/02
- `ai-agents/proposed/index.md` — Added P-283 (library as shop front + FS email), P-286 (per-page semantic graphs), P-288–P-299 (Netlify, Daytona, Convex, Pi, HeyGen, Tavon, skills graph, base vaults, creator economy, marketplace, comparison, OpenRouter broker); last updated 05/21 → 06/02
- `website/proposed/index.md` — Added P-283 (library as shop front), P-285 (agent-controlled website + vault CI), P-286 (per-page semantic graphs), P-287 (industry use-case pages); last updated 05/17 → 06/02
- `identity/proposed/index.md` — Added P-299 (OpenRouter key/credit/billing broker service); last updated (previous) → 06/02

Master index (06/02 session): `team/roles/librarian/reviews/06/02/v0.31.18__master-index__briefs-30-31-may-01-june.md`
Processed: 22 new human briefs (05/30 ×5, 05/31 ×4, 06/01 ×13) | New PROPOSED: 19 (P-281–P-299 canonical)

---

## 2026-06-01

- `index.md` — Updated: version v0.31.12 → v0.31.15; date 05/31 → 06/01; unit tests ~1240+ → ~1257+; PROPOSED 395+ → 397+ (P-279–P-280)
- `ui/index.md` — Added: deep-link HTML fix (CSS/JS loading in `/en-gb/app/#deep-link`); AppNavHelpers test count 35→47; last updated 05/31 → 06/01
- `qa/index.md` — Added: browser integration harness (5 pytest functions, 4 files, Python+Playwright+sgit-ai); test count ~1139+ → ~1257+; last updated 05/30 → 06/01
- `security/index.md` — Added: SEC-VIV-002 (popup capability over-grant to inner vaults — OPEN, Medium); last updated 05/29 → 06/01
- `infra/index.md` — Added: `_test-ui-vault.yml` reusable vault UI test workflow (4-job pipeline); `test:vault-browser-integration` npm script; last updated 05/13 → 06/01
- `ui/proposed/index.md` — Added P-279 (kernel path unification) + P-280 (popup gate fix); last updated 05/31 → 06/01

Master index: `team/roles/librarian/reviews/06/01/v0.31.15__master-index__no-new-briefs-code-31-may.md`
Processed: 0 new human briefs (no June briefs yet — first day of month)
New EXISTS items: 7 (deep-link fix, AppNavHelpers 35→47, browser integration harness ×4 files, CI reusable workflow) | New PROPOSED items: 2 (P-279, P-280)

---

## 2026-05-29

- `index.md` — Updated: version v0.28.7 → v0.31.3; date 05/28 → 05/29; doc count 493 → 504; JS assertions +152; API endpoints +1 (Routes__Info__SGraph); PROPOSED 366+ → 379+
- `ui/index.md` — Added: ViV kernel modules (SecureChannel, KernelMounts, KernelBroker, KernelAppHandlers, KernelBootstrap, sg-app-stub, kernel-shell-bundle); P-250 through P-262; 10 bugs fixed notation
- `security/index.md` — Added: Vault App Trust Model section (SEC-VIV-001 same-origin bypass; trust assumption caveat; CORS fix); last updated 04/28 → 05/29
- `qa/index.md` — Updated: test count ~760+ → ~912+; added ViV loader suite table (152 jsdom-free assertions across 10 test files); last updated 04/28 → 05/29

Master index: `team/roles/librarian/reviews/05/29/v0.31.3__master-index__briefs-viv-28-29-may.md`
Processed: 11 new human briefs (briefs/05/vault-in-vault/version-1 × 3 + version-2 × 8)
New EXISTS items: 14 (ViV kernel modules, CORS fix, Routes__Info, Container, 152 JS tests) | New PROPOSED items: 13 (P-250–P-262)

---

## 2026-05-28

- `index.md` — Updated: version v0.27.79 → v0.28.7; date 05/26 → 05/28; doc count 488 → 493; PROPOSED 365+ → 366+; P-231 resolved to EXISTS
- `ui/index.md` — Added: Public Vault Previews (full set); Sub-Vaults Phases 1–3; App-Mode Permissions Phases 1–4B; vault header pill; sg.history.* API
- `vault/index.md` — Added: P-231 resolved EXISTS (Web UI); P-248 (sub-vaults CLI) PROPOSED

Master index: `team/roles/librarian/reviews/05/28/v0.28.7__master-index__briefs-25-may-and-code-25-27-may.md`
Processed: 5 new human briefs (briefs/05/25/)
New EXISTS items: 6 | New PROPOSED items: 2 (P-248, P-249)

---

## 2026-05-26

- `index.md` — Updated: version v0.27.61 → v0.27.79; date 05/25 → 05/26; doc count 463 → 488; PROPOSED count 341+ → 365+
- `identity/index.md` — Added: P-223 to P-226, P-230, P-233 (SG/Send tiered business model, identity-creation rule, OAuth + user-dedicated mode)
- `vault/index.md` — Added: P-227 (vault-per-user storage substrate), P-231 (vaults within vaults)
- `security/proposed/index.md` — Added: SG/Sentinel batch-2 section (P-234 to P-247): test-driving, cost attribution, UX designer role, control-flow graphs, passive mode, SGS portable spec, development workflow, surrogate dependencies, rule packs, MVA + feature flags, vault-aware logging, agent governance, interoperability, commercial model
- `ai-agents/index.md` — Added: P-240 (SG/Sentinel in development workflow), P-245 (agent governance as coherent capability)

Master index: `team/roles/librarian/reviews/05/26/v0.27.79__master-index__briefs-24-may.md`
Processed: 25 new human briefs (briefs/05/24/ — sg-send-thread + sg-sentinel-batch2 + day-wrap)
New EXISTS items: 1 (Wardley map render toolchain via Mermaid v11.14.0 + Playwright Chromium — verified) | New PROPOSED items: 24 (P-223 to P-246; note P-247 = commercial model)

---

## 2026-05-25

- `index.md` — Updated: version v0.27.60 → v0.27.61; date 05/23 → 05/25
- `ui/index.md` — Added: app.json resource injection into vault HTML preview (commit `09288b20`); E2E test alignment note for /en-gb/app routing

Master index: `team/roles/librarian/reviews/05/25/v0.27.61__master-index__code-changes-24-25-may.md`
Processed: 0 new human briefs; 1 code commit scanned (vault UI app.json resource injection + 2 E2E test files aligned)
New EXISTS items: 1 | New PROPOSED items: 0

---

## 2026-05-23

- `index.md` — Updated: version v0.27.55 → v0.27.59; date 05/22 → 05/23; Browser UIs 6 → 7 (added vault app /en-gb/app/)
- `ui/index.md` — Added: 10 new EXISTS items (SG/App hosting page, <app-shell>, <app-hud>, <app-debug-pane>, 4 debug tab components, routing changes)

Master index: `team/roles/librarian/reviews/05/23/v0.27.59__master-index__code-changes-22-23-may.md`
Processed: 0 new human briefs; 10 code commits scanned (vault UI v0.2.3 additions 22 May)
New EXISTS items: 10 | New PROPOSED items: 0

---

## 2026-05-20

- `index.md` — Updated: version v0.27.53 → v0.27.54; date 05/19 → 05/20; PROPOSED count 205+ → 237+; documents 405 → 415
- `infra/proposed/index.md` — Added: Firecracker substrate section (9 items: PoC, microVM substrate option, vault-attached compute, AI sandbox, Playwright fleet, fourth density mode, Podman default, firecracker-containerd, benchmark)
- `security/proposed/index.md` — Added: Nitro Enclaves section (12 items: three-tier key arch, server-side search, AI inference, MPC, verifiable ops, signing, confidential cred mgr, async sharing, SG-vault-enclave EIF, PCR-based KMS policy, CLI primitives, enclave-protected density tier)
- `ai-agents/proposed/index.md` — Added: Observability pipeline concrete sources (6 items) and AgentCore resell products (5 items)
- `identity/proposed/index.md` — Added: USDC and agentic commerce section (3 items: AgentCore Payments prototype, x402 receiver, USDC backend treasury)

Master index: `team/roles/librarian/reviews/05/20/v0.27.54__master-index__briefs-15-may.md`
Processed: 10 new human briefs (05/15 new files); 0 code commits scanned
New EXISTS items: 0 | New PROPOSED items: 32

---

## 2026-05-19

- `ui/index.md` — Major update: v0.4.0 Share + Open trees folded from "Recent Activity" into EXISTS; Vault UI v0.2.3 additions (App Mode loading overlay, auth re-activation, Remove from saved vaults, Open in new window); v0.2.2 iframe bug fixes folded into EXISTS; legacy v0.3.x section clearly labelled; PROPOSED cleaned (sg-vault-picker removed — now EXISTS)
- `infra/index.md` — Updated: Docker Hub CI now documents parallel matrix strategy (push-by-digest + manifest merge, commit `c21cb5c`)
- `index.md` — Updated: Browser UIs count 4→6 (share, open, admin, workspace, vault + user legacy)

Master index: `team/roles/librarian/reviews/05/19/v0.27.53__master-index__code-changes-14-15-may.md`
Processed: 0 new human briefs; code-verified 5 commits from 05/14–05/15 (v0.27.29–v0.27.45 range)
New EXISTS items: v0.4.0 Share UI, v0.4.0 Open UI, Vault UI v0.2.3 additions
New PROPOSED items: 0

---

## 2026-05-17

- `index.md` — Updated: version v0.27.18 → v0.27.52, date 05/09 → 05/17, PROPOSED count 117+ → 164+, documents 350 → 382
- `infra/proposed/index.md` — Added: SG/Compute package manager (5 items), EC2 image build CLI (2 items), publishing/subdomain infrastructure (5 items) — 12 new PROPOSED
- `vault/proposed/index.md` — Added: publishing layer (5 items), GitHub-as-vault-projection (3 items), customer workflow primitives (3 items) — 11 new PROPOSED
- `ai-agents/proposed/index.md` — Added: communication vault pattern (3 items), observable LLM orchestration tool (6 items), QA stack on SG/Compute (4 items) — 13 new PROPOSED
- `website/proposed/index.md` — Added: agentic newsroom (5 items), CV/portfolio products (5 items), Portugal publication (4 items), sg-video (1 item) — 15 new PROPOSED (note: `<sg-video>` logically belongs in ui/proposed but recorded here with publishing products)

Master index: `team/roles/librarian/reviews/05/17/v0.27.52__master-index__briefs-10-13-may.md`
Processed: 32 new human briefs (05/10–05/13); no code changes verified (aspirational/strategy batch)
New EXISTS items: 0 | New PROPOSED items: 47

---

## 2026-05-09

- `index.md` — Updated: version v0.27.4 → v0.27.18, date, browser UIs count (3→4), PROPOSED count (118+→117+)
- `ui/index.md` — Updated: latest user UI v0.3.1 → v0.3.2; added v0.3.2 section (Share a Secret, Options step, sg-vault-picker, VFS inlining, Secret tab UX); added Vault Browser UI v0.2.2 section (sg-app-banner, vault-browse-edit App Mode + HTML split-view editor + New File button)
- `ui/proposed/index.md` — `sg-vault-picker` marked EXISTS (shipped in v0.3.2)
- `infra/index.md` — Added: SnapStart boto3 lazy client fix in `Storage_FS__S3` (commit `b61a181`)

Master index: `team/roles/librarian/reviews/05/09/v0.27.18__master-index__code-changes-08-09-may.md`
Processes: 0 new human briefs; code-verified 10 version increments (v0.27.8 → v0.27.18)

---

## 2026-05-04

- No domain files updated — no new briefs or code changes
- `activity-log.md` — Backlog task B-010 complete: 33 entries added covering 04/01–05/04

Master index: `team/roles/librarian/reviews/05/04/v0.27.2__master-index__no-new-briefs-04-may.md`
Processes: no new docs (brief scan came up empty)

---

## 2026-05-03

- `index.md` — Updated: version v0.22.18 → v0.27.2, date, doc count (336), PROPOSED count (115+)
- `infra/index.md` — Added: CI note — admin lambda deploy skipped on main/prod (commits `c792383`, `a06a112`)
- `infra/proposed/index.md` — Added: 7 ephemeral infra next-phase features (AMI management, vault server, Docker containers, remote shell, Prometheus, stacks) + Firefox browser plugin (7 sub-features) — all PROPOSED
- `cli/proposed/index.md` — Added: SGit four-layer refactoring (Crypto/Core/Network/Plugins), transaction logging, step-based decomposition, feature flags for plugins — all PROPOSED; two open decisions (#29, #30) catalogued

Master index: `team/roles/librarian/reviews/05/03/v0.27.2__master-index__briefs-29-apr-late-batch.md`
Processes: docs 333–336 (04/29 late batch committed to repo on 01 May)

---

## 2026-04-28

- `index.md` — NEW: master domain index created (reality document refactored from monolith into domain tree)
- `send-api/index.md` — NEW: User Lambda domain index (26 endpoints extracted from monolith)
- `send-api/proposed/index.md` — NEW: SgSend JS API, large blob phases 2–4, four upload modes
- `admin-api/index.md` — NEW: Admin Lambda domain index (51 endpoints extracted)
- `admin-api/proposed/index.md` — NEW: backend storage restructuring, MCP rooms, vault bundle
- `vault/index.md` — NEW: vault crypto + storage domain index (key derivation, object CAS, current encryption state)
- `vault/proposed/index.md` — NEW: vault proposed items overview (9 themes)
- `vault/proposed/structure-key-split.md` — NEW: 04/28 architect review content (docs 323–324, four-team change)
- `cli/index.md` — NEW: sgit CLI domain index (20+ commands, verified integrations)
- `cli/proposed/index.md` — NEW: delta-share fallback, CLI extensions, MCP transport
- `website/index.md` — NEW: sgraph.ai website domain index (21 pages, 11 components, CI)
- `website/proposed/index.md` — NEW: website repo extraction (BLOCKED), redesign themes
- `ui/index.md` — NEW: three browser UIs domain index (user v0.3.1, admin v0.1.7, workspace v0.1.0)
- `ui/proposed/index.md` — NEW: upload UX redesign, gallery editor, vault upload beta
- `tools/index.md` — NEW: tools.sgraph.ai domain index (4 live tools)
- `tools/proposed/index.md` — NEW: video editing tools, WASM tools, PlaybookLM
- `infra/index.md` — NEW: infrastructure domain index (7 targets, CI/CD, Docker)
- `infra/proposed/index.md` — NEW: AMI marketplace, ephemeral infra, Playwright service
- `security/index.md` — NEW: security properties + violations domain index
- `security/proposed/index.md` — NEW: security monitoring proposals
- `identity/index.md` — NEW: identity domain index (token auth exists; OAuth/billing PROPOSED)
- `identity/proposed/index.md` — NEW: Google OAuth, billing credits, OpenRouter
- `ai-agents/index.md` — NEW: agentic workflows domain index (MCP + Claude vault access verified)
- `ai-agents/proposed/index.md` — NEW: LLM components, workflow automation, task system
- `qa/index.md` — NEW: QA domain index (~602 tests passing)
- `qa/proposed/index.md` — NEW: browser automation, Playwright service, evidence packs
- `alchemist/index.md` — NEW: Alchemist/investor materials domain index
- `alchemist/proposed/index.md` — NEW: investor site proposals
- `team/roles/librarian/DAILY_RUN.md` — NEW: daily Librarian playbook + important-but-not-urgent task backlog (B-001 through B-010)

Master index: `team/roles/librarian/reviews/04/28/v0.22.18__master-index__briefs-28-apr.md`

---

## 2026-04-27

- No domain files updated (quiescent day, no new briefs or code)

Master index: `team/roles/librarian/reviews/04/27/v0.22.17__master-index__briefs-27-apr.md`

---

## 2026-04-26

- No domain files updated (no new briefs; website repo extraction dev pack catalogued)

Master index: `team/roles/librarian/reviews/04/26/v0.22.17__master-index__briefs-26-apr.md`

---

## 2026-04-25

- No domain files yet (pre-split monolith was updated instead)
- `v0.16.26__what-exists-today.md` — 11 docs from 04/21 catalogued (docs 312–322); Section 31 added (31 PROPOSED items)

Master index: `team/roles/librarian/reviews/04/25/v0.22.17__master-index__briefs-21-apr.md`

---

## 2026-04-24

- `v0.16.26__what-exists-today.md` — sg-site-header v1.0.4–v1.0.6, 10 homepage components, jsUrl fix

Master index: `team/roles/librarian/reviews/04/24/v0.22.6__master-index__code-delivery-23-24-apr.md`

---

*For older history, see the archived monolith `v0.16.26__what-exists-today.md` — "Changes Since" sections cover 02/26 through 04/28.*
