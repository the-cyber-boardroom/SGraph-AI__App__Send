# Element Spec: File Encryptor Tool

**Layer:** Tool (standalone page)
**IFD path:** `tools/v0/v0.1/v0.1.2/en-gb/file-encryptor/index.html`
**Effort:** Low
**Batch:** 1 (Foundation)
**Dependencies:** `sg-crypto.js` (production copy), `<sg-upload-dropzone>`

---

## What

A standalone tool page where users encrypt or decrypt files using AES-256-GCM. Encrypt: drop file + get key → download encrypted file. Decrypt: drop encrypted file + paste key → download original.

## Why

- Direct demo of the encryption pipeline that powers SG/Send
- Marketing tool: "Try the encryption yourself"
- Low effort — sg-crypto.js already has `encryptFile()` / `decryptFile()`
- Builds trust with technical users who want to verify the crypto works

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  SG/Tools / File Encryptor                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  Mode:  [Encrypt]  [Decrypt]                     │
│                                                  │
│  ── ENCRYPT MODE ──                              │
│  ┌─────────────────────────────────────────┐    │
│  │  Drop a file here or click to select     │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  report.pdf  (2.4 MB)                           │
│                                                  │
│  Encryption Key (auto-generated):                │
│  ┌─────────────────────────────────────────┐    │
│  │ Xk9mP2vR7wQ4...                         │    │
│  └─────────────────────────────────────────┘    │
│  [Copy Key]  [Regenerate]                        │
│                                                  │
│  [Encrypt & Download]                            │
│                                                  │
│  ── DECRYPT MODE ──                              │
│  ┌─────────────────────────────────────────┐    │
│  │  Drop an encrypted file (.enc)           │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  Decryption Key:                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ (paste your key here)                    │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  [Decrypt & Download]                            │
│                                                  │
├─────────────────────────────────────────────────┤
│  All processing happens in your browser.         │
│  Your file and key never leave your device.      │
│  Need to share encrypted files? Try SG/Send →    │
└─────────────────────────────────────────────────┘
```

## Implementation

### Encrypt Flow

```javascript
import { generateKey, exportKey, encryptFile } from '/core/crypto/v1/v1.0/v1.0.0/sg-crypto.js'

// 1. Generate key
const key = await generateKey()
const keyString = await exportKey(key)

// 2. Read file
const fileData = await file.arrayBuffer()

// 3. Encrypt
const { encrypted, iv } = await encryptFile(fileData, key)

// 4. Package: prepend IV to encrypted data
const output = new Uint8Array(iv.byteLength + encrypted.byteLength)
output.set(new Uint8Array(iv), 0)
output.set(new Uint8Array(encrypted), iv.byteLength)

// 5. Download as .enc file
const blob = new Blob([output], { type: 'application/octet-stream' })
downloadBlob(blob, file.name + '.enc')
```

### Decrypt Flow

```javascript
import { importKey, decryptFile } from '/core/crypto/v1/v1.0/v1.0.0/sg-crypto.js'

// 1. Import key from string
const key = await importKey(keyString)

// 2. Read encrypted file
const data = await encFile.arrayBuffer()

// 3. Extract IV (first 12 bytes for AES-GCM) and ciphertext
const iv = data.slice(0, 12)
const ciphertext = data.slice(12)

// 4. Decrypt
const plaintext = await decryptFile(ciphertext, key, iv)

// 5. Download
const blob = new Blob([plaintext])
downloadBlob(blob, encFile.name.replace('.enc', ''))
```

**Note:** The IV extraction and packaging must match Send's exact format. This is why the crypto production copy (element #1) must be done first.

## i18n Keys

```json
{
  "tool_file_encryptor_title": "File Encryptor",
  "tool_file_encryptor_desc": "Encrypt or decrypt files with AES-256-GCM",
  "tool_file_encryptor_mode_encrypt": "Encrypt",
  "tool_file_encryptor_mode_decrypt": "Decrypt",
  "tool_file_encryptor_key_label": "Encryption Key (auto-generated)",
  "tool_file_encryptor_key_paste": "Paste your decryption key",
  "tool_file_encryptor_copy_key": "Copy Key",
  "tool_file_encryptor_regenerate": "Regenerate",
  "tool_file_encryptor_encrypt_btn": "Encrypt & Download",
  "tool_file_encryptor_decrypt_btn": "Decrypt & Download",
  "tool_file_encryptor_success": "Done! File downloaded.",
  "tool_file_encryptor_error_key": "Invalid key. Check that you copied the full key.",
  "tool_file_encryptor_error_decrypt": "Decryption failed. Wrong key or corrupted file.",
  "tool_file_encryptor_privacy": "Your file and key never leave your device."
}
```

## Landing Page Card

```html
<div class="tool-card">
    <h3>File Encryptor</h3>
    <p>Encrypt any file with AES-256-GCM. Decrypt with your key. Everything stays in your browser.</p>
    <a href="file-encryptor/">Open Tool →</a>
</div>
```

## Acceptance Criteria

- [ ] Encrypt mode: drop file → auto-generate key → download .enc file
- [ ] Decrypt mode: drop .enc file + paste key → download original
- [ ] Copy key to clipboard
- [ ] Regenerate key button
- [ ] Error handling: wrong key shows clear message (not a JS error)
- [ ] Wire-format compatible with Send's crypto (files encrypted here can be decrypted by Send's flow, and vice versa)
- [ ] Uses shared header/footer/locale-picker
- [ ] Tool card on landing page
- [ ] i18n keys in all 5 locale files
- [ ] No server calls
