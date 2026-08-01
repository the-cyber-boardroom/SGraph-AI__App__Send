# Vault Web — Code Index (START HERE)

**Version:** v0.33.44 | **Last updated:** 2026-07-24 | **Maintained by:** Librarian

The optimised entry point for any agent picking up a **Vault Web** task. Read this file, then
follow the reading path for your task type below. The goal: know exactly which files to read
before touching code, without re-deriving the map.

**What Vault Web is:** the browser UI product served at `dev.vault.sgraph.ai` — the vault
landing page, the `/vault` encrypted-vault browser/editor, the `/app` SG/App host that runs
vault-hosted applications in sandboxed iframes, and the ViV (vault-in-vault) kernel. All
crypto is client-side (Web Crypto, AES-256-GCM, PBKDF2 600k); the server only ever stores
ciphertext. Zero frameworks — vanilla JS Web Components under IFD methodology.

---

## The map

| Document | What it answers |
|----------|-----------------|
| [files.md](files.md) | "What does file X do?" — per-file catalogue: globals, purpose, API, load order |
| [features.md](features.md) | "Which files implement feature Y?" — feature → file map with status |
| [tests.md](tests.md) | "How do I run/extend tests?" — full test map, exact commands, coverage gaps |
| [todos.md](todos.md) | "Is this already scoped/known?" — every open bug, limitation, and proposed item with sources |

## Ground rules (from `.claude/CLAUDE.md` — non-negotiable)

1. Check the **reality tree** (`team/roles/librarian/reality/` — esp. `ui/index.md` +
   `vault/index.md`) before claiming anything exists. Update it in the same commit as code changes.
2. **Never commit vault keys, share tokens, or access tokens.** A key in a commit is a
   security incident.
3. Frontend work follows **IFD**: Web Components, zero dependencies, surgical versioning.
4. Never touch `sgraph_ai_app_send/version` (CI-owned).
5. Changelog entry in `team/comms/changelog/MM/DD/` for every UI/API-affecting change,
   classifying which tests SHOULD vs should NOT break.

## Where the code is

```
sgraph_ai_app_send__ui__vault/
  index.html                       # ⚠️ stale meta-redirect to v0.2.1 (known issue)
  v0/v0.2/v0.2.3/                  # ← THE ACTIVE TREE (~37k lines). Older versions = rollback only.
    index.html                     # root vault app (hash inbox + <vault-shell>)
    en-gb/index.html               # landing page
    en-gb/app/index.html           # SG/App host (<app-shell>)
    en-gb/browse|preview|vault/…   # secondary pages + dev harnesses (see files.md §14)
    _common/js/lib/                # sg-vault engine, sg-send, sg-append, links, public-preview, vault-chat
    _common/js/components/         # app-shell/kernel/ViV (§11) + vault browser components (§12)
    _common/js/vault-loader/       # credential detection, routing, storage
    _common/js/adapters/           # VaultDataSource, CompositeDataSource
tests/unit/vault_ui/               # Node unit tests (jsdom + vm harness)
tests/integration/vault_ui/        # Node in-memory flows + Python real-backend browser tests
tests/e2e/vault_ui/                # Playwright specs (local fixture server :3999)
library/guides/vault-html/         # docs for vault-app AUTHORS (AUTHORING.md = sg.* reference)
scripts/build-kernel-shell-bundle.py  # regenerates kernel-shell-bundle.js (never hand-edit)
scripts/vault__run-locally.sh      # run the vault UI locally
```

**Deploy:** `deploy-ui-vault.yml`, gated by `.github/workflows/_test-ui-vault.yml`.
**Backend endpoints** the UI calls: `/api/vault/*` on the User Lambda — see
`team/roles/librarian/reality/send-api/index.md`.

## Five facts that prevent the most common mistakes

1. **Two hosts, one engine.** `/en-gb/vault` (tree view, `<vault-shell>`, postMessage preview
   bridge) and `/en-gb/app` (`<app-shell>`, `sg.*` bridge, kernel) are separate shells over the
   same `SGVault` engine. Many features exist twice (auth, embedded token read, app.json
   handling) and need **parity** when changed. Unification is accepted-but-unbuilt (P-279).
2. **The bridge namespace is `sg.append.*`, not `sg.inbox.*`; there is no `sg.shell.*`.**
   Older briefs/docs use stale names — trust `files.md` §11.1's verb table (code-verified).
3. **Load order matters everywhere.** Classic scripts with globals: `sg-vault--*.js` extend
   `SGVault.prototype` and must load after `sg-vault.js`; pure helpers must load before
   `app-shell.js`; `markdown-parser` before `markdown-renderer`. Copy an existing page's order.
