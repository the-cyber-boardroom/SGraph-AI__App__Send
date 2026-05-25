# 07 — Build Sequence (Phases) for Public Vault Previews

**version** v0.27.62
**date** 25 May 2026
**from** Developer (lead)
**to** implementing agent
**source** docs 02–06, 08, 09

Six phases. Because DELETE, expiry, and the `/en-gb/app` route already exist in this repo, there is **no backend-blocked phase** — every phase is buildable now. Phase 1 is headless-testable and standalone. Keep files small (IFD: <300 target / <500 ceiling), split by concern. Brief acceptance numbers are cited as **AC#n**.

> **Tests:** no mocks, no patches — the in-memory transfer service (`Transfer__Service` with `Storage_FS__Memory`) starts in-process; crypto runs in a browser/Playwright harness. Integration tests can drive the real `create/upload/complete/download/delete` against the in-memory stack.

---

## Phase 0 — decisions (no code; does NOT block Phases 1–4)

Confirm with the owners (doc 08):
1. **Default expiry policy** (Dinis): no-expiry default vs N-day default; whether open-count is offered in v1 UI.
2. **Thumbnail cap + downscale** (Product/Designer): the ~64 KB inline cap and whether the editor downscales client-side.
3. **Route rewrite** (DevOps): serve `app/index.html` for `/en-gb/app/<public-id>`; until then Phases 3–4 use `?p=`.
4. **OG-render placement** (DevOps): public User-Lambda route (recommended) vs CloudFront edge; agree the latency target.

**Acceptance:** decisions recorded in doc 08.

---

## Phase 1 — core: derive + schema + read (+ tests) — SHIPPABLE, headless

The cryptographic heart. Fully testable with no UI and no owner vault.

**New files** (`VAULT/_common/js/lib/sg-public-preview/`)
- `public-preview-crypto.js` — `derivePublicPreviewKeys(publicId)` (doc 03 §1).
- `public-preview-schema.js` — `validatePreview`, `emptyPreview`, `PREVIEW_SCHEMA_VERSION`, id-format validator + Simple-Token-regex rejection, field-name guard (doc 03 §2, doc 02 §5).
- `public-preview-read.js` — `fetchPreview(apiBase, publicId)` (port `SendCrypto` decrypt + SGMETA unwrap).

**Tests**
- **KAT (R3 gate):** `derivePublicPreviewKeys('x')` read-key bytes and transfer-id **differ** from `SGVaultCrypto` and `FriendlyCrypto` outputs for the same input `'x'`.
- Read key imported `['decrypt']` only — assert encrypt throws.
- `validatePreview` rejects unknown schema, banned `write_key`/`read_key`/`passphrase`, oversized inline thumb; accepts minimal `{schema,title}`.
- id-format validator rejects bad charset/length and the `word-word-NNNN` regex.
- Round-trip: encrypt a known preview blob → serve via the in-memory transfer service → `fetchPreview` returns the same JSON.

**Acceptance:** KATs green; **AC3**, **AC4**, **AC5** verifiable headlessly.

---

## Phase 2 — core: publish / update / unpublish + owner bookkeeping

The owner-side write path. Needs an owner vault + an SG/Send access token (integration test against the in-memory stack).

**New files**
- `public-preview-write.js` — `publishPreview` / `updatePreview` / `unpublishPreview` (doc 03 §3): random `delete_auth`; `SendCrypto.encryptFile` + SGMETA + `create`(with `delete_auth_hash`, `expires_at`, `max_downloads`, `auto_delete`)/`upload`/`complete`; `DELETE` on update/unpublish; bookkeeping at `.sgraph/public-previews/<public-id>.json` via `SGVault`.

**Acceptance:**
- `publishPreview` runs create→upload→complete; a subsequent `fetchPreview` (Phase 1) returns the published JSON. **AC1**, **AC2**.
- `updatePreview` deletes (with the persisted `delete_auth`) then recreates at the **same** transfer-id; `fetchPreview` returns the new JSON; the share link is unchanged. **AC10**.
- `unpublishPreview` deletes the transfer; subsequent `fetchPreview` → not-found.
- Bookkeeping JSON round-trips via the vault client; `delete_auth` is present and random (not derived from the public-id).
- Collision: custom-id `create` 409 with no owner-held `delete_auth` → "taken"; with one → treated as update. **AC5**.
- Publish refuses any preview containing `write_key`/`read_key`/`passphrase` (R2).
- Expiry: `create` carries `expires_at`/`max_downloads`; an integration download past the limit/expiry returns `410`. **AC9**.

---

## Phase 3 — `sg-public-preview-card` + the `/en-gb/app` route (public page)

The public-page surface, wired into the existing app shell.

**New / changed**
- `VAULT/_common/js/components/sg-public-preview-card/` — renders all Mode A/B states (mockups §1-4): skeleton, preview, key prompt, wrong-key, expired, exhausted, not-found, corporate no-key. Imports only the read path + tokens; extends `VaultComponent`.
- `VAULT/en-gb/app/index.html` + `<app-shell>` — read the public-id (path segment, or `?p=` interim), mount the card first, then run the normal `#<vault-key>` open flow.

