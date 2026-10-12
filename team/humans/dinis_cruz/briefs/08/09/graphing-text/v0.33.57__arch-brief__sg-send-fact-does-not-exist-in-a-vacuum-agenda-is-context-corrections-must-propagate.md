# A Fact Does Not Exist In A Vacuum: Agenda Is Context Rather Than A Verdict, And Corrections Have To Propagate

**version** v0.33.57
**date** 9 August 2026
**from** Human (project lead)
**to** Engineering, Product, Strategy

**type** Architecture brief

*Third of 9 August. Extends the enrichment work into source modelling. Prior corpus positions are cited rather than restated. Offered to be built on and challenged.*

---

## What This Is

The attribution layer under every extracted claim, and the three things this adds to what the corpus already holds: **who said a thing is not one relationship but several, since the person who asserted it, the person vouching for it, whoever funded the work, where it was published and who is now citing it are all different and the last of those matters most, because distortion happens downstream of the author rather than at the source; modelling an agenda is the genuinely new capability here and the memo is right that it is not conspiracy theory, because every entity has objectives and bias is always present, but it carries a hazard worth naming, since a system that records motive can be used to dismiss inconvenient claims by their provenance, so the discipline has to be disclosure rather than dismissal and the recorded interest must inform weight without deciding truth; correctness over time is already in the corpus as a track record that decouples the weight a statement carries from the rank of the person making it, so what this memo adds is not the metric but the propagation, and propagation is where a graph does something a document cannot, because when a claim is superseded every conclusion resting on it can be found and flagged, which turns how much of what I believe rests on since-corrected claims into a query; that propagation should reuse the discipline already settled for amended legislation, where a superseded provision is marked from a date rather than deleted, so the chain remains readable and the question of what it used to say stays answerable; the quote that never meant what it is quoted for is a case the corpus grounded on 31 July, where a finding correctly reported at its origin was applied to a conclusion it did not support and the original author spent years unable to attach the correction to the claim, which is precisely the rabbit hole the memo wants followed; and the economics of that following are the honest constraint, since first research is a one-off cost and staying current is a recurring one, which is the same shape the corpus identified for regulatory mapping, where the amendment rather than the initial work is the business.** It is the third document of 9 August (cross-ref: the v0.33.57 enrichment brief, the v0.33.42 credibility calibration brief, the v0.33.54 paying-the-fact-creator brief, the v0.33.54 canonical-Act brief, and the v0.33.54 standards-as-a-service brief). New contributions: **the attribution roles separated with citers identified as the distortion point, agenda as context with disclosure rather than dismissal as the discipline, correction propagation named as the graph's real advantage, supersede-not-delete carried over from the amendment work, and maintenance identified as recurring rather than one-off.**

## The Claim Is Not The Whole Object

The memo's framing is the right starting point. The project lead: **"it's very important to also map who said what, and who is behind the fact, and who is vouching for the fact, but also what is the role of that person, what is the agenda, what is the motivation, what is the funding."** With the conclusion. The project lead: **"the fact doesn't exist in a vacuum."**

So a claim node is incomplete on its own. What surrounds it is not decoration; it is what a reader needs in order to decide how much weight to give it, and the corpus has already established that weights are how uncertainty stays visible.

## Separate The Roles

The memo's list conflates relationships that behave differently and should be distinct edges rather than one attribution field.

| Relationship | Question it answers | Why it differs |
|---|---|---|
| **Asserted by** | Who said it | The origin of the words |
| **Vouched for by** | Who stands behind it | A person can repeat without endorsing |
| **Funded by** | Who paid for the work | Often not the author, and often the interest |
| **Published by** | Where it appeared | Carries its own standards and incentives |
| **Cited by** | Who is now using it | **Where distortion happens** |

The memo names the first two explicitly and the distinction between them is real: repeating a claim is not endorsing it, and a graph that collapses the two will attribute beliefs to people who were reporting them.

**The last row is the one most systems omit and it matters most here.** The author of a claim is fixed; its citers accumulate, and each citation is an opportunity for the claim to drift from what it originally supported. That is the case the next section but one covers, and it is only visible if citers are modelled as first-class rather than as backlinks.

