# A PKI Public Key Registry On Vaults: Clues Not Storage, Two-Level Trust, And A Federated Trust Graph

**version** v0.32.4
**date** 5 June 2026
**from** Human (project lead)
**to** Developer (lead), Architect, Security, @Dev
**type** Dev brief

---

## What This Is

The first implementation building block of the PKI solution: **a public key registry built on vaults, a place to store and distribute public keys, connect them with trust relationships, and resolve a multi-dimensional trust graph.** Now that many agents are using public and private keys, and with specific use cases already in mind, a registry is needed. It implements the trust model from the trust-and-identity brief (cross-ref: the v0.32.3 NHI-2.0-trust-and-identity brief) and the PKI paradigm (cross-ref: the v0.31.12 PKI-not-secrets and v0.32.3 NHI-2.0-PKI-foundations briefs), on the semantic-graph and vault foundations (cross-ref: the v0.32.3 NHI-2.0-semantic-knowledge-graphs brief). The design principles: **clues not storage, public keys with metadata and relationships, two levels of trust (downward explicit and upward self-declared), the register as a vault holding only public or encrypted data, the register as a graph database, federation across registries, connectors to any identity provider, and resolution as the caller's responsibility.**

## What This Builds: Two Parts, One In Scope

The scope, clearly bounded: **there are two parts, PKI creation and public key management, and this phase builds only the second; storing the private key is not our responsibility.**

The project lead: **"there are two parts. There is the PKI creation, the public and private key. For this phase, we are not going to deal with storing the private key, that is the private team's responsibility, not ours to manage for now. Whoever creates a key does that. What we need is a way to store, connect, and manage public keys connected to specific identity values, and more importantly, create chains of trust."**

