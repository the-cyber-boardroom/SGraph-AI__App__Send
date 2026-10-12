# Issues-FS Role Ecosystem: A Complete Guide

**Document:** issues-fs__role-ecosystem-guide  
**Version:** v2.0  
**Date:** 2026-02-09  
**Status:** Draft  
**Depends On:** issues-fs__thinking-in-graphs v1.0 *(not in repo)*, issues-fs__role-based-agent-coordination v1.0 (`v0.1.0__role-based-coordination.md`), issues-fs__librarian-role v1.0 *(not in repo)*, issues-fs__cartographer-role v1.0 *(not in repo)*, issues-fs__historian-role v1.0 *(not in repo)*, issues-fs__journalist-role v1.0 *(not in repo)*  

---

## What This Document Is

This document provides a complete overview of the ten roles that make up the Issues-FS development ecosystem. It serves as an entry point for anyone — person or agent — who needs to understand who does what, how the roles relate, and why the role composition looks the way it does.

Six of these roles are conventional in software development, even if their specific implementation here is distinctive: **Dev**, **QA**, **Architect**, **DevOps**, **AppSec**, and **Conductor**. Four are unconventional — roles that most development projects either leave unfilled or distribute informally across the team: **Librarian**, **Cartographer**, **Historian**, and **Journalist**. The unconventional roles are not secondary. They are architecturally central to a system where meaning comes from connectivity, strategy comes from landscape awareness, and learning comes from understanding both the present and the past.

---

## The Ten Roles at a Glance

```
                        ┌─────────────────────────────────────┐
                        │            Conductor                │
                        │   Orchestration · Prioritisation    │
                        │       Workflow · Coordination       │
                        └──────────────────┬──────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
    ┌─────────┴─────────┐      ┌──────────┴──────────┐     ┌──────────┴──────────┐
    │    Execution       │      │    Intelligence      │     │    Governance       │
    │                    │      │                      │     │                     │
    │  Dev               │      │  Journalist          │     │  Architect          │
    │  QA                │      │  Librarian           │     │  AppSec             │
    │  DevOps            │      │  Cartographer        │     │                     │
    │                    │      │  Historian            │     │                     │
    └────────────────────┘      └──────────────────────┘     └─────────────────────┘
```

| Role | One-Line Summary | Primary Output |
|------|-----------------|----------------|
| **Conductor** | Orchestrates workflow and coordinates all roles | Plans, assignments, resolved blockers |
| **Architect** | Makes strategic technical decisions and defines boundaries | Decisions (ADRs), interface contracts |
| **Dev** | Implements features, fixes bugs, writes unit tests | Code, unit tests, PRs |
| **QA** | Validates quality through test strategy and execution | Test plans, defect reports, approvals |
| **DevOps** | Manages CI/CD, deployment, and release processes | Pipelines, releases, infrastructure |
| **AppSec** | Secures the ecosystem through threat modelling and auditing | Security assessments, vulnerability reports, hardening guidance |
| **Journalist** | Captures the now through investigation, interviews, and reporting | Daily briefs, stories, interviews, second-story investigations |
| **Librarian** | Curates knowledge and maintains connectivity across the graph | Edges, catalogues, finding aids, authority records |
| **Cartographer** | Maps the strategic landscape using Wardley Maps | Maps, doctrine assessments, gameplay analysis |
| **Historian** | Captures the story of the project and its pivot points | Narratives, context packages, lessons, timelines |

---

## The Execution Roles

These roles produce the tangible artifacts that make the software work: code, tests, and deployments. They are the roles most development teams already have, though in Issues-FS they operate within a typed-issue state machine and coordinate through formal handoff protocols.

### Dev

**Repository:** `Issues-FS__Dev__Role__Dev`

The Dev role owns implementation. It receives work via Handoff issues from the Architect (design decisions) or Conductor (task assignments), writes code following the ecosystem's Type_Safe patterns and osbot-utils conventions, produces unit tests, and hands off completed work to QA.

The Dev role is deliberately bounded. It does not make architectural decisions — if an ambiguity is encountered in an interface contract, the Dev creates a Blocker and escalates to the Conductor rather than improvising. It does not own test strategy (QA does) or deployment (DevOps does). This boundary is not a limitation on capability; it is a focusing mechanism that keeps each session's context clean and each role's output auditable.

