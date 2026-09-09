# Sending a debrief bundle to SG/Send from an agent (VoiceDebrief.ai / n8n)

**Audience:** the VoiceDebrief.ai agent and the n8n workflow behind the WhatsApp voice-memo flow.
**Goal:** after a voice memo is transcribed, package the artefacts as a `.zip`, encrypt it, upload it to
SG/Send with an access key, and return **one share link** that a human or another agent can open.
**Status:** every request, response, status code and byte layout below was executed against the SG/Send
user API on 9 Sep 2026. Nothing here is inferred. See [Verified behaviour](#12-verified-behaviour).

---

## 1. What you get

One line in your WhatsApp reply:

```
📦 Bundle: https://send.sgraph.ai/en-gb/download/#d6de8f168dc8/W6bj293g9wqQpFO3IF9zkbv8btL3jDccobYIu_wFdY8
```

That link holds the transcript, the debrief, the infographic and a machine-readable manifest, in a zip
that **only the holder of the link can read**. Paste it to a colleague and they get a download page.
Paste it to an agent and it can fetch and decrypt the bundle in two HTTP calls (§10).

---

## 2. The trust model — read this before writing code

SG/Send is **zero-knowledge**. The server stores ciphertext and never holds the key. Three consequences
shape the whole integration:

| | |
|---|---|
| **You encrypt, not the server** | There is no "upload this file" endpoint that encrypts for you. Your workflow generates an AES-256-GCM key, encrypts the zip, and uploads the ciphertext. |
| **The key travels in the URL fragment** | `#transfer_id/key`. Everything after `#` is **never sent to the server** by any browser — it stays in the recipient's client. That is what makes the link both shareable and private. |
| **Two different secrets** | The **access key** (`x-sgraph-access-token`) authorises *you to upload*. The **decryption key** (in the fragment) authorises *anyone to read*. They are unrelated, and the access key must never appear in a share link. |

What the server can see: ciphertext size, a hashed sender IP, a creation timestamp, and your
`content_type_hint`. What it cannot see: the file name, the contents, or the key. The filename is
encrypted with the payload (§4), which is why there is an envelope format at all.

---

## 3. Before you start

You need an **access key** issued by SG/Send. Store it as an n8n credential (or `SGRAPH_SEND_TOKEN` in
the environment) — never inline it in a Code node, and never commit it.

```
Base URL   https://send.sgraph.ai        (production)
           https://dev.send.sgraph.ai    (development)
Auth       x-sgraph-access-token: <your access key>
```

> The API also accepts `?access_token=…` as a query-param fallback. **Do not use it.** Query strings
> land in proxy logs, browser history and n8n execution records. Use the header.

Only the three write calls need the access key. `info` and `download` are public — the decryption key
is the gate, which is exactly why a share link works for someone who has no SG/Send account.

---

## 4. The payload format

Two layers, applied in this order. Get the order wrong and the recipient's download page will show a
corrupt file with no name.

### 4.1 SGMETA envelope (inner) — carries the filename

The filename must not reach the server, so it is wrapped *inside* the plaintext before encryption:

```
┌───────────────────┬──────────────┬────────────────────┬──────────────────────┐
│ "SGMETA\0"        │ meta_len     │ metadata JSON      │ file bytes           │
│ 7 bytes           │ 4 bytes, BE  │ meta_len bytes     │ rest of the buffer   │
│ 53 47 4D 45 54 41 │ uint32       │ {"filename":"…"}   │ your .zip            │
│ 00                │ big-endian   │ UTF-8              │                      │
└───────────────────┴──────────────┴────────────────────┴──────────────────────┘
```

### 4.2 AES-256-GCM (outer) — the actual encryption

```
┌──────────────┬────────────────────────────────────────────────┐
│ IV, 12 bytes │ ciphertext + 16-byte GCM tag                   │
│ random       │ AES-256-GCM over the SGMETA buffer             │
└──────────────┴────────────────────────────────────────────────┘
```

- **Key:** 32 random bytes. Shared as **base64url, unpadded** (`+`→`-`, `/`→`_`, no `=`). 43 characters.
- **IV:** 12 random bytes, fresh per upload, prepended to the ciphertext. Never reuse an IV with a key.
- **Tag:** GCM's 16-byte tag is appended by every standard AES-GCM implementation. Don't add it yourself.

The uploaded payload is therefore `IV ‖ ciphertext ‖ tag`, and is 28 bytes larger than the plaintext.

---

## 5. The three API calls

### Call 1 — create

```http
POST /api/transfers/create
x-sgraph-access-token: <access key>
Content-Type: application/json

{
  "file_size_bytes"  : 635,
  "content_type_hint": "application/zip",
  "max_downloads"    : 5,
  "auto_delete"      : false,
  "expires_at"       : 1789200000000
}
```

```json
{ "transfer_id": "d6de8f168dc8", "upload_url": "/api/transfers/upload/d6de8f168dc8" }
```

| Field | Notes |
|---|---|
| `file_size_bytes` | The **plaintext** (SGMETA-wrapped, pre-encryption) length, matching the browser client. Display metadata only — not enforced against what you upload. |
| `content_type_hint` | `application/zip`. Stored in the clear; keep it generic. |
| `max_downloads` | `0` = unlimited. Once exhausted, downloads return **410**. |
| `auto_delete` | `true` wipes the payload after the last allowed download. |
| `expires_at` | **Milliseconds** since epoch (not seconds). `0` = never. After it passes, downloads return **410**. |
| `delete_auth_hash` | Optional `sha256(secret)` hex. Enables revocation (§11). |
| `transfer_id` | Optional. Omit it and the server generates 12 lowercase hex chars. |

### Call 2 — upload

```http
POST /api/transfers/upload/{transfer_id}
x-sgraph-access-token: <access key>
Content-Type: application/octet-stream

<raw encrypted bytes: IV ‖ ciphertext ‖ tag>
```

```json
{ "status": "uploaded", "transfer_id": "d6de8f168dc8", "size": 663 }
```

Send **raw bytes**, not base64 and not multipart. Keep the encrypted payload under **~4 MB** for this
direct path — see [Size limits](#9-size-limits).

### Call 3 — complete

```http
POST /api/transfers/complete/{transfer_id}
x-sgraph-access-token: <access key>
```

```json
{ "transfer_id": "d6de8f168dc8", "download_url": "/d/d6de8f168dc8", "transparency": { … } }
```

The transfer is only downloadable after this call. **Ignore `download_url`** — `/d/{id}` is not a live
route (verified: 404). Build the share link yourself:

```
https://send.sgraph.ai/en-gb/download/#{transfer_id}/{key_base64url}
```

Link-only form (when you send the key through a second channel): omit `/{key}`.

> The fragment parser splits on the **first** `/`, and truncates at a `|` if present. So `|` is reserved
> — never put one in a key or a transfer id. Base64url never produces either character, so following
> §4 keeps you safe.

---

## 6. Drop-in implementation — JavaScript

Runs unchanged in an **n8n Code node** (Node 18+) and in the browser — both expose `crypto.subtle`.
Zero dependencies.

```js
// ── SG/Send: encrypt a zip and return a share link ───────────────────────────
const SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41, 0x00];   // "SGMETA\0"

function sgmetaWrap(contentBytes, metadata) {
    const meta   = new TextEncoder().encode(JSON.stringify(metadata));
    const out    = new Uint8Array(7 + 4 + meta.length + contentBytes.length);
    out.set(SGMETA_MAGIC, 0);
    new DataView(out.buffer).setUint32(7, meta.length, false);       // big-endian
    out.set(meta, 11);
    out.set(contentBytes, 11 + meta.length);
    return out;
}

function b64url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const b64 = (typeof btoa === 'function') ? btoa(bin) : Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendToSgSend(zipBytes, {
    filename     = 'bundle.zip',
    accessToken,
    baseUrl      = 'https://send.sgraph.ai',
    locale       = 'en-gb',
    maxDownloads = 0,
    expiresInDays= 30,
} = {}) {
    if (!accessToken) throw new Error('SG/Send access token required');

    // 1. wrap + encrypt
    const plaintext = sgmetaWrap(zipBytes, { filename });
    const rawKey    = crypto.getRandomValues(new Uint8Array(32));
    const iv        = crypto.getRandomValues(new Uint8Array(12));
    const key       = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const cipher    = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    const payload   = new Uint8Array(iv.length + cipher.length);
    payload.set(iv, 0);
    payload.set(cipher, iv.length);

    const H = { 'x-sgraph-access-token': accessToken };
    const json = async (r, step) => {
        if (!r.ok) throw new Error(`SG/Send ${step} failed: ${r.status} ${await r.text().catch(() => '')}`);
        return r.json();
    };

    // 2. create
    const created = await json(await fetch(`${baseUrl}/api/transfers/create`, {
        method : 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body   : JSON.stringify({
            file_size_bytes  : plaintext.length,
            content_type_hint: 'application/zip',
            max_downloads    : maxDownloads,
            auto_delete      : false,
            expires_at       : expiresInDays ? Date.now() + expiresInDays * 86400000 : 0,
        }),
    }), 'create');

    // 3. upload  (raw bytes)
    await json(await fetch(`${baseUrl}/api/transfers/upload/${created.transfer_id}`, {
        method : 'POST',
        headers: { ...H, 'Content-Type': 'application/octet-stream' },
        body   : payload,
    }), 'upload');

    // 4. complete
    await json(await fetch(`${baseUrl}/api/transfers/complete/${created.transfer_id}`, {
        method: 'POST', headers: H,
    }), 'complete');

    const keyStr = b64url(rawKey);
    return {
        transferId : created.transfer_id,
        key        : keyStr,                                                     // treat as a secret
        shareUrl   : `${baseUrl}/${locale}/download/#${created.transfer_id}/${keyStr}`,
        linkOnlyUrl: `${baseUrl}/${locale}/download/#${created.transfer_id}`,     // key sent separately
    };
}
```

**n8n Code node usage** — the zip arrives as a binary property:

```js
const bin   = await this.helpers.getBinaryDataBuffer(0, 'data');
const token = (await this.getCredentials('sgSendApi')).accessToken;   // never hard-code
const res   = await sendToSgSend(new Uint8Array(bin), {
    filename: `voicedebrief-${new Date().toISOString().slice(0, 10)}.zip`,
    accessToken: token, expiresInDays: 30, maxDownloads: 0,
});
return [{ json: { shareUrl: res.shareUrl, transferId: res.transferId } }];       // do NOT return res.key
```

---

## 7. Drop-in implementation — Python

For an Execute Command node, a Lambda, or the transcription worker.

```python
import base64, json, os, struct, time, requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SGMETA_MAGIC = b'SGMETA\x00'

