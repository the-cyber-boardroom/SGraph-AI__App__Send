# Vault-in-vault — follow-ups + the `allow-popups-to-escape-sandbox` question

**Date:** 2026-06-15 · **For:** SG/Vault platform + any agent doing vault-in-vault work
**Status:** Proposals. `sg.vault.embed()` itself is SHIPPED (commit `2da2b270`).

This doc covers (1) where the current guidance lives, (2) two optional follow-ups I
offered, and (3) the security question raised in review: *should we be granting
`allow-popups-to-escape-sandbox` at all, or should those actions go via postMessage?*

---

## 0. Where the current guidance lives (give agents this)

The single source of truth for embedding a vault in a vault is now:

- **`library/guides/vault-html/AUTHORING.md` → "Embedding another vault inside your app
  (`sg.vault.embed`)"**.

It prescribes the one-liner and the least-privilege rules. The hand-rolled ~70-line
handshake (the `vault-in-vault-embedding-guide.md` an agent wrote) is now the
**anti-pattern** — keep it only as background reading; don't copy it.

```js
const info = await sg.vault.embed(mountEl, vaultKey);   // {vaultName,fileCount,hasApp,iframe}
```

Everything an author needs is that call. The platform owns the handshake, the
opaque-origin handling, and the sandbox.

---

## Follow-up 1 — `<sg-vault-frame>` declarative element

**What:** a custom element that wraps `sg.vault.embed` so authors can write HTML instead
of JS:

```html
<sg-vault-frame key="passphrase:vault-id"
                host="https://dev.vault.sgraph.ai"
                surface="app"
                deeplink="reports/2026-06-15.html"></sg-vault-frame>
```

It mounts the iframe, runs the handshake, emits `sg-vault-ready` / `sg-vault-error`
events, and shows a built-in spinner + "Open in new tab" fallback link.

**Why:** non-JS authors (and template/markdown-driven apps) get vault-in-vault with one
tag. It is a thin wrapper over `sg.vault.embed` — same security defaults, no new surface
area.

**Cost:** ~40 LOC custom element + registration in the injected bridge (so it's defined
inside the app frame), ~6 unit tests on attribute → option mapping. Half a day.

**Open question:** changing `key` at runtime should rebuild the frame (the handshake is
one-shot). The element handles that; `sg.vault.embed` callers do it by re-calling.

---

## Follow-up 2 — embed the file browser (`/en-gb/vault/`), not just the app

**What:** today only `/en-gb/app/` supports `?embed=1`. `sg.vault.embed(el, key,
{surface:'vault'})` builds the right URL, but the **file-browser surface
(`vault-shell.js`) has no embed handshake**, so it falls back to the entry form.

**Why someone wants it:** to embed the raw file browser (tree + viewers + SGit/diff)
inside a parent app — e.g. a board console that shows a patient's *files* directly,
not the patient's app.

**Cost:** mirror `app-shell._initEmbed` into `vault-shell.js`:
- detect `?embed=1` early (before the localStorage/key read),
- post `vault-embed-ready`, listen one-shot for `vault-open`, open in memory,
- forward `vault-opened` → `vault-ready`,
- and **apply the same null-origin `replaceState` guard** (the bug we just fixed in
  app-shell — vault-shell has the same address-bar scrub and would hang identically).
~1 day incl. a browser handshake test.

**Note:** the file-browser's **download** (Save) button needs `allow-downloads`, and its
**Print** opens a popup (`SgPrint` → `window.open`) which needs `allow-popups`. So an
author embedding `surface:'vault'` who wants those would pass
`sg.vault.embed(el, key, {surface:'vault', sandbox:['downloads','popups']})` — still
**never** the escape token (see §3).

---

## 3. The real question — `allow-popups-to-escape-sandbox`

**Short answer: your instinct is correct.** Privileged, boundary-crossing actions
*should* go via `postMessage` to the host, and `allow-popups-to-escape-sandbox` is the
one place the codebase breaks that rule. Here's the honest state of it.

### Where it stands today

| Frame | Sandbox | Notes |
|---|---|---|
| **Embedded vault** (`sg.vault.embed`) | `allow-scripts` **only** | We already do the right thing. No popups, no escape. ✅ |
| **Host's own app frames** (`app-shell._mountApp` et al.) | `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox` | The broad grant lives here. |

