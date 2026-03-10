# What to Clone from SG/Send Main Repo

**Version:** v0.10.36

The CLI project is a standalone repo, but it references several things from the SG/Send main repo. Clone the main repo to a temp location for read access.

---

## How to Access

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

---

## What to READ (Reference Only)

These files define the contracts the CLI must implement against:

| What | Path | Why |
|---|---|---|
| **Encryption source** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-send/sg-send-crypto.js` | Exact crypto parameters (KDF, nonce, tag) |
| **Vault source** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault.js` | Tree structure, settings format, vault lifecycle |
| **Transfer routes** | `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Transfers.py` | API contract, auth pattern |
| **Presigned routes** | `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Presigned.py` | Multipart upload API |
| **Transfer service** | `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py` | Backend behaviour, status machine |
| **Assessment v2** | `team/roles/architect/reviews/03/03/v0.10.36__architect-dev-assessment-v2__vault-cli-local-sync.md` | Full architecture document |
| **Vault stability brief** | `team/roles/dev/reviews/03/03/v0.10.36__implementation-brief__vault-key-stability.md` | Backend update endpoint spec |

## What to COPY (Into CLI Repo)

| What | Source Path | Destination | Why |
|---|---|---|---|
| Type_Safe guides | `library/dependencies/osbot-utils/type_safe/*.md` | `library/dependencies/osbot-utils/type_safe/` | Must be in-repo for session access |
| CI/CD pipeline base | `.github/workflows/ci-pipeline.yml` | `.github/workflows/ci-pipeline.yml` | Adapt for CLI |
| CI/CD dev trigger | `.github/workflows/ci-pipeline__dev.yml` | `.github/workflows/ci-pipeline__dev.yml` | Adapt for CLI |
| CI/CD main trigger | `.github/workflows/ci-pipeline__main.yml` | `.github/workflows/ci-pipeline__main.yml` | Adapt for CLI |

## What NOT to Copy

- Application code (Lambda, routes, services) — the CLI is an API client, not a server
- UI code — the CLI has no browser UI
- Admin Lambda — the CLI only uses the public User Lambda API
- osbot-aws, osbot-fast-api — the CLI doesn't deploy to AWS
- Pydantic schemas — there are none and there should never be any
