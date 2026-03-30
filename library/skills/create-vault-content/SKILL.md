---
name: create-vault-content
description: >
  Use this skill whenever you need to create, edit, or structure content inside an
  SG/Send encrypted vault — including writing _page.json page layouts, markdown
  documents, folder navigation, or any vault file structure intended to be browsed
  via send.sgraph.ai. Triggers include: "create a vault page", "add a _page.json",
  "build a hub page", "make a slideshow", "author vault content", "write a page
  layout", "create a gallery", "add navigation to the vault", "build an article",
  "write markdown for the vault", or any request to create or improve structured
  content inside an sgit vault. Does NOT require cloning the SGraph-AI__App__Send
  repo — the full schema reference is embedded in this skill.
---

# SKILL: Create Vault Content for SG/Send Browse

## Overview

The SG/Send Browse view ([send.sgraph.ai](https://send.sgraph.ai)) decrypts and
renders the contents of an encrypted vault in a two-pane layout: file tree on the
left, tabbed preview on the right.

You can create two types of rich content in a vault:
- **`_page.json`** — component-based page layouts (hero, gallery, slides, cards, etc.)
- **Markdown (`.md`)** — prose documents with images, links, and tables

This skill gives you the complete reference for both. Use the sgit skill to create,
commit, and push to the vault.

---

## Quick decision: `_page.json` vs Markdown

| Use `_page.json` when | Use Markdown when |
|-----------------------|-------------------|
| You want a designed hero banner | You want prose-first documents |
| Gallery of images / slideshow | Text with inline images |
| Hub page with clickable cards | Linked document hierarchy |
| Multiple distinct layout sections | Article, README, report |
| Investor deck, portfolio page | Working notes, specs |
| Embedded PDF viewer | Step-by-step guide |
| Explicit theme and font control | Quick content with minimal setup |

Both can coexist in the same folder. `_page.json` takes priority in the Browse view;
markdown files remain as alternatives.

---

## Part 1: `_page.json` Page Layouts

### 1.1 File placement

Name the file exactly `_page.json` in the folder it describes. The Browse view
auto-detects it — no registration needed.

```
my-vault/
  _page.json          ← root page
  articles/
    _page.json        ← articles hub
    deep-dive/
      _page.json      ← article page
      images/
        cover.jpg
```

Auto-open: if the vault root has `_page.json`, it renders immediately when the vault
is opened.

### 1.2 Top-level structure

```json
{
  "title":      "Page Title",
  "theme":      { "mode": "dark", "accent": "#00d4aa" },
  "navigation": [
    { "label": "Overview", "anchor": "overview" }
  ],
  "components": [
    { "type": "hero", "props": { "title": "..." } }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | yes | Shows in the tab label |
| `theme` | no | Visual theme (see §1.3) |
| `navigation` | no | Sticky nav bar with anchor links |
| `components` | yes | Ordered list of components to render |

### 1.3 Theme

**Simple:**
```json
"theme": "dark"    // or "light" (default)
```

**Full control:**
```json
"theme": {
  "mode":    "dark",
  "accent":  "#00d4aa",
  "font":    "sans",
  "density": "comfortable"
}
```

| Field | Values | Effect |
|-------|--------|--------|
| `mode` | `"dark"`, `"light"`, `"auto"` | Palette; `"auto"` = light |
| `accent` | Any CSS colour | Nav highlight, image border colour |
| `font` | `"sans"`, `"serif"`, `"mono"`, `"system"` | Font family |
| `density` | `"compact"`, `"comfortable"`, `"spacious"` | Section padding |

### 1.4 Navigation bar

Renders a sticky top bar. Add when the page has 3+ sections and meaningful scroll.

```json
"navigation": [
  { "label": "Overview",   "anchor": "overview" },
  { "label": "Gallery",    "anchor": "gallery" },
  { "label": "Full Deck",  "anchor": "full-deck" }
]
```

Anchor ids are derived from section titles by kebab-casing:
`"The Four Archetypes"` → `the-four-archetypes`
`"Key Numbers & Metrics"` → `key-numbers--metrics`

### 1.5 Components reference

---

#### `hero` — Full-width banner

```json
{
  "type": "hero",
  "props": {
    "title":    "The Cryptographic Blueprint",
    "subtitle": "Zero-knowledge file sharing",
    "image":    "images/banner.jpg",
    "color":    "#0d1117",
    "height":   "large",
    "align":    "center",
    "overlay":  "gradient"
  }
}
```

| Prop | Default | Values |
|------|---------|--------|
| `title` | — | Heading text |
| `subtitle` | — | Lighter line below title |
| `image` | — | Background image path |
| `color` | `#0d1117` | Background colour fallback |
| `height` | standard | `"small"` 150px, `"medium"` 250px, `"large"` 400px, `"full"` 100vh |
| `align` | `"left"` | `"left"`, `"center"`, `"right"` |
| `overlay` | `"gradient"` if image, else `"none"` | `"gradient"`, `"dark"`, `"light"`, `"solid"`, `"none"` |

---

#### `section` — Container with heading and anchor

The only component that has `children`. Wrap all leaf components in sections.

```json
{
  "type": "section",
  "props": {
    "title":      "Key Numbers",
    "layout":     "narrow",
    "background": "alt",
    "divider":    "line"
  },
  "children": [
    { "type": "text", "props": { "content": "..." } }
  ]
}
```

| Prop | Default | Values |
|------|---------|--------|
| `title` | — | `<h2>` heading (also sets scroll anchor id) |
| `layout` | standard | `"full-bleed"` 100%, `"narrow"` 640px, `"wide"` 1200px |
| `background` | — | CSS colour or `"alt"` (subtle alternating shade) |
| `divider` | `"line"` | `"line"`, `"space"` (no line, extra padding), `"none"` |

---

#### `text` — Paragraph

```json
{ "type": "text", "props": { "content": "Paragraph text." } }
```

---

#### `bullet-points` — Styled list

```json
{
  "type": "bullet-points",
  "props": { "items": ["First point", "Second point", "Third point"] }
}
```

---

#### `title` — Standalone heading

```json
{ "type": "title", "props": { "text": "Subheading", "level": "3" } }
```

`level`: `"1"` – `"6"`, default `"2"`.

---

#### `image` — Single image

```json
{
  "type": "image",
  "props": {
    "file":    "images/diagram.png",
    "caption": "Architecture overview",
    "width":   "80%",
    "align":   "center",
    "shadow":  true,
    "rounded": true,
    "border":  false
  }
}
```

| Prop | Default | Values |
|------|---------|--------|
| `file` | — | Path relative to `_page.json` folder |
| `caption` | — | Text below image |
| `width` | `100%` | CSS value: `"60%"`, `"400px"` |
| `align` | `"center"` | `"left"`, `"center"`, `"right"` |
| `border` | `false` | 1px accent-coloured border |
| `shadow` | `false` | Drop shadow |
| `rounded` | `false` | 8px radius |

---

#### `gallery` — Thumbnail grid with lightbox

Click any thumbnail → full-size lightbox (arrow keys + ESC to navigate).

```json
{
  "type": "gallery",
  "props": {
    "images":        ["images/s1.jpg", "images/s2.jpg", "images/s3.jpg"],
    "captions":      ["Slide 1 caption", "Slide 2 caption", "Slide 3 caption"],
    "columns":       3,
    "aspect":        "16:9",
    "gap":           "small",
    "show_captions": true
  }
}
```

| Prop | Default | Values |
|------|---------|--------|
| `images` | — | Array of file paths |
| `captions` | `[]` | Positionally matched to images |
| `columns` | `3` | Grid columns (e.g. `7` for a 7×2 mosaic) |
| `aspect` | `"16:9"` | `"16:9"`, `"4:3"`, `"1:1"`, `"auto"` |
| `gap` | `"small"` | `"none"`, `"small"`, `"medium"`, `"large"` |
| `show_captions` | `true` when captions present | Explicit boolean |

---

#### `slides` — Navigable slideshow

Arrow keys work when focused. Counter shows `2 / 4`.

```json
{
  "type": "slides",
  "props": {
    "images":     ["images/a1.jpg", "images/a2.jpg", "images/a3.jpg"],
    "captions":   ["Caption 1", "Caption 2", "Caption 3"],
    "controls":   "bottom",
    "transition": "fade",
    "autoplay":   false
  }
}
```

| Prop | Default | Values |
|------|---------|--------|
| `images` | — | Array of file paths |
| `captions` | `[]` | Positionally matched |
| `controls` | `"bottom"` | `"bottom"` (nav below image), `"top"` |
| `transition` | `"fade"` | `"fade"`, `"none"` |
| `autoplay` | `false` | Auto-advance every 3 s; stops on click |

---

#### `pdf` — Embedded viewer

```json
{ "type": "pdf", "props": { "file": "../../strategy/deck.pdf" } }
```

`../` traversal supported — path must stay within the vault.

---

#### `markdown` — Rendered markdown

```json
{ "type": "markdown", "props": { "file": "overview.md" } }
{ "type": "markdown", "props": { "text": "**Bold** and a [link](other.md)." } }
```

`file` is relative to the `_page.json` folder. The `![alt|size](path)` image sizing
syntax is supported.

---

#### `cards` — Navigable card grid

Hub pages: each card navigates to a file or folder on click.

```json
{
  "type": "cards",
  "props": {
    "columns": 2,
    "items": [
      {
        "title":       "Article One",
        "description": "Short description.",
        "image":       "article-one/images/cover.jpg",
        "link":        "article-one/"
      },
      {
        "title":       "Article Two",
        "description": "Short description.",
        "image":       "article-two/images/cover.jpg",
        "link":        "article-two/"
      }
    ]
  }
}
```

| Prop | Default | Values |
|------|---------|--------|
| `columns` | `2` | Grid columns |
| `items[].title` | — | Card heading |
| `items[].description` | — | Body text |
| `items[].image` | — | Cover image path |
| `items[].link` | — | Relative path to file or folder |

---

#### `columns` — Side-by-side layout

Each child goes in its own column. Stacks to single column below 768px.

```json
{
  "type": "columns",
  "props": { "ratio": "1:2", "gap": "medium", "vertical_align": "top" },
  "children": [
    { "type": "image",    "props": { "file": "portrait.jpg", "rounded": true } },
    { "type": "markdown", "props": { "text": "**Name**\n\nDescription." } }
  ]
}
```

| Prop | Default | Values |
|------|---------|--------|
| `ratio` | `"1:1"` | `"1:1"`, `"1:2"`, `"2:1"`, `"1:3"`, `"3:1"` |
| `gap` | `"medium"` | `"none"`, `"small"`, `"medium"`, `"large"` |
| `vertical_align` | `"top"` | `"top"`, `"center"`, `"bottom"` |

---

### 1.6 File path rules

All `file` props are relative to the folder containing `_page.json`.

| `_page.json` at | Prop value | Resolves to |
|-----------------|------------|-------------|
| `/articles/deep-dive/` | `"images/slide-01.jpg"` | `/articles/deep-dive/images/slide-01.jpg` |
| `/articles/` | `"deep-dive/images/cover.jpg"` | `/articles/deep-dive/images/cover.jpg` |
| `/articles/walkthrough/` | `"../../strategy/deck.pdf"` | `/strategy/deck.pdf` |

- Forward slashes only
- `../` traversal supported, must stay within the vault
- No external URLs — vault files only

### 1.7 Source view

Every rendered page tab has a `{ } Source` toggle that shows the syntax-highlighted raw
JSON. A `⎋ Copy JSON` button copies it to the clipboard.

Clicking `_page.json` **directly in the file tree** opens in source view by default
(intent: inspect the file). Folder click and auto-open default to rendered view.

---

## Part 2: Markdown Authoring Rules

### 2.1 Internal links

```markdown
[See the report](report.pdf)
[Go to overview](../README.md)
[Read the spec](docs/spec.md)
```

Opens the target file as a new tab. Resolver handles `../` paths, URL-encoding, and
common extension fallbacks (`.md`, `.pdf`, `.txt`, `.html`).

**Folder links:** link to `folder/README.md`, not `folder/` — which file opens from a
folder link depends on sort order and is fragile.

### 2.2 Image sizing (Discourse pipe syntax)

```markdown
![caption](img.png)           // max-width: 100%
![caption|400](img.png)       // 400px fixed width
![caption|60%](img.png)       // 60% of container
![caption|800x600](img.png)   // 800px wide, 600px tall
```

The pipe and dimensions are inside the alt text brackets — the URL stays clean.
Degrades gracefully in other markdown renderers (shows as `caption|400` alt text).

**Do not use HTML** — it is stripped and renders as visible escaped text.

### 2.3 Navigation patterns

**Linear sequence:** put a one-line nav bar at the top of each document:
```markdown
[← START HERE](../START%20HERE.md) · [Index](../INDEX.md) · [Next →](02-next.md)
```

**Deep hierarchy:** breadcrumb at the top using `›` (U+203A):
```markdown
[🏠 Index](../../INDEX.md) › [Section](../README.md) › **Current Page**
```

**Root hub (`INDEX.md`):** title + "Start here" link + folder table + quick links.

### 2.4 Auto-open behaviour

The Browse view auto-opens the **alphabetically first file** in the vault. To control this:
- Name your entry point `0-START-HERE.md`, `00-INDEX.md`, or `README.md`
- Or put a `_page.json` in the root (takes priority)

### 2.5 Supported syntax quick-ref

| Feature | Supported |
|---------|-----------|
| Headings `# h1` – `###### h6` | ✓ |
| Bold, italic, bold+italic | ✓ |
| Strikethrough `~~text~~` | ✓ |
| Inline code `` `code` `` | ✓ |
| Fenced code blocks ` ``` ` | ✓ |
| Tables | ✓ |
| Blockquotes `>` | ✓ |
| Unordered + ordered lists | ✓ |
| Images with pipe sizing | ✓ |
| Internal + external links | ✓ |
| HTML tags / comments | ✗ (stripped / visible text) |
| Nested lists | ✗ |
| Task lists `- [ ]` | ✗ |

---

## Part 3: Typical Vault Content Workflow

```bash
# 1. Create or clone vault (see sgit skill)
sgit init my-vault --existing
#   — or —
sgit clone passphrase:vault-id my-vault

# 2. Create your content files
# (write _page.json files and/or markdown in the vault directory)

# 3. Commit and push
cd my-vault
sgit commit "add page layouts and articles"
sgit push

# 4. Share a snapshot token for viewing in the browser
sgit share
# → Token: word-word-1234
# Open: https://send.sgraph.ai/en-gb/browse/#word-word-1234
```

---

## Part 4: Authoring Checklists

### `_page.json` checklist
- [ ] All `file` paths are relative to the folder containing `_page.json`
- [ ] Every referenced image/PDF exists in the vault at the expected path
- [ ] `../` paths don't escape the vault root
- [ ] Section `title` values match the `anchor` strings in `navigation`
- [ ] `navigation` only included when there are 3+ sections and scroll depth
- [ ] `gallery`/`slides` image arrays have the same length as `captions`
- [ ] `cards` items have `link` values that resolve to real vault files/folders
- [ ] JSON is valid (no trailing commas, all strings quoted, arrays/objects closed)

### Markdown checklist
- [ ] Folder links go to `folder/README.md`, not `folder/`
- [ ] Image paths are relative to the `.md` file's location, not the vault root
- [ ] Image sizing uses `![alt|width](path)`, not HTML `<img>` tags
- [ ] Nav bar / breadcrumbs added to multi-page documents
- [ ] Entry-point file named to sort first alphabetically (if no `_page.json`)

---

## Part 5: Quick-copy Templates

### Minimal page

```json
{
  "title": "Page Title",
  "theme": { "mode": "dark", "accent": "#4ecdc4" },
  "navigation": [
    { "label": "Intro",   "anchor": "intro" },
    { "label": "Details", "anchor": "details" }
  ],
  "components": [
    {
      "type": "hero",
      "props": {
        "title": "Page Title", "subtitle": "One-line description",
        "image": "images/banner.jpg", "height": "large", "align": "center"
      }
    },
    {
      "type": "section",
      "props": { "title": "Intro" },
      "children": [
        { "type": "text", "props": { "content": "Introduction paragraph." } },
        { "type": "bullet-points", "props": { "items": ["Point one", "Point two"] } }
      ]
    },
    {
      "type": "section",
      "props": { "title": "Details" },
      "children": [
        { "type": "image", "props": { "file": "images/diagram.png", "width": "80%", "shadow": true } },
        { "type": "text",  "props": { "content": "Follow-up paragraph." } }
      ]
    }
  ]
}
```

### Hub page (cards → subfolders)

```json
{
  "title": "Articles Hub",
  "theme": { "mode": "dark" },
  "components": [
    {
      "type": "hero",
      "props": { "title": "Articles", "subtitle": "Select an article to begin" }
    },
    {
      "type": "section",
      "props": { "title": "Browse", "layout": "wide" },
      "children": [
        {
          "type": "cards",
          "props": {
            "columns": 2,
            "items": [
              { "title": "Article One", "description": "Description.", "image": "article-one/images/cover.jpg", "link": "article-one/" },
              { "title": "Article Two", "description": "Description.", "image": "article-two/images/cover.jpg", "link": "article-two/" }
            ]
          }
        }
      ]
    }
  ]
}
```

### Image-heavy article

```json
{
  "title": "Visual Walkthrough",
  "theme": { "mode": "dark" },
  "navigation": [
    { "label": "Overview", "anchor": "overview" },
    { "label": "Gallery",  "anchor": "gallery" },
    { "label": "Slides",   "anchor": "slides" }
  ],
  "components": [
    { "type": "hero", "props": { "title": "Walkthrough", "image": "images/banner.jpg", "height": "large" } },
    {
      "type": "section", "props": { "title": "Overview" },
      "children": [
        { "type": "image",    "props": { "file": "images/mosaic.jpg", "width": "100%", "caption": "All slides at a glance" } },
        { "type": "markdown", "props": { "file": "overview.md" } }
      ]
    },
    {
      "type": "section", "props": { "title": "Gallery", "layout": "wide" },
      "children": [
        { "type": "gallery", "props": { "images": ["images/s1.jpg", "images/s2.jpg", "images/s3.jpg", "images/s4.jpg"], "columns": 4, "aspect": "16:9" } }
      ]
    },
    {
      "type": "section", "props": { "title": "Slides" },
      "children": [
        { "type": "slides", "props": { "images": ["images/s1.jpg", "images/s2.jpg", "images/s3.jpg", "images/s4.jpg"], "captions": ["Caption 1", "Caption 2", "Caption 3", "Caption 4"] } }
      ]
    }
  ]
}
```

---

## Reference

Full authoring guides (in the SGraph-AI__App__Send repo if available):
- `library/guides/content/v0.20.18__guide__sg-send-page-layout-authoring.md`
- `library/guides/content/v0.20.13__guide__sg-send-browse-markdown-authoring.md`
