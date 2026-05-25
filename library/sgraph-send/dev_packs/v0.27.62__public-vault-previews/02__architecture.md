# 02 — Architecture: Public Vault Previews (SGraph Send)

**version** v0.27.62
**date** 25 May 2026
**from** Architect
**to** Developer (lead), Product, Security
**source** `01__brief` (+ 3 corrections, authoritative) · code-verified against `__Send` on 25 May 2026

---

## 1. One-paragraph summary

A vault may opt in to a small, **deliberately public** preview — title, description, thumbnail, disclaimer, support link — addressed by a human- or machine-chosen string, the **public-vault-about-key**. From that string alone we deterministically derive (a) a 12-hex **SG/Send transfer id** (where to fetch) and (b) a **read-only AES-256-GCM key** (how to decrypt it). The preview is a convention JSON stored as an **ordinary SG/Send transfer** — the same `create`/`upload`/`complete`/`download` flow the share UI already uses. Per correction 1, **no new server store is added**; the only thing that leaves the secure envelope is the public-vault-about-key in the URL and logs. The real vault contents stay zero-knowledge and require the proper vault key, which (Mode B) rides only in the `#` fragment.

---

## 2. The controlled-exposure principle

| Property | The vault's contents | The public preview |
|---|---|---|
| Encryption | AES-256-GCM, zero-knowledge | AES-256-GCM, key deliberately public |
| Key source | passphrase / vault key (high entropy, secret) | derived from the public string in the URL |
| Server-side store | existing vault objects (opaque) | **existing** SG/Send transfer (correction 1 — no new store) |
| In URL / logs | never | the public-vault-about-key (by design) |
| Who chooses to expose | n/a | the vault owner, opt-in, per vault |
| Reach of the leaked key | — | **the preview blob only** — never vault contents |

The exposure is bounded, opt-in, and reversible (delete — §5, doc 03 §3). The leaked key is provably read-only and provably in a **separate namespace** from the real vault keys (doc 03 §1.3, doc 09 R3).

---

## 3. End-to-end architecture

### 3.1 The two access modes

| URL | Behaviour |
|---|---|
| `/en-gb/app/<public-id>` | Render the preview (title/description/thumbnail/disclaimer/support), then prompt for the vault key. |
| `/en-gb/app/<public-id>#<vault-key>` | Render the preview fast, then auto-load the real vault from the `#` fragment (never sent to the server). |

`<public-id>` is the public-vault-about-key. The `#<vault-key>` fragment is the *real* vault key (`passphrase:vaultId`, a base64url read key, or a Simple Token) and is **independent** of the public-id — the public layer never derives or needs it.

### 3.2 Mode A — preview-then-ask-key (no fragment)

```
Browser                      /en-gb/app page (this repo)        SG/Send transfer API (this repo)
  │  GET /en-gb/app/<pid>        │                                   │
  │──────────────────────────────▶│ (static shell loads instantly)   │
  │                                │ derivePublicPreviewKeys(pid)     │
  │                                │   → transferId, readKeyRO        │
  │                                │  GET /api/transfers/download-     │
  │                                │      base64/<transferId>         │
  │                                │──────────────────────────────────▶│  (tokenless read)
  │                                │◀──── { data: base64(cipher) } ────│
  │                                │ unwrap SGMETA · AES-GCM decrypt   │
  │                                │ validatePreview(json)             │
  │  rendered preview + key prompt◀│                                   │
```

The user then types the vault key; the app runs the normal open flow (`SGVaultCrypto.deriveKeys` → `SGVault.open` → tree). **Nothing about the real vault was needed to render the preview.**

### 3.3 Mode B — hash-key auto-load (fragment present)

Same first steps render the preview *immediately* (fast first paint). In parallel, the app reads `location.hash`, parses the vault key, and runs the normal open flow without a prompt. The preview card is the fast skeleton-with-content; the vault tree fills in behind it. The two fetches are independent and concurrent — the preview is never blocked on the vault open, and vice-versa. If the preview 404s but the key is valid, the vault still opens.

### 3.4 The derivation relationship (what is derived from what)

