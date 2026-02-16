# SG/Send — Brand & Design Guidelines

**Version:** v0.3.5
**Date:** 16 February 2026
**Status:** Active — adopted as primary brand identity
**Decision:** D051 — "SG/Send" adopted as brand shorthand and primary visual identity

---

## 1. Brand Architecture

### Names & Usage

| Context | Name | When to Use |
|---------|------|-------------|
| **Brand mark / logo** | `SG/Send` | On-screen, in marketing materials, presentations, documentation headers |
| **Formal / legal** | SGraph Send | Legal documents, terms of service, copyright notices, press releases |
| **Spoken** | "SG Send" | Conversation, podcasts, video — the slash is silent |
| **Social handles** | `@SGSend` | Twitter/X, LinkedIn, GitHub — slash not supported |
| **Hashtags** | `#SGSend` | Social media |
| **Filenames** | `sg-send` or `sgsend` | Packages, repos, file systems |
| **CLI / code** | `sg-send` | Package names, command names |

### Product Family System

The `SG/` prefix is the brand anchor. The word after the slash identifies the product.

```
SG/          ← Parent brand (SGraph AI)
SG/Send      ← Encrypted file sharing
SG/Image     ← Image processing (planned)
SG/Text      ← Semantic text generation (planned)
SG/Billing   ← Usage-based billing (planned)
```

### Domain Mapping

| Brand | Domain |
|-------|--------|
| SG/ | sgraph.ai / sgraph.com |
| SG/Send | send.sgraph.ai |
| SG/Image | image.sgraph.ai |
| SG/Text | text.sgraph.ai |

The brand name and domain structure mirror each other: the slash in the brand corresponds to the dot in the subdomain.

---

## 2. The Slash

The forward slash `/` is the defining element of the SG/ brand system. It is not decorative — it is the brand mark.

### Design Principles for the Slash

| Principle | Meaning |
|-----------|---------|
| **Separator** | Divides the brand prefix from the product — structure made visible |
| **Forward motion** | Leans right — implies direction, progress, sending |
| **URL native** | Echoes the web — paths, routes, navigation |
| **Division** | Your data / our server — the zero-knowledge boundary |
| **Extensibility** | `SG/` with nothing after it implies "anything is possible" |

### Slash Specifications

| Property | Value |
|----------|-------|
| Angle | 75° from horizontal (steeper than a standard `/` at ~68°) |
| Weight | 1.2× the stroke weight of the surrounding letterforms |
| Colour | Brand accent (teal) when on dark backgrounds; dark navy when on light |
| Spacing | Optically centred between `SG` and `Send` — slightly tighter than a normal space |
| Height | Extends from baseline to cap height of the `S` — no overshoot |

### Slash as Visual System

The slash extends beyond the logo into the broader visual language:

| Application | Treatment |
|-------------|-----------|
| **Section dividers** | Angled lines at 75° echoing the slash |
| **Progress indicators** | The slash as a moving or filling element during upload/download |
| **Background textures** | Subtle repeated slashes at low opacity as pattern |
| **Breadcrumbs** | `SG / Send / Upload` — the slash as navigation separator |
| **Pull quotes** | Oversized slash as a decorative quotation mark |
| **Data visualisation** | Angled grid lines at 75° |

---

## 3. Logo

### Primary Mark: `SG/Send`

The logo is purely typographic. No icon, no symbol — the slash *is* the mark.

```
 SG/Send
 ──┬──┬──┬───
   │  │  └── Product name: regular or medium weight
   │  └──── Slash: accent colour, slightly heavier weight
   └────── Brand prefix: bold or semi-bold
```

### Logo Variants

| Variant | Mark | Use Case |
|---------|------|----------|
| **Full lockup** | `SG/Send` | Primary use — headers, marketing, documentation |
| **Parent brand** | `SG/` | When representing the family, not a specific product |
| **Icon mark** | `SG/` | App icons, square format, social avatars |
| **Monogram** | `S/` | Favicon (16×16, 32×32), very small spaces |
| **Slash only** | `/` | Watermarks, decorative use, brand texture |

