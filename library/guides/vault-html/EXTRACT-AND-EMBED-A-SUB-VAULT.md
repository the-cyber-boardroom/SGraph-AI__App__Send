# Extracting a folder into a new vault, and embedding it back into your app

**Audience:** agents (and humans) building a vault-html app that needs to split part of its
content out into its own vault, then bring that vault back into the parent app's UI.
**Grounded against:** `app-shell.js`, `app-permissions.js`, `kernel-parent.js`, `kernel-mounts.js`,
`kernel-broker.js`, `viv-custody.js` (v0.2.3), cross-checked against `reality/vault/index.md` and the
ViV architecture briefings in `team/roles/architect/reviews/05/27/` and
`team/humans/dinis_cruz/briefs/05/27/vault-in-vault/version-2/`.
**Status:** two of the three techniques below are production-shipped and safe to build on today.
The third — `sg.vault.mount` ("ViV" proper) — is real, live infrastructure with genuine security
hardening, but its credential-resolution wiring is **explicitly a trial-only stub** in the current
code. Read §4 before reaching for it.

---

## The shape of the problem

You have a vault (and maybe a vault app) with a folder you want to pull out into its **own**
vault — a separate encryption boundary, its own key, its own lifecycle — and then make that new
vault appear **inside** the original app again, rather than as a totally separate, disconnected
thing the user has to go find.

This is two steps, and the codebase has one clean primitive for the first and **three** different
techniques for the second, each with different tradeoffs:

```
Step 1 — EXTRACT           Step 2 — EMBED (pick one)
┌─────────────┐            ┌───────────────────────────────────────────────┐
│ parent vault │           │ A. Sub-vault link — read-only, inline in the   │
│  folder/     │──create──▶│    parent's file tree, no separate UI          │
│    file.json │  +seed    │ B. sg.vault.embed — the child's OWN app,       │
└─────────────┘            │    rendered live in an iframe panel            │
      │                    │ C. sg.vault.mount — transparent cross-vault    │
      └── new vault ───────┤    sg.vfs.* read/write via a path prefix       │
          (own key)        │    (the literal "ViV" architecture) — CAVEATS  │
                            └───────────────────────────────────────────────┘
```

Which one you want depends on what "embedded" means for your use case:

| You want… | Use |
|---|---|
| The extracted content to still show up as files the user can browse, read-only | **A — sub-vault link** |
| The extracted vault to have its **own app** (its own UI, its own logic) and show that app live inside your app, in a panel | **B — `sg.vault.embed`** |
| Your app's own code to keep calling `sg.vfs.read`/`write` against paths that now live in a different vault, transparently — no second app, no iframe | **C — `sg.vault.mount`** (read today; write is real but under-resourced for general use — see §4) |

