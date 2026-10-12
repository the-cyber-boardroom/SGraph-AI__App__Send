# Every Paragraph Is A Graph: Turning The EU AI Act Into Fractal Semantic Graphs, With Definitions As Nodes And Twins As The Hooks Into Reality

**version** v0.33.53
**date** 28 July 2026
**from** Human (project lead)
**to** Engineering, Architecture, Ontologists, Product

**type** Architecture brief

*Ninth of 28 July, continuing the EU AI Act graph work. Carries an appendix defining the established graph primitives, because agents picking this up will not have the prior corpus in context. Concept definitions are sourced from the corpus rather than reconstructed.*

---

## What This Is

The conceptual work needed to turn a legal instrument into a fractal semantic graph, and the connection back to the graph primitives the corpus already settled: **the instrument is not one document but a hierarchy of paragraphs, points and definitions, and the working assumption is that every one of those becomes a graph in its own right, because every paragraph was written for a reason and therefore yields something extractable, a fact and its evidence, a risk, a control, a requirement, or a piece of work to be done, so the transformation is not a single parse into a single graph but a set of sub-transformations that each produce a subgraph hanging off the original text; those subgraphs are best understood as an abstraction layer that presents hooks, a set of connection points which the real world attaches to, so that the agents an organisation actually runs, the flows it operates, the controls it has in place, its incidents and its realities all have somewhere specific to connect, and the corpus already has the primitive for that, since a twin is precisely the endpoint where the graph stops being a model and continues into the real system, and whether a given point ever reaches reality is itself a measurable fact, which turns the hooks into a coverage measure over the instrument; the definitions in the Act are the first and most valuable layer of nodes, and the work on them is threefold, mapping how they relate to each other, hunting for contradictions between them, and finding the terms the text uses without ever defining, which have to be inferred and which are usually where the interpretive risk lives; and some articles will be substantial enough to need their own ontology and taxonomy rather than fitting the one above, which is not a complication but the expected fractal behaviour, and is the same question already asked and answered of a different regulation in earlier work.** It is the ninth document of 28 July (cross-ref: the v0.33.53 customised-standard brief, the v0.33.53 regulation-graph brief, the v0.31.9 vault-per-standard brief, the v0.33.48 fractal-semantic-graphs brief, and the v0.33.36 grounding-ladder work). New contributions: **the per-paragraph extraction taxonomy and its mapping onto the established grounding ladder, the identification of the memo's hooks as the existing twin primitive and the resulting coverage measure, the three-part definitional work of relation, contradiction and inference, proposed node and edge types for a legal instrument, and an appendix carrying the settled primitives forward for readers without the corpus.**

## This Is The Document-To-Graph Pipeline, Applied

Worth stating first, because it changes what is being invented and what is being reused. The corpus established the pattern in May: a vault per industry standard and per compliance document, each a semantic, graph-based, visualised version of the standard, produced by a universal document-to-graph pipeline, with GDPR, ISO 27000, SOC 2 and the OWASP standards named as the first batch. That brief also anticipated the marketing property, noting these artefacts are good enough to spread on their own merits.

So the EU AI Act work is not a new capability. It is the established pipeline pointed at the most commercially relevant instrument available, and the concepts below are refinements to a pattern that already exists.

## Every Paragraph Means Something, So Every Paragraph Yields Something

The premise that drives the extraction is simple and worth keeping. The project lead: **"every part of the act means something, there's a reason why they wrote that paragraph."** From which it follows that each paragraph can be interrogated for what it contributes. The project lead: **"out of it, you either have a fact and evidence, you have a risk, you have a to do, you have a control, you have a requirement."**

That list maps almost exactly onto the grounding ladder the corpus already uses, which runs Fact, Evidence, Measure, Vulnerability, Risk, with the rule that a fact becomes a vulnerability once it has an upward path to a risk. Two of the memo's five are new and should be declared as such rather than absorbed silently.

