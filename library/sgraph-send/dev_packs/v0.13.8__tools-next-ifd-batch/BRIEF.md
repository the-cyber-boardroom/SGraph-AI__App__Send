# Dev Brief: Next IFD Batch for tools.sgraph.ai

**Version:** v0.13.8
**Date:** 10 March 2026
**From:** SG/Send team (Architect + Dev)
**To:** Tools team (Explorer)
**Type:** Dev brief. 9 IFD elements across core, components, and tools.

---

## What You Are Building

9 new IFD elements in 2 sequential batches, taking the tools repo from 1 working tool to 4 working tools and adding the crypto + key management foundation that the entire SGraph ecosystem depends on.

---

## Context: What You Already Have

From the tools team briefing (v0.1.1, 10 March 2026):

| Layer | What Exists |
|-------|------------|
| Core | `sg-crypto.js` (unverified), `sg-ssh.js` (Ed25519 only) |
| Components | `SgComponent` base class, `sg-site-header` v1.0.1, `sg-site-footer`, `sg-locale-picker`, `sg-tokens.css` |
| Tools | SSH Key Generator (1 tool) |
| Infrastructure | CI/CD, i18n (5 locales), IFD versioning, manifest.json per module |

**Ready patterns:** Shadow DOM, slot composition, file download, clipboard, Web Crypto API.
**NOT ready:** Upload/drag-and-drop.

---

## Batch 1: Foundation + Quick Wins

**Goal:** Fix the crypto gap, add a file dropzone, ship two easy tools.

| # | Element | Layer | Effort | Spec |
|---|---------|-------|--------|------|
| 1 | sg-crypto.js (production copy) | Core | Low | [01_sg-crypto-production-copy.md](element-specs/01_sg-crypto-production-copy.md) |
| 2 | `<sg-upload-dropzone>` | Component | Low-Med | [02_sg-upload-dropzone.md](element-specs/02_sg-upload-dropzone.md) |
| 3 | File Hasher tool | Tool | Low | [03_file-hasher-tool.md](element-specs/03_file-hasher-tool.md) |
| 4 | File Encryptor tool | Tool | Low | [04_file-encryptor-tool.md](element-specs/04_file-encryptor-tool.md) |
| 5 | sg-pbkdf2.js | Core | Low | [05_sg-pbkdf2.md](element-specs/05_sg-pbkdf2.md) |
| 6 | sg-wordlist.js | Core | Low | [06_sg-wordlist.md](element-specs/06_sg-wordlist.md) |

**Batch 1 output:** 3 core modules fixed/added, 1 component, 2 tools shipped.

### Dependency Order Within Batch 1

```
sg-crypto.js (production copy) ── must be first
  ↓
sg-upload-dropzone ── depends on nothing, but crypto needs to exist for encryptor
  ↓
File Hasher tool ── no dependencies, can start immediately
File Encryptor tool ── needs sg-crypto.js + sg-upload-dropzone
sg-pbkdf2.js ── no dependencies, pure JS
sg-wordlist.js ── no dependencies, data module
```

**File Hasher can start immediately** (no core module needed). **sg-pbkdf2.js and sg-wordlist.js can start immediately** (pure JS, no dependencies). **File Encryptor** waits for crypto + dropzone.

---

## Batch 2: Key Management Components

**Goal:** Ship the key generator as both a component and a standalone tool.

| # | Element | Layer | Effort | Spec |
|---|---------|-------|--------|------|
| 7 | `<sg-key-generator>` | Component | Medium | [07_sg-key-generator.md](element-specs/07_sg-key-generator.md) |
| 8 | `<sg-key-input>` | Component | Low-Med | [08_sg-key-input.md](element-specs/08_sg-key-input.md) |
| 9 | Key Generator tool page | Tool | Low | [09_key-generator-tool.md](element-specs/09_key-generator-tool.md) |

**Batch 2 output:** 2 components, 1 tool. Friendly keys become real.

**Depends on Batch 1:** sg-crypto.js, sg-pbkdf2.js, sg-wordlist.js must exist.

---

## Key Constraints

| Constraint | Detail |
|-----------|--------|
| **Vanilla JS only** | No React, Vue, or frameworks. Pure HTML + CSS + ES modules. |
| **No build step** | Every file deployable as-is. No webpack, no bundler. |
| **Extend SgComponent** | All new UI components extend the existing base class. |
| **Shadow DOM** | All components use Shadow DOM (established pattern). |
| **IFD versioning** | All new elements at `v1/v1.0/v1.0.0/`. |
| **manifest.json** | Every new element gets a manifest.json. |
| **i18n keys** | Add translation keys to all 5 JSON files. |
| **Landing page cards** | Add tool cards to the landing page for new tools. |
| **Client-side only** | Zero server calls. All processing in the browser. |
| **Named exports only** | No default exports. |
| **JSDoc on every export** | `@param` types and `@returns`. |

---

## Critical: The Crypto Production Copy

**This is the #1 priority and must be done before anything else that touches encryption.**

The current `sg-crypto.js` in the tools repo was written from scratch. It has NOT been verified against Send's production crypto. If the wire format differs, files encrypted by the tools repo cannot be decrypted by send.sgraph.ai (or vice versa).

