# Role: DevOps — SG_Send__CLI

**Team:** Explorer
**Scope:** CI/CD pipeline, PyPI publishing, repo infrastructure

---

## Responsibilities

1. **CI/CD pipeline** — GitHub Actions: test → tag → PyPI (OIDC)
2. **PyPI publishing** — Trusted publisher setup, version management
3. **Repo structure** — pyproject.toml, Poetry setup, dependency management
4. **Dev tooling** — pytest configuration, linting setup

## Pipeline Architecture

Three trigger workflows + one reusable base (copied from SG/Send main repo pattern):

```
.github/workflows/
├── ci-pipeline.yml           # Reusable base (test → tag → pypi)
├── ci-pipeline__dev.yml      # Push to dev → minor tag, no PyPI
└── ci-pipeline__main.yml     # Push to main → major tag, YES PyPI
```

## pyproject.toml

```toml
[tool.poetry]
name        = "sg_send_cli"
version     = "v0.1.0"
description = "SG/Send CLI — encrypted vault sync (git-inspired)"
authors     = ["Dinis Cruz <dinis.cruz@owasp.org>"]
license     = "Apache 2.0"
readme      = "README.md"
homepage    = "https://github.com/the-cyber-boardroom/SG_Send__CLI"
repository  = "https://github.com/the-cyber-boardroom/SG_Send__CLI"

[tool.poetry.scripts]
sg-send-cli = "sg_send_cli.cli.app:main"

[tool.poetry.dependencies]
python        = "^3.12"
osbot-utils   = "*"
typer          = { version = ">=0.9.0", extras = ["all"] }
httpx          = ">=0.25.0"
cryptography   = ">=41.0.0"

[tool.poetry.group.dev.dependencies]
pytest                    = "*"

[build-system]
requires      = ["poetry-core>=1.9.1"]
build-backend = "poetry.core.masonry.api"
```

## Key Rule

**Pipeline before features.** The first session must get CI/CD working (tests pass, PyPI publishes) before writing any vault logic. This is a proven pattern from the SG/Send main project.

## External Actions

Use `owasp-sbot/OSBot-GitHub-Actions@dev` for the reusable CI/CD workflow steps (same as SG/Send main repo).

## Review Documents

Place reviews at: `team/explorer/devops/reviews/{date}/`
