# Briefing: Image & Video Processing Tools — Ideas, Architecture, and Roadmap

**Version:** v0.19.1 | **Date:** 28 March 2026 | **Prepared by:** Librarian (Explorer team)
**For:** Dev, Architect, Designer (Explorer team)
**Context:** Synthesised from 18+ briefs spanning 03 March – 27 March 2026

---

## Purpose

This document collects and maps every idea captured over the past month about adding image processing, video processing, and media manipulation capabilities to the SGraph platform. It covers what exists today, what's been proposed, the architectural patterns, and how these capabilities fit across the three deployment surfaces: **send.sgraph.ai** (product), **tools.sgraph.ai** (standalone tools), and **the gallery/viewer system** (recipient experience).

---

## 1. What EXISTS Today (Code-Verified)

### In send.sgraph.ai (v0.3.0 shipped)

| Capability | Where | How |
|------------|-------|-----|
| **Image thumbnail generation** | Upload component (v0.2.12) | Canvas API, 200px wide JPEG at 75% quality |
| **Image display in gallery** | Gallery view (v0.2.5+) | Grid with type badges, lightbox on click |
| **Image display in folder browser** | Browse view (sg-layout) | Inline rendering in content panes |
| **PDF first-page preview** | Upload component (v0.2.12) | pdf.js renders page 1 as canvas thumbnail |
| **PDF viewing** | Browse view + lightbox | pdf.js built-in viewer |
| **Markdown rendering** | Browse view + lightbox + gallery | Custom parser, safe HTML, styled typography |
| **SgPrint (markdown → branded A4 PDF)** | Print button in viewer/lightbox | Browser print CSS only — no server, no Puppeteer |
| **Video playback** | Browse view | Native `<video>` element |
| **Audio playback** | Browse view | Native `<audio>` element |
| **SVG rendering** | Gallery + browse | Passed through as-is (already vectors) |
| **Code syntax display** | Browse view | Formatted with line numbers (no syntax highlighting) |
| **EXIF-aware sorting** | Gallery view | Date-based sort from metadata |
| **`_preview/` folder in zip** | Upload component | Manifest + thumbnails + per-file metadata JSON |
| **`_gallery.{hash}/` folder** | Upload component | Content-addressed gallery folder, deduplication |
| **Three view modes** | Gallery view | Compact / Grid / Large with auto-selection by count |
| **QR code generation** | Done page | For sharing tokens/links |

### In tools.sgraph.ai (live)

| Tool | Status | What It Does |
|------|--------|-------------|
| SSH Key Generator | Live | Ed25519 key pairs in browser |
| File Hasher | Live | SHA-256/SHA-1/SHA-512 of any file |
| File Encryptor | Live | AES-256-GCM encrypt/decrypt — same crypto as SG/Send |
| Key Generator | Live | Friendly keys with entropy visualisation |
| Vault Browser | Live | Open/browse encrypted vaults in browser |

### What Was REMOVED (and why)

| Removed | When | Reason |
|---------|------|--------|
| DOCX renderer (mammoth.js) | v0.10.19, 03 Mar | HTML injection risk (OV-02) |
| XLSX renderer (SheetJS) | v0.10.19, 03 Mar | **HIGH** — sandbox negation (OV-01) |
| PPTX fallback renderer | v0.10.19, 03 Mar | Cleanup with other Office renderers |
| Office print support | v0.10.19, 03 Mar | innerHTML injection (OV-03) |
| CDN script loader | v0.10.19, 03 Mar | Supply chain risk (OV-04) |

**Consequence:** Office files now auto-download. No rendering. This is intentional for security. Any future Office rendering must be sandboxed differently.

---

## 2. PROPOSED: Gallery & Rich Preview Enhancements

### Phase 2: PDF + Markdown Thumbnails (from v0.16.26 dev brief, 18 Mar)

| Feature | Approach | Status |
|---------|----------|--------|
| PDF thumbnail | pdf.js renders page 1 as canvas → JPEG | Partially shipped (in upload component) |
| Markdown preview | Render to HTML snippet or capture as image | PROPOSED |
| Code syntax snippets | Syntax-highlighted preview image | PROPOSED |
| Higher-res thumbnails | Current 200px too pixelated for gallery-large mode | Bug identified in QA (FT-007) |

### Phase 3: Audio + Video Thumbnails (from v0.16.26 dev brief)

