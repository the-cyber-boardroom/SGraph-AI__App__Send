# Vault Web — Open Items & To-Dos

**Part of:** [Vault Web Code Index](index.md) | **Version:** v0.33.44 | **Last updated:** 2026-07-24
**Maintained by:** Librarian

Every open item known for the Vault Web codebase (`sgraph_ai_app_send__ui__vault/`), with its
source document. An agent picking up a vault-web task should scan this file to see whether the
task is already scoped, partially shipped, or has a known bug attached.

**Convention:** P-numbers come from the reality domain tree (`team/roles/librarian/reality/`).
Status is code-verified as of the date above.

---

## 1. Known Bugs (small, well-scoped — good first tasks)

| Item | Detail | Source |
|------|--------|--------|
| send-browse `_write` chunk bug | `send-browse--v0.3.2.js` (user v0.3.3 tree, consumed by vault-browse-edit preview pane) still uses base64 chunk=8192 — the same padding bug fixed in `app-shell.js` at v0.33.21. Editor writes > 8 KB from the preview pane fail. Fix: 8192 → 8190. | `reality/ui/index.md` (flagged in commit `0c34e1c9`) |
| L2 envelope `__u8` edge case | `secure-channel-envelope.js` `_canonicalParse` treats any `{__u8: "<string>"}` as bytes. Deferred to ViV Phase 6 with `{__u8b64}` tag. | `reality/ui/index.md` (ViV section) |
| sg-print WYSIWYG follow-up | If printed output still looks scaled/shifted, cause is wide ASCII `<pre>` overflowing page width (Chrome shrink-to-fit). Needs wrap/clip/scale of wide `pre` in print media. | `reality/ui/index.md` (sg-print v1.0.3 note) |

## 2. Known Limitations (recorded, deferred)

| Item | Detail | Source |
|------|--------|--------|
| Folder manifest resolves after `app-shell:ready` | Per-folder `app.json` governs permissions/resources, but `hud.*` config and `auth.required` still use the ROOT manifest on first mount (HUD/auth intercept fires before folder manifest resolution). | `reality/vault/index.md` (v0.33.16) |
| `sg.vfs.write` ~3 MB ceiling | EFBIG guard at the bridge receiver; the lift is P-269 (presigned-PUT write path). | `reality/ui/index.md` |
| `sg.vault.delete` server teardown | Key custody solved; returns `server_teardown:false` until an `SGVault.destroy()` endpoint ships (Phase 5 / P-255, needs AppSec sign-off). | `reality/vault/index.md` |
| Static-host mode read-path | Static layout must mirror the literal `/api/vault/read/<vaultId>/` prefix; a configurable read-path template on `SGSend` is a proposed follow-on. | `reality/vault/index.md` (2026-06-30) |

## 3. Browser-Unverified Gaps (code-complete, needs verification)

| Item | Verification guide |
|------|--------------------|
| Sub-vaults: lazy expand → child opens silently; `<sg-embed-frame>` sandbox enforcement; Add-link cross-device portability; embedded page cannot read vault | `library/guides/vault-html/SUB-VAULTS-AND-LINKS.md`, `library/guides/vault-html/PLAYWRIGHT-VAULT-APP-ACCESS.md` |
| App-iframe capabilities Phases 1–4B (consent surface, `vault.create`/`unlink`) | `library/guides/vault-html/MIGRATING-TO-THE-PERMISSION-MODEL.md` |
| Public Vault Previews: timing/expiry controls (X days / X accesses) — brief specifies; implementation unconfirmed (**VERIFY**) | `reality/ui/index.md` (PVP section) |
| sg-print v1.0.3 margin parity — code-correct, no Save-as-PDF CI pass | `reality/ui/index.md` |
| Missing e2e: real app-shell mount + in-vault link click (the existing app-context regression spec stubs the network) — recommended harness after the srcdoc nav regression | `reality/ui/index.md` (app-shell nav fix note) |

