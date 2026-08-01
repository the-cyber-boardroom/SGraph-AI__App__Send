# 13 — Status Brief: Where Vault Chat Is (24 July 2026)

**version** v0.33.45 (dev tip at time of writing) · **date** 24 Jul 2026 · **from** Architect/Dev (Claude Code session claude/zen-shannon-226hD) · **type** Status brief — code-verified
**question answered** "Has this code been merged into the main dev branch?" — and a full review of where the feature stands.

---

## 1. TLDR

**Yes — merged.** The Vault Chat branch (`claude/zen-shannon-226hD`, tip `df32093`) was merged into `dev` on **10 June 2026** (merge commit `88abe9d`). All of it — the four implemented phases, the kernel PoC, the tests, the 14-doc dev pack — is present and **still fully working** at today's dev tip (`e1f67dd`, version `v0.33.45`), re-verified this session:

| Verification (run 24 Jul 2026, at dev tip) | Result |
|---|---|
| `npm run test:vault-chat-unit` (52 assertions, 11 suites) | ✅ all pass |
| `page.smoke.mjs` (in-vault chat page, 16 checks, real chromium) | ✅ PASSED |
| `kernel-poc.smoke.mjs` (SecureChannel PoC, 9 checks) | ✅ PASSED |
| `smoke.mjs` (standalone harness, 7 checks) | ✅ PASSED |

No one has modified the vault-chat code since the merge — the only later commit touching those paths (`630b7bd`) was merge-resolution that carried the files across unchanged (pure insertions).

## 2. What is on dev (code-verified today)

All under `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`:

- **Library** (`_common/js/lib/vault-chat/`): `memory-vfs`, `tool-policies` (loadouts; OFF/unavailable ⇒ omitted from `tools[]`), `builtin-tools` (+ OpenAI schemas + `/.vault/**` guard), `execution-center` (CONFIRM/DRY_RUN, budget ledger + memory sub-cap), `vault-flush-controller` (ephemeral/snapshot/synced), `chat-session` (manifest, untrusted-content fencing, fractal scope), `vault-chat-loop` (agentic loop + fencing + consolidate rebuild), `tools/consolidate-memory` (lossless self-prune), `llm-bus-adapter` (real `sg-llm-request v0.1.6` transport), `mock-sg`.
- **Component**: `<vault-chat-pane>` — transcript, inline CONFIRM, Log/Layers/History/Tools tabs, view-full-prompt, scope input, consolidate button, mock↔real-LLM toggle.
- **Pages**: `en-gb/vault/chat/` (in-vault page, real CDN LLM transport), `…/chat/test/` (standalone harness), `…/chat/kernel-poc/` (**Phase-3 PoC**: null-origin iframe ↔ parent over a real SecureChannel; `AppPermissions.isFloor` refuses `/.vault/**` with EPROTECTED at the kernel boundary).
- **Tests**: `tests/unit/vault_ui/vault-chat/` (52 assertions) + 3 chromium smokes; npm script `test:vault-chat-unit`.
- **Docs**: this dev pack (`library/sgraph-send/dev_packs/v0.27.80__vault-chat/`, docs 00–12 + USER_GUIDE) and four changelog entries under `team/comms/changelog/05/26/`.
- One **shipped-file edit**: additive `tool.*`/`llm.*`/`vfs.commit` rows in `app-debug-bridge-log.js`.

Phase map: **0, 1, 2, 4 implemented; 3 proven as PoC** (SecureChannel topology). Phases 5–8 (next-chat, Track-B cognition, keystone, supply-chain pinning) not started.

## 3. Discrepancy to fix: the reality document lags the merge

The reality doc **still classifies Vault Chat as PROPOSED** (`ui/proposed/index.md`: P-249 "Talk to the vault", P-263 "Vault Chat full architecture", P-264 "VFS as LLM working memory") even though the substrate code has been on dev since 10 June. Per CLAUDE.md rule 4 this should have been updated at merge time and wasn't. **Recommended: a Librarian pass** that moves the shipped substrate (working set, execution center, agentic loop, chat page/pane, kernel PoC, self-prune, inspector) to EXISTS, while keeping genuinely-unbuilt items (sidecars P-266, full keystone mount, zip-packaging) PROPOSED.

Encouraging convergence note: **P-265 "Commit Queue"** (proposed 06/11 from your briefs, doc 509) addresses exactly the one-write-per-commit problem this pack deferred as the `sg.vfs.writeBatch` extension — the two designs should be reconciled into one mechanism when P-265 is picked up.

## 4. What remains open (unchanged from the PoC changelog, still true)

1. **Commit coalescing** — kernel writes one commit per `sg.vfs.write`; resolve via P-265 Commit Queue ↔ dev-pack doc 03 `writeBatch`.
2. **Key custody** — no app-secret registry yet (P-5.x); the OpenRouter key still enters via the pane's key field, not the vault.
3. **Canonical `sg-app-stub`** — the PoC uses its own request/handle-only stub; swapping in the shipped stub is trivial now that the `cid`-pin gotcha is documented (pass the same `cid` to `SecureChannel.accept`).
4. **Primary-mount migration** — the chat pages stand alone; they're not yet mounted via `app-shell`'s primary app path, and nothing in the vault UI links to them (reachable but unlinked — fine for a preview).
5. **AppSec sign-offs** — the four items in dev-pack doc 09 (floor audit, fencing format, R-supply/CDN-latest disposition, iframe sandbox/CSP) were never formally ratified.
6. **Live LLM round-trip** — still unverified; needs a real OpenRouter key (USER_GUIDE Recipe 11).

## 5. Recommended next steps (in order)

1. **Librarian reality-doc update** (§3) — cheap, overdue, prevents the "does not exist" rule from misleading future sessions.
2. **You run Recipe 11** (real key, live model) — the one verification only you can do.
3. **AppSec pass** on dev-pack doc 09 — gates promoting the chat from unlinked preview to a linked vault surface.
4. Pick up **P-265 Commit Queue** as the shared fix for commit coalescing, then Phase 5+ per the pack.

---

*CC BY 4.0.*
