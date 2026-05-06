# website — Reality Index

**Domain:** `website/` | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

The sgraph.ai marketing/product website. Static HTML/CSS/JS served via S3 + CloudFront.
Aurora dark theme. 17 locale JSON files with URL-based routing. Fonts are self-hosted (Google
Fonts violation fixed). Currently lives in `sgraph_ai__website/` inside this repo — a plan
exists to extract it to a dedicated repo (PROPOSED, blocked on human action).

**Current version:** v0.2.0 homepage with web components (sg-site-header v1.0.6, 10 section
components). Deployed to sgraph.ai.

---

## EXISTS (Code-Verified)

### Pages (21 total)

| Page | Path | What It Does |
|------|------|-------------|
| Home | `sgraph_ai__website/index.html` | Hero with token input, vault pattern cards, deployment strip, use-case screenshots, tools section, pricing CTA |
| Product | `sgraph_ai__website/product/index.html` | SG/Send features, zero-knowledge encryption, use cases |
| Architecture | `sgraph_ai__website/architecture/index.html` | Tech stack, security model, deployment architecture |
| Contact | `sgraph_ai__website/contact/index.html` | Contact form (mailto: MVP to sherpa@sgraph.ai) |
| Agents (listing) | `sgraph_ai__website/agents/index.html` | All agent roles with descriptions and profile links |
| Agent: Sherpa | `sgraph_ai__website/agents/sherpa/index.html` | Sherpa agent profile |
| Agent: Ambassador | `sgraph_ai__website/agents/ambassador/index.html` | Ambassador agent profile |
| Agent: Architect | `sgraph_ai__website/agents/architect/index.html` | Architect agent profile |
| Pricing | `sgraph_ai__website/pricing/index.html` | Three-tier pricing (Free/Starter/Self-Hosted) |
| Pricing: Cloud | `sgraph_ai__website/en-gb/pricing/cloud/index.html` | Cloud pricing detail |
| Pricing: Free | `sgraph_ai__website/en-gb/pricing/free/index.html` | Free tier detail |
| Pricing: Self-Hosted | `sgraph_ai__website/en-gb/pricing/self-hosted/index.html` | Self-hosted pricing detail |
| Pricing: Dedicated | `sgraph_ai__website/en-gb/pricing/dedicated/index.html` | Dedicated instance detail |
| Pricing: Managed | `sgraph_ai__website/en-gb/pricing/managed/index.html` | Managed deployment detail |
| Pricing: Your Cloud | `sgraph_ai__website/en-gb/pricing/your-cloud/index.html` | Your-cloud detail |
| Pricing: Partners | `sgraph_ai__website/en-gb/pricing/partners/index.html` | Partner programme detail |
| Pricing: AWS Marketplace | `sgraph_ai__website/en-gb/pricing/aws-marketplace/index.html` | AWS Marketplace listing detail |
| Early Access | `sgraph_ai__website/early-access/index.html` | EAP signup with email form |
| Payment Success | `sgraph_ai__website/payment/success/index.html` | Post-Stripe success page |
| Payment Cancel | `sgraph_ai__website/payment/cancel/index.html` | Payment cancelled + return-to-pricing CTA |
| 404 | `sgraph_ai__website/404.html` | Custom not-found page |

### Web Components (v0.2.0 — shipped 04/23–04/24)

All components in Shadow DOM at `sgraph_ai__website/_common/js/components/{name}/v1/v1.0/{version}/`.

**sg-site-header (v1.0.6):**
- v1.0.4: Shadow DOM, slot-based token bar + locale picker, outside-click handler
- v1.0.5: Self-configuring `SITE_CONFIGS` (just `site="Send"` → full nav auto-configured)
- v1.0.6: Environment-aware cross-site nav (`dev.`/`main.`/`''` prefix from hostname)

**10 Homepage Section Components (v1.0.0):**

