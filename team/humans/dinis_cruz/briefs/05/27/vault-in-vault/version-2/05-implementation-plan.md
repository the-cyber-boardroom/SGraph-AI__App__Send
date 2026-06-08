# 05 — Implementation Plan

**Pack version** v0.28.7 · Companion to `01-architecture-review.md` (normative).
Phasing, **verified `file:line` targets against HEAD (v0.28.7)**, the verification matrix, and breakage/migration. The driving use case (KneeScore cross-vault write) lands at **Phase 2**; security hardening and the UI consumers sequence after.

> All `file:line` below verified 2026-05-28 against `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`. The prior briefing's line numbers had drifted (it cited 919/1033/1090/1170 for the sandbox sites; HEAD is **923/1037/1094/1174**). Re-pin again if HEAD has moved before you start.

---

## 5.1 Verified code targets (where the work lands)

| What | File · line (HEAD v0.28.7) | Note |
|---|---|---|
| App iframe sandbox (4 sites) | `_common/js/components/app-shell/app-shell.js:923, 1037, 1094, 1174` | all `allow-scripts allow-forms allow-same-origin` → must become `allow-scripts` (drop `allow-same-origin` and `allow-forms` unless a frame needs forms) |
| Vault key read (origin-boot) | `app-shell.js:82, 86, 225` | `localStorage['sg-vault-key']` — becomes **top-kernel-only**; nested kernels message-boot |
| Access token read | `app-shell.js:366, 517, 550, 552` | `localStorage['sg-backend-access-key']` — same: top-only |
| Per-vault access key | `app-shell.js:609` | `localStorage['sg-access-key:{vaultId}']` |
| `sg.*` bridge surface / handlers | `app-shell.js:1018, 1021, 1160, 1239, 1248, 1260, 1288, 1332, 1337, 1397` | the methods the secret-less stub must mirror (`vfs.read/write/list`, `vault.*`, `window.sgVault` facade, auto-`img.src`, inner-vault read-through) |
| Permission gate (`_can`/`_consent`) | `app-shell.js` (the gate around the bridge handlers; floor `.vault/**` → `EPROTECTED`) | moves **into the kernel**; the stub holds none of it |
| SG/API client | `_common/js/lib/sg-send/sg-send.js:17, 22-25, 32-37` | `x-sgraph-access-token` header (`:25`); `mode:'cors'` (`:36`); reads tokenless. **No change needed** — this already is the per-kernel direct client; nested kernels reuse it verbatim |
| **Null-origin precedent to copy** | `_common/js/components/.../sg-embed-frame.js:16, 147` | already does `allow-scripts allow-popups allow-presentation` — *no* `allow-same-origin`, *no* bridge. The pattern Phase 3 generalises |
| Permission model module | `_common/js/components/app-shell/app-permissions.js` (`isFloor`, `can`) | the policy engine the kernel runs; unchanged in logic, relocated to kernel-side |
| Sync/merge machinery (child writes reuse this) | `_common/js/.../sg-vault--sync.js` (commit / three-way-merge / publish) | the child kernel reuses this verbatim for its own writes; no cross-mount re-impl |
| CORS (server) | `sgraph_ai_app_send/lambda__user/fast_api/Fast_API__SGraph__App__Send__User.py:117, 118, 120` | `allow_origins=["*"]` + `allow_credentials=True` → set `allow_credentials=False` (see §06) |
| CloudFront `Origin` forward | same file `:150` (`forward_headers=['authorization', HEADER__SGRAPH_SEND__ACCESS_TOKEN]`) + the distribution config | verify `Origin` is forwarded and `Vary: Origin` honoured (§06) |

## 5.2 Phasing

