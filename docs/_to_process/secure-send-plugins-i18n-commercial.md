# Secure Send — Plugins, Internationalisation & Commercialisation

**Version:** 1.0 DRAFT  
**Date:** February 2026  
**Parent Brief:** `secure-send-brief.md`  
**Companion:** `secure-send-roadmap.md`  
**Repo:** `MGraph-AI__App__Secure_Send`  
**Tracking:** All items below map to Issues FS issues  

---

## 1. Executive Summary

This document captures three interconnected expansion areas for Secure Send:

1. **Plugin Architecture** — a modular system where features (themes, IP enrichment, fingerprinting, billing, branding) are discrete, optional plugins that can be enabled or disabled per deployment. This is the enabler for everything else.

2. **Internationalisation & Cultural Adaptation** — a three-phase approach that goes far beyond simple translation: language → cultural language variants → culturally-sensitive UX redesign. This is both a differentiation play and a soft-marketing / community-building strategy.

3. **Commercialisation** — an open-source-first business model where the code is free, but the **service of maintaining a customer-specific fork** (branding, features, updates, support) is the paid product. Each customer gets a private repo with their configuration, and we charge less than their internal cost to maintain it themselves.

The unifying design principle: **Secure Send is a simple platform.** That simplicity is a feature, not a limitation. Every addition must be a plugin that can be removed, not core complexity that can't.

---

## 2. Workstream: Plugin Architecture

### 2.1 Vision

Every non-core feature is a plugin. The core platform is: encrypt → upload → share link + key → download → decrypt. Everything else — themes, IP enrichment, fingerprinting, billing, branding, accessibility modes, language packs, bot detection — is a plugin that can be independently enabled, disabled, or swapped.

This matters because:
- **Self-hosted deployments** may want a minimal install (no IP enrichment, no billing)
- **Enterprise customers** want specific plugins (branding, SSO) but not others (public themes)
- **The SaaS version** runs all plugins, but they can be toggled per-token or per-tenant
- **New features** don't bloat the core — they're additive, optional, removable

### 2.2 Plugin Categories

| Category | Plugins | Default (SaaS) | Default (Self-hosted) |
|----------|---------|----------------|----------------------|
| **Core** | Transfer engine, token auth, S3 storage | Always on | Always on |
| **Themes** | Corporate, playful, Matrix, seasonal, custom | On | Off (default theme) |
| **Transparency** | IP enrichment, browser fingerprint, localStorage panel | On | Off |
| **Security** | IDS, bot detection, rate limiting, WAF | On | Rate limiting only |
| **Billing** | Stripe credits, usage metering | On | Off |
| **Branding** | Custom logo, colours, copy, domain | Off (default brand) | Off |
| **i18n** | Language packs, cultural variants | On (en-GB default) | On (en-GB default) |
| **Accessibility** | Screen reader support, high contrast, large fonts | On | On |
| **Analytics** | Usage stats, cost tracking, admin dashboard | On | Minimal |

### 2.3 Plugin Interface

Each plugin is a Python package that registers itself with the core:

```python
# plugins/themes/matrix/plugin.py
from secure_send.plugins import Plugin, PluginType

class MatrixTheme(Plugin):
    name = "matrix-theme"
    type = PluginType.THEME
    version = "1.0.0"
    description = "Green-on-black Matrix-inspired theme"

    def get_assets(self) -> dict:
        return {
            "css": "plugins/themes/matrix/style.css",
            "logo": "plugins/themes/matrix/logo.svg",
            "favicon": "plugins/themes/matrix/favicon.ico",
        }

    def get_config(self) -> dict:
        return {
            "primary_color": "#00ff00",
            "background": "#000000",
            "font_family": "'Courier New', monospace",
            "animation": "matrix-rain",
        }
```

```python
# plugins/ip_enrichment/plugin.py
class IPEnrichmentPlugin(Plugin):
    name = "ip-enrichment"
    type = PluginType.TRANSPARENCY
    version = "1.0.0"
    dependencies = []  # no other plugins required

    async def on_request(self, request: Request, context: TransferContext) -> dict:
        """Called on every transfer request. Returns data for transparency panel."""
        ip = request.client.host
        enrichment = await self.ipdata_client.lookup(ip)
        return {
            "geo": enrichment.geo,
            "isp": enrichment.isp,
            "threat_level": enrichment.threat_level,
            "is_vpn": enrichment.is_vpn,
        }
```

