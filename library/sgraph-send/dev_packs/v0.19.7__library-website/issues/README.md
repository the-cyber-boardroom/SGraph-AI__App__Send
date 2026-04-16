# Library Website — Issues-FS Board
**v0.19.7 | 02 April 2026**

Task board for the library.sgraph.ai project. Lives in Git. Updated by agents as they work.

---

## The Three Teams

| Team | Lead | Wardley Stage | Status | Working files |
|------|------|--------------|--------|---------------|
| **Explorer — Library Build** | Librarian | Genesis → Custom-Built | todo | `explorer-library/` |
| **Villager — Production Release** | QA | Custom-Built → Product | blocked | `villager-release/` |
| **Town Planner — Cross-Project Adoption** | Conductor | Product → Commodity | blocked | `town-planner-adoption/` |

**Dependency chain:** Explorer → Villager → Town Planner

---

## Quick Status

```
_teams/
  team-manifest.issues           ← All 3 teams + stories + dependencies
  team1-explorer-library.issues
  team2-villager-release.issues
  team3-town-planner-adoption.issues

explorer-library/                ← Team 1: build the library
  phase0-repo-creation.issues    ← FIRST: create SGraph-AI__Library repo
  phase1-content-migration.issues ← Copy roles, skills, guides, CLAUDE.md
  phase2-website-build.issues    ← Homepage, document pages, Web Components
  phase3-index-generation.issues ← index.json, catalogue.csv, generate script
  phase4-deployment.issues       ← S3, CloudFront, CI pipeline
  questions.issues               ← Open decisions
  bugs.issues

villager-release/                ← Team 2: quality gate + deployment
  pr-gate.issues                 ← 9-item DoD + technical checks

town-planner-adoption/           ← Team 3: cross-project integration
  clone-on-start.issues          ← Update all project repos + test
  slim-down.issues               ← Reduce project CLAUDE.md files
```

---

## How to Use

**Each role:** Search for `-> YourRole` in your team's folder.
**Handoff:** Mark your task `done`, unblock dependent `blocked` tasks, commit both.

Dev pack: `library/sgraph-send/dev_packs/v0.19.7__library-website/`
