# SGraph Send — Frontend UI Architectural Plan

**Author:** Claude (Architect role)
**Type:** Plan Mode document (independent architectural plan)
**Date:** 2026-02-08
**Status:** DRAFT — awaiting comparison with implementation plan

---

## 1. Page Breakdown

The frontend is a static site (HTML + JS + CSS) served from S3 via CloudFront. No framework for MVP — vanilla JavaScript with the Web Crypto API for encryption.

### 1.1 Pages

| Page | URL Path | Purpose | Auth |
|------|----------|---------|------|
| **Upload** | `/` | Token entry, file/text upload, encryption, upload | Sender token |
| **Upload Result** | `/s/{transfer_id}` | Shows download link + key + transparency panel | None (generated after upload) |
| **Download** | `/d/{transfer_id}` | Key entry, download, decrypt, save | None (public) |
| **Admin** | `/admin` | Token management, usage stats | Admin key |
| **How It Works** | `/how` | Explanation of encryption model | None |
| **Register Interest** | `/register` | Mailing list sign-up | None |

### 1.2 URL Routing

Since the frontend is static (no server-side routing), URL routing is handled via:
- CloudFront behaviours routing `/api/*` to API Gateway, everything else to S3
- S3 static website hosting with routing rules, or
- A single `index.html` with client-side hash routing (`/#/d/{id}`)

**Recommendation for MVP:** Use hash-based routing (`/#/upload`, `/#/d/{id}`, `/#/s/{id}`, `/#/admin`). This works with S3 static hosting without CloudFront routing rules. All requests serve the same `index.html`, and JavaScript handles routing.

---

## 2. Component Structure

### 2.1 File Structure

```
frontend/
├── index.html              # Shell HTML, loads app.js
├── css/
│   ├── main.css            # Core styles
│   └── components.css      # Component-specific styles
├── js/
│   ├── app.js              # Router, page loading, global state
│   ├── crypto.js           # AES-256-GCM encrypt/decrypt (Web Crypto API)
│   ├── api.js              # API client (fetch wrapper for all endpoints)
│   ├── pages/
│   │   ├── upload.js       # Upload page logic
│   │   ├── result.js       # Upload result page (link + key + transparency)
│   │   ├── download.js     # Download page logic
│   │   ├── admin.js        # Admin dashboard logic
│   │   ├── how.js          # How-it-works page
│   │   └── register.js     # Register interest page
│   └── components/
│       ├── transparency.js # Reusable transparency panel
│       ├── dropzone.js     # Drag-and-drop file zone
│       ├── copy-button.js  # Copy-to-clipboard button
│       └── progress.js     # Upload/download progress bar
├── assets/
│   └── (icons, etc.)
└── manifest.json           # PWA manifest (minimal for MVP)
```

### 2.2 No Framework Rationale

| Concern | Why Vanilla JS Is Sufficient |
|---------|------------------------------|
| Complexity | 6 pages, ~10 components — not enough to justify a build system |
| Bundle size | Zero dependencies → instant load, no tree-shaking needed |
| Web Crypto | Native browser API, no npm packages needed |
| Reactivity | Pages are mostly form→result flows, not complex state management |
| Deployment | Static files → S3, no build step, no node_modules |
| Developer onboarding | Anyone who knows HTML/JS can contribute |

If the frontend grows beyond MVP (plugins, i18n, themes), we'll evaluate Preact or Alpine.js for Phase 2.

---

## 3. Client-Side Encryption Flow

### 3.1 Key Generation

```javascript
// Generate a 256-bit AES-GCM key
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,        // extractable (we need to export it for sharing)
  ["encrypt", "decrypt"]
);

// Export key as raw bytes → base64url
const rawKey = await crypto.subtle.exportKey("raw", key);
const keyBase64 = base64urlEncode(rawKey);
// Result: 44-char base64url string (e.g., "a3Bf9xK2mP7qR4sT8vW1yZ0...")
```

### 3.2 Encryption

```javascript
// Generate a random 12-byte IV (standard for AES-GCM)
const iv = crypto.getRandomValues(new Uint8Array(12));

// Encrypt the file
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: iv, tagLength: 128 },
  key,
  fileArrayBuffer
);

// Bundle: IV (12 bytes) + ciphertext (includes auth tag)
const payload = new Uint8Array(iv.length + ciphertext.byteLength);
payload.set(iv, 0);
payload.set(new Uint8Array(ciphertext), iv.length);
// payload is now the binary blob to upload as payload.enc
```

### 3.3 Decryption

