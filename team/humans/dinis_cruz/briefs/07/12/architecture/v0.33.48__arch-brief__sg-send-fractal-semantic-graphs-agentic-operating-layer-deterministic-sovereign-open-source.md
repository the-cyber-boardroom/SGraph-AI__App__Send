# Fractal Semantic Graphs All The Way Down: An Architecture For A Deterministic, Sovereign, Open Agentic Operating Layer

**version** v0.33.48
**date** 12 July 2026
**from** Human (project lead)
**to** Architect, @Dev, Product, Strategy

**type** Arch brief (semantic graph)

*Generic, from a common platform pattern: an operating layer between customer channels and business systems. No vendor is named.*

---

## What This Is

An architecture for the agentic operating layer that sits between channels and business systems, built on one idea: **the standard version of this platform is a stack of layers, channels, an agent runtime, a knowledge layer, workflows, tools and skills, and business-system integrations, glued together by JSON payloads and prompt instructions, which is why it ends up non-deterministic, unexplainable, unprovenanced, locked to a vendor's cloud, and impossible to audit, because at every boundary meaning is lost and re-guessed; the alternative is to make a semantic graph the interface at every boundary, so each layer emits a graph and consumes a graph and nothing crosses a layer as an opaque blob or a sentence, and to make that graph fractal, meaning the same node and edge grammar, the same validators, the same query engine, and the same provenance rule apply at every altitude, from an entity inside a message, to a message, to a conversation, to a customer, to a tenant, so any node zooms into a graph with identical rules and graphs compose into graphs without a new format; from that single decision the properties fall out rather than being bolted on, determinism because a model at the edge only proposes a graph and a deterministic engine validates and executes it with no model in the production path, explainability because every answer is a replayable traversal and the plan graph is the explanation, provenance because every node is backed by evidence anchored to a vault commit so nothing enters without a source, sovereignty because each tenant is a portable versioned vault that is the source of truth and the model and the cloud are swappable edges, scalability because fractal composition and per-tenant vaults with ephemeral local query engines shard naturally, and open source because the ontology, validators, engine, and vertical blueprints are forkable artifacts whose portability is the proof rather than the promise; and the same graph carries the governance rail, since the register, the risks, the owners, and the acceptances are nodes over the very same tools, grants, and integrations the runtime executes, which means the audit log is the commit history, the AI Act and GDPR posture is a query, and the platform's own risk register contains the platform.** It is the eighth brief of 12 July (cross-ref: the v0.33.45 deterministic-execution brief, the v0.33.48 browser-database brief, the v0.33.47 authorization brief, and the v0.33.44 ontology brief). New contributions: **the fractal-semantic-graph-as-interface architecture for an agentic operating layer, the definition of fractal as one grammar at every altitude, the model-proposes-engine-executes boundary, untrusted input as data never instruction, and the derivation of determinism, explainability, provenance, sovereignty, scale, and openness from the single graph decision.**

## The Problem: Layers Glued By JSON And Prompts

The conventional build of this platform has the right layers and the wrong seams. Channels hand the runtime a payload, the runtime hands the model a prompt, the model hands back text, the workflow parses that text into another payload, a tool call goes out as JSON, and the business system returns a record that is summarised back into prose. At every one of those boundaries the meaning is flattened into something that carries no structure, no grounding, and no provenance, and then re-guessed on the other side. That is where the properties are lost. Determinism dies because a sentence has to be re-interpreted; explainability dies because there is nothing to replay; provenance dies because a payload does not know where it came from; sovereignty dies because the state lives in a vendor's runtime; and auditability dies because the log records what was said rather than what was decided. Adding a governance rail afterwards cannot recover any of it, because the information was destroyed at the seams.

## What Fractal Means Here

Fractal is a precise claim, not a decoration. It means four things. Self-similarity: the same node and edge grammar describes an entity, a message, a conversation, a customer, and a tenant. Scale invariance: the same validators, the same query engine, and the same visualisation tools work unchanged at every altitude. Composition: a graph can be a node in another graph, which is the graphs-of-graphs property the corpus already runs on. Recursion: zoom into any node and it expands into a graph obeying the identical rules, with no new format and no special case. The practical payoff is that one grammar, learned once and validated once, serves the whole platform, and any tool built for one altitude works at all of them.

