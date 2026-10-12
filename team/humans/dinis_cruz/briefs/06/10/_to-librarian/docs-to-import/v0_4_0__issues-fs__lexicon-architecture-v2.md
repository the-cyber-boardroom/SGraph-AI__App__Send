# Issues-FS Lexicon: The Root Graph of the Ecosystem

**Document:** issues-fs__lexicon-architecture  
**Version:** v2.0  
**Date:** 2026-02-05  
**Status:** Draft  
**Depends On:** issues-fs__thinking-in-graphs v1.0, issues-fs__architecture-overview v1.0, issues-fs__role-based-agent-coordination v1.0  

---

## Executive Summary

This document defines `Issues-FS__Lexicon` — the root graph of the Issues-FS ecosystem. It provides well-connected anchor nodes for shared concepts, graph traversal tools for computing meaning and compatibility, and bootstrap definitions that any scope can extend, specialise, or override.

The Lexicon is not a schema registry. It is not the authoritative source of definitions. It is the **most well-connected graph in the ecosystem** — the one that other graphs link to when they want to increase the confidence and interoperability of their own nodes.

Together with `osbot-utils`, it forms one of two universal dependencies: osbot-utils defines **how we build** (Type_Safe patterns, structural code); Lexicon provides **anchor nodes to link to** (shared vocabulary, reference graphs). Every Issues-FS repository depends on both.

This document is grounded in the principles of [Thinking in Graphs: Meaning Through Connectivity](./v0_4_0__issues-fs__thinking-in-graphs.md), which should be read first.

---

## Why: The Anchor Problem

### Meaning Requires Connectivity

As established in the Thinking in Graphs document, a node has no inherent meaning. A node labelled "Task" is just a node. What makes it meaningful is the edges you can trace from it — to a type definition, to a set of valid statuses, to a state machine, to related concepts, to external reference vocabularies. The more edges, the more meaning. The fewer edges, the less the system can say about the node.

In a growing ecosystem with many repos, many projects, and many scopes — each defining their own nodes and edges — a problem emerges: **what do the edges connect to?**

If `Project-6` defines a Task type and `Project-7` defines a Task type, and neither connects to anything shared, they are islands. Graph analysis can't compute compatibility between them. A developer working across both projects can't rely on "Task" meaning the same thing. The graphs are locally meaningful but globally opaque.

The Lexicon solves this by providing **well-connected reference nodes** that any scope can link to. It doesn't force conformity — it provides anchors. A project that links its local Task definition to the Lexicon's Task anchor node gains interoperability with every other project that also links to that anchor. A project that doesn't link to the anchor remains locally meaningful but invisible to cross-scope analysis.

### The Two-Dependency Invariant

Every Issues-FS repository depends on exactly two foundational packages:

```
Every Issues-FS repo
    ├── osbot-utils          → Structural patterns (Type_Safe, how we build)
    └── issues-fs-lexicon    → Anchor nodes and graph tools (what we can link to)
```

This invariant means:

- **Any repo can link to shared anchor nodes** without importing heavyweight dependencies. A role repo doesn't need the core library to reference the Task concept — it links to the Lexicon's Task anchor node.
- **New repos start with connectivity immediately.** The anchor nodes are available from the first line of code. A new project's nodes can link to them from day one, or never — the choice is the project's.
- **The tooling for graph analysis is universally available.** Every repo can compute connectivity, compatibility, and confidence because the traversal tools ship with the Lexicon.

### Why Not Just Schemas?

A `__Schemas` repo would encode a declarative, schema-first model: "here is what a Task IS, conform or fail." That model contradicts the graph-first philosophy. The Lexicon provides something different:

| What Schemas Give You | What the Lexicon Gives You |
|----------------------|---------------------------|
| "A Task has these fields" (declaration) | A Task anchor node with edges to field concept nodes (graph structure) |
| "These statuses are valid" (constraint) | A set of status nodes with transition edges between them (reference pattern) |
| "A Defect is a type of Issue" (type hierarchy) | An edge from the Defect anchor to the Issue anchor (graph relationship) |
| Validation: "this conforms or doesn't" | Analysis: "this links to 4/7 reference edges — here's what's connected and what's missing" |
| One definition per concept | Multiple definitions can coexist; compatibility is computed from subgraph overlap |

The Lexicon is a graph of reference nodes. Schemas are one way to represent some of those nodes in code. But the graph is primary; the code representation is secondary.

---

## What: The Lexicon as a Graph

### Package Details

| Attribute | Value |
|-----------|-------|
| Repository | `Issues-FS__Lexicon` |
| Package | `issues-fs-lexicon` |
| Registry | PyPI |
| Dependencies | `osbot-utils` (only) |
| Depended on by | Every Issues-FS repository |

