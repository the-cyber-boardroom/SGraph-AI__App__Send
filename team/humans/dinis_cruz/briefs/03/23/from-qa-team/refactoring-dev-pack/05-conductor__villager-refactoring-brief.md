<!-- Brief Pack Document 05 of 05 | See INDEX.md for navigation -->

# SG/Send QA — Villager Refactoring Brief

**Role:** Conductor + Architect (joint audit)
**Version:** v0.2.14 (QA repo) / v0.16.52 (SG/Send main)
**Date:** 23 March 2026
**Type:** Comprehensive repo audit and refactoring plan
**Principle:** The test framework is the highest-leverage code we have.
It must be as strong as what it tests.

---

## 1. Why This Refactoring

The QA repo grew organically to prove the technology. It succeeded — we
validated that browser automation, screenshot capture, documentation
generation, and the full CI pipeline work end-to-end across all three
execution modes (LLM Coding, LLM Analysis, CI Pipeline).

Now the technology is proven and the repo needs Villager-grade hardening:

- Every Python file uses Type_Safe and osbot-utils patterns
- Every piece of application code has tests
- Duplicated code is consolidated
- The folder structure encodes its own meaning
- The test framework is as rigorously engineered as SG/Send itself

This is not cosmetic. Sloppy test infrastructure produces false confidence.
The tests that test the test framework are among the most important code
in the entire SGraph ecosystem.

---

## 2. Repo Census

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SG_SEND__QA REPO CENSUS                      │
    ├──────────────────────────────────┬──────────────────────────────┤
    │  Python files (non-__init__)     │         30                   │
    │  Total Python lines              │      4,177                   │
    │  Application code (sg_send_qa/)  │        413 lines  (10%)     │
    │  Test code (tests/)              │      3,764 lines  (90%)     │
    │  Test methods                    │        122                   │
    │  CI workflows                    │      4 files, 512 lines     │
    │  Site markdown pages             │     50+ files, 3,147 lines  │
    │  Site template + config          │      2 files, 254 lines     │
    │  Team/role docs                  │      6 roles defined         │
    │  Type_Safe usage                 │      ZERO (0 of 30 files)   │
    │  osbot-utils usage               │      ZERO                    │
    └──────────────────────────────────┴──────────────────────────────┘
```

**Key finding: 0% of the Python code uses Type_Safe.** This is the single
largest gap. Every data structure is a raw dict. Every class is a plain
Python class. This must change completely.

---

## 3. File-by-File Audit

Every Python file in the repo, classified by current state, target state,
and effort required.

### 3.1 Application Code (`sg_send_qa/`)

```
FILE                              LINES  STATE        ACTION
─────────────────────────────────────────────────────────────────────────
sg_send_qa/__init__.py               0   empty        add version import
sg_send_qa/version                   1   ok           no change
sg_send_qa/utils/__init__.py         0   empty        no change
sg_send_qa/utils/Version.py         21   plain class  → Type_Safe
                                                       Currently: plain class
                                                       Issue: not using Type_Safe
                                                       Test: exists (19 lines)
                                                       but doesn't use Type_Safe

sg_send_qa/ci/__init__.py            1   ok           no change
sg_send_qa/ci/diff_screenshots.py  112   functions    → Type_Safe class
                                                       Currently: 6 loose functions
                                                       Issue: no class structure,
                                                       json.loads for config,
                                                       subprocess calls inline
                                                       Test: NONE — no tests exist
                                                       Priority: HIGH (CI-critical)

sg_send_qa/cli/__init__.py           0   empty        no change
sg_send_qa/cli/generate_docs.py    179   functions    → Type_Safe class, REWRITE
                                                       Currently: 6 loose functions
                                                       Issue: hardcoded paths, no
                                                       class structure, metadata
                                                       handled as raw dicts,
                                                       index generation is a
                                                       string concatenation
                                                       Test: NONE — no tests exist
                                                       Priority: CRITICAL (core tool)

sg_send_qa/cli/run_tests.py         52   functions    → Type_Safe class
                                                       Currently: argparse + subprocess
                                                       Issue: no class structure,
                                                       hardcoded test paths
                                                       Test: NONE
                                                       Priority: MEDIUM

