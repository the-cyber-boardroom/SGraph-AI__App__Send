# Gemma 4 Local Setup Guide — mlx-openai-server on MacBook Air M2

**Date:** 2026-04-03  
**Hardware:** MacBook Air M2, 16GB unified memory  
**Goal:** Run Gemma 4 models 100% offline with an OpenAI-compatible API on localhost, and integrate with an existing agentic team that currently talks to Ollama and OpenAI.

---

## TL;DR

```bash
# 1. Create venv and install everything
python3.11 -m venv ~/gemma4-env
source ~/gemma4-env/bin/activate
pip install mlx-openai-server open-webui huggingface_hub hf_transfer

# 2. Pre-download models for offline use
huggingface-cli download mlx-community/gemma-4-E4B-it-4bit
huggingface-cli download unsloth/gemma-4-E4B-it-UD-MLX-4bit
huggingface-cli download unsloth/gemma-4-E2B-it-UD-MLX-4bit

# 3. Go offline, then serve
export HF_HUB_OFFLINE=1
mlx-openai-server launch \
  --model-path mlx-community/gemma-4-E4B-it-4bit \
  --model-type multimodal

# 4. Use it — same as OpenAI
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "mlx-community/gemma-4-E4B-it-4bit",
       "messages": [{"role": "user", "content": "Hello Gemma 4!"}]}'

# 5. (Optional) Browser chat UI — in a second terminal
source ~/gemma4-env/bin/activate
open-webui serve --port 3000
# Open http://localhost:3000 → Settings → Connections → add http://localhost:8000/v1
```

---

## 1. Which Models Fit on 16GB?

With 16GB unified memory, the OS and background processes take ~3–4GB, leaving ~12GB for the model + context window KV cache.

| Model | Quant | Download Size | Runtime Memory | Audio/Video | Verdict |
|-------|-------|--------------|----------------|-------------|---------|
| **E2B** (Unsloth dynamic 4-bit) | UD-4bit | ~1.5 GB | ~3 GB | ✅ audio, video | ✅ Best for speed |
| **E4B** (mlx-community 4-bit) | Q4 | ~3 GB | ~5 GB | ✅ audio, video | ✅ **Sweet spot** |
| **E4B** (Unsloth dynamic 4-bit) | UD-4bit | ~3 GB | ~5 GB | ✅ audio, video | ✅ Better quality |
| **E4B** (8-bit) | Q8 | ~8 GB | ~10 GB | ✅ audio, video | ⚠️ Tight, short ctx |
| **26B-A4B** (4-bit) | Q4 | ~16 GB | ~18 GB | ❌ text+image only | ❌ Won't fit |
| **31B** | any | 20+ GB | 22+ GB | ❌ text+image only | ❌ Won't fit |

**Recommendation:** Download all E2B and E4B variants. Use **E4B 4-bit** as your daily driver and **E2B** for faster iteration or when you need more context headroom.

**Audio/video is E2B and E4B only.** The larger 26B and 31B models don't support audio even if you could fit them. Audio max: 30s. Video max: 60s (as frame sequences).

---

## 2. Set Up Your Environment

### Prerequisites

- macOS on Apple Silicon (M1/M2/M3/M4)
- Python 3.11+ installed (`python3.11 --version` to check; install via `brew install python@3.11` if needed)
- A HuggingFace account + access token (for initial model downloads)

### Create a dedicated virtual environment

Everything — the server, the chat UI, the download tools — lives in one venv:

```bash
# Create venv (Python 3.11+ required for MLX)
python3.11 -m venv ~/gemma4-env

# Activate it
source ~/gemma4-env/bin/activate

# Install everything
pip install mlx-openai-server open-webui huggingface_hub hf_transfer
```

Or with uv (faster):

```bash
uv venv ~/gemma4-env --python 3.11
source ~/gemma4-env/bin/activate
uv pip install mlx-openai-server open-webui huggingface_hub hf_transfer
```

> **Tip:** Using a named path like `~/gemma4-env` (instead of `.venv` in a project dir) makes it easy to activate from anywhere. Add this to your `~/.zshrc`:
> ```bash
> alias gemma4='source ~/gemma4-env/bin/activate'
> ```

### Verify the install

```bash
which mlx-openai-server   # should point to ~/gemma4-env/bin/
which open-webui           # same
which huggingface-cli      # same
```

