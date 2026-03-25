<!-- Brief Pack Document 02 of 05 | See INDEX.md for navigation -->

# Architect Response — Use-Cases IA Implementation (Rev 2)

**Role:** Architect (Explorer team)
**Version:** v0.16.52
**Date:** 23 March 2026 (Revised)
**Input:** Designer research (Rev 2) + stakeholder feedback
**Scope:** Data models, contracts, boundaries, and technical design

---

## 1. Corrections from Rev 1

The first-pass Architect response made two errors that the stakeholder
feedback corrects:

**Error 1: "The QA repo is not bound by Type_Safe."** Wrong. All Python
code in this repo must follow the same standards as the main project:
Type_Safe from osbot-utils, no Pydantic, fully tested, no mocks. The QA
repo grew organically to prove the technology. Now it must be brought up
to standard. This is non-negotiable.

**Error 2: Central mapping file (`_data/use_case_groups.json`).** Wrong
approach. The feedback is clear: the **filesystem is the database**. Group
identity lives in the folder structure, not in a central config. Each group
carries its own manifest. Discovery, not configuration.

Both errors are corrected in this revision.

---

## 2. Filesystem as Database — The Core Architecture Decision

### 2.1 The Principle

The folder structure encodes the information hierarchy. Tools discover
what exists by walking the filesystem. No central mapping file needs to
be kept in sync.

```
    PRINCIPLE: If you need to know what groups exist, list the directories.
    PRINCIPLE: If you need to know what's in a group, list its subdirectories.
    PRINCIPLE: If you need display metadata, read the _group.json inside it.
    PRINCIPLE: If you need test metadata, read the _metadata.json in screenshots/.
```

### 2.2 Folder Layout

```
    sg_send_qa__site/pages/use-cases/
    │
    ├── _groups.json                    ← MINIMAL: just ordering hints + archived list
    │
    ├── 01-access-gate/
    │   ├── _group.json                 ← group manifest (name, icon, description)
    │   ├── access_gate/
    │   │   ├── access_gate.md
    │   │   └── screenshots/
    │   │       ├── *.png
    │   │       └── _metadata.json
    │   ├── bogus_token_shows_error/
    │   │   ├── bogus_token_shows_error.md
    │   │   └── screenshots/
    │   └── _duplicates/
    │       ├── upload_accessible_with_token/
    │       └── ...
    │
    ├── 02-upload-share/
    │   ├── _group.json
    │   ├── combined_link/
    │   ├── friendly_token/
    │   └── _duplicates/
    │
    ├── ... (03 through 08)
    │
    ├── _archived/
    │   ├── landing_page_loads/
    │   ├── landing_page_has_access_gate/
    │   └── invalid_token_rejected/
    │
    └── _bugs/
        └── bugs/
```

### 2.3 Schema Definitions

**`_group.json` — Group Manifest**

Lives inside each group folder. Defines the group's identity.

```
    FILE: 01-access-gate/_group.json

    {
      "name"        : "Access Gate",
      "icon"        : "🔐",
      "description" : "Can the user get in? Token authentication boundary.",
      "duplicates"  : {
        "upload_accessible_with_token"  : "access_gate",
        "wrong_token_shows_error"       : "access_gate",
        "upload_zone_visible_without_gate": "access_gate"
      }
    }
```

Schema:

```
    ┌─────────────┬──────────┬──────────────────────────────────────────────┐
    │ Field       │ Type     │ Description                                  │
    ├─────────────┼──────────┼──────────────────────────────────────────────┤
    │ name        │ string   │ Display name                                 │
    │ icon        │ string   │ Emoji prefix for sidebar/headings            │
    │ description │ string   │ One-line purpose statement                   │
    │ duplicates  │ dict     │ Map of duplicate_id → parent_id              │
    └─────────────┴──────────┴──────────────────────────────────────────────┘
```

**Discovery algorithm:** The `order` field from Rev 1 is eliminated.
Order comes from the numbered directory prefix: `01-`, `02-`, etc.
To reorder groups, rename the directories.