sg_send_qa/server/__init__.py        0   empty        no change
sg_send_qa/server/main.py           49   FastAPI app  → review, add Type_Safe models
                                                       Currently: raw FastAPI with
                                                       dict returns, hardcoded paths
                                                       Issue: not using Serverless__Fast_API
                                                       pattern (but this is a QA tool,
                                                       not SG/Send itself — may be ok)
                                                       Test: NONE
                                                       Priority: LOW (scaffolded, unused endpoints)
```

**Summary: 413 lines of application code. 0 tests for it (except Version).
0 Type_Safe. 6 files need refactoring.**


### 3.2 Test Infrastructure

```
FILE                              LINES  STATE        ACTION
─────────────────────────────────────────────────────────────────────────
tests/conftest.py                   95   functions    → Type_Safe, CONSOLIDATE
  (root conftest)                                      Currently: Playwright setup
                                                       for prod-targeted tests
                                                       Issue: _cdp_screenshot defined
                                                       here AND in v030/conftest AND
                                                       in standalone/conftest AND in
                                                       bugs test (4 copies!)
                                                       ScreenshotCapture defined 3x
                                                       _build_ui_serve_dir defined 2x
                                                       Action: extract shared utilities
                                                       into sg_send_qa/ package

tests/qa/v030/conftest.py          374   class+fns    → Type_Safe, MAJOR REFACTOR
                                                       Currently: largest test infra file
                                                       Has: send_server, ui_server,
                                                       browser, page fixtures
                                                       Has: ScreenshotCapture class
                                                       Has: TransferHelper class (key!)
                                                       Issues:
                                                       - metadata append bug (no dedup)
                                                       - TransferHelper is 75 lines of
                                                         crypto code inside conftest
                                                       - _build_ui_serve_dir duplicated
                                                         from standalone/conftest
                                                       - raw dicts everywhere
                                                       Priority: CRITICAL

tests/standalone/conftest.py       249   functions    → MERGE into shared infrastructure
                                                       Currently: duplicate of v030/conftest
                                                       95% identical code
                                                       Issue: separate fixture set that
                                                       duplicates server setup, UI build,
                                                       Playwright config, screenshots
                                                       Action: consolidate with v030

tests/qa/v030/browser_helpers.py    28   functions    → Type_Safe helper class
                                                       Currently: 2 helper functions
                                                       (goto, handle_access_gate)
                                                       Good patterns but should be
                                                       a class in sg_send_qa/

tests/config/test-config.json       20   config       → Type_Safe config class
                                                       Currently: raw JSON
                                                       Should be loaded into a
                                                       Type_Safe config object
```

**Key finding: _cdp_screenshot is copy-pasted 4 times.
ScreenshotCapture is defined 3 times. _build_ui_serve_dir appears twice.
This is the #1 code duplication problem.**


### 3.3 Test Files — v030 Browser Tests

```
FILE                                          LINES  TESTS  PRI    ACTION
────────────────────────────────────────────────────────────────────────────
tests/qa/v030/test__access_gate.py              94     3    P1     → move to group dir
tests/qa/v030/test__combined_link.py           118     2    P0     → move to group dir
tests/qa/v030/test__friendly_token.py          168     4    P0     → move to group dir
tests/qa/v030/test__navigation.py              162     8    P1     → move to group dir
tests/qa/v030/test__download__gallery.py       149     6    P1     → move to group dir
tests/qa/v030/test__download__viewer.py        116     6    P1     → move to group dir
tests/qa/v030/test__upload__folder.py          169     4    P1     → move to group dir
tests/qa/v030/test__upload__single_file.py     189     4    P1     → move to group dir
tests/qa/v030/test__separate_key.py            180     3    P1     → move to group dir
tests/qa/v030/test__pdf_present.py             255     7    P1     → SPLIT + move
    Contains TestPDFPresentMode (4 tests, PDF group)
    AND TestBrowseSKeyShortcut (3 tests, browse group)
    These are two unrelated test classes in one file.
