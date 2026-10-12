# Issues-FS Role-Based Agent Coordination Architecture

**Document:** issues-fs__role-based-agent-coordination  
**Version:** v1.0  
**Date:** 2026-02-05  
**Status:** Draft  
**Depends On:** issues-fs__architecture-overview v1.0  

---

## Executive Summary

This document defines a role-based agent coordination architecture for the Issues-FS ecosystem. By extending the existing focused-repository and submodule patterns established in `Issues-FS__Dev`, we introduce **Role Repos** — dedicated repositories that encode agent responsibilities, boundaries, workflows, and coordination protocols. Each role repo is a submodule of `Issues-FS__Dev`, uses Issues-FS itself for self-management, and participates in a typed issue-based state machine for cross-role coordination.

The initial roles are: **Dev**, **QA**, **DevOps**, **Architect**, **Librarian**, and **Conductor**.

---

## Why: The Problem with Unstructured Multi-Agent Work

### Context Pollution

When a single agent (or a single prompt context) is asked to wear multiple hats — writing code, reviewing its own code, managing releases, maintaining documentation — the quality of each activity degrades. The agent cannot be simultaneously detail-focused (Dev), adversarial (QA), strategic (Architect), and curatorial (Librarian). Each of these modes of thinking requires different priorities, different context, and different definitions of "done."

This is the same problem that human engineering teams solved decades ago with role specialization. The difference is that in an AI-agent context, the "team members" are instances of the same underlying model, differentiated by their prompt context, available tools, and scoped responsibilities. The role repo is the mechanism that provides this differentiation.

### The Submodule Pattern Already Works

The Issues-FS ecosystem already demonstrates that focused, composable repositories — each with a single responsibility, independently versioned, and composed via submodules — produce cleaner architecture than monolithic approaches. `Issues-FS__Service__Client__Python` owns schemas. `Issues-FS__Service__UI` owns the frontend. `Issues-FS__Service__GitHub` owns the GitHub integration.

This pattern works for **code**. The insight is that it works equally well for **agent roles**. A role repo is simply a repository whose primary artifact is not code, but agent configuration: role definitions, workflow schemas, issue templates, coordination protocols, and curated context.

### Dogfooding as Architecture

The most compelling reason to build this is that Issues-FS can manage itself using Issues-FS. Each role repo tracks its own work as Issues-FS issues. Cross-role coordination happens through typed Issues-FS issues with defined schemas. The state machine that governs handoffs between roles is itself an Issues-FS graph. This is not just self-referential elegance — it means every improvement to Issues-FS immediately improves the development process that builds Issues-FS.

---

## What: The Role Repo Model

### Naming Convention

Following the established `Issues-FS__` namespace:

```
Issues-FS__Dev__Role__Dev
Issues-FS__Dev__Role__QA
Issues-FS__Dev__Role__DevOps
Issues-FS__Dev__Role__Architect
Issues-FS__Dev__Role__Librarian
Issues-FS__Dev__Role__Conductor
```

All role repos are scoped under `Issues-FS__Dev__Role__*`, making it clear these are development-time coordination artifacts, not runtime components.

### The Six Initial Roles

| Role | Responsibility | Owns | Hands Off To |
|------|---------------|------|--------------|
| **Conductor** | Orchestrates workflow, manages priorities, resolves blockers, tracks progress | Sprint/cycle planning, role assignments, escalation paths | All roles |
| **Architect** | Strategic technical decisions, API design, dependency management, ADRs | Architecture Decision Records, interface contracts, dependency graph | Dev, Librarian |
| **Dev** | Implementation, bug fixes, feature development, unit tests | Source code, unit tests, implementation PRs | QA, DevOps |
| **QA** | Test strategy, test execution, quality gates, regression tracking | Test plans, integration tests, acceptance criteria, defect reports | Dev (defects), Conductor (sign-off) |
| **DevOps** | CI/CD, deployment, infrastructure, release management, monitoring | Pipelines, deployment configs, release scripts, environment configs | Conductor (release approval) |
| **Librarian** | Documentation curation, knowledge coherence, changelog management, onboarding | Architecture docs, API docs, changelogs, doc quality standards | All roles (knowledge requests) |

