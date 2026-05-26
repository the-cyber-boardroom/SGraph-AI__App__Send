# Identity — Reality Index

**Domain:** identity/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

This domain covers credentials, authentication, OAuth, and billing. This is a mostly-PROPOSED domain. The current system uses a deliberately simple identity model: vault key IS the credential. No social login, no billing automation, no OAuth exists today.

---

## EXISTS (Code-Verified)

### Current Identity Model

- **Access tokens** — admin-created, stored in `x-sgraph-send-access-token` header or query param. Admin Lambda issues and manages them (create, revoke, reactivate, update-limit).
- **Vault key = credential** — for vault operations, the vault key (e.g. `apple-river-1234`) IS the user's identity. No separate login required.
- **Simple token key derivation** — PBKDF2-HMAC-SHA256 → aes_key → HKDF to read_key / write_key / ec_seed. Token is vault identity. Shipped in sgit-ai (commit `fc9ac67`, 22 new tests).
- **Open Decision #10 RESOLVED (04/19):** No external identity provider. Vault key IS the credential.

### Early Access Signup

- `POST /early-access/signup` — Early Access signup endpoint EXISTS (email, name, use case fields)
- n8n + WorkMail pipeline for email handling EXISTS
- **Stripe webhook for auto-token creation DOES NOT EXIST** — manual token creation still required after signup

### PKI Registry (Identity Layer)

- `POST /keys/publish` — publish RSA public key to registry
- `GET /keys/lookup/{code}` — lookup key by code
- `DELETE /keys/unpublish/{code}` — mark key inactive
- `GET /keys/list` — list all keys
- `GET /keys/log` — transparency log
- Users service: `POST /users/create`, `GET /users/lookup/{id}`, `GET /users/fingerprint/{fp}`, `GET /users/list`

### Token Management (Admin)

| Endpoint | What It Does |
|----------|-------------|
| `POST /tokens/create` | Create access token |
| `GET /tokens/lookup/{name}` | Token metadata |
| `POST /tokens/use/{name}` | Record usage, decrement limit |
| `POST /tokens/revoke/{name}` | Revoke token |
| `POST /tokens/update-limit/{name}` | Change usage limit |
| `POST /tokens/reactivate/{name}` | Reactivate revoked/exhausted token |
| `GET /tokens/list` | List token names |
| `GET /tokens/list-details` | All tokens with full data (bulk) |

**13 token route tests + 17 token service tests — all passing.**

---

## Open Decisions (Unresolved)

| Decision | Options | Status |
|----------|---------|--------|
| #15 — `sg1.` prefix on stored credential | Architect recommends; Dev to confirm | OPEN |
| #22 — Google OAuth client ID across multiple domains | Works on one domain; multi-domain needs verification | OPEN |
| #23 — Credit expiry period | 1 month vs 3 months | OPEN |

---

## PROPOSED (Not Yet Implemented)

- Google OAuth + app:data vault key storage (two-tier identity: Google OAuth for Google users, vault key direct for others) (doc 317, 04/21 brief)
- `sg1.` prefix on stored credential — open decision #15 (Architect recommends)
- OpenRouter token provisioning via PKI encrypt-for-reader (Section 16)
- Per-user vaults + £5 credit experiment — per-user encrypted vault, OpenRouter API key with £5 cap (Section 20, doc 214)
- "My Workspace" / "My Account" page — vault viewer, API key stats, access token management (Section 20, doc 214)
- Profile page + credit activation — build on `<sg-vault-picker>` (open decision #1 RESOLVED: build on vault-picker)
- Auth MVP — social login + vault key storage (doc 291)
- Secrets manager integration (doc 320)
- Credit expiry period (open decision #23: 1 month vs 3 months)
- Stripe webhook for auto-token creation — currently manual
- Browser fingerprinting for anonymous free tier (5 credits/day per fingerprint) (Section 16)
- Dynamic credit allocation — Gatekeeper agent state machine (Section 16)
- Sherpa CLI — email, campaigns, WorkMail integration (Section 16)
- Move from WorkMail to SES for sending (Section 16)
- Welcome page flow improvements for post-purchase activation (existing welcome page serves Stripe redirect target)

### SG/Send Tiered Business Model (05/24 briefs — docs 466–468, Day 69–70)

**PROPOSED — does not exist yet.** All items below require SG/Sentinel to be deployed first.

- **P-223: Open-evaluation tiered deployment model** — free/non-private mode (max-visibility, educational fingerprint display, X transfers/day limit); paid/non-tracking mode (SG/Sentinel rules remove tracking, Stripe-only data, published per-tier rules); ephemeral per-customer EC2 for confidential data (doc 466)
- **P-224: No anonymous users via SG/Sentinel identity-creation rule** — fingerprint identity for every visitor including bots; no cookies, local storage fair game; fingerprint hash from local-storage + browser + environment; prerequisite for budget model and hostile-to-bad-traffic (doc 467)
- **P-225: Ephemeral-by-default policy** — public cloud shares expire 2-3 days; paid vaults separate workflow for >1 week; persistent vaults manual+custom initially; save-key mechanism under consideration (doc 467)
- **P-226: Per-account budget model** — every account ~£1 initial budget; every action has attributed cost; budget consumed via SG/Sentinel rules; educates users; enables capability gating (doc 467)
- **P-230: Client-side OAuth + user-dedicated mode** — provider apps (Google, GitHub); vault-key from Google appDataFolder (recommended) or derived from OAuth secret; user-dedicated mode (vault keys + personal LLM key + vault info); vault-sharing as key-sharing; the hinge from anonymous trial to paying vault-owning user (doc 471)
- **P-233: SG/Sentinel identity-creation rule (new SG/Sentinel rule type)** — creates fingerprint identity for every request from available signals; broadly useful beyond SG/Send; surfaced by SG/Send thread but belongs in SG/Sentinel corpus (doc 467)

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
