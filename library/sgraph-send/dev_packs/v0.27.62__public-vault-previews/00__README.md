# 00 — Public Vault Previews Dev Pack (SGraph Send)

**version** v0.27.62
**date** 25 May 2026
**status** Architecture + derivation + UX + mockups + reuse map + phases + security pass — **grounded in the real `__Send` codebase**. Ready to hand to a Developer agent. The two items the upstream (`__Tools`) pack flagged as backend-blocking are **already implemented in this repo** (see "What changed vs the `__Tools` pack").
**feature** Public Vault Previews — a deliberately-public, deterministically-addressed preview (title / description / thumbnail / disclaimer / support link) for an otherwise zero-knowledge vault, shareable as a link with a proper social-share card.
**target codebase** **This repo (`SGraph-AI__App__Send`)** — `dev.vault.sgraph.ai` lives here. Frontend: `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`. Backend: `sgraph_ai_app_send/lambda__user/`.

---

## Why this pack exists (read this first)

A first pass at this brief was produced by an agent working in the **`SGraph-AI__App__Tools`** repo (the `sgraph_ai_tools__static/` tree). The architecture, security analysis, UX, and mockups in that pass are strong and largely reusable — **but every file path, every reuse target, and two of its load-bearing conclusions are wrong for this repo.** This pack is the `__Send`-grounded rewrite: same vision, real paths, corrected conclusions.

The original `__Tools` pack is preserved for reference; this pack supersedes it for implementation in `__Send`.

---

## What changed vs the `__Tools` pack (the two big corrections)

| The `__Tools` pack said… | The reality in `__Send` (code-verified) | Consequence |
|---|---|---|
| **SG/Send DELETE is "PENDING backend / BLOCKING in-place edit"**; transfers are write-once; ship a versioned-id fallback (F1) first. | **DELETE is fully implemented.** `DELETE /api/transfers/delete/{id}` (`Routes__Transfers.py:249`) with a `delete_auth` model: the server stores only `SHA-256(delete_auth)` (`Transfer__Service.py:174`, `delete_auth_hash` field at create, `Schema__Transfer.py:23`). | **Delete-then-recreate ships from day one.** No versioned-id fallback. This is exactly the "hold the delete key, then delete + recreate" flow the project lead asked for. |
| **Access-count expiry "cannot be enforced — PENDING backend"**; ship time-based advisory only. | **Both expiry dimensions are native.** `expires_at` (ms), `max_downloads`, `auto_delete` are first-class create fields (`Schema__Transfer.py:20-23`, enforced in `Transfer__Service.py:151-170`). | **Time AND access-count expiry ship natively** (AC#9 fully satisfied server-side). |
| **`/en-gb/app/<id>` route is a cross-repo blocker** owned by a separate `vault.sgraph.ai` app. | **The `/en-gb/app/` route exists in this repo** (`…/v0.2.3/en-gb/app/index.html`, mounts `<app-shell>`, parses `#<vault-key>`). | **The whole feature ships in one repo.** The only routing work is wiring the `<public-id>` path segment (a CDN/Lambda rewrite + a query-param interim) — in-repo, not cross-repo. |
| Reuse `sg-vault-manifest`'s recursive `write_key` guard; base class `SgComponent`; tool primitive `SgToolApi`. | **None of these exist here.** No manifest guard, no `SgComponent` (it's `VaultComponent`), no `SgToolApi` in the vault UI. | Build a tiny `write_key`/`read_key`/`passphrase` validator inline; extend `VaultComponent`; no SgToolApi dependency. |

Everything else from the `__Tools` pack (the controlled-exposure principle, the namespace-separation security proof, the two-mode UX, the convention-JSON schema, the mockups) **holds** and is carried forward here.

---

## The one-paragraph summary

A vault may opt in to a small, deliberately-public preview — title, description, thumbnail, disclaimer, support link — addressed by a human- or machine-chosen string (the **public-vault-about-key**) that appears in the URL and server logs **by design**. From that string alone the app deterministically derives a 12-hex **SG/Send transfer id** (where to fetch) and a **read-only, decrypt-only** AES key (how to read it); the preview is a convention JSON stored as an ordinary **SG/Send transfer** — **no new server-side store** (the only thing exposed is the public-vault-about-key). Visiting `/en-gb/app/<public-id>` renders the preview and asks for the vault key; visiting `…#<vault-key>` renders the preview fast then auto-loads the real (still zero-knowledge) contents from the hash fragment. The derivation lives in a **separate cryptographic namespace** (PBKDF2 salt `sgraph-public-preview-v1`) from Simple Tokens (`sgraph-send-v1`) and vault keys (`sg-vault-v1:<id>`), and yields **no write capability** — so the public string can never reach the real vault's contents. Editing a published preview is **delete-then-recreate** at the same transfer id, authorised by a **random `delete_auth` the owner generates at publish time and stores inside their own encrypted vault** (never derived from the public string — that would let anyone deface it). Expiry (time and download-count) and hard removal are native to the transfer service.

