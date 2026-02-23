# PKI Key Discovery — Architecture

**Purpose:** Shell layout, data models, API contracts, and event flows for the key discovery build.

---

## 1. Admin Shell Layout (v0.1.3)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SG/Send Admin Console                                        [v0.1.3] │
├──────────┬─────────────────────────────────┬─────────────────────────────┤
│ Left Nav │         Main Area              │    Right Sidebar (Debug)    │
│          │                                 │                             │
│ PKI      │  One component visible          │  [Msgs] [Events] [API]     │
│ ├ My Keys│  at a time:                     │                             │
│ ├ Encrypt│                                 │  <messages-panel>           │
│ ├ Contacts│  <pki-keys>                    │  <events-viewer>            │
│          │  <pki-encrypt>                  │  <api-logger>              │
│ Registry │  <pki-contacts>                 │                             │
│ ├ Publish│  <key-publish>                  │                             │
│ ├ Lookup │  <key-lookup>                   │                             │
│ ├ Browse │  <key-registry>                 │                             │
│          │  <key-log>                      │                             │
│ Tokens   │                                 │                             │
│ ├ Manage │  <token-manager>                │                             │
│          │                                 │                             │
│ Storage  │  <storage-browser>              │                             │
│ ├ Browse │                                 │                             │
│          │                                 │                             │
│ System   │  <system-info>                  │                             │
│ ├ Info   │  <cache-browser>                │                             │
│ ├ Cache  │                                 │                             │
│          │                                 │                             │
│ Monitor  │  <analytics-dashboard>          │                             │
│ ├ Metrics│  <metrics-dashboard>            │                             │
├──────────┴─────────────────────────────────┴─────────────────────────────┤
│ Ready │ Active: My Keys │ Components: 16 │ [Debug Panel]               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. API Contracts

### POST /keys/publish

Publish a public key. Returns a lookup code.

**Request:**
```json
{
    "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----",
    "signing_key_pem": "-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----"
}
```

**Response (201):**
```json
{
    "code": "dc-7x4f",
    "obj_id": "a3f7c891",
    "fingerprint": "sha256:3a7f1b2c9d4e5f60",
    "created": "2026-02-21T10:00:00Z"
}
```

**Errors:** 400 (invalid PEM), 409 (duplicate fingerprint)

### GET /keys/lookup/{code}

Look up by code. Code is case-insensitive (server normalises to lowercase).

**Response (200):**
```json
{
    "code": "dc-7x4f",
    "obj_id": "a3f7c891",
    "public_key_pem": "-----BEGIN PUBLIC KEY-----\n...",
    "signing_key_pem": "-----BEGIN PUBLIC KEY-----\n...",
    "fingerprint": "sha256:3a7f1b2c9d4e5f60",
    "algorithm": "RSA-OAEP",
    "key_size": 4096,
    "created": "2026-02-21T10:00:00Z"
}
```

**Errors:** 404 (not found or unpublished)

### DELETE /keys/unpublish/{code}

Unpublish a key. Sets `active: false`. Records in transparency log.

**Response (200):**
```json
{
    "code": "dc-7x4f",
    "status": "unpublished",
    "log_entry_hash": "sha256:9f3a...2d71"
}
```

### GET /keys/list

List all active published keys (PEM omitted for payload size).

**Response (200):**
```json
{
    "keys": [
        { "code": "dc-7x4f", "obj_id": "a3f7c891", "fingerprint": "sha256:...", "algorithm": "RSA-OAEP", "key_size": 4096, "created": "..." }
    ],
    "count": 1,
    "log_head_hash": "sha256:..."
}
```

### GET /keys/log

Full transparency log.

**Response (200):**
```json
{
    "entries": [
        {
            "seq": 0,
            "action": "KEY_PUBLISHED",
            "code": "dc-7x4f",
            "fingerprint": "sha256:...",
            "timestamp": "2026-02-21T10:00:00Z",
            "previous_hash": "sha256:0000000000000000",
            "entry_hash": "sha256:a1b2c3d4e5f67890"
        }
    ],
    "head": { "seq": 0, "entry_hash": "sha256:a1b2c3d4e5f67890" }
}
```

---

## 3. Storage Layout (Memory-FS)

```
keys/
  data/
    key-based/
      {code}/                          # e.g., dc-7x4f/
        data.json                      # Full registry entry
  index/
    fingerprint/
      {fingerprint_hex}                # → { "code": "dc-7x4f" }
  log/
    entries/
      00000000.json                    # First log entry
      00000001.json                    # Second log entry
    head.json                          # { "seq": N, "entry_hash": "sha256:..." }
```

