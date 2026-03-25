# SG/Send QA — Villager Refactoring Brief Pack

**Prepared by:** Librarian (with contributions from 5 agents)
**Date:** 23 March 2026
**QA Repo Version:** v0.2.14
**SG/Send Version:** v0.16.52
**Status:** Ready for execution via Claude Code sessions

---

## What This Pack Is

This is the complete briefing package for the Villager-grade refactoring of
the `SG_Send__QA` repository. It contains the research, architecture, implementation
plans, and CI pipeline redesign needed to bring the QA repo up to the same
engineering standard as the SG/Send product it tests.

**Core principle:** The test framework is the highest-leverage code in the
SGraph ecosystem. It must be as strong as what it tests.

---

## Reading Order

Start with the introduction, then read in order. Each document builds on the
previous. Or skip to the document relevant to your role.

| #  | Document | Agent | What It Covers | Pages |
|----|----------|-------|----------------|-------|
| 00 | [Introduction](00-introduction.md) | Librarian | Platform vision, three execution modes, what we validated, scope of refactoring | 3 |
| 01 | [IA Research](01-designer__ia-research.md) | Designer | Full audit of 50 use-case folders, the good/bad/ugly, proposed 8-group IA with ASCII wireframes | 12 |
| 02 | [Data Models & Boundaries](02-architect__data-models-and-boundaries.md) | Architect | Filesystem-as-database, Type_Safe schemas, component boundaries, multi-environment data model | 8 |
| 03 | [Implementation Plan](03-dev__implementation-plan.md) | Dev | Concrete patches, git mv commands, code samples, testing strategy, session plan | 10 |
| 04 | [CI Pipeline Review](04-devops__ci-pipeline-review.md) | DevOps | Current pipeline problems, unified 5-layer architecture, caching, parallelisation | 8 |
| 05 | [Repo Audit & Refactoring Brief](05-conductor__villager-refactoring-brief.md) | Conductor + Architect | File-by-file audit of all 30 Python files, duplication map, 5-phase plan, success criteria | 10 |

---

## Summary of Findings

```
    THE REPO TODAY                      AFTER REFACTORING
    ──────────────────────────────────  ──────────────────────────────────
    0/30 Python files use Type_Safe     30/30 use Type_Safe
    _cdp_screenshot defined 4 times     Defined once in sg_send_qa/
    ScreenshotCapture defined 3 times   Defined once in sg_send_qa/
    50 use-case folders, 44 invisible   50 folders in 8 groups, all navigable
    2 CI pipelines that don't talk      1 unified 5-layer pipeline
    0 tests for application code        Full test coverage for sg_send_qa/
    Metadata accumulates duplicates     Clean dedup on every write
    3 most visible pages show S3 errors Archived, replaced by real UI shots
    ~6-7 min CI (runs wrong tests)      ~4.5 min CI (runs ALL tests)
```

---

## Execution Plan

```
    PHASE   WHAT                          EFFORT    OWNER        BRIEF
    ───────────────────────────────────────────────────────────────────────
    1       Extract shared code +          3-4 hrs  Dev          Doc 03 §3-4
            Type_Safe data models
    
    2       Refactor conftest files         2-3 hrs  Dev          Doc 03 §5
            (thin wrappers)
    
    3       Refactor application code       4-5 hrs  Dev          Doc 03 §6
            (generate_docs, diff, etc)
    
    4       Restructure filesystem          2-3 hrs  Dev + DevOps Doc 03 §4
            + unify CI pipeline                                   Doc 04 §5
    
    5       Regenerate site                 2-3 hrs  Dev          Doc 03 §7-8
            (index, sidebar, dashboard)
    ───────────────────────────────────────────────────────────────────────
            TOTAL                          13-18 hrs
    
    DevOps caching (Phase 1-2)             1 hr     DevOps       Doc 04 §7
    can ship immediately, independently.
```

---

## Cross-Reference Map

```
    Doc 00 (Introduction)
    ├── defines: three execution modes, platform vision
    ├── referenced by: Doc 01 §1, Doc 02 §5, Doc 04 §4
    └── informs: all other documents
    
    Doc 01 (Designer: IA Research)
    ├── defines: 8-group structure, page templates, sidebar wireframes
    ├── depends on: filesystem audit (original research)
    ├── referenced by: Doc 02 §2, Doc 03 §2, Doc 05 §5
    └── informs: Doc 02 (data models), Doc 03 (implementation)
    
    Doc 02 (Architect: Data Models)
    ├── defines: _group.json schema, _metadata.json schema, component boundaries
    ├── depends on: Doc 01 (IA structure)
    ├── referenced by: Doc 03 §3-6
    └── informs: Doc 03 (code), Doc 04 (pipeline paths)
    
    Doc 03 (Dev: Implementation Plan)
    ├── defines: patches, git mv commands, code samples, session plan
    ├── depends on: Doc 01 (target structure), Doc 02 (schemas)
    ├── referenced by: Doc 05 §6
    └── informs: execution sessions
    
    Doc 04 (DevOps: CI Pipeline)
    ├── defines: unified pipeline, caching, parallelisation
    ├── depends on: Doc 03 §4 (test paths after restructure)
    ├── referenced by: Doc 05 §6
    └── ships: Phase 1-2 independently, Phase 3 with Doc 03
    
    Doc 05 (Conductor: Refactoring Brief)
    ├── defines: file-by-file audit, duplication map, success criteria
    ├── depends on: all other documents
    └── serves as: master checklist for the entire refactoring
```

---

## For Claude Code Sessions

When starting a Claude Code session to execute this refactoring:

1. Clone both repos (SG_Send__QA and SGraph-AI__App__Send)
2. Read this INDEX.md first
3. Read Doc 05 (Refactoring Brief) for the full audit and phase plan
4. Read the specific document for the phase you're executing
5. Follow the success criteria in Doc 05 §10

Each phase is independently mergeable. Phase 1 is zero-risk and can
ship immediately. Phase 4 is highest-risk and should be tested locally
before merge.

---

## For Claude Web Sessions (LLM Analysis Mode)

This brief pack was produced in a Claude Web session. Future Claude Web
sessions can reference this pack to understand the QA repo's target
architecture and the rationale behind every decision.

The Designer's IA wireframes (Doc 01 §4) and the DevOps pipeline
architecture (Doc 04 §4) are particularly useful as conversation surfaces.

---

*Librarian · SG/Send QA Brief Pack · 23 March 2026*
