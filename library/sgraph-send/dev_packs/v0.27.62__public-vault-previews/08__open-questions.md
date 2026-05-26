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
| Q-bookkeeping | Where does the owner store id/`delete_auth`/expiry? | Inside the owner's encrypted vault at `.vault/owner/public-previews/<public-id>.json` via the vault client. `delete_auth` never leaves the vault. Doc 03 §4. |
| Q-namespace (R3) | Is the derived key provably read-only & public-layer-only? | Yes — distinct salt + id prefix; decrypt-only import; unrelated to the secret-passphrase vault key. Security to ratify with a KAT. Doc 03 §1.3, doc 09 R3. |
| Q-deface | Can the public string grant write/delete? | **No, by design** — `delete_auth` is random and owner-held, never derived from the public string. Doc 03 §3.3, doc 09 R-deface. |

---

## Decided by the project lead (25 May) — now RESOLVED

| # | Question | Decision |
|---|---|---|
| Q3 | Default expiry policy | **No expiry by default** (the preview persists until the owner unpublishes). Opt-in "expire in N days" / "stop after N opens" remain available in the editor (both server-enforced, doc 02 §7), but **OFF by default**. |
| Q-thumbnail | Thumbnail source + cap + downscale | **~64 KB inline cap, auto-switch to a derived blob above it** — confirmed. **Two sources:** (a) upload an image, and (b) **pick an existing file from the vault** (the editor reads + decrypts it via the owner's vault, then re-encodes). Thumbnail generation is **fully native — no external libraries, no wasm**: `createImageBitmap` → `<canvas>` downscale → `canvas.toBlob(…, 'image/webp', q)` (EXIF dropped by the re-encode). Doc 04 §5.3, doc 06 §C/§E. |
| Q-route | The `/en-gb/app/<public-id>` path-segment route | **Wire the real path segment from day one** — no `?p=` interim needed. Any `/en-gb/app/<public-id>` currently 404s, so there is no conflict to claim it. Served via **a CloudFront routing rule OR a CloudFront Function** (both valid; DevOps picks). `?p=` survives only as a local-dev convenience. Doc 02 §4.3. |
| Q-meta | OG-render placement + latency + visibility | **Yes — the route on the public User Lambda.** It derives + fetches + decrypts the public preview and injects OG tags; cache by public-id; fail closed. **Also print the timing stats to the console/logs** (temporary instrumentation — flagged for removal). Measure + record the latency. Doc 02 §6. |
| Q-subvault-seam | Integration with `<sg-link-card>` (sub-vaults) | **Mapped here** (the `exciting-brown` session/branch is retired; the sub-vaults docs remain on `dev`). The concrete contract — link-file `public_id` field + `fetchPreview(apiBase, childPublicId)` + render-before-key — is specified in doc 02 §4.4 and doc 07 Phase 6. |
| Q-transparency | Surface the underlying SG/Send file on the UIs | **Yes.** Show the transfer-id + read-only key + a `send.sgraph.ai/en-gb/open/view#<tid>/<key>` raw-file link behind a "How this works" disclosure (not always-visible). Safe — all derivable from the public-id, read-only, never the `delete_auth`. Doc 02 §9, doc 04 §6a, doc 09 R-transparency. |
| Q-preview-page | A debug/test page that renders the shared-link card | **Yes — new top-level page `/en-gb/preview/<preview-key>`** that renders exactly as a WhatsApp/LinkedIn unfurl would (the in-browser twin of the OG card) + a debug strip; never opens the vault; the manual-verification surface for AC#7. Doc 02 §6a, doc 05 §6, doc 07 Phase 5. |

---

## Still pending

| # | Question | Note |
|---|---|---|
| ~~Q-update-blocker~~ | In-place update blocked by delete-tombstone | **RESOLVED — Option A implemented.** Per-transfer opt-in `allow_recreate` flag: when set, `delete_transfer` clears the metadata so the id can be recreated; default (False) keeps the tombstone for all other transfers. `publishPreview` opts in → delete-then-recreate keeps the same share link. Backward-compatible (66/66 existing transfer tests pass). Doc 03 §3. |
| Q-pki | How this smooths once PKI lands | Direction noted (preview-then-ask-key → preview-then-auto-access for entitled identities; design already separates the two steps). Not in v1. Revisit with the PKI brief. |
| ~~Q-vault-id-verify~~ | Verify a typed key opens the *right* vault | **RESOLVED — implemented.** `publishPreview` stamps the (non-secret) `vault_id` into the preview JSON; the open page passes it to `_initWithKey(key, _, expectedVaultId)`, which — after opening but **before any side effect** — rejects a valid-but-wrong-vault key (`code:'wrong-vault'`) and the card shows "that key opens a different vault" + a link to `/#<key>` to open the key's actual vault. Older previews (no `vault_id`) skip the check (graceful). Doc 04 §2.0. |
| Q-meta-latency | The measured OG-render latency number | Produced during Phase 5 (the brief's performance ask); record it here when measured. |

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
| Q3 | Default expiry policy | **RESOLVED — no expiry default** | Dinis |
| Q-thumbnail | Source + cap + native encode | **RESOLVED — 64 KB, upload or vault file, native WebP** | Dinis |
| Q-route | Path-segment route | **RESOLVED — wire `/<public-id>` day one via CF rule/Function** | Dinis (DevOps picks CF mechanism) |
| Q-meta | OG render + latency + console stats | **RESOLVED — User-Lambda route + temp console stats** | Dinis (DevOps measures latency) |
| Q-subvault-seam | `<sg-link-card>` integration | **RESOLVED — mapped here** (doc 02 §4.4, Phase 6) | — |
| Q-transparency | Surface the SG/Send file + open-on-send link | **RESOLVED — yes** (doc 02 §9, doc 04 §6a) | — |
| Q-preview-page | `/en-gb/preview/<key>` card tester | **RESOLVED — yes** (doc 02 §6a, Phase 5) | — |
| Q-pki | PKI smoothing | PENDING | future |
| Q-meta-latency | Measured latency number | PENDING | DevOps (Phase 5) |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
