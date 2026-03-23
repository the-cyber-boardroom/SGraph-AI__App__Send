# Brief Pack Introduction

**Document:** 00 of 05
**Role:** Librarian
**Pack:** SG/Send QA Villager Refactoring
**Date:** 23 March 2026

---

## What Happened

On 23 March 2026, a Claude Web session (LLM Analysis mode) was conducted with
the SG/Send Conductor agent. The visitor asked the Designer to review the QA
site's information architecture. This cascaded into a full platform review
involving 6 agents: Designer, Architect, Dev, DevOps, Conductor, and Librarian.

The session produced this brief pack — the complete plan for refactoring the
`SG_Send__QA` repository from its current organic-growth state to
Villager-grade engineering quality.

---

## What We Validated (Key Milestone)

Before discussing what needs to change, this is what already works. This is
the technology foundation that the refactoring builds on:

```
    ✓  Full SG/Send v0.3.0 UI running in headless browser automation
    ✓  In-memory API server (QA server) with seeded data, no network, no S3
    ✓  Playwright page browsing, interaction, and form submission
    ✓  CDP screenshot capture (bypasses Playwright's font-wait logic)
    ✓  AES-256-GCM encryption in Python matching browser Web Crypto exactly
    ✓  SGMETA envelope format matching JS upload/download components
    ✓  Dynamic documentation generation from test output
    ✓  Visual diff noise gate at 1% pixel threshold
    ✓  Auto-commit of screenshots and docs in CI
    ✓  Jekyll site build and GitHub Pages deployment
    ✓  Priority-gated CI (P0 blocks, P1 warns, P2/P3 informational)
    ✓  Cross-team communication via generated QA site pages
    ✓  Works in Claude Code sessions, Claude Web sessions, AND CI pipeline
    ✓  122 test methods across 30 Python files
```

**None of this needs to be rebuilt.** The technology is proven. The refactoring
is about engineering quality, code organisation, and information architecture.

---

## Three Execution Modes

The QA platform operates in three distinct modes. This framing comes from
stakeholder feedback and shapes every architectural decision in this pack.

**1. LLM Coding (Claude Code sessions)**

Creates tests, writes infrastructure code, fixes broken tests, manages
the lifecycle of tests across categories (feature → bug → regression).
Full repo access, git push. Receives complex briefs. This is where the
Villager refactoring will be executed.

**2. LLM Analysis (Claude Web sessions)**

Loads the repo, has conversations about workflows. Uses screenshots and
documentation pages as conversation surfaces. The Designer, Architect,
and Sherpa operate here. This session is an example of this mode.

**3. CI Pipeline (GitHub Actions)**

Automated regression. No LLM (for now). Fast execution. Screenshot capture.
Documentation generation. Site deployment. Runs on every push to dev and
main. Gateway before release. The DevOps agent owns this mode.

---

## Scope of Refactoring

### What Changes

| Area | Current State | Target State |
|------|--------------|-------------|
| Python code standards | 0% Type_Safe, raw dicts | 100% Type_Safe, osbot-utils patterns |
| Code duplication | 4× _cdp_screenshot, 3× ScreenshotCapture | Each defined once in sg_send_qa/ |
| Test infrastructure | Business logic buried in 3 conftest files | Thin conftest wrappers, logic in package |
| Application code tests | 0 tests for sg_send_qa/ (except Version) | Full test coverage |
| Site structure | 50 flat folders, 44 invisible | 8 groups following user journey |
| CI pipeline | 2 separate workflows, wrong tests on dev/main | 1 unified 5-layer pipeline |
| Metadata | Accumulates duplicates on every run | Clean dedup on write |
| Naming | "local stack" (confused with LocalStack) | "QA server" everywhere |

### What Doesn't Change

| Area | Why It's Fine |
|------|--------------|
| via__httpx/ test files | Excellent quality, well-documented |
| 4 hand-crafted use-case pages | Gold standard, never overwritten |
| qa-acceptance-tests.yml structure | P0/P1/P2-P3 gating is correct (merged into unified pipeline) |
| TransferHelper crypto logic | Correct AES-256-GCM matching browser |
| Test design principles | No mocks, real server, real crypto |

