# RiskMandate.ai Product Roadmap: Shipping on the Core We Already Have

**Framing.** This roadmap is deliberately constrained to items that run on core technology already built. Every item below is customisation, vault structuring, a mini-app on top of a vault, content, LLM-packaging, a connector, or a deployment target. None of it requires new core technology. The one enabler that needs finishing rather than merely configuring is called out explicitly.

## The core building blocks (what "already developed" means)

| Block | What it gives us | State |
|-------|------------------|-------|
| SG/Send | Zero-knowledge vaults, client-side encryption, PKI for attribution, provenance | In production |
| SGit | Vault versioning, predefined file structure, commit log as audit | Built |
| SG/Compute | The compute layer for agents, jobs, connectors, and metering | Built |
| Vault-powered mini-site model | Static-vault projection, vault-loader, DNS-to-vault mapping file, client-side decryption, QA and prod split | Proven on the SGraph-AI library; publish-to-prod is the one piece to finish |
| S3-compatible vault container | The vault behind an S3-compatible interface with swappable backends, so it runs on any storage | Built |
| Vault-as-serverless-database | Folders and files, versioned, queryable, no database | Built |
| Semantic graph on vaults | Nodes, edges, evidence as vault files; directed inward and outward paths; node type formulas | Modelled; instances exist (2FA mappings as JSON) |
| Mini-apps | Vault-in-vault apps whose UI and data load from vault objects | Pattern proven (the vault app UI already loads from vault data) |
| LLM packaging | One body of analysis repackaged for many audiences | Available via SG/Compute |
| On-demand billing and metering | Usage-based, pay-for-what-you-use billing, as planned for SG/Vault | Planned and shared with SG/Vault |
| Black-box I/O contract | Named inputs (feeds) and outputs (incidents, tasks) with a strict handover boundary | Defined |

## Already shipped (the baseline this builds on)

- riskmandate.ai is live as a client-rendered, vault-powered site.
- The first MVP of the scenario documents (the how-long-would-you-accept series) is shipped on riskmandate.ai, which validates the vault-site-plus-content model end to end.
- The SGraph-AI library proves the vault-powered mini-site architecture in production.
- SG/Send, SGit, and SG/Compute are in production.

## Enabler: finish the deployment pipeline

| Item | Delivers | Block | Work |
|------|----------|-------|------|
| E1. Publish-to-prod and vault-loader library | Every new site becomes a DNS entry, a mapping row, and a vault, hosted as pure static plus client-side decryption | Vault-powered mini-site model | Finish the publish workflow and refactor the read-side JS from the SGraph web repo into the vault-loader library. This is the one item that is engineering on top of the core rather than pure configuration, and it unlocks everything in Phase 1 cheaply |

## Phase 1: Content and story (pure vault and content, fastest)

Builds directly on the shipped scenario MVP and the library brief.

| Item | Delivers | Block | Work |
|------|----------|-------|------|
| 1.1 The Library | The vault-backed archive with a librarian agent: the corpus, the history, the infographics | Mini-site, SGit, LLM packaging | Vault content plus mini-site plus agent |
| 1.2 Use-case mini-sites | One site per use case (2fa, oauth, calendar), each pointed at its own vault | Mapping file, vault-loader | DNS plus mapping row plus vault per site |
| 1.3 Dynamic scenario survey | The gamified, vault-captured version of the shipped static scenarios, capturing first-instinct data | Vault-as-database, mini-app, client-side | Mini-app plus vault capture, extending the shipped MVP |
| 1.4 Scenario and infographic packs | More scenarios as LinkedIn statics and vault-backed interactives | Content, canvas or image gen | Content |
| 1.5 Partner, consulting, and marketplace pages | The go-to-market surfaces from the partner briefs, as site pages | Mini-site, content | Content |
| 1.6 RAMM published site and repo | The RAMM first pass as a vault-powered site and a public repo, seeding the OWASP project | Mini-site, content | Content plus repo |

## Phase 2: Product surfaces (vault mini-apps on the graph)

| Item | Delivers | Block | Work |
|------|----------|-------|------|
| 2.1 Risk register as a vault graph | The nodes, edges, and evidence of the register as vault files; the 2FA instance is already mapped as JSON | Vault-as-database, semantic graph on vaults | Data structuring plus vault |
| 2.2 Graph viewer | A client-side mini-app that reads the vault graph and renders paths, cascade, and propagation | Vault-loader, client-side render | Mini-app |
| 2.3 Risk queue MVP | The queue with trifecta status, exposure clock, and a time-bound decision per item | Vault-as-database, mini-app | Mini-app |
| 2.4 Acceptance flow | Accept-in-a-direction and for-an-interval, written as an SGit commit so provenance and audit come for free | SGit commit-as-audit, vault | Mini-app plus vault write |
| 2.5 Acceptance dashboard | The red, green, and action-point view, computed from the vault graph | Vault graph, client-side | Mini-app |
| 2.6 Capability certificate | A scoped, PKI-signed grant with a block list, stored in a vault | SG/Send PKI, vault | Vault plus signing, using existing crypto |

