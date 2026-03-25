<!-- Brief Pack Document 01 of 05 | See INDEX.md for navigation -->

# Use-Cases Information Architecture — Designer Research Report (Rev 2)

**Role:** Designer (Explorer team)
**Version:** v0.16.52
**Date:** 23 March 2026 (Revised)
**Scope:** `sg_send_qa__site/pages/use-cases/` — all 50 folders, 73 screenshots, 48 metadata files
**Method:** Full filesystem audit + live site review + CI pipeline cross-reference + stakeholder feedback
**Target audience:** QA team, Dinis Cruz, all agents consuming QA output

---

## Executive Summary

The QA pipeline works mechanically. Tests run, screenshots are captured,
documentation is generated. But the information architecture hasn't kept up
with the test coverage, and — more fundamentally — the documents from the
first pass didn't capture what this platform actually is.

**What we validated:** We now have the ability to run the full SG/Send site
in browser automation — in Claude Code sessions, in Claude Web conversations,
and in the CI pipeline. We can start an in-memory server, seed it with data,
browse pages, take screenshots, and create dynamic documentation. This is
not just a test suite. It's a **living documentation platform** with three
distinct execution modes, and the site is one output of that platform.

**What needs fixing:** The site's navigation surfaces only 6 of 50 use-case
folders. The 3 most visible pages show S3 XML errors. The folder structure
doesn't encode its own meaning. And the architecture doesn't yet reflect
the multi-environment lifecycle (dev → main → prod) or the cross-team
communication role this site already plays.

---

## 1. The Platform — What We Actually Built

Before talking about information architecture, we need to name what exists.
The first-pass documents treated this as "a QA site with navigation problems."
It's bigger than that.

### 1.1 Three Execution Modes

```
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                     QA PLATFORM EXECUTION MODES                        │
    │                                                                         │
    │  ┌───────────────────────┐                                              │
    │  │  1. LLM CODING        │  Claude Code sessions                       │
    │  │                        │  Writing tests, creating capabilities,      │
    │  │  Develops.             │  refactoring, handling broken tests.        │
    │  │  Creates new tests.    │  Full repo access, git push.               │
    │  │  Fixes broken tests.   │  Receives complex briefs.                  │
    │  │  Refactors structure.  │  Writes code that follows Type_Safe,       │
    │  │                        │  osbot-utils, project standards.           │
    │  └───────────┬───────────┘                                              │
    │              │ produces code                                             │
    │              ▼                                                           │
    │  ┌───────────────────────┐                                              │
    │  │  2. LLM ANALYSIS      │  Claude Web sessions (like this one)        │
    │  │                        │  Loads repo, has conversations about        │
    │  │  Analyses.             │  workflows. Uses screenshots as            │
    │  │  Converses.            │  conversation artefacts. Designer,         │
    │  │  Iterates.             │  Architect, Sherpa work here.              │
    │  │  Documents.            │  Can iterate on specific files,            │
    │  │                        │  specific pages, specific issues.          │
    │  └───────────┬───────────┘                                              │
    │              │ informs                                                   │
    │              ▼                                                           │
    │  ┌───────────────────────┐                                              │
    │  │  3. CI PIPELINE        │  GitHub Actions, automated                 │
    │  │                        │  No LLM (for now). Fast execution.         │
    │  │  Executes.             │  Regression confirmation. Screenshot       │
    │  │  Gates releases.       │  capture. Documentation generation.        │
    │  │  Captures evidence.    │  Runs against dev, main, AND prod.         │
    │  │  Deploys docs.         │  Gateway before release to dev.            │
    │  └───────────────────────┘                                              │
    └─────────────────────────────────────────────────────────────────────────┘
```

This distinction matters for the IA because:

- The **CI Pipeline** produces the screenshots and metadata that populate the site.
- The **LLM Coding** phase creates the tests, fixes broken ones, moves tests
  between categories (feature → bug → regression), and maintains the site structure.
