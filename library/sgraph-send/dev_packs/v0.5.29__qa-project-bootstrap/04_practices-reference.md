# Practices Reference — Pointers to Main Repo

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Purpose:** Reference, don't copy. The QA project reads from the main repo for practices.

---

## How to Use This Document

The main SG/Send repo has an extensive set of practices, guides, and conventions. The QA project should NOT copy these — instead, clone the main repo read-only and reference the specific files listed below.

When you need to understand a practice, read the full document in the main repo. When you need to create something (a brief, a review, a decision record), follow the same format.

---

## Practices We Use

### Brief Format

**Main repo location:** `team/humans/dinis_cruz/briefs/` (examples in date-bucketed folders)

Summary: Every brief has version, date, from, to, type fields. Briefs are the primary input from the human stakeholder. They are read-only for agents.

Format:
```markdown
# Brief: [Title]

**version** v0.X.Y
**date** DD Mon YYYY
**from** Human (project lead)
**to** [Role] (lead), [other roles]
**type** [Brief type]

---

## [Content]
```

### Review Document Format

**Main repo location:** `team/roles/{role}/reviews/YY-MM-DD/`

Summary: Every role review is version-prefixed and date-bucketed. The version comes from the version file. Reviews are the primary output of agent work.

Naming: `{version}__{type}__{description}.md` (e.g., `v0.5.29__review__smoke-test-results.md`)

### IFD (Iterable Fast Deployable) Web Components

**Main repo location:** `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md`

Summary: Web Components with zero framework dependencies. Each component is self-contained. Communication via CustomEvents on a shared EventBus. Surgical versioning — new versions get new directories, old versions are never modified.

Key principles:
- Light DOM (no Shadow DOM for new components)
- Event-driven messaging (EventBus)
- Self-registering custom elements
- Versioned paths: `v0/v0.1/v0.1.X/`

### Admin UI Architecture

**Main repo location:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.5/index.html`

Summary: Multi-layer component loading. Services first (EventBus, config), then API clients, then debug panels, then feature components, then shell. Navigation auto-generated from component `data-nav-section` attributes.

The QA test runner's web UI should follow the same pattern at a smaller scale.

### FastAPI Server Pattern

**Main repo location:** `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py`

Summary: Extends `Serverless__Fast_API` from `osbot-fast-api-serverless`. Route classes registered in `setup()`. Static files mounted via `StaticFiles`. Mangum adapter for Lambda deployment. Health check at `/info/health`.

### Test Patterns

**Main repo location:** `tests/unit/`

Summary: pytest, no mocks, no patches. Full stack starts in-memory. `TestCase` subclasses with `setUpClass()`. Starlette `TestClient` for HTTP testing. Real implementations with in-memory backends.

### Type_Safe Schemas

**Main repo location:** Any `schemas/` directory in the main repo

Summary: All Python data classes use `Type_Safe` from `osbot-utils`. Never Pydantic. Type_Safe provides type checking, serialization, and validation.

```python
from osbot_utils.base_classes.Type_Safe import Type_Safe

class Schema__Test__Result(Type_Safe):
    test_name  : str
    passed     : bool
    screenshots: list
    duration_ms: int
```

### Git Conventions

**Main repo location:** `.claude/CLAUDE.md` (Git section)

Summary:
- Default branch: `dev`
- Feature branches from `dev`
- Branch naming: `claude/{description}-{session-id}`
- Push with: `git push -u origin {branch-name}`

### CI/CD Pipeline

**Main repo location:** `.github/workflows/ci-pipeline.yml`

Summary: GitHub Actions. Tests → tag → deploy. Reusable workflow pattern with `workflow_call`. Admin and User Lambdas deployed in parallel after tests pass.

---

## What NOT to Copy

- Do NOT copy role definitions verbatim — the QA project has 6 roles, not 19. Use the format but write QA-specific content (already done in `03_role-definitions/`).
- Do NOT copy the full IFD guide — reference it when building the test runner UI.
- Do NOT copy deployment scripts — adapt the pattern for the QA project's needs.
- Do NOT copy test files — the QA project has its own test structure (browser tests, not unit tests).

---

*QA Bootstrap Pack — Practices Reference — v0.5.29*