### What the Lexicon Contains

The Lexicon provides three things:

**1. Anchor Nodes** — Well-connected reference nodes for shared concepts. These are the nodes that other graphs link to. Each anchor node has a rich subgraph of edges to related concepts, constraints, and external references.

**2. Reference Patterns** — Common subgraph shapes that represent well-understood structures. For example: "a workflow with steps," "a type with fields," "a state machine with transitions." These patterns are not prescriptive — they are recognisable shapes that graph analysis can look for.

**3. Graph Tools** — Traversal and analysis code that computes connectivity, compatibility, coverage, and confidence. These tools work on any graph, not just the Lexicon's own.

### Repository Structure

```
Issues-FS__Lexicon/
├── README.md
├── setup.py / pyproject.toml
│
├── issues_fs_lexicon/
│   │
│   ├── anchors/                            → Anchor node definitions
│   │   │
│   │   ├── anchors__core/                  → Core issue-domain anchors
│   │   │   ├── anchor__issue.py            → Issue concept (root anchor)
│   │   │   ├── anchor__task.py             → Task concept with field/status subgraph
│   │   │   ├── anchor__bug.py              → Bug concept
│   │   │   ├── anchor__epic.py             → Epic concept
│   │   │   └── anchor__feature.py          → Feature concept
│   │   │
│   │   ├── anchors__coordination/          → Role coordination anchors
│   │   │   ├── anchor__decision.py         → Decision (ADR) concept
│   │   │   ├── anchor__handoff.py          → Handoff concept
│   │   │   ├── anchor__review_request.py   → Review request concept
│   │   │   ├── anchor__approval.py         → Approval concept
│   │   │   ├── anchor__blocker.py          → Blocker concept
│   │   │   ├── anchor__defect.py           → Defect concept
│   │   │   ├── anchor__release.py          → Release concept
│   │   │   └── anchor__knowledge_request.py
│   │   │
│   │   ├── anchors__structural/            → Structural concept anchors
│   │   │   ├── anchor__status.py           → Status concept
│   │   │   ├── anchor__priority.py         → Priority concept
│   │   │   ├── anchor__role.py             → Role concept
│   │   │   ├── anchor__link.py             → Link/relationship concept
│   │   │   └── anchor__workflow.py         → Workflow concept
│   │   │
│   │   └── anchors__external/              → Cross-graph edges to external references
│   │       ├── anchor__schema_org.py       → Edges to schema.org concepts
│   │       ├── anchor__skos.py             → Edges to SKOS vocabulary concepts
│   │       └── anchor__prov_o.py           → Edges to W3C Provenance Ontology
│   │
│   ├── patterns/                           → Reference subgraph patterns
│   │   ├── pattern__workflow.py            → "A thing with ordered steps"
│   │   ├── pattern__typed_entity.py        → "A thing with a type and fields"
│   │   ├── pattern__state_machine.py       → "A thing with states and transitions"
│   │   ├── pattern__review_process.py      → "A review with examine/judge/document/action"
│   │   ├── pattern__handoff_protocol.py    → "A transfer with source/target/deliverables"
│   │   └── pattern__fractal_scope.py       → "A scope that can define its own vocabulary"
│   │
│   ├── graphs/                             → MGraph-native representations
│   │   ├── graph__anchors.py               → All anchor nodes as a queryable MGraph
│   │   ├── graph__patterns.py              → All reference patterns as MGraph subgraphs
│   │   ├── graph__external_refs.py         → Cross-graph edges to external vocabularies
│   │   └── graph__builder.py               → Utilities for building scope-local graphs
│   │
│   ├── analysis/                           → Graph traversal and analysis tools
│   │   ├── analysis__connectivity.py       → Compute how well-connected a node is
│   │   ├── analysis__compatibility.py      → Compute subgraph overlap between nodes
│   │   ├── analysis__coverage.py           → Compute coverage against a reference pattern
│   │   ├── analysis__confidence.py         → Compute confidence level for a node's meaning
│   │   ├── analysis__gaps.py               → Find missing edges that would increase confidence
│   │   ├── analysis__conflicts.py          → Find contradictory definitions across scopes
│   │   └── analysis__scope_resolver.py     → Resolve a concept by walking up the scope chain
│   │
│   ├── bootstrap/                          → Opinionated but overridable defaults
│   │   ├── bootstrap__issue_types.py       → Default issue type set (Task, Bug, Epic, etc.)
│   │   ├── bootstrap__statuses.py          → Default status sets per issue type
│   │   ├── bootstrap__priorities.py        → Default priority levels (P0-P3)
│   │   ├── bootstrap__link_types.py        → Default link types (blocks, depends_on, etc.)
│   │   ├── bootstrap__roles.py             → Default role set (Dev, QA, Architect, etc.)
│   │   └── bootstrap__transitions.py       → Default state machine transitions
│   │
│   ├── base_classes/                       → Type_Safe base classes for domain objects
│   │   ├── Base__Anchor_Node.py            → Base class for anchor node definitions
│   │   ├── Base__Pattern.py                → Base class for reference patterns
│   │   ├── Base__Scope.py                  → Base class for fractal scope definitions
│   │   └── Base__Graph_Analysis.py         → Base class for analysis tools
│   │
│   ├── data/                               → Static data files (JSON)
│   │   ├── issue-types.json                → ← migrated from Issues-FS core
│   │   ├── link-types.json                 → ← migrated from Issues-FS core
│   │   ├── statuses.json                   → Default status definitions
│   │   ├── external-refs.json              → Mapping to schema.org, SKOS, PROV-O concepts
│   │   └── patterns.json                   → Reference pattern definitions
│   │
│   └── docs/                               → Human-readable reference
│       ├── glossary.md                     → Domain terms (as reference, not authority)
│       ├── anchor_nodes.md                 → What each anchor node represents
│       ├── patterns.md                     → Reference patterns explained
│       ├── external_refs.md                → How Lexicon concepts map to external vocabularies
│       └── analysis_guide.md               → How to use the graph analysis tools
│
└── tests/
    ├── test__anchors/                      → Verify anchor nodes are well-connected
    ├── test__patterns/                     → Verify patterns are structurally sound
    ├── test__analysis/                     → Verify analysis tools produce correct results
    └── test__graph_integrity/              → Cross-cutting graph health checks
        ├── test__anchors_have_subgraphs.py        → Every anchor has a meaningful subgraph
        ├── test__patterns_are_discoverable.py     → Patterns can be matched in sample graphs
        ├── test__external_refs_are_reachable.py   → External reference edges lead somewhere
        └── test__bootstrap_links_to_anchors.py    → Bootstrap definitions link to anchor nodes
```