```

**These test files are generally well-written.** Good docstrings, clear
assertions, appropriate use of fixtures. The refactoring is structural
(move into group directories, ensure markers are set) not quality.


### 3.4 Test Files — v030 via__httpx (API-level)

```
FILE                                          LINES  TESTS  PRI    ACTION
────────────────────────────────────────────────────────────────────────────
tests/qa/v030/via__httpx/test__api_smoke.py    367    21    P1     good quality, keep
tests/qa/v030/via__httpx/test__transfer_helper.py 318  22   P1     good quality, keep
tests/qa/v030/via__httpx/test__zero_knowledge.py 156    5   P0     good quality, keep
tests/qa/v030/via__httpx/test__access_gate.py   26     1    --     tiny, consolidate?
```

**These are the highest quality test files in the repo.** Excellent
docstrings, clear structure, appropriate priorities. The zero-knowledge
test is particularly well-designed. Minor action: ensure all have
priority markers.


### 3.5 Test Files — v030 via__browser (additional)

```
FILE                                          LINES  TESTS  PRI    ACTION
────────────────────────────────────────────────────────────────────────────
tests/qa/v030/via__browser/test__download__browse.py  131  7  P1   good quality
tests/qa/v030/via__browser/test__manual_entry.py       98  5  P1   good quality
```

**Also good quality.** These test the same features as some of the top-level
test files but through different approaches (via__browser vs top-level).
Need to decide: keep both approaches, or consolidate?


### 3.6 Test Files — Special Categories

```
FILE                                          LINES  TESTS  ACTION
────────────────────────────────────────────────────────────────────────────
tests/qa/v030/bugs/
  test__bug__generic_button...py               77     1    well-structured bug test
                                                           has its own _cdp_screenshot
                                                           copy (should use shared)

tests/qa/v030/regressions/
  test__sgmeta_magic_mismatch.py               76     2    good regression test
                                                           well-documented root cause

tests/standalone/
  test__access_gate_standalone.py              92     4    DUPLICATE of v030 access_gate
                                                           Action: merge or deprecate

tests/integration/user/
  test_landing_page.py                         58     3    LEGACY prod-targeted tests
                                                           These are the ones producing
                                                           the S3 error screenshots
                                                           Action: archive or re-target

tests/unit/utils/
  test_Version.py                              19     4    only unit test in the repo
                                                           doesn't use Type_Safe
```

### 3.7 CI Workflows

```
FILE                                          LINES  ACTION
────────────────────────────────────────────────────────────────────────────
ci-pipeline.yml                                147   base workflow (callable)
                                                     runs unit + browser + docs + deploy
                                                     GOOD structure, needs path updates
                                                     after test restructuring

ci-pipeline__dev.yml                            16   triggers base for dev branch — ok
ci-pipeline__main.yml                           16   triggers base for main branch — ok

qa-acceptance-tests.yml                        229   EXCELLENT structure
                                                     3 parallel jobs: P0, P1, P2/P3
                                                     P0 blocks, P1 continue-on-error,
                                                     P2/P3 informational
                                                     Needs: path updates, possibly
                                                     multi-target support (dev/prod)
```


---

## 4. Code Duplication Map

The most urgent engineering problem in the repo:

```
    _cdp_screenshot()                     DEFINED 4 TIMES
    ┌─────────────────────────────────────────────────────────────────┐
    │  1. tests/conftest.py                    (root)                 │
    │  2. tests/qa/v030/conftest.py            (v030)                 │
    │  3. tests/standalone/conftest.py         (standalone)           │
    │  4. tests/qa/v030/bugs/test__bug__*.py   (inline in test!)     │
    └─────────────────────────────────────────────────────────────────┘
    All 4 are identical. Should be ONE function in sg_send_qa/.

    ScreenshotCapture class                 DEFINED 3 TIMES
    ┌─────────────────────────────────────────────────────────────────┐
    │  1. tests/conftest.py                    (simple version)       │
    │  2. tests/qa/v030/conftest.py            (composite metadata)  │
    │  3. tests/standalone/conftest.py         (standalone version)   │
    └─────────────────────────────────────────────────────────────────┘
    3 different implementations with different metadata schemas.
    Should be ONE class in sg_send_qa/ with configurable metadata format.

    _build_ui_serve_dir()                   DEFINED 2 TIMES
    ┌─────────────────────────────────────────────────────────────────┐
    │  1. tests/qa/v030/conftest.py            (v030)                 │
    │  2. tests/standalone/conftest.py         (standalone)           │
    └─────────────────────────────────────────────────────────────────┘
    Nearly identical. Should be ONE function in sg_send_qa/.

    TransferHelper class                    DEFINED 1 TIME (good)
    ┌─────────────────────────────────────────────────────────────────┐
    │  1. tests/qa/v030/conftest.py            (75 lines, good code) │
    └─────────────────────────────────────────────────────────────────┘
    Well-written but buried inside conftest.py.
    Should be extracted to sg_send_qa/ as a reusable Type_Safe class.