| From the paragraph | Corpus position |
|---|---|
| Fact and evidence | Established: the first two rungs of the grounding ladder |
| Risk | Established: the top of the ladder |
| Control | Established in relation, through `protected_by` and `conditional_on`, but not yet a first-class node type in the glossary |
| Requirement | **Proposed new node type.** An obligation stated by the instrument, distinct from a control, which is a thing an organisation does |
| To do | Maps to the existing discovery-project-as-a-node primitive: funded work that, on completion, emits data that re-rates something |

The important discipline, stated in the corpus glossary itself, is that new node and edge types are announced in prose rather than introduced quietly, and that an established edge is preferred over an invented one.

## The Subgraph Per Provision

The transformation is not one pass producing one graph. The project lead: **"we need to start capturing all of those and almost creating these sort of subgraphs, sub-transformations from the original content."** Each provision therefore carries its own small graph: the obligations it creates, the terms it depends on, the actors it binds, the conditions under which it applies, and the risks that follow from not meeting it.

```
   ARTICLE / PARAGRAPH / POINT           (the source text, with provenance)
        |
        +-- Definition nodes it depends on
        +-- Requirement nodes it creates
        +-- Actor roles it binds
        +-- Conditions that trigger or exempt it
        +-- Risk nodes arising from non-satisfaction
        +-- Control nodes that would satisfy it
                    |
                    v
              HOOKS  ->  the real world attaches here
```

## The Hooks Are Twins, And Unhooked Means Measurable

The memo reaches for an image to describe the connection surface. The project lead: **"it's basically creating these abstraction layers, it's basically creating these hooks, imagine this sort of box that now has these hooks that you can connect to these nodes."** And the purpose is explicit. The project lead: **"when we come up with the real world, where we talk about the agents that we have, and the flows that we have, and the controls that we have, and realities and incidents, basically all of them needs to connect somewhere into the graph."**

That concept already exists in the corpus under a different name, and naming it correctly buys something. A twin is the point where the graph stops modelling and continues into a real system. The established formulation is that the edges, the peaks and the endpoints of the graph continue into the twin and then ideally into reality, so every place the graph would otherwise stop is a twin, and the twin is the doorway from model to real system.

The part worth extracting is the measurement property that comes with it: **whether a given endpoint actually reaches reality is itself a fact, connected or not.** Applied to a legal instrument, that turns the hooks into a coverage measure. A provision whose hooks have no twin attached is a provision that has not yet been connected to anything the organisation actually has, and counting those is a direct, computable statement about how much of the instrument has been genuinely mapped rather than merely imported. That is the same computed-not-claimed discipline the maturity models use, applied to the completeness of the graph itself.

## The Definitions Are The First Layer Of Nodes

The Act's own definitions are the highest-value starting point, because a legal instrument defines its terms precisely so that the rest of the text can lean on them. The project lead: **"the AI Act has these definitions, so basically every one of those definitions now is a node on the graph."**

Three distinct pieces of work follow, and they are worth separating because each produces a different kind of finding.

**How they relate.** The project lead: **"it's important to see how they relate to each other."** Definitions in an instrument are rarely flat; they nest, qualify and cross-reference, and that structure is itself the first ontology.

**Where they contradict.** The project lead: **"interesting to see if there's some contradictions."** This is the highest-value output of the three and the one nobody usually produces, because reading for internal consistency across a long instrument is exactly the work a graph makes tractable and a human reader does not do.

**What is used but never defined.** The project lead: **"if there are other key definitions that are not defined in the actual definition that are used in the text, but not defined, but we can infer to it."** These are the terms carrying meaning without a formal anchor, and they are where interpretive risk concentrates, because every reader supplies their own definition and none of them is wrong on the face of the text. Surfacing that set is a genuinely useful artefact in its own right.

Two notes from the established primitives apply directly here. The corpus position is that meaning is carried by connectivity rather than by properties, which is the formal version of the memo's observation that a word without connections is just a word. And because the instrument is published in every official language of the Union, the anchor-node primitive, nodes that exist purely to connect vocabularies and make multilingual mapping work, is not an optional refinement but the mechanism by which the same graph can serve readers in different languages.

