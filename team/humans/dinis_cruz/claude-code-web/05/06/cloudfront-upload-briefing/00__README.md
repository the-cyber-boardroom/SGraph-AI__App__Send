# CloudFront Upload Briefing Pack

**Topic:** Eliminating the raw S3 domain from agent allow-lists by routing all
file transfer through `data.send.sgraph.ai` (a CloudFront distribution).

**Why this matters:** Agents (Claude Code web, MCP clients, LLMs) block requests
to domains not on their allow-list. Today the S3 bucket hostname must be
explicitly whitelisted. The goal is to make all SGraph Send operations work with
only `*.sgraph.ai` on the allow-list — enabling SGit to run from any agent that
permits `*.sgraph.ai`.

---

## Reading Order

| File | What it covers |
|------|---------------|
| `01__options-overview.md` | Problem statement, the hard S3 constraint, tiered upload approach, final allow-list |
| `02__cloudfront-put-oac.md` | Technical deep-dive: two-layer auth model, Python signing code, security caveats, POC scope |
| `03__devops-config.md` | Everything infrastructure: DNS, CloudFront distribution, OAC, S3 bucket policy, key setup, Lambda env vars |
| `04__dev-implementation.md` | Phased dev plan with full backwards compatibility, SGit adoption path, testing strategy |

---

## Domain Naming

| Domain | Purpose |
|--------|---------|
| `send.sgraph.ai` | Lambda API — all authenticated API calls |
| `data.send.sgraph.ai` | CloudFront data distribution — uploads and downloads |

`data.send.sgraph.ai` is a new CloudFront distribution backed by the same S3
bucket. It is the **only new domain** introduced by this work.

---

## The One Sentence Summary

Replace S3 presigned URLs with CloudFront signed URLs on `data.send.sgraph.ai`
for both uploads and downloads, so everything runs through `*.sgraph.ai` and
agents never need the raw S3 bucket domain.