| In Scope (This Phase) | Out Of Scope (This Phase) |
|-----------------------|---------------------------|
| Store and distribute public keys | Private key storage (the key owner's responsibility) |
| Connect public keys to identity values | PKI key creation itself |
| Create chains of trust and relationship paths | Managing anyone's private keys |

So the registry handles public keys: storing them, connecting them to identities, and building the chains of trust between them. Private keys stay with whoever created them. This keeps the registry firmly on the public side, which is exactly what makes the next principle safe.

## The Core Principle: Clues, Not Storage

The defining design idea: **the registry is not a place that holds all the information; it is a place that holds clues that let you find the right information, meaning through connectivity.**

The project lead: **"this is a cross-fractal mode where ultimately this is not about having a place that has all the information. This is about having clues that allow you to find the right information. It is the idea of meaning through connectivity."** So the registry is deliberately not a central data store. It holds public keys, metadata, and, above all, the relationships that point you toward the right information elsewhere. Meaning (and trust) comes from the connections (cross-ref: the semantic-knowledge-graphs and trust-and-identity briefs' meaning-and-trust through connectivity). This framing is what lets the registry be public, federated, and fractal: it is a map of clues, not a vault of secrets.

## Public Keys, Metadata, And Relationships

What the registry stores: **public keys connected to metadata, and, more importantly, the relationships between public keys, connecting key A to key B.**

The project lead: **"we store public keys connected to metadata, and we need to define what that metadata is. But more importantly is the relationship between the public keys. We need a way to connect public key A to public key B."** So each entry is a public key plus metadata (to be defined), and the load-bearing content is the relationships between keys. Connecting key A to key B is how the chains of trust are built, and it is why the registry is a graph (below).

## Two Levels Of Trust: Downward Explicit, Upward Self-Declared

The key innovation, and a genuinely interesting one: **trust comes in two levels, explicit downward trust (A says it trusts B) and self-declared upward trust (B says it should be trusted by A), and they need not agree.**

The project lead: **"there are two levels of trust. One is explicit trust, which is downwards: if a key trusts another key, meaning this entity trusts another entity, that is a downward connection, an explicit trust that lives within the key's own dataset. When I grab a key's information, I get the list of keys it trusts. Then, the concept I want, is that keys can also self-declare the relationships that should trust them. A key could say I trust that key, and a key could also say I should be trusted by that key. You can have a key saying I should be trusted by a particular key, but that key does not trust it or does not vouch for it."**

| Trust Type | Direction | Who Asserts It | Where It Lives |
|------------|-----------|----------------|----------------|
| **Downward (explicit)** | A trusts B | A (the truster) | In A's own key dataset |
| **Upward (self-declared)** | B should be trusted by A | B (the subject) | In B's own declaration |

The crucial safety property: **keys cannot give themselves privileges; self-declared upward trust is a request, not a grant.** The project lead: **"with vaults, keys should not be giving themselves privileges. If I have a chain of trust from a key, and I am going to allow it to do certain things or send resources, I sign it to that key, you do not want self-assignment of privileges. But I really like the idea that keys or agents can say that key, resource, or identity should trust me."** So a key declaring "X should trust me" grants itself nothing; it merely asserts a relationship that X can confirm or deny.

Why this matters: it makes the system **scalable, organic, and able to express eventual trust.** Keys can self-register their desired relationships, which works well in environments where some degree of trust already exists (you do not need to go to town establishing everything explicitly), and it enables an eventually-trusted process: a resolver can go to the named parent and ask whether it confirms the relationship. The self-declaration plus the parent's confirmation (or denial) are signals that feed the trust model (below).

## The Vouching Signals Model

How the two levels combine into signals (cross-ref: the trust-and-identity brief's web of trust): **a self-declared upward link is verified by asking the named party, and trust, distrust, one-way relationships, and unverified claims are all valid signals.**

The project lead: **"the downward trust is when A vouches for B and says I trust it. The upward is B saying that one should trust me. They might not be both ways. You could have one not trusting the other, and you could even have an explicit I do not trust that one, which is a valid situation. An interesting case: I would want every key I create to be connected to SGraph, that is the downward one, my key trusts SGraph. But that does not mean SGraph trusts all those keys. The reason I like I should trust me is that it allows a process: you go to the parent and ask, do you trust this one? If B says A should trust me, you go to A. A says yes I trust it, strong link. Or A has not verified it, or A says I do not trust it. All those are signals that become part of the model."**

| Situation | Signal |
|-----------|--------|
| A trusts B, and B says A should trust it | Strong, confirmed link |
| B says A should trust it, A has not verified | Weak or pending (eventually trusted) |
| B says A should trust it, A says it does not | Explicit distrust, a valid and useful signal |
| A trusts B, B is silent | One-way trust |

So the model is richer than a single trust bit: it captures confirmed links, pending claims, one-way relationships, and explicit distrust, and the verification process (ask the named party) turns self-declared claims into graded trust. The SGraph example is the common pattern: a key declares it connects to a trust anchor (downward), and that anchor need not reciprocate for the link to be meaningful.

## The Register Is A Vault, Holding Only Public Or Encrypted Data

A foundational safety principle: **the registry is itself a vault, so all data is encrypted, and the registry holds only public keys, metadata, hashes, and data encrypted with specific keys, never secrets or private data.**

The project lead: **"the register is a vault itself, which means all this data is encrypted, but the logic is that all the data in the register should be public. The register should not contain secrets or private data, it is just a collection of public keys, metadata, some encrypted data. Even if it contains data, it should be data encrypted with specific keys. So all the register data is a collection of hashes, encrypted data, and mappings, but more importantly the relationships between them. For example, here is some metadata, and you need this public key to decrypt it. Every piece of data should be indexed by the public key, with a unique ID in the register, and you connect the dots."**

| The Register Contains | The Register Never Contains |
|-----------------------|------------------------------|
| Public keys and metadata | Private keys |
| Hashes and mappings | Secrets or private data |
| Data encrypted with specific keys | Anything readable without the right key |
| The relationships between entries | A central trove worth stealing |

So even the encrypted data the register holds is encrypted to specific keys, so the register itself can read none of it. Data is indexed by the public key (or signature) needed to decrypt it, with a unique ID, and the relationships are what connect the dots. This is the clues-not-storage principle made concrete and safe: there is nothing in the register worth stealing, because it is public keys, hashes, mappings, and relationships, with any payload encrypted to keys the register does not hold.

## The Register Is A Graph Database

Stated plainly: **the register is a graph database; connecting the dots is what it does.**

The project lead: **"the register connects the dots, and the register is basically a graph database, that is what it is."** So the registry's implementation is a graph: nodes are public keys (with metadata and encrypted-payload pointers), edges are the trust relationships (downward and upward, with their signals). Resolving trust is traversing the graph. This is the semantic-graph and trust-graph thinking (cross-ref: the semantic-knowledge-graphs and trust-and-identity briefs) realised as the registry's data model.

## A Vault, Not Server-Side Complexity

A concrete simplification, from experience: **a previous prototype used FastAPI and heavy server-side machinery; now the registry is just a vault, inheriting all the vault properties, plus monitoring.**

The project lead: **"in the past I developed a prototype with FastAPI and all this server-side complexity. Now the vault is just a vault, which benefits from all the vault properties: easy to distribute, easy to run. I also want to add monitoring properties."** So the registry does not need a bespoke server; being a vault, it is easy to distribute and run (cross-ref: the platform-of-primitives and publishing-mode briefs), and monitoring is added as a vault feature. This replaces the earlier server-side prototype with the vault primitive, which is simpler and inherits distribution, encryption, and provenance for free.

## Federation And Connectors To Any Identity Provider

The network effect, and the fractal nature: **the registry connects to other identity stores and other registries, federating into a multi-dimensional trust graph, and connectors let it draw identity from anywhere.**

The project lead: **"this public key vault should connect to identities, other identity stores, and other vaults, including other public key registers. The vault becomes an open-source public key register that can connect to other public key registers. There is nothing wrong with a register connecting to another register connecting to another, vaults of vaults of vaults. For some cases you need that, because you gain trust the more registers you connect to. We are creating a multi-dimensional trust graph that connects the dots. This means anywhere that can provide some level of identity becomes valuable: a DNS record, GitHub identities, Google Auth, OAuth, anything that gives a property. It is just a matter of building connectors."**

| Federation / Connector | What It Adds |
|------------------------|--------------|
| Register connects to register (fractal) | More trust the more registers you reach (cross-ref: the vault-in-vault briefs) |
| Connector to a DNS record | A verifiable identity property |
| Connector to GitHub, Google Auth, OAuth | Existing identities as trust signals (cross-ref: the living-off-the-land brief) |
| Any identity provider | Just build a connector with the right value and reference |

So the registry federates: registers connect to registers (vaults of vaults), and the more you connect, the more of the multi-dimensional trust graph you can traverse and the more trust you can establish. And because the logic is trust through connectivity, any source that can assert an identity property (DNS, GitHub, Google Auth, OAuth) becomes valuable, reached through a connector. This is live-off-the-land for identity (cross-ref: the living-off-the-land brief) realised in the registry: the open-source public key register that plugs into everything.

## Resolution Is The Caller's Responsibility

The boundary that keeps the vault simple: **resolving the fractal, recursive trust graph is the caller's responsibility, via a resolver service, not the vault's.**

The project lead: **"you have a fractal nature here, and you need to be careful and recursive, but that is not the responsibility of the vault itself. It is the responsibility of the caller trying to resolve this. You probably need a service and API that resolves this and creates a graph object. It would be interesting to see a situation where you can say, I started here, I discovered this and that, and now I am stuck because I do not have the keys, I cannot continue, but I gained this level of trust."** So the vault stores the clues; a resolver (the caller, via a service and API) walks the graph, follows relationships across registers and connectors, handles recursion carefully, and builds a trust-graph object. A natural and useful outcome is a partial resolution: I followed the chain this far, I gained this much trust, and I stopped here because I lack the keys to go further. That partial, graded result is exactly what the two-level trust model and the signals produce.

## What This Asks For

1. **Build the public key registry as a vault** (store and distribute public keys; this phase, not private keys).
2. **Design for clues, not storage** (relationships that point to the right information; meaning through connectivity).
3. **Store public keys, metadata, and relationships** (connect key A to key B; define the metadata).
4. **Implement two-level trust** (downward explicit in the key's dataset; upward self-declared; no self-assignment of privileges).
5. **Capture the vouching signals** (confirmed, pending, one-way, explicit distrust; verify self-declared claims by asking the named party).
6. **Hold only public or key-encrypted data** (no private keys, no secrets; hashes, mappings, relationships; indexed by public key with a unique ID).
7. **Implement it as a graph database** (nodes are keys, edges are trust relationships).
8. **Replace server-side complexity with the vault** (inherit distribution, encryption, provenance; add monitoring).
9. **Federate and build connectors** (registers of registers; DNS, GitHub, Google Auth, OAuth; the multi-dimensional trust graph).
10. **Put resolution in a caller-side resolver service** (fractal, recursive, careful; produce a trust-graph object and graded partial results).

Estimated effort: moderate and well-supported, the vault, the semantic graph, and the trust model exist; the previous FastAPI prototype proves the concept; the contribution is the vault-native registry, the two-level trust model, and the resolver. The MVP is a vault registry holding public keys with downward and self-declared upward trust links, federating to one other register and one identity-provider connector, with a resolver that walks the graph and returns graded trust.

## What This Does Not Try To Be

- **Not a private key store.** Private keys stay with their owners; this phase is public keys.
- **Not a central data trove.** Clues and relationships; nothing worth stealing.
- **Not self-granted privilege.** Self-declared trust is a request, verified by the named party.
- **Not a server-side service.** A vault, inheriting the vault properties; resolution is caller-side.
- **Not a single registry.** Federated, fractal, connected to other registers and identity providers.

## Honest Risks

**Risk 1: Recursive resolution can loop or explode.** The fractal graph can recurse badly. Mitigation: resolution is the caller's responsibility with careful recursion handling; graded partial results; depth and cycle limits.

**Risk 2: Self-declared trust could be abused.** Keys asserting false relationships. Mitigation: self-declaration grants nothing; the named party must confirm; explicit distrust is a signal; the web of trust makes false webs expensive (cross-ref: the trust-and-identity brief).

**Risk 3: Even public registries leak metadata.** Relationships and metadata can reveal structure. Mitigation: hold only what is needed; encrypt payloads to specific keys; the registry reads nothing; consider what metadata is public.

**Risk 4: Federation spreads trust assumptions.** Connecting many registers compounds trust decisions. Mitigation: trust is graded and traversed explicitly; the resolver shows where trust came from; connect deliberately.

**Risk 5: Connector quality varies by identity provider.** DNS, GitHub, OAuth differ. Mitigation: connectors are thin and per-provider; the value and reference model is uniform; start with a couple.

## Open Questions

| Question | Notes |
|----------|-------|
| What metadata travels with a public key? | To be defined; identity values, properties, signals |
| What are the exact vouching properties? | Trust, distrust, vouch, should-trust-me; the signal grades |
| How does the resolver handle recursion and cycles? | Depth and cycle limits; careful, caller-side |
| How is graded and partial trust represented? | I got this far, gained this much trust, stopped here |
| Which identity-provider connectors first? | DNS, GitHub, Google Auth, OAuth |
| How does federation across registers establish trust? | More registers, more graph, more trust; deliberate connections |
| What monitoring does the registry vault need? | The added monitoring properties |
| What is the registry MVP? | A vault registry with two-level trust, one federation, one connector, a resolver |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-trust-and-identity-web-of-trust-agent-trust-scores.md` | The trust model and web of trust this registry implements |
| 3 Jun | `v0.31.12__arch-brief__sg-send-pki-not-secrets-vaults-identity-provider-partnership.md` | The PKI paradigm and the identity-provider root authorities |
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-pki-foundations-accountability-key-controlled-memory.md` | The chain of authenticity; the vault as the agent's keyring |
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-semantic-knowledge-graphs-of-identity.md` | The register as a graph database; meaning and trust through connectivity |
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-living-off-the-land-identity-anchors-storage.md` | Connectors to existing identity providers; where keys live |
| 26 May | `v0.27.62__arch-brief__sg-send-vault-in-vault-kernel-model-no-origin-iframes.md` | Vaults of vaults; the fractal, federated structure |
| 3 Jun | `v0.31.12__strategy-brief__sg-send-vault-as-platform-of-primitives.md` | The vault as the primitive replacing server-side complexity |
| 3 Jun | `v0.31.12__dev-brief__sg-send-publishing-mode-vault-via-github-actions.md` | Vault distribution and run-anywhere properties |

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | The registry is a vault storing public keys | Store and distribute public keys; not private keys |
| 2 | It is designed as clues, not storage | Relationships pointing to information; meaning through connectivity |
| 3 | It stores keys, metadata, and relationships | Key A connected to key B |
| 4 | Two-level trust is implemented | Downward explicit and upward self-declared; no self-granted privilege |
| 5 | The vouching signals are captured | Confirmed, pending, one-way, explicit distrust; verified by the named party |
| 6 | Only public or key-encrypted data is held | No private keys or secrets; indexed by public key |
| 7 | It is a graph database | Nodes are keys, edges are trust relationships |
| 8 | It replaces server-side complexity | A vault with distribution, encryption, provenance, and monitoring |
| 9 | It federates and uses connectors | Registers of registers; DNS, GitHub, Google Auth, OAuth |
| 10 | Resolution is a caller-side resolver | Fractal, recursive, careful; a trust-graph object and graded results |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
