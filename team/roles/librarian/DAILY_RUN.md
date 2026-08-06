# Librarian Daily Run

**What this file is:** The daily playbook for Librarian sessions. Also serves as the persistent
"important but not urgent" task queue — work the Librarian does when no urgent briefs are waiting.

Start every session by reading this file. End every session by updating it.

---

## Standard Routine (Every Session)

1. **Pull from dev** — `git fetch origin dev && git merge origin/dev`
2. **Read this file** — check BACKLOG and ACTIVE TASKS before doing anything else
3. **Check for new briefs** — scan `team/humans/dinis_cruz/briefs/04/[today]/` (and any missed dates)
4. **If new briefs exist:**
   - Process each (read fully, extract theme, SHIPPED vs PROPOSED, new endpoints/components)
   - Write/update the relevant **domain index file** in `team/roles/librarian/reality/`
   - Append a pointer entry to `team/roles/librarian/reality/changelog.md`
   - Produce master index at `team/roles/librarian/reviews/MM/DD/{version}__master-index__{description}.md`
   - Produce debrief at `team/humans/dinis_cruz/debriefs/MM/DD/` if significant deliverables
5. **If no new briefs:**
   - Scan `origin/dev` for commits since last session
   - Update the relevant domain index file for any shipped code
   - Append a pointer entry to `changelog.md`
   - Pick **one task** from the BACKLOG below and work it
6. **Commit and push** — every session ends with a push to the feature branch

---

## Reality Document System

The reality document is now a **domain tree** at `team/roles/librarian/reality/`.

**Entry point:** `reality/index.md` — master table linking all 13 domains.

**When processing a brief or commit:**
- Identify which domain(s) it affects (see domain map in `reality/index.md`)
- Edit the relevant domain's `index.md` (or sub-file if one exists)
- If a domain file exceeds ~300 lines → split it (create a sub-file, link from index)
- Never let files grow large — the fractal principle: split before it hurts

**Domain directories:**

| Domain | Covers |
|--------|--------|
| `send-api/` | User Lambda: send.sgraph.ai HTTP endpoints |
| `admin-api/` | Admin Lambda: auth-protected endpoints |
| `vault/` | Vault/SGit crypto + storage layer |
| `cli/` | sgit CLI (PyPI: sgit-ai) |
| `website/` | sgraph.ai website (5 pages, web components) |
| `ui/` | Three browser UIs (user, admin, workspace) |
| `tools/` | tools.sgraph.ai (Video Recorder, YouTube Editor, etc.) |
| `infra/` | Deployment, CI/CD, Lambda, Docker, AWS |
| `security/` | Security properties, violations, AppSec |
| `identity/` | Credentials, OAuth, billing (mostly PROPOSED) |
| `ai-agents/` | Agentic workflows, LLM components, Claude integration |
| `qa/` | Tests that pass, QA infrastructure |
| `alchemist/` | Investor materials, Alchemist system |

**Proposed items:** Each domain has a `proposed/` subdirectory. PROPOSED features live next
to the domain they extend — not in a central mega-file. When `proposed/index.md` exceeds
~300 lines, split it into topic files (e.g., `proposed/vault-architecture.md`).

---

## BACKLOG (Important But Not Urgent)

Work these when no urgent brief processing is needed. Pick **one per session**.

### B-001 · Reality — Extract vault PROPOSED content into domain files
**Status:** DONE (2026-06-30)
**What:** `vault/proposed/index.md` currently summarises the PROPOSED items. Expand into
individual topic files: `structure-key-split.md`, `vault-architecture.md`, `vault-hub.md`,
`vault-browser-ui.md`, `pki-modes.md`, `multi-remote.md`. Source: archived monolith
`reality/v0.16.26__what-exists-today.md` sections 16 (vault subsections), 17 (CLI extensions),
19 (ephemeral vault), and the remainder across sections 20–32.
**Why:** Vault is the largest PROPOSED domain. Agents asking vault questions should not load a
generic proposed index — they should get a targeted file.

**Outcome:** Split 244-line monolith into six topic files: `vault-architecture.md`
(overhaul + PKI + multi-remote + collab), `vault-platform.md` (hub + publishing + GitHub-as-vault
+ manager vaults + operational substrate), `vault-ux.md` (browser UI + web components + demo
+ testing framework), `vault-sub-vaults.md` (P-159–P-165), `vault-previews.md` (P-153–P-158,
P-166–P-177, P-281–P-282, P-284), `vault-content.md` (P-248–P-249). The 244-line monolith is
now a ~65-line TOC index. All P-numbers preserved. P-159–P-163 and P-174 are now EXISTS in
ui/index.md; P-166–P-177 largely EXISTS in ui/index.md — both flagged in topic files.

