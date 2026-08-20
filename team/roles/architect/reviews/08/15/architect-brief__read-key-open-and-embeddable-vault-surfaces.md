# Architecture & Implementation Brief — Read-Key Open + Embeddable Vault Surfaces

**Date:** 2026-08-15
**From:** Architect (Explorer team)
**To:** Dev (vault-web), AppSec, DevOps
**Type:** Architecture brief + implementation plan
**Status:** PROPOSED. Every "today" claim below is code-verified against
`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3` at `origin/dev` (`77adecc`); file:line cites verified 2026-08-15.

> **No version prefix on this filename.** Repo rule 27 forbids reading `sgraph_ai_app_send/version`,
> so this document cannot self-stamp. Rename with the correct prefix when landing if the Librarian
> wants convention parity.

---

## 0 · The ask, in one line

> Open **both** vault surfaces — the main vault UI (`/en-gb/vault/`) and the App UI with its HUD
> (`/en-gb/app/`) — from a **`<read_key>:<vault_id>`** credential, and make **both** embeddable as an
> iframe in a third-party website, reusing the official vault code rather than forking a viewer.

Driving use case: `sgit.ai` publishes a read key (already done for the app demo) and wants the *whole*
vault experience — file browser, the SGit history/commit view — live on the page, decrypted in the
reader's browser, from that one published credential.

---

## 1 · What already exists (code-verified)

Far more than expected. The primitive is done; what is missing is **plumbing at three specific points**.

| Capability | Status | Evidence |
|---|---|---|
| `SGVault.openReadOnly(sgSend, vaultId, readKeyB64, refFileId)` — opens a live, read-only vault, loads the tree, no passphrase/write key | **EXISTS** | `sg-vault.js:98` |
| `refFileId` derivable from `read_key` + `vault_id` alone (HMAC, no passphrase) | **EXISTS** | `sg-vault-crypto.js:91-107` — `_deriveFileId(hmacKey, 'sg-vault-v1:file-id:ref:'+vaultId)`, `hmacKey` imported from `readBits` |
| `_deriveFileId` helper | **EXISTS** | `sg-vault-crypto.js` |
| ro-token → read-only open, **both surfaces** | **EXISTS** | `vault-loader.js:122` (vault UI) · `app-shell.js:351-354` (app UI) |
| Embed handshake protocol (`vault-embed-ready` → `vault-open` → `vault-ready`) | **EXISTS** | `embed-protocol.js` |
| Embed **receiver** on `/en-gb/app/` (`?embed=1`, storage-bypassed, one-shot listener) | **EXISTS** | `app-shell.js:129-258` |
| `SgEmbed.buildEmbedSrc` / `sanitizeSandbox` — pure, unit-tested, node-testable | **EXISTS** | `sg-embed-helpers.js` |
| `buildEmbedSrc` already routes `surface:'vault'` → `/en-gb/vault/?embed=1` | **EXISTS** | `sg-embed-helpers.js` |
| Embed **parent** side (iframe + handshake), callable as `sg.vault.embed(...)` | **EXISTS — but only inside a vault app** | `app-shell.js:2796-2840` (`_embedHelperSrc`, injected into the bridge via `Function.toString`) |
| RO session detection → `👁 Read-only` pill, owner sections hidden | **EXISTS** | per 07/24 code review (`!writable && _passphrase === null`) |

**Consequence:** this is not a "build a read-only viewer" project. It is *four small connections*
between parts that already work.

---

## 2 · The four gaps

### Gap 1 — The credential format collides with `passphrase:vault_id`

`vault-loader-format.js` checks formats in this order: 5 (ro-token) → 1 (simple token) → **2/3
(`passphrase:vault_id`)** → 4 (`<vault_id> <64-hex>`, space-separated).