| Feature | Approach | Status |
|---------|----------|--------|
| Audio waveform thumbnail | Web Audio API → Canvas waveform image | PROPOSED |
| Audio duration metadata | AudioContext.decodeAudioData | PROPOSED |
| Video frame capture | `<video>` element → Canvas → JPEG at 25% mark | PROPOSED |
| Video duration metadata | HTMLVideoElement.duration | PROPOSED |

### Gallery Editor (from v0.16.17 dev brief, 17 Mar)

| Feature | Detail | Status |
|---------|--------|--------|
| Per-image title + description | JSON metadata alongside gallery files | PROPOSED |
| Multi-language captions | LLM translation integration | PROPOSED |
| Layout selection | Grid / Masonry / Single-column / Slideshow | PROPOSED |
| Gallery download as self-contained HTML | Offline viewable gallery page | PROPOSED |
| `<sg-gallery-editor>` Web Component | WYSIWYG preview, iframe sandboxing | PROPOSED |

### Programmatic PDF from Markdown (from v0.16.26 dev briefing, 21 Mar)

| Feature | Detail | Status |
|---------|--------|--------|
| jsPDF generation | ~90KB library, HTML → PDF pages | PROPOSED — explicitly deferred |
| Output location | `_gallery.{hash}/pdfs/file_001.pdf` | PROPOSED |
| Performance estimate | 200-500ms per markdown file, 50-150KB output | Estimated |

**Architect note:** Deferred pending user-controlled options (quality, page size, which files to generate for). The browser print approach (SgPrint) works well enough for now.

---

## 3. PROPOSED: Consumer Photo/Video Product (v0.10.30, 03 Mar)

The earliest and most ambitious brief — a full encrypted gallery product:

### Phase 1: Beautiful Gallery MVP
- Grid thumbnails with lazy loading
- Lightbox with swipe navigation
- Video inline playback
- EXIF date sorting
- gallery.json metadata (title, description, captions, sort order)
- Support for 100+ photos (500MB+ zips)

**Status:** ~70% shipped in v0.3.0. Gallery view, lightbox, thumbnails, and view modes all exist. Missing: swipe nav, EXIF sorting UI, gallery.json editor.

### Phase 2: Basic Photo Editing
- Crop, rotate (Canvas API)
- Brightness / contrast adjustment
- Filters (sepia, grayscale, etc.)
- Annotate / draw on images
- **Redact** (black out sensitive areas)

**Status:** PROPOSED — no code. All achievable with Canvas API, entirely client-side.

