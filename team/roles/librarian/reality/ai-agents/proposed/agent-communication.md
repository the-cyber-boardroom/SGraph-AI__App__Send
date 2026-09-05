# AI Agents — Proposed: Agent Communication, MCP, and Security Tools

**Domain:** ai-agents/proposed/agent-communication | **Last updated:** 2026-09-01 | **Maintained by:** Librarian (daily run)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

---

## MCP Gaps (DOES NOT EXIST)

| Feature | Status |
|---------|--------|
| MCP `secrets_create` tool | DOES NOT EXIST — listed as gap |
| MCP `secrets_status` tool | DOES NOT EXIST — listed as gap |
| MCP `rooms_create` tool | DOES NOT EXIST — rooms API exists but not MCP-exposed |
| MCP `rooms_add_user` tool | DOES NOT EXIST |
| MCP `rooms_revoke_user` tool | DOES NOT EXIST |
| MCP transport backend for sgit | DOES NOT EXIST |

## sgit CLI Extensions (Proposed)

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| `sgit-ai sync <remote>` | Pull + push in one operation for multi-remote vaults | Section 19 |
| `sgit-ai dump --local / --remote` | Vault state diagnostics tool | Section 16 |
| `sgit-ai diff-state` | Local vs server comparison | Section 16 |
| `sgit share --auto` | Auto-refresh share token on every push | Section 18 |
| `.sgitignore` support | Pattern-based exclusion from vault commits | Section 16 |
| `.keep` files for empty directories | Git-compatible empty directory handling | Section 16 |

---

## Communication Vault Pattern (05/11 brief — doc 362)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Communication vault template | Structured vault: initial prompt + SKILL.md + messages folder for agent-to-agent messaging | doc 362 |
| Email-FS-light bidirectional protocol | Standardised bidirectional agent-to-agent message format in vault | doc 362 |
| Per-agent protocol pages | Audience-specific agent pages (Lovable, Claude Code, Cursor, ChatGPT) | doc 362 |

---

## QA Stack on SG/Compute (05/12 brief — doc 374)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Vault-driven QA control surface (SG/App) | Test definition, execution, results — all stored in vault | doc 374 |
| iframe injection test runner | Fast in-process tests for our own pages | doc 374 |
| Playwright integration | Real browser automation for any site | doc 374 |
| Scheduling layer (cron-equivalent) | Run tests on intervals; requires SG/Compute cron support | doc 374 |

---

## AppSec Mini-Tools (05/16 briefs — doc 423)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-159 | Threat-modelling mini-tool on vaults | StrideGPT (mrwadams) integration; STRIDE + OWASP LLM Top 10 + MAESTRO pattern detection | doc 423 |
| P-160 | Client-side mode: threat modeller in browser | Runs entirely in vault JS API context; no server-side compute; offline-capable | doc 423 |
| P-161 | Ephemeral compute-backed mode | FastAPI backend on SG/Compute; Fargate task per session; heavier analysis possible | doc 423 |
| P-162 | AppSec vault schema for threat artefacts | System descriptions, threat lists, attack trees, mitigations, evidence — all in vault | doc 423 |
| P-163 | SBOM analysis mini-tool (planned next) | syft/cdxgen integration; vault holds SBOM + change history; planned after threat modelling | doc 423 |
| P-164 | Dependency scanning mini-tool (planned next) | trivy/grype integration; vault tracks findings and fixes; planned after threat modelling | doc 423 |

---

