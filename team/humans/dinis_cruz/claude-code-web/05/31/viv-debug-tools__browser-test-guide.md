# ViV + Debug Tools — Browser Test Guide (this session's deliverables)

**Audience:** you, at a browser, wanting to confirm everything shipped on branch
`claude/practical-noether-MszZ4` actually works — with concrete, clickable use cases.

**Companion guide:** the deeper Phase-2 mount/relay/broker console walkthrough lives in
[`../05/28/v0.31.2__viv__user-guide-browser-test.md`](../28/v0.31.2__viv__user-guide-browser-test.md).
This guide covers the **UI surfaces + the regression fix + the CORS change** added on
top of that.

> **What this branch added (the things to test below):**
> 1. **Fix** — in-vault links work again under null-origin frames (the bug you reported)
> 2. `/vault` **debug pane** — right-side, resizable, reload-persistent
> 3. **Sub-vaults** debug pane (read-through mount table)
> 4. Cross-kernel **Audit** tab (`/app`)
> 5. **REPL** tab (`/app`) — small `sg.*` console
> 6. **Tree-expand status chip** (sub-vault nodes show `○ ro` / `● ro · connected` / `🔒` / `⚠`)
> 7. **CORS** server change verified at the dev edge (null-origin reaches SG/API)

---

## 0. Prerequisites

- Up-to-date dev: visit `https://dev.send.sgraph.ai` (or serve the branch locally).
- A vault key you can open. Examples used below:
  - `https://dev.send.sgraph.ai/#<your-vault-key>` (auto-routes to `/en-gb/app` or `/en-gb/vault`)
- For sub-vault use cases: a vault that contains a `*.link.json` sub-vault link (the
  Meridian VC demo has these; or add one via the `/vault` **🔗 Add link** button).
- Open DevTools (Console + Network) — several checks read the console.

> **Tip — force a fresh build:** hard-reload (Cmd/Ctrl-Shift-R). If you changed code
> locally, run `python3 scripts/build-kernel-shell-bundle.py` before serving.

---

## UC1 — In-vault links work again (the regression you reported)  ⭐

**What broke:** clicking a topic/section link inside a vault app did nothing; the
browser status bar showed `https://dev.vault.sgraph.ai/scenarios/overview.html` (a 403).
Cause: Phase 3 moved app frames to `srcdoc`, but nav still assigned a `blob:` `src`,
which `srcdoc` overrides — so navigation silently no-op'd.

**Steps**
1. Open a multi-page vault app: `https://dev.send.sgraph.ai/#<vault-key>` (a vault whose
   app has internal links — e.g. the Meridian "CONFIDENTIAL DEAL VAULT": Home → Overview
   → Consume → etc., and any in-body topic links).
2. Click a nav item (e.g. **Overview**) and an in-body topic link.

**Expected**
- ✅ The page content **changes** to the target page (no blank, no staying put).
- ✅ Console logs `[app-shell] nav → <path>.html` for each click.
- ✅ The iframe shows the new page; **no** hard navigation to `dev.vault.sgraph.ai/...`
  and **no** 403 in the Network tab from clicking.

**If it fails:** check you're on the new build (the fix is commit `ee6f4995`); confirm
the iframe is `srcdoc` (DevTools → the frame is `about:srcdoc`), not a stale `blob:` src.

---

## UC2 — `/vault` debug pane: right-side, resizable, reload-persistent

**Steps**
1. Open a vault in vault mode: `https://dev.send.sgraph.ai/en-gb/vault/#<vault-key>`
   (or click **Debug** in the top bar of `/vault`).
2. The debug pane opens as a **right-side column** (not a bottom strip).
3. **Drag** the left edge of the pane to resize it.
4. Switch tabs: **Sub-vaults · Msgs · Events · API · Storage**.
5. **Reload the page.**

**Expected**
- ✅ Pane opens on the right; drag-resize works.
- ✅ After reload, the pane is **still open, at the width you left it, on the same tab**
  (persisted to `sessionStorage`: `vault-debug-open` / `-width` / `-tab`).
- ✅ The ✕ in the tab bar closes it; reload then keeps it closed.

---

## UC3 — Sub-vaults debug pane (read-through mount table)

**Steps**
1. Open a vault that has a `*.link.json` sub-vault, in `/vault`.
2. Debug → **Sub-vaults** tab.
3. In the file tree (left), **expand** the `🔗 <sub-vault>` node to open it.
4. Watch the Sub-vaults pane (it live-refreshes on tree changes).

**Expected**
- ✅ Each sub-vault appears as a row: name · path · access (`ro`) · status · file-count.
- ✅ Status starts **not opened**; after you expand it in the tree → **open**; a
  no-key sub-vault → **locked**; a broken one → **error** (with message).
- ✅ Summary line: `N sub-vaults · X open · Y not opened · …`.
- ✅ Refresh (↻) re-reads the current mount table.

> **Expected "no traffic" note:** these are **read-through** sub-vaults (opened in-process,
> read-only). There is no kernel/broker in `/vault`, so they do **not** generate Audit/broker
> log entries — that's by design, not a bug (see UC5).

---

## UC4 — Tree-expand status chip (sub-vault nodes)

**Steps**
1. Same setup as UC3 — a vault with a `🔗` sub-vault link, in `/vault` (or `/browse`).
2. Look at the `🔗 <sub-vault>` node's chip **before** and **after** expanding it.