## 4. ViV (Vault-in-Vault) Kernel — remaining phases

The kernel architecture is largely shipped (Phases 1–5.1 — see [features.md](features.md)).
Remaining, in dependency order:

| P-# | Item | Size estimate | Source |
|-----|------|---------------|--------|
| P-250 | `sg.vault.mount()` assembled API — compose KERNEL_SHELL_HTML → iframe → SecureChannel → secrets → mount registration into one entry point (~80 lines; pieces all exist) | Small | `reality/ui/index.md` |
| P-251 | `sg.vault.unmount()` — close channel, remove mount, keep broker log (~15 lines) | Small | `reality/ui/index.md` |
| P-252 | HUD `ask` broker policy prompt — consent UI for cross-vault writes (`app-hud.js` extension) | Small | `reality/ui/index.md` |
| P-253 | Mounts list / broker log UI on `/vault` — `KernelBroker.log()` exists; `/vault` has no consumer (note: `/app` has the Mounts + Audit debug tabs already) | Small | `reality/ui/index.md` |
| P-254 | Per-request elevation / credential tiers — three tiers (none, standing-ro, perRequest-rw); needs schema + issuance + child-side consumer | Medium | `reality/ui/index.md` |
| P-255 | `vault.delete` (App-Mode Phase 5) — needs owner-secret credential tier + AppSec sign-off | Medium | `reality/ui/index.md` |
| P-256 | Monitored-mode child visibility — 👁 MONITORED badge when parent reads child broker log | Small | `reality/ui/index.md` |
| P-257 | Phase 0.5 CORS operational verification — CDN invalidation + CloudFront Origin forward + real-browser null-frame round-trip to dev.send.sgraph.ai | Ops | `reality/ui/index.md` |
| P-258 | Phase 2 §7 browser end-to-end — clinician console writes to patient vault (needs two dev vaults) | Verification | `reality/ui/index.md` |
| P-260 | Phase 4 Option B — promote `/vault` HTML view + edit preview from postMessage bridge to SecureChannel kernel | Large | `reality/ui/index.md` |
| P-261 | Phase 5 remaining consumers — tree-view-expand-as-mount; CLI/REPL (standalone audit page BLOCKED by design: broker logs are in-memory per-document) | Medium | `reality/ui/index.md` |
| P-262 | Phase 6 hardening — SecureChannel everywhere; monitoring badge; optional X25519/Ed25519 curve upgrade; fix L2 envelope bug | Large | `reality/ui/index.md` |
| — | App-Mode Phase 6 — reads default-deny (flip `READ_DEFAULT` to `false` once apps declare `fs.read`) | Small (coordination-heavy) | `reality/ui/index.md` |

## 5. Architecture Decisions (accepted, not yet built)

| P-# | Item | Source |
|-----|------|--------|
| P-279 | **Kernel path unification / CompositeDataSource retirement** — converge `/en-gb/vault` (tree) and `/en-gb/app` onto one `KernelParent` + relay path; retire the read-only `CompositeDataSource` adapter; enables rw sub-vault writes from the tree view; one security code path. Scoped: `team/roles/architect/reviews/05/31/v0.31.2__scoping__rw-sub-vaults-kernel-relay-in-tree.md` | Architect 05/31 |
| P-280 | **Popup capability gate for inner vaults (SEC-VIV-002)** — strip popup flags for mounted sub-vault renders at the four mount sites; inner vaults get popups only via a request + parent-consent flow. Easier after P-279. Decision: Dinis 05/31 | AppSec 05/31 |

## 6. Vault Chat (Phases 1–4 SHIPPED — remainder open)