```


---

## 5. Proposed Target Architecture

### 5.1 Package Structure (After Refactoring)

```
    sg_send_qa/
    ├── __init__.py
    ├── version
    │
    ├── models/                              ← NEW: all Type_Safe data classes
    │   ├── __init__.py
    │   ├── QA_Types.py                      ← metadata, screenshot, group schemas
    │   └── QA_Config.py                     ← test-config.json as Type_Safe
    │
    ├── utils/
    │   ├── __init__.py
    │   ├── Version.py                       ← REFACTOR to Type_Safe
    │   ├── QA_Screenshot.py                 ← NEW: extracted _cdp_screenshot
    │   ├── QA_Screenshot_Capture.py         ← NEW: extracted ScreenshotCapture
    │   ├── QA_Transfer_Helper.py            ← NEW: extracted from conftest
    │   └── QA_UI_Server.py                  ← NEW: extracted _build_ui_serve_dir
    │
    ├── ci/
    │   ├── __init__.py
    │   └── QA_Diff_Screenshots.py           ← REFACTOR to Type_Safe class
    │
    ├── cli/
    │   ├── __init__.py
    │   ├── QA_Generate_Docs.py              ← REWRITE as Type_Safe class
    │   └── QA_Run_Tests.py                  ← REFACTOR to Type_Safe class
    │
    └── server/
        ├── __init__.py
        └── QA_Server.py                     ← REFACTOR to Type_Safe class
```

**Key principle:** Everything reusable moves OUT of conftest files and INTO
the `sg_send_qa/` package. Conftest files become thin — they import from
the package and wire up fixtures.

### 5.2 Test Structure (After Refactoring)

```
    tests/
    ├── conftest.py                          ← THIN: imports from sg_send_qa/
    ├── config/
    │   └── test-config.json
    │
    ├── unit/                                ← tests for the QA framework itself
    │   ├── models/
    │   │   └── test__QA_Types.py
    │   ├── utils/
    │   │   ├── test__Version.py             ← REFACTOR to Type_Safe
    │   │   ├── test__QA_Screenshot.py       ← NEW
    │   │   ├── test__QA_Screenshot_Capture.py ← NEW
    │   │   ├── test__QA_Transfer_Helper.py  ← NEW
    │   │   └── test__QA_UI_Server.py        ← NEW
    │   ├── ci/
    │   │   └── test__QA_Diff_Screenshots.py ← NEW
    │   └── cli/
    │       ├── test__QA_Generate_Docs.py    ← NEW
    │       └── test__QA_Run_Tests.py        ← NEW
    │
    ├── qa/v030/                             ← acceptance tests (grouped)
    │   ├── conftest.py                      ← THIN: fixtures only
    │   ├── browser_helpers.py               ← → move to sg_send_qa/
    │   │
    │   ├── access_gate/
    │   │   └── test__access_gate.py
    │   ├── upload_share/
    │   │   ├── test__combined_link.py
    │   │   ├── test__friendly_token.py
    │   │   └── test__upload__single_file.py
    │   ├── navigation/
    │   │   └── test__navigation.py
    │   ├── gallery/
    │   │   └── test__download__gallery.py
    │   ├── browse/
    │   │   ├── test__upload__folder.py
    │   │   └── test__browse_keyboard.py     ← extracted from test__pdf_present
    │   ├── viewer/
    │   │   └── test__download__viewer.py
    │   ├── separate_key/
    │   │   └── test__separate_key.py
    │   ├── pdf/
    │   │   └── test__pdf_present.py         ← PDF tests only (browse extracted)
    │   │
    │   ├── via__httpx/                      ← API-level tests (keep as-is)
    │   │   ├── test__api_smoke.py
    │   │   ├── test__transfer_helper.py
    │   │   └── test__zero_knowledge.py
    │   │
    │   ├── via__browser/                    ← additional browser tests
    │   │   ├── test__download__browse.py
    │   │   └── test__manual_entry.py
    │   │
    │   ├── bugs/                            ← tests that pass while buggy
    │   │   └── test__bug__generic_button.py ← remove inline _cdp_screenshot
    │   │
    │   └── regressions/                     ← regression guards
    │       └── test__sgmeta_magic_mismatch.py
    │
    ├── integration/                         ← ARCHIVE or re-target
    │   └── user/
    │       └── test_landing_page.py         ← legacy prod tests
    │
    └── standalone/                          ← MERGE into qa/v030 or REMOVE
        ├── conftest.py                      ← duplicated code → extract
        └── test__access_gate_standalone.py  ← duplicate → merge