---

## The controlled-exposure principle (the heart of it)

This deliberately creates an exposure — but a bounded, opt-in, user-chosen one. The only thing that leaves the secure envelope is the **public-vault-about-key** in the URL/logs, and from it **nothing about the real vault's contents or keys can be derived**. Only the chosen public fields are exposed; the vault stays encrypted; the exposure is reversible (delete) and can be time- or access-bounded.

---

## Reading order

| # | Doc | Read for |
|---|---|---|
| 00 | This README | Map of the pack, the `__Send` corrections, status |
| 01 | Source brief + **3 project-lead corrections** | The vision and the authoritative corrections |
| 02 | Architecture | Two access modes; storage on the SG/Send transfer flow; where it lives in the `__Send` IFD tree; convention JSON; meta-tags via the public Lambda; expiry |
| 03 | Derivation & storage | The exact `public-id → transfer-id + read-only key` derivation (mirrors `FriendlyCrypto`, distinct salt); id format; **the delete-then-recreate update flow + owner-held random `delete_auth`** |
| 04 | UX | Both access-mode journeys; the corporate no-key page; the settings edit/publish flow; share-link copy + key-inclusion warning |
| 05 | Mockups | ASCII mockups of every surface: public page (Mode A/B), no-key, expired/not-found, settings editor, the social card, the copy-link affordance |
| 06 | Reuse map | Every building block as REUSE / EXTEND / BUILD NEW with **real `__Send` paths**; what NOT to reuse |
| 07 | Phases | Build sequence; per-phase scope / new code / acceptance; branch discipline; per-phase handover prompt |
| 08 | Open questions | What's RESOLVED here vs what still needs a Dinis/Product/DevOps decision |
| 09 | Security review | R1–R4 + found risks; the read-only / separate-namespace proof; the **delete_auth-must-be-random** gate; go/no-go per risk |

---

## Where the substance lives (all in this repo)

- **Crypto + derivation:** new module under `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/` (mirrors `lib/sg-send/` + `friendly-crypto.js`).
- **Public page surface + editor:** new Web Components under `…/_common/js/components/` (extend `VaultComponent`).
- **The `/en-gb/app/<public-id>` route:** the existing `…/en-gb/app/index.html` shell, extended to read the public-id path segment (interim: `?p=<public-id>`).
- **Crawler OG meta tags:** a small route on the **public User Lambda** (`sgraph_ai_app_send/lambda__user/`) that derives + fetches + decrypts the public preview server-side and returns the OG-tagged shell — in-repo, no edge function required.
- **`/en-gb/preview/<preview-key>` tester page (debug):** a new top-level page that renders the preview exactly as a WhatsApp/LinkedIn unfurl would, plus a debug strip — the manual-verification surface for the social card (doc 02 §6a).
- **Transparency disclosure:** a "How this works" expander on the card/editor surfacing the underlying SG/Send transfer-id + read-only key + a `send.sgraph.ai` link to open the raw file (doc 02 §9).
- **The transfer + delete + expiry backend:** **already exists** (`Routes__Transfers.py`, `Transfer__Service.py`) — nothing to build there.

---

## Composition with the vault-in-vaults work (`claude/exciting-brown-G2P9Z`)

The sub-vaults briefing pack's **link card** (`<sg-link-card>`, proposal P-162) is specified to **"show public info before the key"** — it explicitly names a *per-vault public-info capability* as a dependency. **This pack supplies that capability.** The convention-JSON and the read-only derivation are designed to compose with the `.link.json` / `.vault/owner/` model (doc 02 §4.4): a sub-vault's link card can call `fetchPreview(publicId)` to render the child's public info before prompting for the child key. Design for that seam; do not block on it.

---

## Project-lead decisions folded in (25 May — doc 08)

| Topic | Decision |
|---|---|
| Default expiry | **No expiry by default** (opt-in time / open-count controls ship OFF) |
| Thumbnail | **~64 KB inline / blob above**; sources = upload **or pick a vault file**; **fully native** WebP encode (no libs/wasm) |
| `/en-gb/app/<public-id>` route | **Wire the real path segment day one** via a CloudFront rule / CF Function (no `?p=` interim) |
| Crawler OG meta | **Public User-Lambda route**, + **temporary console/log timing stats** (flagged for removal) |
| `<sg-link-card>` seam | **Mapped here** (the `exciting-brown` branch is retired) — link-file `public_id` + `fetchPreview` |
| Surface the SG/Send file | **Yes** — "How this works" disclosure (transfer-id + read-only key + open-on-`send.sgraph.ai` link) |
| Debug/test card page | **Yes** — new top-level `/en-gb/preview/<preview-key>` rendering the shared-link card |

Still open: PKI smoothing (future); the measured OG-render latency number (Phase 5); DevOps picks the exact CF mechanism.

---

This README is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
