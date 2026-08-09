# The Graph Canvas As A REPL: Un-Blinding The Agent, Never Rendering The Whole Graph, And Why The Session Transcript Is Already The Brief

**version** v0.33.55
**date** 2 August 2026
**from** Human (project lead)
**to** Engineering, Architecture, Design

**type** Architecture brief

*Fifth of 2 August. Rendering tooling is grounded and cited. Written two days before the field demo, and the sequencing recommendation reflects that. Offered to be built on and challenged.*

---

## What This Is

A development environment for exploring graphs interactively, driven from chat, and one observation inside it that is the real problem statement: **the memo notes almost in passing that when working with an agent on a graph the agent is acting blind, and that is the diagnosis the whole proposal rests on, because there is an asymmetry in which the agent manipulates data fluently without seeing the result while the person sees the result and cannot manipulate it at anything like the same speed, so the canvas closes that gap by giving both parties a shared referent; the stronger version goes further, since a canvas that renders can also be captured and fed back, and the tooling for that already exists in the environment, which means the agent need not stay blind at all and the loop becomes manipulate, render, observe, correct; the read-evaluate-print framing is exactly right and carries requirements worth honouring, chiefly that the operations form a closed vocabulary expressed in the corpus's established node and edge grammar rather than free-form instructions, and that the session be recorded, because a transcript of the operations that produced a good view is already the specification the memo says it wants to hand to the implementing agent afterwards; the memo's own observation that a large graph is often unreadable is confirmed by the tooling literature, which finds that a diagram of everything is rarely useful while a diagram of one node and its neighbours is always readable, so the canvas should never render the whole graph and should instead render the result of a query, which is the corpus's existing wide-graph-plus-query-views primitive given an interactive front end; on rendering there is a clean split, since the text-based diagram format is unsuitable as a canvas because it offers no interaction, no position control and becomes hard to read beyond about fifty nodes, and is ideal as the output because it is text, diffable, committable and readable by both people and agents, so it should be the print step rather than the canvas; and the infographic capability the memo asks for already exists as a tool in the estate rather than needing to be built.** It is the fifth document of 2 August (cross-ref: the v0.33.55 acceptance-flow brief, the v0.33.54 no-blank-prompt brief, the v0.33.53 customised-standard brief, the v0.33.52 voice-note build brief, and the v0.33.54 canonical-Act brief). New contributions: **the blind-agent asymmetry named as the problem, the two-way loop that un-blinds it using tooling already present, the session transcript identified as the deliverable, the closed operation vocabulary tied to the established grammar, the rule that the canvas renders a query rather than the graph, and the split of text diagrams for output from an interactive library for exploration.**

## The Status Change That Matters Most

Recorded because it may resolve a problem parked twice. The project lead: **"we added native support to the vault now for chat, so the vault app can also access the chat, and it doesn't need access to the vault key or the OpenRouter key, you can just execute it."**

If the vault mediates model access, then an application built on it never holds a credential at all. That is a materially better answer than the arrangement designed on 27 July for the voice note tool, which embedded a capped key in the client for a first cohort, and than the concern raised on 28 July and again on 31 July that a public indexed site cannot safely carry a seeded key.

**It is worth checking whether this retires that problem entirely.** If a page can call the mediated chat without possessing a key, the provisioning function deferred in the first product may never need to be built in the form previously assumed, and the public Act site could use the same route. That is a bigger consequence than the feature this memo goes on to describe, and it should be confirmed rather than assumed.

## Acting Blind Is The Real Problem

The sentence that diagnoses everything else. The project lead: **"when you interact with Claude, Claude is acting blind, so this allows me to much more proactively manipulate the graph and see."**

That names a genuine asymmetry in agentic development, and it is worth stating plainly because it generalises well beyond graphs:

```
   THE AGENT              fluent manipulation of the data
                          no sight of the result

   THE PERSON             sees the result
                          slow, clumsy manipulation

   -> both are working on the same object with complementary
      handicaps, and neither can describe to the other what
      they can see or do
```

The canvas fixes half of that by giving the person a rendering they can point at while the agent does the manipulating. That alone is worth building, and it is why the memo describes the objective as improving the feedback loop rather than as adding a feature.

## Close The Loop Both Ways

