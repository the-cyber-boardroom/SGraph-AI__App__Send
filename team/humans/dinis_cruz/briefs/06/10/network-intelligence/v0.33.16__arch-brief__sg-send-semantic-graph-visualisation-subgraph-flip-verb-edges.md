# Visualising Semantic Graphs: Avoid The Blob, Use Verb Edges, And Flip The Subgraph

**version** v0.33.16
**date** 10 June 2026
**from** Human (project lead)
**to** Architect, Developer (lead), Data, @Dev (the agent implementing the graphs)
**type** Arch brief

---

## What This Is

The visualisation method behind the semantic-graph work, the big piece flagged in the company-intelligence brief: **visualise semantic knowledge graphs without collapsing into a blob, by treating rich nodes as good, using two-way verb-based edges, building the universe in a first pass and saving it, then flipping the query around a found node to get a small, relevant, condensed graph, with provenance and time captured, and the LLM building and pruning the queries while the final query stays pure node-and-edge mathematics.** It delivers the visualisation piece of the company-intelligence vault (cross-ref: the v0.33.16 company-intelligence-vault brief), and applies the semantic-graph, LETS, and meaning-through-connectivity work (cross-ref: the v0.32.3 NHI-2.0-semantic-knowledge-graphs, v0.33.16 artefact-driven-security-assessments, and v0.33.16 linkedin-semantic-knowledge-graph briefs). New contributions: **the blob anti-pattern, verb edges, the LETS universe-then-flip method, the subgraph flip, the visualisation limit, and the LLM-builds-the-query discipline.**

## Prerequisite Reading For The Implementing Agent

A required input, as requested by the project lead: **the implementing agent must read the graphs-of-graphs and meaning-through-connectivity series before building this.**

The project lead: **"remind me, the agent implementing this really needs to read the graphs of graphs and meaning through connectivity, the whole series of posts I have posted on LinkedIn."** So the graphs-of-graphs and meaning-through-connectivity posts are prerequisite reading. Note for the project lead: these posts have not yet been provided in this session, so please supply them (they are also a good first target for the LinkedIn vault to process; cross-ref: the linkedin-semantic-knowledge-graph brief), and the agent should read them before implementing.

## The Blob Anti-Pattern

The failure to avoid, stated first: **people get excited about semantic graphs and arrive at the blob, a single mass of thousands or millions of interconnections that shows nothing.**

The project lead: **"I see a lot of people get into semantic graphs, get excited, and arrive at the big blob, the big visualisation of thousands or millions of interconnections, just one big blob. The weird problem is a race to the bottom, where you start not wanting a lot of relationships because they make the graph more complicated."** So the blob is the enemy: an everything-connected-to-everything render that conveys nothing, and worse, it tempts people to add fewer relationships to keep the picture clean, which is exactly backwards (below).

## Rich Nodes Are Good

The principle that inverts the race to the bottom: **the more connections a node has, the richer and better it is, so enrich, do not prune the data.**

The project lead: **"the way I look at it, the more rich a node is, the more connections it has, the better. We want as much information as possible. I should be able to look at a node and see it in three dimensions: a person connects to the jobs they have, the posts they made, the company they work for, and the company connects to all of this."** So richness is the goal: a node should be densely connected (a person to their jobs, posts, and company; the company to its people, products, and news), seen in the round. The blob is not solved by fewer edges; it is solved by better querying and the flip (below), not by impoverishing the data.

## File-Based Now, A Graph Database Later

The implementation substrate: **the solution is file-based, enriching files with connections and cross-references, with a graph database available later but kept simple for now.**

The project lead: **"remember all our solutions are file-based, so we are enriching a file and making connections and cross-references on it. There is even a graph database, MGraph-DB, we could use, but for now let's keep it simple."** So the graph lives in files (each node a file, enriched with connections and cross-references), version-controlled in the vault (cross-ref: the artefact-driven-security-assessments and append-capability briefs). A graph database (MGraph-DB) is an option for later, but the file-based approach is the simple starting point and fits the vault model.

## Two-Way Verb Edges, And Never Relates-To

