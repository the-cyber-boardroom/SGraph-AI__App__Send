# Brief — Vault-in-Vault Phases 4 & 5

> **First task: read this brief, then read what was already delivered (links
> below) before touching any code.** Phase 3 had a messy delivery — three
> follow-up commits to correct overstated claims. Reading the history end-to-end
> will save you from re-learning the same things and avoid repeating the
> mistakes.

Branch: `claude/exciting-brown-G2P9Z`. Current HEAD: `9899c1f2`.

---

## Part 1 — Read what's already done (do this first)

### The pack you are continuing

`team/humans/dinis_cruz/briefs/05/vault-in-vault/version-2/05-implementation-plan.md`

Phases 1, 2, 3 are shipped (with caveats below). Phases 4 and 5 are the
remaining work.

### What Phase 3 actually delivered (verify before you trust)

Commits, in order (oldest first):

- `840477c8` — B4 Mounts + broker-log audit viewer (debug tab).
- `21734922` — B10 fail-closed custody gate (`EUNSAFE_CUSTODY`).
- `b8e004f5` — B5/B6 credential-tier gate + B7 monitored-mode (`ECONSENT`).
- `f534b279` — **OVERSTATED.** Claimed all 4 app frames flipped to null-origin;
  only `_mountApp` (line 1071) actually flipped. Probe spec was broken
  (CommonJS `require` in ESM) and never ran. Committed during an environment
  glitch.
- `1b5b6b17` — Corrected: flipped the real remaining 3 sites
  (`_mountPageLayout`, `_mountVaultFile` HTML, `_mountVaultFile` markdown) and
  repaired the probe to ESM.
- `288ab4e2` — **OVERSTATED AGAIN.** Claimed Phase 3 probe P1 passing; it was
  still failing. The code state was correct; the message lied about the test
  result.
- `9899c1f2` — Genuinely correct now. P1 rewritten to assert the **real**
  browser behavior, all probe tests passing.

**What you should verify yourself before starting Phase 4:**

```bash
cd /home/user/SGraph-AI__App__Send
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test tests/e2e/vault_ui/
# Expect: 30 passed, 0 failed, 10 skipped

bash tests/unit/vault_ui/loader/run-all.sh
# Expect: 323 passed, 0 failed across 16 files

grep -c "allow-same-origin" \
  sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-shell.js
# Expect: 0 in `iframe.sandbox = '...'` lines (only comment refs remain)
```

**Key file references:**

- `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-shell.js`
  - Lines 797, 1071, 1182, 1237, 1315 — the 5 sandbox sites (kernel + 4 app),
    all `'allow-scripts'` or `'allow-scripts allow-forms'`, all delivered via
    `srcdoc`.
  - Lines 1346–1539 — `_buildVfsBridgeScript()`: the `sg.*` / `sgVault` API
    surface, already postMessage-only.
  - Line 1578 — `e.source !== iframeEl.contentWindow` validation. **Verified
    surviving null-origin** (WindowProxy reference equality is cross-origin
    safe — probe P3 locks this).
- `tests/e2e/vault_ui/test__phase3_null_origin_probe.spec.js` — P1–P4 lock the
  Phase 3 browser facts. **Important learning encoded here**: a parent-minted
  `blob:` URL in `sandbox="allow-scripts"` **inherits the parent's origin** in
  Chromium; only `srcdoc` yields a true `null` origin. That is why all 4 app
  frames now use `srcdoc`.

**Reality docs updated in `9899c1f2`'s lineage:**

- `team/roles/librarian/reality/security/index.md` — App iframe sandbox flipped
  to null-origin/SHIPPED; same-origin-app-bypass marked CLOSED.
- `team/roles/librarian/reality/ui/index.md` — App-frame `onerror` capture
  noted as no-longer-auto-surfacing (re-spec over bridge if wanted).
- `team/roles/librarian/reality/security/proposed/null-origin-app-isolation.md`
  — banner flipped to SHIPPED.

### What was NOT done (Phase 3 leftovers)

- **`sg-app-banner` `onerror` capture** — relied on same-origin access; now
  silently does nothing for app errors. Pack §5.4 calls this out as the one
  concrete migration cost. Either re-spec over the bridge or drop the feature —
  conscious decision needed.
- **`allow-forms` token** — retained at all 4 sites pending the per-app
  inventory (pack §5.7 item 2). Not a blocker for Phase 4/5.

---

## Part 2 — Phase 4: unify the iframe contexts

**Goal (pack §4):** the three iframe contexts (vault HTML view, edit preview,
runtime app) all run the same kernel + channel today as three separate flavours
with overlapping but divergent bootstrap paths. Phase 4 collapses them onto
**one** kernel-shell delivery + **one** bridge/channel.

### Where to start