```


### 5.3 Site Structure (After Refactoring)

```
    sg_send_qa__site/pages/use-cases/
    ├── _groups.json                         ← minimal: test_dir→site_dir mapping
    ├── index.md                             ← auto-generated grouped index
    │
    ├── 01-access-gate/
    │   ├── _group.json                      ← group manifest
    │   ├── access_gate/                     ← use-case folder (with screenshots/)
    │   ├── bogus_token_shows_error/
    │   └── _duplicates/
    │       └── ... (redirect pages)
    │
    ├── 02-upload-share/
    │   ├── _group.json
    │   ├── combined_link/
    │   ├── friendly_token/
    │   └── _duplicates/
    │
    ├── 03-separate-key/ ... 08-pdf/
    │
    ├── _archived/
    │   └── (3 legacy S3-error pages)
    │
    └── _bugs/
        └── bugs/
```


---

## 6. Refactoring Phases

### Phase 1: Extract and Consolidate (Foundation)

**Goal:** Eliminate all code duplication. Create the Type_Safe package structure.
Every piece of reusable code moves into `sg_send_qa/`.

```
    DELIVERABLES:
    ├── sg_send_qa/models/QA_Types.py         Type_Safe data classes
    ├── sg_send_qa/models/QA_Config.py        Type_Safe config loader
    ├── sg_send_qa/utils/QA_Screenshot.py     _cdp_screenshot (ONE copy)
    ├── sg_send_qa/utils/QA_Screenshot_Capture.py  ScreenshotCapture (ONE copy)
    ├── sg_send_qa/utils/QA_Transfer_Helper.py     TransferHelper (extracted)
    ├── sg_send_qa/utils/QA_UI_Server.py      _build_ui_serve_dir (ONE copy)
    ├── sg_send_qa/utils/Version.py           refactored to Type_Safe
    │
    ├── tests/unit/utils/test__QA_Screenshot.py
    ├── tests/unit/utils/test__QA_Screenshot_Capture.py
    ├── tests/unit/utils/test__QA_Transfer_Helper.py
    ├── tests/unit/utils/test__QA_UI_Server.py
    ├── tests/unit/models/test__QA_Types.py
    └── tests/unit/models/test__QA_Config.py

    ESTIMATED EFFORT: 3-4 hours
    RISK: LOW — new files, no existing behaviour changes
    TEST: All new code has unit tests. Run existing tests to verify nothing broke.
