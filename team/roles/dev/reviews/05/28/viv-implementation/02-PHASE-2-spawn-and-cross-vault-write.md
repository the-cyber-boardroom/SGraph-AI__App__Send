# Phase 2 — Spawn + nested kernel + cross-vault write (THE DRIVING USE CASE)

**Pack version** v0.28.7 · **Audience** the agent implementing the ViV product unlock.
**Authoritative spec:** version-2 §01 (esp. §4–§9), §02 §2.4–§2.6, §04 §4.4–§4.6.
**Preconditions:** Phase 1 (SecureChannel) green; Phase 0.5 (CORS) applied in `dev`.

**What this phase ships:** a kernel can **mount** a child vault as a `null`-origin iframe with its own
kernel, message-booted via SecureChannel; `sg.vfs.*` resolves mounts and **relays** invocations to the
child; the child writes its own file on its own server edge; the **per-kernel broker** logs and (per
policy) authorises every Edge-2 invocation. **The clinician console writes `data/reviews.json` in the
patient vault, end-to-end.**

**App-A may stay same-origin** for this phase — the standalone-app hardening (null app + bridge split)
is **Phase 3**, sequenced after. This is deliberate: it decouples the product unlock from the security
refactor (version-2 §5.2).

---

## 0. Definition of done

A real browser, on `dev`:
1. Clinician opens the console vault as today.
2. Console app calls `sg.vfs.write('mounts/patient-acme/data/reviews.json', review)` (transparent —
   no `sgpoc:` message, no patient app mounted in UI).
3. Kernel-A resolves `mounts/patient-acme/` to a child mount, the **broker prompts "App-A asked to
   WRITE …in vault patient-acme — authorise? [y/n]"**, user clicks yes.
4. Kernel-B receives the relayed write, applies its `fs.write:["data/"]` policy, writes `data/reviews.json`
   into the patient vault's working tree, **commits + pushes on its own server edge** (using the patient
   vault's token, hitting `dev.send.sgraph.ai` directly).
5. Open the patient vault directly (another tab) → `data/reviews.json` contains the review.
6. The clinician console's broker log records the invocation.
7. `localStorage['sg-vault-key']` is unchanged — the clinician's session is intact, reload re-opens
   the console.

## 1. New files

```
sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/
  kernel-shell.html         ← NEW. The self-contained shell that a parent srcdoc's into a child iframe.
                                Contains all kernel + permissions + secure-channel + sg-send code inlined
                                (or via blob URLs). NEVER loaded with src=/en-gb/app from a null frame.
  kernel-boot.js            ← NEW. The kernel's boot state machine: origin-boot OR message-boot.
                                Mounts its own app, manages mounts, runs sg.* handlers, runs the broker.
  kernel-mounts.js          ← NEW. Mount table + path resolution (longest-prefix match → child channel).
  kernel-broker.js          ← NEW. Per-kernel sidecar: mediate / log / authorise / expose log.
```

