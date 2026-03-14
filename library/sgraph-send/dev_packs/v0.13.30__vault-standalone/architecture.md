# SGraph-AI__Vault — Architecture

**Version:** v0.13.30
**For:** Implementor (LLM coding session)

---

## 1. Repo Structure

```
SGraph-AI__Vault/
  sgraph_vault/                          <- CORE LIBRARY
    __init__.py
    version                              Contains: v0.1.0
    vault.py                             Main Vault class (entry point)
    objects/
      __init__.py
      blob.py                            Encrypted blob (content-addressed)
      tree.py                            Tree (path → blob_id mapping)
      commit.py                          Commit (tree + parent + signature)
    branch/
      __init__.py
      branch.py                          Branch create/list/switch/delete
      merge.py                           Merge logic + conflict detection
    crypto/
      __init__.py
      encrypt.py                         AES-256-GCM encrypt/decrypt
      sign.py                            ECDSA P-256 sign/verify
      keys.py                            Key generation, export, import, storage
    remote/
      __init__.py
      remote.py                          Abstract Remote interface
      remote_local.py                    Local folder backend
      remote_sgraph.py                   SG/Send API backend
      remote_s3.py                       S3 backend (via osbot-aws)
      remote_zip.py                      Zip export/import
    pack/
      __init__.py
      manifest.py                        _pack.json reader/writer
      themes.py                          Pack type definitions
    cli/
      __init__.py
      cli.py                             CLI entry point (Click or argparse)
      cmd_init.py                        sg-vault init
      cmd_clone.py                       sg-vault clone
      cmd_add.py                         sg-vault add
      cmd_commit.py                      sg-vault commit
      cmd_push.py                        sg-vault push
      cmd_pull.py                        sg-vault pull
      cmd_branch.py                      sg-vault branch
      cmd_merge.py                       sg-vault merge
      cmd_log.py                         sg-vault log [--graph]
      cmd_status.py                      sg-vault status
      cmd_remote.py                      sg-vault remote add/remove/list
      cmd_sign.py                        sg-vault sign/verify
      cmd_export.py                      sg-vault export --zip
      cmd_diff.py                        sg-vault diff

  tests/
    unit/
      test_vault_create.py               Create, add, commit
      test_vault_blob.py                 Blob encrypt/decrypt, content-addressing
      test_vault_tree.py                 Tree operations
      test_vault_commit.py               Commit creation, signing
      test_vault_branch.py               Branch create, switch
      test_vault_merge.py                Merge, conflict detection
      test_vault_encrypt.py              Full encrypt/decrypt round-trip
      test_vault_sign.py                 Sign/verify round-trip
      test_vault_keys.py                 Key generation, export, import
      test_vault_remote_local.py         Local folder push/pull
      test_vault_remote_zip.py           Zip export/import
      test_vault_pack.py                 Pack manifest read/write
    integration/
      test_vault_remote_sgraph.py        SG/Send API push/pull
      test_vault_remote_s3.py            S3 push/pull (LocalStack)
      test_vault_cli.py                  CLI command integration tests
    e2e/
      test_vault_roundtrip.py            Full: create → encrypt → push → clone → decrypt → verify

  .claude/
    CLAUDE.md                            Main project guidance
    explorer/
      CLAUDE.md                          Explorer team instructions

  .github/
    workflows/
      test.yml                           pytest on push
      publish.yml                        PyPI publish on tag

  team/
    explorer/
      architect/
        README.md
        ROLE__architect.md
        reviews/
      dev/
        README.md
        ROLE__dev.md
        reviews/
      appsec/
        README.md
        ROLE__appsec.md
        reviews/
      devops/
        README.md
        ROLE__devops.md
        reviews/
      qa/
        README.md
        ROLE__qa.md
        reviews/
      librarian/
        README.md
        ROLE__librarian.md
        reviews/
        reality/
          v0.1.0__what-exists-today.md
      historian/
        README.md
        ROLE__historian.md
        reviews/
    humans/dinis_cruz/
      briefs/                            READ-ONLY for agents
      debriefs/
      claude-code-web/

  pyproject.toml
  README.md
```

