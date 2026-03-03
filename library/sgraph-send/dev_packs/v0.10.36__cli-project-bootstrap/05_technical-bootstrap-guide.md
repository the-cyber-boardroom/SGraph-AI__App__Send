# Technical Bootstrap Guide

**Version:** v0.10.36

Step-by-step instructions for setting up the SG_Send__CLI repo from scratch.

---

## Phase 0: Prerequisites

Before starting, ensure these exist in the SG/Send main repo (done by a separate session):
- `POST /transfers/update/{id}` endpoint on User Lambda (vault key stability)
- Browser `_saveTree()` updated to use update instead of upload

**If these don't exist yet, the CLI can still be built** — just use the old vault key format where the key changes. The CLI will be updated when the backend catches up.

---

## Phase 1: Repo Skeleton (DO THIS FIRST)

### 1.1 Create Repo Structure

```
SG_Send__CLI/
├── .claude/
│   ├── CLAUDE.md                    # Main project guidance (adapt from template)
│   └── explorer/
│       └── CLAUDE.md                # Explorer team session instructions
├── .github/
│   └── workflows/
│       ├── ci-pipeline.yml          # Reusable base
│       ├── ci-pipeline__dev.yml     # Dev trigger
│       └── ci-pipeline__main.yml    # Main trigger + PyPI
├── sg_send_cli/
│   ├── __init__.py
│   ├── version                      # Contains: v0.1.0
│   ├── cli/
│   │   ├── __init__.py
│   │   └── app.py                   # Entry point + Typer__Routes base class
│   ├── commands/
│   │   └── __init__.py
│   ├── core/
│   │   └── __init__.py
│   ├── schemas/
│   │   └── __init__.py
│   ├── types/
│   │   └── __init__.py
│   └── utils/
│       └── __init__.py
├── tests/
│   └── unit/
│       └── sg_send_cli/
│           └── __init__.py
├── team/
│   ├── explorer/
│   │   ├── architect/
│   │   │   └── reviews/
│   │   ├── dev/
│   │   │   └── reviews/
│   │   ├── qa/
│   │   │   └── reviews/
│   │   ├── devops/
│   │   │   └── reviews/
│   │   ├── librarian/
│   │   │   ├── reviews/
│   │   │   └── reality/
│   │   └── historian/
│   │       └── reviews/
│   └── humans/dinis_cruz/
│       ├── briefs/                  # READ-ONLY for agents
│       ├── debriefs/
│       └── claude-code-web/
├── library/
│   └── dependencies/
│       └── osbot-utils/type_safe/   # Copy Type_Safe guides from main repo
├── pyproject.toml
└── README.md
```

### 1.2 Create Version File

```
echo "v0.1.0" > sg_send_cli/version
```

### 1.3 Create pyproject.toml

See `ROLE__devops.md` for the complete template.

### 1.4 Create CI/CD Pipeline

Copy the pipeline structure from the SG/Send main repo:
- `.github/workflows/ci-pipeline.yml` — reusable base
- `.github/workflows/ci-pipeline__dev.yml` — dev trigger
- `.github/workflows/ci-pipeline__main.yml` — main trigger + PyPI

Adapt: change package name, remove Lambda deploy steps, keep test + PyPI steps.

### 1.5 Verify Pipeline

```bash
poetry install
pytest tests/unit/ -v
```

Must pass (even with zero tests — just verify infrastructure works).

---

## Phase 2: Types + Schemas + Crypto

### 2.1 Define Custom Safe_* Types

Create in `sg_send_cli/types/`:

```python
# Safe_Str__Vault__Id.py
import re
from osbot_utils.type_safe.primitives.core.Safe_Str import Safe_Str

class Safe_Str__Vault__Id(Safe_Str):
    max_length = 8
    regex      = re.compile(r'[^a-fA-F0-9]')     # Only hex chars
```

Types to define:
- `Safe_Str__Vault__Id` — 8 hex chars
- `Safe_Str__Vault__Key` — `pass:vid:sid` format
- `Safe_Str__Vault__Passphrase` — user passphrase
- `Safe_Str__Transfer__Id` — 12 hex chars
- `Safe_Str__SHA256` — 64 hex chars
- `Safe_Str__Access__Token` — auth token
- `Safe_UInt__FileSize` — file size in bytes
- `Enum__Sync__State` — synced, modified_locally, etc.

### 2.2 Define Schemas

Create in `sg_send_cli/schemas/`:

All schemas are **pure data** — no methods. See the assessment v2 for complete schema definitions.

### 2.3 Implement Vault__Crypto

Create `sg_send_cli/core/Vault__Crypto.py`:

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2   import PBKDF2HMAC
from cryptography.hazmat.primitives               import hashes
import os

ITERATIONS   = 600_000
NONCE_LENGTH = 12

class Vault__Crypto(Type_Safe):
    @type_safe
    def derive_key(self, passphrase, vault_id) -> bytes:
        salt = f"sg-vault-v1:{vault_id}".encode("utf-8")
        kdf  = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                           salt=salt, iterations=ITERATIONS)
        return kdf.derive(str(passphrase).encode("utf-8"))

    @type_safe
    def encrypt(self, data: bytes, key: bytes) -> bytes:
        nonce      = os.urandom(NONCE_LENGTH)
        aesgcm     = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, data, None)
        return nonce + ciphertext

    @type_safe
    def decrypt(self, blob: bytes, key: bytes) -> bytes:
        nonce      = blob[:NONCE_LENGTH]
        ciphertext = blob[NONCE_LENGTH:]
        aesgcm     = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, None)
```

### 2.4 Write Interop Tests (GATE)

This is the most important test. Derive a key in Python, verify it matches a known-good value from the browser. Encrypt in Python, verify the result can be decrypted by the browser (and vice versa).

```python
class Test__Vault__Crypto(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.crypto = Vault__Crypto()

    def test__derive_key__matches_browser(self):
        key = self.crypto.derive_key(passphrase="test", vault_id="a1b2c3d4")
        # Verify against known-good value from browser (compute once, hardcode)
        assert key.hex() == "..."  # TODO: compute in browser first

    def test__encrypt_decrypt__round_trip(self):
        key       = self.crypto.derive_key(passphrase="test", vault_id="a1b2c3d4")
        plaintext = b"Hello, World!"
        encrypted = self.crypto.encrypt(plaintext, key)
        decrypted = self.crypto.decrypt(encrypted, key)
        assert decrypted == plaintext
```

---

## Phase 3: Core Services

Build `Vault__Key__Parser`, `Vault__Client`, `Vault__Tree`, `Vault__Config`, `Vault__Sync` — each with tests.

---

## Phase 4: CLI Commands

Wire up `Typer__Routes` with `cmd_` methods that delegate to core services.

---

## Verification Checklist

Before declaring Phase 1 complete:

- [ ] `poetry install` succeeds
- [ ] `pytest tests/unit/ -v` passes
- [ ] CI/CD pipeline runs on push to dev
- [ ] PyPI publishes on push to main (even if package is near-empty)
- [ ] `.claude/CLAUDE.md` exists and is comprehensive
- [ ] `team/explorer/` has all 6 role directories with README.md + ROLE__{name}.md
- [ ] `sg_send_cli/version` contains `v0.1.0`
- [ ] Zero raw primitives in any Type_Safe class
