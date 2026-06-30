# Hosting a vault (and its apps) on static storage — GitHub Pages / S3

**The same vault-app HTML runs against the live FastAPI backend OR a 100% static file
host, transparently.** The app never knows which — it only talks to `window.sg`, and the
only layer that differs is the HTTP transport. This guide is the contract for serving a
vault from static storage.

**Status:** the one code change this needs (static batch reads) is **SHIPPED** in
`sg-send.js` (`SGSend.staticMode`). It's opt-in and default-off, so live vaults are
unaffected.

---

## TL;DR

1. **Reads are plain GETs to deterministic paths.** Everything needed to open and browse a
   vault is a GET to `/<base>/api/vault/read/<vaultId>/<filePath>`. The file IDs (commits,
   trees, refs, indexes) are content hashes or HMACs of the key — **computed client-side**,
   **no discovery/list call**. So a static host that serves those exact paths just works.
2. **Writes need the API.** A static host is read-only. Open the vault with **no access
   token** → `sg.app.writable === false`; a well-behaved app already branches on that.
3. **Turn it on with one global:** `window.SG_STATIC = true` (+ point `window.SG_ENDPOINT`
   at your static base). That makes `SGSend` fan batch-reads out to individual GETs and
   reject writes cleanly. Nothing else changes.
4. **One codebase:** import the host + transport from `https://dev.vault.sgraph.ai/...`;
   keep the app HTML in the vault; put only the encrypted `bare/` tree on your static host.

---

## The two layers (why the app is portable)

| Layer | What it is | Where |
|---|---|---|
| **Bridge** (`window.sg`) | the API the app calls (`sg.vfs.read`, `sg.app.writable`, …) | **injected** by the host (`app-shell.js` for `/en-gb/app/`; `send-browse` for the file viewer). Not a standalone file. |
| **Transport** (`SGSend`) | the thing that does the HTTP (`vaultRead` GET, `vaultWrite` PUT, `vaultBatch` POST, …) | `dev.vault.sgraph.ai/_common/js/lib/sg-send/sg-send.js` (+ `sg-vault-object-store.js`, `sg-vault*`, `vault-data-source.js`, crypto). **Importable — your single codebase.** |

The app is written against the **bridge** and is transport-agnostic. Static vs live is
entirely a property of the **transport's** endpoint + `staticMode`. That's the whole trick.

