# Role: DevOps — sgraph_ai__tools

**Team:** Explorer
**Scope:** CI/CD pipeline, S3 + CloudFront deployment, cache configuration

---

## Responsibilities

1. **CI/CD pipeline** — GitHub Actions per module: detect change → test → deploy to S3 → update latest → invalidate CloudFront
2. **S3 bucket** — `tools-sgraph-ai` bucket with OAI-only access
3. **CloudFront distribution** — `tools.sgraph.ai` with ACM cert, correct cache behaviours
4. **Cache headers** — immutable for pinned versions, 5-min for latest
5. **CORS** — `Access-Control-Allow-Origin: *.sgraph.ai` on all responses
6. **Local dev** — any static file server works (`python3 -m http.server 8080`)

## Infrastructure

| Component | Detail |
|-----------|--------|
| S3 bucket | `tools-sgraph-ai`, same region as send.sgraph.ai |
| CloudFront | `tools.sgraph.ai`, ACM cert for `*.sgraph.ai` |
| Default root | `tools/index.html` |
| Cache: pinned | `Cache-Control: public, max-age=31536000, immutable` |
| Cache: latest | `Cache-Control: public, max-age=300` |
| Cache: HTML | `Cache-Control: public, max-age=300` |

## Pipeline Architecture

Three workflows (same pattern as SG/Send main repo):

```
.github/workflows/
├── deploy.yml                # Reusable base (detect → test → S3 → CloudFront)
├── deploy__dev.yml           # Push to dev → deploy
└── deploy__main.yml          # Push to main → deploy (production)
```

Key difference from SG/Send: no Lambda deploy, no PyPI. Just S3 sync + CloudFront invalidation.

## Key Rule

**Per-module deployment.** Changes to `core/crypto/` only deploy `core/crypto/`. Don't redeploy everything.

## Review Documents

Place reviews at: `team/explorer/devops/reviews/{date}/`