```
 public-vault-about-key (string in URL)
        │
        ├─(PBKDF2 salt 'sgraph-public-preview-v1' → AES-GCM)──────────▶ readKeyRO  (decrypt-only)
        │
        └─(SHA-256('pvp-transfer-v1:'+id)[:12 hex])───────────────────▶ transferId (where to fetch)
                                                                            │
                                                  GET that transfer ───────▶ SGMETA + AES-GCM ciphertext
                                                                            │
                                                  decrypt(readKeyRO) ──────▶ convention JSON (title, desc, thumb…)

 vault-key (#fragment, INDEPENDENT)
        └─(SGVaultCrypto.deriveKeys: PBKDF2 'sg-vault-v1:<id>')───────▶ real read/write keys → vault contents

 delete_auth (RANDOM, generated at publish; NOT from the public string)
        └─ stored in the owner's encrypted vault ─────────────────────▶ owner-only delete-then-recreate (doc 03 §3)
```

The two left columns share **no key material and no salt**. The public string cannot reach the vault column; the vault key never appears in a server-visible URL. The `delete_auth` is a third, **random** secret — never derivable from the public string (doc 09 R-deface).

---

## 4. Where this lives in the `__Send` tree (IFD)

All frontend work is the next minor of the vault UI, under `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/` (or its successor version dir). Follow IFD: small files, named exports, components extend `VaultComponent`. **Never touch the `version` file** (CI owns it).

### 4.1 Core — new derive/schema/read/write module

`…/_common/js/lib/sg-public-preview/` (mirrors `lib/sg-send/` + the `friendly-crypto.js` precedent):

| File | Responsibility |
|---|---|
| `public-preview-crypto.js` | `derivePublicPreviewKeys(publicId)` → `{ transferId, readKeyRO, readKeyBytes }`. PBKDF2 salt `sgraph-public-preview-v1`; transfer-id = `SHA-256('pvp-transfer-v1:'+id)[:12]`. Read key imported **decrypt-only**. Mirrors `FriendlyCrypto`. Doc 03 §1. **Derives no write key and no delete_auth.** |
| `public-preview-schema.js` | `validatePreview(obj)`, `emptyPreview()`, `PREVIEW_SCHEMA_VERSION = 1`; id-format validator (rejects the Simple-Token regex); inline `write_key`/`read_key`/`passphrase` ban. Doc 02 §5. |
| `public-preview-read.js` | `fetchPreview(apiBase, publicId)`: derive → `GET /api/transfers/download-base64/<tid>` → unwrap SGMETA → AES-GCM decrypt → `validatePreview`. **No vault dependency.** |
| `public-preview-write.js` | `publishPreview / updatePreview / unpublishPreview`: encrypt + 3-step upload (`create` with `delete_auth_hash`, `expires_at`, `max_downloads`) + `DELETE`; persists bookkeeping into the owner vault. Doc 03 §3–4. |

The **read path** depends only on `SendCrypto` (decrypt) + the SGMETA unwrap — kept light so the public page loads fast. The **write path** additionally uses the vault client (`SGVault`) to read/write owner bookkeeping.

### 4.2 Components (extend `VaultComponent`)

`…/_common/js/components/`:

| Component | Role |
|---|---|
| `sg-public-preview-card` | Renders the convention JSON as the public page (title/description/thumbnail/disclaimer/support/expiry note + the key prompt). All Mode A/B states (mockups §1–4). Imports only the read path + `design-tokens.css`. |
| `sg-public-preview-editor` | The edit UX (id chooser, fields, thumbnail upload, "THIS WILL BE PUBLIC" confirmation, publish/update/unpublish). Calls the write path. Mounts on the vault settings surface. |
| `sg-public-preview-meta` | Injects OG/Twitter `<meta>` into `document.head` from the JSON (client path — humans only; crawlers need the Lambda, §6). |

### 4.3 The `/en-gb/app/<public-id>` route (in this repo — wired from day one)

- The route **exists**: `…/v0.2.3/en-gb/app/index.html` mounts `<app-shell>` and parses `#<vault-key>`. It is a static SPA shell served via CloudFront.
- **Decision (project lead):** wire the **real path segment `/en-gb/app/<public-id>` from day one** — no `?p=` interim. Any `/en-gb/app/<public-id>` currently returns 404, so there is **no conflict** to claim the namespace. The page reads the last path segment as the public-id.
- **Mechanism — a CloudFront routing rule OR a CloudFront Function (both valid; DevOps picks):**
  - **CF Function (viewer-request):** rewrite the *origin* URI for `/en-gb/app/<anything>` to `…/en-gb/app/index.html` while leaving the browser URL untouched, so the SPA boots and reads `location.pathname` to extract the public-id.
  - **CF behavior/route:** a cache behavior for `/en-gb/app/*` that serves the shell (and, for the crawler case, routes to the OG-render Lambda — §6).