## Some Articles Need Their Own Ontology, And That Question Is Already Settled

The memo anticipates that the single ontology will not hold everywhere. The project lead: **"we need to see if we need to have sub-graphs and sub-ontologies and sub-taxonomies for certain parts, certain sections, or even certain articles; there might be an article that is so meaty that it requires its own ontology and taxonomy, and that's the power of the fractal element, it's basically graphs of graphs of graphs."**

The corpus has asked and answered this before, about a different regulation, in almost the same words: whether an ontology of ontologies is needed, with the observation that a specific section may need its own ontology that connects to the one at the top, and that this fractal nature is the desired outcome rather than a problem. That question sits inside the very brief that established the document-to-graph pipeline, so the pattern and its known complication arrived together, and the AI Act is the second instance of both.

What the earlier work adds is the reason the fractal structure is preferable to a single schema. The position is deliberately to err on the side of understanding over a standardised schema, because each team, department and sometimes person has their own way of mapping, and the right response is to make those compatible rather than to fold them into one. An ontology of ontologies lets many local mappings coexist and connect. Applied here, an article dense enough to warrant its own taxonomy gets one, and it connects upward rather than being flattened into the parent.

## Proposed Additions To The Grammar

Following the corpus discipline of declaring new types rather than introducing them quietly, a legal instrument appears to need the following, all stated as proposed.

**Node types:** Provision (an article, paragraph or point, carrying its source reference), Definition, Requirement, Obligation, Prohibition, Control, and Actor (the roles the instrument itself defines, such as provider or deployer).

**Edge types:** `defines` and its inverse `defined_in`, `applies_to`, `triggers`, `exempts`, `references`, `satisfied_by`, and `in_scope_when`.

Where an established edge already fits, it should be used instead. A requirement that reduces a risk is `protected_by`; a control whose value depends on an assumption is `conditional_on`; a provision that creates exposure is `gives_rise_to`; the connection from any node to a twin and onward to reality is `connected_to`. The established set should be exhausted before any of the above is adopted.

## What This Does Not Try To Be

- **Not a new pipeline.** The document-to-graph pattern was established in May; this applies it.
- **Not a legal interpretation.** The graph records what the instrument says and what terms it leaves undefined; it does not decide what applies to anyone.
- **Not a single flat ontology.** Dense articles get their own, connected upward.
- **Not a complete import.** Coverage is measured by what has hooks attached to reality, not by how much text was ingested.
- **Not a properties store.** Meaning is carried by connections, which is the whole reason the definitions are nodes.

## Honest Tensions

| Tension | Note |
|---------|------|
| Every paragraph as a graph versus tractability | The instrument is long, and a subgraph per provision is a large amount of modelling for material that may never be cited by any register |
| Finding contradictions versus asserting them | Apparent contradictions in a legal text are often resolved by interpretation the graph cannot perform, and publishing a list of them is a stronger claim than it looks |
| Inferring undefined terms versus inventing them | The undefined set is genuinely valuable and the inferred definitions are ours, so they must be visibly marked as inference rather than as the instrument's own |
| Sub-ontologies versus interoperability | Letting a dense article have its own taxonomy is correct and multiplies the connection work between local vocabularies |
| Coverage by hooks versus coverage theatre | Counting connected endpoints is a good measure and an easy one to game by attaching weak hooks to everything |
| Proposed types versus grammar sprawl | Seven node types and seven edges is a large single addition, and the established set should be pushed harder before adopting them |

## Open Questions