### B-002 · Reality — Extract tools PROPOSED content into domain files
**Status:** DONE (2026-07-20)
**What:** Expand `tools/proposed/index.md` into topic files: `video-editing.md`,
`wasm-tools.md`, `audio-tools.md`, `playbooklm.md`, `browser-video.md`. Source: archived
monolith sections 17 (video editor expansion), 22 (WASM), 23 (audio/video), 24–28 (various
tools proposals).
**Why:** Tools PROPOSED is the second-largest domain. Topic files make it navigable.

**Outcome:** Split 183-line mixed-content index into four topic files (groupings evolved
from original spec to match actual content): `video-editing.md` (sg-tree + Video Editor
Expansion + video crop/overlay/capture/playback/generation), `wasm-tools.md` (sg-wasm
lifecycle + sg-audio-transcription Whisper + Pyodide sandbox + sg-public-viewer),
`llm-components.md` (sg-llm component family + Agentic LLM suite + One-Shot IDE +
Composite Tools + Infographic v0.1.1 + Infographic v2 + News Report Tool),
`platform-tools.md` (Infrastructure/IFD + Social Previews + Audio tool distribution
P-229–237 + TUI API P-202–203 + SG/Edge TUI P-200–201 + SG Labs Admin P-196 + SG Mail
P-175–182 + Backup P-183–189). The 183-line index is now a ~45-line TOC with a
P-number inventory table. All P-numbers preserved in topic files.

### B-003 · Reality — Extract ai-agents PROPOSED content into domain files
**Status:** DONE (2026-06-28)
**What:** Expand `ai-agents/proposed/index.md` into topic files: `llm-components.md`,
`workflows.md`, `agent-communication.md`, `task-system.md`, `code-pipeline.md`. Source:
archived monolith sections 16 (agent communication), 19 (one-shot LLM, scheduled tasks),
20 (feedback loop, multi-agent chat), 22–28 (various agentic proposals), 31 (task components).
**Why:** Agentic work is growing fast. Individual topic files are needed.

**Outcome:** Split into five topic files (different names from spec, matching actual content
growth): `llm-components.md`, `agent-communication.md`, `workflows.md`, `skills-economy.md`,
`risk-mandate.md`. The skills-economy and risk-mandate files cover large post-spec June briefs.
The 408-line monolith is now a ~65-line TOC index. All P-numbers preserved. Pre-existing
P-numbering discrepancy (P-404–P-410 range) documented in risk-mandate.md but not resolved.

### B-004 · Reality — Extract infra PROPOSED content into domain files
**Status:** DONE (2026-07-14)
**What:** Expand `infra/proposed/index.md` into: `ami-marketplace.md`, `ephemeral.md`,
`observability.md`, `playwright-service.md`. Source: archived monolith sections 16
(deploy infra), 17 (browser automation), 23 (Playwright API), 24 (QA infra), 26 (Playwright
architecture), 27 (ephemeral infra), 31 (ephemeral vault infrastructure, VNC streaming).

**Outcome:** The 267-line index was split into three topic files (topic groupings evolved from
original spec to match actual content growth): `vault-hosting.md` (vault hosting modes,
Fargate, container hosts, instance sizing, serverless, multi-cloud, on-demand provisioning,
DNS labs, MyFeeds — docs 384, 385, 389, 399, 401, 403, 424, 425, 428, 429, 437),
`firecracker.md` (microVM substrate, 9 items — docs 408, 411, 412), `relay-and-storage.md`
(SG/Relay P-337–P-346, S3 CLI, IAM graph, S3-compatible container — docs 400, 402, 06/16 pack,
06/23 brief). Index is now a ~130-line TOC + 9 small retained sections. All P-numbers and
source references preserved.

### B-005 · Reality — Extract identity PROPOSED content into domain files
**Status:** DONE (2026-07-21)
**What:** Expand `identity/proposed/index.md` into: `google-oauth.md`, `billing-credits.md`,
`openrouter.md`. Source: archived monolith sections 16 (revenue + LLM features), 23
(per-user vaults, credit experiment, OpenRouter), 28 (auth MVP), 31 (Google app:data, secrets
manager, credits tool).

**Outcome:** Split 182-line mixed-content index into four topic files (four groupings vs original
three — email content warranted its own file): `google-oauth.md` (OAuth + Social Login + Secrets
Management + P-314 PKI Identity Envelopes + P-322–P-336 NHI 2.0 Agent Identity Platform, 20+
items), `billing-credits.md` (Per-User Vaults/Credits + Billing Automation + Free Tier +
Pre-Auth/Micropayments + Dynamic Credential Delivery + USDC/Agentic Commerce, 26 items),
`openrouter.md` (P-299 LLM API Billing Broker + P-385/P-386/P-388 OpenRouter Platform
Expansion), `email.md` (Email + Outreach + P-165–P-170 SG Mail Email Client). The 182-line
index is now a ~60-line TOC with a P-number inventory table. All P-numbers preserved in topic
files. Non-P-numbered items noted with doc references.