### Key Structural Differences from v1.0

| v1.0 (Schema-First) | v2.0 (Graph-First) |
|---------------------|---------------------|
| `ontologies/` — hierarchical concept definitions | `anchors/` — well-connected reference nodes |
| `taxonomies/` — classification trees | Taxonomies are subgraph patterns within anchor nodes |
| `schemas/` — field-level definitions | Fields are nodes with edges to anchor concepts |
| `state_machines/` — transition rules | `patterns/pattern__state_machine.py` — a recognisable subgraph shape |
| `constants/enums/` — authoritative enum lists | `bootstrap/` — opinionated defaults that scopes can override |
| `test__consistency/` — "does everything have a schema?" | `test__graph_integrity/` — "is the graph well-connected?" |
| No analysis tools | `analysis/` — core graph analysis tools ship with the Lexicon |

---

## How: The Fractal Model

### The Lexicon Is the Root, Not the Authority

The `Issues-FS__Lexicon` is the **root scope** in a fractal hierarchy. Every level below it — repos, projects, epics, sprints, individual issues — can define its own nodes and edges. The root scope is special only because:

1. It is the most well-connected graph (most anchor nodes, most edges to external references)
2. It is depended on by every repo (so its anchor nodes are universally available for linking)
3. It ships the analysis tools (so every scope can compute its own connectivity)

It is not special because its definitions are authoritative. A project-level definition of "Review" is exactly as valid as the Lexicon's definition. The Lexicon's definition is simply more connected — more edges to more concepts — which means graph analysis can say more about nodes that link to it.

### Scope Resolution

When the system encounters a concept, it resolves meaning by walking the scope chain:

```
Task-23 (in Sprint-3, in Project-6)
    ├── type ──→ "Task" (local reference)
    │
    │   Scope resolution:
    │   1. Does Sprint-3 define "Task"?  → No
    │   2. Does Project-6 define "Task"? → Yes: local Task definition node
    │       └── links_to ──→ Lexicon:anchor__task (anchor node)
    │                            ├── has_field ──→ title
    │                            ├── has_field ──→ status
    │                            ├── has_field ──→ assigned_to
    │                            ├── has_pattern ──→ pattern__state_machine
    │                            └── similar_to ──→ schema.org/Action
    │
    │   Result: Task-23's type resolves to Project-6's local definition,
    │   which links to the Lexicon anchor. Confidence: high.
```

If the scope chain reaches the root Lexicon without finding a definition:

```
Spike-1 (in Epic-14, in Project-6)
    ├── type ──→ "Spike" (local reference)
    │
    │   Scope resolution:
    │   1. Does Epic-14 define "Spike"?  → Yes: local node with edges to
    │       ├── has_purpose ──→ "exploratory research"
    │       ├── has_output ──→ "decision or prototype"
    │       └── (no link to Lexicon anchor)
    │
    │   Result: Spike-1's type resolves to Epic-14's local definition.
    │   No Lexicon anchor linked. Confidence: local-only.
    │   
    │   The system can report: "Spike is defined in Epic-14's scope.
    │   It has 3 edges. It does not link to any Lexicon anchor, so
    │   cross-scope analysis cannot compare it to other concepts.
    │   Adding a link to Lexicon:anchor__task or a new Lexicon anchor
    │   would increase interoperability."
```

If no definition exists anywhere:

```
Widget-7 (in Task-23)
    ├── type ──→ "Widget" (local reference)
    │
    │   Scope resolution:
    │   1. Does Task-23 define "Widget"? → No
    │   2. Does Sprint-3 define "Widget"? → No
    │   3. Does Project-6 define "Widget"? → No
    │   4. Does Lexicon define "Widget"? → No
    │
    │   Result: No definition found in any scope.
    │   The system can report: "Widget-7 references type 'Widget' but
    │   no definition of Widget exists in any reachable scope.
    │   This node's type is unknown."
```

All three outcomes are valid. The system never rejects a node for lacking a definition. It reports what it found and what it didn't.

### Every Scope Is a Potential Lexicon

The fractal principle means that any scope can serve as a "lexicon" for its children:

```
Issues-FS__Lexicon                    → Root lexicon for the ecosystem
    └── Issues-FS__Service__GitHub    → Lexicon for GitHub integration concepts
        ├── defines: PR_Review, Merge_Conflict, Label_Sync
        └── these concepts link to Lexicon anchors where applicable
            └── Project-6             → Lexicon for this project's concepts
                ├── defines: Sprint_Goal, Retrospective, Team_Velocity
                └── some link to Lexicon, some are local-only
                    └── Epic-14       → Lexicon for this epic's concepts
                        ├── defines: Spike, Tech_Debt_Item
                        └── local-only definitions
```

Each level adds nodes and edges. Each level can link to the level above — or not. The richness of cross-scope connectivity is a choice, not a requirement. The analysis tools report the consequences of that choice: "Your scope has 5 local definitions. 3 link to Lexicon anchors (high interoperability). 2 are local-only (opaque to cross-scope analysis)."

### Name Clashes and Divergent Definitions

When two scopes define the same concept differently, the graph contains both definitions as separate nodes:

```
Project-6:Review
    ├── has_step ──→ code_inspection
    ├── has_step ──→ write_feedback
    ├── has_step ──→ approve_or_reject
    └── links_to ──→ Lexicon:anchor__review_request

Project-7:Review
    ├── has_step ──→ client_presentation
    ├── has_step ──→ collect_sign_off
    ├── requires ──→ client_present
    └── links_to ──→ Lexicon:anchor__review_request
```

Both link to the same Lexicon anchor. The analysis tools can compute:

- **Overlap:** Both have edges to the Lexicon anchor (shared reference point)
- **Divergence:** Project-6's Review is about code; Project-7's Review is about client deliverables
- **Pattern coverage:** Against the reference review pattern (examine/judge/document/action), Project-6 covers 3/4, Project-7 covers 2/4
- **Compatibility:** For the purpose of "was something reviewed," both are compatible. For the purpose of "does this meet our code review standards," only Project-6 applies.

The system surfaces this; it does not resolve it. Resolution is a human or Librarian decision: promote a shared definition to a parent scope, keep them intentionally separate, or create a new anchor that captures the common subset.

---

## Anchor Nodes in Detail

### What Makes a Good Anchor Node

An anchor node is not a schema definition. It is a node with properties that make it useful as a reference point:

1. **Well-connected** — It has edges to many related concepts, forming a rich subgraph. The Lexicon's Task anchor doesn't just say "a Task has a title." It has edges to: field concepts (title, status, assigned_to, priority), pattern concepts (state machine, workflow), structural concepts (a Task is-a Issue, a Task can-be-parent-of Task), and external references (similar_to schema.org/Action).

2. **Well-documented** — Its subgraph includes human-readable nodes: purpose, usage notes, examples. These aren't metadata on the anchor node itself — they are nodes connected by edges, queryable and traversable.

3. **Versioned** — The anchor node's subgraph is versioned with the Lexicon release. A link to `Lexicon@1.0:anchor__task` pins meaning to that version. A link to `Lexicon:anchor__task` floats with the latest.

