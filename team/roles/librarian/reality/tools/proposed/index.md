# Tools — Proposed Items Index

**Domain:** tools/proposed/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## Video Editing

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Video Editor Expansion | Multiple tracks, captions, masking, keyframes, non-destructive JSON transform model, undo/redo | Section 18 |
| `sg-local-storage` Web Component | IndexedDB persistence, capacity management, viewer; reusable across tools | Section 18 |
| Video crop/overlay/capture tools | Three tools for video editing workflows | Section 30 |
| Video Playback Component | Playback component for recorded/uploaded video | Section 23 |
| Video Generation | AI-assisted video generation tool | Section 23 |

## Infographic Generator v0.1.1

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Simple/document/multi-doc/template/advanced modes | Five distinct input modes for the infographic tool | Section 20 |
| 5+ pre-built templates | Executive summary, tech architecture, timeline, comparison, process flow | Section 20 |
| Model comparison side-by-side | Same prompt to multiple models simultaneously | Section 20 |
| Gallery + "Remix this" on website | Example infographics gallery with one-click remix | Section 20 |

## LLM Component Family (sg-llm)

| Component | One-Line Description | Monolith Section |
|-----------|---------------------|-----------------|
| `sg-llm-connection` | Provider/key/model selector UI | Section 19 |
| `sg-llm-reality` | Reality constructor — build model's complete context visually | Section 19 |
| `sg-llm-output` | Streaming response display component | Section 19 |
| `sg-llm-stats` | Token counts, cost estimate, speed metrics | Section 19 |
| `sg-llm-debug` | Full request inspector (request + response JSON, timing) | Section 19 |
| `sg-llm-bundle` | Execution bundle manager (save/load/replay, fork tree) | Section 19 |
| `sg-llm-bundle-list` | Bundle browser UI (time travel through saved requests) | Section 19 |
| `sg-llm-attachments` | File drop, clipboard paste, image/file cache | Section 19 |

## Agentic LLM Component Suite

| Component | One-Line Description | Monolith Section |
|-----------|---------------------|-----------------|
| `sg-tool-definition` | Visual editor for JSON tool schemas with validation | Section 21 |
| `sg-json-sender` | Structured JSON construction with schema-aware input | Section 21 |
| `sg-json-receiver` | Auto-detect text/tool_call/JSON; tree viewer; diff view | Section 21 |
| `sg-tool-runner` | Tool registration API; execute on tool_call; return results | Section 21 |
| `sg-agentic-loop` | Full agentic orchestration with max iterations, cost budget, human gate | Section 21 |
| `sg-sandbox` (JS) | Sandboxed iframe + Web Worker; timeout; memory limits | Section 21 |
| `sg-sandbox` (Python) | Pyodide WASM in Web Worker; same security as JS sandbox | Section 21 |

## Composite Tools

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Document-Driven Analysis | Drop document → summary + infographic + briefing in one click | Section 20 |
| Patch Review Component (`sg-patch-review`) | Visual diff viewer, agent manifests, approval status tracking | Section 20 |
| Multi-Agent Chat UI | Agent picker sidebar, multi-ask mode, debate mode, consolidator agent | Section 20 |
| Model Chooser Web Component | Standalone model selector with categories, cost, history | Section 20 |
| Attachment Manager Web Component | Standalone drag-drop, clipboard paste, preview component | Section 20 |
| sg-git-graph Web Component | Interactive vault/git commit graph with zoom, pan, time slider | Section 20 |
| One-Shot LLM Development Environment | Visual IDE with context/code/preview/LLM zones | Section 19 |

## Infrastructure / IFD

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Per-tool IFD chains (`tools/{tool-name}/v0/...`) | Replace monolithic tools path with per-tool IFD versioning | Section 22 |
| `site.json` navigation registry | Site entity with navigation sections, grouping, dependency graph | Section 22 |
| DAG dependency verification script | Validate no circular load-time imports across entity manifests | Section 22 |
| Fractal IFD generalised to send.sgraph.ai | Send as site entity with own `site.json` | Section 22 |

## WASM Tools

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| `sg-wasm` shared component | WASM lifecycle: download, IndexedDB cache, hash validation, offline | Section 19 |
| `sg-audio-transcription` | Whisper WASM two-pass transcription with timestamps, SRT/VTT export | Section 19 |
| Audio tool (capture) | Browser-based audio capture tool | Section 23 |
| `sg-public-viewer` | Web Component for public vault content viewing | Section 17 |
| News Report Tool | Sonar API integration for automated news report generation | Section 24 |

---

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 17–32)*