### B-006 · Health scan — Check broken relative links across team/ and library/
**Status:** DONE (2026-07-17)
**What:** Walk all `.md` files under `team/` and `library/`, extract relative links, verify
each resolves to a real file. Report broken links in a health scan review file.
**Why:** Link rot accumulates silently. Last full scan: unknown.

**Outcome:** 150+ files scanned. 19 broken links found — 9 fixed (depth-off-by-one in 5 files under `team/comms/changelog/05/09/` and `team/comms/briefs/05/12/`; all were one `../` short due to being 5 levels deep in `team/comms/`). 10 unfixable: `library/guides/agentic-setup/v0_4_0__role-ecosystem-guide.md` declares 9 companion Issues-FS files that were never imported into the directory. Added B-011 for that. All critical operating docs (reality tree, ROLE.md, DAILY_RUN.md, QA_START_HERE.md, all recent debriefs) are clean.

Health scan report: `team/roles/librarian/reviews/07/17/v0.33.43__librarian-review__b006-broken-link-health-scan.md`

### B-011 · Import or stub missing Issues-FS companion documents
**Status:** DONE (2026-07-31)
**What:** `library/guides/agentic-setup/v0_4_0__role-ecosystem-guide.md` declares 9 companion Issues-FS documents in its "Depends On" / "See Also" sections that don't exist in the repo (e.g. `v0_4_0__issues-fs__librarian-role.md`, `v0_4_0__issues-fs__thinking-in-graphs.md`). Same for one link in `v0.1.0__role-based-coordination.md`. The files may exist in an external vault or the Issues-FS system, or may never have been authored.
**Why:** 10 dead links in key agentic-workflow guides. The role-ecosystem-guide is a likely starting point for new agents; broken "See Also" links erode trust.

**Outcome:** 2 links had wrong filenames and were corrected to the actual files in the directory (`v0.1.0__role-based-coordination.md` and `v0.1.0__role-architecture-framework.md`). 7 documents are genuinely not in the repo — all annotated with *(not in repo — `<expected-filename>`)* so future agents can import them if/when they become available. The `v0.1.0__role-based-coordination.md` broken reference also annotated. All backlog tasks are now complete.

### B-007 · QA_START_HERE.md — Update to reflect v0.3.1 + post-April state
**Status:** DONE (2026-05-19)
**What:** `team/comms/QA_START_HERE.md` was last updated 30 March 2026 (v0.3.1 launch).
Updated to reflect v0.4.0 share + open trees, v0.2.3 vault UI, current changelog pointers,
`data-testid` preservation note, and structure key encryption split warning.
**Why:** QA team reads this first. Stale landing page erodes trust.

### B-008 · ROLE.md — Verify all key references still resolve
**Status:** DONE (2026-05-25)
**What:** Read `team/roles/librarian/ROLE.md` and check every linked file still exists at
the stated path. The `reality/v0.16.26__what-exists-today.md` reference needs updating to
point to `reality/index.md` instead.
**Why:** ROLE.md is the agent's first read — broken references there are high-impact.

**Outcome:** One broken reference found and fixed:
- `library/docs/_to_process/01-project-brief.md` → does not exist
- Actual file: `library/docs/_to_process/project - Secure Send Service brief.md`
- Fixed in ROLE.md Key References table
- Note: CLAUDE.md still references `01-project-brief.md` (the project-wide instructions) — this
  is a separate document that the Conductor or human owner should update if desired. Not changed
  here as CLAUDE.md governs all agents and requires Conductor approval.
- All other 9 key references confirmed valid.

### B-009 · library/docs/specs/README.md — Staleness audit
**Status:** DONE (2026-07-16)
**What:** Check whether `library/docs/specs/README.md` reflects current spec documents.
Compare against actual files in `library/docs/specs/`. Update any missing or renamed entries.

**Outcome:** All 6 original spec files verified present at expected paths. Discovered unlisted
`v0.1.1/` subdirectory with 3 agent briefing documents (Claude Code brief, OpenAI Codex brief,
dev-environment-workflows). Added second table to README documenting these 3 documents as "Agent
Briefing Documents (v0.1.1)". Key Decisions section reviewed — all 9 decisions still accurate.
No renames or missing files.

### B-010 · Activity log — Bring activity-log.md current
**Status:** DONE (2026-05-04)
**What:** `team/roles/librarian/activity-log.md` was last updated 2026-03-18. Add entries for
all sessions since then (04/01 through 04/28). Each entry: date, version, review link,
one-line description.
**Why:** The activity log is the Librarian's session continuity record.

---

## ACTIVE TASKS

*(Move tasks here from BACKLOG when starting them; remove when complete.)*

None currently active.

---

## COMPLETED (Recent)

