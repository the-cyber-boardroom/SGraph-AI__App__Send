# 08 — Open Questions: Public Vault Previews

**version** v0.27.62
**date** 25 May 2026
**from** Architect
**to** Developer (lead), Product, Security, DevOps, Dinis

Each item is **RESOLVED** (decided / code-verified here) or **PENDING** (needs a Dinis / Product / DevOps decision). **Crucially, the three items the upstream `__Tools` pack listed as backend-blocked are RESOLVED in this repo** — DELETE, expiry, and the `/app` route all exist.

---

## Resolved here (code-verified)

| # | Question | Resolution |
|---|---|---|
| Q1 | Exact derivation (string → transfer-id + read-only key)? | PBKDF2 salt `sgraph-public-preview-v1` → AES read key (decrypt-only); transfer-id `SHA-256('pvp-transfer-v1:'+id)[:12]`. Distinct from Simple Tokens (`sgraph-send-v1`) and vault keys (`sg-vault-v1:<id>`). Doc 03 §1. |
| Q2 | Public-id format + collisions? | `[a-z0-9-]`, 4–63 custom / 16-char random; reject the Simple-Token regex. Collisions detected by the backend's `create` 409 (`Transfer__Service.py:66`). Doc 03 §2. |
| Q4 | Convention JSON schema? | `schema`, `title`, `description`, `thumbnail` (inline ≤~64 KB or `transfer` ref), `disclaimer`, `support`, `expiry`, `created_at_ms`, `owner_hint`. `PREVIEW_SCHEMA_VERSION=1`; field-name guard. Doc 02 §5. |
| **Q9** | **Does the SG/Send API support DELETE? What is the update flow?** (correction 3) | **RESOLVED — DELETE exists.** `DELETE /api/transfers/delete/{id}` with `delete_auth` (server stores `SHA-256(delete_auth)`). Update = delete-then-recreate at the same transfer-id, authorised by a **random owner-held `delete_auth`** stored in the vault. **No fallback needed.** `Routes__Transfers.py:249`, `Transfer__Service.py:174`. Doc 03 §3. |
| Q-expiry | Can the exposure be time- AND access-limited? | **RESOLVED — both native.** `expires_at`, `max_downloads`, `auto_delete` accepted at create, enforced on download (`Transfer__Service.py:151-170`). Doc 02 §7. |
| Q-read-auth | Does reading the preview need a token? | **RESOLVED — no.** `download`/`download-base64` do not call `check_access_token` (`Routes__Transfers.py:167,194`). Publishing needs the owner token; reading is open. |
| Q-route-exists | Does `/en-gb/app` exist? | **RESOLVED — yes, in this repo.** `VAULT/en-gb/app/index.html` mounts `<app-shell>` and parses `#<vault-key>`. Only the public-id **path segment** rewrite is outstanding (Q-route below). |
| Q-bookkeeping | Where does the owner store id/`delete_auth`/expiry? | Inside the owner's encrypted vault at `.sgraph/public-previews/<public-id>.json` via the vault client. `delete_auth` never leaves the vault. Doc 03 §4. |
| Q-namespace (R3) | Is the derived key provably read-only & public-layer-only? | Yes — distinct salt + id prefix; decrypt-only import; unrelated to the secret-passphrase vault key. Security to ratify with a KAT. Doc 03 §1.3, doc 09 R3. |
| Q-deface | Can the public string grant write/delete? | **No, by design** — `delete_auth` is random and owner-held, never derived from the public string. Doc 03 §3.3, doc 09 R-deface. |

---

## Pending — Dinis / Product

| # | Question | Proposal |
|---|---|---|
| Q3 | Default expiry policy | Architect proposal: **no expiry by default** (persists until the owner unpublishes), opt-in "expire in N days" and/or "stop after N opens". Confirm the default and whether open-count appears in the v1 editor UI. |
| Q-thumbnail | Inline-vs-blob cap + client downscale | Default inline, ~64 KB cap, auto-switch to a derived second transfer above the cap. Confirm the exact cap and whether the editor downscales client-side before publish. |
| Q-pki | How this smooths once PKI lands | Direction noted (preview-then-ask-key → preview-then-auto-access for entitled identities; design already separates the two steps). Not in v1. Revisit with the PKI brief. |

---

## Pending — DevOps / infra (in this repo)

| # | Question | Note |
|---|---|---|
| Q-route | The `/en-gb/app/<public-id>` **path-segment** rewrite | Static hosting must serve `app/index.html` for `/en-gb/app/<anything>`. A CDN/Lambda-URL rewrite in this repo's deployment. Until it lands, Phases 3–4 use `?p=<public-id>` (zero infra). The route page itself already exists. |
| Q-meta | OG-render placement + latency | Recommended: a route on the public User Lambda (`Routes__Public_Preview.py`) that derives + fetches + decrypts the public preview and injects OG tags; cache by public-id; fail closed. **Measure and record the latency** (the brief's performance ask). Edge (CloudFront) is the alternative. Doc 02 §6. |

---

## Pending — coordination

| # | Question | Note |
|---|---|---|
| Q-subvault-seam | Exact integration with `<sg-link-card>` (sub-vaults) | The link card (P-162) is specified to show child public info before the key. Agree the call contract (`fetchPreview(apiBase, childPublicId)`) and where the child's public-id is stored in the `.link.json` / `.vault/owner/` records. Doc 02 §4.4, Phase 6. Coordinate with the `claude/exciting-brown-G2P9Z` author. |

---

## Summary table

| # | Question | Status | Owner |
|---|---|---|---|
| Q1 | Derivation | RESOLVED | — |
| Q2 | Public-id format / collisions | RESOLVED | — |
| Q4 | Convention JSON | RESOLVED | — |
| **Q9** | **DELETE + update flow** | **RESOLVED (exists)** | — |
| Q-expiry | Time + access-count expiry | RESOLVED (native) | — |
| Q-read-auth | Tokenless read | RESOLVED | — |
| Q-route-exists | `/en-gb/app` exists | RESOLVED | — |
| Q-bookkeeping | Owner bookkeeping path | RESOLVED | — |
| Q-namespace | Read-only / separate namespace | RESOLVED (KAT to run) | Security |
| Q-deface | No write/delete from public string | RESOLVED | — |
| Q3 | Default expiry policy | PENDING | Dinis/Product |
| Q-thumbnail | Cap + downscale | PENDING | Product/Designer |
| Q-pki | PKI smoothing | PENDING | future |
| Q-route | Path-segment rewrite | PENDING | DevOps (in-repo) |
| Q-meta | OG render + latency | PENDING | DevOps |
| Q-subvault-seam | `<sg-link-card>` integration | PENDING | Architect + sub-vaults author |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
