# The Grounding Ladder: One Node Type Formula for Fact, Evidence, Measure, Vulnerability, and Risk

**version** v0.33.36
**date** 28 June 2026
**from** Ontologist
**to** Architect, @Dev, Product, Strategy
**type** Arch brief (semantic graph)

*Revised to apply the Node Type Formula mechanism and the ontologies-of-ontologies model: the ladder is now framed as one formula among possible others, Measure is no longer the floor, and legitimacy is bidirectional.*

---

## What This Is

The grounding ladder, restated as one Node Type Formula rather than the definition: **this formula classifies the nodes of this particular risk ontology by their required upward and downward paths, where downward is grounding, is it real, and upward is implication, what it is and why it matters; a Risk is a node with a downward path to a Vulnerability and an upward path toward a top risk; a Vulnerability is a Fact with an upward path to a Risk; a Fact has a downward path to Evidence; Evidence has a downward path to a Measure; and a Measure is not the floor but is grounded further in the node it observes, most likely a digital twin, and through it in reality, so the true floor is the last node where going deeper would neither improve observability nor change a decision; legitimacy is bidirectional, grounding from below and classification from above; and because this is one formula among possible others, a CISO's, a CFO's, a regulator's, it is meant to coexist with and bridge to them, not to stand as the single definition.** It is an instance of the mechanism set out in the companion briefs (cross-ref: the v0.33.36 node-type-formulas and ontologies-of-ontologies briefs, the v0.33.35 directed-edges and digital-twins briefs). New contributions in this revision: **the formula framing, the Measure-is-not-the-floor correction, bidirectional legitimacy, and the Twin and Reality grounding.**

## This Is One Node Type Formula

Per the node-type-formulas brief, a node's type is defined by its required path-pattern, not by a sentence about its content, and classification is computed as a path query rather than decided by a person. This document defines one such formula, the grounding-and-implication formula for this risk ontology. It is not the only possible definition: another party could require different paths and reach a different classification of the same node. Those formulas are meant to coexist and to be connected at declared points through bridges, as the ontologies-of-ontologies brief describes. So the ladder below is a worked example of the mechanism, not the mechanism itself.

## The Formula, as Paths

- `Risk := a downward path to a Vulnerability AND an upward path toward a top risk.`
- `Vulnerability := a Fact (grounded below) AND an upward path to a Risk.`
- `Fact := a downward path to Evidence.`
- `Evidence := a downward path to a Measure.`
- `Measure := an observation of the node it measures, grounded on a Twin.`
- `Twin := a representation grounded in its connection to Reality.`

## The Ladder, Rendered

```
   TOP RISK on the company risk register          ^  UPWARD = implication / classification
        |                                             (what is it, and why does it matter? judgment)
      RISK            down to a Vulnerability, else an opinion; up toward a top risk
        |  arises_from (down)   /   gives_rise_to (up)
   VULNERABILITY      a Fact that ALSO has an up-path to a Risk, else just a Fact
        |  backed_by (down)
      FACT            down to Evidence, else an assertion
        |  backed_by (down)
    EVIDENCE          down to a Measure, else an unmeasured claim
        |  measured_by (down)
     MEASURE          an observation OF a node; NOT the floor
        |  observed_on (down)
       TWIN           the representation that backs the measure
        |  connected_to (down)
     REALITY          the real-world thing the twin tracks
        v  DOWNWARD = grounding (is it real?), more objective with depth

   FLOOR = the last node where going deeper would neither improve observability nor change a decision
```

## Two Directions, Two Jobs

Legitimacy runs both ways, and the earlier framing that it was only downward was too strong. The two directions do different work. Downward is grounding: is this real, does it reach a measure, a twin, and ultimately reality? Upward is classification and implication: what is this node, and why does it matter? A Fact becomes a Vulnerability purely because of its upward link to a Risk, so that legitimacy is conferred entirely from above. This maps onto the facts, hypotheses, and opinions vocabulary:

| Paths present | The node is | Why |
|---|---|---|
| Upward only, implication without grounding | Hypothesis | It means something but is not yet shown to be real |
| Downward only, grounded without implication | Fact on the shelf | It is real but has no established why-it-matters |
| Both directions present | Vulnerability, or a grounded Risk | Real and consequential |

A node is fully legitimate when the paths its formula requires are present, which for most rungs means both a grounding path below and an implication path above.

## Measure Is Not the Floor

A measure is a measurement of something, and that something is the node that connects it to reality, most often a digital twin. So the chain does not stop at the measure; it continues down through the twin to the real-world thing the twin tracks. This is consistent with the digital-twins work, where how connected a twin is to reality is itself a measurable property, and it introduces a useful recursion: the trust we place in a measure depends on the twin's connectedness to reality, and that connectedness is itself a measure. Grounding therefore does not bottom out in a value; it bottoms out in a representation that touches the real world.

## What the Floor Actually Is

The floor is not a fixed node type but a stopping condition, and to stay usable it must be objective rather than a matter of taste. The test has two parts: the floor is the last node where going deeper would neither improve observability nor change a decision. If the next node down is unobservable or decision-irrelevant, stop. This keeps the floor pragmatic and contextual, since different analyses bottom out at different depths, while still being a checkable test rather than a judgment call. It is one of the two places, with the fact-to-risk boundary, where subjectivity can leak back into an otherwise computable formula, which is exactly why it is pinned to a test.

## The Definitions

**Reality.** The real-world thing being reasoned about. It is what every grounding path is ultimately trying to reach.

**Twin.** A representation of a real-world thing, grounded in its connection to reality, which is measurable. A measure is taken on a twin.

**Measure.** An observation of a node, grounded on the twin it observes. A measure can be a documented zero, because not knowing is a fact: zero restore records found is as much a measure as any positive count.

**Evidence.** Something that supports or challenges a claim, grounded by a downward path to a measure. Without it, an unmeasured claim.

**Fact.** A node carrying the burden of evidence, grounded by a downward path to evidence. Without it, an assertion.

**Vulnerability.** A Fact that also has an upward path to a Risk, and through it toward a top risk on the register. Defined by both links, grounding below and implication above. Without the upward link it is just a Fact; promoting a fact is drawing that upward edge.

**Risk.** A judgment about impact and what to do, with a downward path to a vulnerability and an upward path toward a top risk. Without the vulnerability beneath it, just an opinion.

## The Fuzzy Boundary: Fact to Risk

The move from fact to risk is the move from the evidenced to the judged. While a node carries an evidential burden and is checkable, it is a fact or a vulnerability; the moment it becomes a weighing of options, impact, or a situation, it has crossed into risk. This is the facts-versus-opinions line, and an opinion is a risk-claim with no grounding chain beneath it. As above, this boundary is a place subjectivity re-enters, so this formula's choice of where the line sits is a visible, arguable part of the formula rather than a hidden assumption.

## The Fractal: Vulnerabilities Linking to Vulnerabilities

The ladder is fractal. A vulnerability can link up to another vulnerability, each an evidenced fact in its own right, before the chain reaches a risk. This is the five-whys going down rendered as structure: every why is another grounded rung, and you climb through evidenced facts until you reach the node that is no longer a fact but a judgment.

## Type Is Set by Edges: Classification as a Query

Because this is a Node Type Formula, classification is run as a path query, not stored as a label. A fact and a vulnerability can have identical content; what makes one a vulnerability is the upward edge to a risk. Classification is therefore dynamic and path-relative: a fact is a candidate vulnerability until the risk link is drawn, is promoted when it is, and is demoted if that risk path is later struck off. Promotion and demotion are the cascade working in both directions.

## This Formula's Visible Bias

This formula is not objective truth, and it does not pretend to be. It encodes choices: that a vulnerability requires an upward link to a top risk, that a fact must reach evidence, where the floor test sits, and where fact tips into risk. Those are this formula's judgments, and the point of writing them as a formula is that they are now visible, versioned, and arguable rather than hidden in a classifier's head. Another party's formula could choose differently, and the two would be connected at declared points through bridges, not merged into one.

