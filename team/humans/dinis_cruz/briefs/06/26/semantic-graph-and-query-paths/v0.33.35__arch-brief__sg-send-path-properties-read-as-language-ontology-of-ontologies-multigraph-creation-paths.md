# Graph Path Properties: Reading as Language, the Ontology of Ontologies, and Multi-Graph Creation Paths

**version** v0.33.35
**date** 26 June 2026
**from** Human (project lead)
**to** Architect, @Dev, Product, Strategy
**type** Arch brief (semantic graph)

---

## What This Is

A deeper look at why directed paths matter, through several primitives: **a path should read as a natural sentence in the language, the culture, and the business context of the reader, so the graph explains itself; the same relationship can recur up a chain, such as managed-by climbing the org chart, which is the clearest case for why direction matters, since you want only the roles going up and not the ones coming back down; the model errs on the side of understanding over a standardized schema, which is why it needs an ontology of ontologies, making each team's, department's, and person's vocabulary compatible rather than folding them into one; because nodes and edges are almost free, the graph can carry anchor nodes that exist only to connect vocabularies, which is what makes multicultural and multilingual mapping work; the paths exist to make finding things efficient, through what is called multi-graph creation paths, a wide first pass that captures the universe around an incident or risk, then queries on top that simplify it so a reader starting at one point sees only what is relevant; and nodes and edges can be added and consolidated to build a graph for the story, because ultimately it is about the message, and since the graph is code-driven it can be recreated, screenshotted, and version-controlled.** It deepens the directed-edge property (cross-ref: the v0.33.35 query-paths, five-whys, and risk-register briefs). New contributions: **paths that read as language, the ontology of ontologies with anchor nodes, and multi-graph creation paths.**

## Paths Should Read as Language

The first primitive is that a path is a sentence. The project lead: **"the path should read in English, or not even in English, it should read in the language and the culture and the business context we are talking about."** Read aloud, a path narrates itself: this risk is created by this vulnerability, which impacts this system, which belongs to this entity, which has this business stakeholder, who is assigned to this role, which is managed by that role, and that role, and that role. Because the path reads as language, the graph explains itself to whoever is reading it, in their own terms.

## The Recurring Edge, and Why Direction Matters

The example reveals a second primitive: the same relationship can recur along a path. The managed-by relationship repeats as the path climbs the org chart, the same kind of edge used again and again, a loop in the relationship itself. This is the clearest possible case for why direction matters. The project lead: **"if you only have a difference between two roles, once you go up you would get the other roles coming back down, but you only want the roles going up."** Without the directed inward and outward distinction, climbing the management chain would also drag in everyone managed below; with it, the path goes strictly upward. The recurring edge is exactly where the asymmetry earns its keep.

## Understanding Over Schema: The Ontology of Ontologies

The third primitive is a stance. The project lead: **"I always err on the side of understanding versus a standardized schema."** The reason is practical. The project lead: **"each team, each department, sometimes each person will have its own preferences on how to map this, and instead of folding it, you make it compatible, which is why you need an ontology of ontologies."** Rather than force every group into one vocabulary, which loses meaning and resistance, the model keeps each group's vocabulary and makes them interoperate. The ontology of ontologies is what lets many local mappings coexist and connect.

## Cheap Nodes, and Anchors for Many Languages

The fourth primitive makes the third affordable. The project lead: **"with graphs of graphs it costs almost nothing to have more nodes and edges, and sometimes you have nodes that only exist to provide anchors for some queries, which matters once you get into multicultural and multilingual things."** Because adding nodes and edges is nearly free, the graph can hold anchor nodes whose only job is to connect, a shared concept that two teams' different terms both point to, or a pivot that links a path across languages. Anchors are how the dots get connected when the same thing is named differently, which is what makes the multilingual and multicultural mapping real rather than aspirational.

## Multi-Graph Creation Paths: Wide First, Then Narrow

The fifth primitive is about efficiency, and it is the heart of the memo. The paths exist to make finding things efficient, through a two-pass approach. The project lead: **"I call this multi-graph creation paths: first you have a pass where you capture the universe of what you want to know, a wider graph, and then you run queries on top of that, which simplifies it, so you start at a point and only see the nodes relevant to that point."** The first pass is wide: from an incident or a risk, traverse out to every connected system, entity, person, role, and risk, capturing the whole universe around it. The second pass is narrow: run queries on that captured graph so that, starting from any one point, only the relevant nodes remain. This is the same wide-then-narrow, two-pass move that keeps the graph queryable and stops it from overwhelming the reader, and it pairs with the directed paths that prevent the explosion of nodes.

