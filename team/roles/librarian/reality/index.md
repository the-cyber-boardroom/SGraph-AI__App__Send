# Reality — Master Index

**Version:** v0.33.64 | **Last updated:** 2026-09-04 | **Maintained by:** Librarian (daily run)
**Structure:** Domain tree — each domain has its own directory with `index.md` and `proposed/`

This file is the entry point. Read it to find the right domain, then go to that domain's
`index.md` for EXISTS details and `proposed/index.md` for PROPOSED items.

**Rule:** If a feature is not listed in a domain index, it does not exist. Proposed features
are labelled PROPOSED. Claimed features that are not in any index DO NOT EXIST.

---

## Domain Map

| Domain | Directory | What It Covers | EXISTS items |
|--------|-----------|----------------|-------------|
| **User API** | [`send-api/`](send-api/index.md) | User Lambda: send.sgraph.ai HTTP endpoints | 32 endpoints (all tested) |
| **Admin API** | [`admin-api/`](admin-api/index.md) | Admin Lambda: auth-protected endpoints | 51 endpoints (all tested) |
| **Vault** | [`vault/`](vault/index.md) | Vault/SGit crypto + storage layer | Key derivation, object CAS, AES-256-GCM |
| **CLI** | [`cli/`](cli/index.md) | sgit CLI (PyPI: sgit-ai) | 20+ commands, verified integrations |
| **Website** | [`website/`](website/index.md) | sgraph.ai website (21 pages, web components) | 21 pages, 11 components, CI pipeline |
| **Browser UIs** | [`ui/`](ui/index.md) | Share (v0.4), Open (v0.4), Admin, Workspace, Vault; v0.3.x user legacy | 5 active + 1 legacy; ~35 web components |
| **Tools** | [`tools/`](tools/index.md) | tools.sgraph.ai browser tools | 4 tools live |
| **Infrastructure** | [`infra/`](infra/index.md) | Deployment, CI/CD, Lambda, Docker | 4 working targets + 8 PROPOSED (multi-target plan) |
| **Security** | [`security/`](security/index.md) | Security properties, violations, AppSec | 11 verified properties |
| **Identity** | [`identity/`](identity/index.md) | Credentials, OAuth, billing | Token auth only (rest PROPOSED) |
| **AI Agents** | [`ai-agents/`](ai-agents/index.md) | Agentic workflows, LLM components, MCP | MCP + Claude vault access verified |
| **QA** | [`qa/`](qa/index.md) | Tests that pass, QA infrastructure | ~2015+ tests, all passing |
| **Alchemist** | [`alchemist/`](alchemist/index.md) | Investor materials, Alchemist system | 3 documents |

---

## Quick Stats (as of 2026-08-22)

