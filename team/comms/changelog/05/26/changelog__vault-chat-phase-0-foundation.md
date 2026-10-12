# Changelog — Vault Chat Phase 0 (foundation: working set, execution center, agentic loop, standalone harness)

**Version:** (CI-assigned — see the version file after the pipeline runs)
**Date:** 2026-05-26
**Author:** Architect/Dev (Claude Code session claude/zen-shannon-226hD)
**Trigger:** Dinis — implement the Vault Chat dev pack (`library/sgraph-send/dev_packs/v0.27.80__vault-chat/`), starting with Phase 0.

---

## Summary

Phase 0 of Vault Chat: the **buildable, AppSec-gate-free foundation** (no vault writes, no
OpenRouter key, decoupled from the vault). It implements the BUILD-NEW core from the dev pack
plus a standalone test harness driven by a mock `window.sg` and a mock LLM, exactly the brief's
"long test page … properties not related to the vault."

New library modules (`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/vault-chat/`),
all browser IIFEs attaching to `window.VaultChat`:

| Module | Role | Dev-pack ref |
|---|---|---|
| `memory-vfs.js` | `MemoryVfs` working set (sg-vfs interface; real sg-vfs swap in Phase 1) | doc 05 §1 |
| `tool-policies.js` | default policy table, loadouts, `compileTools` (OFF/unavailable ⇒ invisible), read-only degrade | doc 04 §1 |
| `builtin-tools.js` | `read/write/list/delete/stat/exists/rename/create_folder` runners + `/.vault/**` guard | doc 04 §5, 09 §2 |
| `execution-center.js` | policy gate, CONFIRM/DRY_RUN, harness-enforced budget ledger + memory sub-cap, log emission | doc 04 |
| `vault-flush-controller.js` | dirty-set; coalesced `flush` ⇒ one `writeBatch` commit; ephemeral/snapshot/synced | doc 05 §2–3 |
| `chat-session.js` | config, manifest (hides `/.vault`), untrusted-content fencing, prompt assembly, turn records | doc 02 §5, 05 §4, 09 §3 |
| `vault-chat-loop.js` | transport-agnostic agentic loop (send→tool-calls→execute→results→resend) | doc 02 §4 |
| `mock-sg.js` | in-memory bridge fixture incl. `writeBatch`/`delete` + `/.vault/**` exclusion | doc 03 |

Standalone harness: `en-gb/vault/chat/test/{index.html, mock-llm.js, harness.js}` (doc 07 §4).

EXTEND (additive, backward-compatible): `app-shell/app-debug-bridge-log.js` icon map gains
`🛠 tool.*`, `🤖 llm.*`, `💾 vfs.commit` rows + cost/refused/denied detail (doc 03 §4).

## Tests

New: `tests/unit/vault_ui/vault-chat/` (node, repo idiom; jsdom) — 42 assertions across MemoryVfs,
ToolPolicies, BuiltinTools, ExecutionCenter, VaultFlushController, ChatSession, ChatLoop, MockLLM.
Run: `npm run test:vault-chat-unit`. Browser smoke: `node tests/e2e/vault_ui/vault-chat/smoke.mjs`
(real chromium; seeds → read loop → list → CONFIRM-approve write → ledger; passes, no console errors).

### Test-impact classification

- **SHOULD pass (new):** the vault-chat unit suite + the harness smoke. These are the Phase-0 DoD.
- **SHOULD NOT break (regression):** existing `test:vault-unit`, `test:vault-integration`, and the
  current vault app-shell behaviour — the only edit to shipped code is the **additive** bridge-log
  icon map (existing Vault Apps don't emit `tool.*`/`llm.*`, so their rows render unchanged).
- **Not yet exercised (later phases):** real `sg-llm-request`/`sg-tool-runner`/`sg-vfs` wiring
  (Phase 1), the live `window.sg` bridge extensions `writeBatch`/`__sgSecrets`/`/.vault/**`
  exclusion in `app-shell.js` (Phase 3, AppSec-gated). Phase 0 proves these against the mock.

## Not in this change (by design)

No real LLM calls (mock only), no vault writes (mock sg), no key handling, no changes to
`app-shell.js` bridge handlers yet. Those are Phases 1–3 per dev-pack doc 10.