```
   ZOOM OUT                                              ZOOM IN
   tenant graph
     +-- customer graph
           +-- conversation graph
                 +-- message graph
                       +-- intent graph
                             +-- entity nodes

   same node grammar, same edge grammar, same validators,
   same query engine, same provenance rule, at every altitude
```

## The Stack: A Graph At Every Boundary

Nothing crosses a layer except a graph.

```
   CHANNELS         chat | email | voice | web widget        untrusted in, rendered out
       |  graph
   +---v------------------------------------------------+
   |  UTTERANCE GRAPH   payload, sender, channel, time   |   trust = untrusted
   +---+------------------------------------------------+
       |  graph
   +---v------------------------------------------------+
   |  TRANSLATION       model at the edge, proposes an   |   the LLM lives here,
   |                    INTENT GRAPH, nothing else       |   and only here
   +---+------------------------------------------------+
       |  graph (proposed)
   +---v------------------------------------------------+
   |  VALIDATION        ontology + policy, deterministic |   invalid graph is rejected
   +---+------------------------------------------------+
       |  graph (validated)
   +---v------------------------------------------------+
   |  PLAN GRAPH        goal, steps, gates, tool calls   |   goal driven, human gates
   +---+------------------------------------------------+
       |  graph
   +---v------------------------------------------------+
   |  RUNTIME           deterministic executor           |   no model in the path
   +---+------------------------------------------------+
       |  graph
   +---v------------------------------------------------+
   |  TOOLS / SKILLS    capability + grant + scope       |   authorization lives here
   +---+------------------------------------------------+
       |  graph
   +---v------------------------------------------------+
   |  TWINS             CRM, ERP, PMS, billing, docs     |   business systems mirrored
   +---+------------------------------------------------+
       |  graph
   +---v------------------------------------------------+
   |  VAULT             versioned source of truth        |   sovereign, portable, per tenant
   +----------------------------------------------------+

   KNOWLEDGE GRAPH   facts, evidence, memory, policies    traversed, not guessed
   GOVERNANCE GRAPH  risks, owners, acceptances, mandates the register, over the same nodes
   PROVENANCE        every node backed by evidence and anchored to a commit id
```

## The Layers, In Graph Terms

| Layer | Conventionally | As a fractal semantic graph |
|-------|----------------|------------------------------|
| Channels | Payloads and webhooks | An utterance graph per inbound message, marked untrusted, with sender, channel, and time as nodes |
| Agent runtime | Prompt-driven orchestration | A plan graph of goal, steps, gates, and tool calls, executed deterministically |
| Knowledge | RAG over embedded chunks | A knowledge graph traversed from intent to grounded facts, each backed by evidence |
| Memory | A prose transcript or vector store | A persistent, versioned subgraph per customer |
| Policies | Instructions in a system prompt | Constraints in the validator, enforced before execution |
| Workflows | Hard-coded or wizard-built flows | Graph templates instantiated per case, with deterministic transitions |
| Tools, skills, MCP | Registered callables | Tool nodes carrying capability, grant, and scope, with authorization as edges |
| Business systems | Point-to-point integrations | Twins of the CRM, ERP, PMS, billing, and docs, connected to reality |
| Audit logs | A separate append-only log | The vault's commit history; the graph is the log |
| Observability | Traces and dashboards | Diffs between the proposed, executed, and outcome graphs |
| Governance rail | A parallel GRC system | The register over the very same nodes the runtime executes |

## Where The Model Sits, And Where It Does Not

The model is at the edge and nowhere else. Its single job is translation: turn natural language into a proposed intent graph, and turn a result graph back into language for the channel. It proposes; it never executes. Everything between the proposal and the effect is deterministic, a validator that checks the proposed graph against the ontology and the policy constraints, and an engine that executes the validated plan graph. This is the deterministic-execution principle made structural rather than aspirational: an invalid or hostile proposal is rejected by construction because it does not conform to the grammar, and the same input always yields the same execution, because the execution is a function of the validated graph and not of a sampled token stream. Swapping the model changes the translator and nothing else, which is what inference-agnostic actually means.