**Expected**
- ✅ Before expand: `○ ro` (muted) — "not opened".
- ✅ After expand: `● ro · connected` (green) and the child's files appear nested.
- ✅ A sub-vault with no available key shows `🔒 locked` (red) and re-renders to show it
  even if the expand click fails.
- ✅ Hover the chip → tooltip explains the state (e.g. "connected — opened read-through,
  read-only").

> Honest scope: "connected" = opened **read-through** (no kernel relay in `/vault`).

---

## UC5 — Cross-kernel Audit tab (`/app`)

The Audit tab aggregates **kernel mounts** (the real ViV primitive: `sg.vault.mount` +
relay), not read-through sub-vaults. To see traffic you need a mounted child kernel.

**Steps**
1. Open a parent vault in `/app`: `https://dev.send.sgraph.ai/en-gb/app/#<vault-key-A>`.
2. Open the debug pane (right edge) → **🛡️ Audit** tab. With no mounts it shows
   `1 kernel · top (this app) · 0 ops` and an empty merged log — correct.
3. Mount a child kernel + do a relayed write using the **console steps in the companion
   guide** (`../28/v0.31.2__viv__user-guide-browser-test.md` §3–§5). After the write:
4. Re-open / refresh (↻) the **Audit** tab.

**Expected**
- ✅ **Kernels** section: `top (this app)` (self) + each child with its monitor state
  (`monitored` / `closed` / `unreachable`) and mount/op counts.
- ✅ **Merged broker log**: each relayed op tagged by kernel (time · op · path · result).
- ✅ Summary: `N kernels · M monitored · K ops · ok/denied/err`.
- ✅ A child that didn't opt into monitoring shows **"monitoring closed"** (not an empty
  row) — consent-honest.
- ✅ **No hang:** if a child is unresponsive, its row becomes `unreachable` within ~3s
  (timeout fix `…`), the tab never stalls on "Polling kernels…".

> **Key expectation:** the Audit log only fills from **kernel mounts** (`sg.vault.mount`
> + `relay`). Read-through `*.link.json` sub-vaults (UC3/UC4) contribute **nothing** here.

---

## UC6 — REPL tab (`/app`): small `sg.*` console

**Steps**
1. In `/app` with a vault open, debug pane → **›_ REPL** tab.
2. Type `help` (shows the command set). Then try:
   ```
   ls
   ls data/
   cat <some-file>.json        (or: vfs.read <path>)
   mounts
   broker.log                   (or: log)
   ```
3. On a **writable** vault, try `vfs.write notes/test.txt hello world`, then `cat notes/test.txt`.
4. Use **↑ / ↓** to recall previous commands. `clear` empties the scrollback.

**Expected**
- ✅ `ls` lists folders-first then files with sizes; `ls data/` scopes to that folder.
- ✅ `cat` prints text file contents; `mounts` lists kernel mounts (or "no kernel
  mounts" if none); `broker.log` prints the broker log (or "empty").
- ✅ `vfs.write` on a writable vault → `ok · wrote notes/test.txt`; the file then commits
  (re-open it in the file view to confirm it persisted). On a read-only vault →
  `read-only vault`.
- ✅ Writing a `.vault/...` path → `protected path (.vault floor)`.
- ✅ History (↑/↓) and `clear` work.

> Scope (deliberately small, "not a shell"): the REPL operates on the **app's own
> composite vault** (incl. read-through sub-vaults). It does **not** model the mockup's
> per-mount `sg › patient-acme` context, and a `mounts/*` write goes to the app's own
> vault, not a kernel relay. File ops + inspection only.

---

## UC7 — CORS / null-origin reaches the SG/API (already verified)

This is the server change you applied (`allow_credentials True→False`). It was
**verified live at the dev edge** during review — included here so you can re-run it.

```bash
# Preflight for a null-origin PUT with the custom token header → expect 200, ACAO: *
curl -i -X OPTIONS https://dev.send.sgraph.ai/api/info/health \
  -H 'Origin: null' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: x-sgraph-access-token'
#   → HTTP 200
#   → access-control-allow-origin: *        (NOT 'null', NOT reflected)
#   → (no access-control-allow-credentials)

# GET from null origin
curl -i https://dev.send.sgraph.ai/api/info/health -H 'Origin: null'
#   → 200 + access-control-allow-origin: *
```

**Expected:** `ACAO: *`, no credentials header, no `Vary: Origin`.
**Caveat:** a cold start may briefly `403` on the first hit, then settle to `200` —
worth a single retry in kernel fetch code. Verified on **dev**; promote to prod after the
Phase-2 browser gate.

---

## Quick reference — what's verified vs still console-driven / proposed

| Use case | Surface | Status |
|---|---|---|
| UC1 in-vault links | `/app` | ✅ fixed + clickable |
| UC2 `/vault` debug pane | `/vault` | ✅ clickable |
| UC3 Sub-vaults pane | `/vault` | ✅ clickable |
| UC4 tree-expand chip | `/vault`, `/browse` | ✅ clickable |
| UC5 Audit tab | `/app` | ✅ tab clickable; **mounting a child is still console-driven** (no "Mount vault" button yet) |
| UC6 REPL | `/app` | ✅ clickable |
| UC7 CORS null-origin | server/edge | ✅ verified on dev |

**Still proposed (not in this branch):** a user-facing "Mount vault" button/key modal;
a real credential-issuance scheme (deferred — enforcement gates ship); a recorded
Playwright clinician walkthrough; an app-shell in-vault-nav e2e (the UC1 regression has
no automated test yet — recommended follow-up).