**`_groups.json` — Top-level Hints (Minimal)**

Lives at the use-cases root. Contains ONLY things that can't be
discovered from the filesystem:

```
    FILE: pages/use-cases/_groups.json

    {
      "archived": [
        "landing_page_loads",
        "landing_page_has_access_gate",
        "invalid_token_rejected"
      ],
      "test_dir_to_group": {
        "access_gate"       : "01-access-gate",
        "upload_share"      : "02-upload-share",
        "navigation"        : "04-navigation",
        "gallery"           : "05-gallery",
        "browse"            : "06-browse",
        "viewer"            : "07-viewer",
        "pdf"               : "08-pdf",
        "separate_key"      : "03-separate-key"
      }
    }
```

This maps the test subdirectory name (`tests/qa/v030/{name}/`) to the
site group folder. It's the ONE mapping that can't be derived from the
filesystem alone, because test directory names and site directory names
use different conventions.

Everything else is discovered.


**`_metadata.json` — Test Metadata (Standardised)**

Produced by the conftest fixture. Lives inside `screenshots/`.

```
    {
      "use_case"    : "access_gate",
      "module"      : "test__access_gate",
      "module_doc"  : "...",
      "test_target" : "qa_server",
      "tests"       : [
        {
          "method"      : "test_upload_accessible_with_token",
          "doc"         : "...",
          "screenshots" : ["01_landing", "02_after_token"]
        }
      ],
      "screenshots" : [
        {
          "name"        : "01_landing",
          "path"        : "...",
          "description" : "Landing page with access gate"
        }
      ]
    }
```

Key changes from Rev 1:

- `test_target` uses `"qa_server"` not `"local_stack"` (avoids LocalStack
  confusion). Other valid values: `"production"`, `"dev"`, `"main"`.
- Arrays are deduplicated on write (by method name / screenshot name).
- `module_doc` is stripped of leading whitespace.


---

## 3. Type_Safe — Mandatory Code Standard

All Python code in the QA repo must use Type_Safe from osbot-utils.
This applies to:

- `sg_send_qa/cli/generate_docs.py`
- `sg_send_qa/ci/diff_screenshots.py`
- `tests/qa/v030/conftest.py`
- All new code

### 3.1 What This Means in Practice

**Current code (plain Python):**

```python
    def _read_metadata(use_case_dir):
        meta_path = use_case_dir / "screenshots" / "_metadata.json"
        if meta_path.exists():
            return json.loads(meta_path.read_text())
        return None
```

**Refactored code (Type_Safe):**

```python
    from osbot_utils.base_classes.Type_Safe import Type_Safe

    class QA_Use_Case_Metadata(Type_Safe):
        use_case    : str
        module      : str
        module_doc  : str  = ""
        test_target : str  = "qa_server"
        tests       : list = []
        screenshots : list = []

    class QA_Test_Method(Type_Safe):
        method      : str
        doc         : str  = ""
        screenshots : list = []

    class QA_Screenshot(Type_Safe):
        name        : str
        path        : str  = ""
        description : str  = ""

    class QA_Group_Manifest(Type_Safe):
        name        : str
        icon        : str
        description : str
        duplicates  : dict = {}
```

Every data structure becomes a Type_Safe class. JSON serialisation comes
from Type_Safe's built-in support. No Pydantic. No raw dicts for
structured data.

### 3.2 Impact on Existing Code

This is a significant refactoring of three files. The Dev should treat
this as a prerequisite to the `generate_docs.py` rewrite — refactor the
data structures first, then build the new generation logic on top.


---

## 4. Component Boundaries (Revised)

