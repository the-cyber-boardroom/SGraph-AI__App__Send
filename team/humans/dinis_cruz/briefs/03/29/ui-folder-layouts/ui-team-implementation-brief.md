# Implementation Brief: `_page.json` Rendering in Browse View

**Date:** 30 March 2026
**From:** Project Lead
**To:** UI / Frontend Team
**Status:** Ready for implementation
**Reference vault:** `lend-folk-9817` (or latest share token) — contains 4 working `_page.json` files as test fixtures

---

## What This Is

We now have Claude sessions creating structured, navigable mini-websites inside encrypted vaults — markdown articles with inline images, cross-linked READMEs, breadcrumb navigation. The current Browse view renders these well.

This brief describes the next step: a JSON-driven page layout system that replaces markdown rendering with rich component-based pages when a `_page.json` file is present in a folder.

The JSON files already exist in a live vault. Your job is to make the Browse view detect and render them.

---

## Detection Logic

When the Browse view opens a folder:

1. Check if the folder contains a file named `_page.json`
2. If yes → parse the JSON and render the component layout described below
3. If no → render the current default (file listing / markdown rendering)

This is the only detection needed. No route configuration, no manifest registry. The folder structure IS the site structure.

---

## JSON Schema

A `_page.json` file has this shape:

```typescript
interface PageLayout {
  title: string;                    // Page title (used for browser tab / header)
  components: Component[];          // Ordered list of components to render
  navigation?: NavigationItem[];    // Optional fixed nav bar
}

interface Component {
  type: string;                     // Component name (see table below)
  props: Record<string, any>;       // Component-specific properties
  children?: Component[];           // Nested components (for "section" type)
}

interface NavigationItem {
  label: string;                    // Display text
  anchor: string;                   // Scroll target (kebab-case of section title)
}
```

All file paths in props (e.g. `"file": "images/slide-01.jpg"`) are relative to the folder containing the `_page.json`.

---

## Component Library

Implement these components as Web Components with Shadow DOM. Each is self-contained and independently styled.

### Priority 1 — Required for the test vault

| Component | Props | Renders |
|-----------|-------|---------|
| `hero` | `title: string`, `subtitle: string`, `image?: string` (background), `color?: string` (background fallback) | Full-width banner. Title and subtitle as white text over the image/colour. |
| `section` | `title: string`, `children: Component[]` | Container with an `<h2>` heading. Renders child components in order. The heading text, kebab-cased, becomes the scroll anchor target. |
| `text` | `content: string` | A styled paragraph block. |
| `image` | `file: string`, `caption?: string`, `width?: string` | Image element. `width` accepts CSS values (`"90%"`, `"400px"`). Caption renders below in smaller text. |
| `slides` | `images: string[]`, `captions?: string[]` | Slideshow with left/right navigation arrows. Shows one image at a time with its caption. Indicator dots or "2 / 4" counter. |
| `gallery` | `images: string[]`, `captions?: string[]`, `columns?: number` | Grid of thumbnails. Clicking a thumbnail opens a lightbox. `columns` defaults to 3. |
| `pdf` | `file: string` | Embedded PDF viewer (reuse existing Browse view PDF rendering). |
| `markdown` | `file?: string`, `text?: string` | Rendered markdown. `file` loads from a relative path. `text` renders inline content. Should support the existing `![alt\|size](path)` image sizing syntax. |
| `bullet-points` | `items: string[]` | Styled unordered list. |

### Priority 2 — Nice to have

| Component | Props | Renders |
|-----------|-------|---------|
| `csv` | `file: string` | Table rendered from CSV data (reuse existing Browse CSV rendering). |
| `title` | `text: string`, `level?: string` | Standalone heading (`h1`/`h2`/`h3`). For cases where you want a heading outside a section. |
| `navigation` | `items: NavigationItem[]` | Rendered automatically from the top-level `navigation` array — listed here for completeness. |

---

## Navigation Component

If the top-level `navigation` array is present, render a fixed bar (top or sidebar — your call on UX) with anchor links. Clicking a nav item scrolls to the corresponding section.

Anchor IDs are derived from section titles by kebab-casing:
- `"Independent Validation"` → `#independent-validation`
- `"The Four Archetypes"` → `#the-four-archetypes`

The nav should highlight the currently-visible section on scroll (intersection observer).

---

## The Test Vault

Token: `lend-folk-9817` (or ask for a fresh one)
Browse: https://send.sgraph.ai/en-gb/browse/#lend-folk-9817

This vault contains 4 `_page.json` files at increasing complexity:

### 1. `/_page.json` (root — simple)

Components used: `hero`, `section`, `bullet-points`, `text`, `gallery`, `pdf`

This is the homepage. It has a hero banner, a key numbers section with bullet points, a gallery linking to the two articles (2 columns), and an embedded PDF of the source deck. Good starting point for implementation.

### 2. `/articles/_page.json` (hub — medium)

Components used: `hero`, `section`, `image`, `text`, `markdown`

Hub page linking to both article subfolders. Uses `image` with relative paths that reach into subfolders (`cryptographic-blueprint-walkthrough/images/mosaic-all-slides.jpg`). Tests cross-folder relative path resolution.

### 3. `/articles/infographic-deep-dive/_page.json` (article — medium)

Components used: `hero`, `section`, `image` (at varying widths), `text`

Multiple sections, each with an image at a different width (50%, 55%, 60%, 70%, 80%, 100%). Tests the `width` prop on `image` across a range of values. All images are cropped regions of a single source infographic.

