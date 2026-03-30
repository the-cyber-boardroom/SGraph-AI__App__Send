# `_page.json` v2: Schema Extensions for Agent Control, Theming & Source View

**Date:** 30 March 2026
**From:** Project Lead + Claude (authoring agent)
**To:** UI Team, Designer, Architect
**Status:** Proposal — for review before implementation
**Context:** The v1 `_page.json` renderer shipped and works. This document proposes extensions based on the first rendered output, the Designer's P1–P3 review, and the need to give the authoring agent (Claude) meaningful control over presentation.

---

## 1. Theme Control — Let the Agent Set the Visual Tone

The agent writing the `_page.json` should be able to control the look without writing CSS. The renderer owns the implementation; the JSON expresses intent.

### Proposed: Top-level `theme` object

```json
{
  "title": "SG/Send Strategic Pack",
  "theme": {
    "mode": "dark",
    "accent": "#00d4aa",
    "hero_style": "gradient",
    "font": "mono",
    "density": "comfortable"
  },
  "components": [ ... ]
}
```

### Theme properties

| Property | Values | Default | What it controls |
|----------|--------|---------|-----------------|
| `mode` | `"dark"`, `"light"`, `"auto"` | `"auto"` | Overall colour scheme. `"auto"` inherits from the Browse shell. `"dark"` forces dark backgrounds and light text on all components. `"light"` forces the inverse. This fixes **P1-A** — the nav bar will inherit mode rather than hardcoding white. |
| `accent` | Any CSS colour | Shell default (teal) | Accent colour used for: nav active indicator, bullet markers, hero gradient tint, link colour, gallery border on hover. Gives the agent a single knob to brand a page. |
| `hero_style` | `"gradient"`, `"solid"`, `"blur"`, `"none"` | `"gradient"` | How the hero treats its background image. `"gradient"` = dark gradient scrim over image (current behaviour). `"solid"` = `color` prop as flat background. `"blur"` = blurred image with text overlay. `"none"` = no hero, just start with content. |
| `font` | `"sans"`, `"serif"`, `"mono"`, `"system"` | `"sans"` | Base font family for body text. Headings always use the same family. `"mono"` suits technical/developer-facing content. `"serif"` suits long-form articles. |
| `density` | `"compact"`, `"comfortable"`, `"spacious"` | `"comfortable"` | Controls section spacing, padding, and content max-width. `"compact"` = tighter for data-dense pages. `"spacious"` = more breathing room for narrative articles. |

### How it works in the renderer

The `theme` object maps to a set of CSS custom properties on the page root:

```css
.plr-page {
  --plr-mode: dark;
  --plr-accent: #00d4aa;
  --plr-font: 'Inter', sans-serif;
  --plr-section-gap: 2.5rem;    /* comfortable */
  --plr-content-max-width: 960px;
}

.plr-page--dark {
  --plr-bg: #1a1a2e;
  --plr-text: #e0e0e0;
  --plr-nav-bg: rgba(26, 26, 46, 0.92);
  --plr-card-bg: #252540;
}
```

The agent never writes CSS. The agent writes `"mode": "dark"` and the renderer applies a class. This is the same manifest-driven pattern as everything else in the platform.

### Why these five and not more

These are the properties where agent control produces meaningfully different pages without requiring the agent to understand CSS. A security assessment page wants `dark` + `mono` + `compact`. A narrative article wants `light` + `serif` + `spacious`. An investor deck wants `dark` + `sans` + `comfortable` with a brand `accent`. Five knobs cover these cases. More can be added later — the `theme` object is extensible.

---

## 2. Page Source View — Visual Clue + Toggle

The user should know when they're looking at a rendered `_page.json` page (not a markdown file or folder listing), and should be able to inspect the source JSON.

### Proposed: Rendered Page Indicator

When a folder is rendering via `_page.json`, add a small persistent indicator — a pill or badge — in the top-right of the content area or next to the folder name in the breadcrumbs:

```
📄 _page.json     or     ⚡ Page View
```

Clicking it toggles between **rendered view** (the component layout) and **source view** (the raw JSON with syntax highlighting).

### Source View Requirements

- **JSON syntax highlighting** — reuse the colour coding already used elsewhere in the Browse view. If that doesn't exist yet: keys in one colour, strings in another, numbers in a third, brackets/braces in a fourth. The standard dark-theme palette is fine:
  - Keys: `#82aaff` (blue)
  - Strings: `#c3e88d` (green)
  - Numbers: `#f78c6c` (orange)
  - Booleans/null: `#c792ea` (purple)
  - Brackets/braces: `#89ddff` (cyan)
  - Punctuation: `#676e95` (grey)
- **Line numbers** — left gutter, muted colour
- **Collapsible sections** — click a `{` or `[` to collapse the block (nice to have, not required for v1)
- **Copy button** — copies the raw JSON to clipboard

### The Toggle UX

Two states:

| State | What shows | Indicator |
|-------|-----------|-----------|
| Rendered (default) | The component layout | `⚡ Page View` pill (clickable) |
| Source | Syntax-highlighted JSON | `{ } Source` pill (clickable) |

When the user clicks `_page.json` directly in the file tree (as opposed to clicking the folder), it should open the source view by default. When the user clicks the folder, it should open the rendered view.

---

## 3. Component-Level Styling Props

Beyond the page-level theme, individual components should accept styling hints. These are constrained — not arbitrary CSS, but named options that map to CSS classes.

### `hero` extensions

```json
{
  "type": "hero",
  "props": {
    "title": "The Cryptographic Blueprint",
    "subtitle": "Told through 14 slides",
    "image": "images/slide-01.jpg",
    "color": "#1a1a2e",
    "height": "large",
    "align": "left",
    "overlay": "gradient"
  }
}
```

| Prop | Values | Default | Effect |
|------|--------|---------|--------|
| `height` | `"small"`, `"medium"`, `"large"`, `"full"` | `"medium"` | Hero height: ~150px, ~250px, ~400px, 100vh |
| `align` | `"left"`, `"center"`, `"right"` | `"left"` | Text alignment within the hero |
| `overlay` | `"gradient"`, `"dark"`, `"light"`, `"none"` | `"gradient"` | How the background image is treated |

### `section` extensions (addresses P2: full-bleed)

```json
{
  "type": "section",
  "props": {
    "title": "All 14 Slides",
    "layout": "full-bleed",
    "background": "#f5f5f5"
  },
  "children": [ ... ]
}
```

| Prop | Values | Default | Effect |
|------|--------|---------|--------|
| `layout` | `"default"`, `"full-bleed"`, `"narrow"`, `"wide"` | `"default"` | Content width. `"full-bleed"` breaks out of the 960px max-width for gallery/slides. `"narrow"` is ~640px for focused reading. `"wide"` is ~1200px. |
| `background` | Any CSS colour or `"alt"` | transparent | Section background. `"alt"` uses a subtle alternating shade for visual separation. |
| `divider` | `"line"`, `"space"`, `"none"` | `"line"` | How the section separator renders above the heading. |

### `image` extensions

```json
{
  "type": "image",
  "props": {
    "file": "images/05-zk-security-model.jpg",
    "caption": "Zero-knowledge security model",
    "width": "55%",
    "align": "center",
    "border": true,
    "shadow": true,
    "rounded": true
  }
}
```

| Prop | Values | Default | Effect |
|------|--------|---------|--------|
| `align` | `"left"`, `"center"`, `"right"` | `"center"` | Horizontal alignment |
| `border` | `true`/`false` | `false` | 1px border (uses accent colour at low opacity) |
| `shadow` | `true`/`false` | `false` | Subtle drop shadow |
| `rounded` | `true`/`false` | `false` | Border radius (8px) |