- The **LLM Analysis** phase uses the site as a conversation surface — viewing
  screenshots, discussing workflows with the Designer or Architect, briefing
  other teams.

The site must serve all three modes. It's not just "documentation for humans."
It's also an **agent-consumable artefact** — pages designed so that an LLM
in any of these modes can read them and understand what's happening.

### 1.2 What We Validated (Key Milestone)

This deserves explicit documentation because it's the foundation everything
else builds on:

```
    ✓  Full SG/Send site running in browser automation
    ✓  In-memory server startup with seeded data
    ✓  Page browsing and interaction via Playwright
    ✓  Screenshot capture via CDP
    ✓  Dynamic documentation generation from test output
    ✓  Visual diff noise gate (1% threshold)
    ✓  Auto-commit and Jekyll deploy in CI
    ✓  Works in Claude Code, Claude Web, AND CI pipeline
    ✓  Cross-team communication via generated pages (QA → SG/Send web team)
```

### 1.3 Multi-Environment Lifecycle

Tests don't just run against one target. The lifecycle of a bug or feature
is tracked across environments:

```
    ┌──────┐      ┌──────┐      ┌──────┐
    │  dev │─────▶│ main │─────▶│ prod │
    └──┬───┘      └──┬───┘      └──┬───┘
       │             │             │
       ▼             ▼             ▼
    ┌──────┐      ┌──────┐      ┌──────┐
    │ PASS │      │ FAIL │      │ FAIL │  ← "Fixed in dev, not yet in prod"
    └──────┘      └──────┘      └──────┘

    The site should show WHERE a test passes or fails.
    A bug's status includes its deployment position.
```

This changes the IA: each use case needs not just "pass/fail" but
"passes in dev, fails in main, fails in prod."


---

## 2. Inventory — What's on Disk

### 2.1 Summary Numbers

```
    ┌─────────────────────────────────────────────────────┐
    │              USE-CASE FOLDER INVENTORY               │
    ├─────────────────────────────────┬───────────────────┤
    │  Total folders                  │        50         │
    │  With screenshots (≥1 PNG)      │        39         │
    │  With zero screenshots          │        11         │
    │  Total PNG files                │        73         │
    │  Total disk space               │      4.4 MB       │
    ├─────────────────────────────────┼───────────────────┤
    │  Hand-crafted pages (>40 lines) │         8         │
    │  Auto-scaffolded (19 lines)     │        31         │
    │  Auto-scaffolded (11 lines, 0   │        11         │
    │    screenshots = stub only)     │                   │
    ├─────────────────────────────────┼───────────────────┤
    │  In sidebar navigation          │         6  (12%)  │
    │  In use-cases index table       │         5  (10%)  │
    │  Completely invisible           │        44  (88%)  │
    ├─────────────────────────────────┼───────────────────┤
    │  Composite pages (multi-test)   │         4         │
    │  Duplicate of a composite       │         9         │
    │  Stale screenshots (S3 errors)  │         3         │
    └─────────────────────────────────┴───────────────────┘
```

### 2.2 Evidence Quality

```
    STRONG ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  4   Hand-crafted, multi-screenshot composites
      GOOD ████████████████████████████████████████████ 30   Auto-scaffolded, at least 1 screenshot
     STALE █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  3   Screenshots show S3 errors, not UI
      NONE ██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░ 11   Folder exists, 0 screenshots
       N/A ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  2   Special pages (bugs, index)
```

### 2.3 Full Folder List by Group

Every folder in `sg_send_qa__site/pages/use-cases/`, categorised by user
action. Evidence: ● strong, ◉ good, ◎ stale, ○ none.

