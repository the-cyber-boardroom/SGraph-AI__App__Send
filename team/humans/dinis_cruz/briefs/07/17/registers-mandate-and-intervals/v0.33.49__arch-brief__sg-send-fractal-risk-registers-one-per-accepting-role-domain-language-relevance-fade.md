# Fractal Risk Registers: One Per Accepting Role, In Their Language, Lit All The Way To The Board

**version** v0.33.49
**date** 17 July 2026
**from** Human (project lead)
**to** Architect, Product, Strategy

**type** Arch brief (semantic graph)

*First of three from one memo. Companions: the risk-mandate brief and the acceptance-interval brief, both 17 July.*

---

## What This Is

The property that registers are fractal, and the visualisation it makes possible: **the risk register is not one artifact at the top of a company, it is fractal and nested exactly like the semantic graphs beneath it, because wherever there is a stakeholder who accepts a risk there must be a register, since a register is how we know what risks that entity actually holds, which means a register belongs to every accepting entity, an individual role, a department, and the company, and a person's register is simply all the risks that bubble up to them; from that follows the observation that an individual does not have one register but several, at least two and often three the further down the organisation you sit, the first being a role-specific register written in the language, culture, and domain the person actually works in, and the others being the registers above, the next hop, and the next, converging through the five whys onto the board's register, which is one convergence point today and need not be the only one in future; the visualisation this enables is the interesting part, because if you centre the view on a role, that role sees its own register lit in full, everything relevant to it, and then as the view climbs, the registers above fade except for the entries that trace back down to this role, so the graph itself points at which parts of the board's register this person is feeding, which turns the whole structure into an education mechanism, since a database administrator can see that their local risk of an agent holding unrestricted access to a customer table is the same object as the board's exposure to regulatory penalty, loss of licence, and continuity failure, and seeing that once teaches more than any training; and the practical consequence is that anybody in an organisation can be handed a register of their own, which is the precondition for the risk mandate the companion brief describes.** It is the first brief of 17 July (cross-ref: the v0.33.48 fractal-semantic-graphs brief, the v0.33.47 customer-database brief, the v0.33.46 risk-to-an-exec brief, and the v0.33.35 no-deny register brief). New contributions: **the register as a fractal structure with one per accepting entity, the role-specific register in the role's own language plus the derived views of the registers above, the relevance fade as the visualisation, and the register as the education mechanism that connects a local fact to a board duty.**

## Every Accepting Entity Needs A Register

The rule is simple and it generates the whole structure. The project lead: **"every layer where there is a stakeholder, where there is somebody accepting a risk, that entity needs a risk register, because that is how we know what risks that person has."** A register is not a management artifact that happens to live at the top of a company; it is the answer to the question of what a given entity is carrying, so it exists wherever something is carried. That means registers for the company, for departments, and for individual roles. The project lead: **"the multi-layered kind of fractal risk registers for companies, for individuals, for departments."** And the content of a personal register is not curated, it is derived. The project lead: **"for a particular person, show what the risk register looks like, and fundamentally the risk register is all the risks that bubble up to that person."**

## Fractal, In The Same Sense As The Graphs

This is the same self-similarity the architecture already runs on. One grammar of facts, evidence, vulnerabilities, risks, owners, and acceptances describes a register at every altitude, so the same validators, the same query engine, and the same visualisation work whether you are looking at one role or at the board, and a register composes into the register above it without a new format. Zoom in on any node in a company's register and it expands into the register of the role that owns it, obeying identical rules. The registers are graphs of graphs like everything else, which is why nothing new has to be invented to support them.

```
   ORGANISATION
     +-- BOARD register
           +-- CEO register
                 +-- CFO register
                 |     +-- Finance department register
                 |           +-- Controller register
                 +-- CISO register
                       +-- AppSec department register
                             +-- Database administrator register   <- mine

   same grammar, same validators, same query engine, at every altitude
```