### Phase 3: LLM Transformations
- Auto-caption images (describe what's in the photo)
- Auto-organise by content (group by scene, people, location)
- Remove background
- Enhance (upscale, denoise)
- Extract text from images (OCR)
- Translate text in images

**Status:** PROPOSED — no code. Would require LLM API calls from browser (same pattern as Workspace UI).

### Phase 4: Collaborative Gallery
- Multi-contributor uploads
- Comments / favourites
- Timeline / map views
- Shared album management

**Status:** PROPOSED — no code. Builds on vault collaboration model.

---

## 4. PROPOSED: tools.sgraph.ai Media Tools

From the v0.11.08 tools architecture brief (05 Mar) and tools team status (10 Mar):

### Video Tools

| Tool | Tech | Status | Brief |
|------|------|--------|-------|
| **Video Splitter** | FFmpeg WASM (~30MB, lazy-loaded) | PROPOSED — full dev brief exists | v0.11.08 |
| Video Compressor | FFmpeg WASM | PROPOSED — listed as future | v0.11.08 |
| Audio Extractor | FFmpeg WASM (`-vn -c:a copy`) | PROPOSED — listed as future | v0.11.08 |

**Video Splitter architecture (detailed in brief):**
- FFmpeg compiled to WebAssembly, loaded from CDN on first use
- Virtual filesystem for input/output
- `-c copy` flag (stream copy, no re-encoding, fast)
- Segment by fixed length or custom start/end times
- Blob URLs for output files
- 200MB warning / 500MB hard limit
- Stretch: visual timeline, Web Worker for UI responsiveness

### Image Tools

| Tool | Tech | Status | Brief |
|------|------|--------|-------|
| **Image Converter** | Canvas API (PNG/JPG/WebP/AVIF) | PROPOSED — listed as future | v0.11.08 |
| **EXIF Viewer/Stripper** | EXIF parsing library | PROPOSED — listed as future | v0.11.08 |
| **QR Code Generator** | Canvas API or library | PROPOSED — listed as future | v0.11.08 |

### Other Media-Adjacent Tools

| Tool | Tech | Status |
|------|------|--------|
| PDF Merger/Splitter | pdf-lib | PROPOSED |
| Markdown Preview | Custom parser (exists in codebase) | PROPOSED |
| Text Diff | diff algorithm | PROPOSED |
| JSON/CSV Converter | JS parsing | PROPOSED |
| File Encryptor | Web Crypto (AES-256-GCM) | **LIVE** |
| File Hasher | Web Crypto (SHA-256) | **LIVE** |

---

## 5. PROPOSED: Vertical-Specific Media Features

### Musicians Vertical (v0.16.26, 18 Mar)

| Component | What It Does | Tech |
|-----------|-------------|------|
| `<sg-audio-player>` | Inline playback with waveform, seek, loop, A/B compare | Web Audio API + Canvas |
| `<sg-multi-track>` | Parallel audio playback with sync, solo/mute | Multiple Audio elements |
| `<sg-lyrics-viewer>` | Lyrics alongside audio with sync | Text + timing metadata |
| `<sg-take-compare>` | Side-by-side audio comparison of different takes | Dual players |
| `<sg-album-view>` | Final package: artwork, track list, play buttons | Gallery + metadata |

Pre-packaged vault templates: solo songwriter, band collaboration, album production, remix project.

### Portfolio Views (v0.17.3, 26 Mar)

| Feature | Detail |
|---------|--------|
| Video playback in browser (no download) | Native `<video>` with lazy loading |
| View tracking | opened/played/time-spent per item |
| Lazy loading for 2GB+ videos | Structure/thumbnails first, full files on demand |
| Mixed media support | Videos, images, documents, audio, text in one presentation |
| Custom presentation order | Sections, categories, per-portfolio theme |

Target markets: artists/performers ("has my agent watched my showreel?") and job seekers/recruitment.

---

## 6. Architectural Patterns (Consistent Across All Proposals)

### Pattern 1: Client-Side Only
**Every media processing operation happens in the browser.** The server never sees unencrypted content. This is non-negotiable — it's the zero-knowledge guarantee.

| Operation | Technology |
|-----------|-----------|
| Image resize/crop/rotate | Canvas API |
| Image format conversion | Canvas.toBlob() with MIME type |
| PDF rendering | pdf.js (vendored, no CDN) |
| Video splitting | FFmpeg WASM |
| Audio waveforms | Web Audio API → Canvas |
| Video frame capture | `<video>` → Canvas.drawImage() |
| Markdown rendering | Custom parser (exists) |
| Encryption | Web Crypto API (AES-256-GCM) |

### Pattern 2: Metadata Alongside Files
Media metadata is stored as JSON files alongside the encrypted content:

```
_preview/
  _manifest.json        # File index, type breakdown, gallery config
  thumbnails/
    file-001.jpg        # Pre-generated thumbnail
  metadata/
    file-001.json       # Type, size, dimensions, EXIF, category

_gallery.{hash}/
  _gallery.json         # Title, description, sort order, captions
  pdfs/                 # Generated PDFs (future)
  thumbnails/           # Gallery-specific thumbnails

_comments/
  {file}.json           # Per-file comments (future)
```

### Pattern 3: Three Deployment Surfaces

| Surface | Purpose | Examples |
|---------|---------|---------|
| **send.sgraph.ai** | Integrated into transfer workflow | Thumbnail generation on upload, gallery on download |
| **tools.sgraph.ai** | Standalone browser tools | Video splitter, image converter, EXIF viewer |
| **Web Components** | Reusable across all surfaces | `<sg-audio-player>`, `<sg-gallery-editor>` |

Standalone tools at tools.sgraph.ai serve as both utility AND marketing — they demonstrate the zero-knowledge architecture ("use the same encryption we use, right in your browser").

### Pattern 4: IFD Versioning
Every component follows Incremental Feature Development. New capabilities are surgical overlays on existing components, never rewrites.

### Pattern 5: Graceful Degradation
If a media capability fails or isn't available (e.g. FFmpeg WASM too slow, Canvas API unavailable), fall back to the simpler view (download, raw display, or folder browse).

---

## 7. Priority Recommendations

Based on what's shipped, what's closest to ready, and what has the highest user impact:

### P1 — Ship with or right after v0.3.0

| Feature | Surface | Effort | Impact |
|---------|---------|--------|--------|
| Higher-res thumbnails (fix FT-007) | send.sgraph.ai | Small | Fixes pixelated gallery cards |
| Video frame capture thumbnails | send.sgraph.ai | Small | Videos show preview instead of blank |
| Audio waveform thumbnails | send.sgraph.ai | Small | Audio files show waveform instead of icon |

### P2 — Near-term (tools + gallery enhancement)

| Feature | Surface | Effort | Impact |
|---------|---------|--------|--------|
| Video Splitter | tools.sgraph.ai | Medium | Full dev brief exists, FFmpeg WASM proven |
| Image Converter (PNG/JPG/WebP) | tools.sgraph.ai | Small | Canvas API, straightforward |
| EXIF Viewer/Stripper | tools.sgraph.ai | Small | Privacy tool — strips metadata before sharing |
| QR Code Generator | tools.sgraph.ai | Small | Already generate QR on Done page |
| Gallery JSON editor | send.sgraph.ai | Medium | Let senders add titles/captions before sharing |

### P3 — Medium-term (verticals + editing)

| Feature | Surface | Effort | Impact |
|---------|---------|--------|--------|
| `<sg-audio-player>` with waveform | Web Component | Medium | Unlocks musicians vertical |
| Photo editing (crop/rotate/redact) | send.sgraph.ai | Medium | Canvas API, client-side |
| Portfolio views with view tracking | send.sgraph.ai | Medium | Unlocks artists/recruitment vertical |
| PDF Merger/Splitter | tools.sgraph.ai | Medium | pdf-lib library |

### P4 — Future (LLM + collaborative)

| Feature | Surface | Effort | Impact |
|---------|---------|--------|--------|
| LLM image captioning | send.sgraph.ai | Large | Requires LLM API integration |
| Background removal | send.sgraph.ai | Large | Requires ML model in browser |
| Multi-contributor galleries | send.sgraph.ai | Large | Vault collaboration model |
| `<sg-multi-track>` audio | Web Component | Medium | Niche (musicians only) |

---

## 8. Source Documents (Recommended Reading Order)

| # | Document | Path | Focus |
|---|----------|------|-------|
| 1 | Rich Preview Gallery dev brief | `briefs/03/18/v0.16.26__dev-brief__rich-preview-gallery.md` | Thumbnail architecture |
| 2 | Encrypted Gallery Sharing | `briefs/03/03/v0.10.30__dev-brief__encrypted-gallery-sharing.md` | 4-phase consumer gallery roadmap |
| 3 | Video Splitter dev brief | `briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md` | FFmpeg WASM architecture |
| 4 | Tools canonical library arch | `briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md` | Three-tier tools architecture |
| 5 | Gallery Editor dev brief | `briefs/03/17/v0.16.17__dev-brief__gallery-editor.md` | Per-image annotations, LLM translation |
| 6 | Musicians Vertical brief | `briefs/03/18/v0.16.26__brief__musicians-vertical.md` | Audio Web Components |
| 7 | Portfolio Views brief | `briefs/03/26/v0.17.3__brief__portfolio-views.md` | Video playback, view tracking |
| 8 | PDF Generation briefing | `roles/dev/reviews/03/21/v0.16.26__briefing__pdf-generation-for-markdown-in-gallery.md` | jsPDF approach (deferred) |
| 9 | Office Viewers Removal | `roles/appsec/reviews/03/03/v0.10.19__review__post-removal-office-viewers-and-print.md` | Security constraints |
| 10 | Vault UI Features | `briefs/03/18/v0.16.26__dev-brief__vault-ui-features.md` | File viewing/editing in vault |
| 11 | Tools Team Status | `briefs/03/10/tools-team/v0.1.1__briefing__tools-team-to-sg-send-team.md` | What's live on tools.sgraph.ai |
| 12 | Tools Integration Strategy | `roles/dev/reviews/03/27/v0.18.2__dev-review__tools-repo-integration-strategy.md` | How sgraph.ai consumes from __Tools |

---

*Image & Video Processing Tools Briefing — v0.19.1 — 28 March 2026*
*Synthesised from 18+ briefs spanning 03 March – 27 March 2026*
