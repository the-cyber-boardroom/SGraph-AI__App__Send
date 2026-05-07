# Share a Secret — Implementation Plan

**Date:** 07 May 2026  
**Role:** Explorer Dev  
**IFD Target:** v0.3.2 surgical overlay  
**Estimated effort:** 1–2 Explorer sessions  
**Backend work required:** None — backend is already live

---

## 1. What Already Exists (Do Not Touch)

| Component | Location | Status |
|---|---|---|
| AES-256-GCM encryption | `_common/js/crypto.js` | Unchanged |
| Upload pipeline (read → encrypt → create → upload → complete) | `_common/js/components/send-upload/upload-engine.js` | Unchanged |
| Transfer creation with all fields | `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py` | **Already live** |
| `download-base64` endpoint | `/api/transfers/download-base64/{id}` | **Already live** |
| Download limit enforcement | `Transfer__Service._check_download_allowed()` | **Already live** |
| Auto-delete after last download | `Transfer__Service._auto_delete_if_needed()` | **Already live** |
| Expiry enforcement | `Transfer__Service._is_expired()` | **Already live** |
| Sender-controlled delete | `DELETE /api/transfers/delete/{id}` | **Already live** |
| Aurora dark theme + design tokens | `_common/css/design-tokens.css` | Unchanged |
| `SendComponent` base class | `_common/js/base/send-component.js` | Unchanged |

---

## 2. What Needs Building

### 2.1 Tier 1 — Must Have (Phase 1 MVP)

| # | What | Where | Size |
|---|---|---|---|
| A | `ApiClient.createTransfer()` — wire `max_downloads`, `auto_delete`, `expires_at`, `delete_auth_hash` | `api-client.js` (surgical patch in v0.3.2) | ~15 lines |
| B | "Secret" tab in `upload-step-select` — new render mode `_renderSecretInput()` | `upload-step-select.js` (surgical patch in v0.3.2) | ~80 lines |
| C | Secret config propagation through orchestrator — new state hint `_secretConfig` | `send-upload.js` (surgical patch in v0.3.2) | ~30 lines |
| D | Upload engine passes secret params when config set | `upload-engine.js` (surgical patch in v0.3.2) | ~20 lines |
| E | Done state: show share link + kill link for secret mode | `upload-step-done` (surgical patch in v0.3.2) | ~60 lines |
| F | New receive page: `/en-gb/s/index.html` | New file | ~80 lines HTML |
| G | New receive component: `send-secret-view.js` | New file | ~150 lines |
| H | New receive CSS: `send-secret-view.css` | New file | ~60 lines |

### 2.2 Tier 2 — Nice to Have (Phase 2)

| # | What | Where |
|---|---|---|
| I | Standalone focused page `/en-gb/secret/index.html` | New file |
| J | Admin console "Share via Secret Link" button | Admin UI (separate session) |
| K | Secret status check: sender can see if link was opened | New endpoint + UI |
| L | QR code on done state for in-person sharing | `upload-step-done` patch |
| M | Copy-on-click: auto-select + copy the link field | JS utility |

---

## 3. Surgical Changes — Exact Specifications

### Change A — `api-client.js` patch

Add optional parameters to `createTransfer()`. Must be backward-compatible — if params not passed, send nothing (backend defaults to unlimited/no expiry).

```javascript
// v0.3.2/api-client-secret.js  (surgical patch — adds optional secret params)
ApiClient.createTransfer = async function(fileSize, contentType, secretConfig) {
    var body = {
        file_size_bytes:   fileSize,
        content_type_hint: contentType || 'application/octet-stream'
    };
    if (secretConfig) {
        if (secretConfig.max_downloads)     body.max_downloads     = secretConfig.max_downloads;
        if (secretConfig.auto_delete)       body.auto_delete       = secretConfig.auto_delete;
        if (secretConfig.expires_at)        body.expires_at        = secretConfig.expires_at;
        if (secretConfig.delete_auth_hash)  body.delete_auth_hash  = secretConfig.delete_auth_hash;
    }
    var res = await this._fetch('/api/transfers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
        throw new Error('Create transfer failed: ' + res.status);
    }
    return res.json();
};
```

