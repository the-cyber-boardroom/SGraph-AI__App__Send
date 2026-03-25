# Team Communications (`team/comms/`)

**Purpose:** Structured, in-repo communication channel between the Explorer team and downstream agentic teams (QA, Villager, etc.).

Since the QA agentic team clones this repo to run tests, this folder is the primary way to communicate what changed, what's planned, and what to expect.

---

## Folder Structure

```
team/comms/
  changelog/MM/DD/       # What changed — version-tagged change documents
  qa/briefs/MM/DD/       # Briefs TO the QA team (what to test, priorities)
  qa/questions/MM/DD/    # Questions between Explorer ↔ QA agents
  plans/MM/DD/           # What's planned (pre-implementation intent)
```

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

### QA Team (consuming changes)

1. **On clone:** Check `changelog/` for recent entries since last run
2. **On test failure:** Cross-reference the changelog to classify good vs bad failure
3. **If you have questions:** Add responses in `qa/questions/MM/DD/`
4. **Check briefs:** Read `qa/briefs/` for testing priorities and new test requirements

### Villager Team (consuming changes)

1. **On session start:** Check `changelog/` for what Explorer changed
2. **Cross-reference with reality document** at `team/roles/librarian/reality/`

---

## File Naming Convention

All files follow the project convention: `{version}__{type}__{description}.md`

Examples:
- `v0.16.50__changelog__upload-component-refactor.md`
- `v0.16.50__qa-brief__test-access-gate-updates.md`
- `v0.16.50__plan__vault-download-caching.md`
- `v0.16.50__question__screenshot-fixture-scope.md`

---

## Relationship to Other Docs

| Document | Purpose | Location |
|---|---|---|
| **Changelog** (here) | What changed, test impact | `team/comms/changelog/` |
| **Reality document** | What exists in code (full audit) | `team/roles/librarian/reality/` |
| **Debriefs** | Human-facing session summaries | `team/humans/dinis_cruz/debriefs/` |
| **Role reviews** | Role-specific analysis | `team/roles/{role}/reviews/` |
| **QA site** | CI-generated test results + screenshots | [qa.send.sgraph.ai](https://qa.send.sgraph.ai) |