1. **Inventory the three contexts** by reading these in order:
   - `_mountApp` (`app-shell.js:1021`) — runtime app via `srcdoc + sg.*` bridge.
   - `_mountPageLayout` (`app-shell.js:1092`) — `_page.json` via inlined
     PageLayoutRenderer + same bridge.
   - `_mountVaultFile` (`app-shell.js:1203`) — HTML branch (1230) and markdown
     branch (1256), each building its own bootstrap HTML.
   - Plus the kernel-shell `_spawnChildChannel` (`app-shell.js:797`) — uses
     `srcdoc = KERNEL_SHELL_HTML` + `SecureChannel.create()`. This is the
     "real" channel; the 4 app frames use the simpler postMessage bridge.

2. **Decide the unification target** with the user before coding. Two
   plausible shapes:
   - **A. Single bootstrap, branch on content type** — one `srcdoc` template
     that picks markdown/page-layout/app/HTML based on a small descriptor
     injected at the top. Smaller change, keeps the postMessage bridge.
   - **B. Promote all 4 app frames to `SecureChannel`** — same channel the
     kernel-shell already uses. Bigger change but unifies with the ViV stack
     and gives the app frames the same encrypted handshake as child kernels.
     This is the more aligned answer to "unify".

   The pack reads as B-shaped but doesn't mandate it. **Ask the user before
   committing to one.**

3. **Phase 4 will break tests.** Several e2e specs assert specific bootstrap
   behaviours (e.g. peek page text, edit preview layout). Plan the test
   migration alongside the code change, not after — and **run the suite
   between each iframe site you change**, not just at the end. (This is the
   single biggest lesson from Phase 3.)

### Phase 4 acceptance signals

- All 4 app-frame sites share a single bootstrap function (no copy-paste
  divergence between the 4 callers).
- The bootstrap function is unit-testable (callable from a Node test against
  in-memory inputs, returning the HTML to mount). Today the logic is inline in
  the mount methods and can only be exercised via Playwright.
- The 30 passing e2e + 323 passing unit tests stay green, OR any that break do
  so for a documented "good failure" reason (per CLAUDE.md rule 27) with the
  test migrated in the same commit.
- Reality doc updated in-commit.

---

## Part 3 — Phase 5: UI consumers

**Goal (pack §5 last paragraph):** surface the broker log and mount state in
the user-facing UI — not just the debug tab. Three concrete deliverables:

### 5.1 — Vaults page aggregating per-kernel broker logs

The B4 debug tab (`app-debug-mounts`, shipped in `840477c8`) renders mounts +
broker entries for **one** kernel. Phase 5 needs a page that aggregates across
**all active kernels in the session** so the operator can see "what did vault
X allow vault Y to do" at a glance.

- Provider exists: see `_appDebug.vivProvider` injection at
  `app-shell.js:_ensureKernelParent` (B4 commit).
- Build the page as a normal vault UI page, not a debug tab.
- Filter/group by mount, by capability (read/write/delete), by decision
  (allow/deny), by credential tier.

### 5.2 — Tree-view mount expansion

The vault tree-view currently shows top-level vault contents. With mounts,
each `mounts/<ref>/` prefix is a separate logical vault. Tree expansion of a
mount should:

- Lazily fetch via `parent.relay('list', { path: 'mounts/<ref>/...' })`.
- Render with a visual cue that it's a mounted vault (not local files).
- Honour the broker decision — if `list` is denied, show a clear "permission
  denied" leaf rather than an empty folder.

### 5.3 — CLI / REPL

The pack mentions a CLI / REPL for vault operations. Scope this with the user
before building — it can range from a thin `sg.*`-via-stdin wrapper to a full
vault shell. **Don't speculatively build the bigger version.**

### Phase 5 acceptance signals

- A user can open the vaults page, see all mounts from all kernels, and read
  the audit log without touching the debug tab.
- Tree expansion of a mount lazily fetches via the relay (no eager listing of
  remote vault contents on initial mount).
- Reality doc lists the new pages under `ui/index.md`.

---

## Process rules for this session (learned the hard way in Phase 3)

1. **Never claim a test passes you haven't just read the result of.** If the
   environment is glitchy and a tool result is duplicated/truncated, re-run
   the test and read a *fresh* result before committing. Three Phase 3
   commits had to be issued because I trusted mis-parsed output.
2. **Write commit messages from the actual numbers, not from intent.** If
   you ran the suite and saw `1 failed`, the commit message says `1 failed`.
3. **One iframe-site change → one test run → one commit.** Phase 3 tried to
   batch all 4 sites and had to be unwound. Phase 4 will touch the same code;
   don't repeat this.
4. **Re-read the file before each Edit when the harness is acting up.**
   Tool-result desync was the proximate cause of the bad commits.
5. **Reality doc must be updated in the same commit as the code change**
   (CLAUDE.md rule). Don't defer.
6. **NEVER touch `sgraph_ai_app_send/version`.** Owned by CI exclusively.

---

## Pointers

- Pack: `team/humans/dinis_cruz/briefs/05/vault-in-vault/version-2/05-implementation-plan.md`
- Phase 3 surface map (from a sub-agent run last session) — re-derive if you
  need it; the map's key conclusions are encoded in the probe spec and the
  reality docs.
- Reality doc entry point: `team/roles/librarian/reality/index.md`
- Branch: `claude/exciting-brown-G2P9Z` (push back to it).
