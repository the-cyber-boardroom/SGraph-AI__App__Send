# Refactoring Meaning: This Is Decompilation Rather Than Compilation, Which Is Exactly Why The Author Has To Be The Arbiter

**version** v0.33.57
**date** 9 August 2026
**from** Human (project lead)
**to** Strategy, Product, Engineering, and the agent working on fractal semantic graphs

**type** Strategy brief

*First of 9 August. The positioning for the graphing-text initiative. Offered to be built on and challenged.*

---

## What This Is

The core positioning for turning text into semantic graphs, and one refinement to the memo's central metaphor that turns two ideas into one: **the ladder from letters to original text to summary to higher concepts and eventually to user stories and business functions is a genuine and useful frame, and the direction matters, because a compiler goes from abstract to concrete and is deterministic while this work goes from concrete to abstract, which in the same discipline is decompilation, the direction that is ambiguous and cannot be done reliably without help; that is not a weakness of the metaphor but the reason the rest of the positioning is necessary, since the memo's deepest claim is that the point is not absolute truth but the author's own meaning confirmed by the author, and lifting is precisely the operation that requires an oracle, with the author being the only party who holds the answer; from which the most valuable interaction in the whole system follows, because a reader saying that is not what I meant is not a failure of extraction but the elicitation working, and it is the one thing this does that summarisation cannot; the two-way conversation the memo wants has an established form in the same discipline, since compilers keep source maps so that a symbol at any level resolves to the span it came from, and every node at every altitude should carry that pointer, which is also the corpus's existing provenance discipline; the fractal property is what lets a mention of a company connect outward into a taxonomy for that company, that industry and that event, and what lets a verb connect to what it means, so the graph is not one structure but many intersecting ones; altitude answers the rendering question the memo raises, because the graph is necessarily large and the reader chooses a height rather than a subset, seeing city walls, then roads, then buildings, then people; and the vocabulary problem is real and under-appreciated, because the people who will use this do not know what an ontology or a triplet is, which makes naming a design problem rather than a documentation one.** It is the first document of 9 August (cross-ref: the fractal semantic graphs briefing pack of 6 August, the v0.33.56 concepts-not-words brief, the v0.33.36 node type formulas brief, the v0.33.49 fractal-registers brief, and the v0.33.55 graph-canvas brief). New contributions: **the direction of the ladder identified as decompilation and the consequence that an oracle is required, the author named as that oracle and disagreement reframed as success, source maps proposed as the two-way mechanism, opinion-stated-as-fact identified as the sharpest test case, and the vocabulary problem named as a design problem.**

## The Ladder, And Which Way It Runs

The memo's frame is worth keeping and worth sharpening. The project lead: **"you can almost think that the letters are machine code, and the original text is sort of the C++, and then you have the summary, which is already a higher-level language, and then eventually you hit user stories and business functions."** With the intent. The project lead: **"the logic here is to keep making this pyramid, where in a way we are almost refactoring the content."**

The ladder is right. The direction is the thing to be precise about, because it changes what is hard.

```
   business functions, user stories        most abstract
        ^
        |  LIFTING            ambiguous, needs an oracle
        |                     many texts map to one concept
   concepts, claims, entities
        ^
        |  LIFTING
        |
   summary
        ^
        |  LIFTING
        |
   original text
        ^
        |
   letters                                 most concrete
```

A compiler runs **downward**: it takes the abstract and produces the concrete, deterministically, and the same input always yields the same output. Everything the memo describes runs **upward**, which in the same discipline is decompilation, or lifting.

That distinction matters because the two directions have opposite properties. Lowering is many-to-one and mechanical. **Lifting is one-to-many and ambiguous**: a given sentence supports several defensible readings, and nothing in the text itself decides between them. Practitioners of actual decompilation know this; a lifted representation is a hypothesis about what the original meant, not a recovery of it.

So the memo's wish for determinism is achievable in one specific sense and not in another. The **transformation** can be deterministic, in that the same input plus the same formulas plus the same confirmed anchors yields the same graph. The **interpretation** cannot be, because interpretation is where the ambiguity lives.

Which leads directly to the positioning.

## The Author Is The Oracle