| Phase | Delivers | Gating check (must pass to proceed) |
|---|---|---|
| **0 · Doc the trust assumption** | Annotate reality docs + the 05/27 spec: "vault apps are first-party and trusted; the permission model assumes cooperative code; do NOT enable third-party/customer-authored apps until Phase 3." | reality `security/index.md` + `vault/index.md` carry the caveat |
| **0.5 · CORS unblock (server)** | Apply §06 in `dev`. **External dependency — Dinis/AWS.** Without it, nested kernels can't reach SG/API and Phase 2 can't be proven end-to-end. | a `null`-origin frame on `dev.vault.sgraph.ai` completes a tokenless GET and a token PUT to `dev.send.sgraph.ai` (curl-from-sandbox + real-browser check) |
| **1 · SecureChannel module** | The §04 channel: port-anchored, PKI handshake, envelope, anti-replay, fail-closed misrouting. Standalone, unit-tested, no UI change. | unit tests green incl. the adversarial set (§5.3) |
| **2 · Spawn + nested kernel + cross-vault write — THE DRIVING CASE** | Kernel can **mount** a child vault (`null` iframe, message-boot, secrets via SecureChannel); `sg.vfs.*` resolves mounts and **relays**; child writes its own file under its own policy on its own server edge; **per-kernel broker** logs/authorises Edge 2. App-A may stay as-is. **→ console appends to patient `data/reviews.json` works.** | real nested `/app` kernel boots `null`, message-boots, performs a relayed write end-to-end; broker entry recorded |
| **3 · Standalone `/app` → null + bridge split (security gate)** | The 4 sandbox sites drop `allow-same-origin`; `sg.*` becomes a secret-less stub; the permission checks + secrets move kernel-side. Closes `SECURITY-same-origin-app-bypass.md` for the main app. **This is the security gate, not a ViV side-effect.** | feature parity under `null` (§5.4 parity list); `localStorage`/`window.parent`/ambient `fetch` from app code now fail |
| **4 · Unify the three iframe contexts** | `/vault` HTML view + edit preview onto the same kernel+channel; edit preview's data source = dirty editor buffer. | preview == runtime (same code path, both `null`) |
| **5 · UI consumers** | Vault-in-vaults page (aggregates per-kernel broker logs), tree-view-expand-mounts-and-connects, CLI/REPL. | each is a pure consumer; no new mechanism introduced |
| **6 · Hardening / simplification** | Roll SecureChannel out to remaining cross-context paths; monitoring-mode visibility wiring; optional curve upgrade (P-256 → X25519/Ed25519) if runtime confirms. | AppSec sign-off on key custody + monitoring visibility |

**Sequencing note:** 0.5 can proceed in parallel with 1 (different owners). 2 is blocked on both 0.5 and 1. 3 is the security deliverable and is independent of 4–5; if third-party apps are ever on the roadmap, 3 is the hard gate.

## 5.3 Adversarial test matrix (Phase 1 + 2 — these are the load-bearing guarantees)

These are not nice-to-haves; each maps to an §01 invariant and must be an explicit test, not an inferred property.

| # | Test | Expected | Guards invariant |
|---|---|---|---|
| T1 | `null`-origin child reads `parent.document` | throws / `parentDocReadable:false` | §3 origin isolation |
| T2 | `null`-origin child reads `localStorage` | throws `SecurityError` / `localStorageReadable:false` | §3 no ambient secrets |
| T3 | Child attempts to `postMessage` to `window.parent`/`window.top` to *initiate* a request | no usable handle; parent ignores non-channel `window` messages | §4 directional trust |
| T4 | Grandchild C posts to top A (sibling/ancestor reach) | rejected — A has no channel to C; `sig` fails | §4 not transitive |
| T5 | Misrouted/forged envelope (bad `sig`) delivered to a kernel | dropped unread, logged `EPROTO`, **not executed** | §10 fail-closed |
| T6 | Replayed envelope (reused `nonce`) | rejected | §4.2 anti-replay |
| T7 | App calls `vfs.write` with no capability | `EPERM`, no relay attempted | §9 capability gate |
| T8 | Parent grants write, child policy forbids it | `EPERM` (child refuses regardless of credential) | §9 two-sided authority |
| T9 | Per-request write token used once; second write without it | first ok; second `EPERM` (token not retained) | §9 ephemeral elevation |
| T10 | `null` kernel GET (tokenless) + PUT (token) to SG/API after §06 | both succeed; `ACAO:*` observed | §5 Edge 1 / §06 |
| T11 | Isolation mode: parent attempts to read child↔grandchild traffic | cannot (never held child priv key) | §10 / D6 isolation default |
| T12 | Monitoring mode on (debug) | vault-in-vaults page shows `👁 MONITORED` for that kernel | §10 / D6 visibility |