**Acceptance:**
- `/en-gb/app/<published-id>` (or `?p=`) → skeleton → card renders title/description/thumbnail/disclaimer/support (mockups §1, §3). **AC2**, **AC4**, **AC8**.
- Mode A key prompt: valid key opens the vault via the normal flow; wrong key → inline error (UX §2.2). **AC6**.
- Mode B: `…#<vault-key>` → fast card paint + concurrent vault open (UX §3). **AC6**.
- Expired / exhausted / not-found render correctly (mockups §4).

---

## Phase 4 — `sg-public-preview-editor` on the settings surface

The edit/publish UX.

**New files**
- `VAULT/_common/js/components/sg-public-preview-editor/` — toggle (default OFF), id chooser (custom/random + live validation + "taken" path), fields, thumbnail picker (EXIF strip + WebP re-encode + inline/blob switch), the "THIS WILL BE PUBLIC" confirmation, publish, the seamless update + unpublish, share affordance with the key-inclusion warning (mockups §5-8).

**Acceptance:**
- Editor opens empty + disabled (default nothing public). **AC10**, R2.
- Custom id live-validates; "taken" path on a colliding publish. **AC5**.
- Thumbnail: select → EXIF stripped + WebP re-encoded; over-cap → blob path or downscale prompt (R-thumb).
- Confirmation echoes the live card; `[Publish]` not default-focused; publish writes transfer + bookkeeping. **AC1**, **AC2**.
- Edit → seamless in-place update (same share link, mockups §8). **AC10**.
- Share affordance: preview-only link by default; full-access (`#key`) link behind a disclosure with the high-contrast warning (mockups §7).
- Expiry controls write `expires_at` / `max_downloads` at create. **AC9**.

---

## Phase 5 — meta tags: client `sg-public-preview-meta` + in-repo OG-render route

Social-share cards. Two parts: in-browser tags (humans) and the server route (crawlers).

**New files**
- `VAULT/_common/js/components/sg-public-preview-meta/` — injects `og:title`/`og:description`/`og:image`/`twitter:*` into `document.head` from the JSON.
- `LAMBDA/fast_api/routes/Routes__Public_Preview.py` (or extend the static/app route) — Python-port the derive + transfer fetch + AES-GCM decrypt of the **public preview only**, inject OG tags into the served shell, cache by public-id, **fail closed** to the plain shell on any error.

**Acceptance:**
- Client: sharing from a JS-capable context shows a correct card (humans).
- Server: a non-JS crawler GET returns OG tags in the served HTML; latency measured + recorded (doc 08 Q-meta). **AC7**.
- The route never returns vault contents; error path serves the plain shell; stores nothing new.

---

## Phase 6 — composition with sub-vaults (`<sg-link-card>`) — optional / coordinated

When the sub-vaults branch lands, wire `<sg-link-card>` to call `fetchPreview(apiBase, childPublicId)` so a child vault's public info renders **before** the key prompt (doc 02 §4.4; sub-vaults P-162). No new core code — just the integration seam.

**Acceptance:** the link card shows a child preview before asking for the child key; no public-preview core changes required.

---

## Acceptance-criteria coverage map

| AC# | Satisfied in |
|---|---|
| 1 optional public preview | P2, P4 |
| 2 deliberately public | P2, P3, P4 |
| 3 deterministic derivation | P1 |
| 4 convention JSON | P1, P3 |
| 5 user-defined / random ids | P1, P2, P4 |
| 6 two access modes | P3 |
| 7 social-share meta | P5 |
| 8 disclaimers + support | P3 |
| 9 timing/expiry (time + open-count) | P2, P4 (native server enforcement) |
| 10 edit UX on settings (in-place) | P2, P4 |

---

## Branch discipline

Feature branches off `dev`, named `claude/{description}-{session-id}` (CLAUDE.md §Git). **Never push to `dev`/`main`.** Commit per acceptance criterion; push after each. Update the reality document (`team/roles/librarian/reality/vault/`) in the same commit that adds the new module / components / route. No PR until asked.

---

## Handover prompt template (per phase)

> You are implementing **Phase N** of `public-vault-previews`. Read the dev pack at `library/sgraph-send/dev_packs/v0.27.62__public-vault-previews/` top to bottom: `00__README` (the `__Send` corrections), `01__brief` (+ 3 corrections — authoritative), `02__architecture`, `03__derivation-and-storage`, `04__ux`, `05__mockups`, `06__reuse-map`, `07__phases` §Phase N, `08__open-questions`, `09__security-review`.
>
> Build only Phase N's scope. Use the **real `__Send` paths** in `06__reuse-map` (verify they still exist). Two hard security gates apply to every phase: (1) **never derive a write key OR `delete_auth` from the public string** (doc 09 R3/R-deface), and (2) the derivation constants must pass the known-answer test in Phase 1 before release. Keep files <500 lines, split by concern. Extend `VaultComponent` (not `SgComponent`); no `SgToolApi` dependency.
>
> Stop after Phase N's acceptance criteria are green. Commit per criterion. Push to your `claude/...` branch. Update the reality document in the same commit. Do not push to `dev`/`main`; do not open a PR unless asked.

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