### 4. `/articles/cryptographic-blueprint-walkthrough/_page.json` (article — complex)

Components used: `hero` (with background image), `section`, `gallery` (7 columns, 14 thumbnails), `image`, `text`, `slides` (4 images with captions), `pdf`

This is the most complex layout. The `gallery` component renders 14 slide thumbnails in a 7×2 grid. The `slides` component renders the four archetype slides as a navigable slideshow with captions. The `pdf` component at the bottom embeds the full deck with a relative path that traverses up two directories (`../../strategy/presentations/The_Cryptographic_Blueprint.pdf`).

---

## File Path Resolution

All `file` props are relative to the folder containing the `_page.json`. The renderer must resolve these against the folder path in the vault.

Examples from the test vault:

| `_page.json` location | Prop value | Resolves to |
|----------------------|------------|-------------|
| `/articles/infographic-deep-dive/` | `"images/slide-01.jpg"` | `/articles/infographic-deep-dive/images/slide-01.jpg` |
| `/articles/` | `"cryptographic-blueprint-walkthrough/images/mosaic-all-slides.jpg"` | `/articles/cryptographic-blueprint-walkthrough/images/mosaic-all-slides.jpg` |
| `/articles/cryptographic-blueprint-walkthrough/` | `"../../strategy/presentations/The_Cryptographic_Blueprint.pdf"` | `/strategy/presentations/The_Cryptographic_Blueprint.pdf` |

The resolver should handle `../` traversal. All paths are within the vault — no external URLs.

---

## Rendering Rules

**Section anchors.** Every `section` component's `title` should generate an `id` attribute by kebab-casing the title. This is what the `navigation` anchors point to.

**Component ordering.** Components render in array order, top to bottom. The JSON is the layout — no reordering.

**Nested children.** Only `section` has `children`. Don't support arbitrary nesting depth — sections contain leaf components only (image, text, slides, etc.), not other sections.

**Fallback.** If a `type` is unrecognised, skip it silently. Don't break the page. This lets us add new components later without breaking existing `_page.json` files.

**Empty props.** Optional props that are missing should be handled gracefully (no caption → no caption element, no image on hero → solid colour background, etc.).

---

## Styling Guidance

The components should match the existing Browse view aesthetic. Some specifics:

**Hero.** Full viewport width, roughly 200–300px tall. Title in large bold white text, subtitle in lighter weight below. If `image` is provided, use it as a cover background with a dark overlay for text contrast. If only `color` is provided, use it as a solid background.

**Section.** Horizontal rule or spacing to separate from previous content. Title as a clean `h2`. Content width should match the existing markdown content width (not full bleed).

**Image.** Centred within the content area. `width` sets the CSS width directly. Caption in smaller, muted text below the image.

**Slides.** Single image visible at a time, filling the content width. Left/right arrows on hover (or always visible on mobile). Caption below. Transition on change (fade or slide — keep it simple). Keyboard arrow support.

**Gallery.** CSS grid, `columns` sets `grid-template-columns: repeat(N, 1fr)`. Thumbnails should maintain aspect ratio (object-fit: cover with a fixed aspect ratio container, or just natural aspect ratio). Lightbox on click — full-size image with close button and arrow navigation.

**PDF.** Reuse whatever the Browse view already does for PDF files. If there's an iframe-based viewer, use that.

---

## Coexistence with Markdown

The `_page.json` and `article.md` files coexist in the same folders in the test vault. This is intentional — the markdown articles are the fallback for when `_page.json` rendering isn't available yet (or for clients that don't support it).

Once `_page.json` rendering is live, the markdown articles remain as alternative views. The Browse view should prefer `_page.json` when present but could offer a "view as markdown" toggle if that's useful.

---

## Implementation Order Suggestion

1. **Detection** — `_page.json` presence check, JSON parsing, basic scaffolding
2. **Simple components** — `text`, `bullet-points`, `title`, `section` (get the structure rendering)
3. **Image** — with `width` prop and caption (most frequently used component)
4. **Hero** — with colour and image background
5. **Navigation** — fixed bar with scroll-to-anchor and active state
6. **Gallery** — grid layout + lightbox
7. **Slides** — single-image view with navigation arrows
8. **Markdown** — file loading + rendering (reuse existing markdown renderer)
9. **PDF** — embedded viewer (reuse existing)

Steps 1–5 are enough to render all four test vault pages in a basic form. Steps 6–9 add the interactive components.

---

## Testing

The test vault (`lend-folk-9817`) is the acceptance test. Specifically:

- Root page renders with hero, bullet points, gallery, and embedded PDF
- Articles hub page renders with images from subfolder paths
- Infographic page renders 10 images at 6 different widths
- Blueprint page renders a 7×2 gallery, 4-image slideshow, and PDF via `../../` relative path
- Navigation bar scrolls to correct sections
- Unrecognised component types are skipped without breaking the page
- Folders without `_page.json` continue to render normally

---

## Future Extensions (Not In Scope Now)

These are mentioned for awareness only — don't build them yet:

- **`cards` component** — grid of clickable cards that navigate to subfolders (for hub pages)
- **`columns` component** — side-by-side layout (image left, text right)
- **`accordion` component** — collapsible sections
- **`video` component** — if vault ever supports video files
- **`chart` component** — rendered from inline data or CSV
- **Theming** — JSON-level theme overrides (colours, fonts). The current approach (components handle their own styling) is correct for now.

---

*This brief accompanies the dev brief `v0.19.7__dev-brief__json-folder-page-layouts.md` which describes the design rationale. Both documents are included in the test vault.*