```
GROUP: ACCESS GATE (5 folders)
├── ● access_gate                         4 screenshots  228 lines  UC-10 P1  hand-crafted
├── ◉ upload_accessible_with_token        2 screenshots   25 lines  DUPLICATE of access_gate
├── ◉ wrong_token_shows_error             1 screenshot    19 lines  DUPLICATE of access_gate
├── ◉ bogus_token_shows_error             1 screenshot    19 lines
└── ○ upload_zone_visible_without_gate    0 screenshots   11 lines  DUPLICATE of access_gate

GROUP: LANDING — LEGACY (3 folders)
├── ◎ landing_page_loads                  1 screenshot    91 lines  hand-crafted  SHOWS S3 ERROR
├── ◎ landing_page_has_access_gate        1 screenshot   131 lines  hand-crafted  SHOWS S3 ERROR
└── ◎ invalid_token_rejected              3 screenshots  176 lines  hand-crafted  SHOWS S3 ERROR

GROUP: UPLOAD → SHARE (9 folders)
├── ● combined_link                       7 screenshots  260 lines  UC-04 P0  hand-crafted
├── ◉ combined_link_upload_and_auto_decrypt  6 screenshots  49 lines  DUPLICATE
├── ◉ combined_link_via_api_helper        1 screenshot    19 lines  DUPLICATE
├── ● friendly_token                      8 screenshots  422 lines  UC-03 P0  hand-crafted
├── ◉ friendly_token_upload_and_resolve   3 screenshots   31 lines  DUPLICATE
├── ◉ friendly_token_format               3 screenshots   31 lines  DUPLICATE
├── ◉ friendly_token_resolves_in_new_tab  3 screenshots   31 lines  DUPLICATE
└── ◉ friendly_token_no_key_in_url_after_decrypt  3 screenshots  31 lines  DUPLICATE

GROUP: NAVIGATION (10 folders)
├── ● route_handling                      0 screenshots  106 lines  UC-11 P1  hand-crafted
├── ◉ gallery_route                       1 screenshot    19 lines
├── ◉ browse_route                        1 screenshot    19 lines
├── ◉ view_route                          1 screenshot    19 lines
├── ◉ short_v_route                       1 screenshot    19 lines
├── ◉ download_route_auto_detect          1 screenshot    19 lines
├── ◉ hash_navigation_to_download         1 screenshot    19 lines  P1
├── ○ gallery_to_browse_hash_preserved    0 screenshots   11 lines
├── ○ browse_to_gallery_hash_preserved    0 screenshots   11 lines
└── ○ copy_link_includes_key              0 screenshots   11 lines  P1

GROUP: DOWNLOAD — GALLERY (6 folders)
├── ◉ gallery_page_loads                  1 screenshot    19 lines
├── ◉ view_mode_buttons_present           1 screenshot    19 lines
├── ◉ action_buttons_present              1 screenshot    19 lines
├── ◉ info_panel_toggle                   1 screenshot    19 lines
├── ◉ lightbox_opens_on_thumbnail         1 screenshot    19 lines
└── ○ lightbox_arrow_navigation           0 screenshots   11 lines

GROUP: DOWNLOAD — VIEWER (6 folders)
├── ◉ viewer_page_loads                   1 screenshot    19 lines
├── ◉ markdown_content_displayed          1 screenshot    19 lines
├── ◉ share_button_present                2 screenshots   25 lines
├── ◉ copy_url_contains_key               1 screenshot    19 lines
├── ◉ save_locally_button_present         1 screenshot    19 lines
└── ◉ short_url_v_route                   1 screenshot    19 lines

GROUP: DOWNLOAD — BROWSE (4 folders)
├── ◉ browse_page_loads                   1 screenshot    19 lines
├── ◉ folder_tree_present                 1 screenshot    19 lines
├── ◉ keyboard_navigation_j_k            2 screenshots   25 lines  P2
└── ○ file_click_opens_preview            0 screenshots   11 lines

GROUP: DOWNLOAD — PDF (2 folders)
├── ○ pdf_lightbox_opens                  0 screenshots   11 lines
└── ○ present_button_visible_for_pdf      0 screenshots   11 lines

GROUP: SEPARATE KEY (3 folders)
├── ◉ entry_form_shown_without_hash       1 screenshot    19 lines
├── ◉ entry_form_has_decrypt_button       1 screenshot    19 lines
└── ◉ valid_transfer_id_resolves          1 screenshot    19 lines

GROUP: SHARE UI (2 folders)
├── ◉ share_tab_present                   1 screenshot    19 lines
└── ○ info_tab_present                    0 screenshots   11 lines

GROUP: META (1 folder)
└── – bugs                                0 screenshots   42 lines  hand-crafted
```


