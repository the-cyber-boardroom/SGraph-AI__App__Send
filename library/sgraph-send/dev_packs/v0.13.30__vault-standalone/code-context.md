# SGraph-AI__Vault — Code Context (Source Code to Extract)

**Version:** v0.13.30
**Purpose:** Actual source code from the SG/Send codebase and sg-send-cli. These are the patterns and implementations to extract, port, or reference.

---

## 1. Vault Pointer Routes — The HTTP API Layer

**File:** `sgraph_ai_app_send/lambda__user/routes/Routes__Vault__Pointer.py` (in App__Send repo)

This is the thin HTTP layer that the vault library will eventually replace. The routes handle:

- `POST /api/vault/create` — create a new vault
- `POST /api/vault/upload/{vault_id}` — upload an encrypted blob
- `GET /api/vault/download/{vault_id}/{blob_id}` — download an encrypted blob
- `GET /api/vault/tree/{vault_id}` — get vault tree (path → blob mapping)
- `POST /api/vault/tree/{vault_id}` — update vault tree
- `GET /api/vault/read-base64/{vault_id}/{file_id}` — read blob as base64 (MCP-compatible)

**Key pattern:** The routes are thin wrappers. The storage is Memory-FS (`Storage_FS`). The route creates/reads objects and delegates to storage. The vault library should implement the logic; the routes should delegate to it.

**What to port:** The data model implicit in these routes (vault = collection of blobs + tree). The storage abstraction pattern (pluggable backend). The content-addressed ID scheme.

**What NOT to port:** The FastAPI route decorators, the Lambda-specific code, the HTTP request/response handling. Those stay in App__Send.

---

## 2. vault-crypto.js — Browser Encryption (Reference Only)

**File:** `sgraph_ai_app_send__ui__admin/` area (in App__Send repo)

The browser-side encryption uses Web Crypto API with AES-256-GCM. The Python vault library must produce ciphertext in the **exact same format** so that:
- Files encrypted by the Python library can be decrypted by the browser
- Files encrypted by the browser can be decrypted by the Python library

**Format:** `[IV (12 bytes)] [Ciphertext] [Auth Tag (16 bytes appended by GCM)]`

```javascript
// Browser encryption (reference — do NOT port the JS, match the format in Python)
async encryptFile(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, plaintext
    );
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result.buffer;
}
```

**Python equivalent using `cryptography` library:**

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def encrypt_blob(key: bytes, plaintext: bytes) -> bytes:
    """Encrypt plaintext with AES-256-GCM. Returns IV + ciphertext + tag."""
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)  # includes auth tag
    return iv + ciphertext

def decrypt_blob(key: bytes, encrypted: bytes) -> bytes:
    """Decrypt IV + ciphertext + tag. Returns plaintext."""
    iv = encrypted[:12]
    ciphertext = encrypted[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext, None)
```

**Critical:** The `cryptography` library's AESGCM appends the 16-byte auth tag to the ciphertext, same as Web Crypto API. The formats are compatible. Verify with a cross-platform round-trip test.

---

## 3. sg-send-cli — Existing CLI (Port Target)

**Package:** `sg-send-cli` on PyPI (separate repo)

The existing CLI has 5 commands that interact with the SG/Send API for vault operations:

```bash
sg-send-cli clone <vault_url> [--key <key>]   # Download vault tree + blobs
sg-send-cli pull                                # Sync remote changes
sg-send-cli push                                # Upload local changes
sg-send-cli status                              # Show vault state
sg-send-cli init [--server <url>]               # Create new vault on server
```

**What to port:**
- The API call patterns (create vault, upload blob, download blob, get/update tree)
- The local vault storage format (bare vault directory structure)
- The clone workflow (download tree, then download each blob)

**What to change:**
- Abstract the API calls behind the `Remote` interface
- Add branch awareness (clone creates branch, push uses branch)
- Add commit support (currently the CLI doesn't use commits)
- Add signing (every commit signed by branch key)

**Key insight:** The CLI currently does direct API calls. After refactoring, the CLI should use the `sgraph_vault` library, which handles the data model, and the library uses the `Remote` interface for sync.

```
BEFORE:  CLI → HTTP API calls → SG/Send server
AFTER:   CLI → sgraph_vault library → Remote interface → SG/Send server (or local, or S3)
```

---

## 4. Type_Safe Pattern (from osbot-utils)

All vault classes use `Type_Safe` instead of Pydantic or dataclasses:

```python
from osbot_utils.base_classes.Type_Safe import Type_Safe

class Vault_Blob(Type_Safe):
    blob_id : str = ''
    content : bytes = b''
    size    : int = 0
```

**Key differences from Pydantic:**
- Default values are required for all fields
- No validation decorators — validation is explicit in methods
- Serialisation via `obj.json()` / `Type_Safe.from_json()`
- No `model_validate`, `model_dump` etc.
- Inheritance works naturally

**Pattern for vault objects:**

```python
class Vault_Commit(Type_Safe):
    commit_id : str = ''
    tree      : str = ''
    parent    : str = ''
    message   : str = ''
    timestamp : str = ''
    branch    : str = ''
    signature : str = ''

    def compute_id(self):
        data = f"{self.tree}:{self.parent}:{self.message}:{self.timestamp}:{self.branch}"
        self.commit_id = hashlib.sha256(data.encode()).hexdigest()
        return self.commit_id
```

---

## 5. Storage_FS Pattern (from osbot-utils)

The vault uses `Storage_FS` (or equivalent) for pluggable storage:

```python
from osbot_utils.helpers.storage.Storage_FS import Storage_FS

# In-memory (for tests)
storage = Storage_FS()  # defaults to memory

# Disk
storage = Storage_FS(root_path="/tmp/vault-storage")

# The storage interface:
storage.put(path, data)        # Write bytes
storage.get(path) -> bytes     # Read bytes
storage.exists(path) -> bool   # Check existence
storage.list(prefix) -> list   # List objects
storage.delete(path)           # Remove
```

The vault library should use this abstraction internally. Unit tests use in-memory storage. Integration tests use disk. Production uses S3 (via a different storage class from osbot-aws).

---

## 6. Test Pattern (No Mocks)

```python
import pytest
from sgraph_vault.vault import Vault

class Test_Vault_Create:

    def test_create_vault(self):
        vault = Vault.create(storage='memory')
        assert vault.config.version == '0.1'
        assert vault.config.default_branch == 'main'

    def test_add_and_commit(self):
        vault = Vault.create(storage='memory')
        vault.add('README.md', b'Hello world')
        vault.commit('Initial commit')

        tree = vault.get_tree()
        assert 'README.md' in tree.entries
        assert vault.log()[0].message == 'Initial commit'

    def test_encrypt_decrypt_roundtrip(self):
        vault = Vault.create(storage='memory')
        key = vault.generate_key()

        plaintext = b'Secret document content'
        vault.add('secret.md', plaintext)
        vault.commit('Add secret')

        # Retrieve and decrypt
        content = vault.read('secret.md', key=key)
        assert content == plaintext

    def test_push_pull_local(self):
        # Create source vault
        source = Vault.create(storage='memory')
        source.add('file.txt', b'content')
        source.commit('Add file')

        # Push to local remote
        source.remote_add('backup', '/tmp/test-remote')
        source.push('backup')

        # Clone from local remote
        target = Vault.clone('/tmp/test-remote')
        content = target.read('file.txt')
        assert content == b'content'
```

**Rules:**
- No `@patch`, no `MagicMock`, no `unittest.mock`
- In-memory backends for unit tests
- Real filesystem for integration tests
- LocalStack for S3 tests
- Full round-trip assertions (create → modify → verify)
