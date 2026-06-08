# PKI Instead Of Secrets: The Vault As A Cryptographically-Gated Envelope, And The Identity-Provider Partnership

**version** v0.31.12
**date** 3 June 2026
**from** Human (project lead)
**to** Architect, Developer (lead), Security, Strategy, Product, @Dev
**type** Arch / strategy brief

---

## What This Is

A use case and a partnership ask: **authorization and authentication done with PKI instead of secrets, where every person and every agent holds many granular keys, and the vault is the envelope that carries data surgically to exactly the right key-holder at the right time.** It builds on the vault-in-vault PKI model (cross-ref: the v0.27.62 vault-in-vault kernel-model brief), the least-privilege and blast-radius work (cross-ref: the v0.31.9 blast-radius briefs), and the authentication work (cross-ref: the v0.27.60 authentication brief), and it sets up a concrete partnership direction: working with identity-provider companies who distribute and manage the keys. The project lead frames it as both a strong vault use case and the integration to pursue with identity solutions.

## The Paradigm Shift: PKI Instead Of Secrets

The central idea: **do authorization and authentication with a highly granular set of public and private keys, not with secrets, and give each identity many keys rather than one.**

The project lead: **"I really like the idea that we can do authorization and authentication based on PKI and a highly granular set of public and private keys, where one person doesn't have one key, one person has bazillions of keys, depending on the role, the actions, what they need to do, what they need to know, what they can do. It means we can deliver the data very surgically to the right person, the right agent, the right workflow, using PKI instead of secrets. That's a massive paradigm shift, and this is what vaults enable."**

| Secrets Model (Today) | PKI Model (This Brief) |
|-----------------------|------------------------|
| A few shared secrets / tokens | Many granular keys per identity |
| One key per person | Bazillions of keys, per role, action, need-to-know, need-to-do |
| Coarse access | Surgical delivery to the right key-holder |
| The secret is the liability | The private key holder is the only reader; nothing shared to leak |

The shift is from "hold a secret that grants broad access" to "hold the specific key for the specific thing you are entitled to, and nothing more." Because an identity holds many keys, access is decomposed to the granularity of role, action, and need, and the vault delivers each piece of data to exactly the key that should read it. This is what the vault enables: it can hold and address content to many keys, so the surgical, per-key delivery is native, not bolted on.

## The Vault As A Rich Travelling Envelope

The architectural framing: **the vault is a file that travels through a system carrying its identity, evidence, tools, and schemas, unlike a web request that loses the identity at the gate.**

The project lead: **"imagine the vault is a file travelling to the system. Instead of a web request with some post data, where you lose the identity at the gate, lose all the properties, can't enrich the request, can't follow up, imagine, it is kind of what SOAP envelopes were trying to do, but that was ridiculously complex. Here we can make the vault as rich or as simple as we want, and we can pile up evidence, tools, schemas, all sorts of stuff."**

| The Web Request | The Vault Envelope |
|-----------------|--------------------|
| Identity lost at the gate | Identity travels with the data (the keys) |
| Properties lost | Properties carried and enrichable |
| Cannot follow up or enrich | Can be enriched at each hop |
| Stateless post data | Evidence, tools, schemas piled up as needed |

The SOAP-envelope comparison is apt and honest: the goal (a self-describing, identity-carrying, enrichable message) is one the industry has reached for before, but past attempts were ruinously complex. The vault achieves the same goal simply, because it is just an encrypted, versioned file that can be as rich or as plain as the use case needs, and it carries its evidence, tools, schemas, and the keys that gate it as it travels. The data does not lose its context at a gateway; the context travels inside the envelope.

## The Supply Chain: The Vault Travels A To B To C, Gated By Keys

The workflow shape: **the vault travels a chain of parties (A to B to C to F to G and back to A), each a hop in a supply chain, and PKI ensures only the right party at the right time can read or edit it.**

The project lead: **"the vault goes from A to B to C to F to G, back to A, and each of these is like a supply chain. This could be a web app, an application, multiple systems, agents, multiple players, someone who receives, people to approve it. The power is when you put PKI on top: you now have a really powerful way of making sure that only the right agent at the right time can read the data, surgically allow certain people or agents to view or edit, all done via their public key. We do not even know who the person is, but we know the person has that responsibility."**

So a workflow (an approval flow, a multi-system process, a multi-agent pipeline; cross-ref: the approval and assessment workflows in the consulting and GDPR briefs) is the vault travelling a chain, and at each hop the PKI gates who can read and edit. Two properties stand out:

- **Surgical read/edit by public key.** Each hop can decrypt only what its key entitles it to; the rest stays encrypted to it. The access is per-key, per-hop, not all-or-nothing.
- **Identity by responsibility, not by knowing the person.** The system does not need to know who the person is; it knows the holder of a given key has a given responsibility. This is identity-by-key: the key *is* the entitlement, and privacy and verifiability coexist (you can verify the holder is entitled without knowing who they are).

## Cryptographically Enforced Sequence For Agentic Workflows

