# 05 — ASCII Mockups: Public Page and Settings Editor

**version** v0.27.62
**date** 25 May 2026
**from** Developer (lead) + Designer
**companion** UX flows in `04__ux.md`

Illustrative, not pixel-perfect. `▸`/`▾` are disclosures; `◉`/`○` are radios; `[ ]`/`[●]` are toggles; `▍` is a progress fill. Public surfaces render via `sg-public-preview-card`; settings via `sg-public-preview-editor`; both use `design-tokens.css`. App URLs are on the vault host (`dev.vault.sgraph.ai/en-gb/app/<public-id>`); the API is `send.sgraph.ai`.

---

## 1. Public page — Mode A: preview + key prompt (no `#`)

URL `dev.vault.sgraph.ai/en-gb/app/vault-demo-health-data` (or dev `?p=vault-demo-health-data`).

```
┌────────────────────────────────────────────────────────────────────┐
│  🔒 sgraph vault                                    dev.vault.sgraph │
├────────────────────────────────────────────────────────────────────┤
│   ┌──────────────────────────────────────────────────────────┐     │
│   │  ┌────────────┐                                            │     │
│   │  │  thumbnail  │   Health Data Demo Vault                  │     │
│   │  └────────────┘   Public demo materials for the health-    │     │
│   │                   data pilot. Confidential where marked.   │     │
│   │  ┌──────────────────────────────────────────────────┐     │     │
│   │  │ ⚠ Confidential. Do not use unless authorised.     │     │     │  ← disclaimer callout
│   │  └──────────────────────────────────────────────────┘     │     │
│   │  Enter the vault key to open the contents                  │     │
│   │  ┌────────────────────────────────────────┐  ┌─────────┐  │     │
│   │  │ passphrase:vaultId  or  read-key…       │  │ Open ▶  │  │     │
│   │  └────────────────────────────────────────┘  └─────────┘  │     │
│   │  No key?  ✉ Contact Dinis                                  │     │  ← support link
│   └──────────────────────────────────────────────────────────┘     │
│   This is a public preview. Vault contents stay encrypted.           │
└────────────────────────────────────────────────────────────────────┘
```

The key the user types is written to `location.hash` (never the path) and runs the normal open flow.

---

## 2. Public page — Mode B: fast paint then auto-loaded vault (`#<key>`)

URL `…/en-gb/app/vault-demo-health-data#passphrase:abc123`. Card paints immediately; contents fill in behind it.

```
┌────────────────────────────────────────────────────────────────────┐
│   ┌──────────────────────────────────────────────────────────┐     │
│   │ ┌──────────┐  Health Data Demo Vault                      │     │  ← preview card
│   │ │ thumb    │  Public demo materials for the health-data…  │     │     (painted first)
│   │ └──────────┘  Opening vault…  ▍▍▍▍▍▍▍▍░░░░░░               │     │  ← parallel open
│   └──────────────────────────────────────────────────────────┘     │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │ 📁 vault contents                                          │     │  ← fills in behind
│   │   ▾ 📁 reports   ·  📄 q1-summary.md   📄 methodology.pdf  │     │
│   │   ▾ 📁 data      ·  📄 anonymised.csv                      │     │
│   └──────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

Preview fetch and vault open are concurrent; neither blocks the other.

---

## 3. Public page — corporate no-key state (disclaimer + support)

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────────┐   Acme Q3 Board Pack                       │
│  └────────────┘                                            │
│  ┌──────────────────────────────────────────────────┐     │
│  │ ⚠ CONFIDENTIAL                                    │     │
│  │   This material is confidential. Do not use or    │     │
│  │   forward unless you are authorised.              │     │
│  └──────────────────────────────────────────────────┘     │
│  Have the key?                                             │
│  ┌────────────────────────────────────┐  ┌─────────┐      │
│  │ enter vault key…                    │  │ Open ▶  │      │
│  └────────────────────────────────────┘  └─────────┘      │
│  ┌──────────────────────────────────────────────────┐     │
│  │  ✉  No key? Contact dinis.cruz@owasp.org          │     │  ← support button
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

A dead end becomes a professional page.

---

## 4. Public page — expired / exhausted / not-found states

```
EXPIRED (410)                EXHAUSTED (410)              NOT-FOUND / NO-PREVIEW
┌────────────────────────┐   ┌────────────────────────┐  ┌────────────────────────────┐
│ ⌛ This preview has     │   │ 👁 View limit reached.  │  │ This link has no preview yet.│
│    expired.            │   │                        │  │ If you have the vault key,   │
│ ✉ Contact Dinis        │   │ ✉ Contact Dinis        │  │ you can still open the vault:│
│ (support if present)   │   │ (support if present)   │  │  ┌──────────┐ ┌────────┐    │
└────────────────────────┘   └────────────────────────┘  │  │ enter key│ │ Open ▶ │    │
                                                          │  └──────────┘ └────────┘    │
                                                          └────────────────────────────┘
