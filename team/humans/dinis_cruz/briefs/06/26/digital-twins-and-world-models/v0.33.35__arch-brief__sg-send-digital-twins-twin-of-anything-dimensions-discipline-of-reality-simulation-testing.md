# Digital Twins of Anything, and the Discipline of Reality

**version** v0.33.35
**date** 26 June 2026
**from** Human (project lead)
**to** Architect, @Dev, Product, Strategy
**type** Arch brief

---

## What This Is

The digital-twin idea expanded into its dimensions and its discipline: **a digital twin can be made of anything, an organisation, a system, an inbox, a person, a behaviour, an event, an action, an external factor such as weather, even luck, because a twin is at heart a system with properties, behaviours, functions, and inputs and outputs, and even non-determinism and randomness can be modelled; twins are how the graph captures reality, and because the model carries meaning through connectivity rather than through properties, every edge, peak, and endpoint of the graph continues into a twin and then, ideally, into reality, where whether it reaches reality is itself a measurable fact, connected or not; twins also turn risk into something you can simulate and test, with unit tests, integration tests, simulations, plans, static analysis, visualisations, and rules, the same techniques used for software; and the discipline that makes this different from ordinary threat modelling is that everything must be real, a fact that exists, so the graph never fills with potential, out-of-context risks that become pollution, you either have evidence or you do not; the practical path is to start with one simple mapping and watch it grow, because even a single use case becomes large once every element is captured.** It pairs with the integration-layer brief, and the worked 2FA example is its companion document (cross-ref: the v0.33.35 digital-twins integration-layer and risk-register briefs). New contributions: **the twin of anything, the twin as the graph's endpoint, and the discipline of reality.**

## The Framing and the Two Documents

This expands the digital-twin idea, and it splits naturally into two documents: this one, which captures the model, where and to what a digital twin can be applied across an organisation; and a separate companion, which works through the two-factor-authentication example in detail, because the value of the model is only clear once you watch a real example grow.

## A Twin of Anything

The first realisation is how general a twin is. The project lead: **"we can make a digital twin out of anything, an organisation, an element, a mail system, an inbox, a person, a behaviour, an event, an action, external factors like weather, even luck."** This is possible because a twin is a simple thing underneath. The project lead: **"a digital twin is, in essence, a system that has properties, behaviours, functions, and inputs and outputs, and we can define all of those."** And the real world's messiness is not an obstacle: **"the fact that in the real world they are not deterministic, or maybe random, we can capture that."** So uncertainty and randomness become things the twin models, rather than things that defeat it.

## Twins Capture Reality, and We Focus on What Exists

Twins are, in this angle, a way to capture reality, and that fits the initial focus exactly. Risk Mandate.ai concerns itself with the mandates that have actually been given, not the entire abstract risk register, so the model is anchored to what exists. Capturing reality, not possibility, is the whole point.

## The Twin Is the Endpoint of the Graph

This is where the twin connects to how the graph works. The project lead: **"in our graph we do not use properties, because properties do not have meaning, they are just words; we capture meaning through connectivity."** Given that, the twin has a precise role: **"the power of the twin is that we always arrive at the twin, so the edges and the peaks and the endpoints of the graph continue into the twin, and then ideally into reality."** Every place the graph would otherwise stop is a twin, and the twin is the doorway from the model to the real system.

## Connectedness Is a Measurable Fact

Whether that doorway actually reaches reality is not a vague aspiration; it is measurable. The project lead: **"whether we can continue to reality is a measurable fact, it is connected or it is not."** In some cases it cannot be connected, because reality offers no touchpoint, no API, no connector, or simply because the work has not been done yet. Either way the state is known and recorded, which is the same honest air-gap discipline the register uses.

## Twins Make Risk Testable

Because a twin is a defined system with inputs and outputs, risk becomes something you can engineer against. The project lead: **"these also let us simulate, write unit tests, integration tests, simulations, plans, and analysis, use static analysis and visualisations and rules, the same techniques we use with software."** The techniques that mature software engineering brings to code, static analysis, test suites, simulation, can now be turned on an organisation's risk, because the twin gives them something concrete to run against.

