# Tools — Reality Index

**Domain:** tools/ | **Last updated:** 2026-07-29 | **Maintained by:** Librarian (daily run)

This domain covers browser-based AI tools hosted at `tools.sgraph.ai` and `dev.tools.sgraph.ai`. These are standalone Web Component tools that operate client-side, with no SG/Send account required for most features. They share the same zero-dependency IFD methodology as the main Send UI.

---

## EXISTS (Code-Verified)

### Video Recorder v0.1.48

- **Host:** `dev.tools.sgraph.ai`
- **Status:** Shipped and operational
- Web-based video recording tool. Captures screen/camera/audio in-browser.
- QA verified: Playwright headless Chromium confirmed working with `dev.tools.sgraph.ai` (03/23 debrief).

### YouTube Editor v0.1.0

- **Host:** `dev.tools.sgraph.ai`
- **Status:** Shipped

### Video Tools (FFmpeg WASM)

- **Host:** `dev.tools.sgraph.ai`
- **Status:** Shipped — FFmpeg WebAssembly for in-browser video processing (trim, cut, export)

### Infographic Generator (current version)

- **Host:** `dev.tools.sgraph.ai`
- **Status:** Shipped
- LLM-driven SVG infographic generation. Uses OpenRouter API (user-supplied key, stored in localStorage). Supports OpenRouter, Ollama, Gemini, Claude Haiku, Qwen, Llama, DeepSeek models. Live SVG rendering via streaming. Save-to-vault integration (vault generate panel in `vault-generate.js`).
- Code-verified: `sgraph_ai_app_send__ui__user/_common/js/components/vault-generate/vault-generate.js` (commit `b0bf54ea`)

### LLM Component Library (EXISTS at tools.sgraph.ai)

These components exist and are loaded by other tools:

| Component | What It Does |
|-----------|-------------|
| `sg-llm-events.js` | Shared event constants |
| `sg-llm-request.js` | Headless fetch engine, streaming chunk events |
| `sg-llm-infographic.js` | SVG extraction and rendering from LLM output |
| `sg-layout` | Five-zone CSS Grid layout shell (used by Workspace UI) |

### SSH KeyGen Tool

- **Host:** `send.sgraph.ai/tools/ssh-keygen/`
- **Status:** Exists — browser-based SSH key generation
- Note: still loads Google Fonts (known violation, unfixed)

### sg-site-header Web Component v1.0.6

- Self-configuring site header with `SITE_CONFIGS` for Send/Tools navigation, environment-aware cross-site URLs (`dev.` / `main.` / prod prefix), active link auto-detection.
- Code-verified: `sgraph_ai__website/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/` (commit `4ab1bbb`)

### SgPrint Utility

- **Path:** `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.1/_common/js/sg-print.js`
- Zero-dependency print-to-PDF component. `SgPrint.printHtml(html, filename)` and `SgPrint.printMarkdown(md, filename)`. A4 preview, SG/Send header/footer in print. Code-verified: commit `9fd17d9`.

---

## PROPOSED (Not Yet Implemented)

- Infographic Generator v0.1.1 — simple/document/multi-doc/template/advanced modes, 5+ templates, model comparison, gallery on website (Section 20, doc 213)
- Video Editor Expansion — multiple tracks, captions, masking, keyframes, undo/redo, LLM integration (Section 18, doc 03/29)
- `sg-local-storage` Web Component — IndexedDB persistence, capacity management (doc 03/29)
- News Report Tool — Sonar API integration (doc 252-263 batch)
- Audio Capture Tool (doc 235-251 batch)
- Video Playback Component (doc 235-251 batch)
- Video Generation tool (doc 235-251 batch)
- sg-tree Generic Tree-View Web Component (Section 18, architect brief 03/29)
- sg-git-graph Web Component — interactive vault/git commit graph viewer (Section 20, doc 210)
- Fractal IFD per-tool versioning (`tools/{tool-name}/v0/...` paths) with `site.json` navigation (Section 22, Tools team arch brief)
- One-Shot LLM Development Environment — visual IDE with context/code/preview/LLM zones (Section 19, doc 03/29)
- sg-llm component family — full suite: `sg-llm-connection`, `sg-llm-reality`, `sg-llm-output`, `sg-llm-stats`, `sg-llm-debug`, `sg-llm-bundle`, `sg-llm-bundle-list`, `sg-llm-attachments` (Section 19, architect brief 03/30)
- Agentic LLM component suite — `sg-tool-definition`, `sg-json-sender`, `sg-json-receiver`, `sg-tool-runner`, `sg-agentic-loop`, `sg-sandbox` (JS + Python) (Section 21, doc 224)
- Document-Driven Analysis component — drop document → summary + infographic + briefing (Section 20, doc 215)
- Patch Review Component `sg-patch-review` — visual diff viewer, agent manifests, status tracking (Section 20, doc 212)
- Multi-Agent Chat UI — agent picker, multi-ask, debate mode, consolidator (Section 20, doc 209)
- Model Chooser and Attachment Manager as standalone Web Components (Section 20, doc 208)
- `sg-wasm` — shared WASM lifecycle component for Whisper/FFmpeg/Pyodide (Section 19, doc 03/29)
- `sg-audio-transcription` — Whisper WASM two-pass transcription with timestamps (Section 19)
- Video crop/overlay/capture tools (Section 30, doc 299-311 batch)
- `sg-public-viewer` Web Component (Section 17, website strategy)

