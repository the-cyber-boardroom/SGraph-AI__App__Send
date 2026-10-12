# Vault ↔ Vault Encrypted Comms — How It Works & How To Replicate

A working pattern for two **independent SG/Send vaults** to hold a **live, end-to-end-encrypted
conversation** with each other — and to persist that conversation into their own storage — using
nothing but a shared, untrusted relay and per-vault keypairs.

This document is written so that a **fresh Claude session, given two new vaults**, can reproduce the
whole thing from scratch. It explains the architecture, every primitive, the exact wire formats and
formulas, two deployment modes, the security model, and a step-by-step build. Worked-example values
from the reference implementation are shown inline; substitute your own vault ids.

---

## 1. What this is

Two vaults — call them **parent** and **child** — each host a small single-file HTML app. Each app:

1. owns a **NaCl keypair** (persisted in its own vault),
2. has a **deterministic mailbox** ("inbox") on a shared relay, derived purely from its vault id,
3. **bootstraps** a channel with the peer (one cleartext hello to exchange public keys),
4. then exchanges **sealed** (authenticated-encrypted) messages both ways,
5. and **records** the conversation + its identity back into its own vault.

The relay only ever sees ciphertext and routing hashes. Neither vault needs to know the other's
key material in advance — only the other's **vault id** (public, low-entropy) and a small set of
agreed **salt strings**. The result is the screenshot you saw: two separate vault apps, in two
separate browser windows, talking and each saving the transcript to its own vault.

There are two ways to run it:

- **Embedded ("fractal") mode** — the parent app embeds the child as an iframe and drives both from
  one page (good for a single-operator test rig).
- **Standalone mode** — each vault is opened as its own app in its own window; they discover each
  other only through the relay (this is the "real" Vault↔Vault topology).

Both modes use the **identical** comms core below; only the hosting differs.

---

## 2. The moving parts

```
        PARENT VAULT                      RELAY (untrusted)                    CHILD VAULT
  ┌────────────────────┐         ┌──────────────────────────────┐      ┌────────────────────┐
  │ index.html (app)   │         │  send.sgraph.ai                │      │ index.html (app)   │
  │  • NaCl keypair    │         │  POST /api/vault/inbox/{op}/{vid}     │  • NaCl keypair    │
  │  • derives coords  │  append │  - append / list / mark /     │ list │  • derives coords  │
  │  • seal/unseal     │ ───────▶│    configure / purge          │◀──── │  • seal/unseal     │
  │  • protocol        │         │  stores: ciphertext + routing │      │  • protocol        │
  │  window.sg.vfs ────┼──┐      │           hashes only         │      │  window.sg.vfs ──┐ │
  └────────────────────┘  │      └──────────────────────────────┘      └──────────────────┼─┘
        commit+push        │              (sees no plaintext)                   commit+push │
                           ▼                                                                ▼
                  parent vault storage                                        child vault storage
              (identity.json, conversation.json)                       (state/, comms/ self-records)
```

Three independent services are in play. Keep them straight — conflating them caused real bugs:

| Concern | Host (reference impl) | Used by | Auth |
|---|---|---|---|
| **Vault content** (the encrypted object store the apps live in) | `https://dev.send.sgraph.ai` | `sgit`, the SG/App loader | access token via `sgit --token`, write key derived from vault key |
| **App / UI** (where you open a vault as an app) | `https://dev.vault.sgraph.ai` | humans + the embed iframe | vault key (+ optional backend access key) |
| **Inbox relay** (the message bus the apps talk through) | `https://send.sgraph.ai` | the comms apps + CLI | `x-sgraph-access-token`, plus per-inbox append/enum/write keys |

> The comms apps in the reference impl point their inbox client at **prod** `send.sgraph.ai` while
> their *content* lives on **dev** `dev.send.sgraph.ai`. That split is fine — the relay is just a
> dumb mailbox; pick whichever relay host both vaults can reach.

---

## 3. The inbox relay API

A single endpoint shape: `POST https://{relay}/api/vault/inbox/{op}/{vid}` where `vid` matches
`^[a-z0-9]{8,24}$`. The relay stores opaque blobs in per-token folders and gates operations on
**hashes** of secrets it never stores in the clear.

Headers:

- `x-sgraph-access-token` — coarse service token (reference value: `aws`).
- `x-sgraph-vault-write-key` — required for `configure`, `purge`, and inbox creation.
- `x-sgraph-vault-enum-key` — required for `list` and `mark-processed`.

Operations:

| `op` | body | returns |
|---|---|---|
| `append` | `{ append_token, payload }` (payload = base64) | `{ ok: true }` |
| `list` | `{ inbox, after_file_id?, limit?, include_content? }` | `{ status:'ok', entries:[ { inbox, file_id, size, received, content } ], truncated }` |
| `mark-processed` | `{ inbox, file_ids:[...] }` | `{ ok: true }` |
| `purge` | `{ inbox, folder? }` | `{ ok: true }` |
| `configure` | `{ append_anchors:[sha256hex(appendToken)], enum_key_hash: sha256hex(enumKey) }` | `{ ok: true }` |

Inbox creation (once per vault): `PUT /api/vault/write/{vid}/_inbox_init` with the access **and**
write-key headers and any small body.

Critical details that bit us:

- **The list field is `entries`, not `files`.** `received` is epoch **milliseconds**. `content` is
  base64 of the stored payload (only when `include_content:true`).
- `list` defaults to 50, max 200. Caps are ~1000 files / 50 MB per inbox.
- `inbox` in `list`/`mark`/`purge` is the **append-token folder** (i.e. you pass the `appendToken`
  itself as `inbox`). Omitting `inbox` on `list` enumerates *all* token folders for that `vid`.

The auth model is **preimage-based**: `configure` registers `sha256(appendToken)` and
`sha256(enumKey)`; callers later present the *preimages* (`appendToken` to append, `enumKey` to
enumerate). So whoever can derive those preimages can post to and read the mailbox. See §9 for why
that is acceptable.

---

## 4. Deterministic inbox coordinates (v2)

Every routing value is derived from the **target vault's id** plus a fixed salt, with SHA-256. No
state, no registry, no "inbox.json" to persist or get out of sync. Given a vault id `V`:

```js
async function sha256hex(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
}
async function coordsFor(V){
  return {
    vid:         (await sha256hex('sgvv-v2-inbox:'  + V)).slice(0,16), // the relay {vid}
    appendToken:  await sha256hex('sgvv-v2-append:' + V),              // who may post
    enumKey:      await sha256hex('sgvv-v2-enum:'   + V),              // who may read
    writeKey:     await sha256hex('sgvv-v2-write:'  + V),              // who may configure/purge
  };
}
```

Worked example (reference vaults):

| Vault | vault id `V` | derived inbox `vid` |
|---|---|---|
| parent | `fa8c672e0c68` | `fa316769ba1a4181` |
| child | `1d7c88062943` | `4b7174c79260172e` |

A vault uses `coordsFor(MY_VAULT_ID)` for **its own** mailbox (to create/configure/list/mark) and
`coordsFor(PEER_VAULT_ID)` when it wants to **post to the peer**. Both apps must agree on the four
salt strings; everything else falls out of the vault ids. The `v2` prefix is just a namespace —
bump it if you ever want a clean break.

---

## 5. Cryptographic identity

Each vault owns a **`nacl.box` keypair** (Curve25519). It is generated once at random and then
**persisted in the vault** so the public key is stable across sessions (this is what lets the peer
keep talking to you after a reload).

```js
// generate once
let kp = nacl.box.keyPair();                       // { publicKey, secretKey } as Uint8Array
// persist (base64) into the vault
await writeJSON('identity.json', {
  sk: nacl.util.encodeBase64(kp.secretKey),
  pk: nacl.util.encodeBase64(kp.publicKey),
  createdAt: new Date().toISOString()
});
// on later boots, load instead of regenerating
const id = await readJSON('identity.json');
if (id?.sk) kp = nacl.box.keyPair.fromSecretKey(nacl.util.decodeBase64(id.sk));
```

> **Boot order matters.** Read `identity.json` *before* generating. The screenshots show the child's
> first vault call on boot is `READ state/identity.json` — that's it loading its persisted key, not
> minting a new one. If you skip the read, every reload makes a new key, the peer's sealed messages
> become undecryptable, and the channel silently dies.

---

## 6. The sealed message format

Messages are sealed with `nacl.box` (X25519 + XSalsa20-Poly1305), using an **ephemeral** sender
keypair per message so the wire carries everything the recipient needs. Layout, then base64:

```
[ ephemeralPublicKey (32) ][ nonce (24) ][ ciphertext (… + 16-byte tag) ]
```

```js
function seal(plaintextStr, recipientPubB64){
  const rpk = nacl.util.decodeBase64(recipientPubB64);
  const eph = nacl.box.keyPair();
  const n   = nacl.randomBytes(nacl.box.nonceLength);                 // 24
  const ct  = nacl.box(nacl.util.decodeUTF8(plaintextStr), n, rpk, eph.secretKey);
  const out = new Uint8Array(eph.publicKey.length + n.length + ct.length);
  out.set(eph.publicKey, 0);
  out.set(n, eph.publicKey.length);
  out.set(ct, eph.publicKey.length + n.length);
  return nacl.util.encodeBase64(out);
}
function unseal(b64, mySecretKey){
  try {
    const a  = nacl.util.decodeBase64(b64);
    const pl = nacl.box.publicKeyLength, nl = nacl.box.nonceLength;   // 32, 24
    const epk = a.slice(0, pl), n = a.slice(pl, pl+nl), ct = a.slice(pl+nl);
    const pt  = nacl.box.open(ct, n, epk, mySecretKey);
    return pt ? nacl.util.encodeUTF8(pt) : null;                     // null = not for us / tampered
  } catch { return null; }
}
```

`unseal` returning `null` is the natural "this blob isn't a sealed message for me" signal — used by
the receive loop to distinguish a sealed message from a cleartext hello (§7).

---

## 7. The protocol

Messages are small JSON objects with a `t` (type) tag. Two transport forms:

- **cleartext** — base64 of the JSON, posted as-is. Used **only** for the bootstrap `hello`, because
  the peer doesn't yet know your public key.
- **sealed** — the `seal()` output above. Everything after the hello.

```js
const packClear = o => nacl.util.encodeBase64(nacl.util.decodeUTF8(JSON.stringify(o)));
const tryClear  = b64 => { try { const o = JSON.parse(nacl.util.encodeUTF8(nacl.util.decodeBase64(b64))); return (o && o.t) ? o : null; } catch { return null; } };
```

### Message types

| `t` | form | fields | meaning |
|---|---|---|---|
| `hello` | cleartext | `name, pubkey, vaultId` | "here's my public key + who I am" (bootstrap) |
| `ack` | sealed | `name, pubkey` | "got your hello, here's mine; channel up" |
| `msg` | sealed | `text` | a chat message |

### Flow

```
A (initiator)                         relay                         B (responder)
  init: create+configure own inbox
  ── append CLEARTEXT hello ───────▶ B's inbox
                                                       B: checkInbox → tryClear → hello
                                                       B: learn A.pubkey, A.vaultId
                                     A's inbox ◀──────── append SEALED ack(B.pubkey)
  A: checkInbox → unseal → ack
  A: learn B.pubkey → channel up
  ── append SEALED msg ────────────▶ B's inbox          ── append SEALED msg ──▶ A's inbox
```

### The receive loop (the heart of it)

```js
async function checkInbox(){
  const me  = await coordsFor(MY_VAULT_ID);
  const res = await apiList(me.vid, me.enumKey, me.appendToken);   // { entries:[...] }
  const handled = [];
  for (const e of (res.entries || [])) {
    if (seen[e.file_id]) continue;            // in-memory dedup
    seen[e.file_id] = true;

    const clear = tryClear(e.content);
    if (clear && clear.t === 'hello') {       // bootstrap: learn peer, reply with ack
      PEER = { name: clear.name, vaultId: clear.vaultId, pubkey: clear.pubkey };
      const pc = await coordsFor(PEER.vaultId);
      await apiAppend(pc.vid, pc.appendToken, seal(JSON.stringify({t:'ack', name:MY_NAME, pubkey:myPubB64()}), PEER.pubkey));
      handled.push(e.file_id);
      continue;
    }
    const pt = unseal(e.content, kp.secretKey);
    if (pt != null){
      const o = JSON.parse(pt);
      if (o.t === 'ack') { PEER = PEER || {}; PEER.pubkey = o.pubkey; }   // channel established
      else if (o.t === 'msg') { CONV.push({ dir:'in', text:o.text, ts:Date.now() }); }
      handled.push(e.file_id);
    }
  }
  if (handled.length) await apiMark(me.vid, me.enumKey, me.appendToken, handled);  // don't re-process
  if (CONV.length) await writeJSON('conversation.json', { role: MY_NAME, messages: CONV });
}
```