So the embed work you reviewed is already least-privilege. The grant you're questioning
is on the **host's top-level app frames** (e.g. the Board Console itself).

### Why escape-sandbox is there

External links (`<a href="https://…">`) inside a vault app are opened in a new tab by the
bridge's click interceptor calling **`window.open(href, '_blank')` *inside* the iframe**
(`app-shell.js:2422`). For that new tab to be a *real* unrestricted browser tab (not
itself sandboxed and broken), the iframe needs `allow-popups-to-escape-sandbox`.

The code comment spells out why it's done in-frame rather than via postMessage:

> *"Doing it from inside the iframe (synchronous within the click gesture) avoids the
> popup-blocker hit that a postMessage round-trip to the parent would incur — postMessage
> is async, the gesture is lost, and `window.open()` in the parent would be blocked."*

That's the real obstacle: **popup blockers require `window.open` to run synchronously
inside a user-activation (the click).** A `postMessage` to the parent is async, so by the
time the host calls `window.open` the transient activation has expired and the popup is
blocked. So the naive "just postMessage it" (Option B) **doesn't work** — it's not an
oversight, it's a constraint. That's the one honest caveat to your instinct.

### So how do we honor the instinct anyway?

Two viable designs, both better than the current blanket grant:

**Option C — opt-in escape (recommended, small).**
Default app frames to **no popups / no escape**. An app that genuinely opens external
links declares it in `app.json`, e.g. `permissions.externalLinks: true`. Only those
frames get `allow-popups allow-popups-to-escape-sandbox`. Result: least-privilege by
default; the broad grant exists only for apps that asked for it and whose author the user
trusts (same trust boundary as every other `app.json` grant). ~½ day; no UX change for
apps that opt in.

**Option D — host-mediated open (max security, more friction).**
Drop escape-sandbox entirely. The in-frame click posts `{sg:'open-external', url}` to the
host; the host renders a small **"Open `example.com` ↗"** affordance that the **user
clicks on the host chrome**, so `window.open` runs inside the *host's* gesture (real
origin, no escape needed). Bonus: it becomes a **consent moment for external navigation**
— the user sees where a vault file is trying to send them before it opens, which is a nice
property for a zero-knowledge tool. Cost: one extra click per external link + host UI.

**Recommendation:** ship **Option C** now (it directly answers "don't grant escape by
default"), and consider **Option D** as the long-term posture if we want external
navigation to be a visible, consented action. Either way, **`sg.vault.embed` already never
grants escape** — this is purely about tightening the *host's* app frames.

> **UPDATE 2026-06-15 — C **and** D shipped (they compose).** Default host app-frame
> sandbox dropped to `allow-scripts allow-forms` (no popups, no escape). External link
> clicks now post `{__sgOpenExternal:url}` to the host, which shows a one-click
> "Open `<url>` ↗" confirm and opens it in the host's gesture (Option D — the safe
> default for every app, plus an external-nav consent moment). An app that wants the
> frictionless in-frame open declares `permissions.externalLinks: true`, which restores
> `allow-popups allow-popups-to-escape-sandbox` and in-frame `window.open` (Option C).
> `_promptExternalOpen` validates http/https only (rejects `javascript:`/`data:`).
> Code: `app-permissions.js` (grant), `app-shell.js` (`_appSandbox`/`_promptExternalOpen`
> + bridge branch + `__sgOpenExternal` handler), `app-hud.js` (`promptExternalLink` bar).
> Kernel bundle regenerated (app-permissions.js is bundled). Browser-unverified.

### What NOT to do

- Don't "fix" anything by adding `allow-same-origin` — it dissolves the whole opaque-origin
  / no-storage boundary.
- Don't drop escape-sandbox without Option C or D first, or external links in existing
  apps silently stop opening (or open as broken sandboxed tabs).

---

## Summary for an agent picking this up

1. Use `sg.vault.embed` (AUTHORING.md). Never the hand-rolled handshake.
2. Embedded frames are `allow-scripts` only; add narrow tokens per action, never escape.
3. The host-app-frame escape grant is a known wart with a known fix (Option C). It exists
   because external-link popups must fire inside the click gesture, which postMessage
   loses. If you touch it, do Option C (opt-in) or D (host-mediated), not a naive
   postMessage swap.