4. **`kernel-shell-bundle.js` is generated** — edit the source modules, then run
   `python scripts/build-kernel-shell-bundle.py` (freshness is unit-test-enforced).
5. **App frames are null-origin** (`sandbox="allow-scripts allow-forms"`, srcdoc). Anything
   touching iframes must survive: no `contentDocument` reach, no localStorage inside frames,
   no `replaceState` to absolute URLs, `caches` may throw. Wrap storage access in try/catch.

## Reading paths by task type

**Every task:** this file + [todos.md](todos.md) (is it known/scoped?) + the relevant
[features.md](features.md) rows. Then:

### Vault engine / crypto / sync task
1. `files.md` §1–2 (sg-vault, sg-send) — pick the specific files
2. `reality/vault/index.md` — key derivation tables, two-ref model, batching, CLI interop
3. ⚠️ Crypto + wire formats are **pinned to the sgit CLI** — breaking derivation or the
   branch-index format breaks `sgit clone`. Check `reality/cli/index.md` if touching formats.
4. Tests: `test__write_batch`, `test__branch_index`, integration `loader/` suite

### `/vault` browser UI task (tree view, editing, sgit tabs)
1. `files.md` §12 — `vault-shell.js` (orchestrator + event fan-in), then the specific component
2. Note: file rendering/preview comes from the REMOTE `send-browse--v0.3.2.js` (SG/Send CDN,
   lives in `sgraph_ai_app_send__ui__user/` v0.3.3) — `vault-browse-edit.js` monkey-patches it
3. `reality/ui/index.md` "Vault Browser UI" section for shipped behaviour detail

### `/app` host / bridge / permissions task
1. `files.md` §11.1 (app-shell lifecycle + full `sg.*` verb table) — then §11.2–11.4
2. `library/guides/vault-html/AUTHORING.md` (the contract apps rely on — don't break it)
3. `MIGRATING-TO-THE-PERMISSION-MODEL.md` for grants/floor/consent semantics
4. Tests: `test__app_permissions*`, `test__app_shell_*`, `test__app_hud_config`,
   `test__app_frame_bootstrap`, e2e `test__phase3_null_origin_probe`

### ViV / kernel / SecureChannel task
1. `files.md` §11.3 + `features.md` ViV section (what's shipped vs P-250…P-262)
2. Tests first — the kernel suite is the spec: `test__kernel_parent` (41), `test__kernel_relay`,
   `test__secure_channel*`, `test__viv_*`; e2e `test__viv_browser_e2e.spec.js` is the only
   real-browser path
3. Rebuild the kernel bundle after any bundled-module change (fact 4 above)

### Sub-vaults / links / embeds task
1. `files.md` §4 (vault-links), §9 (composite-data-source), §12.4 (link-card, embed-frame)
2. `library/guides/vault-html/SUB-VAULTS-AND-LINKS.md`
3. Know P-279 (CompositeDataSource retirement) before investing in that adapter

### Vault Chat task
1. `files.md` §13 + `features.md` Vault Chat section (Phases 1–4 SHIPPED — ignore stale
   PROPOSED labels elsewhere)
2. Pages: `en-gb/vault/chat/` (prod Phase 1), `chat/test/` (Phase 0 harness),
   `chat/kernel-poc/` (Phase 3 PoC)
3. Dev pack: `library/sgraph-send/dev_packs/vault-chat/`; run `npm run test:vault-chat-unit`
   (⚠️ not CI-gated — run it yourself)

### Public previews (PVP) task
1. `files.md` §5 + §12.4; `features.md` PVP section (editor is browser-unverified;
   `/app/<public-id>` Mode A/B wiring pending)
2. Dev pack: `library/sgraph-send/dev_packs/v0.27.62__public-vault-previews/`

### Test-only task
Everything is in [tests.md](tests.md) — harness design, exact commands, the 5 known gaps.

### Writing vault CONTENT or vault APPS (not changing Vault Web itself)
Use the skills `create-vault-content` / `vault-html-app` / `sgit` and
`library/guides/vault-html/AUTHORING.md`. You don't need this index.

## Definition of done for a Vault Web change

1. Code + tests (Node unit next to the pattern in `tests/unit/vault_ui/`; wire new files into
   the relevant `run-all.sh` — 6 existing files are already missing from it, don't add a 7th)
2. `npm run test:vault-unit && npm run test:vault-integration` green (+ e2e if UI-flow affected)
3. Kernel bundle regenerated if any bundled module changed
4. Reality tree updated in the same commit (`reality/ui/index.md` and/or `reality/vault/index.md`)
5. **This code index updated** (files.md for new/moved files, features.md for feature changes,
   todos.md for closed/opened items)
6. Changelog entry in `team/comms/changelog/MM/DD/` with test-impact classification