### 2.4 Plugin Discovery & Configuration

```yaml
# secure_send_config.yaml (or environment variables)
plugins:
  enabled:
    - core                    # always
    - theme-default           # or: theme-matrix, theme-corporate, theme-seasonal
    - ip-enrichment           # optional
    - browser-fingerprint     # optional
    - billing-stripe          # optional
    - branding-custom         # optional, requires branding config below
    - i18n-en-gb              # language pack
    - i18n-pt-br              # language pack
    - accessibility           # recommended

  branding:
    logo_url: "https://cdn.example.com/logo.svg"
    company_name: "Acme Corp"
    primary_color: "#0066CC"
    tagline: "Secure file sharing for Acme"
    support_email: "support@acme.com"
    support_url: "https://help.acme.com"
    footer_text: "Powered by Secure Send"

  ip_enrichment:
    provider: "ipdata"
    api_key: "${IPDATA_API_KEY}"
    cache_ttl: 86400          # 24 hours

  billing:
    stripe_key: "${STRIPE_SECRET_KEY}"
    webhook_secret: "${STRIPE_WEBHOOK_SECRET}"
    credit_packs: [5, 10, 25]
```

### 2.5 Plugin File Structure

```
secure-send/
├── core/                       # Transfer engine (NEVER optional)
├── storage/                    # Storage abstraction
├── api/                        # FastAPI app + routes
├── plugins/
│   ├── __init__.py             # Plugin registry + loader
│   ├── base.py                 # Plugin base class + types
│   │
│   ├── themes/
│   │   ├── default/            # Clean, minimal (always available)
│   │   ├── corporate/          # Professional, neutral
│   │   ├── matrix/             # Green-on-black, code rain animation
│   │   ├── retro/              # 8-bit, pixel art
│   │   ├── seasonal/           # Auto-rotates (holiday themes, doodle-of-the-day)
│   │   └── custom/             # Customer-provided assets
│   │
│   ├── transparency/
│   │   ├── ip_enrichment/      # ipdata.co integration
│   │   ├── browser_fingerprint/# Client-side fingerprinting + display
│   │   └── local_storage/      # localStorage transparency panel
│   │
│   ├── security/
│   │   ├── ids/                # Intrusion detection
│   │   ├── bot_detection/      # Bot/agentic AI detection
│   │   └── rate_limiting/      # Per-IP, per-token rate limits
│   │
│   ├── billing/
│   │   └── stripe/             # Stripe credits integration
│   │
│   ├── branding/
│   │   └── custom/             # Logo, colours, copy, domain
│   │
│   ├── i18n/
│   │   ├── engine.py           # Translation engine + cultural adapter
│   │   ├── packs/
│   │   │   ├── en_gb.yaml      # English (British)
│   │   │   ├── en_us.yaml      # English (American)
│   │   │   ├── pt_pt.yaml      # Portuguese (Portugal)
│   │   │   ├── pt_br.yaml      # Portuguese (Brazil)
│   │   │   ├── fr_fr.yaml      # French (France)
│   │   │   ├── tlh.yaml        # Klingon (why not)
│   │   │   └── ...
│   │   └── cultural/
│   │       ├── pt_pt_algarve.yaml   # Regional cultural variant
│   │       ├── pt_pt_norte.yaml
│   │       └── ...
│   │
│   └── accessibility/
│       ├── screen_reader/      # ARIA labels, semantic HTML
│       ├── high_contrast/      # WCAG AAA contrast mode
│       └── large_text/         # Scalable font mode
```

### 2.6 Issues FS Tree