def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')

def _sgmeta_wrap(content: bytes, metadata: dict) -> bytes:
    meta = json.dumps(metadata, separators=(',', ':')).encode()
    return SGMETA_MAGIC + struct.pack('>I', len(meta)) + meta + content

def send_to_sgsend(zip_bytes: bytes, filename: str = 'bundle.zip', *,
                   access_token: str = None,
                   base_url: str = 'https://send.sgraph.ai',
                   locale: str = 'en-gb',
                   max_downloads: int = 0,
                   expires_in_days: int = 30) -> dict:
    access_token = access_token or os.environ['SGRAPH_SEND_TOKEN']

    plaintext = _sgmeta_wrap(zip_bytes, {'filename': filename})
    key, iv   = AESGCM.generate_key(bit_length=256), os.urandom(12)
    payload   = iv + AESGCM(key).encrypt(iv, plaintext, None)

    H = {'x-sgraph-access-token': access_token}
    expires_at = int((time.time() + expires_in_days * 86400) * 1000) if expires_in_days else 0

    r = requests.post(f'{base_url}/api/transfers/create', headers=H, timeout=30, json={
        'file_size_bytes'  : len(plaintext),
        'content_type_hint': 'application/zip',
        'max_downloads'    : max_downloads,
        'auto_delete'      : False,
        'expires_at'       : expires_at,
    })
    r.raise_for_status()
    tid = r.json()['transfer_id']

    r = requests.post(f'{base_url}/api/transfers/upload/{tid}', headers={**H, 'Content-Type': 'application/octet-stream'},
                      data=payload, timeout=120)
    r.raise_for_status()

    r = requests.post(f'{base_url}/api/transfers/complete/{tid}', headers=H, timeout=30)
    r.raise_for_status()

    key_str = _b64url(key)
    return {'transfer_id'  : tid,
            'key'          : key_str,                                            # secret
            'share_url'    : f'{base_url}/{locale}/download/#{tid}/{key_str}',
            'link_only_url': f'{base_url}/{locale}/download/#{tid}'}