```

Expired and exhausted are **server-enforced** (`410` from the transfer service — `expires_at` / `max_downloads`). Not-found and no-preview-set are the **same** surface (the derivation is deterministic — the page cannot tell them apart, by design). Malformed/invalid previews also render as not-found (no validation internals leaked).

---

## 5. Settings editor — `sg-public-preview-editor`

### 5a. Disabled (default — nothing public)

```
┌─ Public preview ──────────────────────────────────────────────┐
│   Public preview:  [○ OFF ]                                    │  ← toggle, starts OFF
│   A public preview lets anyone with the link see the title,    │
│   description, and thumbnail you choose — even without the     │
│   vault key. It is deliberately public.                        │
│   (form is hidden/disabled until you turn this on)             │
└────────────────────────────────────────────────────────────────┘
```

### 5b. Enabled — id chooser + fields + thumbnail + expiry

```
┌─ Public preview ──────────────────────────────────────────────┐
│   Public preview:  [● ON ]                                     │
│   Public id:                                                   │
│     ◉ Custom   ┌──────────────────────────────┐  ✓ available  │
│     │          │ vault-demo-health-data         │             │
│     │          └──────────────────────────────┘              │
│     │          Use lowercase letters, numbers, hyphens (4–63). │
│     ○ Random   ┌──────────────────────────────┐  [regenerate] │
│                │ k7m2q9x4r3n8w1z6 (readonly)    │             │
│                └──────────────────────────────┘              │
│   Title *      ┌──────────────────────────────────────────┐   │
│                │ Health Data Demo Vault                     │   │
│                └──────────────────────────────────────────┘   │
│   Description  ┌──────────────────────────────────────────┐   │
│                │ Public demo materials for the health-data │   │
│                │ pilot. Confidential where marked.         │   │
│                └──────────────────────────────────────────┘   │
│   Thumbnail    ┌──────────────────────────────────────────┐   │
│                │   ⬆  Drop an image or click to choose      │   │  ← image picker
│                │      PNG/JPG/WebP · re-encoded, EXIF strip │   │
│                └──────────────────────────────────────────┘   │
│                ◦ ≤ 64 KB → inline   ◦ larger → separate blob   │
│   Disclaimer   ┌──────────────────────────────────────────┐   │
│                │ Confidential. Do not use unless authorised│   │
│                └──────────────────────────────────────────┘   │
│   Support      label ┌───────────────────┐ href ┌──────────┐  │
│                      │ No key? Contact…  │      │ mailto:… │  │
│                      └───────────────────┘      └──────────┘  │
│   Expiry       [ ] Expire after [ 30 ] days   (server-enforced)│
│                [ ] Stop after  [ 50 ] opens   (server-enforced)│
│                                                                │
│                          [ Cancel ]   [ Review & publish → ]   │
└────────────────────────────────────────────────────────────────┘
```

`✓ available` / `✗ taken — choose another` resolves on the publish `create` (HTTP 409). The `write_key`/`read_key`/`passphrase` field ban runs before publish.

### 5c. The "THIS WILL BE PUBLIC" confirmation (echoes the rendered card)

```
┌─ Make this public? ────────────────────────────────────────────┐
│   This will be publicly readable by anyone with the link:      │
│     dev.vault.sgraph.ai/en-gb/app/vault-demo-health-data       │
│   The id appears in URLs and server logs.                      │
│   The vault's contents stay encrypted.                         │
│                                                                │
│   Viewers will see exactly this:                               │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ ┌──────┐ Health Data Demo Vault                       │    │  ← live card echo
│   │ │ thumb │ Public demo materials for the health-data…  │    │
│   │ └──────┘ ⚠ Confidential. Do not use unless authorised │    │
│   └──────────────────────────────────────────────────────┘    │
│        [ Cancel ]            [ Publish — make this public ]     │  ← Publish NOT default focus
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Rendered social-share card (WhatsApp / LinkedIn / Slack)

How the OG card looks once the **public-Lambda OG route** (doc 02 §6, Phase 5) injects `og:title` / `og:description` / `og:image` into the served shell. Client-only tags do **not** reach these crawlers.

```
WhatsApp / iMessage bubble                LinkedIn / Slack unfurl
┌────────────────────────────────┐       ┌────────────────────────────────────┐
│ ┌────────────────────────────┐ │       │ ┌──────┐ Health Data Demo Vault     │
│ │        [ thumbnail ]        │ │       │ │thumb │ Public demo materials for  │
│ └────────────────────────────┘ │       │ └──────┘ the health-data pilot…     │
│ Health Data Demo Vault          │       │          dev.vault.sgraph.ai        │
│ Public demo materials for the…  │       └────────────────────────────────────┘
│ dev.vault.sgraph.ai             │
└────────────────────────────────┘
```

---

## 7. "Copy share link" affordance + key-inclusion warning

```
┌─ Share this preview ───────────────────────────────────────────┐
│   ┌──────────────────────────────────────────┐  ┌───────────┐  │
│   │ dev.vault.sgraph.ai/en-gb/app/            │  │ Copy link │  │  ← preview-only (safe)
│   │ vault-demo-health-data                     │  └───────────┘  │
│   └──────────────────────────────────────────┘                 │
│   Anyone with this link sees the preview and is asked for the   │
│   key.                                                          │
│   ▸ Show full-access link (includes the vault key)              │  ← disclosure, collapsed
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ ⚠ INCLUDES THE VAULT KEY                                 │  │  ← high-contrast warning
│   │   …/app/vault-demo-health-data#passphrase:abc123         │  │
│   │   Anyone with this link can open the FULL vault.         │  │
│   │   Share only with people you trust.   [ Copy with key ]  │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

The full-access link is collapsed behind a disclosure so the safe, preview-only copy is the obvious default. The `#key` is assembled client-side and never logged or sent to the server.

---

## 8. Edit-after-publish — seamless in-place update (delete-then-recreate)

Because DELETE exists in this repo (doc 03 §3), editing a published preview is in-place and the **share link never changes**:

```
┌─ Update preview ───────────────────────────────────────────────┐
│   Updating preview…   ▍▍▍▍▍▍▍▍▍▍▍▍░░░                          │
│   (delete old transfer with your delete key → recreate at the   │
│    same id)                                                     │
└────────────────────────────────────────────────────────────────┘
        ↓
┌────────────────────────────────────────────────────────────────┐
│   ✓ Updated. Your share link is unchanged.                      │
└────────────────────────────────────────────────────────────────┘
```

No versioned-id workaround is needed (that was an upstream `__Tools`-pack fallback for a missing DELETE this repo does not have).

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
