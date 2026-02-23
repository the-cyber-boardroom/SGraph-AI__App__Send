# CLAUDE.md Review — What the QA Project Should Inherit

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Purpose:** Guide for creating the QA project's `.claude/CLAUDE.md` by reviewing what to keep, adapt, or skip from the SG/Send CLAUDE.md files

---

## Source Files Reviewed

| File | Description |
|---|---|
| `.claude/CLAUDE.md` | Global — shared rules for all SG/Send sessions |
| `.claude/explorer/CLAUDE.md` | Explorer team session instructions |
| `.claude/villager/CLAUDE.md` | Villager team session instructions |
| `.claude/town-planner/CLAUDE.md` | Town Planner team session instructions |

---

## Section-by-Section Review of Global CLAUDE.md

### KEEP AS-IS

| Section | Why |
|---|---|
| **MEMORY.md Policy** | Same principle applies — no auto-memory, use repo-based knowledge |
| **Git rules** (default branch, branch naming, push command) | Same conventions. Change default branch to `main` if preferred |
| **File naming** (version prefix on review/doc files) | Same convention |
| **Human folders read-only** | Same rule — if human briefs folder exists in QA repo |
| **Debrief protocol** | Same format and process |

### ADAPT (change details, keep concept)

| Section | What to Change                                                                                                                          |
|---|-----------------------------------------------------------------------------------------------------------------------------------------|
| **Project description** | Change to: "SG/Send QA — browser automation test suite and living documentation generator for [send.sgraph.ai](https://send.sgraph.ai)" |
| **Version file** | Change path to wherever the QA project stores its version (e.g., `sg_send__qa/version`)                                                 |
| **Stack table** | Replace with QA project stack — see "Recommended Stack Table" below                                                                     |
| **Architecture** | Replace with QA project architecture — FastAPI test runner, CLI, GitHub Actions, GitHub Pages                                           |
| **Repo structure** | Replace with QA project structure from `05_technical-bootstrap-guide.md`                                                                |
| **Code patterns** | Keep Type_Safe, osbot-utils, no-mocks rules. Drop Memory-FS, Lambda, encryption rules (not applicable). Add Playwright patterns.        |
| **Testing rules** | Keep no-mocks principle. Adapt for browser tests (Playwright fixtures, screenshot capture)                                              |
| **Role system** | Reduce from 18 roles to 6: QA Lead, Architect, Developer, DevOps, Librarian, Sherpa                                                     |
| **Current state** | Start fresh — describe the QA project's current state                                                                                   |
| **Key documents** | Point to bootstrap pack files and any new documents created                                                                             |
| **Team structure** | Single team (Explorer) — no Villager or Town Planner initially                                                                          |

### SKIP (not relevant to QA project)

| Section | Why |
|---|---|
| **Three-team structure** (Explorer/Villager/Town Planner) | QA project is Explorer-only at launch. Add Villager when it matures. |
| **Key separation rules** (Explorer vs Villager vs Town Planner) | Single team — not needed yet |
| **Two Lambda functions** | QA project has one FastAPI server, not Lambdas (Lambda is a future deployment target) |
| **7 deployment targets** | QA project deploys to: local, GitHub Actions, eventually Lambda |
| **Three UIs** | QA project has: test results UI, documentation site |
| **Security section** (server never sees plaintext, no file names, etc.) | These are SG/Send application rules, not QA project rules |
| **IP hash rules** | Not applicable |
| **Admin/User Lambda architecture diagram** | Not applicable |
| **IFD methodology** | QA project is simpler — standard versioning is fine initially |

---

## Review of Explorer CLAUDE.md

### KEEP (adapt)

| Section | What to Change |
|---|---|
| **Mission statement** | Keep the "Genesis → Custom-Built" framing. Change specifics to QA project scope. |
| **What You DO / Do NOT Do** | Keep the concept. Adapt bullet points for QA context. |
| **Explorer questions** | Keep all four questions — they apply to any exploration work |
| **Handover protocol** | Keep — when QA project matures, it hands over to a Villager phase |

