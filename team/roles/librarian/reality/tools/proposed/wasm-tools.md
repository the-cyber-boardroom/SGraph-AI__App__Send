# Tools — Proposed: WASM Tools

**Domain:** tools/proposed/ | **Last updated:** 2026-07-20 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Note: FFmpeg WASM for video processing EXISTS at `dev.tools.sgraph.ai` (code-verified). The items
below extend that existing capability or add new WASM-powered tools.

---

## sg-wasm Shared WASM Lifecycle Component (03/29 — dev brief)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `sg-wasm` — shared WASM lifecycle component (download, IndexedDB cache, hash validation, offline) | v0.19.7 dev brief 03/29 | PROPOSED |
| Progress reporting API (download bytes, initialisation %, ready event) | v0.19.7 dev brief 03/29 | PROPOSED |
| Shared by all WASM tools: FFmpeg, Whisper/Pyodide (one caching layer for all) | v0.19.7 dev brief 03/29 | PROPOSED |

---

## sg-audio-transcription — Whisper WASM (03/29 — dev brief)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `sg-audio-transcription` — Whisper WASM two-pass transcription | v0.19.7 dev brief 03/29 | PROPOSED — research spike needed |
| Pass 1: real-time transcription (low-latency, rough output) | v0.19.7 dev brief 03/29 | PROPOSED |
| Pass 2: clean-up and formatting (runs after capture completes) | v0.19.7 dev brief 03/29 | PROPOSED |
| Timestamps in transcription output (clickable to jump in audio) | v0.19.7 dev brief 03/29 | PROPOSED |
| SRT/VTT subtitle export from transcription | v0.19.7 dev brief 03/29 | PROPOSED |
| Speaker diarisation in clean-up pass | v0.19.7 dev brief 03/29 | PROPOSED (model-dependent) |

---

## sg-sandbox (Pyodide WASM) — Agentic Python Sandbox (Section 21)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `sg-sandbox` (Python variant) — Pyodide WASM in Web Worker | Section 21 (doc 224) | PROPOSED |
| Same security model as JS sandbox: sandboxed iframe + Web Worker, timeout, memory limits | Section 21 (doc 224) | PROPOSED |
| Used to run agentic tool-call results safely in browser | Section 21 (doc 224) | PROPOSED |

---

## sg-public-viewer Web Component (Section 17)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `sg-public-viewer` — Web Component for public vault content viewing | Section 17 | PROPOSED |
| Displays vault files without write access (read-only, embed-friendly) | Section 17 | PROPOSED |
