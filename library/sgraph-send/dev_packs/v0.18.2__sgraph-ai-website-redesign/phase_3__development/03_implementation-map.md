# Implementation Map — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Phase 3: Development | Source: Developer review**

7-phase build plan with file paths, HTML/CSS/JS sketches, and sequencing.
Full detail: `team/roles/dev/reviews/03/27/v0.18.2__dev-review__website-redesign-implementation-map.md`

---

## Stack Reminders

- Static HTML/CSS/JS on S3 + CloudFront (eu-west-2)
- **No build step** — files deployed as-is
- Web Components with IFD versioning (`v0/v0.1/v0.1.0/component.js`)
- i18n: `/{locale}/` URL prefix, `data-i18n` attributes, JSON string files
- Shared assets: `sgraph_ai__website/_common/`
- Design system: Aurora theme (dark navy `#1A1A2E` + teal `#4ECDC4`, DM Sans)

---

## Phase 0 — Pre-work (Blocker — Must Complete First)

### 0.1 Screenshots (Dinis — human task)
8 product screenshots from live `send.sgraph.ai`. Target paths:

```
sgraph_ai__website/_common/img/
  screenshot-gallery.png
  screenshot-folder.png
  screenshot-sgprint-before.png
  screenshot-sgprint-after.png
  screenshot-token.png
  screenshot-transparency.png
  screenshot-wizard.png
  screenshot-share-modes.png
```
Format: PNG, max 1200px wide, dark background. Also @2x for retina.

### 0.2 Demo vaults (Dev task)
3 demo vaults at `send.sgraph.ai` for `<sg-public-viewer>`:

| Vault ID | Content | Page |
|----------|---------|------|
| `demo-gallery-001` | 4 files: image, PDF, markdown, video | Homepage hero |
| `demo-folder-001` | Folder with 3 files | /features/ |
| `demo-doc-001` | Single markdown file | /why/print-as-pdf/ |

Requirements: keys intentionally public (embedded in HTML), rate-limited, excluded from expiry TTL, CORS allows `sgraph.ai` origin.

### 0.3 CSS tokens — add to `_common/css/style.css`
```css
--bg-secondary: #16213E;
--bg-card: #0F3460;
--border-subtle: rgba(78,205,196,0.15);
--radius-card: 12px;
--shadow-card: 0 4px 24px rgba(0,0,0,0.3);
--transition-base: 0.2s ease;
--max-width-content: 1120px;
--hero-min-height: 600px;
```

---

## Phase 1 — New Pages (PR 1 content)

### 1.1 `/security/` page
**File:** `sgraph_ai__website/en-gb/security/index.html` (+ en-us)

Sections: guarantee → how it works → 3 evaluator questions (subpoena / breach / retention) → transparency panel → zero cookies (DevTools) → GDPR-by-architecture → 6-sentence policy → open source GitHub link.

Schema: WebPage + FAQ (5 questions). See `02_decisions-and-site-map.md` for the 5 FAQ questions.

### 1.2 `/features/` page
**File:** `sgraph_ai__website/en-gb/features/index.html`

4 feature groups with alternating screenshot rows:
- **Sharing:** Gallery, Folder browser, Lightbox, Tokens
- **Security:** ZK encryption, Transparency panel, Share modes, Zero cookies
- **Creation:** SgPrint (before/after), Upload wizard
- **Confirmation:** Receipt confirmation, 17 languages

Schema: SoftwareApplication with featureList. Include comparison table (see `02_decisions-and-site-map.md`).

### 1.3 Five `/why/` pages
```
sgraph_ai__website/en-gb/why/share-a-folder/index.html
sgraph_ai__website/en-gb/why/gallery-preview/index.html
sgraph_ai__website/en-gb/why/print-as-pdf/index.html
sgraph_ai__website/en-gb/why/share-a-video/index.html
sgraph_ai__website/en-gb/why/send-securely/index.html
```
Template: `H1 → Pain ("Today you...") → Solution ("With SG/Send...") → Screenshot/demo → CTA → Breadcrumb`
Schema: BreadcrumbList on all five.

---

## Phase 2 — Homepage Redesign (PR 1 content)

