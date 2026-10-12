# Vault Web — Test Map

**Part of:** [Vault Web Code Index](index.md) | **Version:** v0.33.44 | **Last updated:** 2026-07-24
**Maintained by:** Librarian

Everything an agent needs to run, extend, or debug the Vault Web test suites.
Package under test: `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`.

---

## How to run (exact commands)

Setup once: `npm ci` (+ `npx playwright install --with-deps chromium` for e2e).

| What | Command |
|------|---------|
| All loader unit tests (43 wired files) | `npm run test:vault-unit` (= `bash tests/unit/vault_ui/loader/run-all.sh`) |
| Vault-chat unit tests (10 files) | `npm run test:vault-chat-unit` (= `bash tests/unit/vault_ui/vault-chat/run-all.sh`) |
| A single unit test file | `node tests/unit/vault_ui/loader/test__format_detection.js` (each file is a self-contained Node script) |
| Loader integration (in-memory stub) | `npm run test:vault-integration` |
| Browser integration (Python, real backend + sgit) | `npm run test:vault-browser-integration` (= pytest `tests/integration/vault_ui/browser/`; needs Poetry env + `playwright pytest httpx sgit-ai`) |
| E2E (Playwright, auto-starts fixture server :3999) | `npm run test:vault-e2e` (= `npx playwright test tests/e2e/vault_ui/`) |
| Single e2e spec | `npx playwright test tests/e2e/vault_ui/test__routing.spec.js` |
| Vault-chat browser smokes (manual only) | `node tests/e2e/vault_ui/vault-chat/smoke.mjs` (also `page.smoke.mjs`, `kernel-poc.smoke.mjs`) |

**CI:** `.github/workflows/_test-ui-vault.yml` (reusable, called as a gate by `deploy-ui-vault.yml`;
Node 22 / Python 3.12). Jobs in order: unit → integration → {Playwright e2e, Python browser integration}.

## ⚠️ Coverage gaps an agent should know (verified 2026-07-24)

1. **6 loader unit test files exist but are NOT in `run-all.sh`** — `npm run test:vault-unit` skips
   them: `test__ro_token_resolution.js`, `test__branch_index.js`, `test__write_batch.js`,
   `test__object_store_mem_cache.js`, `test__owner_secrets.js`,
   `test__app_permissions__vault_create_key.js`. Run them directly with `node` — and if you touch
   their source files, wire them into `run-all.sh`.