### Change B — `upload-step-select.js` patch (new Secret tab)

Adds `_renderSecretInput()` and wires the "Secret" tab button.  
Fires a new event `step-secret-submit` with `{ text, config }` where config = `{ maxDownloads, expiresInHours }`.

```javascript
// v0.3.2/upload-step-select-secret.js  (surgical — adds secret mode)

// New input mode value
// this._inputMode can now be 'file' | 'text' | 'secret'

UploadStepSelect.prototype._renderIdle = function() {
    var maxSize = this._fmt(this._maxFileSize);
    var isFile   = this._inputMode === 'file';
    var isText   = this._inputMode === 'text';
    var isSecret = this._inputMode === 'secret';

    var modeToggle = `
        <div class="mode-toggle">
            <button class="mode-toggle__btn ${isFile   ? 'mode-toggle__btn--active' : ''}" id="mode-file">File</button>
            <button class="mode-toggle__btn ${isText   ? 'mode-toggle__btn--active' : ''}" id="mode-text">Text</button>
            <button class="mode-toggle__btn mode-toggle__btn--secret ${isSecret ? 'mode-toggle__btn--active' : ''}" id="mode-secret">🔒 Secret</button>
        </div>
    `;

    if (isSecret) {
        this._container.innerHTML = `
            ${modeToggle}
            <div class="secret-input-area">
                <textarea class="text-input" id="secret-input" 
                          placeholder="Type or paste the secret to encrypt and share..."
                          spellcheck="false"></textarea>
                <div class="text-input-footer">
                    <span class="text-input-count" id="secret-char-count">0 characters</span>
                </div>
            </div>
            <div class="secret-config">
                <div class="secret-config__row">
                    <span class="secret-config__label">Expires after</span>
                    <div class="secret-config__options" id="max-downloads-group">
                        <label><input type="radio" name="max-dl" value="1" checked> 1 view</label>
                        <label><input type="radio" name="max-dl" value="5"> 5 views</label>
                        <label><input type="radio" name="max-dl" value="10"> 10 views</label>
                    </div>
                </div>
                <div class="secret-config__row">
                    <span class="secret-config__label">Expires in</span>
                    <div class="secret-config__options" id="expiry-group">
                        <label><input type="radio" name="expiry" value="1"> 1 hour</label>
                        <label><input type="radio" name="expiry" value="24" checked> 24 hours</label>
                        <label><input type="radio" name="expiry" value="168"> 7 days</label>
                        <label><input type="radio" name="expiry" value="0"> No time limit</label>
                    </div>
                </div>
            </div>
            <div class="trust-badge">
                <span class="trust-badge__icon">🔒</span>
                <span>Zero cookies · Zero tracking · We cannot read your secret</span>
            </div>
            <div class="secret-actions">
                <button class="btn btn-primary" id="secret-send-btn">Create Secret Link →</button>
            </div>
        `;
    } else {
        // ... original file / text render (unchanged)
    }
};
```

### Change C — `send-upload.js` patch (secret config flow)

When `step-secret-submit` fires, skip steps 2–4 (delivery/share/confirm) and go straight to processing with pre-baked config.

