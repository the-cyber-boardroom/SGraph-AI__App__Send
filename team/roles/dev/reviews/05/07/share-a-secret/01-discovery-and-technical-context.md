# Share a Secret — Discovery & Technical Context

**Date:** 07 May 2026  
**Role:** Explorer Dev  
**Branch:** `claude/explore-sgraph-ui-ybBkS`  
**Status:** Discovery complete — ready to build  

---

## 1. What We Found

This feature has been waiting for months. The **backend is fully implemented and live in production**. The frontend has never been wired to use it.

### 1.1 The Original Brief

**`team/humans/dinis_cruz/briefs/02/25/v0.6.30__dev-brief__one-time-secret-link.md`** (25 Feb 2026)

This brief specified the complete vision: ephemeral data sharing with configurable lifespans, a dedicated `/s/` URL namespace, zero-knowledge (key in URL fragment), and the full ephemerality spectrum from one-view to time-bounded to N-views.

It has never been acted on — not because it was de-prioritised, but because the backend work got done and the UI work was never picked up.

### 1.2 Backend Capabilities — Already Live, Already Tested

The transfer creation endpoint (`POST /api/transfers/create`) accepts the following fields that the UI currently never sends:

| Field | Type | Meaning | Default |
|---|---|---|---|
| `max_downloads` | `Safe_UInt` | Max downloads before transfer is blocked (0 = unlimited) | `0` |
| `auto_delete` | `bool` | Wipe encrypted payload after the last allowed download | `False` |
| `expires_at` | `str` | ISO-8601 UTC timestamp — hard expiry regardless of downloads | `""` (never) |
| `delete_auth_hash` | `Safe_Str__Id` | SHA-256 of a delete token — enables sender-controlled hard delete | `""` (disabled) |

The transfer info endpoint (`GET /api/transfers/info/{id}`) returns:

| Field | Type | Meaning |
|---|---|---|
| `max_downloads` | `Safe_UInt` | The configured limit |
| `download_count` | `Safe_UInt` | How many downloads have occurred |
| `downloads_remaining` | `Safe_UInt` | Computed remaining (0 = unlimited) |
| `expires_at` | `str` | The expiry timestamp |
| `is_expired` | `bool` | Computed: has it passed the expiry timestamp |

The download endpoint (`GET /api/transfers/download/{id}` and the MCP-safe `GET /api/transfers/download-base64/{id}`) enforces these constraints server-side:

```python
# From Transfer__Service.py (verified):
if self._is_expired(meta):                          # Hard block if past expires_at
    raise ...
if max_dl > 0 and download_count >= max_dl:         # Hard block if downloads exhausted
    raise ...
meta['download_count'] += 1                         # Increment counter
if auto_delete and max_dl > 0 and download_count >= max_dl:
    self._delete_payload(transfer_id)               # Auto-wipe payload
```

The delete endpoint (`DELETE /api/transfers/delete/{id}` with `x-sgraph-transfer-delete-auth` header) allows sender-controlled deletion at any time if `delete_auth_hash` was set at creation.

### 1.3 The Gap — Frontend Never Wires These Fields

The current `api-client.js` `createTransfer()` method sends:

```javascript
body: JSON.stringify({
    file_size_bytes:    fileSize,
    content_type_hint:  contentType || 'application/octet-stream'
    // max_downloads, auto_delete, expires_at, delete_auth_hash — NEVER SENT
})
```

No UI screen gives the user the ability to set expiry or download limits. For "Text" mode specifically, the user types a message, clicks "Encrypt & Send", and goes through the full 6-step wizard — delivery mode, share mode, confirm, encrypt, done. The text becomes a `.txt` file named `message-{timestamp}.txt`. The recipient downloads and decrypts a file — they don't "read a message".

### 1.4 The Download Path for Text — Why It Needs a New Page

The existing download flow (`/en-gb/download/`, `/en-gb/browse/`) is optimised for files:
- It renders file metadata (filename, size, type)
- It offers download-to-disk buttons
- It handles galleries, PDFs, code viewers

For a **secret** (a short piece of sensitive text), the recipient needs:
- The text to appear **inline in the browser** — no file download
- The page to clearly communicate ephemerality ("This secret will self-destruct")
- A copy-to-clipboard button
- A clear "already viewed" or "expired" error state

This requires a new, lightweight receive page at `/en-gb/s/{transfer_id}#{key}`.

