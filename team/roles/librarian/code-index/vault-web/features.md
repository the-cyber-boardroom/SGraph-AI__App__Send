# Vault Web — Feature Map

**Part of:** [Vault Web Code Index](index.md) | **Version:** v0.33.44 | **Last updated:** 2026-07-24
**Maintained by:** Librarian

Feature → files map. Each row tells an agent which files implement a feature, so a task like
"fix X in feature Y" starts with the right reading list. Status is code-verified.
Deep detail per feature: `team/roles/librarian/reality/ui/index.md` (Vault Browser UI section)
and `reality/vault/index.md`.

Path root: `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`.

---

## Core vault engine

| Feature | Status | Primary files | Tests |
|---------|--------|---------------|-------|
| Vault create/open/commit (two-ref model, reconcile-on-open) | EXISTS | `lib/sg-vault/sg-vault.js`, `sg-vault-commit.js`, `sg-vault-ref-manager.js` | integration `test__create_then_open`, `test__open_flow_full` |
| Key derivation (PBKDF2 600k; simple token + passphrase:id; CLI-pinned) | EXISTS | `lib/sg-vault/sg-vault-crypto.js` | `test__ro_record_derivation`, `test__ro_token_resolution` ⚠️unwired |
| Push/pull/merge (fast-forward; 3-way file merge with `_conflict` copies) | EXISTS | `lib/sg-vault/sg-vault--sync.js` | via integration suite |
| File/folder CRUD (batched) | EXISTS | `sg-vault--file-ops.js`, `sg-vault--folder-ops.js` | via integration suite |
| Batched commit writes (one `POST /api/vault/batch` per logical op) | EXISTS | `sg-vault-object-store.js` (`beginBatch`…), `sg-vault-ref-manager.js`, `sg-vault.js` `_withBatch` | `test__write_batch` ⚠️unwired |
| Imm-block caching (in-memory LRU + Cache API; null-origin safe) | EXISTS | `sg-vault-object-store.js` | `test__object_store_mem_cache` ⚠️unwired |
| History (log/read-at-commit) | EXISTS | `sg-vault--history.js` | `test__vault_history` |
| Branches (list/switch from `branch_index_v1`) | EXISTS | `sg-vault--branches.js` | `test__branch_index` ⚠️unwired |
| Owner-secret store (write_key-tier seal) | EXISTS | `sg-vault-owner-secrets.js` | `test__owner_secrets` ⚠️unwired |
| Static-host mode (same app on GH Pages/S3, read-only) | EXISTS (2026-06-30) | `lib/sg-send/sg-send.js` (`staticMode`) | `test__sgsend_static_mode` |
| Transport + AES-256-GCM crypto | EXISTS | `lib/sg-send/sg-send.js`, `sg-send-crypto.js` | `test__sgsend_access_token` |
| Append/inbox transport (check-on-events; NO timers) | EXISTS (C1–C4) | `lib/sg-append/sg-append.js`, `sg-append-checker.js` | `test__sg_append_client` (37), `test__sg_append_checker` (27) |

## `/vault` browser (tree view — `<vault-shell>`)

| Feature | Status | Primary files |
|---------|--------|---------------|
| Vault browser shell (Files/SGit/Settings, auto-sync, RO mode, debug pane) | EXISTS | `components/vault-shell/vault-shell.js` |
| Header sync-status pill + validated access-key entry | EXISTS | `components/vault-header/vault-header.js` |
| File edit/save/delete/upload in browser | EXISTS | `components/vault-browse-edit/vault-browse-edit.js` (patches remote `send-browse--v0.3.2.js`) |
| SGit inspector (history graph, commit diff, repair/ref surgery, status, tree, branches, refs, object viewer) | EXISTS | `components/vault-sgit-view/` (10 files) |
| Conflict resolution overlay | EXISTS | `components/vault-diff-view/vault-diff-view.js` |
| Simple-token vault entry + create flow | EXISTS | `components/vault-entry/` |
| Settings (rename, key display, read-key hex export) | EXISTS | `components/vault-settings/vault-settings.js` |
| App Mode (chrome-hide + frame lift) in browser flow | EXISTS | `components/sg-app-banner/sg-app-banner.js` |
| LLM infographic generation | EXISTS | `components/vault-generate/vault-generate.js` |
| Debug panels (API log, events, messages, storage) | EXISTS | `components/{api-logger,events-viewer,messages-panel,storage-viewer}/` |
| Embedded access token read on open (`/vault`+`/app` parity) | EXISTS | `vault-shell.js` `_readEmbeddedAccessToken` |