4. **Non-coercive** — The anchor node does not validate or reject nodes that link to it. It is a reference point, not a gatekeeper. A node can link to the Task anchor and have completely different fields — the anchor doesn't care. The analysis tools will report the divergence, but the anchor itself is passive.

### Anchor Node Structure

Every anchor node follows the same structural pattern (which is itself a reference pattern in the Lexicon):

```
Lexicon:anchor__decision
    │
    ├── identity
    │   ├── name ──→ "Decision"
    │   ├── purpose ──→ "A record of a technical or strategic choice"
    │   └── version ──→ "1.0"
    │
    ├── fields (connected concepts)
    │   ├── has_field ──→ title (concept node)
    │   ├── has_field ──→ context (concept node)
    │   ├── has_field ──→ options (concept node, list)
    │   ├── has_field ──→ recommendation (concept node)
    │   ├── has_field ──→ impact (concept node, list)
    │   ├── has_field ──→ decided_by (links_to ──→ anchor__role)
    │   └── has_field ──→ supersedes (links_to ──→ anchor__decision, self-ref)
    │
    ├── patterns
    │   ├── has_pattern ──→ pattern__state_machine
    │   │                      └── states: proposed, under_review, accepted,
    │   │                                  rejected, superseded, implemented
    │   └── has_pattern ──→ pattern__review_process
    │                          └── (decisions should be reviewed)
    │
    ├── relationships
    │   ├── is_a ──→ anchor__issue
    │   ├── created_by ──→ anchor__role (typically Architect, Conductor)
    │   └── consumed_by ──→ anchor__role (all roles)
    │
    └── external_references
        ├── similar_to ──→ schema.org/ChooseAction
        └── provenance_model ──→ prov-o:Activity
```

This is not a schema. It is a subgraph. Every element — every field, every pattern, every relationship — is a node connected by an edge. The anchor is the root of this subgraph, not a container that holds it.

### External Reference Anchors

The Lexicon maintains edges to external reference vocabularies. These edges are first-class graph structure, not metadata imports:

```
Lexicon:external__schema_org__Review
    ├── source ──→ "https://schema.org/Review"
    ├── has_concept ──→ reviewBody (concept node in Lexicon graph)
    ├── has_concept ──→ reviewRating (concept node in Lexicon graph)
    ├── has_concept ──→ itemReviewed (concept node in Lexicon graph)
    └── maintained_by ──→ "schema.org community"

Lexicon:anchor__review_request
    ├── ... (own subgraph)
    └── external_references
        ├── related_to ──→ Lexicon:external__schema_org__Review
        │                     └── field_mapping
        │                         ├── findings ──→ similar_to ──→ reviewBody
        │                         └── outcome ──→ similar_to ──→ reviewRating
        └── related_to ──→ Lexicon:external__skos__Concept
```

Note: the schema.org concepts are **nodes in the Lexicon graph**, not imported from schema.org at runtime. They are curated representations that the Lexicon maintains. This means the Lexicon's understanding of schema.org can be versioned, can diverge from schema.org's current state, and can be enriched with edges that schema.org itself doesn't have.

A local scope's node doesn't link to schema.org directly. It links to Lexicon anchors, which have edges to schema.org concept nodes. The path is: `local node → Lexicon anchor → schema.org concept`. The number of hops is part of the confidence computation.

---

## Reference Patterns

### What Patterns Are

A reference pattern is a recognisable subgraph shape. It is not a template to be instantiated — it is a shape to be recognised. The analysis tools can examine any subgraph and report: "this subgraph matches the Workflow pattern at 4/5 steps" or "this subgraph does not match any known pattern."

### Core Patterns

**Pattern: Workflow** — A thing with ordered steps.

```
pattern__workflow
    ├── recognise_by
    │   ├── node has ──→ has_step edges (1 or more)
    │   └── step nodes have ──→ order or sequence edges (optional)
    ├── common_elements
    │   ├── initiation (something starts the workflow)
    │   ├── execution (something does the work)
    │   ├── documentation (something records what happened)
    │   └── conclusion (something ends the workflow)
    └── confidence_notes
        └── "A workflow with all 4 common elements is fully-formed.
             A workflow missing 'documentation' may lose traceability.
             A workflow missing 'conclusion' may never terminate."
```

**Pattern: State Machine** — A thing with states and transitions.

```
pattern__state_machine
    ├── recognise_by
    │   ├── node has ──→ status or state field
    │   ├── status values connected by ──→ transition edges
    │   └── at least one terminal state (no outgoing transitions)
    ├── common_elements
    │   ├── initial_state (where things start)
    │   ├── intermediate_states (where work happens)
    │   ├── terminal_states (where things end)
    │   └── transition_rules (what triggers each transition)
    └── confidence_notes
        └── "A state machine without terminal states may have
             issues that never resolve. A state machine without
             transition rules may allow invalid state changes."
```