The stronger version, and the one worth designing for from the start. **The agent does not have to stay blind.**

If the canvas renders in a browser, that rendering can be captured and returned into the conversation. The environment already contains tooling for exactly this, in the form of a browser automation service that navigates, screenshots and extracts from a live page. So the loop can run in both directions:

```
   person: "show me the path from the agent to the board risk"
        |
   agent: emits operations -> canvas renders
        |
   canvas: screenshot returned to the agent
        |
   agent: "the middle three nodes overlap and the labels are
           unreadable; collapsing the evidence layer fixes it"
        |
   -> corrected without the person having to describe the problem
```

That changes the nature of the tool. A canvas the person watches is a better feedback loop for one participant. A canvas both parties can see is a shared workspace, and it removes the step where somebody has to translate a visual problem into words. Given that the corpus already holds the automation capability, this should be part of the first version rather than a later addition.

## What A REPL Actually Requires

The framing is right. The project lead: **"the idea is to create a sort of a read, evaluate, print loop kind of workflow where we can explore adding nodes, removing nodes, merging nodes, connecting nodes, explore different views of the data, expand the graph, collapse the graph."**

Three requirements follow from calling it that, and they are worth stating because they are what separates a REPL from a chat window with a picture next to it.

**The cycle must be fast.** A loop measured in seconds is a tool; one measured in tens of seconds is a form. That argues for the canvas holding the graph in memory and operations mutating it, rather than each command regenerating from source.

**State persists and is inspectable.** The person must be able to ask what is currently loaded, and the memo already asks for this in the previous brief, where side panels show the objects created and the data collected as structured text.

**Exploration is non-destructive.** Undo, and a way to branch and compare, because the point of exploring is that most attempts are discarded. Without this the person becomes cautious, and a cautious REPL is a slow one.

## The Session Transcript Is Already The Brief

The memo describes a two-step process. The project lead: **"once we have this, we can write a brief that we can then give to the main agent that is working on the vault to then implement those changes."**

If the operations are recorded, the second step is much smaller than it sounds. **A sequence of graph operations that produced a good view is a specification.** It is precise, it is executable, and it does not require anybody to describe in prose what they did with a mouse.

That makes the recorded session the artefact, which is the same conclusion reached on 31 July about conversations: a transcript of how somebody got somewhere is of limited use, but a curated record of what they concluded travels. Here the two coincide, because in a REPL the record of what you did *is* what you concluded, provided the false starts can be pruned.

So the print step should emit not only a picture but a replayable sequence, and the brief handed onward is that sequence plus a sentence about intent.

## The Operations Should Be The Established Grammar

The memo lists operations informally: add, remove, merge, connect, expand, collapse, show a path, hide, simulate. Those should become a closed vocabulary rather than free-form natural language, for the same reason the demo's decision tree should stay finite: predictability, replayability and testability.

More importantly, they should be expressed in terms the corpus already has. The node types are established, running from Fact and Evidence through Vulnerability and Risk, grounded to reality through a Twin, with Stakeholder and now Decision alongside. The edges are established too, including `connected_to`, `gives_rise_to`, `protected_by`, `conditional_on` and `accepted_by`.

An operation vocabulary built on those inherits the whole model for free, and anything it cannot express is a genuine gap in the grammar worth knowing about. An operation vocabulary invented for the canvas would drift from the model within a week.

The memo's simulation request is the interesting one. The project lead: **"now simulate this, now the digital twin does X, what can you do?"** That is not a rendering operation; it is a question about consequence, and it belongs to the twin work rather than to the canvas. It is worth separating so that the canvas does not quietly acquire an execution engine.

## Never Render The Whole Graph

The memo identifies the problem correctly. The project lead: **"you display a big graph which sometimes is not readable, but once you add the chat interface to it, we can say, okay, now show me this path, now hide this bit."**

The tooling literature agrees emphatically, and its formulation is worth adopting: **a diagram showing everything is rarely useful, while a diagram showing one node interacting with its neighbours is always readable.** The recommended remedy is not a better renderer but splitting one large diagram into several focused ones.

So the rule for the canvas is that the default view is never the graph. It is the result of a query: a path, a neighbourhood, one altitude, one chain. This is not a limitation imposed by rendering; it is the corpus's own established primitive, since the query-paths work specified a deliberately wide first pass followed by queries layered on top that simplify so a reader starting at one point sees only what is relevant to them, and the customised-standard brief applied the same idea to an instrument.