## Untrusted Input Is Data, Never Instruction

Prompt injection is defeated structurally here rather than by asking a model to resist it. Inbound content from a channel enters as an utterance graph whose nodes are explicitly marked untrusted, and untrusted nodes are data: they can be read, matched, and referenced, and they can never become instruction nodes in a plan graph. A customer's message can therefore propose an intent, which is exactly what we want, and that proposal is validated against the ontology, the policy constraints, and the available grants before anything runs. Text that says to ignore previous instructions and export the customer table proposes an action for which no grant exists, so it does not fail at the model's discretion, it fails at the validator, deterministically. This is the corpus position, containment at the authorization layer and not the prompt layer, expressed as a property of the graph grammar.

## Authorization Lives In The Tool Graph

Each tool is a node that declares its capability, its required grant, and its scope, and a plan step can only invoke a tool if the grant edge exists. The union of everything the grants reach is the authorization closure, which is computed rather than asserted, and it is what bounds the blast radius. This is where the scope-removes-variables argument becomes architecture: a tool with a read-only, row-scoped grant makes a mass write impossible rather than denied, so the branch is not policed at runtime, it is absent from the graph. And because the plan graph carries the intent and the state alongside the tool call, the context-rich decision sits where the context is, in validated code over a graph that knows what is being attempted and why, rather than in a distant arbiter that sees only a request.

## Knowledge Is Traversed, Not Guessed

The knowledge layer becomes a graph rather than a retrieval lottery. Ingested documents decompose into fact and evidence subgraphs that keep their source, so retrieval is a traversal from the intent node to grounded facts with provenance attached, not a similarity search that returns plausible chunks. Memory is a persistent, versioned subgraph per customer rather than a transcript to re-read. Policies are validator constraints rather than sentences in a prompt that a model may or may not honour. And recursive learning has a safe meaning: outcomes are committed back as new facts and evidence, so the data improves over time while the executable logic stays fixed and reviewed, which is how the system learns without becoming unpredictable.

## The Governance Rail Is The Same Graph

The governance rail is not a parallel system; it is a projection of the same nodes. Every tool, grant, integration, agent, and workflow the runtime executes is already a node, so the register attaches risks, owners, acceptances, and time-boxed mandates directly to them, which means the thing being governed and the thing being executed are the same object and cannot drift apart. Usage controls are quota and budget nodes whose enforcement is a validator constraint. Human supervision is an explicit approval-gate node inside the plan graph rather than an escalation bolted to the side. Data-protection posture becomes a query, since data-subject, lawful-basis, and retention are nodes and a deletion is a subgraph removal. And the platform's own register contains the platform, because the runtime, the model dependency, and the integrations are nodes with their own risks, which is the register-contains-itself recursion applied to the product itself.

## Provenance, Audit, And Explainability Fall Out

Three properties that are normally expensive features are, in this design, consequences. Provenance: every node is backed by evidence and anchored to a vault commit, so nothing enters the graph without a source and every claim can be walked to its origin. Audit: the vault is versioned and append-only, so the commit history is the audit log, and there is no second system to reconcile with the first. Explainability: the plan graph is the explanation, so answering why the system did that is replaying a traversal rather than asking a model to narrate its reasoning after the fact, which is the difference between a defensible account and a plausible one.

## Sovereign, Multi-Tenant, And Agnostic By Construction

Each tenant is a vault, which is the source of truth, versioned, portable, and self-hostable, and vaults compose so a coordinating vault can hold read or write keys to others. Because the vault holds the truth and the model and the cloud are swappable edges, cloud-agnostic and inference-agnostic are structural rather than marketed: the state never lives in the runtime, so moving hosts or models moves nothing that matters. The query layer is ephemeral by design, loaded from the vault into the browser's own databases and rebuilt or synced by commit id, so scale is per-tenant and horizontal rather than a shared backend to defend. And sovereignty is provable in the strongest way available: if the platform vanished, the tenant would still hold a complete, versioned, readable graph of everything, which is the anti-lock-in proof the sprawl-fatigued buyer actually wants.

