# Reality — Changelog

**Format:** `Date | Domain file(s) updated | One-line description`

This is a pointer log, not a content log. For full delta detail, see the master index for
that date in `team/roles/librarian/reviews/MM/DD/`.

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