### What Lives in a Role Repo

Each role repo contains a consistent structure:

```
Issues-FS__Dev__Role__{Name}/
├── ROLE.md                          → Role definition (identity, boundaries, protocols)
├── README.md                        → Repo overview and setup
├── config/
│   ├── issue_types.yaml             → Issue types this role creates/consumes
│   ├── schemas/                     → Custom issue schemas for this role
│   │   ├── schema__review_request.yaml
│   │   ├── schema__decision.yaml
│   │   └── ...
│   └── workflows/                   → Workflow definitions (state transitions)
│       ├── workflow__code_review.yaml
│       └── ...
├── templates/                       → Issue and document templates
│   ├── issue__bug_report.md
│   ├── issue__feature_request.md
│   └── ...
├── prompts/                         → Agent prompts and persona configuration
│   ├── system_prompt.md             → Base system prompt for this role
│   ├── handoff_prompts/             → Prompts for receiving/sending handoffs
│   │   ├── receive_from__architect.md
│   │   └── send_to__qa.md
│   └── task_prompts/                → Prompts for specific task types
│       ├── implement_feature.md
│       └── fix_bug.md
├── issues/                          → Issues-FS managed issues (self-referential)
│   └── .issues-fs/                  → Issues-FS data directory
├── docs/                            → Role-specific documentation
│   └── runbook.md
└── tests/                           → Validation tests for role artifacts
    └── test__schemas.py
```

---

## How: Coordination via Typed Issues

### Issue Types as State Machine

The core coordination mechanism is a set of **typed issues** that flow between roles. Each issue type has a defined schema, a set of valid status transitions, and rules about which roles can create, transition, or resolve it.

#### Core Coordination Issue Types

| Issue Type | Created By | Consumed By | Purpose |
|-----------|-----------|------------|---------|
| `Decision` | Architect, Conductor | All | Architectural or strategic decision requiring review |
| `Handoff` | Any | Target role | Formal transfer of work between roles |
| `Review_Request` | Any | Target role | Request for review/approval |
| `Approval` | QA, Conductor | Requesting role | Gate sign-off |
| `Blocker` | Any | Conductor | Escalation for blocked work |
| `Task` | Conductor, self | Self | Unit of work within a role |
| `Defect` | QA | Dev | Bug or quality issue |
| `Release` | DevOps | Conductor, QA | Release candidate or deployment |
| `Knowledge_Request` | Any | Librarian | Request for documentation or clarification |
| `ADR` | Architect | All (via Librarian) | Architecture Decision Record |

#### Decision Issue Schema (Example)

```yaml
type: Decision
version: "1.0"
fields:
  title:          { type: string,   required: true  }
  context:        { type: text,     required: true,  description: "Why this decision is needed" }
  options:        { type: list,     required: true,  description: "Options considered"           }
  recommendation: { type: text,     required: false, description: "Proposed choice"              }
  impact:         { type: list,     required: false, description: "Repos/components affected"    }
  decided_by:     { type: role,     required: false  }
  decided_on:     { type: datetime, required: false  }
  supersedes:     { type: issue_ref,required: false, description: "Previous decision replaced"   }

statuses:
  - proposed        # Initial state
  - under_review    # Being evaluated by stakeholders
  - accepted        # Decision made, ready for implementation
  - rejected        # Decision rejected, may revisit
  - superseded      # Replaced by a newer decision
  - implemented     # Decision has been fully enacted

transitions:
  proposed:      [under_review, rejected]
  under_review:  [accepted, rejected, proposed]   # Can send back for revision
  accepted:      [implemented, superseded]
  rejected:      [proposed]                        # Can be reopened
  superseded:    []                                # Terminal
  implemented:   [superseded]                      # Can be replaced later
```

#### Handoff Issue Schema (Example)