## Blueprints Are Forkable Graphs

Vertical and sector blueprints are not code branches; they are graphs. A blueprint is an ontology extension, a set of workflow templates, a policy constraint set, and a starter knowledge graph, packaged as a vault that can be forked, diffed, and merged. That makes the vertical offering an open, inspectable artifact rather than a black box, lets a customer or a partner extend it without waiting for the vendor, and makes an improvement in one deployment mergeable into the blueprint everyone else uses. Open source here is not a licence gesture; it is the distribution model for the blueprints and the guarantee behind the sovereignty claim.

## The Semantic Graph

One inbound message, traced end to end. Note the model proposing rather than executing, the untrusted input, authorization as grant edges, and the register attached to the same nodes.

```json
{
  "nodes": [
    {"id": "reality-biz",  "type": "Reality",              "label": "the tenant's live business systems"},
    {"id": "twin-crm",     "type": "Twin",                 "label": "twin of the CRM and business systems"},
    {"id": "vault-tenant", "type": "Vault",                "label": "the tenant's versioned vault, source of truth"},
    {"id": "commit-n",     "type": "Commit",               "label": "vault commit id, the provenance anchor"},
    {"id": "ont",          "type": "Ontology",             "label": "the shared node and edge grammar"},
    {"id": "ch-im",        "type": "Channel",              "label": "inbound channel: chat, email, or voice"},
    {"id": "msg-in",       "type": "UntrustedInput",       "label": "customer message: data, never instruction"},
    {"id": "g-utterance",  "type": "Graph",                "label": "utterance graph: payload, sender, channel, time"},
    {"id": "model-edge",   "type": "Model",                "label": "LLM at the edge: language to proposed graph"},
    {"id": "g-intent",     "type": "Graph",                "label": "proposed intent graph, untrusted until validated"},
    {"id": "validator",    "type": "Validator",            "label": "deterministic ontology and policy validation"},
    {"id": "g-plan",       "type": "Graph",                "label": "validated plan graph"},
    {"id": "goal",         "type": "Goal",                 "label": "the customer outcome being pursued"},
    {"id": "step-read",    "type": "Step",                 "label": "read the customer record"},
    {"id": "step-write",   "type": "Step",                 "label": "update the customer record"},
    {"id": "gate-human",   "type": "ApprovalGate",         "label": "human supervision, explicit in the plan"},
    {"id": "engine",       "type": "Engine",               "label": "deterministic executor, no model in the path"},
    {"id": "tool-read",    "type": "Tool",                 "label": "CRM read tool"},
    {"id": "tool-write",   "type": "Tool",                 "label": "CRM write tool"},
    {"id": "grant-read",   "type": "Grant",                "label": "scoped read grant"},
    {"id": "grant-write",  "type": "Grant",                "label": "row-scoped write grant"},
    {"id": "closure",      "type": "AuthorizationClosure", "label": "everything the granted scopes can reach"},
    {"id": "g-knowledge",  "type": "Graph",                "label": "knowledge graph: facts, memory, policies"},
    {"id": "fact-cust",    "type": "Fact",                 "label": "grounded fact about the customer"},
    {"id": "ev-source",    "type": "Evidence",             "label": "source document or system of record"},
    {"id": "g-outcome",    "type": "Graph",                "label": "outcome graph: what was actually done"},
    {"id": "risk-write",   "type": "Risk",                 "label": "the write reaches the wrong records"},
    {"id": "acc-write",    "type": "AcceptanceDecision",   "label": "accepted write scope, for an interval"},
    {"id": "owner-ops",    "type": "Owner",                "label": "business owner of the workflow"},
    {"id": "g-register",   "type": "Graph",                "label": "governance graph over the same nodes"}
  ],
  "edges": [
    {"source": "twin-crm",     "type": "connected_to", "target": "reality-biz"},
    {"source": "vault-tenant", "type": "contains",     "target": "g-knowledge"},
    {"source": "vault-tenant", "type": "contains",     "target": "g-register"},
    {"source": "vault-tenant", "type": "anchored_by",  "target": "commit-n"},
    {"source": "g-utterance",  "type": "conforms_to",  "target": "ont"},
    {"source": "g-intent",     "type": "conforms_to",  "target": "ont"},
    {"source": "g-plan",       "type": "conforms_to",  "target": "ont"},
    {"source": "g-outcome",    "type": "conforms_to",  "target": "ont"},
    {"source": "msg-in",       "type": "arrives_on",   "target": "ch-im"},
    {"source": "msg-in",       "type": "becomes",      "target": "g-utterance"},
    {"source": "model-edge",   "type": "proposes",     "target": "g-intent"},
    {"source": "g-intent",     "type": "derived_from", "target": "g-utterance"},
    {"source": "validator",    "type": "validates",    "target": "g-intent"},
    {"source": "validator",    "type": "emits",        "target": "g-plan"},
    {"source": "g-plan",       "type": "contains",     "target": "goal"},
    {"source": "g-plan",       "type": "contains",     "target": "step-read"},
    {"source": "g-plan",       "type": "contains",     "target": "step-write"},
    {"source": "g-plan",       "type": "contains",     "target": "gate-human"},
    {"source": "step-write",   "type": "requires",     "target": "gate-human"},
    {"source": "engine",       "type": "executes",     "target": "g-plan"},
    {"source": "step-read",    "type": "invokes",      "target": "tool-read"},
    {"source": "step-write",   "type": "invokes",      "target": "tool-write"},
    {"source": "tool-read",    "type": "requires",     "target": "grant-read"},
    {"source": "tool-write",   "type": "requires",     "target": "grant-write"},
    {"source": "grant-read",   "type": "grants",       "target": "closure"},
    {"source": "grant-write",  "type": "grants",       "target": "closure"},
    {"source": "tool-read",    "type": "observed_on",  "target": "twin-crm"},
    {"source": "tool-write",   "type": "observed_on",  "target": "twin-crm"},
    {"source": "step-read",    "type": "derived_from", "target": "g-knowledge"},
    {"source": "g-knowledge",  "type": "contains",     "target": "fact-cust"},
    {"source": "fact-cust",    "type": "backed_by",    "target": "ev-source"},
    {"source": "engine",       "type": "emits",        "target": "g-outcome"},
    {"source": "g-outcome",    "type": "committed_to", "target": "vault-tenant"},
    {"source": "g-outcome",    "type": "backed_by",    "target": "commit-n"},
    {"source": "grant-write",  "type": "gives_rise_to","target": "risk-write"},
    {"source": "risk-write",   "type": "accepted_by",  "target": "acc-write"},
    {"source": "acc-write",    "type": "owned_by",     "target": "owner-ops"},
    {"source": "g-register",   "type": "contains",     "target": "risk-write"}
  ]
}
```

