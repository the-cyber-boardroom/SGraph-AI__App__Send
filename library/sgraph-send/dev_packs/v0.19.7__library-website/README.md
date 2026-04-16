# Dev Pack — The Library Website
**Version:** v0.19.7 | **Date:** 02 April 2026
**Status:** Design complete. Ready for repo creation and content migration.
**Branch:** `claude/sgraph-website-planning-aZubw`

This folder is the **single source of truth** for the library.sgraph.ai project. Use it to brief any new Claude Code or Web session without hunting across the repo.

---

## TL;DR (30 seconds)

We are building a static website at **library.sgraph.ai** that serves as the centralised knowledge base for the entire SGraph agentic team.

**The problem with the current state:**
- Role definitions, skills, team structures, and Claude guidance are locked inside the SG/Send repo
- Every new session must re-discover this content by hunting across `team/roles/`, `library/`, `.claude/`
- The knowledge cannot be reused by other projects (QA, Tools, future repos)
- 326 markdown files exist; discoverability doesn't

**The solution:**
> "Every new Claude Code session clones two repos: the project repo (the code) and the library repo (the team knowledge). The library is always there. No hunting."

**What we're building:**
- A new repo `SGraph-AI__Library` with all role definitions, skills, team structures, workflows
- A static website at library.sgraph.ai (S3 + CloudFront, same stack as all SG sites)
- `<sg-markdown-viewer>` Web Component for client-side markdown rendering
- Machine-readable indexes: `index.json`, `catalogue.csv`, `reading-order.json`
- Clone-on-start pattern: every session clones library repo alongside project repo

---

## Reading Order (for a new session)

| Step | File | Purpose |
|------|------|---------|
| **Start here** | [`00_briefing-prompt.md`](00_briefing-prompt.md) | Copy-paste to start a new session |
| 1 | [`phase_1__design/01_context-and-current-state.md`](phase_1__design/01_context-and-current-state.md) | What exists now, what's scattered, what the two audiences need |
| 2 | [`phase_2__planning/02_site-structure-and-content-plan.md`](phase_2__planning/02_site-structure-and-content-plan.md) | New repo structure, site map, content migration decisions |
| 3 | [`phase_3__development/03_implementation-map.md`](phase_3__development/03_implementation-map.md) | 5-phase build plan: repo → content → website → index → deploy |
| 4 | [`phase_3__development/04_rendering-and-indexing-strategy.md`](phase_3__development/04_rendering-and-indexing-strategy.md) | Web Components, markdown pipeline, LLM-readable URLs |
| 5 | [`phase_4__qa/05_definition-of-done.md`](phase_4__qa/05_definition-of-done.md) | 9-item acceptance criteria + clone-on-start test |
| 6 | [`phase_5__release/06_launch-checklist.md`](phase_5__release/06_launch-checklist.md) | Deploy checklist + adoption plan |
| Deep dive | [`99_source-documents.md`](99_source-documents.md) | All source briefs and prior art |

---

## Folder Structure

```
v0.19.7__library-website/
  README.md                                    ← This file
  00_briefing-prompt.md                        ← Copy-paste to start a new session
  phase_1__design/
    01_context-and-current-state.md            ← What exists, what's scattered, audiences
  phase_2__planning/
    02_site-structure-and-content-plan.md      ← Repo layout, site map, migration decisions
  phase_3__development/
    03_implementation-map.md                   ← 5-phase build plan
    04_rendering-and-indexing-strategy.md      ← Web Components, markdown pipeline
  phase_4__qa/
    05_definition-of-done.md                   ← 9-item acceptance criteria
  phase_5__release/
    06_launch-checklist.md                     ← Deploy + clone-on-start adoption
  99_source-documents.md                       ← Source briefs and prior art index
  issues/                                      ← Issues-FS task board (3 teams)
    README.md
    _teams/                                    ← Team manifests
    explorer-library/                          ← Team 1: build the library
    villager-release/                          ← Team 2: harden + deploy
    town-planner-adoption/                     ← Team 3: cross-project adoption
```

---

## Current Status by Phase

| Phase | Status | Owner | Notes |
|-------|--------|-------|-------|
| Phase 1: Design | ✅ Complete | Librarian | Two briefs, content inventory done |
| Phase 2: Planning | ✅ Complete | Conductor + Librarian | Site structure, decisions made |
| Phase 3: Development | 🔲 Ready to start | Developer | New repo first, then content migration |
| Phase 4: QA | 🔲 Not started | QA | After Phase 3 website build |
| Phase 5: Release | 🔲 Not started | DevOps | After QA sign-off |

**First action:** Create `SGraph-AI__Library` repo and commit initial folder structure.

---

## Key Decisions (non-negotiable)

1. **Two repos per session** — every Claude Code session clones project repo + library repo
2. **Markdown is the source** — content stays as `.md` files; website renders them client-side
3. **Dual format** — rendered HTML for humans, raw markdown URLs for LLMs
4. **No Jekyll/Hugo** — Web Components only, same stack as sgraph.ai and qa.send.sgraph.ai
5. **Library is NOT SG/Send-specific** — it is the agentic team methodology; any project can use it
6. **Role definitions migrate** — from `team/roles/{role}/ROLE.md` → library repo `roles/`
7. **Shared CLAUDE.md content migrates** — project-specific stays in project repo; shared methodology goes to library
8. **Machine-readable indexes** — `index.json` + `catalogue.csv` at root; auto-generated on push
9. **Content must be stable** — library contains things that change infrequently (roles, skills, methodology); NOT daily briefs, NOT status updates, NOT code

---

*Single source of truth for the library.sgraph.ai project*
*Last updated: 02 April 2026 | Based on: v0.13.5 (9 Mar) + v0.19.7 (2 Apr) briefs*
