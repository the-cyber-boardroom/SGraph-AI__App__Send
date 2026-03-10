# Element Spec: File Hasher Tool

**Layer:** Tool (standalone page)
**IFD path:** `tools/v0/v0.1/v0.1.2/en-gb/file-hasher/index.html`
**Effort:** Low
**Batch:** 1 (Foundation)
**Dependencies:** `<sg-upload-dropzone>` (or inline file input if dropzone not ready)

---

## What

A standalone tool page where users drop a file and see its SHA-256 hash. Copy to clipboard with one click.

## Why

- Trivial to build — proves the "add a new tool" workflow works
- No core module dependency (Web Crypto `digest()` is built into browsers)
- Useful tool in its own right (verify file integrity)
- Can ship immediately, no blockers

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  SG/Tools / File Hasher                          │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  Drop a file here or click to select     │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  report.pdf  (2.4 MB)                           │
│                                                  │
│  SHA-256:                                        │
│  ┌─────────────────────────────────────────┐    │
│  │ a7f2b9c4d8e1f0a3b5c7d9e2f4a6b8c0d2e4   │    │
│  │ f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0   │    │
│  └─────────────────────────────────────────┘    │
│  [Copy Hash]                                     │
│                                                  │
│  Also available: MD5 · SHA-1 · SHA-512          │
│  (toggle buttons, SHA-256 is default)            │
│                                                  │
├─────────────────────────────────────────────────┤
│  All processing happens in your browser.         │
│  No data is sent to any server.                  │
│  Need to share files securely? Try SG/Send →     │
└─────────────────────────────────────────────────┘
```

## Implementation

```javascript
async function hashFile(file, algorithm = 'SHA-256') {
    const buffer = await file.arrayBuffer()
    const hash   = await crypto.subtle.digest(algorithm, buffer)
    return Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
}
```

- Read file as ArrayBuffer
- Use `crypto.subtle.digest()` — no external dependencies
- Display hash as lowercase hex string
- Offer SHA-256 (default), SHA-1, SHA-512, MD5 as toggle options
- Copy to clipboard via `navigator.clipboard.writeText()`
- Show file name and size

## i18n Keys

```json
{
  "tool_file_hasher_title": "File Hasher",
  "tool_file_hasher_desc": "Calculate the cryptographic hash of any file",
  "tool_file_hasher_drop_prompt": "Drop a file here or click to select",
  "tool_file_hasher_hash_label": "SHA-256",
  "tool_file_hasher_copy_btn": "Copy Hash",
  "tool_file_hasher_copied": "Copied!",
  "tool_file_hasher_privacy": "All processing happens in your browser. No data is sent to any server."
}
```

## Landing Page Card

Add to the tools landing page:

```html
<div class="tool-card">
    <h3>File Hasher</h3>
    <p>Calculate SHA-256, SHA-1, or SHA-512 hash of any file. Verify file integrity without uploading.</p>
    <a href="file-hasher/">Open Tool →</a>
</div>
```

## Acceptance Criteria

- [ ] Drop or select a file → see SHA-256 hash
- [ ] Copy hash to clipboard with one click
- [ ] Toggle between SHA-256, SHA-1, SHA-512
- [ ] Shows file name and size
- [ ] Uses shared header/footer/locale-picker
- [ ] Tool card on landing page
- [ ] i18n keys in all 5 locale files
- [ ] Privacy footer present
- [ ] No server calls — pure client-side