## Agenda Is Context, Not A Verdict

The genuinely new capability in this memo, and the one that needs the most care.

The memo pre-empts the obvious objection and does so correctly. The project lead: **"this is not necessarily conspiracy theories, it's just that every person has an agenda, every entity has core objectives, whether it's to sell more or provide certain things, the bias is always there."**

That is right, and recording it is legitimate. The hazard is what a reader, or a downstream system, does with it.

**A recorded motive can be used to dismiss a claim without engaging with it.** That is the ad hominem failure, and a system that makes provenance-based dismissal easy will produce a lot of it, particularly where the dismissal is convenient. The same tool that helps a reader discount a vendor's study of its own product helps them discount a regulator's finding about their own industry.

The discipline that solves this is well established outside this corpus and worth adopting explicitly: **disclosure rather than dismissal.** Academic publishing does not exclude authors with funding relationships; it requires them to be declared and lets the reader weigh them. The declared interest is context surrounding the claim, not a judgement on it.

Three design consequences follow.

**A declared interest attaches to the source, not to the claim.** The claim stands or falls on its own evidence; the interest tells a reader where to look harder.

**It informs weight, and does not set it.** The memo says this and it is the right position. The project lead: **"it's up to the individual or the graph that you have to apply more or less weight and more or less trust in specific sources, in specific individuals, in specific topics."** The system records; the reader decides; and per the refinement work of 6 August, the reader's weighting is itself recorded and improves over time.

**And the graph has an agenda too.** Whoever built it chose what to record, which sources to enrich, and which interests to note. Applying this lens to others while exempting ourselves would be exactly the failure the corpus warned about on 31 July, when it concluded that a register owned by a participant is not a register.

## Credibility Is Already Computed, And This Adds Propagation

The memo recalls prior work and the recollection is accurate. The project lead: **"if you even look at the past, we even mapped some examples in the past where we talked about being correct over time or consistency over time."**

The brief of 4 July established credibility as a track-record metric: what matters is not whether somebody is right on the day but how often they are right over time, since time resolves predictions and the record can then be checked. Critically, it **decouples the weight a statement carries from the volume, power or rank of whoever made it**, so that the quiet person who is usually right is heard and the loudest voice does not automatically win.

That is the metric, and this memo adds the thing the metric depends on but does not itself provide: **the corrections have to reach everything that relied on them.**

## Propagation Is What A Graph Can Do And A Document Cannot

The strongest argument in this memo for doing any of this as a graph.

The memo states the requirement. The project lead: **"it's okay when people get it wrong, but it's very important to make sure that if there's a correction, that takes into account, so we're not dealing with out-of-date information."**

In a document, a correction is a new document. Nothing that cited the original knows. In a graph, a correction is an edge, and every node downstream of the corrected claim is reachable:

```
   claim  <-- supported_by --  conclusion A
     |                    <--  conclusion B
     |                    <--  conclusion C
     |
   superseded_by
     v
   correction
        |
        +--> A, B and C are now FLAGGED, automatically,
             without anybody remembering they existed
```

Which makes a question answerable that is currently unanswerable anywhere: **how much of what I believe rests on claims that have since been corrected?** No document set can answer that. A graph answers it as a traversal.

That is worth stating as the headline capability rather than as a detail, because it is the difference between a knowledge base and a filing cabinet.

## Supersede, Do Not Delete

The mechanism should be borrowed rather than designed, because the corpus settled it for a structurally identical problem.

The regulatory work of 31 July established that a repealed provision stays in the graph, marked as repealed from a date, and is never removed, because deleting it destroys the audit trail and makes it impossible to answer what the provision used to say. The same brief established that a stable positional identifier survives amendment while the content identifier moves.

Applied here:

- A corrected claim is **marked superseded from a date**, not deleted.
- The correction is a node with its own attribution, its own evidence and its own agenda context.
- Anything citing the original still resolves, and now resolves to something that says it was superseded and by what.
- **What did we believe in March** remains answerable, which matters for anybody who acted on it.