```
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         COMPONENT BOUNDARY MAP (REV 2)                  │
    │                                                                         │
    │   conftest.py                    generate_docs.py                       │
    │   ┌──────────────┐              ┌───────────────────┐                  │
    │   │ TEST FIXTURE  │              │  DOC GENERATOR     │                  │
    │   │ (Type_Safe)   │  writes      │  (Type_Safe)       │                  │
    │   │               │────────────▶│                    │                  │
    │   │ Captures      │  _metadata   │ WALKS filesystem   │                  │
    │   │ screenshots   │  .json       │ READS _group.json  │                  │
    │   │ Writes clean  │              │ READS _metadata    │                  │
    │   │ metadata      │              │ WRITES index.md    │                  │
    │   │ Dedups on     │              │ WRITES scaffolded  │                  │
    │   │ every write   │              │   pages            │                  │
    │   └──────────────┘              │ WRITES summary     │                  │
    │         │                        │   data for Jekyll  │                  │
    │         │                        └────────┬──────────┘                  │
    │         │                                 │                              │
    │         │  places screenshots              │ places files                 │
    │         │  into the correct                │ into correct                 │
    │         │  group folder                    │ locations                    │
    │         │                                 │                              │
    │         ▼                                 ▼                              │
    │   ┌──────────────────────────────────────────────┐                      │
    │   │          FILESYSTEM (the database)            │                      │
    │   │                                               │                      │
    │   │  pages/use-cases/                             │                      │
    │   │  ├── 01-access-gate/                          │                      │
    │   │  │   ├── _group.json      ← group manifest    │                      │
    │   │  │   ├── access_gate/                         │                      │
    │   │  │   │   ├── *.md         ← page              │                      │
    │   │  │   │   └── screenshots/ ← evidence          │                      │
    │   │  │   │       ├── *.png                        │                      │
    │   │  │   │       └── _metadata.json               │                      │
    │   │  │   └── _duplicates/                         │                      │
    │   │  └── ...                                      │                      │
    │   └───────────────────────────────────────────────┘                      │
    │         │                                                                │
    │         │ read at build time                                             │
    │         ▼                                                                │
    │   ┌──────────────────────────┐                                          │
    │   │  JEKYLL BUILD             │                                          │
    │   │  default.html template    │                                          │
    │   │  reads _data/ for summary │                                          │
    │   │  generates sidebar from   │                                          │
    │   │  filesystem walk          │                                          │
    │   └──────────────────────────┘                                          │
    └─────────────────────────────────────────────────────────────────────────┘
```

**Boundary rules (revised):**