Most "extract a folder into its own vault" use cases want **A** (if the split is really just an
access-control boundary — "this sub-tree should have its own key so I can share it independently")
or **B** (if the sub-tree is itself a little app you want to keep addressable, updatable, and
shareable on its own, while still surfacing it inside the parent experience — e.g. a portfolio
vault embedding a project vault's own report app). Reach for **C** only when you specifically need
transparent file-level access across the boundary without standing up a second UI — and read the
maturity caveat first.

---

## Step 1 — Extract a folder into a new vault

One call does this, from inside the **parent** app:

```js
const result = await sg.vault.create({
  label:      'Q3 Report',            // the new vault's display name
  seedFrom:   'self:reports/q3',      // copy THIS vault's reports/q3/ folder into the new vault
  returnKey:  true,                   // get back the raw key (needed for technique B)
  custody:    true,                   // (default) kernel also custodies the key for you — see below
  link:       { path: 'sub/q3-report' }, // ALSO create a sub-vault link at this path (technique A) — omit to skip
  accessToken: undefined              // omit unless you want the new vault to open pre-authorised for writes
});
// → { vault_id, ref_id, key: 'passphrase:vault_id', ref_file_id, writable_link }
```

What actually happens (`_createChildVault` in `app-shell.js`):

1. A brand-new vault is created with a strong, randomly generated passphrase (never a Simple Token).
2. **`seedFrom: 'self:<path>'`** walks that folder in the **current** vault and copies every file into
   the new vault — this is the "extract." The walk **always skips any `.vault/**` segment**, so a
   template/extract copy can never carry the parent's owner secrets, access tokens, or link records
   into the child. (Other `seedFrom` forms exist too: a `ref_id` of an already-custodied/linked
   vault, or a raw `key` string containing `:` — "seed from a vault I already have by possession.")
3. The seed is **pushed** to the child's named ref immediately, so the new vault is visible to
   anyone who opens it, not just sitting in a local clone.
4. If `custody: true` (the default), the kernel stores `{vault_id, key, label}` for you, sealed
   under the parent vault's write-key-derived owner-secret store at `.vault/owner/secrets/`. This
   is what lets you (or another consenting call) fetch the key back later via `sg.vault.getKey(ref)`
   without your app ever having to persist it itself.
5. If `link: {path}` is given, **this single call also does technique A for you** — it writes the
   `<slug>.link.json` pointer file at that path in the parent vault AND the corresponding read-only
   owner record (`.vault/owner/ro-links.json`), so the extracted content immediately reappears as a
   browsable folder at `sub/q3-report/` in the parent. See §2 if you want to understand or do this
   step manually (e.g. linking a vault you didn't just create).
6. If `returnKey: true`, the composed openable key (`passphrase:vault_id`) comes back directly —
   you need this for technique B (`sg.vault.embed`), since embed takes a raw key, not a ref.

**Permission required** — `app.json`:

```json
{ "permissions": { "vault": { "create": true } } }
```

Use `"createKey": [...]` instead of `"create"` if you specifically need `returnKey`/`getKey` — it's
modelled as a **stronger**, separately-grantable permission than plain `create`, because handing the
raw key back to app code is a bigger trust step than just spawning a vault the kernel custodies.
`"seedFrom"` is its own grant too (a path/ref allow-list of what may be used as a seed source) —
without it, `seedFrom` is silently denied and you get an empty vault (the create still succeeds;
only the copy is skipped — check the vault isn't empty after, or watch the console warning
`[app-shell] seedFrom failed:`).

A minimal grant set for "extract `reports/**` into new vaults, and read the key back":

```json
{
  "permissions": {
    "vault": {
      "create":    true,
      "createKey": true,
      "seedFrom":  ["reports/"]
    }
  }
}
```

**Consent:** vault creation is HUD-consent-gated by default (the user sees a confirmation before
the first `vault.create` call succeeds, then it's cached per (vault, app, verb) unless you set
`permissions.consent["vault.create"]: "auto"` to skip re-asking a trusted app's own users).

---

## 2 · Technique A — sub-vault link (read-only, inline)

If you passed `link: {path}` in Step 1, you're already done — skip to "using it." To link a vault
you *didn't* just create (or to understand what `create`'s `link` option did for you), the full
mechanics are in [`SUB-VAULTS-AND-LINKS.md`](./SUB-VAULTS-AND-LINKS.md); the short version:

- Write a `<name>.link.json` file anywhere in the parent tree: `{ "vault_id": "...", "ref_id": "lk-...", "label": "..." }`.
- For it to open silently on any device (not just prompt the user for the child's key once per
  device), also write an entry into `.vault/owner/ro-links.json` keyed by that same `ref_id`,
  containing the child's **read key only** — never its write key.
- `sg.vault.create({..., link: {path}})` does both of these for you in one call, using the key it
  just generated — this is the common case and needs no manual derivation.

**Using it:** nothing app-specific — the linked vault appears as an **expandable folder** at
`sub/q3-report/` in the parent's file tree, and your app reads into it exactly like any other path:

```js
const txt = await sg.vfs.readText('sub/q3-report/summary.md');
const files = await sg.vfs.list('sub/q3-report');
```

No extra permission grant needed beyond your normal `fs.read` (see the earlier note in this repo's
docs that reads are default-allow today but will flip to deny-by-default later — scope `fs.read`
if you want this to keep working unchanged after that flip).

**Limits:** read-only in this version (a write to a sub-vault path is rejected). The linked vault's
own `app.json`/UI is irrelevant here — you're reading its files as data, not running its app.

---

## 3 · Technique B — `sg.vault.embed` (render the child's own app, live)

Use this when the extracted vault has (or will have) **its own `index.html`/`app.json`** and you
want that experience to show up live, inside a panel of your app — the "doctor console opens each
patient's own app" pattern.

```html
<div id="report-pane" style="width:100%; height:600px;"></div>
<script>
  const info = await sg.vault.embed(
    document.getElementById('report-pane'),
    childKey,                       // the raw 'passphrase:vault_id' from Step 1's returnKey
    { surface: 'app' }              // 'app' runs the child's own app; 'vault' (file browser) is a planned follow-on
  );
  // info → { vaultName, fileCount, hasApp, iframe }
</script>
```

What this actually does (`_embedVault`, `SgEmbed` helpers): creates an iframe, runs a `postMessage`
handshake that hands the child vault's key over **without ever putting it in the iframe's `src` URL
or in any storage**, and resolves once the embedded vault is interactive. The iframe is sandboxed
with **`allow-scripts` only** — the host refuses to grant `allow-same-origin` (would let the
embedded vault read your app's storage/DOM) or `allow-popups-to-escape-sandbox` (would let content
*authored by whoever shared that vault* open an unsandboxed window) **even if you ask for them**.
If a specific in-vault action genuinely needs more, add the narrowest extra token via
`opts.sandbox` (`['downloads']`, `['popups']`, `['modals']`) — never the escape token.

**Permission required:** none beyond having the key in hand — `sg.vault.embed` isn't gated by an
`app.json` grant the way create/mount are, because you already had to legitimately obtain the raw
key (via `returnKey`/`getKey`, both of which *are* gated) to call it at all. The key is the
capability.

**Getting the key later** (you didn't keep it from Step 1, or you're embedding a vault you created
in a previous session): `sg.vault.getKey(ref)` — re-shares a custodied key. This is treated as
powerful as `createKey`, so it **always re-confirms** via the HUD consent overlay, never cached,
regardless of your app's consent policy for other verbs.

```js
const { key } = await sg.vault.getKey(myStoredRefId);
await sg.vault.embed(pane, key, { surface: 'app' });
```

Always keep a plain `<a href="…" target="_blank">` "Open in new tab" fallback pointing at the same
key — some hosting contexts block framing entirely (CSP), and `sg.vault.embed` has no server-side
fallback for that.

---

## 4 · Technique C — `sg.vault.mount` (the literal "ViV" architecture) — read this before using it

This is what "vault-in-vault" refers to as an internal architecture name: an **isolated child
kernel**, spawned by your app, holding the child vault's own secrets, reachable over an
authenticated channel — so `sg.vfs.read`/`write` calls that cross a mounted path prefix get
**relayed kernel-to-kernel** to the child, which performs the operation under **its own**
`app.json` permission grant. Your app never gets cross-vault write authority itself; the child
vault effectively "writes to itself" on your behalf, through a broker-mediated relay.

```js
const { mountId } = await sg.vault.mount({
  prefix: 'sub/q3-report',   // path prefix in YOUR app's namespace
  ref:    myRefId,           // the ref_id from Step 1 (or however you're tracking the child)
  label:  'Q3 Report'
});

// From here, paths under the prefix transparently relay to the child vault:
await sg.vfs.readText('sub/q3-report/summary.md');   // relayed read
await sg.vfs.write('sub/q3-report/notes.md', text);  // relayed write, if the child's OWN app.json allows it

await sg.vault.unmount(mountId);
```

**Permission required:**
```json
{ "permissions": { "vault": { "mount": ["sub/"] } } }
```

**This is real, hardened infrastructure — not a prototype.** The relay path (`KernelParent.relay`)
runs every cross-mount call through: a custody gate (`viv-custody.js` — refuses spawning a child
with parent-held credentials inside a same-origin app frame, unless explicitly allowed for
synthetic-data trials), a credential-tier gate (`viv-credential-tiers.js` — refuses destructive
verbs like write without a per-request elevated credential, so a "standing" mount alone cannot
silently write), and a broker (`kernel-broker.js` — mediates allow/deny, with an audit log that
outlives the mount, and can prompt the user via the HUD for "ask" policy). App frames are
`allow-scripts allow-forms` (no `allow-same-origin`), so a null-origin App-A genuinely cannot read
the parent kernel's secrets even if it tried.

**But — the part you need to know before you build on this.** `mount()`'s credential resolver — the
function that turns a `ref` into the child's actual key — is, in the currently shipped code,
explicitly commented as a **"Trial-only stub"**: by default it reads a `clinic.json` file at the
vault root shaped `{ [ref]: { vaultKey: '...' } }`. It does **not**, by default, consult the
owner-secret store that `sg.vault.create({custody:true})` writes to. Two consequences:

1. **Out of the box, `sg.vault.mount(ref)` will fail to resolve credentials** for a vault you just
   created with `sg.vault.create` unless you *also* maintain your own `clinic.json`-shaped mapping
   file with the child's raw key in it — which is itself a weaker posture than the owner-secret
   store (sealed, write-key-derived) that `create` already gives you for free.
2. The code's own comment names the "real production" design as still pending: *"Kernel-A holds
   them (port-transfer model) — App-A facilitates the connection but cannot read the secrets."*
   That's not shipped yet; today, credential resolution is delegated to whatever
   `_resolveChildCredentialsImpl` the hosting app supplies (or the clinic.json stub if it supplies
   nothing).

**Practical guidance:** if you need transparent cross-vault reads today, prefer **technique A**
(sub-vault link) — it's read-only, but the credential path (the read-tier `ro-links.json` record)
is production-grade, not a trial stub. If you need transparent cross-vault **writes** without
standing up a second app UI, `sg.vault.mount` is the architecturally correct answer and the relay
security model is solid — but you'll need to either supply your own credential resolver
(`_resolveChildCredentialsImpl`, if your hosting context exposes that hook) or accept the
`clinic.json`-shaped convention as-is, knowing it's flagged as trial-only. Ask Dev/Architect before
shipping this to real users; this is exactly the kind of thing worth a direct "is the production
credential path ready yet?" question rather than assuming either way from this doc.

---

## 5 · Putting it together — extract + embed, worked example

Extract `reports/q3/` into its own vault, link it so it's browsable, embed its live app in a panel,
and keep the key around for next time:

```js
// 1. Extract + link (technique A happens for free via `link`)
const created = await sg.vault.create({
  label:     'Q3 Report',
  seedFrom:  'self:reports/q3',
  returnKey: true,
  link:      { path: 'sub/q3-report' }
});

// Stash the ref so a later session can re-fetch the key via getKey() instead of
// keeping the raw key in app state. sg.state is device-local and fine for this —
// it's not the secret itself, just a pointer to a kernel-custodied secret.
await sg.state.set('q3-report-ref', created.ref_id);

// 2a. Right now: embed the child's own app live (technique B), using the key we already have
await sg.vault.embed(document.getElementById('report-pane'), created.key, { surface: 'app' });

// 2b. Later session: no raw key in hand, re-fetch it (always re-confirms via HUD)
const ref = await sg.state.get('q3-report-ref');
const { key } = await sg.vault.getKey(ref);
await sg.vault.embed(document.getElementById('report-pane'), key, { surface: 'app' });

// 3. Meanwhile, technique A still works independently — read the extracted files as plain data,
//    no key handling needed at all, e.g. for a summary card without loading the whole embedded app:
const summary = await sg.vfs.readText('sub/q3-report/summary.md');
```

`app.json` for this example:

```json
{
  "permissions": {
    "vault": { "create": true, "createKey": true, "seedFrom": ["reports/"] }
  }
}
```

(No grant needed for `embed` itself or for reading `sub/q3-report/**` — those ride on possessing
the key and the default-allow `fs.read`, respectively, per the notes in each section above.)

---

## 6 · Security notes

- **`seedFrom` cannot exfiltrate `.vault/**`** — the tree walk skips any path segment named
  `.vault`, so extracting a folder can never accidentally carry the parent's owner secrets,
  embedded access tokens, or link records into the new (possibly more widely shared) child vault.
- **`custody: true` is the default for a reason** — it's the difference between the kernel holding
  the new vault's key for you (sealed, re-shareable only through a re-confirming `getKey` call) and
  your app having to invent its own place to remember a raw secret. Prefer it; only skip custody if
  you're immediately handing the key to the user and never need it back programmatically.
- **`getKey` and `createKey` always re-confirm** — by design, this can't be silenced with
  `permissions.consent`, unlike most other verbs. Don't build a UI that assumes it can fetch the
  key silently in a loop.
- **`sg.vault.embed`'s sandbox refusals (`allow-same-origin`, `allow-popups-to-escape-sandbox`) are
  non-negotiable even via `opts.sandbox`** — don't file a bug asking for them; they're refused by
  design because the embedded content is authored by whoever the child vault's key was shared with,
  not by you.
- **A read-only sub-vault link's owner record (`ro-links.json`) holds the child's read key in
  plaintext-once-decrypted form**, same as any other vault file — readable by anyone with read
  access to the parent. That's intentional (it's what makes the link portable/silent), but it means
  "extract into a new vault and link it" is not a stronger access boundary than the parent's own
  read access — treat the split as an *organisational* boundary (separate lifecycle, separate
  sharing, separate history) rather than a *confidentiality* boundary from the parent's own readers.
  If you need the extracted content to be unreadable to some parent-vault readers, don't link it —
  hand out the child's key out-of-band instead, to only the people who should have it.

---

## References

- [`AUTHORING.md`](./AUTHORING.md) — full `window.sg` API reference (`vault.create`, `vault.embed`, `vault.mount`, `vault.getKey`, etc.), "Reading other vaults (sub-vaults)", "Embedding another vault inside your app".
- [`SUB-VAULTS-AND-LINKS.md`](./SUB-VAULTS-AND-LINKS.md) — the `*.link.json` / `ro-links.json` file formats in full, for linking a vault you didn't create via `sg.vault.create`.
- [`MIGRATING-TO-THE-PERMISSION-MODEL.md`](./MIGRATING-TO-THE-PERMISSION-MODEL.md) — the `vault.*` permission grants (`create`, `createKey`, `seedFrom`, `unlink`, `mount`, `delete`) in the wider deny-by-default context.
- `team/humans/dinis_cruz/briefs/05/27/vault-in-vault/version-2/` — the current ViV architecture design (supersedes the original v0.27.79 briefing; read this if you're extending `sg.vault.mount` itself, not just consuming it).
- `team/roles/dev/reviews/05/28/viv-implementation/` — the phase-by-phase implementation notes behind `kernel-parent.js`/`kernel-broker.js`/`viv-custody.js`.