| Date | Task | Outcome |
|------|------|---------|
| 2026-04-28 | Create DAILY_RUN.md | This file — daily playbook + backlog established |
| 2026-04-28 | Reality document refactoring plan | 13-domain fractal tree designed; domain index files created |
| 2026-05-19 | No new briefs; code scan 14–15 May; B-007 | v0.4.0 Share + Open UI trees folded into reality doc; Vault UI v0.2.3 additions; QA_START_HERE.md updated |
| 2026-05-25 | No new briefs; code scan 24–25 May; B-008 | vault UI app.json resource injection documented; E2E test alignment noted; ROLE.md broken link fixed (project brief path) |
| 2026-05-04 | No new briefs; backlog B-010 | Activity log updated: 33 entries added covering 04/01–05/04 |
| 2026-05-03 | Process 04/29 late batch (4 briefs) | Docs 333–336 catalogued; infra/proposed + cli/proposed updated; master index, architect review, dev review, debrief produced |
| 2026-06-28 | No new briefs; backlog B-003 | ai-agents/proposed 408-line monolith split into 5 topic files (llm-components, agent-communication, workflows, skills-economy, risk-mandate); TOC index; changelog + DAILY_RUN updated |
| 2026-06-29 | Process 18 briefs from 06/24 (addendum) + 06/26 (new batch) | 12 new PROPOSED items (P-411–P-422); risk register architecture, digital twins, 22-node/35-edge ontology, directed-edge query engine, 2FA MVP build plan; Calendly as first RiskMandate review; healthcare data-protection pattern (P-412 in security/proposed); Architect + Dev reviews produced; reality doc + index + changelog updated |
| 2026-07-01 | No new briefs; code scan 30 June | 2 EXISTS items: SGSend static-host mode (12 tests, HOSTING-ON-STATIC-STORAGE.md guide); `_buildVfsBridgeScript` bare-call fix (9-assertion regression guard). vault/index.md date errors corrected. qa/index.md, index.md, changelog.md updated. B-002 tools PROPOSED at 182 lines — no split needed yet. |
| 2026-07-17 | No new briefs; no new dev commits; B-006 | 150+ files scanned for broken links. 9 depth-off-by-one links fixed in team/comms/ (changelog/05/09 ×5, briefs/05/12 ×4). 10 unfixable missing companion docs in library/guides/agentic-setup/. B-011 added. Health scan report produced. |
| 2026-07-16 | No new briefs; no new dev commits; B-009 | library/docs/specs/README.md audited: all 6 spec files valid. 3 unlisted files found in v0.1.1/ subdir. README updated with Agent Briefing Documents table. changelog.md + DAILY_RUN.md updated. |
| 2026-07-21 | No new briefs; no new dev commits; B-005 | identity/proposed/index.md (182 lines) split into 4 topic files: google-oauth.md, billing-credits.md, openrouter.md, email.md. Index now ~60-line TOC. All P-numbers preserved. changelog.md + DAILY_RUN.md updated. |
| 2026-07-14 | No new briefs; no new dev commits; B-004 | infra/proposed/index.md (267 lines) split into 3 topic files: vault-hosting.md, firecracker.md, relay-and-storage.md. Index now ~130-line TOC + 9 small sections. All P-numbers preserved. changelog.md + DAILY_RUN.md updated. |
| 2026-07-31 | No new briefs; CI version bump only; B-011 | 2 wrong-filename links fixed in role-ecosystem-guide (role-based-coordination, role-architecture-framework). 7 missing companion docs annotated *(not in repo)*. 1 missing link fixed in role-based-coordination. All 11 backlog tasks now DONE. |
| 2026-08-04 | No new briefs; send-browse file split documented; test count updated to ~2800+ | send-browse--v0.3.3.js split into 4 files catalogued in ui/index.md; qa/index.md updated to ~2800+; base64 chunk open item marked FIXED (commit 1089596); 5 reality files updated; master index + debrief produced |
| 2026-08-06 | No new briefs; 4 post-daily-check code changes from 08/04 catalogued | 7 new EXISTS items (image paste, sg.llm.imagePart, SGVision, ledger fix, auto-sync data-loss fix, claude-sonnet-5 default, picker notice); test count ~2800+ → ~2945+ (+144); reality/index.md + ui/index.md + changelog updated; master index + debrief produced |

---

## Notes for the Librarian

- **One backlog task per session.** Do not try to clear the whole backlog at once.
- **Update this file at session end.** Move completed tasks to the COMPLETED table.
  Adjust task descriptions if what you found differed from what was expected.
- **Add tasks freely.** When you notice something that needs fixing but isn't urgent,
  add it to the BACKLOG. Number sequentially (B-011, B-012, ...).
- **Never skip the routine.** Even on "no brief" days, the routine produces value
  (dev scan, changelog entry, one backlog task).
