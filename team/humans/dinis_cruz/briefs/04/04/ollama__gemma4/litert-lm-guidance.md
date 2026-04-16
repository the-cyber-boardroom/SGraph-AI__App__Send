# LiteRT-LM — Google's Official On-Device LLM Framework

**Date:** 2026-04-03  
**Hardware:** MacBook Air M2, 16GB unified memory  
**Goal:** Evaluate LiteRT-LM as the Google-official alternative to the community MLX stack for running Gemma 4 locally.

---

## TL;DR

LiteRT-LM is Google's **official, production-ready** inference framework for running LLMs on edge devices. It's the real deal — it powers Chrome, Chromebook Plus, Pixel Watch, and Google AI Edge Gallery. However, for your use case (Python developer wanting an OpenAI-compatible API on localhost), **it has significant gaps today**: no built-in HTTP server, the Python SDK is brand new (released April 2, 2026), and the available Gemma 4 models are limited to E2B with a 4096-token context window.

**Bottom line:** LiteRT-LM is the right choice if you're building a mobile app or need Google's blessed deployment path. For a desktop API server workflow, the MLX stack is more practical today.

---

## 1. What Is LiteRT-LM?

| | Details |
|--|---------|
| **Owner** | Google AI Edge team (`google-ai-edge` GitHub org) |
| **License** | Apache 2.0 |
| **Repo** | [github.com/google-ai-edge/LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM) |
| **Model format** | `.litertlm` (proprietary binary, not GGUF or MLX) |
| **Languages** | Kotlin (stable), C++ (stable), Swift (in dev), **Python (in dev)** |
| **Platforms** | Android, iOS, macOS, Windows, Linux, Raspberry Pi, Web |
| **GPU support on Mac** | ✅ Yes (Metal via GPU backend) |
| **Production usage** | Chrome, Chromebook Plus, Pixel Watch, AI Edge Gallery |

LiteRT-LM is **not** a wrapper around llama.cpp or MLX. It's a separate inference engine built by Google's on-device ML team, with its own model format, quantization pipeline, and hardware acceleration stack.

---

## 2. Available Gemma 4 Models for LiteRT-LM

As of April 3, 2026, only one Gemma 4 model is listed on HuggingFace in LiteRT-LM format:

| Model | Quant | Context | Size | HuggingFace Repo |
|-------|-------|---------|------|-----------------|
| **Gemma 4 E2B** | 4-bit | 4096 | ~3 GB | `litert-community/gemma-4-E2B-it-litert-lm` |

**Notable limitations vs MLX models:**

- **Only E2B available** — no E4B, no 26B, no 31B in `.litertlm` format yet
- **4096 context window** — the MLX models expose the full 128K context
- **No E4B** — the sweet-spot model for 16GB Macs isn't available yet
- Multimodal (audio/image) support status for LiteRT-LM Gemma 4 is unclear from current docs

Older models available in `.litertlm`:

| Model | Quant | Context | Size |
|-------|-------|---------|------|
| Gemma 3 1B | 4-bit | 4096 | 557 MB |
| Gemma 3n E2B | 4-bit | 4096 | 2.9 GB |
| Gemma 3n E4B | 4-bit | 4096 | 4.2 GB |
| Phi-4-mini | 8-bit | 4096 | 3.7 GB |
| Qwen 2.5 1.5B | 8-bit | 4096 | 1.5 GB |

---

## 3. Installation on macOS

### Option A: Pre-built CLI binary (`lit`)

Fastest way to try it — no Python, no build tools.

```bash
# Download the macOS ARM64 binary
curl -L -o lit https://github.com/google-ai-edge/LiteRT-LM/releases/download/v0.9.0-alpha02/lit-macos-arm64
chmod +x lit

# You may need to approve it in System Settings > Privacy & Security

# Set HuggingFace token for model downloads
export HUGGING_FACE_HUB_TOKEN="your_token_here"

# List available models
./lit list --show_all

# Pull and run Gemma 4 E2B
./lit pull gemma4-e2b
./lit run gemma4-e2b --backend=gpu
```

### Option B: Python CLI (`litert-lm`)

```bash
# Install via uv (recommended by Google)
uv tool install litert-lm

# Or via pip
pip install litert-lm

# Run Gemma 4 E2B
litert-lm run \
  --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \
  gemma-4-E2B-it.litertlm \
  --prompt="What is the capital of France?"
```

### Option C: Python API (`litert-lm-api`)

The Python bindings for programmatic use. **Released April 2, 2026** — brand new.

```bash
pip install litert-lm-api
```

```python
import litert_lm

# Load model (CPU backend — GPU support may vary on Mac)
with litert_lm.Engine("path/to/gemma-4-E2B-it.litertlm") as engine:
    with engine.create_conversation() as conversation:
        # Simple text completion
        response = conversation.send_message("Hello, Gemma 4!")
        print(response["content"][0]["text"])

        # Streaming
        stream = conversation.send_message_async("Explain quantum computing.")
        for text_piece in stream:
            print(text_piece, end="", flush=True)
```

You need to download the `.litertlm` file first (via `lit pull` or from HuggingFace) since the Python API takes a local file path.

---

## 4. What LiteRT-LM Does NOT Have (Yet)

This is the critical part for your agentic team's use case:

| Feature | LiteRT-LM | mlx-openai-server |
|---------|-----------|-------------------|
| **HTTP server** | ❌ No built-in server | ✅ OpenAI-compatible at localhost:8000 |
| **OpenAI-compatible API** | ❌ Not available | ✅ `/v1/chat/completions` |
| **Streaming SSE** | ❌ (Python has async iter, but no HTTP) | ✅ Standard SSE |
| **Browser-accessible endpoint** | ❌ | ✅ |
| **Gemma 4 E4B** | ❌ Not yet | ✅ Available |
| **128K context** | ❌ Capped at 4096 | ✅ Full 128K |
| **Multi-model switching** | ❌ One model per Engine | ✅ Via YAML config |
| **Tool calling** | ✅ Via API | ✅ Via OpenAI format |
| **Python SDK maturity** | 🚀 In dev (day 1) | ✅ Stable |