The edge discipline, and it is strict: **every edge is a two-way relationship expressed as a verb, and there is no relates-to, because granular verbs are what make good queries possible.**

The project lead: **"the way I create graphs, they are always a two-way relationship and always to do with verbs. Person works for company, is currently a job, or had job, and always the reverse, company employed person. You can never have relates-to, because relates-to is meaningless, two things always relate to each other. The more granular the edge, the better the query you can write."**

| Edge | Reverse |
|------|---------|
| Person works for company | Company employs person |
| Person had job | Job was held by person |
| Person wrote article | Article was written by person |
| Company has product line | Product line belongs to company |

So edges are typed verbs in both directions, never the meaningless relates-to, and the granularity of the verb is what makes a query precise: a graph of specific verbs can be queried as a story, where a vague relates-to graph cannot.

## The Query As A Story

How the graph is read: **a query is a story told edge by edge, from a topic to who implements it to the companies, people, products, releases, and articles involved.**

The project lead: **"the query is almost like a story. Start with a topic, the topic is part of this topic or needs this technology, who implements this, which companies in this space, who have these employees or these products or product lines, who had these releases, who had these articles."** So a query walks the verb edges as a narrative: topic, to technology, to who implements it, to companies, to their people, products, releases, and articles. The query is just the next edge you want to follow (cross-ref: the company-intelligence-vault follow-the-line narratives), and the granular verbs are what let the story be told precisely.

## The LETS Multi-Pass: Build The Universe, And Store Everything

The processing model, and it stores every step: **the first pass builds the universe, a big, noisy graph from a set of questions, and because everything is saved (the LETS workflow), each pass is version-controlled in the vault.**

The project lead: **"there are multiple phases of processing, what people call ETL, I call LETS. In our world we store everything, every transformation, version-controlled, into a vault. The first pass creates the universe we are operating in, a big graph that starts with a set of questions and places and goes deep. It can have lots of noise and edges you can navigate. The nodes and edges are determined by the query you provide, and the query is just an edge to the next one."**

A crucial rule to avoid the blob:

The project lead: **"you never do give-me-every-node-from-here unless you are exploring, because that explodes. And it has backward links, so you never go back to yourself, because that creates an explosion of nodes, which is what creates the blob."** So the first pass (Load, Extract, Transform, Save; cross-ref: the artefact-driven-security-assessments brief) builds a deliberately broad universe from a question set, but two rules keep it from becoming the blob: never request every node from a point (except when exploring), and never follow backward links to yourself. The query, not exhaustiveness, determines the nodes and edges.

## Iterative Improvement And Validation

A benefit of storing every pass: **each graph is an opportunity to trim it and validate the assumptions, the queries, and the nodes and edges, so you know you are doing the right thing.**

