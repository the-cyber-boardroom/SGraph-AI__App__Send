# ThinkHere — Deep Technical Analysis
**Date:** 5 March 2026  
**Context:** SG/Workspace v0.11.10 integration research  
**Source:** https://github.com/ipattis/thinkhere · https://thinkhere.ai

---

## 1. What ThinkHere Is

ThinkHere is a privacy-first AI chat application that runs entirely in the browser. There is no backend server. No API keys. No data egress. The LLM inference happens inside the browser tab, GPU-accelerated via WebGPU.

The project is a single `index.html` file (HTML + CSS + JS) deployed as a static site on GitHub Pages. No build step. No framework. No server. This makes it architecturally similar to SG/Workspace in its zero-dependency, zero-server philosophy.

---

## 2. The Three Runtime Stacks

ThinkHere is not one technology — it is an abstraction layer over three distinct browser inference runtimes:

| Runtime | Backend | Model Format | GPU Path | WASM Fallback |
|---|---|---|---|---|
| **WebLLM** (MLC) | Apache TVM → WebGPU compute shaders | MLC quantized weights | WebGPU required | None |
| **Transformers.js** | ONNX Runtime Web | ONNX | WebGPU optional | Yes (slow) |
| **MediaPipe** | Google LiteRT | LiteRT | WebGPU required | None |

### 2.1 WebLLM (MLC)

The primary runtime. Models are compiled ahead-of-time via Apache TVM into optimised WebGPU compute shaders. On first load, the engine downloads quantised model weights (e.g. 4-bit quantised, stored as sharded binary files) and JIT-compiles the WASM inference library. Both the weights and the compiled shaders are cached in the browser's Cache API and IndexedDB respectively — subsequent loads take seconds rather than minutes.

The loading sequence seen in the screenshots maps directly to three phases:

1. **Download** — fetching quantised weight shards from HuggingFace CDN into the browser Cache API
2. **Compile** — Apache TVM JIT-compiling WebGPU compute shaders, cached in IndexedDB
3. **Ready** — `MLCEngine` instance initialised on GPU, model warm and ready

### 2.2 Transformers.js + ONNX Runtime Web

A broader-compatibility runtime. Supports a wider range of model architectures in standard ONNX format. Does not require AOT compilation — models are interpreted at load time by ONNX Runtime. Falls back to WASM on browsers without WebGPU, though inference is significantly slower. Used for larger models like Qwen3 4B and GPT-OSS 20B.

### 2.3 MediaPipe + LiteRT

Google's MediaPipe LLM Inference API. Supports multimodal input (text + images) processed entirely on-device. Used specifically for Gemma 3n models. Requires WebGPU. No WASM fallback.

---

## 3. Available Models

| Model | Size | Runtime | Notes |
|---|---|---|---|
| SmolLM2 360M | ~250 MB | WebLLM | Tiny, fast — good for testing |
| SmolLM2 1.7B | ~1 GB | WebLLM | Good balance of size and capability |
| Llama 3.2 1B | ~700 MB | WebLLM | Meta's compact model |
| Phi-3.5 Mini | ~2.2 GB | WebLLM | Microsoft's capable small model |
| Qwen3 4B Instruct | ~2.9 GB | Transformers.js | Strong multilingual chat |
| GPT-OSS 20B | ~12.6 GB | Transformers.js | Highest quality, very large download |
| Gemma 3n E2B | ~3 GB | MediaPipe | Multimodal (text + image) |
| Gemma 3n E4B | ~4.3 GB | MediaPipe | Larger multimodal |

---

## 4. The Key API Insight — OpenAI Compatibility

The most important fact for SG/Workspace integration: **WebLLM exposes a fully OpenAI-compatible API.**

```javascript
// WebLLM streaming — identical shape to OpenRouter SSE response
const chunks = await engine.chat.completions.create({
    messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt }
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
});

for await (const chunk of chunks) {
    const token = chunk.choices[0]?.delta.content || '';
    onChunk(token);
    if (chunk.usage) {
        // { prompt_tokens, completion_tokens, total_tokens }
    }
}
```

