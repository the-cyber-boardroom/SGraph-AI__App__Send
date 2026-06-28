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
**Status:** QUEUED
**What:** `vault/proposed/index.md` currently summarises the PROPOSED items. Expand into
individual topic files: `structure-key-split.md`, `vault-architecture.md`, `vault-hub.md`,
`vault-browser-ui.md`, `pki-modes.md`, `multi-remote.md`. Source: archived monolith
`reality/v0.16.26__what-exists-today.md` sections 16 (vault subsections), 17 (CLI extensions),
19 (ephemeral vault), and the remainder across sections 20–32.
**Why:** Vault is the largest PROPOSED domain. Agents asking vault questions should not load a
generic proposed index — they should get a targeted file.

### B-002 · Reality — Extract tools PROPOSED content into domain files
**Status:** QUEUED
**What:** Expand `tools/proposed/index.md` into topic files: `video-editing.md`,
`wasm-tools.md`, `audio-tools.md`, `playbooklm.md`, `browser-video.md`. Source: archived
monolith sections 17 (video editor expansion), 22 (WASM), 23 (audio/video), 24–28 (various
tools proposals).
**Why:** Tools PROPOSED is the second-largest domain. Topic files make it navigable.

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
**Status:** QUEUED
**What:** Expand `infra/proposed/index.md` into: `ami-marketplace.md`, `ephemeral.md`,
`observability.md`, `playwright-service.md`. Source: archived monolith sections 16
(deploy infra), 17 (browser automation), 23 (Playwright API), 24 (QA infra), 26 (Playwright
architecture), 27 (ephemeral infra), 31 (ephemeral vault infrastructure, VNC streaming).

### B-005 · Reality — Extract identity PROPOSED content into domain files
**Status:** QUEUED
**What:** Expand `identity/proposed/index.md` into: `google-oauth.md`, `billing-credits.md`,
`openrouter.md`. Source: archived monolith sections 16 (revenue + LLM features), 23
(per-user vaults, credit experiment, OpenRouter), 28 (auth MVP), 31 (Google app:data, secrets
manager, credits tool).

### B-006 · Health scan — Check broken relative links across team/ and library/
**Status:** QUEUED
**What:** Walk all `.md` files under `team/` and `library/`, extract relative links, verify
each resolves to a real file. Report broken links in a health scan review file.
**Why:** Link rot accumulates silently. Last full scan: unknown.

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
**Status:** QUEUED
**What:** Check whether `library/docs/specs/README.md` reflects current spec documents.
Compare against actual files in `library/docs/specs/`. Update any missing or renamed entries.

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

---

## Notes for the Librarian

- **One backlog task per session.** Do not try to clear the whole backlog at once.
- **Update this file at session end.** Move completed tasks to the COMPLETED table.
  Adjust task descriptions if what you found differed from what was expected.
- **Add tasks freely.** When you notice something that needs fixing but isn't urgent,
  add it to the BACKLOG. Number sequentially (B-011, B-012, ...).
- **Never skip the routine.** Even on "no brief" days, the routine produces value
  (dev scan, changelog entry, one backlog task).
