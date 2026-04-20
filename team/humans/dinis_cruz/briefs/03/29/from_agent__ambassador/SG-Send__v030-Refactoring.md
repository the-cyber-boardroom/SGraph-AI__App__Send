# SG/Send v0.3.0 — The Refactoring

**Product:** SG/Send — [send.sgraph.ai](https://send.sgraph.ai)
**Version:** v0.19.9 (UI v0.3.0)
**Date:** March 2026

---

## What SG/Send Is

SG/Send is a zero-knowledge encrypted file sharing product. Files are encrypted in the browser using AES-256-GCM (Web Crypto API) **before** upload. The server only stores encrypted ciphertext — it never sees plaintext, filenames, or decryption keys. The key never leaves the sender's device.

**The one-liner:** Zero-knowledge encrypted file sharing with rich content viewing.

**What makes it different from WeTransfer, Proton, OnionShare, etc.:**

1. **Rich content viewing** — recipients don't just download a blob. Markdown renders with full typography. PDFs open in a built-in viewer. Images display in a gallery. JSON shows with structure. Code renders with formatting. All in the browser, all zero-knowledge.

2. **Folder browsing** — drop a folder and the recipient gets a full file explorer (sg-layout) with tree navigation, tabbed multi-pane layout, and inline preview of every file type side by side. Like Finder or VS Code — but zero-knowledge, in the browser.

3. **Friendly tokens** — instead of a 64-character hex URL, users share `coral-equal-1234` — a human-readable token derived via SHA-256 + PBKDF2 that encodes both the transfer ID and decryption key. 320 × 320 × 10,000 = ~1 billion combinations.

4. **Verifiable transparency** — recipients can inspect what the server stored vs what it never saw. Zero cookies, zero tracking, verifiable in DevTools.

5. **No account required** — frictionless for both sender and recipient. Pay-per-use (£0.01/file).

**The north-star claim no competitor can make:**
> "We cannot read your files — and you never have to download them to view them."

WeTransfer cannot say the first clause. Proton cannot say the second.

---

## Why the Refactoring Happened

The SG/Send UI had grown through IFD (Iterative Feature Development) — a methodology where each new feature ships as a JavaScript overlay file that applies prototype mutations on top of the previous version. This is fast for exploration. By v0.2.17, it had become unmanageable.

The upload workflow alone was a chain of **16 overlay files** (v0.2.0 through v0.2.17) totalling **7,328 lines**, where each file monkey-patches the previous. Components extended `HTMLElement` directly using four different resource-loading patterns. CSS was embedded inline in JavaScript. **27 symlinks** pointed back to v0.2.0/v0.2.3 directories. The consolidated monolith was 7,221 lines in a single file with 30+ chained method overrides.

The product was mature enough that this architecture was holding it back. v0.3.0 was the IFD "major version" — a clean break.

---

## The Before: v0.2.x Architecture

### Upload workflow: 16-layer overlay chain

```
send-upload.js          ← v0.2.0 base class (936 lines)
  ← send-upload-v023.js ← 4-step wizard (831 lines)
  ← send-upload-v024.js ← rich file display, paste, thumbnails (420 lines)
  ← send-upload-v025.js ← multi-file, smart skip (323 lines)
  ← send-upload-v026.js ← share modes, friendly keys (1,109 lines)
  ← send-upload-v027.js ← Next button, carousel (338 lines)
  ← send-upload-v028.js ← 6-step, inline Next, QR, email (709 lines)
  ← send-upload-v029.js ← no-op / logic moved to v026 (25 lines)
  ← send-upload-v0210.js ← gallery-first, stable stepper, test files (331 lines)
  ← send-upload-v0211.js ← gallery preview in delivery (243 lines)
  ← send-upload-v0212.js ← image thumbnails in zip (589 lines)
  ← send-upload-v0213.js ← PDF/markdown/video thumbnails (889 lines)
  ← send-upload-v0214.js ← delivery refinements, clickable steps (333 lines)
  ← send-upload-v0215.js ← always 3 delivery options, smart defaults (132 lines)
  ← send-upload-v0216.js ← step click resets file (50 lines)
  ← send-upload-v0217.js ← single-file gallery zip wrapping (70 lines)
                         ──────
Total:                  7,328 lines across 16 files (prototype mutation chain)
```

### Component patterns: four different approaches, zero consistency

| Pattern | Components | Problem |
|---------|-----------|---------|
| Manual `SendComponentPaths.basePath` lookup | 8 upload-step-* components | 8+ copies of the same availability check |
| `static CSS` string literal in JS | send-browse, send-gallery, send-viewer | CSS mixed into JS — not cacheable, not inspectable in DevTools |
| `style.textContent` injection | send-step-indicator, send-access-gate | Inline CSS blocks embedded in JS |
| Pure `innerHTML` with inline styles | send-header, send-footer, send-locale | No separation at all |

`SendComponent` — a well-designed base class adapted from MGraph — existed in the codebase. **Zero components used it.**

---

## The After: v0.3.0 Architecture

### Upload workflow: 7 modules + 6 Shadow DOM components

```
Shared modules:
  upload-constants.js      91 lines   step labels, state map, carousel, limits
  upload-crypto.js        143 lines   friendly keys, PBKDF2
  upload-file-utils.js    168 lines   file type detection, delivery options
  upload-thumbnails.js    265 lines   image/PDF/markdown/video/audio thumbnails
  upload-folder.js        229 lines   directory scanning, JSZip, gallery preview
  upload-engine.js        185 lines   read → encrypt → create → upload → complete
  send-upload.js          441 lines   orchestrator: state machine only, zero business logic
                         ──────
Subtotal:               1,522 lines (7 files)

Sub-components (Shadow DOM):
  upload-step-select/     811 lines   Step 1: file/folder selection
  upload-step-delivery/   393 lines   Step 2: delivery mode
  upload-step-share/      265 lines   Step 3: share mode
  upload-step-confirm/    626 lines   Step 4: review + word picker
  upload-step-progress/   460 lines   Step 5: progress + carousel
  upload-step-done/     1,083 lines   Step 6: share links + QR
                         ──────
Subtotal:               3,638 lines (18 files: 6×.js + 6×.html + 6×.css)

Grand total:            5,160 lines across 25 files
```

Each module is a revealing-module-pattern IIFE with a clean public API. The orchestrator calls into modules but contains zero business logic itself. Each concern has one file, each file has one concern.

### Component architecture: unified base class

All components now extend `SendComponent` with:
- `static useShadow = true` — opt-out flag for light DOM components
- `static useTemplate = true` — opt-out for components that generate HTML dynamically
- `get renderRoot()` — single abstraction for Shadow DOM or light DOM
- `get basePath()` — centralised path resolution, eliminating 8+ scattered availability checks
- `_injectHeadCss()` — light DOM CSS loading via `<link>` in `document.head`, deduplicated with a `Set`

### CSS extracted into cacheable files

| Component | Lines extracted | New file |
|-----------|---------------|----------|
| send-gallery | 465 | `send-gallery.css` |
| send-browse | 338 | `send-browse.css` |
| send-viewer | 190 | `send-viewer.css` |
| send-step-indicator | 82 | `send-step-indicator.css` |

### Self-contained codebase

| Metric | Before (v0.2.x) | After (v0.3.0) |
|--------|-----------------|-----------------|
| Files | Scattered across v0.2.0–v0.2.17 directories | 113 files across 34 directories |
| External symlinks | 27 (pointing to v0.2.0/v0.2.3) | 0 |
| Internal route symlinks | N/A | 4 (browse/gallery/v/view → download) |
| External CDN dependencies | Multiple | 1 (sg-layout) |
| Component base class usage | 0 components | 10 components migrated |
| i18n locales | 17 | 17 |
| Upload workflow lines | 7,328 (16 files, prototype chain) | 5,160 (25 files, modular) |

---

## What Users See: Before vs After

### Upload flow

| Aspect | Before (v0.2.x) | After (v0.3.0) |
|--------|-----------------|-----------------|
| File/Text toggle | Chunky bordered buttons | Compact pill-style toggle |
| File selection | Basic drop zone, limited feedback | Enhanced drop with drag feedback, multi-file paste, smart skip for duplicates |
| Delivery options | Context-dependent (sometimes 1, sometimes 3) | Always 3 options with smart defaults |
| Default delivery mode | Gallery (crashed on large uploads ~160 MB) | Browse (stable) |
| Step indicator | Basic progress bar, forward-only | Clickable completed steps — go back and review |
| Share modes | Basic link/token display | Three modes (combined, separate, friendly token) with mode-aware email composition |
| Email composition | Leaked decryption key in "link + key separate" mode | Mode-aware: separate mode sends link only, token mode sends friendly URL |
| Done page | Duplicate email buttons, awkward text | Clean single button row, rewritten copy per share mode |
| Confirm page | Two "Encrypt" buttons (header + body) with different labels | Single "Encrypt & Upload →" in header only |
| Token bar & test files | Visible during all wizard steps (dangerous — clicking "Change Token" during encryption loses progress) | Hidden once past Step 1, re-shown on back navigation |

### Download and viewing experience

| Aspect | Before (v0.2.x) | After (v0.3.0) |
|--------|-----------------|-----------------|
| Gallery lightbox (markdown) | Browser defaults in a narrow white box | Full styled typography — 70vw width, box-shadow, proper headings, tables, code blocks, blockquotes |
| Gallery lightbox actions | Missing | Print (SgPrint for markdown) + Share/Copy Link with "Copied!" clipboard feedback |
| Single text/code files | Dark background (#0d1117) | Light background (#fafafa) matching browse view |
| Folder tree file sorting | Random/reverse order for numbered files | Natural alphanumeric sort (`localeCompare` with `numeric: true`) |
| Folder tree display | Basic list | Tree with expand/collapse, file count badges, type icons, basenames |
| PDF viewing | Basic embed | Built-in viewer + present mode (fullscreen via button or 'f' key) |
| Multi-pane layout | Not available | sg-layout: drag to resize panes, open multiple files simultaneously, compare side by side |
| Print support | None | SgPrint: branded A4 output with SG/Send header, DM Sans font, styled tables/code/blockquotes, footer |
| Footer version | Nearly invisible (0.42 effective opacity), two lines | Inline, single line, clearly readable (0.8 opacity) |
| Button hover | "Encrypt & Send" text unreadable on hover — lost contrast | Explicit `color` on `:hover` maintaining dark text on teal |

---

## Critical Bugs Fixed

### P0: Friendly tokens completely broken

v0.3.0 initially called `FriendlyCrypto.resolve()` — **a method that doesn't exist**. This broke ALL friendly token URLs (`word-word-NNNN`), which is the primary Simple Token share mode used for verbal/message sharing. The fix replaced the phantom call with the three actual derivation steps: `deriveTransferId()` → `deriveKey()` → `exportKey()`.

This was likely introduced by an LLM that hallucinated the API during the v0.3.0 rewrite. Lesson: when rewriting code that calls external modules, verify actual method signatures exist.

### P1: Email leaked decryption key in separate mode

The "Link + key separate" share mode was supposed to send only the URL (without the key) so the key could be shared through a different channel. Instead, `_openEmailLink()` was sending the full combined URL regardless of mode — defeating the entire purpose of separate-channel key sharing. Fixed with mode-aware URL selection.

### P1: Gallery crashed on large uploads

Gallery mode was the default delivery option for multi-file uploads. It crashed on uploads around 160 MB (common when including videos). Default changed to browse mode, which handles large transfers without issues. Gallery remains available as a user-selected option.

---

## How It Was Built

The entire v0.3.0 refactoring was executed by AI agents — Claude Code and Claude Web sessions — operating as specific roles within an 18-agent team structure, under a single human architect (Dinis Cruz).

### The workflow

1. **Human provides briefs** in `team/humans/dinis_cruz/briefs/`
2. **Agent reads full context** — CLAUDE.md, reality document, role files, gap analysis, architect review
3. **Agent produces patches** as standard `git format-patch` / `git diff` output
4. **Patches pushed to encrypted vault** via sg-send-cli (SG/Send's own vaults as the collaboration channel)
5. **Human pulls from vault**, reviews diffs in GitHub, applies with `git am`
6. **Human pushes to repo** — agents never push directly

### The session chain

The refactoring happened across multiple sessions:

1. **Claude Code session** — started the upload orchestrator decomposition, timed out after 232 tool calls
2. **Claude Web session (Dev)** — picked up session handoff docs, completed the remaining 11 patches including the P0 bug fix that the previous session had introduced
3. **Claude Code session (Dev)** — CSS extraction + SendComponent migration (10 commits, 23 files, +1,644 / -1,479 lines)
4. **Claude Web session (Dev)** — v0.2.x → v0.3.0 feature parity audit, 5 patches for missing/broken features, CI pipeline rewrite
5. **Claude Web session (QA + Dev)** — 66 issues reviewed, 17 low-risk fixes implemented, 47 deferred

Each session produced a debrief with relative links to every deliverable, filed in `team/humans/dinis_cruz/debriefs/`.

### The key insight

The vault-as-patch-transport pattern means Claude Web (which has no git access) participates in the same development workflow as Claude Code sessions. The patches are standard git output, reviewable in any diff tool, applied with standard commands. Nothing proprietary in the pipeline. The same zero-knowledge encrypted vaults that the product offers to users are the collaboration channel for the team building the product.

---

## The Bigger Picture

The v0.3.0 refactoring represents a product maturing from rapid prototyping (IFD overlay chain — fast to ship, hard to maintain) to a production-ready modular architecture (clean separation of concerns, cacheable CSS, unified component model, self-contained deployment).

The IFD methodology served its purpose — it let the product explore features quickly through 17 incremental overlays without ever breaking production. But by v0.2.17, the overlay chain was approaching the limits of human (and agent) comprehension. The v0.3.0 major version consolidation is the natural next step in the IFD lifecycle: take everything that works, throw away the scaffolding, and build a clean foundation for the next round of exploration.

The product now has 34 user-facing endpoints, vault infrastructure with presigned uploads for large files, an MCP server, rooms with invite flows, a CLI tool (sgit), and a website with pricing and Early Access signup. The UI matches the backend's maturity — ready for the next phase of growth.

---

*Generated by the Ambassador agent — SGraph Send team — v0.19.9 — 29 March 2026*