The project lead: **"every time we do one of these graphs, we have an opportunity to improve it, to trim it, to validate the assumptions, validate the queries, validate the nodes and edges we are using, which tells us whether we are actually doing the right thing."** So because each pass is saved (cross-ref: the artefact-driven-security-assessments brief's captured artefacts), it can be reviewed, trimmed, and validated: are the assumptions right, are the queries right, are the edges right? The graph improves with each pass rather than being a single throwaway render.

## Access Every Linkable Node, Then Save

The starting flow: **in the beginning you should be able to reach every node that is linkable, and then save that as a subgraph to build on.**

The project lead: **"in principle, in the beginning, you should be able to access every single node that is linkable, that is the flow. From a pure linking point of view, I should be able to extract that, and this is why LETS matters, because you can save it. Once you save it, you do the same queries on top of that first subgraph, and now you can be more flexible with your query, because you do not have as much of an explosion, you have already curated and filtered."** So the first pass establishes everything reachable, then saving it (LETS) turns it into a curated subgraph on which further queries can be more flexible, because the explosion has already been bounded by the first curation.

## The Subgraph Flip

The key visualisation move: **once a query finds the few relevant nodes, flip the graph and query from those nodes, upwards and downwards, to get a small, relevant, condensed view.**

The project lead: **"the first graph starts with use cases and goes wide, then narrows, then wide. What is powerful is that once I find, say, five or twenty individuals, I can turn the graph around and start a query from that person upwards. You flip it and query from that node, which dramatically reduces the graph, because you now see only the nodes relevant to that person, that unit, that company. Start just for that company, go downwards and upwards, and you have a view of only what is relevant, way more simplified and condensed."**

| Direction | Result |
|-----------|--------|
| First pass, from questions outward | The wide, noisy universe |
| Find the few relevant nodes | Five, twenty individuals or a company |
| Flip and query from them | Only what is relevant to that node, up and down |
| The view | Small, condensed, legible |

So the flip is the answer to the blob: build wide, find the few, then re-root the query at those few and traverse outward, which collapses thousands of nodes to the small relevant neighbourhood. The visualisation is the flipped subgraph, not the universe.

## The Visualisation Limit

A practical constraint: **above roughly three to four hundred nodes a graph cannot be visualised usefully, only as a picture showing relative weight.**

The project lead: **"anything above 300 or 400 nodes cannot be easily visualised. It can be rendered as a picture, but it does not give much information, except maybe to say this company has more weight than that one."** So legible visualisation lives below a few hundred nodes (which the flip achieves); above that, a render only conveys gross structure like relative weight or density. This is another reason the flip matters: it brings the view under the limit.

## Provenance And Time

What makes the graph evidence: **as news, press releases, and website data are added, traversed, screenshotted, and dated, the provenance and time of every node and edge are captured.**

The project lead: **"it gets interesting once we add news, press releases, and website information, which we can traverse and save, keep a screenshot, keep data from a site on a date, so we have evidence. The provenance and time of all this is very important."** So adding external sources (cross-ref: the company-intelligence-vault sources) brings provenance and time into the graph: each node and edge records where it came from and when (a dated screenshot, a captured page), making the graph evidential, not just structural (cross-ref: the artefact-driven-security-assessments and PKI-registry provenance).

## The Role Of The LLM

Where the LLM belongs, and where it does not: **the LLM builds and prunes the queries and maintains the graph, but the final query is pure node-and-edge mathematics, and the LLM also sits at the end to turn questions into graph queries.**

The project lead: **"the LLM drives some of this, but most importantly it helps create the queries, prune the graphs, and maintain the semantic knowledge graphs. The final query should be pure mathematics, just nodes and edges. The other place to add an LLM is at the end, when we convert questions or actions into semantic knowledge graph queries that go into the engine, and that is how the whole thing feeds each other."**

| LLM Does | LLM Does Not |
|----------|--------------|
| Create and refine the queries | Run inside the final query |
| Prune and maintain the graph | Do the traversal itself |
| Convert a question into a graph query | Replace the node-and-edge mathematics |

So the LLM is the query author and graph maintainer, and the translator of questions into graph queries, but the query that runs is pure node-and-edge mathematics (cross-ref: the artefact-driven-security-assessments brief's LLMs-build-the-code-not-inline discipline). The LLM at the front turns a question into a graph query, the engine runs the math, and the result feeds back, closing the loop.

## What This Asks For

1. **Avoid the blob** (never an everything-connected mass; the flip and the limit, not fewer edges).
2. **Treat rich nodes as good** (densely connected nodes; enrich, do not impoverish).
3. **Stay file-based for now** (files enriched with connections; a graph database later).
4. **Use two-way verb edges, never relates-to** (granular verbs both directions; granularity enables queries).
5. **Read queries as stories** (topic to technology to companies to people to products to articles).
6. **Build the universe in a first pass and save it** (LETS; query-determined nodes; never all-nodes; no self-back-links).
7. **Improve and validate each pass** (trim; validate assumptions, queries, edges).
8. **Flip the subgraph around found nodes** (re-root the query; up and down; small and condensed).
9. **Respect the visualisation limit** (keep legible views under a few hundred nodes).
10. **Capture provenance and time** (sources, screenshots, dates; evidence).
11. **Use the LLM to build, prune, and translate, not to run the query** (the final query is pure math).
12. **Provide the prerequisite posts** (graphs of graphs; meaning through connectivity).

Estimated effort: an architecture and method brief that guides the LinkedIn and company-intelligence graphs; the semantic-graph model, the LETS storage, and the LLM assembly exist; the contribution is the visualisation method, the verb-edge discipline, and the subgraph flip. The proof is a graph that builds wide, flips to a found node, and renders a small, condensed, evidential view under the visualisation limit.

## What This Does Not Try To Be

- **Not the blob.** Build wide, then flip to the small relevant view.
- **Not relates-to.** Granular, two-way verb edges only.
- **Not edge-poor.** Rich nodes are the goal.
- **Not a single throwaway render.** Saved passes that improve and validate.
- **Not LLM-in-the-query.** The LLM builds and prunes; the query is pure math.

## Honest Risks

**Risk 1: The first pass can still explode.** A broad universe can balloon. Mitigation: query-determined nodes; never all-nodes; no self-back-links; save and curate (cross-ref: the LETS workflow).

**Risk 2: Verb discipline takes effort.** Granular two-way verbs are more work than relates-to. Mitigation: it is what makes queries possible; the prerequisite posts explain the model; the LLM helps maintain it.

**Risk 3: The visualisation limit constrains views.** Large neighbourhoods exceed a few hundred nodes. Mitigation: the flip brings views under the limit; above it, show only weight and density.

**Risk 4: Provenance adds overhead.** Capturing sources, screenshots, and dates is work. Mitigation: it is what makes the graph evidence; the vault stores it; it is captured as part of the pass.

**Risk 5: The LLM may creep into the query.** It is tempting to let the LLM traverse. Mitigation: the final query is pure math; the LLM builds, prunes, and translates only; the cost signal flags creep (cross-ref: the artefact-driven-security-assessments brief).

## Open Questions

| Question | Notes |
|----------|-------|
| What is the verb-edge vocabulary? | The granular two-way verbs for people, companies, content |
| How is the first-pass universe bounded? | The question set; never all-nodes; no self-back-links |
| How is the subgraph flip implemented? | Re-root the query at a found node; up and down |
| What is the practical node limit per view? | Around three to four hundred |
| How are provenance and time stored on nodes and edges? | Sources, dated screenshots, captured data |
| Where exactly does the LLM sit? | Build, prune, maintain, and translate questions; not in the query |
| When do we move from files to a graph database? | MGraph-DB later; files now |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 10 Jun | `v0.33.16__arch-brief__sg-send-company-intelligence-vault-semantic-graph-sources-outreach.md` | The visualisation piece this delivers; the sources and provenance |
| 10 Jun | `v0.33.16__dev-brief__sg-send-linkedin-semantic-knowledge-graph-crm-outreach-workflow.md` | The graphs of graphs this visualises; the prerequisite posts |
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-semantic-knowledge-graphs-of-identity.md` | The semantic-graph and verb-edge model |
| 10 Jun | `v0.33.16__strategy-brief__sg-send-artefact-driven-security-assessments-delta-scanning-vaults.md` | LETS, storing every pass, LLMs build not run, provenance |
| 8 Jun | `v0.33.2__arch-brief__sg-send-vault-append-capability-message-convention-protocol.md` | The vault storing each pass |
| 10 Jun | `v0.33.16__strategy-brief__sg-send-hyperscaler-big-partner-outreach-infographic-storytelling.md` | The contact intersection the flip resolves to the few |

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Visualisations avoid the blob | Build wide, flip to the small relevant view |
| 2 | Rich nodes are favoured | Densely connected nodes; enrich, do not impoverish |
| 3 | The graph is file-based | Files enriched with connections; a graph database later |
| 4 | Edges are two-way verbs, never relates-to | Granular verbs both directions |
| 5 | Queries read as stories | Topic to technology to companies to people to content |
| 6 | The first pass builds and saves the universe | LETS; query-determined; never all-nodes; no self-back-links |
| 7 | Each pass is improved and validated | Trimmed; assumptions, queries, edges checked |
| 8 | The subgraph flip works | Re-root at a found node; small, condensed view |
| 9 | The visualisation limit is respected | Legible views under a few hundred nodes |
| 10 | Provenance and time are captured | Sources, dated screenshots, evidence |
| 11 | The LLM builds and translates, not runs | The final query is pure node-and-edge mathematics |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