A particularly strong application: **enforcing the sequence of an agentic workflow with keys and signatures, so an agent only acts on data that arrived through the right prior agents.**

The project lead: **"Agent A can only send data to Agent B, and Agent B can only send data to Agent C. Agent C has certain privileges and capabilities, but it will not be triggered unless the data arrived through Agent B, which Agent A signed. So we can make sure the sequence of events is much more thorough, and really locking down privileges becomes a lot more effective."**

| Without PKI Sequencing | With PKI Sequencing |
|------------------------|---------------------|
| Any input can trigger an agent | An agent acts only on data that arrived via the right chain |
| Sequence is assumed, not enforced | The signature chain proves the sequence |
| Privilege is hard to lock down | Privilege is gated on a verifiable chain of custody |

So Agent C's privileged action only triggers on data it can read, that carries Agent B's handoff, that carries Agent A's signature. The chain of custody is cryptographic: each agent verifies who sent the data and that the right predecessors handled it. This makes the sequence of a multi-agent workflow enforceable rather than assumed, which is exactly the kind of containment the blast-radius work calls for (cross-ref: the blast-radius briefs): an agent cannot be tricked into acting out of sequence, because the keys and signatures will not line up.

## Surgical Privilege Elevation And Ephemeral Keys (Blast Radius Reduced)

A sharp consequence: **privilege elevation becomes giving a narrow, often ephemeral key, not handing over broad access, which dramatically reduces blast radius.**

The project lead: **"every person, every agent has tons of keys and public keys, even sometimes ephemeral keys delivered on demand. For privilege elevation, you do not elevate the privilege and give them the keys of the castle straight away. You just give the private key that lets them read the instructions to do this one thing. You can see how dramatically the blast radius gets reduced, because the action is only triggered from the data only that agent can read, and they can verify the chain of who sent it, and you can include the public keys of the other agents that should be talking to them."**

| Traditional Elevation | PKI Elevation |
|-----------------------|---------------|
| Grant broad elevated privileges | Grant one narrow key for one task |
| The keys of the castle | The key to read one set of instructions |
| Standing access | Ephemeral key, delivered on demand, for the moment of need |
| Large blast radius | Minimal blast radius, scoped to the one action |

So elevation is reframed: instead of granting broad rights, you deliver the specific (often ephemeral, on-demand) key that lets the agent read just the instructions for the task at hand. The action is gated on data only that agent can read, the agent can verify the chain of custody, and it can be given the public keys of exactly the agents it should be talking to. This is least-privilege taken to its cryptographic conclusion (cross-ref: the blast-radius and vault-in-vault briefs): the blast radius of an elevation is the one action it unlocks, nothing more, and the elevation evaporates when the ephemeral key expires.

## The Ask: Partner With Identity-Provider Companies

The partnership direction, and the reason to write this now: **work with identity-solution companies, because they are the ones who should distribute and manage the keys, and the vault is the perfect piece of the puzzle for them.**

The project lead: **"the ask is working with identity-solution companies that are already managing identities, managing agents, managing all that. How can my vaults add support for them? The vaults are the perfect piece of the puzzle, because the vaults allow all those public and private keys they need to distribute to be effective. They are the ones who should be distributing the keys, managing the public and private keys, making sure the public keys are exposed and the private keys are available the day they are needed."**

| The Identity Provider Brings | The Vault Brings |
|------------------------------|------------------|
| Identity management (people and agents) | The envelope that carries and is gated by the keys |
| Key distribution and lifecycle | The place all those keys are used, surgically, per hop |
| Exposing public keys; delivering private keys on demand | Per-key, per-hop encryption of the data |
| The identity relationship and trust | The workflow, evidence, and provenance the keys gate |

So the division of labour is clean: the identity provider distributes and manages the many keys (exposing public keys, delivering private keys, including ephemeral ones, when needed); the vault is where those keys do their work, gating who can read and edit each piece of data as the vault travels its chain. The vault makes the identity provider's keys *useful at the data level*, and the identity provider makes the vault's per-key gating *real and managed*. This is a natural integration to pursue with the identity companies the project lead wants to start working with, and it is a strong, concrete use case to lead the conversation with.

## What This Asks For

1. **Support PKI-based authn/authz in the vault** (many granular keys per identity; surgical per-key delivery; PKI instead of secrets).
2. **Treat the vault as a travelling envelope** (identity, evidence, tools, schemas carried with the data; enrichable at each hop; the SOAP goal without the complexity).
3. **Gate the supply-chain workflow by keys** (the vault travels A to B to C; each hop reads and edits only what its key entitles; identity by responsibility, not by knowing the person).
4. **Enforce agentic sequence cryptographically** (an agent acts only on data that arrived through the right, signed chain; the signature chain proves the sequence).
5. **Do privilege elevation as narrow, ephemeral keys** (the key to read one set of instructions, not the keys of the castle; delivered on demand; blast radius scoped to the one action).
6. **Partner with identity-provider companies** (they distribute and manage the keys; the vault is where the keys gate the data; pursue the integration).
7. **Position it as a blast-radius mechanism** (cross-ref: the blast-radius briefs; PKI gating is containment made cryptographic).
8. **Produce the library page and example vault** (the page explains PKI-not-secrets; an example vault travelling a key-gated, signed chain is the MVP, ideally with an identity-provider partner).