1. **conftest.py writes metadata and screenshots only.** It knows which
   group folder to target (from the test's location in `tests/qa/v030/{group}/`).
   It does not know about display names, icons, or editorial content.

2. **`_group.json` is hand-edited.** Humans or agents create it once when
   a group is established. It rarely changes.

3. **`generate_docs.py` discovers everything by walking the filesystem.**
   It reads `_group.json` for display metadata, `_metadata.json` for test
   data, and directory listings for group membership. It writes scaffolded
   pages, the index, and summary data. It never writes metadata.

4. **Jekyll reads the filesystem at build time.** The sidebar can be
   generated from `_data/` files that `generate_docs.py` produces, OR
   from a Jekyll plugin that walks the use-cases directory. Either way,
   the source of truth is the filesystem.

5. **Hand-crafted pages are never overwritten.** Detected by: file exists
   AND does not contain `<!-- auto-generated -->` marker.


---

## 5. Three Execution Modes — Architecture Implications

### 5.1 CI Pipeline Mode

- Runs `pytest` → screenshots → `generate_docs.py` → `diff_screenshots.py` → auto-commit → Jekyll build → deploy.
- No LLM. Fast. Gating before release.
- Must run against dev, main, AND prod (different `TEST_TARGET_URL`).
- Non-critical test failures (P2, P3) should NOT break the pipeline.

**Architecture decision:** Tests are tagged with pytest markers (`@pytest.mark.p0`,
`@pytest.mark.p1`, etc.). The CI pipeline runs with `--strict-markers` and
can be configured to fail only on P0/P1 failures. P2/P3 failures are
logged but don't block.

### 5.2 LLM Coding Mode (Claude Code)

- Full repo access. Writes code. Creates/modifies tests.
- Handles the lifecycle: broken test → move to bugs → document → fix lands
  → move to regression → restore.
- This is where the **QA Curator** agent operates.

**Architecture decision:** The test movement lifecycle (feature → bug →
regression) must be expressible as file moves between directories. Moving
a test from `02-upload-share/combined_link/` to `_bugs/` is a git mv.
The filesystem captures the state.

### 5.3 LLM Analysis Mode (Claude Web)

- Loads repo, reads pages, has conversations about workflows.
- Uses screenshots and documentation as conversation surfaces.
- May iterate on specific pages.

**Architecture decision:** Pages must be self-contained and agent-readable.
Each page should contain enough context that an LLM reading it for the
first time understands what it documents, what group it belongs to, and
what related pages exist. The "For Agents" section in the Designer's
enriched template serves this purpose.


---

## 6. Multi-Environment Data Model

Tests run against multiple environments. The site must show where each
test passes or fails.

### 6.1 Environment Results File

Each test run against an environment produces results. These accumulate
in a per-use-case file:

```
    FILE: access_gate/screenshots/_environments.json

    {
      "qa_server": { "status": "pass", "last_run": "2026-03-23T14:00Z" },
      "dev":       { "status": "pass", "last_run": "2026-03-22T10:00Z" },
      "main":      { "status": "fail", "last_run": "2026-03-21T08:00Z",
                     "error": "access gate not deployed yet" },
      "prod":      { "status": "not_run" }
    }
```

This file is written by the CI pipeline (or by a post-test hook in
conftest.py) based on which environment the test ran against.

### 6.2 Schema

```
    class QA_Environment_Result(Type_Safe):
        status   : str  = "not_run"       # pass | fail | skip | not_run
        last_run : str  = ""              # ISO 8601
        error    : str  = ""              # failure reason if failed
```

### 6.3 Display

The index page and individual pages show environment columns:

```
    dev ✓  │  main ✗  │  prod –
```

The dashboard page aggregates this across all use cases.


---

## 7. Test Structure Mirroring

The Architect confirms the Designer's proposal: test directories should
mirror site group directories.

```
    MAPPING:

    tests/qa/v030/access_gate/          →  pages/use-cases/01-access-gate/
    tests/qa/v030/upload_share/         →  pages/use-cases/02-upload-share/
    tests/qa/v030/separate_key/         →  pages/use-cases/03-separate-key/
    tests/qa/v030/navigation/           →  pages/use-cases/04-navigation/
    tests/qa/v030/gallery/              →  pages/use-cases/05-gallery/
    tests/qa/v030/browse/              →  pages/use-cases/06-browse/
    tests/qa/v030/viewer/              →  pages/use-cases/07-viewer/
    tests/qa/v030/pdf/                 →  pages/use-cases/08-pdf/
```

The `_groups.json` at the use-cases root maps between these names
(test dir name → site dir name). This is the only mapping needed.

The conftest fixture derives the output directory from the test's
position in the filesystem:

```
    Test at: tests/qa/v030/access_gate/test__access_gate.py
    ↓ fixture reads parent directory name: "access_gate"
    ↓ looks up _groups.json: access_gate → 01-access-gate
    ↓ writes to: pages/use-cases/01-access-gate/access_gate/screenshots/
```


---

## 8. Implementation Phases (Revised)

```
    PHASE 1: REFACTOR TO TYPE_SAFE + RESTRUCTURE FILESYSTEM
    ┌──────────────────────────────────────────────────────┐
    │  1a. Create group folders (01-access-gate/ etc.)      │
    │  1b. Create _group.json manifests                     │
    │  1c. Move use-case folders into their groups          │
    │  1d. Move 3 stale pages to _archived/                 │
    │  1e. Refactor conftest.py to Type_Safe + dedup fix    │
    │  1f. Restructure tests/qa/v030/ into group subdirs    │
    └──────────────────┬───────────────────────────────────┘
                       │
                       ▼
    PHASE 2: REWRITE GENERATE_DOCS.PY (TYPE_SAFE)
    ┌──────────────────────────────────────────────────────┐
    │  2a. Type_Safe data classes for all structures         │
    │  2b. Filesystem-walking discovery (no central config)  │
    │  2c. Enriched page scaffolding                        │
    │  2d. Grouped index generation                         │
    │  2e. Dashboard summary generation                     │
    │  2f. Redirect pages for duplicates                    │
    │  2g. Full test coverage for generator                 │
    └──────────────────┬───────────────────────────────────┘
                       │
                       ▼
    PHASE 3: JEKYLL TEMPLATE + SITE STRUCTURE
    ┌──────────────────────────────────────────────────────┐
    │  3a. Update default.html sidebar (filesystem-driven)  │
    │  3b. Create dashboard page                            │
    │  3c. Simplify _config.yml                             │
    │  3d. Create agent-briefs/ section                     │
    └──────────────────┬───────────────────────────────────┘
                       │
                       ▼
    PHASE 4: MULTI-ENVIRONMENT + CI PIPELINE
    ┌──────────────────────────────────────────────────────┐
    │  4a. _environments.json support in conftest           │
    │  4b. CI matrix: dev + main + prod targets             │
    │  4c. Priority-based CI failure gating                 │
    │  4d. Environment columns in index + dashboard         │
    └──────────────────┬───────────────────────────────────┘
                       │
                       ▼
    PHASE 5: AGENT ROLES + LIFECYCLE
    ┌──────────────────────────────────────────────────────┐
    │  5a. Define QA Curator agent role                     │
    │  5b. Test lifecycle workflows (feature → bug → fix)   │
    │  5c. QA-of-QA: tests for the QA site itself          │
    └──────────────────────────────────────────────────────┘
```

Phases 1 and 2 must be sequential (2 depends on 1's filesystem structure).
Phase 3 depends on Phase 2 output. Phase 4 and 5 can happen in parallel
after Phase 3.


---

## 9. Risks and Constraints (Revised)

**Risk: Permalink breakage.** Moving use-case folders into group subdirectories
changes their filesystem path. Jekyll permalinks are set in front matter
(`permalink: /pages/use-cases/{name}/`), so URLs don't change. But the
conftest fixture's output path does change. This must be coordinated —
conftest, generate_docs, and the folder move must ship together.

**Risk: CI pipeline breakage during restructuring.** The test restructuring
(flat → grouped subdirectories) changes import paths and pytest discovery.
Must be tested locally before merge. The CI pipeline YAML may need path
updates.

**Risk: Type_Safe refactoring scope.** Converting three files to Type_Safe
is non-trivial if the team doesn't have `osbot-utils` patterns memorised.
The main repo has extensive examples — reference them.

**Constraint: `_data/` directory in Jekyll.** Jekyll's `_data/` directory
is special — files there are available as `site.data.*`. The summary JSON
that `generate_docs.py` produces for the dashboard should go here. But
the group manifests (`_group.json`) live inside the use-cases directory
tree, not in `_data/`. Jekyll can still read them via includes or by
having `generate_docs.py` collate them into `_data/`.

**Naming: "QA server" not "local stack."** All documentation and code
references must use "QA server" or "in-memory server" or "test server."
Never "local stack" — that collides with LocalStack (the AWS mock tool).

---

*Architect response (Rev 2) · SGraph Send QA · v0.16.52 · 23 March 2026*

---

## Cross-References (Brief Pack)

| Related Document | Relevance |
|-----------------|-----------|
| [00 Introduction](00-introduction.md) | Platform vision this architecture serves |
| [01 Designer](01-designer__ia-research.md) | IA research that drives these data models |
| [03 Dev](03-dev__implementation-plan.md) | Implementation of these schemas in code |
| [05 Refactoring Brief](05-conductor__villager-refactoring-brief.md) | File-by-file audit and Type_Safe migration scope |