## Two Registers, Or Three: The Role's Own, And The Ones Above

The claim that surprises people is that a person has more than one register. The project lead: **"you have multiple risk registers per individual, at least two, could be one, but especially the further down you go, the more you have two, if not three."** The first is written in the person's own world. The project lead: **"you should have a risk register that captures the risks in the language and culture and domain of that individual, so this is a role-specific risk register."** The rest are the registers above, reached by the same translation the corpus already uses. The project lead: **"as we follow the five whys, you start to converge into the board level risk register, which actually there could be others in the future."** So a person three or four levels down needs both halves. The project lead: **"that person needs to understand what is the risk register in the domain that he understands, but also how does that translate into its boss's or the next hop register, and then the next one, and then the next one over to the board."**

Worth being precise about the mechanics: only the role's own register is an artifact. The second and third are derived views of the registers above, filtered by relevance to this role, computed rather than stored, which is what keeps the structure from multiplying into a maintenance problem.

```
   ROLE: database administrator
     +-- (1) MY REGISTER, my language
     |        "an agent holds read and write on the customer table,
     |         whole-table, injectable, no circuit breaker"
     |              |  five whys
     |              v
     +-- (2) NEXT-HOP VIEW, my boss's register, filtered to me
     |        "a compromise of the entire customer base is reachable
     |         from an automation we deployed"
     |              |  five whys
     |              v
     +-- (3) BOARD VIEW, filtered to me
              "regulatory penalty, loss of licence, continuity failure,
               and the duty of oversight that carries them"
```

## The Relevance Fade

The visualisation is the part that makes this land. The project lead: **"if you take the risk register of the individual, then he sees everything that is relevant to that individual, in fact for that role, not individual, role, because the role is connected to an individual."** Note the correction, which matters for the model: the register belongs to the role, and the role is connected to a person, which is what lets an incoming leader inherit a book rather than a stack of someone's opinions. Then the view climbs. The project lead: **"as you go up, imagine the colours can fade away for the next registers for the bits that are not relevant, so the graph starts to point which parts of the risk register above are relevant to this individual, so that he understands the picture."**

```
   BOARD REGISTER      [ ] [ ] [X] [ ] [ ]     one entry lit: the duty my risk feeds
        ^
   CEO REGISTER        [ ] [X] [ ] [ ]         one entry lit
        ^
   CFO REGISTER        [ ] [ ] [X] [ ]         one entry lit
        ^
   CISO REGISTER       [X] [ ] [X] [ ] [ ]     two entries lit
        ^
   MY REGISTER         [X] [X] [X] [X]         all lit: my whole domain
   (database admin)

   [X] lit = traces to me      [ ] faded = not mine to carry
```

## Why This Teaches

The fade is not decoration; it is the education mechanism, and it works because it shows the same object from two altitudes rather than making two claims that must be believed. The project lead: **"this is also a great way to bring education and understanding of saying, ah, hold on, so my risk here of data being compromised, or an agent having unrestricted access to this database, actually leads to unlimited exposure for financial regulation, loss of licence, dramatic compromise of database, continuity problems, those big hairy risks at exec level."** A person who has seen their own configuration light up a board duty does not need to be told the work matters, and an executive who has walked the same path downward does not need to be told the technical detail is real. The five whys stop being a document and become a path you can follow with your eyes.

## The Semantic Graph

One role, its register, and the chain above it, with the relevance projection that produces the fade.