Decode order is deliberate: **cleartext-JSON first** (catches `hello`), then **unseal**. A sealed
blob won't parse as JSON; a cleartext hello won't unseal. `mark-processed` plus the in-memory `seen`
set make the loop idempotent so polling (or re-checking) never double-handles a message.

The inbox client helpers used above are thin wrappers over §3:

```js
const H = { ACCESS:'x-sgraph-access-token', WRITE:'x-sgraph-vault-write-key', ENUM:'x-sgraph-vault-enum-key' };
const post = (op, vid, headers, body) =>
  fetch(`${RELAY}/api/vault/inbox/${op}/${vid}`, {
    method:'POST', headers:{ 'Content-Type':'application/json', ...headers }, body: JSON.stringify(body)
  }).then(r => r.json());

const apiAppend = (vid, appendToken, payloadB64)      => post('append', vid, {}, { append_token: appendToken, payload: payloadB64 });
const apiList   = (vid, enumKey, inbox)               => post('list',   vid, { [H.ENUM]: enumKey }, { inbox, include_content:true, limit:200 });
const apiMark   = (vid, enumKey, inbox, ids)          => post('mark-processed', vid, { [H.ENUM]: enumKey }, { inbox, file_ids: ids });
async function apiConfigure(vid, writeKey, appendToken, enumKey){
  return post('configure', vid, { [H.ACCESS]: TOKEN, [H.WRITE]: writeKey },
    { append_anchors:[ await sha256hex(appendToken) ], enum_key_hash: await sha256hex(enumKey) });
}
async function apiCreateInbox(vid, writeKey){
  return fetch(`${RELAY}/api/vault/write/${vid}/_inbox_init`, {
    method:'PUT', headers:{ [H.ACCESS]:TOKEN, [H.WRITE]:writeKey, 'Content-Type':'application/octet-stream' }, body:'sg-inbox-init'
  });
}
```

---

## 8. Persisting state into the vault (the `window.sg` VFS)

When a vault is opened as an app, the loader injects `window.sg`. The app uses it to read/write files
**in its own vault**, which triggers a commit + push on every write.

- `sg.vfs.readText(path)` / `sg.vfs.read(path)` / `sg.vfs.list(path)` / `sg.vfs.write(path, str)`
- `sg.fs.mkdir / move / delete / write`
- `sg.app.writable` (boolean), `sg.app.selfPath`

Two rules that are *not* obvious and cost real debugging time:

1. **`sg.vfs.write` paths are relative to the app's own directory; `sg.fs.mkdir` paths are relative to
   the vault root.** This asymmetry means "make a subfolder then write into it" silently fails: the
   `mkdir` targets `/state`, the `write` targets `/<app-dir>/state/...`, and the folder the write
   needs was never created → **"Folder not found."**

