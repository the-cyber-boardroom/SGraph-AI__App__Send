# WebLLM Integration Plan — SG/Workspace
**Date:** 5 March 2026  
**Target:** Add WebLLM as Provider 3 (alongside OpenRouter and Ollama)  
**Architecture base:** v0.11.10 brief

---

## 1. Overview

WebLLM will be integrated as a first-class LLM provider following the same `llm-connection` / `llm-orchestrator` split used by OpenRouter and Ollama. From the user's perspective it appears as a third provider tab in Settings. From the orchestrator's perspective it receives the same assembled prompt and returns the same token stream. No changes to `llm-prompt-input`, `llm-system-prompt`, `llm-output`, `llm-stats` (beyond additive rows), or any other component outside the LLM stack.

**Zero-knowledge impact:** Stronger than any other provider. Prompts never leave the browser process — complete air-gap between vault content and any network boundary.

---

## 2. New Files

```
components/llm-webllm/
    llm-webllm.js          # Engine singleton + lifecycle management
```

Plus registration in `index.html` Layer 4 (workspace components).

---

## 3. Changes to `index.html`

### Layer 2 — Add ESM bootstrap (before workspace components)

WebLLM is ESM-only. Add a module script bootstrap that exposes it on `window`:

```html
<!-- WebLLM SDK bootstrap (ESM → window bridge) -->
<script type="module">
    import * as webllm from "https://esm.run/@mlc-ai/web-llm";
    window.WebLLM = webllm;
    window.dispatchEvent(new CustomEvent('webllm-sdk-ready'));
</script>
```

### Layer 4 — Add component

```html
<script src="components/llm-webllm/llm-webllm.js"></script>
```

Load order: after `js-executor.js`, before `script-editor.js` (no hard dependency, but keeps LLM components grouped).

---

## 4. New Component — `llm-webllm.js`

Manages the `MLCEngine` singleton. Exposed on `window.sgraphWorkspace.webllmEngine`. This is analogous to how `js-executor.js` registers `window.sgraphWorkspace.executeJS`.

```javascript
class WebLLMEngine {
    constructor() {
        this._engine      = null;
        this._loadedModel = null;
        this._loading     = false;
        this._sdkReady    = !!window.WebLLM;

        // Wait for ESM bootstrap if it hasn't fired yet
        if (!this._sdkReady) {
            window.addEventListener('webllm-sdk-ready', () => {
                this._sdkReady = true;
            }, { once: true });
        }
    }

    get isLoaded()       { return !!this._engine; }
    get loadedModelId()  { return this._loadedModel; }
    get isLoading()      { return this._loading; }

    async load(modelId, onProgress) {
        if (this._loadedModel === modelId) return;
        if (this._loading) throw new Error('Engine already loading');
        if (!this._sdkReady) throw new Error('WebLLM SDK not ready');

        this._loading = true;
        try {
            if (this._engine) await this._engine.unload();
            this._engine = await window.WebLLM.CreateMLCEngine(modelId, {
                initProgressCallback: onProgress
            });
            this._loadedModel = modelId;
        } finally {
            this._loading = false;
        }
    }

    async unload() {
        if (!this._engine) return;
        await this._engine.unload();
        this._engine      = null;
        this._loadedModel = null;
    }

    get chat() { return this._engine?.chat; }

    async checkWebGPU() {
        if (!navigator.gpu) return { supported: false, reason: 'navigator.gpu not available' };
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { supported: false, reason: 'No WebGPU adapter found' };
        return {
            supported: true,
            adapterInfo: await adapter.requestAdapterInfo(),
            maxBufferSize: adapter.limits.maxBufferSize,
        };
    }

    async getCachedModels() {
        try {
            const cache = await caches.open('webllm');
            const keys  = await cache.keys();
            return keys.map(r => r.url);
        } catch { return []; }
    }

    async deleteModelCache(modelId) {
        const cache = await caches.open('webllm');
        const keys  = await cache.keys();
        const modelKeys = keys.filter(r => r.url.includes(modelId));
        await Promise.all(modelKeys.map(k => cache.delete(k)));
        return modelKeys.length;
    }
}

// Register on global namespace
window.sgraphWorkspace.webllmEngine = new WebLLMEngine();
```

---

## 5. Changes to `llm-connection.js`

### 5.1 Add to PROVIDERS object

```javascript
const PROVIDERS = {
    openrouter: { /* existing */ },
    ollama:     { /* existing */ },

    webllm: {
        name:         'Browser (WebLLM)',
        hint:         'Runs entirely in your browser. No API key needed. Requires Chrome/Edge 113+.',
        requiresKey:  false,
        defaultModels: [
            { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',  label: 'SmolLM2 360M',  size: '250 MB',  runtime: 'webllm',          recommended: false },
            { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',  label: 'SmolLM2 1.7B',  size: '1 GB',    runtime: 'webllm',          recommended: true  },
            { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',  label: 'Llama 3.2 1B',  size: '700 MB',  runtime: 'webllm',          recommended: false },
            { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',  label: 'Phi-3.5 Mini',  size: '2.2 GB',  runtime: 'webllm',          recommended: false },
            { id: 'Qwen3-4B-Instruct',                   label: 'Qwen3 4B',      size: '2.9 GB',  runtime: 'transformers.js', recommended: false },
        ]
    }
};
```