(Full `sg.*` reference: `library/guides/vault-html/AUTHORING.md` → "The runtime API:
`window.sg`".)

---

## What works statically — and what doesn't

| Call | HTTP | Static? |
|---|---|---|
| `sg.vfs.read` / `readText` / `list`, open, browse, history | `GET /api/vault/read/<vaultId>/<filePath>` | ✅ |
| large reads (`vaultReadLarge`) | presigned (API) → **falls back to GET** | ✅ |
| **batch reads** (loading many objects at once) | was `POST /api/vault/batch` | ✅ **now fans out to GETs in static mode** |
| `sg.vfs.write` / `sg.fs.*` / delete / `sg.append.*` / create-vault | PUT/POST/DELETE | ❌ read-only (rejected with `EREADONLY`) |

So a static vault is a **read-only snapshot** — perfect for published docs, dashboards,
reports, "view-only" patient/clinic views, etc. Anything that needs to persist a change
needs the live API.

---

## How to enable it

### 1. Tell the transport it's static

On the hosting page (or before the host boots):

```html
<script>
  window.SG_STATIC   = true;                         // batch reads → GETs; writes → EREADONLY
  window.SG_ENDPOINT = 'https://my-org.github.io/my-vault';   // your static base (no trailing slash)
</script>
```

`SG_STATIC=true` flips every `SGSend` instance to static mode (read it in the constructor —
no need to thread a flag anywhere). `SG_ENDPOINT` is the base the read GETs are built from.

### 2. Open read-only (no access token)

A static host can't take writes, so open the vault **without** an access token. The vault
reports `dataSource.writable = false` → the bridge surfaces `sg.app.writable = false` and
rejects any write with `EREADONLY` before it ever hits the network. A correct app already
does:

```js
if (!sg.app.writable) { /* hide editing UI, render read-only */ }
```

…so the **same HTML** runs read-only with zero changes.

### 3. Lay the files out to match the GET paths

The live API serves `GET /api/vault/read/<vaultId>/<filePath>` by returning the bytes stored
at `<filePath>` (the vault's `bare/` tree). To host statically, **publish that tree at the
same path** under your base:

```
<repo root>/                          → served at https://my-org.github.io/my-vault/
└── api/
    └── vault/
        └── read/
            └── <vaultId>/
                └── bare/
                    ├── data/        obj-cas-imm-*   (commits, trees, blobs — immutable)
                    ├── refs/        ref-pid-muw-*   (published head — mutable)
                    ├── indexes/     idx-pid-muw-*   (branch index — mutable)
                    └── keys/        key-rnd-imm-*   (PKI public keys, if any)
```

The file IDs are deterministic from the key (content hashes / HMACs), so the client knows
exactly which files to GET — **no manifest, no listing**. Producing this tree is just an
export of the vault's `bare/` storage (e.g. `aws s3 sync` from the live bucket, or a
publish step in CI). Path-mirroring is the one hard requirement: the static paths must equal
the API GET paths **exactly**.

### 4. (Optional) Cache headers

For best behaviour, serve immutable objects (`obj-cas-imm-*`, `key-rnd-imm-*`) with
`Cache-Control: public, max-age=31536000, immutable`, and the mutable ref/index
(`ref-pid-*`, `idx-pid-*`) with `no-store` (or a short max-age). GitHub Pages sets a short
default cache; S3/CloudFront lets you set this per-prefix. This matters because the ref is
the "current head" — a stale ref shows an old snapshot.

---

## Worked example — GitHub Pages

1. **Author the vault** normally (live), put your app HTML in it as `index.html`, push.
2. **Export the `bare/` tree** to a Pages repo at `api/vault/read/<vaultId>/bare/...`.
3. **Add a host page** `index.html` at the repo root that loads the host + transport from
   `dev.vault.sgraph.ai`, sets `SG_STATIC`/`SG_ENDPOINT`, and opens the vault read-only with
   the key (in the URL hash, as usual — the key is the read capability; it's not a secret on
   a published read-only snapshot, but treat it like a share token).
4. Visitors open `https://my-org.github.io/my-vault/#<key>` → the host boots → the transport
   GETs the encrypted files from Pages → decrypts in the browser → renders the app. No
   backend, no server, fully zero-knowledge (the bytes on Pages are ciphertext).

The exact same key opened against `https://dev.vault.sgraph.ai` hits the FastAPI and (with a
token) is writable. **Same app, two backends.**

---

## What the static-mode code change actually does (for the platform team)

`SGSend.staticMode` (default **false** → live behaviour byte-identical):

- **`vaultBatch`** — in static mode, if every op is `op:'read'` it fans out to parallel
  `vaultRead` GETs and returns the **identical result shape** (`[{status, file_id, data}]`,
  `data` base64) the POST `/batch` returns, so `SGVaultObjectStore.batchLoad` and any other
  caller need **zero changes**. A write op in a static batch throws `EREADONLY`.
- **`vaultWrite` / `vaultDelete`** — throw `EREADONLY` immediately (no opaque 405/404).
- **`vaultReadLarge`** — skips the presigned API call, goes straight to the GET read.
- The flag is read in the constructor from `{staticMode}` or `window.SG_STATIC`, so no
  construction site changed.

Tests: `tests/unit/vault_ui/loader/test__sgsend_static_mode.js` (12 — fan-out shape, write
rejection, flag inheritance, **non-static regression guard**). `sg-send.js` is in the kernel
bundle → regenerated.

---

## Limitations & honest caveats

- **Read-only.** No writes, no `sg.append.*`, no vault creation. If you need any of those for
  some users, those users open the **live** endpoint (with a token); the static snapshot is a
  separate, view-only deployment.
- **Snapshot, not live.** The static `bare/` tree is frozen at export time. New commits on
  the live vault don't appear until you re-export. The UI's "check for updates" just re-GETs
  the (frozen) ref and reports up-to-date.
- **Path mirroring is exact.** If your static layout doesn't match `/api/vault/read/<vaultId>/<filePath>`,
  reads 404. (A future option: a configurable read-path template on `SGSend` so the layout
  can differ — not shipped; ask if you want it.)
- **CORS:** if the host page and the static files are on different origins, the static host
  must send permissive CORS for GET (`Access-Control-Allow-Origin`). Same-origin (host page +
  files on the same Pages site) needs nothing.
- **The key is the read capability.** On a published read-only snapshot anyone with the URL
  can read it (that's the point), but it's still end-to-end encrypted at rest — the static
  host only ever holds ciphertext.

---

## Checklist

- [ ] `window.SG_STATIC = true` and `window.SG_ENDPOINT = '<static base>'` set before the host boots.
- [ ] Vault opened **without** an access token (read-only).
- [ ] `bare/` tree published at `<base>/api/vault/read/<vaultId>/bare/...` (paths match exactly).
- [ ] Immutable objects cached long; ref/index `no-store` (or short).
- [ ] CORS set if host page and files are cross-origin.
- [ ] App branches on `sg.app.writable` (hides editing UI when read-only).