## The Discipline of Reality

This is the heart of the brief, and the thing that separates it from ordinary threat modelling. Threat modelling tends to accumulate many speculative risks that are out of context and never materialise, and those become noise. The project lead's rule removes that: **"in this model, everything has to be relevant, everything has to be a fact, everything has to exist, because it is based on reality. It forces the discipline, either we have evidence and it exists, or we do not."** There are no it-would-be-good-if risks and no hypothetical persons or systems. The graph stays clean because everything in it is real, and that constraint is the source of its power rather than a limitation on it.

## Start Small, and Watch It Grow

The practical path is modest at the start. The project lead: **"start with one simple mapping and see how big it gets, because even one specific use case can become massive once you capture all the elements."** A single vulnerability, fully mapped through its systems, assets, owners, and the people and teams around it, becomes a large graph on its own. The bigger the graph, the more powerful, but a single focused use case already delivers value, which is exactly how Risk Mandate.ai can ship very focused first versions and workflows.

## What This Asks For

1. Model anything relevant as a twin, with properties, behaviours, functions, and inputs and outputs.
2. Allow non-deterministic and random behaviour to be captured.
3. Make every graph endpoint a twin, and continue into reality where possible.
4. Record, for each twin, whether it is connected to reality, as a measurable fact.
5. Support simulation and testing against twins, as for software.
6. Enforce the discipline that everything in the graph is a real, existing fact.
7. Begin with one simple mapping and let it grow into a focused first version.
8. Produce the companion document working the 2FA example end to end.

## What This Does Not Try To Be

- **Not limited in scope.** Anything relevant can be a twin.
- **Not properties-led.** Meaning comes from connectivity, and the twin is the endpoint.
- **Not speculative.** Everything must be a real, existing fact, never a hypothetical.
- **Not the example.** The 2FA worked example is the companion document.

## Honest Tensions

**Tension 1: a twin of anything can sprawl.** The generality invites scope creep. Mitigation: the discipline of reality, only real, existing things enter the graph.

**Tension 2: modelling randomness is hard.** Capturing non-determinism faithfully is non-trivial. Mitigation: start with the simple, deterministic cases and add uncertainty where it earns its place.

**Tension 3: simulation can outrun the data.** Tests and simulations are only as good as how connected the twins are. Mitigation: treat low connectedness as a tracked gap, not a hidden assumption.

## Open Questions

| Question | Notes |
|----------|-------|
| What is the minimal twin schema? | Properties, behaviours, functions, inputs, outputs |
| How is randomness represented in a twin? | Modelling non-deterministic behaviour |
| Which software techniques transfer first? | Static analysis, tests, simulation |
| How is the one-mapping starting point chosen? | The first focused use case |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 26 Jun | `v0.33.35__arch-brief__sg-send-digital-twins-integration-layer-real-world-tracked-air-gaps-agent-twin.md` | The integration layer this model sits inside |
| 26 Jun | `v0.33.35__arch-brief__sg-send-risk-register-graph-of-graphs-facts-only-no-deny-cascade-cia-blast-radius.md` | The register the twins capture reality for |
| 26 Jun | `v0.33.35__strategy-brief__five-whys-as-a-domain-translator-natural-peaks-root-cause-stories.md` | The connectivity that gives the graph meaning |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | A digital twin can be made of anything: a system, a person, a behaviour, an event, even luck |
| 2 | A twin is a system with properties, behaviours, functions, and inputs and outputs |
| 3 | Non-determinism and randomness can be modelled in a twin |
| 4 | Twins capture reality, which fits the focus on what exists |
| 5 | Meaning comes from connectivity, and every graph endpoint continues into a twin |
| 6 | Whether a twin reaches reality is a measurable fact, connected or not |
| 7 | Twins make risk testable with the techniques of software engineering |
| 8 | Everything in the graph must be a real, existing fact, which avoids pollution |
| 9 | Start with one simple mapping; even a single use case grows large |
| 10 | The 2FA worked example is the companion document |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