| Component | Purpose |
|-----------|---------|
| `sg-send-hero` | Hero section with inline token input handler |
| `sg-vault-patterns` | Human/Agent/Agent-Agent pattern cards |
| `sg-runs-anywhere` | 7-target deployment targets strip |
| `sg-vault-primitives` | Three agentic primitives cards |
| `sg-use-cases` | Five use-case rows with real product screenshots |
| `sg-tools-section` | Browser AI tools cards |
| `sg-privacy-statement` | Privacy inline block |
| `sg-pricing-teaser` | Stripe CTA + pricing link |
| `sg-oss-section` | Three OSS project cards (SG/Send, SGit, sg-tools) |
| `sg-site-footer` | Standardised footer (used on all 5 pages) |

**Critical pattern:** Every `SgComponent` subclass must declare `static jsUrl = import.meta.url`
or `.html`/`.css` siblings resolve relative to the base class install location (HTTP 403).

### Design System

- **Theme:** Aurora (dark navy `#1A1A2E` background, teal `#4ECDC4` accent, coral danger)
- **Typography:** DM Sans (display + body), JetBrains Mono (code) — self-hosted `.woff2` files
- **Layout:** CSS Grid, responsive breakpoints, container system
- **Components:** Cards, buttons (primary, secondary, ghost, sherpa), stats row, callouts, modals

### Internationalisation (i18n)

17 locale JSON files in `sgraph_ai__website/i18n/`. URL-based locale routing. Pages pre-rendered
at build time by `scripts/generate_i18n_pages.py`. Generated locale directories excluded from git.
Non-EN-GB locales marked 'coming soon' in locale picker (content not yet translated).

**Locales:** en, en-gb, en-us, de-de, de-ch, es-es, es-mx, es-ar, fr-fr, fr-ca, it-it,
pt-pt, pt-br, nl-nl, pl-pl, hr-hr, ro-ro, tlh (Klingon).

### CI / Deployment

| Item | Detail |
|------|--------|
| Workflow | `.github/workflows/deploy-website.yml` |
| Trigger | Push to `main` on `sgraph_ai__website/**` paths, or manual dispatch |
| Validation | Checks required HTML files, validates internal links, validates keys.json |
| S3 sync | HTML: 300s TTL; CSS/JS: 86400s; images: 604800s |
| CDN | CloudFront invalidation (`/*`) after sync |
| Smoke test | Curls `https://sgraph.ai` for HTTP 200 |
| CloudFront Edge | `cloudfront/url-rewrite.js` — rewrites directory URIs, adds trailing-slash redirects |

### Python CI Scripts

| Script | What It Does |
|--------|-------------|
| `scripts/deploy_static_site.py` | Validates HTML, syncs to S3, copies to `latest/`, invalidates CloudFront |
| `scripts/generate_i18n_pages.py` | Reads en-GB source + locale JSON, produces pre-rendered locale trees |
| `scripts/store_ci_artifacts.py` | Stores build artifacts to S3 under `ci/{date}/{version}/` |

---

## KNOWN VIOLATIONS

| Violation | Status |
|-----------|--------|
| Absolute path navigation links (older pages) | FLAGGED — not yet fixed |
| Relative paths required for versioned deployments (v0.7.6 arch req) | PARTIALLY VIOLATED |
| `cdn.sgraph.ai` for shared stable artifacts | DOES NOT EXIST |

---

## PROPOSED

Full list: [proposed/index.md](proposed/index.md)

- **Website repo extraction** — move `sgraph_ai__website/` to dedicated `sgraph-ai/SGraph-AI__Website` repo (dev pack ready, Phase 3 blocked on human creating GitHub repo)
- **Website redesign themes** — theme explorer MVP, dark/light/custom theming
- **`<sg-theme>` component** — vertical customisation for white-labelling
- **Library website** — docs/examples site for the SGraph Send component library
- **Examples website** — interactive demos, "Try It Now" use cases