- The two concerns interact: human browsers get the static SPA shell; **crawlers get the OG-tagged shell from the Lambda (§6)**. The cleanest single mechanism is to route `/en-gb/app/<public-id>` to the **OG-render Lambda**, which returns the app shell with OG meta injected for *everyone* (the SPA still boots for humans). DevOps decides whether to UA-split (CF Function → static shell for humans, Lambda for bots) or unify on the Lambda. `?p=<public-id>` survives only as a local-dev convenience.

### 4.4 Composition with the vault-in-vaults / sub-vaults work — the concrete contract

The sub-vaults pack's `<sg-link-card>` (proposal P-162) is specified to **show a child vault's public info before prompting for the key**, and names a *per-vault public-info capability* as its dependency. **This module is that capability.** The `exciting-brown` session/branch that produced the sub-vaults pack has been retired, so the integration contract is **mapped here** (the sub-vaults briefing pack itself remains on `dev` at `team/roles/architect/reviews/05/25/`).

**The contract (both sides):**

1. **Link file carries an optional `public_id`.** The sub-vault link file (`*.link.json`, P-159) — already `{ type, vault_id, ref_id, pin, description, … }` — gains an **optional `public_id`** field: the child vault's public-vault-about-key, if the child has a published preview. It is non-secret (like `vault_id`) and safe to sit in the tree.
   ```json
   { "type": "vault", "label": "Patient: Alice", "vault_id": "abcd1234",
     "ref_id": "lk-a1b2c3d4", "public_id": "vault-demo-health-data", "pin": { "mode": "latest" } }
   ```
2. **The link card calls the read path.** When `<sg-link-card>` renders a `type:vault` link **with** a `public_id`, it calls `fetchPreview(apiBase, public_id)` (this pack's `public-preview-read.js`) and renders the returned convention JSON (title / description / thumbnail) in the card's "public info" area — **before** prompting for the child key. This is read-only and uses **only** the public-preview read path (no owner deps, no vault key) — so it works even when the viewer holds no key to the child.
3. **Graceful absence.** If `public_id` is missing, or `fetchPreview` returns not-found/expired, the card shows its existing minimal info and proceeds straight to the key prompt — no error surface.
4. **Owner side.** When an owner publishes a preview for a vault that is (or will be) referenced as a sub-vault, the editor offers "copy this vault's `public_id`" so it can be pasted into a parent's link file. (A later convenience: the link-card editor can look up the child's `public_id` automatically.)

The `delete_auth`/bookkeeping convention (`.vault/owner/public-previews/<id>.json`, doc 03 §4) sits alongside the sub-vaults `.vault/owner/` convention — a natural neighbour, not a conflict. **No core public-preview code changes are needed for this seam** — it is purely the link card consuming `fetchPreview` (doc 07 Phase 6).

---

## 5. The convention JSON schema

A single known file the UI understands. `PREVIEW_SCHEMA_VERSION = 1`.

```json
{
  "schema": "sgraph-public-preview/v1",
  "vault_id": "a1b2c3d4e5f6",
  "title": "Health Data Demo Vault",
  "description": "Public demo materials for the health-data pilot. Confidential where marked.",
  "thumbnail": {
    "mode": "inline",
    "media_type": "image/webp",
    "data": "data:image/webp;base64,UklGR... (≤ ~64 KB recommended)"
  },
  "disclaimer": "Confidential. Do not use unless authorised.",
  "disclaimer_label": "Confidential",
  "disclaimer_variant": "danger",
  "show_footer": true,
  "footer_text": "",
  "support": { "label": "No key? Contact Dinis", "href": "mailto:dinis.cruz@owasp.org" },
  "expiry": {
    "expires_at_ms": 1748908800000,
    "max_access_count": 50,
    "note": "Enforced server-side via the transfer's expires_at / max_downloads."
  },
  "created_at_ms": 1748822400000,
  "owner_hint": "optional non-sensitive label"
}
```

