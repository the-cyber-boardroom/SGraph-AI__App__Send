# Rendering and Indexing Strategy — Library Website
**v0.19.7 | 02 April 2026**
**Phase 3: Development | Source: v0.13.5 dev-brief**

---

## The Architecture Decision

**Markdown is the source of truth.** The website renders it client-side. No pre-compilation.

This means:
- Adding a new role = add a `.md` file and commit
- Editing a guide = edit the `.md` file and commit
- The website always reflects the current state of the repo
- LLMs can fetch raw markdown directly — no HTML parsing

---

## Web Components

### `<sg-markdown-viewer>` — Core component

Fetches a markdown file and renders it as HTML client-side.

```html
<!-- Usage -->
<sg-markdown-viewer src="/raw/roles/librarian.md"></sg-markdown-viewer>

<!-- With fallback -->
<sg-markdown-viewer
  src="/raw/roles/librarian.md"
  fallback-src="/raw/404-role.md">
</sg-markdown-viewer>
```

**Implementation:**
```javascript
class SgMarkdownViewer extends HTMLElement {
  connectedCallback() {
    const src = this.getAttribute('src');
    fetch(src)
      .then(r => r.text())
      .then(md => this._render(md))
      .catch(() => this._renderFallback());
  }

  _render(markdown) {
    // Use marked.js (CDN, pinned version) to parse markdown
    // Apply syntax highlighting for code blocks (highlight.js)
    // Sanitise output (DOMPurify)
    this.innerHTML = `<article class="sg-md-content">${marked.parse(markdown)}</article>`;
  }

  _renderFallback() {
    const fb = this.getAttribute('fallback-src');
    if (fb) { this.setAttribute('src', fb); this.connectedCallback(); return; }
    this.innerHTML = '<p class="sg-md-error">Document not available.</p>';
  }
}
customElements.define('sg-markdown-viewer', SgMarkdownViewer);
```

**Dependencies (CDN, pinned):**
```html
<script src="https://cdn.jsdelivr.net/npm/marked@9.0.0/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.0/dist/purify.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.0.0/build/highlight.min.js"></script>
```

**IFD path:** `_common/components/v0/v0.1/v0.1.0/sg-markdown-viewer.js`

---

### `<sg-library-nav>` — Sidebar navigation

Loads `index.json`, renders collapsible sidebar showing all sections and documents.

```html
<sg-library-nav current-path="roles/librarian.md"></sg-library-nav>
```

**Behaviour:**
- Loads `index.json` on first render
- Groups documents by top-level section (roles/, teams/, skills/, etc.)
- Highlights current document
- Expandable sections (roles list, guides list, etc.)
- External links (`/index.json`, `/catalogue.csv`) at the bottom

---

### `<sg-library-search>` — Client-side search

Queries `index.json` for full-text matching across titles, topics, and paths.

```html
<sg-library-search placeholder="Search roles, guides, skills..."></sg-library-search>
```

**Behaviour:**
- Loads `index.json` once on page load, caches in memory
- Searches: title, topics, path, roles fields
- Shows top 5 results as dropdown
- Enter → navigates to best match

---

### `<sg-document-meta>` — Document header

Shows version, date, status, and "Raw markdown" link.

```html
<sg-document-meta
  path="roles/librarian.md"
  title="Librarian"
  version="v0.19.7"
  date="2026-04-02"
  status="current">
</sg-document-meta>
```

Renders:
```
Librarian    v0.19.7 · 02 Apr 2026 · ● current    [Raw ↗]
```

---

## Raw Markdown URL Pattern

Every document has a raw URL alongside its rendered URL:

| Rendered | Raw |
|----------|-----|
| `/roles/librarian/` | `/raw/roles/librarian.md` |
| `/guides/ifd-methodology/` | `/raw/guides/ifd-methodology.md` |
| `/skills/talk-to-team/` | `/raw/skills/talk-to-team/SKILL.md` |

**Implementation:** S3 serves raw files directly. CloudFront routes `/raw/*` to the S3 raw file path.

**LLM session pattern:**
```
GET /index.json                        → full document catalogue
GET /raw/roles/librarian.md            → raw markdown for Librarian role
GET /reading-order.json                → per-role recommended reading
```

---

## Index Generation Script (`generate-index.py`)

Scans all `.md` files, reads frontmatter, outputs three files:

### `index.json` schema
```json
{
  "generated": "ISO-8601 timestamp",
  "library_version": "v0.19.7",
  "total_documents": 42,
  "documents": [
    {
      "path": "roles/librarian.md",
      "raw_url": "https://library.sgraph.ai/raw/roles/librarian.md",
      "html_url": "https://library.sgraph.ai/roles/librarian/",
      "title": "Librarian",
      "version": "v0.19.7",
      "date": "2026-04-02",
      "roles": ["librarian", "all"],
      "topics": ["team-structure", "knowledge-management"],
      "status": "current",
      "team": "all",
      "word_count": 847,
      "stale": false,
      "stale_reason": null
    }
  ]
}
```

### `catalogue.csv` columns
```
path, title, version, date, status, team, roles, topics, word_count, stale, html_url, raw_url
```

### `reading-order.json` schema
```json
{
  "librarian": [
    "claude-guidance/shared-conventions.md",
    "roles/librarian.md",
    "guides/issues-fs.md",
    "workflows/briefing-workflow.md"
  ],
  "developer": [
    "claude-guidance/shared-conventions.md",
    "roles/developer.md",
    "guides/ifd-methodology.md",
    "guides/testing-conventions.md"
  ]
}
```

### Staleness logic
A document is stale when its `version` field is more than 2 minor versions behind the library's current version. Computed at index generation time.

---

## Curation Pipeline

| Frequency | Trigger | Action |
|-----------|---------|--------|
| Every push | GitHub Actions CI | Regenerate `index.json`, `catalogue.csv`, `reading-order.json` |
| Weekly | Librarian session | Review staleness flags. Update stale documents or mark them archived. |
| Per milestone | Librarian | Update `project-index/` (repos, sites, vaults) |

The daily/weekly cadence keeps the library fresh without manual overhead.

---

## Shared Components with `SGraph-AI__Tools`

`<sg-markdown-viewer>` should eventually live in `SGraph-AI__Tools` and be consumed via `static.sgraph.ai` (same pattern as `<sg-public-viewer>` for the website redesign). For the initial launch, build it in the library repo and extract to `__Tools` in a follow-up sprint.

---

*Phase 3 Development — Rendering and Indexing Strategy*
*v0.19.7 — 02 April 2026*
*Source: v0.13.5 dev-brief*