```javascript
// v0.3.2/send-upload-secret.js  (surgical — adds secret fast path)

SendUpload.prototype._wireEventsSecret = function() {
    var self = this;
    var c = this.querySelector('.step-content');
    if (!c) return;

    c.addEventListener('step-secret-submit', function(e) {
        var text   = e.detail.text;
        var config = e.detail.config;  // { maxDownloads, expiresInHours }

        // Convert text to File (same as _onTextSubmit)
        var blob = new Blob([text], { type: 'text/plain' });
        var file = new File([blob], 'secret.txt', { type: 'text/plain' });
        self.selectedFile = file;

        // Store secret config for upload engine
        // expires_at uses Timestamp_Now format: int milliseconds since epoch (matches Date.now())
        self._secretConfig = {
            max_downloads: config.maxDownloads,
            auto_delete:   config.maxDownloads > 0,
            expires_at:    config.expiresInHours > 0
                           ? Date.now() + (config.expiresInHours * 3600000)
                           : 0
        };
        self._shareMode        = 'combined';    // Key always in URL
        self._selectedDelivery = 'download';    // Not gallery, not browse
        self._isSecretMode     = true;

        // Skip steps 2-4, go straight to processing
        self._startProcessing();
    });
};
```

### Change D — `upload-engine.js` patch (pass secret params)

```javascript
// v0.3.2/upload-engine-secret.js  (surgical — pass secretConfig to createTransfer)

var _origRun = UploadEngine.run;
UploadEngine.run = async function(opts) {
    // If secretConfig provided, patch ApiClient.createTransfer for this call
    if (opts.secretConfig) {
        var _origCreate = ApiClient.createTransfer.bind(ApiClient);
        ApiClient.createTransfer = async function(fileSize, contentType) {
            ApiClient.createTransfer = _origCreate;  // Restore immediately
            return _origCreate(fileSize, contentType, opts.secretConfig);
        };
    }
    return _origRun.call(this, opts);
};
```

### Change E — `upload-step-done.js` patch (secret mode display)

When `isSecretMode` is true, show the secret-specific done state:
- Share link (the combined URL with `#key`)
- Kill link (derived from `delete_auth`)
- Ephemerality notice

```javascript
// v0.3.2/upload-step-done-secret.js  (surgical — secret mode done state)

UploadStepDone.prototype._renderSecretDone = function() {
    var shareUrl  = this.result.combinedUrl;
    var killUrl   = this._buildKillUrl(this.result);
    var configMsg = this._buildConfigMessage();

    this.innerHTML = `
        <div class="secret-done">
            <div class="secret-done__header">🔒 Secret link created</div>
            
            <div class="secret-done__section">
                <div class="secret-done__label">Share this link:</div>
                <div class="secret-done__link-box">
                    <input type="text" readonly value="${shareUrl}" id="share-link-input">
                    <button id="copy-share-link">📋 Copy Link</button>
                </div>
                <div class="secret-done__config-notice">⚠ ${configMsg}</div>
            </div>

            <div class="secret-done__section secret-done__section--kill">
                <div class="secret-done__label">Kill link (optional — save to delete early):</div>
                <div class="secret-done__link-box secret-done__link-box--secondary">
                    <input type="text" readonly value="${killUrl}" id="kill-link-input">
                    <button id="copy-kill-link">📋 Copy Kill Link</button>
                </div>
            </div>

            <div class="secret-done__actions">
                <button id="email-secret-link">📧 Email Link</button>
                <button id="create-another-secret">🔄 Create Another Secret</button>
            </div>

            <div class="secret-done__transparency">
                🔒 The server holds only encrypted ciphertext. The decryption key is 
                embedded in the link — it never left your browser.
            </div>
        </div>
    `;
};

UploadStepDone.prototype._buildKillUrl = function(result) {
    // Kill URL: /en-gb/s/kill/{transferId}#{deleteAuth}
    // deleteAuth was derived during upload: sha256(keyHex + ':delete')
    var base = window.location.origin + '/en-gb/s/kill/' + result.transferId;
    return base + '#' + (result.deleteAuth || '');
};

UploadStepDone.prototype._buildConfigMessage = function() {
    var cfg = this._secretConfig || {};
    var parts = [];
    if (cfg.max_downloads === 1) parts.push('1 view');
    else if (cfg.max_downloads > 1) parts.push(cfg.max_downloads + ' views');
    if (cfg.expires_at) {
        // expires_at is int ms — Date constructor accepts this directly
        var exp = new Date(cfg.expires_at);
        parts.push('expires ' + exp.toLocaleString());
    }
    parts.push('then auto-deleted');
    return parts.join(' · ');
};
```