---

## 2. Vault Object Model

### 2.1 Object Types

The vault has four object types, all content-addressed:

```
                    ┌──────────┐
                    │  Commit  │
                    │ (signed) │
                    └────┬─────┘
                         │ references
                    ┌────▼─────┐
                    │   Tree   │
                    │ (paths)  │
                    └────┬─────┘
                         │ maps to
              ┌──────────┼──────────┐
         ┌────▼───┐ ┌────▼───┐ ┌───▼────┐
         │ Blob 1 │ │ Blob 2 │ │ Blob 3 │
         │(encr.) │ │(encr.) │ │(encr.) │
         └────────┘ └────────┘ └────────┘
```

### 2.2 Blob (Encrypted Content)

```python
class Vault_Blob(Type_Safe):
    blob_id    : str          # SHA-256 of encrypted_content
    content    : bytes        # IV (12 bytes) + AES-256-GCM ciphertext
    size       : int          # Size of encrypted content

    def compute_id(self) -> str:
        """blob_id = SHA-256(encrypted_content)"""
        return hashlib.sha256(self.content).hexdigest()
```

**Storage:** `objects/blobs/{blob_id}` — the raw bytes.

**Encryption format:** First 12 bytes are the random IV. Remaining bytes are AES-256-GCM ciphertext with authentication tag appended. This matches the Web Crypto API format used by SG/Send's browser encryption.

### 2.3 Tree (Path → Blob Mapping)

```python
class Tree_Entry(Type_Safe):
    blob_id : str
    size    : int

class Vault_Tree(Type_Safe):
    entries : dict           # {path: Tree_Entry}
    tree_id : str            # SHA-256 of canonical JSON

    def compute_id(self) -> str:
        """tree_id = SHA-256(canonical JSON of entries)"""
        canonical = json.dumps(self.to_dict(), sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(canonical.encode()).hexdigest()

    def add_entry(self, path: str, blob_id: str, size: int) -> None: ...
    def remove_entry(self, path: str) -> None: ...
    def list_paths(self) -> list[str]: ...
```

**Storage:** `objects/trees/{tree_id}` — canonical JSON.

**File names:** Currently stored as plaintext in the tree. This is an open security question (see addenda/appsec.md). Decision: plaintext for now, encryption option later.

### 2.4 Commit (Signed Snapshot)

```python
class Vault_Commit(Type_Safe):
    commit_id   : str        # SHA-256 of canonical JSON (excluding commit_id)
    tree        : str        # tree_id
    parent      : str        # parent commit_id (empty string for root commit)
    message     : str        # commit message
    timestamp   : str        # ISO 8601
    branch      : str        # branch public key fingerprint
    signature   : str        # ECDSA signature (base64url)

    def compute_id(self) -> str:
        """commit_id = SHA-256 of (tree + parent + message + timestamp + branch)"""
        data = f"{self.tree}:{self.parent}:{self.message}:{self.timestamp}:{self.branch}"
        return hashlib.sha256(data.encode()).hexdigest()

    def sign(self, private_key) -> None:
        """Sign the commit with the branch private key"""
        data = self.compute_id().encode()
        self.signature = ecdsa_sign(private_key, data)

    def verify(self, public_key) -> bool:
        """Verify the commit signature"""
        data = self.compute_id().encode()
        return ecdsa_verify(public_key, data, self.signature)
```

**Storage:** `objects/commits/{commit_id}` — canonical JSON.

**Signature:** Covers the commit_id (which itself is a hash of tree + parent + message + timestamp + branch). This creates a signed chain — tampering with any commit invalidates all subsequent signatures.

### 2.5 Branch

```python
class Vault_Branch(Type_Safe):
    name        : str        # e.g., "clone-abc123" or "main"
    head        : str        # commit_id
    public_key  : str        # base64url ECDSA P-256 public key
    created     : str        # ISO 8601
```

**Storage:** `refs/heads/{branch_name}` — JSON.