That last property is not academic. A decision made on a claim that was later corrected was not a bad decision at the time, and a system that erases the earlier state makes past reasoning look worse than it was.

## The Quote That Never Meant That

The memo describes a specific failure and the corpus has both the case and the mechanism. The project lead: **"even quotes sometimes don't have the correct meaning, and the original author didn't actually mean what is now being quoted as reference."**

The brief of 31 July on paying the fact creator worked this exactly. A finding about deliberate practice, correctly reported at its origin, became a popular claim the original author spent the rest of his career disputing through books, articles and an open letter, **and none of it ever attached to the claim**, because there was no mechanism by which a correction could travel with the thing being corrected.

That brief also grounded the mechanism in the literature: an analysis of a single biomedical belief found a citation network of two hundred and forty-two papers carrying over two hundred thousand supporting paths, and identified the conversion of hypothesis into fact through citation alone, alongside **citation diversion**, meaning the citing of papers that say something relevant but not what the citer implies they say.

So the memo's rabbit hole is a real and studied phenomenon, and following it is the same operation as validating a use rather than validating a claim: **the question is not whether the source said something true, but whether this use of it is one the source supports.**

The practical implication for the graph: a citation edge should be typed by how faithfully it uses the source, not merely recorded. Supports, partially supports, extends beyond, and contradicts are different edges, and the difference is exactly what a rabbit hole discovers.

## Seek Disconfirmation Deliberately

The memo repeats yesterday's point and it is worth keeping. The project lead: **"I quite like the idea of having evidence that disproves it, or trying to find evidence that disproves it, don't take things at face value, follow it up, because confirmation bias is a massive issue."**

The corpus grounded this on 31 July: people accept confirming evidence at face value while subjecting disconfirming evidence to critical evaluation, and presenting both sides with the same body of evidence can drive them further apart rather than closer together.

Two design consequences. **Disconfirming evidence should be sought by default rather than on request**, because a step that has to be asked for will not be. And **a claim with no disconfirming search recorded is in a different state from one where the search was run and found nothing**, which is a distinction the graph can hold and a document cannot.

## Staying Current Is A Subscription

The memo raises the cost honestly and it is the constraint on all of the above. The project lead: **"it almost becomes an economic thing, on how much money you want to spend on the first research and then maintaining it and pruning it and make sure that it's up to date."**

This is the same shape the corpus identified on 31 July for regulatory mapping, where the conclusion was that a one-off mapping is a project and a moving instrument is a subscription, and that **the amendment rather than the initial work is the business model.**

Applied here: enriching a node once is a bounded cost. Keeping its sources current, noticing when one is superseded, and re-running a disconfirming search when the field moves is recurring. That has three consequences.

**Freshness is a property worth recording**, so a reader can see when a node was last checked rather than assuming.

**Access pricing can reflect it.** Yesterday's brief proposed that nodes record their production cost so access can be priced from it. Staleness belongs in the same calculation, since a node last verified two years ago is worth less than one verified last week.

**And re-verification can be selective.** Checking everything continuously is unaffordable. Checking what is heavily cited, recently disputed, or underpinning a current decision is not, which is the same adaptive approach the payments work took to reconciliation.

## Pruning Needs A Policy

The memo mentions it and it deserves one line of caution. The project lead: **"maintaining it and pruning it."**

Pruning is necessary because a graph that only accumulates becomes unusable. It is also in tension with the supersede-not-delete rule above.

The resolution is that they operate on different things. **Superseded claims are retained**, because the audit trail depends on them and they are small. **Enrichment that nobody has ever traversed** is a candidate for removal, because it is bulky and its absence is recoverable by re-running the enrichment. So the pruning policy should be based on use rather than on age, and it should never remove anything a correction chain depends on.

## What This Does Not Try To Be