## Build the Graph for the Story

The last primitive is about communication. Nodes and edges can be not only added but consolidated, which many visualization engines do not do, and that is what lets a graph be shaped for its message. The project lead: **"ultimately it is about the story, what is the story you want to tell, and sometimes you create a massive graph just to show two nodes, and because it is driven by code we can recreate the graphs, screenshot them, and version control them."** You capture the universe, then you decide what to say, a node at the start, a couple in the middle, one at the end, and the connections that carry the point, and you build that view dynamically. Because the whole thing is code-driven, the chosen view can be regenerated, captured as an image, and version-controlled, so the story is reproducible.

## Why This Matters

These primitives are what turn the register from a data structure into something a stakeholder can actually read. It speaks their language, it accommodates every team's vocabulary through anchors, it finds what matters efficiently through the wide-then-narrow passes, and it communicates a clear story rather than a hairball. Together with the directed inward and outward paths, they are what make the graph both truthful and legible.

## What This Does Not Try To Be

- **Not schema-first.** It errs toward understanding and makes vocabularies compatible.
- **Not a single vocabulary.** It is an ontology of ontologies, connected by anchors.
- **Not a static dump.** Graphs are captured wide, then narrowed for the story.
- **Not hand-drawn.** The views are code-driven, reproducible, and version-controlled.

## Honest Notes

- **Compatibility has a cost.** An ontology of ontologies needs governance so it does not become inconsistent.
- **Anchors can proliferate.** Free nodes are a tool, not a habit; anchors should earn their place.
- **Consolidation can mislead.** Shaping a graph for a story must not distort what is real.

## Open Questions

| Question | Notes |
|----------|-------|
| How are local vocabularies mapped to anchors? | The mechanism of the ontology of ontologies |
| How is a path rendered as a sentence? | Edge labels as readable phrases |
| How are the wide and narrow passes stored? | The captured universe versus the queried view |
| How are story views named and versioned? | Reproducible, screenshot-able graph views |

## Acceptance Criteria

1. A path renders as a natural sentence in the reader's language and context.
2. A recurring edge such as managed-by traverses strictly in one direction.
3. Local vocabularies are kept and made compatible, not folded into one schema.
4. Anchor nodes can connect terms across teams and languages.
5. A wide first pass captures the universe; queries on top narrow it to the relevant.
6. Nodes and edges can be added and consolidated to build a view for a story.
7. Views are code-driven, reproducible, screenshot-able, and version-controlled.

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 26 Jun | `v0.33.35__arch-brief__sg-send-directed-edges-inward-outward-query-paths-prevent-node-explosion.md` | The directed-edge property these primitives extend |
| 26 Jun | `v0.33.35__strategy-brief__five-whys-as-a-domain-translator-natural-peaks-root-cause-stories.md` | Translation across domains and the natural peaks |
| 26 Jun | `v0.33.35__arch-brief__sg-send-2fa-use-case-semantic-graph-ontology-nodes-edges-instance.md` | The ontology these paths traverse |
| 26 Jun | `v0.33.35__strategy-brief__sg-send-learning-from-games-world-models-game-design-vault-serverless-mini-agents.md` | The story and the code-driven, version-controlled views |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | A path should read as a natural sentence in the reader's language and context |
| 2 | The same relationship can recur up a chain, such as managed-by on the org chart |
| 3 | The recurring edge is the clearest case for why direction matters |
| 4 | The model errs toward understanding over a standardized schema |
| 5 | Different teams' vocabularies are made compatible, not folded, via an ontology of ontologies |
| 6 | Nodes and edges are nearly free, so anchor nodes can connect vocabularies and languages |
| 7 | Multi-graph creation paths capture the universe wide, then narrow it with queries |
| 8 | Narrowing lets a reader start at a point and see only what is relevant |
| 9 | Nodes and edges can be consolidated to build a graph for the story |
| 10 | The views are code-driven, reproducible, and version-controlled |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