**Key storage:** Branch private key stored at `.vault/keys/{branch_name}.key` (encrypted with vault key or passphrase).

---

## 3. Vault Lifecycle

### 3.1 Create (Local)

```python
vault = Vault.create(path="/tmp/my-vault")
# Creates:
#   /tmp/my-vault/.vault/config.json
#   /tmp/my-vault/.vault/HEAD  (points to "main")
#   /tmp/my-vault/.vault/refs/heads/main  (empty)
#   /tmp/my-vault/.vault/objects/  (empty)
#   /tmp/my-vault/.vault/keys/  (empty)
```

### 3.2 Add Files

```python
vault.add("README.md", b"Hello world")
vault.add("docs/spec.md", b"Specification content")
# Files encrypted and stored as blobs
# Staging area updated (working tree → staged entries)
```

### 3.3 Commit

```python
vault.commit("Initial commit")
# Creates:
#   Tree object from staged entries
#   Commit object (references tree, signed by branch key)
#   Updates branch HEAD to new commit
```

### 3.4 Clone (Creates Branch)

```python
vault = Vault.clone(
    remote="https://send.sgraph.ai",
    vault_id="abc123",
    key=b"vault_encryption_key",
    path="/tmp/cloned-vault"
)
# Downloads all objects (blobs, trees, commits)
# Auto-creates a new branch: "clone-{random}"
# Generates key pair for the branch
# Sets HEAD to new branch
# All subsequent commits go to this branch
```

### 3.5 Push (Always Succeeds)

```python
vault.push("origin")
# Uploads new objects (blobs, trees, commits) to remote
# Updates remote branch ref
# Never conflicts (each branch is unique to its creator)
```

### 3.6 Merge

```python
vault.merge("main")
# If no conflicts (only additions): auto-merge
# If conflicts (overlapping file changes): report conflicts, require resolution
# Merge commit references both parent commits
# Merge commit signed by current branch key
```

---

## 4. Encryption Architecture

### 4.1 Blob Encryption (Symmetric)

```
Plaintext → AES-256-GCM(key, random_IV) → [IV (12 bytes) | Ciphertext | Auth Tag (16 bytes)]
```

The vault encryption key is a 256-bit AES key. All blobs in a vault are encrypted with the same key. The key never leaves the client. The server stores only ciphertext.

### 4.2 Commit Signing (Asymmetric)

```
Commit data → SHA-256 → ECDSA-P256(branch_private_key) → Signature
```

Each branch has its own ECDSA P-256 key pair. The private key signs commits. The public key is stored in the branch metadata for verification.

### 4.3 Encrypt-for-Reader (Asymmetric, Future)

```
Vault key → ECDH(reader_public_key) → Shared secret → AES-256-GCM wrapped key
```

For multi-reader access: the vault key is wrapped (encrypted) with each reader's public key. Each reader can unwrap the vault key with their private key. The wrapped keys are stored in the vault metadata.

### 4.4 Key Hierarchy

```
Vault Key (AES-256-GCM)
  └── Encrypts all blobs
  └── Can be wrapped for multiple readers (encrypt-for-reader)

Branch Key Pair (ECDSA P-256)
  └── Signs all commits on this branch
  └── Public key stored in branch metadata
  └── Private key stored in .vault/keys/ (encrypted)

Document Key Pair (ECDSA P-256, future)
  └── Signs individual documents for provenance
```

---

## 5. Remote Abstraction

```python
class Remote(Type_Safe):
    """Abstract base for all remote backends."""

    name : str
    url  : str

    def push_objects(self, objects: list) -> None:
        """Upload new objects (blobs, trees, commits) to remote."""
        raise NotImplementedError

    def pull_objects(self, refs: list[str]) -> list:
        """Download objects by their IDs from remote."""
        raise NotImplementedError

    def list_refs(self) -> dict[str, str]:
        """List all branch refs on remote. Returns {branch_name: commit_id}."""
        raise NotImplementedError

    def update_ref(self, branch: str, commit_id: str) -> None:
        """Update a branch reference on remote."""
        raise NotImplementedError
```