```javascript
// Import key from base64url string
const rawKey = base64urlDecode(keyBase64);
const key = await crypto.subtle.importKey(
  "raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]
);

// Extract IV (first 12 bytes) and ciphertext (rest)
const iv = payload.slice(0, 12);
const ciphertext = payload.slice(12);

try {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv, tagLength: 128 },
    key,
    ciphertext
  );
  // plaintext is the original file as ArrayBuffer
} catch (e) {
  // DOMException: "The operation failed for an operation-specific reason"
  // This means wrong key (GCM authentication tag mismatch)
  showError("Wrong decryption key. Please check and try again.");
}
```

### 3.4 Key Format

- **Length:** 256 bits = 32 bytes → 44 chars in base64url (with padding) or 43 chars (without)
- **Encoding:** base64url (RFC 4648 §5) — URL-safe, no `+` or `/`, uses `-` and `_`
- **Display:** Full key shown, with copy button. Not truncated.

### 3.5 payload.enc Format

```
Byte 0-11:   IV (12 bytes, randomly generated)
Byte 12-N:   AES-GCM ciphertext (original file + 16-byte auth tag appended by GCM)
```

Total size: original file size + 12 (IV) + 16 (auth tag) = original + 28 bytes.

---

## 4. Pre-Signed URL Upload Flow (Browser Perspective)

```
User Action                     Browser (JavaScript)               Server / S3
─────────────                   ──────────────────                ────────────
1. Enter token + drop file      Store file in memory
                                │
2. Click "Encrypt & Upload"     │
                                ├── POST /api/v1/transfers
                                │   { file_size, content_type }
                                │   Authorization: Bearer tok_x
                                │                                  ──► validate token
                                │                                  ──► create meta.json
                                │                                  ──► generate presigned PUT
                                │   ◄── { transfer_id, upload_url }
                                │
                                ├── Generate AES-256-GCM key
                                ├── Encrypt file → payload blob
                                │   (show "Encrypting..." progress)
                                │
                                ├── PUT upload_url (body: payload)
                                │   (show upload progress via         ──► S3 direct
                                │    XMLHttpRequest.upload.onprogress)
                                │   ◄── 200 OK
                                │
                                ├── POST /api/v1/transfers/{id}/complete
                                │   Authorization: Bearer tok_x
                                │                                  ──► update meta.json
                                │   ◄── { download_link, transparency }
                                │
3. See result page              ├── Display:
                                │   - Download link + copy button
                                │   - Decryption key + copy button
                                │   - Transparency panel
                                │   - Separate-channels guidance
```

### 4.1 Progress Indicators

| Phase | How to Track | Display |
|-------|-------------|---------|
| Encrypting | Track bytes processed (chunked if needed) | "Encrypting... 45%" |
| Uploading | `XMLHttpRequest.upload.onprogress` | "Uploading... 72%" |
| Completing | Short HTTP request | "Finalising..." (spinner) |

**Note:** Use `XMLHttpRequest` (not `fetch`) for upload progress tracking, as `fetch` doesn't support upload progress events.

---

## 5. Transparency Panel Design

### 5.1 Reusable Component

The transparency panel is a self-contained UI component that accepts a transparency data object and renders it.

```javascript
// Usage:
renderTransparencyPanel(containerElement, {
  title: "What we stored about this transfer",
  captured: [
    { label: "Your IP address",  value: "203.0.113.42" },
    { label: "Upload time",      value: "2026-02-08 14:32 UTC" },
    { label: "File size",        value: "4.8 MB" }
  ],
  not_stored: [
    { label: "File name",      reason: "NOT stored" },
    { label: "File content",   reason: "Encrypted (we cannot read it)" },
    { label: "Decryption key", reason: "NOT stored (only you have it)" }
  ],
  footer: "That's it. Nothing else."
});
```

### 5.2 Visual Design

```
┌──────────────────────────────────────────────┐
│  What we stored about this transfer          │
│                                              │
│  Your IP address:      203.0.113.42          │
│  Upload time:          2026-02-08 14:32 UTC  │
│  File size:            4.8 MB                │
│  File name:            NOT stored            │
│  File content:         Encrypted (we         │
│                        cannot read it)       │
│  Decryption key:       NOT stored            │
│                        (only you have it)    │
│                                              │
│  That's it. Nothing else.                    │
└──────────────────────────────────────────────┘
```

Stored fields shown with actual values. Not-stored fields shown with dimmed text and a visual X or strikethrough.

---

## 6. Error Handling UX

### 6.1 Error Categories