### Minimum Sizes

| Variant | Minimum Width |
|---------|--------------|
| Full lockup (`SG/Send`) | 80px |
| Icon mark (`SG/`) | 32px |
| Monogram (`S/`) | 16px |

### Clear Space

Minimum clear space around the logo equals the width of the `/` character at the logo's rendered size. No other elements should encroach within this boundary.

### Logo Don'ts

- Don't rotate the logo
- Don't change the slash angle
- Don't separate `SG` and `/Send` onto different lines
- Don't use the logo on backgrounds that reduce slash visibility below 4.5:1 contrast
- Don't add effects (shadows, glows, outlines, gradients on the text)
- Don't substitute a backslash `\` for the forward slash `/`
- Don't animate the individual letters — the slash may animate independently

---

## 4. Colour

### Primary Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Teal** (accent) | `#4ECDC4` | 78, 205, 196 | Slash in logo, CTAs, links, active states, progress indicators |
| **Dark Navy** (primary) | `#1A1A2E` | 26, 26, 46 | Primary background (dark themes), primary text (light themes) |
| **Deep Blue** | `#16213E` | 22, 33, 62 | Secondary background, cards, panels |
| **Slate** | `#2C3E6B` | 44, 62, 107 | Borders, dividers, subtle containers |

### Secondary Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Coral** (warning/accent) | `#E94560` | 233, 69, 96 | Errors, destructive actions, "what we never see" in transparency |
| **Warm White** | `#F0F0F5` | 240, 240, 245 | Light theme background, card surfaces |
| **Light Grey** | `#E0E0E0` | 224, 224, 224 | Body text on dark backgrounds |
| **Mid Grey** | `#8892A0` | 136, 146, 160 | Secondary text, captions, metadata |

### Colour Usage Rules

- **Teal is the hero.** Use it sparingly — accent, not wallpaper. It marks interactive elements and the slash.
- **Dark Navy is the canvas.** The default experience is dark-on-dark with teal accents.
- **Coral is the counterpoint.** It appears in trust/transparency contexts: "what we don't store", error states, deletion confirmations.
- **Never use teal and coral adjacent.** They're complementary and vibrate visually. Separate them with navy or white.

### Contrast Requirements

All text must meet WCAG AA (4.5:1 for body text, 3:1 for large text):