---

## 4. New Files

### `/en-gb/s/index.html` — Secret Receive Page

Minimal HTML — loads only what's needed for decrypt + display.

```html
<!DOCTYPE html>
<html lang="en-GB">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SG/Send — Secret</title>
    <link rel="icon" type="image/svg+xml" href="../../_common/favicon.svg">
    <link rel="stylesheet" href="../../_common/fonts/fonts.css">
    <link rel="stylesheet" href="../../_common/css/design-tokens.css">
    <link rel="stylesheet" href="../../_common/js/components/send-secret-view/send-secret-view.css">
</head>
<body>
    <header class="secret-page-header">
        <span class="secret-page-logo">SG/Send 🔒</span>
        <a href="https://sgraph.ai" class="secret-page-home">sgraph.ai</a>
    </header>

    <main>
        <send-secret-view></send-secret-view>
    </main>

    <script src="../../_common/js/build-info.js"></script>
    <script src="../../_common/js/crypto.js"></script>
    <script src="../../_common/js/api-client.js"></script>
    <script src="../../_common/js/base/send-helpers.js"></script>
    <script src="../../_common/js/base/send-component-paths.js"></script>
    <script src="../../_common/js/base/send-component.js"></script>
    <script>SendComponentPaths.init('../../_common');</script>
    <script src="../../_common/js/components/send-secret-view/send-secret-view.js"></script>
    <script>
        document.body.setAttribute('data-ready', 'true');
    </script>
</body>
</html>
```

### `send-secret-view.js` — Receive Web Component

Shadow DOM component. Reads `transferId` from URL path, `key` from URL fragment. Fetches, decrypts, displays.

```javascript
class SendSecretView extends SendComponent {
    static useShadow = false;
    static useTemplate = false;

    onReady() {
        this._run();
    }

    async _run() {
        this._showLoading();
        try {
            // 1. Parse URL
            var pathParts  = window.location.pathname.split('/');
            var transferId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];
            var keyHex     = window.location.hash.slice(1);

            if (!transferId || !keyHex) {
                this._showError('invalid-link');
                return;
            }

            // 2. Fetch ciphertext via download-base64
            var data = await ApiClient.downloadBase64(transferId);

            // 3. Decode base64 → ArrayBuffer
            var cipherBuf = this._b64ToArrayBuffer(data.data);

            // 4. Import key from hex
            var keyBytes  = this._hexToBytes(keyHex);
            var cryptoKey = await crypto.subtle.importKey(
                'raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
            );

            // 5. Decrypt (matches crypto.js AES-256-GCM format: 12-byte IV prepended)
            var iv          = cipherBuf.slice(0, 12);
            var ciphertext  = cipherBuf.slice(12);
            var plainBuf    = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                cryptoKey, ciphertext
            );

            // 6. Decode UTF-8
            var plainText = new TextDecoder().decode(plainBuf);

            // 7. Check if this was auto-deleted (fetch info to know)
            var info = await ApiClient.getTransferInfo(transferId).catch(() => null);
            var wasDeleted = info && info.downloads_remaining === 0 && info.max_downloads > 0;

            // 8. Display
            this._showSecret(plainText, wasDeleted, info);

        } catch(err) {
            if (err.message && err.message.includes('download')) {
                this._showError('already-viewed');
            } else if (err.message && err.message.includes('expired')) {
                this._showError('expired');
            } else {
                this._showError('decrypt-failed');
            }
        }
    }

    _showSecret(text, wasDeleted, info) { /* render Screen D */ }
    _showError(type)                    { /* render Screens E/F/G based on type */ }
    _showLoading()                      { /* spinner */ }

    _b64ToArrayBuffer(b64) {
        var binary = atob(b64);
        var bytes  = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    _hexToBytes(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2)
            bytes[i/2] = parseInt(hex.substr(i, 2), 16);
        return bytes;
    }
}

customElements.define('send-secret-view', SendSecretView);
```

