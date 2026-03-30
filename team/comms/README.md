# Team Communications (`team/comms/`)

**Purpose:** Structured, in-repo communication channel between the Explorer team and downstream agentic teams (QA, Villager, Browse, Vault, etc.).

Since agentic teams clone this repo to run tests or consume changes, this folder is the primary way to communicate what changed, what's planned, and what to expect.

---

## Quick Links

| You are... | Start here |
|------------|-----------|
| **QA team** | [QA_START_HERE.md](QA_START_HERE.md) — what changed, what to test, priority order |
| **Any team** | [changelog/](changelog/) — most recent date folder for latest changes |
| **New to this system** | Keep reading this README |

---

## Folder Structure

```
team/comms/
  QA_START_HERE.md           # QA team landing page (maintained by Librarian)
  README.md                  # This file — operating model for all teams
  changelog/MM/DD/           # What changed — version-tagged, with test impact
  qa/briefs/MM/DD/           # Briefs TO the QA team (what to test, priorities)
  qa/questions/MM/DD/        # Questions between Explorer <-> QA agents
  briefs/MM/DD/              # Inter-team briefs (Vault->Browse, Architect->Dev, etc.)
  plans/MM/DD/               # What's planned (pre-implementation intent)
```

### When to use each folder

| Folder | Who writes | Who reads | Content |
|--------|-----------|-----------|---------|
| `changelog/` | Explorer team (after shipping) | QA, Villager, anyone | What changed, expected test impact |
| `qa/briefs/` | Explorer team | QA team | Specific test cases, action items |
| `qa/questions/` | Explorer or QA | The other team | Bidirectional Q&A |
| `briefs/` | Any team | Target team | Cross-team architecture/implementation briefs |
| `plans/` | Explorer team (before building) | All teams | Pre-implementation intent |

---

## Changelog — Good Failures vs Bad Failures

The **changelog** is the critical document for QA. Each entry includes:

1. **What changed** — files modified, endpoints added/removed, UI behaviour changes
2. **Expected test impact** — which tests SHOULD break (good failure = feature changed)
3. **What should still pass** — which tests should NOT break (bad failure = regression)
4. **Version tag** — links the change to a specific version

This lets the QA team immediately classify any test failure:
- **Good failure:** Test broke because the feature it tests was intentionally changed. Update the test.
- **Bad failure:** Test broke but the feature wasn't changed. This is a bug or regression. Report it.

---

## How to Use

### Explorer Team (writing changes)

1. **Before starting work:** Create a plan in `plans/MM/DD/`
2. **After completing work:** Create a changelog in `changelog/MM/DD/`
3. **If QA needs a testing brief:** Create a brief in `qa/briefs/MM/DD/`
4. **If you have questions for QA:** Create a question in `qa/questions/MM/DD/`
5. **If briefing another team:** Create a brief in `briefs/MM/DD/`
6. **After a batch of changes:** Update `QA_START_HERE.md` with the new entries

### QA Team (consuming changes)

1. **On clone:** Read [QA_START_HERE.md](QA_START_HERE.md) first
2. **Check `qa/briefs/`** for testing priorities and new test requirements
3. **On test failure:** Cross-reference the changelog to classify good vs bad failure
4. **If you have questions:** Add responses in `qa/questions/MM/DD/`

### Other Teams (Vault, Browse, Villager, etc.)

1. **On session start:** Check `changelog/` for what Explorer changed
2. **Check `briefs/`** for inter-team briefs directed at your team
3. **Cross-reference with reality document** at `team/roles/librarian/reality/`

---

## File Naming Convention

All files follow the project convention: `{version}__{type}__{description}.md`

Examples:
- `v0.20.4__changelog__v031-browse-view-overhaul.md`
- `v0.20.4__qa-brief__v031-final-checks-before-go-live.md`
- `v0.20.6__browse-team-brief__shared-module-extraction.md`
- `v0.16.50__plan__comms-structure-and-next-steps.md`
- `v0.16.50__question__screenshot-fixture-scope.md`

---

## Versioning

This project uses two version tracks:

| Track | Pattern | Example | Where it appears |
|-------|---------|---------|------------------|
| **Backend/app** | `v0.X.Y` | v0.20.4 | `sgraph_ai_app_send/version`, filenames |
| **UI** | `v0.X.Y` (separate) | v0.3.1 | Footer, `window.SGRAPH_BUILD.uiVersion` |

Changelog filenames use the backend version. The UI version is documented inside the changelog.

---

## Relationship to Other Docs

| Document | Purpose | Location |
|---|---|---|
| **Changelog** (here) | What changed, test impact | `team/comms/changelog/` |
| **QA briefs** (here) | What to test, action items | `team/comms/qa/briefs/` |
| **Reality document** | What exists in code (full audit) | `team/roles/librarian/reality/` |
| **Debriefs** | Human-facing session summaries | `team/humans/dinis_cruz/debriefs/` |
| **Role reviews** | Role-specific analysis | `team/roles/{role}/reviews/` |
| **QA site** | CI-generated test results + screenshots | [qa.send.sgraph.ai](https://qa.send.sgraph.ai) |