**Reality correction (2026-07-24):** P-263/P-264 were listed as fully PROPOSED, but Vault Chat
Phases 1–4 shipped mid-June (commits `adc9d0f`, `60a2f6d`, `ad8e14d`): real `sg-llm-request`
transport, in-vault chat pane/page, injection-floor fencing, context-layers inspector,
tools/loadout panel, `consolidate_memory` + history drop + full-prompt view + fractal scope.
Code: `_common/js/lib/vault-chat/` (10 files) + `vault-chat-pane.js` + `en-gb/vault/chat/`.
Tests: `tests/unit/vault_ui/vault-chat/` + `tests/e2e/vault_ui/vault-chat/`.

Still open from the P-263–P-266 cluster:

| Item | Detail | Source |
|------|--------|--------|
| P-265 Commit Queue | Timer-windowed batch commits on vault-shell (configurable window, staging area, debug tab) — solves many-files explosion from VFS sync | doc 509, `reality/ui/proposed/index.md` |
| P-266 Sidecar LLMs | Parallel LLM instances (memory curation, security checks, consolidation; consensus mode) | doc 506 |
| P-263/264 remainder | End-of-chat zip-to-vault; full context-layer sync options; anything in docs 505–506 not covered by Phases 1–4 (cross-check `library/sgraph-send/dev_packs/vault-chat/` against shipped code before starting) | docs 505–506 |

## 7. Larger Proposed Features (vault-web scope)

| P-# | Item | Source |
|-----|------|--------|
| P-269 | Presigned-PUT large-write path for `sg.vfs.write` (lift ~3 MB ceiling; server route + `vaultWriteLarge()` client; ~half-day) — scoped brief: `team/comms/briefs/06/11/v0.33.21__brief__vault-presigned-put-large-write.md` | 06/11 brief |
| — | `sg.vault.mount({mode:'rw'})` writable mount — brief: `team/comms/briefs/06/08/v0.33.5__brief__vault-writable-mount.md` | 06/08 brief |
| — | `/en-gb/app/<public-id>` Mode A/B wiring for Public Vault Previews (pending) + CloudFront path-segment routing (DevOps dependency) | `reality/ui/index.md` (PVP) |
| — | Vault Append client crypto (P1/P2): `enum_key` HKDF, `append_token = H(pubkey)`, X25519 seal/open, cross-language KATs — client-side work (vault web + sgit CLI) | `reality/vault/index.md` |
| — | Vault Inbox full spec: main UI section (left-hand, message count, key ID, config view), `sg.inbox.read()` under permission mapping, accepted-key config (transport C1–C4 shipped) | `briefs/06/07` inbox brief |
| P-128–131 | Vault demo capabilities: RO-open polish, cross-vault nav defaults, session-scoped state shim, session reset | `reality/ui/proposed/index.md` |
| P-132–135 | Vault testing framework: four-layer (unit/integration/QA/browser) on the same JS API; Vitest + Playwright; unified test format | `reality/ui/proposed/index.md` |
| P-269–273 | External data connectors (framework, Google Drive, data-broker iframe, GitHub/OneDrive) | `reality/ui/proposed/index.md` |
| P-274–278 | Evidence-driven assessment series (GDPR vault, feedback loop, CV workflow, app store/hub, consulting assessments) — all depend on Vault Chat | `reality/ui/proposed/index.md` |
| P-267/268 | Security Report + VC Confidential Data vault demos | docs 510–511 |
| P-248 | Sub-vaults CLI access (clone-within-clone) — sgit CLI side, not vault-web, but affects vault-web link conventions | doc 490 |

## 8. Where new to-dos come from

1. **Human briefs** — `team/humans/dinis_cruz/briefs/MM/DD/` (read-only; check the latest date bucket)
2. **Inter-team briefs** — `team/comms/briefs/MM/DD/` (vault-related briefs carry `vault` in the filename)
3. **Reality proposed trees** — `team/roles/librarian/reality/vault/proposed/` + `reality/ui/proposed/`
4. **Issues FS** — `.issues/` (file-based issue tracking)

When you complete an item from this file, update it here AND in the relevant reality domain
index in the same commit (CLAUDE.md rule 4).