---

## 3. The Good, the Bad, and the Ugly

### 3.1 The Good

**The technology is validated end-to-end.** In-memory server, seeded data,
Playwright browsing, CDP screenshots, doc generation, visual diff, auto-commit,
Jekyll deploy. This works in all three execution modes.

**4 composite pages are excellent.** `access_gate` (228 lines), `combined_link`
(260 lines), `friendly_token` (422 lines), and `route_handling` (106 lines)
are the gold standard for what every use case should become.

**Screenshots are real conversation artefacts.** The v0.3.0 screenshots
captured from the in-memory test server show the actual SG/Send UI. These
aren't just test evidence — they're the basis for design conversations,
architecture discussions, and cross-team briefs. When the Designer or
Architect wants to discuss a workflow, these pages are the surface.

**Cross-team communication already works.** The QA site already has pages
that communicate with the SG/Send web team — change requests produced by
the QA team, consumed by the web team, with responses. This is the
beginning of the site as an inter-team communication channel.

**The bug testing pattern is elegant.** Bug tests assert buggy behaviour.
When fixed, the test fails → remove it. Clear lifecycle.

### 3.2 The Bad

**88% of content is invisible.** 44 of 50 folders don't appear in the
sidebar or index. The site actively understates its own coverage.

**9 folders are duplicates of composite pages.** Creates confusion about
the canonical location of test documentation.

**Auto-scaffolded pages are minimal to uselessness.** 31 pages at 19 lines
each. No context, no grouping, no relationship to adjacent tests.

**The Roadmap page is completely stale.** Lists US-04 through US-15 as
future work. Most are already implemented.

**No multi-environment awareness.** The site shows no distinction between
test environments. You can't tell whether a test passes in dev, main, or
prod.

**No execution mode awareness.** There's no indication of whether a page
was generated by CI, analysed by an LLM, or hand-crafted.

**Python code doesn't follow project standards.** The QA repo Python code
(`generate_docs.py`, `diff_screenshots.py`, `conftest.py`) doesn't use
Type_Safe or osbot-utils patterns. It grew organically to prove the
technology. Now it needs to match the main project's code standards.

### 3.3 The Ugly

**3 legacy screenshots show S3 XML errors.** `landing_page_loads`,
`landing_page_has_access_gate`, `invalid_token_rejected` are the most
visible pages and they show `<Error><Code>AccessDenied</Code></Error>`.

**Metadata accumulates duplicate entries on every CI run.** The conftest
fixture appends instead of deduplicating. Files grow without bound.

**The homepage showcases only stale legacy tests.** 47 use cases with
real UI screenshots are hidden behind 3 broken ones.

**The folder structure doesn't encode its own meaning.** All 50 use-case
folders are flat siblings in one directory. The filesystem doesn't tell you
which group a test belongs to, what its priority is, or how it relates to
other tests. The filesystem should BE the database.


---

## 4. Proposed Information Architecture

### 4.1 Core Principle: Filesystem as Database

The first-pass documents proposed a central `use_case_groups.json` mapping
file. This is wrong. The feedback is clear: **the folder structure itself
should encode the grouping.** Discovery, not configuration.