## What This Adds to the Ontology

- New node classes: **Twin** and **Reality** below Measure, and Measure reframed as an observation rather than the floor.
- New edges: **measured_by** (Evidence to Measure), **observed_on** (Measure to Twin), **connected_to** (Twin to Reality).
- Bidirectional legitimacy: grounding paths downward, classification paths upward.
- The floor restated as an objective stopping test, not a node type.
- The whole ladder reframed as one Node Type Formula among possible others.

## A Worked Example

Take the untested restore. Reality is the real backup system. The twin is its digital twin, whose connectedness to reality is itself measurable. The measure is that zero tested-restore records exist, observed on that twin. The evidence is the backup and restore logs, grounded by that measure. The fact is that restores have never been tested, grounded by that evidence. It becomes a vulnerability the moment it links up to a risk, that the company may be unable to recover from a compromise, and that risk grounds down to this vulnerability rather than floating as an opinion, while climbing up toward a top risk on the register. Going deeper than the real backup system would neither improve observability nor change the decision, so that is the floor for this analysis.

## What This Does Not Try To Be

- **Not the single definition.** It is one Node Type Formula among possible others.
- **Not objective truth.** It carries visible, arguable bias by design.
- **Not bottomed-out at a measure.** Grounding continues to a twin and to reality.
- **Not a fixed floor.** The floor is a checkable stopping test, contextual to the analysis.

## Honest Tensions

| Tension | Note |
|---------|------|
| Pragmatic floor versus objectivity | The two-part floor test is checkable but still applied in a context |
| Fact-to-risk line | Sharp in principle, the burden of evidence, but judgment is needed at the margin |
| Grounding to reality | Demanding a twin and reality under every measure is strict but is the discipline of reality |
| One formula among many | This formula's choices are contestable; bridges, not merges, reconcile them |

## Open Questions

| Question | Notes |
|----------|-------|
| How is the floor test executed in tooling? | Operationalising would-deeper-improve-observability-or-change-a-decision |
| How is a Twin's connectedness measured? | The recursive measure that grounds trust in a measure |
| When are the other briefs reconciled? | The deferred update to the semantic-graph and five-whys briefs |
| Which other Node Type Formulas do we need? | The CISO, CFO, and regulator formulas to bridge with |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 28 Jun | `v0.33.36__arch-brief__sg-send-node-type-formulas-classification-as-testable-path-pattern-not-judgment.md` | The mechanism this is an instance of |
| 28 Jun | `v0.33.36__arch-brief__sg-send-ontologies-of-ontologies-three-layers-formulas-bridges-multiple-definitions.md` | Why this is one formula among many, connected by bridges |
| 26 Jun | `v0.33.35__arch-brief__sg-send-digital-twins-twin-of-anything-dimensions-discipline-of-reality-simulation-testing.md` | The twin and reality grounding below the measure |
| 26 Jun | `v0.33.35__arch-brief__sg-send-2fa-use-case-semantic-graph-ontology-nodes-edges-instance.md` | The meta-model this formula classifies over; to be reconciled later |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | The grounding ladder is one Node Type Formula, not the definition |
| 2 | Downward paths confer grounding; upward paths confer classification and implication |
| 3 | Legitimacy is bidirectional, not downward only |
| 4 | A Risk grounds down to a Vulnerability and points up toward a top risk |
| 5 | A Vulnerability is a Fact with an upward path to a Risk |
| 6 | A Measure is not the floor; it is an observation grounded on a Twin and Reality |
| 7 | The floor is the last node where deeper neither improves observability nor changes a decision |
| 8 | Trust in a measure depends on the twin's connectedness to reality, itself a measure |
| 9 | Classification is a dynamic path query; promotion and demotion are edge events |
| 10 | This formula carries visible, arguable bias and bridges to other formulas, never merges |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