The chat is therefore the query interface, and the canvas is where the answer appears. That is a cleaner description of the whole feature than a graph explorer with chat attached.

## Text Diagrams For Output, A Canvas For Exploration

The memo floats a format. The project lead: **"what we should explore is even converting to things like Mermaid."** The grounded answer is that it is the wrong tool for the canvas and the right one for the output.

**Wrong for exploration.** Text-based diagram rendering offers no interactive editing, minimal layout control with no ability to pin positions, and readability that degrades past roughly fifty nodes with a hundred described as tough. Rendering cost scales sharply, with reports that adding twenty nodes can make a diagram render three to five times slower.

**Right for output.** It is text, so it is diffable, committable and reviewable in a pull request; it renders natively in the places the corpus already publishes; and it is readable by a person and an agent without either needing a tool. That is precisely the posture argued for on 28 July when the corpus concluded that material must be readable by people and by agents, and on 31 July when it argued that agent-maintained coordination requires agent-readable storage.

For the interactive canvas the practical options are a network library aimed at exploratory interaction with editable nodes and grouping, or a graph toolkit where layout and algorithms are part of the product. Published guidance for 2026 places the first as the fastest route to an interactive canvas and the second as the richer choice where graph algorithms matter, with a WebGL renderer reserved for genuinely large graphs. Given the corpus computes query paths, the second is likely the better long-term fit, and an academic knowledge-graph editor using it demonstrates the exact features wanted here, including a side panel on node selection, zoom to a selected node, image export and a warning before rendering something too large.

The clean split: **the canvas is a library, the print step is text, and the committed artefact is the text.**

## Infographics Already Exist

The memo asks for a capability the estate already has. The project lead: **"add support for infographic generation, that's also very powerful, create an infographic from this."**

An infographic generator was listed on 23 July among the tools mature enough to productise and has been in use since. So this is wiring rather than building, and it fits the print step: the loop's output can be a picture, a text diagram, a replayable operation sequence, or all three.

The extension of putting images inside graph nodes is a different question and depends on the renderer chosen, which is another reason to decide that first.

## Sequencing

The memo is explicit that this is developer tooling. The project lead: **"this is more of a dev kind of workflow where the objective is to improve the feedback loop."**

That framing is correct and it settles the timing. The hall opens in two days. Building a development environment now would consume exactly the hours that the acceptance screen, the risk quality gate and the question-capture event need, and its benefit arrives afterwards rather than during.

The right moment is immediately after the event, when there will be a backlog of graph changes to make and a body of captured questions to model against. Built then, it accelerates everything that follows. Built now, it is the most attractive possible way to miss a deadline.

## What This Does Not Try To Be

- **Not a visitor-facing feature.** Developer tooling, with a different quality bar and a different audience.
- **Not a whole-graph renderer.** The canvas shows the result of a query.
- **Not a text-diagram canvas.** That format is the output, not the workspace.
- **Not an execution engine.** Simulation belongs to the twin work, not to the renderer.
- **Not for this week.** The right build is immediately after the event.

## Honest Tensions

| Tension | Note |
|---------|------|
| A dev tool against a deadline | The feedback-loop argument is real and the two days available belong to the demo, and this is the classic way good tooling arrives late |
| Closing the loop with screenshots | Feeding renderings back is powerful and adds a moving part between the agent and the canvas that can itself fail confusingly |
| A closed operation vocabulary versus exploration | Constraining operations makes them replayable and will frustrate exactly the open-ended exploration the tool exists for |
| Two renderers | Text for output and a library for the canvas means two representations of one graph, and they will diverge unless one is generated from the other |
| The transcript as a brief | Recorded operations are precise and carry no intent, so a sentence of explanation is not optional |
| Simulation inside the canvas | It is the most interesting request and the one most likely to turn a viewer into an application nobody planned |

## Open Questions

