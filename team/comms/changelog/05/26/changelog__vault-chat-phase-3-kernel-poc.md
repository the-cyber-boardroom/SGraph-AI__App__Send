# Changelog — Vault Chat Phase 3 PoC: rebase onto SecureChannel + kernel-app-handlers

**Version:** (CI-assigned)
**Date:** 2026-05-26
**Author:** Architect/Dev (Claude Code session claude/zen-shannon-226hD)
**Trigger:** Dinis — rebase the Phase-3 plan onto the new vault-UI architecture (kernel,
secure-channel, app-permissions) and produce a working PoC before merging anything.

---

## Summary

A working **PoC** that proves Vault Chat runs against the new kernel/secure-channel
architecture on dev. The chat lives in a **null-origin** sandboxed iframe and talks to the
parent over a **real `SecureChannel`** (ECDSA P-256 sign + ECDH P-256 key agreement + AES-GCM
envelopes + replay guard). The parent registers the kernel's `vfs.*` handlers
(`registerKernelVfsHandlers`) against an in-memory dataSource, and `AppPermissions.isFloor`
refuses `/.vault/**` from the app — regardless of what the model asks.

## What's in the PoC

Path: `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/en-gb/vault/chat/kernel-poc/`

| File | Role |
|---|---|
| `index.html` | Parent page: builds the fake in-memory dataSource (incl. `/.vault/secrets/openrouter.key` for the floor probe), creates a `MessageChannel`, posts `init` with port2 to the iframe, runs `SecureChannel.accept` (cid pinned), registers `registerKernelVfsHandlers`, renders probe results + handler activity on the side panel. |
| `iframe.html` | Null-origin sandboxed (`sandbox="allow-scripts"`) chat iframe: loads SecureChannel + the chat lib + the pane, plus an on-`sg-app:ready` runner that fires five probes via `window.sg.vfs.*` and reports each via `sg.ui.message`. |
| `chat-app-stub.js` | A PoC-scoped equivalent of the shipped `sg-app-stub` that uses **only** `SecureChannel.request/handle` (no `.send/.on` dependency). Same null-origin / secret-less / sg.* surface; production wiring will use the shipped stub. |
| `tests/e2e/vault_ui/vault-chat/kernel-poc.smoke.mjs` | Browser smoke (real chromium): asserts the handshake completes, all five probes give the expected outcomes (`/.vault/**` ⇒ EPROTECTED), and the chat pane runs a CONFIRM-approved write under the new transport. |

## What the PoC demonstrates (9 green checks in the smoke)

1. `SecureChannel` handshake completes (PKI: ECDSA P-256 + ECDH P-256 + AES-GCM).
2. `sg.vfs.list("/")` served by the parent over the encrypted channel.
3. `sg.vfs.readText("/notes.md")` served via the channel (sensitive/encrypted request).
4. **`sg.vfs.list("/.vault")` refused with `EPROTECTED`** — kernel `AppPermissions.isFloor`.
5. **`sg.vfs.readText("/.vault/secrets/openrouter.key")` refused with `EPROTECTED`** — the
   reserved prefix is unreachable to the app regardless of what's said in the prompt.
6. `sg.vfs.write` executed over the channel (writes through to the parent's dataSource).
7. The Vault Chat pane (`<vault-chat-pane>`) raises an inline CONFIRM card under the new transport.
8. Approve → the write executes (mock LLM keyless).
9. No console/page errors (CDN cert/CORS warnings accepted as environmental).

## Key correction folded in (the bug that took the time)

`SecureChannel.accept(port, { expectSensitive: true })` defaults the `cid` to a random value;
the iframe used the `cid` from the init message. The post-handshake `_dispatch` has an `M6`
pin: `if (msg.cid !== this._cid) return;` — so without explicitly passing the SAME `cid` to
`accept` as we posted in `init`, every post-handshake envelope was silently dropped on the
parent side. The shipped `bootstrapFromIframe` does this automatically (it's the same
function that mints the cid); when you set up the port manually you MUST pass the cid
through. Documented in the PoC's index.html comment near `SecureChannel.accept`.

## What this PoC explicitly defers (still future work)

- **`sg.vfs.writeBatch` (commit-coalescing)** — kernel currently writes one commit per
  `vfs.write`. The dev-pack §03 EXTENSION is a kernel-side change (modify
  `kernel-app-handlers.js` + sg-app-stub), out of MVP scope.
- **`__sgSecrets` + vault-stored OpenRouter key** — no app-secret registry exists yet
  (the agent's map confirms: P-5.x). The chat's existing real-LLM key field is the seam.
- **Use of the canonical `sg-app-stub`** — the PoC uses its own `chat-app-stub` (built on
  `request/handle` only) so the demonstration is robust against any subtle send/on plumbing
  differences. Production should swap in the shipped stub once the cid handshake is wired.
- **Mounting via `app-shell.js`'s primary mount path** — the primary app mount still uses
  the legacy postMessage bridge on dev. This PoC stands up the kernel topology on its own
  page; integrating with the primary mount path is a separate, larger piece.

## Verified vs. not

- ✅ Real-chromium PoC smoke (9 checks, all green): `node tests/e2e/vault_ui/vault-chat/kernel-poc.smoke.mjs`
- ✅ Vault Chat unit suite (52 assertions) still green after the merge + PoC build: `npm run test:vault-chat-unit`
- ✅ The original in-vault chat page smoke (legacy bridge path) still green: `node tests/e2e/vault_ui/vault-chat/page.smoke.mjs`
- ❌ Live model round-trip — needs an OpenRouter key (your USER_GUIDE Recipe 11)
- ❌ Production mount via `app-shell.js` primary path — out of scope for the PoC