```json
{
  "nodes": [
    {"id": "person-a",    "type": "Individual",         "label": "the person currently holding the role"},
    {"id": "role-dba",    "type": "Role",               "label": "database administrator"},
    {"id": "role-ciso",   "type": "Role",               "label": "CISO"},
    {"id": "role-cfo",    "type": "Role",               "label": "CFO"},
    {"id": "role-ceo",    "type": "Role",               "label": "CEO"},
    {"id": "role-board",  "type": "Role",               "label": "board, risk or audit committee"},
    {"id": "reg-dba",     "type": "Register",           "label": "the DBA's register, in the DBA's language"},
    {"id": "reg-ciso",    "type": "Register",           "label": "the CISO's register"},
    {"id": "reg-cfo",     "type": "Register",           "label": "the CFO's register"},
    {"id": "reg-ceo",     "type": "Register",           "label": "the CEO's register"},
    {"id": "reg-board",   "type": "Register",           "label": "the board's register"},
    {"id": "risk-dba",    "type": "Risk",               "label": "agent holds whole-table read and write, injectable"},
    {"id": "risk-ciso",   "type": "Risk",               "label": "the entire customer base is reachable from one automation"},
    {"id": "risk-cfo",    "type": "Risk",               "label": "fines, churn, remediation, and lost revenue"},
    {"id": "risk-ceo",    "type": "Risk",               "label": "enterprise aggregate: customers, operations, trust"},
    {"id": "risk-board",  "type": "Risk",               "label": "oversight, regulatory penalty, loss of licence, continuity"},
    {"id": "acc-dba",     "type": "AcceptanceDecision", "label": "accepted at this altitude, for an interval"},
    {"id": "view-up",     "type": "View",               "label": "derived view of the registers above, filtered to this role"}
  ],
  "edges": [
    {"source": "person-a",   "type": "holds_role",    "target": "role-dba"},
    {"source": "role-dba",   "type": "has_register",  "target": "reg-dba"},
    {"source": "role-ciso",  "type": "has_register",  "target": "reg-ciso"},
    {"source": "role-cfo",   "type": "has_register",  "target": "reg-cfo"},
    {"source": "role-ceo",   "type": "has_register",  "target": "reg-ceo"},
    {"source": "role-board", "type": "has_register",  "target": "reg-board"},
    {"source": "reg-dba",    "type": "contains",      "target": "risk-dba"},
    {"source": "reg-ciso",   "type": "contains",      "target": "risk-ciso"},
    {"source": "reg-cfo",    "type": "contains",      "target": "risk-cfo"},
    {"source": "reg-ceo",    "type": "contains",      "target": "risk-ceo"},
    {"source": "reg-board",  "type": "contains",      "target": "risk-board"},
    {"source": "risk-dba",   "type": "owned_by",      "target": "role-dba"},
    {"source": "risk-ciso",  "type": "owned_by",      "target": "role-ciso"},
    {"source": "risk-cfo",   "type": "owned_by",      "target": "role-cfo"},
    {"source": "risk-ceo",   "type": "owned_by",      "target": "role-ceo"},
    {"source": "risk-board", "type": "owned_by",      "target": "role-board"},
    {"source": "risk-dba",   "type": "translates_to", "target": "risk-ciso"},
    {"source": "risk-ciso",  "type": "translates_to", "target": "risk-cfo"},
    {"source": "risk-cfo",   "type": "translates_to", "target": "risk-ceo"},
    {"source": "risk-ceo",   "type": "translates_to", "target": "risk-board"},
    {"source": "risk-dba",   "type": "accepted_by",   "target": "acc-dba"},
    {"source": "acc-dba",    "type": "owned_by",      "target": "role-dba"},
    {"source": "risk-ciso",  "type": "relevant_to",   "target": "role-dba"},
    {"source": "risk-cfo",   "type": "relevant_to",   "target": "role-dba"},
    {"source": "risk-ceo",   "type": "relevant_to",   "target": "role-dba"},
    {"source": "risk-board", "type": "relevant_to",   "target": "role-dba"},
    {"source": "view-up",    "type": "derived_from",  "target": "reg-ciso"},
    {"source": "view-up",    "type": "derived_from",  "target": "reg-cfo"},
    {"source": "view-up",    "type": "derived_from",  "target": "reg-ceo"},
    {"source": "view-up",    "type": "derived_from",  "target": "reg-board"},
    {"source": "role-dba",   "type": "sees",          "target": "view-up"}
  ]
}
```