**Creates:** Task (sub-tasks), Handoff (to QA, to DevOps), Blocker (when blocked)
**Consumes:** Handoff (from Architect/Conductor), Defect (from QA)

---

### QA

**Repository:** `Issues-FS__Dev__Role__QA`

The QA role owns quality validation. It defines test strategies based on Decision issues, executes integration and acceptance tests, raises Defect issues with clear reproduction steps, and provides Approval issues as quality gates that must be satisfied before release.

QA operates adversarially — its job is to find what is wrong, not to confirm what is right. This adversarial stance is why it is a separate role rather than a hat the Dev wears: an agent cannot simultaneously optimise for "make this work" and "find how this breaks." The role separation ensures that testing is performed with the right priorities and the right scepticism.

**Creates:** Defect, Approval, Review_Request
**Consumes:** Handoff (from Dev), Decision (for testability review)
**Quality gate:** No Approval without test plan executed, all P0 defects resolved, regression suite passing.

---

### DevOps

**Repository:** `Issues-FS__Dev__Role__DevOps`

The DevOps role owns the path from merged code to running software. It maintains CI/CD pipelines for all repositories, manages PyPI and npm publishing workflows, executes coordinated releases across dependent packages, and maintains deployment configurations.

DevOps is the role closest to commodity on the Wardley Map — CI/CD, containerisation, and package publishing are well-understood problems with mature tooling. The DevOps role should lean heavily on existing tools (GitHub Actions, standard release scripts, conventional commits) rather than building custom infrastructure. Its value is reliability and repeatability, not novelty.

**Creates:** Release, Blocker (infrastructure), Handoff (to Conductor on release completion)
**Consumes:** Handoff (from Dev with merged code + QA approval), Task (from Conductor)

---

## The Governance Roles

These roles define boundaries, make structural decisions, and ensure the ecosystem is secure and well-architected. They do not implement — they constrain and enable.

### Architect

**Repository:** `Issues-FS__Dev__Role__Architect`

The Architect owns strategic technical decisions. It authors Architecture Decision Records (ADRs) as Decision issues, defines API contracts between components, reviews the dependency graph for coupling risks, and evaluates technical Blocker issues escalated by the Conductor. The Architect defines the boundaries within which Dev, QA, and DevOps operate.

Every Decision issue must include context (why the decision is needed), options considered (at least two, with trade-offs), a recommendation with rationale, and an impact assessment (which repos and components are affected). The Architect also reviews Decisions for testability — a design that cannot be tested is a design that cannot be validated.

The Architect works closely with the Cartographer: strategic decisions should be made with landscape context. "We should build this ourselves" is a different decision when you can see the component sits at Commodity on the evolution axis versus Genesis.

**Creates:** Decision (ADR), Handoff (to Dev), Blocker (resolution for technical blockers)
**Consumes:** Blocker (escalated from Conductor), Review_Request (from any role)

---

### AppSec

**Repository:** `Issues-FS__Dev__Role__AppSec`

The AppSec (Application Security) role owns the security posture of the ecosystem. Where the Architect defines how components fit together and the Dev implements them, AppSec ensures that the design and implementation are secure — that they resist attack, protect data, and follow security best practices.

AppSec responsibilities include:

- **Threat modelling** — For each component or interface, identifying the attack surface: what could go wrong, what are the trust boundaries, what are the data flows that need protection.
- **Dependency auditing** — Monitoring the ecosystem's dependencies for known vulnerabilities. In a system with as many packages as Issues-FS, supply chain security is a real concern.
- **Security review of decisions** — When the Architect proposes an API design or a new integration, AppSec reviews it for security implications: authentication, authorisation, input validation, data exposure.
- **Secure coding guidance** — Providing Dev with security-specific guidance for the ecosystem's Python/TypeScript stack.
- **Penetration testing and auditing** — Periodically testing the running services for vulnerabilities.
- **Incident response planning** — Defining what happens when a vulnerability is discovered: triage, patching, disclosure, and post-incident review.

AppSec is not a gate that blocks releases. Like the Librarian's quality gatekeeper role, AppSec surfaces risks and provides guidance. Security incidents are covered jointly by AppSec (technical detail and remediation) and the Journalist (narrative, timeline, and second-story investigation into systemic causes).

**Creates:** Security_Assessment, Vulnerability_Report, Blocker (security-critical), Review_Request (security review)
**Consumes:** Decision (for security review), Release (for pre-release audit), Handoff (for security-focused code review)

