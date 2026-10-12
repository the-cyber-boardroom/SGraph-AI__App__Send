# Changelog — Vault Chat Phase 2 (injection-floor fencing + context-layers inspector + tools/loadout panel)

**Version:** (CI-assigned)
**Date:** 2026-05-26
**Author:** Architect/Dev (Claude Code session claude/zen-shannon-226hD)
**Trigger:** Dinis — continue the Vault Chat dev pack into Phase 2.

---

## Summary

Phase 2 completes the execution-center surface and lands the **injection floor** (dev pack
doc 09 §3) plus the **context-layers inspector** and the interactive **tools/loadout panel**
(doc 04 §1, doc 05 §5, doc 07 §B5). All keyless-verifiable.

### Security floor (logic)
- **Provenance fencing wired into the loop.** `read_file` now flags its content `untrusted:true`;
  `ChatLoop._toolResultContent` wraps untrusted file content in non-spoofable
  `BEGIN/END UNTRUSTED DATA` delimiters before it re-enters the prompt, so injection inside a
  vault file is presented to the model as data, not instructions. (`builtin-tools.js`,
  `vault-chat-loop.js`, `chat-session.js` `fence`/`estimateTokens`.)
- **No-self-widen invariant** locked by tests: no policy/budget-mutating tool exists in the
  defaults, registry, or schemas; budget/policy are harness-side only.

### Inspector + tools panel (UI, `vault-chat-pane.js`)
- Side panel is now tabbed **Log / Layers / Tools**.
- **Layers** (read-only inspector): vault status, VFS working-set files, history turn count,
  assembled-prompt token estimate + message count, budget.
- **Tools** (interactive loadout): every tool with tier + a live **AUTO/CONFIRM/DRY_RUN/OFF**
  control; unavailable tools (loadout/read-only) are shown disabled; states that an OFF/
  unavailable tool is omitted from `tools[]`; notes `run_code` is not registered.

## Tests / verification

- `npm run test:vault-chat-unit` — **47** assertions (added `test__fencing_and_guards.js`: 5).
- `node tests/e2e/vault_ui/vault-chat/page.smoke.mjs` — PASSES in real chromium; now also asserts
  the Layers inspector (working set + token estimate) and the Tools panel (11 per-tool mode
  controls; `run_code` absent).

### Test-impact classification
- **SHOULD pass (new/changed):** fencing + guard unit tests; extended page smoke (Layers/Tools).
- **SHOULD NOT break:** all prior vault-chat unit tests stay green (fencing only changes the
  *tool-message* content for untrusted reads; the loop/ledger/flush behaviour is unchanged).
  No shipped vault page imports these modules.

## Not in this change (next phases)

Live model round-trip still needs an OpenRouter key. **Phase 3** (AppSec-gated): the real
`app-shell` bridge edits — `sg.vfs.writeBatch`, the one-time `__sgSecrets` key injection, and
the `/.vault/**` read/list/img exclusion. **Phase 4+**: self-prune `consolidate_memory`,
history edit/recreate, fractal scope, next-chat. **Phase 7**: first-class Vault App surface.