### `gallery` extensions

```json
{
  "type": "gallery",
  "props": {
    "images": [ ... ],
    "captions": [ ... ],
    "columns": 7,
    "aspect": "16:9",
    "gap": "small",
    "show_captions": true
  }
}
```

| Prop | Values | Default | Effect |
|------|--------|---------|--------|
| `aspect` | `"16:9"`, `"4:3"`, `"1:1"`, `"auto"` | `"16:9"` | Thumbnail aspect ratio. `"auto"` uses natural image dimensions. |
| `gap` | `"none"`, `"small"`, `"medium"`, `"large"` | `"small"` | Spacing between thumbnails |
| `show_captions` | `true`/`false` | `false` | Show captions below thumbnails (addresses **P1-C**) |

### `slides` extensions (addresses P2: nav position)

```json
{
  "type": "slides",
  "props": {
    "images": [ ... ],
    "captions": [ ... ],
    "controls": "bottom",
    "autoplay": false,
    "transition": "fade"
  }
}
```

| Prop | Values | Default | Effect |
|------|--------|---------|--------|
| `controls` | `"bottom"`, `"overlay"`, `"side"` | `"bottom"` | Where prev/next controls appear. `"bottom"` = below image (fixes P2). `"overlay"` = over image. `"side"` = left/right of image. |
| `autoplay` | `true`/`false` | `false` | Auto-advance slides |
| `transition` | `"fade"`, `"slide"`, `"none"` | `"fade"` | Transition animation |

---

## 4. New Components — Columns and Cards

Two components that would immediately improve the existing pages.

### `columns` — Side-by-side layout

```json
{
  "type": "columns",
  "props": {
    "ratio": "1:2",
    "gap": "medium",
    "vertical_align": "top"
  },
  "children": [
    { "type": "image", "props": { "file": "images/crop.jpg" } },
    { "type": "text", "props": { "content": "Explanation alongside the image..." } }
  ]
}
```

| Prop | Values | Default | Effect |
|------|--------|---------|--------|
| `ratio` | `"1:1"`, `"1:2"`, `"2:1"`, `"1:3"`, `"3:1"` | `"1:1"` | Column width ratio |
| `gap` | `"none"`, `"small"`, `"medium"`, `"large"` | `"medium"` | Horizontal gap |
| `vertical_align` | `"top"`, `"center"`, `"bottom"` | `"top"` | Vertical alignment |
| `stack_below` | `number` (pixels) | `768` | Viewport width below which columns stack vertically |

This immediately improves the infographic article — image on the left, explanation on the right.

### `cards` — Navigable card grid

```json
{
  "type": "cards",
  "props": {
    "columns": 2,
    "items": [
      {
        "title": "Blueprint Walkthrough",
        "description": "14 slides as a guided narrative",
        "image": "cryptographic-blueprint-walkthrough/images/mosaic-all-slides.jpg",
        "link": "cryptographic-blueprint-walkthrough/"
      },
      {
        "title": "Infographic Deep Dive",
        "description": "Section-by-section with cropped images",
        "image": "infographic-deep-dive/images/full-infographic.jpg",
        "link": "infographic-deep-dive/"
      }
    ]
  }
}
```

Each card: image thumbnail at top, title, description, and the whole card is clickable → navigates to `link` (a subfolder or file). This replaces the current approach of using `gallery` + `text` as a makeshift hub layout.

---

## 5. Summary of Designer P1–P3 Fixes via Schema

| Issue | Schema Solution |
|-------|----------------|
| **P1-A** Nav white bar in dark shell | `"theme": { "mode": "dark" }` → renderer applies `.plr-page--dark` to nav |
| **P1-B** Scroll root bug | Pure CSS/JS fix — no schema change needed |
| **P1-C** Gallery captions invisible | `"show_captions": true` on gallery props |
| **P2** Slides nav above image | `"controls": "bottom"` on slides props |
| **P2** Section clips full-bleed | `"layout": "full-bleed"` on section props |
| **P2** Gallery cursor | Always `cursor: zoom-in` on thumbnails (no schema change) |
| **P2** Tab title from JSON | Use `"title"` from `_page.json` — no schema change, renderer fix |
| **P3** Bullet markers, clamp, padding | Handled by `theme.accent` and `theme.density` |