```

### Phase 2: Refactor Conftest Files (Infrastructure)

**Goal:** Make conftest files thin. They import from the package and
wire up fixtures. No business logic, no utility functions, no classes.

```
    DELIVERABLES:
    ├── tests/conftest.py                     THIN: shared Playwright fixtures
    ├── tests/qa/v030/conftest.py             THIN: imports QA_Transfer_Helper,
    │                                                QA_Screenshot_Capture, QA_UI_Server
    ├── tests/standalone/conftest.py          REMOVED (merged into v030)
    └── tests/standalone/test__*              MOVED to appropriate v030 group

    ESTIMATED EFFORT: 2-3 hours
    RISK: MEDIUM — changes test infrastructure, could break test discovery
    TEST: Run full pytest suite after each change. CI green = safe.
```

### Phase 3: Refactor Application Code (Tools)

**Goal:** Every file in `sg_send_qa/ci/` and `sg_send_qa/cli/` becomes
a Type_Safe class with full test coverage.

```
    DELIVERABLES:
    ├── sg_send_qa/ci/QA_Diff_Screenshots.py  Type_Safe rewrite
    ├── sg_send_qa/cli/QA_Generate_Docs.py    Type_Safe rewrite (biggest file)
    ├── sg_send_qa/cli/QA_Run_Tests.py        Type_Safe rewrite
    │
    ├── tests/unit/ci/test__QA_Diff_Screenshots.py
    ├── tests/unit/cli/test__QA_Generate_Docs.py
    └── tests/unit/cli/test__QA_Run_Tests.py

    ESTIMATED EFFORT: 4-5 hours (generate_docs is ~2 hours alone)
    RISK: MEDIUM — generate_docs is CI-critical
    TEST: Run generate_docs.py before and after, diff output.
```

### Phase 4: Restructure Filesystem (IA)

**Goal:** Move use-case folders into 8 groups. Move test files into
matching group directories. Update CI paths.

```
    DELIVERABLES:
    ├── 50x use-case folders moved (git mv)
    ├── 10x test files moved (git mv)
    ├── 8x _group.json manifests created
    ├── 1x _groups.json mapping created
    ├── test__pdf_present.py SPLIT into pdf + browse tests
    ├── CI workflow paths updated
    └── conftest screenshot output paths updated

    ESTIMATED EFFORT: 2-3 hours
    RISK: HIGH — many files move, CI paths change, permalink stability
    TEST: Run full CI pipeline after merge. Verify Jekyll site renders.
```

### Phase 5: Site Regeneration (Visible Output)

**Goal:** Generate the new grouped index, enriched pages, sidebar,
dashboard. The QA site reflects the new architecture.

```
    DELIVERABLES:
    ├── Updated default.html (sidebar reads from filesystem)
    ├── Generated grouped index.md
    ├── 31 enriched auto-scaffolded pages (from 19→40+ lines)
    ├── 9 redirect pages for duplicates
    ├── Dashboard page (dashboard.md)
    ├── 3 legacy pages moved to _archived/
    └── Updated roadmap page

    ESTIMATED EFFORT: 2-3 hours
    RISK: LOW — visible changes only, no infrastructure impact
    TEST: jekyll serve locally. Visual inspection.
```

### Phase Summary

```
    PHASE   SCOPE                    EFFORT    RISK    DEPENDS ON
    ──────────────────────────────────────────────────────────────
      1     Extract + Type_Safe      3-4 hrs   LOW     nothing
      2     Conftest consolidation   2-3 hrs   MED     Phase 1
      3     Application code         4-5 hrs   MED     Phase 1
      4     Filesystem restructure   2-3 hrs   HIGH    Phase 2
      5     Site regeneration        2-3 hrs   LOW     Phase 3+4
    ──────────────────────────────────────────────────────────────
            TOTAL                   13-18 hrs
    
      Phases 1-3 can be done in 2-3 Claude Code sessions.
      Phase 4 is one focused session (many git mv commands).
      Phase 5 can be done in Claude Web if needed.