### 1.5 The `download-base64` Endpoint Is the Key Enabler

The existing `GET /api/transfers/download-base64/{id}` endpoint returns:

```json
{ "data": "<base64-encoded ciphertext>" }
```

This was originally added for MCP compatibility (Claude.ai cannot handle binary responses). But it also works perfectly for a browser-based inline text receiver:

1. Fetch base64 ciphertext
2. Decode to `ArrayBuffer` in JS
3. Decrypt with AES-256-GCM using key from URL hash fragment
4. `TextDecoder.decode(plaintext)` → display the text

No binary blob handling. No file download. No `<a href="blob:...">` links. Just text in the DOM.

### 1.6 The Existing Text Mode — What Changes

Current "Text" tab flow:
```
Type text → "Encrypt & Send" → 6-step wizard → .txt file download link
```

Target "Secret" flow:
```
Type secret → set expiry (optional) → "Create Secret Link" → copy link → done
Recipient: click link → see text inline → auto-deleted
```

The **existing infrastructure** is reused:
- AES-256-GCM encryption: same `crypto.js` / `upload-engine.js`
- Transfer creation: same `ApiClient.createTransfer()` (with new fields)
- Upload: same `ApiClient.uploadPayload()`
- Complete: same `ApiClient.completeTransfer()`

The **new pieces** are:
- A "Secret" tab / focused UI in `upload-step-select` (or a new focused-use-case page)
- Wiring `max_downloads`, `auto_delete`, `expires_at` in `ApiClient.createTransfer()`
- A new `/en-gb/s/` receive page with inline text display

---

## 2. Security Properties (Unchanged from Original Brief)

The zero-knowledge model is preserved throughout:

| Property | How |
|---|---|
| Server never sees the secret | AES-256-GCM encryption in browser before upload |
| Decryption key never reaches server | Key lives in URL `#fragment` — browsers don't send fragments in HTTP requests |
| Server stores opaque ciphertext only | No filenames, no content hints, no sender info |
| Auto-delete wipes payload | After the last allowed download, the encrypted blob is deleted from storage |
| Expiry is server-enforced | Even if someone has the URL, the server will 404 after `expires_at` |
| Delete auth enables early wipe | Sender can derive a delete token from the encryption key and hard-delete before expiry |

### The Delete Auth Pattern (From Original Brief)

When creating a secret, the sender can derive a `delete_auth` from the encryption key:

```javascript
// Derive delete token from the same key used for encryption
delete_auth = sha256(encryption_key_hex + ':delete')
// Store delete_auth_hash = sha256(delete_auth) on server
// If sender needs to kill the secret early:
//   DELETE /api/transfers/{id}  with header: x-sgraph-transfer-delete-auth: {delete_auth}
```

This means the sender can kill a secret they've already sent — without needing a separate password. If they realise they sent the link to the wrong person, they open the "kill link" and the payload is wiped.

---

## 3. What Is NOT Being Built (Out of Scope)

| Out of Scope | Why |
|---|---|
| PKI mode (recipient's public key) | Future brief — needs PKI infrastructure |
| Human-friendly secret IDs | Original brief explicitly forbids this (metadata leak risk) |
| Passphrase-protected secrets | Phase 2 — adds complexity to the receive page |
| Secret history / management | Phase 2 — needs local storage integration |
| `/s/` namespace on server (URL rewriting) | Phase 1 uses `/en-gb/s/` as a static page path, same as all current pages |
| Mobile native app | Out of scope |
| WhatsApp share button | Phase 2 |

---

## 4. File Evidence

| Evidence | Location |
|---|---|
| Original brief | `team/humans/dinis_cruz/briefs/02/25/v0.6.30__dev-brief__one-time-secret-link.md` |
| Transfer schema with all fields | `sgraph_ai_app_send/lambda__user/schemas/Schema__Transfer.py` |
| Transfer service enforcement | `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py` (lines 59–83, 151–181) |
| API client (shows gap) | `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.0/_common/js/api-client.js` |
| Upload engine (the pipeline) | `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.0/_common/js/components/send-upload/upload-engine.js` |
| Text mode in upload-step-select | `..._common/js/components/send-upload/upload-step-select/upload-step-select.js` lines 128–148 |
| download-base64 endpoint | Reality doc: `team/roles/librarian/reality/send-api/index.md` |
