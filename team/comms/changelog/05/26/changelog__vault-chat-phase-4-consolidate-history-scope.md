# Changelog — Vault Chat Phase 4 (consolidate_memory, history drop/recreate, full-prompt view, fractal scope) + USER_GUIDE

**Version:** (CI-assigned)
**Date:** 2026-05-26
**Author:** Architect/Dev (Claude Code session claude/zen-shannon-226hD)
**Trigger:** Dinis — continue the Vault Chat dev pack into Phase 4 and provide a user guide.

---

## Summary

Phase 4 lands the lossless self-prune, history edit, full-prompt view, and the fractal
scope filter — completing the inspector/memory surface on top of Phases 0–2.

New / changed:

| File | Role |
|---|---|
| `…/lib/vault-chat/tools/consolidate-memory.js` (new) | `window.VaultChat.ConsolidateMemory.makeRunner`: the lossless self-prune (doc 05 §4). Reads `/chat/history/*`, asks the LLM to consolidate into one markdown summary at `/chat/consolidated/<ts>.md`, returns `{consolidatedPath, dropPaths, retained, cost}`. Pre-flights the memory sub-cap so a prune-loop is structurally refused. |
| `vault-chat-loop.js` | New `rebuildAfterConsolidate({consolidatedPath, dropPaths, retainTail})` — replaces the live prompt with `[system, consolidated, recent tail]`; triggered automatically when `consolidate_memory` returns. Originals stay in the working set — the prune is lossless. |
| `chat-session.js` | `buildManifest` now honours `session.scopeRoot` (fractal scope — doc/folder/vault). Reserved-prefix exclusion remains absolute. |
| `vault-chat-pane.js` | Top-bar **scope** input + **consolidate** button. Side panel gains a **History** tab (per-turn list + `drop` action that removes from the live prompt only). **Layers** tab shows the Consolidated section + a `view full prompt` toggle revealing the live messages array. Renders a `system` event row for consolidations. |
| `en-gb/vault/chat/index.html` | Loads the new `tools/consolidate-memory.js`. |
| `tests/unit/vault_ui/vault-chat/test__consolidate_memory.js` (new) | 5 assertions: writes a consolidated file with `dropPaths`; rebuild replaces the live prompt; nothing-to-prune when within `retainTail`; **memory sub-cap refuses** when exceeded; `buildManifest` filters by scope. |
| `tests/e2e/vault_ui/vault-chat/page.smoke.mjs` | Extended with Phase-4 checks: History tab listing, `consolidate` button writes a summary, Layers reflects the consolidated file, `view full prompt`, scope changes reflected. |
| `library/sgraph-send/dev_packs/v0.27.80__vault-chat/USER_GUIDE.md` (new) | A step-by-step guide for Dinis: how to run the standalone harness + the in-vault page (mock and real LLM), 12 numbered test recipes (basic loop, CONFIRM, deny, budget refusal, fencing/injection floor, self-prune, drop, fractal scope, hide-a-tool/DRY_RUN, real-LLM, persistence modes), how to run the tests, troubleshooting. |

## Tests / verification

- **52** unit assertions (added the 5-test Phase-4 consolidate suite). `npm run test:vault-chat-unit`.
- **16-check** real-chromium page smoke — passes incl. consolidate → consolidated file written,
  Layers reflects it, `view full prompt`, History tab, fractal scope.
  (`node tests/e2e/vault_ui/vault-chat/page.smoke.mjs`)

### Test-impact classification
- **SHOULD pass (new):** Phase-4 consolidate suite + page-smoke Phase-4 assertions.
- **SHOULD NOT break:** all prior tests stay green; `buildManifest` scope-filter is gated on
  `scopeRoot !== '/'`, default `/` preserves prior behaviour.
- **Not yet exercised:** live real-LLM round-trip (USER_GUIDE Recipe 11 — needs an OpenRouter key);
  Phase-3 real-bridge edits (AppSec-gated).

## Not in this change (next phases)

Phase 3 (real `app-shell` bridge edits — `writeBatch`, `__sgSecrets`, `/.vault/**` exclusion —
AppSec-gated, edits shipped code). Phase 5 (two-pane next-chat). Phases 6–7 (sidecars, knowledge
graph, Vault App keystone).
