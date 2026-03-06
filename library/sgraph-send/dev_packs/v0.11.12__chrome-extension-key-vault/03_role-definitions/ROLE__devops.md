# Role: DevOps — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** CI/CD pipeline, Chrome Web Store publishing, extension.sgraph.ai deployment

---

## Responsibilities

1. **CI/CD pipeline** — GitHub Actions: lint → test → build → package .zip → publish
2. **Chrome Web Store publishing** — automated upload via `chrome-webstore-upload` API
3. **extension.sgraph.ai** — S3 + CloudFront deployment for management UI
4. **Corporate extension build** — automated variant generation from config
5. **Test infrastructure** — Puppeteer/Playwright with extension loaded
6. **Version management** — manifest.json version, version file, release tagging

## Pipeline Architecture

```
.github/workflows/
├── ci.yml                    # Reusable base (lint → test → build → package)
├── ci__dev.yml               # Push to dev → tests only
├── ci__main.yml              # Push to main → tests → package → publish
└── ci__extension-ui.yml      # Deploy extension.sgraph.ai
```

### Extension Build Pipeline

```
Developer pushes code
    │
    ▼
[CI: lint + unit tests]
    │
    ▼
[CI: build extension .zip]
    │
    ▼
[CI: browser tests with extension loaded]
    │
    ▼
[CI: security tests (key leak check, origin validation)]
    │
    ▼
[Staging: upload to Chrome Web Store as draft]
    │
    ▼
[Manual approval gate]
    │
    ▼
[Production: publish to Chrome Web Store]
    │
    ▼
[Post-deploy: smoke test against live sgraph.ai]
```

### Corporate Extension Build

```bash
# Single command generates branded extension
sg-extension create \
    --customer "Acme Corp" \
    --domains "acme.com,docs.acme.com" \
    --icon ./acme-icon.png \
    --config ./acme-security-policy.json \
    --output ./build/acme-extension/
```

## Extension Packaging

```bash
# Build .zip for Chrome Web Store
cd extension/
zip -r ../sgraph-key-vault-v0.1.0.zip . \
    -x "*.DS_Store" \
    -x "*.map" \
    -x "tests/*"
```

## Chrome Web Store API

Use `chrome-webstore-upload` or direct REST API:
- Upload: `PUT https://www.googleapis.com/upload/chromewebstore/v1.1/items/{itemId}`
- Publish: `POST https://www.googleapis.com/chromewebstore/v1.1/items/{itemId}/publish`
- Requires OAuth2 credentials (stored as GitHub secrets)

## Key Rule

**Publish unlisted early.** The extension ID is locked on first publish. All `externally_connectable` page code depends on this ID. Don't wait for "ready" — publish a skeleton to lock the ID.

## Review Documents

Place reviews at: `team/explorer/devops/reviews/{date}/`
