# Identity — Proposed: Authentication, OAuth, and Agent Identity

**Domain:** identity/proposed/ | **Last updated:** 2026-07-21 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED — does not exist yet. Do not describe any of these as existing features.

Source documents: archived monolith `../v0.16.26__what-exists-today.md` sections 16, 28, 31;
06/04 arch-briefs; 06/03 arch-brief. See index.md for full P-number inventory.

---

## OAuth and Social Login

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Google OAuth integration | Social login for Google users; vault key stored in Google app:data | Section 31, doc 317 |
| `sg1.` prefix on stored credential | Namespace prefix for vault keys stored in credential stores | Open decision #15 |
| Google OAuth client ID across multiple domains | Single OAuth client ID working across send.sgraph.ai and tools.sgraph.ai | Open decision #22 |
| Auth MVP — social login + vault key storage | Minimal viable auth: social login → vault key persisted | doc 291 |

---

## Secrets Management

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Secrets manager integration | AWS Secrets Manager or equivalent for storing sensitive credentials | doc 320 |
| Secure API key sharing via vault PKI | Encrypt API keys for a specific reader using their PKI public key | Section 16 |
| OpenRouter token provisioning via PKI | Agent receives OpenRouter token encrypted for their public key | Section 16 |
| `sg-send-cli secrets store/get/list/delete` | OS keychain integration for CLI credential storage | Section 6 |

---

## PKI Identity Envelopes + Identity-Provider Partnership (06/03 brief)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-314 | PKI Not Secrets — Identity Envelopes + Identity-Provider Partnership | Paradigm shift: instead of one vault key (a secret), each identity holds many granular keys. Vault becomes a "travelling envelope" carrying identity proof, evidence of actions, tools, schemas, and scoped capabilities. Supply-chain workflows gated by cryptographic key handoffs (A signs off → only B can continue). Surgical ephemeral privilege elevation (time-limited scoped key, not full vault key). Partnership with identity-provider companies to distribute and manage keys at scale. Phases: P0 append_token model (EXISTS in vault inbox), Phase 1 per-vault scoped keys (P-313), Phase 2 per-identity PKI + IdP integration. Requires key distribution model decision (`OQ-pki-key-distribution-model-1`). | 06/03 arch-brief |

---

## NHI 2.0 — Agent Identity Platform (06/04 briefs)

All items below are PROPOSED — does not exist yet.

The NHI 2.0 series frames the vault stack as an identity, communication, accountability, and
containment platform for non-human identities (agents, agentic teams, swarms). The PKI primitives
(`sgit keygen/sign/verify`), vault key = credential model, and AES-256-GCM encryption are the
existing foundation. All platform-level layers are PROPOSED.

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