## Vault Communications Demo + PKI (06/03 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-312 | Three-Agent Comms Demo Vault | Browser harness proving vault-to-vault messaging: 3 agents each with iframe inboxes; internal JS API (ping, send, receive, markReceived); step-by-step validation harness; manual round-trip proof first, then agentic via OpenRouter; key design principle: agents only share what they explicitly message (no full vault access); scale path 3 → 5 → 100s → 1000s; accountant experiment as first real use case. Depends on vault inbox (NOW EXISTS). | 06/03 dev-brief |
| P-315 | Skills Library as Platform Feature | A vault holding skills from multiple sources (Tessl, Anthropic, Pi, platform own). Library management: provenance tracking, sync from source, applicability scoring, evidence (screenshots, test results). Sharp insight: how-to-deploy-and-run knowledge fills a real gap (Claude couldn't run an Anthropic legal skill from a URL alone — deployment context was missing). Differentiator: talk-to-skill (on-demand vault instance), per-skill budgets, per-skill billing. Foundation for skills marketplace (P-297). | 06/03 strategy-brief |
| P-316 | SG/Vault as Platform of Primitives — Positioning | SG/Vault is a hyperscaler for shared state, not a category product. Dissolves the protocol/harness/workflow question by sitting beneath all three (noun, not verbs). Three-layer model: bottom (vault primitives), middle (heterogeneous agents/workflows/manual), top (bespoke UX). Two views: invisible-vault (users never see it) and builder-platform (developers see the structure). Restrict-to-unleash flywheel (tight primitive scope → safe, wide autonomy for builders). Superpower: builders are users of the same platform (tight feedback loop, features driven by real use). | 06/03 strategy-brief |

---

## Agent Enrolment Architecture (19 Aug 2026, v0.33.60)

**PROPOSED — does not exist yet.** All items below are architecture proposals from doc 957 (enrolment arch-brief) and doc 958 (bootstrap trap strategy-brief). The append lane transport they require EXISTS; all other components are proposed. Do not describe these as shipped.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ENR-001 | Canonical enrolment object | Signed canonical request: type/version, project, subject public key + fingerprint, optional identity label + agent type, optional requested mandate (role/scope), created_at + nonce, proof of possession (signature over canonical request). Serialisation format not yet specified — blocking implementation. | docs 957, 958 (v0.33.60) |
| P-ENR-002 | Enrolment client | Agent-side: generates keypair, builds canonical enrolment request, posts to vault append lane. Starting state: computation + randomness + own private key, nothing else. | doc 957 (v0.33.60) |
| P-ENR-003 | Trusted processor | Reads enrolment inbox (append lane), verifies proof of possession, applies issuer policy, invokes CA to issue identity certificate. Holds read access to inbox; issues to registry. CA key is highest-risk key in architecture — storage must be specified before this component is built. | doc 957 (v0.33.60) |
| P-ENR-004 | Identity registry | Records what has been recognised: this key is this agent. Enforces three rules from 2019 keyserver failure: owner writes own record only; revocation is a signed append (not deletion); records are size-bounded. Separate from the mandate registry. | doc 957 (v0.33.60) |
| P-ENR-005 | Mandate as separate signed statement | Identity and mandate are distinct objects: identity says "this key is this agent" (revoked when key is compromised); mandate says "this agent may do these things, until this date, on whose authority" (revoked when permission changes). They revoke independently; mandate is third-party checkable without asking the issuer. | docs 957, 960, 961 (v0.33.60) |
| P-ENR-006 | Mandate registry | Records issued mandates. Separable from identity registry — different revocation conditions, different issuers. | doc 957 (v0.33.60) |
| P-ENR-007 | Fractal registry (registries recognising registries) | Each registry can vouch for keys recognised by another registry. Requires each registry to declare which trust roots it accepts — without declared roots the chain is unevaluable. Who may be a trust root is a privileged decision needing a stated answer. | doc 957 (v0.33.60) |
| P-ENR-008 | Client-side sealing layer | Browser/client flow: generate recipient keypair (RSA-OAEP 4096 + ECDSA P-256, per shipped PKI), seal payload to recipient public key, derive vault lane address from hash of recipient public key. **The append lane server side is SHIPPED. This client sealing layer is PROPOSED.** The command-line tool ships recipient encryption but the in-browser end-to-end sealing flow is unverified. Do not document as shipped until code audit confirms. | docs 959, 961 (v0.33.60) |
| P-ENR-009 | Lane address derivation from recipient public key hash | An agent's vault lane address = hash of its public key. Self-addressing: an agent that has generated a keypair already knows its own lane address without asking anybody. **PROPOSED — no shipped command emits this derivation.** | doc 959 (v0.33.60) |

---

## Execution Broker / Mandate Broker (19 Aug 2026, v0.33.60)

**PROPOSED — does not exist yet.** All items below are architecture proposals from doc 960 (service twin arch-brief) and confirmed by market research in doc 962. Naming: "service twin" collides with "digital twin" (graph-meets-reality in risk mandate architecture); rename to "execution broker" or "mandate broker" before any schema, code, or documentation uses the current name.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-BRK-001 | Execution broker (mandate broker) | Agent presents signed mandate + action; broker verifies, performs the action using broker-held credentials, returns signed receipt. The agent never holds the credential. Closes the authorised-misuse boundary that capability grants, vault kernel plan-then-execute, and relay pattern per-agent keys each named as their own limit. | doc 960 (v0.33.60) |
| P-BRK-002 | Mandate object with constraints | Subject, issuer, service/instance, capability, resource, constraints (allowed paths, file count, branch), workflow/stage, environment, validity window, usage limit, signature. Enforcing constraints requires interpreting the request per provider per capability — not proxying. | doc 960 (v0.33.60) |
| P-BRK-003 | Signed execution receipt | Broker-signed: named broker executed named action for named agent under named mandate at named time. Creates an evidence chain independent of mutable platform audit logs. Receipt can feed later workflow stages directly. | doc 960 (v0.33.60) |
| P-BRK-004 | Provider adapter (per-provider, per-capability) | Maps abstract action name to provider-specific request format, implements constraint enforcement in provider terms. Each provider and each capability is a separate maintenance commitment. First capability must go all the way through (identity → mandate → constraint enforcement → execution → receipt) before any breadth. | doc 960 (v0.33.60) |
| P-BRK-005 | Broker identity (enrolled agent) | The broker itself must be enrolled using the same architecture as any other agent. An agent must be able to verify which broker it is talking to and refuse to send a mandate to an unrecognised one. | doc 960 (v0.33.60) |
| P-BRK-006 | Credential store (per-tenant, isolated) | The broker holds service credentials for every service and every tenant. This inverts the catastrophic-failure property of the rest of the architecture: total compromise yields every credential usable immediately. Self-hosting is the mitigation. Credential storage boundary is the highest-priority security design task. | doc 960 (v0.33.60) |
| P-BRK-007 | Per-execution billing via settlement rail | A per-execution charge using the settlement protocol (sub-cent transactions, no account required, price-unknown-in-advance scheme). Receipt is the billable record — same artefact serves audit and billing. | doc 960 (v0.33.60) |

---

## Vault-As-Substrate / Blackboard Architecture (02 Aug 2026, v0.33.55)

All items below are PROPOSED — does not exist yet. Vault primitives (append, two-key, ephemeral compute) are EXISTS.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ACT-023 | Vault-as-substrate asynchronous agent collaboration | Agents with distinct responsibility, capability and focus collaborate via encrypted vault folders; no direct addressing — agents write where they may, read when they choose; blackboard architecture; authorisation, audit and confidentiality answered by the medium rather than the application; significantly outperforms controller-assigned arrangements (13-57% relative improvement per literature) | doc 915 (v0.33.55) |

---

## Agent Enrolment and NHI Architecture (19 August 2026, v0.33.60)

All items below are PROPOSED — does not exist yet.

**Note on existing infrastructure:** The append lane (write, configure, list, fetch, mark-processed,
purge) is EXISTS — see `send-api/index.md` and `vault/index.md`. The four-tier capability model
is EXISTS. The items below are proposed USES of that infrastructure, not proposals to build it.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-NHI-001 | Agent enrolment via append lane | Agent starts with only a keypair; constructs signed enrolment request (proof of possession, not trustworthiness); delivers to inbox via account-less append write; trusted processor applies policy and issues certificate; no borrowed authority required at bootstrap | doc 958 (v0.33.60, 19 Aug) |
| P-NHI-002 | Trusted processor + CA + registry pipeline | Separate components: enrolment inbox (receive only), trusted processor (read inbox + apply policy), certificate authority (hold issuing key), registry (publish issued identities + mandates); authority never exposed to untrusted side | doc 958 (v0.33.60, 19 Aug) |
| P-NHI-003 | Service twin / execution broker | Agent sends mandate + signed request; broker verifies identity, mandate, and context; executes ONLY the permitted operation using credentials held inside its own boundary; agent never receives the credential; closes the authorised-misuse boundary capability grants / plan-then-execute / per-agent keys each named as their limit | doc 960 (v0.33.60, 19 Aug) |
| P-NHI-004 | Identity / mandate separation | Identity and mandate are separate signed statements; they are issued, revoked, and reasoned about independently; a valid identity does not imply permission; a mandate change does not require a new identity; checkable by third parties without asking the issuer | docs 958, 961 (v0.33.60, 19 Aug) |
| P-NHI-005 | Fractal registries with declared trust roots | Registries recognise other registries; each must declare which roots it accepts, or the trust chain cannot be evaluated; required before any multi-registry federation scenario | doc 958 (v0.33.60, 19 Aug) |
| P-NHI-006 | Lane addressing by pubkey hash (client-side derivation) | `append_token = H(pubkey)` addresses a lane by the recipient's key; agent knows its own lane address without a directory lookup; **client-side derivation only, not yet shipped server-side** — do not code against this until the server-side derivation ships | doc 959 (v0.33.60, 19 Aug) |

---

## Mandate Execution Broker (19 Aug 2026, v0.33.60)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-MEB-001 | Mandate execution broker | Agent presents a signed mandate; broker verifies the mandate and executes the specified action against an external service using credentials the agent never sees; broker returns a signed receipt. Unit of delegation moves from credential access to authorised action. Closes the "authorised party misusing authority it legitimately holds" boundary named by three prior briefs (plugins 06 Aug, vault kernel 06 Aug, relay pattern 16 Aug). Mandate schema: subject, issuer, service/instance, capability, resource, constraints, workflow/stage, environment, valid_from/until, usage_limit, signature. Receipt: signed by broker; cannot be amended; can feed later workflow stages; works for rented agents without attestation. **Concentration risk**: broker holds all credentials for all services and all tenants — inverts the catastrophic failure property the vault achieves; self-hosting is the mitigation (not an enterprise upsell). **Naming collision**: "Service Twin" collides with "digital twin" (established corpus term); recommended rename: Mandate Broker or Mandate Execution Broker. | doc 959 (v0.33.60) |

---

## Grant/Mandate Registry and Agent Identity (20 August 2026, v0.33.61)

All items below are PROPOSED — does not exist yet. Source: 17 briefs from `team/humans/dinis_cruz/briefs/08/20/` (docs 963–979).

**Vocabulary note (doc 963):** The July identification "to grant is to mandate" (v0.33.49) is corrected. A **grant** is the union of capabilities conferred at assignment. A **mandate** is what the holder is authorised to do. The gap (grant minus mandate) is **excess authority** — measurable, unaccepted by construction, and defaults to critical.

**Governing rule (doc 970):** A key belongs to whatever can keep a secret. Everything else is signed by something that can. Per-object published private keys are rejected: publishing the private half destroys the integrity a signature was meant to supply.

### Registry Architecture

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-REG-001 | Grant/mandate gap measurement | Report or UI showing excess authority (grant minus mandate) as a count; requires mandate stored as allow-list; allow-list form required for the measurement to be well-defined; prohibitions are annotations, not the enforcement surface | doc 963 (v0.33.61, 20 Aug) |
| P-REG-002 | Register UI with six-field verification badges | Every trust edge carries: claim, verifiable-by ("Nobody" is valid and informative), method, cost, last-checked, result; policy = query that must return zero rows when all edges verified and recent; surface claim that a register shows trust fails unless verification is current and visible | docs 967, 970 (v0.33.61, 20 Aug) |
| P-REG-003 | Path-scoped history command | CLI/API command showing what was in a path at any commit; "the register's central query and the one piece of unwritten code"; query over the mutable path pointer; not a new storage mechanism | day index (v0.33.61, 20 Aug) |
| P-REG-004 | Observability/usage graph + revocation latency metric | Route check events to issuer's own lane tagged with the object's identifier; a verification is not a use; missing edges are the finding; metering at the verification step = surveillance; effective revocation latency is computable per issuer/party pair | doc 968 (v0.33.61, 20 Aug) |
| P-REG-005 | Lane anchor behavior spec | Whether a lane with no anchors accepts any token holder is undocumented in the interface reference; gates observability coverage entirely; answer is a documentation update, not a code change | day index / doc 976 (v0.33.61, 20 Aug) |

### Consumer Transparency Register

All items below require legal review before first register entry is published.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-CON-001 | Consumer transparency register | Companies answer whether they hold usage records for a named subscriber; "the refund is the pretext and the record of who answers is the asset"; five-clause questionnaire; publish dated record of what was asked and answered; never publish a characterisation; "does not hold usage data" is a valid, non-penalised response | doc 979 (v0.33.61, 20 Aug) |
| P-CON-002 | Subscription compliance standard (5 clauses) | Adoptable by one company without legislation; every clause observable from outside without company cooperation; tied to EU subscription regime (operative from spring 2027, not yet in force) | doc 979 (v0.33.61, 20 Aug) |
| P-CON-003 | User grant assessment section | High-threat personal page; browser-stores choices (category IDs) not answers — verifiable in network panel; must include efficacy statements (high threat without efficacy produces denial); separate editorial rule from the low-threat general page | doc 973 (v0.33.61, 20 Aug) |

### Explaining-It Tooling

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-EXP-001 | Grant tree persona generator | Adapts the Aug 9 persona generator to produce level × variant grids over grant trees; levels (depth of detail) and variants (rendering/wording) are orthogonal; governing rule: a variant may change emphasis/ordering/vocabulary/format and may never change what is being accepted; checkable: fact-diff across variants must be empty | doc 974 (v0.33.61, 20 Aug) |
| P-EXP-002 | Screenshot boundary part-two service | Rendering agent calls existing browser-automation service; persona agents receive pixels only — page text is a data leak; patience budget is set exogenously; separated from the banned tool by the question it accepts | doc 975 (v0.33.61, 20 Aug) |

### Sites and Shared Drive

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-SITE-001 | Shared drive (watcher + queue + three vaults) | Watcher is the new component; queue was specified May 2026; three vaults architecture is the design; **hard precondition: `.sgitignore` must ship first** — specified March 2026, not shipped, blocks the entire feature; overflow above 16k events loses silently without it | doc 977 (v0.33.61, 20 Aug) |
| P-SITE-002 | Three-site composition page | Single page joining sgit.ai, pki.sgit.ai, and nhi.sgit.ai findings; three sites hold three thirds of one answer with no page between them; host-decision needed first | doc 976 (v0.33.61, 20 Aug) |