### 5.2 Add `_connectWebLLM()` method

```javascript
async _connectWebLLM() {
    const gpu = await window.sgraphWorkspace.webllmEngine.checkWebGPU();

    if (!gpu.supported) {
        window.sgraphWorkspace.messages.error(`WebGPU not available: ${gpu.reason}`);
        return;
    }

    // Store selection, emit connected — engine loads lazily on first prompt
    this._provider = 'webllm';
    this._saveToLocalStorage();

    this._emit('llm-connected', {
        provider: 'webllm',
        model:    this._selectedModel || PROVIDERS.webllm.defaultModels.find(m => m.recommended).id,
        models:   PROVIDERS.webllm.defaultModels,
    });
}
```

### 5.3 Provider UI section (render addition)

New section alongside the existing OpenRouter and Ollama sections:

```html
<div class="ws-provider-section" data-provider="webllm">
    <!-- WebGPU status badge -->
    <div class="ws-webgpu-status" id="webgpu-status">
        <span class="ws-badge ws-badge--checking">Checking WebGPU...</span>
    </div>

    <!-- Model catalogue -->
    <div class="ws-model-catalogue">
        <!-- Rendered from PROVIDERS.webllm.defaultModels -->
        <!-- Each row: name, size badge, runtime badge, [Recommended] badge, select radio -->
    </div>

    <!-- Cache management -->
    <div class="ws-cache-section">
        <h4>Downloaded Models</h4>
        <div id="webllm-cache-list"><!-- populated on open --></div>
        <div class="ws-storage-usage" id="webllm-storage-usage"></div>
    </div>

    <button class="ws-btn ws-btn--primary" id="webllm-connect-btn">
        Connect
    </button>
</div>
```

---

## 6. Changes to `llm-orchestrator.js`

### 6.1 Add WebLLM branch in `_handleSend()`

```javascript
async _handleSend(event) {
    const { provider } = this._getConnection();

    if (provider === 'openrouter') {
        // existing SSE path
    } else if (provider === 'ollama') {
        // existing NDJSON path
    } else if (provider === 'webllm') {
        await this._dispatchWebLLM(messages, systemPrompt);
    }
}
```

### 6.2 `_dispatchWebLLM()` — the core adapter

```javascript
async _dispatchWebLLM(messages, systemPrompt) {
    const engine    = window.sgraphWorkspace.webllmEngine;
    const modelId   = this._currentModel;
    const startTime = Date.now();

    // Lazy load — engine downloads model on first use per model
    if (!engine.isLoaded || engine.loadedModelId !== modelId) {
        this._emit('webllm-load-start', { modelId });
        this._emit('activity-start', { label: `Loading ${modelId}...` });

        await engine.load(modelId, (progress) => {
            this._emit('webllm-load-progress', {
                text:     progress.text,
                progress: progress.progress,   // 0.0 → 1.0
            });
        });

        this._emit('webllm-load-complete', { modelId, loadTimeMs: Date.now() - startTime });
        this._emit('activity-end');
    }

    // Streaming inference — AsyncGenerator, same token shape as SSE
    const chunks = await engine.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages
        ],
        stream:         true,
        stream_options: { include_usage: true },
        temperature:    0.7,
    });

    let fullText = '';
    let usage    = null;
    const inferStart = Date.now();

    for await (const chunk of chunks) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
            fullText += token;
            this._emit('llm-response-chunk', { content: token });  // existing event
        }
        if (chunk.usage) usage = chunk.usage;
    }

    const elapsedMs = Date.now() - inferStart;

    this._emit('llm-request-complete', {
        model:             modelId,
        provider:          'webllm',
        length:            fullText.length,
        streaming:         true,
        promptTokens:      usage?.prompt_tokens      ?? 0,
        completionTokens:  usage?.completion_tokens  ?? 0,
        totalTokens:       usage?.total_tokens        ?? 0,
        nativeId:          null,
        finishReason:      'stop',
        cost:              0,     // free — local inference
        speed:             usage ? (usage.completion_tokens / elapsedMs * 1000) : null,
    });
}
```

The `llm-request-complete` event shape is **identical** to what OpenRouter emits. `llm-stats` will receive it unchanged; you just surface `cost: 0` as "Local / Free".

---

## 7. Changes to `llm-stats.js`

Additive only. When `provider === 'webllm'`:

- **Cost row:** Show "Local / Free" instead of a dollar figure
- **Provider row:** Show "Browser · WebLLM" + runtime badge
- **Add GPU row:** from `webllmEngine.checkWebGPU()` → adapter name
- **Add Model Status row:** Loaded / Loading / Unloaded