---

## Stakeholder Guidance (Captured from Session)

Key principles from Dinis Cruz, captured during the session:

1. **The test framework is the highest-leverage code we have.** It promotes
   and enables the creation of high-quality user-facing code.

2. **All Python code must use Type_Safe and osbot-utils.** Same standards as
   the main SG/Send project. Non-negotiable.

3. **Filesystem is the database.** Folder structure encodes meaning. Discovery,
   not configuration. No centralised mapping files where the filesystem can
   carry the information.

4. **Don't call it "local stack."** Use "QA server" or "in-memory server."
   LocalStack is a different thing entirely.

5. **The QA site is a communication channel**, not just documentation. It's
   for agents to consume, for cross-team briefs, for design conversations.
   Pages should be designed for both human and LLM readers.

6. **Multi-environment lifecycle matters.** Tests should run against dev, main,
   and prod. A bug's status includes its deployment position.

7. **Now is the time to clean up.** The repo grew organically to prove the
   technology. The technology is proven. Unified structure time.

---

## Document Map

```
    THIS BRIEF PACK
    │
    ├── INDEX.md ..................... You are here (master index)
    ├── 00-introduction.md .......... This document (context + vision)
    │
    ├── 01-designer__ia-research.md
    │   └── Full audit of 50 use-case folders
    │       Proposed 8-group structure with ASCII wireframes
    │       Page templates (enriched, redirect, dashboard)
    │       Sidebar navigation redesign
    │
    ├── 02-architect__data-models-and-boundaries.md
    │   └── Filesystem-as-database architecture
    │       Type_Safe schema definitions
    │       Component boundary map
    │       Multi-environment data model
    │       Test structure mirroring site structure
    │
    ├── 03-dev__implementation-plan.md
    │   └── 6-patch implementation plan
    │       Type_Safe data models (code)
    │       git mv commands for restructuring
    │       Conftest dedup fix (code)
    │       generate_docs.py rewrite approach
    │       Session plan with effort estimates
    │
    ├── 04-devops__ci-pipeline-review.md
    │   └── Current pipeline problems (two separate worlds)
    │       Unified 5-layer pipeline architecture
    │       Caching strategy (pip, Playwright, SG/Send)
    │       Parallel job design (P1-browser | P1-api | P2/P3)
    │       Migration plan (4 phases)
    │
    └── 05-conductor__villager-refactoring-brief.md
        └── File-by-file audit of ALL 30 Python files
            Code duplication map (4× / 3× / 2×)
            Target package structure
            Target test structure
            5-phase execution plan (13-18 hours)
            Success criteria checklist
```

---

## How This Pack Was Produced

```
    SESSION FLOW:

    Visitor asked Designer to review qa.send.sgraph.ai
    ↓
    Designer audited all 50 use-case folders
    Found: 88% invisible, 3 stale, 9 duplicates, metadata bug
    Produced: IA research report with wireframes
    ↓
    Conductor routed to Architect + Dev
    Architect defined: data model, boundaries, schemas
    Dev defined: patches, code, session plan
    ↓
    Visitor provided audio feedback (transcribed)
    Key shifts: Type_Safe mandatory, filesystem-as-database,
    three execution modes, "QA server" not "local stack"
    ↓
    All 3 documents revised (Rev 2)
    ↓
    Visitor: "change ALL the relevant code — Villager refactoring"
    ↓
    Conductor + Architect: full repo audit (every Python file)
    Produced: Villager refactoring brief with 5-phase plan
    ↓
    Visitor asked for DevOps CI review
    DevOps: found 2 parallel CI universes, proposed unified pipeline
    ↓
    Visitor asked Librarian to package as brief pack
    ↓
    This document.
```

---

*Librarian · Introduction · SG/Send QA Brief Pack · 23 March 2026*