---

## The Orchestration Role

### Conductor

**Repository:** `Issues-FS__Dev__Role__Conductor`

The Conductor orchestrates the entire workflow. It does not write code, run tests, deploy software, write documentation, create maps, construct narratives, or report the news. It coordinates the agents that do.

The Conductor's primary tools are:
- **Task issues** — Creating and managing units of work
- **Handoff issues** — Formally transferring work between roles
- **Blocker resolution** — Reviewing Blocker issues and resolving or escalating them
- **Sprint/cycle planning** — Maintaining the project backlog and prioritisation
- **Graph tracking** — Using the Issues-FS graph to understand the overall state of the project

The Conductor sits at the intersection of all other roles. When a Handoff completes, the Conductor determines the next step. When a Blocker is raised, the Conductor decides whether it is a technical issue (escalate to Architect), a security issue (route to AppSec), a process issue (resolve directly), or a strategic question (consult the Cartographer). When a milestone completes, the Conductor triggers the Historian's retrospective, the Librarian's documentation update, and the Journalist's milestone coverage.

Critically, the Conductor no longer owns daily briefs or status reporting. Before the Journalist role existed, situational updates were an orphaned responsibility that fell to whoever had time — the Conductor, the Architect, or the Librarian. Now the Journalist owns this explicitly, freeing the Conductor to focus on orchestration.

**Creates:** Task, Handoff, Knowledge_Request, Blocker (resolution)
**Consumes:** Blocker, Approval, Release, Handoff (completion reports), all intelligence outputs (briefs, maps, narratives, health scans)

---

## The Intelligence Roles

These four roles are the least conventional and the most distinctive to the Issues-FS approach. They do not produce code or deployments. They produce *understanding* — the connectivity, landscape awareness, institutional memory, and real-time situational awareness that make everything else more effective.

In most development projects, the work these roles do either doesn't happen (and the project suffers from poor documentation, strategic blindness, and repeated mistakes) or happens informally (and the quality is inconsistent, the knowledge is trapped in individuals' heads, and the effort is never prioritised because no one owns it).

Issues-FS makes these first-class roles because its foundational philosophy — meaning through connectivity — demands them. A graph without curation becomes tangled. A graph without strategic context becomes aimless. A graph without history loses the lessons it paid for. A graph without real-time reporting lets the present evaporate before it can be captured. The intelligence roles prevent these failure modes.

### Journalist

**Repository:** `Issues-FS__Dev__Role__Journalist`

**What:** The Journalist captures the present — what is happening right now, why it matters, and what the people and agents involved actually experienced. Its primary output is stories: daily briefs, feature articles, interviews, and investigative pieces.

**Why it matters:** The raw material of history, strategy, and institutional memory does not create itself. Someone must be at the scene, asking the questions, writing the story, capturing the context while it is fresh. Before the Journalist role existed, daily updates and event coverage were orphaned responsibilities that didn't belong to any role. The Conductor, Architect, Cartographer, and Librarian were all being asked to produce reporting that distracted from their core work.

The Journalist also solves the agentic context evaporation problem. When an agent makes a decision, encounters a problem, and pivots — all within a single session — the reasoning evaporates when the session ends unless someone captures it. The Journalist captures it: not as a log, but as a story with context, sources, and perspectives.

**How it works:** The Journalist draws from the practice of journalism: the inverted pyramid, source attribution, multiple perspectives, the five Ws, editorial independence, and timeliness. It operates across multiple cadences: real-time for breaking news (outages, security incidents), daily for routine briefs, weekly for summaries, and on-demand for feature articles and investigations.

The Journalist's most distinctive capability is **second-story analysis** — a framework from safety science (via Three Mile Island, applied to cybersecurity via Equifax/SolarWinds/Target) that looks past the first story (who to blame) to find the second story (what systemic conditions enabled the failure). When something goes wrong, the Journalist asks not "who made the mistake?" but "what process gaps, tooling limitations, information gaps, or design assumptions made this failure possible?" It then recommends structural fixes — not "be more careful" but concrete changes to prompts, templates, processes, and tooling that prevent recurrence.

The Journalist also conducts **interviews** with roles — both the human directing the project and LLMs operating in role. Interviewing an agent mid-session surfaces reasoning, assumptions, and confidence levels that no other artifact captures. These interviews become invaluable primary sources for the Historian.