| Question | Notes |
|----------|-------|
| Does mediated chat retire the seeded key? | The most consequential item here, and it should be confirmed before the next product decision |
| Which rendering library? | Interactive network versus graph toolkit, decided against whether query paths become part of the product |
| What is the operation vocabulary? | Expressed in the established node and edge grammar, with gaps recorded rather than patched |
| Where does simulation live? | Almost certainly the twin work, and the boundary should be drawn before the canvas acquires it |
| Is the text diagram generated from the canvas state? | It must be, or the two representations diverge |
| What does the replayable session look like? | The format handed to the implementing agent, and how false starts are pruned |
| When is it built? | Immediately after the event, against a real backlog and the captured questions |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 2 Aug | `v0.33.55__arch-brief__sg-send-acceptance-flow-three-moves-none-is-denial-loop-closes-event-as-elicitation.md` | The structured-data side panel requested there, of which this canvas is the visual counterpart |
| 28 Jul | `v0.33.53__arch-brief__sg-send-customised-standard-eu-ai-act-graph-nothing-relevant-until-facts-attach-browser-query-layer.md` | The wide graph with queries layered on top, which is what the canvas renders |
| 31 Jul | `v0.33.54__arch-brief__sg-send-no-blank-prompt-shared-conversations-are-the-examples-curated-artefact-beats-thread-export-is-an-mcp-server.md` | The curated artefact rather than the transcript, which the recorded session resolves by making them the same thing |
| 28 Jul | `v0.33.53__arch-brief__sg-send-voice-note-tool-build-status-first-milestone-experience-seeded-key-guardrails-admin-vault-secret-distribution.md` | The seeded key arrangement that mediated chat may retire |
| 23 Jul | `v0.33.50__strategy-brief__sg-send-tools-mature-enough-to-productise-candidates-shared-gap-token-purchase-page-users-two-billing-shapes.md` | The infographic generator already in the estate, which this reuses rather than builds |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | Chat is now mediated by the vault without the application holding a key, which may retire the seeded-key problem parked twice |
| 2 | The real problem is that the agent works blind while the person works slowly, on the same object |
| 3 | A canvas fixes half of that; feeding the rendering back fixes the other half, and the tooling for it already exists |
| 4 | A REPL requires a fast cycle, inspectable state and non-destructive exploration |
| 5 | The recorded session is already the specification, so the brief is the operation sequence plus a sentence of intent |
| 6 | Operations should be a closed vocabulary expressed in the established node and edge grammar |
| 7 | Anything the vocabulary cannot express is a real gap in the model worth knowing about |
| 8 | Simulation is a question about consequence and belongs to the twin work rather than the renderer |
| 9 | The canvas should never render the whole graph, because a diagram of everything is rarely useful |
| 10 | It renders the result of a query, which is the corpus's existing primitive with an interactive front end |
| 11 | Text diagrams are wrong for the canvas and right for the output, being diffable, committable and readable by both people and agents |
| 12 | This is developer tooling and the right moment to build it is immediately after the event, not instead of it |

---

## Sources

- Comparative guidance on text-based diagram generation and interactive graph libraries, reporting that text diagrams become hard to read beyond roughly fifty nodes with a hundred described as difficult, that layout control is minimal with no ability to pin positions and no interactive editing, and that they are best suited to diagrams embedded in documentation held in version control: https://note.com/yoshi_asia_dev/n/n705bb507fc11?hl=en and https://infrasketch.net/blog/best-diagram-as-code-tools-2026 and https://www.pkgpulse.com/blog/mermaid-vs-d3-vs-chartjs-diagrams-data-visualization-javascript-2026
- Performance guidance reporting that rendering cost scales sharply with node and edge count, that adding twenty nodes can make a diagram render three to five times slower, and that the single best improvement is splitting one large diagram into several focused ones because a diagram of everything is rarely useful while one node with its neighbours is always readable: https://www.mermaidcreator.com/blog/mermaid-large-diagram-optimization-performance
- Guidance on interactive graph libraries for 2026, placing one as the fastest route to an interactive network canvas with editable nodes and grouping, another as the richer toolkit where layouts and algorithms are part of the product, and a WebGL renderer for genuinely large graphs: https://www.pkgpulse.com/guides/cytoscape-vs-vis-network-vs-sigma-graph-visualization-2026
- An academic knowledge-graph authoring tool implementing the pattern described here, including force-directed layout, namespace-aware label shortening, node inspection in a side panel, zoom to a selected node, image export, and a warning before rendering an oversized graph: https://arxiv.org/pdf/2606.07094

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