```
EPIC: Plugin Architecture
│
├── STORY: Plugin framework — core infrastructure
│   ├── TASK: Define Plugin base class and PluginType enum
│   ├── TASK: Implement plugin registry (discover, load, validate)
│   ├── TASK: Implement plugin configuration (YAML + env vars)
│   ├── TASK: Add plugin lifecycle hooks (on_request, on_upload, on_download, on_render)
│   ├── TASK: Frontend plugin mount points (header, footer, sidebar, panel slots)
│   └── TEST: Load/unload plugins dynamically; verify isolation
│
├── STORY: Plugin — theme system
│   ├── TASK: Define theme interface (CSS, logo, favicon, colours, fonts, animations)
│   ├── TASK: Implement default theme
│   ├── TASK: Implement corporate theme
│   ├── TASK: Implement Matrix theme (green-on-black, code rain)
│   ├── TASK: Implement retro/8-bit theme
│   ├── TASK: Implement seasonal/daily theme rotation (Google Doodle style)
│   ├── TASK: Theme selector UI (user preference, stored in localStorage)
│   └── TEST: Each theme renders correctly on desktop + mobile
│
├── STORY: Plugin — custom branding
│   ├── TASK: Define branding config schema (logo, name, colours, tagline, support)
│   ├── TASK: Implement branding injection (logo in header, name in title, colours in CSS vars)
│   ├── TASK: Implement multi-brand support (parent company + subsidiary logos)
│   ├── TASK: "Powered by Secure Send" footer (configurable)
│   └── TEST: Brand assets render correctly across all pages
│
└── STORY: Migrate existing features to plugins
    ├── TASK: Extract IP enrichment → plugin
    ├── TASK: Extract browser fingerprint → plugin
    ├── TASK: Extract billing → plugin
    ├── TASK: Extract bot detection → plugin
    └── TEST: Core runs with zero plugins enabled; all features work with all plugins enabled
```

---

## 3. Workstream: Internationalisation & Cultural Adaptation

### 3.1 Vision

Three phases that go progressively deeper:

| Phase | Scope | Example |
|-------|-------|---------|
| **Phase 1: Language** | Translate all UI strings into multiple languages | English → Portuguese, French, Klingon |
| **Phase 2: Cultural Language** | Adjust language for regional variants (vocabulary, spelling, tone) | Portuguese (Portugal) vs Portuguese (Brazil) vs Portuguese (Angola) |
| **Phase 3: Cultural UX** | Redesign information architecture, layout, tone, imagery for cultural norms | Direct/minimal UX (US/UK) vs relationship-first UX (some cultures greet before transacting) |

### 3.2 Phase 1 — Language Translation

**Approach:** All user-facing strings live in language pack YAML files. The frontend renders based on the active language pack. LLM-assisted translation with human review.

```yaml
# i18n/packs/en_gb.yaml
upload:
  title: "Send a file securely"
  drag_drop: "Drop your file here, or click to browse"
  max_size: "Max size: {max_size}"
  encrypt_button: "Encrypt & Upload"
  
complete:
  title: "Your file has been encrypted and uploaded"
  download_link_label: "Download link"
  key_label: "Decryption key"
  separate_channels: "For best security, send the link and the key via DIFFERENT channels."

transparency:
  title: "What we stored about this transfer"
  your_ip: "Your IP address"
  upload_time: "Upload time"
  file_size: "File size"
  not_stored: "NOT stored"
  encrypted_note: "Encrypted (we cannot read it)"
  nothing_else: "That's everything. Nothing else is captured."
```

```yaml
# i18n/packs/pt_pt.yaml
upload:
  title: "Envie um ficheiro de forma segura"
  drag_drop: "Arraste o seu ficheiro para aqui, ou clique para procurar"
  max_size: "Tamanho máximo: {max_size}"
  encrypt_button: "Encriptar e Enviar"

complete:
  title: "O seu ficheiro foi encriptado e enviado"
  download_link_label: "Link para download"
  key_label: "Chave de desencriptação"
  separate_channels: "Para maior segurança, envie o link e a chave por canais DIFERENTES."

transparency:
  title: "O que guardámos sobre esta transferência"
  your_ip: "O seu endereço IP"
  upload_time: "Hora do envio"
  file_size: "Tamanho do ficheiro"
  not_stored: "NÃO guardado"
  encrypted_note: "Encriptado (não conseguimos ler)"
  nothing_else: "Isto é tudo. Nada mais foi capturado."
```

```yaml
# i18n/packs/pt_br.yaml (Brazilian variant)
upload:
  title: "Envie um arquivo de forma segura"           # "arquivo" not "ficheiro"
  drag_drop: "Arraste o seu arquivo para cá, ou clique para escolher"
  encrypt_button: "Criptografar e Enviar"              # "criptografar" not "encriptar"
```