---

## 3. Pre-Download All Models for 100% Offline Use

Make sure your venv is active (`source ~/gemma4-env/bin/activate`) before running these commands.

### Download every Gemma 4 model that fits on 16GB

```bash
export HF_HUB_ENABLE_HF_TRANSFER=1   # faster downloads

# E2B — smallest, fastest, still supports audio+image+video
huggingface-cli download unsloth/gemma-4-E2B-it-UD-MLX-4bit

# E4B — best quality that fits comfortably (3 variants for flexibility)
huggingface-cli download mlx-community/gemma-4-E4B-it-4bit
huggingface-cli download unsloth/gemma-4-E4B-it-UD-MLX-4bit
huggingface-cli download unsloth/gemma-4-E4B-it-UD-MLX-8bit   # ~8GB, tight but works
```

Models cache to `~/.cache/huggingface/hub/`. Total download: ~16GB for all four variants.

### Verify they're cached

```bash
huggingface-cli cache ls | grep gemma-4
```

### Go offline

```bash
export HF_HUB_OFFLINE=1
```

With this env var set, all HuggingFace libraries (including mlx-lm, mlx-vlm, and mlx-openai-server) will refuse to make network calls and only load from the local cache. You can add it to your `.zshrc` for a permanent airgap.

---

## 4. Launch mlx-openai-server

Make sure your venv is active (`source ~/gemma4-env/bin/activate`).

### Single model

```bash
mlx-openai-server launch \
  --model-path unsloth/gemma-4-E4B-it-UD-MLX-4bit \
  --model-type multimodal
```

Server starts at `http://localhost:8000`. API lives at `http://localhost:8000/v1`.

### Multi-model (via YAML config)

Create `models.yaml`:

```yaml
models:
  - model_path: unsloth/gemma-4-E4B-it-UD-MLX-4bit
    model_type: multimodal
    model_id: gemma-4-e4b

  - model_path: unsloth/gemma-4-E2B-it-UD-MLX-4bit
    model_type: multimodal
    model_id: gemma-4-e2b
```

```bash
mlx-openai-server launch --config models.yaml
```

Requests are routed by the `model` field in the request body.

### Verify

```bash
# List models
curl http://localhost:8000/v1/models

# Test chat completion
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "unsloth/gemma-4-E4B-it-UD-MLX-4bit",
    "messages": [{"role": "user", "content": "What is 2+2? Think step by step."}],
    "stream": false
  }'
```

---

## 5. Browser Chat UI (Open WebUI)

mlx-openai-server is API-only — no built-in chat interface. **Open WebUI** is the recommended frontend: it's the most popular self-hosted chat UI, works with any OpenAI-compatible backend, and supports image uploads, conversation history, model switching, markdown rendering, and more.

### Start both services

You need two terminal tabs/windows (both with the venv activated):

**Terminal 1 — API server:**

```bash
source ~/gemma4-env/bin/activate
export HF_HUB_OFFLINE=1   # if working offline

mlx-openai-server launch \
  --model-path unsloth/gemma-4-E4B-it-UD-MLX-4bit \
  --model-type multimodal
```

**Terminal 2 — Chat UI:**

```bash
source ~/gemma4-env/bin/activate
open-webui serve --port 3000
```

### First-time setup

1. Open **http://localhost:3000** in your browser
2. Create a local admin account (this is stored locally, not sent anywhere)
3. Go to **Settings → Connections** (or **Admin Panel → Settings → Connections**)
4. Under **OpenAI API**, add a new connection:
   - **URL:** `http://localhost:8000/v1`
   - **API Key:** `not-needed` (any non-empty string)
5. Click the verify/check button — it should discover your Gemma 4 model
6. Go back to the chat, select the model from the dropdown, and start chatting

### What you get

- Full chat UI at `http://localhost:3000` with conversation history
- Image upload (drag & drop or paste) for vision tasks
- Model selector dropdown (if running multi-model config)
- Markdown rendering, code syntax highlighting
- Conversation export/import
- System prompt customization per chat
- Works 100% offline once both services are running

### Convenience script

Create `~/start-gemma4.sh` to launch everything in one go:

```bash
#!/bin/bash
source ~/gemma4-env/bin/activate
export HF_HUB_OFFLINE=1

# Start API server in background
mlx-openai-server launch \
  --model-path unsloth/gemma-4-E4B-it-UD-MLX-4bit \
  --model-type multimodal &
MLX_PID=$!

# Wait for server to be ready
echo "Waiting for mlx-openai-server to start..."
until curl -s http://localhost:8000/v1/models > /dev/null 2>&1; do
  sleep 1
done
echo "API server ready."

# Start Open WebUI
open-webui serve --port 3000 &
WEBUI_PID=$!

echo "Open http://localhost:3000 in your browser"
echo "Press Ctrl+C to stop both services"

trap "kill $MLX_PID $WEBUI_PID 2>/dev/null" EXIT
wait
```

```bash
chmod +x ~/start-gemma4.sh
~/start-gemma4.sh
```

### Alternative browser UIs

If Open WebUI doesn't suit your needs:

| UI | Install | Notes |
|----|---------|-------|
| **MLX-GUI** ([mlxgui.com](https://mlxgui.com)) | Native macOS app download | Bundles its own server + UI. No Python needed. System tray. |
| **MLX Studio** ([mlx.studio](https://mlx.studio)) | Native macOS app download | Most feature-rich: chat, agentic coding, image gen, model converter. Has its own engine (vMLX). |
| **mlx-manager** | `pip install mlx-manager && mlx-manager serve` | Web UI + menubar app + multi-model + monitoring. OpenAI + Anthropic APIs. |
| **llama.cpp** | Build from source | `llama-server` has a built-in chat web UI at the server root URL. |

---

## 6. API Reference — What Your Team Needs to Know

### Endpoint mapping

| Feature | Ollama (native) | OpenAI | mlx-openai-server |
|---------|-----------------|--------|-------------------|
| Chat completions | `POST /api/chat` | `POST /v1/chat/completions` | `POST /v1/chat/completions` ✅ |
| Streaming | `"stream": true` | `"stream": true` | `"stream": true` ✅ |
| List models | `GET /api/tags` | `GET /v1/models` | `GET /v1/models` ✅ |
| Image input | `"images": [base64]` on message | `"image_url"` content part | `"image_url"` content part ✅ |
| Audio input | ❌ Not supported | `"input_audio"` content part | Via multimodal model type ✅ |
| Tool calling | `"tools": [...]` | `"tools": [...]` | `"tools": [...]` ✅ |
| System messages | `"role": "system"` | `"role": "system"` | `"role": "system"` ✅ |

**Key insight: mlx-openai-server speaks the OpenAI protocol.** If your agentic team already has an OpenAI integration, that's the path to use — not the Ollama path.

### Text request (identical to OpenAI)

```javascript
// From a browser-based app
const response = await fetch("http://localhost:8000/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "unsloth/gemma-4-E4B-it-UD-MLX-4bit",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Explain quantum computing simply." }
    ],
    stream: true  // SSE streaming works
  })
});
```

### Image request (OpenAI format)

```javascript
{
  "model": "unsloth/gemma-4-E4B-it-UD-MLX-4bit",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "What's in this image?" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
    ]
  }]
}
```

### Audio request (OpenAI multimodal format)

```javascript
{
  "model": "unsloth/gemma-4-E4B-it-UD-MLX-4bit",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Transcribe this audio." },
      { "type": "audio_url", "audio_url": { "url": "data:audio/wav;base64,..." } }
    ]
  }]
}
```

> **Note:** Audio support through the HTTP API depends on the server correctly routing to mlx-vlm's audio processing. Gemma 4 E2B/E4B natively handle audio at the model level. If mlx-openai-server doesn't yet handle `audio_url` content parts, the fallback is to use `mlx_vlm.server` directly (see Appendix A).

---

## 7. Integration Guide for Your Agentic Team

Your team has two existing integration paths: Ollama (`/api/chat`) and OpenAI (`/v1/chat/completions`). Here's how to wire in mlx-openai-server.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser-based Agentic App                               │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────────────────┐   │
│  │ Ollama provider  │  │ OpenAI provider              │   │
│  │ POST /api/chat   │  │ POST /v1/chat/completions    │   │
│  │ localhost:11434   │  │ api.openai.com               │   │
│  └────────┬─────────┘  └──────────────┬───────────────┘   │
│           │                           │                   │
│           │     NEW: add MLX provider │                   │
│           │     ┌─────────────────────┤                   │
│           │     │                     │                   │
│           ▼     ▼                     ▼                   │
│  ┌─────────┐  ┌───────────────┐  ┌──────────┐            │
│  │ Ollama   │  │mlx-openai-svr │  │ OpenAI   │            │
│  │ :11434   │  │ :8000         │  │ cloud    │            │
│  └─────────┘  └───────────────┘  └──────────┘            │
└──────────────────────────────────────────────────────────┘
```

### Option A: Reuse the OpenAI provider (minimal change)

Since mlx-openai-server speaks the same protocol as OpenAI, you can likely just change the base URL and model name:

```javascript
// Before (cloud OpenAI)
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";

// After (local Gemma 4 via mlx-openai-server)
const OPENAI_BASE = "http://localhost:8000/v1";
const OPENAI_MODEL = "unsloth/gemma-4-E4B-it-UD-MLX-4bit";

// The rest of the code stays the same — same request format, same response format
```

If your OpenAI provider is well-abstracted, this should be a config change, not a code change.

### Option B: Add a new MLX provider (cleaner separation)

If you want to keep all three backends selectable:

```javascript
const PROVIDERS = {
  ollama: {
    baseUrl: "http://localhost:11434",
    chatEndpoint: "/api/chat",
    format: "ollama",          // uses { "model", "messages": [{ "role", "content", "images" }] }
    models: ["gemma3:12b", "llama3.2"]
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    chatEndpoint: "/chat/completions",
    format: "openai",          // uses { "model", "messages": [{ "role", "content": [...parts] }] }
    apiKey: process.env.OPENAI_API_KEY,
    models: ["gpt-4o", "gpt-4o-mini"]
  },
  mlx: {
    baseUrl: "http://localhost:8000/v1",
    chatEndpoint: "/chat/completions",
    format: "openai",          // ← SAME FORMAT AS OPENAI, that's the whole point
    apiKey: "not-needed",
    models: [
      "unsloth/gemma-4-E4B-it-UD-MLX-4bit",
      "unsloth/gemma-4-E2B-it-UD-MLX-4bit"
    ]
  }
};
```

**The MLX provider uses the same `format: "openai"` request builder as your OpenAI provider.** No new serialization logic needed. The only differences are:

1. **Base URL** → `localhost:8000` instead of `api.openai.com`
2. **Model name** → HuggingFace repo ID instead of OpenAI model name
3. **API key** → any non-empty string (required by the client but ignored by the server)
4. **No rate limits** → it's your own hardware
5. **CORS** → you may need to start the server with `--host 0.0.0.0` if your browser app runs on a different port

### CORS for browser-based apps

If your app runs from `localhost:3000` (or any origin), the server needs to allow cross-origin requests. Check if mlx-openai-server has a `--cors` flag, or proxy through your dev server. Alternatively, `mlx_vlm.server` has built-in CORS support.

### Streaming (SSE)

mlx-openai-server supports the same SSE streaming format as OpenAI. If your team's OpenAI provider already handles `stream: true` with the `data: [DONE]` sentinel, it will work unchanged.

### Feature parity checklist

| Feature | Works with mlx-openai-server? | Notes |
|---------|------------------------------|-------|
| Text chat | ✅ | Identical to OpenAI |
| Streaming | ✅ | Same SSE format |
| System messages | ✅ | Gemma 4 has native system prompt support |
| Image input | ✅ | OpenAI `image_url` content parts |
| Audio input | ⚠️ | Model supports it; verify server passes it through |
| Tool calling / function calling | ✅ | Gemma 4 has native function calling |
| JSON mode | ✅ | `"response_format": {"type": "json_object"}` |
| Thinking / reasoning | ✅ | Gemma 4 supports `think` parameter |
| Embeddings | ❌ | Need a separate embeddings model |

---

## 8. Gemma 4 Prompting Tips

A few things that differ from GPT-4o / Claude:

- **Put multimodal content first.** Image/audio before text in the content array yields better results.
- **Thinking mode.** Gemma 4 supports a built-in reasoning mode. In the system prompt, use `<|think|>` to activate step-by-step thinking.
- **Audio is E2B/E4B only** and max 30 seconds.
- **Recommended generation params** (from Google): `temperature: 1.0`, `top_p: 0.95`, `top_k: 64`. Keep repetition penalty at 1.0.
- **128K context window** for E2B/E4B. On 16GB with 4-bit, you'll practically max out around 8–16K tokens of context before running into memory pressure.

---

## Appendix A: Alternative Servers

If mlx-openai-server doesn't meet your needs, here are other options that serve the same OpenAI-compatible API.

### mlx_vlm.server (direct from mlx-vlm)

The underlying library mlx-openai-server wraps. Lighter, fewer features, built-in CORS.

```bash
pip install mlx-vlm
mlx_vlm.server --model mlx-community/gemma-4-E4B-it-4bit --port 8080
```

API at `http://localhost:8080/v1/chat/completions`. Supports image, audio, and video content parts directly.

### mlx-omni-server (OpenAI + Anthropic APIs)

If you also want Anthropic Messages API compatibility:

```bash
pip install mlx-omni-server
mlx-omni-server --port 8000
```

- OpenAI at `http://localhost:8000/v1/chat/completions`
- Anthropic at `http://localhost:8000/anthropic/v1/messages`

### vllm-mlx (continuous batching, production-grade)

If you need concurrent users or higher throughput:

```bash
uv pip install git+https://github.com/waybarrios/vllm-mlx.git
vllm-mlx serve mlx-community/gemma-4-E4B-it-4bit --port 8000 --continuous-batching
```

Both OpenAI and Anthropic endpoints. Supports MCP tool calling.

### llama.cpp (llama-server, GGUF format)

If you prefer the same runtime Ollama uses internally:

```bash
git clone https://github.com/ggml-org/llama.cpp
cmake llama.cpp -B llama.cpp/build -DBUILD_SHARED_LIBS=OFF
cmake --build llama.cpp/build --config Release -j --target llama-server

./llama.cpp/build/bin/llama-server \
  -hf unsloth/gemma-4-E4B-it-GGUF:Q8_0 \
  --port 8080
```

OpenAI-compatible at `http://localhost:8080/v1`.

### LM Studio (GUI + headless)

```bash
curl -fsSL https://lmstudio.ai/install.sh | bash
```

OpenAI-compatible API at `http://localhost:1234/v1`. Good for model management GUI.

---

## Appendix B: Direct mlx-vlm Python API (No Server)

If you ever want to call Gemma 4 directly from Python without an HTTP server:

```python
from mlx_vlm import load, generate

model, processor = load("mlx-community/gemma-4-E4B-it-4bit")

# Text only
output = generate(model, processor, prompt="Hello!", max_tokens=200)

# With image
output = generate(model, processor,
    prompt="Describe this image.",
    image="path/to/photo.jpg",
    max_tokens=200)

# With audio (E2B/E4B only)
output = generate(model, processor,
    prompt="Transcribe this audio.",
    audio="path/to/audio.wav",
    max_tokens=200)
```

---

## Appendix C: Disk Space Budget

With all recommended models downloaded:

| Model | Download Size |
|-------|--------------|
| `unsloth/gemma-4-E2B-it-UD-MLX-4bit` | ~1.5 GB |
| `mlx-community/gemma-4-E4B-it-4bit` | ~3 GB |
| `unsloth/gemma-4-E4B-it-UD-MLX-4bit` | ~3 GB |
| `unsloth/gemma-4-E4B-it-UD-MLX-8bit` | ~8 GB |
| **Total** | **~15.5 GB** |

All stored in `~/.cache/huggingface/hub/`. To reclaim space later: `huggingface-cli cache prune`.

---

## Key Sources

- [Google blog — Gemma 4 announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Hugging Face — Gemma 4 launch blog](https://huggingface.co/blog/gemma4)
- [mlx-community Gemma 4 collection](https://huggingface.co/collections/mlx-community/gemma-4)
- [Unsloth — Gemma 4 local guide](https://unsloth.ai/docs/models/gemma-4)
- [mlx-openai-server (GitHub)](https://github.com/cubist38/mlx-openai-server)
- [mlx-vlm (GitHub)](https://github.com/Blaizzy/mlx-vlm)
- [llama.cpp server docs](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [HuggingFace Hub — offline usage](https://huggingface.co/docs/huggingface_hub/guides/download)