A string shaped `<64-hex>:<vault_id>` — **exactly the form the ask specifies, and exactly the
shorthand the `sgit` CLI already accepts** (`sgit clone "<64-hex>:<vault-id>"`) — matches **format 2**
(if `vault_id` is 12 hex) or **format 3** first. It is therefore parsed as a *passphrase*, run through
PBKDF2, and produces garbage keys. The failure surfaces late and unhelpfully as
`Vault not found: HEAD ref missing`.

This is a live CLI↔web interop bug today, independent of this work: the same credential string means
two different things in the two tools.

### Gap 2 — `VaultLoader.openReadOnly` is a stub

`vault-loader.js:103-114`:

```js
// Placeholder: format 4 requires further investigation for ref discovery.
async function openReadOnly(vaultId, readKeyHex, opts) {
    var err = new Error('Read-only vault open (format 4) is not yet supported. ...');
    throw err;
}
```

The stated blocker does not exist. Ref discovery is `sg-vault-crypto.js:91-107`, in a file this page
already loads, and the ro-token path in the same file already consumes the result.

### Gap 3 — Credential dispatch is duplicated across the two surfaces

`app-shell.js` header states it plainly: *"No vault-loader scripts are loaded on this page.
Credential parsing is inline."* Dispatch lives in two unrelated places:

| Surface | Dispatch site | Behaviour on `<hex>:<id>` today |
|---|---|---|
| `/en-gb/vault/` (main UI) | `VaultLoader.open()` → `detectFormat` | format 2/3 → PBKDF2 → wrong keys |
| `/en-gb/app/` (App UI + HUD) | `AppShell._initWithKey()` (`app-shell.js:338-364`) | `else` branch → `SGVault.open()` → PBKDF2 → wrong keys |

So fixing `VaultLoader` alone fixes **half** the ask. Both need the format, and the fix must not
become a third copy of the derivation.

### Gap 4 — No embed receiver on the main vault UI, and no parent-side helper for a plain website

Two distinct problems:

**4a. Receiver.** `EmbedProtocol` is referenced *only* by `app-shell.js`. `/en-gb/vault/` ignores
`?embed=1` entirely — it never posts `vault-embed-ready`, so a parent's handshake hangs until the 14 s
timeout. This is why `AUTHORING.md` records file-browser embed as "a planned follow-on" even though
`buildEmbedSrc` already emits the URL.

**4b. Parent side.** The handshake parent code exists only as a **string** inside
`app-shell._embedHelperSrc()`, injected into vault apps. `sgit.ai` is an ordinary web page with no
`window.sg`, so it has nothing to call. It would have to hand-roll ~70 lines of `postMessage` — the
exact thing `sg.vault.embed` was built to stop people doing.

---

## 3 · Design

### 3.1 One new primitive, in a file both surfaces already load

The two dispatch sites already consume the *same shape* — `app-shell.js:352` builds a `creds` object
of `{vaultId, readKeyB64, refFileId}` and passes it straight to `SGVault.openReadOnly`. Give both a
shared way to produce that shape from a read key:

```js
// sg-vault-crypto.js — loaded by BOTH /en-gb/vault/ and /en-gb/app/ (app/index.html:47)
static async deriveReadOnlyCreds(vaultId, readKeyHex) {
    const readBits = Uint8Array.from(readKeyHex.match(/../g).map(h => parseInt(h, 16)));
    const hmacKey  = await crypto.subtle.importKey(
        'raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const refHex   = await this._deriveFileId(hmacKey, `sg-vault-v1:file-id:ref:${vaultId}`);
    return {
        vaultId,
        readKeyB64: btoa(String.fromCharCode.apply(null, readBits)),
        refFileId:  'ref-pid-muw-' + refHex
    };
}
```

~12 lines, reusing the existing `_deriveFileId`. **This is the whole cryptographic content of the
feature.** Everything else is wiring.

Both call sites then converge on the primitive they already use for ro-tokens:

```js
const creds = await SGVaultCrypto.deriveReadOnlyCreds(vaultId, readKeyHex);
const vault = await SGVault.openReadOnly(sgSend, creds.vaultId, creds.readKeyB64, creds.refFileId);
```