**Key principle:** The Journalist produces the Historian's primary sources. Without contemporaneous, context-rich accounts of events, the Historian works from commit logs and issue titles. The quality of history is directly proportional to the quality of journalism that preceded it.

**Creates:** Daily briefs, weekly reports, feature articles, investigations (with second-story analysis), interviews, incident coverage
**Consumes:** All activity across all roles (as source material), AppSec findings (for security incident coverage)

---

### Librarian

**Repository:** `Issues-FS__Dev__Role__Librarian`

**What:** The Librarian curates knowledge and maintains the connectivity of the ecosystem graph. Its primary output is edges — the connections between nodes that make the system navigable and meaningful.

**Why it matters:** In a system where meaning is proportional to connectivity, the role that creates and maintains connections is the role that creates and maintains meaning. Without curation, the ecosystem becomes a collection of files. With curation, it becomes a library: structured, cross-referenced, and searchable.

**How it works:** The Librarian draws from centuries of library science practice. It catalogues new artifacts (adds edges to anchor nodes, cross-references, scope relationships). It classifies nodes within the Lexicon structure. It performs authority control (linking variant names for the same concept across scopes). It weeds stale content (marking superseded or redundant nodes). It creates finding aids (curated subgraphs that help navigate complex topic areas). It runs ecosystem health scans (identifying low-connectivity nodes, stale references, terminology inconsistencies, and conflicts).

**Key principle:** The Librarian is a quality gatekeeper, not a quality enforcer. It surfaces gaps and inconsistencies. It never blocks work. This aligns with the graph-first philosophy of enrichment over enforcement.

**Graph footprint:** The densest in the ecosystem. The Librarian's activity should produce the highest edge density because its entire purpose is connectivity.

**Creates:** Document nodes, finding aids, authority records, health findings, version nodes
**Consumes:** Knowledge_Request (from any role), Decision (for documentation impact)

---

### Cartographer

**Repository:** `Issues-FS__Dev__Role__Cartographer`

**What:** The Cartographer maps the strategic landscape using Wardley Maps. Its primary output is situational awareness — the ability to see where components sit on the evolution axis, how they depend on each other, and what that positioning implies for strategy.

**Why it matters:** The ecosystem has graphs that describe what exists and how it connects. But none of that answers the questions that drive strategic decisions: What should we build next? What should we stop building and buy? Where are we investing in things that should be commodities? These are questions of position and movement. They require maps.

**How it works:** The Cartographer produces Wardley Maps — value chain visualisations plotted against an evolution axis (Genesis → Custom-Built → Product → Commodity). A Wardley Map is a graph with positional metadata: every component is a node, every dependency is an edge, and what makes it a map is two additional pieces of information per node (evolution position and visibility). Maps are stored in the graph alongside everything else.

Beyond maps, the Cartographer assesses **doctrine** (universal strategic principles) and identifies available **gameplays** (strategic moves: ILC, open approaches, ecosystem play, tower and moat). The Cartographer also explores alternative evolution axes beyond the standard one: openness, automation, documentation, test coverage, graph connectivity.

**Key principle:** Maps are graphs with position. Position tells you what to do. A component at Genesis needs exploration. A component at Commodity should be bought, not built.

**Creates:** Maps (as graph artifacts), doctrine assessments, gameplay analyses, change impact assessments
**Consumes:** Decision (for landscape context), Release (for evolution tracking)

---

### Historian

**Repository:** `Issues-FS__Dev__Role__Historian`

**What:** The Historian captures the story of the project — not the log of everything that happened, but the narrative of which moments actually changed the trajectory and what they teach us. Its primary output is structured memory: narratives, context packages, lessons, and timelines.

**Why it matters:** In an agentic world, there is no persistent memory. Each agent session starts fresh. Without the Historian, every new session is a new hire on their first day — access to all the files, none of the institutional memory. The Historian compresses institutional knowledge into structured memory artifacts that agents can consume at the start of a session.

**How it works:** The Historian draws from historiographic practice. It identifies **pivot points** (the moments that changed trajectory — not the dramatic crises but the underlying shifts), constructs **narratives** at multiple scales (micro, project, cross-project, meta), produces **context packages** (curated history for agent onboarding), and maintains a **timeline** with periodisation (meaningful epochs defined by pivot points).

