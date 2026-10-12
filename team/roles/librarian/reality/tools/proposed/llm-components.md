# Tools — Proposed: LLM Components and AI Tools

**Domain:** tools/proposed/ | **Last updated:** 2026-07-20 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Note: Some LLM component primitives already EXISTS at tools.sgraph.ai — see `tools/index.md` for
the EXISTS list (`sg-llm-events.js`, `sg-llm-request.js`, `sg-llm-infographic.js`, `sg-layout`).
The items below extend that base or are new additions.

---

## sg-llm Component Family (03/30 — Architect brief)

Proposed hosting: `tools.sgraph.ai/components/llm/`. Each component independently IFD-versioned.

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `sg-llm-connection` — provider/key/model selector UI | v0.19.11 architect brief 03/30 | PROPOSED |
| `sg-llm-reality` — reality constructor (build model's complete context visually) | v0.19.11 architect brief 03/30 | PROPOSED |
| `sg-llm-output` — streaming response display | v0.19.11 architect brief 03/30 | PROPOSED |
| `sg-llm-stats` — token counts, cost estimate, speed metrics | v0.19.11 architect brief 03/30 | PROPOSED |
| `sg-llm-debug` — full request inspector (request + response JSON, timing) | v0.19.11 architect brief 03/30 | PROPOSED |
| `sg-llm-bundle` — execution bundle manager (save/load/replay, fork tree with parent_id) | v0.19.11 architect brief 03/30 | PROPOSED (bundle pattern proven in workspace v0.1.1) |
| `sg-llm-bundle-list` — bundle browser UI (time travel through saved requests) | v0.19.11 architect brief 03/30 | PROPOSED |
| `sg-llm-attachments` — file drop, clipboard paste, image/file cache | v0.19.11 architect brief 03/30 | PROPOSED (AppSec review needed) |

---

## Agentic LLM Component Suite (Section 21 — doc 224)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `sg-tool-definition` — visual editor for JSON tool schemas with validation | Section 21 (doc 224) | PROPOSED |
| `sg-json-sender` — structured JSON construction with schema-aware input | Section 21 (doc 224) | PROPOSED |
| `sg-json-receiver` — auto-detect text/tool_call/JSON; tree viewer; diff view | Section 21 (doc 224) | PROPOSED |
| `sg-tool-runner` — tool registration API; execute on tool_call; return results | Section 21 (doc 224) | PROPOSED |
| `sg-agentic-loop` — full agentic orchestration: max iterations, cost budget, human gate | Section 21 (doc 224) | PROPOSED |
| `sg-sandbox` (JS) — sandboxed iframe + Web Worker; timeout; memory limits | Section 21 (doc 224) | PROPOSED |

---

## One-Shot LLM Development Environment (03/29 — dev brief)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Visual IDE: context editor (left), code editor (centre), live preview iframe (right), LLM panel (bottom) | v0.19.7 dev brief 03/29 | PROPOSED |
| Context blocks: project background / component library / current code / memory / task | v0.19.7 dev brief 03/29 | PROPOSED |
| Build mode: assemble full context + task → one-shot to LLM → code output | v0.19.7 dev brief 03/29 | PROPOSED |
| Update Memory mode: LLM prunes/consolidates memory between iterations | v0.19.7 dev brief 03/29 | PROPOSED |
| Token count per context block visible | v0.19.7 dev brief 03/29 | PROPOSED |
| Live preview loads external scripts (tools.sgraph.ai components) | v0.19.7 dev brief 03/29 | PROPOSED |

---

## Composite Tools and Composite UIs (Section 20)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Document-Driven Analysis — drop document → summary + infographic + briefing in one click | Section 20 | PROPOSED |
| Patch Review Component (`sg-patch-review`) — visual diff viewer, agent manifests, approval status tracking | Section 20 | PROPOSED |
| Multi-Agent Chat UI — agent picker sidebar, multi-ask mode, debate mode, consolidator agent | Section 20 | PROPOSED |
| Model Chooser Web Component — standalone model selector with categories, cost, history | Section 20 | PROPOSED |
| Attachment Manager Web Component — standalone drag-drop, clipboard paste, preview component | Section 20 | PROPOSED |
| sg-git-graph Web Component — interactive vault/git commit graph with zoom, pan, time slider | Section 20 | PROPOSED |

---

## Infographic Generator v0.1.1 (Section 20 — doc 213)

Extends the existing Infographic Generator (which EXISTS at `dev.tools.sgraph.ai`).

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Simple / document / multi-doc / template / advanced input modes (five modes) | Section 20 (doc 213) | PROPOSED |
| 5+ pre-built templates: executive summary, tech architecture, timeline, comparison, process flow | Section 20 (doc 213) | PROPOSED |
| Model comparison side-by-side (same prompt to multiple models simultaneously) | Section 20 (doc 213) | PROPOSED |
| Gallery + "Remix this" on website (example infographics gallery with one-click remix) | Section 20 (doc 213) | PROPOSED |

---

## Infographic Tool v2 — Pre-Auth Payment Integration (05/14 brief — doc 390)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Infographic tool v2 — pre-auth payment integration | doc 390 | PROPOSED |
| Cost-visible submit UI with Stripe pre-auth hold; replaces bring-your-own-key model | doc 390 | PROPOSED |
| Session asset tray — thumbnail history of generated infographics per session; iteration history; prompt recall | doc 390 | PROPOSED |
| Curated model picker (3 tiers): fast/cheap, balanced, high-quality — hides raw model IDs | doc 390 | PROPOSED |
| Visible/editable system prompt with presets (saveable as named presets) | doc 390 | PROPOSED |
| Variant grid — 2–3 simultaneous generations per submit for easy comparison | doc 390 | PROPOSED |

---

## News Report Tool (Section 24 — docs 252–263)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| News Report Tool — Sonar API integration for automated news report generation | Section 24 (docs 252–263) | PROPOSED |
| Search, fetch, and structure news stories as structured reports | Section 24 (docs 252–263) | PROPOSED |
| Vault output: news report as vault page with provenance links | Section 24 (docs 252–263) | PROPOSED |
