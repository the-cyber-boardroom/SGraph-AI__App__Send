# WebLLM — Settings, Install & Management Panels Spec
**Date:** 5 March 2026  
**Context:** SG/Workspace v0.11.10  
**Goal:** Full UX parity with OpenRouter and Ollama provider panels

---

## 1. Provider Selection (existing `llm-connection` settings)

No structural change — the existing provider tab strip gets a third tab:

```
[ OpenRouter ]  [ Ollama ]  [ Browser (WebLLM) ]
```

Clicking "Browser (WebLLM)" renders the WebLLM-specific settings section below the tab strip, replacing the OpenRouter/Ollama sections. Same pattern as today.

---

## 2. WebLLM Settings Panel — Full Spec

The WebLLM settings section has four sub-sections, rendered in order:

---

### 2.1 Browser Compatibility Check

Rendered immediately on tab open (before any user action). Async — shows a checking state then resolves.

**States:**

| State | Display |
|---|---|
| Checking | Grey spinner badge: "Checking WebGPU..." |
| Supported | Green badge: "WebGPU Available · [Adapter Name]" |
| No WebGPU | Red badge: "WebGPU Not Available — Use Chrome 113+ or Edge 113+" |
| No adapter | Amber badge: "WebGPU API present but no GPU adapter found (VM or integrated GPU?)" |

**Data shown when supported:**

```
WebGPU Available
Adapter:      Apple M3 Max (or NVIDIA RTX 4090, etc.)
Max buffer:   ~8 GB   (from adapter.limits.maxBufferSize)
Browser:      Chrome 124
```

**Implementation:** calls `webllmEngine.checkWebGPU()` on tab open. Result cached for session. "Recheck" link forces refresh.

---

### 2.2 Model Catalogue

A table of available models. Replaces the API key input that OpenRouter/Ollama show — WebLLM needs no credentials.

**Columns:**

| Column | Content |
|---|---|
| Model | Display name (e.g. "SmolLM2 1.7B") |
| Size | Download size badge (e.g. "1 GB") |
| Runtime | "WebLLM" / "Transformers.js" / "MediaPipe" pill |
| Status | "Not downloaded" / "Cached" / "Loaded" / "Loading..." |
| Action | Radio button to select |

**Badges:**
- **Recommended** — shown on SmolLM2 1.7B (good default for Workspace use)
- **Multimodal** — shown on Gemma 3n models (image input support)
- **Cached** — green dot when model weights are in Cache API

**Behaviour:**
- Selecting a model does not download it — download happens on first prompt
- "Load Now" button appears for the selected model — triggers `engine.load()` with progress
- Size warning dialog for models ≥ 2 GB: "This model is 2.9 GB. Download on first use?" with Cancel / Proceed
- If WebGPU check failed, all models are greyed out with a "WebGPU required" tooltip

**Model list (initial):**

```
SmolLM2 360M    250 MB   WebLLM          — fast, small, good for testing
SmolLM2 1.7B    1 GB     WebLLM          ★ Recommended
Llama 3.2 1B    700 MB   WebLLM          — Meta compact
Phi-3.5 Mini    2.2 GB   WebLLM          — Microsoft, more capable
Qwen3 4B        2.9 GB   Transformers.js — strong multilingual
Gemma 3n E2B    3 GB     MediaPipe       — multimodal (text + image)
Gemma 3n E4B    4.3 GB   MediaPipe       — larger multimodal
```

---

### 2.3 Cache Management

Shows the current state of locally downloaded model weights. Uses the Cache API and `navigator.storage.estimate()`.

**Display:**

```
Downloaded Models
─────────────────────────────────────────────────
SmolLM2-1.7B-Instruct-q4f16_1-MLC    ~1.0 GB   [Delete]
─────────────────────────────────────────────────
Storage used:   1.0 GB of 10.2 GB available
                [████░░░░░░░░░░░░░░░░] 10%
```

**Controls:**
- "Delete" button per model — calls `webllmEngine.deleteModelCache(modelId)`, updates list
- "Delete All" link at bottom — clears all WebLLM cache entries
- Storage bar changes colour: green < 50%, amber 50–80%, red > 80%

**Empty state:** "No models downloaded yet. Models are cached after first use."

**Note on private browsing:** If `caches` is unavailable (private/incognito mode), show a banner:
> "Cache API is unavailable in private browsing mode. Model weights will be re-downloaded each session."

---

### 2.4 Connect / Disconnect Button

At the bottom of the WebLLM settings section:

**Disconnected state:**
```
[ Connect ]
```
Clicking "Connect" runs `_connectWebLLM()`:
1. Checks WebGPU (if not already checked)
2. On success: emits `llm-connected`, updates status bar, button changes to "Disconnect"
3. On failure: shows error toast, stays disconnected

**Connected state:**
```
● Connected — SmolLM2 1.7B (not loaded)
[ Disconnect ]
```

"Not loaded" vs "Loaded" reflects whether `engine.isLoaded` is true. A model is only "loaded" after a first inference has triggered `engine.load()`.

---

## 3. Model Load Progress UI (Status Bar)

When a model begins loading (triggered by first prompt or "Load Now" button), the status bar's activity zone expands to show a progress bar:

```
[━━━━━━━━━━━░░░░░░░░░░] 65%   Fetching param cache [4/7]: 127MB fetched...
```

This mirrors exactly what ThinkHere shows in its loading screen. Implementation hooks into the existing status bar zone in `workspace-shell` via the new `webllm-load-progress` EventBus event.

**States:**

| Phase | Text |
|---|---|
| Download | "Downloading SmolLM2 1.7B · 163 / 1024 MB · 12s elapsed" |
| Compile | "Compiling WebGPU shaders... (cached after first run)" |
| Ready | Progress bar hides, status bar returns to normal |

The progress bar replaces the spinner for WebLLM loads only. Other activity (vault operations, file saves) continues to use the existing spinner.

---

## 4. `llm-stats` Sidebar — WebLLM Rows

The stats sidebar (right side of chat zone) shows these rows when `provider === 'webllm'`:

| Row | Value |
|---|---|
| Provider | Browser · WebLLM |
| Model | SmolLM2-1.7B-Instruct-q4f16_1-MLC |
| GPU | Apple M3 Max (from adapter info) |
| Runtime | WebLLM / Transformers.js / MediaPipe |
| Tokens in | 847 |
| Tokens out | 312 |
| Cost | Local / Free |
| Speed | 38.2 tok/s |
| Duration | 8.2s |
| Model status | Loaded (first load: 14.3s) |
| Finish reason | stop |

The "Cost" row changes from a dollar value to "Local / Free" — no other structural change to `llm-stats`.

---

## 5. WebLLM Debug Panel — `webllm-debug.js`

New debug tab in the right sidebar. Label: **"WLLM"**. Follows the same pattern as `messages-panel.js`, `events-viewer.js`, `api-logger.js`, `llm-debug.js`.

**Sections:**

### Engine Status
```
Engine:       Loaded
Model:        SmolLM2-1.7B-Instruct-q4f16_1-MLC
Runtime:      WebLLM (MLC)
Load time:    14.3s (first load)
              [Unload Model]
```

### WebGPU Adapter
```
WebGPU:       Available
Adapter:      Apple M3 Max
Vendor:       Apple
Architecture: common-3
Max buffer:   8,589,934,592 bytes (~8 GB)
```

### Cache Contents
```
Cached models (Cache API):
  SmolLM2-1.7B-Instruct-q4f16_1-MLC    [24 shards, ~1.1 GB]  [Clear]
  
Storage:  1.1 GB used of 10.2 GB quota
          [Clear All WebLLM Cache]
```

### Load Progress Log
```
[14:23:01]  Fetching param cache [1/7]: 0MB fetched. 0% completed
[14:23:04]  Fetching param cache [2/7]: 45MB fetched. 18% completed
[14:23:07]  Fetching param cache [3/7]: 95MB fetched. 38% completed
...
[14:23:17]  Model loaded successfully (14.3s)
```

Scrollable, newest at bottom. Max 100 entries. "Clear log" button.

---

## 6. `localStorage` Schema

```javascript
// Key: 'sgraph-workspace-webllm'
{
    selectedModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    autoLoad:      false,    // never download without explicit user action
    confirmedLarge: [],      // model IDs user has already confirmed large download for
}
```

`confirmedLarge` prevents re-showing the size warning dialog for models the user has already accepted.

---

## 7. Existing Panel Changes Summary

| Panel/Component | Change Type | Summary |
|---|---|---|
| `llm-connection` | Additive | New "Browser (WebLLM)" provider tab + all sub-sections |
| `llm-orchestrator` | Additive | New `_dispatchWebLLM()` branch; no changes to OpenRouter/Ollama paths |
| `llm-stats` | Additive | Conditional "Local / Free" cost row; new GPU and Model Status rows |
| `workspace-shell` | Additive | Progress bar element in status zone; `webllm-load-progress` listener |
| `workspace-shell` (debug) | Additive | New "WLLM" tab button + panel container |
| `workspace-init.js` | Additive | Register new EventBus topics |
| `index.html` | Additive | ESM bootstrap `<script type="module">`; new component `<script>` tag |
| `workspace.css` | Additive | Progress bar styles; model catalogue table styles; cache panel styles |

No existing functionality is modified. All changes are strictly additive.

---

## 8. UX Principles for This Integration

1. **Never download without consent.** `autoLoad: false` always. No model download happens on page load or provider connect — only on first prompt or explicit "Load Now" click.

2. **Size is always visible.** Every model in the catalogue shows its download size. Models ≥ 2 GB show a confirmation dialog on first use.

3. **Progress is always shown.** A download that takes 30–60 seconds needs a real progress bar, not a spinner. The status bar progress bar provides this.

4. **Cache is transparent.** The cache management panel lets users see exactly what's stored and delete it. Storage quota is shown. Private browsing limitations are disclosed.

5. **Failure is graceful.** WebGPU unavailability is detected at connect time with a clear message — not at inference time with a cryptic error. Users on Safari/Firefox learn immediately that they need Chrome/Edge.

6. **GPU memory is managed.** Switching models unloads the previous model before loading the new one. An "Unload Model" button in the debug panel frees GPU memory on demand (useful on low-VRAM devices).