```yaml
type: Handoff
version: "1.0"
fields:
  title:          { type: string,    required: true  }
  from_role:      { type: role,      required: true  }
  to_role:        { type: role,      required: true  }
  context:        { type: text,      required: true,  description: "What was done and why" }
  deliverables:   { type: list,      required: true,  description: "Artifacts being handed off" }
  acceptance:     { type: text,      required: false, description: "What 'done' looks like"     }
  blocked_by:     { type: issue_ref, required: false  }
  depends_on:     { type: issue_ref, required: false, description: "Decision or prior handoff"  }

statuses:
  - pending         # Created, not yet picked up
  - in_progress     # Target role is working on it
  - completed       # Work done, handoff accepted
  - returned        # Sent back to originator
  - cancelled       # No longer needed

transitions:
  pending:      [in_progress, cancelled]
  in_progress:  [completed, returned]
  completed:    []
  returned:     [pending]                 # Re-submitted after fixes
  cancelled:    []
```

### Example Coordination Flow

A typical feature implementation flows through roles like this:

```
1. Conductor creates Task (status: planned)
   → assigns to Architect

2. Architect creates Decision (status: proposed)
   → "Use WebSocket for real-time sync"
   → links_to: Task

3. Architect creates Handoff (from: Architect, to: Dev)
   → deliverables: [Decision, interface contract]
   → status: pending

4. Dev picks up Handoff (status: in_progress)
   → Dev creates sub-Tasks for implementation
   → Dev completes implementation

5. Dev creates Handoff (from: Dev, to: QA)
   → deliverables: [PR link, unit test results]
   → status: pending

6. QA picks up Handoff (status: in_progress)
   → QA creates Review_Request if issues found
   → QA creates Defect issues for bugs → route back to Dev
   → QA creates Approval (status: approved)

7. Dev creates Handoff (from: Dev, to: DevOps)
   → deliverables: [merged PR, QA approval]
   → status: pending

8. DevOps creates Release issue
   → runs pipeline, deploys
   → creates Handoff to Conductor (status: completed)

9. Conductor creates Knowledge_Request to Librarian
   → "Update architecture docs for WebSocket feature"

10. Librarian updates docs, closes Knowledge_Request
    → Decision status → implemented
    → Original Task status → completed
```

The entire flow is tracked as an Issues-FS graph. You can query: "show me all issues linked to this Decision" and see the full chain from architectural choice to deployment to documentation.

---

## Role Definitions

### ROLE.md Structure

Every role repo contains a `ROLE.md` file with a consistent structure. This file serves as both human documentation and agent prompt context.

```markdown
# Role: {Name}

## Identity
- **Name:** {Role name}
- **Scope:** {What this role owns}
- **Not responsible for:** {Explicit boundaries}

## Responsibilities
- {Primary responsibility 1}
- {Primary responsibility 2}
- ...

## Issue Types
- **Creates:** {Issue types this role initiates}
- **Consumes:** {Issue types this role receives and acts on}
- **Transitions:** {Status changes this role is authorized to make}

## Handoff Protocols
### Receiving Work
- **From {Role}:** {What to expect, how to acknowledge}
### Sending Work
- **To {Role}:** {What to include, what "ready" means}

## Quality Gates
- {Condition that must be true before work leaves this role}

## Tools & Access
- {Repos this role needs access to}
- {Commands/APIs this role uses}

## Escalation
- {When and how to escalate to Conductor}
```

---

## Role-Specific Examples

### Conductor

**ROLE.md (excerpt):**

```markdown
# Role: Conductor

## Identity
- **Name:** Conductor
- **Scope:** Workflow orchestration, priority management, cross-role coordination
- **Not responsible for:** Implementation, testing, deployment execution, documentation writing

## Responsibilities
- Maintain the project backlog and sprint/cycle plan
- Assign work to roles via Handoff issues
- Track progress across all active work streams
- Resolve Blocker issues or escalate to Architect for technical blockers
- Ensure every completed feature has a Knowledge_Request to Librarian
- Own the coordination protocol and state machine definitions

## Issue Types
- **Creates:** Task, Handoff, Knowledge_Request, Blocker (resolution)
- **Consumes:** Blocker, Approval, Release, Handoff (completion reports)
- **Transitions:** Task (planned → assigned → completed), Blocker (open → resolved)
```