**Note:** `ApiClient.downloadBase64()` needs to be added to `api-client.js`:
```javascript
async downloadBase64(transferId) {
    var res = await this._fetch('/api/transfers/download-base64/' + transferId, {
        headers: this._authHeaders()
    });
    if (!res.ok) throw new Error('download:' + res.status);
    return res.json();
},
```

---

## 5. IFD File Layout for v0.3.2

```
v0/v0.3/v0.3.2/
├── _common/
│   └── js/
│       ├── api-client-v032.js                   ← Patches createTransfer + adds downloadBase64
│       └── components/
│           ├── send-upload/
│           │   ├── upload-step-select-secret.js  ← Adds Secret tab + _renderSecretInput
│           │   ├── send-upload-secret.js          ← Adds step-secret-submit handler
│           │   ├── upload-engine-secret.js        ← Passes secretConfig to createTransfer
│           │   └── upload-step-done-secret.js     ← Secret mode done state
│           └── send-secret-view/
│               ├── send-secret-view.js            ← New receive component
│               └── send-secret-view.css           ← New receive styles
└── en-gb/
    ├── index.html                                 ← Adds v0.3.2 secret patches
    └── s/
        └── index.html                             ← New receive page
```

The `en-gb/index.html` overlay loads the v0.3.2 patches **after** v0.3.0 base, consistent with the IFD surgical overlay pattern.

---

## 6. API Client Change — `downloadBase64` (new method)

The `download-base64` endpoint already exists on the backend. We just need to add it to the client:

```javascript
// Patch in v0.3.2/api-client-v032.js
ApiClient.downloadBase64 = async function(transferId) {
    var res = await this._fetch('/api/transfers/download-base64/' + transferId, {
        headers: this._authHeaders()
    });
    if (!res.ok) {
        if (res.status === 403 || res.status === 410)
            throw new Error('download:exhausted');
        if (res.status === 404)
            throw new Error('download:not-found');
        throw new Error('download:' + res.status);
    }
    return res.json();
};
```

---

## 7. Delete Auth Derivation

The `delete_auth` is derived in the browser from the encryption key so the sender can prove ownership without storing an additional secret:

```javascript
// Derive delete auth from the encryption key (browser-side only)
async function deriveDeleteAuth(keyHex) {
    var enc      = new TextEncoder();
    var material = enc.encode(keyHex + ':sgraph-delete-v1');
    var hash     = await crypto.subtle.digest('SHA-256', material);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}
// Store on server: sha256(delete_auth)
// Kill URL fragment: #delete_auth (not sha256 — server hashes it)
```

The server already stores `delete_auth_hash = sha256(delete_auth)` and validates it on delete.

---

## 8. Encryption Flow — What Changes

Current upload engine (simplified):
```
1. Read file as ArrayBuffer
2. Generate random AES-256-GCM key
3. Generate random 12-byte IV
4. Encrypt: [IV (12 bytes)] + [ciphertext]
5. createTransfer(size, type)    ← no secret params
6. uploadPayload(id, encrypted)
7. completeTransfer(id)
8. Return { transferId, keyString }  ← key hex for URL fragment
```

New upload engine (secret mode):
```
1–4. Same
5. deriveDeleteAuth(keyHex)         ← NEW: derive delete auth
6. createTransfer(size, type, {     ← NEW: pass secret config
       max_downloads, auto_delete,
       expires_at,
       delete_auth_hash: sha256(deleteAuth)
   })
7–8. Same
9. Return { transferId, keyString, deleteAuth }  ← NEW: return deleteAuth for kill URL
```

---

## 9. Backend Changes Required — `expires_at` Type Fix