2. **The fix that makes writes bulletproof: write into the app's own directory, which always exists**
   (the app's `index.html` is already there). No subfolder creation, nothing to 404 on:

   ```js
   // robust: self-records go straight into the app dir
   await sg.vfs.write('identity.json', JSON.stringify(id, null, 2));
   await sg.vfs.write('conversation.json', JSON.stringify(conv, null, 2));
   ```

   A vault whose app sits at the **root** can use root-level `state/` and `comms/` folders directly
   (the child does this); a vault whose app sits in a **subdirectory** should write beside its
   `index.html` (the parent rig does this — `STATE=''`, `COMMS=''`). Same code, different layout,
   because of *where the app lives in its vault*.

`writeJSON` wraps this with a writability guard so read-only opens degrade gracefully:

```js
async function writeJSON(path, obj){
  if (!(window.sg && sg.vfs && sg.app && sg.app.writable)) return false;  // read-only / no host
  try { await sg.vfs.write(path, JSON.stringify(obj, null, 2)); return true; }
  catch (e) { /* log e.message; surface in the call log */ return false; }
}
async function readJSON(path){
  try { return JSON.parse(await sg.vfs.readText(path)); } catch { return null; }
}
```

Writes are deny-by-default. The vault's `app.json` must **grant** them and the open must be
**writable** (§10).

---

## 9. Security model & threat boundaries

- **The relay is untrusted and effectively public per vault.** Because the append/enum/write keys
  are derived deterministically from the (public, low-entropy) vault id and shared salts, anyone who
  knows a vault's id and the salts can post to, read, and purge that inbox. **That is by design** —
  the inbox is a transport, not a secret store.
- **Confidentiality and authenticity come only from the NaCl seal.** Message bodies are sealed to the
  recipient's public key; the relay (and any third party with the vault id) sees only ciphertext,
  nonces, and ephemeral public keys. Tampering or wrong-recipient blobs `unseal` to `null` and are
  dropped. Never put anything sensitive in the *cleartext* hello beyond the public key, name, and
  vault id.
- **The bootstrap hello is unauthenticated.** A `hello` only conveys a public key; first-contact is
  trust-on-first-use. If you need to pin identities, carry a signature or an out-of-band fingerprint
  check — the current design assumes the two vault ids are exchanged through a trusted channel
  (you set them in both apps).
- **Key custody caveat.** In this reference build the secret key lives in `identity.json` *inside the
  readable vault*, and the write token lives in `app.json`. So anyone who can **read the vault**
  (e.g. a CLI holder, see §12) can decrypt that vault's messages and post as its inbox. Fine for a
  demo or a single-owner agent; for production, keep the private key out of the readable vault
  (non-extractable WebCrypto, or a per-device key that's never committed).

---

## 10. `app.json` — making the app load and write

Each vault carries an `app.json` that tells the loader what to mount and what the app may do:

```json
{
  "accessToken": "aws",
  "entry": "scenarios/02-step-rig/index.html",
  "auto_open": true,
  "present": true,
  "permissions": {
    "fs": {
      "read":  true,
      "write": ["scenarios/", "state/", "comms/"],
      "mkdir": ["scenarios/", "state/", "comms/"]
    }
  }
}
```

- **`accessToken`** — adopted by the loader on open, so the vault is writable **without** the user
  typing a backend access key. This is what makes embedded/no-typed-token opens able to commit.
- **`entry` + `auto_open`** — the file to mount as the app. (For a root app, `entry` is just
  `index.html`.)
- **`permissions.fs.write` / `mkdir`** — path-prefix grants (trailing `/` = prefix). Writes outside a
  grant are denied even on a writable open. Note: a deep-link to an HTML file overrides `entry`.

The non-grantable floor (`.vault/**` and the root `app.json` itself) can never be written by the app,
regardless of grants.

---

## 11. Two deployment modes

### A. Standalone (the real Vault↔Vault topology)

Open each vault as its own app in its own window (`https://{appHost}/en-gb/app/`, enter the vault key,
optionally expand "Backend access key" and enter the access token to open writable). Each app runs
the comms core independently; they find each other only via the relay. This is what the parent/child
screenshots show: a message composed in the parent window arrives in the child window seconds later,
labelled "from parent", and each side commits its own `conversation.json`. No shared page, no
embedding — just two vaults and a mailbox.

To open writable: the loader's open form takes the **vault key** (read+write) and an optional
**backend access key** (the `aws` token) that controls server-side write permission. With both, the
HUD shows a `write · mkdir` badge and `sg.app.writable` is true.

### B. Embedded "fractal" mode (single-operator rig)

The parent app embeds the child as an iframe and drives both from one page. The embed uses a
postMessage handshake (so the parent never needs the child's internal state):

```js
const f = document.createElement('iframe');
f.src = EMBED_HOST + '/en-gb/app/?embed=1';      // EMBED_HOST = the app host
document.body.appendChild(f);
window.addEventListener('message', (e) => {
  if (e.source !== f.contentWindow) return;
  const d = e.data || {};
  if (d.sg === 'vault-embed-ready')
    f.contentWindow.postMessage({ sg:'vault-open', key: CHILD_VAULT_KEY, mode:'app' }, '*');  // see note
  else if (d.sg === 'vault-ready')
    { /* child mounted: d.vaultName, d.fileCount, d.hasApp */ }
});
```

> **`targetOrigin` must be `'*'`.** A nested iframe inherits the parent's sandbox and reports a
> `null` origin, so a specific target origin silently drops the message. Use `'*'` and validate
> `e.source` instead.

The embedded child still talks to the relay exactly as in standalone mode — embedding only changes
*who renders it*, not the comms.

---

## 12. CLI participation (a third party on the channel)

Because the relay is open and a vault's secret key is in its `identity.json`, a CLI process can join
the conversation: pull a vault with `sgit`, read its keypair, derive coords, and read/decrypt/post.
This is exactly how the "hello child — this is Claude, appending straight to your inbox from the CLI"
message in the screenshots got there.

Use Node with `tweetnacl` + `tweetnacl-util` (run the script from the directory that has them in
`node_modules`, since `require` resolves from the script's location):

```js
const nacl = require('tweetnacl'), util = require('tweetnacl-util'), crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const coords = V => ({ vid: sha('sgvv-v2-inbox:'+V).slice(0,16), appendToken: sha('sgvv-v2-append:'+V), enumKey: sha('sgvv-v2-enum:'+V) });

// read the child's secret key from its pulled vault (state/identity.json), then:
const sk = util.decodeBase64(CHILD_SK_B64), pk = util.decodeBase64(CHILD_PK_B64);

function seal(str, pub){ const e=nacl.box.keyPair(), n=nacl.randomBytes(24), ct=nacl.box(util.decodeUTF8(str), n, pub, e.secretKey);
  const o=new Uint8Array(32+24+ct.length); o.set(e.publicKey,0); o.set(n,32); o.set(ct,56); return util.encodeBase64(o); }

const c = coords(CHILD_VAULT_ID);
// post a message the child will decrypt:
await fetch(`https://send.sgraph.ai/api/vault/inbox/append/${c.vid}`, { method:'POST',
  headers:{'Content-Type':'application/json'}, body: JSON.stringify({ append_token: c.appendToken,
    payload: seal(JSON.stringify({ t:'msg', text:'hello from the CLI' }), pk) }) });
// read + decrypt the inbox:
const res = await (await fetch(`https://send.sgraph.ai/api/vault/inbox/list/${c.vid}`, { method:'POST',
  headers:{'Content-Type':'application/json','x-sgraph-vault-enum-key': c.enumKey},
  body: JSON.stringify({ inbox: c.appendToken, include_content:true, limit:200 }) })).json();
for (const e of res.entries) { const a=util.decodeBase64(e.content);
  const pt = nacl.box.open(a.slice(56), a.slice(32,56), a.slice(0,32), sk); if (pt) console.log(util.encodeUTF8(pt)); }
```

When the running app next checks its inbox it will pick the message up, decrypt it, and (because it
labels all inbound as its peer) display it as "from <peer>". A useful, slightly surprising side
effect to know about.

---

## 13. Step-by-step: replicate from scratch with two new vaults

1. **Create / obtain two vaults** and note each one's **vault id** `V` (the short alphanumeric id, not
   the full key) and its full key. Decide roles: `A` (initiator) and `B` (responder).

2. **Pick shared constants** both apps will hardcode: the four salts (`sgvv-v2-inbox:` /
   `-append:` / `-enum:` / `-write:`), the relay host, and the relay access `TOKEN`. In **each**
   app set `MY_VAULT_ID`, `MY_NAME`, `PEER_VAULT_ID`, and (for embedding) `PEER_VAULT_KEY`.

3. **Author each app's `index.html`** containing: an inlined `tweetnacl` + `tweetnacl-util` (see §14),
   the `sha256hex` + `coordsFor` (§4), `seal`/`unseal` (§6), the inbox client + protocol + receive
   loop (§7), identity load/generate (§5), and `readJSON`/`writeJSON` (§8). Keep self-record writes in
   the **app's own directory**.

4. **Add `app.json`** to each vault (§10) with `accessToken`, `entry`/`auto_open`, and `fs` write/mkdir
   grants for wherever you persist.

5. **Initialise each inbox once** from the app's "init" action: `coordsFor(MY_VAULT_ID)` →
   `apiCreateInbox(vid, writeKey)` then `apiConfigure(vid, writeKey, appendToken, enumKey)`. Generate
   or load the keypair in the same step and persist `identity.json`.

6. **Bootstrap:** open both vaults writable. On `A`, send the cleartext `hello` to
   `coordsFor(PEER_VAULT_ID)`. On `B`, "check inbox" → it learns `A`'s pubkey and replies with a sealed
   `ack`. On `A`, "check inbox" → it learns `B`'s pubkey. Channel is up.

7. **Talk:** either side composes a `msg`; the other "checks inbox" (or enable a poll). Each side
   commits `conversation.json` to its own vault as it goes. Reload either app — it reads back its
   `identity.json` and resumes with the same key.

8. **Verify from outside** (optional): with `sgit`, pull a vault, read its `identity.json`, and use the
   §12 Node snippet to list/decrypt its inbox and confirm what each side actually stored.

---

## 14. Practical notes & gotchas (hard-won)

- **Inlining NaCl into a single-file vault app.** Concatenate `tweetnacl/nacl-fast.min.js` and
  `tweetnacl-util/nacl-util.min.js` into a `<script>` (the util attaches as `nacl.util`). When
  building with a here-doc, the closing `</script></body></html>` is easy to drop — verify with
  `tail -c 40 file` and run `node --check` against the extracted script before pushing.
- **`entries` not `files`.** The single most time-wasting bug: reading `r.files` from `list` returns
  nothing and makes a perfectly working channel look dead. It's `r.entries`.
- **Stable identity or it all falls apart.** Read `identity.json` on boot before generating (§5).
- **Writes need a writable open.** No `accessToken` in `app.json` (or no backend access key on a
  manual open) → `sg.app.writable` is false → self-records silently don't persist even though the
  inbox traffic works. The traffic and the persistence are independent; debug them separately.
- **Detecting stale loads.** Bake a visible **build stamp** into the app header (the reference app
  shows `build r5 · …`). If the header doesn't show your latest stamp, the app loaded an old commit —
  which leads to the next point.
- **CLI pushes vs. web edits diverge (platform-level).** `sgit push` advances the vault's **named**
  branch; the web app commits to and opens from a separate **clone** branch and prefers the clone head
  on open. So a fresh `sgit clone` can show your latest commit while the web app still renders an
  older one, and a plain refresh won't fix it — you must let the app **sync/pull** (the HUD shows
  "Synced" once reconciled). This is a known issue handed to the vault/sgit maintainers; until it's
  fixed, after a CLI push, reconcile in the app before judging what the app "sees".
- **Embed sandbox quirks.** Use `targetOrigin:'*'` for the null-origin embedder (§11), and guard any
  `caches` feature-detect *inside* a try/catch — in a sandboxed iframe `caches` is a defined accessor
  that throws, so `typeof caches === 'undefined'` itself throws and aborts vault-open.

---

## 15. Reference card

```
SALTS         sgvv-v2-inbox:  sgvv-v2-append:  sgvv-v2-enum:  sgvv-v2-write:
COORDS(V)     vid=sha256(inbox:V)[:16]  appendToken=sha256(append:V)  enumKey=sha256(enum:V)  writeKey=sha256(write:V)
RELAY         POST {relay}/api/vault/inbox/{append|list|mark-processed|configure|purge}/{vid}
              PUT  {relay}/api/vault/write/{vid}/_inbox_init
HEADERS       x-sgraph-access-token · x-sgraph-vault-write-key · x-sgraph-vault-enum-key
LIST RESULT   { status:'ok', entries:[{ file_id, size, received(ms), content(b64) }], truncated }
CONFIGURE     { append_anchors:[sha256(appendToken)], enum_key_hash: sha256(enumKey) }
SEAL          base64( ephPub(32) || nonce(24) || nacl.box(msg, nonce, recipPub, ephSk) )
MSG TYPES     hello{name,pubkey,vaultId}=cleartext   ack{name,pubkey}=sealed   msg{text}=sealed
DECODE ORDER  tryClear (hello) → unseal (ack/msg) → mark-processed
VFS           sg.vfs.{readText,write}=app-dir-relative · sg.fs.mkdir=vault-root-relative
PERSIST       identity.json {sk,pk,createdAt} · conversation.json {role,messages[]}  (write to APP DIR)
APP.JSON      { accessToken, entry, auto_open, permissions.fs.{read,write[],mkdir[]} }
HOSTS (ref)   content dev.send.sgraph.ai · app dev.vault.sgraph.ai · relay send.sgraph.ai · token "aws"
```