**System Prompt (prompts/system_prompt.md):**

```markdown
You are the Conductor for the Issues-FS development team. Your role is to orchestrate
work across Dev, QA, DevOps, Architect, and Librarian roles.

You do NOT write code, run tests, deploy software, or write documentation. You coordinate
the agents that do.

Your primary tools are:
- Creating and managing Task issues to track units of work
- Creating Handoff issues to formally transfer work between roles
- Reviewing Blocker issues and resolving or escalating them
- Tracking the overall state of the project via the Issues-FS graph

When you receive a Handoff completion from any role, you must:
1. Verify the acceptance criteria were met
2. Determine the next role in the workflow
3. Create the next Handoff or close the parent Task

When you encounter a Blocker:
1. Assess if it's a technical blocker (escalate to Architect) or a process blocker (resolve directly)
2. Never let a Blocker sit unacknowledged for more than one cycle

Your decisions should be tracked as Decision issues only when they affect workflow structure.
Day-to-day prioritization is captured in Task assignments.
```

**Issue Template (templates/issue__sprint_plan.md):**

```markdown
---
type: Task
title: "Sprint {N} Plan"
status: planned
assigned_to: Conductor
---

## Sprint Goal
{One sentence describing the sprint objective}

## Work Items
| # | Task | Assigned Role | Priority | Depends On |
|---|------|--------------|----------|------------|
| 1 | {task} | {role} | {P0-P3} | {issue ref} |

## Risks
- {Known risk or dependency}

## Definition of Done
- [ ] All P0 tasks completed
- [ ] All Handoffs resolved
- [ ] No open Blockers
- [ ] Librarian Knowledge_Requests created for all completed features
```

---

### Architect

**ROLE.md (excerpt):**

```markdown
# Role: Architect

## Identity
- **Name:** Architect
- **Scope:** Technical strategy, API design, dependency management, architecture decisions
- **Not responsible for:** Implementation details, test execution, deployment, documentation maintenance

## Responsibilities
- Author Architecture Decision Records (ADRs) as Decision issues
- Define and maintain API contracts between Issues-FS components
- Review dependency graph and flag coupling risks
- Evaluate technical Blocker issues escalated by Conductor
- Define interface boundaries for new repos/components

## Quality Gates
- Every Decision issue must include: context, options considered, and rationale
- API changes must include schema diffs and migration notes
- No Decision should be marked accepted without QA review of testability
```

**System Prompt (prompts/system_prompt.md):**

```markdown
You are the Architect for the Issues-FS ecosystem. You make strategic technical decisions
and define the interfaces between components.

You do NOT implement features or fix bugs. You design the boundaries and contracts that
Dev, QA, and DevOps work within.

When creating a Decision issue:
1. Always document the context: what problem are we solving?
2. List at least 2 options with trade-offs
3. State your recommendation and rationale
4. Identify which repos/components are affected
5. Tag for QA review: can this be tested? How?

When reviewing a Blocker escalated to you:
1. Determine if it's an architectural issue or an implementation issue
2. If architectural: create a Decision issue
3. If implementation: provide guidance and return to Dev via Conductor

You own the dependency graph. When any role proposes a new dependency or a new repo,
you must evaluate it against: separation of concerns, circular dependency risk,
and the existing naming conventions.
```

**Decision Template (templates/issue__adr.md):**

```markdown
---
type: Decision
title: "ADR-{N}: {Short Title}"
status: proposed
decided_by: Architect
---

## Context
{What is the issue that we're seeing that is motivating this decision?}

## Options Considered

### Option A: {Name}
- **Description:** {What this option entails}
- **Pros:** {Benefits}
- **Cons:** {Drawbacks}

### Option B: {Name}
- **Description:** {What this option entails}
- **Pros:** {Benefits}
- **Cons:** {Drawbacks}

## Recommendation
{Which option and why}

## Impact
- **Repos affected:** {list}
- **Migration required:** {yes/no, details}
- **Testability:** {How QA validates this}

## Status
{proposed | under_review | accepted | rejected | superseded | implemented}
```

