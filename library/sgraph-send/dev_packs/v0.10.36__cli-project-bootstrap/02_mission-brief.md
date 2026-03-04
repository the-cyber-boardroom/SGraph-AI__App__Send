# Mission Brief

**Version:** v0.10.36

---

## Mission

Build `sg-send-cli` — a Python CLI that syncs encrypted vaults between a local filesystem and SG/Send's Transfer API. Git-inspired UX. Interoperable with the browser vault. Zero raw Python primitives.

## Deliverables

### Phase 1: Pipeline + Crypto (Session 1)

| # | Deliverable | Success Criteria |
|---|---|---|
| 1.1 | Repo structure with CLAUDE.md | Matches project conventions |
| 1.2 | CI/CD pipeline | Tests pass, PyPI publishes on main push |
| 1.3 | Custom Safe_* types | All domain types defined, validation tests pass |
| 1.4 | Pure data schemas | All schemas are Type_Safe, zero raw primitives, round-trip serialization works |
| 1.5 | `Vault__Crypto` | AES-256-GCM encrypt/decrypt, PBKDF2 KDF, **interop test vectors pass** |

### Phase 2: Core Services (Session 2)

| # | Deliverable | Success Criteria |
|---|---|---|
| 2.1 | `Vault__Key__Parser` | Parse/construct vault keys, round-trip tests |
| 2.2 | `Vault__Client` | HTTP client with direct + presigned upload, tested against in-memory server |
| 2.3 | `Vault__Tree` | Tree manipulation (add/remove/find files/folders), unit tests |
| 2.4 | `Vault__Config` | Read/write .sg_vault/ directory, file I/O tests |

### Phase 3: CLI Commands (Session 3)

| # | Deliverable | Success Criteria |
|---|---|---|
| 3.1 | `clone` command | Full workflow: parse key → download settings → download tree → decrypt files → create .sg_vault/ |
| 3.2 | `init` command | Create vault on remote, create local .sg_vault/ |
| 3.3 | `status` command | Diff local files vs remote tree |
| 3.4 | `push` command | Encrypt changed files → upload → update tree → update settings |
| 3.5 | `pull` command | Download changed files → decrypt → write to disk |
| 3.6 | `ls` + `info` commands | Read-only vault inspection |

### Phase 4: Polish (Session 4)

| # | Deliverable | Success Criteria |
|---|---|---|
| 4.1 | Rich progress bars | File upload/download shows progress |
| 4.2 | Error handling | User-friendly messages for all failure modes |
| 4.3 | `.sgvaultignore` | Pattern-based file exclusion |
| 4.4 | PyPI v1.0.0 | Published, installable via `pip install sg-send-cli` |

## Non-Negotiable Rules

1. **Zero raw primitives** — no `str`, `int`, `float`, `list`, `dict` in Type_Safe classes
2. **All classes extend Type_Safe** — no plain Python classes
3. **No Pydantic** — ever
4. **No boto3** — ever (use osbot-aws if needed)
5. **No mocks, no patches** — real implementations in tests
6. **Pipeline before features** — CI/CD must work before writing vault logic
7. **Interop gate** — crypto tests must pass before anything else
8. **Schemas are pure data** — no methods on schema classes
9. **Class-based everything** — no module-level functions, no static methods

## Package Details

| Field | Value |
|---|---|
| Repository | `https://github.com/the-cyber-boardroom/SG_Send__CLI` |
| PyPI name | `sg-send-cli` |
| Code folder | `sg_send_cli/` |
| Entry point | `sg-send-cli` → `sg_send_cli.cli.app:main` |
| Python | ^3.12 |
| Build | Poetry |
| Version file | `sg_send_cli/version` |
| Default branch | `dev` |
