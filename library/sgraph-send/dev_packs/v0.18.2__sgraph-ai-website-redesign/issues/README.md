# Website Redesign — Issues-FS Board
**v0.18.3 | 27 March 2026**

Task board for the sgraph.ai website redesign. Lives in Git. Updated by agents as they work.

---

## The Four Teams

| Team | Lead | Wardley Stage | Status | Working files |
|------|------|--------------|--------|---------------|
| **Explorer — Website** | Conductor | Genesis → Custom-Built | in-progress | `explorer-website/` |
| **Explorer — Platform** | Ambassador | Genesis | todo | `explorer-platform/` |
| **Villager — Release** | QA | Custom-Built → Product | blocked | `villager-release/` |
| **Town Planner — Launch** | Alchemist | Product → Commodity | todo | `town-planner-launch/` |

**Dependency chain:** Explorer Website → Villager Release → Town Planner Launch
Explorer Platform runs in parallel (does not block Explorer Website PR 1)

---

## Quick Status

```
_teams/
  team-manifest.issues         ← Start here. All 4 teams + stories + dependencies.
  team1-explorer-website.issues
  team2-explorer-platform.issues
  team3-villager-release.issues
  team4-town-planner-launch.issues

explorer-website/              ← Team 1: 7 phases (PR 1 content)
  phase0-prework.issues        ← BLOCKER: screenshots + demo vaults
  phase1-new-pages.issues      ← /security/ + /features/ + 5x /why/
  phase2-homepage.issues       ← 7 homepage sections
  phase3-navigation.issues     ← New nav + "Already have a token?"
  phase4-public-viewer.issues  ← <sg-public-viewer> Web Component
  phase5-redirects.issues      ← PR 2 ONLY — blocked until Villager confirms
  phase6-sitemap.issues        ← Sitemap updates
  phase7-ci.issues             ← CI smoke tests
  questions.issues             ← 7 open questions for Dinis
  bugs.issues                  ← Bug tracking

explorer-platform/             ← Team 2: Platform story + demo content
  platform-story.issues        ← "Where we're going" + ecosystem nav
  demo-content.issues          ← SGraph infographics as demo vault files

villager-release/              ← Team 3: Quality gate + deployment
  pr1-gate.issues              ← 17-item checklist before PR 1 merges
  pr2-gate.issues              ← SEO gate + redirect verification

town-planner-launch/           ← Team 4: Launch + investor materials
  launch-comms.issues          ← 7 comms tasks (HN, Twitter, LinkedIn x3)
  investor-materials.issues    ← Pitch deck + one-pager + platform thesis
```

---

## How to Use

**Each role:** Search for `-> YourRole` across all files in your team's folder.
**Update status:** Change `todo` → `in-progress` → `done` in the relevant file.
**Unblock dependencies:** When you mark a task done, also unblock any `blocked` tasks that depend on it.
**Commit:** Always commit `.issues` file changes alongside your deliverables.

**Handoff pattern:**
```
Sherpa: Task-1 | done | Write hero copy
Dev:    Task-12 | todo | Build hero HTML  ← change from blocked to todo
```

---

## Dev Pack

Full reference documentation lives alongside this folder in:
`library/sgraph-send/dev_packs/v0.18.2__sgraph-ai-website-redesign/`

| Phase file | Contains |
|-----------|---------|
| `../README.md` | Entry point — TL;DR, reading order, phase status |
| `../phase_1__design/01_context-and-brand.md` | Product reality, brand, competitive positioning |
| `../phase_2__planning/02_decisions-and-site-map.md` | All decisions, site map, homepage copy |
| `../phase_3__development/03_implementation-map.md` | 7-phase build plan with code sketches |
| `../phase_3__development/04_tools-repo-strategy.md` | Web Components, __Tools integration |
| `../phase_4__qa/05_definition-of-done.md` | 13-item QA checklist |
| `../phase_5__release/06_launch-checklist.md` | PR 1/PR 2 steps, launch messaging |
| `../99_source-documents.md` | All source files with paths |