**Target languages for MVP+:**

| Language | Code | Priority | Notes |
|----------|------|----------|-------|
| English (British) | `en-GB` | P0 | Default |
| English (American) | `en-US` | P1 | Spelling + date format differences |
| Portuguese (Portugal) | `pt-PT` | P1 | Operator's native language |
| Portuguese (Brazil) | `pt-BR` | P1 | Largest Portuguese-speaking market |
| French (France) | `fr-FR` | P2 | Large European market |
| Spanish (Spain) | `es-ES` | P2 | Large European market |
| German | `de-DE` | P2 | Privacy-conscious market (good fit) |
| Klingon | `tlh` | Fun | Because we can, and it's a statement |

### 3.3 Phase 2 — Cultural Language Variants

Beyond vocabulary differences (ficheiro/arquivo), this phase captures tonal and contextual adjustments:

| Variant | Tone Adjustment | Example |
|---------|----------------|---------|
| `pt-PT` (Portugal) | Direct, formal, concise | "O seu ficheiro foi enviado." |
| `pt-BR` (Brazil) | Warmer, slightly more casual | "Pronto! Seu arquivo foi enviado com sucesso. 🎉" |
| `pt-AO` (Angola) | Respectful, formal | "O seu ficheiro foi enviado com êxito." |
| `pt-CV` (Cape Verde) | Friendly, community-oriented | "Já está! O ficheiro foi enviado." |

This is where LLM-assisted generation becomes powerful — generate variants, then get native speakers to review and refine.

### 3.4 Phase 3 — Cultural UX Redesign

This is the ambitious and genuinely differentiating phase. Not just changing words, but changing **how the page works** for different cultures.

**Examples of cultural UX differences:**

| Culture/Region | UX Adaptation | Rationale |
|---------------|---------------|-----------|
| US/UK (direct) | Minimal UI, drag-and-drop immediately visible, no preamble | Task-oriented culture; get to the point |
| Japan | More whitespace, softer colours, polite prefacing text before actions | High-context culture; respect for process |
| Middle East | RTL layout, different colour associations, greeting before transaction | Right-to-left reading; hospitality norms |
| Portugal (Algarve) | Warm colours, relaxed tone, beach/sun imagery in theme | Regional identity; tourism-influenced |
| Portugal (Norte/Porto) | More formal, granite/wine imagery, structured layout | Regional pride; more traditional |
| Germany | Detailed privacy explanation upfront, certification badges prominent | Privacy-first culture; trust through thoroughness |
| Brazil | Vibrant colours, social proof, WhatsApp sharing prominent | Social, mobile-first, community-oriented |

**Implementation approach:**

```yaml
# i18n/cultural/pt_pt_algarve.yaml
extends: pt_pt                          # base language pack
cultural:
  theme_override: "warm-coastal"        # warm palette, relaxed imagery
  tone: "casual-friendly"
  greeting: "Olá! Bem-vindo."           # greeting before action
  layout:
    hero_image: "assets/cultural/algarve_coast.jpg"
    primary_action_position: "center"   # not top-left
  about_page:
    regional_note: "Feito com ❤️ no Algarve"
```

### 3.5 Feedback & Community Loop

A core part of the i18n strategy is **inviting users to contribute and correct**:

```
┌──────────────────────────────────────────────────────────────┐
│  🌍 Help us improve this translation                          │
│                                                              │
│  You're viewing Secure Send in Portuguese (Portugal).         │
│                                                              │
│  Is this translation accurate for your region?               │
│  [ 👍 Looks good ] [ 🔧 Suggest improvement ]                │
│                                                              │
│  Your region: [Algarve ▾]                                    │
│                                                              │
│  This feedback helps us make Secure Send feel natural        │
│  in your language and culture.                               │
└──────────────────────────────────────────────────────────────┘
```

Feedback is stored as Issues FS issues (type: `Feedback`) for review. This doubles as soft marketing — users feel ownership, and their network hears about the platform.

### 3.6 Issues FS Tree

