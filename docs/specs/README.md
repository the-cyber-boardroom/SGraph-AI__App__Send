# SGraph Send — Specification Documents Index

**Status:** Reference material (source of truth for requirements)
**Location:** `docs/_to_process/` (originals)

---

## Document Map

| # | Document | Scope | Phase Relevance |
|---|----------|-------|-----------------|
| 1 | [Project Brief](../_to_process/project%20-%20Secure%20Send%20Service%20brief.md) | MVP user stories, API endpoints, encryption model, pre-signed URL strategy, S3 data structure, deployment architecture, Issues FS tree | **Phase 1 (MVP)** — primary source |
| 2 | [Roadmap](../_to_process/secure-send-roadmap.md) | Deploy-everywhere, cost tracking, billing, browser fingerprinting, security intelligence, bot detection | Phase 2–6 (deferred) |
| 3 | [Plugins, i18n & Commercial](../_to_process/secure-send-plugins-i18n-commercial.md) | Plugin architecture, theme system, internationalisation (3 phases), accessibility, commercialisation model | Phase 2–8 (deferred) |
| 4 | [LLM, Retention, Compliance & GTM](../_to_process/secure-send-llm-retention-compliance-gtm.md) | LLM integration (BYOK, in-browser, Ollama), retention/ephemeral design, user accounts, credit economics, compliance, DSAR, go-to-market | Phase 7–14 (deferred) |
| 5 | [Strategic Opportunities](../_to_process/secure-send-strategic-opportunities.md) | CLI/SDK, MCP server, one-time secrets, browser extension, data rooms, P2P/WebRTC, multi-recipient, webhooks, warrant canary, PWA, educational platform, notarisation, time-locked transfers, regulated verticals | Phase 9–22 (deferred) |
| 6 | [Naming & Branding Strategy](../_to_process/sgraph-ai-naming-branding-strategy.md) | Brand architecture (SGraph-AI), naming rationale, repo structure, URL architecture, product portfolio, community outreach | Pre-launch (branding established) |

---

## How to Use These Documents

- **For Phase 1 (MVP) work:** Use document #1 (Project Brief) as the primary reference. The Issues FS tree under `.issues/` contains the actionable breakdown.
- **For future phase planning:** Documents #2–5 contain the full vision. Each has its own Issues FS epic tree that should be instantiated when that phase begins.
- **For branding decisions:** Document #6 establishes "SGraph Send" at `send.sgraph.ai` as the product name. The codename "Secure Send" is used in the spec documents but the brand is SGraph Send.

---

## Key Decisions Already Made (from specs)

| Decision | Source | Detail |
|----------|--------|--------|
| Brand name | Doc #6 | **SGraph Send** at `send.sgraph.ai` |
| Encryption | Doc #1 | AES-256-GCM, client-side, Web Crypto API |
| Storage | Doc #1 | S3 with pre-signed URLs, Lambda never touches file bytes |
| Auth model | Doc #1 | Bearer tokens (sender), no auth (receiver), admin key (admin) |
| Frontend | Doc #1 | Vanilla JS/HTML/CSS for MVP (no framework) |
| Backend | Doc #1 | FastAPI + Mangum on Lambda |
| Environments | Doc #1 | dev → qa → prod |
| File expiry | Doc #1 | 7 days default |
| Max file size | Doc #1 | Architect to recommend (50–100MB for MVP) |