### SKIP

| Section | Why |
|---|---|
| **Current Explorer Priorities** | SG/Send specific priorities. QA project has its own priorities from `02_mission-brief.md` |
| **Components Still Being Explored** | SG/Send components. QA project starts from scratch. |
| **Architecture Context diagram** | SG/Send routes/services. QA project consumes these, doesn't implement them. |
| **Team composition (18 roles)** | QA project has 6 roles |

---

## Review of Villager and Town Planner CLAUDE.md

**Skip entirely.** The QA project starts as Explorer-only. When it matures:
- Create a `.claude/villager/CLAUDE.md` for production hardening
- The Town Planner team is not relevant to a QA project

---

## Recommended Stack Table for QA Project

```markdown
| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Python 3.12 | Same as SG/Send |
| Browser automation | Playwright for Python | Primary tool — native Python, pytest integration |
| Visual tooling | Vercel agent-browser (CLI) | Complementary — visual diff, annotated screenshots, video recording |
| Web framework | FastAPI | Test runner API (lightweight, not via osbot-fast-api) |
| Type system | Type_Safe (osbot-utils) | Same as SG/Send |
| Documentation | Markdown + GitHub Pages | Generated from test screenshots |
| Testing | pytest + Playwright | Browser tests, no mocks |
| CI/CD | GitHub Actions | Test → screenshot → docs → deploy |
| Screenshot diff | Pillow or agent-browser diff | Visual regression detection |
```

---

## Recommended Architecture Section for QA Project

```markdown
## Architecture

- **One FastAPI server** — test runner API + documentation browser
- **CLI** — same capabilities as API, for terminal use
- **GitHub Actions** — CI pipeline: run tests → capture screenshots → generate docs → deploy to Pages
- **GitHub Pages** — published documentation site
- **Future: Lambda** — containerised test runner triggered by SG/Send deployments

```
Test Trigger (CI / API / CLI)
    │
    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Playwright   │────▶│ Screenshot   │────▶│ Doc Generator   │
│ Test Runner  │     │ Library      │     │ (Markdown)      │
└─────────────┘     └──────────────┘     └─────────────────┘
    │                                          │
    ▼                                          ▼
┌─────────────┐                         ┌─────────────────┐
│ Test Results │                         │ GitHub Pages    │
│ (pass/fail)  │                         │ (published docs)│
└─────────────┘                         └─────────────────┘
```
```

---

## Recommended Role Section for QA Project

```markdown
## Roles (6 roles)

| Role | Responsibility |
|------|---------------|
| **QA Lead** | Drives priorities, defines test strategy, reviews test coverage |
| **Architect** | System design, tool decisions, API contracts |
| **Developer** | Implementation, test writing, doc generation |
| **DevOps** | CI/CD, GitHub Actions, deployment, Lambda |
| **Librarian** | Knowledge management, indexing, cross-references |
| **Sherpa** | Onboarding guidance, best practices, troubleshooting |
```

---

## Sections to Write Fresh

These sections need to be written from scratch (not adapted from SG/Send):

1. **Test targets** — URLs being tested (`send.sgraph.ai`, `admin.send.sgraph.ai`)
2. **Screenshot conventions** — naming, directory structure, diff thresholds
3. **Documentation generation** — how markdown pages are built from screenshots
4. **GitHub Pages deployment** — how docs get published
5. **Relationship to SG/Send** — "you test it, you don't modify it"

---

## Template Structure for QA Project CLAUDE.md

```
.claude/
├── CLAUDE.md              ← Adapted global rules (this review tells you what to include)
└── explorer/
    └── CLAUDE.md          ← Adapted Explorer rules (single team, 6 roles)
```

The global CLAUDE.md should be self-contained enough that a new session can read just that file and understand the project. The Explorer CLAUDE.md adds team-specific workflow details.

---

*QA Bootstrap Pack — CLAUDE.md Review — v0.5.29*
