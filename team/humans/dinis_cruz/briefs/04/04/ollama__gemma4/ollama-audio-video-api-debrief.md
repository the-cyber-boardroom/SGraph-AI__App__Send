# Ollama Audio/Video API Support — Research Debrief

**Date:** 2026-04-03  
**Context:** Investigating how to handle audio/video input in `_buildOllamaBody` for models that natively support multimodal input (Gemma 3n, MiniCPM-o 2.6, Qwen2-Audio, etc.)

---

## TL;DR

**Ollama has no audio or video input mechanism today — across any of its API surfaces.** Models with audio/video capabilities exist in the Ollama library, but the API has no way to deliver audio bytes to the inference engine. The `images` array is the only binary data path.

---

## Findings

### 1. Native API (`/api/chat`)

The `Message` struct in `api/types.go` supports:

- `role` (string)
- `content` (string — not a content-parts array)
- `images` ([]ImageData — base64 blobs)
- `tool_calls`
- `thinking`

There is **no `audio` field, no `video` field**, and `content` does not accept an array of typed parts. Sending a content array causes an unmarshalling error (`cannot unmarshal array into Go struct field ChatRequest.messages.content of type string`).

### 2. OpenAI Compatibility Layer (`/v1/chat/completions`)

The [official docs](https://docs.ollama.com/api/openai-compatibility) explicitly list supported content types in `messages`:

- Text `content`
- Image `content` (base64 or image URL)
- Array of `content` parts (text + image only)

**No `input_audio` content part type is supported.** This layer is a translation shim to the native `ChatRequest` struct, so it inherits the same limitation.

### 3. Anthropic Compatibility Layer

Also available but similarly constrained — no audio content blocks documented.

### 4. Model-Side Acknowledgements

- **MiniCPM-o 2.6** — The ollama.com model page explicitly states: *"Limited by the current ollama structure, MiniCPM-o 2.6 currently only uses image multimodal capabilities, and we will actively update the PR to ollama officials for omni capabilities."*
- **Gemma 3n** — Supports audio/video natively in the model weights, but Ollama's GGUF integration currently only exposes text (and image for some variants). Simon Willison confirmed audio input doesn't work via Ollama; mlx-vlm is needed as an alternative runtime.

### 5. Upstream Feature Request

- **Issue [ollama/ollama#11798](https://github.com/ollama/ollama/issues/11798)** — Proposes adding `Audio []AudioData` as a top-level field mirroring the `images` pattern. Still open/unmerged as of this writing.
- **Issue [ollama/ollama#11021](https://github.com/ollama/ollama/issues/11021)** — Proposes TTS/audio output support via a `/v1/audio/speech` endpoint. Also open.

---

## Recommendation for `_buildOllamaBody`

| Option | Approach | Trade-off |
|--------|----------|-----------|
| **A) Skip for now** | Don't implement audio/video for Ollama. Return a clear error if audio content is present. | Honest, minimal maintenance burden. |
| **B) Pre-process externally** | Transcribe audio (e.g. Whisper) before sending text to Ollama. | Works today, but loses non-speech audio semantics (music, environmental sound, tone). |
| **C) Stub for future `audio` field** | Add a code path gated behind a feature flag that sends `audio: [base64...]` once #11798 merges. | Ready to flip on when upstream lands, but dead code until then. |

**Recommended: Option A**, with a TODO/comment referencing #11798 so it's easy to revisit. The upstream proposal follows the `images` pattern, so the implementation will be straightforward when it ships.

---

## Key Sources

- [Ollama `/api/chat` docs](https://docs.ollama.com/api/chat)
- [Ollama OpenAI compatibility docs](https://docs.ollama.com/api/openai-compatibility)
- [ollama/ollama#11798 — Audio input feature request](https://github.com/ollama/ollama/issues/11798)
- [ollama/ollama#11021 — TTS/audio output feature request](https://github.com/ollama/ollama/issues/11021)
- [MiniCPM-o 2.6 model page](https://ollama.com/openbmb/minicpm-o2.6:8b)
- [Simon Willison — Gemma 3n audio testing](https://simonwillison.net/tags/audio/)
