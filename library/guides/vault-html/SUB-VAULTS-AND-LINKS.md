# Creating vaults-in-vaults and external-resource links (`*.link.json`)

This guide is for **setting up** a vault-of-vaults (and external-resource embeds) by writing files
into a vault — e.g. from `sgit`, from a Claude session, or by hand. It documents the exact file
formats. The companion user guide (`library/guides/content/v0.27.62__guide__vault-in-vaults.md`)
covers the end-user experience; [`AUTHORING.md`](./AUTHORING.md) covers reading these from an app's
`sg.vfs` / `sg.history`.

> **It really is "just create some files."** A sub-vault or an embed is a small JSON pointer file in
> the vault tree, plus (optionally) one record file under `.vault/owner/`. No special API — write the
> files, `sgit commit`, `sgit push`.

---

## 1. The link file — `*.link.json` (in the regular tree)

Any file whose name ends in **`.link.json`** is treated as a link by the vault UI. The name prefix
is a free label (`patient-alice.link.json`, `intro-video.link.json`); rename it off the suffix and
it's an ordinary `.json` again. **A link file holds no key** — only public ids.

### A sub-vault (links to another vault)

```json
{
  "vault_id": "75f1c88be33d",
  "ref_id": "lk-37939d3b9b1a",
  "label": "PoC | SG/Send – Wardley Maps"
}
```

- `vault_id` — the child vault's public id (the part after `:` in `passphrase:vault_id`; for a
  simple token it's `SHA-256(token)[:12]`).
- `ref_id` — any unique id you choose (convention: `lk-` + 12 hex). It cross-references the optional
  key record in `.vault/owner/ro-links.json` (§4).
- Optional: `label`, `pin` (`{"mode":"latest"}` default, or `{"mode":"commit","commit":"<id>"}`),
  `description`, `public_id` (a published Public-Preview id — shows the child's public info before
  the key prompt).

The child renders as an **expandable folder** at the link file's location minus the suffix
(`demos/acme.link.json` → a folder `demos/acme`). Inner vaults are **read-only** in this version.

### An external resource (video / web page / image / app)

```json
{
  "ref_id": "lk-b54f5c60e3d4",
  "type": "video",
  "url": "https://www.youtube.com/watch?v=qVaz-sS6-tA",
  "label": "YT video about Algarve Vault",
  "provider": "youtube"
}
```

- `type` — `video` | `link` | `image` | `app`. If omitted, it's auto-detected from the `url`
  (YouTube/Vimeo → `video`, image/video extensions → `image`/`video`, else `link`).