```

---

## 8. What to put in the zip

The bundle is read by both people and agents, so give it a machine-readable index. Suggested layout,
mapping onto what VoiceDebrief already produces:

```
voicedebrief-2026-09-09-0001/
├── manifest.json        ← machine index: what each file is, durations, models used, costs
├── llms.txt             ← short agent-readable description of the bundle (mirrors your site convention)
├── transcript.md        ← full transcript
├── transcript.vtt       ← timestamped cues, if available
├── debrief.md           ← the written summary (the WhatsApp reply body)
├── translation.md       ← optional
├── infographic.png      ← optional
└── audio.opus           ← optional original; omit if size or privacy matters
```

A `manifest.json` worth writing:

```json
{
  "schema"     : "voicedebrief/bundle@1",
  "created_at" : "2026-09-09T00:01:00Z",
  "source"     : { "channel": "whatsapp", "duration_seconds": 150 },
  "language"   : { "detected": "en", "translated_to": null },
  "files"      : {
    "transcript" : "transcript.md",
    "debrief"    : "debrief.md",
    "infographic": "infographic.png"
  },
  "topics"     : ["overview", "ledger", "airgap", "agents"],
  "models"     : [{ "step": "transcribe", "model": "…", "cost_gbp": 0.01 }]
}
```

Keep `audio.opus` out unless you need it — it dominates the size budget (§9) and is the most sensitive
part of the bundle.

---

## 9. Size limits

| Path | Ceiling | When |
|---|---|---|
| **Direct upload** (`/upload/{id}`) | keep the encrypted payload under **~4 MB** | the normal case |
| Multipart / presigned | larger | requires the S3 backend; check `GET /api/presigned/capabilities` first |

The Lambda URL caps a request body at 6 MB and the browser client switches to presigned at 5 MB, so
~4 MB is the safe direct-path working limit. A transcript, debrief, manifest and one infographic
compress to well under that; **audio does not**. If you must include audio, either check
`presigned_upload` in the capabilities response and take the multipart path, or link the audio
separately.

---

## 10. How a receiving agent consumes the link

This is the payoff for "give the link to an agent". Two calls, no SG/Send account, no browser — the
key from the fragment is all it needs.

```python
import base64, json, requests, struct
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def fetch_bundle(share_url: str) -> tuple[dict, bytes]:
    base, frag         = share_url.split('/en-gb/download/#')
    transfer_id, key_s = frag.split('/', 1)
    key = base64.urlsafe_b64decode(key_s + '=' * (-len(key_s) % 4))

    r = requests.get(f'{base}/api/transfers/download/{transfer_id}', timeout=60)  # no auth needed
    r.raise_for_status()
    blob = r.content

    plain = AESGCM(key).decrypt(blob[:12], blob[12:], None)
    assert plain[:7] == b'SGMETA\x00'
    (n,) = struct.unpack('>I', plain[7:11])
    return json.loads(plain[11:11 + n]), plain[11 + n:]                            # (metadata, zip bytes)

