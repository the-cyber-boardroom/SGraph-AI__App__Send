# NHI 2.0 Foundations: PKI Primitives, Accountability At Provisioning Time, And Key-Controlled Memory

**version** v0.32.3
**date** 4 June 2026
**from** Human (project lead)
**to** Architect, Developer (lead), Security, Strategy, @Dev
**type** Arch / strategy brief

---

## What This Is

The first in a dedicated series of memos on NHI 2.0 (non-human identity for the agentic world), a live opportunity with a potential partner. It sits beneath the synthesis thesis (cross-ref: the v0.32.3 NHI-2.0-agent-identity-startup-thesis brief) as the first-principles foundation, riffing on how to think about identity for agents while also addressing the problems already visible today. It builds on the PKI-not-secrets brief (cross-ref: the v0.31.12 PKI-not-secrets brief) and adds genuinely new first-principles: **the PKI primitives enumerated as the foundation, the reframe that accountability happens at the moment privileges are assigned (not on the model), the danger of the union of a swarm's privileges, the chain-of-authenticity model (signed keys, TLS-like, not blockchain), the vault as the agent's keyring, and key-controlled memory and context.** A research pass on the key players is worth doing alongside this (the thesis brief began that); this brief is the conceptual foundation.

## What This Adds (Net New, Beyond The PKI-Not-Secrets And NHI 2.0 Thesis Briefs)

| Addition | What It Contributes |
|----------|---------------------|
| **PKI primitives, enumerated** | Confidentiality, agent identification, mutual authentication, least privilege, zero trust, verifiable chains and provenance |
| **Accountability at provisioning time** | You authorise an agent when you assign its privileges, not when the model acts; you cannot blame the model |
| **The union-of-privileges danger** | In a swarm, the risk is the union of all capabilities being available at once; contain it |
| **The chain of authenticity** | Signed public keys, TLS-like, a simple hash of signatures, not blockchain; a specific set of root authorities (the identity providers) |
| **The vault as the agent's keyring** | An SG vault given to an agent holds all the public and private keys it needs to operate |
| **Key-controlled memory and context** | Govern what an agent can know (its memory, context, prompt) by governing its keys; this also cuts token cost |

The general PKI paradigm and the NHI 2.0 category are in the earlier briefs; the above is the conceptual foundation this series builds on.

## The Foundation: The Primitives PKI Gives Us

The starting point: **public and private keys give a set of primitives that are fundamental to making agent identity work.**

The project lead: **"the key of all this is public and private keys. They give us a couple of key primitives that are fundamental. They give us the ability to encrypt data, so confidentiality. They give a way to identify an agent. They give a way for the agent to know who is talking to it, so integrity and confidentiality if needed. They give us a way to provide least-privilege solutions, a way to have zero-trust solutions, and a way to have verifiable chains of execution, control flows, provenance, and explainability."**

| Primitive | What PKI Provides |
|-----------|-------------------|
| **Confidentiality** | Encrypt data; only the key-holder reads it |
| **Identification** | A way to identify an agent |
| **Mutual authentication** | The agent knows who is talking to it (integrity and confidentiality) |
| **Least privilege** | Grant only the specific key for the specific need |
| **Zero trust** | Nothing is trusted by default; everything is key-gated |
| **Verifiable chains and provenance** | Chains of execution, control flows, provenance, explainability |

So PKI is not one feature; it is the foundation that unlocks confidentiality, identity, mutual authentication, least privilege, zero trust, and verifiable provenance all at once. Everything in the NHI 2.0 series rests on these primitives.

## The Reframe: Accountability Happens At Provisioning Time

The conceptual centrepiece, and a genuinely important reframe: **the authorization, and the accountability, for an agent's action happens at the moment you assign its privileges, not on the model when it acts.**

The project lead: **"the authorization to do something, almost the accountability to do something, is not on the models. When you say, the model did this, it is their fault, no. My view is that the authorization happens at the moment of assigning the privileges. If you give an agent full access to your inbox, or an account, or a full credential, then you are authorising the agent at that moment to do everything that is possible with those credentials. So we cannot say, the model hallucinated this. The problem is when you assign the privileges, the problem is when you assign the capability."**

| The Common (Wrong) View | The Reframe |
|-------------------------|-------------|
| The model did it; blame the model | You authorised it when you assigned the privileges |
| Accountability at execution time | Accountability at provisioning time |
| "It hallucinated" excuses the outcome | Granting full access authorised the full blast radius |
| Fix the model | Fix the privilege assignment |

