# AI Agents — Proposed: Agent Communication, MCP, and Security Tools

**Domain:** ai-agents/proposed/agent-communication | **Last updated:** 2026-08-22 | **Maintained by:** Librarian (daily run)
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

## Agent Enrolment and Mandate Architecture (19 Aug 2026, v0.33.60)

All items below are PROPOSED — does not exist yet. The append lane transport that underpins
P-ENR-001 is EXISTS (server-side: four-tier gate, blind write, account-less write — see
`vault/index.md`). The client-side addressing derivation (P-ENR-004) is PROPOSED.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ENR-001 | Agent enrolment architecture | An agent starts from nothing but a keypair, signs a canonical enrolment request, delivers it through the append lane (account-less narrow-door ingress), and a trusted processor reads the lane, applies policy, and issues a certificate; identity and mandate are separate signed statements, issued and revoked independently; blocking items: trust roots for fractal registries must be declared, nonce and canonical serialisation must be specified | doc 958 (v0.33.60) |
| P-ENR-002 | Service twin / execution broker | Agent presents a signed mandate + specific action request; the broker holds service credentials the agent never sees; broker verifies mandate, executes only the permitted operation, returns a signed receipt; closes the "authorised party misusing legitimately held authority" boundary that capability grants, state machines, and per-agent keys cannot close; concentration risk: broker is highest-value target (inverts catastrophic-failure property); naming collision with "twin" (existing corpus term) must be resolved before publication | doc 960 (v0.33.60) |
| P-ENR-003 | Agent identity + mandate registry (fractal) | A registry that records both identity (whose key) and mandate (what the key may do), with registries recognising other registries; fractal structure requires each registry to declare which trust roots it accepts — without declared roots the trust graph is unevaluable; also records exercise (signed receipts) as the third corner missing from current pki.sgit.ai | docs 958, 961 (v0.33.60) |
| P-ENR-004 | Client-side lane addressing (hash of recipient public key) | A lane's address is the hash of the recipient's public key, so an agent with a keypair already knows its own lane address without a directory lookup; marked as client-side PROPOSED by the code-verified audit; no shipped command currently emits it; token is agreed out of band today; do not code against this derivation until it ships | doc 959 (v0.33.60) |

---

## Vault-As-Substrate / Blackboard Architecture (02 Aug 2026, v0.33.55)

All items below are PROPOSED — does not exist yet. Vault primitives (append, two-key, ephemeral compute) are EXISTS.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ACT-023 | Vault-as-substrate asynchronous agent collaboration | Agents with distinct responsibility, capability and focus collaborate via encrypted vault folders; no direct addressing — agents write where they may, read when they choose; blackboard architecture; authorisation, audit and confidentiality answered by the medium rather than the application; significantly outperforms controller-assigned arrangements (13-57% relative improvement per literature) | doc 915 (v0.33.55) |

---

## Mandate Execution Broker (19 Aug 2026, v0.33.60)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-MEB-001 | Mandate execution broker | Agent presents a signed mandate; broker verifies the mandate and executes the specified action against an external service using credentials the agent never sees; broker returns a signed receipt. Unit of delegation moves from credential access to authorised action. Closes the "authorised party misusing authority it legitimately holds" boundary named by three prior briefs (plugins 06 Aug, vault kernel 06 Aug, relay pattern 16 Aug). Mandate schema: subject, issuer, service/instance, capability, resource, constraints, workflow/stage, environment, valid_from/until, usage_limit, signature. Receipt: signed by broker; cannot be amended; can feed later workflow stages; works for rented agents without attestation. **Concentration risk**: broker holds all credentials for all services and all tenants — inverts the catastrophic failure property the vault achieves; self-hosting is the mitigation (not an enterprise upsell). **Naming collision**: "Service Twin" collides with "digital twin" (established corpus term); recommended rename: Mandate Broker or Mandate Execution Broker. | doc 959 (v0.33.60) |