The Historian is fact-based and non-judgmental. It traces consequences rather than declaring decisions "good" or "bad." When interpretation is necessary, it is labelled as such.

**Key principle:** Logs record everything. Historians find what mattered. The Historian depends critically on the Journalist's output — the richer the contemporaneous accounts, the better the history that can be constructed from them.

**Creates:** Epoch nodes, pivot points, narratives, context packages, causation chains, lessons, retrospectives
**Consumes:** Decision (for consequence tracing), Journalist stories (as primary sources)

---

## How the Roles Interact

### The Coordination Flow

The standard flow for a feature from inception to completion:

```
Conductor ──→ Architect ──→ Dev ──→ QA ──→ DevOps ──→ Conductor
   │              │           │       │        │           │
   │              │           │       │        │           │
   ▼              ▼           ▼       ▼        ▼           ▼
AppSec reviews  Decision   Code    Tests   Release    Knowledge_Request
security        created    written  run     deployed   to Librarian
implications                                           and Historian
                                                            │
                                                            ▼
                                                      Journalist covers
                                                      the whole flow
```

This is the production pipeline. Work flows left to right through the execution roles, with governance roles (Architect, AppSec) reviewing at key points, and the Conductor orchestrating the whole. The Journalist covers every stage.

### The Intelligence Loop

In parallel with the production pipeline, the intelligence roles operate continuously:

```
┌──────────────────────────────────────────────────────────────────┐
│                      Intelligence Loop                           │
│                                                                  │
│  Journalist ──────────────────────────────→ Historian             │
│     │  Captures the now.                       │  Interprets     │
│     │  Interviews roles.                       │  the past.      │
│     │  Investigates (second stories).          │  Finds pivots.  │
│     │  Produces primary sources.               │  Builds memory. │
│     │                                          │                 │
│     │          Librarian ←────────────────────►│                 │
│     │             │  Catalogues everything.    │                 │
│     │             │  Maintains connectivity.   │                 │
│     │             │  Runs health scans.        │                 │
│     │             │                            │                 │
│     │          Cartographer ←─────────────────►│                 │
│     │             │  Maps the landscape.       │                 │
│     │             │  Assesses doctrine.        │                 │
│     │             │  Identifies gameplays.     │                 │
│     │             │                            │                 │
│     └─────────────┴────────────────────────────┘                 │
│                                                                  │
│   Feeds into: Conductor (briefs, planning), Architect            │
│   (decisions), Dev/QA/DevOps (context and onboarding)            │
└──────────────────────────────────────────────────────────────────┘
```

The intelligence roles feed the production pipeline with understanding:

- The **Journalist** ensures events are captured with context, reasoning, and multiple perspectives while they are happening. Produces the primary record that all other intelligence roles depend on.
- The **Librarian** ensures the Architect can find relevant prior decisions, the Dev can find relevant documentation, and the QA can find relevant test plans.
- The **Cartographer** ensures the Architect makes decisions with landscape context, the Conductor prioritises based on strategic position, and the Dev calibrates approach to component maturity.
- The **Historian** ensures new agent sessions start with institutional memory, past mistakes are not repeated, and cross-project patterns are recognised and exploited.

### The Intelligence Quartet

The four intelligence roles form a natural ensemble, each providing a different lens on the same ecosystem:

| Dimension | Journalist | Librarian | Cartographer | Historian |
|-----------|------------|-----------|--------------|-----------|
| **Question answered** | What is happening now? | Where are things? | Where do things sit strategically? | How did things get here? |
| **Temporal focus** | Present | Atemporal (current state) | Present + trajectory | Past |
| **Orientation** | Narrative/investigative | Structural/spatial | Positional/strategic | Temporal/causal |
| **Primary output** | Stories, briefs, interviews | Edges and catalogues | Maps and assessments | Narratives and context |
| **Metaphor** | The newsroom | The library | The atlas | The chronicle |
| **Internal discipline** | Journalism + second stories | Library science | Wardley Mapping | Historiography |
| **Graph contribution** | Source-rich story nodes | Connectivity (edges) | Position (evolution metadata) | Temporality (causation chains) |
| **Failure mode if absent** | Present evaporates uncaptured | Ecosystem is unfindable | Decisions lack landscape context | Mistakes are repeated endlessly |

The quartet forms a temporal pipeline:

```
Journalist (now) ──→ Librarian (organises) ──→ Historian (interprets)
                                                      │
                     Cartographer (maps position) ◄───┘
                            │
                            └──→ feeds back into Journalist coverage
```

Each role makes the others more effective:
- The **Journalist** produces the primary sources that the **Historian** interprets
- The **Librarian** catalogues the output of all four intelligence roles
- The **Cartographer's** map snapshots become the **Historian's** map histories
- The **Historian's** pivot points inform the **Cartographer's** evolution assessments
- The **Librarian's** connectivity data feeds the **Cartographer's** alternative axes
- The **Cartographer's** and **Historian's** outputs provide context that enriches the **Journalist's** stories
- The **Journalist's** interviews surface context that the **Librarian** would never find in formal artifacts

### Pairwise Relationships

| | Conductor | Architect | Dev | QA | DevOps | AppSec | Journalist | Librarian | Cartographer | Historian |
|---|---|---|---|---|---|---|---|---|---|---|
| **Conductor** | — | Escalates blockers | Assigns tasks | Receives approvals | Receives releases | Routes security issues | Receives daily briefs | Requests doc updates | Receives strategic context | Receives retrospectives |
| **Architect** | Reports decisions | — | Provides contracts | Reviews testability | Evaluates infra | Collaborates on design | Interviewed for stories | Docs maintained | Landscape for decisions | Decision genealogies |
| **Dev** | Reports completion | Receives contracts | — | Hands off for testing | Hands off for deploy | Receives guidance | Interviewed mid-session | Docs catalogued | Component maturity | Context packages |
| **QA** | Reports approval | Reviews testability | Raises defects | — | Validates releases | Tests security controls | Coverage of findings | Test docs catalogued | — | Defect pattern history |
| **DevOps** | Reports releases | Receives infra decisions | Receives code | Receives approvals | — | Implements security | Release coverage | Release docs | — | Deployment history |
| **AppSec** | Security blockers | Reviews decisions | Provides guidance | Coordinates testing | Reviews pipelines | — | Joint incident coverage | Security docs | — | Incident history |
| **Journalist** | Daily briefs to | Interviews, covers decisions | Interviews mid-session | Covers findings | Covers releases | Second-story investigations | — | Stories catalogued | Strategic context for stories | Produces primary sources |
| **Librarian** | Knowledge_Requests | Documents decisions | Catalogues code docs | Catalogues test docs | Catalogues releases | Catalogues security | Catalogues stories | — | Catalogues maps | Catalogues narratives |
| **Cartographer** | Strategic context | Landscape for decisions | Maturity context | — | — | — | Covered in stories | Coordinates storage | — | Map histories |
| **Historian** | Retrospectives | Decision genealogies | Context packages | Defect history | Deploy history | Incident history | Draws from stories | Draws from archive | Annotates map sequences | — |

---

## Why This Role Composition

### The Conventional Roles

Dev, QA, DevOps, Architect, and AppSec are present because software development requires them. They exist in some form in every serious project. The Issues-FS implementation is distinctive in three ways:

1. **Role repos, not role descriptions.** Each role has its own repository with prompts, templates, schemas, and workflow definitions. The role is defined by its artifacts, not by a paragraph in a project plan.

2. **Typed-issue coordination.** Roles communicate through typed Issues-FS issues (Decision, Handoff, Defect, Approval, etc.) with defined schemas and state machine transitions. The coordination protocol is the workflow engine.

3. **Explicit boundaries.** Each role's ROLE.md defines not just what it does but what it does *not* do. Dev does not make architectural decisions. QA does not implement fixes. The Architect does not deploy. These boundaries prevent context pollution and keep each agent session focused.

### The Conductor

The Conductor exists because multi-agent coordination does not happen by itself. Someone must assign work, track progress, resolve blockers, and ensure handoffs complete. In human teams this is often distributed informally. In an agent-based system it must be explicit, because agents do not have the social awareness to self-organise.

### The Intelligence Roles

The Journalist, Librarian, Cartographer, and Historian exist because the Issues-FS foundational philosophy demands them:

**"The present must be captured before it can become the past"** → Someone must report on what is happening now, with context and investigation → **Journalist**

**"Meaning comes from connectivity"** → Someone must create and maintain connections → **Librarian**

**"Position determines strategy"** → Someone must map the landscape and track evolution → **Cartographer**

**"Learning comes from understanding the past"** → Someone must find what mattered and make it accessible → **Historian**