2. **`test:vault-chat-unit` is NOT run in CI** (`_test-ui-vault.yml` doesn't reference it); nor are
   the `vault-chat/*.smoke.mjs` scripts.
3. **4 e2e regression specs are entirely `test.skip`'d:** `app_mode_html_only_relift`,
   `edit_preview_layout`, `iframe_bg_preserved`, `no_duplicate_app_mode_btn` (+1 conditional skip
   in `navigate_to_browse_uses_ls`).
4. **`tests/integration/vault_ui/loader/test__read_only_round_trip.js` is orphaned** — not run by
   any runner.
5. **No e2e drives a real app-shell mount + in-vault link click** (the app-context regression spec
   stubs the network) — the recommended harness after the srcdoc nav regression.

## Harness design (how Node runs browser JS)

All source files are browser globals (no ESM/CJS). Node tests load them via
`vm.runInThisContext` after a jsdom shim:

- `tests/unit/vault_ui/loader/load-loader.js` — JSDOM window at `https://dev.vault.sgraph.ai/`,
  binds `window`/`document`/storage/`location`/`history` + stub `sgraphVault.events` bus onto
  `global`, then loads the six `vault-loader/*.js` in dependency order. Most loader tests skip
  this and `runInThisContext` only the source file they target.
- `tests/unit/vault_ui/loader/helpers.js` — zero-dep runner: `suite(name, fn)` with
  `test/before/after` + `clearVaultStorage()`. Only ~12 files use it; the rest use inline
  `ok/eq` counters with `process.exit(fail?1:0)`.
- `tests/unit/vault_ui/vault-chat/load-vault-chat.js` — same pattern for
  `_common/js/lib/vault-chat/*.js`, exposing `window.VaultChat`; `vc-helpers.js` shared asserts.
- `tests/integration/vault_ui/loader/load-integration.js` + `in-memory-sg-vault.js` — full
  event bus + in-memory `SGVault`/`SGSend` stubs (`SGVault._seed()/_reset()`, no network/crypto)
  so real `VaultLoader` open/create flows run in Node.
- `tests/e2e/vault_ui/fixtures/vault-server.js` — Node http static server serving the real
  v0.2.3 bundle on :3999 (Playwright `webServer`). Fully local.
- `tests/integration/vault_ui/browser/_browser_harness.py` — `BrowserHarnessTestCase`: real
  User-Lambda FastAPI (in-memory) + static UI server + headless Chromium; can drive the
  `sgit-ai` CLI and browser side-by-side. **The only layer with real backend + real crypto.**

---

## Unit tests — `tests/unit/vault_ui/`

### Python (top level)

| Test file | Tests | Scope |
|-----------|-------|-------|
| `test__Vault_UI__static_files.py` | 38 | Presence/shape of vault-UI static files & versioned dirs |
| `test__Sg_Vault_Picker__static_files.py` | 14 | Vault-picker static assets |
| `test__generate_vault_i18n_pages.py` | 13 | i18n page generation script |
| `test__sg_bridge__wave1_wave2.py` | 62 | sg-bridge protocol behaviour (largest Python unit suite) |

### `loader/` — 49 JS files (counts ≈ cases; some files list extra sub-asserts)

| Test file | Source under `v0.2.3/_common/js/` | ~Cases | Scope |
|-----------|-----------------------------------|--------|-------|
| `test__format_detection.js` | `vault-loader/vault-loader-format.js` | 27 | Credential format detection |
| `test__storage.js` | `vault-loader-storage.js` | 19 | Storage keys + null-origin survival |
| `test__storage_pertab.js` | `vault-loader-storage.js` | 8 | Per-tab vault-key isolation |
| `test__recent_list.js` | `vault-loader-recent.js` | 21 | Recent vaults add/dedupe/cap |
| `test__routing_decisions.js` | `vault-loader-routing.js` | 10 | Routing table decisions |
| `test__vault_links.js` | `lib/links/vault-links.js` | 48 | Link file parse/resolve/save |
| `test__composite_data_source.js` | `adapters/composite-data-source.js` | 44 | Sub-vault splice adapter |
| `test__public_preview_crypto.js` | `lib/sg-public-preview/*` | 9 | PVP crypto/read/schema |
| `test__ro_record_derivation.js` | `sg-vault-crypto.js` | 5 | RO record derivation |
| `test__ro_token_resolution.js` ⚠️ | `sg-vault-crypto.js` | 8 | RO token resolution (NOT in run-all.sh) |
| `test__sgsend_access_token.js` | `sg-send.js` | 4 | Access-token handling |
| `test__sgsend_static_mode.js` | `sg-send.js` | 12 | Static-host mode |
| `test__vault_history.js` | `sg-vault--history.js` | 14 | History model |
| `test__branch_index.js` ⚠️ | `sg-vault-ref-manager.js` | 16 | Branch index (NOT in run-all.sh) |
| `test__write_batch.js` ⚠️ | object-store/ref-manager/commit | 22 | Batched writes (NOT in run-all.sh) |
| `test__object_store_mem_cache.js` ⚠️ | `sg-vault-object-store.js` | 7 | Mem cache (NOT in run-all.sh) |
| `test__owner_secrets.js` ⚠️ | `sg-vault-owner-secrets.js` | 10 | Owner secrets (NOT in run-all.sh) |
| `test__sgit_diff.js` | `vault-sgit-view/sgit-diff.js` | 19 | LCS diff engine |
| `test__sg_append_client.js` | `sg-append.js` | 37 | Append transport |
| `test__sg_append_checker.js` | `sg-append-checker.js` | 27 | Check-on-events detector |
| `test__sg_embed_helpers.js` | `app-shell/sg-embed-helpers.js` | 18 | Embed src/sandbox sanitise |
| `test__embed_protocol.js` | `app-shell/embed-protocol.js` | 44 | Embed handshake protocol |
| `test__sg_repl_core.js` | `app-shell/sg-repl-core.js` | 30 | Debug REPL parse/format |
| `test__sg_app_stub.js` | `sg-app-stub.js` + channel | 21 | App-side sg.* stub |
| `test__secure_channel.js` | `secure-channel.js` | 15 | Channel handshake |
| `test__secure_channel_envelope.js` | `secure-channel-envelope.js` | 32 | Envelope encode/decode |
| `test__app_permissions.js` | `app-permissions.js` | 46 | Permission floor + grants |
| `test__app_permissions__append.js` | `app-permissions.js` | 16 | Append grants |
| `test__app_permissions_vault_mount.js` | `app-permissions.js` | 7 | vault.mount grant |
| `test__app_permissions__vault_create_key.js` ⚠️ | `app-permissions.js` | 31 | vault.createKey (NOT in run-all.sh) |
| `test__app_host_events.js` | `app-host-events.js` | 23 | Host event allowlist |
| `test__app_frame_bootstrap.js` | `app-frame-bootstrap.js` | 32 | srcdoc builder (4 kinds) |
| `test__app_hud_config.js` | `app-hud-config.js` | 37 | hud.* schema resolver |
| `test__app_shell_bridge_build.js` | `app-shell.js` | 9 | Bridge script construction |
| `test__app_shell_nav_helpers.js` | `app-shell-nav-helpers.js` | 72 | Nav/history/deep-link (largest loader suite) |
| `test__bundle_freshness.js` | `kernel-shell-bundle.js` | 2 | Shipped kernel bundle is fresh |
| `test__kernel_bootstrap.js` | `kernel-bootstrap.js` | 14 | Kernel boot sequence |
| `test__kernel_broker.js` | `kernel-broker.js` | 23 | Broker mediate/finalize |
| `test__kernel_mounts.js` | `kernel-mounts.js` | 14 | Mount table |
| `test__kernel_relay.js` | broker+mounts+channel | 17 | Relay routing |
| `test__kernel_app_handlers.js` | `kernel-app-handlers.js` | 25 | Two-sided capability gate |
| `test__kernel_parent.js` | `kernel-parent.js` + viv modules | 41 | Parent orchestration (widest graph) |
| `test__viv_mounts_view.js` | `viv-mounts-view.js` | 28 | Mounts view-model |
| `test__viv_audit_view.js` | `viv-audit-view.js` | 34 | Cross-kernel audit aggregation |
| `test__viv_custody.js` | `viv-custody.js` | 25 | Custody gate |
| `test__viv_monitor.js` | `viv-monitor.js` | 17 | Monitor modes |
| `test__viv_credential_tiers.js` | `viv-credential-tiers.js` | 27 | Credential tier gate |
| `test__vault_subvaults_view.js` | `vault-subvaults-panel/vault-subvaults-view.js` | 26 | Sub-vaults panel view-model |

### `vault-chat/` — 10 files, all in its run-all.sh (⚠️ suite not CI-gated)

| Test file | Source | Tests | Scope |
|-----------|--------|-------|-------|
| `test__memory_vfs.js` | `memory-vfs.js` | 5 | In-memory chat VFS |
| `test__tool_policies.js` | `tool-policies.js` | 5 | Tool allow/deny policies |
| `test__builtin_tools.js` | `builtin-tools.js` | 4 | Built-in tools |
| `test__execution_center.js` | `execution-center.js` | 7 | Tool execution dispatch |
| `test__flush_controller.js` | `vault-flush-controller.js` | 5 | Persist/flush gating |
| `test__chat_session.js` | `chat-session.js` | 7 | Session state/history |
| `test__chat_loop.js` | `vault-chat-loop.js` | 4 | Agent tool-call loop |
| `test__mock_llm.js` | `chat/test/mock-llm.js`, `mock-sg.js` | 7 | Deterministic mock LLM |
| `test__fencing_and_guards.js` | fencing/guard logic | 5 | Injection-floor fencing |
| `test__consolidate_memory.js` | `tools/consolidate-memory.js` | 6 | Memory consolidation tool |

---

## Integration tests — `tests/integration/vault_ui/`

### `loader/` (Node, in-memory SGVault stub)

| Test file | Tests | Scope | Wired? |
|-----------|-------|-------|--------|
| `test__open_flow_full.js` | 14 | Full VaultLoader open of a seeded vault | Yes |
| `test__create_then_open.js` | 14 | Create → reopen round-trip | Yes |
| `test__read_only_round_trip.js` | 3 | RO credential round-trip | ⚠️ orphaned — no runner executes it |

### `browser/` (Python + real FastAPI backend + Playwright + sgit)

| Test file | Tests | Flow |
|-----------|-------|------|
| `test__harness_smoke.py` | 3 | Backend + UI server + Chromium boot; page mounts |
| `test__app_mode_deep_link.py` | 1 | `/en-gb/app/#patient/index.html` deep-link renders styled |
| `test__embed_handshake.py` | 3 | Cross-origin embed-protocol handshake |
| `test__sgit_round_trip.py` | 1 | Browser opens v1 → sgit CLI commits v2 → browser sees update |

---

## E2E — `tests/e2e/vault_ui/` (Playwright, local fixture server only, no network)

| Spec | Active/skipped | Flow |
|------|----------------|------|
| `test__routing.spec.js` | 8 | The 8-cell routing table (`/`, `/#token`, `/en-gb/`, `/en-gb/vault`, peek) |
| `test__peek_page.spec.js` | 6 | Peek page: masked key, recent list, paste-inspect, clear-state |
| `test__phase3_null_origin_probe.spec.js` | 5 | Null-origin sandbox iframe browser-fact probes (incl. P5 error surfacing) |
| `test__viv_browser_e2e.spec.js` | 5 | **The only real-browser ViV path:** null-origin srcdoc + SecureChannel + real WebCrypto + real KERNEL_SHELL_HTML boot |
| `test__regression__root_hash_inbox_saves.spec.js` | 3 | `/#<token>` saves key to LS before redirect |
| `test__regression__navigate_to_browse_uses_ls.spec.js` | 2 (1 cond. skip) | Vault card click writes LS + navigates |
| `test__regression__no_locale_redirect_loop.spec.js` | 2 | `/en-gb/` no redirect loop |
| `test__regression__app_mode_html_only_relift.spec.js` | ⚠️ 0/3 all skipped | App Mode re-lift scope |
| `test__regression__edit_preview_layout.spec.js` | ⚠️ 0/2 all skipped | Edit-preview height + VFS re-render |
| `test__regression__iframe_bg_preserved.spec.js` | ⚠️ 0/3 all skipped | Iframe bg through App-Mode lift |
| `test__regression__no_duplicate_app_mode_btn.spec.js` | ⚠️ 0/2 all skipped | Single App Mode button |
| `vault-chat/*.smoke.mjs` (3 files) | manual | Standalone Chromium smokes — not matched by `*.spec.js`, not in CI |

No README files exist in the test directories — this document is the map.