The memo's central claim, and it should be the headline of everything downstream. The project lead: **"the point of here is not to have absolute truth; it is to have a bias from the point of view of the creator of the document, because what we want here is to make sure that the creator of the document confirms what he means by the document."**

That is not a modest ambition dressed up. It is the move that makes the problem tractable, and it follows necessarily from the direction of the ladder.

Lifting is ambiguous, so something has to resolve the ambiguity. The available candidates are a model, a consensus, an external corpus, or the author. Only one of them actually holds the answer. **Nobody but the author knows what the author meant**, and that question, unlike the question of truth, can be answered in seconds by the only person qualified to answer it.

Three consequences follow.

**The artefact's claim becomes honest and defensible.** It does not assert that these are the facts. It asserts that this is what the author says they meant, confirmed by them, with the text they said it in attached.

**Verification becomes cheap.** Asking is this true requires evidence, expertise and time. Asking is this what you meant requires a glance.

**And the corpus already has the vocabulary.** The predicate established on 28 July separates confirmed, meaning somebody with the relevant knowledge agrees the fact is true, from validated and accepted. Here the relevant knowledge is authorial intent and the only holder is the author, so what this system produces is a graph of author-confirmed meaning.

## Disagreement Is The Product

The memo says this and it deserves emphasis, because it inverts how such a feature would normally be judged. The project lead: **"there could be a scenario where the person goes, yes, this is correct, or it could be the person goes, oh, actually no, that's not what I meant, which is very positive, because that's kind of the point of this."**

That is exactly right, and it is the single strongest argument for this over summarisation.

A summary that the author reads and agrees with has told them nothing. **A structured reading that the author disputes has told them something they did not know about their own text**, which is that they wrote something they did not mean, or meant something they did not write.

Both cases are valuable and they are different. Writing something you did not mean is a drafting problem. Meaning something you did not write is a communication problem, and the reader who receives that document has no way to recover the intent.

So the interaction should be built to make disagreement easy rather than awkward. A reader who has to work to say no will say yes, and a system that only ever hears yes is a system that has learned nothing. This is the same conclusion the corpus reached about registers: a reviewer who has never returned anything is not a reviewer.

## Source Maps Are The Two-Way Conversation

The memo wants movement in both directions. The project lead: **"there's a two-way conversation from here."**

The same discipline that supplies the ladder supplies the mechanism. Compilers emit **source maps**, so that a symbol in generated output resolves back to the exact span of source it came from, which is what makes debugging a compiled artefact possible at all.

Every node at every altitude should carry the same thing: **the span it was lifted from, at every level below it.** A business function points at the concepts that produced it; each concept points at the claims; each claim points at the sentence; the sentence points at its position in the summary; and the summary span points at the transcript span.

That gives three properties for the price of one field. A reader at any altitude can descend to the words. A correction at any level can be traced to what it changed. And an assertion at the top can always be challenged with what actually got said, which is the provenance chain the corpus insists on everywhere else.

It is also what makes the two-way conversation real rather than aspirational, because without it, going down means guessing.

## Opinion Stated As Fact Is The Sharpest Case

The memo names it in passing and it is the best test case in the whole initiative. The project lead: **"that's why I go into facts, hypotheses, opinions, actually is important, you know, even opinions stated as facts."**

Consider what happens. The author writes a sentence declaratively. The system types it and shows the reader. Two outcomes:

**The author confirms it as a fact.** The graph now records not only the claim but that the author asserts it as fact, which is information about their stance that the text alone did not carry explicitly.

**The author says it is their view.** The system has now extracted something the text did not contain, which is the distinction between what was asserted and how confidently it was held. **That is elicitation, not extraction**, and no summariser produces it.

The second case is the demonstration. It should be one of the first things shown to anybody being introduced to this, because it makes the value obvious in a single example without needing any of the vocabulary.

## Fractal Because The Graphs Intersect

The memo's reason for the fractal structure is more specific than the usual one and worth recording. The project lead: **"if there's a reference to a company, then that needs to be connected to a taxonomy and ontology related to that company, related to that industry, related to that event, and even a verb needs to be connected to what it means and what it is."**

