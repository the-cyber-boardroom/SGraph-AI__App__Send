# Technical Bootstrap Guide

**Version:** v0.13.30
**Purpose:** Step-by-step instructions for setting up the SGraph-AI__Vault repo from scratch.

---

## Phase 0: Prerequisites

Clone the SG/Send main repo for reference (read-only):

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

You need this to:
- Reference vault pointer route patterns
- Read the vault briefs (20 documents)
- Reference the crypto format (AES-256-GCM, Web Crypto compatible)
- Read the comprehensive vault debrief at `team/humans/dinis_cruz/debriefs/03/12/v0.13.30__debrief__vault-architecture-comprehensive.md`

---

## Phase 1: Repo Skeleton (DO THIS FIRST)

### 1.1 Create Repo Structure

```
SGraph-AI__Vault/
├── .claude/
│   ├── CLAUDE.md
│   └── explorer/
│       └── CLAUDE.md
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── publish.yml
├── sgraph_vault/
│   ├── __init__.py
│   ├── version
│   ├── vault.py
│   ├── objects/
│   │   ├── __init__.py
│   │   ├── blob.py
│   │   ├── tree.py
│   │   └── commit.py
│   ├── branch/
│   │   ├── __init__.py
│   │   ├── branch.py
│   │   └── merge.py
│   ├── crypto/
│   │   ├── __init__.py
│   │   ├── encrypt.py
│   │   ├── sign.py
│   │   └── keys.py
│   ├── remote/
│   │   ├── __init__.py
│   │   ├── remote.py
│   │   ├── remote_local.py
│   │   ├── remote_sgraph.py
│   │   ├── remote_s3.py
│   │   └── remote_zip.py
│   ├── pack/
│   │   ├── __init__.py
│   │   ├── manifest.py
│   │   └── themes.py
│   └── cli/
│       ├── __init__.py
│       └── cli.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── team/
│   ├── explorer/
│   │   ├── architect/
│   │   │   ├── README.md
│   │   │   ├── ROLE__architect.md
│   │   │   └── reviews/
│   │   ├── dev/
│   │   ├── appsec/
│   │   ├── devops/
│   │   ├── qa/
│   │   ├── librarian/
│   │   │   ├── README.md
│   │   │   ├── ROLE__librarian.md
│   │   │   ├── reviews/
│   │   │   └── reality/
│   │   │       └── v0.1.0__what-exists-today.md
│   │   └── historian/
│   └── humans/dinis_cruz/
│       ├── briefs/
│       ├── debriefs/
│       └── claude-code-web/
├── pyproject.toml
├── version
└── README.md
```

### 1.2 Create Version File

```bash
echo "v0.1.0" > sgraph_vault/version
```

### 1.3 Create pyproject.toml

```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "sgraph-vault"
dynamic = ["version"]
description = "Standalone encrypted vault library with Git-like version control"
requires-python = ">=3.12"
dependencies = [
    "osbot-utils",
    "osbot-aws",
    "cryptography",
]

[project.optional-dependencies]
dev = [
    "pytest",
]

[project.scripts]
sg-vault = "sgraph_vault.cli.cli:main"

[tool.setuptools.dynamic]
version = {file = "sgraph_vault/version"}
```

### 1.4 Create CLAUDE.md Files

Copy from `claude-md-templates/` in this dev pack:
- `CLAUDE.md` → `.claude/CLAUDE.md`
- `explorer__CLAUDE.md` → `.claude/explorer/CLAUDE.md`

### 1.5 Create Team Structure

For each of the 7 roles (architect, dev, appsec, devops, qa, librarian, historian):

1. Create directory: `team/explorer/{role}/`
2. Create `README.md` with: role name, one-line description, link to ROLE file
3. Copy `ROLE__{name}.md` from `03_role-definitions/` in this dev pack
4. Create `reviews/` directory

### 1.6 Create Initial Reality Document

```markdown
# SGraph-AI__Vault — What Exists Today (v0.1.0)

**Last verified:** 2026-03-12

## Core Library
None yet.

## Objects (blob, tree, commit)
None yet.

## Branch Model
None yet.

## Crypto
None yet.

## Remotes
None yet.

## CLI
None yet.

## Tests
None yet.

## PROPOSED — Does Not Exist Yet
- Vault core (create, add, commit) — planned Phase 1
- AES-256-GCM encryption — planned Phase 2
- Branch model with signed commits — planned Phase 3
- Remote backends (local, SG/Send, S3, zip) — planned Phase 4
- CLI (sg-vault) — planned Phase 5
- Pack manifest — planned Phase 6
```

---

## Phase 2: Core Objects (Vault, Blob, Tree, Commit)

### 2.1 Implement Blob