---

### Dev

**ROLE.md (excerpt):**

```markdown
# Role: Dev

## Identity
- **Name:** Dev
- **Scope:** Implementation, unit testing, bug fixes, code quality
- **Not responsible for:** Architecture decisions, test strategy, deployment, documentation curation

## Responsibilities
- Implement features as defined by Architect decisions and Conductor assignments
- Write unit tests for all new code
- Fix Defect issues raised by QA
- Create Handoffs to QA when implementation is complete
- Follow the coding standards defined in the ecosystem (Type_Safe patterns, osbot-utils conventions)

## Handoff Protocols
### Receiving Work
- **From Architect (via Conductor):** Expect a Decision issue with interface contracts. Acknowledge by transitioning Handoff to in_progress.
- **From QA (Defect):** Expect a Defect issue with reproduction steps. Acknowledge and fix.

### Sending Work
- **To QA:** Handoff must include: PR link, unit test results, list of changes, any known limitations.
- **To DevOps:** Handoff must include: merged PR, QA Approval issue reference, deployment notes if any.
```

**Task Prompt (prompts/task_prompts/implement_feature.md):**

```markdown
You are implementing a feature for the Issues-FS ecosystem.

## Context
You have received a Handoff from the Architect/Conductor with:
- A Decision issue defining the approach
- Interface contracts or schema definitions

## Process
1. Review the Decision issue and linked context
2. Identify which repo(s) need changes
3. Implement the feature following osbot-utils Type_Safe patterns
4. Write unit tests with meaningful coverage
5. Create a Handoff to QA with:
   - Summary of changes
   - Files modified
   - Unit test results
   - Known limitations or edge cases
   - How to test the feature

## Constraints
- Do NOT make architectural decisions — if you encounter an ambiguity in the contract,
  create a Blocker and escalate to Conductor
- Do NOT skip unit tests
- Do NOT modify interfaces without an accepted Decision issue
```

---

### QA

**ROLE.md (excerpt):**

```markdown
# Role: QA

## Identity
- **Name:** QA
- **Scope:** Test strategy, test execution, quality gates, defect tracking
- **Not responsible for:** Implementation, architecture, deployment, documentation

## Responsibilities
- Define test plans for features based on Decision issues
- Execute integration and acceptance tests
- Raise Defect issues with clear reproduction steps
- Provide Approval issues as quality gates
- Maintain regression test suites
- Review Decision issues for testability (advisory role)

## Quality Gates
- No Approval issued without: test plan executed, all P0 defects resolved, regression suite passing
- Every Defect must include: steps to reproduce, expected vs actual, severity, affected component
```

**Defect Template (templates/issue__defect.md):**

```markdown
---
type: Defect
title: "{Component}: {Short description}"
status: open
severity: {P0|P1|P2|P3}
found_in: {repo name}
linked_to: {Handoff or Task issue ref}
---

## Summary
{One-line description of the defect}

## Steps to Reproduce
1. {Step 1}
2. {Step 2}
3. {Step 3}

## Expected Behavior
{What should happen}

## Actual Behavior
{What actually happens}

## Environment
- **Repo:** {repo}
- **Branch/Commit:** {ref}
- **Python Version:** {version}
- **Dependencies:** {relevant versions}

## Evidence
{Logs, screenshots, test output}

## Notes
{Any additional context, potential root cause if obvious}
```

---

### DevOps

**ROLE.md (excerpt):**

