# Confidence Through Evidence: Blast Radius, And Mapping The Gaps

**version** v0.33.38
**date** 16 June 2026
**from** Human (project lead)
**to** Strategy, Architect, Security, Publication, @Dev
**type** Strategy brief (thesis)

---

## What This Is

A follow-up thesis to meaning through connectivity, in the graphs-of-graphs logic: **where meaning is a spectrum that grows with connectivity, confidence is a spectrum that grows with evidence, and the confidence that matters here is confidence in the blast radius, the understanding of what a change will actually affect, so the more connected evidence you have the more you understand the impact, and crucially you should map not only the evidence you have but the gaps, what is missing to gain more confidence, because that both quantifies your confidence and makes the business case to connect the dots, since evidence has weight, the absence of evidence is itself evidence, the highest-risk and highest-impact points are the highest-leverage points (sometimes low in the graph but with a massive blast radius if changed), and the core problem in most systems is that the blast radius does not propagate because the graphs are air-gapped, which Gen AI now lets us connect affordably.** It extends the meaning-through-connectivity thesis and the decision-as-a-graph idea (cross-ref: the v0.33.26 agentic-content-website brief for facts, hypotheses, and evidence, the v0.33.16 artefact-driven-security-assessments brief for blast radius, and the v0.32.3 nhi-2.0-semantic-knowledge-graphs brief). New contributions: **confidence-as-evidence, the map-the-gaps insight, the leverage point, and the propagation problem.**

## The Follow-Up Framing

How it relates to the prior thesis: **meaning grows with connectivity; confidence grows with evidence.**

The project lead: **"this is a follow-up to the meaning-through-connectivity document, part of the graphs-of-graphs logic. That one said meaning is a spectrum, the more connectivity you have the more understanding and meaning you get. The logic here is confidence, in the context of blast radius."** So the two theses are parallel: connectivity yields meaning, and evidence yields confidence, both as spectrums over a graph.

## Confidence Is Understanding The Blast Radius

The context that matters: **confidence here means understanding the impact of a change.**

The project lead: **"the confidence here is understanding the blast radius, for example for a vulnerability, understanding the impact of a change. In order to make a decision, to have confidence that you have the right information and the right graph, the good state, it has to do with evidence."** So confidence is not a feeling but a property of how well you understand what a change will affect, and that understanding comes from evidence (cross-ref: the artefact-driven-security-assessments brief, where blast radius is central).

## More Connected Evidence, More Confidence

The mechanism: **each node of evidence adds to your understanding of the blast radius.**

The project lead: **"the more evidence you have, the more understanding you have of what is happening. The more nodes in your graph that provide a fact, that this is connected to that, this has this asset, this has this risk, this has this implication, the more you understand the blast radius. A lot of these things are not absolute, although some are pretty binary, but a lot are a spectrum, more or less confidence."** So evidence accumulates into a graph, and the density and connectedness of that graph is the measure of confidence, which is usually a spectrum rather than a yes or no.

## Map What You Have, And What Is Missing

The sharpest insight: **map not only the evidence you have, but the evidence you are missing.**

The project lead: **"what is interesting is that you could also map what you would need to know to have more confidence. You do not just map what you have, you map what you need, and this is the thing we do not do a lot in products: we do not list what is missing, so we can have assurance of how confident we are. You can have one piece of evidence, but to have confidence you might need ten pieces, or this follows that follows that, and if you do not have it, you do not have confidence in the blast radius, you do not understand the side effects."** This is the contribution: an honest confidence system lists its own gaps. Knowing you have three of the ten pieces of evidence you need is itself vital information, and it makes the business case to invest in connecting the missing dots.

## What You Need To Consume

What feeds the evidence graph: **asset register, business strategy, business risk, costs, side effects, and root causes.**

The project lead: **"you need to consume the asset register, the business strategy, the business risk, and other elements: what is the cost of not doing it, the cost of doing it, the side effects, the real root causes. Because is this a one-off, is it more than one, is it systemic, will you have the same problem tomorrow in a variation."** So confidence in a blast radius draws on far more than the technical artefact: it pulls in business context, cost, and the question of whether a problem is isolated or systemic.

## Why Blast Radius Is The Better Conversation

The framing that makes this richer: **most problems are not binary, they are ecosystems.**

The project lead: **"a lot of issues are not just binaries, not somebody flicked a switch and let us flick it back. A lot of them are created by an ecosystem of events, or an ecosystem of how things are set up."** So treating an issue as a single switch misses the point; the blast-radius view sees the surrounding system of causes and effects, which is where the real understanding lives.

## The Thesis: Confidence Is Based On Evidence

The core claim: **what you say should be connected to evidence you can follow, and the absence of evidence is itself evidence.**