```
EPIC: Internationalisation & Cultural Adaptation
│
├── STORY: i18n — translation infrastructure
│   ├── TASK: Define language pack YAML schema (all user-facing strings)
│   ├── TASK: Extract all hardcoded strings from frontend to language keys
│   ├── TASK: Implement language pack loader (detect from browser, URL param, or user pref)
│   ├── TASK: Build language selector UI
│   ├── TASK: Store language preference in localStorage
│   └── TEST: Switch language → all strings update, no missing keys
│
├── STORY: i18n — Phase 1 language packs
│   ├── TASK: Create en-GB pack (default, source of truth)
│   ├── TASK: Create en-US pack (spelling, date format variants)
│   ├── TASK: Create pt-PT pack
│   ├── TASK: Create pt-BR pack
│   ├── TASK: Create fr-FR pack
│   ├── TASK: Create es-ES pack
│   ├── TASK: Create de-DE pack
│   ├── TASK: Create tlh (Klingon) pack
│   └── TEST: All packs complete (zero missing keys), render correctly
│
├── STORY: i18n — Phase 2 cultural language variants
│   ├── TASK: Define cultural variant schema (extends base language pack)
│   ├── TASK: Create pt-PT regional variants (Algarve, Norte, Lisbon, etc.)
│   ├── TASK: Create pt-BR regional variants (São Paulo, Nordeste, etc.)
│   ├── TASK: LLM-assisted variant generation pipeline
│   ├── TASK: Native speaker review workflow (feedback → Issues FS)
│   └── TEST: Regional variants load correctly; fallback to base when variant missing
│
├── STORY: i18n — Phase 3 cultural UX redesign
│   ├── SPIKE: Research cultural UX patterns (5 target cultures)
│   ├── TASK: Define cultural layout schema (action position, greeting, imagery, etc.)
│   ├── TASK: Implement layout engine that respects cultural config
│   ├── TASK: RTL support (Arabic, Hebrew)
│   ├── TASK: Create 3 reference cultural UX variants (direct, formal, relationship-first)
│   └── TEST: Cultural variants render correctly; A/B test engagement
│
├── STORY: i18n — feedback mechanism
│   ├── TASK: Build "Help improve this translation" widget
│   ├── TASK: Store feedback as Issues FS issues (type: Feedback)
│   ├── TASK: Admin dashboard for reviewing translation feedback
│   └── TEST: Feedback submitted → appears in Issues FS → actionable
│
└── STORY: i18n — regional themes
    ├── TASK: Theme system supports cultural/regional overrides
    ├── TASK: Create Algarve regional theme (warm, coastal palette)
    ├── TASK: Create Norte/Porto regional theme (granite, formal)
    └── TEST: Regional theme loads when cultural variant is selected
```

---

## 4. Workstream: Accessibility

### 4.1 Vision

Secure Send should be usable by everyone, regardless of visual, motor, or cognitive ability. This isn't just compliance — it's consistent with the platform's transparency values. If we believe users should see everything we know about them, we should also make sure all users can actually see it.

### 4.2 Standards

Target: **WCAG 2.2 Level AA** (with aspiration toward AAA for key flows).

| Requirement | Standard | Implementation |
|-------------|----------|---------------|
| Colour contrast | WCAG 2.2 AA (4.5:1 text, 3:1 large text) | All themes must pass; high-contrast mode for AAA |
| Screen reader | ARIA labels on all interactive elements | Semantic HTML, `aria-label`, `aria-live` for status updates |
| Keyboard navigation | All actions reachable via keyboard | Tab order, focus indicators, Enter/Space activation |
| Large text mode | Scalable without breaking layout | `rem` units throughout, no fixed pixel sizes |
| Reduced motion | Respect `prefers-reduced-motion` | Disable animations (Matrix code rain, etc.) |
| Dark mode | `prefers-color-scheme` | Native OS preference detection + manual toggle |
| High contrast | Windows High Contrast mode compatible | Use `forced-colors` media query |
| Focus indicators | Visible focus ring on all interactive elements | Custom focus styles that meet 3:1 contrast |
| Error identification | Errors described in text, not just colour | Wrong decryption key → text message, not just red border |
| Status announcements | Screen readers notified of upload progress, completion | `aria-live="polite"` regions |

### 4.3 Accessibility Modes (Plugin)