- `provider` — optional (e.g. `youtube`); auto-detected if omitted.
- These load in a **default-deny, click-to-load** embed. No `.vault/owner` record is needed (there's
  no key — it's a public URL).

---

## 2. Two levels of sub-vault setup

| Level | What you create | Result |
|---|---|---|
| **A — link file only** | the `*.link.json` (above) | The sub-vault appears. On open, the user is asked for the child key once (link card), or it uses a key saved on that device. Portable (the link travels), but each device enters the key. |
| **B — link file + owner record** | also a `.vault/owner/ro-links.json` entry (§4) | The sub-vault opens **silently, read-only, on any device** that has the parent vault. This is what makes it usable for a team. |

The UI's **🔗 Add link** button creates **both** for you (it opens the child to derive the key).
To do it purely from `sgit`, create the link file (trivial) and — for Level B — the record (§4).

---

## 3. External resources need no record

For `type` link/video/image/app, the link file is the whole story — no `.vault/owner` entry. Drop
the `*.link.json` anywhere in the tree, commit, push.

---

## 4. The owner record — `.vault/owner/ro-links.json` (Level B)

A single JSON map keyed by `ref_id`. It is a **normal vault file** (the vault layer encrypts it with
the parent's read key), so anyone with **read** access to the parent can resolve it and traverse the
read-only sub-vault — by design.

```json
{
  "lk-37939d3b9b1a": {
    "type": "vault",
    "label": "PoC | SG/Send – Wardley Maps",
    "pin": { "mode": "latest" },
    "vault_id": "75f1c88be33d",
    "read_key": "<base64 of the child's 32-byte read key>",
    "ref_file_id": "ref-pid-muw-xxxxxxxxxxxx"
  }
}
```

**Only the child's READ key + ref are stored** — never its write key. The `ref_id` here must match
the link file's `ref_id`.

### Deriving `read_key` + `ref_file_id` from a child key

These are deterministic from the child vault key. Mirrors `sg-vault-crypto.js`
(`SGVaultCrypto.deriveKeys`) — run it in Node 18+ (global `crypto.subtle`) or a browser console:

```js
// childKey: "passphrase:vault_id"  (standard vault key)
async function deriveRoRecordFields(childKey) {
  const enc = new TextEncoder();
  const [passphrase, vaultId] = (() => { const p = childKey.split(':'); const id = p.pop(); return [p.join(':'), id]; })();

  const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const readBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`sg-vault-v1:${vaultId}`), iterations: 600000, hash: 'SHA-256' }, km, 256);

  // read_key (base64 of the 32 raw bytes)
  const read_key = btoa(String.fromCharCode(...new Uint8Array(readBits)));

  // ref_file_id = "ref-pid-muw-" + HMAC-SHA256(readBits, "sg-vault-v1:file-id:ref:<vaultId>")[:12 hex]
  const hmacKey = await crypto.subtle.importKey('raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(`sg-vault-v1:file-id:ref:${vaultId}`)));
  const hex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);

  return { vault_id: vaultId, read_key, ref_file_id: 'ref-pid-muw-' + hex };
}
```

> **Simple-token child** (`word-word-NNNN`): the derivation differs — PBKDF2 with the fixed salt
> `sgraph-send-v1` → HKDF(`vault-read-key`) for the read key, and `vault_id = SHA-256(token)[:12]`.
> See `SGVaultCrypto.deriveKeysFromSimpleToken`. Easiest path for simple-token children: use the UI
> **Add link** button (it derives this for you).

`.vault/owner/` is the single owner-metadata folder (it also holds `readonly-tokens.json` and
`public-previews/`). Create the folder if it doesn't exist.

---

## 5. The `sgit` workflow

```bash
# 1. Get the parent vault
sgit clone "<parent-vault-key>"
cd <parent>

# 2. Add a sub-vault link (Level A)
mkdir -p subvaults/demos
cat > subvaults/demos/acme.link.json <<'JSON'
{ "vault_id": "abcd1234", "ref_id": "lk-acme0001", "label": "ACME demo" }
JSON

# 3. (Level B) add the portable read-only record so it opens silently everywhere
mkdir -p .vault/owner
# … compute read_key + ref_file_id with the snippet in §4, then write/merge:
cat > .vault/owner/ro-links.json <<'JSON'
{ "lk-acme0001": { "type":"vault","label":"ACME demo","pin":{"mode":"latest"},
                   "vault_id":"abcd1234","read_key":"<b64>","ref_file_id":"ref-pid-muw-…" } }
JSON

# 4. Add an external resource (no record needed)
cat > intro.link.json <<'JSON'
{ "ref_id":"lk-intro001","type":"video","url":"https://youtu.be/XXXX","label":"Intro" }
JSON

# 5. Commit + push
sgit commit -m "Add sub-vaults + intro video"
sgit push
```

> If `.vault/owner/ro-links.json` already exists, **merge** your new entry into the existing JSON
> map (don't overwrite — it may hold other links / the read-only-token list lives in a sibling file).

---

## 6. Notes, limits, security

- **Read-only inner vaults** (this version). No `write` into a sub-vault.
- **Same vault in many places:** drop several link files (same `vault_id`/`ref_id`) in different
  folders. Moving a sub-vault = moving its `*.link.json`.
- **No secret in the link file** — it's a normal file, viewable as raw JSON. Keys live only in
  `.vault/owner/ro-links.json` (read-tier, encrypted by the parent read key) — and only the child's
  **read** key, never its write key.
- **Recursive** sub-vaults work (a child link file inside a child), opened read-only on demand.
- Apps read inner-vault files transparently via `sg.vfs` once a record/device key exists — see
  [`AUTHORING.md`](./AUTHORING.md) → "Reading other vaults".

---

## Checklist

- [ ] Link file name ends in `.link.json`; holds only `vault_id` + `ref_id` (+ optional label/pin)
- [ ] No key/secret in the link file
- [ ] (Level B) `.vault/owner/ro-links.json` entry keyed by the same `ref_id`, with the **read** key only
- [ ] `read_key`/`ref_file_id` derived per §4 (or created via the UI Add-link button)
- [ ] External resources: `type` + `url`, no record
- [ ] `sgit commit` + `sgit push` (records must be pushed to be portable)

---

*Released under CC BY 4.0.*
