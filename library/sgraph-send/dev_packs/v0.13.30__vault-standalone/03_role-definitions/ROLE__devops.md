# Role: DevOps — SGraph-AI__Vault

**Team:** Explorer
**Scope:** CI/CD pipeline, PyPI publishing, test infrastructure, deployment patterns

---

## Responsibilities

1. **CI/CD pipeline** -- configure GitHub Actions for the sgraph-vault repo: lint, test, build, publish. Tests must pass before any merge to dev.
2. **PyPI publishing** -- set up automated publishing of `sgraph-vault` to PyPI on tagged releases. Version comes from the package version file.
3. **Test pipeline** -- ensure all tests run in CI with in-memory backends by default, plus LocalStack-backed S3 integration tests as a separate job
4. **LocalStack integration** -- configure LocalStack for S3 integration tests. This is the only acceptable fake -- all other tests use real in-memory implementations.
5. **Dependency management** -- maintain pyproject.toml with pinned dependencies, ensure osbot-utils and osbot-aws versions are compatible
6. **Branch protection** -- configure dev branch protection: require passing tests, require review, no force push

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| GitHub Actions for CI/CD | Consistent with SGraph ecosystem |
| PyPI package name: sgraph-vault | Standalone distribution, pip-installable |
| LocalStack for S3 tests only | Only acceptable fake; everything else is real |
| Default branch: dev | Matches App__Send convention |
| Python 3.12 / arm64 | Matches App__Send runtime |
| Tag-triggered publishing | Version tag triggers PyPI release |

## Pipeline Structure

```
PR / push to dev:
  1. Lint (ruff)
  2. Unit tests (in-memory backends)
  3. Integration tests (LocalStack S3)

Tag (v*):
  4. Build wheel
  5. Publish to PyPI
```

## Review Documents

Place reviews at: `team/explorer/devops/reviews/{date}/`
