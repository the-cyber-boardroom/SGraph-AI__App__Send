# Ontologies of Ontologies: Multiple Definitions, Three Layers, and Bridges

**version** v0.33.36
**date** 28 June 2026
**from** Ontologist
**to** Architect, @Dev, Product, Strategy
**type** Arch brief (semantic graph)

---

## What This Is

The architecture that lets many Node Type Formulas coexist and stay compatible without being merged: **the system must hold multiple formulas at once, a CISO's definition of a vulnerability, a CFO's, a regulator's, an AI-regulation's, each a different required-path-pattern over what may be the same nodes, so a node can be a vulnerability under one formula and a plain fact under another and both classifications are valid within their own formula, which is exactly why classification had to be a query rather than a stored label; the model therefore separates into three layers, a shared factual graph of nodes, edges, evidence, measures, and twins, a swappable layer of per-party Node Type Formulas that classify the nodes, and a layer of declared bridges that connect formulas at specific points; ontologies are not folded into a single shared definition, because that erases the disagreement, they are kept intact and connected through anchor nodes, edge-type equivalences, and conditional mappings, which is how meaning actually travels across languages, cultures, biases, and political agendas, by maintaining translations between definitions that each side still owns.** It is the companion to the Node Type Formula mechanism (cross-ref: the v0.33.36 node-type-formulas brief, the v0.33.35 path-properties ontology-of-ontologies brief). New contributions: **the three-layer model, multiple coexisting formulas, and bridges-not-merges.**

## Multiple Formulas Must Coexist

The same node looks different to different parties, and that is not a defect to be resolved but a reality to be held. A CISO's vulnerability, a CFO's, a regulator's, and an AI-regulation's are different required-path-patterns, and they range over what may be the very same nodes. A node that is a vulnerability under the CISO's formula may be only a fact under the CFO's, and both are correct within their own formula. This is the deeper reason classification could not be a stored label: a stored label forces a single truth and silently picks a winner, whereas a query lets each formula compute its own view of the same shared graph.

## The Three Layers

Keeping the three layers separate is the architecture.

| Layer | What it is | Who owns it |
|-------|------------|-------------|
| Graph | Nodes, typed directed edges, evidence, measures, and twins | Shared, factual |
| Node Type Formulas | Per-party required path-patterns that classify nodes | Each party, domain, or agenda |
| Bridges | Declared mappings that connect formulas at specific points | Negotiated between parties |

The graph is the reality everyone shares. The formulas are the meanings each party computes over that reality. The bridges are how those meanings stay compatible without being forced into one. Because the graph stays factual and the formulas stay separate, parties can disagree about meaning while still agreeing about facts, which is the only stable basis for working together.

## Bridges, Not Merges

The tempting move, to fold two ontologies into one shared definition, is the lossy one: it erases the disagreement that was the whole point of having two parties. The alternative is to keep both formulas intact and connect them at specific, declared points. A bridge can be an anchor node that both formulas reference, an equivalence between edge types in two formulas, or a conditional mapping, this party's Risk maps to that party's Material Risk under these stated conditions. Compatibility is then a set of explicit bridges, each one inspectable and arguable in its own right, rather than a merge that quietly dissolves one party's meaning into another's.

## How Meaning Travels Across Domains

This is how meaning actually moves across languages, cultures, biases, and political agendas in the real world. It does not move by everyone agreeing on one definition; it moves by maintaining translations between definitions that each side continues to own. A translator does not force two languages into one; they bridge them at the points where the bridge holds and flag the points where it does not. The anchor-node and ontology-of-ontologies threads from the path-language brief were circling this, and this is the operational form: anchor nodes and declared bridges are the translation layer, and the honest admission that some bridges are partial or conditional is a feature, because it surfaces exactly where two worldviews genuinely diverge.

## Why This Is the Architecture

The separation is the design. The graph stays factual and shared, so there is a common reality to point at. The formulas stay swappable and owned, so each party keeps its own meaning and its own visible bias. The bridges stay explicit and negotiated, so compatibility is built deliberately and can be audited. A system built this way can be used by many parties with conflicting agendas at once, because it never asks them to surrender their definition, only to declare where their definition connects to someone else's.

## What This Does Not Try To Be

- **Not one universal ontology.** Many formulas coexist by design.
- **Not a merge.** Compatibility is bridges between owned definitions, not fusion.
- **Not agenda-free.** Each formula carries its bias; the architecture makes it visible.
- **Not the formula mechanism itself.** That is the companion brief.

## Honest Tensions

| Tension | Note |
|---------|------|
| Coexistence versus a single answer | Some decisions eventually need one classification; which formula governs, and who decides |
| Bridges versus merges | Bridges preserve disagreement but cost maintenance; merges are cheaper and lossy |
| Shared graph versus contested facts | The graph is meant to be factual, but parties may dispute even the facts |
| Partial bridges | Conditional and partial mappings are honest but complicate automated reasoning |

## Open Questions

| Question | Notes |
|----------|-------|
| How is a bridge declared and stored? | The representation of anchor nodes, equivalences, and conditional mappings |
| Which formula governs a shared decision? | When one answer is finally needed across parties |
| How are conflicting formulas surfaced? | Showing a node's type under each formula side by side |
| How are bridges versioned and audited? | So a translation can be challenged like a formula |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 28 Jun | `v0.33.36__arch-brief__sg-send-node-type-formulas-classification-as-testable-path-pattern-not-judgment.md` | The companion: the single-formula mechanism this builds on |
| 26 Jun | `v0.33.35__arch-brief__sg-send-path-properties-read-as-language-ontology-of-ontologies-multigraph-creation-paths.md` | The ontology-of-ontologies and anchor-node thread this operationalises |
| 26 Jun | `v0.33.35__arch-brief__sg-send-2fa-use-case-semantic-graph-ontology-nodes-edges-instance.md` | The meta-model the formulas classify over |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | The system must hold multiple Node Type Formulas at once |
| 2 | A node can be a vulnerability under one formula and a fact under another, both valid |
| 3 | This is why classification is a query, not a stored label |
| 4 | The model separates into three layers: graph, formulas, and bridges |
| 5 | The graph is shared and factual; the formulas are owned; the bridges are negotiated |
| 6 | Ontologies are connected by bridges, not dissolved by merges |
| 7 | A bridge is an anchor node, an edge equivalence, or a conditional mapping |
| 8 | This is how meaning travels across languages, cultures, biases, and agendas |
| 9 | Partial and conditional bridges are honest, surfacing where worldviews diverge |
| 10 | Parties keep their own definitions and declare only where they connect |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