The backend endpoints and enforcement logic are fully live. One schema change is needed before wiring the frontend:

### 9.1 What's live and ready

| Used by | Backend endpoint | Status |
|---|---|---|
| Secret creation | `POST /api/transfers/create` with `max_downloads`, `auto_delete`, `expires_at`, `delete_auth_hash` | **Live** |
| Secret fetch | `GET /api/transfers/download-base64/{id}` | **Live** |
| Status check | `GET /api/transfers/info/{id}` returns `downloads_remaining`, `is_expired` | **Live** |
| Kill secret | `DELETE /api/transfers/delete/{id}` with `x-sgraph-transfer-delete-auth` header | **Live** |

### 9.2 Schema type mismatch — must fix before wiring

`Schema__Transfer.py` currently declares `expires_at: str` (ISO-8601). The project-wide timestamp convention is `Timestamp_Now` — an int representing **milliseconds since epoch** (13 digits, matching `Date.now()` in JS). This inconsistency must be resolved before the frontend can safely send `expires_at`.

**Required backend changes:**

1. **`Schema__Transfer__Create.expires_at`** — change `str` → `Timestamp_Now`
2. **`Schema__Transfer__Create.expires_at` in response schema** — change `str` → `Timestamp_Now`
3. **`Transfer__Service._is_expired()`** — replace `datetime.fromisoformat(exp)` with integer comparison:

```python
# Current (string):
@staticmethod
def _is_expired(meta):
    exp = meta.get('expires_at', '')
    if not exp:
        return False
    return datetime.now(timezone.utc) > datetime.fromisoformat(exp)

# Required (Timestamp_Now int, milliseconds):
@staticmethod
def _is_expired(meta):
    exp = meta.get('expires_at', 0)
    if not exp:
        return False
    import time
    return (time.time() * 1000) > exp
```

The JS frontend sends `expires_at = Date.now() + (hours * 3600_000)` — integer milliseconds. The Python side should compare `time.time() * 1000 > expires_at` (both in ms).

---

## 10. Test Plan

| Test | Type | How |
|---|---|---|
| Create secret with max_downloads=1 | Unit / Integration | Verify `createTransfer` sends correct JSON body |
| Auto-delete after first download | Integration | Download twice — second should return 403/410 |
| Expiry enforcement | Integration | Create with `expires_at` in past — download should fail |
| Delete auth round-trip | Integration | Create with hash, delete with derived auth, verify 404 |
| Secret receive page decrypts correctly | E2E | Create secret in browser → open link in new tab → verify text matches |
| Already-viewed page shows correct message | E2E | Open link twice → verify error state |
| Kill link works | E2E | Create → open kill link → confirm → verify original link returns "deleted" |
| N-view mode allows N views | E2E | Create with max_downloads=3 → open 3 times → 4th returns error |
| Mobile: link works from WhatsApp | Manual | Test on iOS Safari + Android Chrome |

---

## 11. Session Handoff Notes

The backend team has nothing to do. This is a pure frontend Explorer task.

**For the Villager team (when ready to harden):**
- The kill link URL pattern (`/en-gb/s/kill/`) needs a static page or a handler — Phase 1 can use a JS-only approach (delete call happens client-side from the fragment data)
- The `/en-gb/s/` path needs to be added to the CloudFront distribution rules (SPA routing — ensure 404 redirects to the page, not to a real 404)
- Rate limiting on the receive endpoint (already on the download endpoint, but worth confirming it covers `download-base64`)

**Open decisions for Explorer session:**
1. Should the Secret tab be in the main upload page (Tab 3) or a separate focused page? — Recommendation: start with Tab 3 (lower effort), add focused page as Phase 2
2. Should we show the download count to the sender on the done screen? — Recommendation: yes, via a one-time check on the info endpoint 30 seconds after creation
3. Character limit for secrets? — Recommendation: soft warning at 10,000 chars; hard limit at 50,000 (well within transfer size limits)