**File:** `sgraph_ai__website/en-gb/index.html`

### Hero — two-column layout
```html
<section class="hero hero--two-col">
  <div class="container">
    <div class="hero__content">
      <h1 class="display">Share files. Browse them.
        Nobody can read them. Not even us.</h1>
      <p class="lead">Files are encrypted in your browser before upload.
        Recipients get a gallery, a folder, or a PDF — without downloading.
        The server never sees your data.</p>
      <div class="hero-ctas">
        <a href="./early-access/" class="btn btn-primary btn--lg">
          Try Free — No Account Required →</a>
        <a href="https://buy.stripe.com/..." class="btn btn-secondary btn--lg">
          Buy Credits — £5 →</a>
      </div>
    </div>
    <div class="hero__demo">
      <sg-public-viewer vault-id="demo-gallery-001" locale="en-gb"
        fallback-src="/_common/img/screenshot-gallery.png">
      </sg-public-viewer>
      <p class="hero__demo-caption">
        Live demo — actually encrypted. Key is intentionally public.
      </p>
    </div>
  </div>
</section>
```

CSS — responsive two-column:
```css
.hero--two-col .container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-8);
  align-items: center;
  min-height: var(--hero-min-height);
}
@media (max-width: 768px) {
  .hero--two-col .container { grid-template-columns: 1fr; }
  .hero__demo { order: -1; } /* demo above headline on mobile */
}
```

### How It Works (new section)
```html
<section class="section section--alt">
  <div class="container">
    <h2>How it works</h2>
    <div class="steps-row">
      <div class="step">
        <div class="step__number">1</div>
        <h3>Drop</h3>
        <p>Add files. Choose your share mode. Pick your retention period.</p>
      </div>
      <div class="step__arrow">→</div>
      <div class="step">
        <div class="step__number">2</div>
        <h3>Encrypt</h3>
        <p>AES-256-GCM runs in your browser. The key never leaves your device.</p>
      </div>
      <div class="step__arrow">→</div>
      <div class="step">
        <div class="step__number">3</div>
        <h3>Share</h3>
        <p>Send a friendly token. Recipients browse, view, and interact — no download required.</p>
      </div>
    </div>
  </div>
</section>
```

### Trust / Privacy section — six-sentence policy VISIBLE
```html
<section class="section section--alt">
  <div class="container">
    <div class="trust-section">
      <div class="trust-callout">
        <p class="display--sm">Zero cookies. Zero tracking.
           We cannot read your files.</p>
      </div>
      <div class="privacy-policy">
        <div class="privacy-policy__header">
          <h2>Our Privacy Policy</h2>
          <p class="privacy-policy__contrast">6 sentences. Theirs: 4,000+ words.</p>
        </div>
        <ol class="privacy-policy__sentences">
          <li>We encrypt your files in your browser before upload.</li>
          <li>We cannot decrypt your files because we never have the key.</li>
          <li>We do not use cookies, tracking pixels, or analytics on the product.</li>
          <li>We store only encrypted ciphertext and a hashed IP address.</li>
          <li>We delete your data after the retention period you chose.</li>
          <li>That's everything. There is nothing else.</li>
        </ol>
        <p class="privacy-policy__verify">
          <a href="./security/">Verify it yourself →</a>
          &nbsp;·&nbsp;
          Open DevTools → Application → Cookies. Zero.
        </p>
      </div>
    </div>
  </div>
</section>
```

### Share modes section (new)
3-card grid: Token Only (most private) / Combined (most convenient) / Separate Key (most flexible).

### Story section (repositioned below fold)
```html
<!-- No test count stat — number spans multiple repos without per-repo context.
     Reintroduce when docs page maps all repos and testing status. -->
<div class="stats-row">
  <div class="stat"><div class="stat__value">18</div><div class="stat__label">Specialised AI agents</div></div>
  <div class="stat"><div class="stat__value">1</div><div class="stat__label">Human architect</div></div>
</div>
```

### Schema markup
Add to `<head>`: SoftwareApplication + HowTo (3-step upload).

---

## Phase 3 — Navigation Update

**Files:** All `/{locale}/*/index.html` nav sections (or `<sg-site-header>` Web Component)