```
    CURRENT STRUCTURE (flat, meaningless):

    pages/use-cases/
    ├── access_gate/
    ├── action_buttons_present/
    ├── bogus_token_shows_error/
    ├── browse_page_loads/
    ├── browse_route/
    ├── ... (50 folders, no hierarchy)
    └── wrong_token_shows_error/


    PROPOSED STRUCTURE (grouped, self-describing):

    pages/use-cases/
    ├── _groups.json                          ← group ordering + display metadata
    ├── index.md                              ← auto-generated from folder walk
    │
    ├── 01-access-gate/
    │   ├── _group.json                       ← group manifest: name, icon, desc
    │   ├── access_gate/
    │   │   ├── access_gate.md
    │   │   └── screenshots/
    │   ├── bogus_token_shows_error/
    │   │   ├── bogus_token_shows_error.md
    │   │   └── screenshots/
    │   └── _duplicates/
    │       ├── upload_accessible_with_token/  ← redirect pages
    │       ├── wrong_token_shows_error/
    │       └── upload_zone_visible_without_gate/
    │
    ├── 02-upload-share/
    │   ├── _group.json
    │   ├── combined_link/
    │   ├── friendly_token/
    │   └── _duplicates/
    │       ├── combined_link_upload_and_auto_decrypt/
    │       └── ... (6 more)
    │
    ├── 03-separate-key/
    │   ├── _group.json
    │   ├── entry_form_shown_without_hash/
    │   ├── entry_form_has_decrypt_button/
    │   └── valid_transfer_id_resolves/
    │
    ├── 04-navigation/
    │   ├── _group.json
    │   ├── route_handling/
    │   ├── gallery_route/
    │   └── ... (8 more)
    │
    ├── 05-gallery/
    │   ├── _group.json
    │   └── ... (6 use cases)
    │
    ├── 06-browse/
    │   ├── _group.json
    │   └── ... (4 use cases)
    │
    ├── 07-viewer/
    │   ├── _group.json
    │   └── ... (8 use cases)
    │
    ├── 08-pdf/
    │   ├── _group.json
    │   └── ... (2 use cases)
    │
    ├── _archived/
    │   ├── landing_page_loads/
    │   ├── landing_page_has_access_gate/
    │   └── invalid_token_rejected/
    │
    └── _bugs/
        └── bugs/
```

**Why this is better:**

- **The filesystem IS the navigation.** Walk the directory, discover the
  groups. No central mapping to maintain.
- **Each group is self-contained.** The `_group.json` manifest inside each
  group folder defines its display metadata. Move a group, rename it,
  reorder it — it carries its own identity.
- **Numbered prefixes control ordering.** `01-access-gate` sorts before
  `02-upload-share`. No separate `order` field needed.
- **Duplicates are explicitly subordinate.** The `_duplicates/` subfolder
  makes it visually obvious which folders are redirects.
- **Archived items are visually separated.** The `_archived/` prefix
  (with underscore) signals "not current."
- **Discovery works for new test files.** When CI creates a new use-case
  folder, the generator can place it in the right group folder using the
  test-file-to-group mapping in the test file itself (a comment or marker),
  not in a central config.

### 4.2 Test Structure Should Mirror Site Structure

The tests should be organised the same way:

```
    CURRENT TEST STRUCTURE:

    tests/qa/v030/
    ├── test__access_gate.py
    ├── test__combined_link.py
    ├── test__download__gallery.py
    ├── test__download__viewer.py
    ├── test__friendly_token.py
    ├── test__navigation.py
    ├── test__pdf_present.py
    ├── test__separate_key.py
    ├── test__upload__folder.py
    └── test__upload__single_file.py


    PROPOSED TEST STRUCTURE (mirrors site groups):

    tests/qa/v030/
    ├── access_gate/
    │   └── test__access_gate.py
    ├── upload_share/
    │   ├── test__combined_link.py
    │   ├── test__friendly_token.py
    │   └── test__upload__single_file.py
    ├── separate_key/
    │   └── test__separate_key.py
    ├── navigation/
    │   └── test__navigation.py
    ├── gallery/
    │   └── test__download__gallery.py
    ├── browse/
    │   └── test__upload__folder.py
    ├── viewer/
    │   └── test__download__viewer.py
    └── pdf/
        └── test__pdf_present.py
```