meta, zip_bytes = fetch_bundle('https://send.sgraph.ai/en-gb/download/#d6de8f16…/W6bj…')
print(meta['filename'])
```

If the agent's transport is JSON-only (an MCP tool, for instance), use
`GET /api/transfers/download-base64/{id}` instead — it returns
`{"transfer_id": …, "data": "<base64>", "file_size_bytes": …}`. Decode `data` and decrypt identically.

**Downloads are counted.** If you set `max_downloads`, an agent retrying a failed run will burn through
the allowance. For agent-facing links prefer `max_downloads: 0` with a short `expires_at`.

---

## 11. Lifecycle: expiry, caps and revocation

Set `delete_auth_hash` at create time to keep the ability to revoke a link:

```python
import hashlib
secret = os.urandom(16).hex()                       # store alongside the transfer_id
create_body['delete_auth_hash'] = hashlib.sha256(secret.encode()).hexdigest()
```

Then, to revoke:

```http
DELETE /api/transfers/delete/{transfer_id}
x-sgraph-access-token: <access key>
x-sgraph-transfer-delete-auth: <the secret, not the hash>
```

Verified: wrong secret → **403**, correct → **200**, and the payload is then **404**. Without a
`delete_auth_hash` at create time, deletion is disabled for that transfer.

Recommended defaults for the WhatsApp flow: `expires_at` = 30 days, `max_downloads` = 0 (unlimited),
`delete_auth_hash` set, secret stored next to the transfer id in your run record.

---

## 12. Verified behaviour

Executed against the SG/Send user API, 9 Sep 2026.

| Case | Result |
|---|---|
| Header `x-sgraph-access-token` | **200** ✓ |
| Header `x-sgraph-send-access-token` | **401** — this name does not work |
| Query `?access_token=…` | 200 (works; avoid — leaks into logs) |
| No token / wrong token | **401** |
| `download` / `info` with no token | **200** — public by design |
| Full round trip: wrap → encrypt → create → upload → complete → download → decrypt → unwrap | **byte-identical** zip recovered, filename intact |
| Download #3 with `max_downloads: 2` | **410** |
| Download of an expired transfer | **410** |
| `DELETE` wrong / correct delete-auth | **403** / **200**, then **404** |
| `GET /d/{transfer_id}` (the `download_url` from `complete`) | **404** — not a route; build the link yourself |
| Key length | 32 bytes → 43 base64url chars |
| Encrypted payload overhead | plaintext + 28 bytes (12 IV + 16 tag) |

---

## 13. Rules to hold to

1. **Never log or return the decryption key** outside the share link. It is not an identifier — anyone
   with it reads the bundle. In n8n that means keeping it out of node output that gets persisted.
2. **Never put the access key in a URL.** Header only.
3. **Never reuse an IV.** Generate 12 fresh random bytes per upload. The code above does.
4. **Don't put the filename outside the envelope.** `content_type_hint` is stored in the clear; the
   filename belongs in SGMETA, encrypted.
5. **Set an expiry.** A WhatsApp link lives forever in someone's chat history; the transfer should not.
6. **Treat `410` as "gone, expected"** (expired or exhausted) and `404` as "never existed or deleted".
   Both are normal end states, not errors to retry.
7. **Don't send audio by default.** It is the largest and most sensitive artefact in the bundle.

---

## 14. Alternative: a browsable vault instead of a zip

If you would rather hand over something an agent can *browse* — reading `transcript.md` without
downloading the whole bundle, or watching a lane for new debriefs — SG/Send's vault API is the other
option. A vault is a versioned, encrypted tree with its own share link, and can render its own
`index.html` as an app. That is a larger integration than this one; start from the `sgit` CLI
(`pip install sgit-ai`) and `library/guides/vault-html/AUTHORING.md` in the SG/Send repo.

For the WhatsApp flow described here — one bundle per memo, handed over once — the transfer API in this
guide is the simpler and better fit.

---

*This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).*