| Metric | Count |
|--------|-------|
| User Lambda API endpoints | 33 unique (41 route paths) — vault/zip corrected from PROPOSED to EXISTS (2026-08-25) + `/api/info/sgraph` (Routes__Info__SGraph.py) |
| Admin Lambda API endpoints | 51 unique (61 route paths) |
| Total API endpoints | **83+** |
| Unit tests passing | **~3100+** (977 Python + ~157 vault-UI JS + ~930+ ViV loader suite (373+ base + ~557 from LLM/voice/releases/send-browse-split/image/sync sessions 08/02–08/04: sg_releases 47, pinned_data_source 27, vault_releases_editor 44, sg_llm_config 53, sg_llm 40, sg_llm_vault 17, sg_voice 86, base64_chunk_guard 88, send_browse_split 97, vault_llm_log 35, vault_llm_chat 122, vault_shell_llm_panels 28, app_page_llm_panels 46, vault_llm_requests 29, vault_browse_edit__add_to_chat 13, app_shell_llm_bridge 96, sg_vision 62, no_auto_reload 27) + ~78 app-shell JS + 37 embed-protocol + ~334 inbox/write-batch/owner-secrets suite; browser integration: 8 tests; +10 app-shell-nav-helpers; +19 from Phase A/B/C1: container-app 9→16, auth 7→8, +3 port, +8 deploy-smoke; +146 from 08/15–16 commits: read-key-open +49, sg.llm-harden-P0-P3 +42, sg.llm-P4 +32, vault-settings-listing +9, RO-settings-panel +14) — updated 2026-08-18 |
| Deployment targets | **4 working** (Lambda, Docker Hub, local container, CLI) + **8 PROPOSED** (P-405–P-412: Fargate, AMI, Terraform, one-click deploy, full-cycle CI, publish pipeline, memory-mode licensing, static vault hosting) — DevOps review 2026-08-11 |
| Website pages | 21 |
| Browser UIs | **7** (share v0.4, open v0.4, admin, workspace, vault browser, vault app /en-gb/app; user v0.3.x legacy) |
| Active tools (tools.sgraph.ai) | 4 |
| sgit CLI commands | 20+ |
| Open PROPOSED items (across all domains) | ~1083+ (+10 net-new from 09/04 session: grant/mandate excess-authority measurement, fixture class + private_key_published flag, register UI with verification badges, policy-as-query, check events in issuer's lane, grant tree with control labels, consumer public register, shared drive watcher+queue+vaults, path-scoped history command, lane-with-no-anchors access policy; prev: ~1073+) |
| Total documents catalogued | 979 (+17 from 20 Aug: 6 arch-briefs + 4 dev-briefs + 4 strategy-briefs + 1 cross-team-brief + 1 reference + 1 day-index, v0.33.61; processed 09/04; prev: 962) |
| **Key decision** | **Grant ≠ Mandate** — grant = union of capabilities conferred at assignment; mandate = what the party is authorised to do; excess authority = grant − mandate; corrects July claim "to grant is to mandate"; allow-list mandates only (deny-lists widen silently on supplier releases) (2026-08-20) |
| **Key decision** | **Published private key = fixture, not identity** — a published private half proves nothing (anyone can produce the signature), cannot be promoted, cannot be revoked; fixtures must inhabit a class structurally unreachable from the trust graph; `private_key_published` flag required in register schema (2026-08-20) |
| **Key decision** | **Publish the record, not the verdict** — consumer register publishes who holds a credential (fact), never a compliance verdict; defamation law and the corpus's own comparison discipline reached this rule independently (2026-08-20) |
| **Key decision** | **Ignore file is a precondition** — shared drive watcher cannot function without the ignore file; specified March 2026, raised three times, now classified as a precondition blocking all drive work (2026-08-20) |
| **Key decision** | **A verification is not a use** — check events (verification calls) route to the issuer's lane, not the subject's lane; metering live lookups = surveillance; publishing the public record removes both capabilities simultaneously (2026-08-20) |
| **Key decision** | **Risk Mandate.ai** adopted as product name (resolves OQ-company-name-1, 2026-06-25) |
| **Key decision** | **Grounded alarm** adopted as the Risk Mandate communication strategy term (replaces FUD framing, 2026-07-05) |
| **Key decision** | **The grant is the mandate** — authorization is the union of what the agent can already do; "never-in-line" (2026-07-23) |
| **Key decision** | **"We describe, we do not decide"** — posture held against investor pressure for runtime authority (2026-07-23) |
| **Key decision** | **Market = decision-making** at every altitude of every organisation (not agent governance, not runtime authority) (2026-07-23) |
| **Key decision** | **The message is the transformation** — inter-register communication via JSON transformation commands, not shared state (2026-07-17) |
| **Key decision** | **"We sell the mandate to operate"** — product reframe from dashboard/register to mandate delivered vault-to-vault (2026-07-17) |
| **Latest build spec** | Airgapped RiskMandate demo/MVP (read-only vault + local storage + persona library + risk flow upward + actionable items) — 17 July 2026 |
| **Next build priority** | Browser-local query engine (vault-as-source-of-truth, sync by commit-id, IndexedDB) — blocks the airgapped MVP |
| **Key decision** | **Voice note transcription tool** — first SGraph product going to market; 90-day partnership term from 1 Aug 2026; ~~OpenRouter carries both inference and billing; the markup is the issued key's credit limit~~ **INVALIDATED 2026-08-06**: OpenRouter's terms prohibit resale; the funded-key mechanism is not buildable; see payments-platform PROPOSED for replacement architecture; three privacy modes (routed/restricted/browser-local); all PROPOSED (2026-07-27) |
| **Key decision** | **Accepted ≠ Acceptable** — two orthogonal primitives: Accepted = a named individual's act at a specific altitude and time; Acceptable = a business-owned threshold set by policy; Article 9 EU AI Act mandates risk management without defining acceptable (2026-07-28) |
| **Key decision** | **Three-predicate model** — Confirmed (technical fact), Validated (compliance interpretation by GRC), Accepted (appetite judgement by business owner at altitude); the chain from a technical fact to a board decision (2026-07-28) |
| **Key decision** | **Regulation graph = vault + website** — EU AI Act encoded via AKN4EU XML, graph starts empty and accretes as customer answers Confirm/Validate/Accept provisions; partial connection sufficient for value (2026-07-28) |
| **Key decision** | **Air gap drawn as bespoke manual integration** — a gap has no evolution; the labour that fills it sits at genesis; map shape = evolved ends + manual middle; three Wardley maps: air-gap (sales), translation (altitudes), evidence chain (agent→board) (2026-07-28) |
| **Black Hat USA** | **Business Hall opened 2026-08-04.** Voice shipped 2026-08-03. Screenshot paste + auto-sync data-loss fix + claude-sonnet-5 default shipped 2026-08-04. Vision capability detection live from OpenRouter catalogue. iPad run not yet verified (unit-tested). |
| **Key decision** | **Vault authors, repo publishes** — clear text in a public repository is the enabling condition for verification as differentiator; vault stays authoring environment; publishing to encrypted vault abandoned in favour of public repo; split-by-path resolves two-store conflict (2026-07-31) |
| **Key decision** | **Consolidation = customisation** — EU AI Act consolidation and per-customer organisational customisation are the same graph operation; one engine serves both (2026-07-31) |
| **Key decision** | **Amendment is the subscription** — Standards-as-a-Service: open artefact, recurring revenue from re-derivation as instrument amends; cost scales with change not size (2026-07-31) |
| **Key decision** | **Accountability manufactures demand for evidence** — three primitives (risk-as-fact, named person, visible upward) produce self-correction; three failure conditions: guessable reviewer, prior commitment, undiscriminated information (2026-07-31) |
| **Key legal fact** | **EU AI Act transparency obligations (Article 50) are now live** — in force from 2 August 2026; Annex III standalone high-risk obligations deferred to 2 December 2027; Regulation 2026/1744 in force 27 July 2026 |
| **Key decision** | **Registers are one chain** — the executive's risk exists because of the operator's, which exists because of a fact; side-by-side display is a model problem showing through the interface; draw as a chain (2026-08-02) |
| **Key decision** | **A risk is something that can be accepted** — if it cannot carry a named acceptor and an interval, it is a question, not a risk; quality gate for all generated risk register rows (2026-08-02) |
| **Key decision** | **Three moves, none denial** — acceptance flow: accept, escalate, or challenge the fact; single-button denial produces reactance; removing perceived choice produces counter-argument (2026-08-02) |
| **Key decision** | **Vaults as substrate** — agents with distinct responsibility, capability and focus collaborate asynchronously through encrypted vault folders; no direct addressing; blackboard architecture with authorisation, audit and confidentiality answered by the medium (2026-08-02) |
| **Key decision** | **Never render the whole graph** — render the result of a query; a diagram of everything is rarely useful; one node with neighbours is always readable (2026-08-02) |
| **Key decision** | **Voice Debrief** is the product name (plural deliberate); WhatsApp variant is the current build; supersedes "voice transcription tool" naming (2026-08-06) |
| **Key decision** | **Disagreement-as-output** — where two transcription models disagree is worth more than their average; disagreement spans must be marked, not smoothed; applies to transcription, concept graphs, and ontology matching (2026-08-06) |
| **Key decision** | **Plugins are capability grants** — organising by authority creates security boundaries; organising by code creates modules; ambient authority is the root cause of prompt injection; the reference is the permission (2026-08-06) |
| **Key decision** | **Write-as-attestation** — an external step advances the vault kernel state machine only by depositing its output in the vault; the write is the attestation rather than a claim about one (2026-08-06) |
| **Key decision** | **Budget is a containment control** — a per-step spending ceiling declared before execution makes maximum workflow cost knowable before it runs; generalises to any bounded resource (money, time, calls, bytes) (2026-08-06) |
| **Key fact** | **OpenRouter resale prohibited** — OpenRouter's terms prohibit reselling or distributing the service and prohibit access for the purpose of reselling API access; enforcement already visible; this invalidates the 2026-07-27 funded-key commercialisation mechanism (2026-08-06) |
| **Key fact** | **Hyperscaler shipped per-agent budget ceilings** (May 2026) — validates the outbound maturity model claim that budget ceilings are cheapest containment controls; removes metering as a differentiator; the ledger, provenance record and register link remain as differentiators (2026-08-06) |
| **Key decision** | **Permissions = key topology** — in sgit hub, authorization is determined by vault key shape, not server ACL; a missing key IS the denied permission; no code path exists for "read without the key"; write key grants authorship (unbounded blast radius), read key bounds exposure to vault content at time of exposure plus all history (sgit hub architecture, 2026-08-14) |
| **Key decision** | **Read keys publishable, write keys never** — publishable read key enables read-only sharing without revealing authorship capability; lost write key = frozen vault (no recovery path); escrow-before-publish is required (sgit hub security boundary, 2026-08-14) |
| **Key decision** | **Component, not plugin** — sgit hub feature set delivered as component to avoid collision with the permission-grant model where "plugin" = capability grant; naming matters for the security boundary (sgit hub taxonomy, 2026-08-14) |
| **Key decision** | **Browser IS the application layer for sgit hub** — object storage is the server; browser is the runtime; all rendering, search, and indexing features must run client-side because the server cannot read plaintext; consequence: server-side features require the server to hold keys, which contradicts zero-knowledge (sgit hub architecture, 2026-08-14) |
| **Key decision** | **Bootstrap trap = choreography, not cryptography** — creating a key is not creating an identity; an identity is a relationship; every common workaround grants authority broader than the identity being created; the fix is a door narrow enough that walking through it requires nothing; the append lane is that door (2026-08-19) |
| **Key decision** | **Identity and mandate are separate signed statements** — issued, revoked and reasoned about independently; identity says who a key is; mandate says what it may do; revoke independently; a mandate is checkable by a third party without asking the issuer (2026-08-19) |
| **Key decision** | **Agent enrolment ingress = vault append lane (SHIPPED)** — the account-less write path (append token in body, no access token, blind acknowledgement) is the narrow door for agent enrolment; the bootstrap architecture configures a deployed transport, it does not build a new one; client sealing layer (derive lane address from recipient public key hash) is PROPOSED (2026-08-19) |
| **Key decision** | **Execution broker = unit of delegation shifts from credential to action** — agent never holds the credential; broker verifies signed mandate and performs action; closes the authorised-misuse boundary that capability grants, vault kernel, and relay pattern each named as their limit; credential concentration (broker holds everything) inverts the catastrophic-failure property; self-hosting is the mitigation (2026-08-19) |
| **Key decision** | **Rename "service twin" → "execution broker"** — "twin" already means graph-meets-reality in the risk mandate architecture; naming collision is the third in this corpus; rename before any schema, code, or documentation uses the current name (2026-08-19) |
| **Key decision** | **Meaning extraction is decompilation** — text-to-semantic-graph produces many valid readings from one source (ambiguous), not one output from one source (compilation); no automated pipeline to a single canonical graph is possible without violating this claim; human author remains a necessary node in the write path; corrections propagate with supersede semantics (graphing text architecture, 2026-08-09) |
| **Key decision** | **WhatsApp bridge: one vault per conversation** — the bridge provides structured storage and portability for extracted conversation records; this is a portability design, not a zero-knowledge design (WhatsApp sees messages); derivation removes the customer index (WhatsApp bridge architecture, 2026-08-14) |
| **Key decision** | **The bootstrap trap is a loop, not a gap** — an agent must present an identity to reach a trusted authority, but gaining that identity requires the authority; every workaround trades a small identity problem for a larger one (platform credentials, repository write access, shared bot tokens, etc.); the fix is a transport narrow enough to require nothing (agent identity architecture, 2026-08-19) |
| **Key decision** | **Identity and mandate are separate signed statements** — identity answers "who is this agent"; mandate answers "what is this agent permitted to do"; they are issued, revoked and reasoned about independently; a certificate proves possession of a key, not authorisation to act (agent enrolment architecture, 2026-08-19) |
| **Key decision** | **Blind acknowledgement is a stronger write-only property** — the append lane write path returns a blind acknowledgement: the sender learns only that the write succeeded and cannot probe what is in the lane; this is enforced in the response, not only in the permission model (append lane audit, 2026-08-19) |
| **Key decision** | **Unit of delegation moves from credential to authorised action** — a service twin / execution broker holds service credentials the agent never sees; agent presents a mandate + signed request; broker executes only the permitted operation; closes the "authorised party misusing legitimately held authority" boundary that capability grants, state machines, and per-agent keys cannot close (service twin architecture, 2026-08-19) |

---

## Cross-Domain Notes

**Vault spans multiple domains** — a common source of confusion:
- `/vault/*` endpoints on User Lambda → `send-api/`
- `/vault/*` endpoints on Admin Lambda (legacy model) → `admin-api/`
- Vault encryption/crypto design → `vault/`
- sg-vault.js browser client → `vault/` (browser-js sub-file, future)
- sgit CLI vault operations → `cli/`

**MCP exists on both Lambdas:**
- User Lambda MCP: transfers, presigned, vault → `send-api/`
- Admin Lambda MCP: tokens, keys, vault, users → `admin-api/`

**⚠️ Active four-team change:** Structure key encryption split — see `vault/proposed/structure-key-split.md`

---

## Changelog

See [`changelog.md`](changelog.md) for a pointer log of recent changes to this domain tree.

---

## Archived Monolith

The pre-split reality document is preserved at:
`v0.16.26__what-exists-today.md` (237KB, 2,975 lines)

When backlog tasks B-001 through B-005 are complete (see `team/roles/librarian/DAILY_RUN.md`),
all content from the monolith will be migrated into domain files and the monolith will serve
only as a historical archive.
