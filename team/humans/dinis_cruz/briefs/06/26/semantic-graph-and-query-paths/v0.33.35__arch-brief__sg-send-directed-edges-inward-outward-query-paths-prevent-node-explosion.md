# Directed Edges, Inward and Outward Paths, and Query Paths

**version** v0.33.35
**date** 26 June 2026
**from** Ontologist
**to** Architect, @Dev, Product, Strategy
**type** Arch brief (semantic graph)

---

## What This Is

The key ontology property that every edge is directed and has a distinct inverse, so each node has a distinct outward path, what it opens, and inward path, what authorised or led to it, and why that asymmetry is what makes query paths possible: **the distinction between the inward and outward reading of an edge is the basis of path-driven navigation, and it is precisely what prevents the explosion of nodes when a query starts in many places at once, because typed directed paths move monotonically toward the natural peaks and converge there, instead of fanning out across the whole graph; the brief restates the property, explains why inward and outward must differ, shows why this bounds multi-seed queries, names the inverses for the 2FA ontology's edges, and gives a first set of path queries that grow more complex as more node types arrive.** It builds directly on the brief that introduced inward and outward edges (cross-ref: the v0.33.32 agent-mandate-graph brief, and the v0.33.35 five-whys and 2FA semantic-graph briefs). New contributions: **the explosion-control argument, the inverse naming, and the first path-query set.**

## The Property

Every edge in the graph is directed and carries an inverse. Because of that, every node can be read two ways. Its **outward path** is what it opens, what it leads to, what it makes possible. Its **inward path** is what authorised it, what led to it, what it arises from. This is the property established in the agent-mandate-graph work, where a node's outward reading answered what it opens and its inward reading answered what authorised this, and it is the foundation that path-driven navigation stands on. A focus node, read with its inward path on one side and its outward path on the other, gives the Path view: what led here, the focus, and what it opens.

## Why Inward and Outward Must Differ

The power is in the asymmetry. The inverse of an edge is not the same edge walked backwards; it is a different, meaningful relationship. Read outward from a Risk, `owned_by` reaches the one owner who carries it. Read inward from an Actor, the same edge, as `owns`, reaches every risk that actor carries. Outward from a Vulnerability, `gives_rise_to` reaches the risks it creates; inward from a Risk, as `arises_from`, it reaches the vulnerability behind it. If the two directions were not distinct, a traversal could not be constrained, because at every node it would have to consider every edge in both directions, and the query would lose its shape.

## Why This Prevents the Explosion of Nodes

This is the heart of it. If the graph is walked without direction, starting from a node and expanding to all neighbours, the reachable set grows combinatorially with each hop, and starting from many seeds at once makes it worse, the fan-out multiplies and the node count explodes. A query path avoids this because it specifies, at every step, both the edge type and the direction. That collapses the fan-out at each node to only the edges that match, so instead of expanding to everything nearby, the traversal follows a single typed thread.

The directionality does something stronger still. Because inward and outward are distinct, an outward-and-upward path, owner to manager to the board, only ever moves toward a peak; it never doubles back down. The asymmetry guarantees monotonic progress toward a peak in one direction or toward a root cause in the other. So when a query is seeded in many places at once, every vulnerability, every asset, every actor, the upward paths from all those seeds converge on the same small set of natural peaks, the apex risk and the board. The size of the result is then bounded by the number of peaks, not by the fan-out of the graph. That convergence is exactly the natural-peaks property from the five-whys brief, and it is the directed inward-or-outward edge that makes it computable rather than explosive.

This is also why the analysis runs in two passes, as in the agent-mandate-graph work: a first pass marks the peaks, or the crown jewels, and a second pass walks directed paths toward them, which stays cheap precisely because the paths converge instead of spreading.

## Why It Matters for Starting in Multiple Places

The multi-seed case is the one that breaks naive traversal and the one this property is for. You will routinely want to start everywhere relevant at once, every vulnerability that exists, every sensitive asset, every owner, and ask a single question, where does all of this end up, who at the top is carrying it, what is the consolidated picture. With directed inward and outward paths, you walk each seed along the same typed direction and let the paths meet at the peaks, producing the board's consolidated view without ever enumerating the whole graph. Read the other way, from a single owner inward, you get everything that owner is accountable for, again without touching unrelated nodes.

## Naming the Inverses

Every edge gets a defined inverse, so each can be read either way. A representative set for the 2FA ontology:

| Outward | Inward |
|---------|--------|
| has_vulnerability | vulnerability_of |
| gives_rise_to | arises_from |
| spawns | spawned_by |
| matters_because (up) | grounds |
| caused_by (down) | causes |
| exploits | exploited_by |
| stores | stored_in |
| exposes | exposed_by |
| impacts | impacted_by |
| triggers | triggered_by |
| reported_to | receives_report |
| validated_by | validates |
| owned_by | owns |
| accepted_by | accepts |
| reports_to | manages |
| propagates_to | receives_from |
| underwritten_by | underwrites |
| overrides | overridden_by |
| backed_by | supports |
| connected_to | contains |
| acts_as | played_by |
| bound_to | binds |
| transforms | transformed_by |
| cascades_to | receives_cascade |

The rule is absolute: no edge without a named inverse, because a missing inverse is a direction the graph cannot be queried in.

## A First Set of Path Queries

Notation: `-edge->` walks an edge outward, `<-edge-` walks it inward, `*` means repeat transitively, and `{Type}` or `{value}` filters a node. The queries grow in complexity as more node types are involved.