```html
<header class="site-header">
  <div class="container">
    <a href="./" class="site-logo" aria-label="SGraph AI Home">
      <span class="brand-prefix">SG</span><span class="brand-slash">/</span>
    </a>
    <button class="nav-toggle" aria-label="Toggle navigation">&#9776;</button>
    <nav class="site-nav" aria-label="Main navigation">
      <a href="./features/" data-i18n="nav.features">Features</a>
      <a href="./security/" data-i18n="nav.security">Security</a>
      <a href="./pricing/" data-i18n="nav.pricing">Pricing</a>
      <a href="https://tools.sgraph.ai" data-i18n="nav.tools"
         target="_blank" rel="noopener">Tools</a>
    </nav>
    <a href="https://send.sgraph.ai" class="nav-token-link"
       data-i18n="nav.have_token">Already have a token? →</a>
    <div id="locale-picker"></div>
  </div>
</header>
```

i18n keys to add: `nav.features`, `nav.security`, `nav.tools`, `nav.have_token`
i18n keys to remove: `nav.product`, `nav.architecture`, `nav.team`

---

## Phase 4 — `<sg-public-viewer>` Web Component

**File:** `sgraph_ai__website/_common/components/sg-public-viewer.js`
(IFD path: `_common/components/v0/v0.1/v0.1.0/sg-public-viewer.js`)

```html
<sg-public-viewer
  vault-id="demo-gallery-001"
  locale="en-gb"
  fallback-src="/_common/img/screenshot-gallery.png"
  fallback-alt="Gallery view screenshot">
</sg-public-viewer>
```

Implementation: `connectedCallback()` → load vault from send.sgraph.ai → decrypt via Web Crypto API → render gallery/folder → on any error: `_renderFallback(src)`.

CORS requirement: `send.sgraph.ai` must allow `sgraph.ai` origin. Add to CI pre-deploy check.

---

## Phase 5 — Redirects (PR 2 — after PR 1 is deployed and indexed)

CloudFront Function at edge:
```
/{locale}/architecture/      →  /{locale}/security/                (301)
/{locale}/product/           →  /{locale}/                         (301)
/{locale}/agents/            →  https://qa.send.sgraph.ai/team/    (301)
/{locale}/agents/sherpa/     →  https://qa.send.sgraph.ai/team/    (301)
/{locale}/agents/ambassador/ →  https://qa.send.sgraph.ai/team/    (301)
/{locale}/agents/architect/  →  https://qa.send.sgraph.ai/team/    (301)
```

**File:** `sgraph_ai__website/cloudfront/redirects.js`

---

## Phase 6 — Sitemap and robots.txt

Add to `sitemap.xml`: new pages with `xhtml:link` locale alternates.
Remove from sitemap: `/agents/`, `/architecture/`, `/product/`

---

## Phase 7 — CI Updates

**File:** `.github/workflows/deploy-website.yml`

Validate job additions:
1. Check new required files exist (features/, security/, 5x why/)
2. Check `_common/components/sg-public-viewer.js` exists
3. Check 8 screenshots exist
4. CORS check: `send.sgraph.ai` allows `sgraph.ai` origin

Smoke test: curl all new page paths, exit 1 on any failure.

---

## PR Structure

```
PR 1  Phases 1 + 2 + 3 + 4   All new content — add, never remove
  ↓
  [Deploy and wait for indexing — at least 48h]
  ↓
PR 2  Phases 5 + 6 + 7        Redirects, removals, sitemap
```

---

## Open Questions for Dinis

1. **Demo vaults** — who creates the 3 demo vaults at `send.sgraph.ai`?
2. **Screenshots** — who takes the 8 product screenshots? Browser + OS for consistency?
3. **`/why/` copy** — should a Sherpa session write the full copy before Dev builds the HTML?
4. **Locale expansion** — confirm en-gb and en-us only at launch?
5. **CORS** — who adds `sgraph.ai` to `send.sgraph.ai` CORS config?

---

*Phase 3 Development — Implementation Map*
*v0.18.2 — 27 March 2026*
*Full detail: `team/roles/dev/reviews/03/27/v0.18.2__dev-review__website-redesign-implementation-map.md`*
