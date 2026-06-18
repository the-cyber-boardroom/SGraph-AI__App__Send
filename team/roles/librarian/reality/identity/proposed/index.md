# Identity — Proposed Items Index

**Domain:** identity/proposed/ | **Last updated:** 2026-05-22 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## OAuth and Social Login

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Google OAuth integration | Social login for Google users; vault key stored in Google app:data | Section 31, doc 317 |
| `sg1.` prefix on stored credential | Namespace prefix for vault keys stored in credential stores | Open decision #15 |
| Google OAuth client ID across multiple domains | Single OAuth client ID working across send.sgraph.ai and tools.sgraph.ai | Open decision #22 |
| Auth MVP — social login + vault key storage | Minimal viable auth: social login → vault key persisted | doc 291 |

## Per-User Vaults and Credits

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Per-user encrypted vault | One vault per user storing files, usage stats, settings, generation history | Section 20, doc 214 |
| User vault creation flow | Simple token, user-controlled encryption, "save this token" warning UX | Section 20, doc 214 |
| "My Workspace" / "My Account" page | Vault viewer, API key stats, access token management, shared files | Section 20, doc 214 |
| OpenRouter API key provisioning | Programmatic creation with £5 credit cap per user | Section 20, doc 214 |
| Per-key credit limits | Set and manage spending cap per user OpenRouter key | Section 20, doc 214 |
| Admin UI: OpenRouter key management | Create, view, top up, revoke keys from admin console | Section 20, doc 214 |
| £5 credit outreach | First batch issued to all Early Access + paying users (~50) | Section 20, doc 214 |
| Usage monitoring | Track credit burn rate and which tools are used | Section 20, doc 214 |
| Profile page + credit activation | Profile UI built on `<sg-vault-picker>` (open decision #1 resolved) | Open decision #1 |

## Billing Automation

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Stripe webhook for auto-token creation | Auto-create access token when Stripe payment confirmed | Section 6 (DOES NOT EXIST) |
| Credit expiry period | Determine whether credits expire after 1 month or 3 months | Open decision #23 |
| Dynamic credit allocation | Gatekeeper agent state machine for allocating credits based on usage | Section 16 |
| LLM 25% markup pricing | OpenRouter token pricing with 25% SG/Send markup | Section 16 |

## Free Tier Identity

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Browser fingerprinting | Anonymous device fingerprint for free tier credit allocation | Section 16 |
| 5 credits/day per fingerprint | Free tier: 5 credits daily per device fingerprint | Section 16 |
| Free tier: 5 transfers/day | Volume limit for unauthenticated users (no code) | Section 6 |

## Secrets Management

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Secrets manager integration | AWS Secrets Manager or equivalent for storing sensitive credentials | doc 320 |
| Secure API key sharing via vault PKI | Encrypt API keys for a specific reader using their PKI public key | Section 16 |
| OpenRouter token provisioning via PKI | Agent receives OpenRouter token encrypted for their public key | Section 16 |
| `sg-send-cli secrets store/get/list/delete` | OS keychain integration for CLI credential storage | Section 6 |

## Email and Outreach

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Sherpa CLI | Email campaigns and WorkMail integration for outreach workflows | Section 16 |
| Move from WorkMail to SES | Replace WorkMail sending with Amazon SES | Section 16 |
| Email pipeline: Composer→Reviewer→Sender | Three-agent email pipeline for outbound communications | Section 16 |

---

## Pre-Authorisation and Micropayments (05/14 brief — doc 396)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Pre-authorisation + micropayments model | Stripe hold (£5 default) + internal micropayment ledger; replaces bring-your-own-key and subscription models | doc 396 |
| Internal micropayment ledger | Per-action cost tracking; vault-backed for auditability | doc 396 |
| Settlement scheduling | Periodic (weekly), threshold-driven, or pre-expiry settlement of accumulated micropayments to Stripe charge | doc 396 |
| Hold renewal automation | Continuous coverage signal; renews hold before expiry to avoid charge gaps | doc 396 |

## Dynamic Credential Delivery Service (05/17 brief — doc 397)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Dynamic credential delivery service | STS AssumeRole pattern; just-in-time narrowly-scoped AWS credentials per CLI operation | doc 397 |
| Scope catalogue versioned in vault | Per-operation IAM scope definitions versioned in vault for audit and rollback | doc 397 |
| Per-action credential caching with auto-refresh | Cache per (caller, scope) tuple; auto-refresh before STS credential expiry | doc 397 |

---

## USDC and Agentic Commerce (05/15 brief — doc 415)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| AgentCore Payments prototype (agent-buys-from-third-party via x402) | Integration with one external x402-capable service; validates scenario 3 (cross-org transactions) end-to-end | doc 415 |
| x402 micropayment receiver on one SG service | HTTP 402 + payment validation + access grant for one SG service (e.g. per-vault-open at $0.001) | doc 415 |
| USDC backend treasury for inter-org settlements | Circle Mint or Coinbase Business account; sub-cent settlements to third parties; customer stays fiat-fronted | doc 415 |

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 6, 16, 20, 31)*

---

## PKI Identity Envelopes + Identity-Provider Partnership (06/03 brief)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-314 | PKI Not Secrets — Identity Envelopes + Identity-Provider Partnership | Paradigm shift: instead of one vault key (a secret), each identity holds many granular keys. Vault becomes a "travelling envelope" carrying identity proof, evidence of actions, tools, schemas, and scoped capabilities. Supply-chain workflows gated by cryptographic key handoffs (A signs off → only B can continue). Surgical ephemeral privilege elevation (time-limited scoped key, not full vault key). Partnership with identity-provider companies to distribute and manage keys at scale. Phases: P0 append_token model (EXISTS in vault inbox), Phase 1 per-vault scoped keys (P-313), Phase 2 per-identity PKI + IdP integration. Requires key distribution model decision (`OQ-pki-key-distribution-model-1`). | 06/03 arch-brief |