## `/app` SG/App host (`<app-shell>`)

See `files.md` §11 for the full `sg.*` bridge verb table.

| Feature | Status | Primary files |
|---------|--------|---------------|
| Vault-app host (null-origin srcdoc iframes, 4 mount kinds) | EXISTS | `app-shell/app-shell.js`, `app-frame-bootstrap.js` |
| `sg.*` postMessage bridge (vfs/fs/vault/append/history/sync/auth/ui/state/on-off) | EXISTS | `app-shell.js` `_buildVfsBridgeScript`/`_setupVfsBridgeHandlers` |
| Permission model + `.vault/**` floor + consent (Phases 1–4B) | EXISTS | `app-permissions.js`, `app-shell.js` `_can/_consent`, `app-hud.js` consent bar |
| HUD (chrome, nav row, privileges chip, activity meter, hud.* modes incl. `none`) | EXISTS | `app-hud.js`, `app-hud-config.js` |
| Nav history + deep links + per-folder app.json | EXISTS | `app-shell-nav-helpers.js`, `app-shell.js` nav cluster |
| Auto-sync parity (debounced auto-push, behind-check remount) | EXISTS | `app-shell.js` `_scheduleAutoPush`/`_checkBehind`/`_remountCurrent` |
| Child-vault lifecycle (`sg.vault.create/getKey/openApp/list/unlink`, seedFrom, embedded access token) | EXISTS (`delete` PARTIAL — no server teardown) | `app-shell.js` owner-secrets + child-vault clusters |
| Embed handshake (`?embed=1`, key via postMessage only) + `sg.vault.embed()` one-liner | EXISTS | `embed-protocol.js`, `sg-embed-helpers.js`, `app-shell.js` `_initEmbed` |
| External-link least-privilege (host-confirm default, `externalLinks` grant opt-in) | EXISTS | `app-shell.js` `_appSandbox`/`_promptExternalOpen`, `app-hud.js` `promptExternalLink` |
| Error surfacing (self-reporting bridge, blank-app self-check, empty-entry guard) | EXISTS | `app-shell.js` bridge script, `app-hud.js` toasts |
| Print RPC (null-origin safe) | EXISTS | `app-shell.js` `__sgPrintReq` handling, remote `sg-print.js` |
| Device-local app state (`sg.state.*`) | EXISTS | `app-shell.js` state dispatch |
| Host events → app (`sg.on`, `host_events` allowlist, append checker) | EXISTS | `app-host-events.js`, `app-shell.js` `_initAppendChecker`/`_pushHostEvent` |
| Debug pane (Vault/Bridge/Mounts/Audit/REPL/State/Net tabs) | EXISTS | `app-debug-*.js`, `sg-repl-core.js`, `viv-mounts-view.js`, `viv-audit-view.js` |

## ViV — vault-in-vault kernel

| Feature | Status | Primary files |
|---------|--------|---------------|
| SecureChannel (P-256 envelope, port-anchored, replay guard) | EXISTS | `secure-channel-envelope.js`, `secure-channel.js` |
| Kernel spawn + relay (mounts, broker, custody + credential-tier gates) | EXISTS | `kernel-parent.js`, `kernel-mounts.js`, `kernel-broker.js`, `viv-custody.js`, `viv-credential-tiers.js` |
| Child kernel (boot, VFS handlers, monitor mode) | EXISTS | `kernel-bootstrap.js`, `kernel-app-handlers.js`, `viv-monitor.js`, `kernel-shell-bundle.js` (AUTO-GENERATED — rebuild via `scripts/build-kernel-shell-bundle.py`) |
| Null-origin security gate (Phase 3, SEC-VIV-001 resolved) | EXISTS | all mount sites in `app-shell.js` (`sandbox="allow-scripts allow-forms"`, srcdoc) |
| Cross-kernel audit (Phase 5.1) | EXISTS | `viv-audit-view.js`, `app-debug-audit.js` |
| Assembled `sg.vault.mount()` / `unmount()` entry points | **PROPOSED** (P-250/P-251 — pieces exist) | — |
| Remaining phases (tiers issuance, /vault-on-kernel, Phase 6 hardening) | **PROPOSED** | see [todos.md](todos.md) §4–5 |