```markdown
# Role: DevOps

## Identity
- **Name:** DevOps
- **Scope:** CI/CD pipelines, deployment, release management, infrastructure, monitoring
- **Not responsible for:** Feature implementation, test strategy, architecture decisions, documentation

## Responsibilities
- Maintain CI/CD pipelines for all Issues-FS repos
- Manage PyPI and npm publish workflows
- Execute coordinated releases across dependent packages
- Maintain docker-compose and deployment configurations
- Monitor build health and dependency updates
- Own the release process defined in Issues-FS__Dev

## Issue Types
- **Creates:** Release, Blocker (infrastructure), Handoff (to Conductor on release completion)
- **Consumes:** Handoff (from Dev with merged code + QA approval), Task (from Conductor)
```

**Release Template (templates/issue__release.md):**

```markdown
---
type: Release
title: "Release {package} v{version}"
status: planned
---

## Package
- **Name:** {package name}
- **Version:** {semantic version}
- **Registry:** {PyPI | npm}

## Pre-Release Checklist
- [ ] All integration tests passing in Issues-FS__Dev
- [ ] QA Approval issue linked
- [ ] Version bumped in target repo
- [ ] Changelog updated
- [ ] Dependent packages identified

## Dependent Package Updates
| Package | Current | Needs Update To | Repo |
|---------|---------|-----------------|------|
| {dep} | {current} | {new} | {repo} |

## Release Steps
1. Publish {package} to {registry}
2. Update dependent packages
3. Run cross-repo integration tests
4. Tag release in Issues-FS__Dev

## Rollback Plan
{What to do if something goes wrong}
```

---

### Librarian

**ROLE.md (excerpt):**

```markdown
# Role: Librarian

## Identity
- **Name:** Librarian
- **Scope:** Documentation curation, knowledge coherence, changelog management, onboarding material
- **Not responsible for:** Implementation, testing, deployment, architecture decisions

## Responsibilities
- Maintain architecture documents (like this one) as living artifacts
- Curate API documentation across all repos
- Manage changelogs and release notes
- Ensure documentation consistency across the ecosystem
- Respond to Knowledge_Request issues from any role
- Identify documentation gaps and create self-assigned Tasks
- Maintain the canonical index of all Decision issues (ADR log)

## Quality Gates
- Every Knowledge_Request must be resolved with either: updated documentation, a new document, or a reasoned "not needed" response
- No documentation should reference deprecated APIs or superseded Decisions
- All architecture docs must have a version, date, and status

## Handoff Protocols
### Receiving Work
- **From Conductor (Knowledge_Request):** Expect a reference to the completed feature and relevant Decision issues. Assess what documentation needs creating or updating.
- **From Architect (Decision):** When a Decision is marked accepted or implemented, review and update affected docs.

### Sending Work
- **To All Roles:** Updated documentation is published; no formal Handoff needed. Flag breaking doc changes via Conductor.
```

**Knowledge Request Template (templates/issue__knowledge_request.md):**

```markdown
---
type: Knowledge_Request
title: "{Short description of what needs documenting}"
status: open
requested_by: {role}
linked_to: {Decision, Task, or Release issue ref}
---

## What Happened
{Brief description of the feature/change/decision that was completed}

## What Needs Documenting
- [ ] {Specific doc or section to create/update}
- [ ] {Another doc or section}

## Source Material
- **Decision Issue:** {ref}
- **Implementation PRs:** {links}
- **Relevant Repos:** {list}

## Priority
{High: blocking onboarding or next feature | Medium: should be done this cycle | Low: nice to have}
```

---

## Submodule Structure

The `Issues-FS__Dev` repository grows to include role repos as submodules:

```
Issues-FS__Dev/
├── .gitmodules
├── modules/
│   ├── Issues-FS/
│   ├── Issues-FS__CLI/
│   ├── Issues-FS__Service/
│   ├── Issues-FS__Service__Client__Python/
│   ├── Issues-FS__Service__Client__JS/
│   ├── Issues-FS__Service__UI/
│   ├── Issues-FS__Service__GitHub/
│   └── Issues-FS__Service__S3/
├── roles/
│   ├── Issues-FS__Dev__Role__Conductor/
│   ├── Issues-FS__Dev__Role__Architect/
│   ├── Issues-FS__Dev__Role__Dev/
│   ├── Issues-FS__Dev__Role__QA/
│   ├── Issues-FS__Dev__Role__DevOps/
│   └── Issues-FS__Dev__Role__Librarian/
├── tests/
│   └── integration/
├── scripts/
└── docker-compose.yml
```