**Pattern: Review Process** — A thing where work is examined and judged.

```
pattern__review_process
    ├── recognise_by
    │   ├── node has ──→ has_step edges
    │   └── at least one step involves examination/judgment
    ├── common_elements
    │   ├── examine (look at the thing being reviewed)
    │   ├── judge (form an opinion or decision)
    │   ├── document (record the outcome)
    │   └── action (do something as a result)
    ├── coverage_analysis
    │   ├── 4/4 elements ──→ "Fully consequential review"
    │   ├── 3/4 missing action ──→ "Review with no follow-through"
    │   ├── 2/4 missing document + action ──→ "Review that leaves no trace"
    │   └── 1/4 examine only ──→ "Glance, not a review"
    └── confidence_notes
        └── "A review missing 'document' cannot prove it happened.
             A review missing 'action' has no consequence.
             Both patterns undermine the purpose of reviewing."
```

**Pattern: Fractal Scope** — A thing that can define its own vocabulary.

```
pattern__fractal_scope
    ├── recognise_by
    │   ├── node contains ──→ child nodes with type definitions
    │   └── type definitions may ──→ link_to parent scope definitions
    ├── common_elements
    │   ├── local_definitions (types meaningful in this scope)
    │   ├── inherited_definitions (links to parent scope types)
    │   ├── anchor_links (links to Lexicon anchor nodes)
    │   └── scope_metadata (language, ownership, governance)
    └── confidence_notes
        └── "A scope with no anchor links is locally meaningful
             but opaque to cross-scope analysis. A scope with
             anchor links participates in the broader ecosystem."
```

---

## Analysis Tools

### What the Tools Compute

The analysis tools are the Lexicon's most important artifact. They make the graph-first philosophy operational. Every tool works on any graph — the Lexicon's own, a project's, a role repo's, or a composite graph spanning multiple scopes.

**Connectivity Analysis** (`analysis__connectivity.py`)

Given a node, compute how well-connected it is:

```python
# Conceptual API
result = analyse_connectivity(node=task_42)

# Result:
# {
#     "node": "Task-42",
#     "direct_edges": 7,
#     "edges_to_typed_definitions": 3,
#     "edges_to_anchor_nodes": 1,
#     "edges_to_external_refs": 0,
#     "max_depth_to_anchor": 2,
#     "confidence": "medium",
#     "assessment": "Task-42 links to a local Task definition which
#                    links to Lexicon:anchor__task. Port field has
#                    full type chain to Safe_UInt__Port. Status field
#                    has no link to a state machine definition."
# }
```

**Compatibility Analysis** (`analysis__compatibility.py`)

Given two nodes, compute how compatible they are:

```python
result = analyse_compatibility(node_a=project6_review, node_b=project7_review)

# Result:
# {
#     "nodes": ["Project-6:Review", "Project-7:Review"],
#     "shared_anchor": "Lexicon:anchor__review_request",
#     "overlap_edges": 2,
#     "divergent_edges_a": 3,
#     "divergent_edges_b": 2,
#     "pattern_coverage": {
#         "review_process": {
#             "node_a": {"examine": true, "judge": true, "document": true, "action": false},
#             "node_b": {"examine": true, "judge": true, "document": false, "action": false}
#         }
#     },
#     "assessment": "Both nodes link to the same anchor. They share
#                    'examine' and 'judge' steps. Project-6 additionally
#                    documents outcomes. Neither actions outcomes.
#                    Compatible for 'was something reviewed'; divergent
#                    on depth of review process."
# }
```

**Gap Analysis** (`analysis__gaps.py`)

Given a node or scope, identify where adding edges would most increase confidence:

```python
result = analyse_gaps(scope=project_6)

# Result:
# {
#     "scope": "Project-6",
#     "total_type_definitions": 8,
#     "linked_to_anchors": 5,
#     "local_only": 3,
#     "high_value_gaps": [
#         {
#             "node": "Project-6:Sprint_Goal",
#             "suggestion": "No Lexicon anchor exists for Sprint_Goal.
#                            Closest match: anchor__task (32% subgraph overlap).
#                            Consider: create local anchor, request Lexicon
#                            addition, or leave as local-only."
#         },
#         {
#             "node": "Project-6:Retrospective",
#             "suggestion": "Matches pattern__review_process at 3/4 elements.
#                            Missing: 'action' step. Adding an action step
#                            would make this a fully consequential review."
#         }
#     ]
# }
```

**Scope Resolution** (`analysis__scope_resolver.py`)