No structural changes to the stats component — just conditional display logic in the existing render.

---

## 8. New EventBus Topics

Add to the registry in §3.3 of the architecture brief:

| Event Topic | Emitter | Data Shape | Purpose |
|---|---|---|---|
| `webllm-sdk-ready` | `window` (ESM bootstrap) | (none) | WebLLM SDK available on `window.WebLLM` |
| `webllm-load-start` | llm-orchestrator | `{ modelId }` | Engine beginning model download/load |
| `webllm-load-progress` | llm-orchestrator | `{ text, progress }` | Download/compile progress (0.0→1.0) |
| `webllm-load-complete` | llm-orchestrator | `{ modelId, loadTimeMs }` | Model fully loaded onto GPU |
| `webllm-unload` | llm-webllm | `{ modelId }` | Model unloaded, GPU memory freed |

---

## 9. New `localStorage` Key

Add to the key registry (§4.8 of architecture brief):

```javascript
'sgraph-workspace-webllm': {
    selectedModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    autoLoad:      false,   // never auto-download on page load without user action
}
```

`autoLoad: false` is a deliberate safety default — a 1 GB download should never trigger silently on workspace load.

---

## 10. New Debug Panel — `webllm-debug.js`

Following the pattern from §4.5 of the architecture brief. New tab "WLLM" in the debug sidebar.

**Content:**

- Engine state: Unloaded / Loading / Loaded (with model ID)
- WebGPU adapter info (name, vendor, architecture, maxBufferSize)
- Cache API contents: list of cached model shard URLs with sizes
- Storage quota: `navigator.storage.estimate()` → used / quota
- Load progress log: last N entries from `webllm-load-progress` events
- "Unload Model" button → calls `webllmEngine.unload()`, emits `webllm-unload`
- "Clear Cache" button per model → calls `webllmEngine.deleteModelCache(modelId)`

Registration in `index.html` Layer 3 (debug panels — loads early so it can catch events from init):

```html
<script src="components/debug/webllm-debug.js"></script>
```

---

## 11. Status Bar — Load Progress UX

The existing `activity-start` / `activity-end` spinner is insufficient for a 30–60 second model download. For WebLLM loads, override the status bar activity zone with a persistent progress bar:

```javascript
// In workspace-shell.js, listen for webllm-load-progress:
window.sgraphWorkspace.events.on('webllm-load-progress', ({ text, progress }) => {
    const bar = this.querySelector('#ws-activity-progress');
    bar.style.display = 'block';
    bar.querySelector('.ws-progress-fill').style.width = `${progress * 100}%`;
    bar.querySelector('.ws-progress-label').textContent = text;
});

window.sgraphWorkspace.events.on('webllm-load-complete', () => {
    this.querySelector('#ws-activity-progress').style.display = 'none';
});
```

This is additive to the shell's existing activity indicator — the progress bar element sits alongside the spinner in the status bar markup.

---

## 12. Effort Estimate

| Work Item | File(s) | Complexity | LOC est. |
|---|---|---|---|
| ESM bootstrap | `index.html` | Trivial | ~5 |
| `WebLLMEngine` singleton | `llm-webllm.js` (new) | Low | ~100 |
| Provider branch + model catalogue UI | `llm-connection.js` | Medium | ~150 |
| WebGPU check + connect flow | `llm-connection.js` | Low | ~40 |
| `_dispatchWebLLM()` adapter | `llm-orchestrator.js` | Low | ~60 |
| `llm-stats` WebLLM rows | `llm-stats.js` | Trivial | ~20 |
| Load progress bar in status zone | `workspace-shell.js` + `workspace.css` | Low | ~30 |
| Cache management panel | `llm-connection.js` + `llm-webllm.js` | Medium | ~80 |
| `webllm-debug.js` panel | new file | Low | ~120 |
| `localStorage` key | `llm-connection.js` | Trivial | ~5 |
| New EventBus topics (registration only) | `workspace-init.js` | Trivial | ~10 |
| **Total** | | | **~620 LOC** |

---

## 13. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ESM/classic-script boundary causes timing issues | Medium | Medium | Listen for `webllm-sdk-ready` event before any engine call; engine constructor defers if SDK not yet ready |
| User triggers surprise download | High (without mitigation) | High | `autoLoad: false`; explicit "Load Model" button; clear size labels in catalogue; confirm dialog for models >1 GB |
| WebGPU adapter not available (integrated GPU, VM) | Medium | Medium | `checkWebGPU()` on connect with clear error; degrade gracefully to "provider unavailable" state |
| Model switch mid-session loses GPU memory | Low | Medium | `engine.unload()` before loading new model; show confirmation if model is loaded |
| WASM fallback for Transformers.js models is slow | Low | Low | Label WASM fallback clearly in debug panel; recommend WebLLM runtime models for Workspace use |
| Cache API unavailable (private browsing) | Low | High | Detect `caches` availability; warn user that models will re-download each session |