---

## 6. Updated `_page.json` — What the Root Page Would Look Like with v2

```json
{
  "title": "SG/Send Strategic Pack",
  "theme": {
    "mode": "dark",
    "accent": "#00d4aa",
    "hero_style": "gradient",
    "font": "sans",
    "density": "comfortable"
  },
  "components": [
    {
      "type": "hero",
      "props": {
        "title": "SG/Send Strategic Pack",
        "subtitle": "The Cryptographic Blueprint: From File Transfer to Trust Infrastructure",
        "color": "#1a1a2e",
        "height": "large",
        "align": "center"
      }
    },
    {
      "type": "section",
      "props": { "title": "Key Numbers", "divider": "none" },
      "children": [
        {
          "type": "bullet-points",
          "props": {
            "items": [
              "5 / 10 use cases already executing in live production workflows",
              "10 / 10 captured entirely in existing architectural blueprints",
              "138 internal briefs produced by an 18-agent team",
              "£500M+ healthcare vertical opportunity",
              "£3K–£10K/month — what incumbents charge for inferior data rooms"
            ]
          }
        }
      ]
    },
    {
      "type": "section",
      "props": { "title": "Articles", "layout": "wide" },
      "children": [
        {
          "type": "cards",
          "props": {
            "columns": 2,
            "items": [
              {
                "title": "The Cryptographic Blueprint",
                "description": "All 14 slides as a guided walkthrough with screenshots, slideshow, and embedded PDF",
                "image": "articles/cryptographic-blueprint-walkthrough/images/mosaic-all-slides.jpg",
                "link": "articles/cryptographic-blueprint-walkthrough/"
              },
              {
                "title": "Infographic Deep Dive",
                "description": "Section-by-section walkthrough with cropped images and full infographic",
                "image": "articles/infographic-deep-dive/images/full-infographic.jpg",
                "link": "articles/infographic-deep-dive/"
              }
            ]
          }
        }
      ]
    },
    {
      "type": "section",
      "props": { "title": "Source Materials" },
      "children": [
        {
          "type": "pdf",
          "props": { "file": "strategy/presentations/The_Cryptographic_Blueprint.pdf" }
        }
      ]
    }
  ],
  "navigation": [
    { "label": "Key Numbers", "anchor": "key-numbers" },
    { "label": "Articles", "anchor": "articles" },
    { "label": "Source Materials", "anchor": "source-materials" }
  ]
}
```

---

## 7. Implementation Priority

| Phase | What | Schema Additions |
|-------|------|-----------------|
| **Phase 1** | P1 fixes + source view toggle | `theme.mode`, JSON viewer with syntax highlighting, rendered/source toggle |
| **Phase 2** | Theme + component styling | Full `theme` object, `hero` extensions, `section.layout`, `gallery.show_captions`, `slides.controls` |
| **Phase 3** | New components | `columns`, `cards` |

Phase 1 is small and fixes real bugs. Phase 2 gives the agent meaningful design control. Phase 3 adds layout capabilities that make hub pages and side-by-side article layouts possible.

---

## 8. Backward Compatibility

All new properties are optional with sensible defaults. Existing `_page.json` files (v1) render exactly as they do today. A v1 file gains theme support simply by adding a `"theme"` key. No migration, no breaking changes.

---

*This proposal accompanies the Designer review at `team/roles/designer/reviews/03/30/v0.20.16__designer-review__page-layout-renderer.md` and the original dev brief `v0.19.7__dev-brief__json-folder-page-layouts.md`.*