Role repos are grouped under `roles/` to keep the top-level structure clean as the ecosystem grows. Each role repo is a full Git repository with its own commit history, branching, and versioning.

---

## Future Roles

The initial six roles cover the core development workflow. As the ecosystem grows, additional specialized roles can be introduced. The guiding principle is: **create highly focused teams with just the resources needed.** Each role should have a clear, non-overlapping scope. If a role's ROLE.md is hard to write concisely, it probably needs splitting.

| Proposed Role | Scope | When to Add |
|--------------|-------|-------------|
| `__Role__Security` | Dependency auditing, vulnerability scanning, access control review, threat modeling | When the ecosystem has external users or handles sensitive data |
| `__Role__Performance` | Benchmarking, profiling, optimization, SLA monitoring | When performance becomes a differentiator or constraint |
| `__Role__Integrations` | Managing sync services (GitHub, Jira, S3), API compatibility, external system contracts | When more than 2 integration services exist |
| `__Role__UX` | UI/UX design, user research, accessibility, frontend architecture | When Issues-FS__Service__UI grows beyond basic CRUD views |
| `__Role__Data` | Schema evolution, migration strategy, data integrity, storage backend optimization | When multiple storage backends are actively used |
| `__Role__Release_Manager` | Release coordination, semantic versioning strategy, cross-package dependency resolution | When DevOps becomes overloaded with release complexity (split from DevOps) |
| `__Role__Onboarding` | New contributor experience, tutorials, example repos, getting-started guides | When external contributors begin adopting Issues-FS |

### Role Addition Protocol

Adding a new role follows a defined process:

1. **Conductor** creates a Decision issue: "Do we need a {Role} role?"
2. **Architect** evaluates: Does this overlap with existing roles? Can it be scoped cleanly?
3. If accepted: **Architect** defines the boundary and interface with existing roles
4. **Dev** creates the repo with the standard structure
5. **Librarian** creates the ROLE.md and initial documentation
6. **Conductor** updates coordination workflows to include the new role

---

## Decisions Log

Decisions made during the creation of this architecture:

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Use **Role** not **Persona** | Role defines responsibilities and boundaries (what you own). Persona defines personality (how you talk). In agent coordination, ownership and handoff protocols matter more than tone. A persona can be configured within a role. |
| D2 | Name the orchestrator **Conductor** | "Project Manager" and "Product Manager" carry human org-chart baggage. Conductor implies orchestration without doing the work — like a musical conductor who coordinates the ensemble. |
| D3 | Use **Librarian** not **Docs** | Librarian implies active curation, judgment, and knowledge management. Docs implies a static dump. A librarian decides what's canonical, what's stale, and what connects to what. |
| D4 | **Decisions are issues** | Every decision gets a unique ID, status, linked context, and history. ADRs become a view over Decision-type issues. Enables graph queries like "all decisions that led to this implementation." |
| D5 | Coordination via **typed issues as state machine** | Issue types with defined schemas and status transitions encode the workflow. The graph is the workflow engine. No external orchestration tool needed. |
| D6 | Group role repos under `roles/` in Dev workspace | Keeps the `modules/` directory focused on code repos. Clear visual separation of concerns. |

---

## References

- [Issues-FS Architecture Overview](./v0_4_0__issues-fs__architecture-overview.md) — Ecosystem architecture
- [Memory-FS](https://github.com/owasp-sbot/Memory-FS) — Storage abstraction
- [MGraph-DB](https://github.com/owasp-sbot/MGraph-DB) — Graph database (powers issue relationship queries)
- [OSBot-Utils](https://github.com/owasp-sbot/OSBot-Utils) — Type_Safe utilities

---

*Issues-FS Role-Based Agent Coordination Architecture v1.0*  
*Date: 2026-02-05*