```python
# sgraph_vault/objects/blob.py
from osbot_utils.base_classes.Type_Safe import Type_Safe
import hashlib

class Vault_Blob(Type_Safe):
    blob_id : str = ''
    content : bytes = b''
    size    : int = 0

    def compute_id(self):
        self.blob_id = hashlib.sha256(self.content).hexdigest()
        self.size = len(self.content)
        return self.blob_id
```

### 2.2 Implement Tree

```python
# sgraph_vault/objects/tree.py
from osbot_utils.base_classes.Type_Safe import Type_Safe
import hashlib, json

class Vault_Tree(Type_Safe):
    entries : dict = {}  # {path: {"blob_id": str, "size": int}}
    tree_id : str = ''

    def add_entry(self, path, blob_id, size):
        self.entries[path] = {"blob_id": blob_id, "size": size}

    def compute_id(self):
        canonical = json.dumps(self.entries, sort_keys=True, separators=(',', ':'))
        self.tree_id = hashlib.sha256(canonical.encode()).hexdigest()
        return self.tree_id
```

### 2.3 Implement Commit

See `architecture.md` section 2.4 for the full class.

### 2.4 Implement Vault (Main Entry Point)

```python
# sgraph_vault/vault.py
from osbot_utils.base_classes.Type_Safe import Type_Safe

class Vault(Type_Safe):
    path    : str = ''
    config  : dict = {}
    staging : dict = {}  # {path: bytes} — files staged for commit

    @classmethod
    def create(cls, path='', storage='memory'):
        vault = cls(path=path)
        vault.config = {"version": "0.1", "default_branch": "main"}
        # Initialize storage, create .vault/ structure
        return vault

    def add(self, path, content):
        self.staging[path] = content

    def commit(self, message):
        # Encrypt staged files → blobs
        # Create tree from blob references
        # Create commit (references tree, signed by branch key)
        # Update branch HEAD
        pass

    def read(self, path, key=None):
        # Get blob_id from tree, retrieve blob, decrypt
        pass
```

### 2.5 Write Tests

```python
# tests/unit/test_vault_create.py
class Test_Vault_Create:
    def test_create_vault(self):
        vault = Vault.create(storage='memory')
        assert vault.config['version'] == '0.1'

    def test_add_file(self):
        vault = Vault.create(storage='memory')
        vault.add('test.txt', b'hello')
        assert 'test.txt' in vault.staging
```

---

## Phase 3: Encryption

### 3.1 Implement AES-256-GCM

```python
# sgraph_vault/crypto/encrypt.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64

def generate_vault_key():
    """Generate a 256-bit AES key."""
    return os.urandom(32)

def encrypt_blob(key, plaintext):
    """Encrypt with AES-256-GCM. Returns IV + ciphertext + auth tag."""
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    return iv + ciphertext

def decrypt_blob(key, encrypted):
    """Decrypt IV + ciphertext + auth tag. Returns plaintext."""
    iv = encrypted[:12]
    ciphertext = encrypted[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext, None)

def export_key(key):
    """Export key as base64url string (Web Crypto compatible)."""
    return base64.urlsafe_b64encode(key).rstrip(b'=').decode()

def import_key(b64_key):
    """Import key from base64url string."""
    padding = 4 - len(b64_key) % 4
    if padding != 4:
        b64_key += '=' * padding
    return base64.urlsafe_b64decode(b64_key)
```

### 3.2 Write Crypto Tests

```python
# tests/unit/test_vault_encrypt.py
class Test_Vault_Encrypt:
    def test_encrypt_decrypt_roundtrip(self):
        key = generate_vault_key()
        plaintext = b'Secret content'
        encrypted = encrypt_blob(key, plaintext)
        decrypted = decrypt_blob(key, encrypted)
        assert decrypted == plaintext

    def test_key_export_import_roundtrip(self):
        key = generate_vault_key()
        exported = export_key(key)
        imported = import_key(exported)
        assert imported == key
```

---

## Verification Checklist

Before declaring Phase 1 complete:

- [ ] `.claude/CLAUDE.md` exists and is comprehensive
- [ ] `.claude/explorer/CLAUDE.md` exists
- [ ] `team/explorer/` has all 7 role directories with README.md + ROLE files
- [ ] `team/explorer/librarian/reality/` has initial reality document
- [ ] `sgraph_vault/version` file contains `v0.1.0`
- [ ] `pyproject.toml` exists with correct dependencies
- [ ] `pip install -e .` works
- [ ] `Vault.create()` works with in-memory storage
- [ ] `vault.add()` and `vault.commit()` work
- [ ] `encrypt_blob()` / `decrypt_blob()` round-trip passes
- [ ] `export_key()` / `import_key()` round-trip passes
- [ ] At least 10 tests passing
- [ ] Reality document updated with what exists