| Question | Notes |
|----------|-------|
| Which provisions get subgraphs first? | Almost certainly those the plug and register work already cites, following the earlier conclusion that the graph need only cover what is cited |
| Is Requirement distinct from Obligation? | They may collapse into one node type with a property, or the distinction may be load-bearing |
| How is an inferred definition marked? | The visible difference between what the instrument defines and what we supplied |
| How are the language versions related? | Anchor nodes are the established mechanism, and which language is canonical is undecided |
| What is the contradiction test? | Whether a contradiction is computed from the graph or proposed by a model and confirmed by a person |
| Does the coverage measure become a maturity predicate? | Connected endpoints over total endpoints looks like a computable level in the manner of the other maturity models |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 28 Jul | `v0.33.53__arch-brief__sg-send-customised-standard-eu-ai-act-graph-nothing-relevant-until-facts-attach-browser-query-layer.md` | The customised standard this supplies the modelling for; the hooks are how facts attach provisions |
| 28 Jul | `v0.33.53__arch-brief__sg-send-regulation-graph-vault-and-website-as-evidence-layer-under-pull-the-plug-obligation-versus-liability.md` | The evidence-layer purpose; this is the transformation that produces it |
| 30 May | `v0.31.9__arch-brief__sg-send-vault-per-standard-document-to-graph-artefacts.md` | The direct precedent: a vault per standard, produced by a universal document-to-graph pipeline |
| 12 Jul | `v0.33.48__arch-brief__sg-send-fractal-semantic-graphs-agentic-operating-layer-deterministic-sovereign-open-source.md` | One node and edge grammar at every altitude, which is what makes the fractal structure work |
| 26 Jun | `v0.33.35__arch-brief__sg-send-digital-twins-twin-of-anything-dimensions-discipline-of-reality-simulation-testing.md` | The twin primitive the hooks turn out to be, and the discipline of reality |
| 17 Jul | `v0.33.49__arch-brief__sg-send-fractal-risk-registers-one-per-accepting-role-domain-language-relevance-fade.md` | Registers of registers, the same fractal move applied to the risk side |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | This is the established document-to-graph pipeline applied to the AI Act, not a new capability |
| 2 | Every paragraph was written for a reason, so every paragraph yields a fact, a risk, a control, a requirement, or work to be done |
| 3 | That extraction maps onto the existing grounding ladder, with Requirement and Control needing declaration as node types |
| 4 | Each provision carries its own subgraph rather than folding into one flat graph |
| 5 | The hooks the memo describes are the established twin primitive, the point where the graph continues into reality |
| 6 | Whether an endpoint reaches reality is itself a fact, which makes hook coverage a computable measure of how much of the instrument is genuinely mapped |
| 7 | The instrument's own definitions are the first and most valuable layer of nodes |
| 8 | The definitional work is threefold: how they relate, where they contradict, and what is used but never defined |
| 9 | Terms used without definition are where interpretive risk concentrates, and surfacing them is a valuable artefact in itself |
| 10 | Dense articles get their own ontology connected upward, which is the fractal behaviour already established for another regulation |

---

## Appendix A: The Established Concepts

*Carried here because agents picking up this work will not have the earlier corpus in context. Definitions are taken from the corpus and the concepts glossary rather than reconstructed; the source brief is named for each.*

**Meaning through connectivity.** The graph does not carry meaning in properties. The project lead's formulation: **"in our graph we do not use properties, because properties do not have meaning, they are just words; we capture meaning through connectivity."** A term, a phrase or a definition acquires meaning only from what it is connected to, which is why the Act's definitions must become nodes with edges rather than fields on a record. A related formulation frames the model as a set of clues that lead to the right information rather than a store that holds all of it. (v0.33.35 digital-twins twin-of-anything; registry and semantic-knowledge-graphs briefs.)

**Digital twins, and the discipline of reality.** A twin can be made of anything: an organisation, a system, an inbox, a person, a behaviour, an event, an external factor. Twins are how the graph captures reality, and the established formulation is that the edges, peaks and endpoints of the graph continue into the twin and then ideally into reality, so every place the graph would otherwise stop is a twin. Two properties matter here: whether an endpoint reaches reality is itself a measurable fact, connected or not; and the discipline is that everything modelled must be real, an actual fact, so the graph does not fill with hypothetical risks that become pollution. (v0.33.35 digital twins.)