The group subfolder name in `tests/qa/v030/{group}/` matches the group
folder name in `pages/use-cases/{NN}-{group}/`. The test's location
in the filesystem tells the generator where to put its output. No mapping
file needed.


### 4.3 Design Principle: Follow the User Journey

The 8 groups follow SG/Send's natural flow:

```
    GATE ──▶ UPLOAD ──▶ SHARE MODE ──▶ LINK ──▶ RECIPIENT OPENS ──▶ DECRYPT ──▶ VIEW
     │          │           │                         │                  │
     ▼          ▼           ▼                         ▼                  ▼
  01-access  02-upload   02-upload               04-navigation      05-gallery
    -gate     -share      -share                                    06-browse
                                                 03-separate        07-viewer
                                                    -key            08-pdf
```


### 4.4 Proposed Sidebar Navigation

```
    PROPOSED SIDEBAR
    ┌───────────────────────────────────────┐
    │  Navigation                           │
    │  ├── Home                             │
    │  ├── Dashboard                        │
    │  ├── Pipeline                         │
    │  ├── Change Requests                  │
    │  └── Roadmap                          │
    │                                       │
    │  🔐 Access Gate                       │
    │  ├── Access Token Gate (UC-10)     ●  │
    │  └── Bogus Token Error             ◉  │
    │                                       │
    │  📤 Upload & Share                    │
    │  ├── Combined Link (UC-04)         ●  │
    │  └── Friendly Token (UC-03)        ●  │
    │                                       │
    │  🔑 Separate Key                      │
    │  ├── Entry Form                    ◉  │
    │  ├── Decrypt Button                ◉  │
    │  └── Transfer ID Resolves          ◉  │
    │                                       │
    │  🧭 Navigation                        │
    │  ├── Route Handling (UC-11)        ●  │
    │  ├── Gallery Route                 ◉  │
    │  ├── Browse Route                  ◉  │
    │  ├── View Route                    ◉  │
    │  ├── Short /v/ Route               ◉  │
    │  ├── Download Auto-Detect          ◉  │
    │  └── Hash Navigation               ◉  │
    │                                       │
    │  📥 Gallery View                      │
    │  ├── Gallery Loads                 ◉  │
    │  ├── View Mode Buttons             ◉  │
    │  ├── Action Buttons                ◉  │
    │  ├── Info Panel Toggle             ◉  │
    │  └── Lightbox                      ◉  │
    │                                       │
    │  📄 Browse View                       │
    │  ├── Browse Loads                  ◉  │
    │  ├── Folder Tree                   ◉  │
    │  └── Keyboard j/k                  ◉  │
    │                                       │
    │  👁️ Single File Viewer               │
    │  ├── Viewer Loads                  ◉  │
    │  ├── Markdown Content              ◉  │
    │  ├── Share Panel                   ◉  │
    │  ├── Copy URL + Key                ◉  │
    │  └── Save Locally                  ◉  │
    │                                       │
    │  🐛 Bugs                              │
    │  └── Known Bugs                    –  │
    │                                       │
    │  Cross-Team                           │
    │  ├── Change Requests → SG/Send     ←  │
    │  └── Agent Briefs                     │
    │                                       │
    │  Links                                │
    │  ├── SG/Send App                      │
    │  └── GitHub Repo                      │
    └───────────────────────────────────────┘
    
    Sidebar generated by walking the filesystem.
    Groups discovered from numbered folders.
    Members discovered from subfolders.
```


### 4.5 Proposed Use-Cases Index Page

