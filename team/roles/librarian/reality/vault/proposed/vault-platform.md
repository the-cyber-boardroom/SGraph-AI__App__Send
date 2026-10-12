# vault/proposed — Platform & Distribution

**Domain:** `vault/` | **Last updated:** 2026-06-30 | **Maintained by:** Librarian
**Source:** briefs 05/11–05/14

---

## SG Vault Hub (v0.13.32 — 03/14)

**PROPOSED — does not exist yet.**

GitHub-equivalent for encrypted vaults. Change packs (zero-knowledge contributions).
Optional public view publishing (client-controlled). sgit.ai platform (Git interop, hosting).

*Source: monolith Section 16 lines 1202–1209.*

---

## Publishing Layer (05/11–05/12 briefs — docs 366, 375, 376)

**PROPOSED — does not exist yet.**

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Published readonly vault URLs (`*.sgraph.app/en-gb/#<share-token>`) | Public-facing vault with no read key required in URL | doc 366 |
| Auto-publish on commit (opt-in, free tier) | Vault publish triggered automatically on sgit push | doc 366 |
| SEO layer for published vaults (metadata only) | Server-side sitemap, robots.txt, meta tags — content stays encrypted | doc 366 |
| Analytics for published vaults | View counts, referrer data per published vault | doc 366 |
| Custom domain support for published vaults (paid tier) | Bring-your-own-domain with DNS delegation | doc 366 |

---

## GitHub-as-Vault-Projection (05/11 brief — doc 359)

**PROPOSED — does not exist yet.**

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Two-layer VCS pattern | Git (developer surface) + SGit (consumer distribution) — separate concerns | doc 359 |
| GitHub Action for bidirectional vault sync (Phase 3) | Auto-sync: vault changes propagate back to Git | doc 359 |
| CLAUDE.md injection for customer AI dev context | Inject project-aware CLAUDE.md into customer Git repo from vault template | doc 359 |

---

## Manager Vaults and Credential Manager (05/14 briefs — docs 386, 387)

**PROPOSED — does not exist yet.**

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Manager vault pattern | Vaults whose purpose is to manage other vaults; same architecture as content vaults, different operational scope | doc 386 |
| Credential manager vault | First manager vault instantiation; distributes scoped API credentials via Simple Tokens | doc 387 |
| Simple Token format `tok_<random>` | API credential proxy token; distinct from vault key-derivation word-word-NNNN tokens | doc 387 |
| Token lifecycle operations | issue, revoke, rotate, adjust scope, quota enforcement — all tracked in vault audit trail | doc 387 |
| Token resolution service: proxy mode | API calls routed through credential manager; actual keys never exposed to callers | doc 387 |
| Token resolution service: direct mode | Token resolved to actual key at request time; simpler but exposes keys to callers | doc 387 |
| Cross-vault API surface for manager vault operations | Manager vault exposes API for other vaults to request credentials and report usage | doc 386 |

---

## Customer Workflow Primitives (05/11 briefs — docs 364, 360)

**PROPOSED — does not exist yet.**

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Template vault clone API (`POST /vault/clone`) | Server-side clone of template vault to new customer instance | doc 364 |
| One-time share token (no PKI Phase 1) | Disposable read access token; expires after single use | doc 364 |
| Bring-your-own-key commercial pattern | Customer controls encryption key; no data custody by SGraph | doc 360 |

---

## Vault as Operational Substrate + Communications (06/02–06/03 briefs)

**PROPOSED — does not exist yet.**

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-302 | Webify/AI-fi Your Spreadsheets | Don't replace painful-but-working spreadsheet mini-apps — improve them. Spreadsheet becomes an external connected vault; each tab becomes a mini-app (metadata UIs, infographics, vault-chat on live data). Consultant-delivered; shipping is the hard problem, not the AI. Bridges the gap between "has working Excel" and "wants a web app." | 06/02 strategy-brief |
| P-307 | Vaults for the Blast Radius Company Use Case | Each blast-radius = one vault holding enrichment data, sign-off records, semantic graphs, mini-apps for multi-audience delivery (exec summary, technical deep-dive, board report). Safe send-for-enrichment workflow: data encrypted, recipient enriches, owner reads back. No-database architecture (vault IS the database). Agent peer review with provenance. | 06/02 arch-brief |
| P-311 | Publishing Mode — Static Publish via GitHub Actions | Vault holds the editable source content; GitHub Actions workflow publishes the static public element. Data stays encrypted even at rest in GitHub. Reuses existing read-only-key approach for decryption in the GHA worker. Second publish path alongside Netlify (P-288). Enables "vault edits, GitHub publishes" workflow for GitHub-native projects without Netlify dependency. | 06/03 dev-brief |
| P-313 | Vault-to-Vault Comms via Append Token + PKI | Concrete messaging mechanism using the existing vault inbox (NOW EXISTS): sender receives parent vault's public key + append_token via template-vault provisioning; sender encrypts payload with public key, appends via append_token; only the parent (holding private_key) can decrypt. Bidirectional via symmetric provisioning. Prove 2-5 vaults first. Blocked on template-vault provisioning spec (`AD-provisioning-spec-1`). | 06/03 dev-brief |