So the fractal property is not primarily about nesting by size. It is about **intersection**: a single mention in a paragraph is simultaneously a node in the paragraph's graph, an entity in a company ontology, an instance of an industry classification, and a participant in an event. Those are different graphs meeting at one point.

That has a design consequence. A node should be **addressable from several schemes at once** rather than owned by one, which is the ontology-of-ontologies position the corpus already holds and the reason a single hierarchy will not do.

And the verb point is the lexical layer arriving from the same argument: a verb is not decoration between two entities, it is the relation, and it resolves to a definition like anything else.

## Altitude Is How Much, Query Is Which Part

The memo raises the rendering problem and answers it with a good metaphor. The project lead: **"the graph is quite massive, and the interesting question is how much of the graph we present to the user at each moment in time, but this is just a question of altitude, like if you see something from a very high altitude you just see the city walls, and as you zoom in you start to see roads and buildings, and eventually people and cars."**

That is exactly the corpus's existing primitive. The register work established one view per accepting role, in that role's language, with a relevance fade that shows less as concern decreases. The canvas work established that the default view is never the whole graph.

Worth separating two things the metaphor blends, because they are different controls:

| Control | Question it answers | Example |
|---|---|---|
| **Altitude** | How much detail | City outline, or streets, or people |
| **Query** | Which part | This district, this route, this building |

A reader needs both. Altitude without query means seeing the whole city in more detail, which does not help. Query without altitude means seeing one building and never the shape it sits in.

The city metaphor is also worth keeping as customer-facing language, which the next section explains.

## The Vocabulary Is A Design Problem

The observation most likely to be skipped, and it decides adoption. The project lead: **"a lot of the people that will use this don't know about semantic graphs, don't know about ontologies, don't know about a lot of the other terms, so we also need to explore different UIs, and different ways to name this."**

Nobody outside this field wants to see the words ontology, taxonomy, triplet or node type formula. Those are our words for our machinery, and showing them to a user is asking them to learn our implementation before they can use our product.

This is exactly the problem the concept work of 6 August addressed for interface strings, and the same discipline applies: **the concept is stable and the label is chosen for the audience.** One concept, several labels, tested rather than assumed.

Some candidate framings worth trying, since the memo asks for exactly this exploration:

| Our word | Candidate labels for a reader |
|---|---|
| Semantic graph | The map, the picture, what you said |
| Node | Point, item, thing you mentioned |
| Fact and opinion typing | Said as certain, said as a view |
| Altitude | Zoom, level of detail |
| Confirmation loop | Does this look right? |

And the memo's own metaphor is the best asset here. **A reader who is told they are looking at a city from above, and can zoom in, needs no explanation at all.**

## Start With The Summary

A sequencing decision the memo makes and which is right. The project lead: **"it's interesting for the transcript to probably start by the summary, because the summary has already cleaned up a little bit of the original text, because the original text of the transcription will have weird things."**

Correct, and there is direct evidence in this corpus. The transcripts that produce these briefs have rendered a well-known author's surname as an unrelated pair of words, an interface name as a different string, and a widely known acronym as something else. Lifting from that text would faithfully produce a graph containing entities that do not exist.

The memo's own future step is where this becomes interesting. The project lead: **"eventually we can even apply the same principles to the original text, which is going to be interesting to even connect the original text with the summary."**

That mapping has a payoff worth naming: **a transcript-to-summary graph is a transcription error detector.** Where a concept appears at one level and not the other, or appears under a name that resolves nowhere, the discrepancy points at exactly the words the transcription got wrong. That is the same divergence-as-finding pattern this corpus has now hit five times.

## Why The Transcript First

Recorded because it explains the choice of subject. The project lead: **"the reason again to start with the transcript is because this is the first time we're trying to put all this stuff together."**

So the transcription tool is the testbed rather than the destination, chosen because it is small, real, ours, and low-stakes. The destination is stated too. The project lead: **"risk is a great example, the risk mandate stuff needs these on steroids."**

That is the right sequencing: prove the lifting, the confirmation loop and the altitude control on text nobody will be sued over, then apply it where a mis-typed claim has consequences.

## What This Positioning Rules Out

Stating the negative space, because it is what makes the positioning a position.