| Error | When | User Sees | Recovery |
|-------|------|-----------|----------|
| Wrong key | GCM auth tag failure on decrypt | "Wrong decryption key. Please check and try again." | Re-enter key field, try again |
| Expired transfer | GET /transfers/{id} returns 410 | "This transfer has expired and the file has been deleted." | No recovery, static message |
| Invalid token | POST /transfers returns 401 | "Invalid access token. Please check your token." | Re-enter token, try again |
| Network error | Fetch fails | "Connection error. Please check your internet and try again." | Retry button |
| Upload failed | PUT to S3 fails (pre-signed URL expired or error) | "Upload failed. Please try again." | Restart upload flow |
| File too large | file_size > max | "File too large. Maximum size is 100MB." | Choose smaller file |
| Transfer not ready | GET download returns 425 | "This transfer is still being uploaded. Please wait." | Auto-retry after 5 seconds |

### 6.2 Error Display Pattern

Errors are shown inline on the page (not alerts/popups). Error messages are shown in a red-bordered box with clear text. No technical details (error codes, stack traces).

---

## 7. Page Designs (Detailed)

### 7.1 Upload Page (`/`)

**States:**
1. **Token entry** — Token input + Verify button
2. **Token verified** — Green checkmark, file drop zone appears
3. **File selected** — File name + size displayed, Encrypt & Upload button enabled
4. **Encrypting** — Progress bar, "Encrypting..."
5. **Uploading** — Progress bar, "Uploading..."
6. **Completing** — Spinner, "Finalising..."
7. **Error** — Error message with retry

**Components:** Token input, file drop zone, text input (toggle), progress bar, error display.

### 7.2 Upload Result Page (`/s/{transfer_id}`)

**Components:** Download link + copy button, decryption key + copy button, separate-channels guidance callout, transparency panel, transfer status section (download count, expiry).

**Behaviour:** Polls `GET /transfers/{id}` every 5 seconds to update download count.

### 7.3 Download Page (`/d/{transfer_id}`)

**States:**
1. **Loading** — Fetching transfer metadata
2. **Ready** — Shows file info, key input field, Download & Decrypt button
3. **Downloading** — Progress bar, "Downloading encrypted file..."
4. **Decrypting** — "Decrypting..." (usually instant)
5. **Complete** — Browser Save As triggered
6. **Error** — Wrong key, expired, or network error

**Components:** Transfer info (size, date, expiry), key input, Download & Decrypt button, progress bar, transparency panel (shown BEFORE download with pre-download data), error display.

### 7.4 Admin Page (`/admin`)

**Components:** Admin key input, token list table (id, label, status, usage_count, last_used, actions), create token form, aggregate stats display.

### 7.5 How It Works Page (`/how`)

Static content explaining: what SGraph Send is, client-side encryption, zero-knowledge, what the server can/cannot see, how to share safely.

### 7.6 Register Interest Page (`/register`)

Simple form: email input, optional message textarea, submit button, confirmation message.

---

## 8. Static Hosting Model

### 8.1 S3 Configuration

```
sgraph-send-{tier}-frontend/
├── index.html
├── css/
│   ├── main.css
│   └── components.css
├── js/
│   ├── app.js
│   ├── crypto.js
│   ├── api.js
│   ├── pages/
│   └── components/
└── assets/
```

- Bucket configured for static website hosting
- Block all public access (served via CloudFront only)
- Versioned deployments via content-hashed filenames or CloudFront invalidation

### 8.2 CloudFront Configuration

| Behaviour | Origin | Path Pattern |
|-----------|--------|-------------|
| Default | S3 frontend bucket | `*` (everything) |
| API | API Gateway | `/api/*` |

- Custom error response: 404 → `/index.html` (for client-side routing)
- HTTPS only, redirect HTTP → HTTPS
- Custom domain: `{tier}-send.sgraph.ai` (or `send.sgraph.ai` for prod)
- Cache: long TTL for CSS/JS (content-hashed), short TTL for index.html

---

## 9. Browser Compatibility

### 9.1 Required APIs

| API | Used For | Browser Support |
|-----|----------|----------------|
| Web Crypto API | AES-256-GCM encrypt/decrypt | All modern browsers (Chrome 37+, Firefox 34+, Safari 11+) |
| Fetch API | API calls | All modern browsers |
| Drag and Drop API | File drop zone | All modern browsers |
| Clipboard API | Copy to clipboard | All modern browsers |
| File API | Read file as ArrayBuffer | All modern browsers |
| Blob / URL.createObjectURL | Trigger Save As | All modern browsers |

### 9.2 Target Browsers

- Chrome 90+ (desktop + mobile)
- Firefox 90+ (desktop + mobile)
- Safari 15+ (desktop + iOS)
- Edge 90+

No IE11 support. No polyfills needed for target browsers.