**Thumbnail encoding — inline vs blob.**
- **Default: inline data URL** (one fetch, one decrypt, simplest social-card story). Cap ~64 KB encoded to keep the transfer small and the card fast.
- **Larger images: a second transfer** whose id is derived from `"<public-id>:thumb"` under the same domain-separated derivation, referenced as `{ "mode": "transfer", "transfer_ref": "<derived-id>", "media_type": "..." }`. Costs one extra fetch; keeps the JSON small. Decided per preview by the editor based on size.

The disclaimer badge is owner-styled: `disclaimer_label` (default `"Confidential"`) + `disclaimer_variant` (`danger` red / `warning` amber / `info` blue / `neutral` grey). The footer note is owner-controlled: `show_footer` (default `true`) toggles it; `footer_text` overrides the default "This is a public preview…" copy.

`validatePreview()` rejects: an unknown `schema`, oversized inline thumbnails, and any field literally named `write_key` / `read_key` / `passphrase` (defence-in-depth, doc 09 R2). Required: `schema`, `title`. All else optional.

---

## 6. Meta-tag / social-share rendering (the honest part — and an in-repo win)

**Client-only OG tags do NOT reach crawlers.** WhatsApp/LinkedIn/Slack/iMessage fetch the URL with a non-JS bot and read `<meta>` from the **served HTML**. `sg-public-preview-meta` injects tags after JS + a fetch + decrypt — the crawler never sees them. So the client path gives humans a correct card but crawlers a blank one.

**The `__Send` answer: a small route on the public User Lambda** (`sgraph_ai_app_send/lambda__user/`, FastAPI via `osbot-fast-api-serverless`). On a crawler-style GET to `/en-gb/app/<public-id>` (or a dedicated `/og/<public-id>`), the Lambda:
1. derives the transfer-id + read-only key server-side (same algorithm, Python port of doc 03 §1),
2. fetches the transfer and AES-GCM-decrypts the **public preview only**,
3. injects `og:title` / `og:description` / `og:image` / `twitter:*` into the shell HTML and returns it.

This is **in-repo** (no CloudFront edge function required), reads the **same already-public transfer** the browser would, **stores nothing new** (correction 1 preserved), and **never touches vault contents**. Cache by public-id with a TTL ≈ preview expiry; **fail closed** (serve the plain shell) on any error. Latency must be measured (doc 08 Q-meta) — the performance number the brief asks for.

**Temporary instrumentation (project-lead request):** the OG route **prints its timing breakdown to the console / Lambda logs** — e.g. `derive`, `transfer GET`, `decrypt`, `total` in ms, plus a cache hit/miss flag. This is explicitly **temporary** (mark it `// TEMP: remove after perf sign-off`) so the latency can be read directly off the logs during rollout, then removed.

| Option | Verdict |
|---|---|
| **A. Public-Lambda OG route** (above) | **Recommended** — in-repo, no extra infra, reads only the public preview |
| B. CloudFront / Lambda@Edge prerender | Acceptable alternative if a per-request Lambda is judged too heavy; same algorithm at the edge |
| C. Static prerender (build-time HTML per id) | **Reject** — conflicts with no-build-step, dynamic/custom ids, and delete-then-recreate edits |

### 6a. The `/en-gb/preview/<preview-key>` tester page (debug / verification — project-lead request)

A **new top-level page** `/en-gb/preview/<preview-key>` that **renders the preview exactly as a shared link would unfurl** on WhatsApp / LinkedIn / Slack — the in-browser twin of the social-share card. Its job is to make the otherwise-invisible crawler experience visible and testable, since you cannot easily automate a WhatsApp/LinkedIn unfurl. It is the manual-verification surface for **AC#7**.

- **Behaviour.** Takes the preview-key (the public-vault-about-key), and renders the social card from the **actual OG output** — ideally by fetching what the OG route (§6) emits for that key, so it tests the *real* Lambda output, not a re-implementation. Falls back to the client read path if the OG route is not yet wired. Renders the WhatsApp / LinkedIn / Slack card styles (mockups §6), plus a debug strip: the emitted `<meta>` tags, the transfer-id, the read-only key, the `send.sgraph.ai` raw-file link (§9), and the OG timings (§6).
- **Distinct from `/en-gb/app/<public-id>`.** `app` is the product (preview → open the vault). `preview` is a **card tester** — it never prompts for the vault key and never opens the vault; it only shows "what this looks like when shared."
- **Routing.** Same path-segment story as `/app` (§4.3): a CloudFront route / CF Function serving the page for `/en-gb/preview/*` (currently 404). New page at `…__ui__vault/…/en-gb/preview/index.html`.
- **Security.** Renders only the public preview; read-only, public-derivable material; fails closed; never opens the vault (doc 09 R-transparency).