## Sub-vaults & links

| Feature | Status | Primary files |
|---------|--------|---------------|
| `*.link.json` convention + portable ro-links owner records | EXISTS | `lib/links/vault-links.js` |
| Read-through sub-vault splice in tree view | EXISTS (slated for P-279 retirement) | `adapters/composite-data-source.js` |
| Locked-sub-vault key prompt with public info | EXISTS | `components/sg-link-card/sg-link-card.js` |
| Controlled external-resource embeds (default-deny, click-to-load) | EXISTS (browser-unverified) | `components/sg-embed-frame/sg-embed-frame.js` |
| Sub-vaults debug panel + status chips | EXISTS | `components/vault-subvaults-panel/` |

## Public Vault Previews (PVP)

| Feature | Status | Primary files |
|---------|--------|---------------|
| Deterministic public-id → transfer + keys derivation | EXISTS | `lib/sg-public-preview/public-preview-crypto.js` |
| Schema + banned-key scan | EXISTS | `public-preview-schema.js` |
| Read path + card render | EXISTS | `public-preview-read.js`, `components/sg-public-preview-card/` |
| Publish/update/unpublish editor | EXISTS (⚠️ browser-verification pending) | `public-preview-write.js`, `components/sg-public-preview-editor/` |
| OG meta injection | EXISTS | `public-preview-meta.js` (used on `en-gb/preview/`) |
| `/en-gb/app/<public-id>` Mode A/B wiring | **PENDING** | `app-shell.js` `_initPublicPreview` (partial) |

## Vault Chat

**Status correction (2026-07-24):** Phases 1–4 SHIPPED mid-June (commits `adc9d0f`, `60a2f6d`,
`ad8e14d`) — reality `ui/proposed` P-263/P-264 rows predate this. Remaining work: todos.md §6.

| Feature | Status | Primary files |
|---------|--------|---------------|
| Chat pane + real `sg-llm-request` transport (mock default) | EXISTS | `components/vault-chat/vault-chat-pane.js`, `lib/vault-chat/llm-bus-adapter.js`, page `en-gb/vault/chat/` |
| Tool loop + execution center (policies, budget, CONFIRM) | EXISTS | `vault-chat-loop.js`, `execution-center.js`, `builtin-tools.js`, `tool-policies.js` |
| Memory VFS + single-commit flush | EXISTS | `memory-vfs.js`, `vault-flush-controller.js` |
| Injection-floor fencing + context-layers inspector | EXISTS | `chat-session.js`, pane |
| `consolidate_memory` self-prune | EXISTS | `tools/consolidate-memory.js` |
| Kernel PoC (chat in null-origin iframe over SecureChannel) | EXISTS (PoC) | `en-gb/vault/chat/kernel-poc/` |
| Commit Queue (P-265), Sidecar LLMs (P-266) | **PROPOSED** | — |

## Credentials, loading, routing

| Feature | Status | Primary files |
|---------|--------|---------------|
| 5-format credential detection + open dispatch | EXISTS (Format 4 RO-cred stubbed) | `vault-loader/vault-loader.js`, `vault-loader-format.js` |
| Routing (root hash inbox → `/en-gb/app`; per-page run* helpers) | EXISTS | `vault-loader-routing.js` |
| Storage (per-tab key, shared token, null-origin safe) | EXISTS | `vault-loader-storage.js` |
| Recent vaults (cap 200, migration) | EXISTS | `vault-loader-recent.js` |
| RO tokens (deterministic resolution; create/revoke UI in harness) | EXISTS | `sg-vault-crypto.js`, `en-gb/vault/token/vault-token-manager.js` |

## Where features are documented for app AUTHORS (not this index)

- `library/guides/vault-html/AUTHORING.md` — the canonical `window.sg` API reference
- `library/guides/vault-html/MIGRATING-TO-THE-PERMISSION-MODEL.md`
- `library/guides/vault-html/SUB-VAULTS-AND-LINKS.md`
- `library/guides/vault-html/HOSTING-ON-STATIC-STORAGE.md`
- `library/guides/vault-html/PLAYWRIGHT-VAULT-APP-ACCESS.md`
- `library/guides/vault-html/service-worker-future.md`
- Skills: `create-vault-content`, `vault-html-app`, `sgit` (agent-facing authoring workflows)