**Invariant to assert in tests:** for any vault key, `deriveReadOnlyCreds(vaultId, hex(readKey))`
must return the same `refFileId` as `deriveKeys(vaultKey)`. One test kills the whole class of
drift bugs.

### 3.2 Credential format — recommendation

Add **format 6** and check it **before** formats 2 and 3:

```js
var RE_READ_KEY_COLON = /^([a-f0-9]{64}):([a-z0-9]{4,24})$/;   // <read_key>:<vault_id>
```

Ordering is the entire fix for Gap 1. Keep the existing space-separated format 4 working
(back-compat), and route both through the same `openReadOnly`.

**The trade-off, stated plainly:** a passphrase that happens to be exactly 64 lowercase-hex
characters would now be read as a read key instead. This is a real, if remote, behaviour change for
existing vaults. Two mitigations, and a decision is needed:

- **(Recommended) Accept it, for CLI parity.** The `sgit` CLI already claims this shape; matching it
  means one credential string works in both tools, which is the point. Note it in the migration doc.
- **Additionally accept an explicit `rk:` prefix** (`rk:<hex>:<id>`) as an unambiguous opt-in form for
  publication contexts. Costs three lines, removes all guesswork from published links, and is the
  form we would recommend on sgit.ai.

Both should be supported; the bare form for CLI parity, the prefixed form for anything published.

### 3.3 Embed: port the receiver, extract the parent

**Receiver (`/en-gb/vault/`).** Port the `_initEmbed` block (`app-shell.js:193-258`) into the vault
shell's init path. It is ~65 lines and already has the hard-won null-origin lessons baked in
(deep-link into instance memory not `sessionStorage`; one-shot listener; `targetOrigin` fallback).
Do **not** rewrite it — move it to a shared module and have both surfaces call it, or the two copies
will drift exactly as credential parsing already has.

**Parent (third-party page).** Extract the handshake from `app-shell._embedHelperSrc()` into a
standalone, vendorable script — `sg-vault-embed.js`, exposing a `<sg-vault-embed>` element and/or
`SgVaultEmbed.mount(el, key, opts)`. It composes the two already-standalone pure helpers
(`SgEmbed.buildEmbedSrc`, `SgEmbed.sanitizeSandbox`) with the handshake glue. `app-shell` then
*injects this same file* rather than a bespoke string — so the code a website vendors is byte-identical
to the code vault apps run, and there is one implementation, not two.

Target usage on sgit.ai:

```html
<script src="https://dev.vault.sgraph.ai/_common/js/lib/sg-embed/sg-vault-embed.js"></script>
<sg-vault-embed surface="vault" key="rk:2848…ad81:<vault_id>" style="height:600px"></sg-vault-embed>
```

---

## 4 · Security analysis

### 4.1 Safe by construction

- **A read key cannot yield a write key.** `read_key` and `write_key` are *independent* PBKDF2
  derivations from the passphrase (different salts, `sg-vault-crypto.js:69-81`) — not a chain.
  Publishing `read_key` can never confer write access. This is the property the whole feature rests on.
- **`SGVault.openReadOnly` fails closed**: `_passphrase = null`, `_writeKey = null`, `_hmacKey = null`,
  and the read key is imported **non-extractable** with `['decrypt']` only (`sg-vault.js:98`).
- **The `.vault/**` permission floor is unaffected** — it is enforced in the app bridge independent of
  how the vault was opened.

### 4.2 Must be stated to anyone publishing a key

- **A published read key exposes the entire history, not just current state.** The structure-key split
  is still inert (`reality/vault/index.md`) — refs, commits, trees and blobs are all encrypted with
  `read_key`. This is *why* the SGit history view works so well read-only, and it means every commit
  ever made is readable. **Publish only from a dedicated publish-vault that has never held private
  material.** This is a documentation requirement, not a code one, and it should appear on the
  published page itself.
- **Publishing is irrevocable.** Anyone who copies the key keeps read access to every object forever.
  There is no re-keying flow today. A publish-vault whose key must change means a new vault.