```
┌─────────────────────────────────────────────────────┐
│  ♿ Accessibility                                    │
│                                                      │
│  [x] Dark mode                                       │
│  [ ] High contrast (WCAG AAA)                        │
│  [ ] Large text                                       │
│  [ ] Reduced motion                                   │
│  [ ] Screen reader optimised                          │
│                                                      │
│  These preferences are stored locally in your         │
│  browser and never sent to our servers.               │
└─────────────────────────────────────────────────────┘
```

### 4.4 Issues FS Tree

```
EPIC: Accessibility
│
├── STORY: Accessibility — semantic HTML baseline
│   ├── TASK: Audit all pages for semantic HTML (headings, landmarks, lists)
│   ├── TASK: Add ARIA labels to all interactive elements
│   ├── TASK: Ensure tab order is logical on all pages
│   ├── TASK: Add skip-to-content links
│   └── TEST: axe-core audit passes with zero critical/serious issues
│
├── STORY: Accessibility — visual modes
│   ├── TASK: Implement dark mode (OS detection + manual toggle)
│   ├── TASK: Implement high-contrast mode (WCAG AAA)
│   ├── TASK: Implement large text mode (1.5× base font, fluid layout)
│   ├── TASK: Implement reduced-motion mode (disable animations)
│   ├── TASK: Store preferences in localStorage
│   └── TEST: All modes render correctly; no layout breaks
│
├── STORY: Accessibility — screen reader support
│   ├── TASK: Add aria-live regions for upload progress + completion
│   ├── TASK: Announce errors, status changes, and confirmation
│   ├── TASK: Test with VoiceOver (macOS/iOS), NVDA (Windows), TalkBack (Android)
│   └── TEST: Full transfer flow completable via screen reader only
│
└── STORY: Accessibility — audit & compliance
    ├── TASK: Run Lighthouse accessibility audit (target: 100)
    ├── TASK: Run axe-core automated audit
    ├── TASK: Manual keyboard-only walkthrough of all flows
    └── TEST: WCAG 2.2 AA compliance verified
```

---

## 5. Workstream: Commercialisation

### 5.1 Vision

Secure Send is **open source and free to self-host**. The commercial model is not the code — it's the **service of maintaining a customer-specific version**. This is the Red Hat / GitLab model applied to a simple SaaS product.

### 5.2 Why Companies Will Pay

The code is free. Deploying, maintaining, branding, updating, and supporting it is not:

| Internal Cost (DIY) | What's Involved | Estimated Cost |
|---------------------|-----------------|----------------|
| Initial deployment | DevOps engineer sets up AWS/Docker, configures S3, DNS | 2-5 days = £2-5K |
| Branding | Designer creates theme, developer integrates | 1-2 days = £1-2K |
| Ongoing updates | Track upstream releases, merge, test, deploy | 2-4 hours/month = £500-1K/mo |
| Bug response | Investigate, patch, deploy when something breaks | Unpredictable, £500-2K per incident |
| Security patches | Monitor CVEs, apply patches urgently | £500-1K per patch cycle |
| Internal support | Answer "how do I use this?" from employees | Ongoing overhead |
| **Total Year 1** | | **£15-30K** |

| Our Service | What We Provide | Price |
|-------------|----------------|-------|
| Setup + branding + deployment | Turnkey, branded, tested, deployed | £2-5K one-time |
| Maintenance subscription | Updates, security patches, tested in their env | £500-1K/month |
| Feature requests | Custom features added to their version | Per-feature pricing |
| Support | Dedicated support channel | Included in subscription |
| **Total Year 1** | | **£8-17K** |

The value proposition: **We're always cheaper than doing it yourself, and we're better at it because it's our platform.**

### 5.3 Customer Architecture

Each customer gets a private GitHub repo that extends the open-source core:

```
# Public repo (open source)
MGraph-AI__App__Secure_Send/
├── core/
├── storage/
├── api/
├── plugins/
└── ...

# Private repo (per customer) — extends, never forks
MGraph-AI__App__Secure_Send__Customer__AcmeCorp/
├── branding/
│   ├── logo.svg
│   ├── favicon.ico
│   ├── theme.yaml          # colours, fonts, imagery
│   └── copy/
│       ├── about.md         # custom About page content
│       ├── terms.md         # their terms of service
│       └── support.md       # internal support instructions
│
├── config/
│   ├── plugins.yaml         # which plugins are enabled
│   ├── deploy.yaml          # their AWS account/region/tier settings
│   └── tokens.yaml          # pre-configured tokens (optional)
│
├── i18n/
│   ├── en_gb_acme.yaml      # custom string overrides (e.g. "Send a file" → "Share a document")
│   └── de_de_acme.yaml      # German variant for German offices
│
├── ci/
│   └── github_actions.yaml  # automated build + deploy + test
│
└── README.md                # deployment instructions, support contacts
```

**Key principles:**
- The customer repo **never forks** the core. It **imports** it as a dependency and layers configuration on top.
- When we release a core update, the customer's CI pipeline runs, applies their branding, runs their tests, and deploys.
- The customer can see their repo (transparency), but we manage it (convenience).

### 5.4 Multi-Brand / Subsidiary Support

Large companies are made of smaller companies. The branding plugin supports nested branding:

```yaml
# branding/config.yaml for a subsidiary
branding:
  parent:
    name: "Parent Corp"
    logo: "parent_logo_small.svg"      # small, in footer
    position: "footer"
  primary:
    name: "Subsidiary X"
    logo: "subsidiary_logo.svg"         # large, in header
    position: "header"
    colors:
      primary: "#E63946"               # subsidiary brand colour
      secondary: "#1D3557"
  tagline: "Secure file sharing for Subsidiary X"
  footer: "A Parent Corp company · Powered by Secure Send"
```

This avoids the "top-down pushed service" feel — the subsidiary's brand is prominent, the parent's brand is present but secondary.

### 5.5 Dogfooding: Use Our Own Companies

Before selling to external customers, brand Secure Send for our own companies:

| Company | Repo | Branding | Notes |
|---------|------|----------|-------|
| **The Cyber Boardroom** | `...__Customer__CyberBoardroom` | CB brand, security-focused copy | Cybersecurity audience — heavy on transparency features |
| **MyFeeds AI** | `...__Customer__MyFeeds` | MyFeeds brand, AI-focused copy | AI/tech audience — show fingerprinting features |
| **MGraph AI** | `...__Customer__MGraph` | MGraph brand, developer-focused copy | Developer audience — technical explanations |

These serve as reference implementations and case studies for future customers.

### 5.6 Pricing Tiers

| Tier | Target | Includes | Price |
|------|--------|----------|-------|
| **Open Source** | Anyone | Full codebase, self-host, community support | Free |
| **Managed Basic** | Small teams | Hosted instance, custom branding, 5 tokens, email support | £49/month |
| **Managed Pro** | Companies | Dedicated instance, custom branding, unlimited tokens, SSO, SLA | £299/month |
| **Enterprise** | Large orgs | Private repo, custom features, multi-brand, dedicated support | £999+/month |
| **Marketplace** | AWS users | AMI, one-click deploy, pay-as-you-go via AWS billing | Usage-based |

### 5.7 Issues FS Tree

```
EPIC: Commercialisation
│
├── STORY: Customer repo template
│   ├── TASK: Create customer repo template structure
│   ├── TASK: Implement branding overlay mechanism (core + customer layer)
│   ├── TASK: Implement CI pipeline template (build, brand, test, deploy)
│   ├── TASK: Implement multi-brand support (parent + subsidiary)
│   └── TEST: Deploy customer-branded instance from template repo
│
├── STORY: Dogfooding — internal company brands
│   ├── TASK: Create Cyber Boardroom branded instance
│   ├── TASK: Create MyFeeds AI branded instance
│   ├── TASK: Create MGraph AI branded instance
│   └── TEST: All three instances deploy, branded, fully functional
│
├── STORY: Managed hosting infrastructure
│   ├── TASK: Multi-tenant deployment architecture (shared infra, isolated data)
│   ├── TASK: Customer provisioning automation (new customer → branded instance)
│   ├── TASK: Automated upstream update pipeline (core update → customer rebuild → test → deploy)
│   └── TEST: Provision new customer in <1 hour; core update propagates in <24h
│
├── STORY: Commercial pricing & billing
│   ├── TASK: Implement Stripe subscription for managed tiers
│   ├── TASK: Build customer onboarding flow
│   ├── TASK: Build customer admin portal (manage tokens, view usage, manage branding)
│   └── TEST: End-to-end: sign up → pay → branded instance live
│
├── STORY: Sales & marketing collateral
│   ├── TASK: Create comparison page (DIY cost vs managed cost)
│   ├── TASK: Create case studies from dogfooding instances
│   ├── TASK: Create "Why open source?" explainer (no lock-in, transparency)
│   └── TEST: Content review — messaging is clear and credible
│
└── SPIKE: AWS Marketplace listing
    ├── TASK: Research Marketplace requirements (AMI, metering, EULA)
    ├── TASK: Create AMI with marketplace metering
    └── TASK: Submit listing for review
```