Read the model boundary: `model-edge` only `proposes` `g-intent`, and only `validator` and `engine` touch what executes. Read the injection defence: `msg-in` is `UntrustedInput` and reaches nothing except `g-utterance`, so it can influence a proposal but never an execution. Read the authorization: `step-write` cannot run without `grant-write`, so an ungranted action is absent rather than refused. Read the governance: `grant-write` `gives_rise_to` `risk-write`, which sits in `g-register` over the same node the runtime uses. Note that this instance extends the ontology's edge grammar for the runtime domain, `contains`, `conforms_to`, `arrives_on`, `becomes`, `proposes`, `derived_from`, `validates`, `emits`, `requires`, `executes`, `invokes`, `committed_to`, and `anchored_by` are proposed additions, while `connected_to`, `observed_on`, `backed_by`, `grants`, `gives_rise_to`, `accepted_by`, and `owned_by` are reused unchanged.

## How The Six Properties Fall Out

| Property | Why it follows from the architecture |
|----------|--------------------------------------|
| Deterministic | The model proposes a graph; a validator and an engine execute it; no model sits in the production path |
| Explainable | Every answer is a replayable traversal, and the plan graph is the explanation rather than a narration |
| Provenance | Every node is backed by evidence anchored to a commit, so nothing enters without a source |
| Sovereign | Each tenant is a portable, versioned vault holding the truth; model and cloud are swappable edges |
| Scalable | Fractal composition, per-tenant vaults, and ephemeral local query engines shard by construction |
| Open source | Ontology, validators, engine, and blueprints are forkable artifacts; portability is the proof |

