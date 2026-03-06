# AppSec Summary for tools.sgraph.ai Build

---

## Security Model: Client-Side Only

The entire value proposition of tools.sgraph.ai is that **no data leaves the browser**. This must be architecturally enforced, not just promised.

### 1. No Server Calls from Tools (Critical)

Every tool must operate with zero network requests to SGraph servers. The only allowed external requests are:

- **CDN imports:** Loading JS/CSS modules from tools.sgraph.ai itself (same-origin)
- **Third-party WASM:** FFmpeg WASM from unpkg.com or cdnjs (explicitly documented)
- **LLM APIs:** Only when the user explicitly provides an API key and initiates a call (LLM Client tool)

**Verification:** Run each tool with DevTools Network tab open. Filter to non-static requests. There should be zero requests to `*.sgraph.ai/api/*` or any analytics endpoint.

### 2. FFmpeg WASM Supply Chain (Medium)

The Video Splitter loads FFmpeg WASM from a CDN:

```javascript
import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'
```

**Risks:**
- CDN compromise could serve malicious WASM
- Version pinning mitigates but doesn't eliminate

**Mitigations:**
- Pin to exact version (not `@latest`)
- Consider hosting FFmpeg WASM on tools.sgraph.ai S3 (self-hosted, controlled)
- Add Subresource Integrity (SRI) hash if the CDN supports it
- Document the dependency and its source in `briefs/BRIEF_PACK.md`

**Recommendation:** Self-host the FFmpeg WASM binary on tools.sgraph.ai S3 for Phase 2. For MVP, pinned CDN is acceptable.

### 3. Content Security Policy (Medium)

Each tool page should have a restrictive CSP:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://unpkg.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  media-src 'self' blob:;
  worker-src 'self' blob:;
  connect-src 'self' https://unpkg.com https://openrouter.ai http://localhost:11434;
```

**Notes:**
- `blob:` needed for video preview and download URLs
- `worker-src blob:` needed for FFmpeg WASM web worker
- `connect-src` includes OpenRouter and Ollama for LLM Client tool only
- No `unsafe-eval` — FFmpeg WASM uses `WebAssembly.instantiate()` which doesn't require eval

### 4. CORS Configuration (Medium)

tools.sgraph.ai serves as a CDN for other `*.sgraph.ai` sites. CORS headers:

```
Access-Control-Allow-Origin: *.sgraph.ai
```

For the public CDN model (third-party imports), consider:

```
Access-Control-Allow-Origin: *
```

**Risk:** `*` means anyone can import our modules. This is the intended behaviour (it's a public library), but be aware that it means our JS runs on any origin.

**Mitigation:** Core modules are pure logic with no authentication tokens or secrets. They don't access cookies or localStorage (constraint: "No localStorage" in coding conventions). Safe to serve publicly.

### 5. File Size Limits (Low)

Browser tools that process files in memory must enforce limits:

| Tool | Warn At | Hard Limit | Why |
|------|---------|------------|-----|
| Video Splitter | 200MB | 500MB | Browser memory (WASM heap) |
| File Hasher | 500MB | 2GB | Streaming hash is more memory-efficient |
| Image Converter | 50MB | 200MB | Canvas API memory |

Display a user-friendly message when limits are exceeded: "For files larger than X, consider using [command-line tool] on your computer."

### 6. No Secrets in Source (Critical)

- No API keys in source code (LLM keys come from user input at runtime)
- No SG/Send admin tokens
- No AWS credentials
- All tools are static HTML/JS/CSS with zero server configuration

---

## Already Handled by Architecture

| Concern | How It's Addressed |
|---------|-------------------|
| Data exfiltration | No server calls — nothing to exfiltrate to |
| Authentication bypass | No authentication — tools are public, free, anonymous |
| Session hijacking | No sessions — stateless client-side tools |
| SQL injection | No database — no SQL anywhere |
| XSS | No user-generated content served from server (all local processing) |
| Encryption key exposure | crypto module uses Web Crypto API (keys stay in browser's key store) |
