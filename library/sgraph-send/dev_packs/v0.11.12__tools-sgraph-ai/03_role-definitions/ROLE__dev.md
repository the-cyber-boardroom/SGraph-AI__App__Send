# Role: Dev — sgraph_ai__tools

**Team:** Explorer
**Scope:** Implementation, module extraction, tool building, testing

---

## Responsibilities

1. **Extract core modules** — convert object-literal JS from send/vault/workspace into ES modules with named exports and JSDoc
2. **Build tools** — implement standalone single-page tools (video splitter, SSH keygen, LLM client, file hasher)
3. **Build components** — create reusable UI components (header, footer, upload-dropzone, file-preview)
4. **Write tests** — browser-based module tests (import and verify exports work)
5. **Create landing page** — tools.sgraph.ai index listing all available tools
6. **Maintain BRIEF_PACK.md** — update module registry at end of each session

## Critical Rules

### Vanilla JS (Non-Negotiable)

- **No frameworks** — no React, Vue, Svelte, Angular, or any other framework
- **ES modules** — all JS uses `import`/`export`. No CommonJS, no `require()`
- **No build step** — every file deployable as-is. No webpack, no bundler, no transpiler
- **No default exports** — named exports only
- **JSDoc** — every exported function documented with `@param` types and `@returns`
- **No localStorage** — use in-memory state. Exception: tools that explicitly need persistence

### File Naming

- Lowercase, hyphens: `sg-video.js`, `upload-dropzone.js`, `tools-common.css`
- Core modules prefixed `sg-`: `sg-crypto.js`, `sg-llm.js`, `sg-video.js`

### Module Extraction Pattern

When converting from the send/vault repo (object literal → ES module):

```javascript
// BEFORE (in send repo):
const SendCrypto = {
    ALGORITHM: 'AES-GCM',
    async generateKey() { ... },
    async encryptFile(key, plaintext) { ... },
};

// AFTER (in tools repo):
const ALGORITHM = 'AES-GCM'

/** Generate a new AES-256-GCM key */
export async function generateKey() { ... }

/** Encrypt a file. Returns IV + ciphertext. */
export async function encryptFile(key, plaintext) { ... }
```

### Tool Composition Pattern

A tool is a thin HTML page:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/components/header/latest/sg-header.css">
  <link rel="stylesheet" href="/tools/tools-common.css">
  <link rel="stylesheet" href="./my-tool.css">
</head>
<body>
  <script type="module">
    import { SgHeader } from '/components/header/latest/sg-header.js'
    import { someFunction } from '/core/some-module/latest/some-module.js'
    // Tool-specific wiring — keep this under 100 lines
  </script>
</body>
</html>
```

## Review Documents

Place reviews at: `team/explorer/dev/reviews/{date}/`