---

## 4. Data Models

### Key Registry Entry (stored per key)
```python
class Schema__Key__Registry__Entry(Type_Safe):
    code            : str       # Lookup code (lowercase: "dc-7x4f")
    obj_id          : str       # 8-hex Obj_Id
    public_key_pem  : str       # Full PEM
    signing_key_pem : str = ''  # Optional signing key PEM
    fingerprint     : str       # "sha256:xxxx..." (16 hex chars)
    algorithm       : str       # "RSA-OAEP" or "ECDH"
    key_size        : int = 0   # 4096, 256, etc.
    created         : str       # ISO 8601
    active          : bool = True
```

### Transparency Log Entry
```python
{
    "seq"           : 0,
    "action"        : "KEY_PUBLISHED",    # or "KEY_UNPUBLISHED"
    "code"          : "dc-7x4f",
    "fingerprint"   : "sha256:...",
    "timestamp"     : "2026-02-21T10:00:00Z",
    "previous_hash" : "sha256:0000000000000000",
    "entry_hash"    : "sha256:a1b2c3d4e5f67890"
}
```

### Hash computation
```python
def compute_entry_hash(action, code, fingerprint, timestamp, previous_hash):
    payload = f"{action}|{code}|{fingerprint}|{timestamp}|{previous_hash}"
    return "sha256:" + hashlib.sha256(payload.encode()).hexdigest()[:16]
```

---

## 5. Lookup Code Format

- Format: `XX-XXXX` (2 + dash + 4, base-36: a-z, 0-9)
- **Generated uppercase** for display: `DC-7X4F`
- **Stored lowercase** on server: `dc-7x4f`
- **Case-insensitive lookup**: server does `code.lower()` at API boundary
- ~2.2 billion possible codes (36^6)

```python
import secrets, string

def generate_lookup_code():
    charset = string.ascii_uppercase + string.digits
    prefix  = ''.join(secrets.choice(charset) for _ in range(2))
    suffix  = ''.join(secrets.choice(charset) for _ in range(4))
    return f"{prefix}-{suffix}"  # Display form (uppercase)
    # Store as .lower()
```

---

## 6. Fingerprint Computation (server-side)

```python
import base64, hashlib

def compute_fingerprint_from_pem(pem):
    lines = pem.strip().split('\n')
    b64_data = ''.join(line for line in lines if not line.startswith('-----'))
    der_bytes = base64.b64decode(b64_data)
    digest = hashlib.sha256(der_bytes).hexdigest()
    return f"sha256:{digest[:16]}"
```

This matches the client-side `_computeFingerprint()` in pki-manager.js (exports SPKI DER, hashes it).

---

## 7. Event Flow: Publish Key

```
User clicks "Publish" on <pki-keys>
  → <pki-keys> emits 'key-selected' { keyId, record }
    → <key-publish> receives event, shows confirm dialog

User confirms publish
  → KeysService calls POST /keys/publish { public_key_pem, signing_key_pem }
    → <api-logger> records: POST /keys/publish → 201, 340ms
  → <key-publish> emits 'key-published' { code: "DC-7X4F", fingerprint }
    → <pki-keys> updates key card badge: "Published as DC-7X4F"
    → <key-registry> auto-refreshes (if visible)
    → <key-log> auto-refreshes (if visible)
    → <events-viewer> shows: key-published { code, fingerprint }
    → <messages-panel> shows: "Key published as DC-7X4F" (success)
```

---

## 8. Event Flow: Lookup Key

```
User enters code "DC-7X4F" in <key-lookup>
  → KeysService calls GET /keys/lookup/dc-7x4f
    → <api-logger> records: GET /keys/lookup/dc-7x4f → 200, 120ms

Key found:
  → <key-lookup> displays key details (fingerprint, algorithm, date)
  → User enters local label (stored in IndexedDB only, never sent to server)
  → User clicks "Import to My Contacts"
    → PKICommon.importPublicKeyPEM(pem)
    → PKICommon.dbAdd(db, 'contacts', contactData)
    → <key-lookup> emits 'contact-imported' { contactId, fingerprint, source: 'registry' }
      → <pki-contacts> refreshes contact list
      → <events-viewer> shows: contact-imported
      → <messages-panel> shows: "Contact imported" (success)
```