## What This Does Not Try To Be

- **Not a graph database pitch.** The claim is that one grammar is the interface at every boundary, not that we store things in a graph.
- **Not a model-free system.** The model is essential, at the edges, translating; it simply never executes.
- **Not prompt-based safety.** Untrusted content cannot become an instruction, structurally, rather than by a model's restraint.
- **Not a parallel governance system.** The register is a projection of the same nodes the runtime executes.

## Honest Tensions

| Tension | Note |
|---------|------|
| Graph at every boundary versus latency | Validation at each seam costs time, and a voice channel has a hard latency budget |
| Proposal validation versus expressiveness | A strict grammar rejects hostile input and also rejects legitimate intents nobody modelled yet |
| One grammar versus fitness | Fractal uniformity is powerful but can be procrustean when a domain genuinely does not fit |
| Open source versus revenue | If the engine and blueprints are forkable, the value must sit in evidence, assurance, and hosting |
| Sovereign vaults versus managed convenience | Self-hostable portability is the trust argument and also more work than a managed runtime |

## Open Questions

| Question | Notes |
|----------|-------|
| What is the wire format for a graph between layers? | The serialisation, its validation cost, and its versioning |
| How cheaply can a proposed graph be validated? | The latency budget for validation on a voice or chat turn |
| What happens when validation rejects a legitimate intent? | The fallback path, and how the grammar learns without losing determinism |
| How are blueprints packaged, versioned, and merged? | Forkable vaults, ontology extensions, and upstreaming an improvement |
| What is the licence and the commercial boundary? | Which artifacts are open, and where the revenue actually sits |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 6 Jul | `v0.33.45__arch-brief__sg-send-deterministic-execution-llms-out-of-the-production-path-graph-backed-translations-transparent-integration.md` | Model proposes, engine executes: the principle this architecture makes structural |
| 12 Jul | `v0.33.48__arch-brief__sg-send-browser-local-databases-query-engine-vault-source-of-truth-incremental-sync-no-backend.md` | The ephemeral local query engine loaded from the vault, per tenant |
| 9 Jul | `v0.33.47__strategy-brief__sg-send-where-authorization-should-live-scope-removes-variables-context-belongs-in-code.md` | Authorization in the tool graph: scope removes variables, context sits with the decision |
| 5 Jul | `v0.33.44__arch-brief__sg-send-aws-iam-config-risk-ontology-taxonomy-nodes-edges-formulas-bridges.md` | The ontology this architecture extends into the runtime domain |
| 7 Jul | `v0.33.46__arch-brief__sg-send-riskmandate-mvp-build-architecture-vault-backend-llm-deterministic-ui-frontend-llm-billable-unit.md` | The vault, the backend model, and the deterministic core this generalises |
| 12 Jul | `v0.33.48__strategy-brief__sg-send-compete-against-the-burden-not-features-vendor-sprawl-ciso-consolidation-portability.md` | Portability as the anti-lock-in proof the sovereignty claim rests on |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | The conventional stack loses meaning at every seam, because layers are glued by payloads and prompts |
| 2 | The fix is to make a semantic graph the interface at every boundary, with nothing crossing as a blob |
| 3 | Fractal means one grammar, one validator, one query engine, and one provenance rule at every altitude |
| 4 | The model lives at the edge and only proposes a graph; it never executes |
| 5 | A deterministic validator and engine execute the validated plan graph, so the same input yields the same run |
| 6 | Untrusted input is data and can never become an instruction, so injection fails at the validator |
| 7 | Authorization lives in the tool graph, so an ungranted action is impossible rather than denied |
| 8 | Knowledge is traversed from intent to grounded facts with provenance, not guessed by similarity |
| 9 | The governance register is a projection of the same nodes, so the audit log is the commit history |
| 10 | Determinism, explainability, provenance, sovereignty, scale, and openness follow from the graph decision |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
