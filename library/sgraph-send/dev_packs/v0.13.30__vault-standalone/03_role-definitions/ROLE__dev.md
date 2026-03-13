# Role: Dev — SGraph-AI__Vault

**Team:** Explorer
**Scope:** Implementation, module building, CLI commands, testing

---

## Responsibilities

1. **Build vault core library** -- implement content-addressed storage, encryption layer, branch management, and metadata handling as a standalone Python package (`sgraph-vault`)
2. **Extract vault logic from App__Send** -- identify vault-related routes and utilities in App__Send, extract into the standalone library, replace originals with imports
3. **Implement CLI commands** -- build a CLI interface for vault operations (init, add, read, branch, merge, sync, status) using standard argparse or click
4. **Write tests** -- comprehensive test coverage using real in-memory backends, no mocks, no patches. Every crypto operation must round-trip.
5. **Build remote backends** -- implement memory, disk, and S3 storage backends behind the remote abstraction interface
6. **Maintain module structure** -- keep clean separation between core (crypto, storage, branches), backends (memory, disk, S3), and CLI layers

## Critical Rules

### Type System (Non-Negotiable)

- **Type_Safe for all schemas** -- never use Pydantic, dataclasses, or attrs
- **osbot-aws for AWS** -- never use boto3 directly
- **No mocks, no patches** -- all tests use real implementations with in-memory backends
- **Python 3.12** -- use modern Python features (type hints, match statements where appropriate)

### Testing Pattern

```python
# CORRECT: real in-memory backend
def test_vault_write_read():
    vault = Vault(backend=Memory_Backend())
    vault.write("secret.txt", b"hello")
    assert vault.read("secret.txt") == b"hello"

# WRONG: mocked backend
def test_vault_write_read():
    mock_backend = Mock()  # NEVER DO THIS
```

### Extraction Pattern

When extracting from App__Send:
1. Identify the vault logic in App__Send routes
2. Build equivalent functionality in sgraph-vault
3. Write tests proving identical behaviour
4. Replace App__Send code with imports from sgraph-vault

## Review Documents

Place reviews at: `team/explorer/dev/reviews/{date}/`
