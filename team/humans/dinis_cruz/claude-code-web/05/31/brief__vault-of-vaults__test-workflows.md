# Brief — Test SG/Vault "Vault of Vaults" Workflows (incl. write-from-app)

**To:** a fresh Claude Code session (Explorer context)
**From:** Dinis (via the prior session on `claude/practical-noether-MszZ4`)
**Date:** 2026-05-31
**Branch to develop on:** create `claude/{your-description}-{session-id}` from `dev` (do **not** reuse the prior branch).

---

## 0. What you're being given

1. **A live vault key** — the "Demo · Vault of Vaults" shown in the attached screenshot.
   Dinis will paste the key into chat (it is a **secret** — never commit it, never log it,
   never put it in a file). Open it at:
   - `https://dev.send.sgraph.ai/#<vault-key>` (auto-routes), or explicitly
   - `https://dev.send.sgraph.ai/en-gb/vault/#<vault-key>` (vault mode), or
   - `https://dev.send.sgraph.ai/en-gb/app/#<vault-key>` (app mode — needed for relay/REPL)
2. **The test guide** you will execute and extend:
   `team/humans/dinis_cruz/claude-code-web/05/31/viv-debug-tools__browser-test-guide.md`
   (UC1–UC7, with a companion Phase-2 console walkthrough at
   `team/humans/dinis_cruz/claude-code-web/05/28/v0.31.2__viv__user-guide-browser-test.md`).

**Read first, before touching anything:** `.claude/CLAUDE.md`, the reality document
(`team/roles/librarian/reality/index.md` → `vault/index.md`), and both guides above.
Then `git fetch origin dev && git merge origin/dev`.

---

## 1. The one thing to get right (read this twice)

There are **two different "write into a vault from an app" paths**, and the screenshot
vault can only exercise one of them directly:

| Path | What it is | Where | This vault? |
|---|---|---|---|
| **A. Write to the app's own composite vault** | `vfs.write` into the parent vault's own namespace (incl. files that sit beside the read-through sub-vaults) | `/app` REPL (UC6) or `sg.vfs.write` in console | ✅ **Yes — if the key is writable** |
| **B. Relayed write INTO a child vault** | parent app calls `sg.vault.mount` → kernel relay → writes land in the *child's* server storage | `/app` + console (companion guide §3–§5) | ⚠️ **Not with this vault's sub-vaults** |

**Why B doesn't work against the screenshot vault as-is:** both its sub-vaults
(`demo-security-standards-gdpr`, `poc-sg-send-wardley-maps`) show **`ro · connected`** —
they are **read-through, read-only** links (`*.link.json`). A relayed write would
correctly be **refused by the child's read-only policy** (`EPERM`). That refusal is a
*passing* test of the two-sided gate, **not** a demonstration of a successful write into a
child vault.

**To demonstrate a *successful* B-path write, you need a writable child vault key.**
Ask Dinis for one (e.g. `sgit init` a throwaway vault), OR demonstrate B against a
synthetic child using the companion guide's escape hatch
(`window.SG_VIV_ALLOW_UNSAFE_SYNTHETIC = true`) — synthetic data only. **Do not** attempt a
real-data relayed-write pilot: per the prior session, the production credential-issuance
scheme is **deferred** and real-data mounts are gated off by design.

---

## 2. Workflows to test (in order)

Work through the guide, but here is the prioritised run-sheet specific to this vault:

### W1 — Read & navigate (sanity)
- Open in `/vault`. Confirm the tree matches the screenshot: `multiple vaults/` containing
  the two `🔗 ro · connected` sub-vaults, plus `.vault/`, `app.json`, `index.html`, `README.md`.
- **UC1 (regression):** open in `/app`, click in-vault nav/topic links — content must change,
  console logs `[app-shell] nav → ….html`, **no** 403 to `dev.vault.sgraph.ai`. This is the
  highest-value check (guards the bug Dinis reported).

### W2 — Sub-vault inspection (read-through)
- **UC3 + UC4** in `/vault`: open the **Sub-vaults** debug tab; expand each `🔗` node in the
  tree. Confirm the chip goes `○ ro` → `● ro · connected`, the child's files appear nested
  (116 / 37 files per the screenshot), and the Sub-vaults table summary matches.