## Phase 3: Demo and maturity (composed from Phases 1 and 2)

| Item | Delivers | Block | Work |
|------|----------|-------|------|
| 3.1 Demo app | Discovery to acceptance dashboard, then stakeholder-packaged outputs; anonymous intake; air-gapped | Vault, mini-app, LLM packaging | Compose Phase 1 and 2 plus anonymous intake |
| 3.2 RAMM maturity queries | A computed maturity level from graph queries over the acceptance vault | Vault graph, node type formulas | Queries |
| 3.3 Agentic overlay | Capability certificate, authorization closure, and agent twin as vault entities | Vault graph, PKI | Vault entities plus queries |

## Phase 4: Platform, billing, and enterprise deployment (cross-cutting)

These are cross-cutting capabilities rather than a strictly later stage, and they can be pulled forward by commercial need: billing as soon as there is revenue to take, customer-owned deployment for a specific enterprise deal, integrations to fit a customer's stack for the demo.

| Item | Delivers | Block | Work |
|------|----------|-------|------|
| 4.1 On-demand billing | Usage-based, pay-for-what-you-use billing with no subscription, the same on-demand model planned for SG/Vault, friendly to bring-your-own-keys | On-demand billing and metering, SG/Compute | Configure the shared SG/Vault billing and meter RiskMandate usage across vault operations, compute, and LLM packaging; price per use. No separate billing system |
| 4.2 Run on customer-owned environments | The whole stack deployed into the customer's own cloud or on-premises, with the customer holding the keys and the data never leaving their environment; sovereignty, residency, and air-gap by design | S3-compatible vault container, vault-powered mini-site model, SG/Send zero-knowledge PKI, local-first Docker | Package the deployment and target the customer's S3-compatible storage and compute. No new core, because the S3-compatible container and the run-anywhere mini-site model already exist |
| 4.3 Integrations with security, workflow, and GRC tools | Feeds in from security and detection tools, and outputs, incidents and tasks, out to workflow and GRC tools, so RiskMandate fits the stack the customer already runs | Black-box I/O contract, SG/Compute, LLM packaging | Build a connector per tool: map the tool's data into the vault-graph inputs, and map RiskMandate's outputs into the tool's tasks or tickets. Air-gapped, so feeds and tasks only, never operating the customer's systems |

## What this roadmap deliberately excludes

The discipline is that nothing here builds new core technology. We do not build a new database, because the vault is the serverless, versioned database. We do not build new cryptography, because SG/Send PKI already signs and attributes. We do not build a new hosting platform, because the vault-powered mini-site model already serves static, client-decrypted sites anywhere. We do not build a new graph engine, because the semantic graph lives as vault files. We do not build a new billing system, because RiskMandate uses the on-demand model already planned for SG/Vault. We do not build a new deployment platform for customer environments, because the S3-compatible vault container and the run-anywhere mini-site model already provide it. And integrations are connectors on the existing I/O contract, not new core. Every item is customisation, vault, connector, or deployment work on top of those blocks.

## Sequencing rationale

- E1 first, because finishing publish-to-prod turns every Phase 1 site into a one-line deployment.
- Phase 1 next, because it is pure content and vault work, it compounds the momentum of the shipped scenario MVP, and 1.6 directly feeds the OWASP priority.
- Phase 2 builds the product surfaces as mini-apps, all reading and writing the same vault graph, so 2.1 comes before the apps that render it.
- Phase 3 composes the demo and the maturity model from what Phases 1 and 2 already produced, so it is assembly rather than new build.
- Phase 4 is cross-cutting and driven by commercial pull: billing is pulled forward the moment there is usage to charge for, customer-owned deployment the moment an enterprise deal requires it, and the first integrations the moment the demo needs to land inside a customer's stack.

## The technology track underneath

The product items above map onto a stable technology track: SG/Send and SGit provide the vault, the versioning, the PKI, and the provenance; SG/Compute runs the agents, the LLM packaging, the connectors, and the metering; the vault-powered mini-site model and the S3-compatible vault container serve every surface and every deployment target, including customer-owned environments; on-demand billing is the SG/Vault model applied to RiskMandate usage; and the semantic graph on vaults is the single data model that the register, the queue, the dashboard, the RAMM, the demo, and the integrations all read from and write to. The track does not change across the phases; only the vaults, the mini-apps, the connectors, and the deployment targets on top of it do.