The Journalist's addition was driven by a specific realisation: the Historian cannot construct rich narratives from pivot points that were never recorded. The materials the Historian needs — contemporaneous accounts with context, reasoning, and multiple perspectives — were not being created as events happened. The daily briefs, the interviews, the investigative pieces, the incident coverage — all of this was nobody's job. The Conductor, Architect, Cartographer, and Librarian were all being asked to produce reporting that distracted from their core responsibilities. Now the Journalist owns this explicitly.

The intelligence roles are also the roles most enhanced by AI agents. A human Journalist struggles to cover every event across a large ecosystem. A human Librarian struggles to maintain connectivity across thousands of nodes. A human Cartographer struggles to keep maps current across dozens of components. A human Historian struggles to sift through months of material to find pivot points. These are exactly the tasks where agents excel: high-volume, pattern-intensive, graph-traversal work that requires thoroughness more than creativity.

### AppSec as a Dedicated Role

AppSec is separated from Dev and Architect because security is an adversarial concern — like QA, it benefits from a dedicated perspective that is not optimising for feature delivery. Security incidents are covered jointly by AppSec (technical detail and remediation) and the Journalist (narrative, investigation, and second-story analysis into systemic causes).

---

## Adding New Roles

The role ecosystem is designed to grow. The guiding principle from the Role-Based Agent Coordination Architecture: **create highly focused teams with just the resources needed.** Each role should have a clear, non-overlapping scope. If a role's ROLE.md is hard to write concisely, it probably needs splitting.

The process for adding a new role:

1. **Conductor** creates a Decision issue: "Do we need a {Role} role?"
2. **Architect** evaluates: Does this overlap with existing roles? Can it be scoped cleanly?
3. If accepted: **Architect** defines the boundary and interface with existing roles
4. **Dev** creates the repo with the standard structure
5. **Librarian** creates the ROLE.md and initial documentation
6. **Historian** records the role addition as a historical event and updates context packages
7. **Cartographer** adds the new role to the role maturity maps
8. **Journalist** covers the new role addition: what it is, why it was needed, how it changes the ecosystem
9. **Conductor** updates coordination workflows to include the new role

Potential future roles identified in the architecture documents include: Performance, Integrations, UX, Data, Release_Manager, and Onboarding. Each would be added only when its scope is distinct enough and its workload is large enough to warrant a dedicated role.

---

## References

> **Note (2026-07-31, Librarian):** Of the 9 references below, 2 were mis-linked (wrong filename) and have been corrected; 7 are not yet committed to this repo — they may exist in an external Issues-FS vault. Broken links are annotated with *(not in repo)*.

- Thinking in Graphs: Meaning Through Connectivity — Foundational philosophy *(not in repo — `v0_4_0__issues-fs__thinking-in-graphs.md`)*
- [Issues-FS Role-Based Agent Coordination](./v0.1.0__role-based-coordination.md) — Role architecture and coordination protocol *(corrected from `v0_1_0__issues-fs__role-based-agent-coordination.md`)*
- Issues-FS Journalist Role — Full Journalist specification *(not in repo — `v0_4_0__issues-fs__journalist-role.md`)*
- Issues-FS Librarian Role — Full Librarian specification *(not in repo — `v0_4_0__issues-fs__librarian-role.md`)*
- Issues-FS Cartographer Role — Full Cartographer specification *(not in repo — `v0_4_0__issues-fs__cartographer-role.md`)*
- Issues-FS Historian Role — Full Historian specification *(not in repo — `v0_4_0__issues-fs__historian-role.md`)*
- [Issues-FS Role Architecture Framework Analysis](./v0.1.0__role-architecture-framework.md) — Framework stress-test *(corrected from `v0_1_0__issues-fs__role-architecture-framework-analysis.md`)*
- Issues-FS Lexicon Architecture v2.0 — The root graph *(not in repo — `v0_4_0__issues-fs__lexicon-architecture-v2.md`)*
- Issues-FS Architecture Overview — Ecosystem architecture *(not in repo — `v0_4_0__issues-fs__architecture-overview.md`)*
- [Second Stories: From Three Mile Island to Cybersecurity](https://docs.diniscruz.ai/2025/02/10/second-stories__from-three-mile-island-to-cybersecurity.html) — The second-story framework

---

*Issues-FS Role Ecosystem Guide v2.0*  
*Date: 2026-02-09*
