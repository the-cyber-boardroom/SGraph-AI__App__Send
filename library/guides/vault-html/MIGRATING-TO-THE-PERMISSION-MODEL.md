# Migrating vault apps to the permission model

**Audience:** agents (and humans) authoring or maintaining HTML apps that run inside a vault.
**Status:** the permission model (Phases 1–4B) is live in `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3`.
**See also:** [`AUTHORING.md`](AUTHORING.md) (the `window.sg.*` bridge), and the spec/plan in
`team/roles/architect/reviews/05/27/` and `team/roles/dev/reviews/05/27/`.

---

## TL;DR — the one change that breaks existing apps

**Writes are now deny-by-default.** An app that calls `sg.vfs.write` / `sg.fs.*` with **no
`permissions` block** in its `app.json` now gets `EPERM`. To migrate a writable app, add:

```json
{ "entry": "index.html", "permissions": { "fs": { "write": true } } }
```

Reads still work without any declaration **for now** (see "What's coming" below). Read-only apps need
no change.

`app.json` is edited through the **Vault (browse) UI** or `sgit` — **not** from inside the app
(the app can't write its own manifest; that's the security floor).

---

## What changed, and why your app might behave differently

| Behaviour | Before | Now |
|---|---|---|
| `sg.vfs.read` / `list` | allowed | **still allowed by default** (floor applies) |
| `sg.vfs.write` | allowed (if vault writable) | **denied** unless `fs.write` is granted → `EPERM` |
| `sg.fs.move/delete/mkdir` | did not exist | **new** — require `fs.move`/`fs.delete`/`fs.mkdir` |
| `sg.vault.create/unlink` | did not exist | **new** — require `vault.create`/`vault.unlink` (create also prompts the user) |
| read/write `.vault/**`, write root `app.json` | allowed | **always denied** (`EPROTECTED`) — non-grantable |
| listing `.vault/**` | visible | hidden from `sg.vfs.list` |

Two independent gates apply to every write/mutation: the **server access token** (the vault must be
writable — same as before) **and** the **`app.json` grant** (new). Both are required.

---

## The `permissions` block

Lives in `app.json` (`.vault/app.json` preferred, legacy root `app.json` still read):

```json
{
  "entry": "index.html",
  "permissions": {
    "fs":    { "read": true, "write": ["data/"], "move": ["data/"], "delete": ["data/"], "mkdir": ["data/"] },
    "vault": { "create": ["runs/"], "unlink": ["runs/"], "delete": false }
  }
}
```

Each permission is **`true | false | string[]`**:
- `true` — allowed vault-wide (still subject to the floor).
- `false` / omitted — denied (reads are the one default-allow exception, for now).
- `["data/", "out/result.json"]` — allowed only for matching paths. **Trailing `/` = folder prefix**
  (`data/` matches `data` and everything under it); **no slash = exact file**.

Verb → permission key:

| Bridge call | Permission | Notes |
|---|---|---|
| `sg.vfs.read` / `list` | `fs.read` | default-allow today |
| `sg.vfs.write` | `fs.write` | **declare this to migrate a writable app** |
| `sg.fs.move(from,to)` | `fs.move` | needs the grant on **both** paths |
| `sg.fs.delete(path)` | `fs.delete` | |
| `sg.fs.mkdir(path)` | `fs.mkdir` | |
| `sg.vault.create(path,label)` | `vault.create` | + one-time user consent on the HUD |
| `sg.vault.unlink(path)` | `vault.unlink` | reversible (child stays on server) |
| `sg.vault.delete(path)` | `vault.delete` | **not available yet** — returns `ENOTIMPL` |

`app.json` is a **hard ceiling**: an app can only ever do what its manifest declares. `sg.ui.requestPermission(verb, path)`
surfaces a consent prompt for a declared, consent-gated verb (create) at runtime — it cannot grant a
verb the manifest didn't list (that returns `EPERM`).

---

## The floor — what no app can ever do (and never could be granted)

- **Read/list/navigate `.vault/**`** → `EPROTECTED`. (It holds secrets, incl. a possible embedded
  access token in `.vault/app.json`.)
- **Write `.vault/**` or the legacy root `app.json`** → `EPROTECTED`. (The manifest *is* the grant;
  letting an app edit it would defeat the model.)

If your app was reaching into `.vault/` for anything, it must stop — surface the data another way.

---

## Migration checklist (per app)

1. **Does the app write?** If it calls `sg.vfs.write` (or wants move/delete/mkdir), add a `permissions`
   block with the matching `fs.*` grants. Prefer **scoped arrays** (`["data/"]`) over `true`.
2. **Does it touch `.vault/` or `app.json`?** Remove that — it's blocked by the floor.
3. **Handle the new errors.** Bridge rejections now carry a `code`: `EPERM` (not granted),
   `EPROTECTED` (floor), `ECONSENT` (user declined). Legacy `sg.vfs.*` still also returns the
   `"Read-only vault"` string when the vault has no access token — that path is unchanged.
4. **Edit `app.json` via the Vault UI / `sgit`**, not from the app. Commit + publish so a freshly-synced
   session sees the new manifest.
5. **Opt into new capabilities** only as needed (`vault.create` for "spawn a child vault per run/record",
   etc.). `create` will prompt the user once on the HUD; `delete` is not available yet.

### Before / after

```jsonc
// BEFORE — worked because writes were open
{ "entry": "form.html" }

// AFTER — declare what the app needs
{ "entry": "form.html", "permissions": { "fs": { "write": ["responses/"] } } }
```

---

## What's coming (don't be caught out)

- **Reads will become deny-by-default** in a later step (uniform model). To be safe **now**, apps that
  read at runtime should already declare `fs.read` (e.g. `"read": true` or a scoped array). Apps that
  only declare writes today will need `fs.read` added before that flip.
- **`vault.delete`** (server-side destroy) is deferred — it needs an owner-secret credential store and
  AppSec sign-off. Use `vault.unlink` (reversible) until then.

---

## Quick reference: a writable, vault-spawning app

```json
{
  "title": "Run Manager",
  "entry": "index.html",
  "permissions": {
    "fs":    { "read": true, "write": ["runs/"], "mkdir": ["runs/"], "delete": ["runs/"] },
    "vault": { "create": ["runs/"], "unlink": ["runs/"] }
  }
}
```

```js
await sg.fs.mkdir('runs/2026-05-27');
await sg.vfs.write('runs/2026-05-27/input.json', JSON.stringify(data));
const r = await sg.vault.create('runs/2026-05-27', 'Run output');   // user is asked once on the HUD
// r → { vault_id, ref_id, ref_file_id }
```
