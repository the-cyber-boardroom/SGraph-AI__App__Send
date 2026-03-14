# First Session Brief: Next IFD Batch

**Version:** v0.13.8
**Date:** 10 March 2026
**Purpose:** Orientation for a Claude Code session on the tools repo to build Batches 1 + 2

---

## Who You Are

You are the **Explorer team** for sgraph_ai__tools. The repo already exists with a working SSH Key Generator, shared components (header, footer, locale picker), CI/CD, and i18n pipeline.

## What You're Building This Session

**9 new IFD elements** in 2 batches:

### Batch 1: Foundation (Do First)

| # | Element | Layer | What |
|---|---------|-------|------|
| 1 | sg-crypto.js | Core | Copy production crypto from Send repo |
| 2 | `<sg-upload-dropzone>` | Component | Drag-and-drop file input |
| 3 | File Hasher tool | Tool | Drop file → SHA-256 hash |
| 4 | File Encryptor tool | Tool | Encrypt/decrypt files with AES-256-GCM |
| 5 | sg-pbkdf2.js | Core | PBKDF2 key derivation for friendly keys |
| 6 | sg-wordlist.js | Core | Word lists for friendly key generation |

### Batch 2: Key Management (After Batch 1)

| # | Element | Layer | What |
|---|---------|-------|------|
| 7 | `<sg-key-generator>` | Component | Word selection, entropy bar, geek mode |
| 8 | `<sg-key-input>` | Component | Mobile-optimised key entry with auto-complete |
| 9 | Key Generator tool | Tool | Standalone page wrapping the component |

## What You Already Have

Read the tools team briefing for the full picture:
```
/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/10/v0.1.1__briefing__tools-team-to-sg-send-team.md
```

**Already working:** SgComponent base class, sg-site-header v1.0.1, sg-site-footer, sg-locale-picker, sg-tokens.css, SSH Key Generator, CI/CD (3 workflows), i18n (5 locales).

**Gap to fix first:** sg-crypto.js is unverified against Send production. Copy the real one before building anything crypto-dependent.

## Reading Order

1. This file (you're reading it)
2. `BRIEF.md` — full briefing with constraints, batches, definition of done
3. `architecture.md` — IFD paths, manifest specs, API contracts
4. Element specs in order: `element-specs/01_*.md` through `element-specs/09_*.md`
5. The tools team briefing (in the SG/Send repo) for current state details

## Session Deliverables

### Must Have

1. sg-crypto.js replaced with production copy + wire-format verified
2. File Hasher tool working (drop file → see hash → copy)
3. File Encryptor tool working (encrypt → download .enc, decrypt → download original)
4. `<sg-upload-dropzone>` component working (used by both tools)
5. sg-pbkdf2.js working (deriveKey + calculateEntropy)
6. sg-wordlist.js working with en-gb word list (~2000 words)
7. Landing page updated with new tool cards

### Should Have

8. `<sg-key-generator>` component with entropy bar + geek mode
9. `<sg-key-input>` component with auto-complete + paste detection
10. Key Generator tool page at key-generator/
11. i18n keys for all elements in all 5 locale files
12. Reality document updated

### Nice to Have

13. Wire-format cross-test: encrypt with tools, send to Send's decrypt endpoint
14. Mobile testing of `<sg-key-input>`

## Critical Reminders

- **Crypto production copy is #1.** Do NOT skip this. Do NOT "improve" the existing crypto module.
- **Extend SgComponent** for all new components.
- **Follow the tool page template** from the tools team briefing (section 3).
- **manifest.json** for every new element.
- **Vanilla JS only.** No frameworks, no build step, no npm.
- **Client-side only.** No server calls from tools.
- **Named exports + JSDoc** on all core module functions.
