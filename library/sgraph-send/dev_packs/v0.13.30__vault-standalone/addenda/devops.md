# DevOps Summary for SGraph Vault Standalone Library

---

## Infrastructure: It's a Library, Not a Service

SGraph Vault is a Python library published to PyPI. There are **no deployment targets** — no Lambda, no containers, no servers. Consumers (such as App__Send) deploy the library as a dependency.

---

## CI/CD Pipeline: GitHub Actions

### Pipeline Flow

```
Push to dev
  -> GitHub Actions triggers
  -> Run pytest (in-memory backends)
  -> Run LocalStack S3 integration tests
  -> All tests pass
  -> Tag version
  -> Publish to PyPI
```

### Workflow Configuration

```yaml
name: Test and Publish sgraph-vault

on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [dev]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Run unit tests
        run: pytest tests/unit/ -v

      - name: Run integration tests (LocalStack)
        run: |
          # LocalStack for S3 backend tests
          pip install localstack
          localstack start -d
          pytest tests/integration/ -v
          localstack stop

  publish:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Read version
        id: version
        run: echo "version=$(cat sgraph_vault/version)" >> $GITHUB_OUTPUT

      - name: Build and publish to PyPI
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_TOKEN }}
        run: |
          pip install build twine
          python -m build
          twine upload dist/*
```

---

## PyPI Package

| Property | Value |
|----------|-------|
| Package name | `sgraph-vault` (or `sgraph-ai-vault`) |
| Version file | `sgraph_vault/version` |
| Python version | 3.12+ |
| Dependencies | `osbot-utils`, `osbot-aws` |
| Dev dependencies | `pytest`, `localstack` |

---

## Test Pipeline

### Unit Tests (No Mocks, No Patches)

All unit tests use real implementations with in-memory backends:

- **In-memory storage** — `Storage_FS` with memory backend, starts in ~100ms
- **In-memory crypto** — real AES-256-GCM and ECDSA operations (not mocked)
- **In-memory vault** — full vault operations (create, commit, branch, merge) against memory storage

```
tests/
  unit/
    test_vault_create.py
    test_vault_commit.py
    test_vault_branch.py
    test_vault_merge.py
    test_vault_crypto.py
    test_vault_tree.py
    test_vault_remote.py
  integration/
    test_vault_s3_backend.py    # LocalStack
```

### Integration Tests (LocalStack)

LocalStack is the only acceptable "fake" — used for S3 backend integration tests. No other mocks or patches.

---

## Integration with App__Send

App__Send consumes the vault library as a PyPI dependency:

```
# In App__Send's requirements.txt or pyproject.toml
sgraph-vault >= 0.1.0
```

App__Send vault routes delegate to the library:

```
App__Send HTTP request -> vault route handler -> sgraph-vault library -> Storage_FS
```

When a new version of sgraph-vault is published:
1. Update the version pin in App__Send
2. Run App__Send test suite
3. Deploy App__Send

---

## Git Conventions

| Property | Value |
|----------|-------|
| Default branch | `dev` |
| Branch naming | `claude/{description}-{session-id}` |
| Feature branches | Branch from `dev` |
| Push command | `git push -u origin {branch-name}` |
| Version bumps | Update `sgraph_vault/version`, commit, tag |

---

## Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `PYPI_TOKEN` | PyPI publish authentication | GitHub Secrets |

No AWS credentials needed in the library's CI — LocalStack runs locally. AWS credentials are only needed by consumers (App__Send) at their deployment time.

---

## Monitoring

There is no application-level monitoring for a library. Consumers are responsible for monitoring their own deployments. The library exposes:

- **Version** — `sgraph_vault/version` readable at runtime
- **Logging** — standard Python logging, consumer configures handlers
- **Metrics** — none built-in; consumer instruments as needed
