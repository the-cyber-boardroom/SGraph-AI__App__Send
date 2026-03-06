# Architect Summary for tools.sgraph.ai Build

**Source briefs:**
- `team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md`
- `team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md`

---

## Key Architecture Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-40 | tools.sgraph.ai is the canonical source, not a consumer | Eliminates code duplication across send, vault, workspace, chrome extension |
| AD-41 | Three-tier structure: core, components, tools | Clear separation of concerns: logic / UI / composition |
| AD-42 | Dependency direction inverted | send, vault, workspace, extension all import FROM tools — never the other way |
| AD-43 | Folder-based versioning (not npm) | Consistent with existing SGraph versioning pattern. No package manager needed. |
| AD-44 | Each module independently versioned | A change to crypto doesn't require bumping api-client |
| AD-45 | ES modules only, no build step | Every file deployable as-is. Modules loaded via browser-native `import`. |
| AD-46 | Named exports only (no default) | Easier to document, easier to tree-shake, IDE auto-complete friendly |
| AD-47 | CDN-served with immutable cache for pinned versions | Pinned URLs never change content -> cache forever. `latest` -> 5-min cache. |
| AD-48 | Production projects pin to specific versions | Stability. Upgrade is explicit. No surprises from `latest` changing. |

---

## Migration Principles

### 1. Copy First, Then Delete

When extracting a module from send to tools:
1. Copy the code to tools (converting from object literal to ES module)
2. Deploy the tools version
3. Verify CDN imports work
4. Update send to import from tools
5. Verify send works
6. Delete the local copy from send

Never skip step 5. Never do step 6 before step 5 is verified.

### 2. One Module at a Time

Don't extract all modules simultaneously. Extract crypto first (simplest, zero dependencies), verify the full pipeline, then proceed to the next module. Each extraction is a separate commit, separately tested.

### 3. Backward Compatibility During Migration

During the transition period, both the local copy AND the tools import will work. The send repo keeps its local `crypto.js` until the tools import is verified. This means temporary code duplication — that's acceptable. The goal is zero-downtime migration, not zero-duplication.

---

## Component Portability

The architecture is designed so any module can be promoted:

```
Today:     tools.sgraph.ai/core/crypto/     (folder in tools repo)
Future:    crypto.sgraph.ai                  (its own repo)
           OR: @sgraph/crypto               (npm package)
```

The consumer doesn't change their import URL — S3 paths stay the same. What's behind the URL is an implementation detail.

---

## How Tools Compose

A tool is a thin HTML page that imports and wires:

```
tool = header + footer + core libraries + components + tool-specific logic
```

The tool-specific logic should be minimal — ideally under 100 lines. If a tool's logic grows beyond 200 lines, consider whether part of it should be extracted into a core module.

---

## Cross-Project Module Usage

```
Module              Used By
─────────────────── ──────────────────────────────────
core/crypto         send, vault, chrome extension, file-encryptor tool
core/api-client     send, vault (base only — project-specific routes stay local)
core/i18n           send, vault (framework only — strings stay local)
core/file-detect    send, vault, tools (video-splitter, image-converter)
core/markdown       send, vault, markdown-preview tool
core/llm-client     workspace, llm-client tool
core/video          video-splitter tool
core/ssh            ssh-keygen tool
components/header   all tools, potentially send and vault
components/footer   all tools, potentially send and vault
components/upload   send, vault, tools that accept file input
```