The project lead: **"the thesis is that the confidence you have in saying something, which should be connected to facts, hypotheses, and opinions, should be based on evidence, and we should be able to follow the evidence. And by the way, lack of evidence is evidence, lack of fact is a fact. It is like going back to science, provable and repeatable. Evidence has a level of weight, and you should be able to connect the dots. Even for things we do not understand, with Markov chains or Monte Carlo simulations, you can simulate on data you do not have, and become quite deterministic."** So confidence is evidentiary and scientific: claims trace to weighted evidence, gaps are themselves recorded, and even unknowns can be modelled probabilistically (cross-ref: the agentic-content-website decision-as-a-graph and facts-hypotheses-evidence).

## The Leverage Point

A big concept: **the highest-risk and highest-impact points are the highest-leverage points.**

The project lead: **"the places where you have the highest risk and the highest impact are almost the places of highest leverage. With an interconnected evidence system, sometimes that point can be quite low on the graph, but it is the point where, if it changes, the blast radius, pun intended, is massive."** So the evidence graph does not just measure confidence, it reveals leverage: the node that looks minor but whose change propagates widely is exactly where attention and investment should go.

## The Propagation Problem

The core failure in most systems: **the blast radius does not propagate, because the graphs are air-gapped.**

The project lead: **"most problems are that the blast radius does not propagate. At the point of decision-making, of analysis, of sensing, you do not see in real time, or in an effective time, the impact of a change in a graph that is three, four, or five nodes away, because in most places those graphs are not connected, they are air-gapped."** So the failure is structural: the evidence exists somewhere, but it does not reach the point of decision in time, because the graphs that hold it are not connected.

## Why Now: Gen AI And Connectors

What changes the economics: **we can now build connectors and connect the dots affordably.**

The project lead: **"what is powerful now is that we can build filters, connectors, and transformers much more effectively. We can connect dots that in the past were not connected, or not efficiently connected. Gen AI now makes a massive difference, because we can scale the connection and the connectors in ways we could not afford."** So the thesis is newly actionable: the connecting of evidence graphs, once too expensive, is now feasible at scale (cross-ref: the LETS and connectors work, and the agentic-content-website).

## Honest Tensions

**Tension 1: connect-for-confidence versus isolate-for-containment.** The same blast-radius thinking that says propagate the evidence also says contain the blast. Some graphs are air-gapped for good reasons (security, separation, prompt-injection isolation). Mitigation: connect the evidence needed for confidence while preserving the isolation needed for containment; these are different graphs (cross-ref: the archiver-cataloguer chaining and the vault-in-vault-kernel-model, which isolate deliberately).

**Tension 2: the gap map can be unbounded.** What you need to know can expand indefinitely. Mitigation: weight the evidence and the gaps; map the gaps that materially change confidence, not every conceivable one.

**Tension 3: evidence weighting is a judgment.** Assigning weight to evidence is itself a modelling choice. Mitigation: make the weighting explicit and followable, as the thesis requires.

**Tension 4: simulation assumptions.** Monte Carlo and Markov projections rest on assumptions. Mitigation: record the assumptions as part of the evidence; lack of evidence is evidence.

## Open Questions

| Question | Notes |
|----------|-------|
| How is evidence weighted? | Explicit and followable |
| When is a gap worth mapping? | When it materially changes confidence |
| Where do we connect, and where do we keep air-gapped? | Confidence versus containment |
| How fresh must evidence be to count? | The real-time dimension |
| How is the leverage point surfaced? | From the interconnected graph |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 13 Jun | `v0.33.26__arch-brief__sg-send-agentic-content-website-provenance-decision-graph-research-publish.md` | Facts, hypotheses, evidence, and the decision-as-a-graph |
| 10 Jun | `v0.33.16__strategy-brief__sg-send-artefact-driven-security-assessments-delta-scanning-vaults.md` | Blast radius and evidence |
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-semantic-knowledge-graphs-of-identity.md` | Graphs of graphs and connectivity |
| 15 Jun | `v0.33.27__arch-brief__sg-send-archiver-cataloguer-librarian-agent-append-ephemeral-compute-pattern.md` | Deliberate isolation versus connection |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | Confidence is a spectrum that grows with connected evidence |
| 2 | Confidence here means understanding the blast radius |
| 3 | Map not only the evidence you have but the gaps you are missing |
| 4 | Mapping the gaps quantifies confidence and justifies the investment |
| 5 | Evidence has weight; the absence of evidence is itself evidence |
| 6 | The highest-risk, highest-impact points are the highest-leverage points |
| 7 | The core failure is that blast radius does not propagate across air-gapped graphs |
| 8 | Gen AI makes connecting the evidence graphs affordable at scale |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
