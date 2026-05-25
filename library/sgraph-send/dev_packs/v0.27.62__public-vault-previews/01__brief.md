# 01 — Brief: Public Vault Previews (+ project-lead corrections)

**version** v0.27.62
**date** 25 May 2026
**from** Human (project lead)
**to** Architect, Developer (lead), Product, Security
**type** Arch brief (source) + project-lead corrections (authoritative)

---

## Project-lead corrections (authoritative — they take precedence over the source brief)

These were given when the brief was handed to the `__Send` team. Where they conflict with the source text below, **follow these**.

1. **No new public data is stored on the server.** The source brief's framing ("we can save this data in a folder server-side") is wrong for our design. We are **not** adding a server-side public-data store. We simply **allow the URL `/en-gb/app/{public-vault-about-key}` (or `…/{public-vault-about-key}#{vault-key}`) to exist.** That public `public-vault-about-key` string is what gets exposed in logs/URLs — and from it we deterministically calculate the **transfer-id** and the **read-only decryption key**. Everything else is just API/HTTP calls that leverage **what already exists** (the SG/Send transfer flow). The "exposure" is the public-vault-about-key sitting in the URL and server logs — nothing more.

2. **The preview payload is stored using mechanisms we already have** — an **SG/Send transfer**, addressed by a transfer-id deterministically derived from the public-vault-about-key, encrypted under a read-only key also derived from that same string. **No new endpoints are required for the happy path.** (Verified: `create` / `upload` / `complete` / `download-base64` already exist — doc 06.)

3. **The API server may not support modifying an existing key/transfer — so we hold the delete key.** SG/Send transfers are write-once for their bytes. To **update** a public preview we **delete** the existing transfer and re-create it at the same transfer-id. That means the owner must **hold the delete key/token** at creation time and persist it (in the owning vault) so a later edit can do delete-then-recreate. **Investigate whether the SG/Send API exposes a delete capability and design the update flow around it.**
   - **RESOLVED in `__Send` (doc 03 §3):** `DELETE /api/transfers/delete/{id}` exists. At create, the owner supplies `delete_auth_hash = SHA-256(delete_auth)`; to delete, the owner presents `delete_auth` in the `x-sgraph-transfer-delete-auth` header (`Transfer__Service.py:174`). **The `delete_auth` must be a random secret the owner generates and stores in their vault — NOT derived from the public string** (else anyone holding the public-id could delete and deface the preview — doc 09 R-deface). Delete-then-recreate is the shipping update flow; no fallback needed.

---

## What this is

Give a vault an optional, **deliberately-public** set of preview information (title, description, thumbnail/screenshot, disclaimer, support link) that can be rendered as a web page, shown on the vault's front page, and surfaced as the social-share preview when a vault link is posted to WhatsApp, LinkedIn, or anywhere that loads link previews.

Two access modes: with just the public ID you see the preview and are asked for the key; with the key in the URL hash the vault loads automatically.

The governing principle: **this deliberately creates an exposure, but a controlled one** — an exposure the user chooses, trading a sliver of opacity for a large gain in shareability and clarity, with the user in control of the trade.

## The problem

Vaults are too opaque to share well. Without the key, all you have is an opaque ID — hard to manage, hard to understand; even the sender loses track of which link is which. And not every vault's title or description is confidential; some vaults are meant to be shared widely (demos, public materials). Treat users as capable: let them choose what, if anything, to expose, with awareness of the trade.

## How it works

1. The user visits `/en-gb/app/<public-id>` (the public-vault-about-key is the last segment).
2. From that string, the system deterministically calculates the transfer-id (where to download) and the read-only decryption key.
3. It fetches the transfer and decrypts it with the derived read-only key.
4. Inside, by convention, is a JSON file with the public information (title, description, thumbnail, disclaimer, support).
5. That information is rendered — as the page, the thumbnail, and the social-share card.

The public ID can be system-generated (random) or user-chosen (`vault-demo-health-data`, `mvp-demo-x`). **It is NOT a Simple Token** (`word-word-NNNN`) — Simple Tokens are being refactored; this is a distinct deterministic public-preview key, kept in a separate namespace.

## The two access modes

| URL | What happens |
|-----|--------------|
| `/en-gb/app/<public-id>` | Show the preview (title, description, thumbnail), then ask for the vault key |
| `/en-gb/app/<public-id>#<vault-key>` | The key is in the hash fragment (never sent to the server); render the preview fast, then auto-load the vault |

## Social-share previews

When the link is posted somewhere that fetches link previews, the platform reads the page's Open Graph / meta tags. Because the preview is deliberately public, the page can expose those tags so the shared link shows a proper title/description/thumbnail. (Crawlers do not run JS — see doc 02 §6: the public Lambda renders the OG-tagged shell.)

## Corporate-friendliness

The no-key page is the natural place for a **confidentiality disclaimer** ("Confidential. Do not use unless authorised.") and a **support/contact link** ("No key? Contact …"). It turns the no-key state from a dead end into a useful, professional page.

## Controlled exposure: timing / expiry

The preview can be time-limited (a few days) or access-limited (a few opens). Ties to the ephemeral-by-default model. Anticipates PKI: once PKI lands, preview-then-ask-key could become preview-then-automatic-access for entitled identities.

## Editing the public information

A UX to set and edit the public title, description, thumbnail, disclaimer, support, and to choose the public ID (random or custom) — on the **vault settings surface**. Editing implies delete-then-recreate (correction 3).

## Acceptance criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | A vault can have an optional public preview | Title, description, thumbnail; opt-in |
| 2 | The public preview is deliberately public | Reachable via the public-vault-about-key; key can be in the URL; user-chosen |
| 3 | The deterministic derivation works | String → transfer-id + read-only key |
| 4 | The public preview is a convention JSON | Title, description, thumbnail; UI-rendered |
| 5 | Public IDs can be user-defined or random | Readable custom IDs; not Simple Tokens |
| 6 | The two access modes work | Preview-and-ask-for-key; or hash-key auto-load |
| 7 | Social-share meta-tag previews render | Proper card on WhatsApp, LinkedIn, etc. |
| 8 | Corporate disclaimers and support links | On the public page |
| 9 | Timing/expiry controls the exposure | A few days or a few accesses (native: `expires_at`, `max_downloads`) |
| 10 | The edit UX is on the vault settings surface | User sets/edits the public info and ID |

## Honest risks (full treatment in doc 09)

- **R1 — deliberate exposure.** Controlled, opt-in, only chosen info, contents stay encrypted, expiry bounds it.
- **R2 — over-exposure.** Default nothing public; clear "this will be public" confirmation; key-field guard.
- **R3 — derivation soundness.** Read-only, public-layer only, separate namespace, must not reach real contents.
- **R4 — server-side render perf/exposure.** OG-tag Lambda reads the same public transfer; measure latency.
- **R-deface (found here).** If `delete_auth` were derived from the public string, anyone could delete+replace the preview. **Mitigation: `delete_auth` is a random owner-held secret.**

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