---

## 6. Updated Consolidated Roadmap

Integrating with the phases from `secure-send-roadmap.md`:

```
Phase 0 (NOW)       ── MVP ──────────────────────────────────────────
                     Core transfer flow, token auth, transparency

Phase 1 (MVP+2w)    ── Deploy-Everywhere + Plugin Framework ─────────
                     Storage abstraction, plugin architecture,
                     PyPI, Docker Hub

Phase 2 (MVP+4w)    ── Cost Tracking + Billing ──────────────────────
                     Per-transfer costs, Stripe credits,
                     billing as plugin

Phase 3 (MVP+6w)    ── Fingerprint + Accessibility ──────────────────
                     IP enrichment plugin, browser fingerprint plugin,
                     WCAG 2.2 AA compliance, dark mode, high contrast

Phase 4 (MVP+8w)    ── i18n Phase 1 + Themes ────────────────────────
                     Language packs (8 languages), theme system,
                     Matrix/corporate/seasonal themes

Phase 5 (MVP+10w)   ── Security Intelligence + Bot Detection ────────
                     IDS plugin, bot detection plugin,
                     access timeline, threat dashboard

Phase 6 (MVP+12w)   ── i18n Phase 2 + Dogfooding ───────────────────
                     Cultural language variants,
                     Cyber Boardroom / MyFeeds / MGraph branded instances

Phase 7 (MVP+16w)   ── i18n Phase 3 + Commercialisation ────────────
                     Cultural UX redesign,
                     customer repo template, managed hosting,
                     pricing tiers, sales collateral

Phase 8 (MVP+20w)   ── Enterprise + Marketplace ─────────────────────
                     SSO/SAML, multi-brand subsidiaries,
                     AWS Marketplace AMI, Terraform modules,
                     CloudFormation templates
```

---

## 7. Full Issues FS Epic Tree (This Document)

```
EPIC: Secure Send — Plugins, i18n & Commercialisation
│
├── EPIC: Plugin Architecture
│   ├── STORY: Plugin framework (core infrastructure)
│   ├── STORY: Theme system (default, corporate, Matrix, retro, seasonal)
│   ├── STORY: Custom branding plugin
│   └── STORY: Migrate existing features to plugins
│
├── EPIC: Internationalisation & Cultural Adaptation
│   ├── STORY: Translation infrastructure
│   ├── STORY: Phase 1 — language packs (8 languages)
│   ├── STORY: Phase 2 — cultural language variants
│   ├── STORY: Phase 3 — cultural UX redesign
│   ├── STORY: Feedback mechanism
│   └── STORY: Regional themes
│
├── EPIC: Accessibility
│   ├── STORY: Semantic HTML baseline
│   ├── STORY: Visual modes (dark, high contrast, large text, reduced motion)
│   ├── STORY: Screen reader support
│   └── STORY: Audit & WCAG 2.2 AA compliance
│
└── EPIC: Commercialisation
    ├── STORY: Customer repo template
    ├── STORY: Dogfooding (CB, MyFeeds, MGraph)
    ├── STORY: Managed hosting infrastructure
    ├── STORY: Pricing & subscription billing
    ├── STORY: Sales & marketing collateral
    └── SPIKE: AWS Marketplace listing
```

---

*This document extends the Secure Send roadmap. All items should be instantiated as Issues FS issues by the Conductor, linked under the main Secure Send epic. Plugin architecture (Section 2) is a prerequisite for most other workstreams and should be prioritised immediately after MVP.*