### 4.3 New surface, needs review

- **Sandbox posture for `surface:'vault'`.** `sanitizeSandbox` refuses `allow-same-origin` and
  `allow-popups-to-escape-sandbox` unconditionally, which is correct and must not be relaxed for the
  vault UI. But the vault UI is a *bigger* surface than an app frame — verify no feature silently
  depends on same-origin.
- **Storage in an opaque origin — a real implementation hazard.** `localStorage`/`sessionStorage`
  **throw** in a null-origin frame. `app-shell` handles this via an explicit `_embedMode` sentinel that
  skips the persist step (`app-shell.js:198-200`). The vault loader does **not**:
  `VaultLoader.openROToken` calls `VaultLoaderStorage.setCurrentKey(...)` and `VaultLoaderRecent.add(...)`
  unconditionally (`vault-loader.js:151-152`). The new `openReadOnly` must not repeat that, and the
  embed receiver work must audit **every** storage access on the vault-shell path. Expect this to be
  the bulk of the debugging.
- **Framing headers.** Third-party embedding requires the vault host not to send `X-Frame-Options: DENY`
  or a restrictive `frame-ancestors`. **DevOps: verify the deployed CloudFront/S3 response headers
  before Phase 3 starts** — if they block framing, no amount of client work helps. Not verifiable from
  the repo.
- **Read-only UI honesty.** Confirm the new path yields the same state the RO pill and owner-section
  hiding key off (`!writable && _passphrase === null`). It calls the same `SGVault.openReadOnly`, so it
  should — but it must be asserted, not assumed.

---

## 5 · Implementation plan

Phases are independently shippable and independently valuable.

### Phase 1 — Read-key open on the main vault UI *(smallest useful slice)*

| # | Change | File |
|---|---|---|
| 1.1 | Add `SGVaultCrypto.deriveReadOnlyCreds(vaultId, readKeyHex)` (§3.1) | `lib/sg-vault/sg-vault-crypto.js` |
| 1.2 | Add format 6 regex + detection **before** formats 2/3; optional `rk:` prefix | `vault-loader/vault-loader-format.js` |
| 1.3 | Replace the `openReadOnly` stub: derive → `SGVault.openReadOnly` → emit `VAULT_OPENED`, mirroring `openROToken`'s bookkeeping **but storage-safe** (§4.3) | `vault-loader/vault-loader.js` |
| 1.4 | Route format 6 → `openReadOnly` in `open()` | `vault-loader/vault-loader.js` |

**Ships:** `https://dev.vault.sgraph.ai/#rk:<hex>:<vault_id>` opens the full vault UI, read-only,
including the SGit view. Nothing embedded yet.

### Phase 2 — Read-key open on the App UI (HUD surface)

| # | Change | File |
|---|---|---|
| 2.1 | Load `vault-loader-format.js` on the app page (pure regex, no deps — it is safe to add) | `en-gb/app/index.html` |
| 2.2 | Add a format-6 branch to `_initWithKey` alongside the existing `ro-` branch, calling the **same** `deriveReadOnlyCreds` → `SGVault.openReadOnly` | `app-shell.js:338-364` |
| 2.3 | Ensure `isRO = true` so downstream RO handling (`sg.app.writable === false`, HUD state) is identical to the ro-token path | `app-shell.js` |

**Ships:** the app surface opens from a read key. Note 2.2 deliberately *adds a branch* rather than
adopting `VaultLoader` wholesale on the app page — the smaller change; full unification of the two
dispatch sites is worth a follow-up but is not required here.

### Phase 3 — Embed the main vault UI

| # | Change | File |
|---|---|---|
| 3.1 | Extract `_initEmbed` into a shared module (`embed-receiver.js`) consumed by both shells — do not copy | new + `app-shell.js` |
| 3.2 | Wire the receiver into the vault shell init, **before** any storage read (matching `app-shell.js:129-132`) | `vault-shell.js` / root `index.html` |
| 3.3 | Audit + guard every storage access on the RO/embed path (§4.3) | `vault-loader*.js`, `vault-shell.js` |
| 3.4 | Post `vault-ready` on the vault shell's mounted event, mirroring `_embedReadyHandler` | `vault-shell.js` |