```
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                                                                             │
    │   USE CASES — SG/Send QA                                                    │
    │   All documented user workflows, verified by automated browser tests.       │
    │                                                                             │
    │  ┌───────────────────────────────────────────────────────────────────────┐  │
    │  │                       COVERAGE DASHBOARD                              │  │
    │  │                                                                       │  │
    │  │   Tests: 31 primary  │  Screenshots: 73  │  Evidence: 4● 30◉ 11○    │  │
    │  │                                                                       │  │
    │  │   GATE ──●──▶ UPLOAD ──●──▶ SHARE ──●──▶ ROUTES ──●──▶ VIEWS ──●──  │  │
    │  │   2/2 ✓      2/2 ✓       3/3 ✓       7/10       16/18               │  │
    │  │                                                                       │  │
    │  │   Environments:  dev ✓  │  main ⏳  │  prod ⏳                        │  │
    │  │                                                                       │  │
    │  └───────────────────────────────────────────────────────────────────────┘  │
    │                                                                             │
    ├─────────────────────────────────────────────────────────────────────────────┤
    │                                                                             │
    │   (for each group: heading + table, same as Rev 1)                          │
    │                                                                             │
    │   🔐 ACCESS GATE                                                            │
    │   ┌─────┬───────────────────────────┬────────┬──────┬────────┬────────────┐│
    │   │  #  │ Use Case                  │ Evid.  │  📸  │ Prio   │ dev│main│pr││
    │   ├─────┼───────────────────────────┼────────┼──────┼────────┼────────────┤│
    │   │  1  │ Access Token Gate ★       │   ●    │   4  │ P1     │  ✓ │ ✓ │ ✓││
    │   │  2  │ Bogus Token Error         │   ◉    │   1  │        │  ✓ │  - │ -││
    │   └─────┴───────────────────────────┴────────┴──────┴────────┴────────────┘│
    │                                                                             │
    │   (... 7 more groups ...)                                                   │
    │                                                                             │
    ├─────────────────────────────────────────────────────────────────────────────┤
    │                                                                             │
    │   ⚠️  ARCHIVED                                                              │
    │   Legacy tests. Screenshots not current.                                    │
    │   ├── Landing Page Loads           ◎  S3 AccessDenied                       │
    │   ├── Access Gate Present          ◎  S3 AccessDenied                       │
    │   └── Invalid Token Rejected       ◎  S3 AccessDenied                       │
    │                                                                             │
    └─────────────────────────────────────────────────────────────────────────────┘
```


### 4.6 Proposed Individual Page Template (Enriched)

```
    PROPOSED AUTO-SCAFFOLDED PAGE
    ┌──────────────────────────────────────────────────────────────────┐
    │                                                                  │
    │  # Browse Page Loads                                             │
    │                                                                  │
    │  Browse page loads without errors.                               │
    │                                                                  │
    │  ┌──────────────────────────────────────────────────────┐       │
    │  │ Group:     📄 Browse View                             │       │
    │  │ Test file: tests/qa/v030/browse/test__upload__folder  │       │
    │  │ Class:     TestFolderUpload                           │       │
    │  │ Target:    QA server (in-memory)                      │       │
    │  │ Priority:  —                                          │       │
    │  │ Environments: dev ✓  │  main –  │  prod –             │       │
    │  └──────────────────────────────────────────────────────┘       │
    │                                                                  │
    │  ## What This Verifies                                           │
    │  ...                                                             │
    │                                                                  │
    │  ## Screenshot                                                   │
    │  [screenshot]                                                    │
    │                                                                  │
    │  ## Related                                                      │
    │  - Group: Browse View                                            │
    │  - See also: folder_tree_present, keyboard_j_k                   │
    │  - Change request: CR-003 (if applicable)                        │
    │                                                                  │
    │  ## For Agents                                                   │
    │  This test verifies: browse route renders without console        │
    │  errors. If this test fails, check: send-browse.js, the         │
    │  route detection logic in send-download.js.                      │
    │                                                                  │
    └──────────────────────────────────────────────────────────────────┘

    Note "QA server" not "local stack" — avoids LocalStack confusion.
    Note "For Agents" section — pages are designed for LLM consumption.
    Note "Environments" row — multi-environment lifecycle.
```


### 4.7 Cross-Team and Agent Pages

The QA site is already a communication channel. This should be explicit:

```
    pages/
    ├── use-cases/          ← test documentation (8 groups)
    ├── change-requests/    ← requests TO other teams
    ├── pipeline/           ← how the QA site works
    ├── dashboard/          ← release health at a glance
    ├── roadmap/            ← what's planned
    └── agent-briefs/       ← NEW: pages designed for agent consumption
        ├── for-dev-team/   ← "here's what broke, here's the screenshots"
        ├── for-designer/   ← "here's the current UX flow with evidence"
        └── for-sherpa/     ← "here's the user journey friction points"
```


### 4.8 The Test Maintenance Agent

A new lifecycle needs a new agent. When a feature push breaks a test:

```
    ┌──────────┐     ┌──────────────────────┐     ┌───────────────┐
    │ Feature   │     │ LLM Coding Phase     │     │ CI Pipeline   │
    │ pushed    │────▶│                      │────▶│               │
    │ to dev    │     │ 1. Detect broken test│     │ Bug test PASS │
    └──────────┘     │ 2. Move to _bugs/    │     │ Feature tests │
                      │ 3. Document with     │     │   marked skip │
                      │    screenshots       │     │ No CI failure │
                      │ 4. Create bug test   │     └───────────────┘
                      │    (asserts buggy)   │
                      │ 5. Skip original in  │     ┌───────────────┐
                      │    feature suite     │     │ Fix lands     │
                      └──────────────────────┘     │               │
                                                    │ 1. Bug test   │
                      ┌──────────────────────┐     │    now FAILS  │
                      │ LLM Coding Phase     │◀────│ 2. Trigger    │
                      │                      │     │    LLM phase  │
                      │ 1. Remove bug test   │     └───────────────┘
                      │ 2. Unskip original   │
                      │ 3. Move to regression│
                      │ 4. Update screenshots│
                      └──────────────────────┘
```

This agent needs a role definition. Possibly the **QA Curator** — responsible
for the lifecycle of tests across categories and environments.


---

## 5. Recommended Actions (Revised)

### P0 — Do Now

**5.1** Create the grouped folder structure (`01-access-gate/`, etc.)
with `_group.json` manifests. Move existing use-case folders into their
groups. This is the foundation everything else builds on.

**5.2** Move the 3 legacy test pages to `_archived/`.

**5.3** Fix the metadata accumulation bug in conftest.py.

### P1 — Do This Week

**5.4** Rewrite `generate_docs.py` to walk the grouped filesystem,
discover groups from `_group.json` manifests, generate the sidebar
data, index page, and enriched templates. Must use Type_Safe and
osbot-utils patterns.

**5.5** Refactor all QA repo Python code to project standards
(Type_Safe, osbot-utils, fully tested).

**5.6** Restructure `tests/qa/v030/` to mirror the 8 site groups.

**5.7** Create the Dashboard page with multi-environment awareness.

### P2 — Do This Sprint

**5.8** Add multi-environment columns to use-case pages and index.

**5.9** Create `agent-briefs/` section with pages designed for
cross-team and LLM consumption.

**5.10** Define the QA Curator agent role for test lifecycle management.

**5.11** Update the Roadmap page to reflect current reality.

### P3 — Do When Convenient

**5.12** Add QA tests for the QA site itself (meta-testing).

**5.13** Add live links / embedded components to use-case pages
for interactive documentation.

**5.14** Explore whether the full QA environment can run in
Claude Web sessions (in-memory server + Playwright).

---

*Designer research report (Rev 2) · SGraph Send QA · v0.16.52 · 23 March 2026*

---

## Cross-References (Brief Pack)

| Related Document | Relevance |
|-----------------|-----------|
| [00 Introduction](00-introduction.md) | Platform vision, three execution modes |
| [02 Architect](02-architect__data-models-and-boundaries.md) | Implements this IA as data models and schemas |
| [03 Dev](03-dev__implementation-plan.md) | Concrete code to build the IA |
| [04 DevOps](04-devops__ci-pipeline-review.md) | CI changes needed for test restructuring |
| [05 Refactoring Brief](05-conductor__villager-refactoring-brief.md) | Full repo audit this research fed into |