**Graph of graphs, ontology of ontologies, and graphs of graphs of graphs.** A graph whose nodes are themselves graphs. The established rationale is not decoration but compatibility: the position is to err on the side of understanding over a standardised schema, because each team, department and person maps things differently, so the model makes vocabularies compatible rather than folding them into one. The question of whether a specific section of a regulation needs its own ontology connecting to the one at the top was raised for GDPR and answered affirmatively, with the fractal nature described as the desired outcome; notably that question sits inside the same vault-per-standard brief that established this pipeline. The three-level form appears where each item in a collection is its own world with its own ontology and taxonomy. (v0.31.9 vault-per-standard; v0.33.36 library brief.)

**Anchor nodes.** Because nodes and edges are almost free, the graph can carry nodes that exist only to connect vocabularies to each other. This is the mechanism that makes multilingual and multicultural mapping work, and it is the relevant primitive for an instrument published in many official languages. (v0.33.35 path-properties read-as-language.)

**Fractal semantic graphs.** One node and edge grammar used at every altitude of the system, from a single provision up to an organisation. Determinism, explainability, provenance, sovereignty, scale and openness all follow from that single decision. A related security property is that untrusted input is treated as data and never as instruction, so injection fails at the validator structurally. (v0.33.48 fractal semantic graphs.)

**The grounding ladder.** Fact, then Evidence, then Measure, then Vulnerability, then Risk. A Fact becomes a Vulnerability once it has an upward path to a Risk. Everything grounds to Reality through a Twin using the `connected_to` edge. This is the spine the per-paragraph extraction hangs on. (v0.33.36 grounding ladder; v0.33.44 ontology.)

**Directed edges with distinct inverses.** Every edge is directed and has a distinct inverse, so each node has an outward path, what it opens, and an inward path, what authorised it. That asymmetry is what keeps typed query paths narrow and lets them converge on natural peaks instead of exploding, even when a query begins in many places at once. (v0.33.35 path-properties read-as-language.)

**Paths that read as language.** A path through the graph should read as a natural sentence in the language, culture and business context of the reader, so that the graph explains itself rather than requiring a key. (v0.33.35 path-properties read-as-language.)

**Multi-graph creation paths.** A deliberately wide first pass that captures the universe around a subject, followed by queries layered on top that simplify it so a reader starting at one point sees only what is relevant to them. This is the mechanism behind the customised standard: the full graph exists, and the view is computed. (v0.33.35 path-properties read-as-language.)

**The relevance fade.** In the register work, a role holds its own register plus derived views of the registers above it, filtered by relevance. The same filtering applied to an instrument is what produces a version of the standard containing only what a given situation triggers. (v0.33.49 fractal registers.)

**The vault is the source of truth.** No database means the versioned file-system vault holds the truth, not that databases are absent. Browser databases are an ephemeral query engine loaded from the vault and synced by commit identifier. This is what gives every claim a provenance chain back to a file and a commit. (v0.33.48 browser databases.)

**Edge grammar discipline.** Established edges are reused in preference to inventing new ones. The established set includes `connected_to`, `observed_on`, `backed_by`, `measured_by`, `grants`, `reaches`, `enables`, `exposes`, `gives_rise_to`, `protected_by`, `conditional_on`, `defeated_by`, `owned_by`, `accepted_by` and `underwritten_by`. When a new node or edge type is genuinely needed, it is declared as proposed in the prose rather than introduced silently. (Concepts glossary.)

---

## Sources

- The corpus repository holding the briefs cited in the appendix, including the digital twins, query paths, ontologies-of-ontologies, fractal semantic graphs, grounding ladder and vault-per-standard briefs: https://github.com/the-cyber-boardroom/SGraph-AI__App__Send
- Within that repository, the direct precedent for this work is the 30 May vault-per-standard brief at `team/humans/dinis_cruz/briefs/05/30/`, and the twin primitive is defined in the 26 June digital-twins brief at `team/humans/dinis_cruz/briefs/06/26/digital-twins-and-world-models/`.

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