```


---

## 7. Files That Don't Change

For completeness — these are already good and need no refactoring:

```
    NO CHANGE:
    ├── tests/qa/v030/via__httpx/test__api_smoke.py          excellent quality
    ├── tests/qa/v030/via__httpx/test__transfer_helper.py    excellent quality
    ├── tests/qa/v030/via__httpx/test__zero_knowledge.py     excellent quality
    ├── tests/qa/v030/bugs/test__bug__generic_button*.py     well-structured (remove inline screenshot)
    ├── tests/qa/v030/regressions/test__sgmeta_magic*.py     well-documented
    ├── .github/workflows/qa-acceptance-tests.yml            excellent CI structure
    ├── .github/workflows/ci-pipeline__dev.yml               simple trigger, ok
    ├── .github/workflows/ci-pipeline__main.yml              simple trigger, ok
    ├── sg_send_qa__site/_layouts/default.html                good (sidebar changes in Phase 5)
    ├── sg_send_qa__site/pages/pipeline/pipeline.md           good documentation
    ├── 4x hand-crafted use-case pages                        excellent (never overwrite)
    └── team/ role definitions                                appropriate scope
```


---

## 8. Naming Conventions (for Refactored Code)

Following the main SG/Send project patterns:

```
    CLASS NAMING:
    ├── QA_Screenshot                    ← Type_Safe, utility
    ├── QA_Screenshot_Capture            ← Type_Safe, fixture helper
    ├── QA_Transfer_Helper               ← Type_Safe, crypto helper
    ├── QA_UI_Server                     ← Type_Safe, server builder
    ├── QA_Diff_Screenshots              ← Type_Safe, CI tool
    ├── QA_Generate_Docs                 ← Type_Safe, CLI tool
    ├── QA_Run_Tests                     ← Type_Safe, CLI tool
    ├── QA_Config                        ← Type_Safe, config loader
    ├── QA_Use_Case_Metadata             ← Type_Safe, data model
    ├── QA_Group_Manifest                ← Type_Safe, data model
    └── QA_Site_Summary                  ← Type_Safe, data model

    FILE NAMING:
    ├── sg_send_qa/utils/QA_Screenshot.py      ← matches class name
    ├── tests/unit/utils/test__QA_Screenshot.py ← test__ prefix
    └── (all follow this pattern)

    TERMINOLOGY:
    ├── "QA server" not "local stack"    ← avoids LocalStack confusion
    ├── "test_target" values: "qa_server", "production", "dev", "main"
    └── Priority markers: @pytest.mark.p0, p1, p2, p3
```


---

## 9. Dependencies to Add

The QA repo needs `osbot-utils` in its requirements:

```
    requirements.txt additions:
    ├── osbot-utils                      ← for Type_Safe
    └── (already has: cryptography, playwright, fastapi, pytest, httpx, pillow)
```

`pyproject.toml` should also list it under `[tool.poetry.dependencies]`.


---

## 10. Success Criteria

The refactoring is complete when:

```
    ☐  Every Python class uses Type_Safe as base class
    ☐  _cdp_screenshot exists in exactly 1 place
    ☐  ScreenshotCapture exists in exactly 1 place
    ☐  _build_ui_serve_dir exists in exactly 1 place
    ☐  TransferHelper is a standalone Type_Safe class in sg_send_qa/
    ☐  Every file in sg_send_qa/ has a corresponding test file
    ☐  conftest files are thin (fixtures only, no utility functions)
    ☐  tests/standalone/ is merged or removed
    ☐  tests/integration/ is archived or re-targeted
    ☐  Test files mirror site group structure
    ☐  _metadata.json deduplication bug is fixed
    ☐  All 122 existing tests still pass
    ☐  CI pipelines are green
    ☐  QA site renders with grouped navigation
    ☐  0 references to "local stack" in code or docs
```

---

*Villager Refactoring Brief · SG/Send QA · v0.2.14 · 23 March 2026*
*Produced by Conductor + Architect audit · For execution by Claude Code sessions*

---

## Cross-References (Brief Pack)

| Related Document | Relevance |
|-----------------|-----------|
| [00 Introduction](00-introduction.md) | Stakeholder principles driving this refactoring |
| [01 Designer](01-designer__ia-research.md) | IA research — site structure target |
| [02 Architect](02-architect__data-models-and-boundaries.md) | Data models — Type_Safe schemas for all structures |
| [03 Dev](03-dev__implementation-plan.md) | Code patches — how to execute each phase |
| [04 DevOps](04-devops__ci-pipeline-review.md) | CI pipeline — ships with Phase 4 |