**To use LiteRT-LM as a drop-in replacement for Ollama/OpenAI, you would need to write your own FastAPI wrapper** around the `litert-lm-api` Python bindings, translating between OpenAI message format and LiteRT-LM's conversation API. This is doable but adds maintenance burden for a SDK that's still marked "In Dev."

---

## 5. Performance on Mac

From Google's benchmarks (Gemma 3n E2B, same architecture family as Gemma 4 E2B):

| Model | Device | Backend | Prefill (tok/s) | Decode (tok/s) |
|-------|--------|---------|-----------------|----------------|
| Gemma 3n E2B | MacBook Pro M3 | CPU | 232.5 | 27.6 |
| Gemma 3n E4B | MacBook Pro M3 | CPU | 170.1 | 20.1 |
| Gemma 3 1B | MacBook Pro M3 | CPU | 422.98 | 66.89 |

No Mac GPU benchmarks are published yet. On mobile (Samsung S24), GPU gives ~7x prefill speedup but similar decode speed, so Mac Metal GPU may help with prefill but decode is typically memory-bandwidth bound regardless.

The MLX stack doesn't have directly comparable published benchmarks for Gemma 4 yet (it's 1 day old), but MLX is generally well-optimized for Apple Silicon unified memory and should be competitive.

---

## 6. Provenance and Trust

This is the key advantage of LiteRT-LM:

| Component | Owner | Trust Level |
|-----------|-------|-------------|
| LiteRT-LM framework | **Google AI Edge** | ✅ First-party Google |
| `.litertlm` model files | **Google / litert-community** | ✅ Google-published or Google-sanctioned |
| `litert-lm` PyPI package | **google-ai-edge** (verified) | ✅ First-party Google |
| `litert-lm-api` PyPI package | **google-ai-edge** (verified) | ✅ First-party Google |
| `lit` CLI binary | **Google AI Edge** (GitHub releases) | ✅ First-party Google |
| Model weights (Gemma 4) | **Google DeepMind** | ✅ First-party Google |

**The entire stack is Google-owned and Google-maintained.** No community intermediaries for model conversion, no third-party quantization, no independent server project. If supply chain provenance matters, this is the cleanest option.

---

## 7. When to Use LiteRT-LM vs MLX Stack

| Use Case | Recommendation |
|----------|---------------|
| Mobile app (Android/iOS) | **LiteRT-LM** — it's the only official path |
| Raspberry Pi / IoT | **LiteRT-LM** — designed for this |
| Desktop Python API server with OpenAI compatibility | **MLX stack** — LiteRT-LM has no server |
| Browser-based agentic app hitting localhost | **MLX stack** — needs HTTP endpoint |
| Maximum context window (128K) | **MLX stack** — LiteRT-LM models capped at 4K |
| Gemma 4 E4B or larger | **MLX stack** — not yet in `.litertlm` format |
| Audio/video multimodal input | **MLX stack** — clearer support path today |
| Google-only supply chain | **LiteRT-LM** — end-to-end Google |
| Wanting to use today, ship fast | **MLX stack** — more mature for desktop |

---

## 8. Bridging LiteRT-LM to an OpenAI-Compatible API (DIY)

If you want the Google supply chain but also need an HTTP endpoint, here's a sketch of what you'd build:

```python
# fastapi_litert_bridge.py — CONCEPTUAL, untested
from fastapi import FastAPI
from pydantic import BaseModel
import litert_lm

app = FastAPI()
engine = litert_lm.Engine("gemma-4-E2B-it.litertlm")

class ChatRequest(BaseModel):
    model: str
    messages: list[dict]
    stream: bool = False

@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    with engine.create_conversation() as convo:
        # Send each message in sequence
        for msg in req.messages:
            if msg["role"] == "user":
                response = convo.send_message(msg["content"])

        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": response["content"][0]["text"]
                }
            }]
        }
```

**This is not production-ready.** The `litert-lm-api` Python SDK is day-1 software, the conversation API may not map cleanly to OpenAI's stateless chat format, and streaming would need SSE wiring. But it shows the approach if you decide to go this route later.

---

## 9. Recommendation

**For now: use the MLX stack (mlx-openai-server) for your agentic team's desktop workflow.** It's more practical today.

**Watch LiteRT-LM for:**
- Gemma 4 E4B in `.litertlm` format (likely coming soon)
- Python SDK reaching "Stable" status
- A built-in HTTP server mode (not announced, but a natural evolution)
- Longer context windows in pre-built models

If Google adds an OpenAI-compatible server to LiteRT-LM (or if the Python SDK matures enough to wrap easily), it becomes the obvious choice for a fully Google-sourced stack.

---

## Key Sources

- [LiteRT-LM GitHub](https://github.com/google-ai-edge/LiteRT-LM)
- [litert-lm-api on PyPI](https://pypi.org/project/litert-lm-api/) (released April 2, 2026)
- [litert-lm CLI on PyPI](https://pypi.org/project/litert-lm/)
- [Google Developers Blog — Gemma 4 on edge](https://developers.googleblog.com/bring-state-of-the-art-agentic-skills-to-the-edge-with-gemma-4/)
- [litert-community Gemma 4 models on HuggingFace](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- [LiteRT-LM technical overview](https://github.com/google-ai-edge/LiteRT-LM/blob/main/docs/README.md)