---

## 7. Timing / expiry model (native — no fallback needed)

Both dimensions map directly to **existing** transfer create fields (`Schema__Transfer.py:20-23`, enforced in `Transfer__Service.py:151-170`):

| Dimension | Convention-JSON field | Transfer create field | Server enforcement |
|---|---|---|---|
| By time | `expiry.expires_at_ms` | `expires_at` (ms) | `_is_expired(meta)` → `410 expired` on download |
| By access count | `expiry.max_access_count` | `max_downloads` (+ `auto_delete`) | `download_count >= max_downloads` → `410 exhausted`; `auto_delete` wipes the payload after the last read |

So unlike the upstream `__Tools` pack (which treated access-count as impossible and time-expiry as advisory), **both are real and server-enforced here**. The client still reads `expires_at_ms` to render the "expired" state gracefully, but the **authoritative** removal is the server's (`410`) plus the owner's explicit unpublish/delete. **Default policy (confirmed by the project lead, 25 May): NO expiry by default** — the preview persists until the owner unpublishes. The opt-in "expire in N days" / "allow N opens" controls remain in the editor (both server-enforced) but ship **OFF**.

---

## 8. PKI forward-look

Once PKI lands, preview-then-ask-key becomes preview-then-*automatic*-access for entitled identities: the card renders as today, but instead of prompting for a key, the app checks the viewer's PKI entitlement and silently unwraps the vault key. The design already separates the public layer from the key-acquisition step (§3.1), so nothing blocks that. Noted, not built.

---

## 9. Transparency: surface the underlying SG/Send file ("show your working")

**Project-lead requirement (25 May).** The UIs should **expose the details of the SG/Send file that backs a preview** — and let the user open it directly on `send.sgraph.ai` to see and learn how the mechanism works. This is the literal demonstration of "the preview is just an ordinary SG/Send transfer — no new server-side store."

**What is surfaced** (computed entirely from the public-id, which is already public):

| Field | Value | Source |
|---|---|---|
| Transfer id | the 12-hex id | `derivePublicPreviewKeys(publicId).transferId` |
| Read-only key | the derived AES key, exported base64url | `SendCrypto.exportKey(readKeyRO-equivalent)` (export needs an extractable import — see note) |
| Raw-file link | a `send.sgraph.ai` open-UI URL | built per the open-UI contract below |

**The open-UI link format** (verified against `send-download.js:107-134`): the open UI reads the hash as `#<transferId>/<key>` (or `?id=`/a friendly token), with route modes `/view`, `/download`, `/browse`, `/gallery`. So the "open the raw file" link is:

```
https://send.sgraph.ai/en-gb/open/view#<transferId>/<readKeyBase64url>
   (or /en-gb/open/download#…  to fetch + decrypt the preview.json blob directly)
```

Opening it fetches the same transfer and decrypts it with the same read-only key — the user sees the SGMETA-wrapped `preview.json` exactly as the card does. **It reveals nothing the public-id did not already grant.**

**Where it appears (placement).** Per the lead's "maybe not always visible in some panes": this lives behind a **disclosure / details pane** — e.g. a "How this works ▸" expander on `sg-public-preview-card`, the editor's post-publish details, and the `app-hud`/debug pane — **not** the default front-of-card surface. It is a teaching/transparency affordance, not primary chrome.

**Crypto note for the key export.** The read path imports the key **decrypt-only and non-extractable** (`derivePublicPreviewKeys`, doc 03 §1.1) — so it cannot be exported. To surface the key string, the transparency affordance re-derives the **raw key bytes** (the same PBKDF2 output, which it may compute on demand) and base64url-encodes those — it does **not** weaken the read path's non-extractable import. The bytes are public-derivable regardless, so this is purely a display convenience.

**Security.** Everything shown (transfer-id, read-only key, link) is **derivable by anyone from the public-id**, which is public by design. The key is **read-only / decrypt-only** and reaches **only the preview blob** (doc 09 R3, R-leak). Exposing it therefore adds **zero** exposure — it just makes the existing exposure legible. The owner's `delete_auth` (write capability) is **never** shown — it is not derivable and lives only in the owner vault (doc 03 §3.3). Verdict: GO (doc 09 R-transparency).

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
