# DevOps Summary for tools.sgraph.ai Build

---

## Infrastructure: S3 + CloudFront (Same Pattern as send.sgraph.ai)

tools.sgraph.ai follows the exact same deployment pattern as all other `*.sgraph.ai` sites.

### S3 Bucket

| Property | Value |
|----------|-------|
| Bucket name | `tools-sgraph-ai` (or similar, following existing naming) |
| Region | Same as send.sgraph.ai (likely eu-west-1 or eu-west-2) |
| Access | CloudFront OAI only (no public access) |
| Versioning | Enabled (S3 versioning as safety net, separate from folder-based module versioning) |

### CloudFront Distribution

| Property | Value |
|----------|-------|
| Domain | `tools.sgraph.ai` |
| Origin | S3 bucket |
| HTTPS | ACM certificate for `*.sgraph.ai` (already exists) |
| Default root object | `tools/index.html` |
| Error pages | `index.html` for 404 (SPA fallback) |
| CORS | `Access-Control-Allow-Origin: *.sgraph.ai` on all responses |

### Cache Behaviour Rules

| Path Pattern | Cache Control | TTL | Why |
|-------------|--------------|-----|-----|
| `core/*/v*.*.*/` | `public, max-age=31536000, immutable` | 1 year | Pinned version content never changes |
| `components/*/v*.*.*/` | `public, max-age=31536000, immutable` | 1 year | Same |
| `core/*/latest/` | `public, max-age=300` | 5 min | Latest alias updates frequently |
| `components/*/latest/` | `public, max-age=300` | 5 min | Same |
| `tools/` | `public, max-age=300` | 5 min | Tool pages may update |
| `*.html` | `public, max-age=300` | 5 min | HTML pages always fresh |

**Key insight:** Pinned version URLs (e.g., `/core/crypto/v1.0.0/sg-crypto.js`) are content-addressable by version. They can be cached forever because the content at that URL will never change. If there's a bug, we publish `v1.0.1`, not update `v1.0.0`.

---

## CI/CD Pipeline

### Per-Module Deployment

Each module has its own CI/CD trigger. A change to `core/crypto/` only deploys `core/crypto/`:

```yaml
name: Deploy tools.sgraph.ai
on:
  push:
    branches: [dev, main]
    paths:
      - 'core/**'
      - 'components/**'
      - 'tools/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Need HEAD~1 for diff

      - name: Detect changes
        id: changes
        run: |
          git diff --name-only HEAD~1 HEAD > changed_files.txt
          cat changed_files.txt

      - name: Sync to S3
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          # Sync changed modules to S3 with appropriate cache headers
          # Pinned versions: immutable
          # Latest: 5-min
          aws s3 sync . s3://tools-sgraph-ai/ \
            --exclude "*" \
            --include "core/*" --include "components/*" --include "tools/*" \
            --delete

      - name: Invalidate CloudFront
        run: |
          # Only invalidate latest/* and tools/* (pinned versions don't need invalidation)
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.TOOLS_CF_DIST_ID }} \
            --paths "/core/*/latest/*" "/components/*/latest/*" "/tools/*"
```

### Deployment Flow

```
Developer pushes to dev
  -> GitHub Actions detects which module changed
  -> Runs module tests (if any)
  -> Syncs to S3 with correct cache headers
  -> Invalidates CloudFront for latest/* only
  -> Pinned versions never invalidated (immutable)
```

---

## Local Development

No build step. Any static file server works.

```bash
# Option 1: Python (already available)
cd sgraph_ai__tools
python3 -m http.server 8080

# Option 2: Node (if available)
npx serve .

# Option 3: VS Code Live Server extension

# Then open:
open http://localhost:8080/tools/
```

All module imports use absolute paths (`/core/crypto/latest/sg-crypto.js`), which work correctly with any static file server serving from the repo root.

---

## Adding a New Module

1. Create the folder: `core/{name}/v1.0.0/{name}.js`
2. Copy to latest: `core/{name}/latest/{name}.js`
3. Add CI/CD path trigger for the new module
4. Deploy
5. Update `briefs/BRIEF_PACK.md` module registry table

---

## Adding a New Tool

1. Create the folder: `tools/{name}/index.html`
2. Import from core/ and components/ as needed
3. Add tool-specific CSS in `tools/{name}/{name}.css`
4. Add to landing page (`tools/index.html`)
5. Deploy

---

## Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `AWS_ACCESS_KEY_ID` | S3 deployment | GitHub Secrets |
| `AWS_SECRET_ACCESS_KEY` | S3 deployment | GitHub Secrets |
| `TOOLS_CF_DIST_ID` | CloudFront invalidation | GitHub Secrets |
| `TOOLS_S3_BUCKET` | S3 bucket name | GitHub Secrets |

---

## Monitoring

- **CloudFront access logs** — traffic per tool, geographic distribution, popular modules
- **S3 request metrics** — upload/download counts per module
- **No application-level monitoring** — there's no application server, just static files