**Tier 1, single hop.**
1. Risks from a vulnerability: `Vulnerability -gives_rise_to-> Risk`
2. Owner of a risk: `Risk -owned_by-> Actor`
3. Who accepted a risk: `Risk -accepted_by-> Actor`

**Tier 2, a few hops.**
4. From a vulnerability to its business owners: `Vulnerability -gives_rise_to-> Risk -owned_by-> Actor`
5. A risk's path to the board: `Risk -accepted_by-> Actor -reports_to*-> {Board}`
6. Everything an actor is accountable for, read inward: `Actor <-owned_by- Risk`
7. What an asset's classification exposes: `Risk -exposes-> Asset -classified_as-> DataClass`

**Tier 3, branching and regulatory.**
8. The confidentiality chain: `Risk -impacts-> {Confidentiality} -triggers-> Obligation -reported_to-> Actor`
9. The full blast radius of a vulnerability: `Vulnerability -gives_rise_to-> Risk -impacts-> Impact{Confidentiality,Integrity,Availability}`
10. The underwriters of a risk: `Risk -accepted_by-> Acceptance -underwritten_by-> Actor`

**Tier 4, direction, convergence, and gaps.**
11. Climb to the apex risk: `Risk -matters_because*-> {apex}`
12. Excavate the root causes: `Vulnerability -caused_by*-> {root}`
13. Multi-seed convergence on the CEO: `{all Vulnerabilities} -gives_rise_to-> Risk -owned_by-> Actor -reports_to*-> {CEO}`
14. Air gaps, risks not on the register: `Risk WHERE NOT -connected_to-> Register`
15. Twins not connected to reality: `Twin WHERE connected_to_reality = false`

**Tier 5, narrative and change.**
16. Replay the story: `Change* ORDER BY timestamp -transforms-> Graph`
17. What a change cascaded to: `Change -cascades_to-> Register`

As node types are added, new segments simply extend these paths, an Attack adds `<-exploits- Vulnerability`, a ThreatAgent adds `Attack -performed_by-> ThreatAgent`, and so on, without changing the shape of the queries already written.

## How Paths Stay Cheap

A query path can be indexed as a path expression mapped to the set of nodes that satisfy it, so resolving a path returns a set directly rather than walking the graph each time. Because the paths are typed and directed, these indexes stay small and are updated incrementally as changes land, which is what keeps multi-seed queries fast even as the graph grows.

## What This Does Not Try To Be

- **Not undirected.** Every edge has a direction and a named inverse.
- **Not a full query language.** It is a first path-query set and a notation, not a finished grammar.
- **Not exhaustive.** New node types extend the paths rather than replacing them.
- **Not property-led.** The paths are made of typed edges, not node attributes.

## Honest Notes

- **Inverse names need a pass.** A few inverses above are provisional and should be agreed as a controlled vocabulary.
- **Up and down as edge types.** Modelling matters_because and caused_by as distinct directed edges is what makes the apex and root queries clean; confirm that choice.
- **Indexing is a claim to verify.** The path-index approach is the intended mechanism; it should be measured on a real graph.

## Open Questions

| Question | Notes |
|----------|-------|
| One query syntax | Adopt the path-index form, or a Cypher-like grammar, or both |
| Are inverses stored or derived? | Explicit inverse edges versus inverse-at-query-time |
| Are query paths first-class? | A saved path could be a named lens, reusable across graphs |
| How are peaks declared? | The apex risk and the board as marked peak nodes |

## Acceptance Criteria

1. Every edge type has a defined, named inverse.
2. Every node can be read by its inward path and its outward path.
3. Queries are expressed as typed, directed paths.
4. Multi-seed queries converge on marked peaks and stay bounded.
5. Up and down are distinct directed edges, so apex and root queries are clean.
6. Query paths can be indexed as path-to-node-set and updated incrementally.
7. Adding a node type extends existing paths without rewriting them.

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 22 Jun | `v0.33.32__arch-brief__sg-send-agent-mandate-graph-path-driven-lenses-two-pass-crown-jewels-blast-radius.md` | Introduced inward and outward edges and path-driven navigation |
| 26 Jun | `v0.33.35__strategy-brief__five-whys-as-a-domain-translator-natural-peaks-root-cause-stories.md` | The natural peaks the directed paths converge on |
| 26 Jun | `v0.33.35__arch-brief__sg-send-2fa-use-case-semantic-graph-ontology-nodes-edges-instance.md` | The node and edge types these paths traverse |
| 26 Jun | `v0.33.35__arch-brief__sg-send-risk-register-graph-of-graphs-facts-only-no-deny-cascade-cia-blast-radius.md` | The propagation and cascade the paths compute |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | Every edge is directed and has a distinct inverse |
| 2 | Each node has an outward path, what it opens, and an inward path, what led to it |
| 3 | The inward and outward readings are different, meaningful relationships |
| 4 | A query path fixes the edge type and direction at every step, collapsing fan-out |
| 5 | Directionality gives monotonic progress toward a peak or a root |
| 6 | Multi-seed queries converge on the natural peaks, so results stay bounded |
| 7 | This is what prevents the explosion of nodes |
| 8 | The analysis runs in two passes: mark the peaks, then walk directed paths to them |
| 9 | Every edge needs a named inverse, or there is a direction the graph cannot be queried in |
| 10 | Query paths can be indexed as path-to-node-set and grow by extension, not rewriting |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