Compare this to what `llm-orchestrator._readSSE()` already extracts from OpenRouter:

```
data: {"choices":[{"delta":{"content":"token"}}]}
```

The `choices[0].delta.content` token path is **identical**. This means the orchestrator integration is a thin adapter, not a rewrite.

The difference is the transport:
- **OpenRouter:** `fetch()` → network → external server → SSE `ReadableStream`
- **Ollama:** `fetch()` → local socket → NDJSON `ReadableStream`  
- **WebLLM:** `engine.chat.completions.create()` → GPU compute shaders → `AsyncGenerator`

No HTTP involved. No network. The "streaming" is a JavaScript `AsyncGenerator` rather than a `ReadableStream`, but the token-by-token structure is identical.

---

## 5. Browser Requirements

WebGPU is required for GPU-accelerated inference:

- **Chrome 113+** ✓
- **Edge 113+** ✓
- Safari — no (WebGPU not fully supported)
- Firefox — no (WebGPU not fully supported)

Transformers.js models can fall back to WASM on non-WebGPU browsers, but performance is significantly slower. WebLLM and MediaPipe models have no fallback and will not work without WebGPU.

---

## 6. Zero-Knowledge Alignment with SG/Workspace

ThinkHere's privacy model strengthens the SG/Workspace zero-knowledge guarantee:

| Provider | Where the prompt travels |
|---|---|
| OpenRouter | Browser → internet → OpenRouter servers → LLM provider |
| Ollama | Browser → localhost socket → local Ollama process |
| **WebLLM** | **Stays in the browser process — never leaves the tab** |

Combined with SG/Workspace's existing client-side vault decryption (server never sees plaintext), a WebLLM-powered workspace would achieve a completely air-gapped document transformation pipeline. The document is decrypted in the browser, sent to a GPU running in the same browser tab, and the result re-encrypted — zero bytes of plaintext ever cross a network boundary.

---

## 7. Feature Inventory (ThinkHere v current)

| Feature | ThinkHere | SG/Workspace v0.1.0 |
|---|---|---|
| In-browser LLM inference | ✓ | ✗ |
| OpenRouter (cloud) | ✗ | ✓ |
| Ollama (local server) | ✗ | ✓ |
| Multi-turn conversation | ✓ | ✗ (planned §5.1) |
| RAG / knowledge base | ✓ (IndexedDB + Qwen3 embedding) | ✗ |
| Markdown rendering | ✓ | ✓ (MarkdownParser) |
| Image input (multimodal) | ✓ (Gemma 3n only) | ✓ (clipboard paste) |
| Conversation export | ✓ (.md) | ✓ (vault save) |
| System prompt | ✓ | ✓ |
| Generation controls | ✓ (temp, top-p, max tokens) | ✗ |
| Document transformation | ✗ | ✓ (core feature) |
| JS sandbox execution | ✗ | ✓ |
| Encrypted vault storage | ✗ | ✓ |
| Token cost tracking | ✗ (free) | ✓ |
| Stop generation | ✓ | ✗ |

---

## 8. ESM Boundary — The One Integration Complexity

ThinkHere uses WebLLM via ES module import:

```javascript
import * as webllm from "https://esm.run/@mlc-ai/web-llm";
```

SG/Workspace uses classic `<script>` tags (IFD methodology, no modules). This creates a boundary at integration time. The cleanest solution without changing the existing architecture is a thin ESM bootstrap block in `index.html` that exposes WebLLM on `window`:

```html
<script type="module">
    import * as webllm from "https://esm.run/@mlc-ai/web-llm";
    window.WebLLM = webllm;
    window.dispatchEvent(new CustomEvent('webllm-sdk-ready'));
</script>
```

The workspace's Layer 2 CDN scripts already follow this pattern of loading shared libraries before components. This bootstrap would sit in Layer 2 alongside the existing sg-send-crypto and sg-vault imports, loaded conditionally or always-on depending on whether WebLLM becomes a core dependency.