Given a type reference and a scope, walk the scope chain to find the definition:

```python
result = resolve_type(type_name="Task", scope=sprint_3)

# Result:
# {
#     "type_name": "Task",
#     "resolved_at": "Project-6",
#     "resolution_chain": ["Sprint-3 (not found)", "Project-6 (found)"],
#     "definition_node": "Project-6:Task",
#     "anchor_link": "Lexicon:anchor__task",
#     "confidence": "high",
#     "assessment": "Task resolves to Project-6's definition, which links
#                    to the Lexicon anchor. Full subgraph available."
# }
```

---

## Integration with the Ecosystem

### How Repos Use the Lexicon

#### Core Library (Issues-FS)

The core library uses Lexicon anchors to increase confidence about its own types:

```python
from issues_fs_lexicon.anchors.anchors__core   import anchor__task
from issues_fs_lexicon.analysis                 import analyse_connectivity
from issues_fs_lexicon.bootstrap                import bootstrap__statuses

# The core library's Task node links to the Lexicon anchor
# This isn't type inheritance — it's a graph edge that says
# "our Task concept relates to this reference concept"
```

#### Role Repos (Issues-FS__Dev__Role__QA)

Role repos use Lexicon anchors for the coordination issue types:

```python
from issues_fs_lexicon.anchors.anchors__coordination import anchor__defect
from issues_fs_lexicon.patterns                      import pattern__review_process
from issues_fs_lexicon.analysis                      import analyse_coverage

# QA's local Review process can be analysed against the reference pattern
coverage = analyse_coverage(
    node    = qa_review_process,
    pattern = pattern__review_process,
)
# Returns: which elements of the reference pattern are present/missing
```

#### Integration Services (Issues-FS__Service__GitHub)

Integration services use the Lexicon to map between vocabularies:

```python
from issues_fs_lexicon.analysis import analyse_compatibility

# When importing a GitHub issue, analyse how well it maps to
# Issues-FS concepts — without forcing it to conform
compatibility = analyse_compatibility(
    node_a = github_issue_node,
    node_b = lexicon_anchor_task,
)
# The result tells us: "This GitHub issue maps to 3/7 of the
# Task anchor's edges. Here's what maps and what doesn't."
```

### Updated Dependency Graph

```
                         ┌────────────────────────┐
                         │   Issues-FS__Lexicon    │
                         │    (root graph with     │
                         │   anchor nodes, tools)  │
                         └───────────┬────────────┘
                                     ▲
              ┌──────────────────────┼──────────────────────────┐
              │                      │                          │
              │         ┌────────────┴────────────┐             │
              │         │ Issues-FS__Service       │             │
              │         │   __Client__Python       │             │
              │         │ (API schemas + client)   │             │
              │         └────────────┬────────────┘             │
              │                      ▲                          │
    ┌─────────┴──────────┐    ┌──────┴──────────┐    ┌──────────┴──────────┐
    │    Issues-FS       │    │ Issues-FS       │    │  All Role Repos     │
    │  (core library)    │    │   __Service     │    │  (fractal scopes    │
    └────────────────────┘    └─────────────────┘    │   with local        │
                                                     │   vocabulary)       │
    Every repo also depends on osbot-utils            └─────────────────────┘
    (omitted for clarity)

    Each repo's graph can link to Lexicon anchors
    or define local-only concepts — the choice is theirs
```

### Relationship to Client__Python

The split between Lexicon and Client__Python remains clean but is reframed:

| Concern | Lexicon | Client__Python |
|---------|---------|----------------|
| What a Decision **is** (concept, relationships, reference pattern) | ✓ | — |
| What fields a Decision **has** when sent to the API (request shape) | — | ✓ |
| What statuses a Decision **can have** (reference state machine) | ✓ | — |
| How to **call the API** to create a Decision | — | ✓ |
| How to **analyse** whether a node matches the Decision pattern | ✓ | — |

Client__Python itself depends on the Lexicon. Its API schemas reference Lexicon anchor nodes for the concepts they represent. This means an API schema change that diverges from the Lexicon anchor is visible: "The API now accepts a Decision without a 'context' field, but the Lexicon anchor shows 'context' as a connected concept. This divergence may reduce confidence in Decisions created via the API."

---

## Migration Path

### Phase 1: Foundation (Root Graph)

1. Create `Issues-FS__Lexicon` repo
2. Add `osbot-utils` as sole dependency
3. Migrate `issue-types.json` and `link-types.json` from Issues-FS core as data files
4. Create anchor nodes for core concepts (Task, Bug, Epic) with basic subgraphs
5. Create bootstrap definitions (default statuses, priorities, link types)
6. Publish `issues-fs-lexicon` v0.1 to PyPI