- Confirm the **honest "no traffic"** expectation: read-through sub-vaults generate **no**
  Audit/broker entries (there's no kernel in `/vault`).

### W3 — Write to the app's own vault (Path A) ⭐ the write-from-app workflow that works here
- **UC6** in `/app`: open the **REPL** tab. Run `ls`, `ls multiple vaults/`, `cat README.md`.
- If the key is **writable**: `vfs.write notes/test-<timestamp>.txt hello from app`, then
  `cat notes/test-<timestamp>.txt` → expect `ok · wrote …` and the content back. Re-open the
  file in the file view to confirm it **committed/persisted**.
- Negative checks: `vfs.write .vault/owner.json x` → `protected path (.vault floor)`;
  on a read-only key → `read-only vault`.
- If the key is **read-only**, record that Path A can't be positively demonstrated with this
  vault and note what a writable key would show.

### W4 — Relayed write INTO a child vault (Path B) — needs a writable child
- Only attempt with a **writable child vault key** (ask Dinis) or the **synthetic** escape
  hatch. Follow the companion guide §3–§5: spawn child kernel → `_mountChildVault` → set broker
  policy → `sg.vfs.write('mounts/…')`.
- Then **UC5 (Audit tab)**: confirm the relayed op appears in the merged broker log tagged by
  kernel, kernel count/monitor state is right, and an unresponsive child times out to
  `unreachable` within ~3s (no hang).
- Capture the adversarial passes too (companion §6): floor still applies (`EPROTECTED`),
  child policy refuses out-of-scope (`EPERM`), push failure surfaces (`EUNREACH`),
  custody gate (`EUNSAFE_CUSTODY`).

### W5 — CORS null-origin (UC7)
- Run the two `curl` checks from the guide against `dev`. Expect `ACAO: *`, no credentials
  header. Tolerate a single cold-start `403` then retry.

---

## 3. Deliverables

1. **A test-run report** at
   `team/humans/dinis_cruz/claude-code-web/05/31/{your-file}__vault-of-vaults__test-run.md`
   (NOT in `briefs/` — that folder is human-only). For each of W1–W5: what you ran, what you
   observed, ✅/⚠️/❌, and any console/network evidence (redact the vault key).
2. **Bug notes** for anything that fails — reproducible steps, expected vs actual. If it's an
   Explorer-surface bug, file it; do not fix behaviour-changing bugs if you're in Villager
   context (kick back to Explorer).
3. **Guide patch (optional but encouraged):** if a step in the test guide is wrong/missing for
   this vault, update `…/05/31/viv-debug-tools__browser-test-guide.md` and note it.
4. Commit + push to your branch. **Do not** open a PR unless Dinis asks.

---

## 4. Hard rules (don't trip these)

- **NEVER** commit/log the vault key, share tokens, or access tokens. Redact them in the report.
- **NEVER** write to `team/humans/dinis_cruz/briefs/` — human-only.
- **NEVER** touch `sgraph_ai_app_send/version` — CI owns it.
- **No real-data B-path pilot.** Synthetic or writable-throwaway child only. Real-data mounts
  are deferred-gated by design.
- Follow `Type_Safe` / Memory-FS / `osbot-*` patterns if you touch code; **no mocks** in tests.
- If anything about a write target is ambiguous (e.g. "is this key writable?"), **ask Dinis**
  before writing — a write is hard to reverse.

---

## 5. One-paragraph summary to anchor you

You're testing a "vault of vaults": one parent vault that read-through-mounts two **read-only**
child vaults. You can fully test **reading/navigating** the parent and children (W1–W2), and you
can test **writing into the parent's own vault from its app** via the REPL (W3) **if the key is
writable**. The headline "write into a *child* vault from an app" (W4) is a **kernel-relay**
operation that needs a **writable** child — the screenshot vault's children are read-only, so
against them a write should correctly be **refused**; to show a *successful* relayed write, get a
writable throwaway child key or use the synthetic escape hatch. Report everything in
`claude-code-web/05/31/`, redact secrets, push to your own branch, no PR.