---

## SG Mail Email Client (05/16 brief — doc 425)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-165 | SG Mail email client: vault client on email-fs; standard inbox/threads/compose/search UX; vault-grounded properties (versioned history, cross-vault references, per-message audit trail, encrypted at rest) | doc 425 |
| P-166 | AWS SES connectors v1: SES inbound (SES → S3 event trigger → email-fs reader → vault) + SES outbound (vault compose → SES API → recipient); domain MX → SES; DKIM/SPF/DMARC via SES | doc 425 |
| P-167 | Cloudflare Email Service connector v2 (agent-native; April 2026 launch; Email Routing → Worker → POST EML to endpoint) | doc 425 |
| P-168 | Gmail API connector v2 (bidirectional sync; OAuth scoped to read + send; mirrors Gmail mailbox into vault) | doc 425 |
| P-169 | WorkMail migration tool: export mbox/maildir from WorkMail → parse → commit to email-fs vault; reusable for future customers | doc 425 |
| P-170 | Private email vault isolation: dedicated vault per user; separate encryption key, S3 bucket/account, access path, and backup cadence from public vaults | doc 425 |

---

## LLM API Billing Broker (06/01 brief)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-299 | OpenRouter Key/Credit/Billing Broker | Vault for secrets + auth (Google OAuth, PROPOSED) as foundation. New build: credit-purchase layer, payment-brokering layer (Stripe — do not build custom payment processing). BLOCKED on financial/legal requirements analysis. Payment brokering is regulated. | 06/01 brief |

---

## NHI 2.0 — Agent Identity Platform (06/04 briefs)

All items below are PROPOSED — does not exist yet.

The NHI 2.0 series frames the vault stack as an identity, communication, accountability, and containment platform for non-human identities (agents, agentic teams, swarms). The PKI primitives (`sgit keygen/sign/verify`), vault key = credential model, and AES-256-GCM encryption are the existing foundation. All platform-level layers are PROPOSED.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-322 | NHI 2.0 platform vision | Vault stack as the NHI 2.0 platform: identity, communication, accountability, and containment for agents and agentic teams; addresses the gap that OAuth is not fit for purpose for agents | 06/04 strategy-brief (agent-identity-startup-thesis) |
| P-323 | PKI foundations layer | Accountability at provisioning time; chain of authenticity; key-controlled memory (data readable only by key holders); extends existing `sgit keygen/sign/verify` | 06/04 arch-brief (pki-foundations) |
| P-324 | Living-off-the-land identity anchors | Leverage existing identity infrastructure; unique vs sub-identity model; the "Uber identity" concept; where keys live and how they are managed | 06/04 arch-brief (living-off-the-land) |
| P-325 | Multi-identity agent chains | Signed, encrypted agent chains using vault inbox; per-agent identities and keys; capability limited by code; direct extension of hardened vault inbox | 06/04 arch-brief (multiple-identities) |
| P-326 | Semantic identity graphs | Identity as a semantic graph; every graph node has an identity; determinism as assurance; graph-level identity model; requires graph storage layer (not in current stack) | 06/04 arch-brief (semantic-knowledge-graphs) |
| P-327 | Temporal permissions system | Duration-bounded permissions; time travel across permission states; lock-down without side effects; requires trusted time source and revocation mechanism | 06/04 arch-brief (time-temporal-permissions) |
| P-328 | Agent trust scoring and web of trust | Trust by connectivity; agent trust scores built over time; distributed identity; web of trust across agent ecosystem; requires persistent trust-history store | 06/04 arch-brief (trust-and-identity) |
| P-329 | NHI access control layer (not security) | Never-inline integration play; access control layer that augments existing security rather than replacing it; vendor-agnostic; "the better they are the better we are" positioning | 06/04 arch-brief (access-not-security) |
| P-330 | Permission granularity mapping | Map every application's fine-grained permissions; the layer-in-the-middle model; explicit scope: this is a hyperscaler-scale data project, not a near-term build | 06/04 arch-brief (permission-granularity) |
| P-331 | Per-API permission graphs | Cloud permissions at hyperscaler scale; action-vs-resource gap addressed; per-API graph for AWS/GCP/Azure | 06/04 arch-brief (cloud-permissions) |
| P-332 | Skills-with-identity model | A skill bundles its own identity and permission set; joiner-mover-leaver lifecycle applied to skills; a role's resources are the skill | 06/04 arch-brief (skills-and-permissions) |
| P-333 | NHI visualisation / digital twin | Visualisation as the low-touch go-to-market entry point; digital twin of the agent estate; contextual risk scoring; UI design problem more than infrastructure | 06/04 strategy-brief (visualisation) |
| P-334 | Time-boxed risk acceptance module | Time-bounded risk acceptance records; underwriting the change; before-and-after ROI for agent deployments | 06/04 strategy-brief (risk-management) |
| P-335 | NHI sellable deliverables catalogue | Identities-to-assets-to-risk-to-cost model; side businesses as side effects of the platform; structured catalogue of deliverables | 06/04 strategy-brief (sellable-deliverables) |
| P-336 | NHI commercial model | No-rent model; billable units (identities, actions, policies); two markups; customised versions; value tied to users and adoption | 06/04 strategy-brief (commercial-model) |