### Phase 2: Analysis Tools

1. Implement `analysis__connectivity` and `analysis__scope_resolver`
2. Add `issues-fs-lexicon` as dependency to Issues-FS core
3. Add graph edges from core library types to Lexicon anchors
4. Run connectivity analysis on the core library — surface gaps
5. Publish `issues-fs-lexicon` v0.2

### Phase 3: Coordination Anchors

1. Add anchor nodes for coordination concepts (Decision, Handoff, Defect, etc.)
2. Create reference patterns (workflow, state machine, review process)
3. Implement `analysis__compatibility` and `analysis__coverage`
4. Role repos adopt Lexicon dependency and link to coordination anchors
5. Publish `issues-fs-lexicon` v0.3

### Phase 4: External References

1. Add external reference nodes for schema.org, SKOS, PROV-O concepts
2. Create cross-graph edges from Lexicon anchors to external reference nodes
3. Implement `analysis__gaps` and `analysis__conflicts`
4. Enable cross-scope and cross-vocabulary analysis
5. Publish `issues-fs-lexicon` v0.4

### Phase 5: Full MGraph Integration

1. All anchor nodes, patterns, and edges represented as native MGraph graphs
2. Graph queries replace static analysis: live traversal of the full ecosystem graph
3. UI integration: visualise connectivity, compatibility, gaps in the Issues-FS web interface
4. Publish `issues-fs-lexicon` v1.0

---

## Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| L1 | Name is **Lexicon** | Encompasses the full scope: anchor nodes, reference patterns, analysis tools, bootstrap definitions. Signals "complete vocabulary" not just "data structures." |
| L2 | **Universal dependency** alongside osbot-utils | Every repo benefits from access to anchor nodes and analysis tools. Makes the graph-first model operationally available everywhere. |
| L3 | **Anchor nodes, not schemas** | Schemas declare and constrain. Anchor nodes provide reference points for linking. Nodes link to anchors at their own granularity — partial linking is normal and expected. (See Thinking in Graphs, Principle 5.) |
| L4 | **Analysis tools are primary artifacts** | The Lexicon's value is not in its definitions but in its ability to compute meaning from graph structure. Connectivity, compatibility, coverage, and gap analysis are the core offering. |
| L5 | **Bootstrap definitions are overridable** | Bootstrap defaults (statuses, priorities, issue types) are conveniences, not constraints. Any scope can override them by defining local nodes with different subgraphs. (See Thinking in Graphs, Principle 4.) |
| L6 | **External references are nodes in the Lexicon graph** | schema.org, SKOS, and PROV-O concepts are represented as nodes maintained by the Lexicon, not imported at runtime. This allows versioning, enrichment, and divergence tracking. |
| L7 | **Fractal by design** | The Lexicon is the root scope, not the only scope. Every repo, project, epic, and issue can define its own vocabulary. The Lexicon provides the anchors and tools that make cross-scope analysis possible. (See Thinking in Graphs, Principle 4.) |
| L8 | **Honest uncertainty throughout** | The analysis tools report what the graph supports and what it doesn't. They never fill gaps with assumptions. Low connectivity is reported, not rejected. (See Thinking in Graphs, Principle 7.) |
| L9 | **Incremental migration** | The Lexicon can be adopted incrementally. Phase 1 is just data files and anchor nodes. Analysis tools come in Phase 2. Full MGraph integration comes in Phase 5. No repo needs to change until it's ready. |

---

## References

- [Thinking in Graphs: Meaning Through Connectivity](./v0_4_0__issues-fs__thinking-in-graphs.md) — Foundational philosophy (read first)
- [Issues-FS Architecture Overview](./v0_4_0__issues-fs__architecture-overview.md) — Ecosystem architecture
- [Issues-FS Role-Based Agent Coordination](./v0_4_0__issues-fs__role-based-agent-coordination.md) — Role architecture
- [Issues-FS Role Architecture Framework Analysis](./v0_4_0__issues-fs__role-architecture-framework-analysis.md) — Framework analysis
- [OSBot-Utils](https://github.com/owasp-sbot/OSBot-Utils) — Type_Safe utilities (the other universal dependency)
- [MGraph-DB](https://github.com/owasp-sbot/MGraph-DB) — Graph database (Lexicon's target storage layer)
- [schema.org](https://schema.org/) — External reference vocabulary for web concepts
- [SKOS](https://www.w3.org/2004/02/skos/) — W3C vocabulary for knowledge organisation
- [PROV-O](https://www.w3.org/TR/prov-o/) — W3C Provenance Ontology

---

*Issues-FS Lexicon Architecture v2.0*  
*Date: 2026-02-05*
