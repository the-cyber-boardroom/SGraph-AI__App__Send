# Agentic Role-Based Development: A Practical Guide

**Version:** v1.0
**Date:** 2026-02-08
**Status:** Active

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [The Role Model](#2-the-role-model)
3. [Setting Up](#3-setting-up)
4. [The Coordination Bus](#4-the-coordination-bus)
5. [The Workflow](#5-the-workflow)
6. [Adapting for a Single Repo](#6-adapting-for-a-single-repo)
7. [ROLE.md Template](#7-rolemd-template)
8. [Issue Types and State Machine](#8-issue-types-and-state-machine)
9. [Lessons Learned](#9-lessons-learned)
10. [Quick Start Checklist](#10-quick-start-checklist)

---

## 1. Introduction

### What this is

This guide explains how to set up a team of specialised AI agents that collaborate on a software project using role-based coordination. Instead of a single AI agent doing everything -- writing code, reviewing it, managing releases, writing docs -- you assign distinct roles to separate agent sessions, each with focused responsibilities, clear boundaries, and a defined communication protocol.

The pattern was developed and battle-tested on the Issues-FS project (a file-system-based issue tracker), where six specialised agents coordinate through a shared issue graph. This guide distills the pattern into something you can apply to any project, regardless of size or repo structure.

### Why role-based agents work better than single-agent

When a single agent (or a single prompt context) wears multiple hats -- writing code, reviewing its own code, managing releases, maintaining documentation -- the quality of each activity degrades. The agent cannot be simultaneously detail-focused (Dev), adversarial (QA), strategic (Architect), and curatorial (Librarian). Each mode of thinking requires different priorities, different context, and different definitions of "done."

This is the same problem human engineering teams solved with role specialisation. In an AI-agent context, the "team members" are instances of the same underlying model, differentiated by their prompt context, available tools, and scoped responsibilities. The role definition file (`ROLE.md`) is the mechanism that provides this differentiation.

**The key benefits:**

- **Context protection.** Each agent operates within a well-scoped context. A Dev agent thinks about code quality. A QA agent thinks about what could break. Mixing these perspectives in one context dilutes both.
- **Adversarial separation.** The agent that writes code should not be the agent that reviews it. QA exists to find what Dev missed. If the same context does both, the "review" is tainted by knowledge of the implementation.
- **Accountability through artifacts.** Each role produces traceable artifacts: the Architect writes decision records, the Dev writes code and tests, QA writes defect reports, DevOps manages releases. Every output is attributed and reviewable.
- **Parallel work.** Multiple agents can work simultaneously on non-conflicting tasks, multiplying throughput.
- **Reproducibility.** The role definition is a file in the repo. Any agent instance can pick up any role and behave consistently.

### How agents coordinate

Agents do not talk to each other directly. They coordinate through **file-based artifacts**: issues, plans, reviews, and code. The issue tracker (whether Issues-FS, GitHub Issues, or simple JSON files in a folder) serves as the **coordination bus** -- a shared, persistent, versioned record of all work, decisions, and handoffs.

This file-based coordination has a crucial property: it is **asynchronous and auditable**. Every assignment, every handoff, every defect report is a file that can be read by any agent, at any time, without requiring the other agent to be running.

---

## 2. The Role Model

### The six core roles

The system uses six roles that cover the full development lifecycle. Not every project needs all six from day one. Start with the roles you need and add more as the project grows.

| Role | One-line responsibility | Primary artifacts |
|------|------------------------|-------------------|
| **Conductor** | Orchestrates workflow, assigns work, resolves blockers, tracks progress | Sprint plans, task assignments, status reports |
| **Architect** | Defines structural boundaries, interface contracts, makes technical decisions | Architecture Decision Records (ADRs), interface specs |
| **Dev** | Implements features, writes tests, fixes bugs | Source code, unit tests, implementation PRs |
| **QA** | Validates quality adversarially, finds what Dev missed | Test plans, defect reports, approval/rejection verdicts |
| **DevOps** | Manages CI/CD, releases, infrastructure | Pipelines, release scripts, deployment configs |
| **Librarian** | Curates documentation, maintains knowledge coherence | Architecture docs, guides, cross-references |

### Role relationships

```
                    Human Stakeholder
                          |
                     [Conductor]
                    /    |    \    \
            [Architect] [Dev] [QA] [DevOps]
                          |
                     [Librarian]
```

The Conductor is the hub. It assigns work, tracks progress, and routes blockers. The other roles are spokes -- each focused on its domain. The Librarian sits slightly apart, consuming outputs from all roles and producing documentation.

**Key relationship patterns:**

- **Architect decides, Dev implements.** The Architect produces a Decision; the Conductor translates it into a Task for the Dev.
- **Dev builds, QA breaks.** Dev produces code; QA tries to prove it wrong. Defects flow back to Dev.
- **QA approves, DevOps ships.** QA's Approval is the gate that enables DevOps to release.
- **Conductor coordinates everything.** The Conductor never writes code, never runs tests, never deploys. It ensures work flows through the right roles in the right order.
- **Librarian documents everything.** After work is done, the Conductor creates a Knowledge_Request for the Librarian to document what happened.

### The hub-and-spoke subagent pattern

In practice, a human typically operates as the Conductor (or supervises a Conductor agent) and spawns role-specific agents as subagents:

1. The human identifies work to be done.
2. They launch (or instruct) a Conductor agent to plan the work.
3. The Conductor creates tasks and assigns them to roles.
4. For each role's task, a new agent session is started with that role's ROLE.md as its primary context.
5. The role agent does its work, creates artifacts, and hands off.
6. The Conductor (or human) picks up the handoff and routes to the next role.

Each agent session is disposable. When a Dev agent finishes a task, it creates a Handoff artifact and exits. A new QA agent is then started with the QA ROLE.md, picks up the Handoff, and begins testing.

### What each role does NOT do

Boundaries are as important as responsibilities. Each role has explicit exclusions:

| Role | Does NOT |
|------|----------|
| **Conductor** | Write code, run tests, deploy, write docs |
| **Architect** | Implement features, write tests, deploy |
| **Dev** | Make architecture decisions, define test strategy, deploy, write docs |
| **QA** | Fix bugs, implement features, deploy |
| **DevOps** | Write application code, make architecture decisions |
| **Librarian** | Implement features, test, deploy, make architecture decisions |

When a role encounters work outside its scope, it escalates rather than doing it. A Dev who finds an architectural ambiguity creates a Blocker and escalates to the Conductor, rather than making the decision locally. This boundary discipline prevents context pollution.

---

## 3. Setting Up

### What you need

To set up a role-based agentic workflow, you need three things:

1. **ROLE.md files** -- one per role, defining identity, responsibilities, boundaries, and agent instructions.
2. **An issue directory** -- a folder structure where issues (tasks, handoffs, defects, decisions) are stored as files.
3. **LLM guidance documents** -- project briefs, coding standards, and any other context that grounds agent behaviour.

### ROLE.md files: the dual-purpose document

The ROLE.md file is the single most important artifact in this system. It serves two purposes simultaneously:

1. **Human documentation.** Anyone (human or AI) reading the ROLE.md understands what this role does, what it owns, and how it interacts with other roles.
2. **Agent briefing.** When an AI agent starts a session in this role, the ROLE.md is its primary context. It grounds the agent's identity, priorities, and behaviour.

A well-written ROLE.md includes:

- **Identity** -- name, scope, core mission, what the role is NOT responsible for.
- **Responsibilities** -- numbered list of primary duties.
- **Workflows** -- step-by-step procedures for common operations.
- **Issue types** -- what issue types this role creates and consumes.
- **Integration with other roles** -- how this role interfaces with each other role.
- **Quality gates** -- conditions that must be true before work leaves this role.
- **Tools and access** -- what repos, commands, and APIs the role uses.
- **Escalation** -- when and how to escalate to other roles.
- **For AI Agents** section -- specific instructions for agent mindset, behaviour, and session startup.

The "For AI Agents" section is critical. It tells the agent:
- What **mindset** to adopt (e.g., QA: "You are an adversary, not a helper").
- What **behaviours** to follow (e.g., Dev: "Never make architectural decisions").
- How to **start a session** (what to read first, what to check for).
- **Coding standards** or **testing patterns** specific to the project.

### The .issues/ directory

Issues are stored as JSON files in a directory structure. The minimal structure is:

```
your-project/
  .issues/
    data/
      task/
        Task-1/
          issue.json
        Task-2/
          issue.json
      bug/
        Bug-1/
          issue.json
      decision/
        Decision-1/
          issue.json
```

Each issue is a folder containing an `issue.json` file. The folder name is the issue's label (e.g., `Task-1`). Issues are grouped by type (`task/`, `bug/`, `decision/`, etc.).

A minimal `issue.json` looks like this:

```json
{
  "node_id": "a1b2c3d0",
  "node_type": "task",
  "node_index": 1,
  "label": "Task-1",
  "title": "Implement recursive node discovery",
  "status": "todo",
  "tags": ["phase-2", "backend"],
  "properties": {
    "assigned_to": "Dev",
    "description": "Add nodes_list_all() method with recursive file scanning.",
    "dev_notes": ""
  }
}
```

The `status` field tracks lifecycle: `todo` -> `in-progress` -> `done`. The `properties` object holds role-specific data like `assigned_to`, `dev_notes`, `description`, and any other metadata relevant to the issue.

You do not need Issues-FS (the tool) to use this pattern. Any project can create `.issues/data/` folders and write JSON files manually or with simple scripts. The structure is the protocol; the tooling is optional.

### LLM guidance documents

Beyond ROLE.md files, agents benefit from additional context documents:

- **Project brief** -- a concise overview of what the project is, its design principles, key components, technologies, and current state. Every role reads this at session start.
- **Coding standards** -- for the Dev role, a document (or section within ROLE.md) that specifies naming conventions, patterns, import styles, test patterns, and non-negotiable rules.
- **Architecture overview** -- for the Architect role, documentation of the current system structure, dependency graph, and prior decisions.

These documents act as **grounding context**. Without them, agents make assumptions based on their general training. With them, agents follow your project's specific conventions. The difference is dramatic: with a coding standards document, a Dev agent will produce code that looks like your codebase. Without one, it will produce generic Python (or whatever language) that may be correct but does not match your team's style.

**Example: coding standards as agent grounding**

In the Issues-FS project, the Dev ROLE.md includes a detailed "Coding Standards" section with concrete code examples showing class definition patterns, method patterns, boolean check conventions, import alignment, test file patterns, and naming conventions. This level of specificity is what transforms a generic coding agent into one that produces code indistinguishable from a human team member's output.

---

## 4. The Coordination Bus

### Issues as the communication mechanism

Agents do not send messages to each other. They communicate through **issues** -- structured files that live in the repository and are versioned by Git. This approach has several advantages over direct agent-to-agent messaging:

- **Persistence.** Every communication is a file on disk. Nothing is lost when an agent session ends.
- **Auditability.** You can read the full history of work assignments, handoffs, and decisions at any time.
- **Asynchrony.** Agent A can create a handoff issue and exit. Agent B can pick it up hours later.
- **Versioning.** Issues are committed to Git and appear in diffs. You can see when a task was created, assigned, and completed.
- **Transparency.** The human stakeholder can read any issue at any time to understand what is happening.

### How agents find their work

When an agent starts a session in a role, it follows this protocol:

1. Read ROLE.md to ground identity.
2. Read the project brief for current state.
3. Scan the `.issues/` directory for issues assigned to this role.
4. Look for open Handoff issues targeting this role.
5. Look for open Defect issues (for Dev) or open Task issues.
6. If no specific task is assigned, the ROLE.md specifies what to do (e.g., QA: run regression suite; Librarian: run ecosystem health scan).

### The issue as a contract

An issue is not just a to-do item. It is a **contract** between roles:

- A **Handoff** from Dev to QA includes: what was built, which files changed, how to test it, known limitations. This is enough for QA to begin testing without asking Dev questions.
- A **Defect** from QA to Dev includes: reproduction steps, expected vs actual behaviour, severity, environment details. This is enough for Dev to diagnose without asking QA questions.
- A **Decision** from the Architect includes: context, options considered, recommendation, impact, testability criteria. This is enough for Dev to implement and QA to validate.

Each issue type has an implicit or explicit schema that ensures the right information is included. If the information is insufficient, the receiving role creates a Blocker or Review_Request asking for clarification -- through the issue system, not through informal communication.

---

## 5. The Workflow

### The plan-execute-review-approve cycle

The core workflow follows a consistent cycle:

```
Plan (Architect/Conductor)
  --> Execute (Dev)
    --> Review (QA)
      --> Approve or Reject (QA/Conductor)
        --> Ship (DevOps)
          --> Document (Librarian)
```

Here is a concrete example of how a feature flows through the system:

**Step 1: Planning.** The Conductor identifies a feature to build. The Architect creates a Decision issue specifying the approach, interface contracts, and acceptance criteria.

**Step 2: Assignment.** The Conductor creates a Task (or Handoff) issue assigned to Dev, linking to the Architect's Decision.

**Step 3: Implementation.** A Dev agent is started. It reads its ROLE.md, reads the Task, reads the linked Decision, and implements the feature following the project's coding standards. It writes unit tests. When done, it updates the Task's `dev_notes` with what was built, creates a Handoff to QA, and its session ends.

**Step 4: Review.** A QA agent is started. It reads its ROLE.md, reads the Handoff from Dev, creates a test plan, and executes tests against the actual code. It produces a review document listing findings by severity (Critical, Major, Minor, Note). If defects are found, it creates Defect issues routed back to Dev.

**Step 5: Approval or Rejection.** If QA passes the review (all blocking defects resolved), it creates an Approval issue. If not, it creates a Rejection with clear guidance on what must be fixed. The Conductor monitors this and routes accordingly.

**Step 6: Release.** Once approved, DevOps runs the release pipeline -- merging to main, tagging, publishing.

**Step 7: Documentation.** The Conductor creates a Knowledge_Request for the Librarian to document the completed feature.

### The task lifecycle

Every task follows the same status progression:

```
todo --> in-progress --> done
```

When an agent picks up a task, it sets `status` to `in-progress`. When it finishes, it sets `status` to `done` and populates `dev_notes` (or equivalent) with a summary of what was accomplished.

For more complex flows, tasks can have additional states: `blocked` (waiting on external input), `returned` (sent back for rework), or `cancelled`.

### Code comment traceability

When an agent implements a feature or fixes a bug, it should reference the issue label in code comments:

```python
# Task-1: Added recursive node discovery
def nodes_list_all(self, root_path=None):
    ...
```

This creates traceability from code back to the issue that motivated it. When someone reads the code later, they can look up Task-1 to understand the context and decision history.

### Handoff artifacts

The quality of handoffs determines the efficiency of the entire system. A good Handoff includes:

**Dev to QA handoff:**
- Summary of what was implemented
- List of files changed (with new vs modified)
- Unit test results (count, pass/fail)
- Known limitations or edge cases
- How to test the feature
- Link to the originating Task or Decision

**QA to Dev (defect return):**
- Steps to reproduce
- Expected vs actual behaviour
- Severity (P0-P3)
- Environment details
- Evidence (logs, test output)

**Architect to Dev (decision handoff):**
- Context: why this decision was needed
- Options considered with trade-offs
- Recommendation and rationale
- Affected components
- Acceptance criteria
- Testability: how QA validates this

---

## 6. Adapting for a Single Repo

### You do not need multiple repositories

The pattern described above was developed in a multi-repo ecosystem with 10+ repositories and Git submodules. Most projects do not need this level of separation. Everything works in a single repository with folders.

### Single-repo directory structure

```
your-project/
  roles/
    conductor/
      ROLE.md
    architect/
      ROLE.md
      docs/
        plan__feature-xyz.md
    dev/
      ROLE.md
    qa/
      ROLE.md
      docs/
        review__feature-xyz.md
    devops/
      ROLE.md
    librarian/
      ROLE.md
      docs/
        project-brief.md
  .issues/
    data/
      task/
        Task-1/
          issue.json
      bug/
        Bug-1/
          issue.json
      decision/
        Decision-1/
          issue.json
      handoff/
        Handoff-1/
          issue.json
      defect/
        Defect-1/
          issue.json
  src/
    ... (your application code)
  tests/
    ... (your tests)
  docs/
    ... (project documentation)
```

**What changed from the multi-repo version:**

- Role definitions are **folders** in `roles/`, not separate Git repositories.
- Issues are in a single `.issues/` directory at the project root.
- Role-specific documents (plans, reviews) go in `roles/<role>/docs/`.
- No submodules, no separate versioning, no separate CI pipelines for roles.

### Minimum viable setup

If you are starting small, you do not need all six roles on day one. Start with the roles that solve your immediate problems:

**Smallest useful setup (2 roles):**
- **Dev** -- writes code
- **QA** -- reviews code

This alone gives you adversarial separation. The Dev agent writes code; a separate QA agent reviews it and finds bugs the Dev missed.

**Medium setup (4 roles):**
- **Conductor** -- orchestrates (or the human does this)
- **Architect** -- makes structural decisions
- **Dev** -- implements
- **QA** -- validates

**Full setup (6 roles):**
All six roles as described in this guide.

### Simplifications for smaller projects

- **The human is the Conductor.** In many cases, the human project owner acts as the Conductor -- assigning work, tracking progress, resolving blockers. You do not need a Conductor agent if the human is actively managing the project.
- **Skip DevOps initially.** If your project does not have CI/CD yet, skip the DevOps role. Add it when your release process needs automation.
- **Combine Architect and Conductor.** For small projects, one agent can handle both planning and coordination. Create a combined ROLE.md that covers both.
- **Skip Librarian initially.** If your documentation needs are modest, the human can handle docs or defer them. Add the Librarian when documentation starts falling behind.

---

## 7. ROLE.md Template

Use this template to create a ROLE.md for any role. Fill in the bracketed sections.

```markdown
# Role: [Name]

## Identity

- **Name:** [Role name]
- **Core Mission:** [One sentence describing this role's primary contribution]
- **Not Responsible For:** [Explicit list of things this role does NOT do]

## Core Principle

**[One sentence capturing the philosophical foundation of this role.]**

---

## Primary Responsibilities

1. **[Responsibility 1]** -- [Brief description]
2. **[Responsibility 2]** -- [Brief description]
3. **[Responsibility 3]** -- [Brief description]
[... add as many as needed]

---

## Core Workflows

### Workflow 1: [Name]

When [trigger]:

1. **[Step 1]** -- [What to do]
2. **[Step 2]** -- [What to do]
3. **[Step 3]** -- [What to do]

### Workflow 2: [Name]

[Same structure]

---

## Issue Types

### Creates

| Issue Type | Purpose | When Created |
|-----------|---------|--------------|
| [Type] | [Purpose] | [Trigger] |

### Consumes

| Issue Type | From | Action |
|-----------|------|--------|
| [Type] | [Source role] | [What to do with it] |

---

## Integration with Other Roles

### [Role Name]
[One paragraph describing how this role interacts with the other role.
What does this role receive? What does it send? Where are the boundaries?]

[Repeat for each role this one interacts with.]

---

## Quality Gates

- [Condition that must be true before work leaves this role]
- [Another quality gate]

---

## Tools and Access

- [Tool or repo this role needs access to]
- [Another tool]

---

## Escalation

- [When and how to escalate, and to whom]

---

## For AI Agents

When an AI agent takes on this role, it should follow these guidelines:

### Mindset

[2-3 sentences describing the mental model the agent should adopt.
What is the agent's primary value? What should it think in terms of?]

### Behaviour

1. **[Behaviour rule 1].** [Explanation]
2. **[Behaviour rule 2].** [Explanation]
[... 5-7 behaviour rules]

### Starting a Session

When you begin a session as [Role]:

1. Read this ROLE.md to ground yourself in identity and responsibilities.
2. Read the project brief for current state.
3. Check for open issues assigned to this role.
4. [Role-specific startup step]

### [Optional: Coding Standards / Testing Patterns / Review Criteria]

[If this role has specific technical conventions, document them here with
concrete code examples. This is especially important for Dev and QA roles.]

---

*[Role Name] Role Definition*
*Version: v1.0*
*Date: [YYYY-MM-DD]*
```

### Tips for writing effective ROLE.md files

- **Be concrete, not abstract.** "Write unit tests" is better than "ensure quality through testing practices."
- **Include examples.** For Dev, show actual code patterns. For QA, show actual defect report format. For Architect, show actual decision record format.
- **State what the role does NOT do.** Boundaries prevent scope creep. A Dev that knows it should not make architecture decisions will escalate instead of guessing.
- **Include agent-specific instructions.** The "For AI Agents" section is what transforms a document into a prompt. Write it as direct instructions to the agent.
- **Keep it self-contained.** An agent should be able to read this one file and know everything it needs to know about its role. Reference other documents for deep detail, but the ROLE.md should stand alone for day-to-day work.

---

## 8. Issue Types and State Machine

### Core issue types

The coordination protocol uses typed issues. Each type has a specific purpose, a set of valid statuses, and rules about which roles create and consume it.

| Issue Type | Created By | Consumed By | Purpose |
|-----------|-----------|------------|---------|
| **Task** | Conductor, self | Self | Unit of work within a role |
| **Handoff** | Any role | Target role | Formal transfer of work between roles |
| **Decision** | Architect | All | Architecture or strategic decision |
| **Defect** | QA | Dev | Bug with reproduction steps |
| **Approval** | QA | Conductor, DevOps | Quality gate sign-off |
| **Rejection** | QA | Conductor, Dev | Quality gate failure with rationale |
| **Blocker** | Any role | Conductor | Escalation for blocked work |
| **Release** | DevOps | Conductor | Release tracking |
| **Knowledge_Request** | Conductor | Librarian | Request for documentation |
| **Review_Request** | Any role | Target role | Request for review or clarification |

### Status transitions

Each issue type has a defined set of status transitions:

**Task:**
```
todo --> in-progress --> done
  \                      /
   +--> blocked --------+
```

**Handoff:**
```
pending --> in_progress --> completed
                 \
                  +--> returned --> pending (re-submitted)
```

**Decision:**
```
proposed --> under_review --> accepted --> implemented
                  \              \
                   +--> rejected  +--> superseded
```

**Defect:**
```
open --> in_progress --> fixed --> verified --> closed
              \                      \
               +--> cannot_reproduce  +--> reopened --> in_progress
```

### Issue JSON schema

All issues share a common base structure:

```json
{
  "node_id":    "unique-id",
  "node_type":  "task|bug|decision|handoff|defect|...",
  "node_index": 1,
  "label":      "Task-1",
  "title":      "Short description",
  "status":     "todo|in-progress|done|...",
  "tags":       ["tag1", "tag2"],
  "properties": {
    "assigned_to":  "Dev|QA|Architect|...",
    "description":  "Longer description",
    "dev_notes":    "Notes from the implementing agent",
    "depends_on":   ["Task-2"],
    "linked_to":    ["Decision-1"]
  }
}
```

The `properties` object is flexible and can contain any role-specific metadata. Common fields:

- `assigned_to` -- which role owns this issue
- `requested_by` -- which role created it
- `description` -- what needs to be done
- `dev_notes` -- what was actually done (filled in by the implementing agent)
- `depends_on` -- issues that must complete before this one
- `linked_to` -- related issues (for traceability)
- `severity` -- for defects (P0-P3)
- `from_role` / `to_role` -- for handoffs

### Creating issues manually

You do not need special tooling to create issues. A simple approach:

1. Create a folder: `.issues/data/task/Task-1/`
2. Create `issue.json` with the fields above.
3. Commit to Git.

To track the next available index per type, you can use a simple convention: scan existing folders and pick the next number. Or maintain a counter file in `.issues/data/task/next_index`.

---

## 9. Lessons Learned

These lessons come from running this pattern in production on a real project with real AI agents over multiple development cycles.

### What worked well

**1. Adversarial QA catches real bugs.**
The most valuable role separation is Dev and QA. When a separate QA agent reviews code written by a Dev agent, it consistently finds issues the Dev missed. In one case, a Dev agent completed four tasks (B10-B13) with 371 tests passing. A subsequent QA review found three defects, including a type safety regression where a method's return type had been downgraded from a typed wrapper to a raw string. The Dev agent did not notice because the code still worked -- the type regression was a quality issue, not a functionality issue. Only an adversarial reviewer, looking specifically for this class of problem, caught it.

**2. ROLE.md files as agent context are highly effective.**
When an agent reads a well-written ROLE.md at the start of a session, its behaviour changes dramatically. A QA agent with its ROLE.md produces structured defect reports with severity levels, reproduction steps, and type safety audits. The same model without the ROLE.md produces vague "looks good" reviews.

**3. Architect plans prevent agent drift.**
When a Dev agent implements without a plan, it makes local decisions that may not align with the project's architecture. When an Architect agent produces a detailed plan first (specifying which files to modify, what imports to rewrite, what dependencies exist between tasks), the Dev agent stays on track. The plan serves as guardrails.

**4. File-based coordination is reliable.**
Issues stored as JSON files in Git are simple, transparent, and reliable. Every agent can read them. Every change is versioned. There is no state synchronisation problem because the filesystem is the single source of truth.

**5. Task decomposition improves quality.**
Breaking work into small, well-scoped tasks (one task per logical change) produces better results than giving an agent a large, vague assignment. The Architect's role in decomposing work into tasks with explicit dependencies and file mappings is crucial.

### What went wrong

**1. Type safety regressions from agents.**
AI agents, even with explicit coding standards in their ROLE.md, sometimes introduce type safety regressions. A common pattern: the agent correctly uses typed wrappers in new code but silently downgrades return types in modified code (e.g., changing `List[Safe_Str__File__Path]` to `List[str]`). The agent's code compiles and tests pass, but the type contract is weaker than before.

**Mitigation:** The QA ROLE.md should include an explicit "Type Safety Audit" section that instructs the QA agent to check every modified method signature for type regressions. This is project-specific -- adapt it to whatever invariants your project cares about.

**2. Background agent timeouts and context limits.**
When running agents as background processes (e.g., Claude Code background tasks), long-running operations can time out. An agent working on a complex task may lose context partway through, producing incomplete work.

**Mitigation:** Break work into smaller tasks. Each agent session should be able to complete its work within a single context window. If a task is too large for one session, decompose it.

**3. Agents skip things when the task is too broad.**
When given a task like "refactor these 13 files", an agent will sometimes do 10 well and skip 3. It is not malicious -- the context gets crowded and items get missed.

**Mitigation:** Use the Architect to produce a detailed plan that lists every file, every change, and every dependency. The Dev agent can then work through the list methodically. The QA agent verifies completeness against the plan.

**4. Agents generate plausible but wrong documentation.**
AI agents can produce documentation that reads well but contains inaccuracies -- wrong method names, invented APIs, or descriptions that do not match the actual code. This is especially dangerous for docs that other agents will read and rely on.

**Mitigation:** Documentation should be reviewed against the actual codebase. The Librarian ROLE.md includes instructions to "always read before writing" and to verify claims against the source.

**5. Pre-existing code issues get inherited.**
When an agent modifies a method, it typically preserves the existing patterns in that method -- including bugs or anti-patterns. If a method already uses raw types, the agent's modifications will also use raw types, even if the ROLE.md says to use typed wrappers.

**Mitigation:** QA reviews should distinguish between "new issues introduced by the agent" and "pre-existing issues the agent should have fixed while touching the code." Both are valid findings, but the severity differs.

**6. Handoff information loss.**
If a Dev agent's handoff to QA is vague ("I implemented the feature, tests pass"), QA spends significant time re-discovering what was changed. Good handoffs save QA time; bad handoffs waste it.

**Mitigation:** The Dev ROLE.md should specify exactly what a handoff must include. The Conductor should reject handoffs that are incomplete.

### Practical advice

- **Start with Dev + QA.** This is the highest-value role separation. Even if you use no other roles, having a separate QA agent review Dev work catches real bugs.
- **Write the ROLE.md before launching the agent.** The time spent writing a thorough ROLE.md pays for itself many times over in agent behaviour quality.
- **Include concrete examples in ROLE.md.** An agent that sees a code example in its ROLE.md will follow that pattern. An agent that reads abstract guidelines will interpret them creatively.
- **Review agent outputs yourself initially.** Do not trust the system blindly. Read the Architect's plans, spot-check the Dev's code, verify QA's findings. Once you have confidence in the process, you can review less frequently.
- **Keep the project brief current.** Agents read the project brief at session start. If it is stale, they will have a wrong mental model of the project's current state.
- **Use issue labels in code comments.** When a Dev agent implements Task-1, it should reference `Task-1` in code comments. This traceability is invaluable for future maintenance.
- **Do not let agents make decisions outside their role.** When a Dev agent encounters an architectural question, it should create a Blocker -- not guess. This is the single most important behaviour rule.
- **Version your ROLE.md files.** As you learn what works and what does not, update the ROLE.md files. They are living documents, not write-once artifacts.

---

## 10. Quick Start Checklist

Follow these steps to set up role-based agentic development on your project.

### Step 1: Create the directory structure

```bash
mkdir -p roles/dev roles/qa roles/architect roles/conductor
mkdir -p .issues/data/task .issues/data/bug .issues/data/decision
```

### Step 2: Write a project brief

Create `roles/conductor/docs/project-brief.md` (or wherever makes sense for your project) with:
- What the project is (one paragraph)
- Core design principles
- Key technologies and dependencies
- Current state (what is built, what is planned)
- Important conventions (naming, testing, etc.)

### Step 3: Write ROLE.md files

Start with the roles you need. At minimum, create:
- `roles/dev/ROLE.md` -- using the template in Section 7, customised with your project's coding standards, naming conventions, and test patterns.
- `roles/qa/ROLE.md` -- using the template, customised with your project's quality priorities, known risk areas, and test tooling.

Use the template in Section 7. The "For AI Agents" section is the most important part. Be specific about:
- What mindset the agent should adopt
- What behaviours are required vs prohibited
- What the agent should do when it starts a session
- What coding or review standards apply

### Step 4: Create your first task

Create `.issues/data/task/Task-1/issue.json`:

```json
{
  "node_id": "001",
  "node_type": "task",
  "node_index": 1,
  "label": "Task-1",
  "title": "Your first task description",
  "status": "todo",
  "tags": [],
  "properties": {
    "assigned_to": "Dev",
    "description": "Detailed description of what needs to be done."
  }
}
```

### Step 5: Launch a Dev agent

Start an AI agent session with instructions like:

> "You are the Dev for this project. Read `roles/dev/ROLE.md` to understand your role. Read `roles/conductor/docs/project-brief.md` for project context. Then pick up Task-1 from `.issues/data/task/Task-1/issue.json` and implement it."

### Step 6: Launch a QA agent

After the Dev agent completes its work, start a new agent session:

> "You are QA for this project. Read `roles/qa/ROLE.md` to understand your role. Read `roles/conductor/docs/project-brief.md` for project context. Review the changes made by the Dev agent. Write a review document at `roles/qa/docs/review__task-1.md`."

### Step 7: Iterate and improve

- After each cycle, update ROLE.md files with lessons learned.
- Add new roles as needed (Architect for design decisions, DevOps for releases, Librarian for docs).
- Refine issue schemas based on what information is missing in handoffs.
- Add more coding standards and examples to the Dev ROLE.md based on what the QA agent finds.

### Step 8: Commit everything

```bash
git add roles/ .issues/
git commit -m "Set up role-based agentic development workflow"
```

The roles, issues, and all coordination artifacts are now versioned alongside your code.

---

## Appendix A: Extending the Role Model

The six core roles cover the standard development workflow. As your project grows, you may need specialised roles:

| Proposed Role | When to Add |
|--------------|-------------|
| **Security** | When the project handles sensitive data or has external users |
| **Performance** | When performance becomes a differentiator or constraint |
| **UX** | When the UI grows beyond basic views |
| **Data** | When schema evolution and data migration become complex |

### Adding a new role

1. Identify a scope that is currently overloading an existing role or being neglected.
2. Define the boundary: what does this role own that no other role owns?
3. Write a ROLE.md using the template in Section 7.
4. Create `roles/<new-role>/ROLE.md`.
5. Update other roles' "Integration with Other Roles" sections to include the new role.
6. Start using it.

The guiding principle: **if a role's ROLE.md is hard to write concisely, the scope is too broad.** Split it.

---

## Appendix B: Comparison with Issues-FS Project Structure

This guide describes the pattern in a simplified, single-repo form. The Issues-FS project, where this pattern was developed, uses a more complex multi-repo structure. Here is how the concepts map:

| This Guide (Single Repo) | Issues-FS (Multi-Repo) |
|--------------------------|------------------------|
| `roles/dev/ROLE.md` | `Issues-FS__Dev__Role__Dev/ROLE.md` (separate Git repo, submodule) |
| `roles/qa/docs/review__feature.md` | `Issues-FS__Dev__Role__QA/docs/review__phase-2-b10-b13.md` |
| `.issues/data/task/Task-1/issue.json` | `modules/Issues-FS/.issues/data/task/Task-1/issue.json` |
| `docs/project-brief.md` | `roles/Issues-FS__Dev__Role__Librarian/docs/project-brief.md` |
| Folders in `roles/` | Separate Git repositories under `roles/` as submodules |

The concepts are identical. The multi-repo structure adds independent versioning and CI for each role, which is useful for large ecosystems but unnecessary for most projects.

---

*Agentic Role-Based Development Guide v1.0*
*Date: 2026-02-08*