`app-shell.js` continues to drive the top kernel (it always was the kernel; Phase 2 names it explicitly
and teaches it to message-boot when it's nested). Phase 3 is what splits it into "kernel" + "stub" by
making the app frame `null`-origin.

## 2. Sub-step A — `kernel-mounts.js` (path resolution)

A pure module. Exports `globalThis.KernelMounts`.

```js
class KernelMounts {
  constructor() { this._mounts = new Map(); /* mountId → { prefix, ref, channel } */ }

  add({ mountId, prefix, ref, channel }) {
    if (!prefix.endsWith('/')) prefix += '/';
    this._mounts.set(mountId, { prefix, ref, channel });
  }
  remove(mountId) { const m = this._mounts.get(mountId); this._mounts.delete(mountId); return m; }
  list()          { return Array.from(this._mounts.values()); }

  // Longest-prefix match. Returns { mount, rest } or null.
  resolve(path) {
    const norm = AppPermissions.normalizePath(path);
    let best = null, bestLen = -1;
    for (const m of this._mounts.values()) {
      const p = m.prefix;                                     // 'mounts/patient-acme/'
      const headNoSlash = p.slice(0, -1);                     // 'mounts/patient-acme'
      if (norm === headNoSlash || norm.startsWith(p)) {
        if (p.length > bestLen) { best = m; bestLen = p.length; }
      }
    }
    if (!best) return null;
    const rest = norm === best.prefix.slice(0, -1) ? '' : norm.slice(best.prefix.length);
    return { mount: best, rest };
  }
}
globalThis.KernelMounts = KernelMounts;
```

Tests (`tests/unit/vault_ui/loader/test__kernel_mounts.js`, jsdom-free):
- `resolve('mounts/p/data/x.json')` with mount `mounts/p/` → `rest='data/x.json'`.
- `resolve('mounts/p')` → `rest=''`.
- Longest-prefix: with mounts `mounts/p/` and `mounts/p/deep/`, `resolve('mounts/p/deep/x')` selects
  the deeper one.
- `resolve('local/file.json')` → `null` (local op).
- Normalises traversal (`..`) before matching (uses `AppPermissions.normalizePath` — shipped).

## 3. Sub-step B — `kernel-broker.js`

Exports `globalThis.KernelBroker`. **One instance per kernel.** It is **only** on Edge 2 (version-2
§01 §8). Spec: version-2 §04 §4.6.

```js
class KernelBroker {
  constructor({ kernelId, ui }) {
    this._kernelId = kernelId;
    this._ui       = ui;                       // optional: { prompt({op,mountId,path,credentialClass}) → Promise<'allow'|'deny'> }
    this._policy   = new Map();                // `${mountId}|${capability}` → 'auto' | 'ask' | 'never'
    this._log      = [];                       // BrokerEntry[]
  }

  setPolicy(mountId, capability, value)        { this._policy.set(`${mountId}|${capability}`, value); }

  // Called by the kernel BEFORE relaying a request to a child.
  async mediate(op, mountId, path, credentialClass = 'none') {
    const cap = this._capabilityFor(op);                                // 'fs.read' | 'fs.write' | ...
    const policy = this._policy.get(`${mountId}|${cap}`) || (op === 'read' ? 'auto' : 'ask');
    let decision = 'deny';
    if (policy === 'auto')        decision = 'allow';
    else if (policy === 'never')  decision = 'deny';
    else if (policy === 'ask')    decision = this._ui ? await this._ui.prompt({ op, mountId, path, credentialClass }) : 'deny';
    this._log.push({ ts: Date.now(), edge: `${this._kernelId}▶${mountId}`, mountId, op, path, credentialClass, policy, decision, result: 'pending' });
    return decision;
  }

  // Called by the kernel AFTER the relayed op completes (or fails) to close the log entry.
  finalize(mountId, path, op, result) {
    for (let i = this._log.length - 1; i >= 0; i--) {
      const e = this._log[i];
      if (e.mountId === mountId && e.op === op && e.path === path && e.result === 'pending') { e.result = result; return; }
    }
  }

  log({ mountId } = {}) {
    return mountId ? this._log.filter(e => e.mountId === mountId) : this._log.slice();
  }

  _capabilityFor(op) { return op === 'read' || op === 'list' ? 'fs.read' : op === 'mkdir' ? 'fs.mkdir' : op === 'delete' ? 'fs.delete' : op === 'move' ? 'fs.move' : 'fs.write'; }
}
globalThis.KernelBroker = KernelBroker;
```

Tests: policy defaults, log structure, `mediate` with each policy (`auto` / `ask` answered yes/no /
`never`), `finalize` closes the matching pending entry.

## 4. Sub-step C — `kernel-boot.js` (the state machine)

This is the kernel's lifecycle. It has **two boot sources** (version-2 §3):
- **Origin-boot:** read `#hash` + `localStorage` (only the top kernel ever does this — keeps today's path).
- **Message-boot:** receive `secrets` on the parent channel (every nested kernel).

```js
class Kernel {
  constructor({ kernelId, parentChannel = null }) {
    this._id           = kernelId;
    this._parent       = parentChannel;        // null only for the top kernel
    this._vault        = null;                 // SGVault instance (the existing class)
    this._dataSource   = null;                 // VaultDataSource (existing)
    this._perm         = null;                 // AppPermissions parsed grants (existing)
    this._mounts       = new KernelMounts();
    this._broker       = new KernelBroker({ kernelId, ui: makeBrokerUI() });
    this._appChannel   = null;                 // SecureChannel to its app frame
    this._booted       = false;
  }

  // Top-kernel path — keep today's behaviour
  async bootFromOrigin({ vaultKey, accessToken, deepLink }) {
    if (this._booted) return;
    this._vault     = await SGVault.open(new SGSend({ endpoint: SG_ENDPOINT }), vaultKey);
    this._dataSource = new VaultDataSource(this._vault, accessToken);
    this._perm      = AppPermissions.parsePermissions(await this._readAppJson());
    this._booted    = true;
    await this._mountApp(deepLink);
  }

  // Nested-kernel path — Phase 2's NEW path
  async bootFromMessage({ vaultKey, accessToken }) {
    if (this._booted) return;
    this._vault      = await SGVault.open(new SGSend({ endpoint: SG_ENDPOINT }), vaultKey);
    this._dataSource = new VaultDataSource(this._vault, accessToken);
    this._perm       = AppPermissions.parsePermissions(await this._readAppJson());
    this._booted     = true;
    await this._mountApp(null);
    // Tell the parent we're ready (responder-side event)
    if (this._parent) await this._parent.send('ready', { kernelId: this._id });
  }

  // ── Mount a child vault (Phase 2's product feature) ───────────────────────────
  async mountChild({ prefix, ref, vaultKey, accessToken, label }) {
    // 1. Build the self-contained kernel shell as a srcdoc
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts';                               // null origin
    iframe.style.cssText = 'display:none;';                          // headless mount; UI-mount is Phase 5
    iframe.srcdoc = KERNEL_SHELL_HTML;                               // self-contained, see §6
    document.body.appendChild(iframe);

    // 2. Establish SecureChannel with the child kernel (sensitive — secrets flow)
    const channel = await SecureChannel.create(iframe, { sensitiveKey: true, cid: `ch-${ref}` });

    // 3. Hand the child its two secrets (encrypted)
    await channel.send('secrets', { vaultKey, accessToken });

    // 4. Wait for the child's 'ready' event
    await new Promise(resolve => channel.on('ready', resolve));

    // 5. Register the mount
    const mountId = `m-${ref}`;
    this._mounts.add({ mountId, prefix, ref, channel });
    return { mountId, ref };
  }

  // ── sg.vfs.<op> handler — the heart of the "one primitive" ────────────────────
  async handleVfs(op, { path, data, credential }) {
    const hit = this._mounts.resolve(path);
    if (!hit) {
      // Local op — runs through the shipped policy + data source
      if (op === 'read')   return this._dataSource.getFileBytes(path);
      if (op === 'list')   return this._dataSource.listFolder('/' + path);
      if (op === 'write') {
        // Floor + grant gate (the existing app-permissions checks)
        if (AppPermissions.isFloor('write', path) || !AppPermissions.can(this._perm, 'fs.write', path))
          throw codeError('EPERM', 'no capability');
        return this._dataSource.saveFile('/' + dirname(path), basename(path), data);
      }
      throw codeError('EPERM', 'unknown op');
    }
    // Cross-mount — Edge 2 (relay)
    const credentialClass = credential ? 'perRequest-rw' : 'standing';
    const decision = await this._broker.mediate(op, hit.mount.mountId, hit.rest, credentialClass);
    if (decision !== 'allow') { this._broker.finalize(hit.mount.mountId, hit.rest, op, 'EPERM'); throw codeError('ECONSENT', 'broker denied'); }
    try {
      const result = await hit.mount.channel.request('vfs.' + op, { path: hit.rest, data, credential }, { sensitive: !!data });
      this._broker.finalize(hit.mount.mountId, hit.rest, op, 'ok');
      return result;
    } catch (err) {
      this._broker.finalize(hit.mount.mountId, hit.rest, op, err.code || 'EPROTO');
      throw err;
    }
  }

  // Mount its app (today's _mountApp logic) — passes a port to the app, registers handlers
  async _mountApp(deepLink) {
    // For Phase 2, app-frame stays same-origin (existing iframe with allow-same-origin).
    // The app reaches sg.* via the existing bridge. Phase 3 replaces this with a port.
    setupExistingAppShellBridge(this, deepLink);
  }

  async _readAppJson() { /* existing _readAppJson logic */ }
}
```

> **Don't rewrite the storage / sync / merge code.** `SGVault`, `VaultDataSource`, the sync-merge-publish
> machinery in `sg-vault--sync.js` — all reused **verbatim**. The child kernel writes its own file via
> `dataSource.saveFile` exactly as the standalone app does today; the commit + three-way-merge + publish
> we hardened earlier in this branch handles divergence on the child's branch. This is the big win of
> "a mount is just an app": no cross-mount machinery to invent.

## 5. Sub-step D — wire it into `app-shell.js`

Today `app-shell.js:80-92` reads `#hash`/`localStorage` and constructs the bridge. Refactor minimally:

1. **Replace the inline bootstrap with a top-level `Kernel` instance.** At the existing entry point
   (around the `_init` / `_initWithKey` flow), create `kernel = new Kernel({ kernelId: 'top', parentChannel: null })`
   and call `kernel.bootFromOrigin({ vaultKey, accessToken, deepLink })`. The body of `_mountApp` /
   `_mountVaultFile` etc. becomes the kernel's `_mountApp` — move it in, don't rewrite.

2. **Add the `sg.vault.mount` / `sg.vault.unmount` bridge handlers** (version-2 §4.4):
   ```js
   // in the existing __sgCmd switch (app-shell.js around the vault.* block)
   if (action === 'mount') {
     // policy check: app.json `permissions.vault.mount`-style grant — extend AppPermissions
     if (!AppPermissions.can(self._perm, 'vault.mount', e.data.prefix)) return cmdReply(false, null, 'EPERM');
     // Resolve `ref` to (vaultKey, accessToken) — Scenario 1: console holds the keys in clinic.json
     const { vaultKey, accessToken } = await self._resolveChildCredentials(e.data.ref);
     const m = await kernel.mountChild({ prefix: e.data.prefix, ref: e.data.ref, vaultKey, accessToken, label: e.data.label });
     return cmdReply(true, m);
   }
   ```
   - **`_resolveChildCredentials(ref)`** is the trial-only path: read `clinic.json` (parent's owner
     record), pick the patient's entry, return `{ vaultKey, accessToken }`. Document this as the
     trial-only custody (version-2 §5.6 coupling rule: parent-held child keys + same-origin App-A =
     fine for synthetic data, never real PHI; Phase 3 removes the same-origin part).
   - The cleaner future (Kernel-A holds child keys in an owner-secret tier) sits behind this call —
     same handler, different resolver.

3. **Route existing `vfs.*` handlers through `kernel.handleVfs(...)`** rather than calling the data
   source directly. The existing floor check at `vfs.write` (version-2 §5.1 list) stays — it now lives
   inside `kernel.handleVfs`.

4. **The `sg.vfs.list` response for paths that cross a mount** must include the mount's apparent
   children. Implement via: if `resolve(path)` matches a mount with `rest === ''`, return the mount
   prefix as a folder; otherwise relay `list` to the child kernel.

## 6. Sub-step E — `kernel-shell.html` (the self-contained shell)

The version-2 plan §5.5 calls this out: a `null`-origin document **cannot** cleanly load `<script src>`
subresources — `Origin: null` hits the same CORS wall. The kernel shell delivered into a nested frame
must be **self-contained**.

Build it as **one HTML string** with everything inlined:
```html
<!DOCTYPE html><html><head>
<meta charset="utf-8">
<script>/* app-permissions.js (full source) */</script>
<script>/* secure-channel-envelope.js + secure-channel.js (full source) */</script>
<script>/* sg-vault*.js (full sources: crypto, object-store, ref-manager, commit, file-ops, folder-ops, sync, history, branches, the main vault) */</script>
<script>/* sg-send.js (full source) */</script>
<script>/* vault-data-source.js + composite-data-source.js */</script>
<script>/* vault-links.js (for owner records) */</script>
<script>/* kernel-mounts.js + kernel-broker.js + kernel-boot.js */</script>
<script>/* bootstrap.js: window.message listener for { type:'init' }, grabs port, accepts SecureChannel,
              on 'secrets' calls kernel.bootFromMessage, then handles vfs.* / vault.* requests */</script>
</head><body></body></html>
```

Generate it via a tiny build step (the simplest: a Python script that reads each file and concatenates
into a `KERNEL_SHELL_HTML` constant exported from a generated `_common/js/components/app-shell/kernel-shell-bundle.js`).
Mirrors the existing `_mountPageLayout`'s in-line bundling at `app-shell.js:870-895` (which already
inlines a similar set for the page layout iframe) — same pattern, longer list.

**Test:** load the shell into a `<iframe sandbox="allow-scripts" srcdoc="…">` in a small dev page, send
it `{ type:'init' }` + a port, then `secrets`, and confirm:
- It can decrypt + run `SGVault.open` (the SGVault internals make a `fetch` to the SG/API; this is the
  Phase 0.5 dependency).
- It mounts its app entry (the patient app code).
- It serves `vfs.read`/`vfs.write` requests against the child vault.

## 7. The driving-use-case end-to-end test (the gating check)

Manual / Playwright (the harness can't drive v0.2.3 nested-kernel headlessly):

1. On `dev.vault.sgraph.ai`, open the console vault: `/#<clinician-key>` → `/en-gb/app`.
2. From the console app, call `sg.vault.mount({ prefix: 'mounts/patient-acme/', ref: 'patient-acme', label: 'Alice' })`.
   Confirm the response is `{ mountId, ref }` and that a hidden iframe appears in the DOM.
3. From the console app, call `sg.vfs.write('mounts/patient-acme/data/reviews.json', JSON.stringify(review))`.
4. **Expect the HUD prompt** "App-A asked to WRITE `data/reviews.json` in vault patient-acme — authorise?"
   Click **Allow**.
5. Wait for the promise to resolve. `sg.broker.log()` shows one entry with `decision: 'allow'`, `result: 'ok'`.
6. **Verification:** open the patient vault in another tab, browse to `data/reviews.json` — the review
   bytes match.
7. Reload the console tab — it still opens the **console** vault (not the patient one). This proves the
   session-clobber bug is gone (version-2 §2 "every route fails today" table).

## 8. What can break in this phase (and how an agent fixes it)

- **Apps that hard-code reads outside `mounts/`** continue to work — local ops are unchanged. Only the
  cross-mount path is new; existing apps don't see it unless they call it.
- **CSS/UI may shift slightly** if the broker prompt is rendered in the HUD — confirm against
  `app-hud.js`'s consent-bar styling from the Phase 4A shipped work (it reuses the same slot).
- **`clinic.json` schema:** if the trial's parent vault doesn't already have a per-patient credential
  map, add one (`{"patient-acme":{"vaultKey":"…","accessToken":"…"}}`) — document this in the trial's
  app README.

## 9. Commit hygiene

Commit per sub-step (A → B → C → D → E) so each can be reverted independently if E breaks:
```
feat(viv): Phase 2 sub-step A — KernelMounts path resolution + tests
feat(viv): Phase 2 sub-step B — KernelBroker (per-kernel sidecar) + tests
feat(viv): Phase 2 sub-step C — Kernel boot state machine (origin + message)
feat(viv): Phase 2 sub-step D — wire sg.vault.mount + relay through Kernel.handleVfs
feat(viv): Phase 2 sub-step E — self-contained kernel-shell bundle for nested srcdoc
```

After E lands and the §7 manual check is green, write the changelog (`team/comms/changelog/05/28/v0.28.7__changelog__viv-phase-2.md`) classifying which tests should/shouldn't have broken.

## 10. Hand-off to Phase 3

Phase 3 (`null`-origin standalone app + bridge split) is now mechanical:
- The kernel is already factored out (Phase 2 sub-step C).
- The 4 sandbox sites in `app-shell.js` (version-2 §5.1) lose `allow-same-origin`.
- The remaining inline bridge becomes the secret-less stub (a thin shim over a `SecureChannel.request`).
- The parity list (version-2 §5.4) is the explicit checklist.

It's recommended to land Phase 3 before doing real-PHI work even on the parent vault, because the
coupling rule (version-2 §5.6) makes parent-held child keys + same-origin App-A unsafe for real data.
