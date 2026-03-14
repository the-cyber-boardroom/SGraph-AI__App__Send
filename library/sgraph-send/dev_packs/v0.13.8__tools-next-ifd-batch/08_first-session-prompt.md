# First Session Prompt

**Version:** v0.13.8
**Date:** 10 March 2026
**Purpose:** Copy-paste this into a Claude Code session on the tools repo

---

## The Prompt

Copy everything below the line and paste as your first message:

---

```
You are building the **next batch of IFD elements** for sgraph_ai__tools — the canonical component library for the SGraph ecosystem.

The tools repo already exists with a working SSH Key Generator, shared components (header, footer, locale picker), CI/CD, and i18n. You are adding 9 new elements across 2 batches.

## Step 1: Read the dev pack from the SG/Send repo

Clone the SG/Send repo (read-only reference) and read the dev pack:

git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref

Read these files in order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/README.md` — index
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/BRIEF.md` — full briefing
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/architecture.md` — IFD paths, API contracts

Then read all 9 element specs:
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/01_sg-crypto-production-copy.md`
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/02_sg-upload-dropzone.md`
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/03_file-hasher-tool.md`
8. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/04_file-encryptor-tool.md`
9. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/05_sg-pbkdf2.md`
10. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/06_sg-wordlist.md`
11. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/07_sg-key-generator.md`
12. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/08_sg-key-input.md`
13. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.8__tools-next-ifd-batch/element-specs/09_key-generator-tool.md`

Also read the tools team briefing for current state:
14. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/10/v0.1.1__briefing__tools-team-to-sg-send-team.md`

And the source briefs for full context:
15. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/09/v0.13.5__dev-brief__ux-components-qa-cross-team.md`

And the production crypto file you need to copy:
16. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`

## Step 2: Build in order

After reading all documents:

1. **FIRST:** Copy Send's production crypto.js to `core/crypto/v1/v1.0/v1.0.0/sg-crypto.js` (element #1)
2. Build `<sg-upload-dropzone>` component (element #2)
3. Build File Hasher tool page (element #3) — can start alongside #2
4. Build File Encryptor tool page (element #4) — needs #1 + #2
5. Build sg-pbkdf2.js core module (element #5)
6. Build sg-wordlist.js + en-gb word list (element #6)
7. Build `<sg-key-generator>` component (element #7) — needs #1, #5, #6
8. Build `<sg-key-input>` component (element #8) — needs #5, #6
9. Build Key Generator tool page (element #9) — needs #7

**Non-negotiable:** Vanilla JS only. Extend SgComponent. Shadow DOM. manifest.json per element. i18n keys. JSDoc. No build step. Client-side only. Do NOT modify the crypto module — copy it.
```