## 5.4 Phase 3 feature-parity list (verify each survives `null` origin)

Each shipped same-origin behaviour must be re-expressed over the bridge or confirmed to work under `null`:

- `loadCss` / `loadJs` injection → must route via the bridge / be inlined (no same-origin `<script src>` of vault paths).
- In-app navigation / hash handling (top kernel only owns the URL).
- Markdown render pipeline.
- `img.src` auto-interception → served as `blob:` via `sg.vfs.read` (the `app-shell.js:1160,1337` path) — confirm under `null`.
- `blob:` mounting for inner-vault files (`app-shell.js:1397` read-through).
- `window.sgVault` facade (`app-shell.js:1332`) re-expressed over the secret-less stub.
- The `sg-app-banner` iframe `onerror` capture (noted "same-origin only" in the UI reality doc) — **will break** under `null`; the bridge stub must absorb it or the feature is dropped/re-specced.

> The last item is the one concrete migration cost the prior briefing underweighted: several preview/banner behaviours assume same-origin. Inventory them at the start of Phase 3 or they surface as "preview went blank" regressions.

## 5.5 Self-contained kernel delivery (Phase 2 build target)

A `null`-origin document cannot cleanly load its own `<script src>` subresources (same `Origin: null` wall). The kernel shell delivered into a nested frame must therefore be **self-contained** — `srcdoc` or a blob with everything inlined — not `src=/en-gb/app` pulling external scripts. The shipped shell already inlines much of this; "produce one self-contained kernel bundle" is an explicit Phase 2 build artifact and is the real content of the prior briefing's "real kernel-in-kernel" open checkpoint.

## 5.6 Breakage & migration (acceptable, per project lead, with docs)

Per Dinis: **it is OK to break a number of vaults**, betting that good docs let Claude agents repair them mechanically. Optimise for a clean design over compat shims; invest in the repair docs.

What breaks, and the mechanical fix:
- **Writes already deny-by-default (Phases 1–4B shipped).** An app that writes needs a `permissions` block in its `app.json`: `{ "permissions": { "fs": { "read": true, "write": ["data/"] } } }`, set via the Vault UI / `sgit` (never from the app), commit + push. (`MIGRATING-TO-THE-PERMISSION-MODEL.md`.)
- **App frame becomes `null`-origin (Phase 3).** Apps relying on same-origin tricks (reading `localStorage`, touching `window.parent`, `fetch` of vault paths) break — rewrite to `sg.*` (already the documented contract in `AUTHORING.md`).
- **Custody (product, not mechanism).** For the synthetic trial the console may hold child write keys; before real PHI, move to patient-generated or server-minted-and-delivered keys. **Coupling rule (do not ship the unsafe combination):** real PHI requires *either* child-generated keys *or* App-A already `null` (Phase 3). Parent-held child keys inside a *same-origin* App-A is the one combination that exposes the child's secrets to any same-origin code — fine for synthetic data, never for real data.

**Deliverables alongside the code:** update `AUTHORING.md` (the `null`-origin contract + `sg.vault.mount` / cross-vault access) and `MIGRATING-TO-THE-PERMISSION-MODEL.md` (a "repair a broken vault app" checklist) so repair is mechanical.

## 5.7 Open items to confirm during build

1. **Curve:** P-256 verified-universal; adopt X25519/Ed25519 iff target-browser support is solid (Phase 6).
2. **Forms sandbox token:** today's sites include `allow-forms`; confirm which apps actually need it before dropping it with `allow-same-origin`.
3. **Per-request credential transport:** confirm the write token is accepted by the child kernel as an inline, single-use override and is never written to the child's storage (there is none) or retained in memory past the request.
4. **CloudFront caching of `ACAO`:** confirm `Vary: Origin` is honoured edge-side so a cached `*` (post-§06) is never the *reflected* value from a stale config.
5. **Monitoring-mode plumbing:** the visible badge (D6) needs the kernel to report its key-custody mode over `sg.vault.mounts()`; wire that in Phase 5 with the vaults page.