> **Deployment gotcha:** `/en-gb/vault/index.html` is **generated at deploy time** by `sed` from the
> root `index.html` (`.github/workflows/deploy-ui-vault.yml`, "Generate en-gb/vault/index.html").
> Edits must go into the **root** `index.html` or a component — anything written directly into the
> generated file is silently overwritten on deploy.

### Phase 4 — Vendorable parent-side embed helper

| # | Change | File |
|---|---|---|
| 4.1 | New `sg-vault-embed.js`: `<sg-vault-embed>` element + `SgVaultEmbed.mount(el, key, opts)`, composing the existing pure helpers with the handshake | new, `lib/sg-embed/` |
| 4.2 | Refactor `app-shell._embedHelperSrc()` to inject **that file** instead of its bespoke string, so app and web share one implementation | `app-shell.js:2796-2840` |
| 4.3 | Serve it from a stable versioned URL for third-party vendoring | `deploy-ui-vault.yml` / DevOps |

---

## 6 · Testing

Existing pattern: pure logic is unit-tested in Node via `runInThisContext`
(`tests/unit/vault_ui/loader/`). All of the below fit that harness — no browser required except 6.5.

| # | Test | Kills |
|---|---|---|
| 6.1 | `deriveReadOnlyCreds(vaultId, hex(readKey)).refFileId === deriveKeys(vaultKey).refFileId` | derivation drift (the important one) |
| 6.2 | `detectFormat('<64hex>:<12hex>') → format 6`, **not** 2 | the ordering collision |
| 6.3 | `detectFormat` regression suite: formats 1–5 unchanged | back-compat |
| 6.4 | Open a seeded in-memory vault by read key → tree matches the rw open; write attempts reject | RO correctness |
| 6.5 | Embed handshake against a real child frame (extend `test__sg_embed_helpers.js`) | receiver wiring |
| 6.6 | Storage-throws simulation (stub `localStorage` to throw) → RO open still succeeds | the null-origin hazard (§4.3) |

---

## 7 · Decisions needed before Phase 1

1. **Format 6 shape** — bare `<hex>:<id>` for CLI parity, `rk:`-prefixed, or both? *(Recommend both;
   publish the prefixed form.)*
2. **Accept the 64-hex-passphrase edge case?** *(Recommend yes, documented.)*
3. **Phase 2 scope** — add a branch to `_initWithKey` (recommended, small), or unify both surfaces
   onto `VaultLoader` now (cleaner, larger, riskier)?
4. **AppSec sign-off** on embedding the *full vault UI* cross-origin — is there any surface in the
   vault shell (settings, token manager, SGit view) that should be suppressed in embed mode?
5. **DevOps:** confirm deployed framing headers permit third-party embedding (§4.3).

---

## 8 · What this unblocks

- `sgit.ai` embeds a live, browsable vault — file tree and commit history — from a published read key,
  next to the app demo it already shows.
- The CLI↔web credential-string mismatch (Gap 1) is fixed as a side effect.
- `sg.vault.embed({surface:'vault'})` stops being a documented-but-inert option.
- Any website can embed a vault with one script tag and one attribute — running the *official* vault
  code, not a reimplementation.

## 9 · Related

- `library/guides/vault-html/AUTHORING.md` → "Embedding another vault inside your app"
- `library/guides/vault-html/HOSTING-ON-STATIC-STORAGE.md` — the complementary no-backend path
- `team/roles/dev/reviews/07/24/v0.33.44__code-review__vault-readonly-key-sharing.md` — first flagged
  the format-4 stub (F2) and scoped it at ~20 lines; this brief confirms that and extends it to both
  surfaces plus embedding
- `team/roles/librarian/reality/vault/index.md` — key derivation, inert structure-key split
