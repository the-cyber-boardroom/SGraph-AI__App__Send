# Changelog — Vault Chat Phase 1 (real sg-llm-request transport + in-vault chat pane/page)

**Version:** (CI-assigned)
**Date:** 2026-05-26
**Author:** Architect/Dev (Claude Code session claude/zen-shannon-226hD)
**Trigger:** Dinis — continue the Vault Chat dev pack into Phase 1 (wire the real CDN components, mount a real chat UI).

---

## Summary

Phase 1 wires the **real LLM transport** and ships the **product chat pane + in-vault page**,
on top of the Phase-0 working set / execution-center / agentic loop.

New files:

| File | Role |
|---|---|
| `…/_common/js/lib/vault-chat/llm-bus-adapter.js` | `window.VaultChat.LlmBus`: drives the real `<sg-llm-request>` over a `[data-llm-bus]` as the loop's `sendLlm` (dispatch `llm:send {messages,tools,tool_choice}`, resolve on `llm:request-complete`, normalise OpenAI `toolCalls` → `{id,name,args}`). |
| `…/_common/js/components/vault-chat/vault-chat-pane.js` | `<vault-chat-pane>` custom element (shadow DOM, the vault-generate pattern): transcript, composer, inline CONFIRM cards, execution log, ledger; model/mode/loadout selectors; **mock ↔ real LLM** toggle + key field. Wires MemoryVfs + ExecutionCenter + ChatLoop. Vault pull-through for `read_file` when a `window.sg` bridge is present. |
| `…/en-gb/vault/chat/index.html` | The in-vault chat page. Loads the **real** `sg-llm-events v0.1.1` + `sg-llm-request v0.1.6` from `dev.tools.sgraph.ai`, the Vault Chat lib, and the pane. |
| `tests/e2e/vault_ui/vault-chat/page.smoke.mjs` | Browser smoke test (real chromium): loads the page incl. the real CDN component, runs a CONFIRM-approved write + read via the mock LLM, checks the ledger and the real-LLM toggle. |

Changed (additive): `…/lib/vault-chat/builtin-tools.js` gains `OPENAI_SCHEMAS` (model-ready
function-tool schemas) so `compileTools(policies, OPENAI_SCHEMAS)` yields a real `tools[]`.

## Key correction folded in (vs the contract / dev pack doc 08)

The shipped `sg-llm-request **v0.1.2**` (which the vault UI currently loads) is **chat-only** —
no `tools[]`, no tool-call parsing. Tool-calling needs **v0.1.6+** (its `_buildOpenAIBody`
sends `tools`/`tool_choice` and `extractToolCalls` normalises `tool_calls`, also emitting
`llm:tool-calls`). The chat page therefore pins **v0.1.6**. Documented in the dev pack reuse map.

The loop orchestration stays in our **ChatLoop + ExecutionCenter** (not `sg-agentic-loop`)
because the per-tool policy/CONFIRM/budget-ledger + `/.vault/**` guard are the pack's value-add;
`sg-agentic-loop` only offers batch-level human-approval + a single cost budget. `sg-llm-request`
is reused wholesale for the genuinely hard transport (provider bodies, tool_call parsing, SSE).

## Tests / verification

- `npm run test:vault-chat-unit` — 42 unit assertions still green (the `OPENAI_SCHEMAS` addition is additive).
- `node tests/e2e/vault_ui/vault-chat/page.smoke.mjs` — PASSES in real chromium: real `sg-llm-request`
  defines, mock loop runs CONFIRM-approved write + read, ledger accrues, real-LLM toggle reveals the key field, no console errors.

### Test-impact classification

- **SHOULD pass (new):** the page smoke; the unit suite remains green.
- **SHOULD NOT break:** existing vault UI (the chat is a new, separate page under `en-gb/vault/chat/`;
  no shipped page imports the new modules). The only shared-file edit is the additive `OPENAI_SCHEMAS`.
- **Environment note:** this sandbox's chromium rejects the dev CDN TLS cert
  (`ERR_CERT_AUTHORITY_INVALID`); the smoke uses `ignoreHTTPSErrors` for the test. Production
  trusts the CDN (the shipped vault UI already loads `sg-llm-*` from it).

## Not in this change (next phases)

Live real-LLM round-trip needs an **OpenRouter key** (mock covers the keyless path). The
`window.sg` bridge extensions (`writeBatch`, `__sgSecrets`, `/.vault/**` exclusion in
`app-shell.js`) and the right-hand-pane embedding in the vault shell are **Phase 3** (AppSec-gated).
Mounting as a first-class Vault App surface is **Phase 7**.