- **Not a bias detector.** It records declared interests; it does not adjudicate whether somebody is biased.
- **Not grounds for dismissal.** Agenda informs weight and does not decide truth.
- **Not exempt.** The graph has an agenda too, and applying the lens outward only would repeat a failure the corpus has already named.
- **Not a delete operation.** Corrections supersede, and the earlier state stays answerable.
- **Not a one-off cost.** First research is bounded; staying current is recurring.

## Honest Tensions

| Tension | Note |
|---------|------|
| Recording agenda versus enabling dismissal | The same information that helps a reader discount a vendor study helps them discount an inconvenient regulator, and the interface decides which happens |
| Disclosure as the discipline | It is the right norm and it depends on the reader actually weighing rather than filtering, which is not how most people use such a signal |
| Our own agenda | Applying the lens to sources while exempting the graph would repeat a failure this corpus has already named once |
| Propagation versus noise | Flagging everything downstream of a correction is correct and will flag a great deal, most of it unaffected in substance |
| Supersede versus prune | Retention is required for the audit trail and unbounded growth is unusable, so the policy has to distinguish them carefully |
| Maintenance economics | Freshness is what makes a node valuable and what makes it expensive, and nothing yet says who pays for the second year |

## Open Questions

| Question | Notes |
|----------|-------|
| How is a declared interest represented? | Structured enough to query, free enough to describe an unusual arrangement |
| How is a citation edge typed? | Supports, partially supports, extends beyond, contradicts, and who decides |
| What does a propagated flag actually do? | Notify, mark, or block, and the answer probably differs by how far downstream it is |
| How is credibility computed here? | The 4 July metric applied to sources rather than to deciders, and over what window |
| What triggers re-verification? | Citation volume, dispute, or dependence on a live decision, rather than age alone |
| Who pays for staying current? | The first reader paid for the research, and nothing yet says who funds year two |
| What is the pruning rule? | Use rather than age, and never anything a correction chain depends on |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 9 Aug | `v0.33.57__arch-brief__sg-send-enrichment-and-shared-anchors-research-paid-once-wikidata-is-the-concept-layer.md` | The enrichment this attributes, and the node-cost model that staleness extends |
| 4 Jul | `v0.33.42__arch-brief__sg-send-credibility-calibration-time-learning-track-record-feedback-loop-decouple-from-power.md` | Credibility as track record, decoupled from rank, which this supplies the propagation for |
| 31 Jul | `v0.33.54__strategy-brief__sg-send-paying-the-fact-creator-contextual-validation-not-truth-micropayments-for-correct-use.md` | The quote that never meant that, the citation distortion mechanisms, and validating a use rather than a claim |
| 31 Jul | `v0.33.54__arch-brief__sg-send-canonical-ai-act-paragraph-as-file-amendment-as-native-graph-operation-view-from-any-provision.md` | Supersede rather than delete, and keeping the earlier state answerable |
| 31 Jul | `v0.33.54__strategy-brief__sg-send-standards-as-a-service-open-artefact-consortium-funding-amendment-is-the-business-model.md` | The amendment rather than the initial work as the recurring business |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | A claim node is incomplete without its surrounding attribution, and the memo is right that it does not exist in a vacuum |
| 2 | Asserted, vouched for, funded, published and cited are different relationships and should be different edges |
| 3 | Citers matter most, because distortion happens downstream of the author rather than at the source |
| 4 | Recording agenda is legitimate and every entity has objectives, so this is not conspiracy theory |
| 5 | The hazard is provenance-based dismissal, so the discipline must be disclosure rather than dismissal |
| 6 | A declared interest attaches to the source, informs weight, and never decides truth |
| 7 | The graph has an agenda too, and exempting it would repeat a failure the corpus already named |
| 8 | Credibility as track record decoupled from rank already exists in the corpus from 4 July |
| 9 | What this adds is propagation, which is the thing a graph does that a document cannot |
| 10 | Corrections supersede from a date rather than delete, reusing the amendment discipline, so what we believed in March stays answerable |
| 11 | Citation edges should be typed by faithfulness, since supports and extends beyond are different relationships |
| 12 | First research is bounded and staying current is recurring, so freshness is a recorded property and a pricing input |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