Read the fractal property: every role has a register, and every register contains risks owned at that altitude, with the identical grammar throughout. Read the translation: `risk-dba` translates to `risk-ciso` and onward to `risk-board`, which is the five whys as edges rather than prose. Read the fade: the `relevant_to` edges are what stay lit when the view climbs, and everything without one greys out. Read the economy: only `reg-dba` is the role's own artifact, while `view-up` is `derived_from` the registers above rather than stored. The edges `holds_role`, `has_register`, `contains`, `translates_to`, `relevant_to`, `derived_from`, and `sees`, and the `Register`, `Role`, `Individual`, and `View` node types, are proposed additions to the grammar.

## What This Unlocks

The consequence is the one the companion brief builds on. The project lead: **"anybody in an organisation, we can give them a risk register."** Once a register exists per accepting role, derived rather than curated, every person in a company can be handed the thing that says what they are carrying, in their own language, with a lit path to the board. That is a product rather than a report, and the next brief argues that what we are actually handing them is better named a risk mandate.

## What This Does Not Try To Be

- **Not one register per company.** A register exists wherever something is accepted, which is at every altitude.
- **Not three artifacts per person.** Only the role's own register is stored; the views above are derived by relevance.
- **Not a register per individual.** The register belongs to the role, and the role is connected to a person.
- **Not a new structure.** It is the same fractal grammar the semantic graphs already use.

## Honest Tensions

| Tension | Note |
|---------|------|
| A register per role versus maintenance | Derivation keeps it affordable, but the relevance computation has to be right or the fade misleads |
| The role's language versus one truth | Restating a risk in each domain's language aids ownership and risks drift between the statements |
| Fade as clarity versus fade as blindness | Greying out what is not yours helps focus and can hide something a person should have seen |
| The board as the convergence point | Today everything converges on the board; other convergence points may be needed later |

## Open Questions

| Question | Notes |
|----------|-------|
| How is relevance computed for the fade? | The traversal that decides which entries above stay lit for a given role |
| How is one risk kept consistent across languages? | Preventing drift between the domain statement and its translations |
| What happens when a role has two bosses? | Convergence when the chain is a lattice rather than a tree |
| Are there convergence points other than the board? | Regulators, insurers, or customers as alternative tops |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 12 Jul | `v0.33.48__arch-brief__sg-send-fractal-semantic-graphs-agentic-operating-layer-deterministic-sovereign-open-source.md` | The same fractal grammar, here applied to the register itself |
| 9 Jul | `v0.33.47__strategy-brief__sg-send-customer-database-read-write-agent-facts-vulnerabilities-risks-business-board-acceptance.md` | The worked chain from a database fact to a board duty, drawn as trees |
| 7 Jul | `v0.33.46__arch-brief__sg-send-risk-to-an-exec-multi-level-calibration-appetite-reverse-engineered-emergent-gaming-succession.md` | Multi-level calibration and succession, which the role-not-individual rule serves |
| 26 Jun | `v0.33.35__arch-brief__sg-send-risk-register-graph-of-graphs-facts-only-no-deny-cascade-cia-blast-radius.md` | The graph of graphs that makes a nested register possible |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | Wherever there is a stakeholder accepting a risk, that entity needs a register |
| 2 | Registers therefore exist for companies, departments, and individual roles |
| 3 | A person's register is all the risks that bubble up to them, derived rather than curated |
| 4 | Registers are fractal: the same grammar and tooling apply at every altitude |
| 5 | An individual has at least two registers, often three the further down they sit |
| 6 | The first is role-specific, in the language, culture, and domain of that role |
| 7 | The others are the registers above, reached by the five whys, converging on the board |
| 8 | Only the role's own register is stored; the views above are derived by relevance |
| 9 | The fade lights the entries above that trace back to this role, which is the education mechanism |
| 10 | The register belongs to the role, and the role is connected to a person, which is what makes succession work |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