- **Not a truth engine.** It does not adjudicate whether claims are true, and should never present itself as doing so.
- **Not summarisation.** A summary is read and agreed with; this is read and argued with, and the argument is the point.
- **Not fully automatic.** Lifting is ambiguous by nature, so an oracle is required and the author is it.
- **Not one graph.** Many intersecting graphs meeting at shared nodes.
- **Not for people who know the vocabulary.** The words are ours, and the labels must be theirs.

## Honest Tensions

| Tension | Note |
|---------|------|
| The author as oracle versus the author's own blind spots | Authorial intent is authoritative about meaning and not about accuracy, so a confirmed graph can faithfully encode a mistaken belief |
| Disagreement as the product versus how it will feel | Being told you wrote something you did not mean is useful and uncomfortable, and the framing decides which one lands |
| Determinism versus interpretation | The transformation can be repeatable while the interpretation cannot, and conflating the two will produce a promise that cannot be kept |
| Source maps at every level | It is the right mechanism and it means every node carries provenance at every altitude, which is real storage and real discipline |
| Altitude as a control | The metaphor is intuitive and the implementation is a genuinely hard rendering problem that the corpus has not yet solved |
| Starting with the summary | It is cleaner and it is already an interpretation, so the graph is lifted from something that has already lost information |
| The vocabulary | Hiding our terms makes it usable and makes it harder for a user to reason about what the system is actually doing |

## Open Questions

| Question | Notes |
|----------|-------|
| What does the confirmation interaction look like? | The single most important design surface, since disagreement must be easier than agreement |
| How is a source map represented and stored? | Spans at every level, and what that costs |
| Is altitude computed or authored? | Generated views by depth, or curated levels, and whether a reader can define one |
| What do we call things? | Tested with people who do not know the field, not chosen by us |
| How is opinion-stated-as-fact surfaced without accusing? | The most valuable case and the most likely to feel like being corrected |
| When does the transcript layer get added? | The error-detector payoff argues for sooner than the memo suggests |
| What carries over to the risk work? | The destination, and which primitives transfer unchanged |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 6 Aug | `00__LEADING-BRIEF__start-at-the-paragraph-typed-artefacts-then-graphs-of-graphs.md` | The pack this positions, including the paragraph-first sequencing and the type vocabulary |
| 6 Aug | `01__COMPANION-BRIEF__aim-for-refinable-not-correct-the-loop-is-the-product.md` | Refinable rather than correct, which the author-as-oracle claim sharpens into a stated arbiter |
| 6 Aug | `v0.33.56__arch-brief__sg-send-concepts-not-words-skos-is-the-model-divergence-is-the-finding.md` | One concept with labels chosen per audience, which is the answer to the vocabulary problem |
| 28 Jun | `v0.33.36__arch-brief__sg-send-node-type-formulas-classification-as-testable-path-pattern-not-judgment.md` | Classification as a formula, which keeps the transformation repeatable even where interpretation is not |
| 2 Aug | `v0.33.55__arch-brief__sg-send-graph-canvas-repl-un-blinding-the-agent-mermaid-for-output-never-render-whole-graph.md` | Never render the whole graph, which altitude and query together answer |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | The ladder from letters to business functions is a good frame, and the direction is upward |
| 2 | Upward is decompilation rather than compilation, which is the ambiguous direction |
| 3 | Lifting is one-to-many, so something must resolve the ambiguity, and only the author holds the answer |
| 4 | The transformation can be deterministic; the interpretation cannot, and the two should not be conflated |
| 5 | The artefact is a graph of author-confirmed meaning, not a claim about truth |
| 6 | Is this what you meant is answerable in seconds; is this true is not |
| 7 | A reader disputing the reading is the elicitation working, and is the strongest argument over summarisation |
| 8 | Source maps make the two-way conversation real: every node points at the span it was lifted from |
| 9 | Opinion stated as fact is the sharpest demonstration, because confirming or denying it extracts something the text did not contain |
| 10 | The fractal property is intersection rather than nesting: one mention sits in several graphs at once |
| 11 | Altitude and query are different controls and a reader needs both |
| 12 | The vocabulary is a design problem, because our words are our machinery and the labels must be the reader's |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