Estimated effort: moderate to substantial; the vault-in-vault PKI primitive exists (cross-ref: the vault-in-vault brief), so the new work is the many-keys-per-identity model, the per-hop key-gated read/edit, the signature-chain sequencing, the ephemeral on-demand keys, and the identity-provider integration. The MVP is a vault travelling a signed, key-gated chain of agents, with keys from an identity provider.

## What This Does Not Try To Be

- **Not secrets-based.** PKI, many granular keys, surgical per-key delivery.
- **Not identity-lost-at-the-gate.** The identity and context travel in the envelope.
- **Not SOAP-complex.** The vault achieves the self-describing-envelope goal simply.
- **Not broad elevation.** Narrow, often ephemeral, single-action keys.
- **Not a replacement for identity providers.** A partnership: they manage keys, the vault gates data with them.

## Honest Risks

**Risk 1: Key management at this granularity is hard.** Bazillions of keys per identity is a management challenge. Mitigation: that is precisely why the identity-provider partnership exists, they manage distribution and lifecycle; the vault uses the keys, it does not have to manage them all.

**Risk 2: Ephemeral and on-demand keys need reliable delivery.** Just-in-time private keys must arrive when needed. Mitigation: the identity provider delivers them; design for graceful failure; the vault verifies before acting.

**Risk 3: Cryptographic sequencing must be correct.** A flaw in the signature-chain logic undermines the guarantee. Mitigation: build on the proven vault-in-vault PKI primitive (cross-ref: the vault-in-vault brief); verification at each hop; audit via provenance.

**Risk 4: Dependence on the identity provider.** The model leans on the partner for keys. Mitigation: a clean division of labour; standards-based PKI; more than one provider possible; the vault gating is provider-agnostic.

**Risk 5: Privacy of identity-by-key.** Knowing a holder by responsibility, not name, is a feature but needs care. Mitigation: it is deliberate (verify entitlement without knowing the person); provenance records the key, not necessarily the identity; the identity provider holds the mapping.

## Open Questions

| Question | Notes |
|----------|-------|
| What is the key-granularity model (keys per role, action, need)? | Many keys per identity; how they are structured and named |
| How does per-hop key-gated read/edit work in the vault? | Each hop decrypts only what its key entitles; the rest stays encrypted |
| How is the signature chain verified at each agent? | Verify who sent, that the right predecessors handled it, the included public keys |
| How are ephemeral on-demand keys delivered and expired? | The identity provider delivers; expiry scopes the elevation |
| Which identity-provider companies to partner with first? | Those managing identities and agents; the integration ask |
| How does the vault expose its key-gating to a provider? | The integration surface; provider-agnostic |
| What is the example MVP? | A vault travelling a signed, key-gated chain, with provider keys |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 26 May | `v0.27.62__arch-brief__sg-send-vault-in-vault-kernel-model-no-origin-iframes.md` | The vault-in-vault PKI-per-iframe primitive this builds on |
| 2 Jun | `v0.31.9__strategy-brief__sg-send-blast-radius-cybersecurity-company-2026.md` | PKI gating as cryptographic containment; blast-radius reduction |
| 2 Jun | `v0.31.9__arch-brief__sg-send-vaults-for-the-blast-radius-company.md` | The advanced-PKI send-for-sign-off; the agent peer-review chain |
| 24 May | `v0.27.60__strategy-brief__sg-send-authentication-login-client-side-oauth.md` | The authentication model this extends to PKI-not-secrets |
| 3 Jun | `v0.31.12__faq__sgraph-protocol-harness-or-workflow.md` | The coordinate-through-the-vault model the key-gated chain instantiates |
| 1 Jun | `v0.31.7__strategy-brief__sg-send-openrouter-key-credit-billing-broker-service.md` | The secret/key management this generalises to PKI |
| 29 May | `v0.31.5__strategy-brief__sg-send-consulting-assessments-rounds-customised-standards.md` | The approval workflows the key-gated supply chain serves |

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | The vault supports PKI-based authn/authz | Many granular keys per identity; surgical per-key delivery |
| 2 | The vault travels as a rich envelope | Identity, evidence, tools, schemas carried and enrichable |
| 3 | The supply-chain workflow is key-gated | Each hop reads/edits only what its key entitles; identity by responsibility |
| 4 | Agentic sequence is cryptographically enforced | An agent acts only on data via the right, signed chain |
| 5 | Privilege elevation is narrow and ephemeral | The key to one set of instructions; on demand; minimal blast radius |
| 6 | The identity-provider partnership is pursued | They manage keys; the vault gates data with them |
| 7 | It is positioned as a blast-radius mechanism | PKI gating as cryptographic containment |
| 8 | A library page and example vault exist | The page explains; the example is a signed, key-gated chain |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