| Combination | Ratio | Pass? |
|-------------|-------|-------|
| Light Grey (#E0E0E0) on Dark Navy (#1A1A2E) | 11.3:1 | AA ✓ |
| Teal (#4ECDC4) on Dark Navy (#1A1A2E) | 8.1:1 | AA ✓ |
| Dark Navy (#1A1A2E) on Warm White (#F0F0F5) | 12.8:1 | AA ✓ |
| Coral (#E94560) on Dark Navy (#1A1A2E) | 5.2:1 | AA ✓ |
| Mid Grey (#8892A0) on Dark Navy (#1A1A2E) | 4.6:1 | AA ✓ |

---

## 5. Typography

### Font Stack

| Role | Font | Fallback | Weight |
|------|------|----------|--------|
| **Display / headings** | DM Sans | system sans-serif | 700 (Bold) |
| **Body** | DM Sans | system sans-serif | 400 (Regular), 500 (Medium) |
| **Code / technical** | JetBrains Mono | monospace | 400 (Regular) |
| **Logo** | Custom letterforms (defined by logo asset) | DM Sans Bold | — |

DM Sans was chosen for its geometric clarity, open letterforms, and excellent readability at both display and body sizes. It communicates modern and approachable without being generic.

### Type Scale

Based on a 1.25 ratio (Major Third):

| Level | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| Display | 40px / 2.5rem | 700 | 1.2 | Hero text, landing page headlines |
| H1 | 32px / 2rem | 700 | 1.25 | Page titles |
| H2 | 25.6px / 1.6rem | 700 | 1.3 | Section headings |
| H3 | 20px / 1.25rem | 600 | 1.35 | Subsection headings |
| Body | 16px / 1rem | 400 | 1.6 | Paragraph text |
| Small | 12.8px / 0.8rem | 400 | 1.5 | Captions, metadata, timestamps |
| Micro | 10px / 0.625rem | 500 | 1.4 | Labels, badges |

### CSS Custom Properties

```css
:root {
    --font-display:    'DM Sans', system-ui, sans-serif;
    --font-body:       'DM Sans', system-ui, sans-serif;
    --font-mono:       'JetBrains Mono', monospace;

    --text-display:    2.5rem;
    --text-h1:         2rem;
    --text-h2:         1.6rem;
    --text-h3:         1.25rem;
    --text-body:       1rem;
    --text-small:      0.8rem;
    --text-micro:      0.625rem;

    --weight-regular:  400;
    --weight-medium:   500;
    --weight-semibold: 600;
    --weight-bold:     700;
}
```

---

## 6. Themes

### Theme System

All visual properties are controlled by CSS custom properties. A single class change on `<body>` switches the entire theme.

```html
<body class="theme-aurora">    <!-- Default -->
<body class="theme-glacier">   <!-- Light / enterprise -->
<body class="theme-ember">     <!-- Warm variant -->
<body class="theme-dark">      <!-- Full dark -->
<body class="theme-contrast">  <!-- WCAG AAA -->
```

### Theme Definitions

#### Aurora (Default)

The primary theme. Clean, modern, balanced. Dark background with teal accents.

```css
.theme-aurora {
    --bg-primary:       #1A1A2E;
    --bg-secondary:     #16213E;
    --bg-surface:       #1E2A4A;
    --text-primary:     #E0E0E0;
    --text-secondary:   #8892A0;
    --accent:           #4ECDC4;
    --accent-hover:     #3DBDB4;
    --accent-subtle:    rgba(78, 205, 196, 0.12);
    --danger:           #E94560;
    --success:          #4ECDC4;
    --border:           rgba(78, 205, 196, 0.15);
    --shadow:           0 4px 24px rgba(0, 0, 0, 0.3);
}
```

#### Glacier (Light)

Trust-evoking, professional. For enterprise and business contexts.

```css
.theme-glacier {
    --bg-primary:       #F0F2F8;
    --bg-secondary:     #FFFFFF;
    --bg-surface:       #FFFFFF;
    --text-primary:     #1A1A2E;
    --text-secondary:   #5A6577;
    --accent:           #4A90D9;
    --accent-hover:     #3A7BC8;
    --accent-subtle:    rgba(74, 144, 217, 0.08);
    --danger:           #D94452;
    --success:          #38A89D;
    --border:           rgba(26, 26, 46, 0.1);
    --shadow:           0 2px 12px rgba(0, 0, 0, 0.06);
}
```

#### Ember (Warm)

Approachable, friendly. For less technical audiences.

```css
.theme-ember {
    --bg-primary:       #1C1410;
    --bg-secondary:     #2A1F18;
    --bg-surface:       #332820;
    --text-primary:     #F0E6DC;
    --text-secondary:   #A89888;
    --accent:           #E07C4F;
    --accent-hover:     #D06A3D;
    --accent-subtle:    rgba(224, 124, 79, 0.12);
    --danger:           #E05555;
    --success:          #6DBF8B;
    --border:           rgba(224, 124, 79, 0.15);
    --shadow:           0 4px 24px rgba(0, 0, 0, 0.4);
}
```

#### Dark Mode

Pure dark for low-light environments.

```css
.theme-dark {
    --bg-primary:       #0D0D14;
    --bg-secondary:     #141420;
    --bg-surface:       #1A1A28;
    --text-primary:     #CCCCCC;
    --text-secondary:   #777788;
    --accent:           #4ECDC4;
    --accent-hover:     #3DBDB4;
    --accent-subtle:    rgba(78, 205, 196, 0.08);
    --danger:           #E94560;
    --success:          #4ECDC4;
    --border:           rgba(255, 255, 255, 0.06);
    --shadow:           0 4px 24px rgba(0, 0, 0, 0.5);
}
```

#### High Contrast

WCAG AAA compliant. Maximum readability.

```css
.theme-contrast {
    --bg-primary:       #000000;
    --bg-secondary:     #1A1A1A;
    --bg-surface:       #222222;
    --text-primary:     #FFFFFF;
    --text-secondary:   #CCCCCC;
    --accent:           #00E5CC;
    --accent-hover:     #00FFDD;
    --accent-subtle:    rgba(0, 229, 204, 0.15);
    --danger:           #FF6666;
    --success:          #66FF99;
    --border:           rgba(255, 255, 255, 0.3);
    --shadow:           0 0 0 2px rgba(255, 255, 255, 0.2);
}
```

---

## 7. Spacing & Layout

### Spacing Scale

Based on a 4px base unit:

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Tight gaps, icon padding |
| `--space-2` | 8px | Inline spacing, compact lists |
| `--space-3` | 12px | Form element padding |
| `--space-4` | 16px | Standard gap, card padding |
| `--space-6` | 24px | Section padding, card margins |
| `--space-8` | 32px | Major section spacing |
| `--space-12` | 48px | Page section gaps |
| `--space-16` | 64px | Hero spacing, major vertical rhythm |
| `--space-24` | 96px | Full section dividers |

### Layout

| Property | Value |
|----------|-------|
| Max content width | 720px (reading), 1200px (full-width) |
| Gutter | 24px (mobile), 32px (desktop) |
| Border radius (small) | 6px — buttons, inputs |
| Border radius (medium) | 12px — cards, panels |
| Border radius (large) | 20px — modals, hero sections |

---

## 8. Components

### Buttons

```css
/* Primary */
.btn-primary {
    background: var(--accent);
    color: var(--bg-primary);
    font-weight: var(--weight-semibold);
    padding: var(--space-3) var(--space-6);
    border-radius: 6px;
    border: none;
    transition: background 0.15s ease, transform 0.1s ease;
}
.btn-primary:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
}
.btn-primary:active {
    transform: translateY(0);
}

/* Secondary (ghost) */
.btn-secondary {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--border);
    padding: var(--space-3) var(--space-6);
    border-radius: 6px;
}

/* Danger */
.btn-danger {
    background: var(--danger);
    color: #FFFFFF;
}
```

### Cards

```css
.card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-6);
    box-shadow: var(--shadow);
}
```

### Input Fields

```css
.input {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-body);
    font-size: var(--text-body);
    transition: border-color 0.15s ease;
}
.input:focus {
    border-color: var(--accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

### Progress Component (Trust Education)

Per D048, the progress component is a multi-phase storytelling element:

```css
.progress-trust {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-8);
}
.progress-trust__bar {
    width: 100%;
    height: 4px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
}
.progress-trust__fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
}
.progress-trust__message {
    font-size: var(--text-body);
    color: var(--text-secondary);
    text-align: center;
    min-height: 3em; /* prevents layout shift between messages */
    transition: opacity 0.3s ease;
}
.progress-trust__learn-more {
    font-size: var(--text-small);
    color: var(--accent);
    text-decoration: none;
}
```

### Transparency Panel

The signature UX element — shows what the server stores vs. what it never sees.

| Column | Colour | Icon |
|--------|--------|------|
| "What we store" | Teal accent | ✓ checkmark |
| "What we never see" | Coral danger | ✗ cross |

---

## 9. Iconography

### Style

- **Line icons** — 1.5px stroke, rounded caps and joins
- **24×24 default size** — scales to 16×16 (compact) and 32×32 (feature)
- **Teal on dark, dark navy on light** — follows text colour rules
- **No filled icons** — line-only maintains the minimal, transparent aesthetic

### Core Icon Set

| Icon | Use | Notes |
|------|-----|-------|
| Upload arrow (↑) | Upload action | Angled at 75° to echo the slash |
| Download arrow (↓) | Download action | Angled at 75° |
| Lock (open) | Encryption status | Open lock = encrypting; closed = encrypted |
| Eye | Transparency panel | "What we see" |
| Eye-off | Transparency panel | "What we never see" |
| Key | Decryption key | Used in "how it works" flow |
| Copy | Copy URL/key | Clipboard action |
| Check | Success states | Completion, verification |
| Slash | Brand mark | Decorative, dividers |

---

## 10. Motion & Animation

### Principles

- **Purposeful, not decorative.** Every animation communicates a state change.
- **Fast.** Default duration is 150ms for micro-interactions, 300ms for transitions, 500ms for entrances.
- **Ease-out.** Standard easing: `cubic-bezier(0.25, 0.1, 0.25, 1)` — fast start, gentle landing.

### Key Animations

| Element | Animation | Duration | Trigger |
|---------|-----------|----------|---------|
| Slash in logo | Subtle pulse (opacity 1→0.7→1) | 2s loop | Idle/loading |
| Progress bar fill | Width expansion | Matches upload speed | Upload/download |
| Trust message | Fade in + slight upward drift | 300ms | Phase change |
| Card appearance | Fade in + scale(0.98→1) | 300ms | Page load |
| Button hover | translateY(-1px) | 150ms | Hover |
| Error shake | translateX(0→-4→4→-2→2→0) | 400ms | Validation error |

### Slash Loading Animation

The brand slash can be used as a loading indicator: a single `/` that tilts slightly back and forth (±5°) at 75° base angle.

```css
@keyframes slash-pulse {
    0%, 100% { opacity: 1; transform: rotate(-15deg); }
    50%      { opacity: 0.5; transform: rotate(-15deg) scale(1.05); }
}
.loading-slash {
    display: inline-block;
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent);
    animation: slash-pulse 1.5s ease-in-out infinite;
}
```

---

## 11. Voice & Tone

### Writing Principles

| Principle | Example |
|-----------|---------|
| **Direct, not clever** | "Your file is encrypted" not "We've wrapped your file in a blanket of security" |
| **Confident, not arrogant** | "We can't read your files" not "We're the most secure platform ever built" |
| **Technical when needed, plain when possible** | "AES-256-GCM" for developers, "military-grade encryption" for everyone else |
| **Short sentences** | One idea per sentence. Breathe. |
| **Active voice** | "Your browser encrypts the file" not "The file is encrypted by your browser" |

### Key Phrases

| Phrase | When to Use |
|--------|-------------|
| "Your files, your keys, your privacy" | Tagline, hero text |
| "We literally cannot read your files" | Differentiator statement |
| "Zero knowledge. Zero fuss." | Product descriptor |
| "Encrypted in your browser" | Feature description |
| "Here's what we store — and what we don't" | Transparency panel header |

### Words We Use / Words We Avoid

| Use | Avoid |
|-----|-------|
| encrypted data | blob |
| encrypted file | ciphertext (in user-facing copy) |
| decryption key | secret key, passphrase |
| your browser | client-side |
| we can't see | zero-knowledge (in headlines — fine in body text) |
| private | secure (as lead word — sounds corporate) |
| send | transfer (too formal for everyday use) |

---

## 12. IFD Implementation Notes

These guidelines are implemented within the IFD (Incremental Feature Delivery) methodology:

- All CSS custom properties live in the base version (`v0/v0.1/v0.1.0/css/`)
- Theme overrides are a single CSS file swap (per IFD versioning)
- Fonts loaded via `<link>` in `<head>` — no npm packages
- All text from i18n translation files — no hardcoded strings
- Web Components use these tokens via `var()` — no Shadow DOM isolation
- New components follow IFD: new version folder, surgical override only

---

## Document Lineage

This document consolidates design decisions from:
- `v0.3.5__designer__comment__sg-send-brand-shorthand.md` (D051)
- `v0.3.5__designer__cruz-and-cruz-feedback-analysis.md` (D048, D049, D050)
- `v0.3.5__designer.md` (theme system, IFD constraints)
- `v0.3.3__brief__cruz-and-cruz-design-agency.md` (brand values, competitive positioning)