This is the key move: an agent given broad credentials has been authorised, at that moment, to do anything those credentials permit, so a hallucination or a prompt injection that misuses them is not the model's fault in the sense that matters, it is the consequence of over-provisioning. Accountability therefore lives at provisioning time, in the assignment of privileges and capabilities, which is exactly where PKI and the vault operate (cross-ref: the PKI-not-secrets brief). This reframes the entire agent-safety problem from "control the model's behaviour" to "control the model's privileges," which is a tractable, cryptographic problem rather than an unsolved alignment one.

## The Danger: The Union Of A Swarm's Privileges

The consequence, restated sharply for the agentic world (cross-ref: the blast-radius briefs' restrict-to-unleash): **the irony is that the more you lock agents down, the more powerful they become, because the real danger is the union of all a swarm's privileges being available at once.**

The project lead: **"the more we lock these things down, the more we limit what an agent can do, the more powerful they become, because especially when you have a swarm of agents, as is already happening, where systems spin up many agents with vast numbers of capabilities, all these privileges they have access to, you need to contain that. You do not want the union of all the privilege capability to be available all the time."** So with swarms (systems spinning up many agents, each with many capabilities), the threat is not any one agent; it is the **union** of all their privileges being simultaneously available, an enormous, ungoverned blast radius. Containing that union, so each agent has only the narrow, often ephemeral privileges it needs for its task, is what makes the swarm safe, and (the restrict-to-unleash point) safe is what lets you give the swarm real autonomy. Locking down is not the opposite of power; it is the precondition for it. (The specific tool names in the memo were partly unclear in transcription and are left general.)

## Many Keys, Not One: The Master Key Is Just Today's Token

The structural model: **an agent has as many keys as the granularity of the actions and data it needs, not one key, and a single master key is just today's authentication token.**

The project lead: **"the agent does not have one public and private key. The agent has almost as many keys as the granularity of the actions and the data it needs. You can have an Uber key, and everything goes from there, but that is almost the authentication token, which is what is happening now. In very few cases does the agent actually get given secrets to connect to specific things, only at the end, in very specific places, and I would argue in secure enclaves."** So the model is many granular keys per agent (per action, per dataset), not one. A single overarching master key is exactly today's all-powerful authentication token, the thing to move away from. And actual secrets (to connect to a specific system) are given rarely, only at the very end, in very specific places, ideally in secure enclaves. The default is keys (granular, gated, often ephemeral); secrets are the rare exception at the edge.

## The Vault As The Agent's Keyring

A concrete primitive: **an SG vault given to an agent holds all the public and private keys it needs to operate.**

The project lead: **"assume there is an easy way to deliver private keys to an agent. For now, assume there is an SG vault given to an agent that contains all the multiple public and private keys the agent needs to operate. Some of those keys are identities or actions the agent needs to have; some are other third parties the agent needs to talk to."** So the vault is the agent's keyring: it carries the agent's own identity and action keys, plus the public keys of the third parties (other agents, suppliers, services) it needs to communicate with. This makes the abstract many-keys model concrete: the agent operates out of a vault that holds its keys, and how those keys get there (delivery, the identity-provider partnership) is taken as solvable and covered elsewhere (cross-ref: the PKI-not-secrets brief's identity-provider partnership).

## The Chain Of Authenticity: Signed Keys, TLS-Like, Not Blockchain

A sharp architectural point on how trust is established: **public keys are signed by other public keys, forming a chain of authenticity, a simple hash of signatures like TLS, not blockchain, rooted in a specific set of root authorities.**

The project lead: **"to receive a message from another agent you need their public key, which gives assurance you are receiving it from the right agent. Public keys can be signed with other public keys, so there is a chain of authenticity. From a public key I should be able to figure out: is this a valid key from this company, did it come from this supplier, from this agent, who controls this agent? You can have key after key after key, and it is just a simple hash of signatures, not blockchain, just like how TLS works. The difference is we are not having tens of thousands of root authorities; we have a very specific set of root authorities, which is what the identity solution companies should be providing."**

| The Model | Detail |
|-----------|--------|
| **Signed keys** | A public key is signed by another, forming a chain |
| **What it reveals** | Is this key valid, from this company, this supplier, this agent; who controls the agent |
| **The mechanism** | A simple hash of signatures, like TLS/SSL, not blockchain |
| **The roots** | A specific, small set of root authorities, the identity providers |

So trust is established the way TLS already establishes it: a chain of signatures back to a root authority, a simple, well-understood hash-of-signatures mechanism, explicitly not blockchain. The one deliberate difference from the public web PKI is the root authorities: rather than tens of thousands of public certificate authorities, NHI 2.0 wants a specific, curated set of roots, and that is precisely the role the identity-provider companies should play (cross-ref: the PKI-not-secrets brief's identity-provider partnership): they are the root authorities that anchor the chain of authenticity for agents. From any agent's key you can walk the chain to answer "who controls this, and can I trust it."

## Key-Controlled Memory And Context

The other major new idea, and a powerful one: **you control an agent's memory, context, and prompt by controlling the keys it holds, because the data is encrypted and only decryptable with the right key.**

The project lead: **"each agent needs data, needs memory, and memory can be provided by a vault, and memory can be encrypted and protected by key. I can have a vault with a lot of information for a project, but if the agent does not have the private key to decrypt that data, then although the agent has access to the vault, it cannot access the data. So we control the memory of the agent, the prompt and the context, by controlling the public and private keys it has access to, which is controlling the data it can access. And just doing this will dramatically reduce costs."**

| Without Key-Controlled Memory | With Key-Controlled Memory |
|-------------------------------|----------------------------|
| The agent sees all the data in its context | The agent decrypts only what its keys permit |
| Access to the vault means access to the data | Access to the vault without the key means no data |
| Context is ungoverned | Context, memory, and prompt are key-gated |
| Large context, high token cost | Minimal necessary context, lower token cost |

This is a genuinely powerful primitive: an agent's memory is a vault, the data in it is encrypted, and the agent can only read what it holds the key for, so controlling the keys controls the agent's memory, context, and prompt, and therefore what it can know and do. It is least-privilege applied to knowledge, not just actions. And it has a direct cost benefit: by giving the agent only the keys for the data it actually needs, you minimise its context, which dramatically reduces token cost (cross-ref: the prompt-context-token-management and skill-lifecycle briefs). Governing knowledge by key is both a security control and a cost control.

## The Agent Loop In PKI Terms

Pulling the primitives into the agent's operating loop: **an agent reads data (decrypting with its keys), does something (with a capability granted narrowly), and writes output (signed and encrypted for the recipients), with provenance on every access.**

The project lead: **"most agents need data in, the information, so they need keys to access and decrypt the data. They need to do something, given via another vault or a secret for the capability. Then they put the output in another location, sign it, and encrypt it for the recipients. So you have a flow of decryption, encryption, and signing. Every piece of data the agent accesses has complete provenance to where it was given to that agent."**

```
   READ          ->   DO                ->   WRITE
   decrypt input      capability granted     encrypt + sign output
   with the agent's   narrowly (a key, or    for the recipients
   keys               a secret at the edge)
                                              |
   every access provenanced: where the data came from,
   who gave it to the agent, gated and signed throughout
```

So the agent's loop is a flow of decrypt (read what its keys permit), act (with a narrowly granted capability), and encrypt-and-sign (write output for the intended recipients), and because every step is key-gated and signed, every piece of data the agent touches has complete provenance back to where and from whom it was given. This is the verifiable-chain primitive (from the foundation above) realised as the agent's actual operating loop, and it is what makes an agent's behaviour accountable and explainable by construction.

## What This Asks For

1. **Build on the PKI primitives** (confidentiality, identification, mutual authentication, least privilege, zero trust, verifiable provenance).
2. **Locate accountability at provisioning time** (authorise by assigning privileges; do not blame the model; fix the privilege assignment).
3. **Contain the union of a swarm's privileges** (each agent narrowly scoped; never the union available at once; restrict to unleash).
4. **Give each agent many granular keys, not one** (per action and dataset; a master key is today's token; secrets only at the edge, in enclaves).
5. **Use the vault as the agent's keyring** (an SG vault holding the agent's identity, action, and counterparty keys).
6. **Establish trust via the chain of authenticity** (signed keys, TLS-like, not blockchain; a specific set of root authorities, the identity providers).
7. **Control memory and context by key** (the agent reads only what its keys decrypt; least-privilege for knowledge; lower token cost).
8. **Run the agent loop in PKI terms** (decrypt to read, act narrowly, encrypt and sign to write; provenance on every access).
9. **Carry the foundation into the series** (the use cases and workflows in the coming NHI 2.0 memos build on these primitives).

Estimated effort: this is the conceptual foundation for the NHI 2.0 series, built on the existing PKI, vault, provenance, and context primitives; the contribution is the first-principles framing (accountability at provisioning, the chain of authenticity, key-controlled memory). The proof is an agent operating out of a key-holding vault, reading only what its keys decrypt, acting narrowly, and writing signed, encrypted, provenanced output.

## What This Does Not Try To Be

- **Not model-behaviour control.** It controls privileges, not the model; accountability is at provisioning.
- **Not one key per agent.** Many granular keys; a master key is the thing to move away from.
- **Not blockchain.** A simple hash of signatures, like TLS, with a curated set of root authorities.
- **Not ungoverned memory.** Memory and context are key-gated; the agent knows only what its keys permit.
- **Not the whole series.** The first, foundational brief; the use cases and workflows follow.

## Honest Risks

**Risk 1: Key delivery and management at agent scale.** Many keys per agent, across swarms, is a management challenge. Mitigation: the vault as keyring; the identity-provider partnership as the root authorities and key distributors (cross-ref: the PKI-not-secrets brief); ephemeral keys reduce standing exposure.

**Risk 2: The accountability reframe is cultural as much as technical.** "Blame the provisioning, not the model" cuts against common framing. Mitigation: it is also the tractable framing (privileges are controllable; model behaviour is not fully); make the case clearly; it aligns with zero trust and least privilege.

**Risk 3: The chain of authenticity needs the right roots.** A curated set of root authorities must exist and be trusted. Mitigation: this is the identity-provider partnership's role (cross-ref: the PKI-not-secrets brief); build on proven TLS-style mechanisms, not novel cryptography.

**Risk 4: Key-controlled memory adds complexity to agent runtimes.** Decrypting per-key in the loop is work. Mitigation: the vault provides the memory and the keys; it also cuts token cost, so there is a direct payoff; start simple.

**Risk 5: Secrets at the edge remain a weak point.** Real secrets are still given in specific places. Mitigation: minimise them, push them to the very end, in secure enclaves; default to keys everywhere else.

## Open Questions

| Question | Notes |
|----------|-------|
| How are keys delivered to agents at scale? | The vault keyring; the identity-provider partnership; ephemeral keys |
| How is the chain of authenticity rooted? | A specific set of root authorities, the identity providers; TLS-style |
| How does key-controlled memory work in the agent runtime? | The agent decrypts only what its keys permit; the vault is the memory |
| Where do real secrets still appear? | At the edge, in specific places, ideally secure enclaves |
| How is the provisioning-time accountability operationalised? | Govern privilege assignment; audit the grants, not just the actions |
| How is the union-of-privileges contained for a swarm? | Each agent narrowly scoped; never the union available at once |
| What are the first use cases in the series? | The coming NHI 2.0 memos build workflows on these primitives |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 4 Jun | `v0.32.3__strategy-brief__sg-send-nhi-2.0-agent-identity-startup-thesis.md` | The umbrella synthesis; this is the first-principles foundation beneath it |
| 3 Jun | `v0.31.12__arch-brief__sg-send-pki-not-secrets-vaults-identity-provider-partnership.md` | The PKI paradigm, ephemeral keys, the identity-provider root authorities |
| 2 Jun | `v0.31.9__strategy-brief__sg-send-blast-radius-cybersecurity-company-2026.md` | Restrict-to-unleash; containing the blast radius; the union of privileges |
| 3 Jun | `v0.31.12__dev-brief__sg-send-vault-to-vault-comms-append-token-pki.md` | Encrypt-on-write; agents reading only what their keys permit |
| 3 Jun | `v0.31.12__faq__sgraph-protocol-harness-or-workflow.md` | Provenance as the medium; the agent loop's signed, auditable trail |
| 26 May | `v0.27.62__arch-brief__sg-send-vault-in-vault-kernel-model-no-origin-iframes.md` | Secure enclaves and sandboxing for the rare edge secrets |
| 24 May | `v0.27.x__arch-brief__sg-send-prompt-context-token-management.md` | Key-controlled memory cutting context and token cost |
| 4 Jun | `v0.32.3__strategy-brief__sg-send-skill-lifecycle-explorer-to-town-planner-english-to-code.md` | Token cost reduction through controlling context |

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | The PKI primitives are the foundation | Confidentiality, identification, mutual auth, least privilege, zero trust, provenance |
| 2 | Accountability is at provisioning time | Authorise by assigning privileges; do not blame the model |
| 3 | The union of a swarm's privileges is contained | Each agent narrowly scoped; never the union at once |
| 4 | Agents have many granular keys, not one | Per action and dataset; secrets only at the edge |
| 5 | The vault is the agent's keyring | An SG vault holding the agent's keys |
| 6 | Trust uses the chain of authenticity | Signed keys, TLS-like, not blockchain; curated root authorities |
| 7 | Memory and context are key-controlled | The agent reads only what its keys decrypt; lower token cost |
| 8 | The agent loop runs in PKI terms | Decrypt to read, act narrowly, encrypt and sign to write; provenance throughout |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
