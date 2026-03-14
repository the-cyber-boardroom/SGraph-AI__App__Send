# Dev Pack: Next IFD Batch for tools.sgraph.ai

**Version:** v0.13.8
**Date:** 10 March 2026
**From:** SG/Send team (Architect + Dev)
**To:** Tools team (Explorer)
**Objective:** Build Batch 1 (foundation + quick wins) and Batch 2 (key management), with Batch 3 (library) as a parallel track

---

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | [`BRIEF.md`](BRIEF.md) | **Start here** — what to build, constraints, phases, definition of done |
| 2 | [`architecture.md`](architecture.md) | IFD paths, manifest.json specs, component API contracts |
| 3 | [`07_first-session-brief.md`](07_first-session-brief.md) | Orientation for a new Claude Code session |
| 4 | [`08_first-session-prompt.md`](08_first-session-prompt.md) | Copy-paste prompt to start a session |

## Element Specifications (Batch 1 + 2)

| # | File | Element | Layer | Effort |
|---|------|---------|-------|--------|
| 5 | [`element-specs/01_sg-crypto-production-copy.md`](element-specs/01_sg-crypto-production-copy.md) | sg-crypto.js (production copy) | Core | Low |
| 6 | [`element-specs/02_sg-upload-dropzone.md`](element-specs/02_sg-upload-dropzone.md) | `<sg-upload-dropzone>` | Component | Low-Med |
| 7 | [`element-specs/03_file-hasher-tool.md`](element-specs/03_file-hasher-tool.md) | File Hasher tool page | Tool | Low |
| 8 | [`element-specs/04_file-encryptor-tool.md`](element-specs/04_file-encryptor-tool.md) | File Encryptor tool page | Tool | Low |
| 9 | [`element-specs/05_sg-pbkdf2.md`](element-specs/05_sg-pbkdf2.md) | sg-pbkdf2.js (key derivation) | Core | Low |
| 10 | [`element-specs/06_sg-wordlist.md`](element-specs/06_sg-wordlist.md) | sg-wordlist.js (word lists) | Core | Low |
| 11 | [`element-specs/07_sg-key-generator.md`](element-specs/07_sg-key-generator.md) | `<sg-key-generator>` | Component | Medium |
| 12 | [`element-specs/08_sg-key-input.md`](element-specs/08_sg-key-input.md) | `<sg-key-input>` | Component | Low-Med |
| 13 | [`element-specs/09_key-generator-tool.md`](element-specs/09_key-generator-tool.md) | Key Generator tool page | Tool | Low |

## Reference

| Document | Location |
|----------|----------|
| Architect plan | [`../../roles/architect/reviews/03/10/v0.13.8__plan__next-ifd-batch-for-tools-team.md`](../../../team/roles/architect/reviews/03/10/v0.13.8__plan__next-ifd-batch-for-tools-team.md) |
| Tools team briefing | SG/Send repo: `team/humans/dinis_cruz/briefs/03/10/v0.1.1__briefing__tools-team-to-sg-send-team.md` |
| UX Components brief | SG/Send repo: `team/humans/dinis_cruz/briefs/03/09/v0.13.5__dev-brief__ux-components-qa-cross-team.md` |
| Website Evolution brief | SG/Send repo: `team/humans/dinis_cruz/briefs/03/09/v0.13.5__dev-brief__website-evolution-public-content-versioning.md` |
| Library Website brief | SG/Send repo: `team/humans/dinis_cruz/briefs/03/09/v0.13.5__dev-brief__library-website.md` |
| Previous tools dev pack | [`../v0.11.12__tools-sgraph-ai/README.md`](../v0.11.12__tools-sgraph-ai/README.md) |

---

## Summary

This dev pack requests 9 new IFD elements from the Tools team across 2 batches:

- **Batch 1 (Foundation):** 3 core modules + 1 component + 2 tools → tools repo goes from 1 to 3 working tools
- **Batch 2 (Key Management):** 2 components + 1 tool → friendly keys become real

**Definition of done:** File Hasher tool working, File Encryptor tool working, Key Generator tool working at tools.sgraph.ai/key-generator/, `<sg-key-input>` ready for mobile retrieval.