**Instructions:**

1. Get the exact production file from `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`
2. Copy it into `core/crypto/v1/v1.0/v1.0.0/sg-crypto.js`
3. Convert from object-literal pattern to ES module with named exports (if not already)
4. Verify wire-format compatibility: encrypt with tools version, decrypt in a test that matches Send's decryption flow
5. Only THEN build tools that depend on it

**Do NOT improve, refactor, or "clean up" the crypto module.** Copy first, ship it, improve in v1.1.0.

See [element-specs/01_sg-crypto-production-copy.md](element-specs/01_sg-crypto-production-copy.md) for full spec.

---

## What Each Element Needs (Checklist)

Based on the tools team's own "Adding a New Tool" checklist (section 8 of their briefing):

### For Core Modules

- [ ] JS file at `core/{name}/v1/v1.0/v1.0.0/sg-{name}.js`
- [ ] `manifest.json` at `core/{name}/v1/v1.0/v1.0.0/manifest.json`
- [ ] Named exports with JSDoc
- [ ] No DOM dependencies (pure JS)
- [ ] No build step required

### For Components

- [ ] JS + HTML + CSS at `components/{name}/v1/v1.0/v1.0.0/`
- [ ] `manifest.json` at `components/{name}/v1/v1.0/v1.0.0/manifest.json`
- [ ] Extends `SgComponent` base class
- [ ] Shadow DOM with template + styles loaded from sibling files
- [ ] Attributes, slots, and events documented
- [ ] i18n keys added to all 5 JSON files
- [ ] Works standalone AND composable inside sg-layout

### For Tools (Standalone Pages)

- [ ] HTML page at `tools/v0/v0.1/v0.1.2/en-gb/{tool-name}/index.html`
- [ ] Uses shared header/footer/locale-picker components
- [ ] i18n keys added to all 5 JSON files
- [ ] Tool card added to landing page
- [ ] Client-side only, no server calls
- [ ] Privacy footer: "All processing happens in your browser"

---

## Future Batches (Not In Scope — For Context Only)

These batches are planned but NOT part of this dev brief:

| Batch | Elements | When |
|-------|----------|------|
| **Batch 3: Library** | sg-markdown.js, `<sg-markdown-viewer>`, `<sg-document-meta>`, `<sg-prompt-card>`, `<sg-library-nav>` | Parallel track — separate brief |
| **Batch 4: Visualization** | sg-drawflow-adapter, `<sg-workflow-editor>`, sg-d3-tree-adapter, `<sg-tree-viewer>` | After Batch 1 patterns established |
| **Batch 5: Advanced** | `<sg-public-viewer>`, `<sg-file-selector>`, `<sg-mixed-vault>`, `<sg-version-badge>` | After Batch 1 crypto confirmed |

---

## Definition of Done

| # | Criterion | Batch |
|---|-----------|-------|
| 1 | sg-crypto.js is a byte-compatible copy of Send production crypto | 1 |
| 2 | Wire-format test passes: encrypt with tools, decrypt with Send pattern | 1 |
| 3 | `<sg-upload-dropzone>` accepts files via click and drag-and-drop | 1 |
| 4 | File Hasher tool works: drop file → see SHA-256 hash + copy to clipboard | 1 |
| 5 | File Encryptor tool works: drop file → encrypt → download .enc file | 1 |
| 6 | File Encryptor tool works: drop .enc file + paste key → decrypt → download original | 1 |
| 7 | sg-pbkdf2.js derives AES-256 key from passphrase via PBKDF2 | 1 |
| 8 | sg-wordlist.js exports en-gb word list (~2000 common words) | 1 |
| 9 | `<sg-key-generator>` shows word selection, entropy bar, geek mode | 2 |
| 10 | `<sg-key-generator>` allows user-chosen words (not just random) | 2 |
| 11 | `<sg-key-input>` accepts whitespace/dash-separated input | 2 |
| 12 | `<sg-key-input>` detects pasted URLs and extracts key portion | 2 |
| 13 | Key Generator tool page works at tools.sgraph.ai/key-generator/ | 2 |
| 14 | All 3 new tools appear on the landing page with cards | 1+2 |
| 15 | All elements have manifest.json | 1+2 |
| 16 | All elements have i18n keys in all 5 locale files | 1+2 |
| 17 | Reality document updated with all new elements | 1+2 |

---

## Source Briefs (Read These for Full Context)

| Brief | Key Content |
|-------|-------------|
| **UX Components** (`v0.13.5__dev-brief__ux-components-qa-cross-team.md`) | `<sg-file-selector>`, `<sg-key-generator>`, `<sg-key-input>` specs, UI mockups, event contracts |
| **Website Evolution** (`v0.13.5__dev-brief__website-evolution-public-content-versioning.md`) | `<sg-public-viewer>`, version compatibility, web of trust |
| **Tools Team Briefing** (`v0.1.1__briefing__tools-team-to-sg-send-team.md`) | Current state, gaps, checklist, suggested priorities |

All briefs are in the SG/Send repo at `team/humans/dinis_cruz/briefs/03/09/` and `03/10/`.

---

*This brief covers Batches 1 and 2 only. Batch 3 (library components) will be a separate parallel brief. Batches 4-5 are future work.*