### Remote Types

| Type | URL Pattern | Notes |
|------|------------|-------|
| `remote_local` | `/path/to/folder` | Direct filesystem. Clone = copy directory. |
| `remote_sgraph` | `https://send.sgraph.ai` | REST API calls. Port from sg-send-cli. |
| `remote_s3` | `s3://bucket/prefix` | S3 get/put via osbot-aws. |
| `remote_zip` | `/path/to/vault.zip` | Import/export. Read-only for pull. |
| `remote_url` | `https://example.com/vault.zip` | Download-only. For vault bundles. |

---

## 6. CLI Design

```
sg-vault init [--local PATH] [--server URL]    Create a new vault
sg-vault clone URL [--key KEY] [--path PATH]    Clone from remote
sg-vault add FILE [FILE...]                      Stage files
sg-vault commit -m MESSAGE                       Commit staged files
sg-vault push [REMOTE]                           Push to remote
sg-vault pull [REMOTE]                           Pull from remote
sg-vault status                                  Show vault state
sg-vault branch [NAME]                           Create/list branches
sg-vault merge BRANCH                            Merge branch into current
sg-vault log [--graph] [--oneline]               Show commit history
sg-vault diff [COMMIT]                           Show changes
sg-vault remote add NAME URL                     Add remote
sg-vault remote remove NAME                      Remove remote
sg-vault remote list                             List remotes
sg-vault sign FILE                               Sign a file
sg-vault verify FILE                             Verify file signature
sg-vault export --zip OUTPUT                     Export vault as zip
sg-vault import PATH                             Import from zip or folder
sg-vault keys generate                           Generate new key pair
sg-vault keys export [--public]                  Export keys
sg-vault --headless                              No interactive prompts (for automation)
```

---

## 7. Pack Manifest

```json
{
  "type": "investor-pack",
  "version": "1.0",
  "title": "SG/Send Series A Materials",
  "branding": {
    "logo": "assets/logo.png",
    "primary_color": "#1a1a2e",
    "accent_color": "#e94560"
  },
  "workflow": {
    "landing": "README.md",
    "sections": [
      {"title": "Executive Summary", "path": "01-summary/"},
      {"title": "Financials", "path": "02-financials/"},
      {"title": "Team", "path": "03-team/"}
    ]
  },
  "access": {
    "public": false,
    "readers": ["key-fingerprint-1", "key-fingerprint-2"]
  }
}
```

**Location:** `_pack.json` in the vault root (alongside the content files, inside the encrypted vault).

**Pack types:** investor, ERM (contact management), customer, compliance, gallery. Each type implies different UI rendering.

---

## 8. Testing Strategy

### In-Memory Backend

```python
class Storage_Memory(Type_Safe):
    """In-memory storage for tests. Same interface as disk/S3."""
    objects : dict  # {object_id: bytes}

    def put(self, object_id: str, data: bytes) -> None: ...
    def get(self, object_id: str) -> bytes: ...
    def exists(self, object_id: str) -> bool: ...
    def list(self) -> list[str]: ...
```

All unit tests use `Storage_Memory`. Startup time ~100ms. No filesystem, no S3, no mocks.

### Test Categories

| Category | What | Backend |
|----------|------|---------|
| Unit | Individual objects, crypto, tree ops | In-memory |
| Integration | Remote push/pull, CLI commands | Local folder + LocalStack S3 |
| E2E | Full round-trip across remotes | SG/Send API (dev server) |
| Crypto | Encrypt/decrypt round-trip, sign/verify | In-memory |
| Branch | Create, switch, merge, conflicts | In-memory |

### Critical Round-Trip Tests

1. **Encrypt round-trip:** plaintext → encrypt → decrypt → assert equal
2. **Sign round-trip:** commit → sign → verify → assert valid
3. **Push/pull round-trip:** create vault → push → clone → pull → assert equal content
4. **Branch/merge round-trip:** create → branch → commit on both → merge → assert all content present
5. **Zip round-trip:** create vault → export zip → import zip → assert equal content