### Browser Automation Containers (07/24 briefs — doc 863)

**PROPOSED — productisation not yet launched.** The underlying containers already exist and are in daily operational use (verified: six route families, 24 step verbs, Prometheus metrics, stateful sessions, empty JS eval allowlist). What is PROPOSED is the commercial packaging and public launch.

| # | Item | Status |
|---|------|--------|
| P-BROW-001 | **Browser automation product launch** — three tiers (simple screenshot/HTML; headless Playwright+proxy+API; VNC full watchable browser); public pricing and documentation | PROPOSED — does not exist yet |
| P-BROW-002 | **Dedicated instance billing shape** — dedicated EC2 with provisioning/teardown API; AMI-in-customer-account deployment; neither is currently a purchasable product | PROPOSED — does not exist yet |
| P-BROW-003 | **Proxy output as provenance artefact** — signed JSON records of proxied requests feeding the mapping-error loop; proxy exists but this evidence-feed capability does not | PROPOSED — does not exist yet |
| P-BROW-004 | **Request-forgery and retention model** — security specification for shared browser endpoints; how abuse is prevented and what is retained | PROPOSED — does not exist yet |
| P-BROW-005 | **One-product vs three-products packaging decision** — open; Architect assessment recommends Tier 2 as standalone, Tier 1 as loss-leader, Tier 3 as add-on | PROPOSED — decision not yet taken |
| P-BROW-006 | **JavaScript eval allowlist policy documentation** — mechanism for customers to safely extend the empty default allowlist; prerequisite for enterprise launch | PROPOSED — does not exist yet |
| P-BROW-007 | **Browser automation pricing and market positioning** — competitor price comparison cited; on-demand, dedicated, and AMI price points not yet set | PROPOSED — does not exist yet |

### Voice Note Transcription Tool (07/27 briefs — docs 865-867)

**PROPOSED — does not exist yet.** First SGraph consumer product going to market; architecture, commercial model, and contract draft all in the 27 July batch.

| # | Item | Status |
|---|------|--------|
| P-VOICE-001 | **Voice note transcription tool — web app** — browser-based: drop in Opus/AAC audio, single pass returns transcript + analysis + debrief + optional infographic; zero-dependency IFD methodology, static hosting (GitHub Pages + S3 + CloudFront) | PROPOSED — does not exist yet |
| P-VOICE-002 | **iOS + Android apps** — same codebase published to mobile from a single shared repo; signing keys already exist from prior SGraph work; Chrome extension deferred | PROPOSED — does not exist yet |
| P-VOICE-003 | **OpenRouter billing integration** — per-user provisioned keys with spend caps (75% of net receipts after Stripe fee); markup is the key's credit limit, not a billing system; management key provisions inference keys via OpenRouter API | PROPOSED — does not exist yet |
| P-VOICE-004 | **Three privacy modes** — Routed (default, any OpenRouter provider), Restricted (named providers only), Browser-local (on-device, nothing leaves; depends on `sg-audio-transcription` / `sg-wasm` which are also PROPOSED) | PROPOSED — does not exist yet |
| P-VOICE-005 | **Auth: Google social login + local storage** — Google OAuth (previously implemented in SGraph) or localStorage (key + session, no backend required) | PROPOSED — does not exist yet |
| P-VOICE-006 | **Key-provisioning Lambda** — single Lambda issues per-user OpenRouter keys after Stripe payment; deferred past beta (beta users get hardcoded capped key) | PROPOSED — does not exist yet (deferred) |
| P-VOICE-007 | **Commercial partnership structure** — 90-day term from 1 Aug 2026; 50/50 profit split (not revenue); draft contract exists, 11 open points to settle before signing; minimum credit purchase £5 (set by Stripe fixed fee floor) | PROPOSED — contract draft only, not signed |

*Note: the underlying `sg-llm-infographic` component (EXISTS) can be reused for the optional infographic output. The browser-local mode (P-VOICE-004) is blocked on `sg-audio-transcription` / `sg-wasm` which are separately PROPOSED.*

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
